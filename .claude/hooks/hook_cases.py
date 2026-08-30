#!/usr/bin/env python3
"""Both-directions harness for the two PreToolUse hooks.

Every check gets at least one payload that must be blocked (exit 2) and at least
one that must be allowed (exit 0). The allowed payload is a real correct command
or file, never a blank one: a check that passes an empty string has proved
nothing about the check.

Ends with `N cases, M matched` and exits non-zero when M is below N, because a
harness whose failure looks like its success is the failure this repository keeps
recording.

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
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        cwd=str(REPO_ROOT),
    )
    return proc.returncode, proc.stdout, proc.stderr


def build_cases(fresh_dir, empty_dir, orphan_hook):
    """Every case. `expect` is the exit code the hook must produce."""
    return [
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
             payload=bash_payload("rm -rf " + str(fresh_dir) + "/old"),
             env={"PLEXIVE_BACKUP_DIR": str(fresh_dir)}),
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
             env={"PLEXIVE_BACKUP_DIR": str(empty_dir)}),
        dict(name="gate: alembic against a fresh manifest", script=BASH_HOOK,
             expect=0, payload=bash_payload("alembic upgrade head"),
             env={"PLEXIVE_BACKUP_DIR": str(fresh_dir)}),
        dict(name="gate: pg_dump after an env assignment", script=BASH_HOOK,
             expect=2, payload=bash_payload("PGPASSWORD=x pg_dump -Fc db"),
             env={"PLEXIVE_BACKUP_DIR": str(empty_dir)}),
        dict(name="gate: alembic as a directory argument", script=BASH_HOOK,
             expect=0,
             payload=bash_payload("find app scripts tests alembic -name '*.py'"),
             env={"PLEXIVE_BACKUP_DIR": str(empty_dir)}),

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
        dict(name="commit: fails OPEN when commit.md is absent", script=orphan_hook,
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
    ]


def make_fixtures(tmp):
    """A fresh-manifest directory, an empty one, and a hook with no commit.md.

    The orphan hook is a COPY of the real script in a tree that holds no
    .claude/skills/commit.md, so the missing-file case exercises the real
    resolution path. No override variable exists and none is added, and the real
    commit.md is never moved or deleted.
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

    return fresh, empty, orphan


def main():
    tmp = Path(tempfile.mkdtemp(prefix="plexive-hook-cases-"))
    try:
        fresh, empty, orphan = make_fixtures(tmp)
        cases = build_cases(fresh, empty, orphan)

        print("PLEXIVE_BACKUP_DIR default for all cases: " + str(fresh))
        print("the real backup directory is not read by any case")
        print()
        header = "%-52s %8s %8s  %s" % ("case", "expect", "actual", "ok")
        print(header)
        print("-" * len(header))

        matched = 0
        shown = []
        for case in cases:
            env = dict(os.environ)
            env["PLEXIVE_BACKUP_DIR"] = str(fresh)
            env.update(case.get("env") or {})

            code, out, err = run(case["script"], case["payload"], env)

            ok = code == case["expect"]
            note = ""
            want = case.get("stdout_must_contain")
            if ok and want and want not in out:
                ok = False
                note = "stdout missing " + repr(want)
            if ok and case.get("stdout_must_be_empty") and out.strip():
                ok = False
                note = "stdout should have been empty"

            if ok:
                matched += 1
            print("%-52s %8d %8d  %s%s" % (
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
