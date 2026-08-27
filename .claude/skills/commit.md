---
description: Commit and push changes using conventional commits format (type(scope): description). Reads the diff, picks the right type (feat/fix/docs/style/refactor/chore), writes a short English message, stages relevant files, commits, and pushes.
---

# Git Commit Skill

NOTE: the PreToolUse hook in `.claude/settings.json` does not read this file. It injects its
own hardcoded copy of these rules, so editing this file alone changes nothing a session is
told. Change both or neither.

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
