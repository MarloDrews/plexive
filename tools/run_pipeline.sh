#!/usr/bin/env bash
# tools/run_pipeline.sh
#
# Linux/Mac driver for the six-step bulk generation pipeline (Architecture A). Mirror of
# run_pipeline.ps1. Each step is a separate `claude --print` process; the only channel between
# steps is files on disk, so role separation is structural.
#
# RESUME: each step writes a marker (.stepN.done) in the batch dir on success. Re-running the
# SAME batch name skips already-marked steps, so a run killed mid-way (for example on a usage
# limit) resumes from the first unfinished step. Force a full rebuild with a new batch name (or
# by deleting the .stepN.done markers).
#
# GIT FLOW: batches build sequentially on the integration branch integration/<format>-all, which
# always holds the full catalog. The batch branch bulk/<format>-<batch> is cut FROM the integration
# branch (not from whatever HEAD happens to be), so step 1 can see every earlier batch's posts and
# will not pick duplicate topics. After the six steps pass, this script commits the generated
# content and fast-forwards it back into the integration branch. Nothing reaches main or origin
# unless PUSH_TO_MAIN=1, which merges integration into main (--ff-only) and pushes. Every merge is
# --ff-only: if a batch was run in parallel and the merge is not a fast-forward, the script stops
# and asks a human to merge, rather than forcing it.
#
# Usage (from repo root): tools/run_pipeline.sh facts [batch]
#   BATCH_SIZE=3 tools/run_pipeline.sh facts 2026-07-03-d
#   PUSH_TO_MAIN=1 tools/run_pipeline.sh facts

set -uo pipefail

FORMAT="${1:?usage: run_pipeline.sh <format> [batch]}"
BATCH="${2:-$(date +%Y-%m-%d)-a}"
BATCH_SIZE="${BATCH_SIZE:-5}"
# Publishing is opt-in. Anything other than exactly "1" (unset, empty, "0") leaves main and origin alone.
PUSH_TO_MAIN="${PUSH_TO_MAIN:-}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CHECKER="tools/texture_check.py"
PROMPTS_DIR="tools/pipeline_prompts/$FORMAT"
GEN_DIR="docs/content-structure/generated/$FORMAT"
BATCH_DIR="$GEN_DIR/_batches/$BATCH"
BRANCH="bulk/$FORMAT-$BATCH"
INTEGRATION="integration/$FORMAT-all"
ALLOWED_TOOLS="WebSearch,WebFetch,Read,Edit,Write,MultiEdit,Bash"

# preflight
[ -f "$CHECKER" ] || { echo "FATAL: checker not found at $CHECKER"; exit 1; }
[ -d "$PROMPTS_DIR" ] || { echo "FATAL: no rendered prompts at $PROMPTS_DIR"; exit 1; }
for n in 1 2 3 4 5 6; do
  [ -f "$PROMPTS_DIR/step$n.txt" ] || { echo "FATAL: missing $PROMPTS_DIR/step$n.txt"; exit 1; }
done
command -v claude >/dev/null 2>&1 || { echo "FATAL: claude CLI not on PATH"; exit 1; }

mkdir -p "$BATCH_DIR"

# integration branch: the fixed branch that always holds the full catalog.
# Created from main once, on the very first batch of a format. Never recreated after that.
if ! git rev-parse --verify --quiet "refs/heads/$INTEGRATION" >/dev/null; then
  git rev-parse --verify --quiet "refs/heads/main" >/dev/null || { echo "FATAL: no main branch to create $INTEGRATION from"; exit 1; }
  git branch "$INTEGRATION" main || { echo "FATAL: could not create $INTEGRATION from main"; exit 1; }
  echo "created integration branch $INTEGRATION from main"
fi

# batch branch, cut FROM the integration branch so it sees every earlier batch.
# On a resume the branch already exists: check it out instead of recreating it.
if ! git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then git checkout -b "$BRANCH" "$INTEGRATION"; else git checkout "$BRANCH"; fi
[ $? -eq 0 ] || { echo "FATAL: could not check out branch $BRANCH"; exit 1; }
echo "format=$FORMAT batch=$BATCH size=$BATCH_SIZE branch=$BRANCH integration=$INTEGRATION"

declare -A MODEL=(  [1]=claude-sonnet-4-6 [2]=claude-opus-4-8 [3]=claude-opus-4-8 [4]=claude-opus-4-8 [5]=claude-opus-4-8 [6]=claude-opus-4-8 )
declare -A EFFORT=( [1]=high [2]=xhigh [3]=high [4]=high [5]=xhigh [6]=high )
declare -A LABEL=(  [1]="topic finding (writes manifest.json)" [2]="generation (writes posts, self-checks)" [3]="correctness review (writes correctness_report.json)" [4]="correctness correction (applies report)" [5]="human-sound review COLD (writes humansound_report.json)" [6]="prose-only correction (applies report)" )

run_step() {
  local N="$1"
  local marker="$BATCH_DIR/.step$N.done"
  if [ -f "$marker" ]; then
    echo; echo "===== STEP $N: ${LABEL[$N]}  (SKIPPED, already done on a previous run) ====="
    return 0
  fi
  echo; echo "===== STEP $N: ${LABEL[$N]}  (model ${MODEL[$N]}, effort ${EFFORT[$N]}) ====="
  local prompt
  prompt="$(sed -e "s/{{BATCH}}/$BATCH/g" -e "s/{{BATCH_SIZE}}/$BATCH_SIZE/g" "$PROMPTS_DIR/step$N.txt")"
  printf '%s' "$prompt" | claude --print --model "${MODEL[$N]}" --effort "${EFFORT[$N]}" --permission-mode acceptEdits --allowedTools "$ALLOWED_TOOLS"
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "FATAL: step $N failed; stopping. Nothing after this step ran. Re-run the SAME batch name ($BATCH) to resume from step $N."
    exit 1
  fi
  touch "$marker"
}

for n in 1 2 3 4 5 6; do run_step "$n"; done

# commit the generated content.
# Stage only this format's generated posts and _recent_moves.md. The per-batch reports and the
# .stepN.done markers live under _batches/, which .gitignore excludes, so they stay uncommitted.
echo; echo "===== committing batch ====="
git add -- "$GEN_DIR" || { echo "FATAL: could not stage $GEN_DIR"; exit 1; }
# git diff --cached --quiet exits non-zero when there is something staged.
if git diff --cached --quiet -- "$GEN_DIR"; then
  echo "nothing to commit under $GEN_DIR; skipping the commit"
else
  # The pathspec keeps unrelated staged files out of this commit.
  git commit -m "content($FORMAT): batch $BATCH" -- "$GEN_DIR" || { echo "FATAL: commit failed"; exit 1; }
fi

# fast-forward the batch back into the integration branch.
# Three cases. Already an ancestor: a re-run of a batch merged earlier, nothing to do. Integration
# is an ancestor of the batch: the normal sequential case, a clean fast-forward. Neither: the
# branches diverged (batches ran in parallel), so stop and let a human merge rather than force it.
if git merge-base --is-ancestor "$BRANCH" "$INTEGRATION"; then
  echo "$BRANCH is already merged into $INTEGRATION; nothing to merge"
  git checkout "$INTEGRATION" || { echo "FATAL: could not check out $INTEGRATION"; exit 1; }
else
  if ! git merge-base --is-ancestor "$INTEGRATION" "$BRANCH"; then
    echo "FATAL: $BRANCH and $INTEGRATION have diverged (parallel batches?). Nothing was merged; you are still on $BRANCH. Merge by hand: git checkout $INTEGRATION; git merge $BRANCH"
    exit 1
  fi
  git checkout "$INTEGRATION" || { echo "FATAL: could not check out $INTEGRATION"; exit 1; }
  git merge --ff-only "$BRANCH" || { echo "FATAL: --ff-only merge of $BRANCH into $INTEGRATION failed; state left intact"; exit 1; }
fi

# publish, only when explicitly asked.
if [ "$PUSH_TO_MAIN" != "1" ]; then
  echo; echo "===== batch complete (not published) ====="
  echo "The batch is merged into $INTEGRATION locally. main and origin were NOT touched."
  echo "To publish:  git checkout main; git merge --ff-only $INTEGRATION; git push origin main"
else
  echo; echo "===== publishing (PUSH_TO_MAIN=1) ====="
  if ! git merge-base --is-ancestor main "$INTEGRATION"; then
    echo "FATAL: main is not an ancestor of $INTEGRATION, so the merge into main is not a fast-forward. Nothing was pushed. Catch $INTEGRATION up first: git checkout $INTEGRATION; git merge --ff-only main"
    exit 1
  fi
  git checkout main || { echo "FATAL: could not check out main"; exit 1; }
  git merge --ff-only "$INTEGRATION" || { echo "FATAL: --ff-only merge of $INTEGRATION into main failed; nothing was pushed"; exit 1; }
  git push origin main || { echo "FATAL: push to origin main failed"; exit 1; }
  PUSHED="$(git rev-parse --short HEAD)"
  git checkout "$INTEGRATION"
  echo; echo "===== batch complete (published) ====="
  echo "pushed $PUSHED to origin/main"
fi

echo "posts:              ls $GEN_DIR/*.json"
echo "correctness report: $BATCH_DIR/correctness_report.json"
echo "human-sound report: $BATCH_DIR/humansound_report.json"
echo "Read the two reports and skim the posts, then seed to publish."
echo "Publish: python backend/seed.py"
