import type { AnswerResult, Difficulty, MarathonQuestion } from "@/types/train"
import { mockQuestions } from "./mockQuestions"
import { applyDelta, computeDelta, DIFFICULTY_RATING, pickDifficulty } from "./elo"
import { apiFetch } from "@/app/lib/api"

// THE SEAM (ported from mobile/src/lib/train/trainApi.ts). Question SELECTION
// still runs against the local mock pool (there is no server question bank yet).
// SCORING is split by auth:
//   - Logged-in players: the answer is POSTed to /api/train/answer and the
//     server updates the user's SINGLE unified knowledge score (the same number
//     shown as the profile "Knowledge score") and returns the authoritative
//     rating + delta. Correctness is still decided here against the mock
//     answerIndex and trusted by the server (see the note in @/types/train); it
//     must move server-side once a real Train question backend exists.
//   - Guests: pure client-side simulation via ./elo (nothing is persisted).
//
// All marathon math (Elo simulator + difficulty weighting) lives in ./elo so it
// stays pure and testable; this file only handles selection from the pool and
// shaping the AnswerResult.

function questionRating(difficulty: Difficulty): number {
  return DIFFICULTY_RATING[difficulty]
}

// Adaptive selection: pickDifficulty (from ./elo) chooses a difficulty bucket
// weighted by the user's Elo, then we take a random unseen question of that
// difficulty. If the chosen bucket is exhausted, fall back to whichever unseen
// question's rating sits closest to the user's Elo, so the marathon keeps going
// until the whole pool is used up.
function selectAdaptive(
  pool: MarathonQuestion[],
  currentElo: number,
): MarathonQuestion | null {
  if (pool.length === 0) return null
  const wanted = pickDifficulty(currentElo)
  const inBucket = pool.filter((q) => q.difficulty === wanted)
  if (inBucket.length > 0) {
    return inBucket[Math.floor(Math.random() * inBucket.length)]
  }
  // Bucket empty: nearest-rating fallback, random tie-break.
  let best: MarathonQuestion[] = []
  let bestDist = Infinity
  for (const q of pool) {
    const dist = Math.abs(questionRating(q.difficulty) - currentElo)
    if (dist < bestDist) {
      bestDist = dist
      best = [q]
    } else if (dist === bestDist) {
      best.push(q)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

export async function fetchNextQuestion(params: {
  currentElo: number
  answeredIds: string[] // exclude already-seen this session
}): Promise<MarathonQuestion | null> {
  const seen = new Set(params.answeredIds)
  const remaining = mockQuestions.filter((q) => !seen.has(q.id))
  // Returns null once the mock pool is exhausted for this session.
  return selectAdaptive(remaining, params.currentElo)
}

export async function submitAnswer(params: {
  question: MarathonQuestion
  answerMs: number
  currentElo: number
  answeredCountInSession: number
  loggedIn: boolean // logged-in answers score on the server; guests simulate locally
  // Exactly one is set, matching the question kind: chosenIndex for choice
  // questions, chosenValue for numeric (slider) questions.
  chosenIndex?: number
  chosenValue?: number
}): Promise<AnswerResult> {
  const { question, chosenIndex, chosenValue, answerMs, currentElo, answeredCountInSession, loggedIn } = params
  // Mock phase: correctness is decided here against the client-side answer.
  // This MUST move server-side once a real Train question backend exists (see the
  // note at the top of @/types/train).
  const numeric = question.kind === "numeric"
  const correct = numeric
    ? chosenValue === question.answerValue
    : chosenIndex === question.answerIndex
  // Per-kind correct answer to show in feedback (only one applies).
  const correctIndex = numeric ? undefined : question.answerIndex
  const correctValue = numeric ? question.answerValue : undefined
  const eloBefore = Math.round(currentElo)

  if (loggedIn) {
    // Authoritative path: the server updates the unified knowledge score and
    // returns the new rating + delta, so Train and the profile stay one number.
    const r = await apiFetch("/api/train/answer", {
      method: "POST",
      body: JSON.stringify({
        difficulty: question.difficulty,
        correct,
        answer_ms: Math.round(answerMs),
      }),
    })
    if (!r.ok) throw new Error("Failed to submit answer.")
    const data: { rating: number; delta: number } = await r.json()
    return {
      correct,
      correctIndex,
      correctValue,
      explanation: question.explanation,
      eloBefore,
      eloAfter: Math.round(data.rating),
      delta: Math.round(data.delta),
      answerMs,
      questionRating: questionRating(question.difficulty),
    }
  }

  // Guest path: pure local simulation (not persisted, not authoritative).
  const delta = computeDelta({
    R: currentElo,
    difficulty: question.difficulty,
    correct,
    answerMs,
    answeredCount: answeredCountInSession,
  })
  return {
    correct,
    correctIndex,
    correctValue,
    explanation: question.explanation,
    eloBefore,
    eloAfter: applyDelta(currentElo, delta),
    delta,
    answerMs,
    questionRating: questionRating(question.difficulty),
  }
}
