"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import type { QuizItem } from "../../types/post"
import MathText from "../MathText"

interface Props {
  content: QuizItem[]
  postId: number
}

interface AnswerResult {
  chosenIndex: number
  correct: boolean
  correctIndex: number
  explanation: string | null
  // Elo info only present for fresh, scored, authenticated answers
  delta?: number
  rating?: number
}

function optionClass(i: number, result: AnswerResult | undefined): string {
  if (!result) {
    return "border-edge-strong text-ink-body font-sans hover:border-ink-muted hover:bg-surface-2 cursor-pointer"
  }
  if (i === result.correctIndex) {
    return "border-good bg-good/10 text-good"
  }
  if (i === result.chosenIndex) {
    return "border-bad bg-bad/10 text-bad"
  }
  return "border-edge text-ink-faint font-sans"
}

function QuizCard({
  item,
  index,
  postId,
  result,
  locked,
  onResult,
}: {
  item: QuizItem
  index: number
  postId: number
  result: AnswerResult | undefined
  locked: boolean
  onResult: (index: number, result: AnswerResult) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function answer(chosenIndex: number) {
    if (result || submitting || locked) return
    setSubmitting(true)
    setError("")
    try {
      const r = await apiFetch("/api/quiz/answer", {
        method: "POST",
        body: JSON.stringify({ post_id: postId, question_index: index, chosen_index: chosenIndex }),
      })
      if (!r.ok) throw new Error("Could not submit answer.")
      const d = await r.json()
      onResult(index, {
        chosenIndex,
        correct: d.correct,
        correctIndex: d.correct_index,
        explanation: d.explanation,
        delta: d.scored && !d.already_answered ? d.elo?.delta : undefined,
        rating: d.scored && !d.already_answered ? d.elo?.rating : undefined,
      })
    } catch {
      setError("Could not submit answer. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-medium text-ink leading-snug">
            <MathText text={item.question} />
          </p>
          {result?.delta !== undefined && (
            <span
              className={`shrink-0 text-xs font-bold rounded-full px-2 py-0.5 ${
                result.delta >= 0
                  ? "bg-good/15 text-good font-mono"
                  : "bg-bad/15 text-bad font-mono"
              }`}
            >
              {result.delta >= 0 ? "+" : ""}{result.delta}
            </span>
          )}
        </div>
        <ol className="mt-3 flex flex-col gap-2">
          {item.options.map((opt, i) => (
            <li key={i}>
              <button
                onClick={() => answer(i)}
                disabled={!!result || submitting}
                className={`w-full text-left px-4 py-3 rounded-field text-[15px] font-sans border transition-colors duration-150 disabled:cursor-default ${optionClass(i, result)} ${
                  submitting && !result ? "opacity-60" : ""
                }`}
              >
                <MathText text={opt} />
              </button>
            </li>
          ))}
        </ol>
        {error && <p className="text-bad text-xs mt-2 font-sans">{error}</p>}
      </div>

      {result && (
        <div className="px-4 pb-4">
          <p className={`label-caps mb-1 ${result.correct ? "text-good" : "text-bad"}`}>
            {result.correct ? "Correct" : "Incorrect"}
          </p>
          {result.explanation && (
            <p className="text-sm text-ink-dim leading-relaxed font-sans">
              <MathText text={result.explanation} />
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function QuizSection({ content, postId }: Props) {
  const { user } = useAuth()
  const [results, setResults] = useState<Record<number, AnswerResult>>({})
  const [stateLoaded, setStateLoaded] = useState(false)

  // Restore previously answered questions so they can never be re-scored.
  useEffect(() => {
    if (!user) {
      setStateLoaded(true)
      return
    }
    apiFetch(`/api/quiz/state/${postId}`)
      .then((r) => (r.ok ? r.json() : { answers: [] }))
      .then((d: { answers: { question_index: number; chosen_index: number; correct: boolean; correct_index: number; explanation: string | null }[] }) => {
        const restored: Record<number, AnswerResult> = {}
        for (const a of d.answers) {
          restored[a.question_index] = {
            chosenIndex: a.chosen_index,
            correct: a.correct,
            correctIndex: a.correct_index,
            explanation: a.explanation,
          }
        }
        setResults((prev) => ({ ...restored, ...prev }))
      })
      .catch(() => {})
      .finally(() => setStateLoaded(true))
  }, [user, postId])

  function handleResult(index: number, result: AnswerResult) {
    setResults((prev) => ({ ...prev, [index]: result }))
  }

  const answered = Object.keys(results).length
  const correct = Object.values(results).filter((r) => r.correct).length
  const allDone = answered === content.length && content.length > 0
  let lastRating: number | undefined
  for (const r of Object.values(results)) {
    if (r.rating !== undefined) lastRating = r.rating
  }

  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">Quiz</h3>
        <span className="text-xs text-ink-muted font-mono">
          {answered}/{content.length} answered
        </span>
      </div>

      {!user && (
        <p className="text-xs text-ink-muted -mt-2 font-sans">
          Log in to build your knowledge score with this quiz.
        </p>
      )}

      {content.map((item, i) => (
        <QuizCard
          key={i}
          item={item}
          index={i}
          postId={postId}
          result={results[i]}
          locked={!stateLoaded}
          onResult={handleResult}
        />
      ))}

      {allDone && (
        <div className="card px-4 py-3 text-center">
          <p className="text-sm text-ink font-semibold">
            {correct}/{content.length} correct
          </p>
          {lastRating !== undefined && (
            <p className="text-xs text-ink-muted mt-1 font-sans">
              Knowledge score: <span className="text-lamp font-semibold font-mono">{Math.round(lastRating)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
