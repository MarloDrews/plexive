"use client"

import React, { useState, useEffect, type ReactNode } from "react"
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import Link from "next/link"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { getSavedPostIds } from "../lib/savedPosts"
import { getLikedPostIds } from "../lib/likedPosts"
import BottomNav from "../components/BottomNav"

// --- Error boundary ---

class StatsErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: "" }
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error: String(error) }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-400 text-sm">
          <p className="font-bold mb-2">Stats page error:</p>
          <p>{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Constants ---

const FORMAT_COLORS: Record<string, string> = {
  books: "#fbbf24",
  facts: "#22d3ee",
  people: "#fb7185",
  concepts: "#a78bfa",
  questions: "#34d399",
  stories: "#fb923c",
  academy: "#818cf8",
}
const FORMATS = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]
const DEFAULT_COLOR = "#a1a1aa"
const RANK_COLORS = ["#a78bfa", "#7c3aed", "#4c1d95", "#2e1065", "#1e1b4b"]

const TT = {
  contentStyle: {
    background: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
  },
  labelStyle: { color: "#a1a1aa" },
  cursor: { fill: "rgba(255,255,255,0.05)" },
  wrapperStyle: { zIndex: 50 },
}

const AXIS = { fill: "#a1a1aa", fontSize: 11 }
const GRID = { stroke: "#27272a", strokeDasharray: "3 3" }

// --- Type definitions ---

interface GlobalStats {
  overview: {
    total_posts: number
    total_users: number
    total_comments: number
    total_likes: number
    avg_posts_per_user: number
  }
  top_creators_by_posts: { username: string; is_verified: boolean; post_count: number }[]
  top_creators_by_likes: { username: string; is_verified: boolean; like_count: number }[]
  top_creators_by_comments: { username: string; is_verified: boolean; comment_count: number }[]
  top_creators_by_avg_read_time: { username: string; is_verified: boolean; avg_duration_ms: number }[]
  top_creators_per_format: Record<string, { username: string; post_count: number }[]>
  top_posts_by_likes: { post_id: number; title: string; format: string; author: string; like_count: number }[]
  posts_over_time: { period: string; count: number }[]
  users_over_time: { period: string; count: number }[]
  comments_over_time: { period: string; count: number }[]
  likes_over_time: { period: string; count: number }[]
  posts_by_format: Record<string, number>
  comments_by_format: Record<string, number>
  likes_by_format: Record<string, number>
  activity_by_weekday: { weekday: string; count: number }[]
  activity_by_hour: { hour: number; count: number }[]
  activity_heatmap: { weekday: number; hour: number; count: number }[]
  post_quality_over_time: { period: string; avg_likes_per_post: number }[]
  pending_vs_published: { published: number; pending: number }
  comment_activity_by_user: { username: string; comment_count: number }[]
}

interface MyStats {
  overview: {
    posts_created: number
    posts_published: number
    posts_pending: number
    likes_received: number
    comments_received: number
    posts_saved: number
    posts_liked: number
  }
  my_posts_over_time: { period: string; count: number }[]
  my_likes_received_over_time: { period: string; count: number }[]
  my_comments_received_over_time: { period: string; count: number }[]
  my_posts_by_format: Record<string, number>
  my_activity_by_weekday: { weekday: string; count: number }[]
  my_activity_by_hour: { hour: number; count: number }[]
  my_activity_heatmap: { weekday: number; hour: number; count: number }[]
  my_top_posts_by_likes: { post_id: number; title: string; format: string; like_count: number }[]
  my_top_posts_by_comments: { post_id: number; title: string; format: string; comment_count: number }[]
  my_avg_read_time_per_format: { format: string; avg_duration_ms: number }[]
  my_avg_read_time_over_time: { period: string; avg_duration_ms: number }[]
  my_comments_written: number
  my_comments_written_by_format: { format: string; count: number }[]
  my_ranking: { by_posts: number; by_likes: number; total_users: number }
  my_engagement_score: number
  my_streak: { current_days: number; best_days: number }
  my_milestones: { label: string; achieved: boolean; achieved_at: string | null }[]
  my_likes_given_by_format: { format: string; count: number }[]
}

// --- Custom chart components ---

function WaffleChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <NoData />
  const squares: string[] = []
  for (const d of data) {
    const n = Math.round((d.value / total) * 100)
    for (let i = 0; i < n; i++) squares.push(d.color)
  }
  while (squares.length < 100) squares.push(squares[squares.length - 1] ?? "#27272a")
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-10 gap-0.5">
        {squares.slice(0, 100).map((color, i) => (
          <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-zinc-400 text-xs">{d.label} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarHeatmap({ data }: { data: { period: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="text-zinc-600 text-sm p-4">No data</div>
  }
  const lookup = new Map(data.map(d => [d.period, d.count]))
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return { key, label: d.toLocaleString("default", { month: "short" }), year: d.getFullYear() }
  })
  return (
    <div className="grid grid-cols-4 gap-2">
      {months.map(m => {
        const count = lookup.get(m.key) ?? 0
        const intensity = count / maxCount
        return (
          <div key={m.key} className="flex flex-col items-center gap-1">
            <div
              className="w-full h-8 rounded-lg"
              style={{
                backgroundColor:
                  count === 0 ? "#18181b" : `rgba(34,211,238,${0.2 + intensity * 0.8})`,
              }}
              title={`${m.label} ${m.year}: ${count}`}
            />
            <span className="text-zinc-500 text-[10px]">{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function ActivityHeatmap({
  data,
  color = "34,211,238",
}: {
  data: { weekday: number; hour: number; count: number }[]
  color?: string
}) {
  if (!data || data.length === 0) {
    return <div className="text-zinc-600 text-sm p-4">No data</div>
  }
  const lookup = new Map(data.map(d => [`${d.weekday}:${d.hour}`, d.count]))
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        <div className="flex flex-col gap-0.5 mr-1 mt-4">
          {days.map(d => (
            <div key={d} className="h-3 text-zinc-500 text-[9px] leading-3 w-7">{d}</div>
          ))}
        </div>
        {Array.from({ length: 24 }, (_, hr) => (
          <div key={hr} className="flex flex-col gap-0.5">
            <div className="h-3 text-zinc-500 text-[9px] leading-3 text-center w-3">
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
                      count === 0 ? "#18181b" : `rgba(${color},${0.15 + intensity * 0.85})`,
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

function GaugeChart({
  value,
  max,
  label,
  color = "#22d3ee",
  size = 160,
}: {
  value: number
  max: number
  label?: string
  color?: string
  size?: number
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
    typeof value === "number" ? (value % 1 === 0 ? String(value) : value.toFixed(1)) : String(value)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 0 0 ${ex} ${ey}`}
          fill="none"
          stroke="#3f3f46"
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
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={size * 0.025} fill="white" />
        <text
          x={cx}
          y={cy + size * 0.1}
          textAnchor="middle"
          fill="white"
          fontSize={size * 0.1}
          fontWeight="bold"
        >
          {displayValue}
        </text>
        {label && (
          <text x={cx} y={cy + size * 0.2} textAnchor="middle" fill="#a1a1aa" fontSize={size * 0.065}>
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}

// --- Utility components ---

function NoData() {
  return (
    <div className="flex items-center justify-center h-16 text-zinc-600 text-sm">No data yet</div>
  )
}

function FormatChip({ format }: { format: string }) {
  return (
    <span
      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded capitalize"
      style={{ backgroundColor: FORMAT_COLORS[format] + "22", color: FORMAT_COLORS[format] }}
    >
      {format}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4">
      <div className="text-white text-2xl font-bold">{value}</div>
      <div className="text-zinc-400 text-xs mt-1">{label}</div>
    </div>
  )
}

// --- Category section with pill chart switcher ---

interface ChartOption {
  label: string
  component: ReactNode
}

function CategorySection({ title, charts }: { title: string; charts: ChartOption[] }) {
  const [selected, setSelected] = useState(0)
  return (
    <div className="px-4 py-4 border-b border-zinc-900">
      <div className="text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">
        {title}
      </div>
      {charts.length > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] pb-1">
          {charts.map((c, i) => (
            <button
              key={c.label}
              onClick={() => setSelected(i)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                selected === i
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-300"
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

function formatPieData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ name: f, value: byFormat[f] ?? 0, fill: FORMAT_COLORS[f] })).filter(
    d => d.value > 0,
  )
}

function formatBarData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ format: f, count: byFormat[f] ?? 0 }))
}

function formatRadarData(byFormat: Record<string, number>) {
  return FORMATS.map(f => ({ subject: f, count: byFormat[f] ?? 0 }))
}

// --- Custom treemap content renderer ---

function TreemapCell(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; fill?: string
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, fill } = props
  if (width <= 0 || height <= 0) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill ?? "#3f3f46"} rx={2} />
      {width > 40 && height > 18 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={11}
        >
          {name}
        </text>
      )}
    </g>
  )
}

// --- GlobalTab ---

function GlobalTab({ data }: { data: GlobalStats }) {
  const { overview } = data

  // 1. Overview cards
  const overviewCards = (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Total Posts" value={overview.total_posts.toLocaleString()} />
      <StatCard label="Total Users" value={overview.total_users.toLocaleString()} />
      <StatCard label="Total Comments" value={overview.total_comments.toLocaleString()} />
      <StatCard label="Total Likes" value={overview.total_likes.toLocaleString()} />
      <StatCard label="Avg Posts / User" value={overview.avg_posts_per_user} />
    </div>
  )

  // 2. Top creators by posts
  const topByPosts = data.top_creators_by_posts
  const topByPostsHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topByPosts} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="username" type="category" tick={AXIS} width={56} />
        <Tooltip {...TT} />
        <Bar dataKey="post_count" fill="#a78bfa" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByPostsVertBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topByPosts} margin={{ bottom: 40 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="username" tick={{ ...AXIS, angle: -35, textAnchor: "end" }} interval={0} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="post_count" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByPostsTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Posts</th>
          </tr>
        </thead>
        <tbody>
          {topByPosts.map((r, i) => (
            <tr key={r.username} className="border-b border-zinc-900">
              <td className="py-2 pr-3 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-3 text-white">
                <Link href={`/profile/${r.username}`} className="hover:text-zinc-300 transition-colors">{r.username}</Link>
                {r.is_verified && <span className="ml-1 text-blue-400 text-[10px]">✓</span>}
              </td>
              <td className="py-2 text-right text-zinc-300">{r.post_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const topByPostsTreemap = (
    <ResponsiveContainer width="100%" height={240}>
      <Treemap
        data={topByPosts.map((r, i) => ({
          name: r.username,
          size: r.post_count,
          fill: RANK_COLORS[i] ?? "#3f3f46",
        }))}
        dataKey="size"
        nameKey="name"
        content={<TreemapCell />}
      />
    </ResponsiveContainer>
  )
  const topByPostsBubble = (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="index" type="number" tick={AXIS} name="Rank" domain={[0, 11]} />
        <YAxis dataKey="post_count" tick={AXIS} />
        <Tooltip {...TT} cursor={false} />
        <Scatter
          data={topByPosts.map((r, i) => ({ ...r, index: i + 1 }))}
          fill="#a78bfa"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )

  // 3. Top creators by likes
  const topByLikes = data.top_creators_by_likes
  const topByLikesHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topByLikes} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="username" type="category" tick={AXIS} width={56} />
        <Tooltip {...TT} />
        <Bar dataKey="like_count" fill="#fb7185" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByLikesTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {topByLikes.map((r, i) => (
            <tr key={r.username} className="border-b border-zinc-900">
              <td className="py-2 pr-3 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-3 text-white">
                <Link href={`/profile/${r.username}`} className="hover:text-zinc-300 transition-colors">{r.username}</Link>
                {r.is_verified && <span className="ml-1 text-blue-400 text-[10px]">✓</span>}
              </td>
              <td className="py-2 text-right text-zinc-300">{r.like_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const topByLikesBubble = (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="index" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="like_count" tick={AXIS} />
        <Tooltip {...TT} cursor={false} />
        <Scatter data={topByLikes.map((r, i) => ({ ...r, index: i + 1 }))} fill="#fb7185" />
      </ScatterChart>
    </ResponsiveContainer>
  )
  const topByLikesScatter = (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="rank" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="like_count" tick={AXIS} />
        <Tooltip {...TT} cursor={false} />
        <Scatter
          data={topByLikes.map((r, i) => ({ ...r, rank: i + 1 }))}
          fill="#fb7185"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )

  // 4. Top creators by comments
  const topByComments = data.top_creators_by_comments
  const topByCommentsHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topByComments} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="username" type="category" tick={AXIS} width={56} />
        <Tooltip {...TT} />
        <Bar dataKey="comment_count" fill="#34d399" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByCommentsTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {topByComments.map((r, i) => (
            <tr key={r.username} className="border-b border-zinc-900">
              <td className="py-2 pr-3 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-3 text-white"><Link href={`/profile/${r.username}`} className="hover:text-zinc-300 transition-colors">{r.username}</Link></td>
              <td className="py-2 text-right text-zinc-300">{r.comment_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const topByCommentsBubble = (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="index" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="comment_count" tick={AXIS} />
        <Tooltip {...TT} cursor={false} />
        <Scatter
          data={topByComments.map((r, i) => ({ ...r, index: i + 1 }))}
          fill="#34d399"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )

  // 5. Top creators by avg read time (convert ms → seconds for display)
  const topByReadTime = data.top_creators_by_avg_read_time.map(r => ({
    ...r,
    avg_sec: Math.round(r.avg_duration_ms / 100) / 10,
  }))
  const topByReadTimeHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topByReadTime} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} unit="s" />
        <YAxis dataKey="username" type="category" tick={AXIS} width={56} />
        <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read time"]} />
        <Bar dataKey="avg_sec" fill="#22d3ee" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByReadTimeTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Avg Read</th>
          </tr>
        </thead>
        <tbody>
          {topByReadTime.map((r, i) => (
            <tr key={r.username} className="border-b border-zinc-900">
              <td className="py-2 pr-3 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-3 text-white"><Link href={`/profile/${r.username}`} className="hover:text-zinc-300 transition-colors">{r.username}</Link></td>
              <td className="py-2 text-right text-zinc-300">{r.avg_sec}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const topByReadTimeDotPlot = (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="rank" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="avg_sec" tick={AXIS} unit="s" />
        <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read time"]} />
        <Scatter
          data={topByReadTime.map((r, i) => ({ ...r, rank: i + 1 }))}
          fill="#22d3ee"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )

  // 6. Top creators per format
  const perFormatGrouped = FORMATS.map(fmt => ({
    format: fmt,
    first: data.top_creators_per_format[fmt]?.[0]?.post_count ?? 0,
    second: data.top_creators_per_format[fmt]?.[1]?.post_count ?? 0,
    third: data.top_creators_per_format[fmt]?.[2]?.post_count ?? 0,
  }))
  const perFormatGroupedBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={perFormatGrouped} margin={{ bottom: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="format" tick={{ ...AXIS, angle: -30, textAnchor: "end" }} interval={0} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
        <Bar dataKey="first" name="1st" fill="#a78bfa" radius={[2, 2, 0, 0]} />
        <Bar dataKey="second" name="2nd" fill="#7c3aed" radius={[2, 2, 0, 0]} />
        <Bar dataKey="third" name="3rd" fill="#4c1d95" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  // Heatmap for per-format: rows = formats, cols = rank 1-3
  const perFormatHeatmap = (() => {
    const allUsers: string[] = []
    FORMATS.forEach(fmt => {
      ;(data.top_creators_per_format[fmt] ?? []).forEach(r => {
        if (!allUsers.includes(r.username)) allUsers.push(r.username)
      })
    })
    const userTotals = Object.fromEntries(
      allUsers.map(u => [
        u,
        FORMATS.reduce(
          (s, fmt) =>
            s + (data.top_creators_per_format[fmt]?.find(r => r.username === u)?.post_count ?? 0),
          0,
        ),
      ]),
    )
    const maxVal = Math.max(...Object.values(userTotals), 1)
    return (
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="flex gap-0.5 mb-1">
            <div className="w-16" />
            {FORMATS.map(f => (
              <div key={f} className="w-12 text-zinc-500 text-[9px] text-center">{f}</div>
            ))}
          </div>
          {allUsers.slice(0, 10).map(u => (
            <div key={u} className="flex gap-0.5 mb-0.5 items-center">
              <div className="w-16 text-zinc-400 text-[10px] truncate pr-1">{u}</div>
              {FORMATS.map(fmt => {
                const cnt = data.top_creators_per_format[fmt]?.find(r => r.username === u)?.post_count ?? 0
                return (
                  <div
                    key={fmt}
                    className="w-12 h-6 rounded-sm flex items-center justify-center"
                    style={{
                      backgroundColor:
                        cnt === 0
                          ? "#18181b"
                          : `${FORMAT_COLORS[fmt]}${Math.round(40 + (cnt / maxVal) * 175).toString(16).padStart(2, "0")}`,
                    }}
                    title={`${u} / ${fmt}: ${cnt}`}
                  >
                    {cnt > 0 && <span className="text-white text-[9px]">{cnt}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  })()
  const perFormatSmallMultiples = (
    <div className="grid grid-cols-2 gap-3">
      {FORMATS.map(fmt => {
        const fmtData = data.top_creators_per_format[fmt] ?? []
        return (
          <div key={fmt} className="bg-zinc-900 rounded-lg p-2">
            <div className="text-[10px] font-semibold mb-1" style={{ color: FORMAT_COLORS[fmt] }}>
              {fmt}
            </div>
            {fmtData.length === 0 ? (
              <div className="text-zinc-600 text-[10px]">No data</div>
            ) : (
              fmtData.map((r, i) => (
                <div key={r.username} className="flex items-center gap-1 mb-0.5">
                  <div
                    className="h-2 rounded-sm"
                    style={{
                      width: `${Math.max((r.post_count / (fmtData[0]?.post_count || 1)) * 80, 4)}px`,
                      backgroundColor: FORMAT_COLORS[fmt],
                      opacity: 1 - i * 0.25,
                    }}
                  />
                  <span className="text-zinc-400 text-[9px] truncate">{r.username}</span>
                  <span className="text-zinc-500 text-[9px] ml-auto">{r.post_count}</span>
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )

  // 7. Top posts by likes
  const topPosts = data.top_posts_by_likes
  const topPostsHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topPosts} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis
          dataKey="title"
          type="category"
          tick={{ ...AXIS, fontSize: 9 }}
          width={76}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 14) + "…" : v)}
        />
        <Tooltip {...TT} />
        <Bar dataKey="like_count" fill="#fb7185" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topPostsTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-2">#</th>
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-left pb-2 pr-2">Author</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {topPosts.map((r, i) => (
            <tr key={r.post_id} className="border-b border-zinc-900">
              <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-2 text-white">
                {r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 pr-2 text-zinc-400">{r.author}</td>
              <td className="py-2 text-right text-zinc-300">{r.like_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 8–11. Over-time charts (reusable)
  const makeLineChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeAreaChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeBarChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeCumulativeArea = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => {
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

  const makeOverlayLine = (
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
          <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
          <Line yAxisId="left" type="monotone" dataKey={label1} stroke={color1} dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey={label2} stroke={color2} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // 12–14. Format distribution charts
  const makeDonut = (byFormat: Record<string, number>) => {
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
            formatter={(v: string) => <span style={{ color: "#a1a1aa", fontSize: 11 }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const makePie = (byFormat: Record<string, number>) => {
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
            formatter={(v: string) => <span style={{ color: "#a1a1aa", fontSize: 11 }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const makeVertBar = (byFormat: Record<string, number>) => (
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

  const makeHorizBar = (byFormat: Record<string, number>) => (
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

  const makeRadar = (byFormat: Record<string, number>) => (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={formatRadarData(byFormat)}>
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )

  const makeTreemap = (byFormat: Record<string, number>) => (
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

  const makeWaffle = (byFormat: Record<string, number>) => (
    <WaffleChart
      data={FORMATS.map(f => ({
        label: f,
        value: byFormat[f] ?? 0,
        color: FORMAT_COLORS[f],
      }))}
    />
  )

  // 15. Activity by weekday
  const wdVertBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.activity_by_weekday}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="weekday" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="count" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const wdRadar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data.activity_by_weekday.map(d => ({ subject: d.weekday, count: d.count }))}>
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )
  const wdHeatmap = <ActivityHeatmap data={data.activity_heatmap} />
  const wdLine = (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data.activity_by_weekday}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="weekday" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Line type="monotone" dataKey="count" stroke="#a78bfa" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )

  // 16. Activity by hour
  const hrVertBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.activity_by_hour}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="hour" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="count" fill="#22d3ee" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const hrArea = (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data.activity_by_hour}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="hour" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Area type="monotone" dataKey="count" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.2} dot={false} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
  const hrPolar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart
        data={Array.from({ length: 24 }, (_, h) => ({
          subject: h % 6 === 0 ? `${h}h` : "",
          count: data.activity_by_hour[h]?.count ?? 0,
        }))}
      >
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <Radar dataKey="count" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )
  const hrHeatmap = <ActivityHeatmap data={data.activity_heatmap} color="34,211,238" />

  // 17. Post quality over time
  const qualityLine = (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data.post_quality_over_time}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Line type="monotone" dataKey="avg_likes_per_post" stroke="#fbbf24" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
  const qualityBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.post_quality_over_time}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="avg_likes_per_post" fill="#fbbf24" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const qualityArea = (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data.post_quality_over_time}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Area type="monotone" dataKey="avg_likes_per_post" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.2} dot={false} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )

  // 18. Content status
  const { published, pending } = data.pending_vs_published
  const statusDonut = makeDonut({ published, pending } as unknown as Record<string, number>)
  const statusDonutReal = (() => {
    const statusData = [
      { name: "Published", value: published, fill: "#34d399" },
      { name: "Pending", value: pending, fill: "#fbbf24" },
    ]
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
            {statusData.map(d => <Cell key={d.name} fill={d.fill} />)}
          </Pie>
          <Tooltip {...TT} />
          <Legend
            formatter={(v: string) => <span style={{ color: "#a1a1aa", fontSize: 11 }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  })()
  const statusGauge = (
    <div className="flex flex-col items-center gap-2">
      <GaugeChart
        value={published}
        max={published + pending}
        label="Published ratio"
        color="#34d399"
        size={200}
      />
      <div className="text-zinc-400 text-xs">
        {published} published / {pending} pending
      </div>
    </div>
  )

  // 19. Comment activity by user
  const commenters = data.comment_activity_by_user
  const commentersHorizBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={commenters} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="username" type="category" tick={AXIS} width={56} />
        <Tooltip {...TT} />
        <Bar dataKey="comment_count" fill="#fb923c" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const commentersTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {commenters.map((r, i) => (
            <tr key={r.username} className="border-b border-zinc-900">
              <td className="py-2 pr-3 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-3 text-white">{r.username}</td>
              <td className="py-2 text-right text-zinc-300">{r.comment_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      {/* 1. Overview */}
      <div className="px-4 py-4 border-b border-zinc-900">
        <div className="text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Overview
        </div>
        {overviewCards}
      </div>

      {/* 2. Top Creators by Posts */}
      <CategorySection
        title="Top Creators by Posts"
        charts={[
          { label: "Horizontal Bar", component: topByPostsHorizBar },
          { label: "Vertical Bar", component: topByPostsVertBar },
          { label: "Table", component: topByPostsTable },
          { label: "Treemap", component: topByPostsTreemap },
          { label: "Bubble", component: topByPostsBubble },
        ]}
      />

      {/* 3. Top Creators by Likes */}
      <CategorySection
        title="Top Creators by Likes Received"
        charts={[
          { label: "Horizontal Bar", component: topByLikesHorizBar },
          { label: "Table", component: topByLikesTable },
          { label: "Bubble", component: topByLikesBubble },
          { label: "Scatter", component: topByLikesScatter },
        ]}
      />

      {/* 4. Top Creators by Comments */}
      <CategorySection
        title="Top Creators by Comments Received"
        charts={[
          { label: "Horizontal Bar", component: topByCommentsHorizBar },
          { label: "Table", component: topByCommentsTable },
          { label: "Bubble", component: topByCommentsBubble },
        ]}
      />

      {/* 5. Top Creators by Avg Read Time */}
      <CategorySection
        title="Top Creators by Avg Read Time"
        charts={[
          { label: "Horizontal Bar", component: topByReadTimeHorizBar },
          { label: "Table", component: topByReadTimeTable },
          { label: "Dot Plot", component: topByReadTimeDotPlot },
        ]}
      />

      {/* 6. Top Creators per Format */}
      <CategorySection
        title="Top Creators per Format"
        charts={[
          { label: "Grouped Bar", component: perFormatGroupedBar },
          { label: "Heatmap", component: perFormatHeatmap },
          { label: "Small Multiples", component: perFormatSmallMultiples },
        ]}
      />

      {/* 7. Top Posts by Likes */}
      <CategorySection
        title="Top Posts by Likes"
        charts={[
          { label: "Horizontal Bar", component: topPostsHorizBar },
          { label: "Table", component: topPostsTable },
        ]}
      />

      {/* 8. Posts over Time */}
      <CategorySection
        title="Posts over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.posts_over_time, "#a78bfa") },
          { label: "Area", component: makeAreaChart(data.posts_over_time, "#a78bfa") },
          { label: "Bar", component: makeBarChart(data.posts_over_time, "#a78bfa") },
          { label: "Cumulative", component: makeCumulativeArea(data.posts_over_time, "#a78bfa") },
          { label: "Calendar", component: <CalendarHeatmap data={data.posts_over_time} /> },
        ]}
      />

      {/* 9. Users over Time */}
      <CategorySection
        title="Users over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.users_over_time, "#34d399") },
          { label: "Area", component: makeAreaChart(data.users_over_time, "#34d399") },
          { label: "Bar", component: makeBarChart(data.users_over_time, "#34d399") },
          { label: "Cumulative", component: makeCumulativeArea(data.users_over_time, "#34d399") },
        ]}
      />

      {/* 10. Comments over Time */}
      <CategorySection
        title="Comments over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.comments_over_time, "#fb7185") },
          { label: "Area", component: makeAreaChart(data.comments_over_time, "#fb7185") },
          { label: "Bar", component: makeBarChart(data.comments_over_time, "#fb7185") },
          {
            label: "Overlay",
            component: makeOverlayLine(
              data.comments_over_time, "comments", "#fb7185",
              data.posts_over_time, "posts", "#a78bfa",
            ),
          },
        ]}
      />

      {/* 11. Likes over Time */}
      <CategorySection
        title="Likes over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.likes_over_time, "#fbbf24") },
          { label: "Area", component: makeAreaChart(data.likes_over_time, "#fbbf24") },
          { label: "Bar", component: makeBarChart(data.likes_over_time, "#fbbf24") },
          {
            label: "Overlay",
            component: makeOverlayLine(
              data.likes_over_time, "likes", "#fbbf24",
              data.posts_over_time, "posts", "#a78bfa",
            ),
          },
        ]}
      />

      {/* 12. Posts by Format */}
      <CategorySection
        title="Posts by Format"
        charts={[
          { label: "Donut", component: makeDonut(data.posts_by_format) },
          { label: "Pie", component: makePie(data.posts_by_format) },
          { label: "Vertical Bar", component: makeVertBar(data.posts_by_format) },
          { label: "Horizontal Bar", component: makeHorizBar(data.posts_by_format) },
          { label: "Treemap", component: makeTreemap(data.posts_by_format) },
          { label: "Waffle", component: makeWaffle(data.posts_by_format) },
        ]}
      />

      {/* 13. Comments by Format */}
      <CategorySection
        title="Comments by Format"
        charts={[
          { label: "Donut", component: makeDonut(data.comments_by_format) },
          { label: "Vertical Bar", component: makeVertBar(data.comments_by_format) },
          { label: "Horizontal Bar", component: makeHorizBar(data.comments_by_format) },
          { label: "Radar", component: makeRadar(data.comments_by_format) },
          { label: "Treemap", component: makeTreemap(data.comments_by_format) },
        ]}
      />

      {/* 14. Likes by Format */}
      <CategorySection
        title="Likes by Format"
        charts={[
          { label: "Donut", component: makeDonut(data.likes_by_format) },
          { label: "Vertical Bar", component: makeVertBar(data.likes_by_format) },
          { label: "Horizontal Bar", component: makeHorizBar(data.likes_by_format) },
          { label: "Radar", component: makeRadar(data.likes_by_format) },
          { label: "Treemap", component: makeTreemap(data.likes_by_format) },
        ]}
      />

      {/* 15. Activity by Weekday */}
      <CategorySection
        title="Activity by Weekday"
        charts={[
          { label: "Bar", component: wdVertBar },
          { label: "Radar", component: wdRadar },
          { label: "Heatmap", component: wdHeatmap },
          { label: "Line", component: wdLine },
        ]}
      />

      {/* 16. Activity by Hour */}
      <CategorySection
        title="Activity by Hour"
        charts={[
          { label: "Bar", component: hrVertBar },
          { label: "Area", component: hrArea },
          { label: "Polar", component: hrPolar },
          { label: "Heatmap", component: hrHeatmap },
        ]}
      />

      {/* 17. Post Quality over Time */}
      <CategorySection
        title="Post Quality over Time"
        charts={[
          { label: "Line", component: qualityLine },
          { label: "Bar", component: qualityBar },
          { label: "Area", component: qualityArea },
        ]}
      />

      {/* 18. Content Status */}
      <CategorySection
        title="Content Status"
        charts={[
          { label: "Donut", component: statusDonutReal },
          { label: "Gauge", component: statusGauge },
        ]}
      />

      {/* 19. Comment Activity by User */}
      <CategorySection
        title="Comment Activity by User"
        charts={[
          { label: "Horizontal Bar", component: commentersHorizBar },
          { label: "Table", component: commentersTable },
        ]}
      />
    </div>
  )
}

// --- MyStatsTab ---

function MyStatsTab({
  data,
  savedCount,
  likedByFormat,
}: {
  data: MyStats
  savedCount: number
  likedByFormat: { format: string; count: number }[]
}) {
  const { overview } = data

  // 1. Overview cards
  const overviewCards = (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Posts Created" value={overview.posts_created} />
      <StatCard label="Published" value={overview.posts_published} />
      <StatCard label="Pending" value={overview.posts_pending} />
      <StatCard label="Likes Received" value={overview.likes_received} />
      <StatCard label="Comments Received" value={overview.comments_received} />
      <StatCard label="Saved Posts" value={savedCount >= 0 ? savedCount : "—"} />
    </div>
  )

  // Helper: reuse the same chart builders from GlobalTab
  const makeLineChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeAreaChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeBarChart = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => (
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

  const makeCumulative = (d: { period: string; count: number }[], color = DEFAULT_COLOR) => {
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

  const makeFormatDonut = (arr: { format: string; count: number }[]) => {
    const data2 = arr.filter(d => d.count > 0)
    if (data2.length === 0) return <NoData />
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data2} dataKey="count" nameKey="format" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
            {data2.map(d => <Cell key={d.format} fill={FORMAT_COLORS[d.format] ?? DEFAULT_COLOR} />)}
          </Pie>
          <Tooltip {...TT} />
          <Legend formatter={(v: string) => <span style={{ color: "#a1a1aa", fontSize: 11 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const makeFormatHorizBar = (arr: { format: string; count: number }[]) => (
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

  const makeFormatRadar = (arr: { format: string; count: number }[]) => (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={arr.map(d => ({ subject: d.format, count: d.count }))}>
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )

  const makeFormatWaffle = (arr: { format: string; count: number }[]) => (
    <WaffleChart
      data={arr.map(d => ({
        label: d.format,
        value: d.count,
        color: FORMAT_COLORS[d.format] ?? DEFAULT_COLOR,
      }))}
    />
  )

  const makeFormatVertBar = (arr: { format: string; count: number }[]) => (
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

  // Convert posts_by_format dict to array
  const myPostsByFormatArr = FORMATS.map(f => ({
    format: f,
    count: data.my_posts_by_format[f] ?? 0,
  }))

  // 2. My posts over time with overlay
  const postsOverlayWithLikes = (() => {
    const merged = data.my_posts_over_time.map((r, i) => ({
      period: r.period,
      posts: r.count,
      likes: data.my_likes_received_over_time[i]?.count ?? 0,
    }))
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={merged}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis yAxisId="left" tick={AXIS} />
          <YAxis yAxisId="right" orientation="right" tick={AXIS} />
          <Tooltip {...TT} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
          <Line yAxisId="left" type="monotone" dataKey="posts" stroke="#a78bfa" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="likes" stroke="#fb7185" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    )
  })()

  // 5. When Am I Active
  const myWdVertBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.my_activity_by_weekday}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="weekday" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="count" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myHrVertBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.my_activity_by_hour}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="hour" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="count" fill="#22d3ee" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myPolar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data.my_activity_by_weekday.map(d => ({ subject: d.weekday, count: d.count }))}>
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )

  // 7. Avg read time per format (convert ms → s)
  const readTimeArr = data.my_avg_read_time_per_format.map(d => ({
    format: d.format,
    avg_sec: Math.round(d.avg_duration_ms / 100) / 10,
  }))
  const readTimeHorizBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={readTimeArr} layout="vertical" margin={{ left: 56 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} unit="s" />
        <YAxis dataKey="format" type="category" tick={AXIS} width={52} />
        <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read time"]} />
        <Bar dataKey="avg_sec" radius={[0, 3, 3, 0]}>
          {readTimeArr.map(d => <Cell key={d.format} fill={FORMAT_COLORS[d.format] ?? DEFAULT_COLOR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
  const readTimeRadar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={readTimeArr.map(d => ({ subject: d.format, avg_sec: d.avg_sec }))}>
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#a1a1aa", fontSize: 9 }} />
        <Radar dataKey="avg_sec" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.3} />
        <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read time"]} />
      </RadarChart>
    </ResponsiveContainer>
  )
  const readTimeDotPlot = (
    <ResponsiveContainer width="100%" height={200}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="rank" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="avg_sec" tick={AXIS} unit="s" />
        <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read"]} />
        <Scatter
          data={readTimeArr.map((d, i) => ({ ...d, rank: i + 1 }))}
          fill="#22d3ee"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )

  // 8. Avg read time over time
  const readTimeOverTime = data.my_avg_read_time_over_time.map(d => ({
    period: d.period,
    avg_sec: Math.round(d.avg_duration_ms / 100) / 10,
  }))

  // 9. My top posts by likes
  const myTopByLikes = data.my_top_posts_by_likes
  const myTopLikesHorizBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={myTopByLikes} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis
          dataKey="title"
          type="category"
          tick={{ ...AXIS, fontSize: 9 }}
          width={76}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 14) + "…" : v)}
        />
        <Tooltip {...TT} />
        <Bar dataKey="like_count" fill="#fb7185" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myTopLikesTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {myTopByLikes.map(r => (
            <tr key={r.post_id} className="border-b border-zinc-900">
              <td className="py-2 pr-2 text-white">
                {r.title.length > 28 ? r.title.slice(0, 28) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 text-right text-zinc-300">{r.like_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 10. My top posts by comments
  const myTopByComments = data.my_top_posts_by_comments
  const myTopCommentsHorizBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={myTopByComments} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis
          dataKey="title"
          type="category"
          tick={{ ...AXIS, fontSize: 9 }}
          width={76}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 14) + "…" : v)}
        />
        <Tooltip {...TT} />
        <Bar dataKey="comment_count" fill="#34d399" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myTopCommentsTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {myTopByComments.map(r => (
            <tr key={r.post_id} className="border-b border-zinc-900">
              <td className="py-2 pr-2 text-white">
                {r.title.length > 28 ? r.title.slice(0, 28) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 text-right text-zinc-300">{r.comment_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 11. Comments written by format
  const commentsWrittenByFormat = FORMATS.map(f => ({
    format: f,
    count: data.my_comments_written_by_format.find(d => d.format === f)?.count ?? 0,
  }))

  // 12. My ranking
  const { by_posts, by_likes, total_users } = data.my_ranking
  const rankingGauges = (
    <div className="flex justify-around">
      <div className="flex flex-col items-center gap-1">
        <GaugeChart value={total_users - by_posts + 1} max={total_users} label="Posts rank" color="#a78bfa" size={140} />
        <div className="text-zinc-400 text-xs text-center">
          #{by_posts} of {total_users}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <GaugeChart value={total_users - by_likes + 1} max={total_users} label="Likes rank" color="#fb7185" size={140} />
        <div className="text-zinc-400 text-xs text-center">
          #{by_likes} of {total_users}
        </div>
      </div>
    </div>
  )

  // 13. Engagement score
  const score = data.my_engagement_score
  const engagementGauge = (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white text-4xl font-bold">{score.toFixed(1)}</div>
      <div className="text-zinc-500 text-xs">out of 100</div>
      <GaugeChart value={score} max={100} label="Engagement" color="#fbbf24" size={180} />
    </div>
  )
  const engagementLine = (() => {
    const approxData = data.my_posts_over_time.map(r => ({
      period: r.period,
      score: Math.min(r.count * 5, 100),
    }))
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={approxData}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={AXIS} domain={[0, 100]} />
          <Tooltip {...TT} />
          <Line type="monotone" dataKey="score" stroke="#fbbf24" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    )
  })()

  // 14. Streak cards (no chart)
  const { current_days, best_days } = data.my_streak
  const streakCards = (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-zinc-900 rounded-xl p-5 text-center">
        <div className="text-4xl font-bold text-white">{current_days}</div>
        <div className="text-zinc-400 text-xs mt-1">Current streak</div>
        <div className="text-2xl mt-1">🔥</div>
      </div>
      <div className="bg-zinc-900 rounded-xl p-5 text-center">
        <div className="text-4xl font-bold text-white">{best_days}</div>
        <div className="text-zinc-400 text-xs mt-1">Best streak</div>
        <div className="text-2xl mt-1">🔥</div>
      </div>
    </div>
  )

  // 15. Milestones timeline
  const milestonesTimeline = (
    <div className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
      <div className="flex gap-4 min-w-max">
        {data.my_milestones.map(m => (
          <div key={m.label} className="flex flex-col items-center gap-2 w-20">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                m.achieved
                  ? "border-violet-500 bg-violet-500/20 shadow-[0_0_8px_rgba(167,139,250,0.4)]"
                  : "border-zinc-700 bg-zinc-900"
              }`}
            >
              {m.achieved ? (
                <span className="text-violet-400">✓</span>
              ) : (
                <span className="text-zinc-600">○</span>
              )}
            </div>
            <div className={`text-[10px] text-center leading-tight ${m.achieved ? "text-zinc-300" : "text-zinc-600"}`}>
              {m.label}
            </div>
            {m.achieved_at && (
              <div className="text-zinc-600 text-[9px] text-center">{m.achieved_at}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  // 16. Likes given by format
  const likedByFormatFull = FORMATS.map(f => ({
    format: f,
    count: likedByFormat.find(d => d.format === f)?.count ?? 0,
  }))
  const likedByFormatHasData = likedByFormatFull.some(d => d.count > 0)

  return (
    <div>
      {/* 1. Overview */}
      <div className="px-4 py-4 border-b border-zinc-900">
        <div className="text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Overview
        </div>
        {overviewCards}
      </div>

      {/* 2. My Posts over Time */}
      <CategorySection
        title="My Posts over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_posts_over_time, "#a78bfa") },
          { label: "Area", component: makeAreaChart(data.my_posts_over_time, "#a78bfa") },
          { label: "Bar", component: makeBarChart(data.my_posts_over_time, "#a78bfa") },
          { label: "Cumulative", component: makeCumulative(data.my_posts_over_time, "#a78bfa") },
          { label: "Calendar", component: <CalendarHeatmap data={data.my_posts_over_time} /> },
        ]}
      />

      {/* 3. My Likes Received over Time */}
      <CategorySection
        title="My Likes Received over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_likes_received_over_time, "#fb7185") },
          { label: "Area", component: makeAreaChart(data.my_likes_received_over_time, "#fb7185") },
          { label: "Bar", component: makeBarChart(data.my_likes_received_over_time, "#fb7185") },
          { label: "Overlay", component: postsOverlayWithLikes },
        ]}
      />

      {/* 4. My Comments Received over Time */}
      <CategorySection
        title="My Comments Received over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_comments_received_over_time, "#34d399") },
          { label: "Area", component: makeAreaChart(data.my_comments_received_over_time, "#34d399") },
          { label: "Bar", component: makeBarChart(data.my_comments_received_over_time, "#34d399") },
        ]}
      />

      {/* 5. When Am I Active? */}
      <CategorySection
        title="When Am I Active?"
        charts={[
          { label: "Heatmap", component: <ActivityHeatmap data={data.my_activity_heatmap} /> },
          { label: "Polar", component: myPolar },
          { label: "By Weekday", component: myWdVertBar },
          { label: "By Hour", component: myHrVertBar },
        ]}
      />

      {/* 6. My Posts by Format */}
      <CategorySection
        title="My Posts by Format"
        charts={[
          { label: "Donut", component: makeFormatDonut(myPostsByFormatArr) },
          { label: "Vertical Bar", component: makeFormatVertBar(myPostsByFormatArr) },
          { label: "Horizontal Bar", component: makeFormatHorizBar(myPostsByFormatArr) },
          { label: "Radar", component: makeFormatRadar(myPostsByFormatArr) },
          { label: "Waffle", component: makeFormatWaffle(myPostsByFormatArr) },
        ]}
      />

      {/* 7. My Avg Read Time per Format */}
      <CategorySection
        title="My Avg Read Time per Format"
        charts={[
          { label: "Horizontal Bar", component: readTimeHorizBar },
          { label: "Radar", component: readTimeRadar },
          { label: "Dot Plot", component: readTimeDotPlot },
        ]}
      />

      {/* 8. My Avg Read Time over Time */}
      <CategorySection
        title="My Avg Read Time over Time"
        charts={[
          {
            label: "Line",
            component: (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={readTimeOverTime}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={AXIS} unit="s" />
                  <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read"]} />
                  <Line type="monotone" dataKey="avg_sec" stroke="#22d3ee" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ),
          },
          {
            label: "Area",
            component: (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={readTimeOverTime}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={AXIS} unit="s" />
                  <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read"]} />
                  <Area type="monotone" dataKey="avg_sec" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} dot={false} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ),
          },
          {
            label: "Bar",
            component: (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={readTimeOverTime}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={AXIS} unit="s" />
                  <Tooltip {...TT} formatter={(v: unknown) => [`${v}s`, "Avg read"]} />
                  <Bar dataKey="avg_sec" fill="#22d3ee" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
        ]}
      />

      {/* 9. My Top Posts by Likes */}
      <CategorySection
        title="My Top Posts by Likes"
        charts={[
          { label: "Horizontal Bar", component: myTopLikesHorizBar },
          { label: "Table", component: myTopLikesTable },
        ]}
      />

      {/* 10. My Top Posts by Comments */}
      <CategorySection
        title="My Top Posts by Comments"
        charts={[
          { label: "Horizontal Bar", component: myTopCommentsHorizBar },
          { label: "Table", component: myTopCommentsTable },
        ]}
      />

      {/* 11. My Comments Written by Format */}
      <CategorySection
        title="My Comments Written by Format"
        charts={[
          { label: "Donut", component: makeFormatDonut(commentsWrittenByFormat) },
          { label: "Horizontal Bar", component: makeFormatHorizBar(commentsWrittenByFormat) },
          { label: "Radar", component: makeFormatRadar(commentsWrittenByFormat) },
        ]}
      />

      {/* 12. My Ranking */}
      <CategorySection
        title="My Ranking"
        charts={[
          { label: "Gauge", component: rankingGauges },
        ]}
      />

      {/* 13. My Engagement Score */}
      <CategorySection
        title="My Engagement Score"
        charts={[
          { label: "Gauge", component: engagementGauge },
          { label: "Approximation", component: engagementLine },
        ]}
      />

      {/* 14. My Streak */}
      <div className="px-4 py-4 border-b border-zinc-900">
        <div className="text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">
          My Streak
        </div>
        {streakCards}
      </div>

      {/* 15. My Milestones */}
      <div className="px-4 py-4 border-b border-zinc-900">
        <div className="text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">
          My Milestones
        </div>
        {milestonesTimeline}
      </div>

      {/* 16. My Likes Given by Format */}
      <CategorySection
        title="My Likes Given by Format"
        charts={
          likedByFormatHasData
            ? [
                { label: "Donut", component: makeFormatDonut(likedByFormatFull) },
                { label: "Horizontal Bar", component: makeFormatHorizBar(likedByFormatFull) },
                { label: "Radar", component: makeFormatRadar(likedByFormatFull) },
              ]
            : [{ label: "Donut", component: <NoData /> }]
        }
      />

      {/* 17. My Scroll Behavior */}
      <CategorySection
        title="My Scroll Behavior (Avg View Duration)"
        charts={[
          { label: "Horizontal Bar", component: readTimeHorizBar },
          { label: "Radar", component: readTimeRadar },
        ]}
      />
    </div>
  )
}

// --- Main page component ---

export default function StatsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"global" | "my">("global")
  const [globalData, setGlobalData] = useState<GlobalStats | null>(null)
  const [myData, setMyData] = useState<MyStats | null>(null)
  const [globalLoading, setGlobalLoading] = useState(true)
  const [myLoading, setMyLoading] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [likedByFormat, setLikedByFormat] = useState<{ format: string; count: number }[]>([])

  // Fetch global stats on mount
  useEffect(() => {
    apiFetch("/api/stats/global")
      .then(r => r.json())
      .then(setGlobalData)
      .finally(() => setGlobalLoading(false))
  }, [])

  // Fetch personal stats when switching to My Stats tab
  useEffect(() => {
    if (activeTab !== "my" || !user || myData) return
    setMyLoading(true)
    apiFetch("/api/stats/me")
      .then(r => r.json())
      .then(setMyData)
      .finally(() => setMyLoading(false))
  }, [activeTab, user, myData])

  // Read localStorage counts client-side
  useEffect(() => {
    if (activeTab !== "my" || !user) return
    setSavedCount(getSavedPostIds().length)
    // Compute liked-by-format: fetch each liked post
    const ids = getLikedPostIds()
    if (ids.length === 0) return
    Promise.all(ids.map(id => apiFetch(`/api/posts/${id}`).then(r => r.ok ? r.json() : null)))
      .then(posts => {
        const counts: Record<string, number> = {}
        for (const post of posts) {
          if (!post?.format) continue
          counts[post.format] = (counts[post.format] ?? 0) + 1
        }
        setLikedByFormat(Object.entries(counts).map(([format, count]) => ({ format, count })))
      })
  }, [activeTab, user])

  const tabs: { key: "global" | "my"; label: string }[] = [
    { key: "global", label: "Global" },
    { key: "my", label: "My Stats" },
  ]

  return (
    <StatsErrorBoundary>
    <div className="relative max-w-[430px] mx-auto bg-zinc-950 min-h-[100dvh] flex flex-col">
      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-900 px-4 pt-3 pb-0">
        <div className="flex gap-1 bg-zinc-900 rounded-full p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === t.key
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {activeTab === "global" && (
          globalLoading ? (
            <div className="flex items-center justify-center h-40 text-zinc-400 text-sm">
              Loading stats...
            </div>
          ) : globalData ? (
            <GlobalTab data={globalData} />
          ) : (
            <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
              Could not load stats.
            </div>
          )
        )}

        {activeTab === "my" && !user && (
          <div className="flex flex-col items-center justify-center h-60 gap-4 px-8 text-center">
            <div className="text-zinc-400 text-sm">Log in to see your personal stats</div>
            <a
              href="/login"
              className="text-xs bg-zinc-800 text-white px-4 py-2 rounded-full hover:bg-zinc-700 transition-colors"
            >
              Log in
            </a>
          </div>
        )}

        {activeTab === "my" && user && (
          myLoading ? (
            <div className="flex items-center justify-center h-40 text-zinc-400 text-sm">
              Loading stats...
            </div>
          ) : myData ? (
            <MyStatsTab data={myData} savedCount={savedCount} likedByFormat={likedByFormat} />
          ) : (
            <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
              Could not load personal stats.
            </div>
          )
        )}
      </div>

      <BottomNav activeTab="stats" />
    </div>
    </StatsErrorBoundary>
  )
}
