import type { MarathonQuestion } from "@/types/train"
import { mockQuestions } from "@/lib/train/mockQuestions"

// Deterministic question sequence for a Battle duel. Ported from the mobile app
// (mobile/src/lib/battle/seededQuestions.ts); identical math so a web client and
// a mobile client given the same seed derive the SAME sequence.
//
// Both devices must see the SAME questions in the SAME order, but there is no
// server question bank yet (the Train tab is still in the "mock phase", see
// @/types/train). So the backend only agrees a random integer seed for the room;
// each client feeds that seed into an identical PRNG here and derives the same
// ordered slice of the shared local pool (mockQuestions). Same seed in -> same
// sequence out on every client.

// mulberry32: a tiny, fast, fully deterministic 32-bit PRNG. Given the same
// seed it produces the same stream on every device, which is all we need (this
// is not cryptographic randomness, and does not need to be).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle driven by the seeded PRNG (pure, does not mutate input).
function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// The ordered list of questions for one duel: a seeded shuffle of the whole
// pool, capped at `count`. Identical on every client for a given seed.
export function buildSequence(seed: number, count: number): MarathonQuestion[] {
  const rand = mulberry32(seed)
  return seededShuffle(mockQuestions, rand).slice(0, count)
}
