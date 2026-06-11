import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import Base, engine

load_dotenv()
from . import models  # noqa: F401 — registers models with Base before create_all
from .routers import admin as admin_router, auth as auth_router, comments as comments_router, events as events_router, feed, follows as follows_router, interests as interests_router, posts as posts_router, search as search_router, stats as stats_router
from .routers import chat as chat_router, quiz as quiz_router, uploads as uploads_router


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


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large."})
    return await call_next(request)

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
app.include_router(chat_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
