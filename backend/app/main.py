from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from . import models  # noqa: F401 — registers models with Base before create_all
from .routers import admin as admin_router, auth as auth_router, comments as comments_router, events as events_router, feed, follows as follows_router, interests as interests_router, posts as posts_router, search as search_router, stats as stats_router
from .routers import uploads as uploads_router
from .upload_config import UPLOAD_DIR


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

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


@app.get("/health")
def health():
    return {"status": "ok"}
