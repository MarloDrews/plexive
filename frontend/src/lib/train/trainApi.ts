import type { AnswerResult, Difficulty, MarathonQuestion } from "@/types/train"
import { mockQuestions } from "./mockQuestions"
import { applyDelta, computeDelta, DIFFICULTY_RATING, pickDifficulty } from "./elo"
import { numericMatch } from "./numeric"
import { apiFetch } from "@/lib/api"

// THE SEAM (ported from mobile/src/lib/train/trainApi.ts). Question SELECTION
// still runs against the local mock pool (there is no shared question backend
// yet). SCORING is split by auth:
//   - Logged-in players: the answer is POSTed to /api/train/answer as the raw
//     choice (question_id + chosen_index/chosen_value), and the SERVER grades
//     correctness from its own bank (app/train_bank.py) and updates the user's
//     SINGLE unified knowledge score, returning the authoritative rating + delta
//     (M120). The client no longer sends its own correctness; it still computes
//     `correct` LOCALLY for the immediate feedback display, from the same mock
//     answer, so keep app/train_bank.py in sync with mockQuestions.ts.
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
  // Local correctness is computed only for the immediate feedback display; the
  // authoritative score comes from the server grade below (logged-in path).
  const numeric = question.kind === "numeric"
  const correct = numeric
    ? numericMatch(chosenValue ?? NaN, question.answerValue, question.min, question.step ?? 1)
    : chosenIndex === question.answerIndex
  // Per-kind correct answer to show in feedback (only one applies).
  const correctIndex = numeric ? undefined : question.answerIndex
  const correctValue = numeric ? question.answerValue : undefined
  const eloBefore = Math.round(currentElo)

  if (loggedIn) {
    // Authoritative path: send the raw choice; the server grades from its own
    // bank and returns the new rating + delta, so Train and the profile stay one
    // number and correctness is never client-asserted (M120).
    const r = await apiFetch("/api/train/answer", {
      method: "POST",
      body: JSON.stringify({
        question_id: question.id,
        chosen_index: numeric ? undefined : chosenIndex,
        chosen_value: numeric ? chosenValue : undefined,
        answer_ms: Math.round(answerMs),
      }),
    })
    if (!r.ok) throw new Error("Failed to submit answer.")
    const data: { rating: number; delta: number } = await r.json()
    const eloAfter = Math.round(data.rating)
    const delta = Math.round(data.delta)
    return {
      correct,
      correctIndex,
      correctValue,
      explanation: question.explanation,
      // Derived from the server's own rating and delta so the ticker start,
      // end and delta chip always agree; the client session value could
      // differ (rounding, concurrent activity elsewhere).
      eloBefore: eloAfter - delta,
      eloAfter,
      delta,
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
