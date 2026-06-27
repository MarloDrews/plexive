import { Text, View } from "react-native"
import type { CastMember } from "../../types/post"
import { SectionBlock, SectionLabel, sans, sansSemiBold } from "./primitives"
import { colors, fonts, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/CastSection.tsx
// Character cards: name + lifespan, accent uppercase role, one-liner.
export default function CastSection({ content }: { content: CastMember[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Cast</SectionLabel>
      <View style={{ gap: 12 }}>
        {content.map((member, i) => (
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
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <Text style={sansSemiBold(14, colors.ink)}>{unescapeDollar(member.name)}</Text>
              <Text style={sans(12, colors["ink-muted"])}>{unescapeDollar(member.lifespan)}</Text>
            </View>
            <Text
              style={{
                fontFamily: fonts.sansSemiBold,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: accent + "cc",
              }}
            >
              {unescapeDollar(member.role)}
            </Text>
            <Text style={[sans(14, colors["ink-dim"], { lineHeight: 19 }), { marginTop: 4 }]}>
              {unescapeDollar(member.one_line)}
            </Text>
          </View>
        ))}
      </View>
    </SectionBlock>
  )
}
