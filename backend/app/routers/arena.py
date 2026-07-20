import asyncio
import json
import logging
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import anyio.to_thread
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..auth import decode_access_token
from ..database import SessionLocal
from ..elo import START_RATING, apply_match
from ..models import User
from ..rate_limit import check_rate_limit
from ..train_bank import grade, question_seconds, sequence_ids
from ..ws_security import (
    WS_REVALIDATE_SECONDS,
    connection_attempt_allowed,
    is_secure_or_local,
    leave_unauthenticated,
    receive_text_frame,
    token_still_valid,
    try_enter_unauthenticated,
    user_still_active,
)

logger = logging.getLogger("app.arena")

router = APIRouter(prefix="/arena", tags=["arena"])

# Arena: the RANKED free-for-all. Four players in a similar knowledge_rating
# range are matched from a queue (no challenging, no friends) and race through
# the same seeded question sequence; finishing order moves everyone's rating.
#
# How it differs from Battle (routers/battle.py), and why:
#   - Pairing is a matchmaker over a queue, not a direct challenge.
#   - A room holds N players, not a fixed pair.
#   - Answers are GRADED SERVER-SIDE. Battle relays a client-computed
#     `correct`, which is fine for a friendly unrated duel but would be a free
#     rating in a rated mode -- a client could just send its own score. So the
#     server derives the sequence from the seed (train_bank.sequence_ids) and
#     grades against the bank, exactly as POST /api/train/answer does
#     (M120/SEC-007). Clients still render their own feedback from their local
#     pool; only the SCORE is authoritative here.
#
# Single-process only (see BattleManager's note and _assert_single_worker in
# main.py): the queue and match registry are in-memory.

WS_FRAME_MAX_BYTES = 4 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10
WS_SEND_TIMEOUT_SECONDS = 5

WS_CLOSE_UNAUTHORIZED = 4401
WS_CLOSE_INSECURE = 4403
WS_CLOSE_TRY_AGAIN = 4429

# One Arena match: four players, one question sequence.
ARENA_PLAYERS = 4
ARENA_QUESTION_COUNT = 7

# Matchmaking window. A match only ever forms at a FULL lobby of four, so the
# rating window has to open up over time or a thin queue never resolves: it
# starts at +/-100 and widens by 15 points per second, dropping entirely after
# 60s of waiting. The window is checked per waiting player against the SPREAD
# of the candidate group, so a player who just queued is never dragged into a
# lopsided match by someone who has been waiting a minute.
QUEUE_BASE_WINDOW = 100.0
QUEUE_WIDEN_PER_SECOND = 15.0
QUEUE_UNBOUNDED_AFTER_SECONDS = 60.0
MATCHMAKER_TICK_SECONDS = 2.0

# How many queued players the waiting-room roster names. The client's grid only
# has ARENA_PLAYERS slots; a few spare let it drop itself from the list and
# still fill them. Everyone queued is counted in `waiting` regardless, so a
# deep queue reads as a number rather than an unbounded broadcast.
QUEUE_ROSTER_MAX = 8

# Arena now plays in LOCKSTEP: every player answers the same question, and the
# round resolves for everyone at once -- either when all have answered or when
# the per-question shot clock (train_bank.question_seconds) runs out. After a
# round resolves the correct answer is revealed to everyone for this long before
# the match advances to the next question together. (This deliberately reverses
# the old "no shot clock" design: the game is now paced, not a self-paced race.)
REVEAL_SECONDS = 4.0


@dataclass(frozen=True)
class QueueIdentity:
    """Everything the waiting room shows about a player, read in one DB trip:
    the rating matchmaking sorts on plus the cosmetics the tile renders."""

    rating: float
    # None renders as an initial.
    avatar_url: Optional[str] = None
    # Cosmetic accessory ids (models.User); the frontend maps them to artwork
    # and falls back to the default look for None or an unknown id.
    avatar_frame_id: Optional[int] = None
    badge_id: Optional[int] = None
    # Verification level (0 = none); drives the verified badge on the tile.
    is_verified: int = 0


@dataclass
class QueueEntry:
    user_id: int
    username: str
    queued_at: float
    # Shown in the other waiting players' roster.
    identity: QueueIdentity

    @property
    def rating(self) -> float:
        return self.identity.rating

    def window(self, now: float) -> float:
        waited = now - self.queued_at
        if waited >= QUEUE_UNBOUNDED_AFTER_SECONDS:
            return float("inf")
        return QUEUE_BASE_WINDOW + QUEUE_WIDEN_PER_SECOND * waited


@dataclass
class Match:
    """One live free-for-all. Every player's _matches entry points at the SAME
    instance, so match state can never go asymmetric (the BattleManager's
    BUG-040 lesson). match_id stamps every frame so a frame from a finished
    match cannot leak into the next one (BUG-010/BUG-087).

    Lockstep: the whole room sits on ONE shared question, `round_index`. The
    server (not the client) owns that index -- it is advanced only by the match
    driver (run_match), never by an answer -- so a question cannot be replayed
    or skipped. `round_answers` collects this round's graded points until every
    active player has answered (or the shot clock fires), then the round
    resolves for all at once."""

    match_id: str
    seed: int
    players: Tuple[int, ...]
    usernames: Dict[int, str]
    ratings: Dict[int, float]
    # Cosmetics per player (avatar/frame/badge/verified), sent in match_start so
    # the client can render each player's badge tile without a second lookup.
    identities: Dict[int, QueueIdentity]
    question_ids: List[str]
    started_at: float
    scores: Dict[int, int] = field(default_factory=dict)
    # The shared question index the whole room is answering right now.
    round_index: int = 0
    # This round's graded points / correctness, keyed by user; both cleared at
    # the start of every round (open_round).
    round_answers: Dict[int, int] = field(default_factory=dict)
    round_correct: Dict[int, bool] = field(default_factory=dict)
    # Set once every still-active player has answered the current round, so the
    # driver can close the round before the shot clock expires. A fresh Event is
    # installed each round; None before the first round opens.
    round_event: Optional[asyncio.Event] = None
    finished: set = field(default_factory=set)
    left: set = field(default_factory=set)
    finalized: bool = False

    def others(self, user_id: int) -> List[int]:
        return [p for p in self.players if p != user_id]

    def active_players(self) -> List[int]:
        """Players still connected to the match (a leaver keeps their score but
        is no longer waited on)."""
        return [p for p in self.players if p not in self.left]

    def round_complete(self) -> bool:
        """Every active player has answered the current round. Vacuously true
        when nobody is left active (everyone walked out), which lets the driver
        stop waiting and finalize."""
        return all(p in self.round_answers for p in self.active_players())

    def is_over(self) -> bool:
        return all(p in self.finished or p in self.left for p in self.players)


Notification = Tuple[int, dict]


class ArenaManager:
    """In-memory registry of arena sockets, the matchmaking queue and live
    matches. One socket per user (latest connection wins).

    Every read-then-write of queue/match state happens inside ONE lock
    acquisition, following the BattleManager rewrite (M142): taking the lock
    once per step let a concurrent disconnect interleave with pairing."""

    def __init__(self) -> None:
        self._sockets: Dict[int, WebSocket] = {}
        self._queue: List[QueueEntry] = []
        self._matches: Dict[int, Match] = {}
        self._lock = asyncio.Lock()

    # --- socket registry --------------------------------------------------

    async def connect(self, user_id: int, websocket: WebSocket) -> List[Notification]:
        """Register the socket (latest wins). A reconnect abandons whatever the
        old socket was doing: the new one knows nothing about that match, so
        keeping it would leave a ghost player nobody can wait on (BUG-039)."""
        async with self._lock:
            stale = self._sockets.get(user_id)
            self._sockets[user_id] = websocket
            notifications = self._leave_locked(user_id)
        if stale is not None and stale is not websocket:
            try:
                await stale.close()
            except Exception:
                pass
        return notifications

    async def disconnect(self, user_id: int, websocket: WebSocket) -> List[Notification]:
        async with self._lock:
            if self._sockets.get(user_id) is not websocket:
                # A newer socket replaced us; connect() already cleaned up.
                return []
            self._sockets.pop(user_id, None)
            return self._leave_locked(user_id)

    def _leave_locked(self, user_id: int) -> List[Notification]:
        """Drop the user from the queue and mark them gone in any live match.
        Callers hold the lock. A leaver is NOT removed from the match: they
        keep their score and are still rated, so quitting a losing match is
        not a way to dodge the loss."""
        self._queue = [e for e in self._queue if e.user_id != user_id]
        match = self._matches.get(user_id)
        if match is None or match.finalized:
            return []
        match.left.add(user_id)
        self._matches.pop(user_id, None)
        # A leaver can be the last player an open round was waiting on: wake the
        # driver so it resolves the round now instead of idling to the shot
        # clock (or, if everyone has gone, so it can finalize at once).
        if match.round_event is not None and match.round_complete():
            match.round_event.set()
        return [
            (other, {"type": "player_left", "match_id": match.match_id,
                     "username": match.usernames.get(user_id, "")})
            for other in match.others(user_id)
            if other in self._sockets and other not in match.left
        ]

    # --- queue ------------------------------------------------------------

    async def enqueue(self, user_id: int, username: str, identity: QueueIdentity) -> str:
        async with self._lock:
            if user_id in self._matches:
                return "in_match"
            if any(e.user_id == user_id for e in self._queue):
                return "already_queued"
            self._queue.append(
                QueueEntry(
                    user_id=user_id, username=username,
                    queued_at=time.monotonic(), identity=identity,
                )
            )
            return "queued"

    async def dequeue(self, user_id: int) -> bool:
        async with self._lock:
            before = len(self._queue)
            self._queue = [e for e in self._queue if e.user_id != user_id]
            return len(self._queue) != before

    async def queue_size(self) -> int:
        async with self._lock:
            return len(self._queue)

    async def queue_roster(self) -> Tuple[List[int], dict]:
        """Who is waiting, plus the roster frame describing them. Both are read
        in ONE lock acquisition so the recipient list can never disagree with
        the roster it is sent (the M142 rule): taking the lock twice would let
        a join land between them and hand someone a roster missing themselves."""
        async with self._lock:
            return [e.user_id for e in self._queue], {
                "type": "queue_update",
                "waiting": len(self._queue),
                "players": [
                    {
                        "username": e.username,
                        "avatar_url": e.identity.avatar_url,
                        "avatar_frame_id": e.identity.avatar_frame_id,
                        "badge_id": e.identity.badge_id,
                        "is_verified": e.identity.is_verified,
                    }
                    for e in self._queue[:QUEUE_ROSTER_MAX]
                ],
            }

    # --- matchmaking ------------------------------------------------------

    async def form_matches(self) -> List[Match]:
        """Pull every group of ARENA_PLAYERS that mutually accepts the rating
        spread, newest-waiting-first ordering aside. Sorting by rating means a
        viable group, if one exists, is always a CONSECUTIVE run: any window
        that admits a spread admits a tighter one."""
        formed: List[Match] = []
        async with self._lock:
            # A queued socket that died before the tick is not a player.
            self._queue = [e for e in self._queue if e.user_id in self._sockets]
            now = time.monotonic()
            while len(self._queue) >= ARENA_PLAYERS:
                self._queue.sort(key=lambda e: e.rating)
                group = self._pick_group_locked(now)
                if group is None:
                    break
                ids = {e.user_id for e in group}
                self._queue = [e for e in self._queue if e.user_id not in ids]
                formed.append(self._start_match_locked(group))
        return formed

    def _pick_group_locked(self, now: float) -> Optional[List[QueueEntry]]:
        for start in range(len(self._queue) - ARENA_PLAYERS + 1):
            group = self._queue[start:start + ARENA_PLAYERS]
            spread = group[-1].rating - group[0].rating
            if all(spread <= e.window(now) for e in group):
                return group
        return None

    async def force_match(self, user_id: int) -> Optional[Match]:
        """TEMP (testing only, remove before launch): form a match immediately
        from whoever is queued right now, even below ARENA_PLAYERS (1-3). The
        requester must be queued. Lets a match be started without waiting for a
        full lobby of four; ranked matches must otherwise fill normally."""
        async with self._lock:
            self._queue = [e for e in self._queue if e.user_id in self._sockets]
            if not any(e.user_id == user_id for e in self._queue):
                return None
            # Requester first, then fill up to ARENA_PLAYERS from the rest of the
            # queue in waiting order.
            me = [e for e in self._queue if e.user_id == user_id]
            others = [e for e in self._queue if e.user_id != user_id]
            group = (me + others)[:ARENA_PLAYERS]
            ids = {e.user_id for e in group}
            self._queue = [e for e in self._queue if e.user_id not in ids]
            return self._start_match_locked(group)

    def _start_match_locked(self, group: List[QueueEntry]) -> Match:
        seed = random.randint(1, 2_147_483_647)
        players = tuple(e.user_id for e in group)
        match = Match(
            match_id=secrets.token_hex(8),
            seed=seed,
            players=players,
            usernames={e.user_id: e.username for e in group},
            ratings={e.user_id: e.rating for e in group},
            identities={e.user_id: e.identity for e in group},
            question_ids=sequence_ids(seed, ARENA_QUESTION_COUNT),
            started_at=time.monotonic(),
            scores={uid: 0 for uid in players},
        )
        for uid in players:
            self._matches[uid] = match
        return match

    # --- match play -------------------------------------------------------

    async def record_answer(
        self, user_id: int, client_match_id: Optional[str], index: int,
        chosen_index: Optional[int], chosen_value: Optional[float],
        chosen_lat: Optional[float] = None, chosen_lng: Optional[float] = None,
    ) -> Tuple[str, Optional[Match], Optional[dict]]:
        """Grade one answer for the CURRENT round against the server's own
        sequence. Returns (outcome, match, info):
          ("none")        -> not in a match
          ("stale")       -> frame belongs to a finished match
          ("bad_index")   -> not the round the room is on right now
          ("done")        -> this player already left the match
          ("already")     -> already answered this round
          ("ok", match, {"index"})

        The answer is graded and banked into `scores` immediately, but the
        VERDICT is not returned to the player here -- correctness is revealed to
        the whole room together at round end (round_reveal), so no one learns
        early whether they were right. The score total stays server-authoritative
        (numeric/map earn partial credit; train_bank). Answering does NOT advance
        the question: the match driver owns round_index, so a client cannot race
        ahead or replay a round.
        """
        async with self._lock:
            match = self._matches.get(user_id)
            if match is None or match.finalized:
                return "none", None, None
            if client_match_id is not None and client_match_id != match.match_id:
                return "stale", None, None
            if user_id in match.left:
                return "done", None, None
            if index != match.round_index or index >= len(match.question_ids):
                return "bad_index", None, None
            if user_id in match.round_answers:
                return "already", None, None

            result = grade(
                match.question_ids[index], chosen_index, chosen_value, chosen_lat, chosen_lng
            )
            if result is None:
                # The bank and the sequence come from the same dict, so this is
                # unreachable short of a bank edit mid-match; score zero rather
                # than 500 the socket.
                logger.error("arena: unknown question id at index %s", index)
                result = {"points": 0, "correct": False}
            awarded = int(result["points"])
            correct = bool(result["correct"])
            match.round_answers[user_id] = awarded
            match.round_correct[user_id] = correct
            match.scores[user_id] = match.scores.get(user_id, 0) + awarded
            # Everyone in? Wake the driver so it resolves the round without
            # waiting out the rest of the shot clock.
            if match.round_event is not None and match.round_complete():
                match.round_event.set()
            return "ok", match, {"index": index}

    async def open_round(self, match: Match, index: int) -> Optional[dict]:
        """Begin round `index`: clear the per-round answers and install a fresh
        completion Event. Returns the round_start payload, or None if the match
        is finalized or has no active players left (everyone walked out)."""
        async with self._lock:
            if match.finalized or not match.active_players():
                return None
            match.round_index = index
            match.round_answers = {}
            match.round_correct = {}
            match.round_event = asyncio.Event()
        return {
            "type": "round_start",
            "match_id": match.match_id,
            "index": index,
            "seconds": question_seconds(match.question_ids[index]),
        }

    async def close_round(self, match: Match, index: int) -> Optional[List[dict]]:
        """Resolve the current round: any active player who never answered is
        scored 0 for it, then return the reveal rows (one per player: this
        round's awarded points, running score, and correctness). None if the
        match was finalized in the meantime."""
        async with self._lock:
            if match.finalized:
                return None
            for uid in match.active_players():
                if uid not in match.round_answers:
                    match.round_answers[uid] = 0
                    match.round_correct[uid] = False
            return [
                {
                    "username": match.usernames.get(uid, ""),
                    "awarded": match.round_answers.get(uid, 0),
                    "score": match.scores.get(uid, 0),
                    "correct": match.round_correct.get(uid, False),
                }
                for uid in match.players
                if uid not in match.left
            ]

    async def active_count(self, match: Match) -> int:
        """How many players are still connected to the match."""
        async with self._lock:
            return len(match.active_players())

    async def finish_all(self, match: Match) -> None:
        """Mark every player who did not leave as finished, so the match reads
        as over and finalizes down the normal path."""
        async with self._lock:
            for uid in match.players:
                if uid not in match.left:
                    match.finished.add(uid)

    async def claim_finalize(self, match: Match) -> bool:
        """Exactly one caller gets to finalize a match (the last finisher, a
        leaver's teardown and the timeout sweep all race for it)."""
        async with self._lock:
            if match.finalized or not match.is_over():
                return False
            match.finalized = True
            for uid in match.players:
                if self._matches.get(uid) is match:
                    self._matches.pop(uid, None)
            return True

    # --- delivery ---------------------------------------------------------

    async def send(self, user_id: int, payload: dict) -> None:
        async with self._lock:
            ws = self._sockets.get(user_id)
        if ws is None:
            return
        try:
            await asyncio.wait_for(ws.send_json(payload), timeout=WS_SEND_TIMEOUT_SECONDS)
        except Exception:
            try:
                await asyncio.wait_for(ws.close(), timeout=1)
            except Exception:
                pass

    async def broadcast(self, user_ids, payload: dict) -> None:
        for uid in user_ids:
            await self.send(uid, payload)


manager = ArenaManager()


async def _broadcast_queue() -> None:
    """Push the waiting-room roster to everyone still queued. Called after every
    change to queue membership (join, cancel, disconnect, match formed) so the
    grid the players are staring at matches who is actually waiting. A no-op
    when the queue is empty."""
    user_ids, payload = await manager.queue_roster()
    await manager.broadcast(user_ids, payload)


async def _error(websocket: WebSocket, detail: str, code: Optional[str] = None) -> None:
    payload = {"type": "error", "detail": detail}
    if code is not None:
        payload["code"] = code
    try:
        await websocket.send_json(payload)
    except Exception:
        pass


def _load_active_user(user_id: int) -> Optional[User]:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()


def _queue_identity(user_id: int) -> QueueIdentity:
    """Load what the waiting room needs about a player in one DB trip. An
    unrated player queues at the start rating rather than being excluded, so a
    new account can still find a match."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            return QueueIdentity(rating=START_RATING)
        rating = START_RATING if user.knowledge_rating is None else float(user.knowledge_rating)
        return QueueIdentity(
            rating=rating,
            avatar_url=user.avatar_url,
            avatar_frame_id=user.avatar_frame_id,
            badge_id=user.badge_id,
            is_verified=user.is_verified,
        )
    finally:
        db.close()


def _standings(match: Match) -> List[dict]:
    """Placements by score, ties sharing a placement (1, 2, 2, 4)."""
    ordered = sorted(match.players, key=lambda uid: match.scores.get(uid, 0), reverse=True)
    rows: List[dict] = []
    for i, uid in enumerate(ordered):
        score = match.scores.get(uid, 0)
        if i > 0 and score == rows[-1]["score"]:
            placement = rows[-1]["placement"]
        else:
            placement = i + 1
        rows.append({
            "user_id": uid,
            "username": match.usernames.get(uid, ""),
            "score": score,
            "placement": placement,
            "left": uid in match.left,
        })
    return rows


def _apply_elo(results: List[Tuple[int, int]]) -> Dict[int, Tuple[float, float]]:
    """Apply the match to every participant's rating. Sync on purpose: called
    through anyio.to_thread so the DB round trip never blocks the loop
    (BE-012/M140)."""
    db = SessionLocal()
    try:
        ids = [uid for uid, _ in results]
        users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}
        entries = [(users[uid], score) for uid, score in results if uid in users]
        if len(entries) < 2:
            # Every player is rated, including anyone who walked out (quitting
            # a losing match must not dodge the loss), so this only trips if
            # accounts vanished mid-match. Rating someone against nobody would
            # be a free win, so skip it.
            return {}
        out = apply_match(db, entries)
        db.commit()
        return out
    finally:
        db.close()


async def _finalize(match: Match) -> None:
    """Score a finished match and tell everyone still connected. Safe to call
    from any of the racing paths; claim_finalize() picks one winner."""
    if not await manager.claim_finalize(match):
        return
    rows = _standings(match)
    try:
        deltas = await anyio.to_thread.run_sync(
            _apply_elo, [(r["user_id"], r["score"]) for r in rows]
        )
    except Exception:
        # A DB failure must not strand four players on a results screen that
        # never arrives: send the standings unrated rather than nothing.
        logger.exception("arena: rating update failed for match %s", match.match_id)
        deltas = {}
    for row in rows:
        new_rating, delta = deltas.get(row["user_id"], (None, None))
        row["rating"] = round(new_rating) if new_rating is not None else None
        row["delta"] = round(delta) if delta is not None else None
    for uid in match.players:
        await manager.send(uid, {
            "type": "match_result",
            "match_id": match.match_id,
            "standings": [
                {k: v for k, v in row.items() if k != "user_id"} | {"is_me": row["user_id"] == uid}
                for row in rows
            ],
        })


def _match_start_payload(match: Match) -> dict:
    """The match_start frame: the seed both clients shuffle from, plus each
    player's cosmetics so the client can render the badge tiles up front."""
    return {
        "type": "match_start",
        "match_id": match.match_id,
        "seed": match.seed,
        "count": ARENA_QUESTION_COUNT,
        "players": [
            {
                "username": match.usernames[uid],
                "rating": round(match.ratings[uid]),
                "avatar_url": match.identities[uid].avatar_url,
                "avatar_frame_id": match.identities[uid].avatar_frame_id,
                "badge_id": match.identities[uid].badge_id,
                "is_verified": match.identities[uid].is_verified,
            }
            for uid in match.players
        ],
    }


# Live match-driver tasks. create_task returns a task that is only weakly held
# by the loop, so a driver would be garbage-collected mid-match without a strong
# reference; keep one here and drop it when the driver finishes.
_match_tasks: set = set()


def launch_match(match: Match) -> None:
    """Start the background driver that runs a formed match round by round."""
    task = asyncio.create_task(run_match(match))
    _match_tasks.add(task)
    task.add_done_callback(_match_tasks.discard)


async def run_match(match: Match) -> None:
    """Drive one match in lockstep: announce it, then for each question open a
    round, wait until everyone answers or the shot clock fires, reveal the
    result to the whole room, and advance together. The client never advances
    the question -- this loop does -- so no one can race ahead or replay a round.

    The finally-block always finalizes, so a crash or a mass walkout still hands
    everyone still connected their result rather than a dead screen (BUG-011);
    _finalize's claim_finalize keeps that to exactly one scoring."""
    try:
        await manager.broadcast(match.players, _match_start_payload(match))
        for index in range(ARENA_QUESTION_COUNT):
            start = await manager.open_round(match, index)
            if start is None:
                break  # finalized or everyone left
            await manager.broadcast(match.players, start)
            event = match.round_event
            if event is not None:
                try:
                    await asyncio.wait_for(event.wait(), timeout=float(start["seconds"]))
                except asyncio.TimeoutError:
                    # The shot clock won the race: whoever is silent is scored 0
                    # for this round in close_round.
                    pass
            rows = await manager.close_round(match, index)
            if rows is None:
                break
            # How long this reveal stays on screen before the room advances: the
            # fixed hold on every round but the last, which finalizes straight
            # into the summary instead. Sent so the client can show an accurate
            # countdown (mirrors round_start carrying its own `seconds`).
            is_last = index >= ARENA_QUESTION_COUNT - 1
            reveal_hold = 0.0 if is_last else REVEAL_SECONDS
            await manager.broadcast(match.players, {
                "type": "round_reveal",
                "match_id": match.match_id,
                "index": index,
                "seconds": reveal_hold,
                "results": rows,
            })
            if await manager.active_count(match) == 0:
                break  # nobody left to advance for
            if not is_last:
                # Hold the reveal so everyone reads it, then advance together.
                await asyncio.sleep(REVEAL_SECONDS)
        await manager.finish_all(match)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("arena: match driver crashed for %s", match.match_id)
    finally:
        await _finalize(match)


async def matchmaker_loop() -> None:
    """Background matchmaker (started from main.py's lifespan). Runs off the
    socket handlers so no player's frame pays for pairing, mirroring the rate
    limiter's sweep loop (ARCH-009). Each formed match gets its own driver task
    (launch_match); the per-round shot clock bounds every match, so there is no
    longer a separate abandonment-timeout sweep."""
    while True:
        await asyncio.sleep(MATCHMAKER_TICK_SECONDS)
        try:
            formed = await manager.form_matches()
            for match in formed:
                launch_match(match)
            if formed:
                # Those players just left the queue: whoever is still waiting
                # needs a roster without them, or their grid keeps tiles for
                # people who are already mid-match.
                await _broadcast_queue()
        except asyncio.CancelledError:
            raise
        except Exception:
            # One bad tick must never kill the matchmaker: without it, queueing
            # silently stops working for the whole process.
            logger.exception("arena matchmaker tick failed")


async def _handle_queue(websocket: WebSocket, user_id: int, username: str) -> None:
    try:
        check_rate_limit(user_id, "arena_queue", 30, 60)
    except HTTPException:
        await _error(websocket, "Too many queue attempts. Slow down.")
        return
    identity = await anyio.to_thread.run_sync(_queue_identity, user_id)
    outcome = await manager.enqueue(user_id, username, identity)
    if outcome == "in_match":
        await _error(websocket, "Finish your current match first.", code="in_match")
        return
    if outcome == "already_queued":
        await _error(websocket, "You are already in the queue.", code="already_queued")
        return
    await websocket.send_json({
        "type": "queued",
        "rating": round(identity.rating),
        "needed": ARENA_PLAYERS,
        "waiting": await manager.queue_size(),
    })
    # The joiner is in the queue now, so this hands them the opening roster
    # (themselves included) and shows them to everyone already waiting.
    await _broadcast_queue()


async def _handle_force_start(websocket: WebSocket, user_id: int) -> None:
    """TEMP (testing only, remove before launch): start a match now with
    whoever is in the waiting room, even fewer than four players."""
    match = await manager.force_match(user_id)
    if match is None:
        await _error(websocket, "Join the queue first.", code="not_queued")
        return
    # The driver announces the match (match_start) and runs the rounds, exactly
    # as it does for a normally-formed match.
    launch_match(match)
    # Those players just left the queue; refresh the roster for anyone still
    # waiting (as the matchmaker does after forming a match).
    await _broadcast_queue()


async def _handle_answer(websocket: WebSocket, user_id: int, data: dict) -> None:
    index = data.get("index")
    chosen_index = data.get("chosen_index")
    chosen_value = data.get("chosen_value")
    # A map answer is a dropped pin: latitude/longitude of the guess.
    chosen_lat = data.get("chosen_lat")
    chosen_lng = data.get("chosen_lng")
    if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < ARENA_QUESTION_COUNT:
        await _error(websocket, "answer requires index (int).")
        return
    if chosen_index is not None and (not isinstance(chosen_index, int) or isinstance(chosen_index, bool)):
        await _error(websocket, "chosen_index must be an int.")
        return
    if chosen_value is not None and (isinstance(chosen_value, bool) or not isinstance(chosen_value, (int, float))):
        await _error(websocket, "chosen_value must be a number.")
        return
    # Bounds guard the pin so junk coordinates never reach grading (bool is an
    # int subclass, so exclude it explicitly, as chosen_value does).
    for name, val, lo, hi in (("chosen_lat", chosen_lat, -90.0, 90.0), ("chosen_lng", chosen_lng, -180.0, 180.0)):
        if val is not None and (isinstance(val, bool) or not isinstance(val, (int, float)) or not lo <= val <= hi):
            await _error(websocket, f"{name} must be a number within range.")
            return

    match_id = data.get("match_id")
    outcome, match, info = await manager.record_answer(
        user_id, match_id if isinstance(match_id, str) and match_id else None,
        index, chosen_index, chosen_value, chosen_lat, chosen_lng,
    )
    if outcome == "none":
        await _error(websocket, "You are not in a match.", code="not_in_match")
        return
    if outcome == "stale":
        await _error(websocket, "That match is already over.", code="stale_match")
        return
    if outcome == "bad_index":
        # The room has already moved on (or not reached) this question -- e.g. a
        # late answer after the shot clock closed the round. Not an error worth
        # a red banner; the client is already waiting for the reveal.
        await _error(websocket, "That round is closed.", code="bad_index")
        return
    if outcome == "already":
        await _error(websocket, "You already answered this round.", code="already_answered")
        return
    if outcome == "done":
        await _error(websocket, "You already left this match.", code="already_finished")
        return

    assert match is not None and info is not None
    # Confirm the answer is locked in, but WITHOUT a verdict: correctness is
    # revealed to the whole room together at round end (round_reveal), so no one
    # learns early whether they were right.
    await websocket.send_json({
        "type": "answer_ack",
        "match_id": match.match_id,
        "index": info["index"],
    })
    # Tell everyone (including the answerer) that this player is in, so their
    # badge lifts. No score here -- that would spoil the pending reveal.
    await manager.broadcast(match.players, {
        "type": "player_answered",
        "match_id": match.match_id,
        "index": info["index"],
        "username": match.usernames.get(user_id, ""),
    })
    # The round is resolved and advanced by the match driver (run_match), never
    # here: an answer only records, it does not finalize.


@router.websocket("/ws")
async def arena_websocket(websocket: WebSocket):
    if not is_secure_or_local(websocket):
        await websocket.close(code=WS_CLOSE_INSECURE)
        return

    host = websocket.client.host if websocket.client else "unknown"
    if not connection_attempt_allowed(host):
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    await websocket.accept()

    if not try_enter_unauthenticated():
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    # First frame must be {"type":"auth","token":"<jwt>"} -- same handshake as
    # chat and battle; the token never goes in the URL, so it cannot land in
    # access logs.
    try:
        try:
            raw = await asyncio.wait_for(receive_text_frame(websocket), timeout=WS_AUTH_TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, WebSocketDisconnect):
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
        if raw is None or len(raw) > WS_FRAME_MAX_BYTES:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
        try:
            first = json.loads(raw)
        except ValueError:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
        if not isinstance(first, dict) or first.get("type") != "auth" or not isinstance(first.get("token"), str):
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return

        token = first["token"]
        try:
            user_id, token_version = decode_access_token(token)
        except HTTPException:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return

        user = await anyio.to_thread.run_sync(_load_active_user, user_id)
        username = user.username if user else None
        if not user or username is None or user.token_version != token_version:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
    finally:
        leave_unauthenticated()

    for member_id, payload in await manager.connect(user_id, websocket):
        await manager.send(member_id, payload)
    # connect() drops any previous session of this user from the queue, so a
    # reconnect must not leave their tile sitting in everyone else's grid.
    await _broadcast_queue()
    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})
        next_recheck = time.monotonic() + WS_REVALIDATE_SECONDS
        while True:
            raw = await receive_text_frame(websocket)
            if not token_still_valid(token, user_id, token_version):
                await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
                break
            now = time.monotonic()
            if now >= next_recheck:
                if not await anyio.to_thread.run_sync(user_still_active, user_id, token_version):
                    await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
                    break
                next_recheck = now + WS_REVALIDATE_SECONDS
            if raw is None:
                await _error(websocket, "Frames must be text.")
                continue
            if len(raw) > WS_FRAME_MAX_BYTES or len(raw.encode("utf-8")) > WS_FRAME_MAX_BYTES:
                await _error(websocket, "Frame too large.")
                continue
            try:
                data = json.loads(raw)
            except ValueError:
                await _error(websocket, "Frames must be JSON objects.")
                continue
            if not isinstance(data, dict):
                await _error(websocket, "Frames must be JSON objects.")
                continue

            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "queue":
                # A transient DB failure inside one frame costs that frame, not
                # the connection (BUG-034).
                try:
                    await _handle_queue(websocket, user_id, username)
                except Exception:
                    logger.exception("arena queue failed (user %s)", user_id)
                    await _error(websocket, "Could not join the queue. Try again.")
            elif msg_type == "cancel":
                if await manager.dequeue(user_id):
                    await _broadcast_queue()
                await websocket.send_json({"type": "queue_cancelled"})
            elif msg_type == "force_start":
                # TEMP (testing only, remove before launch): start a match now
                # with whoever is in the waiting room, even below four players.
                try:
                    await _handle_force_start(websocket, user_id)
                except Exception:
                    logger.exception("arena force_start failed (user %s)", user_id)
                    await _error(websocket, "Could not start the match. Try again.")
            elif msg_type == "answer":
                try:
                    await _handle_answer(websocket, user_id, data)
                except Exception:
                    logger.exception("arena answer failed (user %s)", user_id)
                    await _error(websocket, "Could not record that answer.")
            else:
                await _error(websocket, f"Unknown frame type: {msg_type!r}")
    except WebSocketDisconnect:
        pass
    finally:
        for member_id, payload in await manager.disconnect(user_id, websocket):
            await manager.send(member_id, payload)
        # A player who closed the tab is no longer waiting; drop their tile from
        # the grids of those who still are.
        await _broadcast_queue()
        # Leaving marks the player gone in their match and wakes its driver if
        # that completes the open round (_leave_locked). The driver owns
        # advancing and finalizing, so there is nothing to finalize here.
