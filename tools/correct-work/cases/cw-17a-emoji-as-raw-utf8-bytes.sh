#!/usr/bin/env bash
# CW-17a  check: .claude/hooks/pretooluse_write.py check_emoji   the REFUSE direction
# EXPECT_RC=0
#
# THE HOOK MUST EXIT 2 HERE. This case's own declared code is 0, the run_all.sh contract,
# and the hook's exit code is asserted inside -- the same shape CW-16a and CW-16b use, the
# only other cases here that drive a hook rather than a CI step body. Unlike that pair, this
# one DOES discriminate on the hook's exit code, and that is its whole point.
#
# WHAT IT STORES: a payload carrying the emoji as RAW UTF-8 BYTES, which is what a real
# client sends, rather than as the \uXXXX escapes json.dumps() produces by default. Until
# 2026-09-02 the hook read stdin with json.load(sys.stdin), which decodes with the machine's
# DEFAULT encoding -- cp1252 here. The four bytes F0 9F 9A 80 are every one of them a
# defined cp1252 character, so they decoded without raising into U+00F0 U+0178 U+0161
# U+20AC, none of them in the U+1F300-U+1FAFF range check_emoji looks for. The check ran,
# examined mojibake, and reported success. Measured over 135 transcripts dated before
# 2026-09-01: 17 utcnow refusals, 0 emoji refusals, and a live claude -p session inserting a
# rocket into a .py file was not blocked at all.
#
# THE ESCAPED SPELLING BLOCKED THE WHOLE TIME, which is why nothing noticed: every emoji case
# in .claude/hooks/hook_cases.py is fed through json.dumps() with the default ensure_ascii,
# so all 160 of them passed against a check that could not fire on a real payload. This file
# feeds the bytes instead.
#
# Written 2026-09-02 with the repair it exercises, so it agrees with its fix by construction
# -- the weakness CW-7, CW-8, CW-16a and CW-16b declare in their own headers, declared here
# too. It was run against the pre-repair hook first and went red there, so it was seen to
# fail before it was seen to pass.
#
# NO EMOJI IS SPELLED IN THIS FILE. .sh is in CODE_SUFFIXES, so a literal one here would make
# this case unwritable by the tool the hook is bound to -- the same reason the utcnow literal
# in the hook itself is built by concatenation. chr(0x1F680) builds it at run time.
set -eo pipefail

test -f .claude/hooks/pretooluse_write.py || {
  echo "FAIL: .claude/hooks/pretooluse_write.py is not there, so this case no longer stores"
  echo "the layout it was written for."; exit 2; }

PAY="$RUNNER_TEMP/pay_utf8.json"
python - "$PAY" <<'PY'
import json, sys
payload = {
    "session_id": "cw-17a",
    "tool_name": "Edit",
    "tool_input": {
        "file_path": "probe.py",
        "old_string": "x = 1",
        "new_string": "x = 1  # rocket " + chr(0x1F680) + " here",
        "replace_all": False,
    },
}
# ensure_ascii=False is the whole fixture: raw UTF-8 on the wire, not \uXXXX escapes.
with open(sys.argv[1], "wb") as fh:
    fh.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
PY

# Both directions on the fixture itself, before it is trusted: the four bytes are present.
python - "$PAY" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
n = data.count(b"\xf0\x9f\x9a\x80")
print("raw UTF-8 rocket byte sequences in the payload: %d" % n)
if n != 1:
    print("FAIL: the fixture does not carry the emoji as raw UTF-8 bytes, so this case")
    print("would prove nothing about the decode it exists to pin.")
    sys.exit(2)
PY

RC=0
ERR=$(python .claude/hooks/pretooluse_write.py < "$PAY" 2>&1 >/dev/null) || RC=$?
echo "hook rc=$RC, ${#ERR} bytes of stderr"

[ "$RC" = "2" ] || {
  echo "FAIL: the hook exited $RC, not 2. A payload carrying a real emoji reached the hook"
  echo "and was allowed. This is the 2026-09-01 defect: stdin decoded with the machine's"
  echo "default encoding turns the emoji into mojibake that no check can see."; exit 2; }

printf '%s' "$ERR" | grep -qF 'BLOCKED: emoji in a code file' || {
  echo "FAIL: the hook exited 2 but not from check_emoji. Something else refused this"
  echo "payload, so the emoji check is still unproven."; exit 2; }
printf '%s' "$ERR" | grep -qF 'U+1F680' || {
  echo "FAIL: the block message does not name U+1F680. A message that cannot name the"
  echo "codepoint it found is a message read from mojibake."; exit 2; }
echo "OK: raw UTF-8 emoji bytes reached check_emoji and were refused, naming U+1F680."
