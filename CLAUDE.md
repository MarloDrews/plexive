# Plexive

Open source social media app that replaces doomscrolling with valuable content.

## Tech Stack
- Backend: Python FastAPI
- Frontend: Next.js
- Database: Supabase PostgreSQL (connection via `DATABASE_URL` in `backend/.env`)
- License: AGPL v3

## Content Model

Posts use a `sections` JSON array and a `feed_card` JSON object. The old per-format fields (`hook`, `key_points`, `details`, `body`, etc.) are removed.

- Full schema spec: `docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md`
- Books skeleton: `docs/content-structure/skeletons/books_skeleton.jsonc`
- Books example: `docs/content-structure/examples/books_example.json`
- Style guide: `docs/content-structure/STYLE_GUIDE_LONGFORM.md`

SVG security: `is_user_content=false` (seed/official) uses `dangerouslySetInnerHTML`; `is_user_content=true` (user submissions) uses a base64 `<img>` data URL. This applies in `SectionRenderer` (CoreIdeasSection, TakeawaySection) and `PostCard`.

## Git Workflow

`main` is protected by a ruleset: the `android-build`, `backend-checks` and `frontend-checks` status checks are required and force pushes are blocked. A commit therefore cannot be pushed straight to `main`, because a fresh commit has no check result yet.

Changes reach `main` this way: branch off `main`, push the branch, open a pull request, let the three checks go green on it, then merge. This is not a review requirement; the same person may open and merge the pull request.

All three run once per pull request, on the `pull_request` trigger. Pushing a branch on its own produces no run, so the checks appear only once the pull request exists.

## CI Notes

The workflow uses `distribution: corretto` because `mobile-kmp/gradle/gradle-daemon-jvm.properties` pins `toolchainVendor=AMAZON`. Any other vendor makes Gradle ignore the installed JDK and download Corretto from foojay on every run. Changing that line means changing `.github/workflows/android-build.yml` too.

The `push` trigger is scoped to `branches: [main]` on purpose. Unscoped, it also fires on the branch behind a pull request, so one commit gets two runs reporting the same `android-build` check name and the required check resolves to whichever finishes last. Do not widen it to make branches build; branches build through their pull request. Keeping `main` is what seeds the Gradle dependency cache, since `setup-gradle` only writes the cache from the default branch, and a cold run takes about 3m25s against about 40s warm.

There are five workflow files. Three are gates, one per codebase, one job each: `android-build.yml`, `backend-checks.yml`, `frontend-checks.yml`. One job per codebase on purpose. The number of check names a person has to interpret on a pull request is the real budget, and three is what it will bear.

`codeql.yml` and `dependency-submission.yml` are the other two, and neither is a gate. Both are deliberately absent from the ruleset, so the required checks are still exactly those three, and they are the reason the sentence above says "three gates" rather than "three workflows".

`codeql.yml` breaks one of the patterns below on purpose: it runs a matrix, so it contributes two check names, `codeql (python)` and `codeql (javascript-typescript)`, neither of which is required. Its languages are `python` and `javascript-typescript`; `java-kotlin` is excluded because CodeQL cannot analyse Kotlin without a build -- `build-mode: none` is supported for Java and explicitly not for Kotlin, where it skips the code and emits a warning -- so covering `mobile-kmp/` would mean a second real Gradle build alongside `android-build.yml`. That is a separate decision, not an oversight.

It gained `push: branches: [main]` on 2026-08-27, so its triggers are now push-on-main plus `schedule:` plus `pull_request:`. This matters because code scanning tracks alerts against the DEFAULT BRANCH: the Security tab is populated by runs on `main`, and a pull request run reports on that pull request alone. Before the push trigger the baseline came from the weekly schedule alone, so a merge did not refresh the Security tab and the baseline could be up to a week stale. That was traded for one extra run per merge, deliberately and on the user's instruction, because Actions minutes are unmetered on a public repository and a stale baseline is the more expensive of the two. The schedule stays, but its job has changed: it is no longer what establishes the baseline, it is what keeps the analysis fresh against newly published CodeQL queries during a week with no merges.

Adding it also silenced a warning worth recording, because it will not appear again and someone reading old logs will meet it. While there was no `push:` trigger, `codeql-action/init` emitted `##[warning]1 issue was detected with this workflow: Please specify an on.push hook to analyze and see code scanning alerts from the default branch on the Security tab.` on EVERY run, once per matrix leg. It was a static lint on the workflow file, not a report that anything failed, and it was wrong in the narrow sense that scheduled runs did execute on `main` and their analyses were default-branch analyses. The real gap it pointed at was the latency described above.

`dependency-submission.yml` is the fifth, added 2026-08-27, and it runs `gradle/actions/dependency-submission@v4` over `mobile-kmp/` to close the Gradle dependency-graph gap described under Repository Security Settings. It is a separate workflow rather than a step in `android-build.yml`, for three reasons in order of weight. Permissions: submitting a snapshot needs `contents: write`, and folding it into `android-build` would hand write scope to the job that builds unreviewed pull request code, which runs `contents: read` today. Triggers: a snapshot describes the DEFAULT BRANCH, so this must run on `main` only, while `android-build` must run on pull requests; one file cannot hold both without one of them firing where it should not. Cost: the action runs its own Gradle invocation, and inside `android-build` that time would land on a required check, whereas a separate workflow runs in parallel and slows the gate by nothing. It also leaves `android-build`'s compile-task assertion alone, which parses that job's own `--console=plain` log and would otherwise have a second Gradle run's output to contend with. It never runs on `pull_request`, so it contributes no check name to any pull request, which is the strongest form of "not a gate" available.

First run on `main` under the new `push:` trigger, 2026-08-27, on the merge that added the trigger: 87 rules and 0 results for `javascript-typescript`, 43 rules and **1** result for `python`. That one result is the first entry the Security tab has ever had: `py/clear-text-logging-sensitive-data`, high, at `backend/seed.py:239`, where the seed script prints a generated admin password to stdout when `SEED_ADMIN_PASSWORD` is unset. It is deliberate code -- the message it prints says "Save this now" -- so this is a triage decision, not a bug report, and it has NOT been acted on.

Worth recording because it is the argument for the push trigger, made by the trigger itself on its first run: the pull request run on the SAME commit reported 43 rules and 0 results for `python`, so the pull request leg did not surface this and the scheduled run would not have surfaced it for up to a week. The difference is scope, not luck -- a pull request analysis reports against that pull request, a default-branch analysis establishes the baseline -- and this is exactly the staleness the trigger was added to remove.

First run, 2026-08-27, on the pull request that added the file: 87 rules and 0 results for `javascript-typescript`, 43 rules and 0 results for `python`. Zero is the real number and not a vacuous pass -- GitHub's own `code-scanning/analyses` API reports the same two rule counts the in-workflow SARIF assertion did, and CodeQL hard-fails rather than passing quietly when it finds no code of a language it was asked for, so both databases finalized over real source. The default query suite is the high-precision security one, so this says nothing about the 88 ESLint errors, which are a different tool asking a different question.

No workflow has a `paths:` filter. A workflow skipped by a top-level `paths:` filter reports no status at all, and a required check that never reports blocks the pull request permanently. Actions minutes are unmetered here, so the saving would buy nothing anyway.

Every job sets `shell: bash` explicitly. The Linux default is `bash -e {0}`, without `pipefail`, which is how a piped failure becomes a green check; `shell: bash` is `bash --noprofile --norc -eo pipefail {0}`. This already bit the Android workflow once.

Every check asserts on a count, not only on an exit code, because all of them can pass having checked nothing: a loop that globs no files exits 0, `compileall` over a wrong path exits 0, `npm test` with no matching files exits 0 reporting `pass 0`. The counts are floors well below what was observed, not exact numbers: a route count or a test count moves with normal feature work, and a gate that reds during correct work is a gate that gets switched off. The floors that sit at their observed value (16 suite files, 40 frontend tests) only move down through a deliberate deletion, which is worth a deliberate edit here.

The backend suites run as a per-file subprocess loop, not `pytest tests`. 12 of the 16 suites execute their whole body at import and share one app instance, one in-memory rate limiter and the first module's temp SQLite file, so in one process they collide: pytest collects 92 of about 979 assertions and interrupts on 4 collection errors. The loop also runs every suite after one fails, so a second failure is not hidden behind the first.

The `backend-checks` suite loop has hung three times, every time on `battle_test.py`, all three on 2026-08-27, and every time on a commit that touched no backend code. Three for three it has also come straight after `arena_test.py` passed.

First: `arena_test.py` passed, `battle_test.py` then produced no output for 19 minutes, and the commit had touched one line of ARCHITECTURE.md. The run was cancelled by hand and re-run unchanged, and `battle_test.py` passed in 2.681 s. Second: same suite, again straight after `arena_test.py` passed, on a commit touching ARCHITECTURE.md and `frontend/package.json`. This time the `timeout 300s` added after the first occurrence fired at 300.005 s, so the job went red by itself and the summary table still printed and named the suite. Re-run unchanged, `battle_test.py` passed in 2.826 s. Two for two, the failure does not reproduce.

Third: on Dependabot pull request #39, whose entire diff was three lines of `mobile/package-lock.json` and which therefore cannot have touched anything the backend runs. `arena_test.py` passed, `battle_test.py` timed out at 302.297 s, the remaining 13 suites all passed, and a re-run of the job unchanged went green. The instrumentation added after the second occurrence fired exactly as designed and produced the stack.

Rate, so the count is not read as a frequency: 25 runs of this workflow, 3 of them hangs. Note that the second and third are invisible in the Actions run list, because re-running a job overwrites the run's conclusion and it now reads `success`; the evidence is the log of the first attempt, not the run's status.

THE THIRD OCCURRENCE NARROWED IT, and this is the first thing about the cause that is not a guess. The faulthandler dump puts the main thread here:

```
Current thread (most recent call first):
  threading.py line 359 in wait
  concurrent/futures/_base.py line 455 in result
  anyio/from_thread.py line 334 in call
  starlette/testclient.py line 185 in receive
  starlette/testclient.py line 198 in receive_json
  backend/tests/battle_test.py line 124 in <module>
```

Every other thread is idle: two `anyio` worker threads parked in `queue.get`, three portal event loops parked in `selectors.select`. Nothing is spinning and nothing is deadlocked on a lock. The suite is simply blocked forever waiting for a WebSocket frame that never arrives.

`battle_test.py:124` is `fin_a = ws_a.receive_json()`, in the "both finish frames end the room" section that freezes ARCH-004. The sequence is: alice sends `finish`, bob receives `opponent_finish` (line 121, which had already passed), bob sends `finish`, and alice never receives hers. So the narrowed statement is that the second `finish` of a battle is sometimes not relayed to the player who finished first -- a race between the first `finish` tearing the room down and the second one looking for somebody to relay to. That is a real lead pointing at the M142 finish/teardown path, and it supersedes the previous note here, which correctly said the state machine had not been implicated. It now has been. What is still not established is whether the fault is in the state machine or in the suite's own expectation of it, so this is a lead and not a diagnosis.

Starlette moved 1.2.1 -> 1.3.1 between the first two occurrences, which still neither implicates nor clears it: hangs have happened on both versions and the suite passes routinely on both. The `StarletteDeprecationWarning` about `httpx` is not a lead either, it is emitted at import on every run under 1.3.1 including passing ones, and is simply the last thing printed before the dump.

It has still not been fixed, and that is deliberate rather than a default: the third occurrence arrived during a Dependabot merge batch, the lead above was recorded, and changing WebSocket teardown code was outside that batch. The next person to pick this up starts at the finish/teardown path with a named line and a named race, not at nothing.

Each suite therefore runs under `timeout 300s`, and the job carries `timeout-minutes: 20`. 300 s is about 2.3x `thumbnails_test.py`'s 130 s, the slowest healthy suite. The dangerous direction is down: a per-suite timeout that fires on a slow-but-healthy run converts a reliable gate into an unreliable one, which is the fastest way to get a gate switched off, and hosted runner speed is not ours to control. `timeout-minutes: 20` is the backstop for a hang outside the loop, in `pip install` or the boot check. It is about 5x the observed job duration, and it is deliberately loose enough that a suite can burn its full 300 s and the summary table still prints, because a job killed by `timeout-minutes` prints nothing and that table is the only thing that names the suite that hung.

The summary reports four statuses, not two, and the loop runs every remaining suite after any of them. `TIMEOUT` counts as a failure but is not reported as `FAIL`, because the two mean different things and the distinction is the only thing that makes a second occurrence recognisable as a pattern. `KILLED` splits the same way again: `timeout --kill-after` sends SIGKILL, but so does the kernel OOM killer, and both arrive as exit 137. Exit 137 is therefore read as a timeout only when the elapsed time is at least 90 percent of the limit, since `timeout` cannot fire before its own limit; below that it is `KILLED`, cause unknown, with OOM the likely one, and `thumbnails_test.py` is image-heavy and the obvious candidate on a shared runner. Each suite's name is also printed before it is invoked, because its output is redirected to a file and dumped only on failure: without that line a hang leaves the live log completely silent, which is why the first 2026-08-27 hang could only be attributed to a suite by cancelling the run. The second one was attributed from the summary table without touching the run, so this part is load-bearing and is doing its job.

Every suite runs as `python -X faulthandler` and is aborted with `timeout --signal=ABRT`, not the default `SIGTERM`, so that a hang leaves a stack rather than silence. This was measured on the runner rather than assumed, in both directions. `-X faulthandler` only dumps on a FATAL signal, which is SIGSEGV/SIGFPE/SIGABRT/SIGBUS/SIGILL and NOT SIGTERM: with SIGTERM the flag prints nothing at all, so the signal had to change too, and the flag alone would have been a no-op that looked like a fix. The exit code does not change, because GNU `timeout` reports 124 for a timeout whatever signal it sent unless `--preserve-status`, so the classification above is untouched and the 137 branch still catches a suite that outlives ABRT. A timed-out suite now has its FULL log printed instead of the last 40 lines, because the dump is the evidence and tailing it would throw away the top of it.

The rejected alternative was `faulthandler.register(SIGTERM)` from a `sitecustomize.py` on `PYTHONPATH`, which needs no signal change and touches no test file. It dumps, but `register()` does not terminate, so the suite outlived its own dump and `--kill-after` SIGKILLed it: exit 137, landing in the `KILLED` branch that exists to flag a suspected OOM. Buying a traceback by making a timeout indistinguishable from an OOM is a bad trade. One cosmetic side effect remains: `timeout` prints `the monitored command dumped core`, and because `/proc/sys/kernel/core_pattern` pipes to `systemd-coredump` the kernel ignores `RLIMIT_CORE`, so a core is handed to systemd. Nothing is written into the workspace and the runner is ephemeral, so this costs nothing; `ulimit -c 0` is set anyway.

The backend boot check counts `app.openapi()["paths"]`, not `len(app.routes)`. The route count is not a property of this codebase, it is a property of the installed FastAPI version: on the same commit it was 57 on the dev laptop (0.136.3, one flattened `APIRoute` per endpoint) and 23 in CI (0.141.1, where `include_router` leaves one `_IncludedRouter` per router). While `requirements.txt` pinned nothing, both were "correct" on the same day. The OpenAPI path count was 45 on both, so that is what the guard asserts. It is still 45 under the pinned set. Pinning fastapi has since made the route count stable too, and that is not a reason to switch back: the path count describes the API, the route count describes how the installed FastAPI represents it internally. Pinning made the bad measure stable, not correct.

CI mirrors production, not this laptop. `backend/requirements.txt` pins all 69 packages, and `backend-checks.yml` runs on Python 3.13. The versions came from the Pi's `pip freeze` (Python 3.13.5, read 2026-08-27), except six that the 2026-08 security batch moved ahead of it to clear advisories: Pillow 12.3.0, starlette 1.3.1, pyasn1 0.6.4, cryptography 50.0.1, h2 4.4.1 and hpack 4.2.0. For those six the file leads production until someone runs `pip install -r requirements.txt` on the Pi, so CI is testing what the Pi is about to run rather than what it runs today. The minor version is the pin and the patch floats, because the Pi's patch level is not pinned either, so an exact `3.13.5` would mirror production only until the next `apt upgrade`. The laptop is still on 3.12.10, which is a known remaining divergence; the pinned set installs and passes there too, but nothing gates it.

`frontend-checks.yml` (Node 24) is still a de facto pin in the old sense: nothing pins Node anywhere, and there is no production Node to mirror, since Vercel builds the frontend.

Pinning every transitive package means none of them receives a security update on its own any more. Dependabot security updates were switched on for exactly this cost, and they are the automatic half now: an advisory against a pinned package raises an alert and Dependabot opens the bump as a pull request, which then goes through the same three checks as anything else. `pip-audit` is still in `requirements-dev.txt` with a comment saying to run it before a release, and nothing runs it. That was already true; pinning is what makes it matter. It was finally run by hand on 2026-08-27 and reported 23 distinct advisories across 6 packages, against a comment in `requirements-dev.txt` asserting there was one. The 2026-08 security batch cleared 22 of them; the remaining one is `ecdsa` PYSEC-2026-1325, which has no fix version. Nothing runs `pip-audit` automatically even now, so the next reading of this paragraph should assume the number has drifted again.

`backend-checks` asserts that pip installed exactly what the requirements files say, rather than trusting that pinning worked. The step has its own floor on the number of pins it parsed, because a parser that matches nothing compares nothing and reports green.

ESLint is deliberately not in `frontend-checks`. It reports 88 errors and 13 warnings on tracked files, so it cannot gate anything until those are cleared, and a check that reports without ever failing is noise.

`gradle/actions/setup-gradle@v4` emits a Node.js 20 deprecation warning on every run. v4 was chosen over v6 for predictability, and that argument weakens as v4 ages. Revisit when v6's cache provider leaves free preview.

## Repository Security Settings

These are repository settings, not files, so nothing in the tree records them and `git log` will not show them changing. Enabled 2026-08-27, all free because the repository is public.

`secret_scanning` and `secret_scanning_push_protection` were ALREADY on before this batch, which is worth knowing before anyone claims credit for them: GitHub switches both on by default for public repositories. `dependabot_security_updates` was off and was switched on, together with the Dependabot alerts it depends on. Still off and deliberately untouched: `secret_scanning_validity_checks` and `secret_scanning_non_provider_patterns`, the latter because non-provider patterns are the generic ones and their false positive rate is the whole question.

Push protection was verified to BLOCK rather than merely to be configured, the same way the force-push block was. A throwaway branch carrying five invented credentials was pushed and the push was declined with `GH013: Repository rule violations found`, naming Amazon AWS Access Key ID, Amazon AWS Secret Access Key, SendGrid API Key, Slack API Token and Stripe API Key, each with an unblock URL. The branch never reached the remote, since the push is refused before the ref is created, so cleanup was a local `git branch -D` and nothing else. No real credential was involved at any point.

Code scanning uses the ADVANCED setup, meaning `.github/workflows/codeql.yml`, and GitHub's default setup is deliberately left `not-configured`. The two are mutually exclusive: enabling default setup would disable the workflow.

`mobile-kmp/` had no dependency scanning at all until 2026-08-27, and the gap was worth naming because it was invisible from the Security tab. Dependabot security updates are driven by alerts, alerts are driven by the dependency graph, and the dependency graph does not parse Gradle statically -- Maven `pom.xml` it reads, Gradle it does not, and Gradle reaches the graph only through the Dependency Submission API, which means running a real build. The repository SBOM confirmed the effect rather than assuming it: 1268 packages, not one of them a Maven coordinate, while every backend pin, both `package-lock.json` files and all five pinned actions were there.

It is closed by `.github/workflows/dependency-submission.yml`, which submits the resolved graph on every push to `main`. Measured rather than assumed, the same way the 1268/0 reading was taken: `gh api repos/:owner/:repo/dependency-graph/sbom`, counting `pkg:maven/` external refs. First submission, 2026-08-27, on the merge that added the workflow: the SBOM went from 1268 packages and 0 Maven coordinates to 1965 packages and 696 Maven coordinates. The ecosystem split is now 1189 npm, 696 maven, 71 pypi, 8 githubactions. That count is the evidence the thing works, and it is what to re-read if anyone doubts it later; the workflow going green is not the same claim, because a Gradle build that resolved nothing would also go green.

What it buys BEYOND the coordinates is an observation still to be made, not a promise. Coordinates in the graph are what alerts are raised against, but no alert exists until a real advisory matches something `mobile-kmp/` actually resolves, and Dependabot opens a pull request only when there is a fix version to move to. As of the first submission, `mobile-kmp/` produced no alerts at all. A quiet Security tab for `mobile-kmp/` is therefore not by itself evidence either way; the coordinate count is.

The submission run costs about 94 s and is a separate workflow, so `android-build` is untouched: it ran 82 s on the same merge, against 71-122 s across the preceding main pushes, and its `:shared:compileAndroidMain` / `:androidApp:compileDebugKotlin` assertion still reports both tasks as executed.

The remaining `ecdsa` PYSEC-2026-1325 advisory will not produce a Dependabot pull request. It has no fix version, and Dependabot opens a pull request only when there is a version to move to. Its silence on that one is not a sign that it is not working.

## Rules
- All code comments in English
- No emojis in code or comments
- I am a beginner, briefly explain what you are doing and why
- Always ask before making changes outside the current task
- After every change, update ARCHITECTURE.md. One line per new or changed item. No explanations beyond what is already there — just add or update the relevant entry. Never let it grow into prose.
- A change that makes existing documentation false must correct it in the same commit or the same batch, even when that falls outside the stated scope. This covers ARCHITECTURE.md, CLAUDE.md and the CI notes. Scope boundaries exist to prevent creep, not to preserve known-false text.
