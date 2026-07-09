"use client"

// Shared chart kit for the three stats tabs, split out of the former stats
// page monolith. Holds the Stage chart chrome constants, the custom chart
// components, and the reusable chart builders that GlobalTab and MyStatsTab
// previously declared as duplicated render-body closures (hoisted to module
// scope: one copy, built once per call instead of re-declared per render).
// recharts is imported only here and in the tab files, which the page loads
// via next/dynamic, so the whole kit stays out of the route's eager chunk.

import { useState, type ReactNode } from "react"
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { FORMAT_IDS, FORMAT_STYLES } from "@/lib/formats"

// --- Constants ---

export const FORMAT_COLORS: Record<string, string> = Object.fromEntries(
  FORMAT_IDS.map((id) => [id, FORMAT_STYLES[id].accent]),
)
export const FORMATS: string[] = [...FORMAT_IDS]
export const DEFAULT_COLOR = "#7888a8"
export const RANK_COLORS = ["#7c6fff", "#6655d8", "#5040a8", "#3a2e78", "#251d4a"]

// Stage chart chrome: frosted dark tooltip, neutral ink axes, hairline grid.
export const TT = {
  contentStyle: {
    background: "rgba(20,20,20,0.96)",
    border: "none",
    borderRadius: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    color: "#eeeeee",
    fontSize: 12,
  },
  labelStyle: { color: "#8a8a8a" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
  wrapperStyle: { zIndex: 50 },
}

export const AXIS = { fill: "#8a8a8a", fontSize: 11 }
export const GRID = { stroke: "rgba(200,200,200,0.07)", strokeDasharray: "3 3" }

// --- Custom chart components ---

export function WaffleChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <NoData />
  const squares: string[] = []
  for (const d of data) {
    const n = Math.round((d.value / total) * 100)
    for (let i = 0; i < n; i++) squares.push(d.color)
  }
  while (squares.length < 100) squares.push(squares[squares.length - 1] ?? "#222222")
  return (
    <div className="flex flex-col gap-3">
      {/* 100 squares carrying no text. The legend below names every series and
          its value, so the grid itself is decorative (A11Y-019). */}
      <div aria-hidden="true" className="grid grid-cols-10 gap-0.5">
        {squares.slice(0, 100).map((color, i) => (
          <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-ink-dim text-xs">{d.label} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CalendarHeatmap({ data }: { data: { period: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="text-ink-muted text-sm p-4">No data</div>
  }
  const lookup = new Map(data.map(d => [d.period, d.count]))
  const maxCount = Math.max(...data.map(d => d.count), 1)
  // The 12-month window ends at the newest period key IN THE DATA, not at the
  // client's local-time month: backend periods are keyed in UTC, so around a
  // month boundary a local-clock window could silently drop the newest month.
  // YYYY-MM keys compare correctly as strings.
  const maxPeriod = data.reduce((m, d) => (d.period > m ? d.period : m), data[0].period)
  const [endYear, endMonth] = maxPeriod.split("-").map(Number)
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(endYear, endMonth - 1 - (11 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return { key, label: d.toLocaleString("default", { month: "short" }), year: d.getFullYear() }
  })
  return (
    <>
      {/* The counts lived only in a title attribute, which screen readers and
          keyboard users cannot reach (A11Y-019). The table is the real data;
          the grid below it is the picture of the same numbers. */}
      <table className="sr-only">
        {/* Deliberately generic: this renders posts_over_time on the global tab
            and my_posts_over_time on mine. The enclosing section supplies the
            subject. */}
        <caption>Monthly totals, last 12 months</caption>
        <thead>
          <tr><th scope="col">Month</th><th scope="col">Count</th></tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr key={m.key}>
              <th scope="row">{`${m.label} ${m.year}`}</th>
              <td>{lookup.get(m.key) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden="true" className="grid grid-cols-4 gap-2">
        {months.map(m => {
          const count = lookup.get(m.key) ?? 0
          const intensity = count / maxCount
          return (
            <div key={m.key} className="flex flex-col items-center gap-1">
              <div
                className="w-full h-8 rounded-lg"
                style={{
                  backgroundColor:
                    count === 0 ? "#1a1a1a" : `rgba(124,111,255,${0.2 + intensity * 0.8})`,
                }}
                title={`${m.label} ${m.year}: ${count}`}
              />
              <span className="text-ink-muted text-[10px]">{m.label}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function ActivityHeatmap({
  data,
  color = "124,111,255",
}: {
  data: { weekday: number; hour: number; count: number }[]
  color?: string
}) {
  if (!data || data.length === 0) {
    return <div className="text-ink-muted text-sm p-4">No data</div>
  }
  const lookup = new Map(data.map(d => [`${d.weekday}:${d.hour}`, d.count]))
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      {/* 168 cells whose counts lived only in a title attribute (A11Y-019).
          One row per weekday, one column per hour. */}
      <table className="sr-only">
        <caption>Activity by weekday and hour of day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {Array.from({ length: 24 }, (_, hr) => (
              <th key={hr} scope="col">{`${hr}:00`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, wd) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              {Array.from({ length: 24 }, (_, hr) => (
                <td key={hr}>{lookup.get(`${wd}:${hr}`) ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden="true" className="flex gap-0.5 min-w-max">
        <div className="flex flex-col gap-0.5 mr-1 mt-4">
          {days.map(d => (
            <div key={d} className="h-3 text-ink-muted text-[9px] leading-3 w-7">{d}</div>
          ))}
        </div>
        {Array.from({ length: 24 }, (_, hr) => (
          <div key={hr} className="flex flex-col gap-0.5">
            <div className="h-3 text-ink-muted text-[9px] leading-3 text-center w-3">
              {hr % 6 === 0 ? hr : ""}
            </div>
            {Array.from({ length: 7 }, (_, wd) => {
              const count = lookup.get(`${wd}:${hr}`) ?? 0
              const intensity = count / maxCount
              return (
                <div
                  key={wd}
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor:
                      count === 0 ? "#1a1a1a" : `rgba(${color},${0.15 + intensity * 0.85})`,
                  }}
                  title={`${days[wd]} ${hr}:00 — ${count}`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function GaugeChart({
  value,
  max,
  label,
  color = "#7c6fff",
  size = 160,
  display,
}: {
  value: number
  max: number
  label?: string
  color?: string
  size?: number
  // Overrides the big center text. Needed where `value` only drives the arc
  // fill (e.g. an inverted rank) and printing it would contradict the caption.
  display?: string
}) {
  const pct = max > 0 ? Math.min(value / max, 0.999) : 0
  const cx = size / 2
  const cy = size * 0.55
  const r = size * 0.36

  const toXY = (p: number): [number, number] => {
    const angle = Math.PI * (1 - p)
    return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)]
  }

  const [sx, sy] = toXY(0)
  const [ex, ey] = toXY(1)
  const [nx, ny] = toXY(pct)
  // Need separate var for fill end because TypeScript can't destructure in condition
  const fillEnd = toXY(pct)

  const displayValue =
    display ??
    (typeof value === "number" ? (value % 1 === 0 ? String(value) : value.toFixed(1)) : String(value))

  return (
    <div className="flex flex-col items-center">
      {/* The gauge has no Table pill to fall back on, so it states its own
          reading (A11Y-019). */}
      <p className="sr-only">{`${label ? label + ": " : ""}${displayValue} of ${max}`}</p>
      <svg aria-hidden="true" width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 0 0 ${ex} ${ey}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={size * 0.065}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <path
            d={`M ${sx} ${sy} A ${r} ${r} 0 0 0 ${fillEnd[0]} ${fillEnd[1]}`}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.065}
            strokeLinecap="round"
          />
        )}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#eeeeee" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={size * 0.025} fill="#eeeeee" />
        <text
          x={cx}
          y={cy + size * 0.1}
          textAnchor="middle"
          fill="#eeeeee"
          fontSize={size * 0.1}
          fontWeight="bold"
        >
          {displayValue}
        </text>
        {label && (
          <text x={cx} y={cy + size * 0.2} textAnchor="middle" fill="#8a8a8a" fontSize={size * 0.065}>
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}

// --- Utility components ---

export function NoData() {
  return (
    <div className="flex items-center justify-center h-16 text-ink-muted text-sm">No data yet</div>
  )
}

export function FormatChip({ format }: { format: string }) {
  // Fall back to the neutral color for an unknown format id, which otherwise
  // computes a backgroundColor of "undefined22" and renders an unstyled chip.
  const color = FORMAT_COLORS[format] ?? DEFAULT_COLOR
  return (
    <span
      className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
      style={{ backgroundColor: color + "22", color }}
    >
      {format}
    </span>
  )
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="text-ink text-2xl font-bold font-mono">{value}</div>
      <div className="text-ink-dim text-xs mt-1">{label}</div>
    </div>
  )
}

// --- Category section with pill chart switcher ---

export interface ChartOption {
  label: string
  component: ReactNode
}

// Each category floats as its own frosted slab; the chart-type selector is a
// row of neutral pills (active = filled, never accent).
export function CategorySection({ title, charts }: { title: string; charts: ChartOption[] }) {
  const [selected, setSelected] = useState(0)
  return (
    <div className="card mx-3 mb-3 px-4 py-4">
      <h2 className="label-caps text-ink-dim mb-3">
        {title}
      </h2>
      {charts.length > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto overscroll-x-contain pb-1">
          {charts.map((c, i) => (
            <button
              key={c.label}
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
              className={`btn shrink-0 px-3.5 py-1.5 text-[0.8125rem] ${
                selected === i ? "bg-white/[0.12] text-ink" : "btn-quiet"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div>{charts[selected]?.component ?? <NoData />}</div>
    </div>
  )
}

// --- Shared chart helper for format-based data ---

export function formatPieData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ name: f, value: byFormat[f] ?? 0, fill: FORMAT_COLORS[f] })).filter(
    d => d.value > 0,
  )
}

export function formatBarData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ format: f, count: byFormat[f] ?? 0 }))
}

export function formatRadarData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ subject: f, count: byFormat[f] ?? 0 }))
}

// --- Custom treemap content renderer ---

export function TreemapCell(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; fill?: string
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, fill } = props
  // !(w > 0) instead of w <= 0: recharts computes NaN cell sizes for an
  // all-zero total, and NaN <= 0 is false, which used to emit <rect NaN>.
  if (!(width > 0) || !(height > 0)) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill ?? "#222222"} rx={2} />
      {width > 40 && height > 18 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#eeeeee"
          fontSize={11}
        >
          {name}
        </text>
      )}
    </g>
  )
}

// --- Over-time chart builders (shared by GlobalTab and MyStatsTab) ---

export const makeLineChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={d}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <Line type="monotone" dataKey="count" stroke={color} dot={false} strokeWidth={2} />
    </LineChart>
  </ResponsiveContainer>
)

// Gradient-filled area (the GlobalTab look).
export const makeAreaChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
  <ResponsiveContainer width="100%" height={200}>
    <AreaChart data={d}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="count"
        stroke={color}
        fill={`url(#grad-${color.replace("#", "")})`}
        strokeWidth={2}
        dot={false}
      />
    </AreaChart>
  </ResponsiveContainer>
)

// Flat-filled area (the MyStatsTab look; kept separate so the split changes
// no visuals).
export const makeAreaChartFlat = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
  <ResponsiveContainer width="100%" height={200}>
    <AreaChart data={d}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <Area type="monotone" dataKey="count" stroke={color} fill={color} fillOpacity={0.15} dot={false} strokeWidth={2} />
    </AreaChart>
  </ResponsiveContainer>
)

export const makeBarChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={d}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
)

// Cumulative area, gradient fill, series key "cumulative" (GlobalTab look).
export const makeCumulativeArea = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => {
  let running = 0
  const cumData = d.map(r => ({ ...r, cumulative: (running += r.count) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={cumData}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <defs>
          <linearGradient id="grad-cumul" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke={color}
          fill="url(#grad-cumul)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Cumulative area, flat fill, series key "total" (MyStatsTab look).
export const makeCumulativeFlat = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => {
  let running = 0
  const cumData = d.map(r => ({ ...r, total: (running += r.count) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={cumData}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Area type="monotone" dataKey="total" stroke={color} fill={color} fillOpacity={0.15} dot={false} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const makeOverlayLine = (
  d1: { period: string; count: number }[],
  label1: string,
  color1: string,
  d2: { period: string; count: number }[],
  label2: string,
  color2: string,
) => {
  const merged = d1.map((r, i) => ({ period: r.period, [label1]: r.count, [label2]: d2[i]?.count ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={merged}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis yAxisId="left" tick={AXIS} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8a8a8a" }} />
        <Line yAxisId="left" type="monotone" dataKey={label1} stroke={color1} dot={false} strokeWidth={2} />
        <Line yAxisId="right" type="monotone" dataKey={label2} stroke={color2} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// --- Format-distribution builders over a byFormat dict (GlobalTab) ---

export const makeDonut = (byFormat: Record<string, number>) => {
  const pd = formatPieData(byFormat)
  if (pd.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={pd} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
          {pd.map(d => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip {...TT} />
        <Legend
          formatter={(v: string) => <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export const makePie = (byFormat: Record<string, number>) => {
  const pd = formatPieData(byFormat)
  if (pd.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={pd} dataKey="value" nameKey="name" paddingAngle={2}>
          {pd.map(d => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip {...TT} />
        <Legend
          formatter={(v: string) => <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export const makeVertBar = (byFormat: Record<string, number>) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={formatBarData(byFormat)}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="format" tick={AXIS} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
        {FORMATS.map(f => <Cell key={f} fill={FORMAT_COLORS[f]} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
)

export const makeHorizBar = (byFormat: Record<string, number>) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={formatBarData(byFormat)} layout="vertical" margin={{ left: 56 }}>
      <CartesianGrid {...GRID} horizontal={false} />
      <XAxis type="number" tick={AXIS} />
      <YAxis dataKey="format" type="category" tick={AXIS} width={52} />
      <Tooltip {...TT} />
      <Bar dataKey="count" radius={[0, 3, 3, 0]}>
        {FORMATS.map(f => <Cell key={f} fill={FORMAT_COLORS[f]} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
)

export const makeRadar = (byFormat: Record<string, number>) => (
  <ResponsiveContainer width="100%" height={200}>
    <RadarChart data={formatRadarData(byFormat)}>
      <PolarGrid stroke="rgba(200,200,200,0.07)" />
      <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
      <PolarRadiusAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} />
      <Radar dataKey="count" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.3} />
      <Tooltip {...TT} />
    </RadarChart>
  </ResponsiveContainer>
)

export const makeTreemap = (byFormat: Record<string, number>) => {
  // All-zero data would make recharts compute NaN cell areas; show the empty
  // state instead of an invisible chart.
  if (FORMATS.every(f => (byFormat[f] ?? 0) === 0)) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <Treemap
        data={FORMATS.map(f => ({
          name: f,
          size: byFormat[f] ?? 0,
          fill: FORMAT_COLORS[f],
        }))}
        dataKey="size"
        nameKey="name"
        content={<TreemapCell />}
      />
    </ResponsiveContainer>
  )
}

export const makeWaffle = (byFormat: Record<string, number>) => (
  <WaffleChart
    data={FORMATS.map(f => ({
      label: f,
      value: byFormat[f] ?? 0,
      color: FORMAT_COLORS[f],
    }))}
  />
)

// --- Format-distribution builders over a {format,count} array (MyStatsTab) ---

export const makeFormatDonut = (arr: { format: string; count: number }[]) => {
  const data2 = arr.filter(d => d.count > 0)
  if (data2.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data2} dataKey="count" nameKey="format" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
          {data2.map(d => <Cell key={d.format} fill={FORMAT_COLORS[d.format] ?? DEFAULT_COLOR} />)}
        </Pie>
        <Tooltip {...TT} />
        <Legend formatter={(v: string) => <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export const makeFormatHorizBar = (arr: { format: string; count: number }[]) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={arr} layout="vertical" margin={{ left: 56 }}>
      <CartesianGrid {...GRID} horizontal={false} />
      <XAxis type="number" tick={AXIS} />
      <YAxis dataKey="format" type="category" tick={AXIS} width={52} />
      <Tooltip {...TT} />
      <Bar dataKey="count" radius={[0, 3, 3, 0]}>
        {arr.map(d => <Cell key={d.format} fill={FORMAT_COLORS[d.format] ?? DEFAULT_COLOR} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
)

export const makeFormatRadar = (arr: { format: string; count: number }[]) => (
  <ResponsiveContainer width="100%" height={220}>
    <RadarChart data={arr.map(d => ({ subject: d.format, count: d.count }))}>
      <PolarGrid stroke="rgba(200,200,200,0.07)" />
      <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
      <PolarRadiusAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} />
      <Radar dataKey="count" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.3} />
      <Tooltip {...TT} />
    </RadarChart>
  </ResponsiveContainer>
)

export const makeFormatWaffle = (arr: { format: string; count: number }[]) => (
  <WaffleChart
    data={arr.map(d => ({
      label: d.format,
      value: d.count,
      color: FORMAT_COLORS[d.format] ?? DEFAULT_COLOR,
    }))}
  />
)

export const makeFormatVertBar = (arr: { format: string; count: number }[]) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={arr}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="format" tick={AXIS} />
      <YAxis tick={AXIS} />
      <Tooltip {...TT} />
      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
        {arr.map(d => <Cell key={d.format} fill={FORMAT_COLORS[d.format] ?? DEFAULT_COLOR} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
)
