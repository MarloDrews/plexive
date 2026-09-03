#!/usr/bin/env bash
# CW-12b  check: backend-checks / surface budget      A GAP, PINNED
# EXPECT_RC=0
#
# THIS CASE PASSES AND IT IS NOT A CLEAN BILL OF HEALTH. It stores the half of F6 that is not
# fixed, so the gap sits in a file that runs. Verbatim from the verification report of 2026-08-31:
#
#     --- same, with the file kept and every list emptied
#     OK: all 23 containers at or under their ceilings.   (23 on the day; 24 since 2026-09-03)                       rc=0
#
# A CEILING FIRES UPWARD ONLY. That is what a ceiling is, it is written into CLAUDE.md and into
# tools/surface-budget.json, and closing this direction would mean a floor under all 24
# containers -- a different check, which this batch was told not to add and did not add. So the
# budget file now carries a line naming what a ceiling cannot see, and this case is the runnable
# half of that line.
#
# If somebody later adds those floors, this case flips to 1 and run_all.sh reports the flip. That
# is the only way a gap that is deliberate today stays visible on the day it stops being.
set -eo pipefail

python3 - <<'PY'
import json

with open(".claude/settings.json", "rb") as fh:
    settings = json.loads(fh.read().replace(b"\r\n", b"\n").decode("utf-8"))

before = (len(settings.get("permissions", {}).get("allow", [])),
          len(settings.get("permissions", {}).get("deny", [])),
          len(settings.get("hooks", {})))
if 0 in before:
    raise SystemExit("input drift: the file is already empty, so this case empties nothing")

settings["permissions"] = {"allow": [], "deny": [], "ask": []}
settings["hooks"] = {}
with open(".claude/settings.json", "w", encoding="utf-8", newline="\n") as fh:
    json.dump(settings, fh, indent=2)
print("emptied .claude/settings.json in place: %d allow, %d deny, %d hook event(s) -> 0" % before)
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
