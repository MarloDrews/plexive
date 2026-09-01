---
description: Rules that apply when writing or editing a code file
paths:
  - "**/*.py"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.kt"
  - "**/*.kts"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.css"
  - "**/*.sh"
  - "**/*.yml"
  - "**/*.yaml"
---

# Code files

Moved here from CLAUDE.md verbatim. The glob above is the suffix set of the gate that
enforces the rule below, `CODE_SUFFIXES` in `.claude/hooks/pretooluse_write.py`, so the
two lists match suffix for suffix and changing one means changing the other.

THE TWO SETS OF SESSIONS ARE NOT THE SAME, and this file claimed they were until
2026-09-02. Measured 2026-09-01: this rule is delivered on **Read** of a matching file,
while the gate fires on **Write** and **Edit**. A session that creates a new code file
gets the gate and never the rule; a session that only reads one gets the rule and never
the gate. The matching suffixes make the two OVERLAP, not coincide.

A rule leaves CLAUDE.md for this directory only when a gate for it exists and has fired.
That is why this file carries one rule and not the neighbouring one about English
comments, which has no gate.

THE GATE FOR THIS RULE FIRST FIRED ON 2026-09-02, and this file asserted it had for the
two days before that. It could not: `check_emoji` read stdin with the machine's default
encoding, cp1252, in which the four UTF-8 bytes of an emoji all decode to defined
characters outside the range it looks for, so it examined mojibake and reported success --
0 emoji refusals in the 135 transcripts dated before 2026-09-01, against 17 from the
`utcnow` check in the same script. The read was changed to bytes decoded as UTF-8, and a
live session was then refused. Workings:
`plexive-docs/research/emoji-gate-repair-2026-09-01.md`.

- No emojis in code or comments
