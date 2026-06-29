import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// Content guard for the locked example golds. Routing these fields through
// MathText newly activates two markups inside them that did not run before:
//   - $...$ as inline math (a bare, unescaped "$" becomes a math delimiter)
//   - *...* as italics (a literal "*" becomes an <em>)
// Both golds were authored before either markup was live in these fields, so a
// stray "$" or "*" would silently change a locked post. These tests fail loudly
// (listing format/section/field) so it surfaces as a content decision.
// Academy is excluded: it already routed through MathText, so its gold already
// accounts for both markups.

const here = dirname(fileURLToPath(import.meta.url))
const examplesDir = join(here, "..", "..", "docs", "content-structure", "examples")

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

// The italic marker has no escape form, so any "*" would now render italic.
function hasLiteralAsterisk(s) {
  return s.includes("*")
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

for (const format of FORMATS) {
  test(`${format} gold: no bare unescaped $ in routed fields`, () => {
    const offenders = routedFields(format)
      .filter(([, value]) => typeof value === "string" && hasBareDollar(value))
      .map(([label]) => `${format}/${label}`)
    assert.deepEqual(
      offenders,
      [],
      `bare "$" in routed fields (escape as \\$): ${offenders.join(", ")}`,
    )
  })

  test(`${format} gold: no literal * in routed fields`, () => {
    const offenders = routedFields(format)
      .filter(([, value]) => typeof value === "string" && hasLiteralAsterisk(value))
      .map(([label]) => `${format}/${label}`)
    assert.deepEqual(offenders, [], `literal "*" in routed fields: ${offenders.join(", ")}`)
  })
}
