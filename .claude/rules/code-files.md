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
rule is delivered to exactly the sessions the gate can fire on. Changing one means
changing the other.

A rule leaves CLAUDE.md for this directory only when a gate for it exists and has fired.
That is why this file carries one rule and not the neighbouring one about English
comments, which has no gate.

- No emojis in code or comments
