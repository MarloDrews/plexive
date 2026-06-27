import { Text, View } from "react-native"
import type { VoiceItem } from "../../types/post"
import { SectionBlock } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/VoicesSection.tsx
// Blockquotes with serif quote and italic attribution footer.
export default function VoicesSection({ content }: { content: VoiceItem[] }) {
  return (
    <SectionBlock gap={20}>
      {content.map((voice, i) => (
        <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: colors["edge-strong"], paddingLeft: 16 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 29, color: colors.ink }}>
            {"“"}{unescapeDollar(voice.quote)}{"”"}
          </Text>
          <Text
            style={{
              fontFamily: fonts.serifItalic,
              fontSize: 14,
              lineHeight: 20,
              color: colors["ink-dim"],
              marginTop: 8,
            }}
          >
            {"—"} {unescapeDollar(voice.attribution)}
          </Text>
        </View>
      ))}
    </SectionBlock>
  )
}
