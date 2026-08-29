"""Locate the post JSONs, which live in the private content repository.

Both kinds of post are content, and both are now in the private content
repository. The example posts (docs/content-structure/examples/) left this
public repository on 2026-08-29 with the rest of the authoring layer; the
generated posts (docs/content-structure/generated/) left on the same day,
together with the pipeline runners that produce them. This module is the one
place in the backend that knows where either of them is.

The bridge is PLEXIVE_CONTENT_REPO, the same variable the pipeline runners
use, and it names the ROOT of a plexive-content clone. Unset, the paths below
resolve inside this repository, where neither directory exists any more, and
the preflight explains the boundary instead of failing bare.

Each resolver asserts on a COUNT, not on the directory existing. A directory
that exists and holds no posts makes every caller here iterate nothing and
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
GENERATED_SUBPATH = os.path.join("docs", "content-structure", "generated")

SUFFIX = "_example.json"


def _content_repo() -> str:
    """The root of the content repository, or this repository when unset."""
    return os.environ.get(ENV_VAR, "").strip() or PROJECT_ROOT


def _explain(subject: str, content_repo: str, target_dir: str, reason: str, want: str) -> None:
    """Print why the posts could not be read, and what to do about it."""
    print(f"FATAL: {reason}", file=sys.stderr)
    print(f"       expected {want} in {target_dir}", file=sys.stderr)
    print(
        "\n"
        f"The {subject} are not in this repository. They moved to the private\n"
        "content repository on 2026-08-29, deliberately: the application is public\n"
        "under AGPL-3.0, the content is not.",
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
            f"{ENV_VAR} is set to '{content_repo}', but the {subject} are not there.\n"
            "Check that it points at the ROOT of a plexive-content clone.",
            file=sys.stderr,
        )


def resolve_examples() -> tuple:
    """Return (examples_dir, sorted example filenames), or exit 1 explaining why not.

    Never returns an empty file list: an examples directory with nothing in it is
    reported as a failure rather than seeded over silently.
    """
    content_repo = _content_repo()
    examples_dir = os.path.join(content_repo, EXAMPLES_SUBPATH)
    want = f"*{SUFFIX} files"

    if not os.path.isdir(examples_dir):
        _explain(
            "example posts",
            content_repo,
            examples_dir,
            f"no examples directory at {examples_dir}",
            want,
        )
        sys.exit(1)

    filenames = sorted(f for f in os.listdir(examples_dir) if f.endswith(SUFFIX))
    if not filenames:
        _explain(
            "example posts",
            content_repo,
            examples_dir,
            f"the examples directory exists but holds no *{SUFFIX} files",
            want,
        )
        sys.exit(1)

    print(f"examples: {len(filenames)} found in {examples_dir}")
    return examples_dir, filenames


def resolve_generated() -> tuple:
    """Return (generated_dir, [(format, sorted filenames), ...]), or exit 1.

    The count is taken over <format>/*.json ONE LEVEL DEEP, which is exactly the
    set the caller seeds. The content repository also tracks per-batch reports
    under <format>/_batches/<batch>/*.json; counting recursively would fold those
    into the floor and leave it guarding a different set than the one it is here
    to protect. Never returns an empty list of posts.
    """
    content_repo = _content_repo()
    generated_dir = os.path.join(content_repo, GENERATED_SUBPATH)
    want = "<format>/*.json post files"

    if not os.path.isdir(generated_dir):
        _explain(
            "generated posts",
            content_repo,
            generated_dir,
            f"no generated directory at {generated_dir}",
            want,
        )
        sys.exit(1)

    formats = []
    total = 0
    for post_format in sorted(os.listdir(generated_dir)):
        format_dir = os.path.join(generated_dir, post_format)
        if not os.path.isdir(format_dir):
            continue
        filenames = sorted(f for f in os.listdir(format_dir) if f.endswith(".json"))
        if not filenames:
            continue
        formats.append((post_format, filenames))
        total += len(filenames)

    if total == 0:
        _explain(
            "generated posts",
            content_repo,
            generated_dir,
            "the generated directory exists but holds no posts",
            want,
        )
        sys.exit(1)

    names = ", ".join(f"{fmt} {len(files)}" for fmt, files in formats)
    print(f"generated: {total} found in {generated_dir} ({names})")
    return generated_dir, formats
