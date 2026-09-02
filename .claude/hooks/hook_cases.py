#!/usr/bin/env python3
"""Both-directions harness for all three hooks in this directory, not for the
two PreToolUse ones alone. Sixteen of its cases drive the Stop hook, counted
2026-09-02; the rest drive the two PreToolUse hooks.

Every check gets at least one payload that must be blocked (exit 2) and at least
one that must be allowed (exit 0). The allowed payload is a real correct command
or file, never a blank one: a check that passes an empty string has proved
nothing about the check.

Ends with `N cases, M matched` and exits non-zero when M is below N, because a
harness whose failure looks like its success is the failure this repository keeps
recording.

CASE NAMES CARRY THE FINDING THEY CLOSE, and they now come from TWO reports.
`F5`, `F7`, `F8`, `F9`, `F10`, `F11` and `F13` are numbered in
plexive-docs/research/settings-enforcement-verification-2026-08-30.md. `F20`,
`F21` and `F22` are numbered in
plexive-docs/research/settings-enforcement-final-verification-2026-08-30.md,
which is a DIFFERENT file, and all three are false blocks on correct commands
rather than misses. `F23` and `F24` are numbered in a THIRD file,
plexive-docs/research/settings-enforcement-fixes-round-three-2026-08-30.md, and
both run the other way again: they are MISSES, a shell keyword and a
`find -exec` hiding the command word from every check that resolves one. `F25`
is numbered here rather than in its report, a FOURTH file,
plexive-docs/research/settings-enforcement-merge-2026-08-30.md, which records it
as six blocked commands of one shape. It is a false block again, and it sits in
the backups needle rather than in command-word resolution, which is why none of
the three earlier rounds moved it. So a case that later goes red says which
measured defect has come back and which report describes it.

TWO LITERALS ARE BUILT BY CONCATENATION ON PURPOSE, the emoji and the deprecated
utcnow call. Spelled out, they would make this file trip the very checks it
exists to exercise, and the harness would become uneditable under its own gate.

PAYLOADS ARE FED AS RAW UTF-8 BYTES, NOT AS json.dumps() ESCAPES, since
2026-09-02. Until then every payload went through json.dumps() with the
default ensure_ascii and subprocess text=True, so an emoji arrived as pure
ASCII escapes -- which the cp1252 stdin read repaired on 2026-09-01 decoded
perfectly, so 160 cases passed for two days against a check that could not
fire on anything a client sends. The two `harness bytes:` cases exist to make
that undetectable-by-construction state detectable: one of them drives a copy
of the write hook with the BROKEN read restored and expects it to ALLOW, and
it is red for exactly as long as anything here escapes.

THE REAL BACKUP DIRECTORY IS NEVER TOUCHED, in any direction, for any reason.
Every case runs with PLEXIVE_BACKUP_DIR pointed at a temporary directory this
script creates and removes.
"""

import json
import locale
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HOOKS = Path(__file__).resolve().parent
REPO_ROOT = HOOKS.parents[1]
BASH_HOOK = HOOKS / "pretooluse_bash.py"
WRITE_HOOK = HOOKS / "pretooluse_write.py"
STOP_HOOK = HOOKS / "stop_rule_log.py"

# Built rather than written. See the module docstring.
FIRE = chr(0x1F525)
UTCNOW = "datetime." + "utcnow()"
CHECK_GLYPH = chr(0x2713)  # U+2713, outside the emoji range on purpose

# The splice point used to build a hook whose check raises. It is asserted on in
# make_fixtures, so a hook that stops carrying it fails loudly instead of
# quietly producing a case that can never block.
SENTINEL = 'if __name__ == "__main__":'

# The splice point used to build a copy of the write hook that reads stdin the
# way it did BEFORE 2026-09-01. Asserted in write_legacy_stdin for the same
# reason SENTINEL is: a splice that silently found nothing yields an ordinary
# hook and a case that can never discriminate.
LEGACY_STDIN_NEW = "payload = read_payload()"
LEGACY_STDIN_OLD = "payload = json.load(sys.stdin)"

# The splice point used to build a copy of the Stop hook that decides a refusal
# from `toolDenialKind` instead of from the result text. THAT COPY EXISTS TO BE
# WRONG. The field is absent on every Read-form permission-deny refusal (6 of 6
# across 164 transcripts, measured 2026-09-02) and set to "permission-rule" on
# every PreToolUse hook block (36 of 36), which is not a permission rule. The
# obvious mechanical detector is therefore wrong in the dangerous direction: it
# returns a plausible number and silently drops the exact case the log exists
# for. The pair of cases pointed at this copy is what keeps that from being
# rediscovered by somebody simplifying refusal_shape() into a dict lookup.
SHAPE_CALL_OLD = "            shape = refusal_shape(text)"
SHAPE_CALL_NEW = "            shape = FIELD_KEYED.get(record.get(\"toolDenialKind\"))"
# Assembled from chr(10) rather than from an escape, so the counter-example's
# own source carries no backslash sequence for a splice to preserve verbatim.
FIELD_KEYED = chr(10).join([
    "FIELD_KEYED = {",
    '    "permission-rule": SHAPE_DENIED_CALL,',
    "}",
    "",
    "",
])

FAULT = (
    "def _injected_fault(*args):\n"
    '    raise ValueError("injected fault")\n'
    'CHECKS.append(("injected fault", _injected_fault))\n\n'
)

# One file per added suffix, each a real path in this repository's shape.
ADDED_SUFFIX_FILES = [
    ("kts", "mobile-kmp/androidApp/build.gradle.kts", "// android { }\n"),
    ("sh", "tools/backup_supabase.sh", "echo backing up\n"),
    ("yml", ".github/workflows/backend-checks.yml", "name: backend-checks\n"),
    ("yaml", "deploy/compose.yaml", "services: {}\n"),
    ("js", "frontend/next.config.js", "module.exports = {};\n"),
    ("jsx", "frontend/src/legacy/Widget.jsx", "export default () => null;\n"),
]


def bash_payload(command):
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def write_payload(path, content):
    return {"tool_name": "Write", "tool_input": {"file_path": path, "content": content}}


def edit_payload(path, new_string):
    return {
        "tool_name": "Edit",
        "tool_input": {"file_path": path, "new_string": new_string},
    }


def stop_payload(transcript, session, last_message=""):
    """A Stop payload with the ELEVEN keys observed at 2.1.257, and no more.

    `stop_reason` is deliberately absent. It is documented and was in none of the
    three captured firings, so a hook that required it would agree with the
    documentation and fail against the product.
    """
    return {
        "session_id": session,
        "prompt_id": "8083ce57-88d9-4dcb-8f1c-c315d7b98f84",
        "transcript_path": str(transcript),
        "cwd": str(REPO_ROOT),
        "permission_mode": "default",
        "effort": {"level": "high"},
        "hook_event_name": "Stop",
        "last_assistant_message": last_message,
        "stop_hook_active": False,
        "background_tasks": [],
        "session_crons": [],
    }


def call(use_id, name, tool_input):
    """One transcript record carrying one tool_use block."""
    return {"type": "assistant", "version": "2.1.251", "gitBranch": "main",
            "cwd": str(REPO_ROOT),
            "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": use_id, "name": name,
                 "input": tool_input}]}}


def result(use_id, body, is_error=True, denial_kind=None):
    """One transcript record carrying one tool_result block.

    `denial_kind` is written onto the RECORD and not into the block, which is
    where the real transcripts carry it.
    """
    record = {"type": "user", "version": "2.1.251", "gitBranch": "main",
              "cwd": str(REPO_ROOT),
              "message": {"role": "user", "content": [
                  {"type": "tool_result", "content": body, "is_error": is_error,
                   "tool_use_id": use_id}]}}
    if denial_kind is not None:
        record["toolDenialKind"] = denial_kind
    return record


def transcript_text(records):
    """The fixture as a client writes it: one compact JSON object per LF line."""
    return "".join(json.dumps(r) + chr(10) for r in records)


def write_transcript(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(transcript_text(records))
    return path


def payload_bytes(payload):
    """The BYTES a real client puts on a hook's stdin.

    THIS WAS `json.dumps(payload)` FED THROUGH `text=True`, AND THAT DID TWO
    SEPARATE THINGS, EACH OF WHICH ON ITS OWN HIDES THE 2026-09-01 DEFECT.

    `json.dumps` defaults to `ensure_ascii=True`, so an emoji left here as
    `\\uXXXX` escapes -- pure ASCII, which the old cp1252 `json.load(sys.stdin)`
    decoded perfectly well, so every emoji case in this file passed against a
    check that could not fire on anything a client sends.

    `text=True` encodes with the machine's DEFAULT encoding, cp1252 here, which
    has no representation for U+1F525 at all. Passing `ensure_ascii=False` alone
    therefore does not feed bytes, it raises UnicodeEncodeError. IT IS ONE
    ARGUMENT ON EACH OF TWO CALLS, NOT ONE ARGUMENT, and a session told
    otherwise will find the harness erroring rather than fixed.

    A str payload -- the malformed-JSON cases -- is encoded as UTF-8 rather than
    re-serialised, so what those cases send stays exactly what they spell.
    """
    if isinstance(payload, (bytes, bytearray)):
        return bytes(payload)
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def run(script, payload, env):
    proc = subprocess.run(
        [sys.executable, str(script)],
        input=payload_bytes(payload),
        capture_output=True,
        env=env,
        cwd=str(REPO_ROOT),
    )
    # Output is decoded with the machine's default encoding, which is what
    # text=True did and what the child writes with. Only the INPUT changed.
    enc = locale.getpreferredencoding(False)
    return (proc.returncode,
            proc.stdout.decode(enc, errors="replace"),
            proc.stderr.decode(enc, errors="replace"))


def build_cases(fx):
    """Every case. `expect` is the exit code the hook must produce."""
    fresh = fx["fresh"]
    empty = fx["empty"]
    orphan = fx["orphan"]
    stub = fx["stub"]
    fault_bash = fx["fault_bash"]
    fault_write = fx["fault_write"]
    legacy_write = fx["legacy_write"]

    empty_env = {"PLEXIVE_BACKUP_DIR": str(empty)}
    backups = str(fresh)

    cases = [
        # --- bare jq --------------------------------------------------------
        dict(name="jq: bare at end of a pipe", script=BASH_HOOK, expect=2,
             payload=bash_payload("cat out.json | jq")),
        dict(name="jq: bare mid-command", script=BASH_HOOK, expect=2,
             payload=bash_payload("jq '.check_runs' runs.json")),
        dict(name="jq: gh built-in --jq", script=BASH_HOOK, expect=0,
             payload=bash_payload("gh pr checks --watch --required --jq '.[]'")),
        dict(name="jq: a path ending in jq", script=BASH_HOOK, expect=0,
             payload=bash_payload("cat filters/report.jq")),

        # --- F20: the question is command position, not presence -------------
        # The two lists the brief names. Three of their thirteen commands are
        # already above verbatim and are not duplicated here: `cat out.json |
        # jq` as "jq: bare at end of a pipe", `cat filters/report.jq` as "jq: a
        # path ending in jq", and `bash -c 'cat out.json | jq'` as
        # "nested F7: bash -c with a bare jq". The other ten are below.
        dict(name="jq F20: grep -rn for the token in the workflows",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("grep -rn jq .github/workflows/")),
        dict(name="jq F20: rg for the token in the docs", script=BASH_HOOK,
             expect=0, payload=bash_payload("rg jq docs/")),
        dict(name="jq F20: the token as a git log grep pattern",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("git log --grep=jq")),
        dict(name="jq F20: the token as a package name", script=BASH_HOOK,
             expect=0, payload=bash_payload("pip install jq")),
        dict(name="jq F20: the token inside an ordinary sentence",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo jq is not installed here")),
        dict(name="jq F20: a .jq filter as an ls argument", script=BASH_HOOK,
             expect=0, payload=bash_payload("ls tools/report.jq")),
        dict(name="jq F20: gh pr list with the built-in --jq", script=BASH_HOOK,
             expect=0, payload=bash_payload("gh pr list --jq '.[]'")),
        dict(name="jq F20: the token inside a commit message", script=BASH_HOOK,
             expect=0,
             payload=bash_payload(
                 'git commit -m "chore: mention jq in the docs"')),
        dict(name="jq F20: command position in the first segment",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("jq '.x' f.json")),
        dict(name="jq F20: command position after a paginated gh api",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "gh api repos/:owner/:repo/pulls --paginate | "
                 "jq -r '.[].number'")),
        # The named cost of the narrowing, asserted rather than left to be
        # re-found: an invocation written by path was allowed by the old regex
        # and blocks now, because base_name() strips the path. It is a real
        # invocation of the missing binary.
        dict(name="jq F20: an invocation written by path blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("/usr/bin/jq '.x' f.json")),

        # --- grep -c with a carriage return ---------------------------------
        dict(name="grep-cr: grep -c on a CR pattern", script=BASH_HOOK, expect=2,
             payload=bash_payload("grep -c $'\\r' file.txt")),
        dict(name="grep-cr: python byte count", script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "python -c \"print(open(f,'rb').read().count(b'\\r'))\"")),
        dict(name="grep-cr: grep -c on a normal pattern", script=BASH_HOOK, expect=0,
             payload=bash_payload("grep -c 'def ' backend/app/models.py")),
        dict(name="grep-cr: separator between grep and the CR", script=BASH_HOOK,
             expect=0,
             payload=bash_payload(
                 "grep -c 'x' f.txt && python -c \"print(b'\\r')\"")),

        # --- psql -f --------------------------------------------------------
        dict(name="psql-f: no ON_ERROR_STOP", script=BASH_HOOK, expect=2,
             payload=bash_payload("psql -f dump.sql")),
        dict(name="psql-f: with ON_ERROR_STOP", script=BASH_HOOK, expect=0,
             payload=bash_payload("psql -v ON_ERROR_STOP=1 -f dump.sql")),

        # --- a deletion under the backups path -------------------------------
        dict(name="backup-rm: rm inside plexive-backups", script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "rm -f /c/Users/marlo/OneDrive/plexive-backups/"
                 "plexive-2026-08-01-manifest.txt")),
        dict(name="backup-rm: rm via PLEXIVE_BACKUP_DIR", script=BASH_HOOK, expect=2,
             payload=bash_payload("rm -rf " + backups + "/old"),
             env={"PLEXIVE_BACKUP_DIR": backups}),
        dict(name="backup-rm: rm of an unrelated file", script=BASH_HOOK, expect=0,
             payload=bash_payload("rm -f /tmp/scratch.json")),
        # --- F25: the backups needle tests location, not substring ------------
        # Six correct commands, all one shape, that the sweep in
        # plexive-docs/research/settings-enforcement-merge-2026-08-30.md found
        # blocked: a path whose name merely CONTAINS the literal was treated as
        # a manifest wherever it lived. A false block, like F20 to F22 and
        # unlike F23 and F24.
        dict(name="F25 backups: a scratch log named after the literal",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("rm -f /tmp/plexive-backups-scratch.log")),
        dict(name="F25 backups: a temporary directory named after it",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("rm -rf /tmp/plexive-backups-test")),
        dict(name="F25 backups: a document whose filename contains it",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "rm -f docs/research/plexive-backups-notes.md")),
        dict(name="F25 backups: an mv that destroys nothing at all",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("mv notes/plexive-backups-design.md docs/")),
        dict(name="F25 backups: a redirect into a dir that merely spells it",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "echo done > /tmp/plexive-backups-test/out.txt")),
        dict(name="F25 backups: find -delete under such a directory",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "find /tmp/plexive-backups-test -name '*.tmp' -delete")),

        # The narrowing has to be shown still to catch its own case, or it is a
        # check that was removed rather than one that was corrected. The rm is
        # already asserted twice above; these are the other four shapes, plus
        # the unquoted Windows spelling of the override, which is the one the
        # segment test cannot see and which squash_path carries instead.
        dict(name="F25 backups: find -delete inside the directory blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "find /c/Users/marlo/OneDrive/plexive-backups "
                 "-name '*-manifest.txt' -delete")),
        dict(name="F25 backups: find -exec rm inside the directory blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "find /c/Users/marlo/OneDrive/plexive-backups "
                 "-name '*-manifest.txt' -exec rm {} \\;")),
        dict(name="F25 backups: mv out of the directory blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "mv /c/Users/marlo/OneDrive/plexive-backups/"
                 "plexive-2026-08-01-manifest.txt /tmp/")),
        dict(name="F25 backups: a redirect into the directory blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "echo replaced > /c/Users/marlo/OneDrive/plexive-backups/"
                 "plexive-2026-08-01-manifest.txt")),
        dict(name="F25 backups: the unquoted Windows override spelling blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "rm -f " + backups + "\\plexive-2026-08-30-manifest.txt"),
             env={"PLEXIVE_BACKUP_DIR": backups}),

        # --- gh api ----------------------------------------------------------
        dict(name="gh-api: no --paginate", script=BASH_HOOK, expect=2,
             payload=bash_payload("gh api repos/:owner/:repo/dependabot/alerts")),
        dict(name="gh-api: with --paginate", script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "gh api repos/:owner/:repo/dependabot/alerts --paginate")),

        # --- the backup gate --------------------------------------------------
        dict(name="gate: alembic against an empty backup dir", script=BASH_HOOK,
             expect=2, payload=bash_payload("alembic upgrade head"),
             env=empty_env),
        dict(name="gate: alembic against a fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("alembic upgrade head"),
             env={"PLEXIVE_BACKUP_DIR": backups}),
        dict(name="gate: pg_dump after an env assignment", script=BASH_HOOK,
             expect=2, payload=bash_payload("PGPASSWORD=x pg_dump -Fc db"),
             env=empty_env),
        dict(name="gate: alembic as a directory argument", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("find app scripts tests alembic -name '*.py'"),
             env=empty_env),

        # --- an ordinary command ----------------------------------------------
        dict(name="plain: git status", script=BASH_HOOK, expect=0,
             payload=bash_payload("git status")),

        # --- the injected commit rules ----------------------------------------
        dict(name="commit: rules injected from commit/SKILL.md", script=BASH_HOOK,
             expect=0, payload=bash_payload('git commit -m "x"'),
             stdout_must_contain="conventional commits", show_stdout=True),
        dict(name="commit: merge gets the rules too", script=BASH_HOOK, expect=0,
             payload=bash_payload("git merge --no-ff chore/x"),
             stdout_must_contain="conventional commits"),
        # FAILS OPEN AND SAYS SO SINCE 2026-08-31. It still exits 0, which is the
        # fail-open half and is asserted by expect=0; what changed is that the
        # empty stdout it used to produce was indistinguishable from a hook with
        # nothing to add. The declaration moved from "empty" to "names the path".
        dict(name="commit: fails OPEN when SKILL.md is absent, and SAYS SO",
             script=orphan, expect=0, payload=bash_payload('git commit -m "x"'),
             stdout_must_contain=".claude/skills/commit/SKILL.md", show_stdout=True),

        # --- the write hook ----------------------------------------------------
        dict(name="write: emoji in a .py", script=WRITE_HOOK, expect=2,
             payload=write_payload("backend/app/routes.py",
                                   "# ship it " + FIRE + "\n")),
        dict(name="write: emoji in a .tsx", script=WRITE_HOOK, expect=2,
             payload=write_payload("frontend/src/app/page.tsx",
                                   "const s = '" + FIRE + "';\n")),
        dict(name="write: check glyph in a .tsx stays allowed", script=WRITE_HOOK,
             expect=0,
             payload=write_payload("frontend/src/app/page.tsx",
                                   "const ok = '" + CHECK_GLYPH + "';\n")),
        dict(name="write: emoji in a .md stays allowed", script=WRITE_HOOK, expect=0,
             payload=write_payload("docs/notes.md", "a note " + FIRE + "\n")),

        dict(name="write: utcnow in a .py", script=WRITE_HOOK, expect=2,
             payload=write_payload("backend/app/routes.py",
                                   "created = " + UTCNOW + "\n")),
        dict(name="write: utcnow in time_utils.py stays allowed", script=WRITE_HOOK,
             expect=0,
             payload=write_payload("backend/app/time_utils.py",
                                   '"""Replacement for ' + UTCNOW + '."""\n')),
        dict(name="write: utcnow via an Edit new_string", script=WRITE_HOOK, expect=2,
             payload=edit_payload("backend/app/routes.py", "x = " + UTCNOW)),

        dict(name="write: primary_key+index in models.py", script=WRITE_HOOK,
             expect=2,
             payload=write_payload(
                 "backend/app/models.py",
                 "    id = Column(Integer, primary_key=True, index=True)\n")),
        dict(name="write: primary_key alone in models.py", script=WRITE_HOOK,
             expect=0,
             payload=write_payload(
                 "backend/app/models.py",
                 "    id = Column(Integer, primary_key=True)\n")),
        dict(name="write: primary_key+index outside models.py", script=WRITE_HOOK,
             expect=0,
             payload=write_payload(
                 "backend/scripts/scratch.py",
                 "    id = Column(Integer, primary_key=True, index=True)\n")),

        # === F22: a full-line comment is never executable Python ==============
        # The two SEMANTIC checks skip it; the emoji check does NOT, and that
        # last case is the boundary rather than an oversight. CLAUDE.md bans
        # emoji in code AND comments, so a comment is where it should fire.
        dict(name="write F22: a comment naming the deprecated call",
             script=WRITE_HOOK, expect=0,
             payload=write_payload("backend/app/lint_rules.py",
                                   "# never write " + UTCNOW + " here\n")),
        dict(name="write F22: an indented comment naming it", script=WRITE_HOOK,
             expect=0,
             payload=write_payload("backend/app/lint_rules.py",
                                   "    # see " + UTCNOW + " above\n")),
        dict(name="write F22: a TRAILING comment on a code line still blocks",
             script=WRITE_HOOK, expect=2,
             payload=write_payload("backend/app/routes.py",
                                   "created = " + UTCNOW + "  # bad\n")),
        dict(name="write F22: a comment in models.py on the removed flags",
             script=WRITE_HOOK, expect=0,
             payload=write_payload(
                 "backend/app/models.py",
                 "# primary_key=True with index=True went in ada78e5\n")),
        dict(name="write F22: emoji in a comment still blocks, rule names them",
             script=WRITE_HOOK, expect=2,
             payload=write_payload("backend/app/routes.py",
                                   "# ship it " + FIRE + "\n")),
        dict(name="write F22: the test file beside time_utils.py",
             script=WRITE_HOOK, expect=0,
             payload=write_payload(
                 "backend/tests/test_time_utils.py",
                 "def test_absent():\n"
                 "    assert '" + UTCNOW + "' not in SRC\n")),
        dict(name="write F22: an unrelated test file is NOT exempt",
             script=WRITE_HOOK, expect=2,
             payload=write_payload("backend/tests/test_routes.py",
                                   "x = " + UTCNOW + "\n")),

        # === criterion 6: git with a global flag that takes a value ===========
        dict(name="commit F: git -C <dir> commit draws the rules",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("git -C ../plexive-docs commit -m x"),
             stdout_must_contain="conventional commits"),
        dict(name="commit F: git -C <dir> status draws no rules",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("git -C ../plexive-docs status"),
             stdout_must_be_empty=True),

        # === criterion 2: no check fires on a quoted string ==================
        # Every allow case below runs against the EMPTY backup directory, so the
        # gate is in its blocking state and an exit 0 means the check did not
        # fire rather than that the gate happened to be satisfied.
        dict(name="quotes F5: && alembic inside double quotes", script=BASH_HOOK,
             expect=0, payload=bash_payload('echo "first && alembic upgrade"'),
             env=empty_env),
        dict(name="quotes F5: an unquoted alembic still fires the gate",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("echo first && alembic upgrade"),
             env=empty_env),
        dict(name="quotes F5: piped pg_dump inside a --grep argument",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("git log --grep='x | pg_dump backup'"),
             env=empty_env),
        dict(name="quotes F5: an unquoted piped pg_dump still fires",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("git log --oneline | pg_dump -Fc db"),
             env=empty_env),
        dict(name="quotes F7: a commit message mentioning jq", script=BASH_HOOK,
             expect=0,
             payload=bash_payload('git commit -m "add jq support to the docs"'),
             env=empty_env),
        dict(name="quotes F7: jq inside double quotes", script=BASH_HOOK, expect=0,
             payload=bash_payload('echo "install jq first"'), env=empty_env),
        dict(name="quotes F5: plexive-backups named inside single quotes",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo 'do not rm the plexive-backups folder'"),
             env=empty_env),
        dict(name="quotes F5: alembic and git commit in a heredoc body",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "python - <<'EOF'\nalembic upgrade head && git commit -m x\nEOF\n"),
             env=empty_env),
        dict(name="quotes F5: a real alembic beside a heredoc still fires",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "alembic upgrade head\npython - <<'EOF'\nnothing here\nEOF\n"),
             env=empty_env),
        # The fallback, both halves. An unresolvable string becomes ONE segment
        # with nothing masked, so the literal checks still run over every
        # character, but a command word after a separator is no longer found and
        # the gate does not fire. That is the rider being asserted rather than
        # assumed: a mis-parse must not wall a session.
        dict(name="fallback: an unbalanced quote does not wall the session",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo \"unterminated && alembic upgrade"),
             env=empty_env),
        # The literal check used here is the carriage-return one, NOT jq. Since
        # F20 the jq check asks for a command word, so it no longer demonstrates
        # anything about masking; grep -c is now the only content check left and
        # is what these two cases moved onto. The balanced counterpart below is
        # the half that proves the fallback rather than the check: quoted and
        # resolved it is allowed, unresolved it fires.
        dict(name="fallback: an unbalanced quote still runs the literal checks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("echo \"unterminated grep -c \\r"),
             env=empty_env),
        dict(name="fallback: the same string balanced is masked and allowed",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo \"grep -c \\r\""),
             env=empty_env),
        dict(name="fallback: an unbalanced quote still resolves the first word",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("alembic upgrade \"unterminated"),
             env=empty_env),

        # === criterion 3: the commit rules only on a real commit or merge =====
        dict(name="commit F6: no rules when git commit is inside quotes",
             script=BASH_HOOK, expect=0,
             payload=bash_payload('echo "git commit -m x"'),
             stdout_must_be_empty=True),
        dict(name="commit F6: no rules when git commit is in a heredoc body",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "python - <<'PY'\nalembic upgrade head && git commit -m x\nPY\n"),
             stdout_must_be_empty=True),
        dict(name="commit F6: no rules for git log with commit in the grep",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("git log --grep='git commit policy'"),
             stdout_must_be_empty=True),
        dict(name="commit F6: rules still injected beside a quoted mention",
             script=BASH_HOOK, expect=0,
             payload=bash_payload('git commit -m "describe the git merge policy"'),
             stdout_must_contain="conventional commits"),

        # === criterion 4: gh api where pagination is meaningless =============
        dict(name="gh-api F8: -X POST needs no --paginate", script=BASH_HOOK,
             expect=0,
             payload=bash_payload(
                 "gh api -X POST repos/:owner/:repo/issues -f title=x")),
        dict(name="gh-api F8: --method PATCH needs no --paginate", script=BASH_HOOK,
             expect=0,
             payload=bash_payload(
                 "gh api --method PATCH repos/:owner/:repo/issues/1 -f state=open")),
        dict(name="gh-api F8: graphql needs no --paginate", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("gh api graphql -f query='{viewer{login}}'")),
        dict(name="gh-api F8: an explicit -X GET still needs --paginate",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("gh api -X GET repos/:owner/:repo/branches")),

        # === F21: --help issues no request ====================================
        # The two allowed spellings, then the boundary. The blocked pair is the
        # point: the exemption is about the command not being a request at all,
        # NOT about which endpoints paginate. rate_limit and a plain list call
        # both stay blocked, because adding the flag to either is a valid fix.
        dict(name="gh-api F21: --help issues no request", script=BASH_HOOK,
             expect=0, payload=bash_payload("gh api --help")),
        dict(name="gh-api F21: -h is the same flag", script=BASH_HOOK, expect=0,
             payload=bash_payload("gh api -h")),
        dict(name="gh-api F21: a plain list call still needs --paginate",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("gh api repos/:owner/:repo/pulls")),
        dict(name="gh-api F21: rate_limit still needs it, not an endpoint list",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("gh api rate_limit")),

        # === criterion 5: the gate against wrappers a session writes ==========
        dict(name="gate F9: python -m alembic, empty backup dir", script=BASH_HOOK,
             expect=2, payload=bash_payload("python -m alembic upgrade head"),
             env=empty_env),
        dict(name="gate F9: python -m alembic, fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("python -m alembic upgrade head")),
        dict(name="gate F9: bash -c alembic, empty backup dir", script=BASH_HOOK,
             expect=2, payload=bash_payload("bash -c 'alembic upgrade head'"),
             env=empty_env),
        dict(name="gate F9: bash -c alembic, fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("bash -c 'alembic upgrade head'")),
        dict(name="gate F9: sudo psql, empty backup dir", script=BASH_HOOK,
             expect=2, payload=bash_payload("sudo psql -c 'select 1'"),
             env=empty_env),
        dict(name="gate F9: sudo psql, fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("sudo psql -c 'select 1'")),
        dict(name="gate: timeout with a duration, empty backup dir",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("timeout 120 alembic upgrade head"),
             env=empty_env),
        dict(name="gate: timeout with a duration, fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("timeout 8s alembic upgrade head")),
        dict(name="gate: a wrapper in front of an ordinary command", script=BASH_HOOK,
             expect=0, payload=bash_payload("sudo systemctl restart nginx"),
             env=empty_env),

        # === criterion 6: destruction that uses no deletion word ==============
        dict(name="backup F10: find -delete under the backups path",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("find " + backups + " -name '*.txt' -delete")),
        dict(name="backup F10: find -delete elsewhere stays allowed",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("find /tmp/scratch -name '*.txt' -delete")),
        dict(name="backup F10: find -exec rm under the backups path",
             script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "find " + backups + " -name '*.txt' -exec rm {} \\;")),
        dict(name="backup F10: a redirect into the backups path", script=BASH_HOOK,
             expect=2,
             payload=bash_payload("echo x > " + backups + "/manifest.txt")),
        dict(name="backup F10: a redirect elsewhere stays allowed", script=BASH_HOOK,
             expect=0, payload=bash_payload("echo x > /tmp/scratch.txt")),
        dict(name="backup F10: mv a manifest out of the backups path",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("mv " + backups + "/manifest.txt /tmp/gone")),
        dict(name="backup F10: mv INTO the backups path stays allowed",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("mv /tmp/new-manifest.txt " + backups + "/")),

        # === criterion 7: psql reading a file another way =====================
        dict(name="psql F11: --file= without ON_ERROR_STOP", script=BASH_HOOK,
             expect=2, payload=bash_payload("psql --file=dump.sql")),
        dict(name="psql F11: -1f without ON_ERROR_STOP", script=BASH_HOOK,
             expect=2, payload=bash_payload("psql -1f dump.sql")),
        dict(name="psql F11: a < redirect without ON_ERROR_STOP", script=BASH_HOOK,
             expect=2, payload=bash_payload("psql < dump.sql")),
        dict(name="psql F11: --file= with ON_ERROR_STOP", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("psql -v ON_ERROR_STOP=1 --file=dump.sql")),
        dict(name="psql F11: a < redirect with ON_ERROR_STOP", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("psql -v ON_ERROR_STOP=1 < dump.sql")),
        dict(name="psql F11: a heredoc is not a file redirect", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("psql <<'SQL'\nselect 1;\nSQL\n")),
        dict(name="psql F11: -Fc carries no f and stays allowed", script=BASH_HOOK,
             expect=0, payload=bash_payload("psql -c 'select 1'")),

        # === one level of nesting: a nested command is a real command =========
        dict(name="nested F7: bash -c with a bare jq", script=BASH_HOOK, expect=2,
             payload=bash_payload("bash -c 'cat out.json | jq'")),
        dict(name="nested: bash -c with gh --jq stays allowed", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("bash -c 'gh pr list --jq \".[]\"'")),
        dict(name="nested F10: bash -c rm under the backups path", script=BASH_HOOK,
             expect=2,
             payload=bash_payload("bash -c 'rm -f " + backups + "/manifest.txt'")),
        dict(name="nested: bash -c rm of an unrelated file", script=BASH_HOOK,
             expect=0, payload=bash_payload("bash -c 'rm -f /tmp/scratch.json'")),

        # === the ANSI-C quoting exception, and its cost =======================
        # `$'...'` hides its separators but its CONTENTS STAY VISIBLE, which is
        # what keeps `grep -c $'\r'` catchable. The cost is asserted here rather
        # than left to be re-found: a content check CAN still fire on a word
        # inside it. Widening the exception would switch the carriage-return
        # check off, which is worth more than this edge.
        # The residue is now shown with grep -c rather than with jq. The jq
        # check stopped being a content check in F20, so `echo $'install jq
        # first'` is allowed and proves nothing; the COST of the exception is
        # unchanged and is asserted here against the check that still pays it.
        dict(name="ansi-c: a known residue, grep -c inside $'...' blocks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("echo $'grep -c \\r here'")),
        dict(name="ansi-c F20: a jq mention inside $'...' is now allowed",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo $'install jq first'")),
        dict(name="ansi-c: a separator inside $'...' does not split",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo $'first && alembic upgrade'"),
             env=empty_env),

        # === criterion 9: what the hooks do with a payload they cannot read ===
        dict(name="shape F: tool_input is a string", script=BASH_HOOK, expect=0,
             payload='{"tool_input": "hello"}'),
        dict(name="shape F: command is a number", script=BASH_HOOK, expect=0,
             payload='{"tool_input": {"command": 42}}'),
        dict(name="shape F: tool_input is a list", script=BASH_HOOK, expect=0,
             payload='{"tool_input": ["a"]}'),
        dict(name="shape F: top-level JSON is a bare list", script=BASH_HOOK,
             expect=0, payload='["a", "b"]'),
        dict(name="shape F: top-level JSON is a bare string", script=BASH_HOOK,
             expect=0, payload='"hello"'),
        dict(name="shape F: write tool_input is a string", script=WRITE_HOOK,
             expect=0, payload='{"tool_input": "hello"}'),
        dict(name="shape F: write file_path is a number", script=WRITE_HOOK,
             expect=0,
             payload='{"tool_input": {"file_path": 7, "content": "x"}}'),
        dict(name="crash: a raising Bash check blocks and names itself",
             script=fault_bash, expect=2, payload=bash_payload("git status"),
             stderr_must_contain="injected fault"),
        dict(name="crash: a raising write check blocks and names itself",
             script=fault_write, expect=2,
             payload=write_payload("backend/app/routes.py", "x = 1\n"),
             stderr_must_contain="injected fault"),

        # === criterion 10: one JSON document, never two ======================
        # The stub checker exits 3, so the backup warning and the commit rules
        # are both produced by one invocation. Two concatenated documents are
        # not a valid document, and the message at risk is the warning.
        dict(name="context: one JSON document for a warning plus the rules",
             script=stub, expect=0,
             payload=bash_payload("alembic upgrade head && git commit -m x"),
             stdout_one_json=True,
             stdout_must_contain_all=["BACKUP WARNING", "conventional commits"]),

        # === F23: a shell keyword is not a command word ======================
        # command_word read `do` as the command word of `do alembic upgrade
        # head`, so a schema operation inside a loop or a conditional reached
        # the database with the backup gate never running. Measured 2026-08-30
        # at exit 0 against an empty backup directory by the session BEFORE the
        # one that fixed it, and numbered F23 in
        # plexive-docs/research/settings-enforcement-fixes-round-three-2026-08-30.md.
        # The four blocking cases are the four commands that report names.
        dict(name="F23 gate: alembic inside a for loop", script=BASH_HOOK,
             expect=2,
             payload=bash_payload("for f in a b; do alembic upgrade head; done"),
             env=empty_env),
        dict(name="F23 gate: alembic inside an if block", script=BASH_HOOK,
             expect=2,
             payload=bash_payload("if true; then alembic upgrade head; fi"),
             env=empty_env),
        dict(name="F23 psql-f: psql inside a while loop", script=BASH_HOOK,
             expect=2,
             payload=bash_payload('while read f; do psql -f "$f"; done')),
        dict(name="F23 jq: bare jq inside a for loop", script=BASH_HOOK,
             expect=2,
             payload=bash_payload("for f in *.json; do jq . $f; done")),

        # The keyword skip must reach through a wrapper and an assignment, and
        # back: `do sudo alembic` and `do PGPASSWORD=x pg_dump` are the two
        # orders these interleave in.
        dict(name="F23 gate: keyword then wrapper", script=BASH_HOOK, expect=2,
             payload=bash_payload("do sudo alembic upgrade head"),
             env=empty_env),
        dict(name="F23 gate: keyword then assignment", script=BASH_HOOK,
             expect=2,
             payload=bash_payload(
                 "for f in a b; do PGPASSWORD=x pg_dump -Fc db; done"),
             env=empty_env),

        # === F23: a keyword in front of CORRECT work must not block ==========
        # Skipping a keyword makes the word after it a command word, and every
        # one of those is a fresh chance to fire on correct work. These four are
        # the ones the brief names; the boundary cases below are the ones the
        # change itself made suspicious.
        dict(name="F23 clean: for loop over an echo", script=BASH_HOOK, expect=0,
             payload=bash_payload('for f in *.py; do echo "$f"; done')),
        dict(name="F23 clean: if block over an echo", script=BASH_HOOK, expect=0,
             payload=bash_payload("if true; then echo ok; fi")),
        dict(name="F23 clean: for loop over a cat", script=BASH_HOOK, expect=0,
             payload=bash_payload('for f in *.json; do cat "$f"; done')),
        dict(name="F23 clean: a quoted keyword is data, not a keyword",
             script=BASH_HOOK, expect=0,
             payload=bash_payload('echo "do jq"')),
        # base_name() strips a path, so it would read `./do` as the keyword and
        # resolve the word after it. The keyword is compared against the EXACT
        # text for this reason, and this case is what says so.
        # `./do build` would pass with or without the narrowing and would
        # therefore assert nothing. The operand has to be a word some check
        # keys on, so that reading `./do` as the keyword resolves `psql` and
        # blocks. Measured 2026-08-30 in both directions: exit 0 as written,
        # exit 2 with the comparison put back on base_name().
        dict(name="F23 clean: a program whose basename spells a keyword",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("./do psql -f x.sql")),
        dict(name="F23 clean: alembic as an echo argument inside a loop",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("for f in a b; do echo alembic; done"),
             env=empty_env),
        # `for` is a reserved word and is deliberately NOT in KEYWORDS, because
        # the word after it is a variable NAME. This is the case that asserts
        # that decision: add `for` to the set and the loop variable becomes the
        # command word, and the gate refuses an echo. Measured 2026-08-30 at
        # exit 2 with `for` added, exit 0 as shipped.
        dict(name="F23 clean: a loop variable is not a command word",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("for alembic in a b; do echo x; done"),
             env=empty_env),

        # === F24: the token after find's -exec is a command ==================
        # The whole find was one segment whose command word was `find`, so the
        # command it runs was resolved by nothing. Measured 2026-08-30 at exit 0.
        dict(name="F24 psql-f: psql under find -exec", script=BASH_HOOK,
             expect=2,
             payload=bash_payload(
                 "find . -name '*.sql' -exec psql -f {} \\;")),
        dict(name="F24 jq: bare jq under find -exec", script=BASH_HOOK, expect=2,
             payload=bash_payload(
                 "find . -name '*.json' -exec jq '.x' {} \\;")),
        dict(name="F24 clean: ls under find -exec", script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "find . -name '*.md' -exec ls -la {} \\;")),
        # The correct restore form, inside the shape that used to hide it.
        dict(name="F24 clean: psql with ON_ERROR_STOP under find -exec",
             script=BASH_HOOK, expect=0,
             payload=bash_payload(
                 "find . -name '*.sql' -exec psql -v ON_ERROR_STOP=1 -f {} \\;")),
        # The named narrowing: -exec is resolved ONLY under find. Unrestricted,
        # this command would block, and it is correct work.
        dict(name="F24 clean: -exec as an ordinary argument to echo",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("echo -exec jq")),
        # The sub-segment carries no path, so it cannot be what blocks
        # `find <backups> -exec rm {} ;`. That case still blocks through find's
        # own branch, which is the reason it blocked before this change.
        dict(name="F24 clean: the -exec body alone names no backups path",
             script=BASH_HOOK, expect=0,
             payload=bash_payload("rm {}")),
    ]

    # === the harness must feed the bytes a client sends =======================
    # THESE TWO CASES ARE ABOUT THIS FILE, NOT ABOUT A CHECK. Every other emoji
    # case above passes whether the payload carries the emoji as raw UTF-8 or as
    # \uXXXX escapes, because a correct hook blocks both -- which is why they
    # all stayed green from 2026-08-30 to 2026-09-02 while check_emoji could not
    # fire on anything a real client sent. The discriminator is the BROKEN read,
    # not the working one: the pre-2026-09-01 json.load(sys.stdin) blocks the
    # escaped spelling and allows the raw one, so a case expecting it to ALLOW is
    # red for exactly as long as this harness escapes.
    cases.append(dict(
        name="harness bytes: pre-2026-09-01 read is BLIND to a raw emoji",
        script=legacy_write, expect=0,
        payload=write_payload("backend/app/routes.py", "# ship it " + FIRE + "\n"),
        stdout_must_be_empty=True,
        stderr_must_not_contain="found no content field"))
    cases.append(dict(
        name="harness bytes: today's read SEES the same raw emoji",
        script=WRITE_HOOK, expect=2,
        payload=write_payload("backend/app/routes.py", "# ship it " + FIRE + "\n")))

    # === criterion 8: the six added emoji suffixes, both directions ===========
    for suffix, path, clean in ADDED_SUFFIX_FILES:
        cases.append(dict(
            name="write F13: emoji in a ." + suffix, script=WRITE_HOOK, expect=2,
            payload=write_payload(path, clean.rstrip("\n") + "  " + FIRE + "\n")))
        cases.append(dict(
            name="write F13: a clean ." + suffix + " stays allowed",
            script=WRITE_HOOK, expect=0, payload=write_payload(path, clean)))

    # === the Stop rule-behaviour log =========================================
    # THE ORDER OF THE FIRST THREE OF THESE MATTERS and nothing else here has
    # that property: three cases share one log directory on purpose, because
    # "the same transcript again adds nothing" and "a grown transcript adds only
    # what grew" are claims about a SECOND firing and cannot be made by a case
    # that starts from an empty log.
    stop = fx["stop"]
    logs = stop["logs"]

    def stop_log(name):
        return logs / name / "events.jsonl"

    def stop_env(name):
        return {"PLEXIVE_RULE_LOG_DIR": str(logs / name)}

    # --- the payload contract ------------------------------------------------
    # EXIT 1 AND NOT 2, and the case is written as expect=1 for that reason
    # alone. On Stop, exit 2 does not fail the hook: it prevents Claude from
    # stopping and continues the conversation. A logging hook that crashed into
    # exit 2 would steer the session it exists to watch.
    cases.append(dict(
        name="stop: no transcript_path is exit 1, never 2",
        script=STOP_HOOK, expect=1,
        payload={"session_id": "nopath-1", "cwd": str(REPO_ROOT),
                 "hook_event_name": "Stop", "stop_hook_active": False},
        env=stop_env("nopath"),
        stderr_must_contain="carried no transcript_path",
        log=stop_log("nopath"), log_kinds={"error": 1}))
    cases.append(dict(
        name="stop: an unreadable payload says so and exits 1",
        script=STOP_HOOK, expect=1, payload="{not json at all",
        env=stop_env("badjson"),
        stderr_must_contain="could not read its stdin as JSON"))
    cases.append(dict(
        name="stop: a missing transcript writes an error record first",
        script=STOP_HOOK, expect=1,
        payload=stop_payload(stop["missing"], "missing-1"),
        env=stop_env("missing"),
        stderr_must_contain="could not read the transcript",
        log=stop_log("missing"), log_kinds={"error": 1},
        log_must_contain_all=['"half": "machine"']))

    # --- the three shapes, then two more firings on the same log -------------
    cases.append(dict(
        name="stop: three shapes, three refusals, one session record",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["three"], "three-1"),
        env=stop_env("three"), stdout_must_contain="refusals=3",
        log=stop_log("three"),
        log_kinds={"session": 1, "refusal": 3}, log_halves={"machine": 4},
        log_must_contain_all=[
            '"shape": "deny-rule-path"', '"shape": "denied-call"',
            '"shape": "hook-block"', '"claude_code_version": "2.1.251"',
            '"git_branch": "main"', '"orphan_tool_use_count": 0',
            '"tool_use_count": 6', '"tool_result_count": 6'],
        log_must_not_contain=['"lookahead_complete": false']))
    cases.append(dict(
        name="stop: the same transcript again adds nothing",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["three"], "three-1"),
        env=stop_env("three"), stdout_must_contain="refusals=0",
        log=stop_log("three"), log_kinds={"session": 1, "refusal": 3}))
    cases.append(dict(
        name="stop: a grown transcript adds only what grew",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["three"], "three-1"),
        env=stop_env("three"), append_before=[(stop["three"], stop["growth"])],
        stdout_must_contain="refusals=1",
        log=stop_log("three"), log_kinds={"session": 1, "refusal": 4},
        log_must_contain_all=['"Read(**/.env.local)"']))

    # --- the allow direction -------------------------------------------------
    # `is_error` ALONE IS THE VACUOUS DEFINITION. 280 of the 372 error results
    # across the corpus are ordinary failures, so a detector keyed on it would
    # return a number 50 times too large and look like an answer.
    cases.append(dict(
        name="stop: ordinary failures are not rule refusals",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["ordinary"], "ordinary-1"),
        env=stop_env("ordinary"), stdout_must_contain="refusals=0",
        log=stop_log("ordinary"), log_kinds={"session": 1, "refusal": 0}))

    # --- the toolDenialKind pair, which is the point of the whole detector ---
    cases.append(dict(
        name="stop denial-kind: the TEXT detector finds the Read form",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["readonly"], "readtext-1"),
        env=stop_env("readtext"), stdout_must_contain="refusals=1",
        log=stop_log("readtext"), log_kinds={"refusal": 1},
        log_must_contain_all=['"tool_denial_kind": null',
                              '"shape": "deny-rule-path"']))
    cases.append(dict(
        name="stop denial-kind: the FIELD-keyed copy misses the same one",
        script=stop["field_keyed"], expect=0,
        payload=stop_payload(stop["readonly"], "readfield-1"),
        env=stop_env("readfield"), stdout_must_contain="refusals=0",
        log=stop_log("readfield"), log_kinds={"refusal": 0}))

    # --- the reconstruction, and why it is a list ----------------------------
    cases.append(dict(
        name="stop: force-with-lease records BOTH matching deny rules",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["three"], "force-1"),
        env=stop_env("force"),
        log=stop_log("force"),
        log_must_contain_all=[
            '"reconstructed_deny_candidates": ["Bash(git push --force*)", '
            '"Bash(git push --force-with-lease*)"]',
            '"reconstructed_deny_candidates": ["Read(**/.env)"]']))

    # --- the one traceable shape keeps the only thing that makes it so -------
    cases.append(dict(
        name="stop: a hook block keeps the hook's own message",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["three"], "hookmsg-1"),
        env=stop_env("hookmsg"), log=stop_log("hookmsg"),
        log_must_contain_all=["pretooluse_bash.py", "BLOCKED"]))

    # --- the lookahead, both directions --------------------------------------
    cases.append(dict(
        name="stop: a refusal at the end is marked lookahead-incomplete",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["tail"], "tail-1"),
        env=stop_env("tail"), log=stop_log("tail"), log_kinds={"refusal": 1},
        log_must_contain_all=['"lookahead_complete": false',
                              '"next_tool_calls": []']))

    # --- the orphan count ----------------------------------------------------
    cases.append(dict(
        name="stop: a call with no result counts as an orphan",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["orphan"], "orphan-1"),
        env=stop_env("orphan"), log=stop_log("orphan"),
        log_must_contain_all=['"orphan_tool_use_count": 1']))

    # --- the fourth shape, which is not this repository's rule ---------------
    # THIS CASE PASSES AND IT IS NOT A CLEAN BILL OF HEALTH, in the shape cw-12b
    # already uses. It stores a refusal the detector deliberately does not count,
    # so the decision lives in something that runs: the day somebody adds a
    # fourth shape, this flips to a failure and says which record moved.
    cases.append(dict(
        name="stop: built-in path protection is not a Plexive rule",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["builtin"], "builtin-1"),
        env=stop_env("builtin"), stdout_must_contain="refusals=0",
        log=stop_log("builtin"), log_kinds={"session": 1, "refusal": 0}))

    # --- the session half, both directions -----------------------------------
    # NOTHING IN THIS REPOSITORY TELLS A SESSION TO WRITE ONE OF THESE. The
    # lifter is covered anyway, so the day that instruction is written the
    # machinery under it is already known to work.
    cases.append(dict(
        name="stop: a RULE-NOTE line lands in the session half",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["clean"], "note-1",
                             "Done." + chr(10) +
                             "RULE-NOTE: R2 fired on a correct file."),
        env=stop_env("note"), stdout_must_contain="notes=1",
        log=stop_log("note"), log_kinds={"session": 1, "note": 1},
        log_halves={"machine": 1, "session": 1},
        log_must_contain_all=['"half": "session"']))
    cases.append(dict(
        name="stop: an ordinary last message writes no note",
        script=STOP_HOOK, expect=0,
        payload=stop_payload(stop["clean"], "nonote-1",
                             "All three checks are green."),
        env=stop_env("nonote"), stdout_must_contain="notes=0",
        log=stop_log("nonote"), log_kinds={"note": 0},
        log_must_not_contain=['"half": "session"']))

    return cases


def make_fixtures(tmp):
    """Every fixture, all of them COPIES in temporary trees.

    The real .claude/skills/commit/SKILL.md is never moved, the real
    check_backup_age.sh is never replaced, and the real backup directory is
    never read.

    Five trees:
      orphan      a copy of the Bash hook with no .claude/skills/commit/SKILL.md,
                  the fails-open case exercises the real resolution path.
      stub        a copy of the Bash hook whose tools/check_backup_age.sh exits
                  3, so the exit-3 warning and the commit rules are produced by
                  one invocation and the single-document rule can be asserted.
      fault-bash  a copy of the Bash hook with a raising check appended to its
                  registry.
      fault-write the same for the write hook.
      legacy-stdin a copy of the write hook reading stdin the pre-2026-09-01
                  way, which is how this file proves it feeds bytes.
    """
    fresh = tmp / "backups-fresh"
    fresh.mkdir()
    manifest = fresh / "plexive-2026-08-30-manifest.txt"
    manifest.write_text("harness fixture, not a real manifest\n", encoding="utf-8")
    now = time.time()
    os.utime(manifest, (now, now))

    empty = tmp / "backups-empty"
    empty.mkdir()

    orphan_root = tmp / "orphan-tree"
    (orphan_root / ".claude" / "hooks").mkdir(parents=True)
    orphan = orphan_root / ".claude" / "hooks" / "pretooluse_bash.py"
    shutil.copyfile(BASH_HOOK, orphan)

    stub_root = tmp / "stub-tree"
    (stub_root / ".claude" / "hooks").mkdir(parents=True)
    (stub_root / ".claude" / "skills").mkdir(parents=True)
    (stub_root / "tools").mkdir(parents=True)
    stub = stub_root / ".claude" / "hooks" / "pretooluse_bash.py"
    shutil.copyfile(BASH_HOOK, stub)
    (stub_root / ".claude" / "skills" / "commit").mkdir(parents=True)
    shutil.copyfile(REPO_ROOT / ".claude" / "skills" / "commit" / "SKILL.md",
                    stub_root / ".claude" / "skills" / "commit" / "SKILL.md")
    checker = stub_root / "tools" / "check_backup_age.sh"
    checker.write_text(
        "#!/usr/bin/env bash\n"
        "echo 'STUB CHECKER: a current backup that has not reached OneDrive'\n"
        "exit 3\n",
        encoding="utf-8",
    )

    fault_bash = write_faulted(BASH_HOOK, tmp / "fault-bash-tree", "pretooluse_bash.py")
    fault_write = write_faulted(WRITE_HOOK, tmp / "fault-write-tree",
                                "pretooluse_write.py")
    legacy_write = write_legacy_stdin(WRITE_HOOK, tmp / "legacy-stdin-tree",
                                      "pretooluse_write.py")

    # --- the Stop rule-behaviour log ----------------------------------------
    # TRANSCRIPTS, NOT TREES. Each is a real .jsonl written into the temp tree,
    # and every case that reads one also points PLEXIVE_RULE_LOG_DIR at the temp
    # tree, so the real .claude/rule-log/ is never read and never written -- the
    # same rule this file already applies to the backup directory.
    stop_root = tmp / "stop-trees"
    env_path = str(REPO_ROOT / "backend" / ".env")
    hook_block = (
        'PreToolUse:Bash hook error: [python '
        '"$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse_bash.py"]: '
        "BLOCKED: a check this fixture invented, so the message is traceable."
    )

    # SIX CALLS, so all three refusals have three following calls and the
    # lookahead completes. The incomplete direction is stop_tail below.
    stop_three = write_transcript(stop_root / "three-shapes.jsonl", [
        call("toolu_S1", "Read", {"file_path": env_path}),
        result("toolu_S1", "<tool_use_error>File is in a directory that is "
                           "denied by your permission settings.</tool_use_error>"),
        call("toolu_S2", "Bash", {"command": "git push --force-with-lease origin main"}),
        result("toolu_S2", "Permission to use Bash with command git push "
                           "--force-with-lease origin main has been denied.",
               denial_kind="permission-rule"),
        call("toolu_S3", "Bash", {"command": "ls tools/"}),
        result("toolu_S3", hook_block, denial_kind="permission-rule"),
        call("toolu_S4", "Bash", {"command": "ls -la backend/"}),
        result("toolu_S4", "total 40", is_error=False),
        call("toolu_S5", "Read", {"file_path": "README.md"}),
        result("toolu_S5", "# Plexive", is_error=False),
        call("toolu_S6", "Bash", {"command": "git status --porcelain"}),
        result("toolu_S6", "", is_error=False),
    ])
    # Appended between two firings by the append_before key, to prove the read is
    # incremental rather than a re-parse the dedup happens to clean up after.
    stop_growth = transcript_text([
        call("toolu_S7", "Read",
             {"file_path": str(REPO_ROOT / "frontend" / ".env.local")}),
        result("toolu_S7", "<tool_use_error>File is in a directory that is "
                           "denied by your permission settings.</tool_use_error>"),
    ])

    # THE ALLOW DIRECTION, and the shapes are real. Sampled 2026-09-02 from the
    # 280 error results across the corpus that carry no denial kind: a command
    # that ran and exited non-zero, a Read of a file that is not there, and a
    # user declining a prompt, which is a refusal BY A PERSON and belongs
    # outside a log about rules.
    stop_ordinary = write_transcript(stop_root / "ordinary.jsonl", [
        call("toolu_O1", "Bash", {"command": "npm run build"}),
        result("toolu_O1", "Exit code 1" + chr(10) + "error TS2345: not assignable"),
        call("toolu_O2", "Read", {"file_path": "backend/nope.py"}),
        result("toolu_O2", "<tool_use_error>File does not exist.</tool_use_error>"),
        call("toolu_O3", "Write", {"file_path": "backend/app/x.py", "content": "x"}),
        result("toolu_O3", "<tool_use_error>File has not been read yet. "
                           "Read it first before writing to it.</tool_use_error>"),
        call("toolu_O4", "Bash", {"command": "git status"}),
        result("toolu_O4", "The user doesn't want to proceed with this tool use. "
                           "The tool use was rejected.", denial_kind="user-rejected"),
        call("toolu_O5", "Bash", {"command": "ls"}),
        result("toolu_O5", "README.md", is_error=False),
    ])

    # ONE Read-form refusal and nothing else. This is the transcript the
    # field-keyed counter-example must MISS and the text detector must find.
    stop_readonly = write_transcript(stop_root / "read-form.jsonl", [
        call("toolu_R1", "Read", {"file_path": env_path}),
        result("toolu_R1", "<tool_use_error>File is in a directory that is "
                           "denied by your permission settings.</tool_use_error>"),
        call("toolu_R2", "Bash", {"command": "ls -la backend/"}),
        result("toolu_R2", "total 40", is_error=False),
    ])

    # A refusal as the LAST record, so the lookahead cannot complete.
    stop_tail = write_transcript(stop_root / "tail.jsonl", [
        call("toolu_T1", "Bash", {"command": "ls"}),
        result("toolu_T1", "README.md", is_error=False),
        call("toolu_T2", "Read", {"file_path": env_path}),
        result("toolu_T2", "<tool_use_error>File is in a directory that is "
                           "denied by your permission settings.</tool_use_error>"),
    ])

    # A call with no result at all, which is the only shape that would let a
    # refusal go unseen. Nothing here produces it; the count exists so the day
    # something does, the number moves.
    stop_orphan = write_transcript(stop_root / "orphan.jsonl", [
        call("toolu_P1", "Bash", {"command": "ls"}),
        result("toolu_P1", "README.md", is_error=False),
        call("toolu_P2", "Bash", {"command": "sleep 600"}),
    ])

    # THE FOURTH SHAPE, verbatim from the single record carrying it in the 167
    # transcripts scanned 2026-09-02. Claude Code's own built-in path protection,
    # labelled permission-rule like a hook block and by the same defect. Not a
    # rule this repository wrote, so it is not counted, and this fixture is what
    # makes that a decision somebody can see flip rather than an absence.
    stop_builtin = write_transcript(stop_root / "built-in-protection.jsonl", [
        call("toolu_B1", "PowerShell", {"command": "Remove-Item -Recurse /E"}),
        result("toolu_B1", "Remove-Item on system path '/E' is blocked. This "
                           "path is protected from removal.",
               denial_kind="permission-rule"),
    ])

    stop_clean = write_transcript(stop_root / "clean.jsonl", [
        call("toolu_C1", "Bash", {"command": "git status --porcelain"}),
        result("toolu_C1", "", is_error=False),
    ])

    stop_field_keyed = write_field_keyed(
        STOP_HOOK, tmp / "field-keyed-tree", "stop_rule_log.py")

    stop = dict(
        three=stop_three, growth=stop_growth, ordinary=stop_ordinary,
        readonly=stop_readonly, tail=stop_tail, orphan=stop_orphan,
        clean=stop_clean, builtin=stop_builtin,
        missing=stop_root / "there-is-no-such-transcript.jsonl",
        field_keyed=stop_field_keyed, logs=tmp / "stop-logs",
    )

    return dict(fresh=fresh, empty=empty, orphan=orphan, stub=stub,
                fault_bash=fault_bash, fault_write=fault_write,
                legacy_write=legacy_write, stop=stop)


def write_legacy_stdin(source, root, name):
    """A copy of the write hook with the PRE-2026-09-01 stdin read restored.

    This fixture exists to make the harness prove that it feeds bytes. Fed the
    `\\uXXXX` escapes this file sent until 2026-09-02, the broken read decodes
    them perfectly and blocks, so escaped and raw payloads are indistinguishable
    from the outside -- which is exactly why 160 cases passed for two days
    against a check that could not fire. Fed the raw UTF-8 bytes a client sends,
    it allows. The case pointed at this copy expects exit 0 and is therefore RED
    for as long as the harness escapes anything.

    THE SPLICE IS ASSERTED, as in write_faulted: if the hook stops carrying the
    line, this raises rather than handing back a fixed hook wearing the legacy
    name.
    """
    text = source.read_text(encoding="utf-8")
    if text.count(LEGACY_STDIN_NEW) != 1:
        raise RuntimeError(
            "the legacy-stdin fixture could not find exactly one %r in %s "
            "(found %d). The copy would be an ordinary hook, and the case "
            "expecting exit 0 would be asserting nothing about the harness."
            % (LEGACY_STDIN_NEW, source.name, text.count(LEGACY_STDIN_NEW))
        )
    (root / ".claude" / "hooks").mkdir(parents=True)
    target = root / ".claude" / "hooks" / name
    target.write_text(text.replace(LEGACY_STDIN_NEW, LEGACY_STDIN_OLD),
                      encoding="utf-8")
    return target


def write_faulted(source, root, name):
    """A copy of a hook with a check that raises appended to its registry.

    THE SPLICE IS ASSERTED. If the sentinel ever stops appearing in a hook the
    copy would silently be an ordinary hook, the case expecting exit 2 would
    expect it forever, and nothing would say why. That is the shape this
    repository keeps recording, so it raises here instead.
    """
    text = source.read_text(encoding="utf-8")
    if text.count(SENTINEL) != 1:
        raise RuntimeError(
            "fault injection could not find exactly one %r in %s (found %d). "
            "The fixture cannot be built, so the crash cases would silently "
            "test nothing." % (SENTINEL, source.name, text.count(SENTINEL))
        )
    (root / ".claude" / "hooks").mkdir(parents=True)
    target = root / ".claude" / "hooks" / name
    target.write_text(text.replace(SENTINEL, FAULT + SENTINEL), encoding="utf-8")
    return target


def write_field_keyed(source, root, name):
    """A copy of the Stop hook that decides the shape from `toolDenialKind`.

    A COUNTER-EXAMPLE, not an alternative. See SHAPE_CALL_OLD above for why that
    field cannot carry the decision.

    BOTH SPLICES ARE ASSERTED. A splice that quietly found nothing would hand
    back an ordinary hook wearing the counter-example's name, the case expecting
    it to MISS the Read-form refusal would go green for the wrong reason, and the
    thing actually at risk -- somebody replacing the text detector with the
    field -- would be undetectable again.
    """
    text = source.read_text(encoding="utf-8")
    for needle in (SHAPE_CALL_OLD, SENTINEL):
        if text.count(needle) != 1:
            raise RuntimeError(
                "the field-keyed fixture could not find exactly one %r in %s "
                "(found %d). The copy would be an ordinary hook."
                % (needle, source.name, text.count(needle))
            )
    (root / ".claude" / "hooks").mkdir(parents=True)
    target = root / ".claude" / "hooks" / name
    target.write_text(
        text.replace(SHAPE_CALL_OLD, SHAPE_CALL_NEW)
            .replace(SENTINEL, FIELD_KEYED + SENTINEL),
        encoding="utf-8",
    )
    return target


def judge(case, code, out, err):
    """(ok, note) for one case. The exit code is checked before anything else."""
    if code != case["expect"]:
        return False, ""

    want = case.get("stdout_must_contain")
    if want and want not in out:
        return False, "stdout missing " + repr(want)

    for want_all in case.get("stdout_must_contain_all") or []:
        if want_all not in out:
            return False, "stdout missing " + repr(want_all)

    if case.get("stdout_must_be_empty") and out.strip():
        return False, "stdout should have been empty"

    want_err = case.get("stderr_must_contain")
    if want_err and want_err not in err:
        return False, "stderr missing " + repr(want_err)

    # An ALLOW can be reached by inspecting clean content or by inspecting
    # nothing at all, and the exit code cannot tell those apart. This is how a
    # case says which of the two it means.
    nope_err = case.get("stderr_must_not_contain")
    if nope_err and nope_err in err:
        return False, "stderr should not contain " + repr(nope_err)

    if case.get("stdout_one_json"):
        try:
            json.loads(out)
        except Exception as exc:  # noqa: BLE001
            return False, "stdout is not one JSON document (" + str(exc) + ")"

    log = case.get("log")
    if log is not None:
        try:
            body = open(str(log), encoding="utf-8").read()
        except Exception as exc:  # noqa: BLE001
            return False, "the log at %s could not be read (%s)" % (log, exc)
        records = []
        for line in body.splitlines():
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except Exception as exc:  # noqa: BLE001
                return False, "a log line is not JSON (%s)" % exc

        for kind, want in (case.get("log_kinds") or {}).items():
            got = len([r for r in records if r.get("kind") == kind])
            if got != want:
                return False, "%d records of kind %r, wanted %d" % (got, kind, want)

        for half, want in (case.get("log_halves") or {}).items():
            got = len([r for r in records if r.get("half") == half])
            if got != want:
                return False, "%d records with half %r, wanted %d" % (got, half, want)

        for needle in case.get("log_must_contain_all") or []:
            if needle not in body:
                return False, "the log is missing " + repr(needle)

        for needle in case.get("log_must_not_contain") or []:
            if needle in body:
                return False, "the log should not contain " + repr(needle)

    return True, ""


def main():
    tmp = Path(tempfile.mkdtemp(prefix="plexive-hook-cases-"))
    try:
        fx = make_fixtures(tmp)
        cases = build_cases(fx)

        print("PLEXIVE_BACKUP_DIR default for all cases: " + str(fx["fresh"]))
        print("the real backup directory is not read by any case")
        print()
        header = "%-56s %8s %8s  %s" % ("case", "expect", "actual", "ok")
        print(header)
        print("-" * len(header))

        matched = 0
        shown = []
        for case in cases:
            env = dict(os.environ)
            env["PLEXIVE_BACKUP_DIR"] = str(fx["fresh"])
            env.update(case.get("env") or {})

            # A case that needs the transcript to GROW between two firings
            # says so here. Only the incremental-read case uses it, and it is a
            # real append to a real file rather than a second fixture, because a
            # second fixture at a second path would not exercise the offset.
            for target, addition in case.get("append_before") or []:
                with open(str(target), "a", encoding="utf-8",
                          newline="") as handle:
                    handle.write(addition)

            code, out, err = run(case["script"], case["payload"], env)
            ok, note = judge(case, code, out, err)

            if ok:
                matched += 1
            print("%-56s %8d %8d  %s%s" % (
                case["name"], case["expect"], code,
                "yes" if ok else "NO",
                "   <-- " + note if note else "",
            ))
            if not ok:
                detail = (err or out).strip().splitlines()
                for line in detail[:4]:
                    print("        | " + line)
            if case.get("show_stdout"):
                shown.append((case["name"], out))

        for name, out in shown:
            print()
            print("injected text produced by case " + repr(name) + ":")
            try:
                context = json.loads(out)["hookSpecificOutput"]["additionalContext"]
            except Exception:  # noqa: BLE001
                context = out.rstrip()
            for line in context.splitlines():
                print("    " + line)

        total = len(cases)
        print()
        print("%d cases, %d matched" % (total, matched))
        return 0 if matched == total else 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
