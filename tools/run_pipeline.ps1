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
# Usage (from the repo root, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File tools\run_pipeline.ps1 facts
#   powershell -ExecutionPolicy Bypass -File tools\run_pipeline.ps1 facts 2026-07-03-d

param(
  [Parameter(Mandatory = $true)][string]$Format,
  [string]$Batch = ((Get-Date -Format 'yyyy-MM-dd') + '-a')
)

$ErrorActionPreference = 'Stop'
# Do not let a native command (git, claude) abort the script on benign stderr / non-zero.
$PSNativeCommandUseErrorActionPreference = $false

$BatchSize = if ($env:BATCH_SIZE) { $env:BATCH_SIZE } else { '5' }

# ---- move to repo root ------------------------------------------------------
$RepoRoot = (& git rev-parse --show-toplevel).Trim()
Set-Location $RepoRoot

$Checker    = 'tools/texture_check.py'
$PromptsDir = "tools/pipeline_prompts/$Format"
$GenDir     = "docs/content-structure/generated/$Format"
$BatchDir   = "$GenDir/_batches/$Batch"
$Branch     = "bulk/$Format-$Batch"

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

# ---- feature branch (already exists on a resume; branch --list never errors) --
$exists = & git branch --list $Branch
if ([string]::IsNullOrWhiteSpace($exists)) { & git checkout -b $Branch } else { & git checkout $Branch }
if ($LASTEXITCODE -ne 0) { Write-Error "FATAL: could not check out branch $Branch"; exit 1 }
Write-Host "format=$Format batch=$Batch size=$BatchSize branch=$Branch"

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

# ---- hand back to the human -------------------------------------------------
Write-Host ""
Write-Host "===== batch complete ====="
Write-Host "posts:               Get-ChildItem $GenDir/*.json"
Write-Host "correctness report:  $BatchDir/correctness_report.json"
Write-Host "human-sound report:  $BatchDir/humansound_report.json"
Write-Host "Read the two reports and skim the posts, then seed and merge to publish."
Write-Host "Publish:  python backend/seed.py"
