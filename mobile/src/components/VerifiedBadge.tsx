import Svg, { Circle, Path } from "react-native-svg"
import { colors } from "../theme/tokens"

// Port of frontend/src/components/VerifiedBadge.tsx.
// level 1 = purple circle, level 2 = green circle, level 3+ = dark red circle,
// all with checkmark. variant="official" is for Plexive seed content.

const LEVEL_COLOR: Record<number, string> = {
  1: colors["fmt-concepts"],
  2: colors.good,
  3: "#b91c1c",
}

interface Props {
  size?: number
  level?: number
  variant?: "official"
}

export default function VerifiedBadge({ size = 16, level = 1, variant }: Props) {
  const color = variant === "official" ? colors.lamp : (LEVEL_COLOR[level] ?? LEVEL_COLOR[3])
  const check = variant === "official" ? "M5 8.5l2 2 4-4" : "M4.5 8l2.5 2.5 4.5-4.5"
  return (
    <Svg viewBox="0 0 16 16" width={size} height={size}>
      <Circle cx={8} cy={8} r={8} fill={color} />
      <Path
        d={check}
        stroke={colors["surface-0"]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
