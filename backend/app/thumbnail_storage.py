"""Put a generated thumbnail PNG into Supabase Storage.

Same bucket and client as the user upload endpoints (routers/uploads.py); only
the path prefix differs, so generated thumbnails and user images never collide.
Kept separate from that router because thumbnails are written by scripts, not
by an HTTP request, and must not depend on FastAPI or on a current_user.
"""

import hashlib

from .upload_config import SUPABASE_BUCKET, supabase_client

THUMBNAIL_PREFIX = "thumbnails"


def thumbnail_path(png: bytes, key: str) -> str:
    """Storage path for this image. The content hash is part of the filename.

    Re-rendering a post writes a NEW path, so the public URL changes whenever
    the image does. Without that, the CDN would keep serving the old PNG from a
    stable URL long after the post's thumbnail was regenerated.
    """
    digest = hashlib.sha256(png).hexdigest()[:8]
    return f"{THUMBNAIL_PREFIX}/{key}-{digest}.png"


def upload_thumbnail_png(png: bytes, key: str) -> str:
    """Upload the PNG and return its public URL.

    `key` is a stable per-post identifier (the post slug, or post-<id> for rows
    without one) and only decides the filename -- the hash keeps it unique.

    Raises RuntimeError when Supabase is not configured, so a local dev run
    without credentials fails with a clear message instead of an AttributeError.
    """
    if supabase_client is None:
        raise RuntimeError(
            "Supabase storage is not configured "
            "(SUPABASE_URL / SUPABASE_SERVICE_KEY missing in backend/.env)"
        )
    path = thumbnail_path(png, key)
    # upsert so re-running the generator over the same unchanged image is a
    # no-op instead of a 409 from the storage API.
    supabase_client.storage.from_(SUPABASE_BUCKET).upload(
        path=path,
        file=png,
        file_options={"content-type": "image/png", "upsert": "true"},
    )
    return supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(path)
