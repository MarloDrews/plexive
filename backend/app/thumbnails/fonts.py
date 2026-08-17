"""Finding a heavy sans-serif for the caption banner.

The reference style needs a bold, tightly-set sans. Local dev (Windows/macOS)
has one installed; a slim Linux container usually has no fonts at all, so as a
last resort we fetch one free font and cache it next to the basemap. Set
THUMBNAIL_FONT_PATH to skip all of this and use your own file.
"""

import logging
import os
from pathlib import Path
from typing import Optional

import requests
from PIL import ImageFont

logger = logging.getLogger("app.thumbnails.fonts")

FONT_DIR = Path(
    os.getenv("THUMBNAIL_FONT_DIR", str(Path(__file__).resolve().parents[2] / "data" / "fonts"))
)

# Checked in order. Arial/Helvetica Bold first because that is what the
# reference cards use; the Liberation and DejaVu entries are the usual Linux
# equivalents.
SYSTEM_FONT_CANDIDATES = (
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
)

# Anton: OFL-licensed, single static weight, condensed and very heavy -- the
# closest free match to a news-banner headline.
FALLBACK_FONT_URL = os.getenv(
    "THUMBNAIL_FONT_URL",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
)
FALLBACK_FONT_NAME = "Anton-Regular.ttf"


class FontError(RuntimeError):
    """No usable font could be found or fetched."""


_resolved: Optional[str] = None


def resolve_font_path() -> str:
    """Absolute path to a bold TTF, resolved once per process."""
    global _resolved
    if _resolved:
        return _resolved

    override = os.getenv("THUMBNAIL_FONT_PATH", "").strip()
    if override:
        if not Path(override).is_file():
            raise FontError(f"THUMBNAIL_FONT_PATH points at a missing file: {override}")
        _resolved = override
        return _resolved

    for candidate in SYSTEM_FONT_CANDIDATES:
        if Path(candidate).is_file():
            _resolved = candidate
            return _resolved

    cached = FONT_DIR / FALLBACK_FONT_NAME
    if cached.is_file() and cached.stat().st_size > 0:
        _resolved = str(cached)
        return _resolved

    logger.info("no system font found, downloading %s", FALLBACK_FONT_URL)
    try:
        response = requests.get(FALLBACK_FONT_URL, timeout=60)
        response.raise_for_status()
        FONT_DIR.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(response.content)
    except (requests.RequestException, OSError) as exc:
        raise FontError(
            "No font available. Install a bold sans-serif, or set "
            f"THUMBNAIL_FONT_PATH to a .ttf file. (Fallback download failed: {exc})"
        ) from exc
    _resolved = str(cached)
    return _resolved


def load_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(resolve_font_path(), size)
    except OSError as exc:
        raise FontError(f"Font file could not be loaded: {exc}") from exc
