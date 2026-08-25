"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo"
import { feature } from "topojson-client"
import type { FeatureCollection, Geometry } from "geojson"
import type { GeometryCollection, Topology } from "topojson-specification"
import countries110m from "world-atlas/countries-110m.json"

// A world-map "drop a pin" answer surface for the map question kind. Built on
// d3-geo (the same projection engine react-simple-maps wraps) plus the
// world-atlas country outlines, rendered as plain React <path> elements -- no
// dangerouslySetInnerHTML and no user content, so the SVG-security rules in
// CLAUDE.md do not apply here.
//
// Why d3-geo directly and not react-simple-maps: that library still relies on
// React function-component defaultProps, which React 19 dropped, so it renders
// broken on this stack (Next 16 / React 19). Doing the projection ourselves also
// makes click -> lat/lng inversion exact.
//
// The projection is FIXED; zoom/pan is done by moving the SVG viewBox (a camera
// over a static map), so every country path is projected once at module load and
// only the viewBox and the two pins change per render.

// Base map size in SVG user units. The viewBox starts here (whole world) and
// shrinks to zoom in. Height tracks the Equal Earth aspect ratio (~1.97:1).
const MAP_W = 800
const MAP_H = 405
// Zoom bounds: viewBox width never below 25% of the map (4x zoom) or above full.
const MIN_VB_W = MAP_W * 0.25
// A pointer that moves less than this (in px) between down and up is a tap that
// places the pin, not a pan.
const TAP_PX = 6
// A pointer-down within this screen radius (px) of the pin grabs it to drag.
const PIN_HIT_PX = 24
// Pin marker geometry in user units at full zoom; scaled by the zoom factor so
// the pin holds a constant on-screen size however far the map is zoomed.
const PIN_R = 7

// Project the world once. fitExtent packs the whole globe (a Sphere) into the
// padded base box, so the projection and every derived path are static.
const projection = geoEqualEarth().fitExtent(
  [
    [6, 6],
    [MAP_W - 6, MAP_H - 6],
  ],
  { type: "Sphere" },
)
const pathGen = geoPath(projection)

const topo = countries110m as unknown as Topology
const countries = feature(
  topo,
  topo.objects.countries as GeometryCollection,
) as FeatureCollection<Geometry>

const SPHERE_D = pathGen({ type: "Sphere" }) ?? ""
const GRATICULE_D = pathGen(geoGraticule10()) ?? ""
const COUNTRY_PATHS = countries.features.map((f) => pathGen(f) ?? "").filter(Boolean)

type LatLng = { lat: number; lng: number }
type ViewBox = { x: number; y: number; w: number; h: number }
type Mode = "idle" | "maybe" | "pan" | "pin"

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function clampLatLng(lat: number, lng: number): LatLng {
  return { lat: clamp(lat, -90, 90), lng: clamp(lng, -180, 180) }
}

// Project a lat/lng to SVG user coordinates, or null if it does not land on the
// globe (should not happen for a clamped value).
function projectPoint(p: LatLng): [number, number] | null {
  const xy = projection([p.lng, p.lat])
  if (!xy || Number.isNaN(xy[0]) || Number.isNaN(xy[1])) return null
  return xy as [number, number]
}

interface Props {
  // The current guess pin, or null before the player has placed one.
  value: LatLng | null
  onChange: (p: LatLng) => void
  // Locks interaction (answered / waiting on the server).
  disabled?: boolean
  // Result mode: reveal the correct location alongside the guess and stop
  // accepting input.
  showResult?: boolean
  answer?: LatLng | null
  answerLabel?: string
}

export default function WorldMapPicker({
  value,
  onChange,
  disabled,
  showResult,
  answer,
  answerLabel,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: MAP_W, h: MAP_H })
  // Gesture bookkeeping kept in a ref so pointer moves do not re-render until
  // there is something to show (a pan or a placed pin).
  const gesture = useRef<{ mode: Mode; startX: number; startY: number; startVb: ViewBox }>({
    mode: "idle",
    startX: 0,
    startY: 0,
    startVb: vb,
  })

  const locked = !!disabled || !!showResult
  // On-screen size holds constant across zoom: user-space sizes scale with the
  // viewBox so a zoomed-in pin does not balloon.
  const zoomScale = vb.w / MAP_W

  // Map a client (page) point to SVG user coordinates through the live viewBox.
  const clientToUser = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const el = svgRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const ux = vb.x + ((clientX - rect.left) / rect.width) * vb.w
      const uy = vb.y + ((clientY - rect.top) / rect.height) * vb.h
      return [ux, uy]
    },
    [vb],
  )

  // Place the pin at a client point by inverting the projection; ignore points
  // that fall outside the globe (ocean corners of the projection).
  const placeAtClient = useCallback(
    (clientX: number, clientY: number) => {
      const user = clientToUser(clientX, clientY)
      if (!user) return
      const inv = projection.invert?.(user)
      if (!inv || Number.isNaN(inv[0]) || Number.isNaN(inv[1])) return
      const [lng, lat] = inv
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
      onChange(clampLatLng(lat, lng))
    },
    [clientToUser, onChange],
  )

  function pinScreenDistance(clientX: number, clientY: number): number {
    const el = svgRef.current
    if (!el || !value) return Infinity
    const xy = projectPoint(value)
    if (!xy) return Infinity
    const rect = el.getBoundingClientRect()
    const sx = rect.left + ((xy[0] - vb.x) / vb.w) * rect.width
    const sy = rect.top + ((xy[1] - vb.y) / vb.h) * rect.height
    return Math.hypot(clientX - sx, clientY - sy)
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (locked || e.button !== 0) return
    const onPin = pinScreenDistance(e.clientX, e.clientY) <= PIN_HIT_PX
    gesture.current = {
      mode: onPin ? "pin" : "maybe",
      startX: e.clientX,
      startY: e.clientY,
      startVb: vb,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture may be unavailable; the gesture still works, just not outside
    }
    if (onPin) placeAtClient(e.clientX, e.clientY)
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    if (g.mode === "idle" || locked) return
    if (g.mode === "pin") {
      placeAtClient(e.clientX, e.clientY)
      return
    }
    const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY)
    if (g.mode === "maybe") {
      if (moved <= TAP_PX) return
      // Past the threshold: this is a pan, not a tap.
      g.mode = "pan"
    }
    // Pan: translate the viewBox opposite the drag, clamped to the base map.
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dxUser = ((e.clientX - g.startX) / rect.width) * g.startVb.w
    const dyUser = ((e.clientY - g.startY) / rect.height) * g.startVb.h
    setVb({
      x: clamp(g.startVb.x - dxUser, 0, MAP_W - g.startVb.w),
      y: clamp(g.startVb.y - dyUser, 0, MAP_H - g.startVb.h),
      w: g.startVb.w,
      h: g.startVb.h,
    })
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    // A press that never crossed the pan threshold is a tap: place the pin.
    if (g.mode === "maybe") placeAtClient(e.clientX, e.clientY)
    gesture.current = { ...g, mode: "idle" }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // capture may already be gone
    }
  }

  // Zoom about the pin when there is one, else the current viewBox centre, so
  // zooming in homes on the guess for fine-tuning.
  function zoomBy(factor: number) {
    const newW = clamp(vb.w * factor, MIN_VB_W, MAP_W)
    const newH = newW * (MAP_H / MAP_W)
    const focus = value ? projectPoint(value) : null
    const cx = focus ? focus[0] : vb.x + vb.w / 2
    const cy = focus ? focus[1] : vb.y + vb.h / 2
    setVb({
      x: clamp(cx - newW / 2, 0, MAP_W - newW),
      y: clamp(cy - newH / 2, 0, MAP_H - newH),
      w: newW,
      h: newH,
    })
  }

  // Keyboard operability (A11Y): arrows nudge the pin, placing one at the view
  // centre first if none exists. Finer steps when zoomed in.
  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (locked) return
    const step = 1.5 * zoomScale
    const base =
      value ??
      (() => {
        const inv = projection.invert?.([vb.x + vb.w / 2, vb.y + vb.h / 2])
        return inv ? { lat: inv[1], lng: inv[0] } : { lat: 0, lng: 0 }
      })()
    let handled = true
    switch (e.key) {
      case "ArrowUp":
        onChange(clampLatLng(base.lat + step, base.lng))
        break
      case "ArrowDown":
        onChange(clampLatLng(base.lat - step, base.lng))
        break
      case "ArrowLeft":
        onChange(clampLatLng(base.lat, base.lng - step))
        break
      case "ArrowRight":
        onChange(clampLatLng(base.lat, base.lng + step))
        break
      case "+":
      case "=":
        zoomBy(0.6)
        break
      case "-":
        zoomBy(1 / 0.6)
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  const guessXY = value ? projectPoint(value) : null
  const answerXY = showResult && answer ? projectPoint(answer) : null

  // Marker path: a teardrop pin (circle head over a point). Drawn centred on
  // (0,0) then translated, sized in user units scaled to hold screen size.
  const pinR = PIN_R * zoomScale
  const strokeW = 1.4 * zoomScale

  const announce = useMemo(() => {
    if (showResult && answer) return `Correct location: ${answerLabel ?? `${answer.lat.toFixed(1)}, ${answer.lng.toFixed(1)}`}.`
    if (value) return `Pin at ${value.lat.toFixed(1)}, ${value.lng.toFixed(1)}. Tap the map to move it.`
    return "No pin placed. Tap the map to place your guess."
  }, [value, showResult, answer, answerLabel])

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-edge" style={{ background: "rgb(24 30 46 / 0.6)" }}>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="block w-full h-auto select-none"
        style={{ touchAction: "none", cursor: locked ? "default" : "crosshair" }}
        role="application"
        aria-label="World map. Tap to drop a pin where you think the answer is; arrow keys nudge the pin."
        aria-disabled={locked || undefined}
        tabIndex={locked ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* Ocean */}
        <path d={SPHERE_D} fill="rgb(37 47 71 / 0.55)" stroke="var(--color-edge)" strokeWidth={strokeW} />
        {/* Latitude/longitude grid */}
        <path d={GRATICULE_D} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={0.5 * zoomScale} />
        {/* Countries */}
        {COUNTRY_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="rgb(255 255 255 / 0.10)"
            stroke="rgb(255 255 255 / 0.28)"
            strokeWidth={0.5 * zoomScale}
          />
        ))}

        {/* Line from guess to answer in result mode. */}
        {guessXY && answerXY && (
          <line
            x1={guessXY[0]}
            y1={guessXY[1]}
            x2={answerXY[0]}
            y2={answerXY[1]}
            stroke="var(--color-good)"
            strokeWidth={strokeW}
            strokeDasharray={`${4 * zoomScale} ${3 * zoomScale}`}
          />
        )}

        {/* Correct location (result mode). */}
        {answerXY && (
          <g transform={`translate(${answerXY[0]} ${answerXY[1]})`}>
            <circle r={pinR} fill="var(--color-good)" stroke="#fff" strokeWidth={strokeW} />
          </g>
        )}

        {/* The guess pin. */}
        {guessXY && (
          <g transform={`translate(${guessXY[0]} ${guessXY[1]})`}>
            <circle
              r={pinR}
              fill={showResult ? "var(--color-bad)" : "var(--color-lamp)"}
              stroke="#fff"
              strokeWidth={strokeW}
            />
          </g>
        )}
      </svg>

      {/* Zoom controls (hidden in result mode -- the map is static then). */}
      {!locked && (
        <div className="absolute bottom-2.5 right-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(0.6)}
            className="w-9 h-9 rounded-full border border-edge flex items-center justify-center text-ink text-xl leading-none"
            style={{ background: "rgb(15 20 33 / 0.85)" }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 0.6)}
            className="w-9 h-9 rounded-full border border-edge flex items-center justify-center text-ink text-xl leading-none"
            style={{ background: "rgb(15 20 33 / 0.85)" }}
          >
            &minus;
          </button>
        </div>
      )}

      {/* Legend in result mode so the two pins are unambiguous. */}
      {showResult && answer && (
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 rounded-xl px-2.5 py-1.5" style={{ background: "rgb(15 20 33 / 0.85)" }}>
          <span className="flex items-center gap-1.5 text-[11px] text-ink">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-bad)" }} /> Your pin
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-good)" }} />{" "}
            {answerLabel ?? "Answer"}
          </span>
        </div>
      )}
    </div>
  )
}
