import logging
import os
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

# Self-sufficient env loading (BUG-018): this module previously worked only
# because database.py/auth.py happened to call load_dotenv first.
load_dotenv()

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_SVG_SIZE_BYTES   = 512 * 1024         # 512 KB
SUPABASE_BUCKET = "uploads"

_url = os.environ.get("SUPABASE_URL", "")
_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

# None when env vars are missing (local dev without Supabase). Upload
# endpoints return 503 in that case. A PRESENT-but-invalid URL (typo, stray
# whitespace) used to raise at import time and take down every endpoint over
# a storage-only misconfiguration (BUG-018/M151); degrade to None instead so
# only uploads fail.
supabase_client: Optional[Client] = None
if _url and _key:
    try:
        supabase_client = create_client(_url, _key)
    except Exception:
        logging.getLogger("app.uploads").exception(
            "SUPABASE_URL/SUPABASE_SERVICE_KEY invalid; uploads disabled (503)"
        )
SUPABASE_URL = _url
