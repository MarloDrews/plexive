import asyncio
import contextlib
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import CLOSED_BETA, decode_access_token
from .database import Base, engine
from .rate_limit import SWEEP_INTERVAL_SECONDS, sweep_idle_buckets

load_dotenv()
from . import models  # noqa: F401 — registers models with Base before create_all
from .routers import admin as admin_router, auth as auth_router, comments as comments_router, events as events_router, feed, follows as follows_router, interests as interests_router, posts as posts_router, search as search_router, stats as stats_router
from .routers import arena as arena_router, battle as battle_router, chat as chat_router, graph as graph_router, quiz as quiz_router, thumbnails as thumbnails_router, train as train_router, uploads as uploads_router


# The only paths that answer without a bearer token while the gate is on.
# Each one is a deliberate exception with a reason, not an oversight:
#   /health           a monitor needs it; it returns {"status":"ok"} and no
#                     application content.
#   /api/auth/login   existing accounts must be able to sign in, or the closed
#                     beta is closed to its own testers too.
#   /api/auth/google  the same, for accounts that have no password. Its
#                     account-CREATION branch is closed separately in
#                     routers/auth.py, so it signs in but never registers.
# /api/auth/register is NOT here. It is closed by the gate and, independently,
# by a 403 in its own handler, so reopening the gate does not silently reopen
# registration.
GATE_EXEMPT_PATHS = frozenset({
    "/health",
    "/api/auth/login",
    "/api/auth/google",
})


def _announce_gate() -> None:
    """State the resolved gate value at startup, in both directions.

    CLOSED_BETA is read once at import, so a variable forgotten on the Pi means
    the gate silently does not exist -- and open is the state this whole change
    exists to fix. A checker that only reports when it finds something wrong is
    indistinguishable from a checker that is broken, so this prints on BOTH
    paths. flush=True because systemd captures a block-buffered stdout.
    """
    if CLOSED_BETA:
        print(
            "[closed-beta] gate ON: anonymous requests are refused. Open: "
            + ", ".join(sorted(GATE_EXEMPT_PATHS))
            + ", OPTIONS preflight, websocket handshakes (own first-frame auth).",
            flush=True,
        )
    else:
        print(
            "[closed-beta] gate OFF: the API answers anonymous requests. "
            'Set CLOSED_BETA=1 and restart to close it.',
            flush=True,
        )


def _assert_single_worker() -> None:
    """Enforce the deployment invariant (M138/ARCH-001): exactly one process.

    One Railway replica running one uvicorn worker. The in-memory rate limiter
    (app/rate_limit.py), the chat ConnectionManager, the BattleManager, the
    ArenaManager (queue + live matches), the pre-auth socket counters
    (app/ws_security.py) and the stats caches are all process-local; at N
    processes every rate limit silently multiplies by N, chat/battle delivery
    splits across processes, and the arena queue shards into N queues that can
    never fill a lobby between them. Fail the boot loudly instead
    of degrading silently. Replica count cannot be detected from inside the
    process; that half of the invariant lives in backend/railway.toml.

    One process also means one EVENT LOOP, and the registries depend on that
    and not merely on being process-local: chat, battle and arena all relay by
    awaiting send_json on ANOTHER user's socket, which is only correct while
    every socket lives on the same loop. One worker gives that for free, so
    this guard never has to check it. A test harness can still break it -- an
    un-entered TestClient opens one event loop per websocket and the relay is
    silently lost (docs/research/battle-hang-diagnosis-2026-08.md).
    """
    for var in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
        raw = os.getenv(var, "").strip()
        if raw.isdigit() and int(raw) > 1:
            raise RuntimeError(
                f"{var}={raw} violates the single-worker deployment invariant "
                "(see backend/railway.toml). The in-memory rate limiter and the "
                "websocket registries are only correct at exactly one worker."
            )


def _run_startup_ddl() -> None:
    """create_all with the boot race tolerated (M146/ARCH-014).

    create_all is check-then-create, not atomic: two instances starting at
    once (deploy overlap, scale-out mistake) can both see a table missing and
    the loser dies on a duplicate-object error, likely restart-looping. One
    delayed retry makes that benign: the second attempt sees the winner's
    tables and no-ops; a transient DB blip at boot gets the same second
    chance (BUG-077). RUN_STARTUP_DDL=0 skips boot DDL entirely (live-DB
    schema changes go through the manual scripts/ migrations anyway); Alembic
    as a deploy step stays the deferred long-term answer.
    """
    if os.getenv("RUN_STARTUP_DDL", "1") == "0":
        return
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        time.sleep(1)
        Base.metadata.create_all(bind=engine)


async def _limiter_sweep_loop() -> None:
    """Periodic rate-limiter cleanup, run as a background task so the sweep
    never executes inline in a request thread or on a websocket frame
    (ARCH-009). The scan itself runs in a worker thread to keep the event
    loop free even when the bucket dict is large."""
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
        await asyncio.to_thread(sweep_idle_buckets)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _assert_single_worker()
    _announce_gate()
    _run_startup_ddl()
    sweep_task = asyncio.create_task(_limiter_sweep_loop())
    # The Arena matchmaker: pairs queued players and sweeps abandoned matches
    # on its own tick, so no player's websocket frame pays for matchmaking
    # (same reasoning as the limiter sweep, ARCH-009).
    matchmaker_task = asyncio.create_task(arena_router.matchmaker_loop())
    yield
    for task in (sweep_task, matchmaker_task):
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


# The schema and both doc UIs are removed outright under the gate rather than
# left to the middleware alone. /openapi.json, /docs and /redoc were all
# publicly readable before this and are application content, not a health
# signal. app.openapi() is a method, not the route, so it still returns every
# path with the routes gone -- which is what keeps the CI boot check that
# counts app.openapi()["paths"] working (verified, 45 paths either way).
app = FastAPI(
    lifespan=lifespan,
    docs_url=None if CLOSED_BETA else "/docs",
    redoc_url=None if CLOSED_BETA else "/redoc",
    openapi_url=None if CLOSED_BETA else "/openapi.json",
)

# Never a wildcard: the allowed origin list comes from the environment in
# production and falls back to the local dev frontend. Trailing slashes are
# stripped because the browser's Origin header never carries one, so
# "https://app.example.com/" would silently match nothing (BUG-071/M153).
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip().rstrip("/") and origin.strip() != "*"
]
if not ALLOWED_ORIGINS:
    # FRONTEND_ORIGIN="" or "*" would otherwise CORS-block every browser
    # request with no hint at the cause; fail the boot loudly instead
    # (BUG-071/M153).
    raise RuntimeError(
        "FRONTEND_ORIGIN resolved to an empty origin list. Set it to the real "
        "frontend URL(s), comma-separated; a wildcard is never allowed."
    )

# Defense-in-depth cap on request bodies. Uploads enforce their own much
# smaller limits via chunked reads; this stops oversized JSON payloads.
MAX_BODY_BYTES = 10 * 1024 * 1024


class BodySizeLimitMiddleware:
    """Reject oversized request bodies before the app buffers them.

    Pure ASGI on purpose: a BaseHTTPMiddleware (@app.middleware("http")) would
    wrap every request -- including /health and every GET -- in an extra
    task/stream layer just to compare one header.

    Two layers:
    - A valid Content-Length over the cap is rejected outright; a valid one
      within the cap is trusted (the ASGI server delivers no more than that
      many body bytes), so the common path pays only one header check.
    - A request with NO trustworthy Content-Length (Transfer-Encoding: chunked,
      or a malformed/spoofed length) is counted as it streams and rejected the
      moment it crosses the cap, so the chunked bypass cannot buffer an unbounded
      body in the app (SEC-022/BUG-023). Only these requests pay the streaming
      cost, so normal traffic keeps the header-only fast path.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json")],
        })
        await send({
            "type": "http.response.body",
            "body": b'{"detail":"Request body too large."}',
        })

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = None
        for name, value in scope["headers"]:
            if name == b"content-length":
                content_length = value
                break

        if content_length is not None and content_length.isdigit():
            if int(content_length) > self.max_bytes:
                await self._reject(send)
                return
            # Trustworthy length within the cap: the server will not deliver more,
            # so no per-request stream counting (keeps the fast path fast).
            await self.app(scope, receive, send)
            return

        # No trustworthy Content-Length: enforce the cap on the streamed bytes.
        # Buffer up to the cap; reject the moment the total crosses it, so no more
        # than one chunk past the limit is ever held.
        buffered = []
        total = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                buffered.append(message)
                break
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await self._reject(send)
                return
            buffered.append(message)
            if not message.get("more_body", False):
                break

        sent = iter(buffered)

        async def replay():
            for message in sent:
                return message
            return await receive()

        await self.app(scope, replay, send)


class ClosedBetaMiddleware:
    """Refuse anonymous requests while CLOSED_BETA is on.

    Pure ASGI for the same reason BodySizeLimitMiddleware is: a
    BaseHTTPMiddleware would wrap every request in an extra task/stream layer
    to compare one header.

    This is a DOOR, not an authorization layer. It checks that a bearer token
    is present, signed and unexpired, and nothing else -- no database read. The
    endpoints behind it still resolve the user themselves and still enforce
    their own rules, which is why a valid token for a deleted account gets past
    this and is then rejected by the endpoint.

    What it exists to close: 20 of the 28 endpoints probed on 2026-08-28
    answered 200 with real content to a caller holding nothing at all, because
    15 of them take an OPTIONAL viewer (get_optional_user) and personalise
    rather than require. Those dependencies are unchanged; this sits above them.

    THE WEBSOCKET SCOPE PASSES THROUGH UNTOUCHED, and that is deliberate rather
    than an oversight in a class that otherwise handles everything. The three
    socket endpoints do not carry an Authorization header at all: the token
    arrives in the first frame, on purpose, "so it cannot end up in access
    logs" (routers/chat.py). A header check here would therefore reject EVERY
    websocket and silently break battle, arena and chat. They are already
    closed by their own layers -- TLS gate, per-IP handshake throttle, a cap on
    concurrent unauthenticated sockets, first-frame JWT + token_version check,
    and per-frame revalidation (app/ws_security.py). Note this class must say
    so explicitly: BodySizeLimitMiddleware reaches the same outcome by
    short-circuiting on scope["type"] != "http", and inheriting that skip by
    accident is not the same as choosing it.
    """

    def __init__(self, app):
        self.app = app

    async def _reject(self, send) -> None:
        # 401 with WWW-Authenticate, not 403, matching the M153/BUG-072
        # precedent in app/auth.py: a missing credential is one status a client
        # can key re-authentication on.
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"www-authenticate", b"Bearer"),
            ],
        })
        await send({
            "type": "http.response.body",
            "body": b'{"detail":"Plexive is in closed beta. Sign in to continue."}',
        })

    async def __call__(self, scope, receive, send):
        if not CLOSED_BETA or scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # CORS preflight carries no Authorization header by definition -- the
        # browser sends it precisely to ask whether one may be sent. Rejecting
        # it would fail every cross-origin request from the frontend before the
        # real request was ever made.
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        if scope.get("path") in GATE_EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return

        token = None
        for name, value in scope["headers"]:
            if name == b"authorization":
                raw = value.decode("latin-1")
                if raw[:7].lower() == "bearer ":
                    token = raw[7:].strip()
                break

        if not token:
            await self._reject(send)
            return
        try:
            # Signature and expiry only. Raises HTTPException, which cannot be
            # handled by FastAPI's handler from out here in the ASGI stack, so
            # it is caught and turned into the same 401 as a missing token.
            decode_access_token(token)
        except Exception:
            await self._reject(send)
            return

        await self.app(scope, receive, send)


app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)

# Added after the body cap so the gate is OUTSIDE it: an anonymous caller is
# refused before the app buffers a body for them. Added before CORS so CORS
# stays outermost and the 401 carries CORS headers, for the same reason the
# 413 does (BUG-071/M153) -- without that the frontend sees an opaque network
# error instead of a status it can act on.
app.add_middleware(ClosedBetaMiddleware)

# Registered AFTER the body cap so CORS is the OUTERMOST layer (last added
# wraps everything): the cap's 413 then carries the CORS headers and the
# frontend can read it instead of seeing an opaque network error
# (BUG-071/M153).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(comments_router.router, prefix="/api")
app.include_router(interests_router.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(posts_router.router, prefix="/api")
app.include_router(uploads_router.router, prefix="/api")
app.include_router(events_router.router, prefix="/api")
app.include_router(search_router.router, prefix="/api")
app.include_router(stats_router.router, prefix="/api")
app.include_router(follows_router.router, prefix="/api")
app.include_router(quiz_router.router, prefix="/api")
app.include_router(graph_router.router, prefix="/api")
app.include_router(train_router.router, prefix="/api")
app.include_router(chat_router.router, prefix="/api")
app.include_router(battle_router.router, prefix="/api")
app.include_router(arena_router.router, prefix="/api")
app.include_router(thumbnails_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
