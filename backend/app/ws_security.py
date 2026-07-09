"""Shared WebSocket transport-security gate for the chat and battle sockets.

Single source of truth so the two routers cannot drift (they previously each
carried an identical copy of this logic).
"""

import ipaddress
import os

from fastapi import HTTPException, WebSocket

from .auth import decode_access_token
from .database import SessionLocal
from .models import User
from .rate_limit import check_rate_limit

# Tailscale's CGNAT range (RFC 6598 shared address space). It backs a tailnet
# but is NOT covered by ipaddress.is_private, so allow it explicitly for a plain
# ws dev client reaching the machine over Tailscale (BUG-012).
_TAILSCALE_CGNAT = ipaddress.ip_network("100.64.0.0/10")


def _parse_networks(raw: str) -> list:
    nets = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            nets.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            # Ignore a malformed entry rather than crash startup; a typo simply
            # means that proxy is not trusted.
            continue
    return nets


# Reverse proxies whose x-forwarded-proto header we trust. Empty by default: the
# forwarded scheme is honored ONLY when the immediate peer is one of these, so a
# public client cannot spoof "https" over plain ws and bypass the wss
# requirement (SEC-004/SEC-029). Set to the proxy's address/CIDR in production,
# e.g. TRUSTED_PROXY_IPS="127.0.0.1,10.0.0.0/8".
TRUSTED_PROXY_IPS = _parse_networks(os.getenv("TRUSTED_PROXY_IPS", ""))


def _peer_ip(websocket: WebSocket):
    host = websocket.client.host if websocket.client else ""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def _peer_is_trusted_proxy(websocket: WebSocket) -> bool:
    ip = _peer_ip(websocket)
    if ip is None:
        return False
    return any(ip in net for net in TRUSTED_PROXY_IPS)


def is_secure_or_local(websocket: WebSocket) -> bool:
    """Whether the handshake may proceed given the TLS requirement.

    - A native wss handshake is always secure.
    - x-forwarded-proto: https/wss is honored ONLY when the immediate peer is a
      configured trusted reverse proxy. Otherwise any public client could set the
      header over plain ws and defeat the requirement (SEC-004/SEC-029).
    - Plain ws is allowed from loopback / RFC1918 private / link-local / the
      Tailscale CGNAT range, none of which are publicly routable, so dev clients
      (the emulator, a phone on the LAN or tailnet) still connect and the "force
      TLS on the public internet" guarantee stands.
    """
    if websocket.url.scheme == "wss":
        return True
    if (
        websocket.headers.get("x-forwarded-proto", "").lower() in ("https", "wss")
        and _peer_is_trusted_proxy(websocket)
    ):
        return True
    host = websocket.client.host if websocket.client else ""
    if host in ("localhost", "testclient"):
        return True
    ip = _peer_ip(websocket)
    if ip is None:
        return False
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip in _TAILSCALE_CGNAT
    )


# --- pre-auth abuse controls (M137/SEC-021, BUG-037) -------------------------
# A client can open sockets and sit before authenticating, tying up resources.
# Two cheap, in-memory guards bound that: a per-IP handshake-attempt rate and a
# global cap on sockets accepted-but-not-yet-authenticated (single-worker
# deployment invariant, same as rate_limit.py; M138, see backend/railway.toml).
WS_CONNECT_ATTEMPTS_PER_MIN = 30
MAX_UNAUTHENTICATED_SOCKETS = 32
# How often an established socket re-checks is_active / token_version in the DB.
WS_REVALIDATE_SECONDS = 60

_unauthenticated_sockets = 0


def connection_attempt_allowed(host: str) -> bool:
    """Per-IP handshake throttle. Reuses the shared in-memory limiter; returns
    False instead of raising so the caller can close the socket cleanly."""
    try:
        check_rate_limit(f"ws:{host}", "ws_connect", WS_CONNECT_ATTEMPTS_PER_MIN, 60)
        return True
    except HTTPException:
        return False


def try_enter_unauthenticated() -> bool:
    """Reserve one of the limited pre-auth slots. Check-then-increment with no
    await between, so it is atomic under the single-worker event loop. Pair every
    True return with exactly one leave_unauthenticated()."""
    global _unauthenticated_sockets
    if _unauthenticated_sockets >= MAX_UNAUTHENTICATED_SOCKETS:
        return False
    _unauthenticated_sockets += 1
    return True


def leave_unauthenticated() -> None:
    global _unauthenticated_sockets
    if _unauthenticated_sockets > 0:
        _unauthenticated_sockets -= 1


def token_still_valid(token: str, expected_user_id: int, expected_version: int) -> bool:
    """Re-decode the token (no DB): catches expiry and any version mismatch on a
    long-lived socket. False when it no longer decodes to the same user/version."""
    try:
        user_id, version = decode_access_token(token)
    except Exception:
        return False
    return user_id == expected_user_id and version == expected_version


def user_still_active(expected_user_id: int, expected_version: int) -> bool:
    """DB re-check that the account is still active and its token_version is
    unchanged (a password change / deactivation revokes a live socket)."""
    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.id == expected_user_id, User.is_active == True)
            .first()
        )
    finally:
        db.close()
    return bool(user) and user.token_version == expected_version
