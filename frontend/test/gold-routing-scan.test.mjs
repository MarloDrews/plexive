import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// Content guard for the locked example golds. These fields route through
// MathText, which activates two markups inside them:
//   - $...$ as inline math (a bare, unescaped "$" becomes a math delimiter), so
//     currency must stay escaped as "\$"
//   - *...* as italics, now authored intentionally, but only as well-formed
//     pairs (an unclosed "*" would render a stray marker or swallow text)
// A bare "$" or an unbalanced "*" would silently change a locked post, so these
// tests fail loudly (listing format/section/field) as a content decision.
// Academy is excluded: it already routed through MathText.
//
// THE GOLDS THEMSELVES ARE NO LONGER IN THIS REPOSITORY (moved 2026-08-29), so
// the 8 gold tests SKIP unless PLEXIVE_CONTENT_REPO points at a clone that has
// them. A skip is deliberately not silent: the count and the reason are printed
// before any test runs, the skip reason on each test names the variable, and
// "gold availability is all-or-nothing" below always runs and fails on a partial
// set. The three checker self-tests at the foot of this file never skip, so this
// file always asserts something. What CI no longer covers is the CONTENT: with
// the variable unset, nothing here reads a gold.

const here = dirname(fileURLToPath(import.meta.url))

// The gold examples left this repository on 2026-08-29 for the private content
// repository, so the directory is resolved through PLEXIVE_CONTENT_REPO -- the
// same bridge tools/run_pipeline.sh and backend/content_repo.py use. Unset, the
// path resolves inside this checkout, where the examples are no longer present.
const CONTENT_REPO = (process.env.PLEXIVE_CONTENT_REPO || "").trim()
const examplesDir = join(CONTENT_REPO || join(here, "..", ".."), "docs", "content-structure", "examples")

function loadGold(format) {
  return JSON.parse(readFileSync(join(examplesDir, `${format}_example.json`), "utf8"))
}

// Mirrors MathText's nextUnescapedDollar: a "$" not preceded by a backslash is
// a math delimiter. An escaped "\$" (currency) is skipped and is fine.
function hasBareDollar(s) {
  for (let j = 0; j < s.length; j++) {
    if (s[j] === "\\") {
      j++
      continue
    }
    if (s[j] === "$") return true
  }
  return false
}

// Authored italics (*...*) are allowed in these fields, but only as well-formed
// pairs. Mirrors MathText: italics parse ONLY in the text segments outside $...$
// math, so every "*" must close within one text segment. An odd count in any
// text segment is an unclosed pair (or one straddling a math span), which would
// render a stray "*" or pull text into an <em>. Asterisks inside $...$ (e.g.
// multiplication) are ignored; an escaped "\$" toggles nothing, exactly as
// MathText's scanner treats it.
function hasUnbalancedAsterisk(s) {
  let inMath = false
  let count = 0 // asterisks seen in the current text segment
  for (let j = 0; j < s.length; j++) {
    if (s[j] === "\\") {
      j++ // skip the escaped char (\$ currency, etc.)
      continue
    }
    if (s[j] === "$") {
      if (!inMath) {
        if (count % 2 !== 0) return true // text segment closed on an odd count
        count = 0 // entering math; the next text segment starts fresh on exit
      }
      inMath = !inMath
      continue
    }
    if (!inMath && s[j] === "*") count++
  }
  return count % 2 !== 0 // trailing text segment (unclosed math reads as text)
}

// For each format, map a routed section type to the routed string field(s)
// inside its content, returned as [label, value] pairs. Only these exact fields
// are scanned (the same set that Part 2 routes through MathText).
const ROUTED = {
  books: {
    why_read_it: (c) => [["why_read_it", c]],
    heart: (c) => [["heart", c]],
    takeaway: (c) => [["takeaway.body", c.body]],
    influence: (c) => [["influence", c]],
  },
  people: {
    why_they_matter: (c) => [["why_they_matter", c]],
    greatest_work: (c) => [["greatest_work.body", c.body]],
    what_drove_them: (c) => [["what_drove_them", c]],
    legacy: (c) => [["legacy.body", c.body]],
  },
  concepts: {
    origin: (c) => [["origin.body", c.body]],
    nearby_concepts: (c) => c.map((it, i) => [`nearby_concepts[${i}].distinction`, it.distinction]),
  },
  questions: {
    where_they_clash: (c) => [["where_they_clash", c]],
    where_the_debate_stands: (c) => [["where_the_debate_stands", c]],
    history_of_the_question: (c) => [["history_of_the_question", c]],
    perspectives: (c) =>
      c.flatMap((p, i) => [
        [`perspectives[${i}].body`, p.body],
        [`perspectives[${i}].strongest_argument`, p.strongest_argument],
      ]),
  },
}

// Walk the routed fields of one gold and return [label, value] pairs.
function routedFields(format) {
  const gold = loadGold(format)
  const map = ROUTED[format]
  const out = []
  for (const section of gold.sections || []) {
    const extract = map[section.type]
    if (!extract) continue
    for (const [label, value] of extract(section.content)) {
      out.push([label, value])
    }
  }
  return out
}

const FORMATS = Object.keys(ROUTED)

// How many of the four routed golds are actually on disk. This is a COUNT, not a
// boolean, because the two states that matter are "all four" and "none": a
// partial set means the content repository is half there, which would silently
// shrink the scan rather than skip it, and that is the failure this file must
// not be able to report as a pass.
const goldsPresent = FORMATS.filter((f) => existsSync(join(examplesDir, `${f}_example.json`)))
const GOLD_TESTS_PER_FORMAT = 2
const skippedGoldTests = goldsPresent.length === FORMATS.length ? 0 : FORMATS.length * GOLD_TESTS_PER_FORMAT

const skipReason =
  `${skippedGoldTests} gold tests SKIPPED: PLEXIVE_CONTENT_REPO ` +
  (CONTENT_REPO ? `is set to '${CONTENT_REPO}', which does not hold all four routed examples` : "is unset") +
  `, so ${examplesDir} holds ${goldsPresent.length} of ${FORMATS.length} routed golds. ` +
  "Set PLEXIVE_CONTENT_REPO to the root of a plexive-content clone to run them."

// Printed unconditionally, before any test runs, so a skipped run cannot be
// mistaken for a passing one by anyone reading the log rather than the counts.
if (skippedGoldTests > 0) {
  console.log(`[gold-routing-scan] ${skipReason}`)
} else {
  console.log(
    `[gold-routing-scan] ${FORMATS.length} of ${FORMATS.length} routed golds found in ${examplesDir}; ` +
      `0 gold tests skipped, ${FORMATS.length * GOLD_TESTS_PER_FORMAT} running.`,
  )
}

// Always runs, in both states, and can fail in both. It is what stops a skip
// from being silent: a half-present content repository is neither a clean run
// nor a clean skip, and is reported as a failure rather than as fewer tests.
test("gold availability is all-or-nothing", () => {
  assert.ok(
    goldsPresent.length === FORMATS.length || goldsPresent.length === 0,
    `${goldsPresent.length} of ${FORMATS.length} routed golds found in ${examplesDir} ` +
      `(${goldsPresent.join(", ")}). Expected all ${FORMATS.length} or none; a partial set would ` +
      "silently scan fewer golds. Check PLEXIVE_CONTENT_REPO.",
  )
})

for (const format of FORMATS) {
  test(`${format} gold: no bare unescaped $ in routed fields`, { skip: skippedGoldTests > 0 ? skipReason : false }, () => {
    const offenders = routedFields(format)
      .filter(([, value]) => typeof value === "string" && hasBareDollar(value))
      .map(([label]) => `${format}/${label}`)
    assert.deepEqual(
      offenders,
      [],
      `bare "$" in routed fields (escape as \\$): ${offenders.join(", ")}`,
    )
  })

  test(`${format} gold: only well-formed * pairs in routed fields`, { skip: skippedGoldTests > 0 ? skipReason : false }, () => {
    const offenders = routedFields(format)
      .filter(([, value]) => typeof value === "string" && hasUnbalancedAsterisk(value))
      .map(([label]) => `${format}/${label}`)
    assert.deepEqual(
      offenders,
      [],
      `unbalanced "*" (unclosed italic pair) in routed fields: ${offenders.join(", ")}`,
    )
  })
}

// Pin the asterisk-pair checker itself, so the new "well-formed pairs only"
// behaviour does not silently regress to the old "no asterisk at all" rule.
test("a well-formed *pair* is balanced", () => {
  assert.equal(hasUnbalancedAsterisk("see *predictive coding* now"), false)
})

test("an unclosed * pair is caught", () => {
  assert.equal(hasUnbalancedAsterisk("see *predictive coding now"), true)
})

test("asterisks inside $...$ math are ignored", () => {
  // "a * b" is multiplication inside math, not an italic marker; the real pair
  // outside the math span is well-formed, so the whole string passes.
  assert.equal(hasUnbalancedAsterisk("the rate $a * b$ holds, see *the point*"), false)
})
