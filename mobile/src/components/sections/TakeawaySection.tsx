import { Text, View } from "react-native"
import type { TakeawayContent } from "../../types/post"
import { SectionBlock, Prose, SvgFigure } from "./primitives"
import { fonts, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/TakeawaySection.tsx
// framework framing: accent card; question framing: large centered accent
// text. Optional SVG below, colored with the accent (web color="inherit").
export default function TakeawaySection({
  content,
  isUserContent,
}: {
  content: TakeawayContent
  isUserContent: boolean
}) {
  const accent = useAccent()

  if (content.framing === "framework") {
    return (
      <SectionBlock>
        <View
          style={{
            backgroundColor: accent + "1a",
            borderWidth: 1,
            borderColor: accent + "66",
            borderRadius: radius.card,
            paddingHorizontal: 20,
            paddingVertical: 20,
          }}
        >
          <Prose ink medium>
            {content.body}
          </Prose>
          {content.visual_svg ? (
            <SvgFigure
              svg={content.visual_svg}
              isUserContent={isUserContent}
              color={accent}
              style={{ marginTop: 16 }}
            />
          ) : null}
        </View>
      </SectionBlock>
    )
  }

  return (
    <SectionBlock>
      <Text
        style={{
          fontFamily: fonts.serifMedium,
          fontSize: 20,
          lineHeight: 27,
          color: accent,
          textAlign: "center",
        }}
      >
        {unescapeDollar(content.body)}
      </Text>
      {content.visual_svg ? (
        <SvgFigure
          svg={content.visual_svg}
          isUserContent={isUserContent}
          color={accent}
          style={{ marginTop: 16 }}
        />
      ) : null}
    </SectionBlock>
  )
}
