#!/usr/bin/env bash
#
# Runs every stored correct-work input against the CI step body it belongs to, and compares
# each result against the exit code the case DECLARES for itself.
#
#   bash tools/correct-work/run_all.sh                 # against the working tree
#   bash tools/correct-work/run_all.sh --rev <sha>     # against the steps as of <sha>
#   bash tools/correct-work/run_all.sh --only cw-3     # one case, by name fragment
#
# THE COMPARISON IS AGAINST THE DECLARATION, NOT AGAINST ZERO, AND IT FAILS IN BOTH
# DIRECTIONS. A correct-work set is not a set of cases that all pass; it is a set of cases
# whose outcome is known and written down in advance, and some of those outcomes are a
# refusal. A case that starts PASSING when it was declared to refuse is as much a finding as
# one that starts failing -- it is the shape a silently weakened assertion would take, which
# is exactly the risk around cw-4 and the --select F absolute.
#
# Nothing runs in your checkout. Each case gets a throwaway git worktree, so a case that
# leaves the tree mutated cannot cost anyone work.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
REV=""
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rev)  REV="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
REV_LABEL=${REV:-working tree}
REV_FOR_EXTRACT=${REV:-}

WORK=$(mktemp -d)
WT="$WORK/wt"
STEPS="$WORK/steps"
mkdir -p "$STEPS"
# THE JUNCTION IS UNLINKED BEFORE ANYTHING RECURSIVE RUNS, AND THIS IS NOT A DETAIL.
# frontend/node_modules in the worktree is a Windows directory junction pointing at the real
# one. `git worktree remove --force` and `rm -rf` both FOLLOW it and delete the target's
# contents: measured 2026-08-31, the first run of this script emptied the checkout's own
# frontend/node_modules and the next run refused to start. `cmd /c rmdir` removes the reparse
# point without descending. The verification afterwards is the point of the exercise -- an
# unlink that silently failed and an unlink that worked look identical from here.
NM_LINK=""
cleanup() {
  if [ -n "$NM_LINK" ] && [ -e "$NM_LINK" ]; then
    if [ -L "$NM_LINK" ]; then
      rm -f "$NM_LINK"
    else
      cmd //c rmdir "$(cygpath -w "$NM_LINK")" >/dev/null 2>&1 || true
    fi
  fi
  if [ -n "$NM_LINK" ] && [ -e "$NM_LINK" ]; then
    echo "REFUSING TO CLEAN UP: $NM_LINK is still there, and it is a link into your checkout."
    echo "Remove it by hand before deleting $WT, or frontend/node_modules goes with it."
    return 0
  fi
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WORK" >/dev/null 2>&1 || true
  # Both directions: the link is gone AND what it pointed at is still there.
  if [ -d "$NODE_MODULES" ] && [ ! -d "$NODE_MODULES/eslint" ]; then
    echo "FAIL: frontend/node_modules survived as a directory but lost eslint. Something"
    echo "followed the link. Run (cd frontend && npm ci) and do not trust this run."
  fi
}
trap cleanup EXIT INT TERM

# --- the step bodies, extracted rather than transcribed ---------------------------------
extract() { # <name> <workflow> <job> <step>
  local out="$STEPS/$1.sh"
  if [ -n "$REV_FOR_EXTRACT" ]; then
    ( cd "$REPO" && python tools/correct-work/extract_step.py "$2" "$3" "$4" "$out" --rev "$REV_FOR_EXTRACT" )
  else
    ( cd "$REPO" && python tools/correct-work/extract_step.py "$2" "$3" "$4" "$out" )
  fi
}
echo "=== step bodies, from $REV_LABEL ==="
extract fe-lint  .github/workflows/frontend-checks.yml frontend-checks "Lint"                                             || exit 1
extract an-test  .github/workflows/android-build.yml   android-build   "Assert the Kotlin host test task ran, and count the tests" || exit 1
extract an-lint  .github/workflows/android-build.yml   android-build   "Assert AGP lint ran, and ratchet its findings"    || exit 1
extract be-ruff  .github/workflows/backend-checks.yml  backend-checks  "Ruff (E4,E7,E9,F ratchet, and F at zero)"         || exit 1
extract be-mypy  .github/workflows/backend-checks.yml  backend-checks  "Mypy (ratchet)"                                   || exit 1
extract be-rules .github/workflows/backend-checks.yml  backend-checks  "Rules files under .claude/rules/ declare a paths: scope" || exit 1

# --- prerequisites, reported loudly rather than skipped quietly --------------------------
VENV="$REPO/backend/.venv/Scripts/python.exe"
[ -x "$VENV" ] || VENV="$REPO/backend/.venv/bin/python"
NODE_MODULES="$REPO/frontend/node_modules"
missing=0
if [ ! -x "$VENV" ]; then
  echo "MISSING PREREQUISITE: backend/.venv with ruff==0.16.4 and mypy==2.3.1."
  echo "  python -m venv backend/.venv && backend/.venv/.../pip install ruff==0.16.4 mypy==2.3.1 -r backend/requirements.txt"
  missing=1
fi
if [ ! -d "$NODE_MODULES/eslint" ]; then
  echo "MISSING PREREQUISITE: frontend/node_modules with eslint. Run: (cd frontend && npm ci)"
  missing=1
fi
if [ "$missing" -ne 0 ]; then
  echo "REFUSING TO RUN. A partial run that reported only the cases it could reach would look"
  echo "like a run that passed, which is the failure this whole directory exists to refuse."
  exit 2
fi

# python3 and python both mean the pinned interpreter here; on the runner they already do.
SHIM="$WORK/shim"
mkdir -p "$SHIM"
for name in python python3; do
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$VENV" > "$SHIM/$name"
  chmod +x "$SHIM/$name"
done
# The ruff step calls `ruff` bare after pip-installing it, which puts it on PATH on the
# runner. Here the pinned copy already sits in the venv, so it is shimmed the same way.
printf '#!/bin/sh\nexec "%s" -m ruff "$@"\n' "$VENV" > "$SHIM/ruff"
chmod +x "$SHIM/ruff"
export PATH="$SHIM:$PATH"

# --- the throwaway worktree --------------------------------------------------------------
git -C "$REPO" worktree add --detach "$WT" HEAD >/dev/null 2>&1 || {
  echo "FAIL: could not create a worktree at $WT"; exit 2; }
# node_modules is gitignored, so the worktree has none. Link rather than copy.
NM_LINK="$WT/frontend/node_modules"
if command -v cmd >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  cmd //c mklink //J "$(cygpath -w "$NM_LINK")" "$(cygpath -w "$NODE_MODULES")" >/dev/null 2>&1 \
    || ln -s "$NODE_MODULES" "$NM_LINK"
else
  ln -s "$NODE_MODULES" "$NM_LINK"
fi
[ -d "$NM_LINK/eslint" ] || { echo "FAIL: could not reuse frontend/node_modules in the worktree"; exit 2; }

# --- run ----------------------------------------------------------------------------------
declared_of() { sed -n 's/^# EXPECT_RC=\([0-9]*\)$/\1/p' "$1" | head -n 1; }

ran=0
mismatched=0
results=""
printf '\n=== cases ===\n'
for case_file in "$HERE"/cases/*.sh; do
  name=$(basename "$case_file" .sh)
  if [ -n "$ONLY" ] && [ "${name#*"$ONLY"}" = "$name" ]; then continue; fi
  want=$(declared_of "$case_file")
  # A case with no declaration is a case with no expected outcome, which is not a case.
  if [ -z "$want" ]; then
    printf '%-52s NO DECLARATION -- add "# EXPECT_RC=<n>"\n' "$name"
    mismatched=$((mismatched + 1)); ran=$((ran + 1)); continue
  fi
  git -C "$WT" checkout --force --detach HEAD >/dev/null 2>&1
  git -C "$WT" clean -fdq -e frontend/node_modules >/dev/null 2>&1
  rt="$WORK/rt/$name"; mkdir -p "$rt"
  ( cd "$WT" && RUNNER_TEMP="$rt" STEPS="$STEPS" bash --noprofile --norc -eo pipefail "$case_file" ) \
    > "$WORK/$name.log" 2>&1
  got=$?
  ran=$((ran + 1))
  if [ "$got" = "$want" ]; then
    verdict="OK"
  else
    verdict="MISMATCH (declared $want)"
    mismatched=$((mismatched + 1))
  fi
  printf '%-52s rc=%-3s %s\n' "$name" "$got" "$verdict"
  results="$results$name rc=$got want=$want\n"
  if [ "$got" != "$want" ]; then
    echo "--- last 25 lines of $name ---"
    tail -n 25 "$WORK/$name.log" | sed 's/^/    /'
  fi
done

# --- assert on a count --------------------------------------------------------------------
total=$(ls "$HERE"/cases/*.sh | wc -l)
expected=$total
if [ -n "$ONLY" ]; then expected=$ran; fi
printf '\nran %d of %d cases against %s\n' "$ran" "$total" "$REV_LABEL"
if [ "$ran" -lt "$expected" ] || [ "$ran" -eq 0 ]; then
  echo "FAIL: ran $ran cases, expected $expected. A runner that skipped its cases reports the"
  echo "same green tick as one that passed them, which is the thing this file refuses to do."
  exit 1
fi
if [ "$mismatched" -ne 0 ]; then
  echo "FAIL: $mismatched of $ran cases did not match their declared exit code."
  exit 1
fi
echo "OK: all $ran cases matched the exit code they declare."
