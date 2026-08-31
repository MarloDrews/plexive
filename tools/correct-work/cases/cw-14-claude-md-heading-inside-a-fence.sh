#!/usr/bin/env bash
# CW-14  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS QUOTING A MARKDOWN HEADING INSIDE A FENCED CODE BLOCK. Verbatim from the
# verification report of 2026-08-31, F8:
#
#     --- added a ```markdown fence containing one "## Some Heading" line
#       OVER claude_md_sections                 11 / 10      pinned           rc=1
#
# Same class as F1 -- the metric counted a textual shape rather than the thing it is named for --
# and lower likelihood, because CLAUDE.md uses indented code blocks today and an indented "## "
# was already correctly not counted. It is a real input all the same: the documents in this
# repository quote each other constantly, and the ## CI section of CLAUDE.md is one edit away
# from showing a heading it is describing.
#
# The scan now tracks ``` and ~~~ fences. A "## " line inside one is not a section and does not
# close the "## Rules" body either, so the two metrics that read this file agree about where a
# section ends.
set -eo pipefail

python3 - <<'PY'
FENCE = "```"

blob = open("CLAUDE.md", "rb").read().replace(b"\r\n", b"\n").decode("utf-8")
if FENCE in blob:
    raise SystemExit("input drift: CLAUDE.md already contains a fence, so this case is no longer "
                     "adding the first one and would be measuring something else")

with open("CLAUDE.md", "a", encoding="utf-8", newline="\n") as fh:
    fh.write("\n%smarkdown\n## Some Heading\n%s\n" % (FENCE, FENCE))
print("appended one fenced block containing a '## ' line")
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
