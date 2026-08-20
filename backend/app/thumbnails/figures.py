"""The mental generator's artwork: prepared 3D renders of a head and a brain.

Unlike the map, this card draws nothing procedurally -- it composites PNGs that
were rendered once in a 3D program. Three layers exist per camera angle:

    head.png        the solid head, the whole figure
    brain.png       the brain alone, floating where it sits inside that head
    head_glass.png  the same head as a translucent shell, to lay over the brain

The three are exported from ONE camera at ONE resolution and are never cropped
individually. That is what makes the overlay work: the brain already sits in
the right place in its own frame, so stacking the full frames aligns them with
no per-layer offsets to maintain. Cropping happens once, to the UNION of the
layers actually used, so the framing does not shift when a motif changes.

Angles are subdirectories of ASSET_ROOT; layer files sitting directly in it are
the angle "default", which is all a single-perspective set needs. Adding a
camera angle is dropping a folder in and naming it in angles.json -- the
generator's parameter list, the doc and the model prompt pick it up from there.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageOps

logger = logging.getLogger("app.thumbnails.figures")

ASSET_ROOT = Path(
    os.getenv(
        "THUMBNAIL_FIGURE_DIR",
        str(Path(__file__).resolve().parent / "assets" / "mental"),
    )
)

# Optional {folder: "one line describing what the camera sees"}. The text ends
# up in the `angle` parameter's description, which is what the model choosing a
# thumbnail reads -- without it a folder name like "three-quarter" means
# nothing to it.
ANGLE_DESCRIPTIONS_FILE = "angles.json"

# The angle a flat asset directory (layer files, no subfolders) is called.
DEFAULT_ANGLE = "default"

HEAD = "head"
BRAIN = "brain"
HEAD_GLASS = "head_glass"
LAYER_NAMES = (HEAD, BRAIN, HEAD_GLASS)

# Which layers each motif stacks, bottom first.
MOTIF_LAYERS: Dict[str, Tuple[str, ...]] = {
    # The person. A solid silhouette, nothing of the inside showing.
    "head": (HEAD,),
    # The organ on its own.
    "brain": (BRAIN,),
    # The organ seen THROUGH the person: the brain with the translucent skull
    # over it. The only motif that says "this is running inside someone".
    "brain_in_head": (BRAIN, HEAD_GLASS),
}
MOTIF_NAMES = tuple(MOTIF_LAYERS)

# A pixel counts as backdrop above this brightness. Only used to rescue a layer
# exported without an alpha channel -- see _keyed_alpha.
WHITE_THRESHOLD = 244


class FigureError(RuntimeError):
    """A motif was asked for that the asset directory cannot draw."""


# (angle, layer) -> RGBA image. Decoding a 1920x1080 PNG and keying its
# background is not free, and the files never change at runtime.
_layers: Dict[Tuple[str, str], Image.Image] = {}
_angles: Optional[Dict[str, Dict[str, Path]]] = None
_descriptions: Optional[Dict[str, str]] = None


def _scan() -> Dict[str, Dict[str, Path]]:
    """angle -> {layer name: file}, for every angle with at least one layer."""
    global _angles
    if _angles is not None:
        return _angles

    found: Dict[str, Dict[str, Path]] = {}
    if ASSET_ROOT.is_dir():
        flat = _layer_files(ASSET_ROOT)
        if flat:
            found[DEFAULT_ANGLE] = flat
        for entry in sorted(ASSET_ROOT.iterdir()):
            if entry.is_dir():
                layers = _layer_files(entry)
                if layers:
                    found[entry.name] = layers
    else:
        logger.warning("no thumbnail figure assets: %s does not exist", ASSET_ROOT)

    _angles = found
    return found


def _layer_files(directory: Path) -> Dict[str, Path]:
    return {
        name: directory / f"{name}.png"
        for name in LAYER_NAMES
        if (directory / f"{name}.png").is_file()
    }


def angle_names() -> Tuple[str, ...]:
    """Every camera angle the asset directory holds, in a stable order."""
    return tuple(sorted(_scan()))


def angle_descriptions() -> Dict[str, str]:
    """What each angle shows, from angles.json. Missing entries are fine."""
    global _descriptions
    if _descriptions is not None:
        return _descriptions

    path = ASSET_ROOT / ANGLE_DESCRIPTIONS_FILE
    data: Dict[str, str] = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = {str(key): str(value) for key, value in raw.items()}
        except (ValueError, OSError) as exc:
            logger.warning("ignoring unreadable %s: %s", path, exc)

    _descriptions = data
    return data


def motifs_for(angle: str) -> Tuple[str, ...]:
    """The motifs this angle has every layer for."""
    layers = _scan().get(angle, {})
    return tuple(
        name
        for name, needed in MOTIF_LAYERS.items()
        if all(layer in layers for layer in needed)
    )


def available_motifs() -> Tuple[str, ...]:
    """Every motif at least one angle can draw."""
    found = {motif for angle in angle_names() for motif in motifs_for(angle)}
    return tuple(name for name in MOTIF_NAMES if name in found)


def angles_for(motif: str) -> Tuple[str, ...]:
    """The angles that can draw `motif`."""
    return tuple(angle for angle in angle_names() if motif in motifs_for(angle))


def reset_cache() -> None:
    """Forget what was scanned and loaded. For tests, and for dropping in new
    artwork without restarting a long-running process."""
    global _angles, _descriptions
    _angles = None
    _descriptions = None
    _layers.clear()


def load_layer(angle: str, layer: str) -> Image.Image:
    """One layer as RGBA, cached.

    The cached image is never drawn on by callers: compose() crops and tints,
    and both of those return copies.
    """
    key = (angle, layer)
    cached = _layers.get(key)
    if cached is not None:
        return cached

    files = _scan().get(angle)
    if files is None:
        known = ", ".join(angle_names()) or "none"
        raise FigureError(f"no figure angle {angle!r} in {ASSET_ROOT} (have: {known})")
    path = files.get(layer)
    if path is None:
        raise FigureError(f"angle {angle!r} has no {layer}.png")

    image = Image.open(path)
    image.load()
    image = image.convert("RGBA")
    if image.getchannel("A").getextrema()[0] == 255:
        image.putalpha(_keyed_alpha(image, path, layer))

    _layers[key] = image
    return image


def _keyed_alpha(image: Image.Image, path: Path, layer: str) -> Image.Image:
    """Rescue a layer exported without transparency by keying its backdrop out.

    Only the near-white region CONNECTED TO THE FRAME EDGE is removed, not
    every bright pixel: a lit forehead is as bright as the backdrop, and a
    plain brightness threshold would punch holes through the figure.

    The translucent shell is refused outright. It is near-white by design, so
    keying it does not give a worse result -- it gives nothing at all.
    """
    if layer == HEAD_GLASS:
        raise FigureError(
            f"{path} has no alpha channel. The translucent shell cannot be keyed "
            "out of a white backdrop -- re-export it as a PNG with transparency "
            "(Blender: Render Properties > Film > Transparent)."
        )

    logger.warning(
        "%s has no alpha channel; keying its white backdrop out. Re-export with "
        "transparency for a clean edge.",
        path,
    )
    # The darkest of the three channels, not luma: a coloured subject on a
    # white backdrop is dark in at least one channel even where it is bright
    # overall, which separates a pink brain from white paper far better.
    red, green, blue = image.convert("RGB").split()
    darkest = ImageChops.darker(ImageChops.darker(red, green), blue)

    # 254 marks a backdrop candidate; flooding from the corners promotes only
    # the connected ones to 255, leaving enclosed bright areas with the figure.
    mask = darkest.point(lambda value: 254 if value >= WHITE_THRESHOLD else 0)
    width, height = mask.size
    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if mask.getpixel(seed) == 254:
            ImageDraw.floodfill(mask, seed, 255, thresh=0)

    return mask.point(lambda value: 0 if value == 255 else 255)


# How much of the luminance range to clip off each end when normalising, as a
# percentage. A render has a few stray specular pixels at the top and a few
# almost-black ones in a crevice; letting those two define the range wastes
# most of the ramp on tones nothing is actually drawn in.
NORMALIZE_CUTOFF = 1.0


def tint(
    image: Image.Image,
    shade: Tuple[int, int, int],
    light: Tuple[int, int, int],
    normalize: bool = True,
) -> Image.Image:
    """Recolour a shaded render into one colour, keeping its modelling.

    The render's own hue is thrown away and its LUMINANCE is remapped onto a
    ramp from `shade` to `light`, so the 3D shading survives while the layer
    takes the card's colour. Recolouring beats exporting a copy per palette:
    four colours times three layers times every camera angle is a lot of files
    to keep in step.

    Not every layer goes through here -- the brain is composited untouched, so
    it keeps the pink it was rendered in (see mental._tints).

    `normalize` stretches that luminance to the full range first, measured over
    the FIGURE ONLY (the transparent surround would otherwise decide the black
    point). Without it the result depends on how bright the render happened to
    be lit: the brain came out of the 3D program pale enough to sit at the top
    of the ramp, so a red card rendered pink. Turn it off for the translucent
    shell, which is meant to be washed out.
    """
    alpha = image.getchannel("A")
    luminance = ImageOps.grayscale(image.convert("RGB"))
    if normalize:
        luminance = ImageOps.autocontrast(
            luminance, cutoff=NORMALIZE_CUTOFF, mask=alpha.point(lambda v: 255 if v else 0)
        )
    coloured = ImageOps.colorize(luminance, shade, light).convert("RGBA")
    coloured.putalpha(alpha)
    return coloured


def compose(
    motif: str,
    angle: str,
    box: Tuple[int, int],
    tints: Dict[str, Tuple[Tuple[int, int, int], Tuple[int, int, int]]],
) -> Image.Image:
    """The finished figure on its own transparent layer, scaled to fit `box`.

    `tints` maps a layer name to its (shade, light) ramp; a layer missing from
    it keeps its original colours. The layers are cropped to their SHARED
    bounding box before scaling, so switching motif re-frames the card without
    ever breaking the alignment between brain and shell.
    """
    layers = MOTIF_LAYERS.get(motif)
    if layers is None:
        raise FigureError(f"unknown motif {motif!r} (known: {', '.join(MOTIF_NAMES)})")

    images = [load_layer(angle, layer) for layer in layers]
    bounds = _bounds(motif, angle)

    stacked = Image.new("RGBA", (bounds[2] - bounds[0], bounds[3] - bounds[1]), (0, 0, 0, 0))
    for name, image in zip(layers, images):
        cropped = image.crop(bounds)
        ramp = tints.get(name)
        stacked.alpha_composite(tint(cropped, *ramp) if ramp else cropped)

    return _fit(stacked, box)


def _bounds(motif: str, angle: str) -> Tuple[int, int, int, int]:
    """The shared bounding box of everything `motif` draws at `angle`."""
    layers = MOTIF_LAYERS.get(motif)
    if layers is None:
        raise FigureError(f"unknown motif {motif!r} (known: {', '.join(MOTIF_NAMES)})")
    box = _union_bbox([load_layer(angle, layer) for layer in layers])
    if box is None:
        raise FigureError(f"{motif} at angle {angle!r} is a fully transparent image")
    return box


def bleeds_off_bottom(motif: str, angle: str) -> bool:
    """Whether the figure runs out of the bottom of its own render.

    True for the head, whose neck is cut off by the frame rather than ending:
    that cut is only invisible while it sits ON the frame edge, so a card has
    to place such a figure flush with its bottom instead of floating it. False
    for the brain, which is a complete object with space all round it.
    """
    return _bounds(motif, angle)[3] >= load_layer(angle, MOTIF_LAYERS[motif][0]).height


def _union_bbox(images: List[Image.Image]) -> Optional[Tuple[int, int, int, int]]:
    boxes = [box for box in (image.getchannel("A").getbbox() for image in images) if box]
    if not boxes:
        return None
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def _fit(image: Image.Image, box: Tuple[int, int]) -> Image.Image:
    """Scale to fill `box` on its tighter axis, without distorting."""
    max_width, max_height = box
    scale = min(max_width / image.width, max_height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.LANCZOS)
