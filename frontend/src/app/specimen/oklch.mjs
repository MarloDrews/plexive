// sRGB <-> OKLab/OKLCH and WCAG 2.1 contrast. Shared by the specimen scripts
// beside this file; never imported by the app.
//
// EXTRACTED, NOT REWRITTEN. Every function below was lifted verbatim out of
// accent-candidates.mjs, which now imports them from here. The reason for one
// copy rather than two is that the round-trip proof is what makes any number
// these scripts print believable, and a second hand-typed copy of Ottosson's
// matrices would be a second thing to prove and a second thing to get wrong.
//
// NO NEW DEPENDENCY. The conversion is written out from Bjorn Ottosson's
// published matrices rather than pulled from culori or colorjs, because these
// are throwaway scripts for one decision and a package.json entry would
// outlive them.

// ---------------------------------------------------------------------------
// sRGB <-> linear sRGB. The same transfer function the WCAG relative-luminance
// definition uses, and the one the CSS Color 4 spec uses for OKLab.
// ---------------------------------------------------------------------------

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export function parseHex(hex) {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

export function toHex(rgb255) {
  return "#" + rgb255.map((c) => c.toString(16).padStart(2, "0")).join("")
}

// ---------------------------------------------------------------------------
// linear sRGB <-> OKLab, Ottosson's matrices verbatim.
// ---------------------------------------------------------------------------

export function linearSrgbToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

export function oklabToLinearSrgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// ---------------------------------------------------------------------------
// OKLCH. Hue in degrees 0..360, chroma as the polar radius in OKLab a/b.
// ---------------------------------------------------------------------------

export function hexToOklab(hex) {
  return linearSrgbToOklab(parseHex(hex).map((c) => srgbToLinear(c / 255)))
}

export function hexToOklch(hex) {
  const [L, a, b] = hexToOklab(hex)
  const C = Math.sqrt(a * a + b * b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { L, C, h }
}

export function oklchToLinearSrgb({ L, C, h }) {
  const rad = (h * Math.PI) / 180
  return oklabToLinearSrgb([L, C * Math.cos(rad), C * Math.sin(rad)])
}

// A colour is in the sRGB gamut when every LINEAR channel lands in [0,1].
// The epsilon absorbs floating-point noise at the exact boundary; without it
// the binary search below stops a hair short of the real edge.
export function inGamut(oklch) {
  return oklchToLinearSrgb(oklch).every((c) => c >= -1e-6 && c <= 1 + 1e-6)
}

export function oklchToHex(oklch) {
  const rgb = oklchToLinearSrgb(oklch)
    .map((c) => Math.min(1, Math.max(0, c)))
    .map((c) => Math.round(linearToSrgb(c) * 255))
  return toHex(rgb)
}

// Largest chroma that still fits the sRGB gamut at this L and h. Bisection,
// 60 iterations, which is far past the precision of an 8-bit channel.
export function maxChroma(L, h) {
  let lo = 0
  let hi = 0.5
  if (inGamut({ L, C: hi, h })) return hi
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    if (inGamut({ L, C: mid, h })) lo = mid
    else hi = mid
  }
  return lo
}

// Euclidean distance in OKLab. This is the perceptual distance every score in
// these scripts uses: OKLab is near-uniform by construction, so a straight
// Euclidean distance in it is the intended metric and needs no weighting.
export function oklabDistance(hexA, hexB) {
  const a = hexToOklab(hexA)
  const b = hexToOklab(hexB)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

// ---------------------------------------------------------------------------
// WCAG 2.1 contrast.
//   channel c in [0,1]: c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4
//   L = 0.2126*R + 0.7152*G + 0.0722*B
//   ratio = (Llighter + 0.05) / (Ldarker + 0.05)
// ---------------------------------------------------------------------------

export function wcagChannel(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(wcagChannel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ratio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// ---------------------------------------------------------------------------
// Formatting helpers both scripts print with.
// ---------------------------------------------------------------------------

export const fmt = (oklch) =>
  "oklch(" + oklch.L.toFixed(4) + " " + oklch.C.toFixed(4) + " " + oklch.h.toFixed(2) + ")"

export const pad = (s, n) => String(s).padEnd(n)
