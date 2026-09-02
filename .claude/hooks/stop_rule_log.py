#!/usr/bin/env python3
"""Stop hook. Appends what this session's rules actually did to a JSON Lines log.

Exit 0 wrote, or had nothing to write. Exit 1 could not do the job, with the
reason on stderr. NEVER EXIT 2. On Stop, exit 2 prevents Claude from stopping
and continues the conversation; a hook whose only job is to log must not be able
to steer a session. That is why the failure code here is 1 and not the 2 the two
PreToolUse hooks in this directory use.

WHY A LOG AT ALL. A rule that has never fired and a rule that fires on correct
work look identical from outside, and both cost something. Nothing in this
repository records how any of its rules behave in use. This is the only
mechanism here that would ever produce a DELETION; everything else adds.

WHY Stop AND NOT PreToolUse OR PostToolUse. A refused call reaches neither of
them: measured 2026-09-01, a denied Read's tool_use_id appeared in none of 18
PreToolUse captures and produced no PostToolUse firing at all. Stop fires, its
input names the transcript, and the transcript already holds the refusal.
Register entry 14 of 2026-09-01.

THREE MEASURED FACTS THIS FILE DEPENDS ON, all from
plexive-docs/research/rule-log-stop-hook-measurement-2026-09-02.md:

1. THE TRANSCRIPT PATH COMES FROM STDIN AND IS NEVER BUILT FROM session_id.
   Inside a transcript, the snake_case `session_id` on a record is a DIFFERENT
   uuid from the file name; the camelCase `sessionId` is the file name. The Stop
   payload's `session_id` does match the file name, so the same key means two
   things depending on which side it is read from. Section 2.3, finding B.
2. `stop_reason` IS NOT REQUIRED. It is documented and was absent from all three
   captured firings at 2.1.257. Nothing here reads it. Section 1.
3. THE VERSION COMES FROM THE TRANSCRIPT'S OWN `version` FIELD, not from
   `claude --version`, which reports the build on disk rather than the one the
   session is running. Measured: 2.1.251 running against 2.1.258 on disk.
   Section 0.

DETECTION IS ON THE RESULT TEXT AND NOT ON `toolDenialKind`. That field looks
like it answers "what kind of rule stopped this" and is exactly inverted for the
case this log exists for: absent on 6 of 6 permission-deny refusals in the Read
form, and set to "permission-rule" on 36 of 36 PreToolUse hook blocks, which are
not permission rules. Keying on it finds 5 of 7 and prints a number that looks
like an answer. It is copied into every record as `tool_denial_kind`, as DATA,
and no branch in this file reads it. Section 2.3, finding A.

THE LOG NEVER CLAIMS A RULE. No field anywhere names the permission rule that
refused a call, so `reconstructed_deny_candidates` says in its own name that its
value is this file's guess at Claude Code's glob matching, and it records EVERY
match rather than the first: `git push --force-with-lease origin main` matches
two of the eight deny rules with nothing to tell them apart. A guess printed as
a fact would be worse than no field, because it would arrive with the authority
of a log. Section 3.1.

THE READ IS INCREMENTAL, from a byte offset stored per session, and the
tool_use_id dedup is kept as a SECOND guard rather than as the only one. A
transcript here runs 0.5 to 1.5 MB with a 6.7 MB maximum, so re-parsing once per
session end would be cheap; the offset is what keeps the cost flat if Stop turns
out to fire per turn.

THE REAL LOG IS NEVER TOUCHED BY A TEST. PLEXIVE_RULE_LOG_DIR overrides the
output directory, the way PLEXIVE_BACKUP_DIR does for the backup gate, and every
case in hook_cases.py sets it into a temporary tree.
"""

import fnmatch
import json
import os
import sys
import time
from pathlib import Path

# The three shapes a refusal takes here, named as
# rule-log-stop-hook-measurement-2026-09-02.md section 4.2 names them, so the
# log and the reports about it share one vocabulary.
#
# A `Read(...)` deny rule reaches PAST the tool it names: it refuses Bash
# commands that mention the path too, and the two produce different tool names
# and different text. That is why the first two are separate shapes and not one.
# Measured by a controlled pair, section 2.2.
SHAPE_DENY_PATH = "deny-rule-path"    # File is in a directory that is denied...
SHAPE_DENIED_CALL = "denied-call"     # Permission to use Bash with command ...
SHAPE_HOOK_BLOCK = "hook-block"       # PreToolUse:Bash hook error: ... BLOCKED

# `is_error` ALONE IS THE VACUOUS DEFINITION and is deliberately not used. Across
# the 164 transcripts measured on 2026-09-02 there were 372 error results, of
# which 280 were ordinary failures: a command that ran and exited non-zero, a
# Read of a file that is not there. Counting those would return a number 50 times
# too large. tools/correct-work/cases/cw-18-stop-hook-ordinary-failures.sh stores
# an input of exactly that shape and requires zero refusals from it.
DENY_PATH_TEXT = "denied by your permission settings"
DENIED_CALL_HEAD = "Permission to use "
DENIED_CALL_TAIL = "has been denied"
HOOK_BLOCK_TEXT = "hook error:"
HOOK_BLOCK_MARK = "BLOCKED"

# A human declining a permission prompt (41 in the corpus) and the auto-mode
# classifier (2) are refusals BY A PERSON and BY A CLASSIFIER, not by a rule this
# repository wrote. A log about rules keeps them out. Neither text is matched
# above, and this constant exists so the decision is greppable rather than
# implied by an absence. Section 4.3.
NOT_A_RULE_REFUSAL = ("user-rejected", "automode-blocked")

# A FOURTH SHAPE EXISTS AND THE MEASUREMENT DID NOT SEE IT. Found 2026-09-02 by
# running the detector above over the whole corpus and comparing its total
# against that report's: the three shapes account for 6 + 36 + 13 = 55 refusals,
# while toolDenialKind reads permission-rule 50 times, and one of those 50 is
#
#     Remove-Item on system path '/E' is blocked. This path is protected from
#     removal.
#
# which is Claude Code's OWN built-in path protection. It is mislabelled
# permission-rule for the same reason a hook block is, and it is not a rule this
# repository wrote, so it belongs with the two above rather than in the log. It
# is NOT matched, deliberately, and it is written down here rather than left as
# an absence, because a fourth shape that nobody named is how the count above
# quietly stops being the whole picture. The harness pins it at zero refusals.
BUILT_IN_PROTECTION = "is blocked. This path is protected from removal."

# The session half. Nothing in this repository instructs a session to write one
# of these; that instruction is a separate document change. The lifter is here
# so the log has somewhere to put one the day it exists.
NOTE_PREFIX = "RULE-NOTE:"

# How many following tool calls a refusal records. Three is enough to see "the
# session then did the thing another way" and short enough that the lookahead
# usually completes inside one firing.
LOOKAHEAD = 3

# Outstanding calls carried between firings, so a call written in one firing and
# refused in the next still has its arguments. Capped because a map that only
# grows is a file that only grows.
MAX_PENDING = 400


def log_dir():
    """The directory the log lives in.

    PLEXIVE_RULE_LOG_DIR first, so a test can never write to the real log.
    CLAUDE_PROJECT_DIR second, which is what Claude Code sets and what the two
    PreToolUse hook commands in .claude/settings.json already use. The path of
    this file last, so running the hook by hand from anywhere still works.
    """
    override = os.environ.get("PLEXIVE_RULE_LOG_DIR")
    if override:
        return Path(override)
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    if project:
        return Path(project) / ".claude" / "rule-log"
    return Path(__file__).resolve().parent.parent / "rule-log"


def read_payload():
    """The payload, from stdin READ AS BYTES and decoded as UTF-8 explicitly.

    Same idiom as pretooluse_write.py, and for the same measured reason:
    `json.load(sys.stdin)` decodes with the machine's DEFAULT encoding, cp1252
    here, which turns the bytes of any non-ASCII character into a different
    character WITHOUT RAISING. A command or a path in a refusal record would be
    silently mangled rather than refused.
    """
    return json.loads(sys.stdin.buffer.read().decode("utf-8"))


def load_state(path):
    """Per-session offsets and dedup sets, or an empty map.

    A state file that cannot be parsed is treated as absent rather than fatal.
    The cost of that is re-reading a transcript from zero and the tool_use_id
    dedup catching the repeats, which is the second guard doing the job it is
    kept for.
    """
    try:
        with open(path, "rb") as handle:
            state = json.loads(handle.read().decode("utf-8"))
        if isinstance(state, dict):
            return state
    except Exception:  # noqa: BLE001 - an unreadable state file is not fatal
        pass
    return {}


def save_state(path, state):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(state, handle, indent=1, sort_keys=True)
        handle.write("\n")


def append(path, record):
    """One record, one line, UTF-8, LF. Opened per call and closed per call.

    newline="" keeps Python from turning the "\\n" below into CRLF on this
    machine, which would make every reader that splits on "\\n" see a trailing
    carriage return inside the last field.
    """
    with open(path, "a", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def machine(kind, session_id):
    """The common head of a record the hook observed rather than was told.

    `half` is the field a reader uses to tell the two apart, and it carries that
    distinction ALONE: no other field has to be read, and no text has to be
    interpreted, to know whether a record is an observation or a session's own
    account of itself.
    """
    return {
        "half": "machine",
        "kind": kind,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "session_id": session_id,
    }


def blocks_of(record):
    """The content blocks of one transcript record, or an empty list."""
    message = record.get("message")
    if not isinstance(message, dict):
        return []
    content = message.get("content")
    if not isinstance(content, list):
        return []
    return [b for b in content if isinstance(b, dict)]


def result_text(block):
    """The text of a tool_result block, whichever of the two shapes it uses."""
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts)
    return ""


def refusal_shape(text):
    """One of the three shape names, or None. FROM THE TEXT AND NOTHING ELSE.

    This function takes no record and no denial kind, so there is no way for the
    typed field to influence the decision even by accident. hook_cases.py builds
    a field-keyed copy of this hook by splicing the CALL SITE below, which is why
    the call site is one line and is quoted verbatim in that file.
    """
    if DENY_PATH_TEXT in text:
        return SHAPE_DENY_PATH
    if DENIED_CALL_HEAD in text and DENIED_CALL_TAIL in text:
        return SHAPE_DENIED_CALL
    if HOOK_BLOCK_TEXT in text and HOOK_BLOCK_MARK in text:
        return SHAPE_HOOK_BLOCK
    return None


def attempt_of(tool_name, tool_input):
    """What was attempted: the command for Bash, the path for anything else."""
    if not isinstance(tool_input, dict):
        return ""
    for key in ("command", "file_path", "path", "pattern", "url"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def deny_rules(cwd):
    """The deny rules as written, from .claude/settings.json, or an empty list.

    Read fresh on every firing rather than cached, because the point of the log
    is to survive somebody editing that file.
    """
    for base in (os.environ.get("CLAUDE_PROJECT_DIR"), cwd):
        if not base:
            continue
        path = Path(base) / ".claude" / "settings.json"
        try:
            with open(path, "rb") as handle:
                settings = json.loads(handle.read().decode("utf-8"))
            rules = settings.get("permissions", {}).get("deny", [])
            if isinstance(rules, list):
                return [r for r in rules if isinstance(r, str)]
        except Exception:  # noqa: BLE001 - no settings file is not an error here
            continue
    return []


def split_rule(rule):
    """`Read(**/.env)` into ("Read", "**/.env"), or (None, None)."""
    if not rule.endswith(")") or "(" not in rule:
        return None, None
    tool, _, pattern = rule.partition("(")
    return tool.strip(), pattern[:-1]


def path_like(token):
    """Whether a command token is worth testing against a Read deny pattern."""
    if not token or token.startswith("-"):
        return False
    return "/" in token or "\\" in token or token.startswith(".") or "." in token


def reconstruct_candidates(tool_name, attempt, rules):
    """EVERY deny rule this file believes would match. A GUESS, not a reading.

    Nothing in a refusal record names the rule that refused it, on any of the
    three shapes. So this re-derives candidates by running the patterns against
    what was attempted, and the field it lands in is named for what it is. TWO
    THINGS MAKE IT A GUESS AND BOTH ARE REAL. It reimplements Claude Code's glob
    matching with fnmatch, which is a different implementation; and one real
    command matches two rules with nothing to separate them, so the honest answer
    is a list rather than an element.

    A `Read(...)` rule is tested against a Bash command's path-like tokens as
    well, because a Read deny rule DOES refuse Bash commands naming the path:
    `wc -c backend/.env` was refused by `Read(**/.env)` while `wc -c
    backend/.env.example` ran, same command, only the argument different.
    """
    found = []
    lowered = attempt.replace("\\", "/")
    tokens = [t.replace("\\", "/") for t in attempt.split() if path_like(t)]
    for rule in rules:
        rule_tool, pattern = split_rule(rule)
        if not rule_tool or pattern is None:
            continue
        if rule_tool == tool_name and fnmatch.fnmatchcase(lowered, pattern):
            found.append(rule)
            continue
        if rule_tool == "Read" and tool_name != "Read":
            if any(fnmatch.fnmatchcase(t, pattern) for t in tokens):
                found.append(rule)
    return found


def hook_message_of(text):
    """The hook's own message out of a hook-block result, or "".

    The hook block is THE ONE TRACEABLE SHAPE, and it is traceable only because
    pretooluse_bash.py prints its own path and its own reason. That is a property
    of this repository's hooks, not of Claude Code, so it is captured verbatim
    rather than parsed into fields that would stop matching the day the hook's
    wording changes.
    """
    marker = text.find(HOOK_BLOCK_TEXT)
    if marker < 0:
        return ""
    return text[marker + len(HOOK_BLOCK_TEXT):].strip()


def scan(lines, pending, seen_ids, rules):
    """(refusals, calls, results, ids_seen) from the records in `lines`.

    `pending` maps an unresolved tool_use_id to what was attempted, and carries
    across firings so a call written in one window and refused in the next still
    has its arguments.
    """
    records = []
    for line in lines:
        try:
            record = json.loads(line)
        except Exception:  # noqa: BLE001 - a truncated line is skipped, not fatal
            continue
        if isinstance(record, dict):
            records.append(record)

    # Pass one: every call, in order, so the lookahead has something to look at.
    calls = []
    for index, record in enumerate(records):
        for block in blocks_of(record):
            if block.get("type") != "tool_use":
                continue
            use_id = block.get("id")
            entry = {
                "tool_use_id": use_id if isinstance(use_id, str) else "",
                "tool_name": block.get("name") if isinstance(block.get("name"), str) else "",
                "attempt": attempt_of(block.get("name"), block.get("input")),
                "index": index,
            }
            calls.append(entry)
            if entry["tool_use_id"]:
                pending[entry["tool_use_id"]] = {
                    "tool_name": entry["tool_name"],
                    "attempt": entry["attempt"],
                }

    # Pass two: every result, and of those the ones a rule refused.
    refusals = []
    results = 0
    for index, record in enumerate(records):
        for block in blocks_of(record):
            if block.get("type") != "tool_result":
                continue
            results += 1
            if not block.get("is_error"):
                continue
            text = result_text(block)
            shape = refusal_shape(text)
            if shape is None:
                continue
            use_id = block.get("id") or block.get("tool_use_id")
            use_id = use_id if isinstance(use_id, str) else ""
            if use_id and use_id in seen_ids:
                continue
            call = pending.get(use_id, {})
            tool_name = call.get("tool_name", "")
            attempt = call.get("attempt", "")

            ahead = [c for c in calls if c["index"] > index][:LOOKAHEAD]
            refusals.append({
                "tool_use_id": use_id,
                "shape": shape,
                "tool_name": tool_name,
                "attempt": attempt,
                "hook_message": hook_message_of(text) if shape == SHAPE_HOOK_BLOCK else "",
                "tool_denial_kind": record.get("toolDenialKind"),
                "reconstructed_deny_candidates": reconstruct_candidates(
                    tool_name, attempt, rules
                ),
                "next_tool_calls": [
                    {"tool_name": c["tool_name"], "attempt": c["attempt"]} for c in ahead
                ],
                "lookahead_complete": len(ahead) >= LOOKAHEAD,
            })
            if use_id:
                seen_ids.add(use_id)
                pending.pop(use_id, None)

    return refusals, len(calls), results, records


def session_facts(records, transcript, cwd):
    """The one-per-session counts, from the records read so far."""
    uses = set()
    resolved = set()
    use_count = 0
    result_count = 0
    version = ""
    branch = ""
    for record in records:
        if isinstance(record.get("version"), str) and record["version"]:
            version = record["version"]
        if isinstance(record.get("gitBranch"), str) and record["gitBranch"]:
            branch = record["gitBranch"]
        for block in blocks_of(record):
            if block.get("type") == "tool_use":
                use_count += 1
                if isinstance(block.get("id"), str):
                    uses.add(block["id"])
            elif block.get("type") == "tool_result":
                result_count += 1
                rid = block.get("id") or block.get("tool_use_id")
                if isinstance(rid, str):
                    resolved.add(rid)
    return {
        "transcript_path": str(transcript),
        "transcript_bytes": transcript.stat().st_size if transcript.exists() else 0,
        "tool_use_count": use_count,
        "tool_result_count": result_count,
        "orphan_tool_use_count": len(uses - resolved),
        "claude_code_version": version,
        "cwd": cwd,
        "git_branch": branch or branch_from_head(cwd),
    }


def branch_from_head(cwd):
    """The branch out of .git/HEAD, so the hook spawns no subprocess.

    Only reached when the transcript carries no gitBranch. A hook that shells out
    is a hook whose cost depends on the machine it runs on.
    """
    if not cwd:
        return ""
    try:
        head = (Path(cwd) / ".git" / "HEAD").read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001 - not a work tree, or no permission
        return ""
    if head.startswith("ref: refs/heads/"):
        return head[len("ref: refs/heads/"):]
    return head


def notes_of(message, already):
    """Every unseen RULE-NOTE line in the session's last message.

    THIS IS THE ONLY HALF OF THE LOG THE HOOK DOES NOT OBSERVE. It is what the
    session says about itself, so it is marked `half` of "session" and a reader
    can discard it without reading a word of it.
    """
    if not isinstance(message, str):
        return []
    out = []
    for line in message.splitlines():
        stripped = line.strip()
        if not stripped.startswith(NOTE_PREFIX):
            continue
        text = stripped[len(NOTE_PREFIX):].strip()
        if text and text not in already:
            out.append(text)
            already.append(text)
    return out


def report_failure(log_path, session_id, reason):
    """Say it on stderr, and record it in the log too if the log can be written.

    Stderr from a hook that exits non-zero reaches the transcript as one notice
    line. Stderr from a hook that exits 0 goes to the debug log and nowhere else.
    Neither is somewhere anybody looks later, which is why the error also goes
    into the log itself whenever the log is the thing that still works: a log
    that has silently stopped writing looks exactly like a log with nothing to
    write, and that is the failure shape CLAUDE.md already records for backups.
    """
    sys.stderr.write("stop_rule_log.py: " + reason + "\n")
    try:
        record = machine("error", session_id)
        record["reason"] = reason
        append(log_path, record)
    except Exception as exc:  # noqa: BLE001 - stderr already carried the reason
        sys.stderr.write(
            "stop_rule_log.py: the log could not be written either ("
            + type(exc).__name__ + ").\n"
        )


def main():
    try:
        payload = read_payload()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(
            "stop_rule_log.py: could not read its stdin as JSON ("
            + type(exc).__name__ + "). Nothing was logged.\n"
        )
        return 1

    if not isinstance(payload, dict):
        sys.stderr.write(
            "stop_rule_log.py: the payload is not an object. Nothing was logged.\n"
        )
        return 1

    session_id = payload.get("session_id")
    session_id = session_id if isinstance(session_id, str) else ""
    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) else ""

    directory = log_dir()
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(
            "stop_rule_log.py: could not create " + str(directory) + " ("
            + type(exc).__name__ + "). Nothing was logged.\n"
        )
        return 1
    log_path = directory / "events.jsonl"
    state_path = directory / "state.json"

    # `transcript_path` is REQUIRED and is not reconstructed from session_id.
    # See the module docstring, fact 1.
    transcript_path = payload.get("transcript_path")
    if not isinstance(transcript_path, str) or not transcript_path:
        report_failure(
            log_path, session_id,
            "the Stop payload carried no transcript_path, so there was nothing "
            "to read. The path is never rebuilt from session_id: inside a "
            "transcript that key is a different uuid from the file name."
        )
        return 1

    transcript = Path(transcript_path)
    state = load_state(state_path)
    mine = state.get(session_id)
    if not isinstance(mine, dict):
        mine = {}
    mine.setdefault("offset", 0)
    mine.setdefault("refusal_ids", [])
    mine.setdefault("pending", {})
    mine.setdefault("notes", [])
    mine.setdefault("session_written", False)
    # Counted whether or not anything was appended, which is what lets a firing
    # that had nothing to write still be seen. Criterion 15 is answered from it.
    mine["firings"] = int(mine.get("firings", 0)) + 1

    try:
        size = transcript.stat().st_size
        with open(transcript, "rb") as handle:
            handle.seek(min(mine["offset"], size))
            raw = handle.read()
    except Exception as exc:  # noqa: BLE001
        state[session_id] = mine
        try:
            save_state(state_path, state)
        except Exception:  # noqa: BLE001
            pass
        report_failure(
            log_path, session_id,
            "could not read the transcript at " + transcript_path + " ("
            + type(exc).__name__ + ")."
        )
        return 1

    # Only WHOLE lines are consumed. A transcript is appended to while this runs,
    # so the last line can be half written; leaving the offset short means the
    # next firing reads it entire rather than dropping it.
    text = raw.decode("utf-8", errors="replace")
    complete, _, remainder = text.rpartition("\n")
    lines = [ln for ln in complete.split("\n") if ln.strip()] if complete else []
    consumed = len(raw) - len(remainder.encode("utf-8", errors="replace"))

    seen_ids = set(mine["refusal_ids"])
    pending = dict(mine["pending"])
    rules = deny_rules(cwd)

    try:
        refusals, _, _, records = scan(lines, pending, seen_ids, rules)
    except Exception as exc:  # noqa: BLE001 - a scan that raised is not a clean scan
        report_failure(
            log_path, session_id,
            "the transcript scan could not finish (" + type(exc).__name__ + ": "
            + str(exc) + "). A scan that raised is not a scan that found "
            "nothing, and the two must not produce the same log."
        )
        return 1

    written_refusals = 0
    try:
        if not mine["session_written"]:
            record = machine("session", session_id)
            record.update(session_facts(records, transcript, cwd))
            append(log_path, record)
            mine["session_written"] = True

        for refusal in refusals:
            record = machine("refusal", session_id)
            record.update(refusal)
            append(log_path, record)
            written_refusals += 1

        notes = notes_of(payload.get("last_assistant_message"), mine["notes"])
        for note in notes:
            append(log_path, {
                "half": "session",
                "kind": "note",
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "session_id": session_id,
                "text": note,
            })
    except Exception as exc:  # noqa: BLE001
        report_failure(
            log_path, session_id,
            "could not append to " + str(log_path) + " (" + type(exc).__name__
            + ")."
        )
        return 1

    mine["offset"] = mine["offset"] + consumed
    mine["refusal_ids"] = sorted(seen_ids)
    mine["pending"] = dict(list(pending.items())[-MAX_PENDING:])
    state[session_id] = mine
    try:
        save_state(state_path, state)
    except Exception as exc:  # noqa: BLE001
        # The records are already on disk. Losing the offset costs a re-read next
        # firing, which the tool_use_id dedup absorbs, so this is reported and
        # not treated as a failure of the append that already succeeded.
        sys.stderr.write(
            "stop_rule_log.py: the records were written but the offset was not "
            "saved (" + type(exc).__name__ + "). The next firing re-reads from "
            + str(mine["offset"]) + ".\n"
        )

    # On Stop, stdout goes to the debug log and is never shown to the session, so
    # this line costs nothing in use and is what lets hook_cases.py assert on
    # BEHAVIOUR rather than only on an exit code.
    sys.stdout.write(
        "rule-log: session=%s firing=%d refusals=%d notes=%d -> %s\n"
        % (session_id or "?", mine["firings"], written_refusals,
           len(mine["notes"]), log_path)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
