// Taxonomy spans: the measurement that decides whether a slug is a KIND of post
// or a SUBJECT, re-runnable rather than re-derived by hand.
//
// It reports COUNTS, NEVER VERDICTS. Which axis a slug belongs on is judgement
// and stays judgement; this only supplies the two numbers that judgement was
// made against, so the next person makes it against the corpus as it is rather
// than against the corpus as it was in August 2026.
//
// THE TWO NUMBERS, per slug:
//
//   posts    how many posts carry the slug anywhere in tags
//   groups   how many of the display groups in interests.ts the primary
//            categories (tags[0]) of those posts fall into
//
// `groups` is the one that matters and the one nobody would think to collect.
// A slug that is never tags[0] looks like a descriptor either way, and only the
// span separates the two reasons it can happen:
//
//   critical-thinking   6 uses, 0 primary, 3 groups  -> a real kind of post
//   nature-phenomena    5 uses, 0 primary, 1 group   -> not a kind at all; it
//                                                       loses tags[0] to animals,
//                                                       biology, ecology, geology
//                                                       INSIDE Science & Nature
//
// Measured 2026-08-29, that single column is what promoted critical-thinking
// (now reasoning-traps) to axis 2 and what kept nature-phenomena off it. So the
// second table below -- every axis-1 slug that is never a primary -- is not an
// appendix. It is the candidate list. When a new format arrives, that is where the next
// axis-2 slug will show up, and where a current one may stop earning its place.
//
// WHY IT IS FORMAT-AGNOSTIC. Every number in TAXONOMY_AXIS2_DESIGN.md came from
// 61 posts of ONE format: 54 facts plus 7 example posts, because facts is the
// only format generated so far. The design says so and says it is the weakest
// thing about it. This script globs generated/<format>/*.json rather than
// generated/facts/*.json and prints a per-format breakdown, so the day a Books
// or People batch lands, re-running it shows what changed without anyone editing
// this file.
//
// Run:  npm run taxonomy:spans          (needs PLEXIVE_CONTENT_REPO)

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, basename } from "node:path"
import { CATEGORIES } from "../src/lib/interests.ts"

const here = dirname(fileURLToPath(import.meta.url))
const SEED_PY = join(here, "..", "..", "backend", "seed.py")

// The same bridge backend/content_repo.py and test/gold-routing-scan.test.mjs
// use. The posts are in the private content repository; this one is public.
const CONTENT_REPO = (process.env.PLEXIVE_CONTENT_REPO || "").trim()
const CONTENT_ROOT = CONTENT_REPO || join(here, "..", "..")
const EXAMPLES = join(CONTENT_ROOT, "docs", "content-structure", "examples")
const GENERATED = join(CONTENT_ROOT, "docs", "content-structure", "generated")

// FLOORS. Collapse detectors in the sense the ## Rules entry in CLAUDE.md sets
// out, and the sense taxonomy-drift.test.mjs already uses: they prove each
// reader read something, so this cannot print a tidy table of zeroes and look
// like a clean result. Every one sits well under what was observed on
// 2026-08-29 (153 slugs, 6 axis-2, 61 posts, 237 tag references), because
// ordinary content and vocabulary work moves the real numbers and a check that
// reds on correct work teaches people to ignore it.
const MIN_SLUGS = 100
const MIN_AXIS2 = 3
const MIN_POSTS = 20
const MIN_TAG_REFERENCES = 50

const problems = []
function fail(what, detail) {
  problems.push(`${what}\n    ${detail}`)
}

// --- the vocabulary, read as text, exactly as the drift test reads it --------

function parseSeedList(opener) {
  if (!existsSync(SEED_PY)) return null
  const src = readFileSync(SEED_PY, "utf8")
  const open = src.indexOf(opener)
  if (open === -1) return null
  const close = src.indexOf("]", open)
  if (close === -1) return null
  const found = src.slice(open + opener.length, close).match(/"([a-z0-9-]+)"/g)
  return found ? found.map((q) => q.slice(1, -1)) : []
}

const slugs = parseSeedList("SLUGS = [")
const axis2 = parseSeedList("AXIS2_SLUGS = [")

if (slugs === null) {
  fail(`could not parse SLUGS from ${SEED_PY}`, "the list was renamed, moved, or is not a literal.")
} else if (slugs.length < MIN_SLUGS) {
  fail(
    `parsed only ${slugs.length} slugs from SLUGS, below the floor of ${MIN_SLUGS}`,
    "Every count below would be measured against a near-empty vocabulary.",
  )
}
if (axis2 === null) {
  fail(`could not parse AXIS2_SLUGS from ${SEED_PY}`, "the axis marking was renamed or moved.")
} else if (axis2.length < MIN_AXIS2) {
  fail(
    `parsed only ${axis2.length} axis-2 slugs, below the floor of ${MIN_AXIS2}`,
    "The axis-2 table below would be empty and would prove nothing.",
  )
}

const slugSet = new Set(slugs || [])
const axis2Set = new Set(axis2 || [])

// --- the display groups, imported rather than parsed a second time ----------

const groupOf = new Map()
for (const category of CATEGORIES) {
  for (const slug of category.slugs) groupOf.set(slug, category.label)
}

// --- the posts, every format, discovered rather than named ------------------

function readPosts() {
  const out = []
  if (existsSync(EXAMPLES)) {
    for (const f of readdirSync(EXAMPLES).sort()) {
      if (f.endsWith("_example.json")) out.push(["examples", join(EXAMPLES, f)])
    }
  }
  if (existsSync(GENERATED)) {
    // Every format directory, not a hardcoded "facts". Names starting with "_"
    // are batch notes and running tallies, the same exclusion find_posts() makes
    // in the content repository's suggest_thumbnails.py.
    for (const format of readdirSync(GENERATED).sort()) {
      if (format.startsWith("_")) continue
      const dir = join(GENERATED, format)
      if (!statSync(dir).isDirectory()) continue
      for (const f of readdirSync(dir).sort()) {
        if (f.endsWith(".json") && !f.startsWith("_")) out.push([format, join(dir, f)])
      }
    }
  }
  return out
}

const files = readPosts()
const posts = []
for (const [format, path] of files) {
  let data
  try {
    data = JSON.parse(readFileSync(path, "utf8"))
  } catch (err) {
    fail(`${basename(path)} is not readable JSON`, String(err.message || err))
    continue
  }
  const tags = Array.isArray(data.tags) ? data.tags : []
  if (!Array.isArray(data.tags)) {
    fail(`${basename(path)} has no tags array`, `tags is ${JSON.stringify(data.tags)}`)
  }
  posts.push({ name: basename(path).replace(/\.json$/, ""), format, tags, primary: tags[0] })
}

const references = posts.reduce((n, p) => n + p.tags.length, 0)

if (posts.length < MIN_POSTS) {
  fail(
    `found only ${posts.length} posts, below the floor of ${MIN_POSTS}`,
    CONTENT_REPO
      ? `PLEXIVE_CONTENT_REPO is set to '${CONTENT_REPO}', but the posts are not there. It must name the ROOT of a plexive-content clone.`
      : "PLEXIVE_CONTENT_REPO is unset, so this looked inside the public checkout, where the posts have not lived since 2026-08-29.",
  )
}
if (references < MIN_TAG_REFERENCES) {
  fail(
    `found only ${references} tag references across ${posts.length} posts, below the floor of ${MIN_TAG_REFERENCES}`,
    "This measured nothing, so its output is not a result. Either the posts no longer carry a 'tags' key under that name, or the wrong tree was resolved.",
  )
}

// A tag outside the vocabulary makes every span below wrong rather than merely
// incomplete: it has no display group, so it silently drops out of the counts.
const strayTags = new Map()
for (const post of posts) {
  for (const tag of post.tags) {
    if (!slugSet.has(tag)) {
      if (!strayTags.has(tag)) strayTags.set(tag, [])
      strayTags.get(tag).push(post.name)
    }
  }
}
if (strayTags.size) {
  fail(
    `${strayTags.size} tag(s) on posts are not in SLUGS`,
    [...strayTags]
      .map(([tag, where]) => `${tag} -- on ${where.slice(0, 4).join(", ")}${where.length > 4 ? `, +${where.length - 4} more` : ""}`)
      .join("\n    "),
  )
}
const ungrouped = [...slugSet].filter((s) => !groupOf.has(s))
if (ungrouped.length) {
  fail(
    `${ungrouped.length} canonical slug(s) are in no display group`,
    `their posts cannot be counted into a span: ${ungrouped.join(", ")}`,
  )
}

if (problems.length) {
  console.error("FATAL: this measurement cannot be trusted.\n")
  for (const p of problems) console.error(`  - ${p}\n`)
  console.error(
    "Nothing above is a result. A span table built on a partial read looks exactly\n" +
      "like a span table built on a complete one, which is why this stops instead of\n" +
      "printing what it has.",
  )
  process.exit(1)
}

// --- measurement -------------------------------------------------------------

function measure(slug) {
  const carrying = posts.filter((p) => p.tags.includes(slug))
  const primary = carrying.filter((p) => p.primary === slug).length
  const groups = new Set(carrying.map((p) => groupOf.get(p.primary)).filter(Boolean))
  return { slug, posts: carrying.length, primary, groups, names: carrying.map((p) => p.name) }
}

const byFormat = new Map()
for (const p of posts) byFormat.set(p.format, (byFormat.get(p.format) || 0) + 1)

console.log("taxonomy spans")
console.log("==============")
console.log(
  `vocabulary ${slugs.length} slugs (${axis2.length} marked axis 2) | ` +
    `${posts.length} posts, ${references} tag references | ` +
    `${CATEGORIES.length} display groups`,
)
console.log(
  `formats: ${[...byFormat].map(([f, n]) => `${f} ${n}`).join(", ")}` +
    (byFormat.size <= 2
      ? "   <- ONE generated format. Every span below is a measurement of what that\n" +
        "                           one format produces, not of the app's content."
      : ""),
)
console.log()

function table(title, rows, note) {
  console.log(title)
  if (note) console.log(note)
  console.log("  " + "slug".padEnd(24) + "posts".padStart(6) + "primary".padStart(9) + "groups".padStart(8) + "  display groups of tags[0]")
  for (const r of rows) {
    console.log(
      "  " +
        r.slug.padEnd(24) +
        String(r.posts).padStart(6) +
        String(r.primary).padStart(9) +
        String(r.groups.size).padStart(8) +
        "  " +
        ([...r.groups].sort().join("; ") || "-"),
    )
  }
  console.log()
}

const axis2Rows = (axis2 || []).map(measure).sort((a, b) => b.posts - a.posts || a.slug.localeCompare(b.slug))
table(
  "AXIS 2 -- the kind-of-post vocabulary, as marked in AXIS2_SLUGS",
  axis2Rows,
  "  A slug here spanning ONE group is behaving like a subject, not a kind.",
)

// The candidate list: axis-1 slugs that never win tags[0]. This is where the
// next axis-2 slug comes from, and it is the comparison that separated a real
// kind from a slug merely losing to more specific siblings.
const neverPrimary = (slugs || [])
  .filter((s) => !axis2Set.has(s))
  .map(measure)
  .filter((r) => r.posts > 0 && r.primary === 0)
  .sort((a, b) => b.groups.size - a.groups.size || b.posts - a.posts || a.slug.localeCompare(b.slug))
table(
  "AXIS 1 -- slugs that are used but NEVER tags[0]",
  neverPrimary,
  "  Sorted by span. High span with several posts is the shape a kind-of-post slug\n" +
    "  has; one group means it is losing tags[0] to a more specific sibling inside\n" +
    "  its own subject, which is a subject slug and not a candidate.",
)

const unusedAxis2 = axis2Rows.filter((r) => r.posts === 0).map((r) => r.slug)
const oneGroupAxis2 = axis2Rows.filter((r) => r.posts > 0 && r.groups.size === 1).map((r) => r.slug)
const coverage = posts.filter((p) => p.tags.some((t) => axis2Set.has(t))).length

console.log("zeros and edges, reported explicitly")
console.log(`  posts carrying at least one axis-2 slug   ${coverage} of ${posts.length}`)
console.log(`  posts carrying none                       ${posts.length - coverage}`)
console.log(`  axis-2 slugs with zero posts              ${unusedAxis2.length}${unusedAxis2.length ? ": " + unusedAxis2.join(", ") : ""}`)
console.log(`  axis-2 slugs spanning one group           ${oneGroupAxis2.length}${oneGroupAxis2.length ? ": " + oneGroupAxis2.join(", ") : ""}`)
console.log(`  axis-2 slugs ever at tags[0]              ${axis2Rows.reduce((n, r) => n + r.primary, 0)}   (seed.py preflight_tags rejects it)`)
const largest = axis2Rows[0]
if (largest && posts.length) {
  const share = ((largest.posts / posts.length) * 100).toFixed(0)
  console.log(`  largest axis-2 slug                       ${largest.slug} at ${largest.posts} of ${posts.length} (${share}%)`)
  console.log("                                            past a third it has stopped selecting and is naming the app's register")
}
