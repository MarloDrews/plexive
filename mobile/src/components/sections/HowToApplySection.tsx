import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, SvgFigure, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/HowToApplySection.tsx
// Body + checkbox-styled list + optional SVG.

interface HowToApplyContent {
  body: string
  checklist?: string[]
  visual_svg?: string
}

export default function HowToApplySection({
  content,
  isUserContent,
}: {
  content: HowToApplyContent
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>How to Apply It</SectionLabel>
      <Prose dim>{content.body}</Prose>
      {content.checklist && content.checklist.length > 0 ? (
        <View style={{ gap: 8 }}>
          {content.checklist.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: accent + "66",
                  marginTop: 2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: accent + "80" }} />
              </View>
              <Text style={[sans(14, colors["ink-body"], { lineHeight: 20 }), { flex: 1 }]}>{unescapeDollar(item)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} style={{ marginTop: 8 }} />
      ) : null}
    </SectionBlock>
  )
}
