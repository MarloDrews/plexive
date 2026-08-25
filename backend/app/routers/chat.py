import asyncio
import json
import logging
import time
from typing import List, Optional

import anyio.to_thread
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..auth import decode_access_token, get_current_user
from ..database import SessionLocal, get_db
from ..models import Conversation, ConversationParticipant, Follow, Message, User
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

logger = logging.getLogger("app.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

MESSAGE_MAX_CHARS = 2000
GROUP_MAX_MEMBERS = 20
GROUP_NAME_MAX_CHARS = 80
# A WS frame larger than this cannot be a valid message; reject before JSON parsing.
WS_FRAME_MAX_BYTES = 16 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10
# A recipient socket that cannot take a frame within this window is treated as
# dead: one full TCP buffer must not stall delivery to everyone after it and
# block the sender's receive loop (ARCH-005/BUG-085/M141).
WS_SEND_TIMEOUT_SECONDS = 5
# Optional client correlation tag echoed back in the broadcast (BUG-035).
SEND_TAG_MAX_CHARS = 64

# WebSocket close codes (4xxx range is reserved for applications).
WS_CLOSE_UNAUTHORIZED = 4401
WS_CLOSE_INSECURE = 4403
WS_CLOSE_TRY_AGAIN = 4429  # too many handshake attempts, or the pre-auth pool is full


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _messageable_ids(db: Session, viewer_id: int, target_ids: List[int]) -> set:
    """The subset of target_ids the viewer may message: a conversation may be
    started only between users connected by an accepted follow in either
    direction. Private accounts approve follows, so they are unreachable until
    they accept one. One batched query for all targets instead of one each."""
    if not target_ids:
        return set()
    rows = db.query(Follow.follower_id, Follow.following_id).filter(
        Follow.status == "accepted",
        or_(
            and_(Follow.follower_id == viewer_id, Follow.following_id.in_(target_ids)),
            and_(Follow.follower_id.in_(target_ids), Follow.following_id == viewer_id),
        ),
    ).all()
    return {
        following_id if follower_id == viewer_id else follower_id
        for follower_id, following_id in rows
    }


def _get_participant(db: Session, conversation_id: int, user_id: int) -> Optional[ConversationParticipant]:
    return db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == user_id,
    ).first()


def _serialize_message(m: Message) -> dict:
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "sender_username": m.sender.username if m.sender else None,
        "body": m.body,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _serialize_conversation(c: Conversation, viewer_id: int, last_message: Optional[Message]) -> dict:
    others = [p.user for p in c.participants if p.user_id != viewer_id and p.user]
    if c.is_group:
        display_name = c.name or ", ".join(u.username for u in others)
    else:
        display_name = others[0].username if others else "(deleted user)"
    return {
        "id": c.id,
        "is_group": c.is_group,
        "name": display_name,
        "participants": [
            {
                "username": p.user.username,
                "avatar_url": p.user.avatar_url,
                "avatar_frame_id": p.user.avatar_frame_id,
                "is_verified": p.user.is_verified,
            }
            for p in c.participants if p.user
        ],
        "last_message": _serialize_message(last_message) if last_message else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _conversation_response(db: Session, conversation_id: int, viewer_id: int) -> dict:
    """An existing conversation serialized with participants + last message.
    Shared by the DM-dedupe hit and the concurrent-create loser (M145)."""
    conv = (
        db.query(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id == conversation_id)
        .first()
    )
    last = (
        db.query(Message)
        .options(selectinload(Message.sender))
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc())
        .first()
    )
    return _serialize_conversation(conv, viewer_id, last)


# ---------------------------------------------------------------------------
# REST: conversation list / create / message history
# ---------------------------------------------------------------------------

class ConversationCreate(BaseModel):
    usernames: List[str]
    name: Optional[str] = None

    @field_validator("usernames")
    @classmethod
    def validate_usernames(cls, v: List[str]) -> List[str]:
        v = [u.strip() for u in v if u.strip()]
        if not 1 <= len(v) <= GROUP_MAX_MEMBERS - 1:
            raise ValueError(f"usernames must have 1-{GROUP_MAX_MEMBERS - 1} entries")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > GROUP_NAME_MAX_CHARS:
            raise ValueError(f"name must be at most {GROUP_NAME_MAX_CHARS} characters")
        return v or None


@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv_ids = [
        row.conversation_id
        for row in db.query(ConversationParticipant).filter(
            ConversationParticipant.user_id == current_user.id
        ).all()
    ]
    if not conv_ids:
        return []

    convs = (
        db.query(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id.in_(conv_ids))
        .all()
    )

    last_id_rows = (
        db.query(func.max(Message.id))
        .filter(Message.conversation_id.in_(conv_ids))
        .group_by(Message.conversation_id)
        .all()
    )
    last_messages = (
        db.query(Message)
        .options(selectinload(Message.sender))
        .filter(Message.id.in_([row[0] for row in last_id_rows]))
        .all()
    ) if last_id_rows else []
    last_by_conv = {m.conversation_id: m for m in last_messages}

    out = [_serialize_conversation(c, current_user.id, last_by_conv.get(c.id)) for c in convs]
    # Most recent activity first (last message, falling back to creation time).
    out.sort(
        key=lambda c: (c["last_message"] or {}).get("created_at") or c["created_at"] or "",
        reverse=True,
    )
    return out


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "chat_create", 20, 3600)

    # One IN query for all requested usernames instead of one lookup each; the
    # first unknown username in request order is still the one reported.
    found = {
        u.username: u
        for u in db.query(User).filter(
            User.username.in_(body.usernames), User.is_active == True
        ).all()
    }
    targets: List[User] = []
    seen_ids = {current_user.id}
    for username in body.usernames:
        user = found.get(username)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User not found: {username}",
            )
        if user.id in seen_ids:
            continue
        seen_ids.add(user.id)
        targets.append(user)
    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid recipients.")

    # A request shaped like a group (2+ usernames, or a name) that collapses
    # to a single recipient after dropping the caller and duplicates is an
    # error, never silently degraded into a DM (M145/BUG-088, decision 11):
    # the caller asked for a group and would otherwise get an old DM back with
    # the name dropped and no signal.
    if len(body.usernames) >= 2 and len(targets) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A group needs at least 2 other people; remove yourself and duplicates from the list.",
        )
    if body.name and len(targets) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only group conversations can be named.",
        )

    # One batched follow query for all targets; the first non-messageable
    # target in request order is still the one reported.
    messageable = _messageable_ids(db, current_user.id, [t.id for t in targets])
    for target in targets:
        if target.id not in messageable:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only message people you follow or who follow you: {target.username}",
            )

    is_group = len(targets) > 1

    dm_key = None
    if not is_group:
        # One DM per user pair: return the existing conversation if present.
        # The lookup goes via participants (not dm_key) so pre-migration rows
        # without a key still dedupe; the key makes the race structural below.
        target = targets[0]
        dm_key = f"{min(current_user.id, target.id)}:{max(current_user.id, target.id)}"
        my_conv_ids = db.query(ConversationParticipant.conversation_id).filter(
            ConversationParticipant.user_id == current_user.id
        )
        existing = (
            db.query(Conversation)
            .join(ConversationParticipant, ConversationParticipant.conversation_id == Conversation.id)
            .filter(
                Conversation.is_group == False,
                Conversation.id.in_(my_conv_ids),
                ConversationParticipant.user_id == target.id,
            )
            .first()
        )
        if existing:
            return _conversation_response(db, existing.id, current_user.id)

    conv = Conversation(
        is_group=is_group,
        name=body.name if is_group else None,
        dm_key=dm_key,
        created_by=current_user.id,
    )
    db.add(conv)
    try:
        db.flush()
        for user in [current_user, *targets]:
            db.add(ConversationParticipant(conversation_id=conv.id, user_id=user.id))
        db.commit()
    except IntegrityError:
        # Both users tapped "message" at once (M145/BUG-036): the unique
        # dm_key means the other request won; return its conversation instead
        # of forking the pair into two histories.
        db.rollback()
        winner = (
            db.query(Conversation).filter(Conversation.dm_key == dm_key).first()
            if dm_key is not None
            else None
        )
        if winner is None:
            raise
        return _conversation_response(db, winner.id, current_user.id)

    conv = (
        db.query(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id == conv.id)
        .first()
    )
    return _serialize_conversation(conv, current_user.id, None)


@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: int,
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 404 (not 403) so non-participants cannot probe which conversation ids exist.
    if not _get_participant(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    limit = max(1, min(limit, 100))
    query = (
        db.query(Message)
        .options(selectinload(Message.sender))
        .filter(Message.conversation_id == conversation_id)
    )
    if before_id is not None:
        query = query.filter(Message.id < before_id)
    messages = query.order_by(Message.id.desc()).limit(limit).all()
    return [_serialize_message(m) for m in reversed(messages)]


# ---------------------------------------------------------------------------
# WebSocket: live messaging
# ---------------------------------------------------------------------------

class ConnectionManager:
    """In-memory registry of open sockets per user id. Single-process only,
    consistent with the in-memory rate limiter; a multi-worker deployment
    would need a shared broker (e.g. Redis pub/sub) instead. Protected by the
    single-worker deployment invariant (M138, see backend/railway.toml).

    Sockets per user are CAPPED (M147/ARCH-011): the registry held every
    authenticated socket a single account opened, so one scripted account
    could hold thousands, each a registry entry every broadcast iterates.
    Insertion order is kept (list, not set) so the oldest is the one evicted."""

    MAX_SOCKETS_PER_USER = 4

    def __init__(self) -> None:
        self._connections: dict[int, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.setdefault(user_id, [])
            sockets.append(websocket)
            evicted = sockets.pop(0) if len(sockets) > self.MAX_SOCKETS_PER_USER else None
        if evicted is not None:
            # Close outside the lock; the evicted socket's own handler runs
            # the disconnect cleanup.
            try:
                await asyncio.wait_for(evicted.close(), timeout=1)
            except Exception:
                pass

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if sockets:
                if websocket in sockets:
                    sockets.remove(websocket)
                if not sockets:
                    self._connections.pop(user_id, None)

    async def send_to_users(self, user_ids: List[int], payload: dict) -> None:
        async with self._lock:
            sockets = [ws for uid in user_ids for ws in self._connections.get(uid, ())]
        for ws in sockets:
            try:
                # Timeout treats an alive-but-stalled socket (full TCP buffer)
                # like a dead one, so one frozen recipient cannot block the
                # sender's receive loop and everyone after it (ARCH-005/M141).
                await asyncio.wait_for(ws.send_json(payload), timeout=WS_SEND_TIMEOUT_SECONDS)
            except Exception:
                # Dead or stalled: close it so its handler's finally block
                # unregisters it; registry cleanup never happens here.
                try:
                    await asyncio.wait_for(ws.close(), timeout=1)
                except Exception:
                    pass


manager = ConnectionManager()


async def _ws_error(websocket: WebSocket, detail: str) -> None:
    try:
        await websocket.send_json({"type": "error", "detail": detail})
    except Exception:
        # Replying to a just-closed socket must not raise past the handler
        # (BUG-086); its own finally block does the cleanup.
        pass


def _load_active_user(user_id: int) -> Optional[User]:
    """Auth-time user lookup. Sync on purpose: runs via anyio.to_thread so the
    remote round trip never blocks the event loop (BE-004/M140)."""
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()


def _persist_message(conversation_id: int, user_id: int, username: str, body: str):
    """Participant check + insert + participant list, one short-lived session.

    Sync on purpose: the websocket handler awaits this via anyio.to_thread so
    the sequential remote round trips run in the threadpool like every REST
    handler instead of stalling the event loop for all sockets (BE-004/M140).

    The broadcast dict is built from the FLUSHED row before commit (BUG-035/
    M141): once the commit succeeds there is nothing left that can raise, so a
    stored message can no longer lose its own broadcast. The sender username
    comes from the socket's auth (no re-SELECT; a mid-session username change
    shows up on the next connect, matching the socket's other cached identity).
    Returns (payload, participant_ids); payload is None when the sender is not
    a participant.
    """
    db = SessionLocal()
    try:
        # Participant check on every send; never trust the client.
        if not _get_participant(db, conversation_id, user_id):
            return None, []
        participant_ids = [
            p.user_id
            for p in db.query(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == conversation_id
            ).all()
        ]
        message = Message(conversation_id=conversation_id, sender_id=user_id, body=body)
        db.add(message)
        db.flush()  # assigns id + created_at
        payload = {
            "type": "message",
            "message": {
                "id": message.id,
                "conversation_id": conversation_id,
                "sender_id": user_id,
                "sender_username": username,
                "body": message.body,
                "created_at": message.created_at.isoformat() if message.created_at else None,
            },
        }
        db.commit()
        return payload, participant_ids
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _handle_send(websocket: WebSocket, user_id: int, username: str, data: dict) -> None:
    conversation_id = data.get("conversation_id")
    body = data.get("body")
    if not isinstance(conversation_id, int) or not isinstance(body, str):
        await _ws_error(websocket, "send requires conversation_id (int) and body (string).")
        return
    body = body.strip()
    if not body:
        await _ws_error(websocket, "Message body cannot be empty.")
        return
    if len(body) > MESSAGE_MAX_CHARS:
        await _ws_error(websocket, f"Message body must be at most {MESSAGE_MAX_CHARS} characters.")
        return
    # Optional client correlation tag, echoed verbatim in the broadcast so a
    # sender can match the echo to a pending optimistic send (BUG-035/M141).
    tag = data.get("tag")
    if not isinstance(tag, str) or not tag or len(tag) > SEND_TAG_MAX_CHARS:
        tag = None

    try:
        check_rate_limit(user_id, "chat_message", 30, 60)
    except HTTPException:
        await _ws_error(websocket, "Rate limit exceeded. Slow down.")
        return

    payload, participant_ids = await anyio.to_thread.run_sync(
        _persist_message, conversation_id, user_id, username, body
    )
    if payload is None:
        await _ws_error(websocket, "Conversation not found.")
        return

    if tag is not None:
        payload = {**payload, "tag": tag}
    await manager.send_to_users(participant_ids, payload)


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    if not is_secure_or_local(websocket):
        # Reject the handshake outright: chat must run over wss in production.
        await websocket.close(code=WS_CLOSE_INSECURE)
        return

    # Pre-auth per-IP handshake throttle (M137/SEC-021): closing before accept()
    # rejects the handshake without allocating a socket.
    host = websocket.client.host if websocket.client else "unknown"
    if not connection_attempt_allowed(host):
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    await websocket.accept()

    # Cap concurrent sockets that have connected but not yet authenticated, so a
    # client cannot hold many idle pre-auth sockets open (M137/SEC-021).
    if not try_enter_unauthenticated():
        await websocket.close(code=WS_CLOSE_TRY_AGAIN)
        return

    # First frame must be {"type": "auth", "token": "<jwt>"}. The token is
    # never put in the URL so it cannot end up in access logs. The slot is held
    # only for the pre-auth phase and released once we know the outcome.
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
        # Reject a token whose version was revoked by a password change (M126).
        if not user or user.token_version != token_version:
            await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
            return
    finally:
        leave_unauthenticated()

    username = user.username
    await manager.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})
        next_recheck = time.monotonic() + WS_REVALIDATE_SECONDS
        while True:
            raw = await receive_text_frame(websocket)
            # Re-validate the session on each frame (M137/BUG-037): the token must
            # still decode (catches expiry / a revoked version) every frame, and
            # is_active/token_version are re-checked in the DB at most once per
            # interval so a deactivated account cannot keep using a live socket.
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
                await _ws_error(websocket, "Frames must be text.")
                continue
            # Compare encoded bytes, not code points: a char-counted cap admits
            # up to 4x the intended bytes for multi-byte text (BUG-086). The
            # cheap length check short-circuits encoding absurdly long frames.
            if len(raw) > WS_FRAME_MAX_BYTES or len(raw.encode("utf-8")) > WS_FRAME_MAX_BYTES:
                await _ws_error(websocket, "Frame too large.")
                continue
            try:
                data = json.loads(raw)
            except ValueError:
                await _ws_error(websocket, "Frames must be JSON objects.")
                continue
            if not isinstance(data, dict):
                await _ws_error(websocket, "Frames must be JSON objects.")
                continue
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "send":
                # A transient DB failure inside one frame must cost that frame,
                # not the whole connection (BUG-034): report it as an error
                # frame and keep the loop alive.
                try:
                    await _handle_send(websocket, user_id, username, data)
                except Exception:
                    logger.exception("chat send failed (user %s)", user_id)
                    await _ws_error(websocket, "Could not send the message. Try again.")
            else:
                await _ws_error(websocket, f"Unknown frame type: {msg_type!r}")
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
