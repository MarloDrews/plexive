"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
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

  // Correctness and the explanation are graded server-side; answer_index and
  // explanation are stripped from the post payload, so we always ask the API.
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
        <p className="text-[15px] font-medium text-ink leading-snug">
          <MathText text={item.question} />
        </p>
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
  // One question at a time. `current` indexes the slide; the slide after the
  // last question (index === content.length) is the result summary.
  const [current, setCurrent] = useState(0)

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

  // Swipe navigation. The detail page closes on a rightward swipe via a native
  // listener on its scroll container; React synthetic stopPropagation would not
  // reach it (React dispatches at the root, after the native bubble fires), so
  // we attach native listeners here and stop the event before it bubbles up.
  const pagerRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef(0)
  const resultsRef = useRef<Record<number, AnswerResult>>({})
  currentRef.current = current
  resultsRef.current = results

  // Advance only after the current question is answered (no auto-advance, and
  // swiping forward past an unanswered question is blocked); back is always free.
  function goTo(index: number) {
    setCurrent(Math.max(0, Math.min(index, content.length)))
  }
  function canAdvance(from: number) {
    return from < content.length && !!resultsRef.current[from]
  }

  useEffect(() => {
    const el = pagerRef.current
    if (!el) return
    let sx = 0
    let sy = 0
    function onStart(e: TouchEvent) {
      e.stopPropagation()
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
    }
    function onEnd(e: TouchEvent) {
      e.stopPropagation()
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return
      const cur = currentRef.current
      if (dx < 0) {
        if (canAdvance(cur)) setCurrent(cur + 1)
      } else if (cur > 0) {
        setCurrent(cur - 1)
      }
    }
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchend", onEnd)
    }
  }, [content.length])

  if (content.length === 0) return null

  const correct = Object.values(results).filter((r) => r.correct).length
  const onSummary = current >= content.length
  const isLast = current === content.length - 1

  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">Quiz</h3>
        <span className="text-xs text-ink-muted font-mono">
          {onSummary ? "Results" : `Question ${current + 1} of ${content.length}`}
        </span>
      </div>

      {!user && (
        <p className="text-xs text-ink-muted -mt-2 font-sans">
          Log in to build your knowledge score with this quiz.
        </p>
      )}

      {/* Horizontal pager: the active slide is shown, the rest sit off-screen
          and slide in on advance. items-start keeps short slides from being
          stretched to the tallest slide's height. */}
      <div ref={pagerRef} className="overflow-hidden">
        <div
          className="flex items-start transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {content.map((item, i) => (
            <div key={i} className="w-full shrink-0">
              <QuizCard
                item={item}
                index={i}
                postId={postId}
                result={results[i]}
                locked={!stateLoaded}
                onResult={handleResult}
              />
            </div>
          ))}
          {/* Result summary — Elo is a placeholder for now: the score only, no
              rating math. */}
          <div className="w-full shrink-0">
            <div className="card px-4 py-6 flex flex-col items-center gap-1 text-center">
              <p className="label-caps text-(--accent)">Quiz complete</p>
              <p className="text-lg text-ink font-semibold">
                {correct}/{content.length} correct
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation: Back is always available once past the first slide; Next
          appears once the current question is answered (no auto-advance). */}
      <div className="flex items-center justify-between min-h-9">
        {current > 0 ? (
          <button onClick={() => goTo(current - 1)} className="btn-quiet">
            Back
          </button>
        ) : (
          <span />
        )}
        {!onSummary && canAdvance(current) && (
          <button onClick={() => goTo(current + 1)} className="btn btn-primary px-5 py-2">
            {isLast ? "See results" : "Next"}
          </button>
        )}
      </div>
    </div>
  )
}
