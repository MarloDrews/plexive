import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, mono, sans } from "./primitives"
import { colors, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/FormalDefinitionSection.tsx
// Body + monospace formula card + notation legend.

interface NotationEntry {
  symbol: string
  meaning: string
}

interface FormalDefinitionContent {
  body: string
  formula?: string
  notation_legend?: NotationEntry[]
}

export default function FormalDefinitionSection({ content }: { content: FormalDefinitionContent }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Formal Definition</SectionLabel>
      <Prose dim>{content.body}</Prose>
      {content.formula ? (
        <View
          style={{
            backgroundColor: colors["surface-1"],
            borderWidth: 1,
            borderColor: colors.edge,
            borderRadius: radius.card,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={mono(14, accent, { letterSpacing: 0.5 })}>{content.formula}</Text>
        </View>
      ) : null}
      {content.notation_legend && content.notation_legend.length > 0 ? (
        <View style={{ gap: 8 }}>
          {content.notation_legend.map((entry, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Text style={[mono(12, accent), { minWidth: 48 }]}>{entry.symbol}</Text>
              <Text style={[sans(12, colors["ink-muted"], { lineHeight: 17 }), { flex: 1 }]}>
                {unescapeDollar(entry.meaning)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </SectionBlock>
  )
}
