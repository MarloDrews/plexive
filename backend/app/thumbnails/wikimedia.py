"""Portrait lookup via the MediaWiki API.

The twin of nominatim.py, for people instead of places: a name goes in, a
throttled network lookup with an identifying User-Agent and a disk cache runs,
and an image comes out. The concept card uses it to put the person a post hangs
on next to the thing they found.

Two steps against the API, because the lead image and its licence live in
different places:

    1. prop=pageimages on the PERSON's article -> the lead image + its File name
    2. prop=imageinfo on that File            -> licence, author, repository

Three filters stand between "there is an image" and "we may draw it":

  * Only public domain and CC0 are accepted. Everything else -- CC-BY, CC-BY-SA
    -- is usable in principle but obliges a visible credit that a 1280x720 card
    cannot carry legibly, so it stays out until there is somewhere in the UI to
    put one. A file that lives locally on en.wikipedia rather than on Commons is
    almost always a fair-use upload and is refused outright.
  * A clearly landscape image is refused. pageimages returns the article's LEAD
    image, not a guaranteed portrait: the article "Benford's law" leads with a
    bar chart. This is the same trap the map generator documents at length --
    "Sahara" resolves to a village in India, and because that is a real fillable
    area nothing downstream can tell the card is wrong.
  * Formats Pillow cannot open (SVG above all) are refused.

Every refusal raises PortraitLookupError. The caller is expected to CATCH it and
render the card without a portrait rather than fail: a post with a centred card
is fine, a post with no thumbnail at all is not.
"""

import hashlib
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger("app.thumbnails.wikimedia")

API_URL = os.getenv("WIKIMEDIA_API_URL", "https://en.wikipedia.org/w/api.php")

# Wikimedia's User-Agent policy is the same as Nominatim's: identify the client
# and give a contact address, or expect to be refused. Deliberately the SAME
# environment variable, so setting it once covers both lookups.
USER_AGENT = os.getenv(
    "THUMBNAIL_USER_AGENT",
    "Plexive-Thumbnails/1.0 (+https://github.com/silasmk/Plexive)",
)
CACHE_DIR = Path(
    os.getenv(
        "THUMBNAIL_PORTRAIT_DIR",
        str(Path(__file__).resolve().parents[2] / "data" / "portraits"),
    )
)
REQUEST_TIMEOUT = 30

# Wikimedia publishes no hard rate limit for a serial client, but a batch run
# is still a batch run. Half a second apart, process-wide.
_MIN_INTERVAL_SECONDS = 0.5
_throttle_lock = threading.Lock()
_last_request_at = 0.0

# Bumped whenever the cached payload changes shape or the filters change, so
# stale entries are missed rather than silently used -- without it, a portrait
# accepted under a looser licence rule would keep being served from disk
# forever.
_CACHE_VERSION = "v1"

# How wide an image may be relative to its height before it stops being a
# portrait. Generous on purpose: many old portraits are near-square crops, and
# the point is only to catch the diagrams and group shots that a lead-image
# lookup drags in. A circle crop makes anything wider useless anyway.
MAX_PORTRAIT_ASPECT = 1.15

# Fetched at this width rather than as the original file: a Commons original
# can be tens of megabytes, and the card draws the portrait about 330px wide.
THUMBNAIL_WIDTH = 800

# The whole accept-list. Matched against extmetadata's machine-readable
# "License" field, lowercased, as a prefix -- Commons spells public domain a
# hundred ways ("pd-old-70", "pd-us-expired", "pd-art") and they all mean the
# same thing here.
ALLOWED_LICENSE_PREFIXES = ("pd", "cc0", "cc-zero")

# What Pillow can actually open. SVG is the one that matters: plenty of
# Commons files are vector, and every one of them would crash the render.
ALLOWED_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


class PortraitLookupError(RuntimeError):
    """No usable portrait: nothing found, wrong licence, or wrong shape."""


@dataclass(frozen=True)
class Portrait:
    """One portrait that passed every filter, cached on disk."""

    # What was asked for, and what the API actually resolved it to.
    query: str
    title: str
    # The Commons File: name, which is what `portrait_file` pins.
    file: str
    path: Path
    width: int
    height: int
    # Carried so the caller can report or store it. Nothing draws these -- see
    # the module docstring on why only credit-free licences get this far.
    license: str
    artist: str
    credit_url: str


def _throttle() -> None:
    """Serialize requests, process-wide."""
    global _last_request_at
    with _throttle_lock:
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _cache_path(kind: str, key: str, suffix: str = ".json") -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return CACHE_DIR / f"{kind}_{_CACHE_VERSION}_{digest}{suffix}"


def _read_cache(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        # A read-only or full disk must not fail the render; we just re-query
        # next time.
        logger.warning("could not write portrait cache entry %s", path.name)


def _query(params: Dict[str, Any]) -> Dict[str, Any]:
    _throttle()
    params = dict(params, action="query", format="json", formatversion=2)
    try:
        response = requests.get(
            API_URL,
            params=params,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise PortraitLookupError(f"Wikimedia lookup failed: {exc}") from exc
    except ValueError as exc:
        raise PortraitLookupError("Wikimedia returned a non-JSON response.") from exc

    if not isinstance(payload, dict):
        raise PortraitLookupError("Wikimedia returned an unexpected payload.")
    return payload


def _first_page(payload: Dict[str, Any], what: str) -> Dict[str, Any]:
    """The single page out of a formatversion=2 query, or an error."""
    pages = (payload.get("query") or {}).get("pages")
    if not isinstance(pages, list) or not pages:
        raise PortraitLookupError(f"Wikipedia has no page for '{what}'.")
    page = pages[0]
    if page.get("missing") or page.get("invalid"):
        raise PortraitLookupError(f"Wikipedia has no page for '{what}'.")
    return page


def _plain(html: str) -> str:
    """extmetadata fields arrive as HTML fragments; the credit is text.

    Commons templates often carry the same wording twice -- a visible span and
    a hidden one for translation -- which strips to "Unknown authorUnknown
    author". A field that is exactly its own first half doubled is one of
    those, so it is halved.
    """
    text = _WHITESPACE_RE.sub(" ", _TAG_RE.sub("", html or "")).strip()
    half, remainder = divmod(len(text), 2)
    if half and not remainder and text[:half] == text[half:]:
        return text[:half].strip()
    return text


def _extmetadata(info: Dict[str, Any]) -> Dict[str, str]:
    raw = info.get("extmetadata") or {}
    return {
        key: str((value or {}).get("value", ""))
        for key, value in raw.items()
        if isinstance(value, dict)
    }


def _check_license(meta: Dict[str, str], file_name: str, repository: str) -> None:
    """Refuse anything that is not credit-free. See the module docstring."""
    if repository and repository != "shared":
        # Not on Commons: en.wikipedia's local uploads are overwhelmingly
        # non-free files kept under a fair-use rationale, which does not cover
        # a social feed's thumbnail.
        raise PortraitLookupError(
            f"{file_name} is a local (non-Commons) upload, which is almost "
            "always fair-use only."
        )

    if _plain(meta.get("Restrictions", "")):
        raise PortraitLookupError(
            f"{file_name} carries usage restrictions ({_plain(meta['Restrictions'])})."
        )

    license_id = _plain(meta.get("License", "")).lower()
    short = _plain(meta.get("LicenseShortName", ""))
    if not license_id:
        # No machine-readable licence at all. "Public domain" spelled out in
        # the human-readable field is still good enough to accept.
        if "public domain" in short.lower():
            return
        raise PortraitLookupError(f"{file_name} states no machine-readable licence.")

    if not license_id.startswith(ALLOWED_LICENSE_PREFIXES):
        raise PortraitLookupError(
            f"{file_name} is {short or license_id}, which needs a visible credit "
            "the card cannot carry (only public domain and CC0 are used)."
        )


def _check_shape(width: int, height: int, file_name: str) -> None:
    if not width or not height:
        raise PortraitLookupError(f"{file_name} reports no size.")
    if width > height * MAX_PORTRAIT_ASPECT:
        raise PortraitLookupError(
            f"{file_name} is {width}x{height}, too wide to be a portrait -- this "
            "is usually the article's diagram rather than a person."
        )


def _file_details(file_name: str) -> Dict[str, Any]:
    """Licence, size and repository for one File:, from imageinfo."""
    title = file_name if file_name.startswith("File:") else f"File:{file_name}"
    payload = _query(
        {
            "prop": "imageinfo",
            "iiprop": "extmetadata|url|size|mime",
            "titles": title,
        }
    )

    # Deliberately NOT _first_page: a file hosted on Commons has no local
    # description page here, so en.wikipedia reports it as "missing" while
    # still returning its imageinfo and imagerepository="shared". Treating
    # missing as fatal rejected every Commons file -- which is to say all the
    # good ones. What matters is whether imageinfo came back.
    pages = (payload.get("query") or {}).get("pages")
    if not isinstance(pages, list) or not pages:
        raise PortraitLookupError(f"Wikimedia returned nothing for {title}.")
    page = pages[0]

    info_list = page.get("imageinfo")
    if not isinstance(info_list, list) or not info_list:
        raise PortraitLookupError(f"{title} has no image information.")
    info = info_list[0]

    meta = _extmetadata(info)
    _check_license(meta, title, str(page.get("imagerepository") or ""))

    mime = str(info.get("mime") or "")
    if mime not in ALLOWED_MIME_TYPES:
        raise PortraitLookupError(
            f"{title} is {mime or 'of unknown type'}, which cannot be drawn."
        )

    width, height = int(info.get("width") or 0), int(info.get("height") or 0)
    _check_shape(width, height, title)

    return {
        "file": title,
        "width": width,
        "height": height,
        "license": _plain(meta.get("LicenseShortName", "")) or "public domain",
        "artist": _plain(meta.get("Artist", "")),
        "credit_url": str(info.get("descriptionurl") or ""),
        "source": _thumbnail_url(str(info.get("url") or ""), title),
    }


def _thumbnail_url(original_url: str, title: str) -> str:
    """A width-limited URL for the file, rather than the raw original.

    Special:FilePath does the resizing server-side, which saves downloading a
    40-megapixel scan to draw it 330 pixels wide. Falls back to the original if
    there is no title to build a path from.
    """
    name = title.split(":", 1)[1] if ":" in title else title
    if not name:
        return original_url
    return (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        f"{requests.utils.quote(name.replace(' ', '_'))}?width={THUMBNAIL_WIDTH}"
    )


def _lead_image_file(person: str) -> Dict[str, str]:
    """The File name of a person's article lead image."""
    page = _first_page(
        _query(
            {
                "prop": "pageimages",
                "piprop": "name",
                "titles": person,
                "redirects": 1,
            }
        ),
        person,
    )
    file_name = page.get("pageimage")
    if not file_name:
        raise PortraitLookupError(
            f"The article '{page.get('title') or person}' has no lead image."
        )
    return {"title": str(page.get("title") or person), "file": str(file_name)}


def _download(url: str, destination: Path) -> None:
    _throttle()
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
            stream=True,
        )
        response.raise_for_status()
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=65536):
                handle.write(chunk)
    except requests.RequestException as exc:
        # A half-written file would be served from the cache forever.
        destination.unlink(missing_ok=True)
        raise PortraitLookupError(f"Could not download {url}: {exc}") from exc
    except OSError as exc:
        raise PortraitLookupError(f"Could not store the portrait: {exc}") from exc


def lookup_portrait(
    person: Optional[str] = None,
    portrait_file: Optional[str] = None,
    use_cache: bool = True,
) -> Portrait:
    """Resolve a person's name (or a pinned Commons file) to a usable portrait.

    `person` is the normal way in and is looked up as an article title --
    "Frank Benford", not "Benford's law": the topic article leads with a
    diagram, not a face. `portrait_file` pins one Commons File: directly and is
    the escape hatch for a name that resolves to the wrong image, exactly as
    `osm_id` is for a place name.

    Raises PortraitLookupError for every failure, including a perfectly real
    image that the licence or shape filters refuse. Callers render the card
    without a portrait in that case.
    """
    query = (portrait_file or person or "").strip()
    if not query:
        raise PortraitLookupError("No person or portrait file given.")

    kind = "file" if portrait_file else "person"
    cache_file = _cache_path(kind, query.lower())
    if use_cache:
        cached = _read_cache(cache_file)
        if cached:
            image_path = Path(cached["path"])
            if image_path.is_file():
                return Portrait(
                    query=query,
                    title=cached["title"],
                    file=cached["file"],
                    path=image_path,
                    width=cached["width"],
                    height=cached["height"],
                    license=cached["license"],
                    artist=cached["artist"],
                    credit_url=cached["credit_url"],
                )

    if portrait_file:
        title, file_name = query, query
    else:
        found = _lead_image_file(query)
        title, file_name = found["title"], found["file"]

    details = _file_details(file_name)

    image_path = _cache_path(kind, query.lower(), suffix=".img")
    _download(details["source"], image_path)

    payload = {
        "title": title,
        "file": details["file"],
        "path": str(image_path),
        "width": details["width"],
        "height": details["height"],
        "license": details["license"],
        "artist": details["artist"],
        "credit_url": details["credit_url"],
    }
    _write_cache(cache_file, payload)
    logger.info(
        "portrait resolved: %r -> %s (%s, %s)",
        query,
        details["file"],
        details["license"],
        details["artist"] or "unknown author",
    )
    return Portrait(
        query=query,
        title=title,
        file=details["file"],
        path=image_path,
        width=details["width"],
        height=details["height"],
        license=details["license"],
        artist=details["artist"],
        credit_url=details["credit_url"],
    )
