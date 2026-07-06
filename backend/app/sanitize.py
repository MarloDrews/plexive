import logging
from io import BytesIO

import defusedxml.ElementTree as defused_et
from lxml import etree
from PIL import Image

from .upload_config import MAX_IMAGE_SIZE_BYTES, MAX_SVG_SIZE_BYTES

logger = logging.getLogger(__name__)

ALLOWED_ELEMENTS = {
    "svg", "g", "path", "circle", "ellipse", "rect", "line",
    "polyline", "polygon", "text", "tspan", "defs", "title",
    "desc", "linearGradient", "radialGradient", "stop",
    "clipPath", "mask", "pattern", "symbol", "use",
    "marker", "filter", "feGaussianBlur", "feColorMatrix",
    "feComposite", "feMerge", "feMergeNode",
}

SAFE_ATTRIBUTES = {
    "viewBox", "width", "height", "x", "y", "x1", "y1",
    "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
    "fill", "stroke", "stroke-width", "stroke-linecap",
    "stroke-linejoin", "stroke-dasharray", "opacity",
    "fill-opacity", "stroke-opacity", "transform",
    "font-family", "font-size", "font-weight", "text-anchor",
    "dominant-baseline", "class", "id", "clip-path",
    "mask", "marker-start", "marker-end", "marker-mid",
    "gradientUnits", "gradientTransform", "offset",
    "stop-color", "stop-opacity", "patternUnits",
    "patternTransform", "preserveAspectRatio", "refX", "refY",
    "markerWidth", "markerHeight", "orient", "in", "in2",
    "result", "stdDeviation", "type", "values", "numOctaves",
    "xmlns", "xmlns:xlink",
}

DANGEROUS_ELEMENTS = {"script", "foreignObject", "animate", "set"}

_MAGIC = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG",      "image/png"),
    (b"GIF87a",       "image/gif"),
    (b"GIF89a",       "image/gif"),
]


def _local(tag: object) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.split("}")[1] if "}" in tag else tag


def validate_image(file) -> tuple[bytes, str]:
    # Sync on purpose: callers are sync `def` endpoints running in the
    # threadpool, so the chunked read, Pillow re-encode and the follow-up
    # storage upload never block the event loop. file.file is the
    # underlying SpooledTemporaryFile with a sync read().
    chunk_size = 8192
    total = 0
    chunks: list[bytes] = []
    while chunk := file.file.read(chunk_size):
        total += len(chunk)
        if total > MAX_IMAGE_SIZE_BYTES:
            raise ValueError("File too large")
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    if not file_bytes:
        raise ValueError("Empty file")

    # Magic byte check — reject before touching Pillow
    media_type: str | None = None
    for magic, mtype in _MAGIC:
        if file_bytes[: len(magic)] == magic:
            media_type = mtype
            break
    if media_type is None and len(file_bytes) >= 12:
        if file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
            media_type = "image/webp"
    if media_type is None:
        raise ValueError("Unknown or invalid file type")

    try:
        img = Image.open(BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Invalid image file: {exc}") from exc

    # Animated GIF check before verify()
    if hasattr(img, "n_frames") and img.n_frames > 1:
        raise ValueError("Animated GIFs are not allowed")

    try:
        img.verify()
    except Exception as exc:
        raise ValueError(f"Corrupted or invalid image: {exc}") from exc

    # Re-open required after verify()
    img = Image.open(BytesIO(file_bytes))
    img = img.convert("RGB")
    img.thumbnail((2048, 2048), Image.LANCZOS)

    out = BytesIO()
    if media_type == "image/png":
        img.save(out, format="PNG", optimize=True)
        save_type = "image/png"
    elif media_type == "image/webp":
        img.save(out, format="WEBP", quality=85)
        save_type = "image/webp"
    elif media_type == "image/gif":
        # GIF is palette-based and obsolete; re-encode as PNG after RGB conversion
        img.save(out, format="PNG", optimize=True)
        save_type = "image/png"
    else:
        img.save(out, format="JPEG", quality=85)
        save_type = "image/jpeg"

    return out.getvalue(), save_type


def sanitize_svg(file) -> str:
    # Sync on purpose: the upload endpoint is sync `def`, so this chunked read
    # and the CPU-bound lxml sanitization run in the threadpool instead of
    # blocking the event loop (mirrors validate_image). file.file is the
    # underlying SpooledTemporaryFile with a sync read().
    chunk_size = 8192
    total = 0
    chunks: list[bytes] = []
    while chunk := file.file.read(chunk_size):
        total += len(chunk)
        if total > MAX_SVG_SIZE_BYTES:
            raise ValueError("File too large")
        chunks.append(chunk)
    svg_text = b"".join(chunks).decode("utf-8")
    return sanitize_svg_text(svg_text)


def sanitize_svg_text(svg_text: str) -> str:
    # STEP 1: defusedxml parse — raises on XXE / billion-laughs attacks
    try:
        defused_et.fromstring(svg_text)
    except Exception as exc:
        raise ValueError(f"Invalid SVG: {exc}") from exc

    # STEP 2-6: lxml for whitelist processing and canonical re-serialization
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        root = etree.fromstring(svg_text.encode("utf-8"), parser=parser)
    except Exception as exc:
        raise ValueError(f"Invalid SVG: {exc}") from exc

    if _local(root.tag) != "svg":
        raise ValueError("Root element must be <svg>")

    # STEP 2: Remove non-element nodes (comments, PIs) and disallowed elements
    # Traverse bottom-up so removing a parent doesn't leave orphaned children in the loop
    for element in reversed(list(root.iter())):
        if element is root:
            continue
        if not isinstance(element.tag, str):
            # lxml Comment / ProcessingInstruction nodes
            parent = element.getparent()
            if parent is not None:
                logger.warning("Removed non-element SVG node: %s", type(element).__name__)
                parent.remove(element)
            continue
        tag = _local(element.tag)
        if tag not in ALLOWED_ELEMENTS:
            parent = element.getparent()
            if parent is not None:
                logger.warning("Removed disallowed SVG element: %s", element.tag)
                parent.remove(element)

    # STEP 3: Remove attributes not in the whitelist
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        for attr in list(element.attrib.keys()):
            local_attr = _local(attr)
            if local_attr not in SAFE_ATTRIBUTES:
                logger.warning("Removed disallowed SVG attribute: %s", attr)
                del element.attrib[attr]

    # STEP 4: Post-whitelist explicit checks — raise on anything dangerous that slipped through
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        tag = _local(element.tag)
        if tag in DANGEROUS_ELEMENTS:
            raise ValueError(f"Dangerous SVG element after whitelist: {tag}")
        for attr, value in element.attrib.items():
            local_attr = _local(attr)
            if local_attr.lower().startswith("on"):
                raise ValueError(f"Event-handler attribute found: {local_attr}")
            v_lower = value.lower()
            if "javascript:" in v_lower:
                raise ValueError("javascript: URL found in SVG")
            if "data:" in v_lower:
                raise ValueError("data: URL found in SVG")
            if local_attr == "href" and not value.startswith("#"):
                raise ValueError(f"External URL in href: {value}")
            if local_attr == "style":
                if "expression(" in v_lower or "behavior:" in v_lower or "url(" in v_lower:
                    raise ValueError("Dangerous CSS pattern in SVG style attribute")

    # STEP 5: viewBox required; remove non-numeric width/height
    if "viewBox" not in root.attrib:
        raise ValueError("SVG must have a viewBox attribute")
    for dim in ("width", "height"):
        if dim in root.attrib:
            val = root.attrib[dim]
            try:
                float(val)
            except ValueError:
                del root.attrib[dim]

    # STEP 6: Re-serialize — lxml guarantees well-formed XML output
    etree.cleanup_namespaces(root)
    return etree.tostring(root, encoding="unicode")
