#!/usr/bin/env python3
"""PreToolUse hook for the Bash tool.

Exit 2 blocks the tool call and shows stderr to the session. Exit 0 allows it.
Nothing else blocks: an `echo` hook, which is what this file replaces, cannot
produce exit code 2 at all and therefore stopped nothing.

Pure standard library on purpose. A hook that needs an install is a hook that is
silently absent on the first machine that lacks it.

Check order is deliberate and is NOT the order the checks are numbered in the
brief. The five string checks run first and the backup gate last, because the
gate spawns a subprocess and reads a real directory, and a command that is going
to be blocked for its own defect has no business causing either. So
`psql -f dump.sql` blocks on the missing ON_ERROR_STOP without the gate ever
running.
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
COMMIT_RULES = REPO_ROOT / ".claude" / "skills" / "commit.md"

# Command words that mean a database or schema operation is about to happen.
BACKUP_TRIGGERS = {"alembic", "psql", "pg_dump", "pg_restore", "pg_dumpall"}

DELETE_WORDS = {"rm", "unlink", "shred", "remove-item", "del"}

# Longest first: `||` has to win over the single `|` in the character class.
SEPARATOR = re.compile(r"\|\||&&|[;|\n]")

# One leading `VAR=value` assignment, so `CLOSED_BETA=1 psql ...` still resolves
# its command word to psql.
ASSIGNMENT = re.compile(r"""^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+""")


def segments(command):
    """The command split on shell separators. Each piece has its own command word."""
    return SEPARATOR.split(command)


def tokens_of(segment):
    """Tokens of one segment with any leading environment assignments removed."""
    text = segment.strip()
    while True:
        match = ASSIGNMENT.match(text)
        if not match:
            break
        text = text[match.end():]
    return text.split()


def base_name(token):
    """The bare program name: strips a path and a .exe suffix."""
    name = Path(token).name.lower()
    if name.endswith(".exe"):
        name = name[:-4]
    return name


def command_words(command):
    """The first real token of every segment, as a bare program name.

    This is what keeps `find app scripts tests alembic -name '*.py'` from firing
    the backup gate: `alembic` there is an argument and a directory name, not a
    command word.
    """
    words = []
    for segment in segments(command):
        toks = tokens_of(segment)
        if toks:
            words.append(base_name(toks[0]))
    return words


def block(reason):
    sys.stderr.write(reason.rstrip() + "\n")
    sys.exit(2)


# --- check: a bare jq ---------------------------------------------------------
# `jq` not preceded by `-`, `/`, `.` or an alphanumeric, and followed by
# whitespace or the end of the command. The trailing half is the part the
# earlier spelling missed: `cat f | jq` ends the command on the token.
BARE_JQ = re.compile(r"(?<![-/.\w])jq(?=\s|$)")


def check_bare_jq(command):
    if BARE_JQ.search(command):
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
# grep, then -c, then a literal backslash-r, with no command separator crossed.
GREP_CR = re.compile(r"\bgrep\b[^;&|\n]*?(?<![\w-])-c\b[^;&|\n]*?\\r")


def check_grep_cr(command):
    if GREP_CR.search(command):
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


# --- check: psql -f without ON_ERROR_STOP ------------------------------------
DASH_F = re.compile(r"(?<![\w-])-f\b")


def check_psql_f(command):
    for segment in segments(command):
        toks = tokens_of(segment)
        if not toks or base_name(toks[0]) != "psql":
            continue
        if DASH_F.search(segment) and "ON_ERROR_STOP=1" not in segment:
            block(
                "BLOCKED: `psql -f` without `-v ON_ERROR_STOP=1`.\n"
                "Bare `psql -f` keeps going after an error and still exits 0, so "
                "a restore that only half applied reports success. Reading the "
                "exit code is the whole point.\n"
                "Correct form: psql -v ON_ERROR_STOP=1 -f dump.sql"
            )


# --- check: a deletion under the backups path ---------------------------------
def backup_dir_value():
    """The override only. The default location is never pinned into this file.

    tools/check_backup_age.sh:100-105 resolves PLEXIVE_BACKUP_DIR, then
    $OneDrive, then $HOME/OneDrive, so hardcoding an absolute path here would
    make this check wrong on any machine that resolves it differently.
    """
    return (os.environ.get("PLEXIVE_BACKUP_DIR") or "").strip()


def check_backup_deletion(command):
    if not (set(command_words(command)) & DELETE_WORDS):
        return
    override = backup_dir_value()
    if "plexive-backups" in command or (override and override in command):
        block(
            "BLOCKED: a deletion naming the backup directory.\n"
            "Supabase's free tier performs NO automatic backups, so these files "
            "are the only copy, and the manifest sequence is the only schema and "
            "growth history anyone keeps. MANIFESTS ARE NEVER PRUNED.\n"
            "If a file genuinely has to go, delete it by hand outside a tool call."
        )


# --- check: gh api without --paginate -----------------------------------------
def check_gh_paginate(command):
    for segment in segments(command):
        toks = tokens_of(segment)
        if len(toks) >= 2 and base_name(toks[0]) == "gh" and toks[1] == "api":
            if "--paginate" not in toks:
                block(
                    "BLOCKED: `gh api` without `--paginate`.\n"
                    "A paginated endpoint returns its first page and nothing says "
                    "so, so a partial list reads exactly like a complete one. "
                    "That is the reassuring output this repository keeps "
                    "recording.\n"
                    "Add --paginate."
                )


# --- check: the backup gate ---------------------------------------------------
def check_backup_gate(command):
    if not (set(command_words(command)) & BACKUP_TRIGGERS):
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
        emit_context(
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


# --- the commit rules ---------------------------------------------------------
GIT_SUBCOMMANDS = {"commit", "merge"}


def is_commit_or_merge(command):
    for segment in segments(command):
        toks = tokens_of(segment)
        if not toks or base_name(toks[0]) != "git":
            continue
        for tok in toks[1:]:
            if tok.startswith("-"):
                continue
            if tok.lower() in GIT_SUBCOMMANDS:
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


def emit_context(text):
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": text,
            }
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        # An unreadable payload is not evidence of a bad command. Allow, so that
        # a payload-shape change cannot wedge every Bash call in the session.
        return 0

    command = ((payload.get("tool_input") or {}).get("command")) or ""
    if not command:
        return 0

    # Whole-string checks first. A command substitution or a leading environment
    # assignment does not evade these the way it evades a permission-rule prefix.
    check_bare_jq(command)
    check_grep_cr(command)
    check_psql_f(command)
    check_backup_deletion(command)
    check_gh_paginate(command)
    check_backup_gate(command)

    if is_commit_or_merge(command):
        rules = commit_rules_text()
        if rules:
            emit_context(
                "COMMIT RULES, read from .claude/skills/commit.md by the "
                "PreToolUse hook:\n\n" + rules
                + "\n\nA merge commit follows the same format: "
                "chore(merge): merge <branch> into main."
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
