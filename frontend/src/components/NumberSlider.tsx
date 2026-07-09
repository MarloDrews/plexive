"use client"

import { useCallback, useRef, useState } from "react"

// A tactile slider for Train/Battle numeric questions, ported from the mobile
// NumberSlider (mobile/src/components/train/NumberSlider.tsx). Pointer drag (or
// click) on the track snaps the value to `step`; the thumb swells while held.
// In result mode the track locks and the correct value is marked with a tick,
// the thumb tinted good/bad. No haptics on web; otherwise the feel mirrors
// mobile. `min`/`max` are the question's limits; the parent owns `value`.

const TRACK_H = 6
const THUMB = 28 // thumb diameter (also the visual grab target)

interface Props {
  min: number
  max: number
  step: number
  value: number
  unit?: string
  onChange: (value: number) => void
  disabled?: boolean
  // Result mode: lock the slider and reveal the correct value.
  showResult?: boolean
  correct?: boolean
  correctValue?: number
  // Accessible name; the visible readout is aria-hidden because the slider
  // announces its own value through aria-valuetext.
  ariaLabel?: string
}

// Round a raw value to the nearest step within [min, max].
function snap(raw: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, raw))
  const snapped = min + Math.round((clamped - min) / step) * step
  return Math.min(max, Math.max(min, snapped))
}

// Format the value with its unit; integers print clean, fractional steps keep
// enough decimals to show the step (e.g. step 0.5 -> "2.5").
function format(value: number, step: number, unit?: string): string {
  const decimals = Number.isInteger(step) ? 0 : String(step).split(".")[1]?.length ?? 1
  return `${value.toFixed(decimals)}${unit ?? ""}`
}

export default function NumberSlider({
  min,
  max,
  step,
  value,
  unit,
  onChange,
  disabled,
  showResult,
  correct,
  correctValue,
  ariaLabel = "Numeric answer",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  // The live value while dragging stays LOCAL: every step crossing used to
  // call onChange and re-render the whole parent screen (Marathon/Battle);
  // the parent now gets one onChange when the pointer is released.
  const [liveValue, setLiveValue] = useState<number | null>(null)
  const locked = !!disabled || !!showResult

  const shown = liveValue ?? value
  // Clamped so an out-of-range value can never paint the fill/thumb outside
  // the track.
  const frac = max > min ? Math.min(1, Math.max(0, (shown - min) / (max - min))) : 0

  // Map a pointer x (page coords) to a snapped local value.
  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || max <= min) return
      const rect = el.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const v = snap(min + f * (max - min), min, max, step)
      setLiveValue((prev) => (prev === v ? prev : v))
    },
    [min, max, step],
  )

  // Pointer drag: capture on the row so dragging continues outside the track.
  function onPointerDown(e: React.PointerEvent) {
    // Only the primary button starts a drag (a right/middle click used to).
    if (locked || e.button !== 0) return
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture can be unavailable (e.g. the pointer already ended)
    }
    updateFromClientX(e.clientX)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || locked) return
    updateFromClientX(e.clientX)
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return
    setDragging(false)
    // Commit once on release.
    if (liveValue !== null && liveValue !== value) onChange(liveValue)
    setLiveValue(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // capture may already be gone
    }
  }

  // Keyboard drive (A11Y-002). There is no release event to commit on, so each
  // keypress commits straight through onChange; the drag path keeps its
  // commit-on-release contract. PageUp/PageDown move ten steps.
  function onKeyDown(e: React.KeyboardEvent) {
    if (locked || max <= min) return
    let next: number
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = snap(shown + step, min, max, step)
        break
      case "ArrowLeft":
      case "ArrowDown":
        next = snap(shown - step, min, max, step)
        break
      case "PageUp":
        next = snap(shown + step * 10, min, max, step)
        break
      case "PageDown":
        next = snap(shown - step * 10, min, max, step)
        break
      case "Home":
        next = min
        break
      case "End":
        next = max
        break
      default:
        return
    }
    e.preventDefault()
    if (next !== value) onChange(next)
  }

  // Result coloring: green when right, the brand lamp while answering, red ring
  // for a wrong locked-in value.
  const accent = showResult ? (correct ? "var(--color-good)" : "var(--color-bad)") : "var(--color-lamp)"
  const correctFrac =
    correctValue !== undefined && max > min
      ? Math.min(1, Math.max(0, (correctValue - min) / (max - min)))
      : null

  return (
    <div className="flex flex-col gap-3.5">
      {/* Big live value readout. aria-hidden: the slider announces the value. */}
      <div className="flex flex-col items-center">
        <span aria-hidden="true" className="font-mono text-[40px] leading-none" style={{ color: accent }}>
          {format(shown, step, unit)}
        </span>
        {showResult && correctValue !== undefined && !correct && (
          <span className="font-mono text-[13px] text-good mt-1">
            Answer: {format(correctValue, step, unit)}
          </span>
        )}
      </div>

      {/* Tall padded row so the whole area is grabbable, and the focusable
          slider itself: the ring then wraps the same area the pointer uses. */}
      <div
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-valuetext={format(shown, step, unit)}
        aria-disabled={locked || undefined}
        tabIndex={locked ? -1 : 0}
        onKeyDown={onKeyDown}
        className={`relative py-4 select-none rounded-lg ${locked ? "" : "cursor-pointer touch-none"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={trackRef}
          className="relative rounded-full"
          style={{ height: TRACK_H, backgroundColor: "rgb(255 255 255 / 0.15)" }}
        >
          {/* Filled portion up to the thumb. */}
          <div
            className="absolute left-0 top-0 rounded-full"
            style={{ width: `${frac * 100}%`, height: TRACK_H, backgroundColor: accent }}
          />
          {/* Correct-value tick (result mode only). */}
          {showResult && correctFrac !== null && (
            <div
              className="absolute rounded-full"
              style={{
                left: `${correctFrac * 100}%`,
                width: 2,
                height: TRACK_H + 12,
                top: -6,
                marginLeft: -1,
                backgroundColor: "var(--color-good)",
              }}
            />
          )}
          {/* The thumb. */}
          <div
            className="absolute top-1/2 rounded-full transition-transform duration-100"
            style={{
              left: `${frac * 100}%`,
              width: THUMB,
              height: THUMB,
              transform: `translate(-50%, -50%) scale(${dragging ? 1.25 : 1})`,
              backgroundColor: "var(--color-ink)",
              border: `3px solid ${accent}`,
            }}
          />
        </div>
      </div>

      {/* Min / max limit labels. */}
      <div className="flex justify-between">
        <span className="font-mono text-[12px] text-ink-muted">{format(min, step, unit)}</span>
        <span className="font-mono text-[12px] text-ink-muted">{format(max, step, unit)}</span>
      </div>
    </div>
  )
}
