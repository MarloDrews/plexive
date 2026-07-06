import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine

load_dotenv()
from . import models  # noqa: F401 — registers models with Base before create_all
from .routers import admin as admin_router, auth as auth_router, comments as comments_router, events as events_router, feed, follows as follows_router, interests as interests_router, posts as posts_router, search as search_router, stats as stats_router
from .routers import battle as battle_router, chat as chat_router, quiz as quiz_router, train as train_router, uploads as uploads_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)

# Never a wildcard: the allowed origin list comes from the environment in
# production and falls back to the local dev frontend.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip() and origin.strip() != "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Defense-in-depth cap on request bodies. Uploads enforce their own much
# smaller limits via chunked reads; this stops oversized JSON payloads.
MAX_BODY_BYTES = 10 * 1024 * 1024


class BodySizeLimitMiddleware:
    """Reject oversized request bodies by Content-Length before dispatch.

    Pure ASGI on purpose: a BaseHTTPMiddleware (@app.middleware("http")) would
    wrap every request -- including /health and every GET -- in an extra
    task/stream layer just to compare one header. This does the header check
    directly and otherwise passes the request straight through.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            for name, value in scope["headers"]:
                if name == b"content-length" and value.isdigit() and int(value) > self.max_bytes:
                    await send({
                        "type": "http.response.start",
                        "status": 413,
                        "headers": [(b"content-type", b"application/json")],
                    })
                    await send({
                        "type": "http.response.body",
                        "body": b'{"detail":"Request body too large."}',
                    })
                    return
        await self.app(scope, receive, send)


app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)

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
