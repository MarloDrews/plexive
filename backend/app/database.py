import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]


def _engine_kwargs(url: str) -> dict:
    # Safety settings for the remote PostgreSQL (Supabase) connection. The
    # test suites run on SQLite, where psycopg2 connect_args would break.
    if url.startswith("postgresql"):
        # pool_pre_ping was measured and rejected: it costs one extra round
        # trip (~35ms+) on every checkout against the remote DB.
        return {
            # Explicit pool sizing for a single worker against remote Supabase.
            # The SQLAlchemy defaults (5 + 10) close overflow connections on
            # release, so any burst past 5 pays a fresh TCP+TLS+auth handshake
            # per request. Keep 10 warm and allow 20 overflow (30 max) -- tune to
            # the Supabase plan / pooler connection limit before scaling workers.
            "pool_size": 10,
            "max_overflow": 20,
            # Supabase closes idle connections; recycle ours first so a
            # request never picks up a dead connection.
            "pool_recycle": 1200,
            "connect_args": {"connect_timeout": 10},
        }
    return {}


engine = create_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
