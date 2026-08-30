#!/usr/bin/env python3
"""PreToolUse hook for the Write and Edit tools.

Exit 2 blocks the tool call and shows stderr to the session. Exit 0 allows it.
Pure standard library.

WHICH FIELD CARRIES THE CONTENT DEPENDS ON THE TOOL, and the shape is not the
same for all of them. Write sends the whole file as `content`; Edit sends only a
replacement string, under `new_string`; the multi-edit shape sends a list under
`edits`. All of them are read here, and anything found is concatenated, because
a check that silently sees an empty string is a check that passes everything.

The live shapes are no longer inferred. Captured from a real session on
2026-08-30: Edit sends `file_path`, `old_string`, `new_string`, `replace_all`,
and Write sends `content`, `file_path`. `new_string` is the second name tried.
The other two names and the `edits[]` branch are tolerance for a shape this file
has not seen, not a claim about one.

ONE LITERAL IS BUILT BY CONCATENATION ON PURPOSE, the deprecated utcnow call.
Spelled out, this file trips its own check and CANNOT BE WRITTEN by the Write or
Edit tools the hook is bound to; measured 2026-08-30, when rewriting it was
blocked by itself. hook_cases.py:38 already does the same thing for the same
reason. A gate its own source cannot pass is a gate somebody eventually removes.
"""

import json
import re
import sys
from pathlib import Path

# Extensions the emoji rule applies to. Prose files are not covered: CLAUDE.md
# bans emoji in code and comments, and a doc that quotes one is not the target.
#
# THE SECOND ROW WAS ADDED 2026-08-30 and every suffix on it was counted first,
# because adopting a suffix that already holds a match would make the next
# correct edit to that file unblockable. Measured over `git ls-files`, files
# holding a codepoint in the range below: .kts 4 tracked / 0 matching,
# .sh 4 / 0, .yml 6 / 0. THE OTHER THREE ARE A WEAKER FACT AND ARE WRITTEN DOWN
# AS ONE: .yaml, .js and .jsx have 0 tracked files at all, so their zero is the
# absence of a file rather than a clean scan of one.
CODE_SUFFIXES = {
    ".py", ".ts", ".tsx", ".kt", ".css", ".mjs",
    ".kts", ".sh", ".yml", ".yaml", ".js", ".jsx",
}

# U+1F300 to U+1FAFF, and NO WIDER. Extending it to the dingbats block to catch
# check and cross glyphs costs eight correct files that use them, so the range
# stays where it is and that widening is deliberately not done.
EMOJI = re.compile("[\U0001F300-\U0001FAFF]")

# Built rather than written. See the module docstring.
UTCNOW_CALL = "datetime." + "utcnow()"

# The project's own replacement helper. It names the deprecated call in its
# docstring (time_utils.py:1 and :4), so it is the one .py file where the
# literal is correct in RUNNING code. The test file beside it joins it: a test
# asserting the string is absent has to spell the string. Measured 2026-08-30,
# blocked at exit 2, recorded as F22.
UTCNOW_EXEMPT = (
    "backend/app/time_utils.py",
    "backend/tests/test_time_utils.py",
)

PK_INDEX = re.compile(r"primary_key\s*=\s*True.*index\s*=\s*True")

# Field names, in the order they are tried.
CONTENT_FIELDS = ("content", "new_string", "new_str", "newString")


def block(reason):
    sys.stderr.write(reason.rstrip() + "\n")
    sys.exit(2)


def normalise(path):
    """Repository-relative, forward slashes, so a check can name a real file."""
    return str(path).replace("\\", "/")


def is_full_line_comment(line):
    """True when the line's first non-whitespace character is `#`.

    SUCH A LINE IS NEVER EXECUTABLE PYTHON, so exempting it from the two
    SEMANTIC checks is exact rather than approximate. It is the class the module
    docstring above already records about this file: a check whose subject
    cannot be discussed in the language it guards. Measured 2026-08-30: a
    comment naming the deprecated call, and a comment in models.py explaining
    the decision check_pk_index enforces, both blocked at exit 2 (F22).

    A TRAILING comment is deliberately NOT covered, because the code before it
    on the same line does run. The emoji check is not covered either, and that
    is not an oversight: the rule it enforces names comments, so a comment is
    exactly where it is supposed to fire.
    """
    return line.lstrip().startswith("#")


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
    # Line by line, so a full-line comment can be skipped. Reading the whole
    # blob at once is what made a comment about the ban unwritable.
    for number, line in enumerate(content.splitlines(), start=1):
        if is_full_line_comment(line):
            continue
        if UTCNOW_CALL in line:
            block(
                "BLOCKED: " + UTCNOW_CALL + " in a .py file.\n"
                "It is deprecated since Python 3.12 and returns a NAIVE "
                "datetime, which compares wrongly against an aware one instead "
                "of raising.\n"
                "File: " + rel + "\n"
                "Line " + str(number) + ": " + line.strip() + "\n"
                "Use backend/app/time_utils.py, which is the project's single "
                "replacement for exactly this."
            )


def check_pk_index(path, content):
    if not normalise(path).endswith("backend/app/models.py"):
        return
    for number, line in enumerate(content.splitlines(), start=1):
        if is_full_line_comment(line):
            continue
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


# The registry the runner walks, so a check that raises can name itself.
CHECKS = [
    ("emoji in a code file", check_emoji),
    ("the deprecated utcnow call in a .py", check_utcnow),
    ("primary_key with index in models.py", check_pk_index),
]


def run_checks(path, content):
    """Run every check. A check that raises BLOCKS, naming itself.

    The second of the two crash rules, and the opposite of the first. A payload
    nothing could be read out of allows; a payload that WAS read and then broke
    a check does not, because a check that raised is not a check that passed.
    """
    for name, check in CHECKS:
        try:
            check(path, content)
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 - one verdict for every failure
            block(
                "BLOCKED: the check '" + name + "' could not finish ("
                + type(exc).__name__ + ": " + str(exc) + ").\n"
                "A check that raised is not a check that passed. The file path "
                "and content were read, so this is not an unreadable payload; "
                "it is a defect in the hook, and it is reported rather than "
                "waved through."
            )


def path_and_input(payload):
    """The file path and the tool input, or ("", {}) if the payload has neither.

    Every wrong SHAPE lands here and produces "", which the caller turns into
    exit 0. A payload this hook cannot read is not evidence of a bad write, and
    blocking over one would wall a session for a reason that has nothing to do
    with what it asked for.
    """
    if not isinstance(payload, dict):
        return "", {}
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return "", {}
    path = tool_input.get("file_path")
    if not isinstance(path, str) or not path:
        return "", {}
    return path, tool_input


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        # An unreadable payload is not evidence of a bad write. Allow, so that a
        # payload-shape change cannot wedge every edit in the session.
        return 0

    path, tool_input = path_and_input(payload)
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

    run_checks(path, content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
