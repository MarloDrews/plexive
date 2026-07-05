import { Text } from "react-native"
import type { SeeItContent } from "../../types/post"
import { SectionBlock, SectionLabel, SvgFigure, CaptionedImage, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/SeeItSection.tsx
export default function SeeItSection({
  content,
  isUserContent,
}: {
  content: SeeItContent
  isUserContent: boolean
}) {
  return (
    <SectionBlock gap={12}>
      <SectionLabel>See It</SectionLabel>
      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} />
      ) : null}
      {content.image_url && !content.visual_svg ? (
        <CaptionedImage url={content.image_url} maxWidth={360} />
      ) : null}
      {content.image_caption ? (
        <Text style={[sans(12, colors["ink-muted"], { lineHeight: 19 }), { textAlign: "center" }]}>
          {unescapeDollar(content.image_caption)}
        </Text>
      ) : null}
      {content.image_attribution ? (
        <Text style={[sans(10, colors["ink-faint"]), { textAlign: "center" }]}>
          {unescapeDollar(content.image_attribution)}
        </Text>
      ) : null}
    </SectionBlock>
  )
}
