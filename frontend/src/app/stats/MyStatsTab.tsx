"use client"

import { memo } from "react"
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import FlameIcon from "@/components/FlameIcon"
import type { MyStats } from "./types"
import {
  FORMAT_COLORS, FORMATS, DEFAULT_COLOR, TT, AXIS, GRID,
  CalendarHeatmap, ActivityHeatmap, GaugeChart, FormatChip, StatCard, CategorySection, NoData,
  makeLineChart, makeAreaChartFlat, makeBarChart, makeCumulativeFlat,
  makeFormatDonut, makeFormatHorizBar, makeFormatRadar, makeFormatWaffle, makeFormatVertBar,
} from "./charts"

// memo: the tab rebuilds its chart variants only when the stats payload or
// the saved count actually changes, not on every parent re-render.
function MyStatsTab({
  data,
  savedCount,
}: {
  data: MyStats
  savedCount: number
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
      <StatCard label="Posts Liked" value={overview.posts_liked} />
      <StatCard label="Saved Posts" value={savedCount} />
    </div>
  )

  // 1b. Knowledge score (Elo) — one unified rating, no per-format bars.
  // my_elo/my_quiz are defaulted at the point of use so a payload from an
  // older backend that omits them degrades to placeholders, not a crash.
  const knowledgeBlock = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Global Score" value={data.my_elo?.global_rating ?? "—"} />
        <StatCard label="Answered" value={data.my_quiz?.answered ?? 0} />
        <StatCard label="Accuracy" value={`${data.my_quiz?.accuracy ?? 0}%`} />
      </div>
      <p className="text-ink-muted text-xs">
        Answer post quizzes to build your score. Correct answers raise it, wrong answers lower it.
      </p>
    </div>
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
          <Legend wrapperStyle={{ fontSize: 11, color: "#8a8a8a" }} />
          <Line yAxisId="left" type="monotone" dataKey="posts" stroke="#7c6fff" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="likes" stroke="#c47dcc" dot={false} strokeWidth={2} />
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
        <Bar dataKey="count" fill="#7c6fff" radius={[3, 3, 0, 0]} />
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
        <Bar dataKey="count" fill="#5bc8bc" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myPolar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data.my_activity_by_weekday.map(d => ({ subject: d.weekday, count: d.count }))}>
        <PolarGrid stroke="rgba(200,200,200,0.07)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.3} />
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
        <PolarGrid stroke="rgba(200,200,200,0.07)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} />
        <Radar dataKey="avg_sec" stroke="#5bc8bc" fill="#5bc8bc" fillOpacity={0.3} />
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
          fill="#5bc8bc"
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
        <Bar dataKey="like_count" fill="#c47dcc" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myTopLikesTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {myTopByLikes.map(r => (
            <tr key={r.post_id} className="border-b border-edge">
              <td className="py-2 pr-2 text-ink">
                {r.title.length > 28 ? r.title.slice(0, 28) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 text-right text-ink-body">{r.like_count}</td>
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
        <Bar dataKey="comment_count" fill="#72bb80" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const myTopCommentsTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {myTopByComments.map(r => (
            <tr key={r.post_id} className="border-b border-edge">
              <td className="py-2 pr-2 text-ink">
                {r.title.length > 28 ? r.title.slice(0, 28) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 text-right text-ink-body">{r.comment_count}</td>
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
  // The inverted value drives the arc fill only (rank 1 = full gauge); the
  // printed number is the actual rank, matching the caption underneath.
  const rankingGauges = (
    <div className="flex justify-around">
      <div className="flex flex-col items-center gap-1">
        <GaugeChart value={total_users - by_posts + 1} max={total_users} display={`#${by_posts}`} label="Posts rank" color="#7c6fff" size={140} />
        <div className="text-ink-dim text-xs text-center">
          #{by_posts} of {total_users}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <GaugeChart value={total_users - by_likes + 1} max={total_users} display={`#${by_likes}`} label="Likes rank" color="#c47dcc" size={140} />
        <div className="text-ink-dim text-xs text-center">
          #{by_likes} of {total_users}
        </div>
      </div>
    </div>
  )

  // 13. Engagement score (defaulted so a missing field cannot crash toFixed)
  const score = data.my_engagement_score ?? 0
  const engagementGauge = (
    <div className="flex flex-col items-center gap-2">
      <div className="text-ink text-4xl font-bold">{score.toFixed(1)}</div>
      <div className="text-ink-muted text-xs">out of 100</div>
      <GaugeChart value={score} max={100} label="Engagement" color="#7c6fff" size={180} />
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
          <Line type="monotone" dataKey="score" stroke="#7c6fff" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    )
  })()

  // 14. Streak cards (no chart)
  const { current_days, best_days } = data.my_streak
  const streakCards = (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white/[0.04] rounded-2xl p-5 text-center">
        <div className="text-4xl font-bold text-ink">{current_days}</div>
        <div className="text-ink-dim text-xs mt-1">Current streak</div>
        <div className="mt-1 flex justify-center">
          <FlameIcon size={24} color="var(--color-save)" filled={current_days > 0} />
        </div>
      </div>
      <div className="bg-white/[0.04] rounded-2xl p-5 text-center">
        <div className="text-4xl font-bold text-ink">{best_days}</div>
        <div className="text-ink-dim text-xs mt-1">Best streak</div>
        <div className="mt-1 flex justify-center">
          <FlameIcon size={24} color="var(--color-save)" filled={best_days > 0} />
        </div>
      </div>
    </div>
  )

  // 15. Milestones timeline
  const milestonesTimeline = (
    <div className="overflow-x-auto overscroll-x-contain pb-2">
      <div className="flex gap-4 min-w-max">
        {data.my_milestones.map(m => (
          <div key={m.label} className="flex flex-col items-center gap-2 w-20">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                m.achieved
                  ? "border-lamp bg-lamp/20 shadow-[0_0_8px_rgba(124,111,255,0.4)]"
                  : "border-transparent bg-white/[0.06]"
              }`}
            >
              {m.achieved ? (
                <span className="text-lamp">✓</span>
              ) : (
                <span className="text-ink-faint">○</span>
              )}
            </div>
            <div className={`text-[10px] text-center leading-tight ${m.achieved ? "text-ink-body" : "text-ink-faint"}`}>
              {m.label}
            </div>
            {m.achieved_at && (
              <div className="text-ink-faint text-[9px] text-center">{m.achieved_at}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  // 16. Likes given by format
  const likedByFormatFull = FORMATS.map(f => ({
    format: f,
    count: data.my_likes_given_by_format.find(d => d.format === f)?.count ?? 0,
  }))
  const likedByFormatHasData = likedByFormatFull.some(d => d.count > 0)

  return (
    <div>
      {/* 1. Overview */}
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">
          Overview
        </div>
        {overviewCards}
      </div>

      {/* 1b. My Knowledge Score */}
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">
          My Knowledge Score
        </div>
        {knowledgeBlock}
      </div>

      {/* 2. My Posts over Time */}
      <CategorySection
        title="My Posts over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_posts_over_time, "#7c6fff") },
          { label: "Area", component: makeAreaChartFlat(data.my_posts_over_time, "#7c6fff") },
          { label: "Bar", component: makeBarChart(data.my_posts_over_time, "#7c6fff") },
          { label: "Cumulative", component: makeCumulativeFlat(data.my_posts_over_time, "#7c6fff") },
          { label: "Calendar", component: <CalendarHeatmap data={data.my_posts_over_time} /> },
        ]}
      />

      {/* 3. My Likes Received over Time */}
      <CategorySection
        title="My Likes Received over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_likes_received_over_time, "#c47dcc") },
          { label: "Area", component: makeAreaChartFlat(data.my_likes_received_over_time, "#c47dcc") },
          { label: "Bar", component: makeBarChart(data.my_likes_received_over_time, "#c47dcc") },
          { label: "Overlay", component: postsOverlayWithLikes },
        ]}
      />

      {/* 4. My Comments Received over Time */}
      <CategorySection
        title="My Comments Received over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.my_comments_received_over_time, "#72bb80") },
          { label: "Area", component: makeAreaChartFlat(data.my_comments_received_over_time, "#72bb80") },
          { label: "Bar", component: makeBarChart(data.my_comments_received_over_time, "#72bb80") },
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
                  <Line type="monotone" dataKey="avg_sec" stroke="#5bc8bc" dot={false} strokeWidth={2} />
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
                  <Area type="monotone" dataKey="avg_sec" stroke="#5bc8bc" fill="#5bc8bc" fillOpacity={0.15} dot={false} strokeWidth={2} />
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
                  <Bar dataKey="avg_sec" fill="#5bc8bc" radius={[2, 2, 0, 0]} />
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
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">
          My Streak
        </div>
        {streakCards}
      </div>

      {/* 15. My Milestones */}
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">
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

export default memo(MyStatsTab)
