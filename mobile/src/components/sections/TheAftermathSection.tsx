import { Text, View } from "react-native"
import type { TheAftermathContent } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, SvgFigure, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/TheAftermathSection.tsx
export default function TheAftermathSection({
  content,
  isUserContent,
}: {
  content: TheAftermathContent
  isUserContent: boolean
}) {
  return (
    <SectionBlock gap={16}>
      <SectionLabel>The Aftermath</SectionLabel>
      <Prose>{content.body}</Prose>
      {content.visual_svg ? (
        <View style={{ gap: 4 }}>
          <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} />
          {content.image_caption ? (
            <Text style={[sans(12, colors["ink-muted"], { lineHeight: 17 }), { textAlign: "center" }]}>
              {unescapeDollar(content.image_caption)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </SectionBlock>
  )
}
