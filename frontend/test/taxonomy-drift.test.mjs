import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { CATEGORIES } from "../src/lib/interests.ts"
import { FIELD_GLYPHS } from "../src/lib/glyphs.ts"

// Drift guard for the taxonomy vocabulary, which exists in THREE independent
// copies with nothing keeping them in sync:
//
//   1. backend/seed.py SLUGS            -- canonical; creates the Interest rows
//   2. frontend/src/lib/interests.ts    -- CATEGORIES, the display grouping
//   3. frontend/src/lib/glyphs.ts       -- FIELD_GLYPHS, one SVG per slug
//
// Renaming or removing a slug means editing all three (plus the tags in every
// post JSON, which backend/seed.py's preflight_tags() now covers). Missing one
// of the three failed SILENTLY in every case. A slug absent from CATEGORIES
// drops out of the create wizard entirely, because create/page.tsx builds its
// sections from CATEGORIES alone and has no fallback for an uncategorised slug
// (onboarding does have one, an "Other" bucket at InterestPicker.tsx:95-96, so
// the two pages disagreed about the same slug). A slug absent from FIELD_GLYPHS
// renders NO GLYPH AT ALL: FieldGlyph.tsx does `if (!svg) return null`, with no
// error, no warning and, until this file, no test. That null is also the
// module's lazy-loading state, so on screen "this slug has no glyph" and "the
// 88 KB glyph chunk has not landed yet" are indistinguishable -- which is why
// the glyph half is asserted here rather than left to be noticed. Measured
// 2026-08-29 before this file existed: SLUGS 149, FIELD_GLYPHS 149,
// CATEGORIES 148, the one difference being `creativity`.
//
// The assertions are of two deliberately different kinds:
//   - a PARSE FLOOR on each source, well below the 149 observed. It is a
//     collapse detector: it proves the reader actually read something, so a
//     regex that matches nothing cannot pass green having compared two empty
//     sets. See the ## Rules entry in CLAUDE.md.
//   - SET EQUALITY between the sources, which is the drift check proper.
//     Equality rather than a hardcoded 149 on purpose: a slug legitimately
//     removed from all three files must still pass. A check that reds on
//     correct work teaches people to ignore red, which is the inverse defect
//     the same rules entry keeps distinct from the other eighteen.

const here = dirname(fileURLToPath(import.meta.url))

// backend/seed.py is Python, so it is read as text -- it cannot be imported the
// way the two TypeScript modules above are. Resolved from import.meta.url, not
// from cwd, because frontend-checks.yml runs with working-directory: frontend.
const SEED_PY = join(here, "..", "..", "backend", "seed.py")

// Well under the 149 observed. Not a deletion detector: see the header.
const MIN_SLUGS = 100

function parseSeedSlugs() {
  const src = readFileSync(SEED_PY, "utf8")
  const open = src.indexOf("SLUGS = [")
  assert.notEqual(open, -1, `no "SLUGS = [" in ${SEED_PY}; the list was renamed or moved`)
  const close = src.indexOf("]", open)
  assert.notEqual(close, -1, `unterminated SLUGS list in ${SEED_PY}`)
  return src.slice(open, close).match(/"([a-z0-9-]+)"/g).map((q) => q.slice(1, -1))
}

// The same text parse, for the flat AXIS2_SLUGS list beside SLUGS.
function parseSeedList(opener) {
  const src = readFileSync(SEED_PY, "utf8")
  const open = src.indexOf(opener)
  assert.notEqual(open, -1, `no "${opener}" in ${SEED_PY}; the list was renamed or moved`)
  const close = src.indexOf("]", open)
  assert.notEqual(close, -1, `unterminated ${opener} in ${SEED_PY}`)
  const found = src.slice(open + opener.length, close).match(/"([a-z0-9-]+)"/g)
  return found ? found.map((q) => q.slice(1, -1)) : []
}

// FORMAT_INTEREST_SLUGS is a dict of format -> list, so only the text INSIDE the
// bracketed lists is slugs. Its keys are format names ("books", "facts", ...),
// which are deliberately not in SLUGS -- a whole-block regex would report all
// seven as strays, which is a checker reporting its own parse as a defect.
function parseFallbackSlugs() {
  const src = readFileSync(SEED_PY, "utf8")
  const opener = "FORMAT_INTEREST_SLUGS = {"
  const open = src.indexOf(opener)
  assert.notEqual(open, -1, `no "${opener}" in ${SEED_PY}; the map was renamed or moved`)
  const close = src.indexOf("\n}", open)
  assert.notEqual(close, -1, `unterminated ${opener} in ${SEED_PY}`)
  const lists = src.slice(open + opener.length, close).match(/\[[^\]]*\]/g) || []
  return lists.flatMap((list) => (list.match(/"([a-z0-9-]+)"/g) || []).map((q) => q.slice(1, -1)))
}

const seedSlugs = parseSeedSlugs()
const categorySlugs = CATEGORIES.flatMap((c) => c.slugs)

// Axis 2 is the kind of post, as opposed to axis 1, the subject. seed.py is
// canonical for the marking; interests.ts carries the same marking as `axis: 2`
// on one group so the picker can present it. Two copies again, so the same
// treatment as the vocabulary itself.
const seedAxis2 = parseSeedList("AXIS2_SLUGS = [")
const categoryAxis2 = CATEGORIES.filter((cat) => cat.axis === 2).flatMap((cat) => cat.slugs)

// The FOURTH copy of the vocabulary, and until now the only one nothing guarded.
// FORMAT_INTEREST_SLUGS names the fallback interests used when a post has no tag
// that maps to one. A slug renamed in SLUGS and left stale here fails NOTHING:
// _resolve_interests prints "Warning: interest slug '...' not found, skipping"
// (seed.py:235) and the run still exits 0 with the format quietly short an
// interest. The 2026-08-29 rename of critical-thinking -> reasoning-traps had to
// touch it twice, for concepts and for questions, and that is what put this here.
// Names only, one direction: a slug in SLUGS is not obliged to be a fallback.
const fallbackSlugs = parseFallbackSlugs()

// Well under the 6 axis-2 slugs and the 24 fallback entries observed 2026-08-29.
// Collapse detectors, like MIN_SLUGS: they prove the two parses read something,
// so a set comparison cannot pass green having compared two empty sets. NOT
// deletion detectors -- dropping an axis-2 slug from all three copies, or a
// format from the fallback map, is correct work and must not red.
const MIN_AXIS2 = 3
const MIN_FALLBACKS = 10

// Printed unconditionally, the way gold-routing-scan.test.mjs prints its count:
// a reader of a green log can see the check had something to work with.
const glyphSlugs = Object.keys(FIELD_GLYPHS)

console.log(
  `taxonomy: SLUGS ${seedSlugs.length}, ` +
    `CATEGORIES ${categorySlugs.length} in ${CATEGORIES.length} groups, ` +
    `FIELD_GLYPHS ${glyphSlugs.length}, ` +
    `AXIS2_SLUGS ${seedAxis2.length} vs axis-2 groups ${categoryAxis2.length}, ` +
    `FORMAT_INTEREST_SLUGS ${fallbackSlugs.length}`,
)

const seedSet = new Set(seedSlugs)

test("the three slug sources parsed something (floor, not a deletion detector)", () => {
  assert.ok(
    seedSlugs.length >= MIN_SLUGS,
    `parsed only ${seedSlugs.length} slugs from ${SEED_PY}, below the floor of ` +
      `${MIN_SLUGS}. The regex matched almost nothing, so every comparison below ` +
      `would be between near-empty sets and would pass having proved nothing.`,
  )
  assert.ok(
    categorySlugs.length >= MIN_SLUGS,
    `CATEGORIES holds only ${categorySlugs.length} slugs, below the floor of ${MIN_SLUGS}.`,
  )
  assert.ok(
    glyphSlugs.length >= MIN_SLUGS,
    `FIELD_GLYPHS holds only ${glyphSlugs.length} keys, below the floor of ${MIN_SLUGS}.`,
  )
})

test("SLUGS has no duplicates", () => {
  assert.equal(
    seedSet.size,
    seedSlugs.length,
    `SLUGS holds ${seedSlugs.length} entries but only ${seedSet.size} distinct slugs.`,
  )
})

test("CATEGORIES lists each slug exactly once", () => {
  const seen = new Set()
  const duplicated = categorySlugs.filter((s) => (seen.has(s) ? true : (seen.add(s), false)))
  assert.deepEqual(
    duplicated,
    [],
    `these slugs appear in more than one category, so a pill renders twice: ${duplicated.join(", ")}`,
  )
})

test("every canonical slug is in a display group", () => {
  const categorised = new Set(categorySlugs)
  const uncategorised = seedSlugs.filter((s) => !categorised.has(s))
  assert.deepEqual(
    uncategorised,
    [],
    `these slugs are in backend/seed.py SLUGS but in no group in ` +
      `frontend/src/lib/interests.ts, so they cannot be picked in the create ` +
      `wizard at all (create/page.tsx has no fallback for an uncategorised ` +
      `slug): ${uncategorised.join(", ")}`,
  )
})

test("every grouped slug is in the canonical vocabulary", () => {
  const strays = [...new Set(categorySlugs)].filter((s) => !seedSet.has(s))
  assert.deepEqual(
    strays,
    [],
    `these slugs are grouped in frontend/src/lib/interests.ts but are not in ` +
      `backend/seed.py SLUGS, so no Interest row is ever created for them and ` +
      `the pill silently never renders: ${strays.join(", ")}`,
  )
})

test("every canonical slug has a glyph", () => {
  const withGlyph = new Set(glyphSlugs)
  const missing = seedSlugs.filter((s) => !withGlyph.has(s))
  assert.deepEqual(
    missing,
    [],
    `these slugs are in backend/seed.py SLUGS but have no entry in ` +
      `frontend/src/lib/glyphs.ts, so a post whose tags[0] is one of them ` +
      `renders no glyph at all on the card and the detail header -- silently, ` +
      `because FieldGlyph.tsx returns null: ${missing.join(", ")}`,
  )
})

test("every glyph key is in the canonical vocabulary", () => {
  const strays = glyphSlugs.filter((s) => !seedSet.has(s))
  assert.deepEqual(
    strays,
    [],
    `these keys are in frontend/src/lib/glyphs.ts but are not in ` +
      `backend/seed.py SLUGS, so they are dead weight in a chunk that ships ` +
      `to every reader: ${strays.join(", ")}`,
  )
})

test("the axis-2 and fallback parses read something (floor, not a deletion detector)", () => {
  assert.ok(
    seedAxis2.length >= MIN_AXIS2,
    `parsed only ${seedAxis2.length} slugs from AXIS2_SLUGS in ${SEED_PY}, below the ` +
      `floor of ${MIN_AXIS2}. The comparisons below would be between near-empty sets.`,
  )
  assert.ok(
    fallbackSlugs.length >= MIN_FALLBACKS,
    `parsed only ${fallbackSlugs.length} slugs from FORMAT_INTEREST_SLUGS in ${SEED_PY}, ` +
      `below the floor of ${MIN_FALLBACKS}.`,
  )
})

test("every axis-2 slug is in the canonical vocabulary", () => {
  const strays = seedAxis2.filter((s) => !seedSet.has(s))
  assert.deepEqual(
    strays,
    [],
    `these slugs are in AXIS2_SLUGS but not in SLUGS, so preflight_tags would ` +
      `refuse a post carrying them while the axis marking claims they are real: ` +
      `${strays.join(", ")}`,
  )
})

test("the axis-2 marking and the axis-2 display group name the same slugs", () => {
  const grouped = new Set(categoryAxis2)
  const marked = new Set(seedAxis2)
  const notGrouped = seedAxis2.filter((s) => !grouped.has(s))
  const notMarked = categoryAxis2.filter((s) => !marked.has(s))
  assert.deepEqual(
    notGrouped,
    [],
    `these slugs are axis 2 in backend/seed.py AXIS2_SLUGS but sit in a group ` +
      `without axis: 2 in frontend/src/lib/interests.ts, so the reader meets them ` +
      `among subjects while the backend refuses them at tags[0] -- the split is ` +
      `real in code and invisible on screen: ${notGrouped.join(", ")}`,
  )
  assert.deepEqual(
    notMarked,
    [],
    `these slugs are in a group marked axis: 2 in frontend/src/lib/interests.ts ` +
      `but are not in backend/seed.py AXIS2_SLUGS, so the picker offers them as a ` +
      `kind of post while nothing stops one becoming a post's primary category: ` +
      `${notMarked.join(", ")}`,
  )
})

test("every format fallback slug is in the canonical vocabulary", () => {
  const strays = [...new Set(fallbackSlugs)].filter((s) => !seedSet.has(s))
  assert.deepEqual(
    strays,
    [],
    `these slugs are named in FORMAT_INTEREST_SLUGS in backend/seed.py but are not ` +
      `in SLUGS, so _resolve_interests prints a warning and SKIPS them (seed.py:235) ` +
      `and a post with no mapping tag lands short an interest -- silently, with the ` +
      `run still exiting 0. This is the copy of the vocabulary that no set-equality ` +
      `check above covers: ${strays.join(", ")}`,
  )
})
