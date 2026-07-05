import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, SvgFigure, mono, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/LifeArcSection.tsx
// SVG timeline + milestone list (year in accent mono).

interface Milestone {
  year: string
  label: string
}

interface LifeArcContent {
  visual_svg: string
  milestones: Milestone[]
}

export default function LifeArcSection({
  content,
  isUserContent,
}: {
  content: LifeArcContent
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock>
      <SectionLabel style={{ marginBottom: 16 }}>Life Arc</SectionLabel>
      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} style={{ marginVertical: 8 }} />
      ) : null}
      <View style={{ gap: 8, marginTop: 16 }}>
        {content.milestones.map((m, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Text style={[mono(12, accent), { width: 44, paddingTop: 2 }]}>{unescapeDollar(m.year)}</Text>
            <Text style={[sans(14, colors["ink-dim"], { lineHeight: 20 }), { flex: 1 }]}>{unescapeDollar(m.label)}</Text>
          </View>
        ))}
      </View>
    </SectionBlock>
  )
}
