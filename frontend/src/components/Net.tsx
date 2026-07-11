"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d"
import { FORMAT_IDS, FORMAT_STYLES, formatStyle } from "@/lib/formats"
import { hasToken } from "@/lib/auth"
import type { AnsweredResponse, GraphEdge, GraphNode, GraphResponse } from "@/types/graph"

// react-force-graph touches window/canvas at import time, so it is browser-only.
// This is safe as a static import because page.tsx mounts <Net> via
// dynamic(..., { ssr: false }): the whole module is only ever evaluated in the
// browser. A static import (rather than an inner next/dynamic) is deliberate --
// next/dynamic does not forward refs, and we need the ref to drive zoomToFit and
// pause/resume.

// A bright, saturated green for "quiz fully completed". Deliberately distinct
// from the academy format accent (#73c28d, itself a muted green); the completion
// ring drawn in nodeCanvasObject removes any remaining ambiguity.
const COMPLETED_GREEN = "#3ddc84"
const NODE_REL_SIZE = 4

type FGNode = NodeObject<GraphNode>
type FGLink = LinkObject<GraphNode, GraphEdge>

export default function Net({ active }: { active: boolean }) {
  const router = useRouter()
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const didFitRef = useRef(false)

  const { data: graph, error, mutate } = useSWR<GraphResponse>("/api/graph")
  // Only a logged-in user has answered state; gate the request on the token so a
  // logged-out viewer makes no call and simply sees no green nodes (mirrors the
  // Following tab's hasToken gate).
  const { data: answered } = useSWR<AnsweredResponse>(
    hasToken() ? "/api/quiz/answered" : null,
  )

  // Ids of nodes the viewer has fully completed (answered every quiz question).
  const completed = useMemo(() => {
    const set = new Set<number>()
    if (!graph) return set
    const counts = answered?.counts ?? {}
    for (const n of graph.nodes) {
      if (n.quiz_total > 0 && (counts[n.id] ?? 0) >= n.quiz_total) set.add(n.id)
    }
    return set
  }, [graph, answered])

  // Fresh clones for the library: react-force-graph mutates nodes (adds x/y/vx/
  // vy) and rewrites link source/target from ids to node refs. Keyed ONLY on the
  // topology (graph), never on `completed`, so answering a quiz never rebuilds
  // this object and re-heats the simulation -- completion is applied purely in
  // the color/canvas accessors below.
  const graphData = useMemo(
    () => ({
      nodes: graph ? graph.nodes.map((n) => ({ ...n })) : [],
      links: graph ? graph.edges.map((e) => ({ ...e })) : [],
    }),
    [graph],
  )

  // Recreated only when `completed` changes, so react-force-graph repaints node
  // colors without touching graphData (no re-heat).
  const nodeColor = useCallback(
    (node: FGNode) =>
      completed.has(node.id) ? COMPLETED_GREEN : formatStyle(node.format).accent,
    [completed],
  )

  const drawNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      // A ring on completed nodes: a second, unmistakable "done" cue beyond the
      // green fill (also disambiguates from the greenish academy accent).
      if (completed.has(node.id)) {
        ctx.beginPath()
        ctx.arc(x, y, NODE_REL_SIZE + 1.6, 0, 2 * Math.PI)
        ctx.strokeStyle = COMPLETED_GREEN
        ctx.lineWidth = 1.2 / globalScale
        ctx.stroke()
      }
      // Titles only once zoomed in, so the overview stays a clean constellation.
      if (globalScale > 1.6) {
        const fontSize = Math.min(4, 11 / globalScale)
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillStyle = "rgba(236, 238, 255, 0.85)"
        ctx.fillText(node.title, x, y + NODE_REL_SIZE + 1)
      }
    },
    [completed],
  )

  // Measure the container and feed numeric width/height: the pager translates
  // pages off-screen, so the library's own auto-size can read 0x0 here.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pause the render loop and simulation when the tab is swiped away, resume on
  // return (mirrors Battle's socket gating) so a background Net never spins the CPU.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (active) fg.resumeAnimation()
    else fg.pauseAnimation()
  }, [active, graphData, size.w])

  const handleNodeClick = useCallback(
    (node: FGNode) => router.push(`/post/${node.id}`),
    [router],
  )

  // Frame the whole graph in the phone column once the layout first settles.
  const handleEngineStop = useCallback(() => {
    if (didFitRef.current) return
    didFitRef.current = true
    fgRef.current?.zoomToFit(400, 40)
  }, [])

  let body: React.ReactNode
  if (error) {
    body = (
      <div className="h-full flex items-center justify-center px-6">
        <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
          <p className="font-serif text-xl text-ink leading-snug">Could not load the net</p>
          <p className="text-ink-muted text-sm">Check your connection and try again.</p>
          <button onClick={() => mutate()} className="btn btn-primary px-5 py-2">
            Retry
          </button>
        </div>
      </div>
    )
  } else if (!graph) {
    body = (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="stage-pulse card h-40 w-40 rounded-full" />
        <div className="stage-pulse card h-4 w-32" />
      </div>
    )
  } else if (graph.nodes.length === 0) {
    body = (
      <div className="h-full flex items-center justify-center px-6">
        <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-2">
          <p className="font-serif text-xl text-ink leading-snug">Nothing to explore yet</p>
          <p className="text-ink-muted text-sm">Posts will appear here as a network.</p>
        </div>
      </div>
    )
  } else {
    body =
      size.w > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#0a0a0a"
          nodeRelSize={NODE_REL_SIZE}
          nodeColor={nodeColor}
          nodeLabel={(node: FGNode) => node.title}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={drawNode}
          linkColor={(link: FGLink) =>
            link.kind === "bridge" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)"
          }
          linkWidth={(link: FGLink) => 0.4 + (link.weight ?? 0) * 2.4}
          cooldownTicks={150}
          minZoom={0.4}
          maxZoom={8}
          onNodeClick={handleNodeClick}
          onEngineStop={handleEngineStop}
        />
      ) : null
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-surface-0 overflow-hidden">
      {body}
      {graph && graph.nodes.length > 0 && <Legend />}
    </div>
  )
}

// Compact frosted key: the green "Completed" cue plus the seven format accents,
// so the node colors are legible without tapping. pointer-events-none keeps it
// from intercepting pan/zoom on the canvas beneath it.
function Legend() {
  return (
    <div
      className="absolute top-3 left-3 rounded-xl px-3 py-2.5 pointer-events-none select-none"
      style={{ backgroundColor: "rgba(16,16,20,0.72)", backdropFilter: "blur(8px)" }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: COMPLETED_GREEN, boxShadow: `0 0 0 1.5px ${COMPLETED_GREEN}55` }}
        />
        <span className="text-ink text-[11px] font-medium">Completed</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {FORMAT_IDS.map((id) => (
          <div key={id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: FORMAT_STYLES[id].accent }}
            />
            <span className="text-ink-muted text-[10px]">{FORMAT_STYLES[id].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
