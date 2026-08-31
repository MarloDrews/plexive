---
description: "Commit and push changes using conventional commits format (type(scope): description). Reads the diff, picks the right type (feat/fix/docs/style/refactor/chore), writes a short English message, stages relevant files, commits, and pushes."
---

# Git Commit Skill

NOTE: THIS FILE IS THE SOURCE. The PreToolUse hook configured in `.claude/settings.json`
runs `.claude/hooks/pretooluse_bash.py`, which reads this file on every `git commit` and
`git merge`, strips the frontmatter, and injects everything below as additionalContext.
Editing this file changes what a session is told, and there is no second copy to keep in
step. Until 2026-08-30 there was one: the hook carried a hardcoded duplicate inside
`settings.json` while citing this path as its source, so the two could diverge in silence
and editing this file changed nothing.

The injection FAILS OPEN. If this file is missing or unreadable the hook exits 0 and
the commit proceeds, because these rules are advisory context rather than a gate. The
backup gate in the same hook fails closed, and the difference is deliberate. Until
2026-08-31 failing open meant injecting NOTHING AND SAYING NOTHING -- measured that day,
rc=0 with zero bytes on stdout and zero on stderr -- so a reader whose input had vanished
was indistinguishable from one that had nothing to add. It now injects a notice naming
this path instead.

## Commit Message Format
Use conventional commits: type(scope): description

## Types
- feat: new feature
- fix: bug fix
- docs: documentation changes
- style: formatting, no code change
- refactor: code restructure, no feature change
- chore: maintenance tasks

## Rules
- English only
- Short and clear description
- No emojis
- No co-author lines

## Examples
- feat(feed): add for-you tab
- fix(auth): correct login redirect
- docs(readme): update setup instructions
- chore(db): add initial sqlite schema
