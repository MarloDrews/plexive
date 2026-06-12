import { Text, View } from "react-native"
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg"
import { colors, fills, fonts } from "../../theme/tokens"
import {
  AXIS_COLOR,
  EMPTY_CELL,
  FORMAT_COLORS,
  GAUGE_TRACK,
  INK,
  LAMP,
  activityRamp,
  calendarRamp,
} from "./chartTheme"
import { NoData } from "./charts"

// Ports of the web stats page's hand-built components (WaffleChart,
// CalendarHeatmap, ActivityHeatmap, GaugeChart) plus the non-chart views
// (stat cards, tables, progress bars). The activity heatmap fits the slab
// width instead of scrolling horizontally — a horizontal scrollable inside
// the stats PagerView would fight the tab swipe on Android.

// --- Waffle (10x10 square grid + legend) ---

export function WaffleChart({
  data,
  width,
}: {
  data: { label: string; value: number; color: string }[]
  width: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <NoData />
  const squares: string[] = []
  for (const d of data) {
    const n = Math.round((d.value / total) * 100)
    for (let i = 0; i < n; i++) squares.push(d.color)
  }
  while (squares.length < 100) squares.push(squares[squares.length - 1] ?? colors["surface-3"])
  const gap = 2
  const cell = Math.floor((width - 9 * gap) / 10)
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {squares.slice(0, 100).map((color, i) => (
          <View key={i} style={{ width: cell, height: cell, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {data.map((d) => (
          <View key={d.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: d.color }} />
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"] }}>
              {d.label} ({d.value})
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// --- Calendar heatmap (last 12 months, 4-column grid) ---

export function CalendarHeatmap({ data }: { data: { period: string; count: number }[] }) {
  if (!data || data.length === 0) return <NoData />
  const lookup = new Map(data.map((d) => [d.period, d.count]))
  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return { key, label: d.toLocaleString("default", { month: "short" }) }
  })
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {months.map((m) => {
        const count = lookup.get(m.key) ?? 0
        const intensity = count / maxCount
        return (
          <View key={m.key} style={{ width: "25%", padding: 4, alignItems: "center", gap: 4 }}>
            <View
              style={{
                alignSelf: "stretch",
                height: 32,
                borderRadius: 8,
                backgroundColor: count === 0 ? EMPTY_CELL : calendarRamp(intensity),
              }}
            />
            <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: colors["ink-muted"] }}>{m.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

// --- Activity heatmap (7 weekdays x 24 hours, fit to width) ---

export function ActivityHeatmap({
  data,
  width,
  rgb = "124,111,255",
}: {
  data: { weekday: number; hour: number; count: number }[]
  width: number
  rgb?: string
}) {
  if (!data || data.length === 0) return <NoData />
  const lookup = new Map(data.map((d) => [`${d.weekday}:${d.hour}`, d.count]))
  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const gap = 2
  const labelW = 28
  const cell = Math.floor((width - labelW - 24 * gap) / 24)
  return (
    <View style={{ flexDirection: "row", gap }}>
      <View style={{ width: labelW, gap, paddingTop: cell + gap }}>
        {days.map((d) => (
          <Text
            key={d}
            style={{
              height: cell,
              fontFamily: fonts.sans,
              fontSize: 9,
              lineHeight: cell,
              color: colors["ink-muted"],
            }}
          >
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: 24 }, (_, hr) => (
        <View key={hr} style={{ gap }}>
          <Text
            style={{
              height: cell,
              width: cell,
              fontFamily: fonts.mono,
              fontSize: 8,
              lineHeight: cell,
              textAlign: "center",
              color: colors["ink-muted"],
            }}
          >
            {hr % 6 === 0 ? String(hr) : ""}
          </Text>
          {Array.from({ length: 7 }, (_, wd) => {
            const count = lookup.get(`${wd}:${hr}`) ?? 0
            const intensity = count / maxCount
            return (
              <View
                key={wd}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 2,
                  backgroundColor: count === 0 ? EMPTY_CELL : activityRamp(intensity, rgb),
                }}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
}

// --- Gauge (SVG arc + needle), near 1:1 port ---

export function GaugeChart({
  value,
  max,
  label,
  color = LAMP,
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
  const fillEnd = toXY(pct)

  const displayValue = value % 1 === 0 ? String(value) : value.toFixed(1)

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size * 0.65}>
        {/* Sweep flag 1: clockwise from the left end over the top — with
            flag 0 the arc runs under the gauge and is clipped away. */}
        <Path
          d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none"
          stroke={GAUGE_TRACK}
          strokeWidth={size * 0.065}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <Path
            d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${fillEnd[0]} ${fillEnd[1]}`}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.065}
            strokeLinecap="round"
          />
        )}
        <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={cx} cy={cy} r={size * 0.025} fill={INK} />
        <SvgText
          x={cx}
          y={cy + size * 0.1}
          textAnchor="middle"
          fill={INK}
          fontSize={size * 0.1}
          fontFamily={fonts.mono}
        >
          {displayValue}
        </SvgText>
        {label && (
          <SvgText
            x={cx}
            y={cy + size * 0.2}
            textAnchor="middle"
            fill={AXIS_COLOR}
            fontSize={size * 0.065}
            fontFamily={fonts.sans}
          >
            {label}
          </SvgText>
        )}
      </Svg>
    </View>
  )
}

// --- Stat cards (overview grids) ---

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        backgroundColor: fills.slab,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text style={{ fontFamily: fonts.mono, fontSize: 22, color: colors.ink }}>{value}</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"], marginTop: 4 }}>{label}</Text>
    </View>
  )
}

export function StatCardGrid({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </View>
  )
}

// --- Data table (flex rows; replaces the web <table>) ---

export interface TableColumn {
  label: string
  flex?: number
  align?: "left" | "right"
}

export function DataTable({
  columns,
  rows,
}: {
  columns: TableColumn[]
  rows: (string | number | React.ReactNode)[][]
}) {
  if (rows.length === 0) return <NoData />
  const cellStyle = (col: TableColumn) =>
    ({
      flex: col.flex ?? 1,
      textAlign: col.align ?? "left",
    }) as const
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.edge,
        }}
      >
        {columns.map((col) => (
          <Text
            key={col.label}
            style={[
              { fontFamily: fonts.sansMedium, fontSize: 12, color: colors["ink-muted"] },
              cellStyle(col),
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.edge,
          }}
        >
          {row.map((cell, ci) =>
            typeof cell === "string" || typeof cell === "number" ? (
              <Text
                key={ci}
                numberOfLines={1}
                style={[
                  { fontFamily: fonts.sans, fontSize: 12, color: colors["ink-body"] },
                  cellStyle(columns[ci]),
                ]}
              >
                {cell}
              </Text>
            ) : (
              <View key={ci} style={cellStyle(columns[ci])}>
                {cell}
              </View>
            )
          )}
        </View>
      ))}
    </View>
  )
}

// --- Progress bar list (Elo leaderboards, knowledge score) ---

export function ProgressBarList({
  items,
}: {
  items: { label: string; value: number; max: number; color: string; display: string; highlight?: boolean }[]
}) {
  if (items.length === 0) return <NoData />
  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text
            numberOfLines={1}
            style={{
              width: 76,
              fontFamily: item.highlight ? fonts.sansSemiBold : fonts.sans,
              fontSize: 12,
              color: item.highlight ? colors.lamp : colors["ink-dim"],
              textTransform: "capitalize",
            }}
          >
            {item.label}
          </Text>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: GAUGE_TRACK, overflow: "hidden" }}>
            <View
              style={{
                width: `${Math.min(100, (item.value / item.max) * 100)}%`,
                height: "100%",
                borderRadius: 4,
                backgroundColor: item.color,
              }}
            />
          </View>
          <Text
            style={{
              width: 48,
              textAlign: "right",
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors["ink-body"],
            }}
          >
            {item.display}
          </Text>
        </View>
      ))}
    </View>
  )
}

// --- Format chip (table cells) ---

export function FormatChip({ format }: { format: string }) {
  const color = FORMAT_COLORS[format] ?? colors["fmt-neutral"]
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: color + "22",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10, color, textTransform: "capitalize" }}>
        {format}
      </Text>
    </View>
  )
}
