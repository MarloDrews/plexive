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
# Usage (from repo root): tools/run_pipeline.sh facts [batch]
#   BATCH_SIZE=3 tools/run_pipeline.sh facts 2026-07-03-d

set -uo pipefail

FORMAT="${1:?usage: run_pipeline.sh <format> [batch]}"
BATCH="${2:-$(date +%Y-%m-%d)-a}"
BATCH_SIZE="${BATCH_SIZE:-5}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CHECKER="tools/texture_check.py"
PROMPTS_DIR="tools/pipeline_prompts/$FORMAT"
GEN_DIR="docs/content-structure/generated/$FORMAT"
BATCH_DIR="$GEN_DIR/_batches/$BATCH"
BRANCH="bulk/$FORMAT-$BATCH"
ALLOWED_TOOLS="WebSearch,WebFetch,Read,Edit,Write,MultiEdit,Bash"

# preflight
[ -f "$CHECKER" ] || { echo "FATAL: checker not found at $CHECKER"; exit 1; }
[ -d "$PROMPTS_DIR" ] || { echo "FATAL: no rendered prompts at $PROMPTS_DIR"; exit 1; }
for n in 1 2 3 4 5 6; do
  [ -f "$PROMPTS_DIR/step$n.txt" ] || { echo "FATAL: missing $PROMPTS_DIR/step$n.txt"; exit 1; }
done
command -v claude >/dev/null 2>&1 || { echo "FATAL: claude CLI not on PATH"; exit 1; }

mkdir -p "$BATCH_DIR"

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then git checkout "$BRANCH"; else git checkout -b "$BRANCH"; fi
echo "format=$FORMAT batch=$BATCH size=$BATCH_SIZE branch=$BRANCH"

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

echo; echo "===== batch complete ====="
echo "posts:              ls $GEN_DIR/*.json"
echo "correctness report: $BATCH_DIR/correctness_report.json"
echo "human-sound report: $BATCH_DIR/humansound_report.json"
echo "Read the two reports and skim the posts, then seed and merge to publish."
echo "Publish: python backend/seed.py"
