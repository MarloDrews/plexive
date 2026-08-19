"""Finding the two caption fonts.

The card has two typographic looks, picked per render by Style.font_family:

    sans   a heavy, tightly-set grotesque -- the plain news-banner look
    serif  a lighter transitional serif (Bell MT and relatives) -- the
           dressier look, for a card that should read as a book plate

Local dev (Windows/macOS) has a usable face for both installed; a slim Linux
container usually has no fonts at all, so as a last resort we fetch one free
font per family and cache it next to the basemap. Set THUMBNAIL_FONT_PATH /
THUMBNAIL_SERIF_FONT_PATH to skip all of this and use your own files.
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import requests
from PIL import ImageFont

logger = logging.getLogger("app.thumbnails.fonts")

FONT_DIR = Path(
    os.getenv("THUMBNAIL_FONT_DIR", str(Path(__file__).resolve().parents[2] / "data" / "fonts"))
)


@dataclass(frozen=True)
class FontFamily:
    """One of the card's two typefaces and every way of getting hold of it."""

    name: str
    # Environment variable naming a .ttf to use instead of everything below.
    env_var: str
    # Checked in order: the closest match to the intended look comes first,
    # then the usual macOS and Linux equivalents.
    candidates: Tuple[str, ...]
    # Free, redistributable last resort, downloaded once and cached.
    url: str
    filename: str
    # Named instance to select when the downloaded file is a variable font.
    # Google Fonts now ships most families only in that form, whose default
    # instance is Regular -- too light for a banner.
    variation: Optional[str] = None


SANS = FontFamily(
    name="sans",
    env_var="THUMBNAIL_FONT_PATH",
    candidates=(
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ),
    # Anton: OFL-licensed, single static weight, condensed and very heavy --
    # the closest free match to a news-banner headline.
    url=os.getenv(
        "THUMBNAIL_FONT_URL",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    ),
    filename="Anton-Regular.ttf",
)

SERIF = FontFamily(
    name="serif",
    env_var="THUMBNAIL_SERIF_FONT_PATH",
    candidates=(
        # Bell MT is the reference for this look. Its bold is still light next
        # to Arial Bold, which is the point -- the serif card is the quiet one.
        "C:/Windows/Fonts/BELLB.TTF",
        "C:/Windows/Fonts/BELL.TTF",
        "C:/Windows/Fonts/LibreBaskerville-Bold.ttf",
        "C:/Windows/Fonts/BASKVILL.TTF",
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/cambriab.ttf",
        "/System/Library/Fonts/Supplemental/Baskerville.ttc",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/Library/Fonts/Georgia Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf",
    ),
    # Playfair Display: OFL, a high-contrast transitional serif in the same
    # family of shapes as Bell MT. Shipped only as a variable font, hence the
    # named instance below.
    url=os.getenv(
        "THUMBNAIL_SERIF_FONT_URL",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/"
        "PlayfairDisplay%5Bwght%5D.ttf",
    ),
    filename="PlayfairDisplay-Variable.ttf",
    variation="Bold",
)

FAMILIES: Dict[str, FontFamily] = {SANS.name: SANS, SERIF.name: SERIF}
DEFAULT_FAMILY = SANS.name
# The values the `font` spec key accepts, in the order the doc lists them.
FONT_FAMILY_NAMES = tuple(FAMILIES)


class FontError(RuntimeError):
    """No usable font could be found or fetched."""


# family name -> absolute path. Resolving walks the filesystem and may hit the
# network, so it happens once per family per process.
_resolved: Dict[str, str] = {}


def resolve_family(name: Optional[str]) -> FontFamily:
    """Turn a requested family name (possibly empty) into a real one."""
    key = (name or DEFAULT_FAMILY).strip().lower()
    family = FAMILIES.get(key)
    if family is None:
        raise FontError(f"font must be one of {', '.join(FONT_FAMILY_NAMES)}.")
    return family


def resolve_font_path(family: Optional[str] = None) -> str:
    """Absolute path to a TTF for `family`, resolved once per process."""
    font_family = resolve_family(family)
    cached_path = _resolved.get(font_family.name)
    if cached_path:
        return cached_path

    override = os.getenv(font_family.env_var, "").strip()
    if override:
        if not Path(override).is_file():
            raise FontError(f"{font_family.env_var} points at a missing file: {override}")
        _resolved[font_family.name] = override
        return override

    for candidate in font_family.candidates:
        if Path(candidate).is_file():
            _resolved[font_family.name] = candidate
            return candidate

    cached = FONT_DIR / font_family.filename
    if cached.is_file() and cached.stat().st_size > 0:
        _resolved[font_family.name] = str(cached)
        return str(cached)

    logger.info("no system %s font found, downloading %s", font_family.name, font_family.url)
    try:
        response = requests.get(font_family.url, timeout=60)
        response.raise_for_status()
        FONT_DIR.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(response.content)
    except (requests.RequestException, OSError) as exc:
        raise FontError(
            f"No {font_family.name} font available. Install one, or set "
            f"{font_family.env_var} to a .ttf file. (Fallback download failed: {exc})"
        ) from exc
    _resolved[font_family.name] = str(cached)
    return str(cached)


def load_font(size: int, family: Optional[str] = None) -> ImageFont.FreeTypeFont:
    font_family = resolve_family(family)
    try:
        font = ImageFont.truetype(resolve_font_path(font_family.name), size)
    except OSError as exc:
        raise FontError(f"Font file could not be loaded: {exc}") from exc
    if font_family.variation:
        # Only a variable font has named instances; a static one raises, and
        # then the file already is the weight we picked it for.
        try:
            font.set_variation_by_name(font_family.variation)
        except (OSError, AttributeError, ValueError):
            pass
    return font
