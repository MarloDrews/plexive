#!/usr/bin/env bash
# CW-18  check: .claude/hooks/stop_rule_log.py refusal detection   the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A SESSION THAT FAILED AT THINGS. A build that exited non-zero, a
# Read of a file that is not there, a Write before a Read, a person declining a prompt.
# None of those is a rule refusing anything, and a log that counted them would report
# that Plexive's rules fire constantly while saying nothing about whether they do.
#
# THE INPUT IS NOT THIS REPOSITORY AS IT STANDS, and it could not be: the subject is a
# transcript, which lives in ~/.claude/projects/ and never in the tree. It is built here
# from the shape the corpus actually holds. Measured 2026-09-02 over 167 transcripts:
# 379 tool_result records carry is_error, and 324 of them are ordinary failures that no
# rule produced. A detector keyed on is_error alone would return a number roughly seven
# times the real one and would look like an answer, which is why the hook matches on the
# result text in three named shapes instead.
#
# WHAT IT DISCRIMINATES. Replace refusal_shape() with anything that keys on is_error, or
# on toolDenialKind -- user-rejected is in this fixture precisely because that field is
# SET on it -- and this case goes from 0 refusals to a non-zero count and fails.
#
# WHAT IT DOES NOT. It says nothing about whether the three shapes are FOUND; that is the
# other direction and it lives in .claude/hooks/hook_cases.py, which carries a case per
# shape. This one only proves the detector stays quiet when it should.
#
# IT RUNS A HOOK RATHER THAN A $STEPS BODY, like cw-16a and cw-16b, and for the same
# reason: the thing under test is not wired into any CI job.
set -eo pipefail

T="$RUNNER_TEMP/stop-ordinary"
rm -rf "$T"; mkdir -p "$T"

# The transcript, written by python so the JSON is valid by construction rather than by
# a heredoc nobody parses. Five calls, four of them failures, and every failure is a real
# shape sampled from the corpus.
python - "$T" <<'PY'
import json, os, sys

d = sys.argv[1]


def call(i, name, tool_input):
    return {"type": "assistant", "version": "2.1.258", "gitBranch": "main",
            "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": i, "name": name, "input": tool_input}]}}


def result(i, body, denial=None):
    r = {"type": "user", "version": "2.1.258", "gitBranch": "main",
         "message": {"role": "user", "content": [
             {"type": "tool_result", "content": body, "is_error": True,
              "tool_use_id": i}]}}
    if denial:
        r["toolDenialKind"] = denial
    return r


records = [
    call("toolu_1", "Bash", {"command": "npm run build"}),
    result("toolu_1", "Exit code 1\nerror TS2345: not assignable to parameter"),
    call("toolu_2", "Read", {"file_path": "backend/app/nope.py"}),
    result("toolu_2", "<tool_use_error>File does not exist.</tool_use_error>"),
    call("toolu_3", "Write", {"file_path": "backend/app/x.py", "content": "x = 1"}),
    result("toolu_3", "<tool_use_error>File has not been read yet. Read it first "
                      "before writing to it.</tool_use_error>"),
    # A person declining a prompt. A refusal BY A HUMAN, and the one record here that
    # carries toolDenialKind at all, which is what makes a field-keyed detector fail.
    call("toolu_4", "Bash", {"command": "rm -rf build/"}),
    result("toolu_4", "The user doesn't want to proceed with this tool use. The tool "
                      "use was rejected.", denial="user-rejected"),
    call("toolu_5", "Bash", {"command": "git status --porcelain"}),
    {"type": "user", "version": "2.1.258", "gitBranch": "main",
     "message": {"role": "user", "content": [
         {"type": "tool_result", "content": "", "is_error": False,
          "tool_use_id": "toolu_5"}]}},
]

with open(os.path.join(d, "ordinary.jsonl"), "w", encoding="utf-8", newline="") as fh:
    for record in records:
        fh.write(json.dumps(record) + "\n")

payload = {"session_id": "cw18", "transcript_path": os.path.join(d, "ordinary.jsonl"),
           "cwd": os.getcwd(), "hook_event_name": "Stop", "permission_mode": "default",
           "last_assistant_message": "The build is still red.", "stop_hook_active": False}
with open(os.path.join(d, "payload.json"), "w", encoding="utf-8", newline="") as fh:
    fh.write(json.dumps(payload))

errors = sum(1 for r in records for b in r["message"]["content"] if b.get("is_error"))
print("built a transcript with %d calls and %d is_error results" % (5, errors))
if errors != 4:
    raise SystemExit("input drift: the fixture no longer carries four failures")
PY

# THE LOG GOES INTO $RUNNER_TEMP. The real .claude/rule-log/ is never read or written by
# this case, the same rule hook_cases.py follows for the backup directory.
export PLEXIVE_RULE_LOG_DIR="$T/log"

# RC=0 FIRST, THEN `|| RC=$?`, for the reason cw-16b sets out at length: under
# `set -eo pipefail` a bare `RC=$?` on the next line can only ever read 0.
RC=0
OUT=$(python .claude/hooks/stop_rule_log.py < "$T/payload.json") || RC=$?
echo "hook rc=$RC, said: $OUT"

[ "$RC" = "0" ] || { echo "FAIL: the hook did not survive an ordinary transcript."; exit 2; }

LOG="$T/log/events.jsonl"
[ -f "$LOG" ] || { echo "FAIL: no log was written at all, so zero refusals here would"
                   echo "mean nothing: a hook that wrote nothing and a hook that found"
                   echo "nothing must not look the same."; exit 2; }

REFUSALS=$(python -c "import json,sys;print(sum(1 for l in open(sys.argv[1],encoding='utf-8') if l.strip() and json.loads(l)['kind']=='refusal'))" "$LOG")
SESSIONS=$(python -c "import json,sys;print(sum(1 for l in open(sys.argv[1],encoding='utf-8') if l.strip() and json.loads(l)['kind']=='session'))" "$LOG")
echo "log holds $SESSIONS session record(s) and $REFUSALS refusal record(s)"

[ "$SESSIONS" = "1" ] || { echo "FAIL: expected exactly one session record, got $SESSIONS."; exit 2; }
[ "$REFUSALS" = "0" ] || {
  echo "FAIL: $REFUSALS of the four ordinary failures were logged as rule refusals."
  echo "Nothing in this transcript was refused by a rule. A detector that counts these"
  echo "reports that Plexive's rules fire constantly and says nothing about whether"
  echo "they do, which is the one thing the log exists to answer."
  exit 2; }
echo "OK: four ordinary failures, zero refusals, one session record."
