// Marathon Elo simulator + adaptive difficulty picker. Ported verbatim from the
// mobile app (mobile/src/lib/train/elo.ts) so the guest simulation matches.
//
// The AUTHORITATIVE knowledge rating is the SERVER's per-format Elo
// (backend/app/elo.py, persisted in UserElo). This module simulates a
// MARATHON-ONLY rating purely for the UI while the marathon backend does not
// exist yet; the number it produces is not stored anywhere and is not the real
// rating. Once the marathon endpoints land it must be reconciled with / replaced
// by the server's computation.
//
// The core math mirrors the server (same expected-score formula, same K-factors,
// same difficulty ratings, same "wrong always costs the full base" philosophy)
// so the simulated number behaves like the real one. A time bonus is layered on
// top for the marathon's feel -- it only ever ADDS to a correct gain.
//
// Pure module: no React, no I/O, no randomness except the explicit weighted
// difficulty pick. Keep it that way so it stays unit-testable.

// --- Tunable constants (single source of truth for the marathon math). ---
export const START_ELO = 1000
export const ELO_FLOOR = 100
export const K_FAST = 32 // first 30 scored answers (provisional, converges fast)
export const K_SLOW = 16 // after 30 answers (stable, moves slowly)
export const DIFFICULTY_RATING: Record<number, number> = { 1: 800, 2: 1000, 3: 1200 }
export const FAST_MS = 3000 // at/under this, full time bonus
export const SLOW_MS = 15000 // at/over this, no time bonus
export const TIME_BONUS_MAX = 0.5 // fastest correct answer earns up to +50% of the base gain

// Standard Elo expected score: probability R beats an opponent rated Q.
export function expectedScore(R: number, Q: number): number {
  return 1 / (1 + 10 ** ((Q - R) / 400))
}

// K is larger while the rating is provisional so early answers move it quickly.
export function kFactor(answeredCount: number): number {
  return answeredCount < 30 ? K_FAST : K_SLOW
}

// 1 at/under FAST_MS, 0 at/over SLOW_MS, linear in between (clamped 0..1).
export function timeFactor(answerMs: number): number {
  if (answerMs <= FAST_MS) return 1
  if (answerMs >= SLOW_MS) return 0
  return (SLOW_MS - answerMs) / (SLOW_MS - FAST_MS)
}

// Signed, rounded rating change for one answer. Time only sweetens a correct
// gain; a wrong answer always costs the full base, so guessing has a real cost
// (matching the server philosophy).
export function computeDelta(params: {
  R: number
  difficulty: number
  correct: boolean
  answerMs: number
  answeredCount: number
}): number {
  const { R, difficulty, correct, answerMs, answeredCount } = params
  const Q = DIFFICULTY_RATING[difficulty] ?? DIFFICULTY_RATING[2]
  const base = kFactor(answeredCount) * ((correct ? 1 : 0) - expectedScore(R, Q))
  const delta = correct ? base * (1 + TIME_BONUS_MAX * timeFactor(answerMs)) : base
  return Math.round(delta)
}

// Apply a delta to a rating, floored so a losing streak cannot go absurdly low.
export function applyDelta(R: number, delta: number): number {
  return Math.max(ELO_FLOOR, Math.round(R + delta))
}

// Weighted random pick from a { value: weight } map.
function weightedPick(weights: Record<number, number>): number {
  const entries = Object.entries(weights)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = Math.random() * total
  for (const [value, w] of entries) {
    roll -= w
    if (roll <= 0) return Number(value)
  }
  return Number(entries[entries.length - 1][0])
}

// Map current Elo to a preferred difficulty with light variety, so the marathon
// is not deterministic. The intent is to keep expectedScore near ~0.5 (questions
// matched to skill), which is also where the rating actually moves.
export function pickDifficulty(R: number): number {
  if (R < 900) return weightedPick({ 1: 0.8, 2: 0.2 })
  if (R <= 1150) return weightedPick({ 1: 0.2, 2: 0.6, 3: 0.2 })
  return weightedPick({ 2: 0.25, 3: 0.75 })
}
