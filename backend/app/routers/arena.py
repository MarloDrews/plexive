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
from ..train_bank import grade, sequence_ids
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

# A match whose players stop answering must not pin the room (and their
# ratings) forever: past this, whoever is unfinished is finalized on the score
# they have. Generous -- it is a backstop for abandonment, not a per-question
# shot clock (there is deliberately none; Arena scores on correctness, not
# speed).
MATCH_TIMEOUT_SECONDS = 300.0


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
    match cannot leak into the next one (BUG-010/BUG-087)."""

    match_id: str
    seed: int
    players: Tuple[int, ...]
    usernames: Dict[int, str]
    ratings: Dict[int, float]
    question_ids: List[str]
    started_at: float
    scores: Dict[int, int] = field(default_factory=dict)
    # The index each player is expected to answer next: the server, not the
    # client, decides where a player is in the sequence, so an answer cannot be
    # replayed or a question skipped.
    next_index: Dict[int, int] = field(default_factory=dict)
    finished: set = field(default_factory=set)
    left: set = field(default_factory=set)
    finalized: bool = False

    def others(self, user_id: int) -> List[int]:
        return [p for p in self.players if p != user_id]

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
            question_ids=sequence_ids(seed, ARENA_QUESTION_COUNT),
            started_at=time.monotonic(),
            scores={uid: 0 for uid in players},
            next_index={uid: 0 for uid in players},
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
        """Grade one answer against the server's own sequence and advance the
        player. Returns (outcome, match, info):
          ("none")        -> not in a match
          ("stale")       -> frame belongs to a finished match
          ("bad_index")   -> not the index this player owes an answer for
          ("done")        -> already finished their run
          ("ok", match, {"correct", "awarded", "score", "index", "complete"})

        `awarded` is the graded points this question earned (0..MAX_POINTS):
        numeric and map answers can score PARTIAL credit that rises as the guess
        nears the answer (train_bank), so the match score is a running points
        total, not a correct-count. `correct` still marks full marks.
        """
        async with self._lock:
            match = self._matches.get(user_id)
            if match is None or match.finalized:
                return "none", None, None
            if client_match_id is not None and client_match_id != match.match_id:
                return "stale", None, None
            if user_id in match.finished or user_id in match.left:
                return "done", None, None
            expected = match.next_index.get(user_id, 0)
            if index != expected or index >= len(match.question_ids):
                return "bad_index", None, None

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
            match.scores[user_id] = match.scores.get(user_id, 0) + awarded
            match.next_index[user_id] = index + 1
            complete = match.next_index[user_id] >= len(match.question_ids)
            if complete:
                match.finished.add(user_id)
            return "ok", match, {
                "correct": correct,
                "awarded": awarded,
                "score": match.scores[user_id],
                "index": index,
                "complete": complete,
            }

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

    async def timed_out_matches(self) -> List[Match]:
        """Matches past MATCH_TIMEOUT_SECONDS. Whoever is still unfinished is
        marked finished on the score they have, which makes the match read as
        over so it finalizes down the normal path (claim_finalize still picks
        the single winner if a real finish lands in the same tick)."""
        async with self._lock:
            now = time.monotonic()
            stale = []
            seen = set()
            for match in list(self._matches.values()):
                if match.match_id in seen or match.finalized:
                    continue
                seen.add(match.match_id)
                if now - match.started_at >= MATCH_TIMEOUT_SECONDS:
                    stale.append(match)
            for match in stale:
                for uid in match.players:
                    if uid not in match.left:
                        match.finished.add(uid)
            return stale

    async def match_awaiting_finalize(self, user_id: int) -> Optional[Match]:
        """The user's match, if it is now over but not yet scored -- a leaver
        can be the last player everyone else was waiting on."""
        async with self._lock:
            for match in self._matches.values():
                if user_id in match.players and not match.finalized and match.is_over():
                    return match
        return None

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


async def matchmaker_loop() -> None:
    """Background matchmaker + match-timeout sweep (started from main.py's
    lifespan). Runs off the socket handlers so no player's frame pays for
    pairing, mirroring the rate limiter's sweep loop (ARCH-009)."""
    while True:
        await asyncio.sleep(MATCHMAKER_TICK_SECONDS)
        try:
            formed = await manager.form_matches()
            for match in formed:
                payload = {
                    "type": "match_start",
                    "match_id": match.match_id,
                    "seed": match.seed,
                    "count": ARENA_QUESTION_COUNT,
                    "players": [
                        {"username": match.usernames[uid], "rating": round(match.ratings[uid])}
                        for uid in match.players
                    ],
                }
                await manager.broadcast(match.players, payload)
            if formed:
                # Those players just left the queue: whoever is still waiting
                # needs a roster without them, or their grid keeps tiles for
                # people who are already mid-match.
                await _broadcast_queue()
            for match in await manager.timed_out_matches():
                await _finalize(match)
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
    payload = {
        "type": "match_start",
        "match_id": match.match_id,
        "seed": match.seed,
        "count": ARENA_QUESTION_COUNT,
        "players": [
            {"username": match.usernames[uid], "rating": round(match.ratings[uid])}
            for uid in match.players
        ],
    }
    await manager.broadcast(match.players, payload)
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
        await _error(websocket, "Unexpected question index.", code="bad_index")
        return
    if outcome == "done":
        await _error(websocket, "You already finished this match.", code="already_finished")
        return

    assert match is not None and info is not None
    await websocket.send_json({
        "type": "answer_result",
        "match_id": match.match_id,
        "index": info["index"],
        "correct": info["correct"],
        "awarded": info["awarded"],
        "score": info["score"],
    })
    await manager.broadcast(match.others(user_id), {
        "type": "opponent_progress",
        "match_id": match.match_id,
        "username": match.usernames.get(user_id, ""),
        "index": info["index"],
        "score": info["score"],
    })
    if info["complete"]:
        await manager.broadcast(match.others(user_id), {
            "type": "player_finished",
            "match_id": match.match_id,
            "username": match.usernames.get(user_id, ""),
            "score": info["score"],
        })
    if match.is_over():
        await _finalize(match)


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
        # Leaving can be the last thing a match was waiting on: the remaining
        # players must get their result rather than sit on a dead screen.
        pending = await manager.match_awaiting_finalize(user_id)
        if pending is not None:
            await _finalize(pending)
