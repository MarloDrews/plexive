#!/usr/bin/env python3
"""Extract one step's `run:` body from a workflow file, byte for byte.

The point of this script is that a rehearsal has to run the bytes the runner gets. YAML
block scalars are dedented by the YAML parser, so a hand-copied step body is a different
program from the one in the workflow: indentation inside a heredoc changes, and a `PY`
terminator that is no longer at column 0 turns a working step into a syntax error nobody
sees until CI. PyYAML does the dedent and this script does nothing else to the text.

    python extract_step.py <workflow> <job> <step name> <out path> [--rev <sha>]

--rev reads the workflow out of a git revision instead of the working tree. That is how
the BEFORE column of the correct-work table is taken: against the step as it was before
the fix, rather than against a transcript of it.

Every path is RELATIVE TO THE CURRENT DIRECTORY on purpose. This runs under Git Bash on
Windows, where a POSIX-looking absolute path is not a path CPython can open.
"""

import argparse
import io
import subprocess
import sys

import yaml


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("workflow")
    ap.add_argument("job")
    ap.add_argument("step")
    ap.add_argument("out")
    ap.add_argument("--rev", default=None)
    args = ap.parse_args()

    if args.rev:
        blob = subprocess.run(
            ["git", "show", "%s:%s" % (args.rev, args.workflow)],
            capture_output=True, check=True,
        ).stdout.decode("utf-8")
    else:
        blob = io.open(args.workflow, encoding="utf-8").read()

    doc = yaml.safe_load(blob)
    jobs = doc.get("jobs") or {}
    if args.job not in jobs:
        print("FAIL: no job %r in %s. Jobs: %s"
              % (args.job, args.workflow, sorted(jobs)), file=sys.stderr)
        return 1

    steps = jobs[args.job].get("steps") or []
    # ASSERT ON A COUNT, not on "did the loop find something". A name that matches nothing
    # and a name that matches twice both produce a file, and one of them is the wrong step.
    matched = [s for s in steps if s.get("name") == args.step]
    if len(matched) != 1:
        print("FAIL: %d steps named %r in %s job %s, expected exactly 1. Steps: %s"
              % (len(matched), args.step, args.workflow, args.job,
                 [s.get("name") for s in steps]), file=sys.stderr)
        return 1

    body = matched[0].get("run")
    if not body:
        print("FAIL: step %r has no run: body (it is a uses: step)." % args.step,
              file=sys.stderr)
        return 1

    io.open(args.out, "w", encoding="utf-8", newline="\n").write(body)
    print("%s :: %s -> %s (%d lines)"
          % (args.workflow, args.step, args.out, len(body.splitlines())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
