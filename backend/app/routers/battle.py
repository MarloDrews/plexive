import asyncio
import json
import logging
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import anyio.to_thread
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..auth import decode_access_token
from ..database import SessionLocal
from ..models import User
from ..rate_limit import check_rate_limit
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

logger = logging.getLogger("app.battle")

router = APIRouter(prefix="/battle", tags=["battle"])

# A WS frame larger than this cannot be a valid battle frame; reject before JSON parsing.
WS_FRAME_MAX_BYTES = 4 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10
# A recipient that cannot take a frame within this window is treated as dead
# (BUG-085/M141), mirroring chat's send timeout.
WS_SEND_TIMEOUT_SECONDS = 5
# Sanity bounds for client-reported progress/finish values: index is a question
# position, score a small correct-count-derived number. Reject junk instead of
# relaying it to the opponent (BUG-086).
SCORE_MAX = 1000

# WebSocket close codes (4xxx range is reserved for applications).
WS_CLOSE_UNAUTHORIZED = 4401
WS_CLOSE_INSECURE = 4403
WS_CLOSE_TRY_AGAIN = 4429  # too many handshake attempts, or the pre-auth pool is full

# Number of questions in one duel. The clients derive the SAME question
# sequence from the shared seed (mobile/src/lib/battle/seededQuestions.ts), so
# the server only needs to agree on the length.
BATTLE_QUESTION_COUNT = 7


@dataclass
class Room:
    """One live 1v1 pairing. Both players' _rooms entries point at the SAME
    instance, so pairing state can never go asymmetric (BUG-040). `finished`
    holds the ids whose finish frame was relayed; a player who finished their
    side is no longer busy (ARCH-004/BUG-041). battle_id stamps every frame of
    this duel so clients (and the relay) can drop frames from a battle that is
    already over (BUG-010/BUG-087)."""

    battle_id: str
    players: Tuple[int, int]
    seed: int
    finished: set = field(default_factory=set)

    def partner_of(self, user_id: int) -> int:
        a, b = self.players
        return b if user_id == a else a


# (target_user_id, payload) pairs a caller must deliver AFTER the manager lock
# is released; the manager never awaits socket sends while holding the lock.
Notification = Tuple[int, dict]


class BattleManager:
    """In-memory registry of open battle sockets keyed by user id, plus the
    current 1v1 rooms. One socket per user (latest connection wins).
    Single-process only, consistent with the chat ConnectionManager and the
    in-memory rate limiter; a multi-worker deployment would need a shared
    broker (e.g. Redis pub/sub). Protected by the single-worker deployment
    invariant (M138, see backend/railway.toml).

    Every decision that reads AND writes pairing state happens inside one lock
    acquisition (M142): the old check-then-pair sequence took the lock once per
    step, so a concurrent disconnect or counter-challenge could interleave
    (BUG-010/BUG-040)."""

    def __init__(self) -> None:
        self._sockets: dict[int, WebSocket] = {}
        self._rooms: dict[int, Room] = {}
        self._lock = asyncio.Lock()

    def _teardown_room(self, room: Room) -> List[Notification]:
        """Drop a room for both players; returns opponent_left notifications
        for every member still connected. Callers hold the lock."""
        notifications = []
        for member in room.players:
            if self._rooms.get(member) is room:
                self._rooms.pop(member, None)
            if member in self._sockets:
                notifications.append(
                    (member, {"type": "opponent_left", "battle_id": room.battle_id})
                )
        return notifications

    async def connect(self, user_id: int, websocket: WebSocket) -> List[Notification]:
        """Register the user's socket (latest connection wins) and tear down
        any room they were in: the new socket knows nothing about the old
        battle, so keeping the room made the user a ghost opponent and read as
        busy to challengers (BUG-039). Returns notifications to deliver."""
        async with self._lock:
            stale = self._sockets.get(user_id)
            self._sockets[user_id] = websocket
            notifications = []
            room = self._rooms.get(user_id)
            if room is not None:
                # Notify only the partner; this user's new socket is in the
                # lobby and has no battle to end.
                notifications = [
                    n for n in self._teardown_room(room) if n[0] != user_id
                ]
        if stale is not None and stale is not websocket:
            try:
                await stale.close()
            except Exception:
                pass
        return notifications

    async def disconnect(self, user_id: int, websocket: WebSocket) -> List[Notification]:
        """Unregister this socket if it is still the active one for the user;
        tears the room down on both sides. Returns opponent_left notifications
        for the surviving partner."""
        async with self._lock:
            if self._sockets.get(user_id) is not websocket:
                # A newer socket replaced us (reconnect); connect() already
                # handled the room.
                return []
            self._sockets.pop(user_id, None)
            room = self._rooms.get(user_id)
            if room is None:
                return []
            return [n for n in self._teardown_room(room) if n[0] != user_id]

    async def room_of(self, user_id: int) -> Optional[Room]:
        async with self._lock:
            return self._rooms.get(user_id)

    async def challenge(self, challenger_id: int, target_id: int) -> Tuple[str, Optional[Room], List[Notification]]:
        """The whole challenge decision in ONE lock acquisition (BUG-010/040).

        Returns (outcome, room, notifications):
        - ("offline", None, []): target has no socket.
        - ("target_busy", None, []): target is mid-battle with someone else.
        - ("challenger_busy", None, []): the challenger is mid-battle.
        - ("start", room, notifications): paired. A symmetric counter-challenge
          within the same live pair reuses the existing room's seed and
          battle_id instead of forking two battles with divergent seeds
          (BUG-010). Leftover finished-side rooms are torn down and their
          partners notified (ARCH-012/BUG-038).

        "Busy" means: in a room AND has not finished their own side. A player
        who finished (or whose battle the partner abandoned) is challengeable
        again (ARCH-004/BUG-041).
        """
        async with self._lock:
            if target_id not in self._sockets:
                return "offline", None, []

            challenger_room = self._rooms.get(challenger_id)
            if challenger_room is not None:
                if (
                    challenger_room.partner_of(challenger_id) == target_id
                    and not challenger_room.finished
                ):
                    # Mutual challenge / duplicate tap on a live pair: converge
                    # on the existing battle instead of forking seeds.
                    return "start", challenger_room, []
                if challenger_id not in challenger_room.finished:
                    return "challenger_busy", None, []

            target_room = self._rooms.get(target_id)
            if target_room is not None and target_id not in target_room.finished:
                return "target_busy", None, []

            # Both are free: clear any leftover half-finished rooms, notifying
            # the abandoned partners instead of stranding them (ARCH-012).
            notifications: List[Notification] = []
            for room in (challenger_room, target_room):
                if room is not None:
                    notifications.extend(
                        n for n in self._teardown_room(room)
                        if n[0] not in (challenger_id, target_id)
                    )

            room = Room(
                battle_id=secrets.token_hex(8),
                players=(challenger_id, target_id),
                seed=random.randint(1, 2_147_483_647),
            )
            self._rooms[challenger_id] = room
            self._rooms[target_id] = room
            return "start", room, notifications

    async def finish(self, user_id: int, client_battle_id) -> Tuple[str, Optional[int], Optional[str]]:
        """Record a finish frame. Returns (outcome, partner_id, battle_id):
        ("ok", partner, id) relays opponent_finish; ("stale", None, None) means
        the frame belongs to a battle that is already over; ("none", None,
        None) means the user is not in a battle. When both sides have finished
        the room is dropped, so both players immediately read as free to new
        challengers (ARCH-004/BUG-041) and a rematch is just a fresh challenge."""
        async with self._lock:
            room = self._rooms.get(user_id)
            if room is None:
                return "none", None, None
            if client_battle_id is not None and client_battle_id != room.battle_id:
                return "stale", None, None
            room.finished.add(user_id)
            partner = room.partner_of(user_id)
            if len(room.finished) == 2:
                for member in room.players:
                    if self._rooms.get(member) is room:
                        self._rooms.pop(member, None)
            return "ok", partner, room.battle_id

    async def send(self, user_id: int, payload: dict) -> None:
        async with self._lock:
            ws = self._sockets.get(user_id)
        if ws is None:
            return
        try:
            # Timeout treats an alive-but-stalled socket like a dead one so a
            # full TCP buffer cannot block the sender's loop (BUG-085/M141).
            await asyncio.wait_for(ws.send_json(payload), timeout=WS_SEND_TIMEOUT_SECONDS)
        except Exception:
            # Dead or stalled: close it so its handler's finally block cleans up.
            try:
                await asyncio.wait_for(ws.close(), timeout=1)
            except Exception:
                pass


manager = BattleManager()


async def _error(websocket: WebSocket, detail: str, code: Optional[str] = None) -> None:
    # `code` is a machine-readable discriminator (e.g. "not_in_battle") so the
    # client can react to specific failures without string-matching the
    # human-readable detail (M142/BUG-011).
    payload = {"type": "error", "detail": detail}
    if code is not None:
        payload["code"] = code
    try:
        await websocket.send_json(payload)
    except Exception:
        # Replying to a just-closed socket must not raise past the handler
        # (BUG-086); its own finally block does the cleanup.
        pass


def _valid_score(score) -> bool:
    """A relayable score: a real number (bool excluded, it passes isinstance
    int) within sane bounds (BUG-086)."""
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return False
    return 0 <= score <= SCORE_MAX


def _load_active_user(user_id: int) -> Optional[User]:
    """Auth-time user lookup. Sync on purpose: runs via anyio.to_thread so the
    remote round trip never blocks the event loop (BE-012/M140)."""
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()


def _load_target(username: str):
    """Challenge-target lookup, threadpool-bound like _load_active_user (M140).
    Returns (id, username) or (None, None)."""
    db = SessionLocal()
    try:
        target = db.query(User).filter(User.username == username, User.is_active == True).first()
        return (target.id, target.username) if target else (None, None)
    finally:
        db.close()


async def _handle_challenge(websocket: WebSocket, user_id: int, username: str, data: dict) -> None:
    target_username = data.get("username")
    if not isinstance(target_username, str) or not target_username.strip():
        await _error(websocket, "Pick someone to battle.")
        return
    target_username = target_username.strip()

    # Light abuse guard: cap challenge attempts per user.
    try:
        check_rate_limit(user_id, "battle_challenge", 30, 60)
    except HTTPException:
        await _error(websocket, "Too many challenges. Slow down.")
        return

    # Resolve the opponent account: short-lived session per event, run in the
    # threadpool so the round trip never blocks the loop (BE-012/M140).
    target_id, target_name = await anyio.to_thread.run_sync(_load_target, target_username)

    if target_id is None:
        await _error(websocket, "User not found.")
        return
    if target_id == user_id:
        await _error(websocket, "You cannot battle yourself.")
        return

    # One atomic decision (online + busy + pair, M142/BUG-010/BUG-040). Both
    # clients seed an identical PRNG with the room's `seed` to derive the same
    # question sequence, so the server stays out of question content entirely
    # (mock-phase trust model, see train.py). Each side is told the OTHER
    # username so either player can request a rematch.
    outcome, room, notifications = await manager.challenge(user_id, target_id)
    for member_id, payload in notifications:
        await manager.send(member_id, payload)

    if outcome == "offline":
        await websocket.send_json({"type": "opponent_unavailable", "username": target_name, "reason": "offline"})
        return
    if outcome == "target_busy":
        await websocket.send_json({"type": "opponent_unavailable", "username": target_name, "reason": "busy"})
        return
    if outcome == "challenger_busy":
        await _error(websocket, "Finish your current battle before starting a new one.", code="in_battle")
        return

    start = {"type": "battle_start", "battle_id": room.battle_id, "seed": room.seed, "count": BATTLE_QUESTION_COUNT}
    await manager.send(user_id, {**start, "opponent": target_name})
    await manager.send(target_id, {**start, "opponent": username})


def _client_battle_id(data: dict) -> Optional[str]:
    """The battle_id a frame claims to belong to. Optional for now: frames
    without one are relayed against the current room (legacy clients); when
    present it must match, so a frame from a finished battle is dropped
    instead of leaking into the next one (BUG-010/BUG-087)."""
    battle_id = data.get("battle_id")
    return battle_id if isinstance(battle_id, str) and battle_id else None


async def _relay_to_opponent(websocket: WebSocket, user_id: int, client_battle_id: Optional[str], payload: dict) -> None:
    """Forward a frame to the user's current room partner. Never trust a target
    from the client — the partner is whoever the server paired us with."""
    room = await manager.room_of(user_id)
    if room is None:
        await _error(websocket, "You are not in a battle.", code="not_in_battle")
        return
    if client_battle_id is not None and client_battle_id != room.battle_id:
        await _error(websocket, "That battle is already over.", code="stale_battle")
        return
    await manager.send(room.partner_of(user_id), {**payload, "battle_id": room.battle_id})


@router.websocket("/ws")
async def battle_websocket(websocket: WebSocket):
    if not is_secure_or_local(websocket):
        # Reject the handshake outright: battle must run over wss in production.
        await websocket.close(code=WS_CLOSE_INSECURE)
        return

    # Pre-auth per-IP handshake throttle (M137/SEC-021): close before accept().
    host = websocket.client.host if websocket.client else "unknown"
    if not connection_attempt_allowed(host):
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    await websocket.accept()

    # Cap concurrent sockets connected but not yet authenticated (M137/SEC-021).
    if not try_enter_unauthenticated():
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    # First frame must be {"type": "auth", "token": "<jwt>"}, exactly like chat —
    # the token is never put in the URL so it cannot end up in access logs. The
    # pre-auth slot is held only until the outcome is known.
    try:
        try:
            raw = await asyncio.wait_for(receive_text_frame(websocket), timeout=WS_AUTH_TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, WebSocketDisconnect):
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
        # A binary frame or an oversized auth frame is not a valid handshake;
        # the auth frame was previously exempt from any size cap (BUG-086).
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

        # Threadpool lookup: the auth round trip must not stall the loop (M140).
        user = await anyio.to_thread.run_sync(_load_active_user, user_id)
        username = user.username if user else None
        # Reject a token whose version was revoked by a password change (M126).
        if not user or username is None or user.token_version != token_version:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
    finally:
        leave_unauthenticated()

    # A takeover (reconnect / second tab) tears down any room the user was in:
    # the new socket starts in the lobby, so keeping the room made the user a
    # ghost opponent (BUG-039). The abandoned partner is told the battle ended.
    notifications = await manager.connect(user_id, websocket)
    for member_id, payload in notifications:
        await manager.send(member_id, payload)
    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})
        next_recheck = time.monotonic() + WS_REVALIDATE_SECONDS
        while True:
            raw = await receive_text_frame(websocket)
            # Re-validate per frame (M137/BUG-037): token must still decode every
            # frame; is_active/token_version re-checked in the DB once per interval.
            if not token_still_valid(token, user_id, token_version):
                await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
                break
            now = time.monotonic()
            if now >= next_recheck:
                # Threadpool: the periodic DB re-check must not stall the loop (M140).
                if not await anyio.to_thread.run_sync(user_still_active, user_id, token_version):
                    await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
                    break
                next_recheck = now + WS_REVALIDATE_SECONDS
            if raw is None:
                await _error(websocket, "Frames must be text.")
                continue
            # Byte-length cap, not code points (BUG-086); the char check
            # short-circuits encoding absurdly long frames.
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
            elif msg_type == "challenge":
                # A transient DB failure inside one frame must cost that frame,
                # not the whole connection (BUG-034).
                try:
                    await _handle_challenge(websocket, user_id, username, data)
                except Exception:
                    logger.exception("battle challenge failed (user %s)", user_id)
                    await _error(websocket, "Could not start the battle. Try again.")
            elif msg_type == "progress":
                # The sender's per-question result, mirrored to the opponent.
                # bool is an int subclass, so exclude it explicitly; bound the
                # values so junk never reaches the opponent (BUG-086).
                index = data.get("index")
                correct = data.get("correct")
                score = data.get("score")
                if (
                    not isinstance(index, int) or isinstance(index, bool)
                    or not isinstance(correct, bool)
                    or not _valid_score(score)
                    or not 0 <= index < BATTLE_QUESTION_COUNT
                ):
                    await _error(websocket, "progress requires index (int), correct (bool), score (number).")
                    continue
                await _relay_to_opponent(
                    websocket, user_id, _client_battle_id(data),
                    {"type": "opponent_progress", "index": index, "correct": correct, "score": score},
                )
            elif msg_type == "finish":
                score = data.get("score")
                if not _valid_score(score):
                    await _error(websocket, "finish requires score (number).")
                    continue
                outcome, partner, battle_id = await manager.finish(user_id, _client_battle_id(data))
                if outcome == "none":
                    await _error(websocket, "You are not in a battle.", code="not_in_battle")
                elif outcome == "stale":
                    await _error(websocket, "That battle is already over.", code="stale_battle")
                else:
                    await manager.send(partner, {"type": "opponent_finish", "score": score, "battle_id": battle_id})
            else:
                await _error(websocket, f"Unknown frame type: {msg_type!r}")
    except WebSocketDisconnect:
        pass
    finally:
        for member_id, payload in await manager.disconnect(user_id, websocket):
            await manager.send(member_id, payload)
