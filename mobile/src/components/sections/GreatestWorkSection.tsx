import { Text } from "react-native"
import { SectionBlock, SectionLabel, Prose, SvgFigure, CaptionedImage } from "./primitives"
import { fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/GreatestWorkSection.tsx

interface GreatestWorkContent {
  title: string
  body: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export default function GreatestWorkSection({
  content,
  isUserContent,
}: {
  content: GreatestWorkContent
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={12}>
      <SectionLabel>Greatest Work</SectionLabel>
      <Text style={{ fontFamily: fonts.serifMedium, fontSize: 19, lineHeight: 25, color: accent }}>
        {unescapeDollar(content.title)}
      </Text>
      <Prose>{content.body}</Prose>

      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} style={{ marginVertical: 16 }} />
      ) : null}

      {content.image_url ? (
        <CaptionedImage url={content.image_url} caption={content.image_caption} style={{ marginTop: 8 }} />
      ) : null}
    </SectionBlock>
  )
}
