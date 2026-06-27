import { Text, View } from "react-native"
import type { FormalismContent } from "../../types/post"
import { SectionBlock, SectionLabel, proseStyle, mono, sans, sansSemiBold } from "./primitives"
import MathText from "../MathText"
import { colors, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/FormalismSection.tsx
// The web renders equations with KaTeX (display mode); React Native has no
// HTML renderer, so equations show as monospace LaTeX source in the same
// card layout. Known fidelity compromise for the academy format.
export default function FormalismSection({ content }: { content: FormalismContent }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={20}>
      <SectionLabel>Formalism</SectionLabel>

      <MathText text={content.body} style={[proseStyle, { color: colors["ink-dim"] }]} />

      <View style={{ gap: 20 }}>
        {content.equations.map((eq, i) => (
          <View key={i} style={{ gap: 8 }}>
            <Text
              style={sansSemiBold(12, accent, { textTransform: "uppercase", letterSpacing: 0.5 })}
            >
              {unescapeDollar(eq.label)}
            </Text>
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
              <Text style={mono(13, colors["ink-body"], { lineHeight: 20 })}>{eq.latex}</Text>
            </View>
            <MathText text={eq.description} style={[proseStyle, { color: colors["ink-dim"] }]} />
          </View>
        ))}
      </View>

      {content.notation_legend.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={sans(12, colors["ink-faint"], { textTransform: "uppercase", letterSpacing: 2 })}
          >
            Notation
          </Text>
          <View>
            {content.notation_legend.map((item, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  gap: 16,
                  paddingVertical: 8,
                  alignItems: "flex-start",
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: colors.edge,
                }}
              >
                <Text style={[mono(13, colors["ink-body"]), { width: 112 }]}>{item.symbol}</Text>
                <Text style={[sans(14, colors["ink-dim"], { lineHeight: 19 }), { flex: 1 }]}>
                  {unescapeDollar(item.meaning)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </SectionBlock>
  )
}
