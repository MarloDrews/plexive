import { Text, View } from "react-native"
import type { MisconceptionItem } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, sans, sansSemiBold } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/MisconceptionsSection.tsx
// Per item: struck-through myth with a red cross, reality with a green check.
export default function MisconceptionsSection({ content }: { content: MisconceptionItem[] }) {
  return (
    <SectionBlock>
      <SectionLabel style={{ marginBottom: 16 }}>Common Misconceptions</SectionLabel>
      <View style={{ gap: 16 }}>
        {content.map((item, i) => (
          <View key={i} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={[sansSemiBold(12, colors.bad), { paddingTop: 2 }]}>{"✕"}</Text>
              <Text
                style={[
                  sans(14, colors["ink-muted"], { lineHeight: 22 }),
                  { flex: 1, textDecorationLine: "line-through" },
                ]}
              >
                {unescapeDollar(item.myth)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={[sansSemiBold(12, colors.good), { paddingTop: 2 }]}>{"✓"}</Text>
              <Prose style={{ flex: 1 }}>{item.reality}</Prose>
            </View>
          </View>
        ))}
      </View>
    </SectionBlock>
  )
}
