// Graded scoring for numeric (slider) and map (pin) answers. A near miss earns
// partial credit that RISES as the guess approaches the answer, instead of the
// old all-or-nothing match. Points are an integer 0..MAX_POINTS: full marks at
// the exact answer, then halving over a fixed "half-life" of distance. Choice
// questions stay MAX_POINTS or 0 (discrete options have no notion of "close").
//
// This MUST mirror the backend app/train_bank.py EXACTLY (same constants and
// rounding): Arena grades server-side and the client renders the server's
// number, while Battle (unrated) grades with these functions locally, so any
// drift would make the two disagree. Math.round is half-up, matching the
// backend's _round_half_up for the non-negative values here.

export const MAX_POINTS = 100
// Numeric: points halve for every 10% of the slider's full range you are off.
export const NUMERIC_HALFLIFE_FRAC = 0.1
// Map: points halve for every 2000 km between your pin and the target.
export const MAP_HALFLIFE_KM = 2000
// Mean Earth radius (km) for the great-circle (haversine) distance.
const EARTH_RADIUS_KM = 6371.0088

// Graded points: MAX_POINTS at distance 0, halving every `halfLife`.
function decayPoints(distance: number, halfLife: number): number {
  if (halfLife <= 0) return distance <= 0 ? MAX_POINTS : 0
  return Math.round(MAX_POINTS * Math.pow(0.5, distance / halfLife))
}

// Points for a numeric (slider) guess, by how far off it is as a fraction of
// the slider's full range.
export function numericPoints(chosen: number, answer: number, min: number, max: number): number {
  const span = max - min
  if (!(span > 0)) return chosen === answer ? MAX_POINTS : 0
  const frac = Math.min(1, Math.abs(chosen - answer) / span)
  return decayPoints(frac, NUMERIC_HALFLIFE_FRAC)
}

// Great-circle distance in km between two lat/lng points.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(lat1)
  const p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1)
  const dl = toRad(lng2 - lng1)
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Points for a map-pin guess, by great-circle distance from the target.
export function mapPoints(lat: number, lng: number, ansLat: number, ansLng: number): number {
  return decayPoints(haversineKm(lat, lng, ansLat, ansLng), MAP_HALFLIFE_KM)
}

// A short tier label + whether it reads as a "good" result, for the per-answer
// feedback on graded (numeric/map) questions. Display only -- the number is the
// authority; this just words it.
export function scoreLabel(points: number): { label: string; good: boolean } {
  if (points >= MAX_POINTS) return { label: "Perfect", good: true }
  if (points >= 75) return { label: "So close", good: true }
  if (points >= 50) return { label: "Close", good: true }
  if (points >= 25) return { label: "Not quite", good: false }
  if (points > 0) return { label: "Far off", good: false }
  return { label: "Way off", good: false }
}
