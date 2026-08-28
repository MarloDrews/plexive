# Mutation testing the backend, 2026-08-28

Status: COMPLETE for the two targets in the brief. Written incrementally, phase
by phase, so a run that died partway would still have left everything it had
established - which turned out to matter twice.

Uncommitted by instruction. Not on a branch of its own, not pushed.

## Headline

Both targets measured in full. 195 mutants, every one tested.

| module | mutants | killed | survived | timeout | suspicious | score |
|---|---:|---:|---:|---:|---:|---:|
| `app/elo.py` | 108 | 59 (60 after triage) | 48 | 0 | 1 | **54.6%** (55.6%) |
| `app/auth.py` | 87 | 56 | 31 | 0 | 0 | **64.4%** |
| **total** | **195** | **116** | **79** | **0** | **1** | **59.5%** |

**79 survivors, all opened and read.** Categorised: 5 equivalent, 42 untested
behaviour, **32 weak oracle** - a test runs the mutated line, observes the
result, and passes anyway.

The three things worth waking up for:

1. **`elo.py` is tested almost entirely by SIGN.** Of the 15 assertions in the
   whole backend that touch a rating or a delta, exactly ONE pins a number
   (`arena_test.py:206`, `== 1000`). The rest check `> 0`, `< 0`, `> 1000`, or
   compare two outputs of the same code. Consequence: `K`, the Elo base, the 400
   scale, the difficulty ratings, the time bonus and the Arena averaging can all
   be wrong and every test still passes. This is the LLM-oracle failure the brief
   went looking for, and it is the dominant mode here - not an occasional slip.
2. **The most-documented decisions are the least defended.** `elo.py`'s docstring
   and `ARCHITECTURE.md` both state that Arena deltas are "AVERAGED (not summed)
   so a 4-player match moves a rating about as much as one duel would". Mutant #87
   replaces that division with a multiplication - 9x the intended swing - and
   nothing notices. Same for the 1 / 0.5 / 0 tie rule (#75, #78).
3. **`verify_password` will accept any password for a passwordless account and no
   test would know.** `auth.py:71` `return False` -> `return True` survives; that
   line is the NULL-`password_hash` guard, which is what Google-only sign-in
   produces. No suite executes it.

Nothing here is a report of a bug in the product. Every mutation was reverted;
the code is as it was. These are gaps in what the tests would CATCH.

## Waiting on Marlo

Nothing is blocking. If that changes it is written here first.

One discrepancy with the brief, recorded rather than acted on: the brief said "the
two untracked docs files under `docs/` are deliberate local notes and must survive
the night untouched". There are none. `git status --porcelain --untracked-files=all`
at the start of this session returned EMPTY, on branch `docs/closed-beta-lockout`,
and `docs/research/` contained exactly five committed files. Nothing was stashed,
cleaned or committed; there was simply nothing there. If those notes existed on
another machine or another branch, they are not here.

## 1. Scoping

### 1.1 How many mutants a full run would generate

Counted, not estimated, using mutmut's own mutation generator against every
`.py` file under `backend/app/` (`mutmut.list_mutations` over a `mutmut.Context`
per file, `__pycache__` excluded). The script is reproduced in section 8.

**10,338 mutants across 59 files.** The heaviest files:

| mutants | file |
|--------:|------|
| 1102 | `app/train_bank.py` |
|  802 | `app/routers/stats.py` |
|  682 | `app/thumbnails/render.py` |
|  595 | `app/thumbnails/generators.py` |
|  540 | `app/routers/arena.py` |
|  424 | `app/schemas.py` |
|  372 | `app/thumbnails/projection.py` |
|  313 | `app/models.py` |
|  311 | `app/routers/chat.py` |
|  304 | `app/sanitize.py` |
|  303 | `app/routers/auth.py` |

The two targets named in the brief:

- **`app/elo.py`: 108 mutants**
- **`app/auth.py`: 87 mutants**

### 1.2 The cost of one mutant

Two numbers decide this: how long the tests take, and which tests can actually
see a mutation in the target.

**Whole suite, measured, this machine, throwaway env: 149.5 s** for all 17
suites (table in section 3). So the naive run is:

> 10,338 mutants x 149.5 s = **1,545,531 s = 17.9 days.**

That is the number that makes the naive run infeasible, and it is established
here rather than discovered at 4am.

Running all 17 suites per mutant is also the wrong shape, not merely the slow
one, so the next question is which suites can see `elo.py` at all. Measured with
`coverage` per suite, `--include="*elo.py"`, one process per suite exactly as the
gate runs them. `elo.py` has 72 executable statements:

| suite | elo.py cover | what it reaches |
|---|---:|---|
| `smoke_test.py` | **57%** | `question_rating` (happy path), `expected_score`, `time_factor` (fast branch), `_update`, `apply_answer`, `apply_answer_timed`, `elo_summary` |
| `security_test.py` | 57% | **exactly the same lines as `smoke_test.py`** |
| `arena_test.py` | **64%** | `expected_score`, `match_delta`, `apply_match` |
| `contract_test.py` | 31% | `elo_summary` only |
| `closed_beta_test.py` | 31% | `elo_summary` only |
| `query_perf_test.py` | 31% | `elo_summary` only |
| 6 others | 28% | module-level constants only (the import) |
| `edges`, `graph`, `identity`, `rate_limit`, `report_edges` | none | never import it |

The split is clean and it decides the runner: **nothing but `arena_test.py`
executes `match_delta` or `apply_match`, and nothing but `smoke_test.py` /
`security_test.py` executes `_update`.** A runner of `smoke_test.py` alone would
report every mutant in `match_delta` and `apply_match` as a survivor for the
trivial reason that the code never ran, which is a measurement artifact and not
a finding.

**A result that falls straight out of the coverage, before any mutation ran.**
The union of all 17 suites, taken with `coverage combine` over the 17 per-suite
data files rather than by eye, is **92%** of `elo.py`. The 6 statements nothing
ever executes are:

- **46-47** - the `except TypeError` fallback in `question_rating`.
- **57-59** - the `answer_ms >= SLOW_MS` branch of `time_factor` and the linear
  interpolation between `FAST_MS` and `SLOW_MS`. Only the fast branch is ever
  taken, because the only train answer any suite sends is `answer_ms: 1000`.
- **121** - `return 0.0` for `match_delta` with no opponents.

Seven of the 108 mutants sit on those lines and therefore cannot be killed by
any backend test that exists. They are counted with the rest below rather than
excused, but the reason they survive is settled in advance.

### 1.3 What was chosen

**Runner: `smoke_test.py && contract_test.py && security_test.py && arena_test.py`**,
in that order, cheapest first so a mutant killed by `smoke_test.py` costs about
4 s instead of the full chain. That is every suite that executes any function
body in `elo.py`, plus the two cheap ones that reach `elo_summary`.
`closed_beta_test.py` and `query_perf_test.py` were left out: they add the same
`elo_summary` lines `contract_test.py` already contributes and assert nothing
about rating.

Chain cost, measured:

- **42.4 s** unloaded, all four suites, green.
- **78.7 s** worst of 12 chains run concurrently on this 12-core laptop,
  all 12 green. That is the deliberate-oversubscription figure, taken the same
  way CLAUDE.md derived the 180 s suite watchdog.

**Per-mutant timeout: `-m 4.0 -b 60`**, i.e. mutmut's measured baseline x 4 plus
60 s. With a ~42 s baseline that is about **228 s**, which is **2.9x the 78.7 s
worst healthy run under 12x oversubscription**. Not a round number and not a
guess: the dangerous direction is DOWN, because a timeout that fires on a
slow-but-healthy chain turns a survivor into a fake "timeout" and quietly
corrupts the score. mutmut runs one test process at a time, so real contention
during the run is far below the 12x the margin is sized against.

**Budget:** 108 mutants x 42.4 s worst case = **76 minutes** if every single
mutant survives the whole chain. Mutants killed by `smoke_test.py` cost about
4 s, so the real figure is lower.

Outturn: **66 minutes** of actual mutation time for `elo.py` (46 min for the
first 91 mutants, ~20 min for the last 17 after the interruption in 7.5), and
about **20 minutes** for `auth.py`'s 87. The estimate was good because the
survivor rate was high - 44% of `elo.py`'s mutants paid the full chain.

**What was left out, and it is most of the backend.** 10,338 - 108 - 87 = 10,143
mutants, 98.1% of `backend/app/`, were not measured. Section 6 says what a wider
run would take.

## 2. Runner verification

A mutation run that reports a perfect score because it never actually ran the
tests is this project's own recurring failure shape, so the runner was proved to
kill before it was trusted to report survivors. Two mutations were made BY HAND,
in a second throwaway copy of `backend/` (never the repository), and the chosen
invocation was watched failing.

**A - the `_update` leg.** `app/elo.py:81`,
`actual = 1.0 if correct else 0.0` -> `actual = 1.0 if correct else 1.0`
(this is mutmut's own mutant #49). A wrong answer now scores as a right one.

```
smoke_test rc=1
AssertionError: FAIL: elo delta negative {'correct': False, ..., 'elo': {'rating': 1031, 'delta': 15.3, ...}}
```

**B - the `apply_match` leg.** `app/elo.py:170`,
`new_rating = max(FLOOR_RATING, rating + delta)` -> `rating - delta` (mutant #99). The Arena winner now loses rating.

```
arena_test  rc=0 before mutating, 72 ok: lines   <- control
arena_test  rc=1 after mutating
AssertionError: FAIL: winner gains rating
```

**And the half that matters more than either.** With mutation B applied,
`smoke_test.py` still passed, `rc=0`. That is the direct proof that the
`arena_test.py` leg of the runner is load-bearing rather than decorative: drop
it and every mutant in `apply_match` becomes a fake survivor. It is also the
coverage table's claim, confirmed by execution instead of by inference.

Both mutations were reverted and the file diffed back against the repository
copy (`diff --strip-trailing-cr`, identical). `sed -i` rewrote CRLF as LF, which
is why the comparison ignores line endings; the repository was never involved,
and the mutmut working copy (a separate tree) still matches the repository
byte-for-byte, CRLF included.

**Baseline before mutating: green.** All 17 suites, `rc=0`, section 3.

## 3. Baseline

The mutation run is worthless from a red baseline, so the whole suite was run
first, in the throwaway environment, before anything was mutated.

Environment, stated exactly because a result here is only about production if
the environment is:

- Python **3.13.12** (`py -3.13`), matching the CI pin of `3.13` and the Pi's
  3.13.5 at the minor version. The laptop's own default 3.12.10 was NOT used and
  `backend/.venv` was NOT touched.
- `backend/requirements.txt` + `backend/requirements-dev.txt` installed into a
  throwaway venv outside the repository (path in section 8).
- The same pin assertion `backend-checks.yml` runs was re-run here: **70 unique
  pins parsed, 0 mismatched, 1 missing (`uvloop==0.22.1`)**. uvloop carries a
  non-win32 marker, so pip correctly skipped it; the workflow's own comment
  predicts exactly this case. Every other pinned version resolved exactly.

Invocation is the one `backend-checks.yml` uses: one process per suite,
`python -X faulthandler tests/<suite>.py`, `timeout --signal=ABRT --kill-after=10s 300s`,
exit code 0 means pass.

Result: **17 of 17 suites passed, rc=0 for every one. Total 149.5 s.**

| suite | ms | `ok:` lines |
|---|---:|---:|
| account_lifecycle_test.py | 4124 | 27 |
| arena_test.py | 28935 | 72 |
| battle_test.py | 2868 | 30 |
| chat_test.py | 2930 | 42 |
| closed_beta_test.py | 2846 | 23 |
| contract_test.py | 4482 | 38 |
| edges_test.py | 1195 | 37 |
| graph_test.py | 1208 | 15 |
| identity_test.py | 912 | 21 |
| primary_category_test.py | 2186 | 0 |
| query_perf_test.py | 4210 | 14 |
| rate_limit_test.py | 1674 | 11 |
| read_next_endpoint_test.py | 2308 | 0 |
| report_edges_test.py | 918 | 11 |
| security_test.py | 9735 | 90 |
| smoke_test.py | 3489 | 50 |
| thumbnails_test.py | 73772 | 569 |
| **TOTAL** | **149471** | **1050** |

Two suites print no `ok:` lines (`primary_category_test.py`,
`read_next_endpoint_test.py`), so 1050 undercounts the assertions; it is a count
of one output convention, not of asserts.

`battle_test.py` and `chat_test.py` passed in 2.868 s and 2.930 s. The
`stack.enter_context(client)` fix described in CLAUDE.md is present in both files
and neither hung, across this run and every later run in this session.

**Two incidental observations, neither acted on** (this is a measurement, and
nothing outside the report was changed):

1. **There are 17 suites, not 16.** `ls tests/*_test.py` yields 17 files.
   CLAUDE.md says "16 suites" in four places and `backend-checks.yml` says
   "expected at least 16". The gate is a floor, so 17 passes it and nothing is
   broken; the prose is simply stale. `closed_beta_test.py` is the seventeenth
   and it arrived with the closed-beta batch. Worth a one-line correction by
   whoever next edits those notes.
2. `thumbnails_test.py` took **73.8 s** here against the ~130 s CLAUDE.md
   records for CI, and `arena_test.py` took 28.9 s against the ~29 s recorded.
   The suite ordering of cost is unchanged.

## 4. Target 1: `app/elo.py`

### 4.1 The oracle inventory, which predicts the result

Before any score: here is **every assertion in all 17 backend suites that
touches a rating or a delta**, found by grepping the test set for a comparison
involving `rating` or `delta`. There are 15.

| where | assertion | what it pins |
|---|---|---|
| `arena_test.py:206` | `queued[0]["rating"] == 1000` | **an exact value** - `START_RATING` |
| `arena_test.py:309` | `delta > 0` | sign |
| `arena_test.py:310` | `delta < 0` | sign |
| `arena_test.py:311` | `carol.delta == dave.delta` | two outputs of the same code agree |
| `arena_test.py:323` | `knowledge_rating > 1000` | sign |
| `arena_test.py:324` | `knowledge_rating < 1000` | sign |
| `arena_test.py:327` | `round(db_rating) == reported_rating` | two outputs of the same code agree |
| `contract_test.py:281` | `before == after` | nothing moved |
| `smoke_test.py:133` | `delta > 0` | sign |
| `smoke_test.py:134` | `rating > 1000` | sign |
| `smoke_test.py:143` | `delta == 0 and rating == rating_after_q1` | nothing moved |
| `smoke_test.py:151` | `delta < 0` | sign |
| `smoke_test.py:152` | `rating < rating_after_q1` | sign |
| `smoke_test.py:170` | `global_rating is not None` | null check |
| `smoke_test.py:193` | `delta > 0` | sign |

**One of the fifteen pins a number.** Everything else is a sign test, a null
check, or an equality between two values the same code path produced. And the
one exact assertion pins `START_RATING` through the Arena queue payload, not
through the scoring arithmetic.

That is the whole prediction, and it is the failure mode the brief describes,
visible directly in the oracles: **a sign-only oracle cannot detect a magnitude
error.** `K` can be wrong, the difficulty ratings can be wrong, the floor can be
wrong, the time bonus can be wrong, and every one of these assertions still
passes, because a correct answer still gains and a wrong answer still loses. The
mutation score below is that prediction being priced.

The `elo.py` docstring, `ARCHITECTURE.md`'s ELO KNOWLEDGE SCORE section, and
`frontend/src/lib/train/elo.ts` all state the constants explicitly, so the
requirement is written down in three places - and the test set checks none of
it. `elo.ts` mirrors `START_ELO 1000 / ELO_FLOOR 100 / K_FAST 32 / K_SLOW 16 /
DIFFICULTY_RATING {1:800,2:1000,3:1200} / FAST_MS 3000 / SLOW_MS 15000 /
TIME_BONUS_MAX 0.5` and the same expected-score formula, so a divergence is a
real product bug (the client simulation and the server would disagree), not a
style question. `frontend/test/` has 6 files and none of them mention rating, so
neither side of that contract is tested.

### 4.2 What the tests actually exercise

Two more facts, measured, that decide several survivors in advance:

- **Difficulty 3 is never used.** The quiz post `smoke_test.py` seeds defaults to
  `difficulty=2`; every Train question any suite answers
  (`sci-krebs-location`, `lit-ulysses-author`, `hist-westphalia-year`) is
  **difficulty 1**. The bank holds 30/34/36 questions at difficulty 1/2/3, and no
  test touches a difficulty-3 one. So `DIFFICULTY_RATING[3] = 1200.0` is dead to
  the tests.
- **Only the fast branch of `time_factor` is ever taken.** Every `answer_ms`
  anywhere in the test set is `1000` or `0`, both under `FAST_MS = 3000`. The
  time bonus is therefore only ever applied at its maximum, and the whole
  interpolation curve - the thing that makes a fast answer worth more than a slow
  one - never executes.

### 4.3 How survivors are categorised

Every survivor below was opened, read against the code and against the stated
requirement, and placed in one of three buckets. The judgement is mine; mutmut
does not make it.

- **EQUIVALENT** - the mutated program behaves identically to the original for
  every possible input. No test could ever kill it, and it is not a gap. These
  should be subtracted from the denominator when reading the score as a quality
  signal, and they are reported separately below for that reason.
- **UNTESTED** - a real behaviour change on a line or branch no test drives.
  The gap is coverage: nothing looked.
- **WEAK ORACLE** - the line runs, the mutated value flows through it, a test
  observes the result, and the assertion still passes. The test encodes the shape
  of the behaviour the code happens to have rather than the requirement it was
  supposed to meet. **This is the category the run exists to find.**

The third is the interesting one because it is invisible to coverage: the line is
covered, the assertion executes, and it agrees with the mutant.

### 4.4 Score

All 108 mutants tested. Chain: 4 suites, ~42.4 s.

| | mutmut's count | of 108 |
|---|---:|---:|
| killed | 59 | 54.6% |
| survived | 48 | 44.4% |
| timeout | 0 | - |
| **suspicious** | **1** | 0.9% |
| untested (not reached) | 0 | - |

**Mutation score: 59/108 = 54.6%** as mutmut reports it, or **60/108 = 55.6%**
after resolving the one suspicious mutant by hand (below). Removing the 3
equivalent mutants gives a corrected **60/105 = 57.1%**.

Set against `auth.py`'s 64.4%, and against the fact that `elo.py` is the smaller,
purer, more thoroughly documented of the two modules: **the better-specified
module scores worse.** That is not a paradox, it is the oracle inventory in 4.1
cashing out. `auth.py` is tested through status codes, which are exact values;
`elo.py` is tested through signs.

**The suspicious mutant, resolved.** mutmut reports `suspicious` when a mutant's
test run takes far longer than the baseline, which leaves it unclassified - so it
was run by hand rather than left ambiguous.

Mutant #106, `app/elo.py:175`,
`out[user.id] = (new_rating, new_rating - rating)` -> `out[user.id] = None`.
Applied by hand in the verify tree, `arena_test.py` **failed, rc=1, after
200.2 s** against a 28.9 s healthy baseline. So it is **KILLED**, and the score
above counts it that way.

How it is killed is the interesting part. It does not trip an assertion. The
`None` propagates into `_finalize`, the `match_result` frame is never sent, and
`arena_test.py:301` blocks forever in `drain_until` on a WebSocket read - until
the suite's OWN 180 s `threading.Timer` watchdog fires, dumps every thread's
stack and exits 1. That watchdog is the one CLAUDE.md describes at length, added
after the 2026-08-27 `battle_test.py` hangs. **It is the thing that turned this
mutant from a hang into a kill**, and mutmut would otherwise have burned its full
228 s timeout on it. A concrete return on a piece of test infrastructure that was
built for an unrelated reason.

### 4.5 The survivors, triaged

**EQUIVALENT (3)**

| # | line | mutation | why nothing can catch it |
|---|---|---|---|
| 67 | 97 | `bonus = ... if correct else 0.0` -> `else 1.0` | the value is only consumed by `_update`'s `delta = base * (1.0 + time_bonus) if correct else base`. On the `else` branch `time_bonus` is not read at all, so the mutated value is dead by construction |
| 42 | 77 | `db.refresh(user, with_for_update=True)` -> `False` | SQLite ignores `FOR UPDATE`, which `_update`'s own docstring says. Equivalent **under the test database only** - on PostgreSQL this is the BUG-028/M144 row lock and the mutation is a real regression. See 6.2 |
| 91 | 150 | same, in `apply_match` | same |

**WEAK ORACLE (24)** - the line runs, the wrong number reaches an assertion, and
the assertion agrees. Almost every one passes because the delta still has the
right SIGN.

*The Elo formula itself (3).* `expected_score` runs on every scored answer
anywhere in the product:

| # | line | mutation | what it does |
|---|---|---|---|
| 28 | 51 | `1.0 / (1.0 + 10**...)` -> `1.0 / (2.0 + 10**...)` | the expected score is no longer a probability at all |
| 30 | 51 | base `10.0` -> `11.0` | wrong Elo base |
| 34 | 51 | `/ 400.0` -> `/ 401.0` | wrong Elo scale |

`ARCHITECTURE.md` writes this formula out - `E = 1 / (1 + 10^((Q - R) / 400))` -
and `elo.ts` implements it identically for the client. All three mutations
survive.

*The tuning constants (5).*

| # | line | mutation | what it does |
|---|---|---|---|
| 5 | 28 | `K_PROVISIONAL = 32.0` -> `33.0` | every provisional rating moves 3% further per answer. `elo.ts` pins `K_FAST = 32` |
| 22 | 38 | `TIME_BONUS_MAX = 0.5` -> `1.5` | a fast correct answer earns +150% instead of +50%: the delta is 67% larger |
| 11 | 32 | `DIFFICULTY_RATING` key `1` -> `2` | difficulty-1 questions stop resolving and fall back to 1000 instead of 800 |
| 12 | 32 | difficulty-1 rating `800.0` -> `801.0` | wrong opponent rating on every Train answer the suites make |
| 14 | 32 | difficulty-2 rating `1000.0` -> `1001.0` | wrong opponent rating on every quiz answer the suites make |

*The `_update` arithmetic (9).* Every one of these executes on every scored
answer:

| # | line | mutation | what it does |
|---|---|---|---|
| 48 | 81 | `actual = 1.0 if correct` -> `2.0` | a correct answer counts as two wins |
| 51 | 82 | `base = k * (actual - expected)` -> `k / (...)` | multiplication becomes division; the magnitude is nonsense, the sign survives |
| 54 | 83 | `base * (1.0 + time_bonus)` -> `base / (...)` | same trick on the time bonus |
| 55 | 83 | `(1.0 + time_bonus)` -> `(2.0 + time_bonus)` | the bonus is applied on top of a doubled base |
| 56 | 83 | `(1.0 + time_bonus)` -> `(1.0 - time_bonus)` | **the time bonus becomes a time PENALTY** - a fast answer now earns less |
| 36 | 56 | `time_factor` fast branch `return 1.0` -> `2.0` | full bonus doubles |
| 61 | 86 | `knowledge_answered_count += 1` -> `= 1` | the scored-answer counter stops counting |
| 62 | 86 | -> `-= 1` | it counts DOWN, going negative |
| 63 | 86 | -> `+= 2` | it double-counts |

The three counter mutations are worth a second look. That counter is not
cosmetic - it is what line 79 uses to choose `K_PROVISIONAL` vs `K_STABLE`. They
survive because no test ever pushes a user past 3 scored answers, so every
mutated count is still below `PROVISIONAL_ANSWERS = 30` and the K it selects
never changes.

*Post-quiz scoring picks up a bonus it must not have (1).*

| # | line | mutation | what it does |
|---|---|---|---|
| 65 | 92 | `apply_answer(...)` passes `time_bonus=0.0` -> `1.0` | **post-quiz answers get a 100% speed bonus.** The whole point of `apply_answer` vs `apply_answer_timed` is that quizzes are untimed |

*Arena placement scoring (6).*

| # | line | mutation | what it does |
|---|---|---|---|
| 87 | 132 | `k * total / len(opponents)` -> `k * total * len(opponents)` | **the averaging becomes a multiplication.** A 4-player match moves the rating 9x what it should |
| 86 | 132 | `k * total / ...` -> `k / total / ...` | magnitude nonsense, sign intact |
| 75 | 125 | `if score > opp_score:` -> `>=` | a TIE now scores as a WIN (1.0 instead of 0.5) |
| 78 | 127 | `elif score == opp_score:` -> `!=` | tie and loss swap: equal scores take 0.0, losses take 0.5 |
| 76 | 126 | `actual = 1.0` -> `2.0` | a win counts double |
| 102 | 174 | `knowledge_answered_count += 1` -> `= 1` | assignment instead of increment |

**Mutant 102 is the one survivor that beat a genuinely exact assertion.**
`arena_test.py:331` checks `rows["a_bob"].knowledge_answered_count == 1` - "a
rated match counts one scored event" - which looks like it pins the counter. It
cannot distinguish `+= 1` from `= 1`, because the player starts a first match at
0 and both roads lead to 1. The assertion is not weak in form; it is weak because
the fixture never gives it a second match to see. The neighbouring mutants prove
the point from the other side: #103 (`-= 1`) and #104 (`+= 2`) were both KILLED
by that same assertion, since they yield -1 and 2.

**Mutant 87 is the sharpest single result in this report.** `elo.py`'s own
docstring says the pairwise deltas are "averaged (not summed) so a 4-player match
moves a rating about as much as one duel would -- otherwise Arena would swing
ratings three times faster than every other scored surface", and
`ARCHITECTURE.md` repeats it ("deltas AVERAGED"). The requirement is written down
twice, with its rationale. Replacing the division by a multiplication - the exact
thing both notes warn against, and worse - changes nothing any test can see,
because the winner still gains and the loser still loses.

Mutants 75 and 78 are the same shape against the other written rule, "taking
1 / 0.5 / 0 for a higher / equal / lower score". `arena_test.py` does assert
`carol.delta == dave.delta` for the two tied players - but that equality holds
under both mutations, because the two of them are mutated symmetrically. The
assertion tests that the code is self-consistent, not that the tie rule is 0.5.

**UNTESTED (21)** - real behaviour changes on lines or inputs nothing drives.

*The dead lines confirmed by coverage in 1.2 (7):* #25 (line 47, the `TypeError`
fallback), #37, #38, #39, #40, #41 (lines 57-59, the whole slow half of
`time_factor`), #70 (line 121, `match_delta` with no opponents).

*The stable-K half of the rating (3):* #7, #8 (`K_STABLE` -> `17.0`, and to
`None`), #9 (`PROVISIONAL_ANSWERS` -> `31`). No test drives a user past 3 scored
answers, so `K_STABLE` is never selected. #8 is the proof: a `None` K would raise
`TypeError` the instant that branch ran, and it does not.

*Boundaries never approached (4):* #45 and #71 (`<` -> `<=` on the
`PROVISIONAL_ANSWERS` comparison, in `_update` and `match_delta`), #35 (`<=` ->
`<` at `FAST_MS`), #18 (`FAST_MS` -> `3001`).

*Difficulty 3, which no test uses (2):* #15 (key `3` -> `4`), #16
(`1200.0` -> `1201.0`).

*Inputs no test supplies (5):* #3 (`FLOOR_RATING` -> `101.0`; the floor clamp
runs on every update but never BINDS, since bottoming out needs roughly fifty
consecutive wrong answers), #20 and #21 (`SLOW_MS`, unreachable behind the fast
branch), #24 (the `.get` default, which only applies to an unmapped difficulty),
#66 (`TIME_BONUS_MAX * time_factor(...)` -> `/`; identical while `time_factor`
returns 1.0, and a `ZeroDivisionError` the moment a slow answer arrives).

## 5. Target 2: `app/auth.py`

87 mutants. Same method as section 4: a coverage measurement first, to choose a
runner and to separate "no test noticed" from "no test ran the line".

### 5.1 Coverage, and a result that arrives before the mutants

Per-suite coverage of `app/auth.py` (87 executable statements), then the union of
all 17 suites via `coverage combine`:

| suite | cover |
|---|---:|
| `security_test.py` | **77%** |
| `smoke_test.py` | 71% |
| `closed_beta_test.py` | 70% |
| `account_lifecycle_test.py` | 68% |
| `contract_test.py` | 68% |
| `chat_test.py` | 60% |
| `query_perf_test.py` | 59% |
| `arena_test.py`, `battle_test.py` | 49% |
| `primary_category_test.py`, `read_next_endpoint_test.py` | 39% |
| `edges`, `graph`, `identity`, `rate_limit`, `report_edges` | none |
| **union of all 17** | **80%** |

**The 17 lines of `app/auth.py` that NO backend test executes**, union of
everything:

| lines | what they are |
|---|---|
| 38, 40, 45 | the three `raise RuntimeError` guards on `JWT_SECRET` - missing, still the `.env.example` placeholder, or shorter than 32 chars (M118/SEC-003) |
| 71 | `verify_password` returning False on a NULL hash - **the Google-only account path** |
| 101 | `decode_access_token` rejecting a token whose `sub` claim is absent |
| 104-105 | `except (TypeError, ValueError): token_version = 0` - a non-integer `ver` claim |
| 147-148 | `get_optional_user`'s `except HTTPException: return None` - **a present-but-invalid token falling back to anonymous** |
| 167 | `get_optional_user_strict` raising 401 on a token-version mismatch |
| 182-188 | `get_optional_user_id`, **the whole function** |

Three of those are load-bearing security behaviour with a bug or milestone
number attached, and one is an entire public function that nothing calls in any
test. This is a coverage result, not a mutation result: it says the lines never
run, so no mutant on them can be killed by anything, and it is settled before
mutmut starts. CLAUDE.md already records that the Google branch is exercised by
no test; line 71 is the same gap seen from the other side.

Note what is NOT in that list: `verify_password`'s `except ValueError` at 77-78,
the malformed-stored-hash fix (BUG-075/M151), IS executed - by
`closed_beta_test.py` alone, and by nothing else.

### 5.2 Runner

A three-suite set already reaches the full 80% union:
`security_test.py` (77% on its own) plus `closed_beta_test.py`, which is the
ONLY suite of the 17 that covers 77-78, plus either `smoke_test.py` or
`chat_test.py` for line 123. Coverage parity is not assertion parity, though, so
three more cheap suites that assert on auth behaviour were added rather than
trusting line counts: `account_lifecycle_test.py` (token version bumps, M126),
`contract_test.py` and `chat_test.py`.

(`thumbnails_test.py` never loads `app/auth.py` at all - it exercises the
thumbnail modules directly rather than through the app - so the slowest suite in
the set contributes nothing here and its 73.8 s was excluded for free.)

**Runner: `closed_beta_test && chat_test && smoke_test && account_lifecycle_test && contract_test && security_test`**,
cheapest first. Chain cost from the section 3 timings: about **27.5 s**, against
42.4 s for the `elo.py` chain. `arena_test.py` was excluded: 28.9 s would more
than double the chain and its `auth.py` coverage is a subset of what the others
already reach.

### 5.3 Score

Chain: 6 suites, ~27.5 s. Run completed with no interruption.

| | count | of 87 |
|---|---:|---:|
| **killed** | **56** | **64.4%** |
| survived | 31 | 35.6% |
| timeout | 0 | - |
| suspicious / errored | 0 | - |
| untested (not reached) | 0 | - |

**Mutation score: 56/87 = 64.4%.** Nothing timed out and nothing errored, so the
three numbers the brief asks to be kept apart are 31 / 0 / 0. Removing the 2
equivalent mutants below gives 56/85 = **65.9%** as the corrected score.

### 5.4 The 31 survivors, triaged

**EQUIVALENT (2)** - no test could kill these and they are not gaps.

| # | line | mutation | why nothing can catch it |
|---|---|---|---|
| 2 | 28 | `os.getenv("CLOSED_BETA", "0")` -> `"XX0XX"` | the value is only ever compared `== "1"`; every non-`"1"` default yields the same `False` |
| 36 | 81 | `create_access_token(..., token_version: int = 0)` -> `= 1` | the default is unreachable. All five call sites pass it explicitly (`routers/auth.py:159,183,283,456`, `closed_beta_test.py:67`) |

**WEAK ORACLE (8)** - the line runs, the mutated value reaches a response a test
inspects, and the assertion still passes. This is the category that matters.

| # | line | mutation | what no test noticed |
|---|---|---|---|
| **23** | 52 | `ACCESS_TOKEN_EXPIRE_DAYS = 30` -> `31` | **the token lifetime.** Line 82 mints an `exp` into every token every suite uses, tests decode and authenticate with them constantly, and nothing asserts how long a token lives. A security parameter with a sign-free oracle |
| 44 | 95 | header name `WWW-Authenticate` -> `XXWWW-AuthenticateXX` | `decode_access_token`'s 401 loses the standard challenge header |
| 45 | 95 | header value `Bearer` -> `XXBearerXX` | same 401, wrong challenge value |
| 61 | 126 | header name, `get_current_user` no-credentials 401 | same |
| 62 | 126 | header value, same 401 | same |
| 43 | 94 | `detail="Invalid or expired token"` -> mangled | no test asserts any 401 detail string |
| 60 | 125 | `detail="Not authenticated"` -> mangled | same |
| 69 | 135 | `detail="User not found"` -> mangled | same |

**The `WWW-Authenticate` six are the sharpest thing in this whole run**, because
the assertion that would kill them EXISTS. `closed_beta_test.py:109-110` checks
`_r.headers.get("www-authenticate") == "Bearer"`, written for exactly the
M153/BUG-072 reason ("so a client can key re-auth on it"). It is asserted against
`GET /api/feed` under `CLOSED_BETA=1`, so the 401 it inspects comes from the gate
middleware in `main.py` - **not from any of `auth.py`'s three**. The project has
the right check, on the one 401 `auth.py` does not produce. Under normal
operation, with the beta gate off, `auth.py`'s three are the 401s clients meet.

**UNTESTED (21)** - real behaviour changes on lines or inputs no test drives.

*The `JWT_SECRET` startup guards, M118/SEC-003 (10): #8, #9, #10, #13, #15, #16,
#17, #18, #19, #20.* All three guards are permanently false under test: the
secret `_throwaway_db` installs is 50 characters and is not the placeholder, so
lines 38, 40 and 45 never execute. Two of these are not cosmetic:

- **#8 / #9** change `_PLACEHOLDER_SECRET`, so the real `.env.example`
  placeholder would sail through the guard that exists to reject it.
- **#17** changes `len(JWT_SECRET) < _MIN_SECRET_LENGTH` to `<=`, which flips a
  secret of exactly 32 characters from accepted to rejected. An off-by-one on a
  boundary nothing approaches.
- The other seven mutate the text inside the three `raise RuntimeError(...)`
  messages and are immaterial.

*bcrypt's 72-byte truncation (2): #28, #33.* `[:72]` -> `[:73]` in both
`hash_password` and `verify_password`. Both lines run on every registration and
login, but no test uses a password longer than 72 bytes, so the slice never
differs. bcrypt 5.0.0 raises above 72 bytes, so this guard is load-bearing and
unexercised.

*The `ver` claim compatibility path, M126 (3): #52, #54, #55.* **#52** changes
`int(payload.get("ver", 0))` to a default of `1`. `decode_access_token`'s own
docstring states the guarantee - "A token minted before the ver claim existed
reports version 0, which matches the default column, so old tokens stay valid" -
and with a default of 1 every such legacy token would be rejected instead. No
test ever presents a token without a `ver` claim, so the documented promise is
unverified. #54/#55 sit in the `except (TypeError, ValueError)` branch at line
105, which nothing executes.

*The Google-only account path (1): #31.* **`verify_password` line 71,
`return False` -> `return True`.** An account whose `password_hash` is NULL -
which is what a Google-only sign-in produces - would then accept **any**
password. The line is executed by nothing in the entire backend test set. This is
the most consequential survivor in this report, and it is the same gap
CLAUDE.md already records from the other side ("its Google branch is already on
record as exercised by no test at all"); the mutation run prices what that costs.

*`get_optional_user_strict`'s rejection branch (3): #83, #84, #85.* Line 167,
the token-version-mismatch 401, never executes, so its header and detail can be
mutated freely. Note this is the STRICT variant, whose entire reason for existing
is to 401 a stale token rather than silently treat it as anonymous.

*`get_optional_user_id` (2): #86, #87.* **#86 inverts `if not credentials:` to
`if credentials:`**, which makes the function return `None` for an authenticated
caller and crash for an anonymous one. Nothing notices, because no test calls the
function at all. Its docstring warns it "must never gate data access"; today
nothing checks that it does anything.

## 6. What was not measured

### 6.1 The other 98% of the backend

10,338 mutants exist over `backend/app/`. This run covers `app/elo.py` (108) and
`app/auth.py` (87): **195, or 1.9%.** Nothing is claimed about the other 10,143.

What a wider run would cost, using this run's own measured numbers rather than a
guess. The binding cost is not mutmut, it is the suite: a mutant that survives
must run every suite that can see it, and the whole set is 149.5 s.

| scope | mutants | plausible runner | rough cost |
|---|---:|---|---:|
| `app/elo.py` | 108 | smoke+contract+security+arena, 42.4 s | **66 min measured** |
| `app/auth.py` | 87 | 6 suites, 27.5 s | **~20 min measured** |
| the 10 files under 100 mutants | 313 | varies, mostly cheap suites | a night |
| `app/routers/arena.py` | 540 | `arena_test.py` alone, 28.9 s | ~4.3 h |
| `app/sanitize.py` | 304 | `security_test.py` alone, 9.7 s | ~50 min |
| `app/train_bank.py` | 1102 | data file; almost pure constants | see below |
| everything | 10,338 | all 17 suites, 149.5 s | **17.9 days** |

The honest shape of a wider run is therefore **per-module, with a runner chosen
per module from a coverage measurement** - which is what section 1.2 did for
`elo.py` and what makes the difference between 76 minutes and 4.5 hours for the
same 108 mutants. A whole-backend number is not reachable by waiting longer; it
needs either parallelism (mutmut 2.x is single-process here) or `--use-coverage`
to skip mutants no test reaches.

`app/train_bank.py` is the single largest file at 1102 mutants and is the worst
candidate: it is a question bank, so most of its mutants alter quiz content, and
"no test noticed that an answer changed" is a statement about the data, not about
the code. It should be excluded from any scored run rather than left to dominate
the denominator.

### 6.2 Things this run cannot see, by construction

- **Mutation testing measures the tests, not the code.** A killed mutant means
  some assertion moved. It does not mean the assertion asserts the right thing,
  and a module with a perfect score can still be wrong in a way no mutation
  expresses.
- **mutmut's operator set is narrow.** It changes numbers by one, flips
  comparison and arithmetic operators, and replaces expressions with `None`.
  It does not reorder statements, drop a `db.commit()`, swap two arguments of the
  same type, or introduce a race.
- **The two concurrency decisions in `elo.py` are effectively unmeasurable here,
  though for different reasons.** The row lock (BUG-028/M144) is mutated exactly
  twice, `with_for_update=True` -> `False` at lines 77 and 150 - and SQLite
  ignores `FOR UPDATE` entirely, which the docstring itself says, so under the
  test DB those two mutants cannot change any observable behaviour whatsoever.
  The ascending-id lock ordering in `apply_match` (the deadlock guard) IS mutated,
  three times, at the `sorted(entries, key=lambda e: e[0].id)` on line 148 - but
  a deadlock needs two concurrent matches sharing a player, and the suites are
  single-threaded, so no assertion could distinguish the orders. Both properties
  are real and both are invisible to this run; do not read a killed or surviving
  mutant on those lines as saying anything about them.
- **Equivalent mutants are not detected automatically.** Every survivor in
  section 4 was read by hand and categorised; that judgement is mine, not the
  tool's.
- **The frontend was not mutated.** `frontend/src/lib/train/elo.ts` mirrors the
  same constants and has NO tests at all (`frontend/test/` is 6 files, none about
  rating), so the client half of the shared contract is unmeasured and, on
  inspection, untested.

## 7. Decisions taken during the run

Each of these was decided rather than asked, per the brief. Smaller and more
reversible was preferred every time.

### 7.1 mutmut 3.7.0 does not run on Windows; mutmut 2.5.1 does

The current release refuses before doing anything:

```
$ mutmut --help
To run mutmut on Windows, please use the WSL. Native windows support is
tracked in issue https://github.com/boxed/mutmut/issues/397
```

That is the entire output, for every subcommand, exit code 0. WSL is **not
installed on this machine** (`wsl.exe --status` reports
"Das Windows-Subsystem fuer Linux ist nicht installiert"), and installing it is
an administrator-level change to the operating system, which is well outside a
measurement run and outside anything the brief authorises.

**mutmut 2.5.1 runs here natively and was used.** It is the same tool, not a
substitute, so this is not the "do not substitute a different tool" case. It is
the last 2.x release, and it has the one feature this repository actually needs:
`--runner`, an arbitrary shell command. That matters because these suites are
NOT pytest - they are standalone scripts with a hand-rolled `check()` over plain
`assert`, run one process per file. mutmut 3.x is built around pytest
collection; 2.x's `--runner` takes
`python -X faulthandler tests/smoke_test.py && ...` directly, which is precisely
the invocation `backend-checks.yml` uses.

`pony` 0.7.20 (2.x's cache layer, a common breakage point on new Pythons)
installs and runs on 3.13.12 and both runs used it. It is not blameless: see 7.4,
where a cache write threw and killed the first `elo.py` run.

**Not adopted.** Nothing was added to `requirements-dev.txt`, per the brief.

### 7.2 mutmut ran against a COPY of `backend/`, never the repository

mutmut mutates files in place. Rather than trust it to restore them, the whole
of `backend/` was copied into the scratch directory and every command in this
report ran there. The repository working tree was never a mutation target, which
is why `git status` can be empty at the end as a matter of construction rather
than of cleanup.

Excluded from the copy: `.venv`, `__pycache__`, `.ruff_cache`, `*.db`, and
**`.env`**. Dropping `.env` is a second, independent safety layer: `_throwaway_db`
already pins `DATABASE_URL` to a temp SQLite file before any app import, but with
no `.env` anywhere above the working copy there is no real `DATABASE_URL` for
`load_dotenv()` to find even if that layer were bypassed. `app/elo.py` and
`app/auth.py` in the copy were `sha256`-identical to the repository before the run.

A SECOND copy (`verify/`) was made for the by-hand runner verification in
section 2, so that work could not disturb the mutmut tree. It was then reused as
the `auth.py` run's own tree, so the two mutation runs went in parallel with a
working copy and a `.mutmut-cache` each and never shared a file. That separation
is what let the `auth.py` run survive untouched while the `elo.py` run was being
killed and restarted in 7.4.

### 7.3 `mutmut results` needs `PYTHONIOENCODING=utf-8` here

`mutmut results` prints a `U+1F641` emoji as its "survived" heading and dies on
this console:

```
UnicodeEncodeError: 'charmap' codec can't encode character '🙁'
```

It fails loudly rather than reporting a wrong number, so it is a nuisance and not
a trap. `PYTHONIOENCODING=utf-8` fixes it. `mutmut run` was already given
`--simple-output`, which is why the run itself was unaffected.

### 7.4 The elo run crashed once, in mutmut's cache, and was restarted clean

Worth recording because it cost about 20 minutes and because the likely cause was
mine, not the tool's.

The first `elo.py` run died after 23 of 108 mutants with:

```
Process check_mutants:
  mutmut/__init__.py line 1195 in run_mutation_tests
    update_mutant_status(...)
  mutmut/cache.py line 430 in update_mutant_status
    mutant = Mutant.get(line=line, index=mutation_id.index)
ValueError: Attribute Mutant.line is required
```

`update_mutant_status` looks a mutant up by its line's exact TEXT
(`Line.get(sourcefile=..., line=mutation_id.line, line_number=...)`) and passes
the result straight into `Mutant.get`. The lookup returned `None`, so the write
of that mutant's result blew up and took the run with it.

**The likely cause is that I was polling the same cache while the run was
writing to it.** mutmut 2.x keeps its state in a pony/SQLite file
(`.mutmut-cache`) in the working directory, and I had been running
`mutmut results`, `mutmut result-ids` and `mutmut show` against that file from a
second process every few minutes to report progress. Every one of those is
wrapped in pony's `@db_session`. Two processes on one SQLite file is exactly the
shape that loses a write. I cannot prove causation from one occurrence, and I did
not try to reproduce it - reproducing it would have cost more of the night than
the restart did - so this is stated as the suspect and not as the diagnosis.

**The crash did not stop the process, which is the part that bit twice.** The
traceback is headed `Process check_mutants:` - it killed mutmut's multiprocessing
CHILD, and the PARENT stayed alive and wedged, still holding `.mutmut-cache`
open. Nothing in the log said so; the only symptom was a cache mtime that stopped
advancing. The first restart therefore did NOT get the clean slate it was meant
to: `mv .mutmut-cache ...` failed with `Device or resource busy`, that failure
scrolled past inside a backgrounded pipeline, and a SECOND mutmut started
mutating the SAME working tree against the SAME cache as the wedged first one -
two processes taking turns writing and restoring `app/elo.py`. Caught within
about a minute by reading the task output rather than by anything reporting it.

Recovery, in order: stop both background tasks; confirm from `Win32_Process` that
the run-1 mutmut pair (started 04:09:47, still alive at 04:28) was the thing
holding the file, and kill exactly those two PIDs and no others - the `auth.py`
run was live in a different tree throughout and had to survive; re-verify the
working copy (`sha256` of `app/elo.py` equal to the repository's, `diff -r` over
all of `app/` clean); move the crashed cache aside to
`elo-cache-crashed-run1.bak` rather than delete it; restart once, from an empty
cache.

**The reported `elo.py` score therefore comes from a single uninterrupted run
against an empty cache, not from a resume.** Resuming would have been cheaper -
mutmut caches per mutant and would have skipped the first 23 - but a cache that
has just thrown a consistency error, and has since been written by two processes
at once, is not a thing to build a reported number on.

**Monitoring changed too.** Progress was tracked afterwards from the cache file's
mtime and from the process list, never by opening the cache. That is the same
lesson as the `## Rules` entry in CLAUDE.md, arriving from the other direction:
here the checker did not report a false clean bill of health, it broke the thing
it was checking.

Before the restart, the working copy was verified pristine: `app/elo.py`
`sha256` equal to the repository's, and `diff -r` over the whole of `app/`
reporting no differences. mutmut had restored the file correctly on its way down.

### 7.5 The elo run was cut off at 91/108 and left a mutation applied

The restarted `elo.py` run was killed at 05:14 by a session boundary, not by
mutmut. It had tested 91 of 108. **It left `app/elo.py` MUTATED on disk**, mid
mutant #92 (`is not None` -> `is None` at line 154), with mutmut's own
`app/elo.py.bak` sitting beside it.

That is the single best argument for 7.2. Had mutmut been pointed at the
repository, `git status` would have shown a modified source file this morning,
and the mutation is subtle enough (`is not None` -> `is  None`, one word, inside
a dict comprehension) to survive a careless glance. Because the target was a
copy, the repository was never involved.

Recovery: `app/elo.py.bak` was confirmed `sha256`-identical to the repository's
`app/elo.py` and moved back over the mutated file; `diff -r` over all of `app/`
then reported no differences. Only then was the run resumed.

**The resume is legitimate here, where the one in 7.4 would not have been.** The
difference is the failure mode: 7.4 was a cache that had thrown a consistency
error and had then been written by two processes at once, so its contents were
not trustworthy. This was a clean external kill of a single writer - every
recorded status was written by one uninterrupted process, and the interrupted
mutant was still `UNTESTED` and simply got tested again. mutmut re-ran the
baseline, skipped the 91 cached results and tested exactly the remaining 17.

### 7.6 The working tree was already clean, and the brief expected otherwise

See the "Waiting on Marlo" section at the top. Nothing was stashed, cleaned or
committed.

## 8. The exact commands

Everything below ran on Windows 11, Git Bash, from the scratch working copy. The
repository was never the working directory for a mutating command.

Paths, once:

```
SCRATCH=/c/Users/marlo/AppData/Local/Temp/claude/C--Users-marlo-GitHub-deepscroll/10181d17-bc39-46f4-b7b1-6a10a151cc82/scratchpad
PY=$SCRATCH/mutenv/venv/Scripts/python.exe
WORK=$SCRATCH/work/backend        # mutmut target, a copy of backend/
VERIFY=$SCRATCH/verify/backend    # by-hand runner verification, a second copy
```

**Throwaway environment** (never `backend/.venv`, never `requirements-dev.txt`):

```
py -3.13 -m venv "$SCRATCH/mutenv/venv"           # Python 3.13.12
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
"$PY" -m pip install "mutmut==2.5.1"              # 3.7.0 refuses on Windows, see 7.1
```

**The working copy** (excludes `.env`, `.venv`, `*.db`, caches):

```
cd backend && tar -cf - --exclude='__pycache__' --exclude='.venv'   --exclude='.ruff_cache' --exclude='*.db' --exclude='*.legacy_*' --exclude='.env'   app tests scripts requirements.txt requirements-dev.txt | (cd "$WORK" && tar -xf -)
```

**Mutant count over the whole backend** (section 1.1). `count_mutants.py`:

```python
import os, sys
from mutmut import list_mutations, Context
root = sys.argv[1]
total = 0
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != "__pycache__"]
    for fn in sorted(filenames):
        if not fn.endswith(".py"):
            continue
        path = os.path.join(dirpath, fn)
        src = open(path, encoding="utf-8").read()
        n = len(list_mutations(Context(source=src, filename=path, dict_synonyms=[])))
        print(f"{n:6d}  {os.path.relpath(path, root)}")
        total += n
print(f"{total:6d}  TOTAL")
```

```
cd "$WORK" && "$PY" count_mutants.py app
```

**Baseline, the way `backend-checks.yml` runs it** (section 3):

```
cd "$WORK"
for f in $(ls tests/*_test.py | sort); do
  timeout --signal=ABRT --kill-after=10s 300s "$PY" -X faulthandler "$f"
done
```

**Per-suite coverage of the target** (section 1.2):

```
cd "$WORK"
for f in $(ls tests/*_test.py | sort); do
  b=$(basename "$f" .py)
  "$PY" -m coverage run --data-file="$SCRATCH/cov/.cov.$b" --include="*elo.py" "$f"
  "$PY" -m coverage report -m --data-file="$SCRATCH/cov/.cov.$b"
done
```

Note the `--include` pattern: `"*app/elo.py"` matches NOTHING on Windows, because
the recorded paths use backslashes, and `coverage report` then prints
`No data to report.` - a checker reporting a clean bill of health because it
asked the wrong question. `"*elo.py"` is the pattern that works.

**Runner verification** (section 2), in the second copy:

```
cd "$VERIFY"
sed -i '81s/else 0\.0/else 1.0/' app/elo.py && "$PY" -X faulthandler tests/smoke_test.py ; echo $?
sed -i '81s/else 1\.0/else 0.0/' app/elo.py
sed -i '170s/rating + delta/rating - delta/' app/elo.py
"$PY" -X faulthandler tests/arena_test.py ; echo $?     # expect nonzero
"$PY" -X faulthandler tests/smoke_test.py ; echo $?     # expect 0 -> arena leg required
sed -i '170s/rating - delta/rating + delta/' app/elo.py
```

**Timeout derivation** (section 1.3): one chain unloaded, then 12 concurrent
chains on this 12-core laptop, all measured green.

**The mutation run itself:**

```
cd "$WORK"
RUNNER="$PY -X faulthandler tests/smoke_test.py && $PY -X faulthandler tests/contract_test.py      && $PY -X faulthandler tests/security_test.py && $PY -X faulthandler tests/arena_test.py"
mutmut run --paths-to-mutate app/elo.py --tests-dir tests --runner "$RUNNER"            -m 4.0 -b 60 --simple-output --no-progress
```

`$PY` is spelled as a full Windows path inside `RUNNER`, because mutmut runs it
through `cmd.exe` where a Git Bash `/c/...` path does not resolve.

**Reading the results** (note the encoding, section 7.3):

```
cd "$WORK"
PYTHONIOENCODING=utf-8 mutmut results
PYTHONIOENCODING=utf-8 mutmut show <id>
```

## 9. Final state

Verified at the end of the run, not asserted:

- `git status --porcelain --untracked-files=all` reports exactly one line,
  `?? docs/research/mutation-test-2026-08.md` - this file, untracked by
  instruction. Nothing else. No commits were made, nothing was pushed, `main` was
  not touched, and `HEAD` is still `bb520b0` on `docs/closed-beta-lockout` where
  the session started.
- `backend/app/elo.py` and `backend/app/auth.py` `sha256` equal to their
  start-of-session values (`10e21f77...`, `8e50a7ea...`).
- `diff -r` over all of `backend/app/` against BOTH scratch working copies:
  identical. No `.bak` left anywhere.
- No database was touched beyond the per-suite temp SQLite files
  `_throwaway_db.py` creates. No request reached the Pi, Supabase, Vercel or any
  network service; the one suite that would otherwise use the network
  (`thumbnails_test.py`) stubs it, and `backend/.env` was never copied into
  either working tree.

**Left in place, all outside the repository**, under
`.../scratchpad/`: the throwaway 3.13 venv (`mutenv/`), the two working copies
(`work/`, `verify/`) with their `.mutmut-cache` files holding the full results,
the crashed cache (`elo-cache-crashed-run1.bak`), the mutant catalogues
(`elo_mutants.txt`, `auth_mutants.txt`), the per-suite baseline and coverage
logs, and the run logs. Delete the directory to reclaim the space; the numbers in
this report are all reproducible from section 8.

**Not done, deliberately:** no test was written to kill any survivor, no source
file was changed, `mutmut` was not added to `requirements-dev.txt`. This was a
measurement.

## 10. If someone wants to act on this

Not a recommendation to adopt anything - the brief asked for a measurement - but
the survivors sort into a short list of what would actually move the number, in
descending order of value per unit of effort:

1. **One test that pins the arithmetic.** A single unit test calling
   `apply_answer` / `match_delta` directly with known inputs and asserting the
   exact delta would kill most of the 24 weak-oracle survivors in `elo.py` at
   once - the formula ones, the constants, the Arena averaging. It needs no
   fixtures and no app; `elo.py` is pure apart from the two `db.refresh` calls.
2. **A test that asserts the constants equal `elo.ts`'s.** The shared contract is
   currently written down three times and checked zero times, on either side.
3. **`verify_password(x, None) is False`.** One line, and it closes the most
   serious survivor in the report.
4. **Drive one slow Train answer** (`answer_ms` above 15000). That alone reaches
   lines 57-59, the entire dead half of `time_factor`, and would kill 6 survivors.
5. **Assert `WWW-Authenticate: Bearer` on a 401 that `auth.py` actually
   produces**, not only on the closed-beta gate's.

Whether any of that is worth doing is a judgement about how much the rating
matters, which is not mine to make.
