import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, SvgFigure, CaptionedImage, mono, sans } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/DefiningMomentsSection.tsx
// Chronological episodes: accent mono year + location, title, prose, media.

interface Episode {
  title: string
  year_or_period: string
  body: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
  visual_svg?: string
  location?: string
}

export default function DefiningMomentsSection({
  content,
  isUserContent,
}: {
  content: Episode[]
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={40}>
      <SectionLabel style={{ marginBottom: -24 }}>Defining Moments</SectionLabel>
      {content.map((episode, i) => (
        <View key={i} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <Text style={mono(12, accent)}>{unescapeDollar(episode.year_or_period)}</Text>
            {episode.location ? <Text style={sans(12, colors["ink-faint"])}>{unescapeDollar(episode.location)}</Text> : null}
          </View>
          <Text style={{ fontFamily: fonts.serifMedium, fontSize: 19, lineHeight: 25, color: colors.ink }}>
            {unescapeDollar(episode.title)}
          </Text>
          <Prose>{episode.body}</Prose>

          {episode.visual_svg && episode.visual_svg.length > 0 ? (
            <SvgFigure svg={episode.visual_svg} isUserContent={isUserContent} maxWidth={400} style={{ marginVertical: 12 }} />
          ) : null}

          {episode.image_url ? (
            <CaptionedImage
              url={episode.image_url}
              caption={episode.image_caption}
              attribution={episode.image_attribution}
              height={240}
            />
          ) : null}
        </View>
      ))}
    </SectionBlock>
  )
}
