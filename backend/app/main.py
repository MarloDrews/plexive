import asyncio
import contextlib
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .rate_limit import SWEEP_INTERVAL_SECONDS, sweep_idle_buckets

load_dotenv()
from . import models  # noqa: F401 — registers models with Base before create_all
from .routers import admin as admin_router, auth as auth_router, comments as comments_router, events as events_router, feed, follows as follows_router, interests as interests_router, posts as posts_router, search as search_router, stats as stats_router
from .routers import battle as battle_router, chat as chat_router, quiz as quiz_router, train as train_router, uploads as uploads_router


def _assert_single_worker() -> None:
    """Enforce the deployment invariant (M138/ARCH-001): exactly one process.

    One Railway replica running one uvicorn worker. The in-memory rate limiter
    (app/rate_limit.py), the chat ConnectionManager, the BattleManager, the
    pre-auth socket counters (app/ws_security.py) and the stats caches are all
    process-local; at N processes every rate limit silently multiplies by N and
    chat/battle delivery splits across processes. Fail the boot loudly instead
    of degrading silently. Replica count cannot be detected from inside the
    process; that half of the invariant lives in backend/railway.toml.
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
    _run_startup_ddl()
    sweep_task = asyncio.create_task(_limiter_sweep_loop())
    yield
    sweep_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sweep_task


app = FastAPI(lifespan=lifespan)

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


app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)

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
app.include_router(train_router.router, prefix="/api")
app.include_router(chat_router.router, prefix="/api")
app.include_router(battle_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
