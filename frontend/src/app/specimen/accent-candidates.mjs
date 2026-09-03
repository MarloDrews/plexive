// Accent candidates for a light (beige) ground. Run by hand, never imported.
//
//   node src/app/specimen/accent-candidates.mjs prove
//   node src/app/specimen/accent-candidates.mjs
//   node src/app/specimen/accent-candidates.mjs contrast
//   node src/app/specimen/accent-candidates.mjs emit
//
// WHY THIS EXISTS. The seven format accents in globals.css were equalized in
// OKLCH at a single lightness of L=0.75, which sits almost exactly at the
// lightness of the candidate beige grounds. The 2026-09-03 design token
// inventory measured all seven between 1.69:1 and 2.17:1 on all three beiges,
// below even the 3:1 floor a non-text element needs. A beige theme therefore
// needs accents built at a LOWER lightness, and this script builds two sets so
// they can be looked at side by side on the specimen page.
//
// NO NEW DEPENDENCY. The sRGB <-> OKLab conversion is written out below from
// Bjorn Ottosson's published matrices rather than pulled from culori/colorjs,
// because this is one throwaway script for one decision and a dependency in
// package.json would outlive it. The cost of writing it by hand is that it can
// be confidently wrong, which is what the `prove` mode exists to catch: run it
// FIRST and read the round-trip error before believing any number below.
//
// The accents are READ FROM globals.css at run time, not copied here, so a
// stale copy cannot silently produce a table about colours the app no longer
// has. The parse asserts on a count and refuses to print a table if it finds
// anything other than the seven it expects.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// The sRGB <-> OKLab/OKLCH conversion, the WCAG contrast formula and the two
// print helpers now live in oklch.mjs beside this file, imported rather than
// carried twice: ground-palettes.mjs needs the same maths, and the round-trip
// proof in `prove` mode below is what makes any number here believable, so a
// second hand-typed copy of Ottosson's matrices would be a second thing to
// prove. The functions moved verbatim; nothing in them changed.
import {
  parseHex,
  hexToOklch,
  oklchToHex,
  maxChroma,
  ratio,
  fmt,
  pad,
} from "./oklch.mjs"

// The three beige grounds the specimen page carries, and the app's own dark
// base, so a candidate's cost on the ground that ships today is visible too.
const GROUNDS = [
  { key: "L1", hex: "#FAF6EE" },
  { key: "L2", hex: "#F4EFE6" },
  { key: "L3", hex: "#EDE4D3" },
]

// SC 1.4.3 for small coloured text, SC 1.4.11 for a thin coloured rule.
const TEXT_MIN = 4.5
const NONTEXT_MIN = 3
// ---------------------------------------------------------------------------
// The accents, read from globals.css this run, with their line numbers.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const GLOBALS = join(HERE, "..", "globals.css")

// --color-fmt-neutral is deliberately NOT one of the seven: it is the fallback
// style for an unknown format id (FALLBACK_FORMAT_STYLE in lib/formats.ts) and
// it is the one token in the block that was never equalized at L=0.75.
const EXPECTED = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]

function readAccents() {
  const lines = readFileSync(GLOBALS, "utf8").split(/\r?\n/)
  const found = []
  lines.forEach((line, i) => {
    const m = /^\s*--color-fmt-([a-z]+):\s*(#[0-9a-fA-F]{3,8});/.exec(line)
    if (m && EXPECTED.includes(m[1])) {
      found.push({ name: m[1], hex: m[2], line: i + 1 })
    }
  })
  if (found.length !== EXPECTED.length) {
    console.error(
      "FAIL: expected " + EXPECTED.length + " format accents in globals.css, found " + found.length + ".",
    )
    console.error("Either the token block was renamed or this script is reading the wrong file.")
    process.exit(1)
  }
  return found
}

// ---------------------------------------------------------------------------
// The two candidate sets.
//
// Hue is held exactly, because the question the specimen page asks is whether a
// darker colour still READS as the colour that format has today, and moving the
// hue would make that question unanswerable. Lightness is set outright. Chroma
// takes the largest value the sRGB gamut allows at that lightness, capped at
// 1.4x the original: uncapped, dropping the lightness lets chroma roughly
// double for some hues and the accent stops looking like the same family.
// ---------------------------------------------------------------------------

const SETS = [
  { key: "A", L: 0.5 },
  { key: "B", L: 0.44 },
]
const CHROMA_CAP = 1.4

function candidate(original, targetL) {
  const ceiling = maxChroma(targetL, original.h)
  const C = Math.min(ceiling, original.C * CHROMA_CAP)
  const oklch = { L: targetL, C, h: original.h }
  const hex = oklchToHex(oklch)
  // The OKLCH triple of the hex ACTUALLY PRODUCED, not of the request: an 8-bit
  // hex cannot hold an arbitrary triple, so these differ slightly and printing
  // the requested one would overstate what the page can render.
  return { hex, requested: oklch, actual: hexToOklch(hex), ceiling }
}

// ---------------------------------------------------------------------------

const MODE = process.argv[2] || "table"

if (MODE === "prove") {
  // Run BEFORE any converted value is believed. Three inputs with known answers.
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

  // The contrast half of the script has its own two known answers, carried over
  // from the inventory batch so a changed formula would show up here.
  console.log("")
  const extreme = ratio("#000000", "#FFFFFF")
  const mid = ratio("#777777", "#FFFFFF")
  const contrastPass = Math.abs(extreme - 21) < 1e-9 && mid < 4.5
  console.log("#000000 on #FFFFFF -> " + extreme.toFixed(4) + "   expected exactly 21")
  console.log("#777777 on #FFFFFF -> " + mid.toFixed(4) + "   expected below 4.5")
  console.log("   PASS: " + contrastPass)
  ok = ok && contrastPass

  console.log("")
  console.log("round trip, all seven accents: hex -> OKLCH -> hex")
  let worst = 0
  for (const accent of readAccents()) {
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

  if (!ok) {
    console.log("")
    console.log("FAIL: the conversion is broken. No candidate value below may be believed.")
  }
  process.exit(ok ? 0 : 1)
}

const accents = readAccents()

if (MODE === "step") {
  // The card panel's "step" treatment needs an opaque value ONE STEP from each
  // ground, and the step has to be the same size on beige as on dark or the
  // panel compares two different questions. The app's own step is the size
  // taken: --color-surface-0 #0a0a0a to --color-surface-1 #141414
  // (globals.css:60-61), which is also exactly what rgb(255 255 255 / 0.04)
  // composites to over the base, so it is the step the product already uses.
  //
  // It is carried across as a LIGHTNESS DIFFERENCE IN OKLAB rather than as
  // +10 per channel: 10/255 near black is a large perceptual step and near
  // beige it is almost nothing, so copying the channel arithmetic would put a
  // visible step on the dark grounds and an invisible one on the beige ones,
  // and the panel would answer "beige cards cannot be stepped" when the real
  // answer is "the step was measured in the wrong space".
  const base = hexToOklch("#0a0a0a")
  const slab = hexToOklch("#141414")
  const deltaL = slab.L - base.L
  console.log("app pair: #0a0a0a " + fmt(base) + "  ->  #141414 " + fmt(slab))
  console.log("delta L = " + deltaL.toFixed(6))
  console.log("")
  console.log("dark grounds step LIGHTER by that delta, beige grounds step DARKER by it:")
  const SPECIMEN_GROUNDS = [
    ["L1", "#FAF6EE", -1],
    ["L2", "#F4EFE6", -1],
    ["L3", "#EDE4D3", -1],
    ["D1", "#0B0E15", +1],
    ["D2", "#0F1117", +1],
    ["D3", "#070910", +1],
  ]
  for (const [key, hex, sign] of SPECIMEN_GROUNDS) {
    const g = hexToOklch(hex)
    const stepped = { L: g.L + sign * deltaL, C: g.C, h: g.h }
    console.log(
      "  " + pad(key, 4) + pad(hex, 10) + fmt(g) + "  ->  " + pad(oklchToHex(stepped), 10) +
      fmt(hexToOklch(oklchToHex(stepped))),
    )
  }
  process.exit(0)
}

if (MODE === "contrast") {
  const rows = accents.map((accent) => {
    const original = hexToOklch(accent.hex)
    return {
      name: accent.name,
      today: accent.hex,
      A: candidate(original, SETS[0].L).hex,
      B: candidate(original, SETS[1].L).hex,
    }
  })

  for (const set of ["today", "A", "B"]) {
    const title =
      set === "today"
        ? "=== SHIPPING VALUES (globals.css), for comparison ==="
        : "=== SET " + set + ", lightness " + SETS[set === "A" ? 0 : 1].L.toFixed(2) + " ==="
    console.log(title)
    console.log(pad("accent", 11) + pad("hex", 10) + GROUNDS.map((g) => pad(g.key, 8)).join(""))
    for (const row of rows) {
      console.log(
        pad(row.name, 11) + pad(row[set], 10) +
        GROUNDS.map((g) => pad(ratio(row[set], g.hex).toFixed(2), 8)).join(""),
      )
    }
    console.log("")
  }

  console.log("ground keys: " + GROUNDS.map((g) => g.key + "=" + g.hex).join("  "))
  console.log("")
  console.log(
    "--- one line per accent: does it clear " + TEXT_MIN + ":1 (small coloured text, SC 1.4.3) " +
    "and " + NONTEXT_MIN + ":1 (a 2px coloured rule, SC 1.4.11) on ALL THREE beiges? ---",
  )
  for (const row of rows) {
    const parts = ["today", "A", "B"].map((set) => {
      const ratios = GROUNDS.map((g) => ratio(row[set], g.hex))
      const worst = Math.min(...ratios)
      const label = set === "today" ? "today" : "set " + set
      return (
        label + " " + row[set] + " worst " + worst.toFixed(2) + ":1 -> " +
        (worst >= TEXT_MIN ? "clears 4.5" : "FAILS 4.5") + ", " +
        (worst >= NONTEXT_MIN ? "clears 3" : "FAILS 3")
      )
    })
    console.log(pad(row.name, 11) + parts[0])
    console.log(pad("", 11) + parts[1])
    console.log(pad("", 11) + parts[2])
  }
  process.exit(0)
}

if (MODE === "emit") {
  // Paste-ready literal for the specimen page, so the page's numbers and this
  // script's numbers cannot drift apart by hand-copying.
  for (const accent of accents) {
    const original = hexToOklch(accent.hex)
    const a = candidate(original, SETS[0].L)
    const b = candidate(original, SETS[1].L)
    console.log(
      '  { name: "' + accent.name + '", today: "' + accent.hex +
      '", setA: "' + a.hex + '", setB: "' + b.hex + '" },',
    )
  }
  process.exit(0)
}

console.log("accents read from " + GLOBALS)
for (const accent of accents) {
  console.log("  globals.css:" + accent.line + "  --color-fmt-" + accent.name + ": " + accent.hex)
}
console.log("")
console.log("chroma rule: largest in sRGB gamut at the target lightness, capped at " + CHROMA_CAP + "x the original")
console.log("hue: held exactly")
console.log("")

for (const set of SETS) {
  console.log("=== SET " + set.key + ", lightness " + set.L.toFixed(2) + " ===")
  console.log(
    pad("accent", 11) + pad("today", 10) + pad("today OKLCH", 28) +
    pad("new", 10) + pad("new OKLCH", 28) + "gamut ceiling C",
  )
  for (const accent of accents) {
    const original = hexToOklch(accent.hex)
    const c = candidate(original, set.L)
    console.log(
      pad(accent.name, 11) + pad(accent.hex, 10) + pad(fmt(original), 28) +
      pad(c.hex, 10) + pad(fmt(c.actual), 28) + c.ceiling.toFixed(4) +
      (c.ceiling < original.C * CHROMA_CAP ? "  (gamut-limited)" : "  (cap-limited)"),
    )
  }
  console.log("")
}
