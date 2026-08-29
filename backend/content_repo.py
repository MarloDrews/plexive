"""Locate the example posts, which live in the private content repository.

docs/content-structure/examples/ moved out of this public repository on
2026-08-29, together with the skeletons and the standards it belongs with. The
generated posts under docs/content-structure/generated/ did NOT move: they are
published content and still live here, so only the examples need a bridge.

That bridge is PLEXIVE_CONTENT_REPO, the same variable tools/run_pipeline.sh
already uses, and this module follows that script's shape deliberately:
the variable names the ROOT of a plexive-content clone, unset it resolves
inside this repository where the examples no longer are, and the preflight
explains the boundary instead of failing bare.

The preflight asserts on a COUNT, not on the directory existing. A directory
that exists and holds no examples makes every caller here iterate nothing and
report success, which is the failure mode the CI notes in CLAUDE.md describe:
a step that watches for a condition reporting its own failure as a pass.
"""

import os
import sys

ENV_VAR = "PLEXIVE_CONTENT_REPO"

# backend/content_repo.py -> backend/ -> repository root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Relative to the content repository root, identical on both sides of the move.
EXAMPLES_SUBPATH = os.path.join("docs", "content-structure", "examples")

SUFFIX = "_example.json"


def _explain(content_repo: str, examples_dir: str, reason: str) -> None:
    """Print why the examples could not be read, and what to do about it."""
    print(f"FATAL: {reason}", file=sys.stderr)
    print(f"       expected {SUFFIX} files in {examples_dir}", file=sys.stderr)
    print(
        "\n"
        "The example posts are not in this repository. They moved to the private\n"
        "content repository on 2026-08-29, deliberately: the application is public\n"
        "under AGPL-3.0, the content methodology is not.",
        file=sys.stderr,
    )
    if content_repo == PROJECT_ROOT:
        print(
            f"{ENV_VAR} is unset, so this looked in the public checkout.\n"
            "If you have access, clone the private repository alongside this one and run:\n"
            f"  {ENV_VAR}=/path/to/plexive-content python {os.path.basename(sys.argv[0] or 'seed.py')}",
            file=sys.stderr,
        )
    else:
        print(
            f"{ENV_VAR} is set to '{content_repo}', but the examples are not there.\n"
            "Check that it points at the ROOT of a plexive-content clone.",
            file=sys.stderr,
        )
    print(
        "The generated posts under docs/content-structure/generated/ stayed in this\n"
        "repository and are unaffected by this variable.",
        file=sys.stderr,
    )


def resolve_examples() -> tuple:
    """Return (examples_dir, sorted example filenames), or exit 1 explaining why not.

    Never returns an empty file list: an examples directory with nothing in it is
    reported as a failure rather than seeded over silently.
    """
    content_repo = os.environ.get(ENV_VAR, "").strip() or PROJECT_ROOT
    examples_dir = os.path.join(content_repo, EXAMPLES_SUBPATH)

    if not os.path.isdir(examples_dir):
        _explain(content_repo, examples_dir, f"no examples directory at {examples_dir}")
        sys.exit(1)

    filenames = sorted(f for f in os.listdir(examples_dir) if f.endswith(SUFFIX))
    if not filenames:
        _explain(
            content_repo,
            examples_dir,
            f"the examples directory exists but holds no *{SUFFIX} files",
        )
        sys.exit(1)

    print(f"examples: {len(filenames)} found in {examples_dir}")
    return examples_dir, filenames
