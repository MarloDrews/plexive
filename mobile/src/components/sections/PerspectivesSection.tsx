import { Text, View } from "react-native"
import type { PerspectiveItem } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, sans, sansSemiBold } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/PerspectivesSection.tsx
// Positions with accent title, prose body, and an accent-bordered block for
// strongest argument + concrete example.
export default function PerspectivesSection({ content }: { content: PerspectiveItem[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={40}>
      <SectionLabel style={{ marginBottom: -24 }}>Perspectives</SectionLabel>
      {content.map((p, i) => (
        <View key={i} style={{ gap: 12 }}>
          <View>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 17, lineHeight: 23, color: accent }}>
              {unescapeDollar(p.position_name)}
            </Text>
            <Text style={[sans(12, colors["ink-muted"]), { marginTop: 2 }]}>{unescapeDollar(p.school_or_thinker)}</Text>
          </View>
          <Prose>{p.body}</Prose>
          <View style={{ borderLeftWidth: 2, borderLeftColor: accent + "66", paddingLeft: 12, gap: 8 }}>
            <Text style={sans(12, colors["ink-dim"], { lineHeight: 19 })}>
              <Text style={sansSemiBold(12, colors["ink-body"])}>Strongest argument: </Text>
              {unescapeDollar(p.strongest_argument)}
            </Text>
            <Text style={sans(12, colors["ink-muted"], { lineHeight: 19 })}>
              <Text style={sansSemiBold(12, colors["ink-dim"])}>Example: </Text>
              {unescapeDollar(p.concrete_example)}
            </Text>
          </View>
        </View>
      ))}
    </SectionBlock>
  )
}
