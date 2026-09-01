#!/usr/bin/env python3
"""PreToolUse hook for the Bash tool.

Exit 2 blocks the tool call and shows stderr to the session. Exit 0 allows it.
Nothing else blocks: an `echo` hook, which is what this file replaces, cannot
produce exit code 2 at all and therefore stopped nothing.

Pure standard library on purpose. A hook that needs an install is a hook that is
silently absent on the first machine that lacks it. That includes the scanner
below: no shell-parser package is used, and none is to be added.

Check order is deliberate and is NOT the order the checks are numbered in the
brief. The five string checks run first and the backup gate last, because the
gate spawns a subprocess and reads a real directory, and a command that is going
to be blocked for its own defect has no business causing either. So
`psql -f dump.sql` blocks on the missing ON_ERROR_STOP without the gate ever
running.

A WORD INSIDE QUOTES IS DATA, NOT A COMMAND, and that is the whole reason the
scanner exists. The first version of this file split the command string on shell
separators with a regex and tokenised with a bare split(), so a separator inside
a quoted argument started a new segment and the first word of that segment was
treated as a command word. `echo "first && alembic upgrade"` resolved to a
command named `alembic` and the blocking backup gate refused an echo. Measured
2026-08-30, recorded in docs/RULE_HISTORY.md under "## Rule: a step that watches
for a condition reports its own failure" as the twentieth occurrence.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# The repository root is resolved from this file, never from the working
# directory. A hook invoked with an unexpected cwd would otherwise look for
# tools/check_backup_age.sh somewhere else and report "the gate could not run"
# for a reason that has nothing to do with backups.
REPO_ROOT = Path(__file__).resolve().parents[2]

BACKUP_CHECK = REPO_ROOT / "tools" / "check_backup_age.sh"
COMMIT_RULES = REPO_ROOT / ".claude" / "skills" / "commit" / "SKILL.md"

# Command words that mean a database or schema operation is about to happen.
BACKUP_TRIGGERS = {"alembic", "psql", "pg_dump", "pg_restore", "pg_dumpall"}

DELETE_WORDS = {"rm", "unlink", "shred", "remove-item", "del"}

# Wrappers a session actually writes in front of the real command. The gate used
# to read the first word of a segment and stop, so every one of these hid the
# command behind it.
WRAPPERS = {"sudo", "env", "time", "timeout", "nice", "nohup", "stdbuf", "xargs"}

# The wrappers whose first non-flag argument is a duration rather than the
# command. .claude/settings.local.json carries `Bash(timeout 8 ...)` as an allow
# rule, so this shape is in daily use here and is not an exotic spelling.
DURATION_WRAPPERS = {"timeout", "nice"}
DURATION = re.compile(r"^[0-9]+(?:\.[0-9]+)?[smh]?$")

# Shell keywords a segment can BEGIN with, where the next word is the command.
# The gate used to read `do` as the command word of `do alembic upgrade head`,
# so a schema operation inside a loop or a conditional reached the database
# without the gate running. Measured 2026-08-30 at exit 0 against an empty
# backup directory, recorded in docs/RULE_HISTORY.md.
#
# THE LINE IS BASH'S OWN RESERVED-WORD LIST, FILTERED TO THE ONES A COMMAND
# FOLLOWS, and it is drawn there rather than by taste. `for`, `select` and
# `case` are reserved words too and are deliberately ABSENT: the word after them
# is a variable name or a pattern, never a command, so skipping them would
# resolve `for f in *.json` to a command named `f`. The closers `done`, `fi`,
# `esac` and `}` are absent for the same reason from the other end. `time` is
# already in WRAPPERS. `(` is NOT a reserved word and is not here, so
# `( alembic upgrade head )` stays open; it is reported rather than papered over.
KEYWORDS = {"!", "{", "do", "elif", "else", "if", "then", "until", "while"}

# `find -exec` and `-execdir` run a real command that stands in find's own
# ARGUMENT LIST rather than in a string, so nothing resolved it before.
# RESTRICTED to a segment whose command word is `find`, deliberately: an
# unquoted `-exec` is an ordinary argument to anything else, and resolving the
# word after it everywhere would block `echo -exec jq`, which is correct work.
EXEC_FLAGS = {"-exec", "-execdir"}

# find ends the command with `;`, usually written `\;`, or with `+`. Either may
# be quoted, so `quoted` is not consulted here; it is consulted on the flag.
EXEC_TERMINATORS = {";", "+"}

SHELLS = {"bash", "sh", "zsh"}
PYTHONS = {"python", "python3", "py"}

# One `VAR=value` token, so `CLOSED_BETA=1 psql ...` still resolves its command
# word to psql.
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

# The character quoted regions are replaced with. It is not a space, because the
# mask must never join two words into one or split one word into two: every
# offset in the mask is the same offset in the raw string.
MASK = "\x00"


# --- the scanner --------------------------------------------------------------
class Token(object):
    """One word, or one redirect operator.

    `text` has its quotes removed, so `bash -c 'alembic upgrade head'` yields a
    token whose text is the inner command. `quoted` says whether any part of it
    came out of a quote. `op` marks `<`, `<<`, `>` and `>>`, which are recognised
    only when they occur unquoted.
    """

    __slots__ = ("text", "quoted", "op")

    def __init__(self, text, quoted=False, op=False):
        self.text = text
        self.quoted = quoted
        self.op = op


class Segment(object):
    """One command in the string, with a mask that hides what was quoted.

    `raw` and `masked` are the same length, so a match found in `masked` can read
    its operand straight out of `raw`. Every check that looks for a literal
    matches against `masked`; every EXEMPTION matches against `raw`, because an
    exemption reading the raw text is the safe direction to be wrong in.
    """

    __slots__ = ("raw", "masked", "tokens")

    def __init__(self, raw, masked, tokens):
        self.raw = raw
        self.masked = masked
        self.tokens = tokens

    def words(self):
        return [t for t in self.tokens if not t.op]

    def text_of_words(self):
        return " ".join(t.text for t in self.tokens)


def heredoc_end(command, start, delim, strip):
    """Index just past the terminator line of a heredoc body, or None.

    None means the delimiter never arrives, which makes the whole string
    unresolvable. That is deliberately NOT treated as "mask to the end of the
    string": masking to the end would hide the rest of the command from every
    check, which is a gate silently switching itself off.
    """
    pos = start
    n = len(command)
    while pos <= n:
        nl = command.find("\n", pos)
        line = command[pos:] if nl < 0 else command[pos:nl]
        candidate = line.lstrip("\t") if strip else line
        if candidate.rstrip("\r") == delim:
            return n if nl < 0 else nl + 1
        if nl < 0:
            return None
        pos = nl + 1
    return None


def read_delimiter(command, i):
    """The heredoc delimiter word after `<<`. Returns (text, chars consumed)."""
    n = len(command)
    start = i
    while i < n and command[i] in " \t":
        i += 1
    out = []
    if i < n and command[i] in "'\"":
        quote = command[i]
        j = command.find(quote, i + 1)
        if j < 0:
            return None, 0
        out.append(command[i + 1:j])
        i = j + 1
    else:
        while i < n and command[i] not in " \t\n;|&<>":
            out.append(command[i])
            i += 1
    if not out or not "".join(out):
        return None, 0
    return "".join(out), i - start


def scan(command):
    """Walk the command once. Returns a list of Segment, or None if unresolved.

    Single quotes, double quotes and heredoc bodies are tracked, and a separator
    counts as a separator only outside all three.

    `$'...'` IS THE ONE DELIBERATE EXCEPTION AND IT HAS A COST. Its separators
    are hidden like any other quote, but its CONTENTS STAY VISIBLE in the mask,
    because `grep -c $'\\r'` is the canonical spelling of the exact thing the
    carriage-return check exists to catch and masking it would switch that check
    off in silence. The cost is the other direction and is real: a content check
    can still fire on a word inside `$'...'`, so `echo $'install jq first'` is
    blocked. That residue is asserted by a named case in hook_cases.py rather
    than left to be re-found as a fresh defect. The carriage-return check is
    worth more than the edge, so the exception is not widened.
    """
    n = len(command)
    mask = []
    bounds = []
    seg_tokens = []
    state = {"start": 0, "quoted": False, "have": False}
    buf = []
    tokens = []
    pending = []
    i = 0

    def flush():
        if state["have"]:
            tokens.append(Token("".join(buf), state["quoted"], False))
        del buf[:]
        state["quoted"] = False
        state["have"] = False

    def end_segment(end):
        flush()
        bounds.append((state["start"], end))
        seg_tokens.append(list(tokens))
        del tokens[:]

    while i < n:
        c = command[i]
        nxt = command[i + 1] if i + 1 < n else ""

        if c == "\\" and i + 1 < n:
            buf.append(nxt)
            state["have"] = True
            mask.append(command[i:i + 2])
            i += 2
            continue

        if c == "'":
            j = command.find("'", i + 1)
            if j < 0:
                return None
            buf.append(command[i + 1:j])
            state["have"] = True
            state["quoted"] = True
            mask.append(MASK * (j - i + 1))
            i = j + 1
            continue

        if c == '"':
            j = i + 1
            out = []
            while j < n and command[j] != '"':
                if command[j] == "\\" and j + 1 < n:
                    out.append(command[j + 1])
                    j += 2
                else:
                    out.append(command[j])
                    j += 1
            if j >= n:
                return None
            buf.append("".join(out))
            state["have"] = True
            state["quoted"] = True
            mask.append(MASK * (j - i + 1))
            i = j + 1
            continue

        if c == "$" and nxt == "'":
            j = i + 2
            while j < n and command[j] != "'":
                j += 2 if command[j] == "\\" and j + 1 < n else 1
            if j >= n:
                return None
            body = command[i + 2:j]
            buf.append(body)
            state["have"] = True
            state["quoted"] = True
            # Two mask characters for the `$'`, the body VERBATIM, one for the
            # closing quote. Same length in, same length out.
            mask.append(MASK * 2 + body + MASK)
            i = j + 1
            continue

        if c == "\n":
            end_segment(i)
            mask.append("\n")
            i += 1
            while pending:
                delim, strip = pending.pop(0)
                stop = heredoc_end(command, i, delim, strip)
                if stop is None:
                    return None
                mask.append(MASK * (stop - i))
                bounds.append((i, stop))
                seg_tokens.append([])
                i = stop
            state["start"] = i
            continue

        if c == ";" or c == "|" or (c == "&" and nxt == "&"):
            # A lone `&` is backgrounding, not a separator, and was not one
            # before either. Longest first, so `||` wins over the single `|`.
            width = 2 if (c == "&" and nxt == "&") or (c == "|" and nxt == "|") else 1
            end_segment(i)
            mask.append(command[i:i + width])
            i += width
            state["start"] = i
            continue

        if c == "<":
            flush()
            if nxt == "<":
                strip = command[i + 2:i + 3] == "-"
                width = 3 if strip else 2
                tokens.append(Token("<<", False, True))
                mask.append(command[i:i + width])
                i += width
                delim, consumed = read_delimiter(command, i)
                if delim is None:
                    return None
                mask.append(MASK * consumed)
                i += consumed
                pending.append((delim, strip))
                continue
            tokens.append(Token("<", False, True))
            mask.append("<")
            i += 1
            continue

        if c == ">":
            flush()
            width = 2 if nxt == ">" else 1
            tokens.append(Token(command[i:i + width], False, True))
            mask.append(command[i:i + width])
            i += width
            continue

        if c in " \t\r":
            flush()
            mask.append(c)
            i += 1
            continue

        buf.append(c)
        state["have"] = True
        mask.append(c)
        i += 1

    if pending:
        # A heredoc was opened and the string ended before its body did.
        return None

    end_segment(n)
    masked = "".join(mask)
    if len(masked) != n:
        # The mask lost its alignment, so no offset in it can be trusted. Say so
        # by refusing to resolve rather than by returning a wrong answer.
        return None

    return [
        Segment(command[a:b], masked[a:b], toks)
        for (a, b), toks in zip(bounds, seg_tokens)
    ]


def unresolved_segment(command):
    """The fallback when the scan cannot resolve the string.

    NOTHING IS MASKED and the whole string is one segment, so every check still
    runs over every character. A mis-parse must not wall a session, and it must
    not silently disable the gate either; running the old, blunter behaviour is
    the only option that fails in neither direction.
    """
    return Segment(command, command, [Token(w) for w in command.split()])


def base_name(token):
    """The bare program name: strips a path and a .exe suffix."""
    name = Path(token).name.lower()
    if name.endswith(".exe"):
        name = name[:-4]
    return name


def command_word(segment):
    """The segment's real command word and its index, or (None, -1).

    Environment assignments, shell keywords in KEYWORDS and any wrapper in
    WRAPPERS are skipped, a wrapper together with its own flags, assignments
    and, for `timeout` and `nice`, one duration argument. Claude Code strips the
    same wrapper for its own permission matching, so `timeout 8 python ...`
    resolving to `python` here is the same reading the client already takes.

    THE THREE ARE SKIPPED IN ONE LOOP because they interleave in real commands:
    `do PGPASSWORD=x psql ...` needs the keyword and then the assignment, and
    `then sudo alembic ...` needs the keyword and then the wrapper. A QUOTED word
    is never treated as a keyword or an assignment, which is the narrow
    direction: `"do" x` asks for a program named do.
    """
    words = segment.words()
    i = 0
    guard = 0
    while i < len(words) and guard < 16:
        word = words[i]
        if ASSIGNMENT.match(word.text) and not word.quoted:
            i += 1
            guard += 1
            continue

        # THE KEYWORD IS COMPARED AGAINST THE EXACT TEXT, not against
        # base_name(), which is what every other resolution here uses. A shell
        # keyword has one spelling and never carries a path, while base_name()
        # would read `./do` and `/usr/bin/if` as keywords and resolve the word
        # after them as the command. That is the narrow direction on purpose.
        if word.text in KEYWORDS and not word.quoted:
            i += 1
            guard += 1
            continue

        name = base_name(word.text)
        if name not in WRAPPERS:
            break
        guard += 1
        i += 1
        took_duration = False
        while i < len(words):
            text = words[i].text
            if text.startswith("-") or ASSIGNMENT.match(text):
                i += 1
            elif (name in DURATION_WRAPPERS and not took_duration
                  and DURATION.match(text)):
                i += 1
                took_duration = True
            else:
                break

    if i >= len(words):
        return None, -1
    return base_name(words[i].text), i


def module_word(segment, index):
    """The module name of `python -m <module>`, treated as a command word too."""
    words = segment.words()
    if index < 0 or index >= len(words):
        return None
    if base_name(words[index].text) not in PYTHONS:
        return None
    j = index + 1
    while j < len(words):
        text = words[j].text
        if text == "-m" and j + 1 < len(words):
            return base_name(words[j + 1].text)
        if text.startswith("-m") and len(text) > 2 and not text.startswith("--"):
            return base_name(text[2:])
        if text.startswith("-"):
            j += 1
            continue
        break
    return None


def nested_command(segment, index):
    """The argument of `bash -c '<command>'`, or None. One level, no further."""
    words = segment.words()
    if index < 0 or index >= len(words):
        return None
    if base_name(words[index].text) not in SHELLS:
        return None
    j = index + 1
    while j < len(words):
        text = words[j].text
        if text.startswith("--"):
            j += 1
            continue
        if text.startswith("-") and "c" in text[1:]:
            return words[j + 1].text if j + 1 < len(words) else None
        if text.startswith("-"):
            j += 1
            continue
        break
    return None


def segment_from_words(words):
    """A Segment built from tokens that were already scanned.

    For a command standing inside another command's ARGUMENT LIST, where there
    is no substring left to re-scan. `raw` is the words joined by single spaces;
    `masked` is the same string with every QUOTED word replaced by mask
    characters, so the two stay the same length and a quoted word remains data
    to every content check, exactly as in a scanned segment.
    """
    raw = " ".join(w.text for w in words)
    masked = " ".join(MASK * len(w.text) if w.quoted else w.text for w in words)
    return Segment(raw, masked, list(words))


def exec_commands(segment, name):
    """Each `find -exec` / `-execdir` command in the segment, as its own Segment.

    Before this the whole find was ONE segment whose command word was `find`, so
    `find . -name '*.sql' -exec psql -f {} \\;` reached the database with
    neither the ON_ERROR_STOP check nor the backup gate having seen a psql, and
    `find . -name '*.json' -exec jq '.x' {} \\;` invoked the missing binary.
    Both measured 2026-08-30 at exit 0.

    `-ok` and `-okdir` are the interactive spellings of the same thing and are
    NOT covered. That is a named gap, not an oversight.
    """
    if name != "find":
        return []
    out = []
    words = segment.words()
    i = 0
    while i < len(words):
        if words[i].text not in EXEC_FLAGS or words[i].quoted:
            i += 1
            continue
        j = i + 1
        body = []
        while j < len(words) and words[j].text not in EXEC_TERMINATORS:
            body.append(words[j])
            j += 1
        if body:
            out.append(segment_from_words(body))
        i = j + 1
    return out


def analyse(command):
    """Every segment the checks run over: top level, plus one level of nesting.

    A nested segment is a real command, so EVERY content check sees it. The
    checks are about what runs, not about how it was spelled, and
    `bash -c 'cat out.json | jq'` runs a bare jq exactly as the unwrapped form
    does. A `find -exec` command is nested in the same sense and is added the
    same way, at the top level and inside one `bash -c`.
    """
    scanned = scan(command)
    if scanned is None:
        return [unresolved_segment(command)]

    out = []
    for segment in scanned:
        name, index = command_word(segment)
        out.append(segment)
        out.extend(exec_commands(segment, name))
        inner = nested_command(segment, index)
        if inner:
            sub = scan(inner)
            for nested in (sub if sub is not None
                           else [unresolved_segment(inner)]):
                nested_name, _ = command_word(nested)
                out.append(nested)
                out.extend(exec_commands(nested, nested_name))
    return out


def command_words(segments):
    """The command word of every segment, plus any `python -m` module name."""
    words = set()
    for segment in segments:
        name, index = command_word(segment)
        if name:
            words.add(name)
        module = module_word(segment, index)
        if module:
            words.add(module)
    return words


def block(reason):
    sys.stderr.write(reason.rstrip() + "\n")
    sys.exit(2)


# --- check: a bare jq ---------------------------------------------------------
# THE QUESTION IS COMMAND POSITION, NOT PRESENCE ANYWHERE IN THE SEGMENT. The
# earlier spelling was a regex over the masked text, so the token blocked
# wherever it stood: as a grep pattern, as a package name, as a filename, inside
# an ordinary sentence. Measured 2026-08-30, all five at exit 2:
# `grep -rn jq .github/workflows/`, `rg jq docs/`, `git log --grep=jq`,
# `pip install jq`, `echo jq is not installed here`. Recorded as F20 in
# plexive-docs/research/settings-enforcement-final-verification-2026-08-30.md.
#
# The worst part was not the count. The block message below names two allowed
# calls in .github/workflows/codeql.yml, and a reader who wanted to check that
# sentence could not grep for them: the rule refused the audit of its own stated
# exception. It also refused installing the tool whose absence is its premise.
#
# EVERY GENUINE BARE JQ IS A COMMAND WORD, so the check asks command_word()
# instead, which is the same resolution the backup gate already uses and which
# already sees through wrappers, environment assignments and one level of
# `bash -c`. `cat out.json | jq` puts jq in command position of the second
# segment; `jq '.x' f.json` puts it in the first.
#
# The cost, named rather than left to be re-found: an invocation written by path,
# `/usr/bin/jq f.json`, now blocks where the regex let it through, because
# base_name() strips the path. That is a real invocation of the missing binary,
# so blocking it is the direction to be wrong in.
def check_bare_jq(segments):
    for segment in segments:
        name, _ = command_word(segment)
        if name == "jq":
            block(
                "BLOCKED: bare `jq`.\n"
                "jq is NOT installed on this machine and is not on PATH, so this "
                "fails with `command not found`.\n"
                "Use gh's built-in implementation instead: `gh api --jq`, "
                "`gh pr checks --jq`, `gh pr list --jq`.\n"
                "Anything else written to run here does without jq. The two bare jq "
                "calls in .github/workflows/codeql.yml are correct and stay: jq is a "
                "property of the ubuntu-24.04 runner image, not of this machine."
            )


# --- check: grep -c with a carriage-return pattern ----------------------------
# grep, then -c, then a literal backslash-r, inside one segment. The segment
# boundary is what keeps this from crossing a separator; the mask is what keeps
# it from firing on the word inside a quoted argument.
# The class stays bounded to one line rather than becoming `.*?`: it keeps the
# match, and the backtracking, linear on the 200,000-character command the
# verification report fed this hook.
GREP_CR = re.compile(r"\bgrep\b[^\n]*?(?<![\w-])-c\b[^\n]*?\\r")


def check_grep_cr(segments):
    for segment in segments:
        if GREP_CR.search(segment.masked):
            block(
                "BLOCKED: `grep -c` with a carriage-return pattern.\n"
                "grep -c DOES NOT COUNT CARRIAGE RETURNS. It counts matching LINES, "
                "so on a file where every line ends CRLF it returns the line count "
                "and on a file with none it returns 0. Both look like a correct "
                "answer.\n"
                "Use a byte count, which cannot lie:\n"
                "  python -c \"print(open(f,'rb').read().count(b'\\r'))\"\n"
                "  git cat-file blob :<file> | wc -c   # compare against the working tree"
            )


# --- check: psql reading a file without ON_ERROR_STOP -------------------------
# The short flag, the same flag bundled with others (`-1f`), and the long form
# in both spellings. A `<` redirect is handled through the operator tokens, so
# a heredoc (`<<`) does not fire it.
DASH_F = re.compile(r"(?<![\w-])-[A-Za-z0-9]*f[A-Za-z0-9]*(?=[\s=]|$)")
LONG_FILE = re.compile(r"(?<![\w-])--file(?=[=\s]|$)")


def psql_reads_a_file(segment):
    if DASH_F.search(segment.masked) or LONG_FILE.search(segment.masked):
        return True
    return any(t.op and t.text == "<" for t in segment.tokens)


def check_psql_f(segments):
    for segment in segments:
        name, _ = command_word(segment)
        if name != "psql":
            continue
        # The EXEMPTION reads the raw text, so any spelling of the flag passes,
        # quoted or not. Being wrong in the allowing direction here costs a
        # warning; being wrong in the blocking direction costs the check.
        if "ON_ERROR_STOP=1" in segment.raw:
            continue
        if psql_reads_a_file(segment):
            block(
                "BLOCKED: `psql` reading a file without `-v ON_ERROR_STOP=1`.\n"
                "Bare `psql -f`, `psql --file=` and `psql < file` all keep going "
                "after an error and still exit 0, so a restore that only half "
                "applied reports success. Reading the exit code is the whole "
                "point.\n"
                "Correct form: psql -v ON_ERROR_STOP=1 -f dump.sql"
            )


# --- check: a destruction under the backups path ------------------------------
def backup_dir_value():
    """The override only. The default location is never pinned into this file.

    tools/check_backup_age.sh:100-105 resolves PLEXIVE_BACKUP_DIR, then
    $OneDrive, then $HOME/OneDrive, so hardcoding an absolute path here would
    make this check wrong on any machine that resolves it differently.
    """
    return (os.environ.get("PLEXIVE_BACKUP_DIR") or "").strip()


SEPARATORS_AND_DRIVE = re.compile(r"[\\/:]")


def squash_path(text):
    """A path with its separators and drive colon removed, lowercased.

    THE SAME DIRECTORY HAS THREE SPELLINGS ON THIS MACHINE and they have to
    compare equal or the check reads the right question off the wrong string.
    PLEXIVE_BACKUP_DIR arrives from the environment as `C:\\Users\\...\\dir`; a
    bash command usually spells it `/c/Users/.../dir`; and an UNQUOTED Windows
    path in a bash command loses its backslashes entirely to shell escaping, so
    the token this hook sees is `C:Users...dir`. Measured 2026-08-30: before
    this, all three backups shapes returned 0 against a path set from the
    environment, which is a destruction check reporting nothing while looking
    like it ran.

    The literal `plexive-backups` needle is unaffected in every spelling, since
    it holds no separator. This is only about the override.
    """
    return SEPARATORS_AND_DRIVE.sub("", text).lower()


BACKUP_LITERAL = "plexive-backups"

# A path segment ends at a separator, at the drive colon, or at whitespace.
# Whitespace counts because the operand handed to names_backups is often a whole
# command joined by spaces, where a space is a real operand boundary.
PATH_SEGMENT = re.compile(r"[\\/:\s]+")


def backup_needles():
    """The two needles, returned APART because they are matched differently.

    The literal is tested as a whole path segment. The override is a full path
    and keeps the squashed test, which is what makes the three spellings of the
    same directory compare equal.
    """
    override = backup_dir_value()
    return BACKUP_LITERAL, (squash_path(override) if override else "")


def names_backups(text, needles):
    """Whether `text` names something under a backup directory.

    THIS IS A LOCATION TEST AND NOT A SUBSTRING ONE. It was a substring one
    until 2026-08-30: it asked only whether the literal appeared anywhere in the
    operand, so `rm -f /tmp/plexive-backups-scratch.log` was refused with a
    message saying it destroys a file under the backup directory, which was true
    of neither it nor of the five other shapes an independent 47-command sweep
    found. A filename that merely contains the literal is not a manifest.

    The literal therefore counts only as a WHOLE PATH SEGMENT, delimited by a
    separator or by the start or end of the operand. The override keeps the
    squashed substring test, because an unquoted Windows path reaches this hook
    with its backslashes already eaten by the scanner and has no separators left
    to split on; that spelling is asserted by a named case in hook_cases.py.
    """
    if not text:
        return False
    literal, override = needles
    if override and override in squash_path(text):
        return True
    return any(part.lower() == literal for part in PATH_SEGMENT.split(text))


BACKUP_BLOCK = (
    "BLOCKED: a command that destroys a file under the backup directory.\n"
    "Supabase's free tier performs NO automatic backups, so these files are the "
    "only copy, and the manifest sequence is the only schema and growth history "
    "anyone keeps. MANIFESTS ARE NEVER PRUNED.\n"
    "If a file genuinely has to go, delete it by hand outside a tool call."
)


def check_backup_deletion(segments):
    needles = backup_needles()
    for segment in segments:
        name, index = command_word(segment)
        words = segment.words()
        operands = [w.text for w in words[index + 1:]] if index >= 0 else []

        if name in DELETE_WORDS and names_backups(segment.text_of_words(), needles):
            block(BACKUP_BLOCK)

        # find carrying -delete or -exec rm. Neither uses a word in DELETE_WORDS
        # and both destroy a manifest.
        if name == "find" and names_backups(segment.text_of_words(), needles):
            if "-delete" in operands:
                block(BACKUP_BLOCK)
            if "-exec" in operands and any(base_name(o) in DELETE_WORDS
                                           for o in operands):
                block(BACKUP_BLOCK)

        # mv whose SOURCE is under the path. Moving something INTO the directory
        # is not a destruction and stays allowed.
        if name == "mv":
            source = next((o for o in operands if not o.startswith("-")), "")
            if names_backups(source, needles):
                block(BACKUP_BLOCK)

        # A `>` or `>>` whose target is under the path. Truncation is not
        # deletion, and it loses the file just the same.
        for position, token in enumerate(segment.tokens):
            if not token.op or token.text not in (">", ">>"):
                continue
            following = segment.tokens[position + 1:position + 2]
            if following and names_backups(following[0].text, needles):
                block(BACKUP_BLOCK)


# --- check: gh api without --paginate -----------------------------------------
METHOD_FLAGS = ("-X", "--method")

# `-h` is gh's help shorthand. `-H` is the header flag and is a different thing,
# which is why this is compared case-sensitively against the exact token.
HELP_FLAGS = {"--help", "-h"}


def gh_method(operands):
    """The HTTP method a `gh api` call carries, or None."""
    for position, text in enumerate(operands):
        for flag in METHOD_FLAGS:
            if text == flag and position + 1 < len(operands):
                return operands[position + 1]
            if text.startswith(flag + "="):
                return text[len(flag) + 1:]
            if flag == "-X" and text.startswith("-X") and len(text) > 2:
                return text[2:]
    return None


def check_gh_paginate(segments):
    for segment in segments:
        name, index = command_word(segment)
        if name != "gh":
            continue
        words = [w.text for w in segment.words()]
        if index + 1 >= len(words) or words[index + 1] != "api":
            continue

        operands = words[index + 2:]

        # graphql does not paginate the way a REST list does, and its cursors are
        # written into the query itself.
        if operands and operands[0] == "graphql":
            continue

        # `--help` issues no request at all. There is no first page, no cursor
        # and nothing to truncate, so the rule's stated rationale does not reach
        # it, and the remedy the message offers changes nothing about what the
        # command does. Measured 2026-08-30 at exit 2, recorded as F21.
        #
        # THIS IS NOT AN ENDPOINT EXEMPTION LIST, deliberately. A call still
        # blocks wherever adding the flag would be a valid fix, so
        # `gh api rate_limit` and a single-object endpoint stay blocked even
        # though neither paginates: adding --paginate there is harmless and
        # works. An enumerated list of correct inputs is incomplete by
        # construction, and that shape is what produced these findings twice.
        if any(operand in HELP_FLAGS for operand in operands):
            continue

        # A write is a single request. Refusing a POST for lacking a pagination
        # flag is a check firing on correct work.
        method = gh_method(operands)
        if method and method.upper() != "GET":
            continue

        if "--paginate" not in operands:
            block(
                "BLOCKED: `gh api` without `--paginate`.\n"
                "A paginated endpoint returns its first page and nothing says "
                "so, so a partial list reads exactly like a complete one. "
                "That is the reassuring output this repository keeps "
                "recording.\n"
                "Add --paginate. A call carrying a method other than GET, and a "
                "graphql call, are exempt and do not need it."
            )


# --- check: the backup gate ---------------------------------------------------
def check_backup_gate(segments):
    if not (command_words(segments) & BACKUP_TRIGGERS):
        return

    if not BACKUP_CHECK.is_file():
        block(
            "BLOCKED: the backup age gate could not run.\n"
            "Expected the checker at " + str(BACKUP_CHECK) + " and it is not "
            "there. A gate failing to run is not the same as a gate passing, and "
            "it is not treated as one."
        )

    try:
        # Output is CAPTURED, never piped into another command: a pipe would put
        # this script's verdict at the mercy of the last command in the pipeline.
        proc = subprocess.run(
            ["bash", str(BACKUP_CHECK)],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001 - every failure here has one verdict
        block(
            "BLOCKED: the backup age gate could not run ("
            + type(exc).__name__ + ": " + str(exc) + ").\n"
            "A gate that cannot run does not allow the thing it guards."
        )

    output = (proc.stdout + proc.stderr).rstrip()

    if proc.returncode == 0:
        return

    if proc.returncode == 3:
        # A current backup that has not reached OneDrive. Allowed, and said out
        # loud, because it is invisible to every other signal there is.
        sys.stderr.write(
            "WARNING from tools/check_backup_age.sh (exit 3, allowed):\n"
            + output + "\n"
        )
        add_context(
            "BACKUP WARNING (exit 3): a current backup exists but has NOT "
            "reached OneDrive, so it is on this disk and nowhere else.\n" + output
        )
        return

    if proc.returncode in (1, 2):
        block(
            "BLOCKED by the backup age gate (exit " + str(proc.returncode) + ").\n"
            "A session that touches the database or the schema checks the backup "
            "age first.\n\n" + output
        )

    block(
        "BLOCKED: the backup age gate returned an unexpected exit code "
        + str(proc.returncode) + ", which is not one of its four documented "
        "situations (0 current, 1 stale, 2 none at all, 3 not synced).\n\n"
        + output
    )


# The registry the runner walks. A check that raises exits 2 naming itself, so
# the six are listed here with the names that reach a reader.
CHECKS = [
    ("bare jq", check_bare_jq),
    ("grep -c on a carriage return", check_grep_cr),
    ("psql reading a file without ON_ERROR_STOP", check_psql_f),
    ("a destruction under the backups path", check_backup_deletion),
    ("gh api without --paginate", check_gh_paginate),
    ("the backup age gate", check_backup_gate),
]


def run_checks(segments):
    """Run every check. A check that raises BLOCKS, naming itself.

    This is the second of the two crash rules and the opposite of the first. If
    nothing could be taken out of the payload there is nothing to check and the
    hook allows; but once a command HAS been read, a check that could not finish
    is not a check that passed, and treating it as one is how a gate stops
    existing while still looking installed.
    """
    for name, check in CHECKS:
        try:
            check(segments)
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 - one verdict for every failure
            block(
                "BLOCKED: the check '" + name + "' could not finish ("
                + type(exc).__name__ + ": " + str(exc) + ").\n"
                "A check that raised is not a check that passed. The command was "
                "read, so this is not an unreadable payload; it is a defect in "
                "the hook, and it is reported rather than waved through."
            )


# --- the commit rules ---------------------------------------------------------
GIT_SUBCOMMANDS = {"commit", "merge"}

# Global flags whose value is a SEPARATE word, so that word is not the
# subcommand. `git -C ../plexive-docs commit -m x` drew no rules before this:
# the loop skipped `-C`, read the directory as the first non-flag word and
# stopped. Measured 2026-08-30, rules drawn: false. A MISS rather than a false
# block, and in scope only because it is one line in the same place.
GIT_VALUE_FLAGS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace",
                   "--exec-path", "--super-prefix"}


def is_commit_or_merge(segments):
    for segment in segments:
        name, index = command_word(segment)
        if name != "git":
            continue
        skip = False
        for token in segment.words()[index + 1:]:
            if skip:
                skip = False
                continue
            if token.text in GIT_VALUE_FLAGS:
                skip = True
                continue
            if token.text.startswith("-"):
                continue
            if token.text.lower() in GIT_SUBCOMMANDS:
                return True
            break
    return False


def strip_frontmatter(text):
    """Drop a leading YAML frontmatter block, if there is one."""
    if not text.startswith("---"):
        return text
    lines = text.splitlines()
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[i + 1:]).lstrip("\n")
    return text


def commit_rules_text():
    """The rules, read from the file that holds them.

    ONE COPY. Before this the hook carried a hardcoded duplicate inside
    settings.json while citing this path as its source, so editing the file
    changed nothing a session was told and the two could diverge in silence.

    FAILS OPEN, deliberately, and this is the opposite of the backup gate above.
    That gate blocks when it cannot run, because the thing it protects is
    irreplaceable. This text is advisory context, and refusing a commit over a
    missing advisory file would be a worse failure than the one it guards.
    """
    try:
        raw = COMMIT_RULES.read_text(encoding="utf-8")
    except Exception:  # noqa: BLE001 - unreadable and absent get one answer
        return None
    return strip_frontmatter(raw).strip() or None


# Context is COLLECTED and emitted once. Two concatenated JSON documents on
# stdout are not a valid document, and the message at risk of being dropped is
# the backup warning, which is invisible to every other signal there is.
CONTEXT = []


def add_context(text):
    CONTEXT.append(text)


def emit_context():
    if not CONTEXT:
        return
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": "\n\n".join(CONTEXT),
            }
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


def command_from(payload):
    """The command string, or "" if the payload does not carry one.

    Every wrong SHAPE lands here and produces "", which the caller turns into
    exit 0. A payload this hook cannot read is not evidence of a bad command,
    and blocking over one would wall a session for a reason that has nothing to
    do with what it asked for.
    """
    if not isinstance(payload, dict):
        return ""
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return ""
    command = tool_input.get("command")
    if not isinstance(command, str):
        return ""
    return command


def read_payload():
    """The payload, from stdin READ AS BYTES and decoded as UTF-8 explicitly.

    THE SAME READ AS pretooluse_write.py, AND IT CHANGES NOTHING THIS HOOK DOES
    TODAY. `json.load(sys.stdin)` decoded with the machine's default encoding,
    cp1252 here, which turns the raw UTF-8 bytes of any non-ASCII character into
    mojibake WITHOUT RAISING. Every check in this file keys on an ASCII command
    word -- jq, psql, alembic, gh, grep -- and mojibake elsewhere in the command
    leaves those words intact, so none of the six was ever bitten; measured
    2026-09-01, a jq invocation with non-ASCII elsewhere still blocked at 2.

    It is changed anyway because the NEXT check added here inherits the read,
    and a check with a non-ASCII subject would be born dead exactly as
    check_emoji was: running, examining mojibake, and reporting success.
    """
    return json.loads(sys.stdin.buffer.read().decode("utf-8"))


def main():
    try:
        payload = read_payload()
    except UnicodeDecodeError as exc:
        # Says so rather than allowing in silence.
        sys.stderr.write(
            "NOTE: pretooluse_bash.py could not decode its stdin as UTF-8 ("
            + str(exc) + "). No check ran, and the command is ALLOWED.\n"
        )
        return 0
    except Exception:  # noqa: BLE001
        # An unreadable payload is not evidence of a bad command. Allow, so that
        # a payload-shape change cannot wedge every Bash call in the session.
        return 0

    command = command_from(payload)
    if not command:
        return 0

    segments = analyse(command)
    run_checks(segments)

    # The advisory half, and it stays FAILING OPEN even here: a defect in the
    # rules injection is not worth refusing a commit over, which is the same
    # asymmetry commit_rules_text() already describes. It says so on stderr
    # rather than passing in silence.
    try:
        if is_commit_or_merge(segments):
            rules = commit_rules_text()
            if rules:
                add_context(
                    "COMMIT RULES, read from .claude/skills/commit/SKILL.md by the "
                    "PreToolUse hook:\n\n" + rules
                    + "\n\nA merge commit follows the same format: "
                    "chore(merge): merge <branch> into main."
                )
            else:
                # STILL FAILS OPEN -- the commit proceeds -- but it SAYS SO. Measured
                # 2026-08-31 with the file absent: rc=0, zero bytes on stdout and zero
                # on stderr, so a reader whose input had vanished was indistinguishable
                # from one that had nothing to add. The notice goes through
                # add_context() rather than stderr, because hook stderr at exit 0 is
                # somewhere nobody is looking.
                add_context(
                    "NOTICE: the PreToolUse hook found no commit rules to inject. It "
                    "reads .claude/skills/commit/SKILL.md, and that file is missing, "
                    "unreadable, or empty below its frontmatter. The commit is "
                    "ALLOWED -- these rules are advisory -- but nobody is being told "
                    "the conventions, so check that path before relying on them."
                )
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(
            "NOTE: the commit-rules injection failed ("
            + type(exc).__name__ + ": " + str(exc) + "). Allowed, because it is "
            "advisory. The six blocking checks all ran.\n"
        )

    emit_context()
    return 0


if __name__ == "__main__":
    sys.exit(main())
