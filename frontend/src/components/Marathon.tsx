"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
import { fetchNextQuestion, submitAnswer } from "@/lib/train/trainApi"
import { mockQuestions } from "@/lib/train/mockQuestions"
import { SLOW_MS, START_ELO } from "@/lib/train/elo"
import type { AnswerResult, ChoiceQuestion, MarathonQuestion } from "@/types/train"
import NumberSlider from "./NumberSlider"
import FlameIcon from "./FlameIcon"
import { GlowCard, MessageSlab, LABEL_CAPS } from "./stage"

// The full Train marathon experience as a self-contained component, ported from
// the mobile Marathon (mobile/src/components/train/Marathon.tsx). The Train tab
// mounts it. State machine:
//   intro -> question -> feedback -> (question | summary)
// The marathon rating is the CLIENT-SIDE simulation from @/lib/train/elo for
// guests; logged-in players score on the server (POST /api/train/answer updates
// the unified knowledge score). Logged-out users can still play for practice,
// but their rating is not persisted. Motion is gated on the reduced-motion
// preference, falling back to instant state changes.

type Stage = "intro" | "question" | "feedback" | "summary"

// A real multiple-choice question used purely as the blurred teaser on the
// intro. It is never answerable there (a blur sits over it); pick a choice
// question (not a numeric/slider one) so the teaser shows the familiar pills.
const PREVIEW_QUESTION = mockQuestions.find(
  (q): q is ChoiceQuestion => q.kind !== "numeric",
)!

// Respect prefers-reduced-motion (gates every animation in this component).
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduce(mq.matches)
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduce
}

// A label-caps stat for the top strip (mono value over a tiny label).
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={LABEL_CAPS}>{label}</span>
      <span className="font-mono text-[15px] text-ink">{value}</span>
    </div>
  )
}

// Streak stat with a flame that brightens as the streak grows. The flame uses
// the warm `save` token; its opacity carries the brightness, faint at zero and
// full by ~5 in a row. A short CSS pop plays when it changes.
function StreakStat({ streak }: { streak: number }) {
  const intensity = Math.min(streak / 5, 1)
  const flameOpacity = streak === 0 ? 0.3 : 0.5 + 0.5 * intensity
  const numberColor = streak > 0 ? "var(--color-save)" : "var(--color-ink-muted)"
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={LABEL_CAPS}>Streak</span>
      <div className="flex items-center gap-1">
        {/* key on streak so the pop animation replays on each change. */}
        <span key={streak} className="heart-pop inline-flex" style={{ opacity: flameOpacity }}>
          <FlameIcon size={15} color="var(--color-save)" filled={streak > 0} />
        </span>
        <span className="font-mono text-[15px]" style={{ color: numberColor }}>
          {streak}
        </span>
      </div>
    </div>
  )
}

// A number that ticks from `from` to `to` over ~500ms; jumps instantly when
// reduced motion is on or there is no change.
function TickingNumber({
  from,
  to,
  reduceMotion,
  className,
}: {
  from: number
  to: number
  reduceMotion: boolean
  className?: string
}) {
  // Initialized from `from`: starting at `to` painted the final rating for
  // one frame before the animation snapped back to the start value.
  const [val, setVal] = useState(from)
  useEffect(() => {
    if (reduceMotion || from === to) {
      setVal(to)
      return
    }
    const duration = 500
    const start = Date.now()
    let raf = 0
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      setVal(Math.round(from + (to - from) * t))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [from, to, reduceMotion])
  return <span className={className}>{val}</span>
}

// Thin elapsed-time bar that fills toward SLOW_MS to nudge speed. Purely visual:
// it never auto-fails the question. Keyed by question id so it resets each time.
// Only mounted when motion is allowed.
function ElapsedBar() {
  const [w, setW] = useState(0)
  useEffect(() => {
    // Next frame so the CSS width transition runs from 0 to 100%.
    const id = requestAnimationFrame(() => setW(100))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "rgb(255 255 255 / 0.15)" }}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${w}%`,
          backgroundColor: "rgb(124 111 255 / 0.4)",
          transition: `width ${SLOW_MS}ms linear`,
        }}
      />
    </div>
  )
}

// Small frosted note for logged-out players: rating won't be saved + login link.
function GuestNote() {
  return (
    <div className="card px-4 py-3 self-stretch">
      <p className="text-ink-dim text-[13px]">
        Playing as a guest &mdash; your rating won&rsquo;t be saved.{" "}
        <Link href="/login" className="text-lamp font-semibold">
          Log in
        </Link>
      </p>
    </div>
  )
}

interface Props {
  // Exit hook for the summary's secondary button (switches back to the feed).
  onExit?: () => void
}

export default function Marathon({ onExit }: Props) {
  const { user } = useAuth()
  const reduceMotion = useReducedMotion()

  const [loaded, setLoaded] = useState(false) // initial persisted-progress load done
  const [stage, setStage] = useState<Stage>("intro")
  const [busy, setBusy] = useState(false) // fetching / submitting against the seam
  const [error, setError] = useState("")

  // Rating state. sessionElo is the live simulated rating; startElo is its value
  // when the current session began (for the summary's net change); lifetimeAnswered
  // counts the answers scored since this component mounted (NOT persisted:
  // each visit restarts the guest K-factor at its fast phase; logged-in
  // scoring is server-side and unaffected).
  const [sessionElo, setSessionElo] = useState(START_ELO)
  const [startElo, setStartElo] = useState(START_ELO)
  const [lifetimeAnswered, setLifetimeAnswered] = useState(0)

  // Per-session progress.
  const [answeredIds, setAnsweredIds] = useState<string[]>([])
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [results, setResults] = useState<AnswerResult[]>([])

  // Active question + the result/choice driving the feedback view.
  const [current, setCurrent] = useState<MarathonQuestion | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  // The live slider value for a numeric question (the player's pending answer).
  const [sliderValue, setSliderValue] = useState(0)
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null)
  const questionStartMs = useRef(0)
  const retry = useRef<() => void>(() => {})
  // Render-mirrored refs so async handlers read current values without stale
  // closures (same pattern as the quiz pager's currentRef).
  const stageRef = useRef<Stage>("intro")
  stageRef.current = stage
  const streakRef = useRef(0)
  streakRef.current = streak

  // Seed the rating once. Logged-in players start from their server knowledge
  // score (the same number as the profile "Knowledge score"); a null score
  // (never answered) starts at START_ELO. Guests start fresh at START_ELO and
  // are never persisted, so the "won't be saved" promise stays honest.
  // Keyed on the username (not the user object identity, which changes on any
  // profile edit) and applied only while the intro is showing, so a refetch
  // can never overwrite the live rating mid-marathon.
  const username = user?.username
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (username && stageRef.current === "intro") {
        try {
          const r = await apiFetch(`/api/users/${username}/elo`)
          const d = r.ok ? await r.json() : null
          if (!alive || stageRef.current !== "intro") return
          setSessionElo(d?.global_rating ?? START_ELO)
        } catch {
          if (alive && stageRef.current === "intro") setSessionElo(START_ELO)
        }
      }
      if (alive) setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [username])

  // Fetch the next question. Mid-session a null means the pool is exhausted -> summary.
  const loadQuestion = useCallback(async (ids: string[], elo: number) => {
    setError("")
    setBusy(true)
    try {
      const q = await fetchNextQuestion({ currentElo: elo, answeredIds: ids })
      if (!q) {
        setStage("summary")
        return
      }
      setCurrent(q)
      setSelected(null)
      setLastResult(null)
      // Numeric questions start the slider at a random step within their limits
      // (so it never anchors on the midpoint / a hintable spot, and the player
      // always has to move it to commit). Never on the correct answer itself:
      // an unmoved submit would be a free full-time-bonus correct.
      if (q.kind === "numeric") {
        const step = q.step ?? 1
        const steps = Math.floor((q.max - q.min) / step)
        let rand = q.min + Math.round(Math.random() * steps) * step
        if (rand === q.answerValue) {
          rand = rand + step <= q.max ? rand + step : rand - step
        }
        setSliderValue(Math.min(q.max, Math.max(q.min, rand)))
      }
      questionStartMs.current = Date.now()
      setStage("question")
    } catch {
      retry.current = () => loadQuestion(ids, elo)
      setError("Could not load the next question.")
    } finally {
      setBusy(false)
    }
  }, [])

  function handleStart() {
    setStartElo(sessionElo)
    loadQuestion(answeredIds, sessionElo)
  }

  // Shared bookkeeping once an answer is scored (same for choice and slider).
  // Consistently functional updaters (plus the streak ref for the paired
  // best-streak write), so nothing here depends on a stale closure.
  function applyResult(result: AnswerResult) {
    if (!current) return
    const currentId = current.id
    const nextStreak = result.correct ? streakRef.current + 1 : 0

    setLastResult(result)
    setSessionElo(result.eloAfter)
    setAnsweredIds((prev) => [...prev, currentId])
    setLifetimeAnswered((prev) => prev + 1)
    setStreak(nextStreak)
    setBestStreak((b) => Math.max(b, nextStreak))
    setResults((r) => [...r, result])
    // No client persistence: logged-in scores are saved server-side by
    // /api/train/answer; guests are pure practice and never persisted.
    setStage("feedback")
  }

  // The submit body takes the reaction time as a parameter so a retry replays
  // the ORIGINAL payload: recomputing answer_ms at retry time measured the
  // error round trip as thinking time and destroyed the speed bonus.
  async function submitChoice(index: number, answerMs: number) {
    if (!current) return
    setSelected(index)
    setBusy(true)
    setError("")
    try {
      const result = await submitAnswer({
        question: current,
        chosenIndex: index,
        answerMs,
        currentElo: sessionElo,
        // K-factor continuity for the guest local simulation: pass the lifetime
        // scored count so it stays stable. Ignored on the logged-in path.
        answeredCountInSession: lifetimeAnswered,
        loggedIn: !!user,
      })
      applyResult(result)
    } catch {
      setSelected(null)
      retry.current = () => void submitChoice(index, answerMs)
      setError("Could not submit your answer.")
    } finally {
      setBusy(false)
    }
  }

  function handleSelect(index: number) {
    if (!current || current.kind === "numeric" || stage !== "question" || busy || selected !== null) return
    void submitChoice(index, Date.now() - questionStartMs.current)
  }

  async function submitNumeric(value: number, answerMs: number) {
    if (!current) return
    setBusy(true)
    setError("")
    try {
      const result = await submitAnswer({
        question: current,
        chosenValue: value,
        answerMs,
        currentElo: sessionElo,
        answeredCountInSession: lifetimeAnswered,
        loggedIn: !!user,
      })
      applyResult(result)
    } catch {
      retry.current = () => void submitNumeric(value, answerMs)
      setError("Could not submit your answer.")
    } finally {
      setBusy(false)
    }
  }

  // Submit the slider's current value for a numeric question.
  function handleSubmitNumeric() {
    if (!current || current.kind !== "numeric" || stage !== "question" || busy) return
    void submitNumeric(sliderValue, Date.now() - questionStartMs.current)
  }

  function handleNext() {
    // Busy-guarded so rapid taps cannot start two overlapping loads once
    // question fetching becomes async for real.
    if (busy) return
    // answeredIds already includes the just-answered question, so this either
    // returns a fresh question or null (pool exhausted -> summary).
    loadQuestion(answeredIds, sessionElo)
  }

  function trainAgain() {
    // Keep the carried-over rating + lifetime count; reset only the session.
    setAnsweredIds([])
    setStreak(0)
    setBestStreak(0)
    setResults([])
    setSelected(null)
    setLastResult(null)
    setStartElo(sessionElo)
    loadQuestion([], sessionElo)
  }

  function handleExit() {
    if (onExit) onExit()
  }

  // --- Render helpers -------------------------------------------------------

  // QuizSection coloring conventions: correct option always revealed in good,
  // a wrong pick in bad, the rest dimmed. Rest state is a frosted white/6% pill.
  function optionStyle(i: number): React.CSSProperties {
    if (stage !== "feedback" || !lastResult) {
      return { borderColor: "transparent", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-body)" }
    }
    if (i === lastResult.correctIndex) {
      return { borderColor: "var(--color-good)", background: "rgb(106 191 132 / 0.10)", color: "var(--color-good)" }
    }
    if (i === selected) {
      return { borderColor: "var(--color-bad)", background: "color-mix(in srgb, var(--color-bad) 10%, transparent)", color: "var(--color-bad)" }
    }
    return { borderColor: "var(--color-edge)", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-muted)" }
  }

  // Color was the only marker of an answered option (A11Y-018): a glyph and a
  // spoken suffix carry the same state without it.
  function optionState(i: number): "correct" | "incorrect" | null {
    if (stage !== "feedback" || !lastResult) return null
    if (i === lastResult.correctIndex) return "correct"
    if (i === selected) return "incorrect"
    return null
  }

  const OPTION_GLYPH = { correct: "✓", incorrect: "✗" } as const
  const OPTION_SUFFIX = { correct: ", correct answer", incorrect: ", your choice, incorrect" } as const

  // The top strip: rating + streak, rendered in both question and feedback.
  function renderStrip() {
    return (
      <>
        {/* Settled values only. TickingNumber animates per frame and is kept
            out of every live region (A11Y-018). */}
        <div aria-live="polite" className="sr-only">
          {`Rating ${Math.round(sessionElo)}, streak ${streak}`}
        </div>
        <div aria-hidden="true" className="flex items-center justify-around">
          <Stat label="Rating" value={Math.round(sessionElo)} />
          <StreakStat streak={streak} />
        </div>
      </>
    )
  }

  // The answer surface differs by question kind: option pills for choice,
  // the tactile slider for numeric. Rendered in both question and feedback.
  function renderAnswerArea() {
    if (!current) return null
    if (current.kind === "numeric") {
      const answered = stage === "feedback" && !!lastResult
      return (
        <div className="flex flex-col gap-4">
          <NumberSlider
            min={current.min}
            max={current.max}
            step={current.step ?? 1}
            unit={current.unit}
            value={sliderValue}
            onChange={setSliderValue}
            disabled={answered || busy}
            showResult={answered}
            correct={lastResult?.correct}
            correctValue={lastResult?.correctValue}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitNumeric} disabled={busy}>
              Submit
            </button>
          )}
        </div>
      )
    }
    const interactive = stage === "question"
    return (
      <div className="flex flex-col gap-2.5">
        {current.options.map((opt, i) => (
          <button
            key={i}
            onClick={interactive ? () => handleSelect(i) : undefined}
            disabled={!interactive || selected !== null || busy}
            aria-label={optionState(i) ? `${opt}${OPTION_SUFFIX[optionState(i)!]}` : undefined}
            className="text-left rounded-3xl border px-5 py-4 text-base transition-colors duration-150 disabled:cursor-default"
            style={optionStyle(i)}
          >
            {opt}
            {optionState(i) && <span aria-hidden="true" className="ml-2">{OPTION_GLYPH[optionState(i)!]}</span>}
          </button>
        ))}
      </div>
    )
  }

  function renderIntro() {
    return (
      <div className="flex flex-col gap-5">
        {/* Header: "Train" on the left, the rating in its own lamp-tinted box. */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif font-medium text-[34px] text-ink">Train</h1>
          <div
            className="rounded-field border px-4 py-2 flex flex-col items-center"
            style={{ borderColor: "rgb(124 111 255 / 0.35)", backgroundColor: "rgb(124 111 255 / 0.12)" }}
          >
            <span className={LABEL_CAPS} style={{ color: "var(--color-lamp)" }}>
              Rating
            </span>
            <span className="font-mono text-[30px] leading-9 text-lamp">{Math.round(sessionElo)}</span>
          </div>
        </div>

        <p className="text-ink-dim text-[15px] text-center">
          Answer to climb your rating. Faster correct answers earn more.
        </p>

        {/* Blurred teaser question with the Start button centered on top: a real
            question rendered blurred so the shape of the challenge shows but it
            stays unreadable until you start. */}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-3.5 blur-[3px] select-none pointer-events-none">
            <p className="font-serif text-[22px] leading-[30px] text-ink">{PREVIEW_QUESTION.prompt}</p>
            <div className="flex flex-col gap-2.5">
              {PREVIEW_QUESTION.options.map((opt, i) => (
                <div key={i} className="rounded-3xl px-5 py-4 text-base text-ink" style={{ backgroundColor: "rgb(255 255 255 / 0.12)" }}>
                  {opt}
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Dark pill with a lamp outline and lamp text, over the blurred card. */}
            <button
              onClick={handleStart}
              className="rounded-full px-10 py-3.5 text-base font-medium text-lamp"
              style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-lamp)" }}
            >
              Start
            </button>
          </div>
        </GlowCard>

        {!user && <GuestNote />}
      </div>
    )
  }

  function renderQuestion() {
    if (!current) return null
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-4">
            {!reduceMotion && <ElapsedBar key={current.id} />}
            <p className="font-serif text-[22px] leading-[30px] text-ink">{current.prompt}</p>
          </div>
        </GlowCard>
        {renderAnswerArea()}
      </div>
    )
  }

  function renderFeedback() {
    if (!current || !lastResult) return null
    const good = lastResult.correct
    const deltaColor = lastResult.delta >= 0 ? "var(--color-good)" : "var(--color-bad)"
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] tracking-[0.16em] uppercase font-semibold"
                style={{ color: good ? "var(--color-good)" : "var(--color-bad)" }}
              >
                {good ? "Correct" : "Incorrect"}
              </span>
              <div className="flex items-center gap-2.5">
                <TickingNumber
                  from={lastResult.eloBefore}
                  to={lastResult.eloAfter}
                  reduceMotion={reduceMotion}
                  className="font-mono text-[18px] text-lamp"
                />
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[13px]"
                  style={{ backgroundColor: `color-mix(in srgb, ${deltaColor} 15%, transparent)`, color: deltaColor }}
                >
                  {lastResult.delta >= 0 ? "+" : ""}
                  {lastResult.delta}
                </span>
              </div>
            </div>
            <p className="font-serif text-[20px] leading-7 text-ink">{current.prompt}</p>
          </div>
        </GlowCard>
        {renderAnswerArea()}
        {lastResult.explanation && <p className="text-ink-dim text-sm leading-[21px]">{lastResult.explanation}</p>}
        <button className="btn btn-primary w-full py-3" onClick={handleNext}>
          Next
        </button>
      </div>
    )
  }

  function renderSummary() {
    const total = results.length
    const correct = results.filter((r) => r.correct).length
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
    const net = Math.round(sessionElo) - Math.round(startElo)
    const netColor = net >= 0 ? "var(--color-good)" : "var(--color-bad)"
    return (
      <div className="flex flex-col gap-5">
        <GlowCard>
          <div className="px-6 py-8 flex flex-col items-center gap-4">
            <span className="font-serif font-medium text-[26px] text-ink">Session complete</span>
            <span className="font-mono text-[44px] leading-[52px] text-lamp">{Math.round(sessionElo)}</span>
            <div className="self-stretch flex flex-col gap-2.5">
              <SummaryRow label="Answered" value={String(total)} />
              <SummaryRow label="Accuracy" value={`${accuracy}%`} />
              <SummaryRow label="Best streak" value={String(bestStreak)} />
              <SummaryRow label="Rating change" value={`${net >= 0 ? "+" : ""}${net}`} valueColor={netColor} />
            </div>
          </div>
        </GlowCard>

        {/* The mock pool is finite; frame hitting its end as intentional. */}
        <MessageSlab>
          <p className="text-ink-dim text-sm">You&rsquo;ve cleared the current set &mdash; more questions coming soon.</p>
        </MessageSlab>

        {!user && <GuestNote />}

        <div className="flex flex-col gap-2.5">
          <button className="btn btn-primary w-full py-3" onClick={trainAgain}>
            Train again
          </button>
          <button className="btn btn-ghost w-full py-3" onClick={handleExit}>
            Back to feed
          </button>
        </div>
      </div>
    )
  }

  function renderError() {
    return (
      <MessageSlab>
        <p className="text-ink-dim text-sm">{error}</p>
        <button
          className="btn btn-ghost px-5 py-2.5"
          onClick={() => {
            setError("")
            retry.current()
          }}
        >
          Try again
        </button>
      </MessageSlab>
    )
  }

  let body: React.ReactNode
  if (!loaded || (busy && !current)) {
    // Initial progress load, or fetching the very first question (nothing to
    // show yet). Once a question exists we keep it on screen through submits.
    body = <div className="stage-pulse card h-80 w-full" />
  } else if (error) {
    body = renderError()
  } else if (stage === "intro") {
    body = renderIntro()
  } else if (stage === "question") {
    body = renderQuestion()
  } else if (stage === "feedback") {
    body = renderFeedback()
  } else {
    body = renderSummary()
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain px-4 pt-20 pb-24">
      {body}
    </div>
  )
}

// One label/value row in the summary slab.
function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-dim text-sm">{label}</span>
      <span className="font-mono text-[15px]" style={{ color: valueColor ?? "var(--color-ink)" }}>
        {value}
      </span>
    </div>
  )
}
