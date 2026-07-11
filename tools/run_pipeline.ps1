# tools/run_pipeline.ps1
#
# Windows PowerShell driver for the six-step bulk generation pipeline (Architecture A).
# Native Windows, no Linux or WSL needed.
#
# Each step is a SEPARATE `claude --print` process, so no step can see another's reasoning.
# The only channel between steps is files on disk. Role separation is therefore structural:
# whoever generated does not review, whoever reviewed does not correct, and the human-sound
# read is genuinely cold.
#
# RESUME: each step writes a marker file (.stepN.done) in the batch dir when it succeeds. On a
# re-run of the SAME batch name, steps whose marker already exists are skipped, so a run that
# died mid-way (for example on a usage limit) continues from the first unfinished step instead
# of repeating the expensive early steps. To force a full rebuild, use a new batch name (or
# delete the .stepN.done markers in the batch dir).
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
# Usage (from the repo root, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File tools\run_pipeline.ps1 facts
#   powershell -ExecutionPolicy Bypass -File tools\run_pipeline.ps1 facts 2026-07-03-d
#   $env:PUSH_TO_MAIN=1; powershell -ExecutionPolicy Bypass -File tools\run_pipeline.ps1 facts

param(
  [Parameter(Mandatory = $true)][string]$Format,
  [string]$Batch = ((Get-Date -Format 'yyyy-MM-dd') + '-a')
)

$ErrorActionPreference = 'Stop'
# Do not let a native command (git, claude) abort the script on benign stderr / non-zero.
$PSNativeCommandUseErrorActionPreference = $false

$BatchSize = if ($env:BATCH_SIZE) { $env:BATCH_SIZE } else { '5' }
# Publishing is opt-in. Anything other than exactly "1" (unset, empty, "0") leaves main and origin alone.
$PushToMain = ($env:PUSH_TO_MAIN -eq '1')

# ---- move to repo root ------------------------------------------------------
$RepoRoot = (& git rev-parse --show-toplevel).Trim()
Set-Location $RepoRoot

$Checker    = 'tools/texture_check.py'
$PromptsDir = "tools/pipeline_prompts/$Format"
$GenDir     = "docs/content-structure/generated/$Format"
$BatchDir   = "$GenDir/_batches/$Batch"
$Branch     = "bulk/$Format-$Batch"
$Integration = "integration/$Format-all"

# ---- tools the unattended run is allowed to use (keep SPACE-FREE for PowerShell 5.1) --------
$AllowedTools = "WebSearch,WebFetch,Read,Edit,Write,MultiEdit,Bash"

# ---- model + effort per step ------------------------------------------------
$Steps = @(
  @{ N=1; Model='claude-sonnet-4-6'; Effort='high';  Label='topic finding (writes manifest.json)' },
  @{ N=2; Model='claude-opus-4-8';   Effort='xhigh'; Label='generation (writes posts, self-checks)' },
  @{ N=3; Model='claude-opus-4-8';   Effort='high';  Label='correctness review (writes correctness_report.json)' },
  @{ N=4; Model='claude-opus-4-8';   Effort='high';  Label='correctness correction (applies report)' },
  @{ N=5; Model='claude-opus-4-8';   Effort='xhigh'; Label='human-sound review COLD (writes humansound_report.json)' },
  @{ N=6; Model='claude-opus-4-8';   Effort='high';  Label='prose-only correction (applies report)' }
)

# ---- preflight (fail loudly) ------------------------------------------------
if (-not (Test-Path $Checker))    { Write-Error "FATAL: checker not found at $Checker"; exit 1 }
if (-not (Test-Path $PromptsDir)) { Write-Error "FATAL: no rendered prompts at $PromptsDir"; exit 1 }
foreach ($n in 1..6) {
  if (-not (Test-Path "$PromptsDir/step$n.txt")) { Write-Error "FATAL: missing $PromptsDir/step$n.txt"; exit 1 }
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Write-Error "FATAL: claude CLI not on PATH"; exit 1 }

New-Item -ItemType Directory -Force -Path $BatchDir | Out-Null

# ---- integration branch: the fixed branch that always holds the full catalog --
# Created from main once, on the very first batch of a format. Never recreated after that.
& git rev-parse --verify --quiet "refs/heads/$Integration" | Out-Null
if ($LASTEXITCODE -ne 0) {
  & git rev-parse --verify --quiet 'refs/heads/main' | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: no main branch to create $Integration from"; exit 1 }
  & git branch $Integration main
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not create $Integration from main"; exit 1 }
  Write-Host "created integration branch $Integration from main"
}

# ---- batch branch, cut FROM the integration branch so it sees every earlier batch ----
# On a resume the branch already exists: check it out instead of recreating it.
& git rev-parse --verify --quiet "refs/heads/$Branch" | Out-Null
if ($LASTEXITCODE -ne 0) { & git checkout -b $Branch $Integration } else { & git checkout $Branch }
if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not check out branch $Branch"; exit 1 }
Write-Host "format=$Format batch=$Batch size=$BatchSize branch=$Branch integration=$Integration"

# ---- helper: run one step as its own fresh process, with resume marker ------
function Invoke-Step {
  param([int]$N, [string]$Model, [string]$Effort, [string]$Label)
  $marker = Join-Path $BatchDir (".step$N.done")
  if (Test-Path $marker) {
    Write-Host ""
    Write-Host "===== STEP $N`: $Label  (SKIPPED, already done on a previous run) ====="
    return
  }
  Write-Host ""
  Write-Host "===== STEP $N`: $Label  (model $Model, effort $Effort) ====="
  $prompt = (Get-Content -Raw "$PromptsDir/step$N.txt") `
              -replace '\{\{BATCH\}\}', $Batch `
              -replace '\{\{BATCH_SIZE\}\}', $BatchSize
  $prompt | & claude --print --model $Model --effort $Effort `
              --permission-mode acceptEdits --allowedTools $AllowedTools
  if ($LASTEXITCODE -ne 0) {
    Write-Error "FATAL: step $N failed; stopping. Nothing after this step ran. When ready, re-run the SAME batch name ($Batch) to resume from step $N."
    exit 1
  }
  # Mark this step done only after a clean exit, so a mid-step abort re-runs the whole step.
  New-Item -ItemType File -Force -Path $marker | Out-Null
}

# ---- the six steps, six fresh processes (skipping any already marked done) --
foreach ($s in $Steps) { Invoke-Step $s.N $s.Model $s.Effort $s.Label }

# ---- commit the generated content -------------------------------------------
# Stage only this format's generated posts and _recent_moves.md. The per-batch reports and the
# .stepN.done markers live under _batches/, which .gitignore excludes, so they stay uncommitted.
Write-Host ""
Write-Host "===== committing batch ====="
& git add -- $GenDir
if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not stage $GenDir"; exit 1 }
# git diff --cached --quiet exits non-zero when there is something staged.
& git diff --cached --quiet -- $GenDir
if ($LASTEXITCODE -eq 0) {
  Write-Host "nothing to commit under $GenDir; skipping the commit"
} else {
  # The pathspec keeps unrelated staged files out of this commit.
  & git commit -m "content($Format): batch $Batch" -- $GenDir
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: commit failed"; exit 1 }
}

# ---- fast-forward the batch back into the integration branch ----------------
# Three cases. Already an ancestor: a re-run of a batch merged earlier, nothing to do. Integration
# is an ancestor of the batch: the normal sequential case, a clean fast-forward. Neither: the
# branches diverged (batches ran in parallel), so stop and let a human merge rather than force it.
& git merge-base --is-ancestor $Branch $Integration
if ($LASTEXITCODE -eq 0) {
  Write-Host "$Branch is already merged into $Integration; nothing to merge"
  & git checkout $Integration
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not check out $Integration"; exit 1 }
} else {
  & git merge-base --is-ancestor $Integration $Branch
  if ($LASTEXITCODE -ne 0) {
    Write-Error "FATAL: $Branch and $Integration have diverged (parallel batches?). Nothing was merged; you are still on $Branch. Merge by hand: git checkout $Integration; git merge $Branch"
    exit 1
  }
  & git checkout $Integration
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not check out $Integration"; exit 1 }
  & git merge --ff-only $Branch
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: --ff-only merge of $Branch into $Integration failed; state left intact"; exit 1 }
}

# ---- publish, only when explicitly asked -------------------------------------
if (-not $PushToMain) {
  Write-Host ""
  Write-Host "===== batch complete (not published) ====="
  Write-Host "The batch is merged into $Integration locally. main and origin were NOT touched."
  Write-Host "To publish:  git checkout main; git merge --ff-only $Integration; git push origin main"
} else {
  Write-Host ""
  Write-Host "===== publishing (PUSH_TO_MAIN=1) ====="
  & git merge-base --is-ancestor main $Integration
  if ($LASTEXITCODE -ne 0) {
    Write-Error "FATAL: main is not an ancestor of $Integration, so the merge into main is not a fast-forward. Nothing was pushed. Catch $Integration up first: git checkout $Integration; git merge --ff-only main"
    exit 1
  }
  & git checkout main
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not check out main"; exit 1 }
  & git merge --ff-only $Integration
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: --ff-only merge of $Integration into main failed; nothing was pushed"; exit 1 }
  & git push origin main
  if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: push to origin main failed"; exit 1 }
  $Pushed = (& git rev-parse --short HEAD).Trim()
  & git checkout $Integration
  Write-Host ""
  Write-Host "===== batch complete (published) ====="
  Write-Host "pushed $Pushed to origin/main"
}

# ---- hand back to the human -------------------------------------------------
Write-Host "posts:               Get-ChildItem $GenDir/*.json"
Write-Host "correctness report:  $BatchDir/correctness_report.json"
Write-Host "human-sound report:  $BatchDir/humansound_report.json"
Write-Host "Read the two reports and skim the posts, then seed to publish."
Write-Host "Publish:  python backend/seed.py"
