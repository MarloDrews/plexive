import asyncio
import ipaddress
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from ..auth import decode_access_token, get_current_user
from ..database import SessionLocal, get_db
from ..models import Conversation, ConversationParticipant, Follow, Message, User
from ..rate_limit import check_rate_limit
from ._shared import get_target_user

router = APIRouter(prefix="/chat", tags=["chat"])

MESSAGE_MAX_CHARS = 2000
GROUP_MAX_MEMBERS = 20
GROUP_NAME_MAX_CHARS = 80
# A WS frame larger than this cannot be a valid message; reject before JSON parsing.
WS_FRAME_MAX_BYTES = 16 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10

# WebSocket close codes (4xxx range is reserved for applications).
WS_CLOSE_UNAUTHORIZED = 4401
WS_CLOSE_INSECURE = 4403


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _can_message(db: Session, viewer_id: int, target_id: int) -> bool:
    """A conversation may be started only between users connected by an
    accepted follow in either direction. Private accounts approve follows,
    so they are unreachable until they accept one."""
    return db.query(Follow).filter(
        Follow.status == "accepted",
        or_(
            and_(Follow.follower_id == viewer_id, Follow.following_id == target_id),
            and_(Follow.follower_id == target_id, Follow.following_id == viewer_id),
        ),
    ).first() is not None


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
                "is_verified": p.user.is_verified,
            }
            for p in c.participants if p.user
        ],
        "last_message": _serialize_message(last_message) if last_message else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


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

    targets: List[User] = []
    seen_ids = {current_user.id}
    for username in body.usernames:
        user = get_target_user(username, db, detail=f"User not found: {username}")
        if user.id in seen_ids:
            continue
        seen_ids.add(user.id)
        targets.append(user)
    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid recipients.")

    for target in targets:
        if not _can_message(db, current_user.id, target.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only message people you follow or who follow you: {target.username}",
            )

    is_group = len(targets) > 1

    if not is_group:
        # One DM per user pair: return the existing conversation if present.
        target = targets[0]
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
            existing = (
                db.query(Conversation)
                .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
                .filter(Conversation.id == existing.id)
                .first()
            )
            last = (
                db.query(Message)
                .options(selectinload(Message.sender))
                .filter(Message.conversation_id == existing.id)
                .order_by(Message.id.desc())
                .first()
            )
            return _serialize_conversation(existing, current_user.id, last)

    conv = Conversation(
        is_group=is_group,
        name=body.name if is_group else None,
        created_by=current_user.id,
    )
    db.add(conv)
    db.flush()
    for user in [current_user, *targets]:
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=user.id))
    db.commit()

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
    would need a shared broker (e.g. Redis pub/sub) instead."""

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if sockets:
                sockets.discard(websocket)
                if not sockets:
                    self._connections.pop(user_id, None)

    async def send_to_users(self, user_ids: List[int], payload: dict) -> None:
        async with self._lock:
            sockets = [ws for uid in user_ids for ws in self._connections.get(uid, ())]
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                # A dead socket is cleaned up by its own handler's finally block.
                pass


manager = ConnectionManager()


def _is_secure_or_local(websocket: WebSocket) -> bool:
    """Require wss outside local development. TLS usually terminates at a
    reverse proxy, so x-forwarded-proto counts as secure too. Plain ws is also
    allowed from loopback and private LAN ranges (RFC1918 / link-local) so dev
    clients -- the Android emulator or a phone reaching the dev machine by its
    192.168.x.x address -- can connect; those addresses are never publicly
    routable, so the "force TLS on the public internet" guarantee stands.
    Mirrors the same gate in routers/battle.py."""
    if websocket.url.scheme == "wss":
        return True
    if websocket.headers.get("x-forwarded-proto", "").lower() in ("https", "wss"):
        return True
    host = websocket.client.host if websocket.client else ""
    if host in ("localhost", "testclient"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


async def _ws_error(websocket: WebSocket, detail: str) -> None:
    await websocket.send_json({"type": "error", "detail": detail})


async def _handle_send(websocket: WebSocket, user_id: int, data: dict) -> None:
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

    try:
        check_rate_limit(user_id, "chat_message", 30, 60)
    except HTTPException:
        await _ws_error(websocket, "Rate limit exceeded. Slow down.")
        return

    # Short-lived session per event; the connection itself holds no session.
    db = SessionLocal()
    try:
        # Participant check on every send — never trust the client.
        if not _get_participant(db, conversation_id, user_id):
            await _ws_error(websocket, "Conversation not found.")
            return
        message = Message(conversation_id=conversation_id, sender_id=user_id, body=body)
        db.add(message)
        db.commit()
        message = (
            db.query(Message)
            .options(selectinload(Message.sender))
            .filter(Message.id == message.id)
            .first()
        )
        participant_ids = [
            p.user_id
            for p in db.query(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == conversation_id
            ).all()
        ]
        payload = {"type": "message", "message": _serialize_message(message)}
    finally:
        db.close()

    await manager.send_to_users(participant_ids, payload)


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    if not _is_secure_or_local(websocket):
        # Reject the handshake outright: chat must run over wss in production.
        await websocket.close(code=WS_CLOSE_INSECURE)
        return

    await websocket.accept()

    # First frame must be {"type": "auth", "token": "<jwt>"}. The token is
    # never put in the URL so it cannot end up in access logs.
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS)
        first = json.loads(raw)
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
        return

    if not isinstance(first, dict) or first.get("type") != "auth" or not isinstance(first.get("token"), str):
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
        return

    try:
        user_id = decode_access_token(first["token"])
    except HTTPException:
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()
    if not user:
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED)
        return

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})
        while True:
            raw = await websocket.receive_text()
            if len(raw) > WS_FRAME_MAX_BYTES:
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
                await _handle_send(websocket, user_id, data)
            else:
                await _ws_error(websocket, f"Unknown frame type: {msg_type!r}")
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
