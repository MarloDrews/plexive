// The four candidate dark-ground equivalents of the seven settled light-ground
// accents. Run by hand, never imported by the app.
//
//   node src/app/specimen/dark-equivalents.mjs prove       # run this FIRST
//   node src/app/specimen/dark-equivalents.mjs light       # the seven settled light values
//   node src/app/specimen/dark-equivalents.mjs sets        # the four sets, with all scores
//   node src/app/specimen/dark-equivalents.mjs emit        # writes dark-equivalents-data.ts
//   node src/app/specimen/dark-equivalents.mjs html <out>  # writes the standalone file
//
// WHY THIS EXISTS. The seven light-ground accents are settled: Marlo chose them
// on #F5ECDB by looking. What he asked for on the dark ground is that they are
// THE SAME SEVEN COLOURS, READING THE SAME WAY -- explicitly not that they carry
// the same hex. That is a real requirement with more than one defensible answer,
// so four are produced and none is ranked.
//
//   E1 identical  takes the requirement literally: the same hex on both grounds.
//   E2 mirrored   takes it as a RELATIONSHIP TO THE GROUND: the same OKLCH
//                 lightness gap from the ground, in the direction the ground
//                 allows (darker than paper, lighter than ink).
//   E3 today      is the palette the app already ships, read from globals.css.
//                 It might already be the answer, since the light values were
//                 derived from today's hues.
//   E4 brighter   exists so E2 is not judged only against its own neighbours:
//                 the lightness whose contrast on the dark ground is nearest 6.0.
//
// CRITERION 7 IS THE ONE THAT MATTERS: the OKLab distance between each dark
// value and its own light counterpart. Everything else describes a set; that
// number says how far the set drifts from the colour it is meant to be the
// equivalent OF. E1 is zero by construction and is the reference.
//
// NO NEW DEPENDENCY. All colour maths is imported from oklch.mjs beside this
// file, the same module ground-palettes.mjs and accent-candidates.mjs use, so
// Ottosson's matrices exist once here and are proved once. The HTML builder
// below follows ground-palettes.mjs: one String.raw template with named
// __TOKEN__ placeholders filled by replaceAll with FUNCTION replacements.

import { readFileSync, writeFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  hexToOklch,
  oklchToHex,
  parseHex,
  maxChroma,
  oklabDistance,
  ratio,
  fmt,
  pad,
} from "./oklch.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const GLOBALS = join(HERE, "..", "globals.css")

// ---------------------------------------------------------------------------
// The floor. 3.0 is WCAG SC 1.4.11, and it is what applies here because the
// accent usage is settled: a rule and a glyph, with the format name set in
// ordinary text colour. 4.5 would be required only if the accent carried the
// name AS TEXT, and that usage was dropped.
// ---------------------------------------------------------------------------

const FLOOR = 3.0

// The target E4 aims at. Not a standard, just a brighter point than E2 tends to
// land on, so the comparison has a top end.
const E4_TARGET = 6.0

const FORMATS = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]

// ---------------------------------------------------------------------------
// THE TWO GROUNDS, read from globals.css this run rather than retyped, and then
// checked against the values this batch was briefed with. A retyped ground is a
// ground that can drift from the app by one character, and every contrast
// number below is measured against it.
// ---------------------------------------------------------------------------

const BRIEFED_LIGHT_GROUND = "#F5ECDB"
const BRIEFED_DARK_GROUND = "#0D0F17"

function readGrounds() {
  // .split(/\r?\n/) and not .split("\n"): core.autocrlf is true system-wide on
  // this machine, so a checked-out file is CRLF in the working tree even though
  // its blob is LF, and a bare newline split leaves a stray carriage return on
  // every line.
  const lines = readFileSync(GLOBALS, "utf8").split(/\r?\n/)
  const found = []
  lines.forEach((line, i) => {
    const m = /^\s*--color-surface-0:\s*(#[0-9a-fA-F]{6});/.exec(line)
    if (m) found.push({ hex: m[1].toUpperCase(), line: i + 1 })
  })
  if (found.length !== 2) {
    console.error("FAIL: expected exactly 2 --color-surface-0 declarations in globals.css, found " + found.length + ".")
    process.exit(1)
  }
  // The first is the dark base inside the theme block; the second is the parked
  // light ground. Order is not trusted from position: the prove mode asserts
  // each against the briefed value.
  const [first, second] = found
  return { dark: first, light: second }
}

// ---------------------------------------------------------------------------
// THE SEVEN SETTLED LIGHT VALUES. These are P3 at floor 3.0 on #F5ECDB from
// research/ground-pairs-and-palettes-2026-09-03.md, and they are SETTLED: not a
// candidate, not recomputed, not open to being improved by this script. They
// are written out here because they are an INPUT to this batch, and the "light"
// mode below prints each one's measured OKLCH and contrast so the starting
// point is on the record rather than assumed.
// ---------------------------------------------------------------------------

const LIGHT_VALUES = {
  books: "#AF8100",
  facts: "#0083FF",
  people: "#F600DB",
  concepts: "#8B00FF",
  questions: "#009899",
  stories: "#FF001E",
  academy: "#009D55",
}

// ---------------------------------------------------------------------------
// E3, the palette the app ships today, read from globals.css with line numbers,
// so the claim "these are the same colours" can be checked against the hues
// rather than asserted. The neutral fallback token is deliberately not one of
// the seven: it is the unknown-format colour and was never equalized with them.
// ---------------------------------------------------------------------------

function readTodayAccents() {
  const lines = readFileSync(GLOBALS, "utf8").split(/\r?\n/)
  const found = []
  lines.forEach((line, i) => {
    const m = /^\s*--color-fmt-([a-z]+):\s*(#[0-9a-fA-F]{3,8});/.exec(line)
    if (m && FORMATS.includes(m[1])) found.push({ name: m[1], hex: m[2].toUpperCase(), line: i + 1 })
  })
  if (found.length !== FORMATS.length) {
    console.error("FAIL: expected " + FORMATS.length + " format accents in globals.css, found " + found.length + ".")
    process.exit(1)
  }
  return found
}

// ---------------------------------------------------------------------------
// THE FOUR RULES.
// ---------------------------------------------------------------------------

// E2. Hold hue and chroma. Set lightness so the OKLCH lightness DIFFERENCE from
// the ground matches, with the sign flipped: on paper the accent is darker than
// the ground, on the dark ground it must be lighter.
function mirrored(lightHex, lightGround, darkGround) {
  const src = hexToOklch(lightHex)
  const gL = hexToOklch(lightGround).L
  const gD = hexToOklch(darkGround).L
  const gap = Math.abs(gL - src.L)
  const L = gD + gap
  return solveAt(L, src, "mirrored")
}

// E4. Hold hue and chroma. Walk lightness and keep the one whose contrast
// against the dark ground, RE-MEASURED FROM THE RENDERED HEX, is closest to 6.0.
// Measuring from the hex and not from the float is the point: an 8-bit channel
// is what a screen shows, and a value that clears a floor before rounding and
// misses it after is a value that does not clear the floor.
function brighter(lightHex, darkGround) {
  const src = hexToOklch(lightHex)
  let best = null
  for (let i = 0; i <= 10000; i += 1) {
    const L = i / 10000
    const c = solveAt(L, src, "brighter")
    const d = Math.abs(ratio(c.hex, darkGround) - E4_TARGET)
    if (best === null || d < best.d) best = { d, c }
  }
  return best.c
}

// Shared by E2 and E4. At a given lightness the requested chroma may be outside
// the sRGB gamut; reduce it to the largest chroma that fits and record BY HOW
// MUCH, because a silent reduction is a colour that is not the colour the rule
// asked for while looking like one that is.
function solveAt(L, src, rule) {
  const clampedL = Math.min(1, Math.max(0, L))
  const limit = maxChroma(clampedL, src.h)
  const C = Math.min(src.C, limit)
  const reduced = src.C - C
  const oklch = { L: clampedL, C, h: src.h }
  return {
    hex: oklchToHex(oklch).toUpperCase(),
    requestedL: L,
    clampedToRange: L !== clampedL,
    chromaRequested: src.C,
    chromaUsed: C,
    chromaReduced: reduced,
    rule,
  }
}

// Can this hue clear the floor on this ground AT ANY LIGHTNESS, taking the most
// chroma the gamut allows at each? This is what separates "the rule produced a
// colour that misses the floor" from "no colour at this hue could have cleared
// it", and criterion 5 asks for the second to be printed as a failure.
function bestPossibleOnGround(hue, ground) {
  let best = { contrast: 0, hex: null, L: null }
  for (let i = 0; i <= 1000; i += 1) {
    const L = i / 1000
    const hex = oklchToHex({ L, C: maxChroma(L, hue), h: hue }).toUpperCase()
    const r = ratio(hex, ground)
    if (r > best.contrast) best = { contrast: r, hex, L }
  }
  return best
}

// ---------------------------------------------------------------------------
// Assembling one set.
// ---------------------------------------------------------------------------

function describe(format, hex, lightHex, darkGround, note) {
  const oklch = hexToOklch(hex)
  const contrast = ratio(hex, darkGround)
  const clears = contrast >= FLOOR
  // Only ask the expensive question when the answer matters.
  const ceiling = clears ? null : bestPossibleOnGround(oklch.h, darkGround)
  return {
    format,
    hex,
    oklch: fmt(oklch),
    L: oklch.L,
    C: oklch.C,
    h: oklch.h,
    contrast,
    clears,
    // null when it clears; otherwise true when no colour at this hue could have
    // cleared the floor, which is the difference between a rule that missed and
    // a hue that cannot.
    impossible: ceiling === null ? null : ceiling.contrast < FLOOR,
    ceiling,
    distanceToCounterpart: oklabDistance(hex, lightHex),
    note: note || "",
  }
}

function scoreSet(colours) {
  // Smallest pairwise OKLab distance among the seven: how close the two nearest
  // members of the set are to each other, which is what makes two formats
  // confusable at a glance.
  let minPair = Infinity
  let minPairWho = ""
  for (let i = 0; i < colours.length; i += 1) {
    for (let j = i + 1; j < colours.length; j += 1) {
      const d = oklabDistance(colours[i].hex, colours[j].hex)
      if (d < minPair) {
        minPair = d
        minPairWho = colours[i].format + " / " + colours[j].format
      }
    }
  }
  const minChroma = Math.min(...colours.map((c) => c.C))
  const minChromaWho = colours.find((c) => c.C === minChroma).format
  const dists = colours.map((c) => c.distanceToCounterpart)
  return {
    minPairwiseDistance: minPair,
    minPairwiseBetween: minPairWho,
    minChroma,
    minChromaFormat: minChromaWho,
    failures: colours.filter((c) => !c.clears).length,
    impossible: colours.filter((c) => c.impossible === true).length,
    maxDistanceToCounterpart: Math.max(...dists),
    meanDistanceToCounterpart: dists.reduce((a, b) => a + b, 0) / dists.length,
  }
}

function buildSets() {
  const grounds = readGrounds()
  const today = readTodayAccents()
  const LG = grounds.light.hex
  const DG = grounds.dark.hex

  const todayByName = Object.fromEntries(today.map((t) => [t.name, t]))

  const sets = []

  sets.push({
    key: "E1",
    name: "E1 identical",
    blurb: "The same hex as the light value. Takes the requirement literally.",
    colours: FORMATS.map((f) =>
      describe(f, LIGHT_VALUES[f].toUpperCase(), LIGHT_VALUES[f], DG, "same hex as the light value"),
    ),
  })

  sets.push({
    key: "E2",
    name: "E2 mirrored",
    blurb:
      "Hue and chroma held from the light value; lightness set so the OKLCH lightness gap to " +
      DG + " equals the gap the light value has to " + LG + ", lighter than its ground.",
    colours: FORMATS.map((f) => {
      const r = mirrored(LIGHT_VALUES[f], LG, DG)
      const note =
        (r.chromaReduced > 1e-6
          ? "chroma reduced " + r.chromaRequested.toFixed(4) + " -> " + r.chromaUsed.toFixed(4) +
            " (by " + r.chromaReduced.toFixed(4) + ") to fit sRGB at L " + r.requestedL.toFixed(4)
          : "chroma held at " + r.chromaUsed.toFixed(4)) +
        (r.clampedToRange ? "; requested lightness " + r.requestedL.toFixed(4) + " clamped into 0..1" : "")
      return describe(f, r.hex, LIGHT_VALUES[f], DG, note)
    }),
  })

  sets.push({
    key: "E3",
    name: "E3 today",
    blurb: "The seven values the app ships today, read from globals.css this run.",
    colours: FORMATS.map((f) => {
      const t = todayByName[f]
      return describe(f, t.hex, LIGHT_VALUES[f], DG, "globals.css line " + t.line)
    }),
  })

  sets.push({
    key: "E4",
    name: "E4 brighter",
    blurb:
      "Hue and chroma held from the light value; lightness set to the value whose WCAG contrast " +
      "against " + DG + " is closest to " + E4_TARGET.toFixed(1) + ".",
    colours: FORMATS.map((f) => {
      const r = brighter(LIGHT_VALUES[f], DG)
      const note =
        r.chromaReduced > 1e-6
          ? "chroma reduced " + r.chromaRequested.toFixed(4) + " -> " + r.chromaUsed.toFixed(4) +
            " (by " + r.chromaReduced.toFixed(4) + ") to fit sRGB at L " + r.requestedL.toFixed(4)
          : "chroma held at " + r.chromaUsed.toFixed(4)
      return describe(f, r.hex, LIGHT_VALUES[f], DG, note)
    }),
  })

  sets.forEach((s) => {
    s.scores = scoreSet(s.colours)
  })

  const light = FORMATS.map((f) => {
    const hex = LIGHT_VALUES[f].toUpperCase()
    const o = hexToOklch(hex)
    const c = ratio(hex, LG)
    return { format: f, hex, oklch: fmt(o), L: o.L, C: o.C, h: o.h, contrast: c, clears: c >= FLOOR }
  })

  return { grounds, today, sets, light, lightGround: LG, darkGround: DG }
}

// ---------------------------------------------------------------------------
// Modes.
// ---------------------------------------------------------------------------

const MODE = process.argv[2] || "sets"

if (MODE === "prove") {
  // Run BEFORE any value below is believed. Every check has a known answer, and
  // the two checks whose job is to report an absence are shown finding something
  // first, so neither is trusted only for coming back empty.
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
  console.log("round trip of the SEVEN SETTLED LIGHT VALUES: hex -> OKLCH -> hex")
  let worst = 0
  for (const f of FORMATS) {
    const hex = LIGHT_VALUES[f].toUpperCase()
    const back = oklchToHex(hexToOklch(hex)).toUpperCase()
    const before = parseHex(hex)
    const after = parseHex(back)
    const diff = Math.max(...before.map((c, i) => Math.abs(c - after[i])))
    worst = Math.max(worst, diff)
    console.log("   " + pad(f, 11) + pad(hex, 10) + "-> " + pad(back, 10) + "max per-channel diff " + diff)
  }
  console.log("")
  console.log("MAXIMUM PER-CHANNEL DIFFERENCE, all seven, in 0-255 units: " + worst)
  const tripPass = worst === 0
  console.log("   expected 0. PASS: " + tripPass)
  ok = ok && tripPass

  console.log("")
  const g = readGrounds()
  console.log("grounds read from globals.css:")
  console.log("   dark  line " + g.dark.line + ": " + g.dark.hex + "   briefed " + BRIEFED_DARK_GROUND)
  console.log("   light line " + g.light.line + ": " + g.light.hex + "   briefed " + BRIEFED_LIGHT_GROUND)
  const groundPass = g.dark.hex === BRIEFED_DARK_GROUND && g.light.hex === BRIEFED_LIGHT_GROUND
  console.log("   expected the file to agree with the brief. PASS: " + groundPass)
  ok = ok && groundPass

  const today = readTodayAccents()
  console.log("")
  console.log("format accents found in globals.css: " + today.length + "   expected 7")
  const countPass = today.length === 7
  console.log("   PASS: " + countPass)
  ok = ok && countPass

  // The rules themselves, each on a known case.
  console.log("")
  const m = mirrored("#0083FF", BRIEFED_LIGHT_GROUND, BRIEFED_DARK_GROUND)
  const gapLight = hexToOklch(BRIEFED_LIGHT_GROUND).L - hexToOklch("#0083FF").L
  const gapDark = hexToOklch(m.hex).L - hexToOklch(BRIEFED_DARK_GROUND).L
  console.log("E2 rule on facts #0083FF -> " + m.hex)
  console.log("   gap from the light ground: " + gapLight.toFixed(4))
  console.log("   gap from the dark ground:  " + gapDark.toFixed(4) + "   (measured back from the rendered hex)")
  // Rounding to 8 bits moves the lightness a little, so the tolerance is about
  // the size of one 8-bit step near this lightness rather than zero.
  const mirrorPass = Math.abs(gapLight - gapDark) < 0.004 && gapDark > 0
  console.log("   expected the two gaps equal to within one 8-bit step, and the colour LIGHTER than its ground.")
  console.log("   PASS: " + mirrorPass)
  ok = ok && mirrorPass

  console.log("")
  const b = brighter("#0083FF", BRIEFED_DARK_GROUND)
  const bContrast = ratio(b.hex, BRIEFED_DARK_GROUND)
  const brightPass = Math.abs(bContrast - E4_TARGET) < 0.05
  console.log("E4 rule on facts #0083FF: " + b.hex + "  contrast on " + BRIEFED_DARK_GROUND + " = " + bContrast.toFixed(4))
  console.log("   expected within 0.05 of " + E4_TARGET.toFixed(1) + ". PASS: " + brightPass)
  ok = ok && brightPass

  // The impossibility check, in BOTH directions. It exists to report an absence
  // -- "no lightness at this hue clears the floor" -- and an absence is the
  // result believed too easily, so it is first shown finding something.
  console.log("")
  const canDo = bestPossibleOnGround(255.4, BRIEFED_DARK_GROUND)
  console.log("best any colour at hue 255.4 can reach on " + BRIEFED_DARK_GROUND + ": " +
    canDo.contrast.toFixed(4) + ":1 at " + canDo.hex + " (L " + canDo.L + ")")
  const possiblePass = canDo.contrast >= FLOOR
  console.log("   expected AT OR ABOVE the " + FLOOR.toFixed(1) + " floor, so the check does not call a reachable hue impossible.")
  console.log("   PASS: " + possiblePass)
  ok = ok && possiblePass

  const cannot = bestPossibleOnGround(255.4, "#FFFFFF")
  console.log("best any colour at hue 255.4 can reach on #FFFFFF: " + cannot.contrast.toFixed(4) + ":1")
  const impossiblePass = cannot.contrast < 25
  console.log("   expected BELOW an absurd floor of 25, so the same check does fire when a floor is unreachable.")
  console.log("   PASS: " + impossiblePass)
  ok = ok && impossiblePass

  // The distance metric, on two cases with known answers.
  console.log("")
  const zero = oklabDistance("#AF8100", "#AF8100")
  const far = oklabDistance("#000000", "#FFFFFF")
  const distPass = zero === 0 && Math.abs(far - 1) < 1e-6
  console.log("OKLab distance #AF8100 to itself:  " + zero.toFixed(6) + "   expected 0")
  console.log("OKLab distance #000000 to #FFFFFF: " + far.toFixed(6) + "   expected 1")
  console.log("   PASS: " + distPass)
  ok = ok && distPass

  if (!ok) {
    console.log("")
    console.log("FAIL: no number this script prints may be believed.")
  }
  process.exit(ok ? 0 : 1)
}

const ALL = buildSets()

if (MODE === "light") {
  console.log("THE SEVEN SETTLED LIGHT VALUES on the light ground " + ALL.lightGround +
    " (globals.css line " + ALL.grounds.light.line + ")")
  console.log("floor " + FLOOR.toFixed(1) + ", the 1.4.11 floor for an accent that carries a rule and a glyph")
  console.log("")
  console.log(pad("format", 11) + pad("hex", 10) + pad("OKLCH", 32) + pad("contrast", 10) + "clears 3.0")
  ALL.light.forEach((c) => {
    console.log(pad(c.format, 11) + pad(c.hex, 10) + pad(c.oklch, 32) +
      pad(c.contrast.toFixed(2) + ":1", 10) + (c.clears ? "yes" : "NO"))
  })
  console.log("")
  console.log("colours below the floor: " + ALL.light.filter((c) => !c.clears).length + "   expected 0")
  process.exit(0)
}

if (MODE === "sets") {
  console.log("DARK GROUND " + ALL.darkGround + " (globals.css line " + ALL.grounds.dark.line + ")")
  console.log("LIGHT GROUND " + ALL.lightGround + " (globals.css line " + ALL.grounds.light.line + ")")
  console.log("floor " + FLOOR.toFixed(1) + "   distance metric: Euclidean in OKLab, the same metric the previous batch used")
  console.log("")

  // The hue column E3's claim rests on, printed once rather than per set.
  console.log("HUE COMPARISON, today's shipped dark value against its settled light counterpart.")
  console.log("This is the pair of columns the claim that E3 is already the same colours rests on.")
  console.log("")
  console.log(pad("format", 11) + pad("light hex", 11) + pad("light hue", 12) +
    pad("today hex", 11) + pad("today hue", 12) + "difference")
  const e3 = ALL.sets.find((s) => s.key === "E3")
  ALL.light.forEach((l, i) => {
    const t = e3.colours[i]
    let d = Math.abs(t.h - l.h)
    if (d > 180) d = 360 - d
    console.log(pad(l.format, 11) + pad(l.hex, 11) + pad(l.h.toFixed(2), 12) +
      pad(t.hex, 11) + pad(t.h.toFixed(2), 12) + d.toFixed(2) + " deg")
  })
  console.log("")

  ALL.sets.forEach((s) => {
    console.log("=".repeat(104))
    console.log(s.name)
    console.log("  " + s.blurb)
    console.log("")
    console.log("  " + pad("format", 11) + pad("hex", 10) + pad("OKLCH", 32) +
      pad("contrast", 11) + pad("clears 3.0", 17) + "OKLab dist to counterpart")
    s.colours.forEach((c) => {
      const verdict = c.clears ? "yes" : c.impossible ? "NO - IMPOSSIBLE" : "NO - FAILURE"
      console.log("  " + pad(c.format, 11) + pad(c.hex, 10) + pad(c.oklch, 32) +
        pad(c.contrast.toFixed(2) + ":1", 11) + pad(verdict, 17) + c.distanceToCounterpart.toFixed(4))
    })
    console.log("")
    s.colours.forEach((c) => {
      if (c.note) console.log("  " + pad(c.format, 11) + c.note)
    })
    s.colours.forEach((c) => {
      if (!c.clears) {
        console.log("  " + pad(c.format, 11) + "BELOW THE FLOOR at " + c.contrast.toFixed(2) +
          ":1. Best any colour at hue " + c.h.toFixed(2) + " could reach on this ground: " +
          c.ceiling.contrast.toFixed(2) + ":1 at " + c.ceiling.hex +
          (c.impossible
            ? "  -> IMPOSSIBLE at this hue, not a rule that missed."
            : "  -> reachable at this hue; the rule chose a lightness that misses."))
      }
    })
    console.log("")
    console.log("  smallest pairwise OKLab distance among the seven: " +
      s.scores.minPairwiseDistance.toFixed(4) + "   (" + s.scores.minPairwiseBetween + ")")
    console.log("  smallest chroma among the seven:                  " +
      s.scores.minChroma.toFixed(4) + "   (" + s.scores.minChromaFormat + ")")
    console.log("  colours below the 3.0 floor:                      " + s.scores.failures +
      "   of which impossible at their hue: " + s.scores.impossible)
    console.log("  largest OKLab distance to a light counterpart:    " +
      s.scores.maxDistanceToCounterpart.toFixed(4))
    console.log("  mean OKLab distance to a light counterpart:       " +
      s.scores.meanDistanceToCounterpart.toFixed(4))
    console.log("")
  })

  console.log("=".repeat(104))
  console.log("CRITERION 7 SIDE BY SIDE: OKLab distance from each dark value to its own light counterpart.")
  console.log("E1 is zero by construction and is the reference the other three are read against.")
  console.log("")
  console.log(pad("format", 11) + ALL.sets.map((s) => pad(s.key, 10)).join(""))
  FORMATS.forEach((f, i) => {
    console.log(pad(f, 11) + ALL.sets.map((s) => pad(s.colours[i].distanceToCounterpart.toFixed(4), 10)).join(""))
  })
  console.log(pad("", 11) + ALL.sets.map(() => pad("--------", 10)).join(""))
  console.log(pad("max", 11) + ALL.sets.map((s) => pad(s.scores.maxDistanceToCounterpart.toFixed(4), 10)).join(""))
  console.log(pad("mean", 11) + ALL.sets.map((s) => pad(s.scores.meanDistanceToCounterpart.toFixed(4), 10)).join(""))
  console.log("")
  console.log("Nothing above is ranked and nothing is recommended. Both scores and the distance")
  console.log("column DESCRIBE the sets; whether a set is pleasant is decided by looking.")
  process.exit(0)
}

// ---------------------------------------------------------------------------
// The shared data blob. One shape, two consumers: the standalone desktop file
// inlines it as JSON, and the specimen page imports it as a TypeScript module.
// Neither is hand-copied, so the page on the branch and the file on the desktop
// cannot disagree about a hex.
// ---------------------------------------------------------------------------

const r4 = (n) => Number(n.toFixed(4))

function buildBlob() {
  return {
    lightGround: ALL.lightGround,
    lightGroundLine: ALL.grounds.light.line,
    darkGround: ALL.darkGround,
    darkGroundLine: ALL.grounds.dark.line,
    floor: FLOOR,
    formats: FORMATS,
    light: ALL.light.map((c) => ({
      format: c.format,
      hex: c.hex,
      oklch: c.oklch,
      contrast: r4(c.contrast),
      clears: c.clears,
    })),
    sets: ALL.sets.map((s) => ({
      key: s.key,
      name: s.name,
      blurb: s.blurb,
      colours: s.colours.map((c) => ({
        format: c.format,
        hex: c.hex,
        oklch: c.oklch,
        contrast: r4(c.contrast),
        clears: c.clears,
        impossible: c.impossible,
        distanceToCounterpart: r4(c.distanceToCounterpart),
        note: c.note,
      })),
      scores: {
        minPairwiseDistance: r4(s.scores.minPairwiseDistance),
        minPairwiseBetween: s.scores.minPairwiseBetween,
        minChroma: r4(s.scores.minChroma),
        minChromaFormat: s.scores.minChromaFormat,
        failures: s.scores.failures,
        impossible: s.scores.impossible,
        maxDistanceToCounterpart: r4(s.scores.maxDistanceToCounterpart),
        meanDistanceToCounterpart: r4(s.scores.meanDistanceToCounterpart),
      },
    })),
  }
}

if (MODE === "emit") {
  const blob = buildBlob()
  const out = join(HERE, "dark-equivalents-data.ts")
  const body = [
    "// GENERATED by dark-equivalents.mjs beside this file. Do not edit by hand.",
    "//",
    "// Regenerate with:  node src/app/specimen/dark-equivalents.mjs emit",
    "//",
    "// It exists so the specimen page and the standalone offline file are fed by",
    "// one computation. A hex typed into the page by hand is a hex that can drift",
    "// from the script that justified it, and nothing on the page would show it.",
    "",
    "export interface DarkEqColour {",
    "  format: string",
    "  hex: string",
    "  oklch: string",
    "  contrast: number",
    "  clears: boolean",
    "  impossible: boolean | null",
    "  distanceToCounterpart: number",
    "  note: string",
    "}",
    "",
    "export interface DarkEqLight {",
    "  format: string",
    "  hex: string",
    "  oklch: string",
    "  contrast: number",
    "  clears: boolean",
    "}",
    "",
    "export interface DarkEqScores {",
    "  minPairwiseDistance: number",
    "  minPairwiseBetween: string",
    "  minChroma: number",
    "  minChromaFormat: string",
    "  failures: number",
    "  impossible: number",
    "  maxDistanceToCounterpart: number",
    "  meanDistanceToCounterpart: number",
    "}",
    "",
    "export interface DarkEqSet {",
    "  key: string",
    "  name: string",
    "  blurb: string",
    "  colours: DarkEqColour[]",
    "  scores: DarkEqScores",
    "}",
    "",
    "export interface DarkEqData {",
    "  lightGround: string",
    "  lightGroundLine: number",
    "  darkGround: string",
    "  darkGroundLine: number",
    "  floor: number",
    "  formats: string[]",
    "  light: DarkEqLight[]",
    "  sets: DarkEqSet[]",
    "}",
    "",
    "export const DARK_EQ_DATA: DarkEqData = " + JSON.stringify(blob, null, 2),
    "",
  ].join("\n")
  writeFileSync(out, body, "utf8")
  console.log("wrote " + out)
  console.log("sets: " + blob.sets.length + "   expected 4")
  console.log("formats: " + blob.formats.length + "   expected 7")
  console.log("light values: " + blob.light.length + "   expected 7")
  console.log("colours per set: " + blob.sets.map((s) => s.colours.length).join(", ") + "   expected 7, 7, 7, 7")
  const shapeOk =
    blob.sets.length === 4 &&
    blob.formats.length === 7 &&
    blob.light.length === 7 &&
    blob.sets.every((s) => s.colours.length === 7)
  console.log("shape holds: " + shapeOk)
  process.exit(shapeOk ? 0 : 1)
}

// ---------------------------------------------------------------------------
// The standalone offline file.
//
// SELF-CONTAINED IS THE WHOLE POINT: it is opened on a phone with no network,
// so a single missed external reference makes the page render in a fallback
// face and the screenshot answers a different question. The font is inlined as
// a base64 data URL and nothing else is referenced at all. The greps in the
// report are what establishes that, and they are shown firing on a deliberately
// broken copy before they are trusted on this one.
//
// THE TEMPLATE FOLLOWS ground-palettes.mjs. String.raw and no interpolation at
// all: every value goes in through a named __TOKEN__ replacement, so the
// template can hold ordinary JavaScript and CSS without any of it being eaten
// by the tagged-template syntax. The chrome CSS, the .accrow grid with its
// minmax(0, ...) columns, and the halfLight / halfDark element ids are carried
// over from that file unchanged -- the ids because probe-viewport.mjs measures
// both halves by id, and the minmax(0, ...) because without the 0 minimum a
// grid column refuses to shrink and the page gains a horizontal scrollbar at
// 411 pixels.
// ---------------------------------------------------------------------------

const HTML_TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plexive specimen - dark-ground equivalents of the seven settled accents</title>
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
  padding: 6px 12px 10px;
}
#controls > h2 {
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
.chromehex {
  margin: 10px 12px 14px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: #8A8A8A;
  overflow-wrap: anywhere;
}

/* The two halves. Full width, one above the other, never behind a switch, and
   deliberately SHORT: the whole point is that a light row and its dark
   equivalent sit vertically above each other on one screen, so anything that
   pushes the dark half below the fold defeats the file. */
.half { width: 100%; padding: 8px 16px 12px; }
.half p.body {
  font-family: "SpecEBGaramond", Georgia, serif;
  font-size-adjust: __XHEIGHT__;
  font-size: 1.0625rem;
  line-height: 1.6;
  margin: 3px 0 8px;
}
.halftag {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  letter-spacing: 0.04em;
  line-height: 1.4;
  margin-bottom: 2px;
  overflow-wrap: anywhere;
}

/* The seven accent rows. IDENTICAL GRID ON BOTH HALVES, which is what makes a
   colour and its equivalent line up vertically. minmax(0, ...) on every column:
   without the 0 minimum a grid column refuses to shrink below its content and
   the whole page gains a horizontal scrollbar on a narrow phone. */
.accents { display: grid; gap: 5px; }
.accrow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 116px);
  gap: 8px;
  align-items: center;
}
.accglyph { display: flex; align-items: center; gap: 8px; min-width: 0; }
.accsq { width: 12px; height: 12px; flex: none; }
.accrule { width: 28px; height: 2px; flex: none; }
.accname {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size-adjust: none;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.hex {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  line-height: 1.3;
  text-align: right;
  overflow-wrap: anywhere;
}
.accfail { font-weight: 700; }
.scores {
  margin-top: 8px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size-adjust: none;
  font-size: 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
</style>
</head>
<body>

<div id="controls">
<h2>Dark half - which equivalent set (4)</h2>
<div class="btns" id="ctl"></div>
</div>

<section class="half" id="halfLight"></section>
<section class="half" id="halfDark"></section>
<div class="chromehex" id="chromehex"></div>

<script>
"use strict";

// Everything this page shows, computed by
// frontend/src/app/specimen/dark-equivalents.mjs and inlined here. Nothing is
// fetched, and nothing is computed in the browser except the string joins below.
var D = __DATA__;

var state = { set: 0 };

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderControls() {
  var out = [];
  D.sets.forEach(function (s, i) {
    out.push('<button type="button" data-set="' + i + '" aria-pressed="' +
      (i === state.set ? "true" : "false") + '">' + esc(s.name) + "</button>");
  });
  document.getElementById("ctl").innerHTML = out.join("");
  document.getElementById("chromehex").innerHTML =
    "chrome, not part of the specimen: strip #1B1B1B, text #E8E8E8, idle button #262626 on " +
    "#3A3A3A, pressed button #E8E8E8 on #141414, label #A0A0A0, hex #8A8A8A" +
    "<br>counts read from the data: " + D.sets.length + " sets, " + D.formats.length +
    " formats, " + D.light.length + " light values, floor " + D.floor +
    "<br>x-height correction from globals.css: font-size-adjust " + D.xheight;
}

// One row builder for BOTH halves, so the two layouts cannot drift apart and a
// colour is always directly above its equivalent.
function row(c, ink, extra) {
  if (c.clears === false) {
    return '<div class="accrow">' +
      '<div class="accglyph accfail" style="color:' + ink + '">' + esc(c.format) +
      " - BELOW THE 3.0 FLOOR" + (c.impossible ? " - IMPOSSIBLE AT THIS HUE" : "") + "</div>" +
      '<div class="hex" style="color:' + ink + '">' + esc(c.hex) + "<br>" +
      esc(c.contrast.toFixed(2)) + ":1" + (extra ? "<br>" + esc(extra) : "") + "</div>" +
      "</div>";
  }
  return '<div class="accrow">' +
    '<div class="accglyph">' +
    '<span class="accrule" style="background:' + c.hex + '"></span>' +
    '<span class="accsq" style="background:' + c.hex + '"></span>' +
    '<span class="accname" style="color:' + ink + '">' + esc(c.format) + "</span>" +
    "</div>" +
    '<div class="hex" style="color:' + ink + '">' + esc(c.hex) + "<br>" +
    esc(c.contrast.toFixed(2)) + ":1" + (extra ? "<br>" + esc(extra) : "") + "</div>" +
    "</div>";
}

function renderLight() {
  var ink = "__LIGHT_INK__";
  var out = [];
  out.push('<div class="halftag">LIGHT GROUND ' + esc(D.lightGround) +
    " - globals.css line " + D.lightGroundLine +
    " - SETTLED, no controls - text ink " + ink + "</div>");
  out.push('<p class="body">__BODY__</p>');
  out.push('<div class="accents">');
  D.light.forEach(function (c) { out.push(row(c, ink, null)); });
  out.push("</div>");
  var el = document.getElementById("halfLight");
  el.style.background = D.lightGround;
  el.style.color = ink;
  el.innerHTML = out.join("");
}

function renderDark() {
  var ink = "__DARK_INK__";
  var s = D.sets[state.set];
  var out = [];
  out.push('<div class="halftag">DARK GROUND ' + esc(D.darkGround) +
    " - globals.css line " + D.darkGroundLine + " - " + esc(s.name) +
    " - text ink " + ink + "<br>" + esc(s.blurb) + "</div>");
  out.push('<p class="body">__BODY__</p>');
  out.push('<div class="accents">');
  s.colours.forEach(function (c) {
    // The third line on every dark row is criterion 7: how far this colour is,
    // in OKLab, from the light value directly above it.
    out.push(row(c, ink, "d " + c.distanceToCounterpart.toFixed(4)));
  });
  out.push("</div>");
  out.push('<div class="scores">' +
    "d = OKLab distance to the light value directly above it. Euclidean in OKLab.<br>" +
    "smallest pairwise OKLab distance among the seven: " + esc(s.scores.minPairwiseDistance.toFixed(4)) +
    " (" + esc(s.scores.minPairwiseBetween) + ")<br>" +
    "smallest chroma among the seven: " + esc(s.scores.minChroma.toFixed(4)) +
    " (" + esc(s.scores.minChromaFormat) + ")<br>" +
    "below the 3.0 floor: " + s.scores.failures + ", of which impossible at their hue: " + s.scores.impossible + "<br>" +
    "distance to counterpart, max " + esc(s.scores.maxDistanceToCounterpart.toFixed(4)) +
    ", mean " + esc(s.scores.meanDistanceToCounterpart.toFixed(4)) +
    "</div>");
  var el = document.getElementById("halfDark");
  el.style.background = D.darkGround;
  el.style.color = ink;
  el.innerHTML = out.join("");
}

function render() {
  renderControls();
  renderLight();
  renderDark();
}

document.addEventListener("click", function (ev) {
  var b = ev.target.closest ? ev.target.closest("button[data-set]") : null;
  if (!b) return;
  state.set = parseInt(b.getAttribute("data-set"), 10);
  render();
});

render();
</script>
</body>
</html>
`

const READING_FONT = join(HERE, "..", "..", "..", "public", "specimen-fonts", "eb-garamond", "eb-garamond-latin-var.woff2")

// One short line of the reading face per half, and no more. The reading face is
// settled, so the article text is not the question here; the line exists only so
// each ground is seen as a page ground rather than as a swatch, and keeping it
// to one line is what lets both halves and all fourteen rows share one screen.
const BODY =
  "Walking in the snow with her nephew Otto Frisch, Lise Meitner did the sum on a scrap of paper."

// The two text inks. Read from the same rule the previous batch used: the ink is
// the ground's own lightness pushed to the far end, so the halves are legible
// without introducing a colour decision this batch is not making.
const LIGHT_INK = "#1A1710"
const DARK_INK = "#E9E6DF"

function buildHtml(blob, xheight) {
  const font = readFileSync(READING_FONT).toString("base64")
  const data = JSON.stringify({ ...blob, xheight })
  // replaceAll, and every replacement passed as a FUNCTION. Two reasons, both of
  // them silent failures otherwise: __BODY__ appears twice and a plain .replace
  // would fill in only the first, and a string replacement treats a dollar sign
  // in the payload as a capture-group reference, which the base64 font or the
  // JSON could carry.
  return HTML_TEMPLATE
    .replaceAll("__FONT_BASE64__", () => font)
    .replaceAll("__DATA__", () => data)
    .replaceAll("__XHEIGHT__", () => xheight)
    .replaceAll("__BODY__", () => BODY)
    .replaceAll("__LIGHT_INK__", () => LIGHT_INK)
    .replaceAll("__DARK_INK__", () => DARK_INK)
}

// The x-height correction, read from globals.css rather than retyped, and
// cross-checked against the specimen page's own constant so the page and this
// script cannot drift apart by a typo in one of them. Lifted from
// ground-palettes.mjs, which does the same check for the same reason.
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
    console.error("FAIL: globals.css carries " + distinct.length + " different values: " + distinct.join(", "))
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
  return distinct[0]
}

if (MODE === "html") {
  const out = process.argv[3]
  if (!out) {
    console.error("FAIL: pass the output path, e.g. html /c/Users/marlo/OneDrive/Desktop/specimen.html")
    process.exit(1)
  }
  const xheight = readXHeightAdjust()
  const html = buildHtml(buildBlob(), xheight)
  writeFileSync(out, html, "utf8")
  const size = statSync(out).size
  console.log("wrote " + out)
  console.log("bytes: " + size + "   (" + (size / 1024 / 1024).toFixed(3) + " MB, ceiling 3 MB)")
  console.log("base64 font payloads in the file: " + (html.match(/data:font\/woff2;base64,/g) || []).length + "   expected 1")
  console.log("x-height correction inlined: " + xheight)
  process.exit(size < 3 * 1024 * 1024 ? 0 : 1)
}

console.error("unknown mode: " + MODE)
process.exit(1)
