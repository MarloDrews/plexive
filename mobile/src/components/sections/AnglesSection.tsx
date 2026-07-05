import { Text, View } from "react-native"
import type { AngleItem } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, SvgFigure, CaptionedImage } from "./primitives"
import { fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/AnglesSection.tsx
export default function AnglesSection({
  content,
  isUserContent,
}: {
  content: AngleItem[]
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={32}>
      <SectionLabel>Multiple Angles</SectionLabel>
      {content.map((angle, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.serifMedium, fontSize: 17, lineHeight: 23, color: accent }}>
            {unescapeDollar(angle.title)}
          </Text>
          <Prose>{angle.body}</Prose>
          {angle.visual_svg ? (
            <SvgFigure svg={angle.visual_svg} isUserContent={isUserContent} style={{ marginTop: 8 }} />
          ) : null}
          {angle.image_url && !angle.visual_svg ? (
            <CaptionedImage url={angle.image_url} maxWidth={360} style={{ marginTop: 8 }} />
          ) : null}
        </View>
      ))}
    </SectionBlock>
  )
}
