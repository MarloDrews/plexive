import { Text, View } from "react-native"
import { SECTION_PADDING_H, SECTION_PADDING_V, SectionLabel } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/SurprisesSection.tsx
// Accent-tinted full-bleed background block.
export default function SurprisesSection({ content }: { content: string }) {
  const accent = useAccent()
  return (
    <View
      style={{
        paddingHorizontal: SECTION_PADDING_H,
        paddingVertical: SECTION_PADDING_V,
        backgroundColor: accent + "33",
      }}
    >
      <SectionLabel color={accent + "b3"} style={{ marginBottom: 12 }}>
        Why It Surprises Us
      </SectionLabel>
      <Text style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 26, color: colors.ink }}>
        {unescapeDollar(content)}
      </Text>
    </View>
  )
}
