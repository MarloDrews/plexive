import { Text, View } from "react-native"
import type { KeyNumberItem } from "../../types/post"
import { SectionBlock, sans } from "./primitives"
import { colors, fonts, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/KeyNumbersSection.tsx
// Two-column grid of stat tiles, value in the accent ink.
export default function KeyNumbersSection({ content }: { content: KeyNumberItem[] }) {
  const accent = useAccent()
  return (
    <SectionBlock>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {content.map((item, i) => (
          <View
            key={i}
            style={{
              flexBasis: "47%",
              flexGrow: 1,
              backgroundColor: colors["surface-2"],
              borderWidth: 1,
              borderColor: colors["edge-strong"],
              borderRadius: radius.field,
              paddingHorizontal: 16,
              paddingVertical: 16,
              gap: 4,
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 20, lineHeight: 22, color: accent }}>
              {unescapeDollar(item.value)}
            </Text>
            {item.unit ? <Text style={sans(12, accent + "b3", { lineHeight: 13 })}>{unescapeDollar(item.unit)}</Text> : null}
            <Text style={[sans(12, colors["ink-dim"], { lineHeight: 17 }), { marginTop: 4 }]}>{unescapeDollar(item.label)}</Text>
          </View>
        ))}
      </View>
    </SectionBlock>
  )
}
