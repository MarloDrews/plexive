import { Text } from "react-native"
import { SectionBlock, SectionLabel, SvgFigure, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/VisualExplanationSection.tsx

interface VisualExplanationContent {
  visual_svg: string
  image_caption?: string
}

export default function VisualExplanationSection({
  content,
  isUserContent,
}: {
  content: VisualExplanationContent
  isUserContent: boolean
}) {
  return (
    <SectionBlock gap={12}>
      <SectionLabel>Visual Explanation</SectionLabel>
      <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} />
      {content.image_caption ? (
        <Text style={[sans(12, colors["ink-muted"], { lineHeight: 17 }), { textAlign: "center" }]}>
          {unescapeDollar(content.image_caption)}
        </Text>
      ) : null}
    </SectionBlock>
  )
}
