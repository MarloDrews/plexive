import { Text, View } from "react-native"
import type { KeyFindingItem } from "../../types/post"
import { SectionBlock, SectionLabel, SvgFigure, proseStyle, sans, sansSemiBold } from "./primitives"
import MathText from "../MathText"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/KeyFindingsSection.tsx
export default function KeyFindingsSection({
  content,
  isUserContent,
}: {
  content: KeyFindingItem[]
  isUserContent: boolean
}) {
  return (
    <SectionBlock gap={20}>
      <SectionLabel>Key Findings</SectionLabel>
      {content.map((item, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Text style={sansSemiBold(14, colors.ink, { lineHeight: 19 })}>{unescapeDollar(item.title)}</Text>
          <MathText text={item.finding} style={[proseStyle, { color: colors["ink-dim"] }]} />
          {item.visual_svg ? (
            <SvgFigure svg={item.visual_svg} isUserContent={isUserContent} style={{ marginTop: 4 }} />
          ) : null}
          {item.source_in_paper ? (
            <Text style={sans(12, colors["ink-faint"])}>Source: {unescapeDollar(item.source_in_paper)}</Text>
          ) : null}
        </View>
      ))}
    </SectionBlock>
  )
}
