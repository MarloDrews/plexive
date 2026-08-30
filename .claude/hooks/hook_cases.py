#!/usr/bin/env python3
"""Both-directions harness for the two PreToolUse hooks.

Every check gets at least one payload that must be blocked (exit 2) and at least
one that must be allowed (exit 0). The allowed payload is a real correct command
or file, never a blank one: a check that passes an empty string has proved
nothing about the check.

Ends with `N cases, M matched` and exits non-zero when M is below N, because a
harness whose failure looks like its success is the failure this repository keeps
recording.

CASE NAMES CARRY THE FINDING THEY CLOSE. `F5`, `F7`, `F8`, `F9`, `F10`, `F11`
and `F13` are the numbered findings in
plexive-docs/research/settings-enforcement-verification-2026-08-30.md, so a case
that later goes red says which measured defect has come back.

TWO LITERALS ARE BUILT BY CONCATENATION ON PURPOSE, the emoji and the deprecated
utcnow call. Spelled out, they would make this file trip the very checks it
exists to exercise, and the harness would become uneditable under its own gate.

THE REAL BACKUP DIRECTORY IS NEVER TOUCHED, in any direction, for any reason.
Every case runs with PLEXIVE_BACKUP_DIR pointed at a temporary directory this
script creates and removes.
"""

import json
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

# Built rather than written. See the module docstring.
FIRE = chr(0x1F525)
UTCNOW = "datetime." + "utcnow()"
CHECK_GLYPH = chr(0x2713)  # U+2713, outside the emoji range on purpose

# The splice point used to build a hook whose check raises. It is asserted on in
# make_fixtures, so a hook that stops carrying it fails loudly instead of
# quietly producing a case that can never block.
SENTINEL = 'if __name__ == "__main__":'

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


def run(script, payload, env):
    proc = subprocess.run(
        [sys.executable, str(script)],
        input=payload if isinstance(payload, str) else json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        cwd=str(REPO_ROOT),
    )
    return proc.returncode, proc.stdout, proc.stderr


def build_cases(fx):
    """Every case. `expect` is the exit code the hook must produce."""
    fresh = fx["fresh"]
    empty = fx["empty"]
    orphan = fx["orphan"]
    stub = fx["stub"]
    fault_bash = fx["fault_bash"]
    fault_write = fx["fault_write"]

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
        dict(name="commit: rules injected from commit.md", script=BASH_HOOK,
             expect=0, payload=bash_payload('git commit -m "x"'),
             stdout_must_contain="conventional commits", show_stdout=True),
        dict(name="commit: merge gets the rules too", script=BASH_HOOK, expect=0,
             payload=bash_payload("git merge --no-ff chore/x"),
             stdout_must_contain="conventional commits"),
        dict(name="commit: fails OPEN when commit.md is absent", script=orphan,
             expect=0, payload=bash_payload('git commit -m "x"'),
             stdout_must_be_empty=True),

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
        dict(name="fallback: an unbalanced quote still runs the literal checks",
             script=BASH_HOOK, expect=2,
             payload=bash_payload("echo \"unterminated jq"),
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
        dict(name="ansi-c: a known residue, jq inside $'...' still blocks",
             script=BASH_HOOK, expect=2,
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
    ]

    # === criterion 8: the six added emoji suffixes, both directions ===========
    for suffix, path, clean in ADDED_SUFFIX_FILES:
        cases.append(dict(
            name="write F13: emoji in a ." + suffix, script=WRITE_HOOK, expect=2,
            payload=write_payload(path, clean.rstrip("\n") + "  " + FIRE + "\n")))
        cases.append(dict(
            name="write F13: a clean ." + suffix + " stays allowed",
            script=WRITE_HOOK, expect=0, payload=write_payload(path, clean)))

    return cases


def make_fixtures(tmp):
    """Every fixture, all of them COPIES in temporary trees.

    The real commit.md is never moved, the real check_backup_age.sh is never
    replaced, and the real backup directory is never read.

    Four trees:
      orphan      a copy of the Bash hook with no .claude/skills/commit.md, so
                  the fails-open case exercises the real resolution path.
      stub        a copy of the Bash hook whose tools/check_backup_age.sh exits
                  3, so the exit-3 warning and the commit rules are produced by
                  one invocation and the single-document rule can be asserted.
      fault-bash  a copy of the Bash hook with a raising check appended to its
                  registry.
      fault-write the same for the write hook.
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
    shutil.copyfile(REPO_ROOT / ".claude" / "skills" / "commit.md",
                    stub_root / ".claude" / "skills" / "commit.md")
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

    return dict(fresh=fresh, empty=empty, orphan=orphan, stub=stub,
                fault_bash=fault_bash, fault_write=fault_write)


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

    if case.get("stdout_one_json"):
        try:
            json.loads(out)
        except Exception as exc:  # noqa: BLE001
            return False, "stdout is not one JSON document (" + str(exc) + ")"

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
