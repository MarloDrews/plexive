// Ground pairs and format-accent palettes. Run by hand, never imported by the app.
//
//   node src/app/specimen/ground-palettes.mjs prove      # run this FIRST
//   node src/app/specimen/ground-palettes.mjs grounds
//   node src/app/specimen/ground-palettes.mjs offsets
//   node src/app/specimen/ground-palettes.mjs palettes
//   node src/app/specimen/ground-palettes.mjs emit       # writes ground-palettes-data.ts
//   node src/app/specimen/ground-palettes.mjs html <out> # writes the standalone file
//
// WHY THIS EXISTS. Two questions that were being answered one after the other.
//
// (1) The grounds are a PAIR. Judging a light ground and then a dark ground in
// sequence compares a colour against a memory. The twelve grounds below are
// derived from the two Marlo has picked -- three lightness steps by two
// temperatures on each side -- so any of the thirty-six pairs can be put on one
// screen at once.
//
// (2) The accents. The earlier candidate sets (accent-candidates.mjs, the two
// rejected sets) fixed ONE LIGHTNESS across all seven and let chroma take
// whatever the sRGB gamut had left at that lightness. That is generous for blues
// and purples and very little for yellow-greens and cyans, which is why books
// came out brown. CONTRAST IS WHAT HAS TO BE EQUAL ACROSS A PALETTE, NOT
// LIGHTNESS. So here lightness is chosen per colour: the lightness that
// maximises chroma subject to the contrast floor for that colour's own ground.
//
// NO NEW DEPENDENCY. The colour maths is imported from oklch.mjs beside this
// file, which accent-candidates.mjs also uses, so there is one copy of
// Ottosson's matrices and one round-trip proof rather than two of each.
// The "prove" mode runs first and must be read before any number here is
// believed.

import { readFileSync, writeFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import {
  parseHex,
  hexToOklch,
  oklchToHex,
  maxChroma,
  oklabDistance,
  ratio,
  fmt,
  pad,
} from "./oklch.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const GLOBALS = join(HERE, "..", "globals.css")

// ---------------------------------------------------------------------------
// The two floors, and what the choice between them actually is.
//
// 4.5 is WCAG SC 1.4.3, and it is REQUIRED IF AN ACCENT CARRIES THE 11 PIXEL
// FORMAT NAME AS TEXT. 3.0 is SC 1.4.11, and it is ENOUGH IF THE ACCENT CARRIES
// ONLY A RULE AND A GLYPH while the name is set in ordinary text colour.
// ---------------------------------------------------------------------------

const FLOORS = [4.5, 3.0]

// ---------------------------------------------------------------------------
// The seven accents, READ FROM globals.css this run rather than copied here, so
// a stale copy cannot produce a table about colours the app no longer has. The
// parse asserts on a count. --color-fmt-neutral is deliberately not one of the
// seven: it is the unknown-format fallback and was never equalized with them.
// ---------------------------------------------------------------------------

const EXPECTED = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]

function readAccents() {
  // .split(/\r?\n/) and not .split("\n"): core.autocrlf is true system-wide on
  // this machine, so a checked-out file is CRLF in the working tree even though
  // its blob is LF, and a bare newline split leaves a stray carriage return on
  // every line.
  const lines = readFileSync(GLOBALS, "utf8").split(/\r?\n/)
  const found = []
  lines.forEach((line, i) => {
    const m = /^\s*--color-fmt-([a-z]+):\s*(#[0-9a-fA-F]{3,8});/.exec(line)
    if (m && EXPECTED.includes(m[1])) found.push({ name: m[1], hex: m[2], line: i + 1 })
  })
  if (found.length !== EXPECTED.length) {
    console.error(
      "FAIL: expected " + EXPECTED.length + " format accents in globals.css, found " + found.length + ".",
    )
    process.exit(1)
  }
  return found
}

// The reading-face x-height correction, read from globals.css rather than
// retyped, and cross-checked against the specimen page's own constant so the
// page and this script cannot drift apart by a typo in one of them.
function readXHeightAdjust() {
  const lines = readFileSync(GLOBALS, "utf8").split(/\r?\n/)
  const hits = []
  lines.forEach((line, i) => {
    const m = /^\s*font-size-adjust:\s*([0-9.]+);/.exec(line)
    if (m) hits.push({ value: m[1], line: i + 1 })
  })
  if (hits.length === 0) {
    console.error("FAIL: no numeric font-size-adjust found in globals.css.")
    process.exit(1)
  }
  const distinct = [...new Set(hits.map((h) => h.value))]
  if (distinct.length !== 1) {
    console.error(
      "FAIL: globals.css carries " + distinct.length +
      " different numeric font-size-adjust values: " + distinct.join(", "),
    )
    process.exit(1)
  }
  const page = readFileSync(join(HERE, "page.tsx"), "utf8")
  const pm = /READING_FACE_ADJUST\s*=\s*"([0-9.]+)"/.exec(page)
  if (!pm) {
    console.error("FAIL: READING_FACE_ADJUST not found in page.tsx.")
    process.exit(1)
  }
  if (pm[1] !== distinct[0]) {
    console.error("FAIL: globals.css says " + distinct[0] + ", page.tsx says " + pm[1] + ".")
    process.exit(1)
  }
  return { value: distinct[0], lines: hits.map((h) => h.line), pageValue: pm[1] }
}

// ---------------------------------------------------------------------------
// THE TWELVE GROUNDS, derived from Marlo's two picks rather than invented.
//
// Light: three lightness steps (the OKLCH lightness of #EDE4D3, that value
// +0.025 and -0.025) by two temperatures (the hue and chroma of #EDE4D3 itself,
// "gold"; and the same hue at 45% of that chroma, "stone").
//
// Dark: three depths (the OKLCH lightness of #070910, +0.03 and +0.06) by two
// casts ("blue", the hue and chroma of #070910 itself; and "warm", the same
// lightness and chroma at a warm hue -- see WARM_HUE below).
// ---------------------------------------------------------------------------

const LIGHT_PICK = "#EDE4D3"
const DARK_PICK = "#070910"
const STONE_CHROMA_FACTOR = 0.45

function deriveGrounds() {
  const light = hexToOklch(LIGHT_PICK)
  const dark = hexToOklch(DARK_PICK)

  // THE WARM HUE IS THE LIGHT GROUND'S OWN HUE, not a number picked by eye.
  // Two reasons, and the second is the one that makes it a derivation:
  //   - it is warm, which is the whole point of the cast;
  //   - it is already one of the two values Marlo chose, so the pair then shares
  //     one temperature axis and the dark ground reads as the same family of
  //     warmth as the light one rather than as a second, unrelated decision.
  // It also lands close to the literal opposite of the blue cast (dark hue minus
  // 180), which is what "warm instead of blue" means read straight; the exact
  // gap is printed by the "grounds" mode rather than asserted here.
  const WARM_HUE = light.h

  const lightSteps = [
    { key: "mid", L: light.L, note: "the OKLCH lightness of " + LIGHT_PICK },
    { key: "hi", L: light.L + 0.025, note: "that lightness + 0.025" },
    { key: "lo", L: light.L - 0.025, note: "that lightness - 0.025" },
  ]
  const lightTemps = [
    { key: "gold", C: light.C, h: light.h, note: "the hue and chroma of " + LIGHT_PICK + " itself" },
    {
      key: "stone",
      C: light.C * STONE_CHROMA_FACTOR,
      h: light.h,
      note: "the same hue at " + Math.round(STONE_CHROMA_FACTOR * 100) + " per cent of that chroma",
    },
  ]

  const darkSteps = [
    { key: "d0", L: dark.L, note: "the OKLCH lightness of " + DARK_PICK },
    { key: "d1", L: dark.L + 0.03, note: "that lightness + 0.03" },
    { key: "d2", L: dark.L + 0.06, note: "that lightness + 0.06" },
  ]
  const darkCasts = [
    { key: "blue", C: dark.C, h: dark.h, note: "the hue and chroma of " + DARK_PICK + " itself" },
    {
      key: "warm",
      C: dark.C,
      h: WARM_HUE,
      note: "the same chroma at hue " + WARM_HUE.toFixed(2) + ", which is the hue of " + LIGHT_PICK,
    },
  ]

  const build = (family, steps, temps) => {
    const out = []
    for (const t of temps) {
      for (const s of steps) {
        const requested = { L: s.L, C: t.C, h: t.h }
        const hex = oklchToHex(requested).toUpperCase()
        out.push({
          id: (family === "light" ? "L-" : "D-") + t.key + "-" + s.key,
          family,
          temp: t.key,
          step: s.key,
          hex,
          requested,
          // The OKLCH of the hex ACTUALLY PRODUCED. An 8-bit hex cannot hold an
          // arbitrary triple, so this differs slightly from the request, and
          // printing the request would overstate what a screen can render.
          actual: hexToOklch(hex),
          derivation: s.note + "; " + t.note,
        })
      }
    }
    return out
  }

  return {
    light: build("light", lightSteps, lightTemps),
    dark: build("dark", darkSteps, darkCasts),
    lightPick: light,
    darkPick: dark,
    warmHue: WARM_HUE,
  }
}

// ---------------------------------------------------------------------------
// THE PALETTE RULE, as implemented.
//
// For one hue on one ground at one floor: walk lightness over a grid; at each
// lightness take the largest chroma the sRGB gamut allows there (bisection in
// oklch.mjs), render that to an 8-bit hex, measure WCAG contrast of THAT HEX
// against the ground, and keep the lightness whose rendered hex has the largest
// chroma among those clearing the floor. If nothing on the grid clears it, the
// colour is a FAILURE and is reported as one rather than clamped to the closest
// thing, because a clamped value is a value that does not meet the floor while
// looking like one that does.
//
// Three places the implementation is narrower than that sentence, all stated
// here rather than left to be discovered:
//   - the lightness search is a GRID at LIGHTNESS_STEP, not a continuous
//     optimum, so a reported chroma can be short of the true maximum by however
//     much chroma moves over one grid step;
//   - chroma is measured on the RENDERED HEX, not on the request, so it carries
//     the 8-bit rounding;
//   - contrast is measured on the RENDERED HEX too, which is the number a
//     browser would produce, and is the reason nothing here can pass on paper
//     and fail on screen.
// ---------------------------------------------------------------------------

const LIGHTNESS_STEP = 0.001

const solveCache = new Map()

function solveColour(hue, groundHex, floor) {
  const key = hue.toFixed(4) + "|" + groundHex + "|" + floor
  const hit = solveCache.get(key)
  if (hit) return hit

  let best = null
  const steps = Math.round(1 / LIGHTNESS_STEP)
  for (let i = 0; i <= steps; i += 1) {
    const L = i * LIGHTNESS_STEP
    const C = maxChroma(L, hue)
    const hex = oklchToHex({ L, C, h: hue })
    if (ratio(hex, groundHex) < floor) continue
    const actual = hexToOklch(hex)
    if (best === null || actual.C > best.actual.C) {
      best = {
        ok: true,
        hue,
        hex: hex.toUpperCase(),
        requested: { L, C, h: hue },
        actual,
        contrast: ratio(hex, groundHex),
      }
    }
  }
  const result = best ?? { ok: false, hue, hex: null, contrast: null, actual: null }
  solveCache.set(key, result)
  return result
}

// ---------------------------------------------------------------------------
// Scores. Both are properties of the SET of seven finished colours on one
// ground, so they are blind to which format got which hue.
//
// Perceptual distance is EUCLIDEAN DISTANCE IN OKLab, stated because the choice
// matters: OKLab is near-uniform by construction, so a straight Euclidean
// distance in it is the metric it was designed for and needs no weighting. It
// is not CIEDE2000 and it is not a hue-only distance.
// ---------------------------------------------------------------------------

function minPairDistance(hexes) {
  let worst = Infinity
  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = i + 1; j < hexes.length; j += 1) {
      worst = Math.min(worst, oklabDistance(hexes[i], hexes[j]))
    }
  }
  return worst
}

function scoreSet(colours) {
  const ok = colours.filter((c) => c.ok)
  return {
    failures: colours.length - ok.length,
    minDistance: ok.length < 2 ? null : minPairDistance(ok.map((c) => c.hex)),
    minChroma: ok.length === 0 ? null : Math.min(...ok.map((c) => c.actual.C)),
  }
}

// Shortest way round the hue circle, in degrees.
function hueGap(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return Math.min(d, 360 - d)
}

// ---------------------------------------------------------------------------
// THE FOUR PALETTES.
//
// A palette is SEVEN HUES plus an ASSIGNMENT of those hues to the seven format
// names. The hue a format gets is the same in both themes, which is what makes
// "the books colour" one thing rather than two; only lightness and chroma move
// between grounds, and both are re-derived per ground by the rule above.
// ---------------------------------------------------------------------------

const EVEN_SPACING = 360 / 7

// The offset search grid. 1 degree steps over one full period of the seven-way
// spacing: at 51 degrees the set is 0.43 degrees short of repeating itself, so
// 52 offsets cover every distinct rotation to within a degree.
const OFFSET_STEP = 1
const OFFSET_COUNT = 52

// P1's offset is scored on the LOWEST CHROMA ANY OF THE SEVEN CAN REACH on ANY
// of the twelve grounds at the 4.5 floor. The strict floor and all twelve
// grounds, because an offset that is only good on the grounds that happen to be
// picked is an offset that has to be re-chosen when the ground changes.
function scoreOffset(offset, grounds, floor) {
  let lowest = Infinity
  let failures = 0
  for (let k = 0; k < 7; k += 1) {
    const hue = (offset + k * EVEN_SPACING) % 360
    for (const g of grounds) {
      const c = solveColour(hue, g.hex, floor)
      if (!c.ok) {
        failures += 1
        continue
      }
      lowest = Math.min(lowest, c.actual.C)
    }
  }
  return { offset, failures, lowest: failures > 0 ? -1 : lowest }
}

function searchOffsets(grounds) {
  const scored = []
  for (let i = 0; i < OFFSET_COUNT; i += 1) {
    scored.push(scoreOffset(i * OFFSET_STEP, grounds, 4.5))
  }
  scored.sort((a, b) => b.lowest - a.lowest)
  return scored
}

// Every permutation of seven, generated once. 5040 of them, small enough to
// score exhaustively, so both assignments below are exact rather than greedy.
function permutations(n) {
  const out = []
  const cur = []
  const used = new Array(n).fill(false)
  const walk = () => {
    if (cur.length === n) {
      // .slice() on a plain Array copies. The trap the previous batch recorded
      // was slicing a TYPED array literal, which is a different thing; this is
      // an ordinary Array, and the count assert in "prove" mode is what
      // establishes that the copies are real rather than seven empty rows.
      out.push(cur.slice())
      return
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue
      used[i] = true
      cur.push(i)
      walk()
      cur.pop()
      used[i] = false
    }
  }
  walk()
  return out
}

const PERMS = permutations(7)

// Assignment used by P1 and P2: give each format the hue closest to the one it
// has today, minimising TOTAL rotation over all seven. Exhaustive, so it is the
// true minimum and not a greedy approximation. It exists so that the difference
// between P1 and P4 is the assignment alone.
function assignByLeastRotation(hues, todayHues) {
  let best = null
  for (const perm of PERMS) {
    let total = 0
    for (let f = 0; f < 7; f += 1) total += hueGap(hues[perm[f]], todayHues[f])
    if (best === null || total < best.total) best = { perm: perm.slice(), total }
  }
  return best
}

// P4's assignment: formats that appear NEXT TO EACH OTHER are put FURTHEST
// APART in hue. Maximise the smallest hue gap over the adjacent pairs, then
// break ties on the sum, so a tie is settled by the second-worst pair rather
// than by permutation order.
function assignByAdjacency(hues, adjacency) {
  let best = null
  for (const perm of PERMS) {
    let smallest = Infinity
    let total = 0
    for (const pair of adjacency) {
      const gap = hueGap(hues[perm[pair[0]]], hues[perm[pair[1]]])
      smallest = Math.min(smallest, gap)
      total += gap
    }
    if (
      best === null ||
      smallest > best.smallest ||
      (smallest === best.smallest && total > best.total)
    ) {
      best = { perm: perm.slice(), smallest, total }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// P4's ADJACENCY SOURCE.
//
// THERE IS NO MEASURED ONE, and that is a finding rather than a shortcut. No
// post content lives in this repository -- it moved to the private content repo
// on 2026-08-29 -- so "which formats appear next to each other most often" in a
// real feed cannot be counted here at all. The feed is ranked by score with a
// per-session jitter (backend/app/routers/feed.py:60-150), so even with content
// in hand the answer would be a distribution and not a fixed ordering.
//
// USED INSTEAD: the FORMAT_IDS order in frontend/src/lib/formats.ts:15-23, taken
// as a CYCLE. That array is not a convention; it is the order in which the seven
// are rendered SIDE BY SIDE in four places measured this session -- the search
// filter chips (search/page.tsx:22), the create wizard (create/page.tsx:45), the
// stats chart series (stats/charts.tsx:27-29) and the Net legend (Net.tsx:219).
// In every one of them consecutive entries touch. Cyclic because those rows wrap
// and scroll, so the last sits beside the first.
// ---------------------------------------------------------------------------

function cyclicAdjacency(n) {
  const out = []
  for (let i = 0; i < n; i += 1) out.push([i, (i + 1) % n])
  return out
}

// ---------------------------------------------------------------------------
// P2. Seven hues chosen freely to maximise the SMALLEST PAIRWISE OKLab DISTANCE
// between the finished colours, SCORED ON THE WORSE OF THE TWO GROUNDS -- the
// two being Marlo's current pair, #EDE4D3 and #070910, since those are the two
// the palette has to survive if nothing else changes.
//
// The search is a coordinate ascent over integer hues from fixed starting
// points, so it is deterministic and repeats exactly. It is a LOCAL optimum
// with no proof of global optimality; the starting points include every even
// spacing at 1 degree offsets, which is exactly the family P1 searches, so P2
// cannot come out worse than the best even palette on its own score.
// ---------------------------------------------------------------------------

const P2_REF_FLOOR = 4.5

function labOf(hex) {
  const c = hexToOklch(hex)
  const rad = (c.h * Math.PI) / 180
  return [c.L, c.C * Math.cos(rad), c.C * Math.sin(rad)]
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function searchFreeHues(refGrounds) {
  // Precompute the finished colour for every integer hue on both reference
  // grounds. After this the search touches no colour maths at all.
  const table = refGrounds.map((g) => {
    const row = []
    for (let h = 0; h < 360; h += 1) {
      const c = solveColour(h, g.hex, P2_REF_FLOOR)
      row.push(c.ok ? { hex: c.hex, lab: labOf(c.hex) } : null)
    }
    return row
  })

  const score = (hues) => {
    let worst = Infinity
    for (const row of table) {
      let inner = Infinity
      for (let i = 0; i < hues.length; i += 1) {
        const a = row[hues[i]]
        if (a === null) return -1
        for (let j = i + 1; j < hues.length; j += 1) {
          const b = row[hues[j]]
          if (b === null) return -1
          inner = Math.min(inner, dist3(a.lab, b.lab))
        }
      }
      worst = Math.min(worst, inner)
    }
    return worst
  }

  const starts = []
  for (let off = 0; off < OFFSET_COUNT; off += 1) {
    starts.push(Array.from({ length: 7 }, (unused, k) => Math.round(off + k * EVEN_SPACING) % 360))
  }

  let best = null
  let sweeps = 0
  for (const start of starts) {
    const hues = start.slice()
    let current = score(hues)
    let improved = true
    while (improved) {
      improved = false
      sweeps += 1
      for (let slot = 0; slot < 7; slot += 1) {
        const keep = hues[slot]
        let bestHue = keep
        let bestScore = current
        for (let h = 0; h < 360; h += 1) {
          if (h !== keep && hues.includes(h)) continue
          hues[slot] = h
          const s = score(hues)
          if (s > bestScore) {
            bestScore = s
            bestHue = h
          }
        }
        hues[slot] = bestHue
        if (bestHue !== keep) {
          current = bestScore
          improved = true
        }
      }
    }
    if (best === null || current > best.score) {
      best = { hues: hues.slice().sort((a, b) => a - b), score: current, from: start.slice() }
    }
  }
  return { best, sweeps, starts: starts.length }
}

// ---------------------------------------------------------------------------
// Building a finished palette: seven hues, one assignment, every ground, both
// floors.
// ---------------------------------------------------------------------------

function buildPalette(meta, hues, perm, formats, grounds) {
  const byFloor = {}
  for (const floor of FLOORS) {
    byFloor[floor] = {}
    for (const g of grounds) {
      const colours = formats.map((f, i) => {
        const hue = hues[perm[i]]
        const c = solveColour(hue, g.hex, floor)
        return { format: f.name, hue, ...c }
      })
      byFloor[floor][g.id] = { colours, score: scoreSet(colours) }
    }
  }
  return { ...meta, hues, perm, byFloor }
}

// ---------------------------------------------------------------------------
// Card-surface support, carried unchanged in kind from the previous batch so the
// four treatments stay the four treatments.
//
// The step is the app's own step (--color-surface-0 #0a0a0a to
// --color-surface-1 #141414, globals.css:60-61) taken as a LIGHTNESS DIFFERENCE
// IN OKLab and applied in the direction the ground family needs. Not +10 per
// channel: 10/255 near black is a large perceptual step and near beige almost
// nothing, so channel arithmetic would put a visible step on the dark grounds
// and an invisible one on the light ones.
// ---------------------------------------------------------------------------

const STEP_DELTA_L = hexToOklch("#141414").L - hexToOklch("#0a0a0a").L

// An alpha wash over an opaque ground, resolved to the hex a screen shows, so
// every colour on the page can be labelled with a real value.
function over(groundHex, washRgb, alpha) {
  const g = parseHex(groundHex)
  return (
    "#" +
    g
      .map((c, i) => Math.round(washRgb[i] * alpha + c * (1 - alpha)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  )
}

function groundSurfaces(g) {
  const light = g.family === "light"
  const sign = light ? -1 : 1
  const stepped = { L: g.actual.L + sign * STEP_DELTA_L, C: g.actual.C, h: g.actual.h }
  const wash = light ? [0, 0, 0] : [255, 255, 255]
  return {
    ink: light ? "#14110C" : "#EEEEEE",
    step: oklchToHex(stepped).toUpperCase(),
    // 1px rule and the chrome fills, resolved over the ground.
    rule: over(g.hex, wash, 0.12),
    chrome: over(g.hex, wash, 0.06),
    chromeOn: over(g.hex, wash, 0.16),
    chromeInk: over(g.hex, wash, 0.55),
    // What .card ships today: rgb(255 255 255 / 0.04) over the ground,
    // globals.css:182. On a light ground it resolves LIGHTER than the page it
    // sits on, which is the inversion this panel exists to show.
    today: over(g.hex, [255, 255, 255], 0.04),
  }
}

// ---------------------------------------------------------------------------
// The whole computation, run once and shared by every mode below.
// ---------------------------------------------------------------------------

function computeEverything() {
  const accents = readAccents()
  const xheight = readXHeightAdjust()
  const derived = deriveGrounds()
  const grounds = [...derived.light, ...derived.dark]
  const todayHues = accents.map((a) => hexToOklch(a.hex).h)

  const offsets = searchOffsets(grounds)
  const p1Offset = offsets[0]
  const p1Hues = Array.from({ length: 7 }, (unused, k) => (p1Offset.offset + k * EVEN_SPACING) % 360)

  const refGrounds = [
    grounds.find((g) => g.hex === LIGHT_PICK),
    grounds.find((g) => g.hex === DARK_PICK),
  ]
  if (refGrounds.some((g) => g === undefined)) {
    console.error("FAIL: the two picked grounds did not reproduce among the twelve derived ones.")
    process.exit(1)
  }
  const free = searchFreeHues(refGrounds)
  const p2Hues = free.best.hues

  const p3Hues = todayHues.slice()

  const adjacency = cyclicAdjacency(7)
  const p1Assign = assignByLeastRotation(p1Hues, todayHues)
  const p2Assign = assignByLeastRotation(p2Hues, todayHues)
  const p3Assign = { perm: [0, 1, 2, 3, 4, 5, 6], total: 0 }
  const p4Assign = assignByAdjacency(p1Hues, adjacency)

  const palettes = [
    buildPalette(
      {
        id: "P1",
        name: "P1 even",
        note:
          "seven hues exactly 360/7 = " + EVEN_SPACING.toFixed(4) + " degrees apart, offset " +
          p1Offset.offset + " degrees, chosen to maximise the lowest chroma any of the seven can " +
          "reach on any of the twelve grounds at the 4.5 floor",
      },
      p1Hues, p1Assign.perm, accents, grounds,
    ),
    buildPalette(
      {
        id: "P2",
        name: "P2 spread",
        note:
          "seven hues chosen freely to maximise the smallest pairwise OKLab distance between the " +
          "finished colours, scored on the worse of " + LIGHT_PICK + " and " + DARK_PICK,
      },
      p2Hues, p2Assign.perm, accents, grounds,
    ),
    buildPalette(
      {
        id: "P3",
        name: "P3 nearest",
        note:
          "each format keeps the hue it has in globals.css today; only lightness and chroma are " +
          "re-derived. Here so the cost of changing hues is visible rather than assumed",
      },
      p3Hues, p3Assign.perm, accents, grounds,
    ),
    buildPalette(
      {
        id: "P4",
        name: "P4 even, remapped",
        note:
          "the same seven hues as P1, reassigned so that formats adjacent in the FORMAT_IDS cycle " +
          "are furthest apart in hue; smallest adjacent gap " + p4Assign.smallest.toFixed(2) +
          " degrees",
      },
      p1Hues, p4Assign.perm, accents, grounds,
    ),
  ]

  return {
    accents, xheight, derived, grounds, todayHues, offsets, p1Offset, p1Hues,
    p2Hues, p3Hues, free, adjacency, p1Assign, p2Assign, p3Assign, p4Assign, palettes,
  }
}

// ---------------------------------------------------------------------------

const MODE = process.argv[2] || "palettes"

if (MODE === "prove") {
  // Run BEFORE any value below is believed. Every check has a known answer.
  let ok = true

  const white = hexToOklch("#FFFFFF")
  const whitePass = Math.abs(white.L - 1) < 1e-6 && white.C < 1e-6
  console.log("#FFFFFF -> " + fmt(white))
  console.log("   expected lightness 1 and chroma 0")
  console.log("   PASS: " + whitePass)
  ok = ok && whitePass

  const black = hexToOklch("#000000")
  const blackPass = Math.abs(black.L) < 1e-6
  console.log("#000000 -> " + fmt(black))
  console.log("   expected lightness 0")
  console.log("   PASS: " + blackPass)
  ok = ok && blackPass

  console.log("")
  const extreme = ratio("#000000", "#FFFFFF")
  const mid = ratio("#777777", "#FFFFFF")
  const contrastPass = Math.abs(extreme - 21) < 1e-9 && mid < 4.5
  console.log("#000000 on #FFFFFF -> " + extreme.toFixed(4) + "   expected exactly 21")
  console.log("#777777 on #FFFFFF -> " + mid.toFixed(4) + "   expected below 4.5")
  console.log("   PASS: " + contrastPass)
  ok = ok && contrastPass

  console.log("")
  console.log("round trip, all seven accents read from globals.css: hex -> OKLCH -> hex")
  let worst = 0
  const accents = readAccents()
  for (const accent of accents) {
    const back = oklchToHex(hexToOklch(accent.hex))
    const before = parseHex(accent.hex)
    const after = parseHex(back)
    const diff = Math.max(...before.map((c, i) => Math.abs(c - after[i])))
    worst = Math.max(worst, diff)
    console.log(
      "   " + pad(accent.name, 11) + pad(accent.hex, 10) + "-> " + pad(back, 10) +
      "max per-channel diff " + diff,
    )
  }
  console.log("")
  console.log("MAXIMUM PER-CHANNEL DIFFERENCE, all seven, in 0-255 units: " + worst)
  const tripPass = worst === 0
  console.log("   expected 0. PASS: " + tripPass)
  ok = ok && tripPass

  // Four checks this script needs and accent-candidates.mjs did not.
  console.log("")
  console.log("accents found in globals.css: " + accents.length + "   expected 7")
  const countPass = accents.length === 7
  console.log("   PASS: " + countPass)
  ok = ok && countPass

  const xh = readXHeightAdjust()
  console.log("")
  console.log(
    "x-height correction, globals.css line(s) " + xh.lines.join(", ") + ": " + xh.value +
    "   page.tsx READING_FACE_ADJUST: " + xh.pageValue,
  )
  const xhPass = xh.value === xh.pageValue
  console.log("   expected the two to agree. PASS: " + xhPass)
  ok = ok && xhPass

  console.log("")
  console.log("permutations of seven: " + PERMS.length + "   expected 5040")
  const permCountPass = PERMS.length === 5040
  const permFullPass = PERMS.every((p) => p.length === 7)
  const permDistinctPass = new Set(PERMS.map((p) => p.join(","))).size === 5040
  console.log("   every row has 7 entries: " + permFullPass)
  console.log("   all 5040 rows distinct:  " + permDistinctPass)
  console.log("   PASS: " + (permCountPass && permFullPass && permDistinctPass))
  ok = ok && permCountPass && permFullPass && permDistinctPass

  // The rule itself, on one known case: a colour solved against a ground must
  // actually clear the floor when its contrast is re-measured from the hex.
  console.log("")
  const probe = solveColour(240, LIGHT_PICK, 4.5)
  const probeContrast = probe.ok ? ratio(probe.hex, LIGHT_PICK) : null
  const probePass = probe.ok && probeContrast >= 4.5
  console.log(
    "hue 240 on " + LIGHT_PICK + " at floor 4.5 -> " + probe.hex + " " + fmt(probe.actual) +
    "  contrast re-measured from the hex: " + (probeContrast === null ? "n/a" : probeContrast.toFixed(4)),
  )
  console.log("   expected at or above 4.5. PASS: " + probePass)
  ok = ok && probePass

  // And the failure direction, which is the half that is trusted too easily:
  // an impossible floor must come back as a failure and not as a clamped value.
  const impossible = solveColour(240, LIGHT_PICK, 25)
  console.log("")
  console.log("hue 240 on " + LIGHT_PICK + " at an impossible floor of 25 -> " + (impossible.ok ? impossible.hex : "FAILURE, no lightness clears it"))
  const failPass = impossible.ok === false
  console.log("   expected a reported failure, not a clamp. PASS: " + failPass)
  ok = ok && failPass

  if (!ok) {
    console.log("")
    console.log("FAIL: no number this script prints may be believed.")
  }
  process.exit(ok ? 0 : 1)
}

const ALL = computeEverything()

const groundLabel = (g) =>
  pad(g.id, 14) + pad(g.hex, 10) + pad(fmt(g.actual), 30)

if (MODE === "grounds") {
  console.log("light pick " + LIGHT_PICK + " = " + fmt(ALL.derived.lightPick))
  console.log("dark  pick " + DARK_PICK + " = " + fmt(ALL.derived.darkPick))
  console.log("")
  console.log(
    "warm cast hue " + ALL.derived.warmHue.toFixed(2) + " (the hue of " + LIGHT_PICK + "). " +
    "The literal opposite of the blue cast would be " +
    (((ALL.derived.darkPick.h - 180) % 360 + 360) % 360).toFixed(2) +
    ", so the warm cast sits " +
    hueGap(ALL.derived.warmHue, ALL.derived.darkPick.h - 180).toFixed(2) +
    " degrees off it.",
  )
  console.log("")
  console.log("SIX LIGHT GROUNDS")
  console.log(pad("id", 14) + pad("hex", 10) + pad("OKLCH of the hex", 30) + "derivation")
  for (const g of ALL.derived.light) console.log(groundLabel(g) + g.derivation)
  console.log("")
  console.log("SIX DARK GROUNDS")
  console.log(pad("id", 14) + pad("hex", 10) + pad("OKLCH of the hex", 30) + "derivation")
  for (const g of ALL.derived.dark) console.log(groundLabel(g) + g.derivation)
  console.log("")
  console.log("Do the two picks reproduce exactly among the twelve?")
  console.log("  " + LIGHT_PICK + ": " + (ALL.derived.light.some((g) => g.hex === LIGHT_PICK) ? "yes, as " + ALL.derived.light.find((g) => g.hex === LIGHT_PICK).id : "NO"))
  console.log("  " + DARK_PICK + ": " + (ALL.derived.dark.some((g) => g.hex === DARK_PICK) ? "yes, as " + ALL.derived.dark.find((g) => g.hex === DARK_PICK).id : "NO"))
  console.log("")
  console.log("SURFACES PER GROUND (every colour the specimen shows, resolved to a hex)")
  console.log(pad("id", 14) + pad("ground", 10) + pad("ink", 10) + pad("step", 10) + pad("1px rule", 10) + pad("card today", 12))
  for (const g of ALL.grounds) {
    const s = groundSurfaces(g)
    console.log(pad(g.id, 14) + pad(g.hex, 10) + pad(s.ink, 10) + pad(s.step, 10) + pad(s.rule, 10) + pad(s.today, 12))
  }
  process.exit(0)
}

if (MODE === "offsets") {
  console.log(
    "P1 offset search: " + OFFSET_COUNT + " offsets at " + OFFSET_STEP + " degree steps. Score is " +
    "the LOWEST CHROMA any of the seven reaches on any of the twelve grounds at floor 4.5.",
  )
  console.log("")
  console.log(pad("rank", 6) + pad("offset", 9) + pad("score (lowest chroma)", 24) + "failures")
  ALL.offsets.forEach((o, i) => {
    if (i < 8 || i >= ALL.offsets.length - 3) {
      console.log(
        pad(i + 1, 6) + pad(o.offset.toFixed(0) + " deg", 9) +
        pad(o.lowest < 0 ? "disqualified" : o.lowest.toFixed(6), 24) + o.failures,
      )
    } else if (i === 8) {
      console.log("   ... " + (ALL.offsets.length - 11) + " more ...")
    }
  })
  console.log("")
  console.log("CHOSEN: offset " + ALL.p1Offset.offset + " degrees, score " + ALL.p1Offset.lowest.toFixed(6))
  console.log("hues: " + ALL.p1Hues.map((h) => h.toFixed(2)).join(", "))
  console.log("")
  console.log("P2 free-hue search: " + ALL.free.starts + " starting points, " + ALL.free.sweeps + " coordinate sweeps.")
  console.log("hues: " + ALL.p2Hues.join(", "))
  console.log("score (smallest pairwise OKLab distance on the worse of the two picked grounds): " + ALL.free.best.score.toFixed(6))
  process.exit(0)
}

if (MODE === "palettes") {
  console.log("SEVEN ACCENTS READ FROM globals.css THIS RUN")
  ALL.accents.forEach((a, i) => {
    console.log(
      "  globals.css:" + a.line + "  --color-fmt-" + pad(a.name, 11) + pad(a.hex, 10) +
      "hue " + ALL.todayHues[i].toFixed(2),
    )
  })
  console.log("")
  console.log("today's hue gaps around the circle, in declaration order:")
  const sorted = ALL.todayHues.slice().sort((a, b) => a - b)
  const gaps = sorted.map((h, i) => (i === sorted.length - 1 ? 360 - h + sorted[0] : sorted[i + 1] - h))
  console.log("  sorted hues: " + sorted.map((h) => h.toFixed(1)).join(", "))
  console.log("  gaps:        " + gaps.map((g) => g.toFixed(1)).join(", "))
  console.log("  even spacing would be " + EVEN_SPACING.toFixed(1))
  console.log("")

  for (const p of ALL.palettes) {
    console.log("=".repeat(78))
    console.log(p.id + "  " + p.name)
    console.log("  " + p.note)
    console.log("  hues, in the order the formats take them:")
    ALL.accents.forEach((a, i) => {
      console.log("    " + pad(a.name, 11) + p.hues[p.perm[i]].toFixed(2) + " deg   (today " + ALL.todayHues[i].toFixed(2) + ")")
    })
    for (const floor of FLOORS) {
      for (const g of ALL.grounds) {
        const cell = p.byFloor[floor][g.id]
        console.log("")
        console.log("--- " + p.id + " | floor " + floor.toFixed(1) + " | " + g.id + " " + g.hex + " " + fmt(g.actual))
        console.log("    " + pad("format", 11) + pad("hue", 9) + pad("hex", 10) + pad("OKLCH of the hex", 30) + "contrast")
        for (const c of cell.colours) {
          if (!c.ok) {
            console.log("    " + pad(c.format, 11) + pad(c.hue.toFixed(2), 9) + "FAILS the floor at every lightness")
            continue
          }
          console.log(
            "    " + pad(c.format, 11) + pad(c.hue.toFixed(2), 9) + pad(c.hex, 10) +
            pad(fmt(c.actual), 30) + c.contrast.toFixed(2),
          )
        }
        console.log(
          "    scores: smallest pairwise OKLab distance " +
          (cell.score.minDistance === null ? "n/a" : cell.score.minDistance.toFixed(6)) +
          "   smallest chroma " +
          (cell.score.minChroma === null ? "n/a" : cell.score.minChroma.toFixed(6)) +
          "   failures " + cell.score.failures,
        )
      }
    }
    console.log("")
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// The standalone file, as one template with placeholder tokens.
//
// String.raw and no interpolation at all: every value goes in through a named
// __TOKEN__ replacement below, so the template can hold ordinary JavaScript and
// CSS without any of it being eaten by the tagged-template syntax.
// ---------------------------------------------------------------------------

const HTML_TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plexive specimen - ground pairs and accent palettes</title>
<style>
/* The reading face, embedded as a data URL. Same file the branch serves from
   frontend/public/specimen-fonts/eb-garamond/.
   font-display: block, not swap: a specimen that flashes a fallback face is a
   specimen that can be screenshotted showing the wrong typeface.
   format() takes a quoted string, not the CSS Fonts 4 bare keyword, because the
   keyword form is newer than some Android WebViews and a src line the browser
   cannot parse is a src line it skips. */
@font-face {
  font-family: "SpecEBGaramond";
  src: url(data:font/woff2;base64,__FONT_BASE64__) format("woff2");
  font-weight: 400 800;
  font-style: normal;
  font-display: block;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

body {
  background: #1B1B1B;
  color: #E8E8E8;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-text-size-adjust: 100%;
}

/* Chrome. Kept in system-ui and on a neutral grey so it is never mistaken for
   the specimen and never influences the judgement being made. */
#controls {
  background: #1B1B1B;
  border-bottom: 1px solid #333333;
  padding: 0 12px 12px;
}
#controls > summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 12px;
  color: #E8E8E8;
}
.grp { margin-top: 10px; }
.grp > h2 {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
  color: #A0A0A0;
}
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
.btns > button {
  min-height: 44px;
  padding: 6px 12px;
  border: 1px solid #3A3A3A;
  border-radius: 8px;
  background: #262626;
  color: #C8C8C8;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
}
.btns > button[aria-pressed="true"] {
  background: #E8E8E8;
  color: #141414;
  border-color: #E8E8E8;
  font-weight: 600;
}
.btns > button > .bhex {
  display: block;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  opacity: 0.75;
}
.chromehex {
  margin-top: 10px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: #8A8A8A;
}

/* The two halves. Full width, one above the other, never behind a switch. */
.half { width: 100%; padding: 14px 16px 20px; }
.half h1 {
  font-family: "SpecEBGaramond", Georgia, serif;
  font-size-adjust: __XHEIGHT__;
  font-size: 2rem;
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 6px 0 10px;
}
.half p.body {
  font-family: "SpecEBGaramond", Georgia, serif;
  font-size-adjust: __XHEIGHT__;
  font-size: 1.0625rem;
  line-height: 1.7;
  margin: 0 0 12px;
}
.half .meta {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size-adjust: none;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.halftag {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
}
.card {
  padding: 12px;
  margin-bottom: 14px;
}
.card p {
  font-family: "SpecEBGaramond", Georgia, serif;
  font-size-adjust: __XHEIGHT__;
  font-size: 1.0625rem;
  line-height: 1.6;
  margin: 0 0 8px;
}
.hex {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* The seven accents, both usages side by side. minmax(0, ...) on every column:
   without the 0 minimum a grid column refuses to shrink below its content and
   the whole page gains a horizontal scrollbar on a narrow phone. */
.accents { display: grid; gap: 8px; }
.accrow {
  display: grid;
  grid-template-columns: minmax(0, 74px) minmax(0, 1fr) minmax(0, 96px);
  gap: 8px;
  align-items: center;
}
.acctext {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size-adjust: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.accglyph { display: flex; align-items: center; gap: 6px; min-width: 0; }
.accsq { width: 12px; height: 12px; flex: none; }
.accrule { width: 26px; height: 2px; flex: none; }
.accname {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size-adjust: none;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.accfail { font-weight: 700; }
.scores {
  margin-top: 10px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.sectionlabel {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size-adjust: none;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin: 14px 0 6px;
}
</style>
</head>
<body>

<details id="controls" open>
<summary>Controls - tap to collapse and see both grounds at once</summary>
<div id="ctl"></div>
<div class="chromehex" id="chromehex"></div>
</details>

<section class="half" id="halfLight"></section>
<section class="half" id="halfDark"></section>

<script>
"use strict";

// Everything this page shows, computed by
// frontend/src/app/specimen/ground-palettes.mjs and inlined here. Nothing is
// fetched, and nothing is computed in the browser except the string joins below.
var D = __DATA__;

var CARD_TREATMENTS = [
  { name: "Step", key: "step" },
  { name: "Line", key: "rule" },
  { name: "Step and line", key: "both" },
  { name: "Today, what ships", key: "today" }
];

var state = {
  light: D.openLight,
  dark: D.openDark,
  palette: 0,
  floor: D.floors[0],
  card: 0
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// .concat() and not a slice of a literal: the trap the previous batch recorded
// was a slice of a TYPED array literal quietly producing an empty array that
// looked like success. The count is asserted on screen just below, so an empty
// list here shows as a number rather than as a blank panel.
var ALL_GROUNDS = D.grounds.light.concat(D.grounds.dark);

function groundById(id) {
  for (var i = 0; i < ALL_GROUNDS.length; i += 1) {
    if (ALL_GROUNDS[i].id === id) return ALL_GROUNDS[i];
  }
  return ALL_GROUNDS[0];
}

function button(label, hex, pressed, group, value) {
  return '<button type="button" data-group="' + group + '" data-value="' + esc(value) +
    '" aria-pressed="' + (pressed ? "true" : "false") + '">' + esc(label) +
    (hex ? '<span class="bhex">' + esc(hex) + "</span>" : "") + "</button>";
}

function renderControls() {
  var out = [];

  out.push('<div class="grp"><h2>Light ground (6)</h2><div class="btns">');
  D.grounds.light.forEach(function (g) {
    out.push(button(g.id.replace(/^L-/, ""), g.hex, g.id === state.light, "light", g.id));
  });
  out.push("</div></div>");

  out.push('<div class="grp"><h2>Dark ground (6)</h2><div class="btns">');
  D.grounds.dark.forEach(function (g) {
    out.push(button(g.id.replace(/^D-/, ""), g.hex, g.id === state.dark, "dark", g.id));
  });
  out.push("</div></div>");

  out.push('<div class="grp"><h2>Palette (4) - both halves</h2><div class="btns">');
  D.palettes.forEach(function (p, i) {
    out.push(button(p.name, "", i === state.palette, "palette", String(i)));
  });
  out.push("</div></div>");

  out.push('<div class="grp"><h2>Contrast floor (2) - both halves</h2><div class="btns">');
  D.floors.forEach(function (f) {
    var label = f === "4.5" ? "4.5 - accent carries the 11px name as text"
      : "3.0 - accent carries only a rule and a glyph";
    out.push(button(label, "", f === state.floor, "floor", f));
  });
  out.push("</div></div>");

  out.push('<div class="grp"><h2>Card treatment (4) - both halves</h2><div class="btns">');
  CARD_TREATMENTS.forEach(function (t, i) {
    out.push(button(t.name, "", i === state.card, "card", String(i)));
  });
  out.push("</div></div>");

  document.getElementById("ctl").innerHTML = out.join("");

  document.getElementById("chromehex").innerHTML =
    "chrome, not part of the specimen: strip #1B1B1B, text #E8E8E8, idle button #262626 on " +
    "#3A3A3A, pressed button #E8E8E8 on #141414, label #A0A0A0, hex #8A8A8A" +
    "<br>counts read from the data: " + ALL_GROUNDS.length + " grounds, " + D.palettes.length +
    " palettes, " + D.floors.length + " floors, " + D.formats.length + " formats" +
    "<br>x-height correction from globals.css: font-size-adjust " + D.xheight;
}

function cardStyle(g) {
  var t = CARD_TREATMENTS[state.card];
  if (t.key === "step") return ["background:" + g.step, "Step - " + g.step];
  if (t.key === "rule") return ["border:1px solid " + g.rule, "Line - no fill, 1px " + g.rule];
  if (t.key === "both") {
    return ["background:" + g.step + ";border:1px solid " + g.rule,
      "Step and line - " + g.step + " + 1px " + g.rule];
  }
  return ["background:" + g.today,
    "Today, what ships - rgb(255 255 255 / 0.04) over " + g.hex + " = " + g.today];
}

function renderHalf(elId, groundId, familyLabel) {
  var g = groundById(groundId);
  var pal = D.palettes[state.palette];
  var cell = pal.cells[state.floor][g.id];
  var card = cardStyle(g);
  var out = [];

  out.push('<div class="halftag">' + esc(familyLabel) + " - " + esc(g.id) + " - " + esc(g.hex) +
    " - " + esc(g.oklch) + "<br>" + esc(g.derivation) +
    "<br>text ink " + esc(g.ink) + " - palette " + esc(pal.name) + " - floor " + esc(state.floor) +
    "</div>");

  out.push("<h1>__HEADLINE__</h1>");
  out.push('<p class="body">__BODY__</p>');
  out.push('<div class="meta">__META__</div>');

  out.push('<div class="card" style="' + card[0] + '"><p>__CARD_TEXT__</p>' +
    '<div class="hex" style="color:' + g.ink + '">' + esc(card[1]) + "</div></div>");

  out.push('<div class="sectionlabel">The seven format accents - left: the 11px name set in the ' +
    "accent. right: the name in ordinary text colour beside an accent square and a 2px accent " +
    'rule.</div>');
  out.push('<div class="accents">');
  cell.colours.forEach(function (c) {
    if (!c.ok) {
      out.push('<div class="accrow"><div class="acctext accfail">' + esc(c.format) +
        '</div><div class="accglyph accfail">FAILS the ' + esc(state.floor) +
        ' floor at every lightness</div><div class="hex">hue ' + esc(c.hue.toFixed(2)) +
        "</div></div>");
      return;
    }
    out.push('<div class="accrow">' +
      '<div class="acctext" style="color:' + c.hex + '">' + esc(c.format) + "</div>" +
      '<div class="accglyph">' +
      '<span class="accsq" style="background:' + c.hex + '"></span>' +
      '<span class="accrule" style="background:' + c.hex + '"></span>' +
      '<span class="accname" style="color:' + g.ink + '">' + esc(c.format) + "</span>" +
      "</div>" +
      '<div class="hex">' + esc(c.hex) + "<br>" + esc(c.contrast.toFixed(2)) + ":1<br>hue " +
      esc(c.hue.toFixed(1)) + "</div>" +
      "</div>");
  });
  out.push("</div>");

  out.push('<div class="scores">' +
    "smallest pairwise OKLab distance among the seven: " +
    (cell.minDistance === null ? "n/a" : esc(cell.minDistance.toFixed(4))) + "<br>" +
    "smallest chroma among the seven: " +
    (cell.minChroma === null ? "n/a" : esc(cell.minChroma.toFixed(4))) + "<br>" +
    "colours failing the floor: " + cell.failures + "<br>" +
    "OKLCH of each: " + cell.colours.map(function (c) {
      return esc(c.format) + " " + esc(c.oklch === null ? "-" : c.oklch);
    }).join(" | ") +
    "</div>");

  var el = document.getElementById(elId);
  el.style.background = g.hex;
  el.style.color = g.ink;
  el.innerHTML = out.join("");
}

function render() {
  renderControls();
  renderHalf("halfLight", state.light, "LIGHT GROUND");
  renderHalf("halfDark", state.dark, "DARK GROUND");
}

document.addEventListener("click", function (ev) {
  var b = ev.target.closest ? ev.target.closest("button[data-group]") : null;
  if (!b) return;
  var group = b.getAttribute("data-group");
  var value = b.getAttribute("data-value");
  if (group === "palette" || group === "card") state[group] = parseInt(value, 10);
  else state[group] = value;
  render();
});

render();
</script>
</body>
</html>
`

// ---------------------------------------------------------------------------
// The shared data blob. One shape, two consumers: the standalone desktop file
// inlines it as JSON, and the specimen page imports it as a TypeScript module.
// Neither is hand-copied, so the page on the branch and the file on the desktop
// cannot disagree about a hex.
// ---------------------------------------------------------------------------

const r4 = (n) => Number(n.toFixed(4))

function buildBlob() {
  const groundOut = (g) => {
    const s = groundSurfaces(g)
    return {
      id: g.id,
      family: g.family,
      hex: g.hex,
      oklch: fmt(g.actual),
      derivation: g.derivation,
      ...s,
    }
  }

  const palettes = ALL.palettes.map((p) => {
    const cells = {}
    for (const floor of FLOORS) {
      const key = floor.toFixed(1)
      cells[key] = {}
      for (const g of ALL.grounds) {
        const cell = p.byFloor[floor][g.id]
        cells[key][g.id] = {
          colours: cell.colours.map((c) => ({
            format: c.format,
            hue: r4(c.hue),
            ok: c.ok,
            hex: c.ok ? c.hex : null,
            oklch: c.ok ? fmt(c.actual) : null,
            contrast: c.ok ? r4(c.contrast) : null,
          })),
          minDistance: cell.score.minDistance === null ? null : r4(cell.score.minDistance),
          minChroma: cell.score.minChroma === null ? null : r4(cell.score.minChroma),
          failures: cell.score.failures,
        }
      }
    }
    return {
      id: p.id,
      name: p.name,
      note: p.note,
      hues: ALL.accents.map((unused, i) => r4(p.hues[p.perm[i]])),
      cells,
    }
  })

  return {
    xheight: ALL.xheight.value,
    floors: FLOORS.map((f) => f.toFixed(1)),
    formats: ALL.accents.map((a) => a.name),
    today: ALL.accents.map((a) => a.hex),
    openLight: ALL.derived.light.find((g) => g.hex === LIGHT_PICK).id,
    openDark: ALL.derived.dark.find((g) => g.hex === DARK_PICK).id,
    grounds: {
      light: ALL.derived.light.map(groundOut),
      dark: ALL.derived.dark.map(groundOut),
    },
    palettes,
  }
}

if (MODE === "emit") {
  const blob = buildBlob()
  const out = join(HERE, "ground-palettes-data.ts")
  const banner = [
    "// GENERATED by ground-palettes.mjs beside this file. Do not edit by hand.",
    "//",
    "// Regenerate with:  node src/app/specimen/ground-palettes.mjs emit",
    "//",
    "// It exists so the specimen page and the standalone offline file are fed by",
    "// one computation. A hex typed into the page by hand is a hex that can drift",
    "// from the script that justified it, and nothing on the page would show it.",
    "",
    "export interface SpecimenGround {",
    "  id: string",
    "  family: string",
    "  hex: string",
    "  oklch: string",
    "  derivation: string",
    "  ink: string",
    "  step: string",
    "  rule: string",
    "  chrome: string",
    "  chromeOn: string",
    "  chromeInk: string",
    "  today: string",
    "}",
    "",
    "export interface SpecimenColour {",
    "  format: string",
    "  hue: number",
    "  ok: boolean",
    "  hex: string | null",
    "  oklch: string | null",
    "  contrast: number | null",
    "}",
    "",
    "export interface SpecimenCell {",
    "  colours: SpecimenColour[]",
    "  minDistance: number | null",
    "  minChroma: number | null",
    "  failures: number",
    "}",
    "",
    "export interface SpecimenPalette {",
    "  id: string",
    "  name: string",
    "  note: string",
    "  hues: number[]",
    "  cells: Record<string, Record<string, SpecimenCell>>",
    "}",
    "",
    "export interface SpecimenPaletteData {",
    "  xheight: string",
    "  floors: string[]",
    "  formats: string[]",
    "  today: string[]",
    "  openLight: string",
    "  openDark: string",
    "  grounds: { light: SpecimenGround[]; dark: SpecimenGround[] }",
    "  palettes: SpecimenPalette[]",
    "}",
    "",
    "export const PALETTE_DATA: SpecimenPaletteData = ",
  ].join("\n")
  writeFileSync(out, banner + JSON.stringify(blob, null, 2) + "\n", "utf8")
  const size = statSync(out).size
  console.log("wrote " + out + "  " + size + " bytes")
  console.log("grounds: " + (blob.grounds.light.length + blob.grounds.dark.length) + "   expected 12")
  console.log("palettes: " + blob.palettes.length + "   expected 4")
  console.log("floors: " + blob.floors.join(", ") + "   expected 2")
  let colours = 0
  let failures = 0
  for (const p of blob.palettes) {
    for (const f of blob.floors) {
      for (const g of Object.keys(p.cells[f])) {
        colours += p.cells[f][g].colours.length
        failures += p.cells[f][g].failures
      }
    }
  }
  console.log("colours in the blob: " + colours + "   expected 4 x 2 x 12 x 7 = " + (4 * 2 * 12 * 7))
  console.log("colours that failed their floor: " + failures)
  process.exit(colours === 4 * 2 * 12 * 7 && blob.grounds.light.length === 6 && blob.grounds.dark.length === 6 ? 0 : 1)
}

// ---------------------------------------------------------------------------
// The standalone offline file.
//
// SELF-CONTAINED IS THE WHOLE POINT: it is opened on a phone with no network,
// so a single missed external reference makes the page render in a fallback
// face and the screenshot answers a different question. The font is inlined as
// a base64 data URL and nothing else is referenced at all. The two greps in the
// report are what establishes that, and they are shown firing on a deliberately
// broken copy before they are trusted on this one.
// ---------------------------------------------------------------------------

const READING_FONT = join(HERE, "..", "..", "..", "public", "specimen-fonts", "eb-garamond", "eb-garamond-latin-var.woff2")

// Only ONE face is embedded. The reading face is settled -- EB Garamond, with
// the x-height correction the app carries -- so the other three candidates from
// the previous batch would be weight without a question attached to them.

const HEADLINE = "Lise Meitner worked out the arithmetic of fission on a walk through the snow"

const BODY =
  "In December 1938, Otto Hahn wrote to Lise Meitner from Berlin with a result he could not " +
  "explain. He had bombarded uranium with neutrons and found barium in the residue, an element " +
  "with roughly half the atomic mass. Meitner, who had fled to Sweden that July, read the letter " +
  "in Kungalv over Christmas. Walking in the snow with her nephew Otto Frisch, she did the sum on " +
  "a scrap of paper, and the missing fifth of a proton mass came to roughly 200 million electron " +
  "volts per event."

const META = "12 min read - MEDIUM - 4 sources - 2026"

const CARD_TEXT =
  "Bohr had described the nucleus as a liquid drop, and a drop that elongates far enough will " +
  "pinch in two."

function buildHtml(blob) {
  const font = readFileSync(READING_FONT).toString("base64")
  const data = JSON.stringify(blob)
  // replaceAll, and every replacement passed as a FUNCTION. Two reasons, both of
  // them silent failures otherwise: __XHEIGHT__ appears three times in the CSS
  // and a plain .replace would fill in only the first, and a string replacement
  // treats a dollar sign in the payload as a capture-group reference, which the
  // base64 font or the JSON could carry.
  return HTML_TEMPLATE
    .replaceAll("__FONT_BASE64__", () => font)
    .replaceAll("__DATA__", () => data)
    .replaceAll("__XHEIGHT__", () => blob.xheight)
    .replaceAll("__HEADLINE__", () => HEADLINE)
    .replaceAll("__BODY__", () => BODY)
    .replaceAll("__META__", () => META)
    .replaceAll("__CARD_TEXT__", () => CARD_TEXT)
}

if (MODE === "html") {
  const out = process.argv[3]
  if (!out) {
    console.error("FAIL: pass the output path, e.g. html /c/Users/marlo/OneDrive/Desktop/specimen.html")
    process.exit(1)
  }
  const html = buildHtml(buildBlob())
  writeFileSync(out, html, "utf8")
  const size = statSync(out).size
  console.log("wrote " + out)
  console.log("bytes: " + size + "   (" + (size / 1024 / 1024).toFixed(3) + " MB, ceiling 3 MB)")
  console.log("base64 font payloads in the file: " + (html.match(/data:font\/woff2;base64,/g) || []).length + "   expected 1")
  process.exit(size < 3 * 1024 * 1024 ? 0 : 1)
}

console.error("unknown mode: " + MODE)
process.exit(1)
