import { Pressable, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle, Line, Path } from "react-native-svg"
import { useAuth } from "../lib/auth"
import { colors, fills } from "../theme/tokens"
import { Frosted } from "./stage"

// Port of frontend/src/app/components/BottomNav.tsx (Stage): a frosted pill
// dock floating inset from every edge; the active item is a filled neutral
// circle — functional, never glow. Feed/Stats/Profile navigate like the web
// (Profile goes to the own public profile, settings live behind its gear);
// Chat/Create still report "coming soon" until those screens exist.

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

type ActiveTab = "feed" | "stats" | "profile"

function NavButton({
  onPress,
  active,
  children,
}: {
  onPress: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? fills.active12 : "transparent",
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      {children}
    </Pressable>
  )
}

export default function BottomNav({
  active,
  onComingSoon,
}: {
  active?: ActiveTab
  onComingSoon: () => void
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const inactive = colors["ink-muted"]
  const iconColor = (tab: ActiveTab) => (active === tab ? colors.ink : inactive)

  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: insets.bottom + 12,
        zIndex: 30,
      }}
    >
      <Frosted borderRadius={999} style={{ height: 56 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingHorizontal: 8,
          }}
        >
          {/* Chat */}
          <NavButton onPress={onComingSoon}>
            <Svg {...ICON_PROPS} stroke={inactive}>
              <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </Svg>
          </NavButton>

          {/* Stats — line chart (axes + rising trend), matching the web glyph */}
          <NavButton
            onPress={active === "stats" ? () => {} : () => router.push("/stats")}
            active={active === "stats"}
          >
            <Svg {...ICON_PROPS} stroke={iconColor("stats")}>
              <Path d="M3 3v18h18" />
              <Path d="m7 14 4-4 3 3 5-6" />
            </Svg>
          </NavButton>

          {/* Feed */}
          <NavButton
            onPress={active === "feed" ? () => {} : () => router.replace("/")}
            active={active === "feed"}
          >
            <Svg {...ICON_PROPS} stroke={iconColor("feed")}>
              <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
            </Svg>
          </NavButton>

          {/* Create */}
          <NavButton onPress={onComingSoon}>
            <Svg {...ICON_PROPS} stroke={inactive}>
              <Circle cx={12} cy={12} r={10} />
              <Line x1={12} y1={8} x2={12} y2={16} />
              <Line x1={8} y1={12} x2={16} y2={12} />
            </Svg>
          </NavButton>

          {/* Profile — own public profile when logged in (web behavior) */}
          <NavButton
            onPress={
              active === "profile"
                ? () => {}
                : () => (user ? router.push(`/profile/${user.username}`) : router.push("/login"))
            }
            active={active === "profile"}
          >
            <Svg {...ICON_PROPS} stroke={iconColor("profile")}>
              <Circle cx={12} cy={8} r={4} />
              <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </Svg>
          </NavButton>
        </View>
      </Frosted>
    </View>
  )
}
