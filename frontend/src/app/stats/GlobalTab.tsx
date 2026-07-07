"use client"

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
import type { GlobalStats } from "./types"
import {
  FORMAT_COLORS, FORMATS, RANK_COLORS, TT, AXIS, GRID,
  CalendarHeatmap, ActivityHeatmap, GaugeChart, FormatChip, StatCard, CategorySection, TreemapCell,
  makeLineChart, makeAreaChart, makeBarChart, makeCumulativeArea, makeOverlayLine,
  makeDonut, makePie, makeVertBar, makeHorizBar, makeRadar, makeTreemap, makeWaffle,
} from "./charts"

export default function GlobalTab({ data }: { data: GlobalStats }) {
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
        <Bar dataKey="post_count" fill="#7c6fff" radius={[0, 3, 3, 0]} />
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
        <Bar dataKey="post_count" fill="#7c6fff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByPostsTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Posts</th>
          </tr>
        </thead>
        <tbody>
          {topByPosts.map((r, i) => (
            <tr key={r.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3 text-ink">
                <Link href={`/profile/${r.username}`} className="hover:text-ink-body transition-colors">{r.username}</Link>
                {r.is_verified && <span className="ml-1 text-lamp text-[10px]">✓</span>}
              </td>
              <td className="py-2 text-right text-ink-body">{r.post_count}</td>
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
          fill: RANK_COLORS[i] ?? "#251d4a",
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
          fill="#7c6fff"
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
        <Bar dataKey="like_count" fill="#c47dcc" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByLikesTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {topByLikes.map((r, i) => (
            <tr key={r.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3 text-ink">
                <Link href={`/profile/${r.username}`} className="hover:text-ink-body transition-colors">{r.username}</Link>
                {r.is_verified && <span className="ml-1 text-lamp text-[10px]">✓</span>}
              </td>
              <td className="py-2 text-right text-ink-body">{r.like_count}</td>
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
        <Scatter data={topByLikes.map((r, i) => ({ ...r, index: i + 1 }))} fill="#c47dcc" />
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
          fill="#c47dcc"
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
        <Bar dataKey="comment_count" fill="#72bb80" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByCommentsTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {topByComments.map((r, i) => (
            <tr key={r.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3 text-ink"><Link href={`/profile/${r.username}`} className="hover:text-ink-body transition-colors">{r.username}</Link></td>
              <td className="py-2 text-right text-ink-body">{r.comment_count}</td>
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
          fill="#72bb80"
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
        <Bar dataKey="avg_sec" fill="#5bc8bc" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topByReadTimeTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Avg Read</th>
          </tr>
        </thead>
        <tbody>
          {topByReadTime.map((r, i) => (
            <tr key={r.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3 text-ink"><Link href={`/profile/${r.username}`} className="hover:text-ink-body transition-colors">{r.username}</Link></td>
              <td className="py-2 text-right text-ink-body">{r.avg_sec}s</td>
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
          fill="#5bc8bc"
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
        <Legend wrapperStyle={{ fontSize: 11, color: "#8a8a8a" }} />
        <Bar dataKey="first" name="1st" fill="#7c6fff" radius={[2, 2, 0, 0]} />
        <Bar dataKey="second" name="2nd" fill="#6655d8" radius={[2, 2, 0, 0]} />
        <Bar dataKey="third" name="3rd" fill="#5040a8" radius={[2, 2, 0, 0]} />
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
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-max">
          <div className="flex gap-0.5 mb-1">
            <div className="w-16" />
            {FORMATS.map(f => (
              <div key={f} className="w-12 text-ink-muted text-[9px] text-center">{f}</div>
            ))}
          </div>
          {allUsers.slice(0, 10).map(u => (
            <div key={u} className="flex gap-0.5 mb-0.5 items-center">
              <div className="w-16 text-ink-dim text-[10px] truncate pr-1">{u}</div>
              {FORMATS.map(fmt => {
                const cnt = data.top_creators_per_format[fmt]?.find(r => r.username === u)?.post_count ?? 0
                return (
                  <div
                    key={fmt}
                    className="w-12 h-6 rounded-sm flex items-center justify-center"
                    style={{
                      backgroundColor:
                        cnt === 0
                          ? "#1a1a1a"
                          : `${FORMAT_COLORS[fmt]}${Math.round(40 + (cnt / maxVal) * 175).toString(16).padStart(2, "0")}`,
                    }}
                    title={`${u} / ${fmt}: ${cnt}`}
                  >
                    {cnt > 0 && <span className="text-ink text-[9px]">{cnt}</span>}
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
          <div key={fmt} className="bg-white/[0.04] rounded-xl p-2">
            <div className="text-[10px] font-semibold mb-1" style={{ color: FORMAT_COLORS[fmt] }}>
              {fmt}
            </div>
            {fmtData.length === 0 ? (
              <div className="text-ink-faint text-[10px]">No data</div>
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
                  <span className="text-ink-dim text-[9px] truncate">{r.username}</span>
                  <span className="text-ink-muted text-[9px] ml-auto">{r.post_count}</span>
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
        <Bar dataKey="like_count" fill="#c47dcc" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const topPostsTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-2">#</th>
            <th className="text-left pb-2 pr-2">Title</th>
            <th className="text-left pb-2 pr-2">Format</th>
            <th className="text-left pb-2 pr-2">Author</th>
            <th className="text-right pb-2">Likes</th>
          </tr>
        </thead>
        <tbody>
          {topPosts.map((r, i) => (
            <tr key={r.post_id} className="border-b border-edge">
              <td className="py-2 pr-2 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-2 text-ink">
                {r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title}
              </td>
              <td className="py-2 pr-2"><FormatChip format={r.format} /></td>
              <td className="py-2 pr-2 text-ink-dim">{r.author}</td>
              <td className="py-2 text-right text-ink-body">{r.like_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 15. Activity by weekday
  const wdVertBar = (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.activity_by_weekday}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="weekday" tick={AXIS} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Bar dataKey="count" fill="#7c6fff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const wdRadar = (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data.activity_by_weekday.map(d => ({ subject: d.weekday, count: d.count }))}>
        <PolarGrid stroke="rgba(200,200,200,0.07)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} />
        <Radar dataKey="count" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.3} />
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
        <Line type="monotone" dataKey="count" stroke="#7c6fff" dot={false} strokeWidth={2} />
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
        <Bar dataKey="count" fill="#5bc8bc" radius={[2, 2, 0, 0]} />
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
        <Area type="monotone" dataKey="count" stroke="#5bc8bc" fill="#5bc8bc" fillOpacity={0.2} dot={false} strokeWidth={2} />
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
        <PolarGrid stroke="rgba(200,200,200,0.07)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
        <Radar dataKey="count" stroke="#5bc8bc" fill="#5bc8bc" fillOpacity={0.3} />
        <Tooltip {...TT} />
      </RadarChart>
    </ResponsiveContainer>
  )
  const hrHeatmap = <ActivityHeatmap data={data.activity_heatmap} />

  // 17. Post quality over time
  const qualityLine = (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data.post_quality_over_time}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Line type="monotone" dataKey="avg_likes_per_post" stroke="#7c6fff" dot={false} strokeWidth={2} />
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
        <Bar dataKey="avg_likes_per_post" fill="#7c6fff" radius={[2, 2, 0, 0]} />
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
        <Area type="monotone" dataKey="avg_likes_per_post" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.2} dot={false} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )

  // 18. Content status
  const { published, pending } = data.pending_vs_published
  const statusDonut = makeDonut({ published, pending } as unknown as Record<string, number>)
  const statusDonutReal = (() => {
    const statusData = [
      { name: "Published", value: published, fill: "#72bb80" },
      { name: "Pending", value: pending, fill: "#7c6fff" },
    ]
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
            {statusData.map(d => <Cell key={d.name} fill={d.fill} />)}
          </Pie>
          <Tooltip {...TT} />
          <Legend
            formatter={(v: string) => <span style={{ color: "#8a8a8a", fontSize: 11 }}>{v}</span>}
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
        color="#72bb80"
        size={200}
      />
      <div className="text-ink-dim text-xs">
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
        <Bar dataKey="comment_count" fill="#8a88e8" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
  const commentersTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">Username</th>
            <th className="text-right pb-2">Comments</th>
          </tr>
        </thead>
        <tbody>
          {commenters.map((r, i) => (
            <tr key={r.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3 text-ink">{r.username}</td>
              <td className="py-2 text-right text-ink-body">{r.comment_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      {/* 1. Overview */}
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">
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
          { label: "Line", component: makeLineChart(data.posts_over_time, "#7c6fff") },
          { label: "Area", component: makeAreaChart(data.posts_over_time, "#7c6fff") },
          { label: "Bar", component: makeBarChart(data.posts_over_time, "#7c6fff") },
          { label: "Cumulative", component: makeCumulativeArea(data.posts_over_time, "#7c6fff") },
          { label: "Calendar", component: <CalendarHeatmap data={data.posts_over_time} /> },
        ]}
      />

      {/* 9. Users over Time */}
      <CategorySection
        title="Users over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.users_over_time, "#72bb80") },
          { label: "Area", component: makeAreaChart(data.users_over_time, "#72bb80") },
          { label: "Bar", component: makeBarChart(data.users_over_time, "#72bb80") },
          { label: "Cumulative", component: makeCumulativeArea(data.users_over_time, "#72bb80") },
        ]}
      />

      {/* 10. Comments over Time */}
      <CategorySection
        title="Comments over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.comments_over_time, "#c47dcc") },
          { label: "Area", component: makeAreaChart(data.comments_over_time, "#c47dcc") },
          { label: "Bar", component: makeBarChart(data.comments_over_time, "#c47dcc") },
          {
            label: "Overlay",
            component: makeOverlayLine(
              data.comments_over_time, "comments", "#c47dcc",
              data.posts_over_time, "posts", "#7c6fff",
            ),
          },
        ]}
      />

      {/* 11. Likes over Time */}
      <CategorySection
        title="Likes over Time"
        charts={[
          { label: "Line", component: makeLineChart(data.likes_over_time, "#7c6fff") },
          { label: "Area", component: makeAreaChart(data.likes_over_time, "#7c6fff") },
          { label: "Bar", component: makeBarChart(data.likes_over_time, "#7c6fff") },
          {
            label: "Overlay",
            component: makeOverlayLine(
              data.likes_over_time, "likes", "#7c6fff",
              data.posts_over_time, "posts", "#7c6fff",
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
