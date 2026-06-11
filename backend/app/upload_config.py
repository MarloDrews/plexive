import os
from typing import Optional

from supabase import Client, create_client

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_SVG_SIZE_BYTES   = 512 * 1024         # 512 KB
SUPABASE_BUCKET = "uploads"

_url = os.environ.get("SUPABASE_URL", "")
_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

# None when env vars are missing (local dev without Supabase).
# Upload endpoints will return 503 in that case.
supabase_client: Optional[Client] = create_client(_url, _key) if _url and _key else None
SUPABASE_URL = _url
