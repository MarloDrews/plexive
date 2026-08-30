#!/usr/bin/env python3
"""PreToolUse hook for the Write and Edit tools.

Exit 2 blocks the tool call and shows stderr to the session. Exit 0 allows it.
Pure standard library.

WHICH FIELD CARRIES THE CONTENT DEPENDS ON THE TOOL, and the shape is not the
same for all of them. Write sends the whole file as `content`; Edit sends only a
replacement string, under `new_string`; the multi-edit shape sends a list under
`edits`. All of them are read here, and anything found is concatenated, because
a check that silently sees an empty string is a check that passes everything.
"""

import json
import re
import sys
from pathlib import Path

# Extensions the emoji rule applies to. Prose files are not covered: CLAUDE.md
# bans emoji in code and comments, and a doc that quotes one is not the target.
CODE_SUFFIXES = {".py", ".ts", ".tsx", ".kt", ".css", ".mjs"}

# U+1F300 to U+1FAFF, and NO WIDER. Extending it to the dingbats block to catch
# check and cross glyphs costs eight correct files that use them, so the range
# stays where it is and that widening is deliberately not done.
EMOJI = re.compile("[\U0001F300-\U0001FAFF]")

# The project's own replacement helper. It names the deprecated call in its
# docstring (time_utils.py:1 and :4), so it is the one .py file where the
# literal is correct.
UTCNOW_EXEMPT = ("backend/app/time_utils.py",)

PK_INDEX = re.compile(r"primary_key\s*=\s*True.*index\s*=\s*True")

# Field names, in the order they are tried. Reported rather than assumed: no
# live Edit payload was captured while writing this, so the extra names are
# tolerance for a shape this file has not seen, not a claim about one.
CONTENT_FIELDS = ("content", "new_string", "new_str", "newString")


def block(reason):
    sys.stderr.write(reason.rstrip() + "\n")
    sys.exit(2)


def normalise(path):
    """Repository-relative, forward slashes, so a check can name a real file."""
    return str(path).replace("\\", "/")


def gather_content(tool_input):
    """Everything the payload offers as written content, plus the field names.

    Returns (text, names). The names are returned so a caller can print which
    fields a real payload actually carried instead of guessing.
    """
    parts = []
    names = []
    for field in CONTENT_FIELDS:
        value = tool_input.get(field)
        if isinstance(value, str) and value:
            parts.append(value)
            names.append(field)
    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for edit in edits:
            if not isinstance(edit, dict):
                continue
            for field in CONTENT_FIELDS:
                value = edit.get(field)
                if isinstance(value, str) and value:
                    parts.append(value)
                    names.append("edits[]." + field)
    return "\n".join(parts), names


def check_emoji(path, content):
    if Path(path).suffix.lower() not in CODE_SUFFIXES:
        return
    found = EMOJI.findall(content)
    if found:
        codepoints = ", ".join(sorted({"U+%04X" % ord(c) for c in found}))
        block(
            "BLOCKED: emoji in a code file.\n"
            "CLAUDE.md: no emojis in code or comments.\n"
            "File: " + normalise(path) + "\n"
            "Found " + str(len(found)) + " codepoint(s) in U+1F300-U+1FAFF: "
            + codepoints
        )


def check_utcnow(path, content):
    rel = normalise(path)
    if Path(rel).suffix.lower() != ".py":
        return
    if any(rel.endswith(exempt) for exempt in UTCNOW_EXEMPT):
        return
    if "datetime.utcnow()" in content:
        block(
            "BLOCKED: datetime.utcnow() in a .py file.\n"
            "It is deprecated since Python 3.12 and returns a NAIVE datetime, "
            "which compares wrongly against an aware one instead of raising.\n"
            "File: " + rel + "\n"
            "Use backend/app/time_utils.py, which is the project's single "
            "replacement for exactly this."
        )


def check_pk_index(path, content):
    if not normalise(path).endswith("backend/app/models.py"):
        return
    for number, line in enumerate(content.splitlines(), start=1):
        if PK_INDEX.search(line):
            block(
                "BLOCKED: primary_key=True with index=True on one line in "
                "models.py.\n"
                "A primary key is already indexed, so index=True on it is "
                "redundant. ada78e5 (2026-07-06) removed these flags, and the "
                "three indexes create_all had already built from them are still "
                "live and still pending in "
                "alembic/versions/0002_drop_redundant_indexes.py.\n"
                "Re-adding the flag would reverse that decision and write "
                "redundant indexes into every fresh database.\n"
                "Line " + str(number) + ": " + line.strip()
            )


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        # An unreadable payload is not evidence of a bad write. Allow, so that a
        # payload-shape change cannot wedge every edit in the session.
        return 0

    tool_input = payload.get("tool_input") or {}
    path = tool_input.get("file_path") or ""
    if not path:
        return 0

    content, names = gather_content(tool_input)
    if not content:
        # Nothing readable to inspect. Say so on stderr rather than passing in
        # silence: a check that saw no content and a check that saw clean
        # content must not produce the same output.
        sys.stderr.write(
            "NOTE: pretooluse_write.py found no content field on this payload "
            "(tried " + ", ".join(CONTENT_FIELDS) + " and edits[]). "
            "Nothing was inspected for " + normalise(path) + ".\n"
        )
        return 0

    if "--print-fields" in sys.argv:
        sys.stderr.write("content fields found: " + ", ".join(names) + "\n")

    check_emoji(path, content)
    check_utcnow(path, content)
    check_pk_index(path, content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
