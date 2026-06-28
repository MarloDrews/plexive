#!/usr/bin/env python3
"""
texture_check.py  -  mechanical layer of HUMAN_TEXTURE_STANDARD.md

Reads one post JSON and emits CANDIDATES, never verdicts. It never fails a post.
It surfaces the spots the model audit and the human spot-check should look at.

Usage:
    python3 texture_check.py path/to/books_example.json
    python3 texture_check.py path/to/post.json --format books
    python3 texture_check.py path/to/post.json --json

Scope note: Books, Facts, People, Concepts and Stories are calibrated (HUMAN_TEXTURE_STANDARD v1.7;
v1.6 added a list-coherence rule and a reader-level audit lens, neither checker-enforced).
Each has a real, dedicated extractor and a section-3 band. Any other format uses the
generic walk with the Books band as a placeholder and says so; for an uncalibrated
format the structural checks are still real and only the length numbers are
indicative until that format's gold sets them.

The numbers below come straight from the standard:
  - comma ceiling 3 per sentence, 4 only inside a genuine flat list, 5 is a rewrite
  - burstiness floor 2.0, target 3+, a short sentence (<=10w, up to ~15 if tight)
    present in every prose section of 3+ sentences; shortest >=25 is the drone
  - about 5-6 genuine inline 3+ lists per post, none adjacent
  - a prose section whose lengths mostly ascend and end on its longest sentence
    drifts upward even when the ratio passes the floor; raised as a candidate
"""

import argparse
import json
import re
import sys
from collections import Counter

# --------------------------------------------------------------------------
# calibration (per format). Only Books is real; the rest borrow it for now.
# --------------------------------------------------------------------------
BANDS = {
    "books": dict(
        burst_floor=2.0,      # ratio under this in a prose section is a flat drone
        short_word_max=10,    # a prose section of 3+ sentences should carry one this short
        short_word_tight=15,  # a tightly built section may run this as its shortest
        drone_shortest=25,    # shortest sentence this long means no real short sentence
        comma_candidate=4,    # 4 commas: candidate (genuine list, or stacking?)
        comma_rewrite=5,      # 5 commas: strong candidate, almost always a rewrite
        list_post_soft=6,     # about this many genuine inline 3+ lists per post
        parallel_monotone=0.75,  # share of one opening type that flags a parallel set
        drift_up_frac=0.75,   # share of ascending length-steps that, with an end on
                              # the longest sentence, flags a climb the ratio misses
    ),
    # Facts is calibrated (locked gold). The checker's thresholds are the universal
    # section-2 floors, identical across formats, so this mirrors the Books values
    # by design. What is genuinely Facts-specific is descriptive and lives in the
    # standard's section-3 band row (a shorter length center, ~14 vs ~18 words, and
    # a lower ceiling, ~31 vs ~37), which the audit reads, not a hard checker number.
    "facts": dict(
        burst_floor=2.0,
        short_word_max=10,
        short_word_tight=15,
        drone_shortest=25,
        comma_candidate=4,
        comma_rewrite=5,
        list_post_soft=5,
        parallel_monotone=0.75,
        drift_up_frac=0.75,
    ),
    # People is calibrated (locked gold, Lise Meitner). The checker thresholds are the
    # universal section-2 floors, identical across formats, so this mirrors Books and
    # Facts by design. The genuinely People-specific calibration is descriptive and
    # lives in the standard's section-3 band row: a longer narrative center (about 16
    # to 20 words, like Books, well above Facts), a narrative ceiling near 40 with a
    # single technical outlier to 46 in greatest_work, and very high burstiness.
    "people": dict(
        burst_floor=2.0,
        short_word_max=10,
        short_word_tight=15,
        drone_shortest=25,
        comma_candidate=4,
        comma_rewrite=5,
        list_post_soft=5,
        parallel_monotone=0.75,
        drift_up_frac=0.75,
    ),
    # Concepts is calibrated (locked gold, Regression to the Mean). Thresholds are the
    # universal section-2 floors, like the other formats. The Concepts-specific
    # calibration is descriptive and lives in the standard's section-3 band row: a
    # tighter, punchier center than People (about 15 to 18 words, many short beats),
    # a typical ceiling near 28 with a single 63-word outlier in the origin section,
    # and very high burstiness. It fits an instructional concept format.
    "concepts": dict(
        burst_floor=2.0,
        short_word_max=10,
        short_word_tight=15,
        drone_shortest=25,
        comma_candidate=4,
        comma_rewrite=5,
        list_post_soft=5,
        parallel_monotone=0.75,
        drift_up_frac=0.75,
    ),
    # Stories is calibrated (locked gold, the van Meegeren forgery). Thresholds are the
    # universal section-2 floors, like the other formats. The Stories-specific calibration
    # is descriptive and lives in the standard's section-3 band row: a narrative center
    # near People and Books (about 13 to 19 words, median 16) with many short punches, a
    # ceiling about 33, most sentences under 28, and very high burstiness (section ratios
    # 2 to 8). A longer multi-section narrative, so a slightly higher inline-list budget.
    "stories": dict(
        burst_floor=2.0,
        short_word_max=10,
        short_word_tight=15,
        drone_shortest=25,
        comma_candidate=4,
        comma_rewrite=5,
        list_post_soft=6,
        parallel_monotone=0.75,
        drift_up_frac=0.75,
    ),
    # Questions is registered with the universal section-2 floors so the checker runs
    # on it; the DESCRIPTIVE band (section-3 row) is set at lock time after measuring the
    # gold. Same floors as the other formats.
    "questions": dict(
        burst_floor=2.0,
        short_word_max=10,
        short_word_tight=15,
        drone_shortest=25,
        comma_candidate=4,
        comma_rewrite=5,
        list_post_soft=6,
        parallel_monotone=0.75,
        drift_up_frac=0.75,
    ),
}
UNCALIBRATED_NOTE = "format not calibrated yet; using Books band as a placeholder"

# all seven format names, for filename detection. Distinct from BANDS, which holds
# only the calibrated bands (Books today); an extractor may exist before a band.
KNOWN_FORMATS = ["books", "facts", "people", "concepts", "questions", "stories",
                 "academy"]

# dated blacklist, mirrors HUMAN_TEXTURE_STANDARD v1.0 section 2.7 (2026 Q2)
BLACKLIST = [
    "emphasizing", "highlighting", "showcasing", "showcase", "enhance",
    "align with", "foster", "fostering", "seamless", "comprehensive",
    "elevate", "maximize", "delve", "tapestry", "testament", "realm",
    "underscore", "underscores", "navigate the", "leverage",
]
SYMBOLISM = [
    "represents", "embodies", "reflects", "underscores", "signifies",
    "symbolizes", "stands as", "stands for", "serves as a reminder",
]
CLOSURE = [
    r",\s+which is why\b", r",\s+which is what\b", r",\s+since\b",
    r",\s+because\b", r"\bwhich is why\b",
]

# --------------------------------------------------------------------------
# text utilities
# --------------------------------------------------------------------------
def split_sentences(text):
    """Approximate sentence split. Protects decimals; treats a closing quote as
    part of the sentence. Good enough for candidate generation, not perfect."""
    t = re.sub(r"(\d)\.(\d)", r"\1<DOT>\2", text)
    # mark a boundary after . ? ! (plus an optional closing quote) when followed by
    # whitespace and a capital letter or an opening quote, then split on the marker.
    # keeps the closing quote with its own sentence and avoids variable-width
    # lookbehind (which Python's re rejects).
    t = re.sub(r"([.?!]['\"\u2019\u201d]?)\s+(?=[A-Z'\"\u2018\u201c])", r"\1<SPLIT>",
               t.strip())
    parts = t.split("<SPLIT>")
    out = []
    for p in parts:
        p = p.replace("<DOT>", ".").strip()
        if p:
            out.append(p)
    return out

def words(s):
    return len(s.split())

def clause_commas(s):
    """Count commas. (The audit decides which are genuine list commas vs stacked
    clause commas; the script only counts.)"""
    return s.count(",")

INLINE_LIST = re.compile(
    r"\b[\w'\-]+(?:\s[\w'\-]+){0,3},\s[\w'\-]+(?:\s[\w'\-]+){0,3},\s(?:and|or)\s[\w'\-]+"
)

def opening_type(s):
    """Coarse opening-shape bucket. Not a parser: it groups by the first word, so
    a genuine imperative and an unrecognised opener both land in 'other'. Good
    enough to spot a monotone set, not a grammar claim."""
    s = s.strip()
    if s.endswith("?"):
        return "question"
    toks = s.split()
    if not toks:
        return "other"
    first = re.sub(r"[^\w']", "", toks[0]).lower()
    if first in {"when", "if", "before", "faced", "once", "after", "while",
                 "given", "as", "unless"}:
        return "conditional"
    if first in {"the", "a", "an", "this", "that", "these", "those", "it",
                 "what", "how", "each", "both", "most", "every", "there",
                 "in", "across", "for", "by", "with", "from", "at", "on",
                 "then", "here", "now", "they", "we", "you", "his", "her",
                 "their", "its", "one", "two", "three", "part"}:
        return "declarative"
    return "other"

# --------------------------------------------------------------------------
# Books extractor: pull the exact reader-facing fields
# --------------------------------------------------------------------------
def extract_books(data):
    by = {s["type"]: s for s in data.get("sections", [])}
    prose = []          # (label, text) -> full burstiness/comma/closure checks
    parallel = {}       # label -> [items]  -> shape-variety check
    light = []          # (label, text) -> blacklist/symbolism only (short fields)
    exempt = []         # quote texts, never checked

    def add_prose(label, sec, key="content"):
        if sec and isinstance(sec.get(key), str) and sec[key].strip():
            prose.append((label, sec[key]))

    add_prose("why_read_it", by.get("why_read_it"))
    add_prose("heart", by.get("heart"))
    add_prose("influence", by.get("influence"))
    add_prose("world_context", by.get("world_context"))
    add_prose("critique", by.get("critique"))

    if "takeaway" in by:
        b = by["takeaway"].get("content", {}).get("body", "")
        if b.strip():
            prose.append(("takeaway.body", b))
    if "author_context" in by:
        b = by["author_context"].get("content", {}).get("body", "")
        if b.strip():
            prose.append(("author_context.body", b))

    if "structure" in by and isinstance(by["structure"].get("content"), list):
        parallel["structure items"] = [x for x in by["structure"]["content"] if x.strip()]

    if "core_ideas" in by:
        titles, ips = [], []
        for i, it in enumerate(by["core_ideas"].get("content", [])):
            if it.get("body", "").strip():
                prose.append((f"core_ideas[{i}].body", it["body"]))
            if it.get("title", "").strip():
                titles.append(it["title"])
            if isinstance(it.get("in_practice"), str) and it["in_practice"].strip():
                ips.append(it["in_practice"])
            if isinstance(it.get("quote"), str) and it["quote"].strip():
                exempt.append(it["quote"])
        if titles:
            parallel["core_ideas titles"] = titles
        if ips:
            parallel["core_ideas in_practice"] = ips

    if "voices" in by:
        for q in by["voices"].get("content", []):
            if q.get("quote", "").strip():
                exempt.append(q["quote"])

    if "quiz" in by:
        for q in by["quiz"].get("content", []):
            if q.get("explanation", "").strip():
                light.append(("quiz.explanation", q["explanation"]))

    fc = data.get("feed_card", {})
    if fc.get("one_line", "").strip():
        light.append(("feed_card.one_line", fc["one_line"]))
    for t in fc.get("teasers", []):
        if t.strip():
            light.append(("feed_card.teaser", t))

    return prose, parallel, light, exempt

def extract_facts(data):
    """Facts extractor: pull the exact reader-facing fields for the Facts schema.
    Facts is calibrated (locked gold): the checker thresholds are the universal
    section-2 floors, and the Facts-specific calibration (shorter length center,
    lower ceiling) is descriptive in standard section 3. Closes the gap where
    Facts ran on the generic Books-band walk."""
    by = {s["type"]: s for s in data.get("sections", [])}
    prose, parallel, light, exempt = [], {}, [], []

    def add_prose(label, sec, key="content"):
        if sec and isinstance(sec.get(key), str) and sec[key].strip():
            prose.append((label, sec[key]))

    # multi-sentence prose sections (surprises is the Facts key section, the reframe)
    add_prose("surprises", by.get("surprises"))
    add_prose("how_we_know", by.get("how_we_know"))
    add_prose("bigger_picture", by.get("bigger_picture"))

    if "story" in by:
        b = by["story"].get("content", {}).get("body", "")
        if b.strip():
            prose.append(("story.body", b))

    if "open_questions" in by:
        oq = by["open_questions"].get("content", {})
        if isinstance(oq, dict):
            if oq.get("body", "").strip():
                prose.append(("open_questions.body", oq["body"]))
            items = [x for x in oq.get("items", []) if isinstance(x, str) and x.strip()]
            if items:
                parallel["open_questions items"] = items
                light.extend(("open_questions.item", x) for x in items)

    if "angles" in by and isinstance(by["angles"].get("content"), list):
        titles = []
        for i, a in enumerate(by["angles"]["content"]):
            if isinstance(a, dict):
                if a.get("body", "").strip():
                    prose.append((f"angles[{i}].body", a["body"]))
                if a.get("title", "").strip():
                    titles.append(a["title"])
        if titles:
            parallel["angles titles"] = titles

    if "tangible" in by and isinstance(by["tangible"].get("content"), dict):
        items = [x for x in by["tangible"]["content"].get("items", [])
                 if isinstance(x, str) and x.strip()]
        if items:
            parallel["tangible items"] = items
            light.extend(("tangible.item", x) for x in items)

    if "misconceptions" in by and isinstance(by["misconceptions"].get("content"), list):
        myths, realities = [], []
        for m in by["misconceptions"]["content"]:
            if isinstance(m, dict):
                if m.get("myth", "").strip():
                    myths.append(m["myth"])
                    light.append(("misconceptions.myth", m["myth"]))
                if m.get("reality", "").strip():
                    realities.append(m["reality"])
                    light.append(("misconceptions.reality", m["reality"]))
        if myths:
            parallel["misconceptions myth"] = myths
        if realities:
            parallel["misconceptions reality"] = realities

    if "quiz" in by:
        for q in by["quiz"].get("content", []):
            if isinstance(q, dict):
                if q.get("explanation", "").strip():
                    light.append(("quiz.explanation", q["explanation"]))
                if q.get("question", "").strip():
                    light.append(("quiz.question", q["question"]))

    if "headline" in by and isinstance(by["headline"].get("content"), str):
        light.append(("headline", by["headline"]["content"]))
    fc = data.get("feed_card", {})
    for t in fc.get("teasers", []):
        if isinstance(t, str) and t.strip():
            light.append(("feed_card.teaser", t))

    return prose, parallel, light, exempt

def extract_people(data):
    """People extractor: pull the exact reader-facing fields for the People schema.
    People is a biographical narrative format and is NOT yet calibrated, so the band
    stays the Books placeholder until the locked People gold sets the section-3 band
    (length numbers are then indicative, the structural checks are real). The
    extractor itself is real. It pulls the People prose sections (why_they_matter,
    each defining_moments body, the optional greatest_work.body, what_drove_them and
    their_world, legacy.body, the optional critique) plus the one-sentence identity
    placement, and the parallel sets (defining_moments titles, life_arc milestone
    labels). voices quotes are exempt; at_a_glance, quiz, captions, the dek, and the
    teasers are light (blacklist and symbolism only).

    Why identity is pulled as prose, not light: it is one dense 30-60 word sentence
    by contract, exactly the place a life cram-stacks appositives into a resume line,
    which the skeleton's thesis forbids. As prose it gets the comma-density and
    over-closure checks; the burstiness checks are no-ops on a single sentence, so
    this only adds coverage, never a false flat-drone flag."""
    by = {s["type"]: s for s in data.get("sections", [])}
    prose, parallel, light, exempt = [], {}, [], []

    def add_prose(label, sec, key="content"):
        if sec and isinstance(sec.get(key), str) and sec[key].strip():
            prose.append((label, sec[key]))

    # the one-sentence placement (see docstring) and the multi-sentence sections
    add_prose("identity", by.get("identity"))
    add_prose("why_they_matter", by.get("why_they_matter"))  # candidate key section
    add_prose("what_drove_them", by.get("what_drove_them"))  # OPTIONAL
    add_prose("their_world", by.get("their_world"))          # OPTIONAL

    # dict-bodied prose sections
    if "greatest_work" in by:                                # OPTIONAL
        b = by["greatest_work"].get("content", {}).get("body", "")
        if isinstance(b, str) and b.strip():
            prose.append(("greatest_work.body", b))
    if "legacy" in by:
        b = by["legacy"].get("content", {}).get("body", "")
        if isinstance(b, str) and b.strip():
            prose.append(("legacy.body", b))

    # defining_moments: each episode body is prose; the titles are a parallel set
    if "defining_moments" in by and isinstance(by["defining_moments"].get("content"), list):
        titles = []
        for i, m in enumerate(by["defining_moments"]["content"]):
            if isinstance(m, dict):
                if isinstance(m.get("body"), str) and m["body"].strip():
                    prose.append((f"defining_moments[{i}].body", m["body"]))
                if isinstance(m.get("title"), str) and m["title"].strip():
                    titles.append(m["title"])
                cap = m.get("image_caption", "")
                if isinstance(cap, str) and cap.strip():
                    light.append((f"defining_moments[{i}].image_caption", cap))
        if titles:
            parallel["defining_moments titles"] = titles

    # life_arc: the milestone labels are a short parallel set (3-6 word fragments);
    # the SVG itself is out of scope for the prose checker
    if "life_arc" in by and isinstance(by["life_arc"].get("content"), dict):
        labels = [m.get("label", "")
                  for m in by["life_arc"]["content"].get("milestones", [])
                  if isinstance(m, dict) and isinstance(m.get("label"), str)
                  and m["label"].strip()]
        if labels:
            parallel["life_arc milestones"] = labels

    # voices quotes are exempt, never checked
    if "voices" in by:
        for q in by["voices"].get("content", []):
            if isinstance(q, dict) and isinstance(q.get("quote"), str) and q["quote"].strip():
                exempt.append(q["quote"])

    # at_a_glance: short factual metadata, blacklist and symbolism only
    if "at_a_glance" in by and isinstance(by["at_a_glance"].get("content"), dict):
        aag = by["at_a_glance"]["content"]
        for k in ("known_for", "field", "nationality", "movement_or_era"):
            v = aag.get(k, "")
            if isinstance(v, str) and v.strip():
                light.append((f"at_a_glance.{k}", v))

    # quiz: question and explanation are light
    if "quiz" in by:
        for q in by["quiz"].get("content", []):
            if isinstance(q, dict):
                if isinstance(q.get("explanation"), str) and q["explanation"].strip():
                    light.append(("quiz.explanation", q["explanation"]))
                if isinstance(q.get("question"), str) and q["question"].strip():
                    light.append(("quiz.question", q["question"]))

    # single-sentence image captions on dict-bodied sections (reader-facing prose,
    # short, so light keeps blacklist and symbolism on them)
    for sec_type in ("portrait", "greatest_work", "legacy"):
        if sec_type in by and isinstance(by[sec_type].get("content"), dict):
            cap = by[sec_type]["content"].get("image_caption", "")
            if isinstance(cap, str) and cap.strip():
                light.append((f"{sec_type}.image_caption", cap))

    # feed card dek and teasers
    fc = data.get("feed_card", {})
    if isinstance(fc.get("one_line"), str) and fc["one_line"].strip():
        light.append(("feed_card.one_line", fc["one_line"]))
    for t in fc.get("teasers", []):
        if isinstance(t, str) and t.strip():
            light.append(("feed_card.teaser", t))

    return prose, parallel, light, exempt

def extract_concepts(data):
    """Concepts extractor: pull the exact reader-facing fields for the Concepts
    schema. Concepts teaches a mental model for use; its prose sections are intuition,
    the optional formal_definition body, each how_it_works step body, each
    real_world_examples body, the how_to_apply body (the key section, second-person
    "you" voice), where_it_breaks, mental_takeaway body, and the optional origin body.
    Parallel sets: how_it_works step titles, real_world_examples titles and domains,
    the how_to_apply checklist, nearby_concepts names. No quote fields exist, so
    exempt stays empty; the formal_definition formula is KaTeX math, not prose, and is
    left out of the checks entirely. Light (blacklist and symbolism only): captions,
    the notation legend meanings, quiz question and explanation, origin key_thinkers
    roles, the nearby_concepts distinctions, the dek, and the teasers."""
    by = {s["type"]: s for s in data.get("sections", [])}
    prose, parallel, light, exempt = [], {}, [], []

    def add_prose(label, sec, key="content"):
        if sec and isinstance(sec.get(key), str) and sec[key].strip():
            prose.append((label, sec[key]))

    add_prose("intuition", by.get("intuition"))
    add_prose("where_it_breaks", by.get("where_it_breaks"))  # key-section neighbour, prose string

    # dict-bodied prose sections
    for t in ("formal_definition", "how_to_apply", "mental_takeaway", "origin"):
        if t in by and isinstance(by[t].get("content"), dict):
            b = by[t]["content"].get("body", "")
            if isinstance(b, str) and b.strip():
                prose.append((f"{t}.body", b))

    # how_it_works: each step body is prose; the step titles are a parallel set
    if "how_it_works" in by and isinstance(by["how_it_works"].get("content"), list):
        titles = []
        for i, st in enumerate(by["how_it_works"]["content"]):
            if isinstance(st, dict):
                if isinstance(st.get("body"), str) and st["body"].strip():
                    prose.append((f"how_it_works[{i}].body", st["body"]))
                if isinstance(st.get("title"), str) and st["title"].strip():
                    titles.append(st["title"])
        if titles:
            parallel["how_it_works titles"] = titles

    # real_world_examples: each body is prose; titles and domains are parallel sets
    if "real_world_examples" in by and isinstance(by["real_world_examples"].get("content"), list):
        titles, domains = [], []
        for i, ex in enumerate(by["real_world_examples"]["content"]):
            if isinstance(ex, dict):
                if isinstance(ex.get("body"), str) and ex["body"].strip():
                    prose.append((f"real_world_examples[{i}].body", ex["body"]))
                if isinstance(ex.get("title"), str) and ex["title"].strip():
                    titles.append(ex["title"])
                if isinstance(ex.get("domain"), str) and ex["domain"].strip():
                    domains.append(ex["domain"])
                cap = ex.get("image_caption", "")
                if isinstance(cap, str) and cap.strip():
                    light.append((f"real_world_examples[{i}].image_caption", cap))
        if titles:
            parallel["real_world_examples titles"] = titles
        if domains:
            parallel["real_world_examples domains"] = domains

    # how_to_apply checklist: a short parallel set of trigger prompts
    if "how_to_apply" in by and isinstance(by["how_to_apply"].get("content"), dict):
        cl = [x for x in by["how_to_apply"]["content"].get("checklist", [])
              if isinstance(x, str) and x.strip()]
        if cl:
            parallel["how_to_apply checklist"] = cl
            light.extend(("how_to_apply.checklist", x) for x in cl)

    # nearby_concepts: names are a parallel set; the distinctions are short prose (light)
    if "nearby_concepts" in by and isinstance(by["nearby_concepts"].get("content"), list):
        names = []
        for n in by["nearby_concepts"]["content"]:
            if isinstance(n, dict):
                if isinstance(n.get("concept"), str) and n["concept"].strip():
                    names.append(n["concept"])
                if isinstance(n.get("distinction"), str) and n["distinction"].strip():
                    light.append(("nearby_concepts.distinction", n["distinction"]))
        if names:
            parallel["nearby_concepts names"] = names

    # visual_explanation caption (light)
    if "visual_explanation" in by and isinstance(by["visual_explanation"].get("content"), dict):
        cap = by["visual_explanation"]["content"].get("image_caption", "")
        if isinstance(cap, str) and cap.strip():
            light.append(("visual_explanation.image_caption", cap))

    # formal_definition notation legend meanings (light); formula is math, skipped
    if "formal_definition" in by and isinstance(by["formal_definition"].get("content"), dict):
        for leg in by["formal_definition"]["content"].get("notation_legend", []):
            if isinstance(leg, dict) and isinstance(leg.get("meaning"), str) and leg["meaning"].strip():
                light.append(("formal_definition.notation_legend", leg["meaning"]))

    # origin key_thinkers (roles, one_lines) and origin image caption (light)
    if "origin" in by and isinstance(by["origin"].get("content"), dict):
        for kt in by["origin"]["content"].get("key_thinkers", []):
            if isinstance(kt, dict):
                for k in ("role", "one_line"):
                    v = kt.get(k, "")
                    if isinstance(v, str) and v.strip():
                        light.append((f"origin.key_thinkers.{k}", v))
        cap = by["origin"]["content"].get("image_caption", "")
        if isinstance(cap, str) and cap.strip():
            light.append(("origin.image_caption", cap))

    # quiz question and explanation (light)
    if "quiz" in by:
        for q in by["quiz"].get("content", []):
            if isinstance(q, dict):
                if isinstance(q.get("explanation"), str) and q["explanation"].strip():
                    light.append(("quiz.explanation", q["explanation"]))
                if isinstance(q.get("question"), str) and q["question"].strip():
                    light.append(("quiz.question", q["question"]))

    # feed card dek and teasers
    fc = data.get("feed_card", {})
    if isinstance(fc.get("one_line"), str) and fc["one_line"].strip():
        light.append(("feed_card.one_line", fc["one_line"]))
    for t in fc.get("teasers", []):
        if isinstance(t, str) and t.strip():
            light.append(("feed_card.teaser", t))

    return prose, parallel, light, exempt

def extract_stories(data):
    """Stories extractor: pull the reader-facing narrative prose for the Stories
    schema. Prose (band): cold_open, setting body, each chapter body, the_turn body
    (the narrative pivot), the_aftermath body, what_it_means (the key section, the
    meaning the story delivers), unanswered, historical_context. Parallel: chapter
    titles. Light: headline, teasers, image captions, cast one_line blurbs, quiz
    question and explanation. Exempt: sources, at_a_glance metadata, image urls and
    attributions, names, dates."""
    by = {s["type"]: s for s in data.get("sections", [])}
    prose, parallel, light, exempt = [], {}, [], []

    def add_prose(label, txt):
        if isinstance(txt, str) and txt.strip():
            prose.append((label, txt))

    for t in ("cold_open", "what_it_means", "unanswered", "historical_context"):
        if t in by and isinstance(by[t].get("content"), str):
            add_prose(t, by[t]["content"])
    for t in ("setting", "the_turn", "the_aftermath"):
        c = by.get(t, {}).get("content")
        if isinstance(c, dict):
            add_prose(t, c.get("body", ""))
            cap = c.get("image_caption")
            if isinstance(cap, str) and cap.strip():
                light.append((t + ".image_caption", cap))
    if isinstance(by.get("chapters", {}).get("content"), list):
        titles = []
        for i, ch in enumerate(by["chapters"]["content"]):
            if isinstance(ch, dict):
                add_prose("chapters[%d]" % i, ch.get("body", ""))
                if ch.get("title"):
                    titles.append(ch["title"])
                cap = ch.get("image_caption")
                if isinstance(cap, str) and cap.strip():
                    light.append(("chapters[%d].image_caption" % i, cap))
        if titles:
            parallel["chapters titles"] = titles
    fc = data.get("feed_card", {})
    if isinstance(fc.get("headline"), str) and fc["headline"].strip():
        light.append(("feed_card.headline", fc["headline"]))
    for t in fc.get("teasers", []):
        if isinstance(t, str) and t.strip():
            light.append(("feed_card.teaser", t))
    if isinstance(by.get("cast", {}).get("content"), list):
        for i, c in enumerate(by["cast"]["content"]):
            if isinstance(c, dict) and isinstance(c.get("one_line"), str) and c["one_line"].strip():
                light.append(("cast[%d].one_line" % i, c["one_line"]))
    if isinstance(by.get("quiz", {}).get("content"), list):
        for q in by["quiz"]["content"]:
            if isinstance(q, dict):
                if isinstance(q.get("question"), str):
                    light.append(("quiz.question", q["question"]))
                if isinstance(q.get("explanation"), str):
                    light.append(("quiz.explanation", q["explanation"]))
    return prose, parallel, light, exempt

def extract_questions(data):
    """Questions extractor: contested-question / debate schema. Prose (band): setup,
    why_its_hard, what_hangs_on_it, each perspective's body, strongest_argument and
    concrete_example (the steelmanned cases), where_they_clash, what_science_says body,
    your_turn intro and closing_thought (the KEY section, the question handed back to
    the reader), history_of_the_question, where_the_debate_stands. Parallel: perspective
    position names, your_turn prompts, what_science_says key_findings. Light: the_question
    anchor, one_line dek, teasers, quiz question and explanation. Exempt: at_a_glance
    metadata, sources, visual_svg, image urls, school_or_thinker attributions."""
    by = {s["type"]: s for s in data.get("sections", [])}
    prose, parallel, light, exempt = [], {}, [], []

    def add_prose(label, txt):
        if isinstance(txt, str) and txt.strip():
            prose.append((label, txt))

    for t in ("setup", "why_its_hard", "what_hangs_on_it", "where_they_clash",
              "history_of_the_question", "where_the_debate_stands"):
        if t in by and isinstance(by[t].get("content"), str):
            add_prose(t, by[t]["content"])
    if isinstance(by.get("perspectives", {}).get("content"), list):
        names = []
        for i, pos in enumerate(by["perspectives"]["content"]):
            if isinstance(pos, dict):
                add_prose("perspectives[%d].body" % i, pos.get("body", ""))
                add_prose("perspectives[%d].strongest_argument" % i, pos.get("strongest_argument", ""))
                add_prose("perspectives[%d].concrete_example" % i, pos.get("concrete_example", ""))
                if pos.get("position_name"):
                    names.append(pos["position_name"])
        if names:
            parallel["perspective names"] = names
    wss = by.get("what_science_says", {}).get("content")
    if isinstance(wss, dict):
        add_prose("what_science_says", wss.get("body", ""))
        kf = wss.get("key_findings")
        if isinstance(kf, list) and all(isinstance(x, str) for x in kf):
            parallel["what_science_says key_findings"] = kf
    yt = by.get("your_turn", {}).get("content")
    if isinstance(yt, dict):
        add_prose("your_turn.intro", yt.get("intro", ""))
        add_prose("your_turn.closing_thought", yt.get("closing_thought", ""))
        pr = yt.get("prompts")
        if isinstance(pr, list) and all(isinstance(x, str) for x in pr):
            parallel["your_turn prompts"] = pr
    fc = data.get("feed_card", {})
    for k in ("the_question", "one_line"):
        if isinstance(fc.get(k), str) and fc[k].strip():
            light.append(("feed_card.%s" % k, fc[k]))
    for t in fc.get("teasers", []):
        if isinstance(t, str) and t.strip():
            light.append(("feed_card.teaser", t))
    if isinstance(by.get("quiz", {}).get("content"), list):
        for q in by["quiz"]["content"]:
            if isinstance(q, dict):
                if isinstance(q.get("question"), str):
                    light.append(("quiz.question", q["question"]))
                if isinstance(q.get("explanation"), str):
                    light.append(("quiz.explanation", q["explanation"]))
    return prose, parallel, light, exempt

def extract_generic(data):
    """Fallback for uncalibrated formats: walk for body/content strings, exempt
    quotes. Coarser than the Books extractor."""
    prose, exempt = [], []

    def walk(node, key=None):
        if isinstance(node, str):
            if key == "quote":
                exempt.append(node)
            elif key in {"body", "content"} and len(node.split()) >= 8:
                prose.append((key, node))
        elif isinstance(node, dict):
            for k, v in node.items():
                walk(v, k)
        elif isinstance(node, list):
            for v in node:
                walk(v, key)

    walk(data)
    return prose, {}, [], exempt

# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------
def check_prose(label, text, band, cand):
    ss = split_sentences(text)
    lens = [words(s) for s in ss]
    rec = {"section": label, "sentences": len(ss),
           "min": min(lens) if lens else 0, "max": max(lens) if lens else 0}
    rec["ratio"] = round(rec["max"] / rec["min"], 1) if rec["min"] else 0.0

    if len(ss) >= 3:
        if rec["ratio"] < band["burst_floor"]:
            cand.append(("burstiness", label,
                         f"flat: ratio {rec['ratio']} (floor {band['burst_floor']}), "
                         f"lengths {sorted(lens)}"))
        if rec["min"] >= band["drone_shortest"]:
            cand.append(("burstiness", label,
                         f"no short sentence: shortest is {rec['min']} words"))
        elif rec["min"] > band["short_word_tight"]:
            cand.append(("burstiness", label,
                         f"weak short sentence: shortest is {rec['min']} words "
                         f"(aim for one <= {band['short_word_max']})"))

    for s in ss:
        c = clause_commas(s)
        if c >= band["comma_rewrite"]:
            cand.append(("comma density", label,
                         f"{c} commas (>= {band['comma_rewrite']}, usually a rewrite): {s}"))
        elif c >= band["comma_candidate"]:
            cand.append(("comma density", label,
                         f"{c} commas (genuine list or stacked clauses?): {s}"))

    for pat in CLOSURE:
        for m in re.finditer(pat, text):
            frag = text[max(0, m.start() - 20):m.end() + 25]
            cand.append(("over-closure", label, f"...{frag.strip()}..."))

    low = text.lower()
    for w in SYMBOLISM:
        if w in low:
            cand.append(("symbolism register", label, f'"{w}"'))

    return rec, ss

def check_blacklist(all_texts, cand):
    hits = Counter()
    where = {}
    for label, text in all_texts:
        low = text.lower()
        for w in BLACKLIST:
            n = low.count(w)
            if n:
                hits[w] += n
                where.setdefault(w, []).append(label)
    total = sum(hits.values())
    if total:
        detail = ", ".join(f'"{w}" x{c}' for w, c in hits.most_common())
        sev = "cluster" if total >= 2 else "single hit"
        cand.append(("blacklist (2026 Q2)", "post", f"{sev}: {detail}"))
    return total

def check_inline_lists(prose_sentences, cand):
    total = 0
    flat = []  # (label, sentence_index, sentence)
    for label, ss in prose_sentences:
        for i, s in enumerate(ss):
            if INLINE_LIST.search(s):
                total += 1
                flat.append((label, i, s))
    # adjacency: two list-bearing sentences in a row inside the same section
    for label, ss in prose_sentences:
        idxs = [i for (lab, i, s) in flat if lab == label]
        for a, b in zip(idxs, idxs[1:]):
            if b == a + 1:
                cand.append(("inline lists", label, "two inline 3+ lists in adjacent sentences"))
    # the raw post total is reported descriptively in POST TOTALS, not as a
    # candidate: the regex also catches appositive pairs, so the count is noisy.
    # only the adjacency signal (two list-bearing sentences in a row) is raised.
    return total

def check_parallel(parallel, band, cand):
    out = {}
    for label, items in parallel.items():
        types = [opening_type(it) for it in items]
        firsts = [re.sub(r"[^\w']", "", it.split()[0]).lower() for it in items if it.split()]
        tc = Counter(types)
        out[label] = dict(types=dict(tc), first_words=firsts)
        n = len(items)
        if n >= 3:
            # opening-TYPE monotony is only a real tell where the sentence shape
            # itself is the contract (in_practice). For titles and structure items
            # the opener word is a weak proxy and over-flags, so skip it there.
            if "in_practice" in label:
                top_type, top_n = tc.most_common(1)[0]
                if top_n / n >= band["parallel_monotone"]:
                    cand.append(("parallel-field sameness", label,
                                 f"{top_n}/{n} items share one opening shape; vary it"))
            # repeated opening WORD is a tell in any set
            fc = Counter(firsts)
            w, wn = fc.most_common(1)[0]
            if wn >= 3:
                cand.append(("parallel-field sameness", label,
                             f"'{w}' opens {wn} items; vary the opening word"))
            # internal-shape proxy: many items carrying an embedded 3+ list often
            # share the "opener, embedded list, and a closing clause" template.
            # Weak proxy; the deeper shared-shape tell is audit-led.
            with_list = sum(1 for it in items if INLINE_LIST.search(it))
            if with_list / n >= 0.5:
                cand.append(("parallel-field sameness", label,
                             f"{with_list}/{n} items carry an embedded 3+ list; "
                             f"check for a shared internal shape (audit-led)"))
    return out
    return out

def check_drift(prose_sentences, band, cand):
    """Catch a section the ratio passes but that still drones upward: lengths that
    mostly ascend and end on the section's longest sentence. The min-to-max ratio
    can clear the floor on such a section (a single short opener is enough), so
    this looks at the trajectory, not the spread. Conservative on purpose: it fires
    only when both signals agree, so a section that merely ends on a near-ceiling
    sentence but swings on the way (an earned long close) is left alone. Candidate,
    not a verdict."""
    for label, ss in prose_sentences:
        lens = [words(s) for s in ss]
        if len(lens) < 5:
            continue
        mn, mx = min(lens), max(lens)
        ratio = mx / mn if mn else 0.0
        if ratio < band["burst_floor"]:
            continue  # already raised by the flat-drone burstiness check
        trans = [b - a for a, b in zip(lens, lens[1:])]
        up_frac = sum(1 for t in trans if t > 0) / len(trans) if trans else 0.0
        down_steps = sum(1 for t in trans if t < 0)
        # Two ways a section climbs to its longest sentence as the close:
        #  - mostly ascending steps (the original signal), or
        #  - monotone non-decreasing, where plateaus/ties carry it to the max
        #    without a single drop. The second hid angles[2] (5,5,9,10,19,19):
        #    the ties pulled the strict-ascend fraction under the threshold even
        #    though nothing ever descends and it ends at the max.
        mostly_ascends = up_frac >= band["drift_up_frac"]
        monotone_climb = down_steps == 0
        if lens[-1] == mx and (mostly_ascends or monotone_climb):
            shape = (f"{up_frac:.0%} of steps ascend" if mostly_ascends
                     else "rises with no drop, a plateau into the longest that the "
                          "ascend fraction alone misses")
            cand.append(("rhythm drift", label,
                         f"climbs to its longest sentence ({shape}, ends on the "
                         f"{lens[-1]}-word max); the ratio passes but the shape drifts "
                         f"up. Swing, do not end on the longest sentence. lengths {lens}"))

def check_repeated_openings(prose_sentences, cand):
    for label, ss in prose_sentences:
        firsts = [re.sub(r"[^\w']", "", s.split()[0]).lower() for s in ss if s.split()]
        fc = Counter(firsts)
        for w, n in fc.items():
            if n >= 3 and w not in {"the", "it", "a", "an"}:
                cand.append(("repeated opening", label, f"'{w}' opens {n} sentences"))

# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------

QUIZ_STOP = set("the a an and or but of to in on for with that this which what when who whom whose how why does did is are was were has have had will would can could should about after before during over under between within without into than then there their they them then this that these those been being more most less least only just very also which while where whose whom each any all some many much few".split())

def check_quiz_groundedness(data, cand):
    """Universal: flag quiz questions whose distinctive terms are largely absent
    from the post body, i.e. likely testing content the post never teaches. A
    candidate for the audit, never a verdict; verbatim wording still gets a human read."""
    by = {s["type"]: s for s in data.get("sections", [])}
    if "quiz" not in by:
        return
    parts = []
    def collect(node):
        if isinstance(node, str):
            parts.append(node)
        elif isinstance(node, dict):
            for v in node.values():
                collect(v)
        elif isinstance(node, list):
            for v in node:
                collect(v)
    for sec in data.get("sections", []):
        if sec.get("type") != "quiz":
            collect(sec.get("content"))
    fc = data.get("feed_card", {})
    for k in ("headline", "one_line"):
        if isinstance(fc.get(k), str):
            parts.append(fc[k])
    for t in fc.get("teasers", []):
        if isinstance(t, str):
            parts.append(t)
    body = " ".join(parts).lower()
    for i, q in enumerate(by["quiz"].get("content", [])):
        stem = q.get("question", "")
        opts = q.get("options", [])
        ai = q.get("answer_index", 0)
        correct = opts[ai] if isinstance(opts, list) and 0 <= ai < len(opts) else ""
        terms = set(re.findall(r"[a-z]{5,}", (stem + " " + correct).lower())) - QUIZ_STOP
        if not terms:
            continue
        missing = sorted(t for t in terms if t[:5] not in body)
        if len(missing) / len(terms) >= 0.7:  # coarse: application questions may use outside words, so only a heavy absence flags
            cand.append(("quiz groundedness", f"quiz[{i}]",
                         f"{len(missing)}/{len(terms)} key terms not in the body: {', '.join(missing[:6])}"))

_SQ_SKIP_KEYS = {"image_url", "image_attribution", "lead_image_url", "url", "symbol",
                 "formula", "birth_year", "lifespan", "answer_index", "order",
                 "category", "era", "era_label", "location", "sources_reliability",
                 "post_difficulty", "visual_svg"}

def check_straight_quotes(data, cand):
    """Flag straight quotation marks in reader-facing text. Convention: curly double
    quotes for all quotation. A straight double quote should never appear; a straight
    single used to OPEN a span (preceded by a non-letter, followed by a letter) is a
    quotation mark, not a possessive apostrophe. Coarse candidate, not a verdict."""
    strings = []
    def walk(node, owner):
        if isinstance(node, str):
            strings.append((owner, node))
        elif isinstance(node, dict):
            for k, v in node.items():
                if k in _SQ_SKIP_KEYS:
                    continue
                walk(v, owner)
        elif isinstance(node, list):
            for v in node:
                walk(v, owner)
    for sec in data.get("sections", []):
        if sec.get("type") == "sources":
            continue
        walk(sec.get("content"), sec.get("type", "?"))
    fc = data.get("feed_card", {})
    if isinstance(fc.get("headline"), str):
        strings.append(("feed_card.headline", fc["headline"]))
    for t in fc.get("teasers", []):
        if isinstance(t, str):
            strings.append(("feed_card.teaser", t))
    for k in ("the_question", "one_line"):
        if isinstance(fc.get(k), str):
            strings.append(("feed_card.%s" % k, fc[k]))
    seen_d, seen_s = set(), set()
    open_single = re.compile(r"(?:^|[^0-9A-Za-z\u00c0-\u024f])'[A-Za-z]")
    for owner, txt in strings:
        if '"' in txt and owner not in seen_d:
            cand.append(("straight quote", owner,
                         "a straight double quote appears; quotation uses curly doubles"))
            seen_d.add(owner)
        if open_single.search(txt) and owner not in seen_s:
            cand.append(("straight quote", owner,
                         "a straight single quote opens a span; use curly quotation (or confirm it is a possessive)"))
            seen_s.add(owner)

def run(path, fmt=None):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if fmt is None:
        stem = path.split("/")[-1].lower()
        fmt = next((k for k in KNOWN_FORMATS if k in stem), None) or "books"
    calibrated = fmt in BANDS
    band = BANDS.get(fmt, BANDS["books"])

    if fmt == "books":
        prose, parallel, light, exempt = extract_books(data)
    elif fmt == "facts":
        prose, parallel, light, exempt = extract_facts(data)
    elif fmt == "people":
        prose, parallel, light, exempt = extract_people(data)
    elif fmt == "concepts":
        prose, parallel, light, exempt = extract_concepts(data)
    elif fmt == "stories":
        prose, parallel, light, exempt = extract_stories(data)
    elif fmt == "questions":
        prose, parallel, light, exempt = extract_questions(data)
    else:
        prose, parallel, light, exempt = extract_generic(data)

    cand = []
    recs, prose_sentences = [], []
    for label, text in prose:
        rec, ss = check_prose(label, text, band, cand)
        recs.append(rec)
        prose_sentences.append((label, ss))

    list_total = check_inline_lists(prose_sentences, cand)
    par = check_parallel(parallel, band, cand)
    check_drift(prose_sentences, band, cand)
    check_repeated_openings(prose_sentences, cand)
    bl_total = check_blacklist(prose + light, cand)
    # symbolism on light fields too
    for label, text in light:
        low = text.lower()
        for w in SYMBOLISM:
            if w in low:
                cand.append(("symbolism register", label, f'"{w}"'))

    check_quiz_groundedness(data, cand)
    check_straight_quotes(data, cand)
    return dict(format=fmt, calibrated=calibrated, band=band, recs=recs,
                parallel=par, inline_lists=list_total, blacklist=bl_total,
                exempt_quotes=len(exempt), candidates=cand)

def print_report(r):
    print("=" * 72)
    print(f"texture check  -  format: {r['format']}"
          + ("" if r["calibrated"] else f"  ({UNCALIBRATED_NOTE})"))
    print("=" * 72)

    print("\nPER-SECTION RHYTHM (stats are descriptive, not pass/fail)")
    print(f"  {'section':28} {'sents':>5} {'min':>4} {'max':>4} {'ratio':>6}")
    for rec in r["recs"]:
        print(f"  {rec['section']:28} {rec['sentences']:>5} {rec['min']:>4} "
              f"{rec['max']:>4} {rec['ratio']:>6}")

    if r["parallel"]:
        print("\nPARALLEL-FIELD SETS (opening-shape mix)")
        for label, info in r["parallel"].items():
            print(f"  {label}: {info['types']}")

    print(f"\nPOST TOTALS")
    print(f"  inline 3+ list matches : {r['inline_lists']}  (soft target ~6)")
    print(f"  blacklist hits         : {r['blacklist']}")
    print(f"  exempt quotes (skipped): {r['exempt_quotes']}")

    cand = r["candidates"]
    print(f"\nCANDIDATES  ({len(cand)})  -  spots to look at, NOT failures")
    if not cand:
        print("  none flagged")
    else:
        by_kind = {}
        for kind, label, msg in cand:
            by_kind.setdefault(kind, []).append((label, msg))
        for kind in sorted(by_kind):
            print(f"\n  [{kind}]")
            for label, msg in by_kind[kind]:
                print(f"    {label}: {msg}")

    print("\n" + "-" * 72)
    print("Candidates are for the audit and the human read, never an automatic")
    print("fail. Verbatim quotes are out of scope by design.")

def main():
    ap = argparse.ArgumentParser(description="Mechanical texture checker (candidates, not verdicts).")
    ap.add_argument("path")
    ap.add_argument("--format", default=None, help="books|facts|people|concepts|questions|stories|academy")
    ap.add_argument("--json", action="store_true", help="emit raw JSON instead of a report")
    a = ap.parse_args()
    r = run(a.path, a.format)
    if a.json:
        print(json.dumps(r, indent=2, ensure_ascii=False))
    else:
        print_report(r)
    # exit 0 always: this tool never fails a post
    sys.exit(0)

if __name__ == "__main__":
    main()
