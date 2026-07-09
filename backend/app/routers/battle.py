import asyncio
import json
import logging
import random
import time
from typing import Optional

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


class BattleManager:
    """In-memory registry of open battle sockets keyed by user id, plus the
    current 1v1 pairing (user id -> opponent user id). One socket per user
    (latest connection wins). Single-process only, consistent with the chat
    ConnectionManager and the in-memory rate limiter; a multi-worker deployment
    would need a shared broker (e.g. Redis pub/sub). Protected by the
    single-worker deployment invariant (M138, see backend/railway.toml)."""

    def __init__(self) -> None:
        self._sockets: dict[int, WebSocket] = {}
        self._rooms: dict[int, int] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        # Latest connection for a user wins; close any stale socket so a
        # reconnect (mobile sockets drop when backgrounded) cannot leave a
        # ghost registered. The old socket's handler sees it is no longer the
        # registered one and skips the disconnect cleanup.
        async with self._lock:
            stale = self._sockets.get(user_id)
            self._sockets[user_id] = websocket
        if stale is not None and stale is not websocket:
            try:
                await stale.close()
            except Exception:
                pass

    async def disconnect(self, user_id: int, websocket: WebSocket) -> Optional[int]:
        """Unregister this socket if it is still the active one for the user.
        Returns the opponent id (if the user was in a room) so the caller can
        notify the survivor; the room is torn down on both sides."""
        async with self._lock:
            if self._sockets.get(user_id) is not websocket:
                # A newer socket replaced us (reconnect) — leave its room intact.
                return None
            self._sockets.pop(user_id, None)
            opponent = self._rooms.pop(user_id, None)
            if opponent is not None and self._rooms.get(opponent) == user_id:
                self._rooms.pop(opponent, None)
            return opponent

    async def is_online(self, user_id: int) -> bool:
        async with self._lock:
            return user_id in self._sockets

    async def opponent_of(self, user_id: int) -> Optional[int]:
        async with self._lock:
            return self._rooms.get(user_id)

    async def pair(self, a: int, b: int) -> None:
        async with self._lock:
            # Detach any stale partner so re-pairing cannot leave a third user
            # pointing at one of these (defensive; the UI challenges from the
            # lobby only).
            for x in (a, b):
                old = self._rooms.get(x)
                if old is not None and old not in (a, b):
                    self._rooms.pop(old, None)
            self._rooms[a] = b
            self._rooms[b] = a

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


async def _error(websocket: WebSocket, detail: str) -> None:
    try:
        await websocket.send_json({"type": "error", "detail": detail})
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

    # The opponent must be connected (Battle tab open) and free.
    if not await manager.is_online(target_id):
        await websocket.send_json({"type": "opponent_unavailable", "username": target_name})
        return
    busy_with = await manager.opponent_of(target_id)
    if busy_with is not None and busy_with != user_id:
        await websocket.send_json({"type": "opponent_unavailable", "username": target_name})
        return

    # Pair both users and start the duel. Both clients seed an identical PRNG
    # with `seed` to derive the same question sequence, so the server stays out
    # of question content entirely (mock-phase trust model, see train.py). Each
    # side is told the OTHER username so either player can request a rematch.
    await manager.pair(user_id, target_id)
    seed = random.randint(1, 2_147_483_647)
    await manager.send(user_id, {"type": "battle_start", "seed": seed, "count": BATTLE_QUESTION_COUNT, "opponent": target_name})
    await manager.send(target_id, {"type": "battle_start", "seed": seed, "count": BATTLE_QUESTION_COUNT, "opponent": username})


async def _relay_to_opponent(websocket: WebSocket, user_id: int, payload: dict) -> None:
    """Forward a frame to the user's current room partner. Never trust a target
    from the client — the partner is whoever the server paired us with."""
    opponent = await manager.opponent_of(user_id)
    if opponent is None:
        await _error(websocket, "You are not in a battle.")
        return
    await manager.send(opponent, payload)


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

    await manager.connect(user_id, websocket)
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
                    websocket, user_id,
                    {"type": "opponent_progress", "index": index, "correct": correct, "score": score},
                )
            elif msg_type == "finish":
                score = data.get("score")
                if not _valid_score(score):
                    await _error(websocket, "finish requires score (number).")
                    continue
                await _relay_to_opponent(websocket, user_id, {"type": "opponent_finish", "score": score})
            else:
                await _error(websocket, f"Unknown frame type: {msg_type!r}")
    except WebSocketDisconnect:
        pass
    finally:
        opponent = await manager.disconnect(user_id, websocket)
        if opponent is not None:
            await manager.send(opponent, {"type": "opponent_left"})
