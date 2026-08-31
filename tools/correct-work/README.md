# Correct-work inputs

Inputs that are **correct work**, kept beside the checks they used to red. Every CI gate in
this repository is built to refuse something, and every batch that built one demonstrated the
refusal. Not one of them ran a correct input its author had not chosen, and the result was four
checks that fired on ordinary refactoring, all of them found later by a session that had not
written the code.

That is what these files are for. A finding gets fixed once. An input keeps proving the fix.

Provenance: CW-1 through CW-6 are copied **verbatim** from
`plexive-docs/research/gate-batches-verification-2026-08-31.md`, section "The stored
correct-work inputs", and were written by a session that had written none of the code they
exercise. Re-deriving them from a reading of the fixed steps would make them agree with the fix
by construction, which is the one thing they must not do. Two departures are marked in the
files themselves: CW-1 gains a `mkdir -p` that `git mv` requires, and CW-3b was **added** by the
integration batch after CW-3 was measured and found to be an incomplete refactor.

CW-7 has a DIFFERENT provenance and is not from that report: it was written on 2026-08-31
with the check it exercises, in the same batch. It is therefore one of the two cases here that
agree with their fix by construction, which is the weakness the paragraph above describes. It
is kept anyway because the input it stores -- the rules directory growing by one correctly
scoped file -- is one CI cannot produce on its own.

CW-8 has the same provenance and the same weakness, declared in its own header: it was written
on 2026-08-31 with the surface budget step it exercises. It stores a 36-line correction to
CLAUDE.md, the shape the same-batch documentation rule makes recur, sitting exactly on the
claude_md_lines ceiling so that tightening that ceiling to a pin turns the case red.

CW-9 through CW-15 are copied **verbatim** from
`plexive-docs/research/surface-budget-verification-2026-08-31.md`, findings F1 through F8, and
carry the provenance CW-7 and CW-8 lack: a session that had written none of this code produced
them, and each one is the input that reproduced its finding. Their declared exit codes are what
the FIXED steps do; what shows that a case discriminates is the code it produced against the
step as it stood at `06d1803`, which is in
`plexive-docs/research/surface-budget-fixes-2026-08-31.md` as one column of a table. Four of them
do not discriminate on the exit code at all and say so in their own headers -- CW-9a, CW-9d,
CW-13 and CW-15c -- and they are kept because what they pin is the printed number rather than
the verdict.

One is not from that report: **CW-15c**, which turns the six-line idiom F4 quotes into a fixture.
It is labelled in its own header rather than passed off as reproduced.

Three of these declare a REFUSAL and one declares a KNOWN RESIDUAL, and none of the four is a
defect waiting to be fixed:

- **CW-12a declares 1.** Deleting `.claude/settings.json` used to pass green. The step now
  refuses a missing settings file the way it refuses a missing budget file.
- **CW-13 declares 1** and did before the fix too. It is the input that proved
  `MIN_BUDGET_ENTRIES` could never fire, and it still refuses -- through the set-equality
  assertion that was always doing the work.
- **CW-15a and CW-15b declare 1.** Two new named thresholds in one commit now cost a line in
  `tools/surface-budget.json`, because the ceiling was re-derived from a by-name replay and its
  headroom is one. The accompanying line records thresholds that exist, which is the
  discriminator this repository uses.
- **CW-9e declares 1 and is the known residual of the rule definition**, pinned rather than
  parsed around: a continuation line beginning `- ` cannot be told from a bullet. If someone
  later changes that definition the case flips and `run_all.sh` reports the flip.

**CW-12b passes and is not a clean bill of health.** It stores the half of F6 that is not fixed:
a ceiling fires upward only, so emptying every list in `.claude/settings.json` in place is
invisible to all 23 containers. The budget file says so in `_what_a_ceiling_cannot_see`.

## Running them

```
bash tools/correct-work/run_all.sh                  # against the working tree
bash tools/correct-work/run_all.sh --rev <sha>      # against the step bodies as of <sha>
bash tools/correct-work/run_all.sh --only cw-3      # one case, by name fragment
```

`--rev` is how the BEFORE column of a fix is taken: the same case tree, run against the step as
it was before the fix, rather than against a transcript of it.

Nothing runs in your checkout. Each run creates a throwaway `git worktree`, links
`frontend/node_modules` into it as a junction, and unlinks that junction **before** anything
recursive touches the worktree -- measured 2026-08-31, an ordinary `git worktree remove --force`
follows the junction and empties the real `frontend/node_modules`.

The step bodies are extracted from the workflow YAML by `extract_step.py`, never transcribed.
PyYAML performs the block-scalar dedent and nothing else touches the text, so what runs is what
the runner gets -- including heredoc terminators at column 0, which a hand-copy silently moves.

Everything runs under `bash --noprofile --norc -eo pipefail`, which is the runner's shell
verbatim, confirmed from a CI log rather than from documentation.

## Prerequisites

Both are checked before anything runs, and a missing one **refuses the whole run** rather than
skipping the cases it cannot reach:

- `frontend/node_modules` with eslint -- `(cd frontend && npm ci)`
- `backend/.venv` with `ruff==0.16.4` and `mypy==2.3.1`, the workflow's exact pins

`python`, `python3` and `ruff` are shimmed to that venv for the duration, because the runner has
them on PATH and this machine does not.

## What each case is

| case | check | step | finding | declared rc |
|---|---|---|---|---|
| `cw-1-frontend-component-moved` | `frontend-checks` | Lint | F1 | 0 |
| `cw-2-android-fixture-without-test` | `android-build` | test assertion | F2 | 0 |
| `cw-3-backend-scripts-consolidated` | `backend-checks` | Mypy | F3 | **1** |
| `cw-3b-backend-scripts-consolidated-completely` | `backend-checks` | Mypy | F3 | 0 |
| `cw-4-backend-package-reexport` | `backend-checks` | Ruff | F8 | **1** |
| `cw-5-backend-new-top-level-package` | `backend-checks` | Ruff + Mypy | F9 | 0 |
| `cw-6a-frontend-untouched` | `frontend-checks` | Lint | the allow direction | 0 |
| `cw-6b-frontend-errors-fixed` | `frontend-checks` | Lint | the allow direction | 0 |
| `cw-6c-android-passing-tests` | `android-build` | test assertion | the allow direction | 0 |
| `cw-6d-android-findings-fixed` | `android-build` | lint ratchet | the allow direction | 0 |
| `cw-7-second-scoped-rules-file` | `backend-checks` | rules `paths:` scope | the allow direction | 0 |
| `cw-8-claude-md-correction-within-ceiling` | `backend-checks` | surface budget | the allow direction | 0 |
| `cw-9a-claude-md-one-bullet-rewrapped` | `backend-checks` | surface budget | F1 | 0 |
| `cw-9b-claude-md-two-bullets-rewrapped` | `backend-checks` | surface budget | F1 | 0 |
| `cw-9c-claude-md-all-bullets-rewrapped` | `backend-checks` | surface budget | F1 | 0 |
| `cw-9d-claude-md-nested-sub-bullet` | `backend-checks` | surface budget | F1 | 0 |
| `cw-9e-claude-md-hyphen-initial-continuation` | `backend-checks` | surface budget | F1, the residual | **1** |
| `cw-10a-untracked-subagent-file` | `backend-checks` | surface budget | F2 | 0 |
| `cw-10b-untracked-plugin-files` | `backend-checks` | surface budget | F2 | 0 |
| `cw-11-rules-file-with-utf8-bom` | `backend-checks` | rules `paths:` scope | F5 | 0 |
| `cw-12a-settings-json-deleted` | `backend-checks` | surface budget | F6 | **1** |
| `cw-12b-settings-json-emptied` | `backend-checks` | surface budget | F6, the gap | 0 |
| `cw-13-budget-file-cut-to-one-container` | `backend-checks` | surface budget | F7 | **1** |
| `cw-14-claude-md-heading-inside-a-fence` | `backend-checks` | surface budget | F8 | 0 |
| `cw-15a-workflow-step-with-three-thresholds` | `backend-checks` | surface budget | F4 | **1** |
| `cw-15b-workflow-step-with-two-thresholds` | `backend-checks` | surface budget | F4 | **1** |
| `cw-15c-workflow-threshold-in-the-env-prefix-idiom` | `backend-checks` | surface budget | F4 | 0 |

## The declared exit code, and why the comparison is not against zero

**Every case declares its own expected exit code**, on a `# EXPECT_RC=<n>` line in its own file,
and `run_all.sh` fails when the actual code differs **in either direction**.

A correct-work set is not a set of cases that all pass. It is a set of cases whose outcome is
known and written down in advance, and three of these outcomes are a refusal:

- **CW-3 declares 1** because the move it performs, verbatim from the report, leaves
  `from content_repo import ...` at two call sites. That tree really does carry two unresolvable
  imports and no correct type checker can pass it. What the fix changed here is the MESSAGE:
  before, `FAIL: mypy exited 2, which is mypy failing rather than mypy finding something`, which
  was false -- mypy was fine and the argument list was empty. After, `MYPY_ERRORS=203`, the
  ratchet named, and both broken imports printed with their line numbers. CW-3b is the same
  consolidation done completely and is the one that moves from 1 to 0.
- **CW-4 declares 1** because F8 was left unfixed on measured evidence: ruff 0.16.4 offers no
  setting that tells a package re-export apart from a dead import in an `__init__.py`, and the
  only lever, `per-file-ignores`, is all-or-nothing. The `--select F` absolute at exactly zero,
  in force since 2026-08-27, was kept rather than weakened.
- **CW-5 declares 0** but asserts scope equality rather than a green gate: it plants a real type
  error in a new top-level package and checks that ruff and mypy now see the same number of
  files. The mypy ratchet correctly goes red on that tree; the case reads the two counts.

Failing in both directions is what makes CW-4 worth keeping. If someone ever adds the
`per-file-ignores` line, CW-4 starts exiting 0, `run_all.sh` reports a mismatch, and the
weakening of the F assertion is a finding rather than a silence.

## What this does not cover

Gradle and the Android SDK are not available on the machine these were written on
(`ANDROID_HOME` unset). CW-2, CW-6c and CW-6d therefore feed the assertion steps a
hand-written `gradle.log`, JUnit XML and lint report in the shape a real run produces. They
rehearse the ASSERTION and not Gradle, and each file says so in its own header rather than in a
footnote here.

This is not wired into CI, deliberately. Whether it should be is a later decision.
