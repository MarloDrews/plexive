import { FlatList, Text, View } from "react-native"
import { colors, fills, fonts } from "../../theme/tokens"
import {
  DEFAULT_COLOR,
  EMPTY_CELL,
  FORMATS,
  FORMAT_COLORS,
  LAMP,
  RANK_COLORS,
} from "./chartTheme"
import {
  AreaChart,
  DualLineChart,
  HBarChart,
  GroupedVBarChart,
  LineChart,
  NoData,
  PieChart,
  RadarChart,
  ScatterChart,
  TreemapChart,
  VBarChart,
  type Datum,
} from "./charts"
import {
  ActivityHeatmap,
  CalendarHeatmap,
  DataTable,
  FormatChip,
  GaugeChart,
  StatCardGrid,
  WaffleChart,
} from "./widgets"
import CategorySection, { type ChartOption } from "./CategorySection"
import type { GlobalStats } from "./types"

// Port of the web stats GlobalTab (frontend/src/app/stats/page.tsx): the
// same 19 categories with the same chart options, rebuilt on the RN chart
// kit. Rendered as a FlatList of sections so the first paint mounts a few
// SVG slabs instead of all nineteen.

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}

// Username table cell with the lamp verification check, like the web tables.
function UserCell({ username, verified }: { username: string; verified?: number }) {
  return (
    <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.ink }}>
      {username}
      {verified ? <Text style={{ color: colors.lamp, fontSize: 10 }}> ✓</Text> : null}
    </Text>
  )
}

function formatDatums(byFormat: Record<string, number>): { label: string; value: number; color: string }[] {
  return FORMATS.map((f) => ({ label: f, value: byFormat[f] ?? 0, color: FORMAT_COLORS[f] }))
}

export default function GlobalTab({ data, width }: { data: GlobalStats; width: number }) {
  // Slab inner width: slab margins (12+12) + slab padding (16+16).
  const chartW = width - 56
  const { overview } = data

  const overTime = (
    series: { period: string; count: number }[],
    color: string,
    extra: ChartOption[] = []
  ): ChartOption[] => {
    const d = series.map((r) => ({ label: r.period, value: r.count }))
    return [
      { label: "Line", render: () => <LineChart data={d} color={color} width={chartW} /> },
      { label: "Area", render: () => <AreaChart data={d} color={color} width={chartW} /> },
      { label: "Bar", render: () => <VBarChart data={d.map((x) => ({ ...x, color }))} width={chartW} /> },
      { label: "Cumulative", render: () => <AreaChart data={d} color={color} width={chartW} cumulative /> },
      ...extra,
    ]
  }

  const overlay = (
    a: { period: string; count: number }[],
    nameA: string,
    colorA: string,
    b: { period: string; count: number }[],
    nameB: string,
    colorB: string
  ): ChartOption => ({
    label: "Overlay",
    render: () => (
      <DualLineChart
        data={a.map((r, i) => ({ label: r.period, a: r.count, b: b[i]?.count ?? 0 }))}
        seriesA={{ name: nameA, color: colorA }}
        seriesB={{ name: nameB, color: colorB }}
        width={chartW}
      />
    ),
  })

  const byFormatCharts = (byFormat: Record<string, number>, withPie: boolean): ChartOption[] => {
    const d = formatDatums(byFormat)
    const charts: ChartOption[] = [
      { label: "Donut", render: () => <PieChart data={d} width={chartW} innerRatio={0.55} /> },
    ]
    if (withPie) charts.push({ label: "Pie", render: () => <PieChart data={d} width={chartW} /> })
    charts.push(
      { label: "Vertical Bar", render: () => <VBarChart data={d} width={chartW} /> },
      { label: "Horizontal Bar", render: () => <HBarChart data={d} width={chartW} /> }
    )
    if (!withPie) {
      charts.push({
        label: "Radar",
        render: () => (
          <RadarChart
            axes={FORMATS}
            series={[{ name: "count", color: LAMP, values: FORMATS.map((f) => byFormat[f] ?? 0) }]}
            width={chartW}
          />
        ),
      })
    }
    charts.push({ label: "Treemap", render: () => <TreemapChart data={d} width={chartW} /> })
    if (withPie) {
      charts.push({
        label: "Waffle",
        render: () => <WaffleChart data={d} width={chartW} />,
      })
    }
    return charts
  }

  // Creator ranking sections share the same chart vocabulary.
  const creatorCharts = (
    rows: { username: string; is_verified: number; value: number }[],
    color: string,
    valueLabel: string,
    options: { treemap?: boolean; bubbleTwice?: boolean; unit?: string } = {}
  ): ChartOption[] => {
    const d = rows.map((r) => ({ label: r.username, value: r.value, color }))
    const charts: ChartOption[] = [
      { label: "Horizontal Bar", render: () => <HBarChart data={d} width={chartW} unit={options.unit ?? ""} /> },
    ]
    if (options.treemap) {
      charts.splice(1, 0, {
        label: "Vertical Bar",
        render: () => <VBarChart data={d} width={chartW} angled />,
      })
    }
    charts.push({
      label: "Table",
      render: () => (
        <DataTable
          columns={[
            { label: "#", flex: 0.5 },
            { label: "Username", flex: 3 },
            { label: valueLabel, flex: 1.5, align: "right" },
          ]}
          rows={rows.map((r, i) => [
            String(i + 1),
            <UserCell key={r.username} username={r.username} verified={r.is_verified} />,
            `${r.value}${options.unit ?? ""}`,
          ])}
        />
      ),
    })
    if (options.treemap) {
      charts.push({
        label: "Treemap",
        render: () => (
          <TreemapChart
            data={rows.map((r, i) => ({
              label: r.username,
              value: r.value,
              color: RANK_COLORS[i] ?? "#251d4a",
            }))}
            width={chartW}
          />
        ),
      })
    }
    const bubble: ChartOption = {
      label: "Bubble",
      render: () => (
        <ScatterChart
          data={rows.map((r, i) => ({ x: i + 1, y: r.value, color }))}
          width={chartW}
          unit={options.unit ?? ""}
        />
      ),
    }
    charts.push(bubble)
    if (options.bubbleTwice) charts.push({ ...bubble, label: "Scatter" })
    return charts
  }

  // Top creators per format: custom heatmap grid + small multiples.
  const perFormatHeatmap = () => {
    const allUsers: string[] = []
    FORMATS.forEach((fmt) => {
      ;(data.top_creators_per_format[fmt] ?? []).forEach((r) => {
        if (!allUsers.includes(r.username)) allUsers.push(r.username)
      })
    })
    if (allUsers.length === 0) return <NoData />
    const userTotals = Object.fromEntries(
      allUsers.map((u) => [
        u,
        FORMATS.reduce(
          (s, fmt) =>
            s + (data.top_creators_per_format[fmt]?.find((r) => r.username === u)?.post_count ?? 0),
          0
        ),
      ])
    )
    const maxVal = Math.max(...Object.values(userTotals), 1)
    const labelW = 64
    const cellW = Math.floor((chartW - labelW - 6 * 2) / 7)
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 2 }}>
          <View style={{ width: labelW }} />
          {FORMATS.map((f) => (
            <Text
              key={f}
              numberOfLines={1}
              style={{
                width: cellW,
                fontFamily: fonts.sans,
                fontSize: 8,
                textAlign: "center",
                color: colors["ink-muted"],
              }}
            >
              {f}
            </Text>
          ))}
        </View>
        {allUsers.slice(0, 10).map((u) => (
          <View key={u} style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{ width: labelW, fontFamily: fonts.sans, fontSize: 10, color: colors["ink-dim"], paddingRight: 4 }}
            >
              {u}
            </Text>
            {FORMATS.map((fmt) => {
              const cnt =
                data.top_creators_per_format[fmt]?.find((r) => r.username === u)?.post_count ?? 0
              const alpha = Math.round(40 + (cnt / maxVal) * 175)
                .toString(16)
                .padStart(2, "0")
              return (
                <View
                  key={fmt}
                  style={{
                    width: cellW,
                    height: 24,
                    borderRadius: 2,
                    backgroundColor: cnt === 0 ? EMPTY_CELL : `${FORMAT_COLORS[fmt]}${alpha}`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {cnt > 0 && (
                    <Text style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.ink }}>{cnt}</Text>
                  )}
                </View>
              )
            })}
          </View>
        ))}
      </View>
    )
  }

  const perFormatSmallMultiples = () => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {FORMATS.map((fmt) => {
        const fmtData = data.top_creators_per_format[fmt] ?? []
        return (
          <View
            key={fmt}
            style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: fills.slab, borderRadius: 12, padding: 8 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, color: FORMAT_COLORS[fmt], marginBottom: 4 }}>
              {fmt}
            </Text>
            {fmtData.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: colors["ink-faint"] }}>No data</Text>
            ) : (
              fmtData.map((r, i) => (
                <View key={r.username} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 2,
                      width: Math.max((r.post_count / (fmtData[0]?.post_count || 1)) * 64, 4),
                      backgroundColor: FORMAT_COLORS[fmt],
                      opacity: 1 - i * 0.25,
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1, fontFamily: fonts.sans, fontSize: 9, color: colors["ink-dim"] }}
                  >
                    {r.username}
                  </Text>
                  <Text style={{ marginLeft: "auto", fontFamily: fonts.mono, fontSize: 9, color: colors["ink-muted"] }}>
                    {r.post_count}
                  </Text>
                </View>
              ))
            )}
          </View>
        )
      })}
    </View>
  )

  const readTimeRows = data.top_creators_by_avg_read_time.map((r) => ({
    username: r.username,
    is_verified: r.is_verified,
    value: Math.round(r.avg_duration_ms / 100) / 10,
  }))

  const quality = data.post_quality_over_time.map((r) => ({
    label: r.period,
    value: r.avg_likes_per_post,
  }))

  const { published, pending } = data.pending_vs_published
  const statusData: Datum[] = [
    { label: "Published", value: published, color: "#72bb80" },
    { label: "Pending", value: pending, color: LAMP },
  ]

  const weekdayDatums = data.activity_by_weekday.map((d) => ({ label: d.weekday, value: d.count }))
  const hourDatums = data.activity_by_hour.map((d) => ({ label: String(d.hour), value: d.count }))

  const sections: { title: string; charts: ChartOption[] }[] = [
    {
      title: "Overview",
      charts: [
        {
          label: "Cards",
          render: () => (
            <StatCardGrid
              items={[
                { label: "Total Posts", value: overview.total_posts.toLocaleString() },
                { label: "Total Users", value: overview.total_users.toLocaleString() },
                { label: "Total Comments", value: overview.total_comments.toLocaleString() },
                { label: "Total Likes", value: overview.total_likes.toLocaleString() },
                { label: "Avg Posts / User", value: overview.avg_posts_per_user },
              ]}
            />
          ),
        },
      ],
    },
    {
      title: "Top Creators by Posts",
      charts: creatorCharts(
        data.top_creators_by_posts.map((r) => ({ ...r, value: r.post_count })),
        LAMP,
        "Posts",
        { treemap: true }
      ),
    },
    {
      title: "Top Creators by Likes Received",
      charts: creatorCharts(
        data.top_creators_by_likes.map((r) => ({ ...r, value: r.like_count })),
        "#c47dcc",
        "Likes",
        { bubbleTwice: true }
      ),
    },
    {
      title: "Top Creators by Comments Received",
      charts: creatorCharts(
        data.top_creators_by_comments.map((r) => ({ ...r, value: r.comment_count })),
        "#72bb80",
        "Comments"
      ),
    },
    {
      title: "Top Creators by Avg Read Time",
      charts: creatorCharts(readTimeRows, "#5bc8bc", "Avg Read", { unit: "s" }),
    },
    {
      title: "Top Creators per Format",
      charts: [
        {
          label: "Grouped Bar",
          render: () => (
            <GroupedVBarChart
              data={FORMATS.map((fmt) => ({
                label: fmt,
                values: [
                  data.top_creators_per_format[fmt]?.[0]?.post_count ?? 0,
                  data.top_creators_per_format[fmt]?.[1]?.post_count ?? 0,
                  data.top_creators_per_format[fmt]?.[2]?.post_count ?? 0,
                ],
              }))}
              series={[
                { name: "1st", color: RANK_COLORS[0] },
                { name: "2nd", color: RANK_COLORS[1] },
                { name: "3rd", color: RANK_COLORS[2] },
              ]}
              width={chartW}
            />
          ),
        },
        { label: "Heatmap", render: perFormatHeatmap },
        { label: "Small Multiples", render: perFormatSmallMultiples },
      ],
    },
    {
      title: "Top Posts by Likes",
      charts: [
        {
          label: "Horizontal Bar",
          render: () => (
            <HBarChart
              data={data.top_posts_by_likes.map((r) => ({
                label: truncate(r.title, 14),
                value: r.like_count,
                color: "#c47dcc",
              }))}
              width={chartW}
            />
          ),
        },
        {
          label: "Table",
          render: () => (
            <DataTable
              columns={[
                { label: "#", flex: 0.5 },
                { label: "Title", flex: 3 },
                { label: "Format", flex: 1.8 },
                { label: "Likes", flex: 1, align: "right" },
              ]}
              rows={data.top_posts_by_likes.map((r, i) => [
                String(i + 1),
                truncate(r.title, 26),
                <FormatChip key={r.post_id} format={r.format} />,
                String(r.like_count),
              ])}
            />
          ),
        },
      ],
    },
    {
      title: "Posts over Time",
      charts: overTime(data.posts_over_time, LAMP, [
        { label: "Calendar", render: () => <CalendarHeatmap data={data.posts_over_time} /> },
      ]),
    },
    { title: "Users over Time", charts: overTime(data.users_over_time, "#72bb80") },
    {
      title: "Comments over Time",
      charts: [
        ...overTime(data.comments_over_time, "#c47dcc").slice(0, 3),
        overlay(data.comments_over_time, "comments", "#c47dcc", data.posts_over_time, "posts", LAMP),
      ],
    },
    {
      title: "Likes over Time",
      charts: [
        ...overTime(data.likes_over_time, LAMP).slice(0, 3),
        overlay(data.likes_over_time, "likes", LAMP, data.posts_over_time, "posts", DEFAULT_COLOR),
      ],
    },
    { title: "Posts by Format", charts: byFormatCharts(data.posts_by_format, true) },
    { title: "Comments by Format", charts: byFormatCharts(data.comments_by_format, false) },
    { title: "Likes by Format", charts: byFormatCharts(data.likes_by_format, false) },
    {
      title: "Activity by Weekday",
      charts: [
        { label: "Bar", render: () => <VBarChart data={weekdayDatums.map((d) => ({ ...d, color: LAMP }))} width={chartW} /> },
        {
          label: "Radar",
          render: () => (
            <RadarChart
              axes={weekdayDatums.map((d) => d.label)}
              series={[{ name: "count", color: LAMP, values: weekdayDatums.map((d) => d.value) }]}
              width={chartW}
            />
          ),
        },
        { label: "Heatmap", render: () => <ActivityHeatmap data={data.activity_heatmap} width={chartW} /> },
        { label: "Line", render: () => <LineChart data={weekdayDatums} color={LAMP} width={chartW} /> },
      ],
    },
    {
      title: "Activity by Hour",
      charts: [
        { label: "Bar", render: () => <VBarChart data={hourDatums.map((d) => ({ ...d, color: "#5bc8bc" }))} width={chartW} /> },
        { label: "Area", render: () => <AreaChart data={hourDatums} color="#5bc8bc" width={chartW} /> },
        {
          label: "Polar",
          render: () => (
            <RadarChart
              axes={Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? `${h}h` : ""))}
              series={[
                {
                  name: "count",
                  color: "#5bc8bc",
                  values: Array.from({ length: 24 }, (_, h) => data.activity_by_hour[h]?.count ?? 0),
                },
              ]}
              width={chartW}
            />
          ),
        },
        { label: "Heatmap", render: () => <ActivityHeatmap data={data.activity_heatmap} width={chartW} /> },
      ],
    },
    {
      title: "Post Quality over Time",
      charts: [
        { label: "Line", render: () => <LineChart data={quality} color={LAMP} width={chartW} /> },
        { label: "Bar", render: () => <VBarChart data={quality.map((d) => ({ ...d, color: LAMP }))} width={chartW} /> },
        { label: "Area", render: () => <AreaChart data={quality} color={LAMP} width={chartW} /> },
      ],
    },
    {
      title: "Content Status",
      charts: [
        { label: "Donut", render: () => <PieChart data={statusData} width={chartW} innerRatio={0.55} /> },
        {
          label: "Gauge",
          render: () => (
            <View style={{ alignItems: "center", gap: 8 }}>
              <GaugeChart value={published} max={published + pending} label="Published ratio" color="#72bb80" size={200} />
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"] }}>
                {published} published / {pending} pending
              </Text>
            </View>
          ),
        },
      ],
    },
    {
      title: "Comment Activity by User",
      charts: [
        {
          label: "Horizontal Bar",
          render: () => (
            <HBarChart
              data={data.comment_activity_by_user.map((r) => ({
                label: r.username,
                value: r.comment_count,
                color: "#8a88e8",
              }))}
              width={chartW}
            />
          ),
        },
        {
          label: "Table",
          render: () => (
            <DataTable
              columns={[
                { label: "#", flex: 0.5 },
                { label: "Username", flex: 3 },
                { label: "Comments", flex: 1.5, align: "right" },
              ]}
              rows={data.comment_activity_by_user.map((r, i) => [
                String(i + 1),
                r.username,
                String(r.comment_count),
              ])}
            />
          ),
        },
      ],
    },
  ]

  return (
    <FlatList
      data={sections}
      keyExtractor={(s) => s.title}
      renderItem={({ item }) => <CategorySection title={item.title} charts={item.charts} />}
      initialNumToRender={4}
      maxToRenderPerBatch={3}
      windowSize={21}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
    />
  )
}
