# battle_test.py CI hang: diagnosis (2026-08-27, main at 14edbb7)

Read-only investigation. No source file and no test file was changed. All
reproduction ran from scratch copies outside the repository; a CI-pinned scratch
venv was built for the second environment and deleted afterwards. A dated
record, not maintained.

## The finish path

`backend/app/routers/battle.py`. First finish (alice):

1. `battle.py:494-498` - frame typed `finish`, score validated by `_valid_score`.
2. `battle.py:499` -> `BattleManager.finish` (`battle.py:207`), whole decision in **one** lock acquisition (`battle.py:214`).
3. `battle.py:215-219` - room looked up by user id; a mismatched `battle_id` returns `"stale"`.
4. `battle.py:220-221` - `room.finished.add(alice)`; `partner = room.partner_of(alice)` -> bob.
5. `battle.py:222` - `len(finished) == 2` is False. **Nothing is torn down.**
6. `battle.py:226` -> `("ok", bob, battle_id)`; `battle.py:505` relays `opponent_finish` to bob.

Second finish (bob):

7. `battle.py:215` - room still present (step 5 removed nothing).
8. `battle.py:220-221` - `finished` becomes `{alice, bob}`; **`partner = alice` is captured here.**
9. `battle.py:222-225` - *now* both `_rooms` entries are popped.
10. `battle.py:226` - still returns `("ok", alice, battle_id)`; `battle.py:505` relays to alice.

Teardown (step 9) happens **after** the recipient is read (step 8), in the same
lock acquisition, and `manager.send` (`battle.py:228-242`) resolves the socket
from `_sockets`, which `_teardown_room` (`battle.py:96-107`) never touches - it
pops from `_rooms` only. There is no window where the second finish loses its
recipient.

## The real cause

`battle_test.py:34` is `client = TestClient(app)` - constructed, never entered.
`starlette/testclient.py:428-433` yields the shared portal only when
`self.portal` is set, which happens in `__enter__`. So **every
`websocket_connect` starts its own blocking portal - its own event loop in its
own thread** (`testclient.py:121-134`). Three are open at line 124, which is the
"three portal event loops parked in `selectors.select`" from the CI dump.

`BattleManager` is a module-level singleton (`battle.py:245`). When bob's
handler relays, it runs on **bob's** loop and writes into the memory object
stream owned by **alice's** loop. `anyio`'s `send_nowait` wakes the waiting
receiver via `Future.set_result` -> `loop.call_soon`, which - unlike
`call_soon_threadsafe` - does not write the loop's self-pipe. If alice's loop is
already parked in `select(None)`, the frame is delivered and the loop is never
woken.

**Experiment 1** proved this in isolation, no app involved: a receiver parked on
loop A, a send issued from loop B, still blocked after 3 s; poking loop A
returned `{'type': 'opponent_finish', 'score': 3}` instantly. *The frame was
there the whole time.*

## Reproduction

Trimmed scratch copy of `battle_test.py` (lines 1-125, verbatim except the two
`sys.path` lines), run in two environments. **Reported separately, never
merged:**

| environment | runs | hangs | rate |
|---|---|---|---|
| local `backend/.venv` - py 3.12.10, starlette 1.2.0 | 200 | **1** | 0.5% |
| CI-pinned scratch venv - py 3.13.12, starlette 1.3.1 | 200 | **3** | 1.5% |

Both reproduce, so the race is **not** starlette-version-specific. The rates
differ but 1 vs 3 out of 200 is well inside noise; nothing here separates the
versions. Both are below CI's 3/25 (12%), consistent with a slower, more
contended runner widening the window.

A separate run with a `faulthandler` watchdog caught a **natural** hang on run
40 of the unmodified suite. Its stack against CI's:

```
                             this machine (starlette 1.3.1)   CI dump
concurrent/futures/_base.py  line 451 in result               455
anyio/from_thread.py         line 334 in call                 334   identical
starlette/testclient.py      line 185 in receive              185   identical
starlette/testclient.py      line 198 in receive_json         198   identical
battle_test.py               line 124 in <module>             124   identical
```

**Forced reproduction:** delaying only the *second* `opponent_finish` relay by
50 ms (monkeypatched in the driver) makes the test thread win the race every
time - **5/5 hangs on each venv, always at line 124.** That converts a 1-in-100
race into a deterministic one.

## Verdict: the test, not the server

**Experiment 4** drove the app over hand-rolled in-process ASGI websockets on
**one** event loop - no TestClient, no portals, no second thread - through 500
cycles: **500/500 clean**, 167 happy path, 167 including the stale branch at
`battle.py:218` (167 `stale_battle` errors, all correct), 166 with both finish
frames queued back-to-back.

Stated as the bound it is: **500 clean iterations on one event loop bound the
server-side failure rate below roughly 6 in 1000 (rule of three).** That is
enough to act on. It is *not* the same as "the server is correct", and that
stronger claim is not being made.

What decides it: the fault appears only when sockets live on different event
loops, and disappears when they do not. Production is one uvicorn worker, one
loop (`main.py:20-40`, M138), so the cross-loop wakeup cannot occur there.

## Arena and chat

| suite | enters `TestClient` | sockets | exposed |
|---|---|---|---|
| `arena_test.py` | **yes**, `:162` | 4 | no |
| `battle_test.py` | no, `:34` | up to 4 | **yes** |
| `chat_test.py` | no, `:28` | up to 3 | **yes** |

All three routers have the identical server shape - collect socket under lock,
release, `await ws.send_json` on another user's socket (`battle.py:228`,
`arena.py:485`, `chat.py:393`). The exposure comes from the harness, not the
routers.

Arena is immune **by accident**: `arena_test.py:159-161` says `with client:` is
load-bearing because the lifespan starts the matchmaker. The single event loop
is a side effect nobody wrote down - and it is the only reason the one suite
that never hangs never hangs.

Chat is exposed but luckier: at `chat_test.py:150` the test reads the sender's
echo *before* the cross-loop receive at `:154`, and reads bob's echo before
alice's and dave's at `:186-189`. That buffering step narrows the window.
`battle_test.py:124` has no such step - `ws_a.receive_json()` is the statement
immediately after `ws_b.send_text(finish)`. That is why battle is the suite that
hangs.

## The fix, and its proof

Inside the existing `with ExitStack() as stack:` (`battle_test.py:66`), before
the first `websocket_connect`:

```python
stack.enter_context(client)
```

One line. Same property `arena_test.py` already has. `chat_test.py` needs the
equivalent (`with TestClient(app) as client:` or a module-level `ExitStack`).

| | forced delay | natural, 200 runs (CI-pinned) | natural, 200 runs (local) |
|---|---|---|---|
| unfixed | 5/5 hang | 3 hangs | 1 hang |
| fixed | **30/30 pass** | **0 hangs** | **0 hangs** |

The forced-delay column is the real proof: it is deterministic in both
directions. The 200-run columns support it - at the measured 1.5%, 0/200 is ~95%
confidence; at local's 0.5% it is only ~63%, which is why the conclusion does
not rest on it.

One correction to an earlier number from this session: a first batch showed the
fixed copy "failing" 5 times in 98 runs. That was a 20 s `faulthandler` watchdog
killing slow-but-healthy runs while other work loaded the machine (healthy runs
measured up to 17 s under load, 2.8 s idle). Raised to 60 s, the same test is
30/30. Not a residual failure mode.

**What the fix does not fix:** nothing in production - if experiment 4's bound
holds, there was never a product bug here. It does not make the routers safe
across event loops. It does not remove the shared `asyncio.Lock` hazard
(`battle.py:94` takes an uncontended fast path silently across loops, and only
misbehaves under contention). And it changes behaviour: entering the client runs
the lifespan (`main.py:75-88`), so the rate-limiter sweep, the Arena matchmaker,
`_assert_single_worker` and `_run_startup_ddl` all start in a suite that
currently runs none of them. Empirically fine over 230 runs, and `arena_test.py`
has always done it - but the fix batch should confirm the suite still passes
*for the right reasons*, not merely passes.

Optional and separate: a `threading.Timer` watchdog in
`battle_test.py`/`chat_test.py` mirroring `arena_test.py:43`, so any future hang
dies in 90 s with a stack instead of burning the 300 s CI budget.

## The undocumented invariant - proposed wording, not written

**Both places.** They answer different questions.

`ARCHITECTURE.md`, DEPLOYMENT INVARIANT (M138), which already enumerates all
four process-local pieces - append one sentence:

> The invariant is one event loop, not merely one process: chat, battle and
> arena all relay by awaiting `send_json` on *another* user's socket, which is
> only safe while every socket lives on the same loop. A test that opens
> websockets without entering the `TestClient` gets one event loop per socket
> and the relay is silently lost (see `arena_test.py:162`).

`_assert_single_worker`'s docstring (`main.py:20-32`) says "exactly one process"
and lists the same state - add: *"one process and therefore one event loop; the
registries relay across sockets and that is only correct on a single loop."*

And a line on each of the three managers (`battle.py:78-89`, `arena.py:194`,
`chat.py:355`) next to the existing "single-process only" note, since that is
where someone actually reads it.

## What contradicts the brief this investigation started from

- **The starting hypothesis is wrong, and no variant of it was found to be
  right.** The room is not torn down before the relay: `battle.py:220-221`
  captures `partner` and `battle_id` *before* the pop at `:222-225`, in the same
  lock acquisition, and the relay resolves sockets from `_sockets`, which
  teardown never touches. 500/500 single-loop cycles, including the stale branch
  and a tight interleave.
- **"That is a user-visible hang, not a test artefact"** - inverted. On this
  evidence it is exactly a test artefact. Production is one loop; the mechanism
  cannot occur there.
- **The CLAUDE.md CI note is now false and needs correcting in the same batch as
  the fix:** "the second `finish` of a battle is sometimes not relayed to the
  player who finished first - a race between the first `finish` tearing the room
  down and the second one looking for somebody to relay to" and "That is a real
  lead pointing at the M142 finish/teardown path". The line number and the dump
  were right; the inference from them was not. Also "Every previous note said
  the state machine had not been implicated. It now has been" - it should go
  back to not implicated.
- **"Three for three it has also come straight after `arena_test.py` passed"** -
  no signal. The suites run as separate processes in an alphabetical glob;
  `arena` precedes `battle` in every run, including the 22 that passed.
- **"Starlette moved 1.2.1 -> 1.3.1 ... which still neither implicates nor
  clears it"** - now cleared. Both versions reproduce (1.2.0: 1/200, 1.3.1:
  3/200). Caveat: local is starlette **1.2.0**, and the note says 1.2.1; 1.2.1
  itself was not tested.
- **The CI stack line `_base.py line 455`** reproduces here as 451 - a Python
  patch-level difference, not a different code path. Everything above it matches
  exactly.
- **Arena being safe is luck, not design.** Deleting `with client` from
  `arena_test.py:162` would break matchmaking loudly, so it is unlikely to
  happen - but nothing states the second reason it is there.
