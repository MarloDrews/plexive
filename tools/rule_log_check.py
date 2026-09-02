#!/usr/bin/env python3
"""Answers one question: IS THE RULE LOG STILL BEING WRITTEN.

Names every session in the Claude Code project transcript directory, since a
date given on the command line, that has NO `session` record in
`.claude/rule-log/events.jsonl`.

WHY THIS EXISTS AND NOT JUST THE HOOK. A Stop hook that exits 0 having written
nothing is invisible by design, in both directions: on Stop, stdout goes to the
debug log and stderr from an exit-0 hook is never shown. That is what a log
wants, and it is also what lets the hook stop working without anybody noticing.
A log that has silently stopped writing looks exactly like a log with nothing to
write. `tools/check_backup_age.sh` was written against the same failure shape for
the same reason, and this file follows it: the check on the OUTPUT is the part
that matters more than the thing producing it.

A MISSING SESSION IS NOT AUTOMATICALLY A DEFECT, and this file does not pretend
otherwise. It reports; it does not diagnose. Sessions predating the hook have no
record and never will, which is what the date argument is for. A session killed
before it stopped, and a subagent transcript, are two more shapes that leave no
record legitimately. What the number is good for is MOVEMENT: a date after the
hook landed should report zero, and the day it stops reporting zero something
changed.

Usage:
    python tools/rule_log_check.py 2026-09-02
    python tools/rule_log_check.py 2026-09-02 --log /path/to/events.jsonl
    python tools/rule_log_check.py 2026-09-02 --transcripts /path/to/project/dir

Exit codes, one per situation, because a shared code is a code nobody can act on:
    0  every session since that date has a record
    1  one or more sessions have NO record, each named
    2  COULD NOT LOOK: the log is missing or unreadable, the transcript
       directory is missing, or the date does not parse

CODE 2 IS THE POINT OF THE FILE AS MUCH AS CODE 1. A checker that answers
"0 sessions missing" for a log path that does not exist reports the same clean
number whether everything is fine or nothing is there, and that is the exact
shape this repository keeps recording. So an input it cannot read is refused on
its own code and never counted as zero.

Sessions are dated by the transcript file's mtime. The file NAME is a uuid and
carries no date, and the records inside carry timestamps but reading 165 files to
sort them would be a different tool. Metadata only, as with the backup check.
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

# How Claude Code names a project's transcript directory: the absolute path with
# every separator and the drive colon replaced by a hyphen. Derived rather than
# hardcoded so this file works from a clone at another path, and overridable with
# --transcripts for the case where the derivation is wrong.
PROJECTS = Path.home() / ".claude" / "projects"


def project_dir(cwd):
    slug = str(Path(cwd).resolve())
    for char in (":", "\\", "/"):
        slug = slug.replace(char, "-")
    return PROJECTS / slug


def parse_args(argv):
    parser = argparse.ArgumentParser(add_help=True, description=__doc__.splitlines()[0])
    parser.add_argument("since", help="ISO date, YYYY-MM-DD. Sessions older than this are not looked at.")
    parser.add_argument("--log", default=".claude/rule-log/events.jsonl",
                        help="the JSON Lines log the Stop hook writes")
    parser.add_argument("--transcripts", default=None,
                        help="the Claude Code project transcript directory")
    return parser.parse_args(argv)


def fail_to_look(reason, remedy):
    print("CANNOT LOOK")
    print("===========")
    print(reason)
    print("")
    print("This is NOT a report that every session has a record. Nothing was")
    print("compared. A checker that answered zero here would be the defect it")
    print("exists to catch.")
    print("")
    print("Do this now: " + remedy)
    return 2


def main(argv):
    args = parse_args(argv)

    try:
        since = datetime.date.fromisoformat(args.since)
    except ValueError as exc:
        return fail_to_look(
            "the date " + repr(args.since) + " does not parse (" + str(exc) + ").",
            "pass an ISO date, for example 2026-09-02.")

    transcripts = Path(args.transcripts) if args.transcripts else project_dir(os.getcwd())
    if not transcripts.is_dir():
        return fail_to_look(
            "the transcript directory " + str(transcripts) + " is not there.",
            "check the path, or pass --transcripts explicitly.")

    log = Path(args.log)
    if not log.is_file():
        return fail_to_look(
            "the log " + str(log) + " is not there.",
            "run a session with the Stop hook wired, or pass --log.")

    recorded = set()
    kinds = {}
    lines = 0
    try:
        with open(log, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                lines += 1
                record = json.loads(line)
                kind = record.get("kind")
                kinds[kind] = kinds.get(kind, 0) + 1
                if kind == "session":
                    recorded.add(record.get("session_id"))
    except Exception as exc:  # noqa: BLE001
        return fail_to_look(
            "the log " + str(log) + " could not be read at line " + str(lines + 1)
            + " (" + type(exc).__name__ + ": " + str(exc) + ").",
            "look at that line. A log this file cannot parse is not an empty log.")

    seen = []
    missing = []
    for path in sorted(transcripts.glob("*.jsonl")):
        when = datetime.date.fromtimestamp(path.stat().st_mtime)
        if when < since:
            continue
        seen.append(path)
        if path.stem not in recorded:
            missing.append((when, path.stem))

    print("log            : " + str(log.resolve()))
    print("               : " + str(lines) + " records, "
          + ", ".join("%s %d" % (k, kinds[k]) for k in sorted(kinds, key=str))
          + (" (none)" if not kinds else ""))
    print("transcript dir : " + str(transcripts))
    print("since          : " + since.isoformat())
    print("sessions in range: " + str(len(seen))
          + "   with a session record: " + str(len(seen) - len(missing))
          + "   WITHOUT: " + str(len(missing)))

    if not seen:
        # Not a pass. Nothing was compared, which is the same class of answer as
        # a missing log, so it gets the same code.
        print("")
        return fail_to_look(
            "no transcript in " + str(transcripts) + " is dated "
            + since.isoformat() + " or later, so nothing was compared.",
            "pass an earlier date.")

    if missing:
        print("")
        print("SESSIONS WITH NO RECORD")
        print("=======================")
        for when, stem in sorted(missing):
            print("  %s  %s" % (when.isoformat(), stem))
        print("")
        print(str(len(missing)) + " of " + str(len(seen))
              + " sessions since " + since.isoformat() + " left no session record.")
        print("A session predating the hook, one killed before it stopped, and a")
        print("subagent transcript each leave none legitimately. This names them;")
        print("it does not diagnose them.")
        return 1

    print("")
    print("OK: all " + str(len(seen)) + " sessions since " + since.isoformat()
          + " have a session record.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
