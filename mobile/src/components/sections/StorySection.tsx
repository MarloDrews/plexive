import { Text, View } from "react-native"
import { Image } from "expo-image"
import type { StoryContent } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, SvgFigure, CaptionedImage, sans, sansSemiBold } from "./primitives"
import { colors, radius } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { resolveImageUrl } from "../../config"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/StorySection.tsx
// Body prose, optional SVG/image, key-figure cards.
export default function StorySection({
  content,
  isUserContent,
}: {
  content: StoryContent
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={20}>
      <SectionLabel>The Story Behind It</SectionLabel>
      <Prose>{content.body}</Prose>

      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} />
      ) : null}
      {content.image_url && !content.visual_svg ? (
        <CaptionedImage url={content.image_url} maxWidth={360} />
      ) : null}

      {content.key_figures && content.key_figures.length > 0 ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          {content.key_figures.map((fig, i) => (
            <View
              key={i}
              style={{
                backgroundColor: colors["surface-2"],
                borderWidth: 1,
                borderColor: colors["edge-strong"],
                borderRadius: radius.field,
                paddingHorizontal: 16,
                paddingVertical: 16,
                flexDirection: "row",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              {fig.image_url ? (
                <Image
                  source={{ uri: resolveImageUrl(fig.image_url) }}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors["surface-2"] }}
                  contentFit="cover"
                />
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <Text style={sansSemiBold(14, colors.ink)}>{unescapeDollar(fig.name)}</Text>
                  {fig.lifespan ? <Text style={sans(12, colors["ink-muted"])}>{unescapeDollar(fig.lifespan)}</Text> : null}
                </View>
                <Text style={sans(12, accent + "b3")}>{unescapeDollar(fig.role)}</Text>
                {fig.one_line ? (
                  <Text style={[sans(12, colors["ink-dim"], { lineHeight: 18 }), { marginTop: 4 }]}>
                    {unescapeDollar(fig.one_line)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </SectionBlock>
  )
}
