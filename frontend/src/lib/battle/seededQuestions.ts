import type { MarathonQuestion } from "@/types/train"
import { mockQuestions } from "@/lib/train/mockQuestions"
import { mulberry32 } from "@/lib/prng"

// Deterministic question sequence for a Battle duel. The server agrees only the
// seed and the question count (backend/app/routers/battle.py); each client
// derives the sequence itself, so any two clients given the same seed must
// arrive at the SAME sequence. This is the only implementation today.
//
// Both devices must see the SAME questions in the SAME order, but there is no
// server question bank yet (the Train tab is still in the "mock phase", see
// @/types/train). So the backend only agrees a random integer seed for the room;
// each client feeds that seed into an identical PRNG here and derives the same
// ordered slice of the shared local pool (mockQuestions). Same seed in -> same
// sequence out on every client.

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
