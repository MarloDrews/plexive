import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/LegacySection.tsx
// Body prose + optional present_day_impact accent callout box.

interface LegacyContent {
  body: string
  present_day_impact?: string
}

export default function LegacySection({ content }: { content: LegacyContent }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Legacy</SectionLabel>
      <Prose>{content.body}</Prose>
      {content.present_day_impact ? (
        <View
          style={{
            backgroundColor: accent + "1a",
            borderWidth: 1,
            borderColor: accent + "40",
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.ink }}>
            {unescapeDollar(content.present_day_impact)}
          </Text>
        </View>
      ) : null}
    </SectionBlock>
  )
}
