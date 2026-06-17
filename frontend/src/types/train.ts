// Train marathon data layer types. Ported from the mobile app
// (mobile/src/types/train.ts) so web and mobile share the same shapes.
//
// IMPORTANT (mock phase): `answerIndex` lives CLIENT-SIDE only because there is
// no Train question backend yet. Correctness is decided here in the app against
// the mock pool. When the real backend exists, correctness MUST be decided
// server-side and `answerIndex` (plus `explanation`) MUST be stripped from the
// question payload before it reaches the client -- exactly how PostOut strips
// `answer_index`/`explanation` from QuizItem today (see backend/app/routers/quiz.py,
// where /quiz/answer compares server-side and answer_index never leaves the server).

// Maps to the Elo opponent rating the question is played against:
// 1 -> 800, 2 -> 1000, 3 -> 1200 (mirrors backend DIFFICULTY_RATING).
export type Difficulty = 1 | 2 | 3

// Fields every question shares, regardless of how it is answered.
interface BaseQuestion {
  id: string // stable unique id
  prompt: string // the question text (broad, general-knowledge, not topic-specific)
  difficulty: Difficulty
  explanation?: string // shown after answering
  topic?: string // optional coarse tag, NOT used for filtering the marathon
}

// Multiple-choice question: pick one of 2-5 options.
export interface ChoiceQuestion extends BaseQuestion {
  kind?: "choice" // optional so existing untagged questions stay valid
  options: string[] // 2-5 options
  answerIndex: number // index into options (CLIENT-SIDE for now; see top-of-file note)
}

// Numeric question: the answer is a single number the player dials in on a
// slider. min/max are the slider's limits, step is the snap increment, unit is
// an optional suffix shown next to the value (e.g. "C", "%").
export interface NumericQuestion extends BaseQuestion {
  kind: "numeric"
  answerValue: number // the correct number (CLIENT-SIDE for now; see top-of-file note)
  min: number // slider lower limit
  max: number // slider upper limit
  step?: number // snap increment, defaults to 1
  unit?: string // optional suffix shown after the number
}

export type MarathonQuestion = ChoiceQuestion | NumericQuestion

export interface AnswerResult {
  correct: boolean
  correctIndex?: number // choice questions: the correct option index
  correctValue?: number // numeric questions: the correct number
  explanation?: string
  eloBefore: number
  eloAfter: number
  delta: number // signed, already rounded
  answerMs: number // time taken to answer
  questionRating: number // the Elo opponent rating (800/1000/1200)
}
