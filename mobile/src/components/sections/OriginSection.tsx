import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, sans, sansSemiBold } from "./primitives"
import { colors, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/OriginSection.tsx
// History body + key thinker cards.

interface KeyThinker {
  name: string
  role: string
  one_line: string
}

interface OriginContent {
  body: string
  key_thinkers?: KeyThinker[]
}

export default function OriginSection({ content }: { content: OriginContent }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Origin</SectionLabel>
      <Prose dim>{content.body}</Prose>
      {content.key_thinkers && content.key_thinkers.length > 0 ? (
        <View style={{ gap: 8 }}>
          {content.key_thinkers.map((thinker, i) => (
            <View
              key={i}
              style={{
                gap: 2,
                borderWidth: 1,
                borderColor: colors.edge,
                borderRadius: radius.card,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
                <Text style={sansSemiBold(14, colors.ink)}>{unescapeDollar(thinker.name)}</Text>
                <Text style={sans(12, accent + "cc")}>{unescapeDollar(thinker.role)}</Text>
              </View>
              <Text style={sans(12, colors["ink-muted"], { lineHeight: 17 })}>{unescapeDollar(thinker.one_line)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </SectionBlock>
  )
}
