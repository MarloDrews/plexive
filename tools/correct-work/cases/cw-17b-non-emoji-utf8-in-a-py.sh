#!/usr/bin/env bash
# CW-17b  check: .claude/hooks/pretooluse_write.py check_emoji   the ALLOW direction
# EXPECT_RC=0
#
# THE HOOK MUST EXIT 0 HERE, and this is the half a decode fix is most likely to break. The
# repair of 2026-09-02 made the hook see non-ASCII characters it had never seen before; the
# cheap over-correction is to refuse all of them. CW-17a proves the emoji is caught. This
# proves ordinary non-ASCII in a .py file is still correct work.
#
# THREE CHARACTERS, ALL RAW UTF-8, none of them in U+1F300-U+1FAFF:
#   U+2713 CHECK MARK  -- a dingbat. The range is deliberately NOT widened to that block,
#                         because doing so costs eight correct files that use check and
#                         cross glyphs. This is that decision, stored.
#   U+00FC LATIN SMALL LETTER U WITH DIAERESIS -- German prose in a docstring.
#   U+2014 EM DASH     -- ordinary punctuation in a comment.
#
# IT DOES NOT DISCRIMINATE ON THE FIX, and that is declared here rather than left to be
# found, as CW-9a, CW-13, CW-15c, CW-16a and CW-16b declare it. Measured 2026-09-02 against
# the pre-repair hook at dce9f90: case rc=0, exactly as after. Before the repair all three
# characters arrived as mojibake and the check passed on them for the WRONG REASON; after it
# the check sees them and passes for the right one, and no exit code tells those apart. What
# this case pins is the direction a decode fix is most likely to be over-corrected in, and it
# is evidence only alongside CW-17a, which went from case rc=2 to case rc=0 across the same
# two trees.
#
# Written 2026-09-02 with the repair it exercises, so it agrees with its fix by construction,
# declared here as CW-7, CW-8, CW-16a, CW-16b and CW-17a declare it.
set -eo pipefail

test -f .claude/hooks/pretooluse_write.py || {
  echo "FAIL: .claude/hooks/pretooluse_write.py is not there, so this case no longer stores"
  echo "the layout it was written for."; exit 2; }

PAY="$RUNNER_TEMP/pay_nonemoji.json"
python - "$PAY" <<'PY'
import json, sys
body = (
    'def check():\n'
    '    """Pr' + chr(0x00FC) + 'ft die Eingabe."""\n'
    '    return "' + chr(0x2713) + '"  # done ' + chr(0x2014) + ' nothing else to do\n'
)
payload = {
    "session_id": "cw-17b",
    "tool_name": "Write",
    "tool_input": {"file_path": "backend/app/probe.py", "content": body},
}
with open(sys.argv[1], "wb") as fh:
    fh.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
PY

# The fixture carries real multi-byte UTF-8, asserted rather than assumed.
python - "$PAY" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
found = [s for s in (b"\xe2\x9c\x93", b"\xc3\xbc", b"\xe2\x80\x94") if s in data]
print("distinct non-ASCII UTF-8 sequences in the payload: %d" % len(found))
if len(found) != 3:
    print("FAIL: the fixture lost its non-ASCII characters, so an exit 0 here would mean")
    print("nothing at all.")
    sys.exit(2)
PY

RC=0
ERR=$(python .claude/hooks/pretooluse_write.py < "$PAY" 2>&1 >/dev/null) || RC=$?
echo "hook rc=$RC, ${#ERR} bytes of stderr"

[ "$RC" = "0" ] || {
  echo "FAIL: the hook exited $RC on a .py file holding a check mark, an umlaut and an em"
  echo "dash. None is in U+1F300-U+1FAFF and none is an emoji. Refusing them widens the"
  echo "rule past what CLAUDE.md says and reds on correct work, which is the inverse defect"
  echo "CLAUDE.md keeps apart from the rest."
  printf '%s\n' "$ERR"; exit 2; }

# An exit 0 with the no-content notice on stderr would be a pass for the wrong reason: it
# would mean nothing was inspected. The content field must have been found.
printf '%s' "$ERR" | grep -qF 'found no content field' && {
  echo "FAIL: the hook allowed because it inspected NOTHING, not because the content was"
  echo "clean. Those two must not produce the same verdict."; exit 2; }
echo "OK: non-emoji UTF-8 in a .py file was inspected and allowed."
