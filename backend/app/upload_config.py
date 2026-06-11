import os

from supabase import Client, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
_service_key = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_BUCKET = "uploads"

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_SVG_SIZE_BYTES   = 512 * 1024         # 512 KB

# Initialized once at startup; uses the service_role key so it can write to
# storage without depending on user auth tokens.
supabase_client: Client = create_client(SUPABASE_URL, _service_key)
