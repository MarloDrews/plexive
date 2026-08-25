"""LaTeX maths to an RGBA layer.

The concept card's other content slot: where the dot grid shows a proportion,
this shows a law written out -- Benford's distribution, the twelfth root of two,
the Lorentz factor.

Rendered through matplotlib's `mathtext`, which is a LaTeX maths parser and
typesetter built into matplotlib itself. It needs no TeX installation, works
offline and is deterministic, which is what makes it usable in a batch render;
real LaTeX would mean a system dependency the size of the rest of the project.
What it costs is matplotlib, so:

  * the import is INSIDE the function, not at module level. Rendering happens in
    scripts/generate_thumbnails.py and the CLI tools, never in the FastAPI
    request path, and a lazy import is what keeps the API from paying for it.
  * it is `matplotlib.figure.Figure` plus an explicit Agg canvas, never pyplot
    -- pyplot carries global state and picks a GUI backend, neither of which a
    server process should be dragged into.

The layer comes back white on transparent. The card pastes its own colour
through the alpha, so what colour a formula is stays a card decision rather than
a matplotlib one.
"""

import io
import logging
from typing import Dict, Optional

from PIL import Image

logger = logging.getLogger("app.thumbnails.formula")

# Rendered big and scaled down to fit, exactly as every other layer on the card
# is: the caller knows the box, this does not.
RENDER_DPI = 400
RENDER_FONT_SIZE = 28

# Which mathtext face to set the formula in, per card typeface. The formula
# follows the caption: `cm` is Computer Modern, the classic LaTeX look that
# suits the dressier serif card, and stixsans is its grotesque counterpart.
# Anything the card can ask for has an entry here.
MATHTEXT_FONTSETS: Dict[str, str] = {
    "sans": "stixsans",
    "serif": "cm",
}
DEFAULT_FONTSET = "cm"


class FormulaError(RuntimeError):
    """The formula could not be typeset -- almost always invalid LaTeX."""


def render_formula(latex: str, font_family: Optional[str] = None) -> Image.Image:
    """Typeset `latex` as maths and return it white on a transparent RGBA layer.

    `latex` is the body only, WITHOUT the surrounding dollar signs: pass
    `r"\\sqrt[12]{2}"`, not `r"$\\sqrt[12]{2}$"`. Wrapping is done here so a spec
    never has to carry delimiters, and so a formula written with them by mistake
    can be caught rather than silently typeset as literal text.

    Raises FormulaError for anything mathtext cannot parse. matplotlib reports
    those from deep inside its parser with no mention of which formula was at
    fault, and a batch run needs to be able to tell a bad spec from a bug.
    """
    body = (latex or "").strip()
    if not body:
        raise FormulaError("Empty formula.")
    if body.startswith("$") or body.endswith("$"):
        raise FormulaError(
            f"Formula {body!r} carries its own '$' delimiters; write the maths "
            "on its own, e.g. \\sqrt[12]{2}."
        )

    # Deliberately late: see the module docstring.
    try:
        import matplotlib
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        from matplotlib.figure import Figure
    except ImportError as exc:  # pragma: no cover - environment problem
        raise FormulaError(
            "matplotlib is required to draw a formula. Install it with "
            "`pip install matplotlib`."
        ) from exc

    fontset = MATHTEXT_FONTSETS.get((font_family or "").strip().lower(), DEFAULT_FONTSET)

    figure = Figure(figsize=(0.01, 0.01), dpi=RENDER_DPI)
    FigureCanvasAgg(figure)
    figure.patch.set_alpha(0.0)
    # rcParams are global, so the fontset is set on the artist instead of on
    # matplotlib itself -- two cards rendered in one process must not be able
    # to change each other's typeface.
    with matplotlib.rc_context({"mathtext.fontset": fontset}):
        figure.text(0, 0, f"${body}$", fontsize=RENDER_FONT_SIZE, color="white")
        buffer = io.BytesIO()
        try:
            # bbox_inches="tight" is what makes the 0.01x0.01 figure irrelevant:
            # the canvas is grown to whatever the text actually needs.
            figure.savefig(
                buffer,
                format="png",
                transparent=True,
                bbox_inches="tight",
                pad_inches=0.0,
            )
        except Exception as exc:
            # mathtext raises ValueError, ParseException and others depending
            # on how the input is wrong; all of them mean the same thing here.
            raise FormulaError(f"Could not typeset {body!r}: {exc}") from exc

    buffer.seek(0)
    image = Image.open(buffer)
    image.load()
    image = image.convert("RGBA")

    # "tight" still leaves a row or two of fully transparent pixels, and every
    # layer on the card is expected to touch all four sides of its own box --
    # that is what the glow and the contact shadow are sized against.
    box = image.getchannel("A").getbbox()
    if box is None:
        raise FormulaError(f"{body!r} typeset to nothing visible.")
    return image.crop(box)
