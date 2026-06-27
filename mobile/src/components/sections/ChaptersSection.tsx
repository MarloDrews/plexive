import { Text, View } from "react-native"
import type { StoryChapter } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, CaptionedImage } from "./primitives"
import { fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/ChaptersSection.tsx
export default function ChaptersSection({ content }: { content: StoryChapter[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={40}>
      <SectionLabel style={{ marginBottom: -24 }}>Chapters</SectionLabel>
      {content.map((chapter, i) => (
        <View key={i} style={{ gap: 12 }}>
          <Text style={{ fontFamily: fonts.serifMedium, fontSize: 17, lineHeight: 23, color: accent }}>
            {unescapeDollar(chapter.title)}
          </Text>
          <Prose>{chapter.body}</Prose>
          {chapter.image_url ? (
            <CaptionedImage
              url={chapter.image_url}
              caption={chapter.image_caption}
              attribution={chapter.image_attribution}
              height={230}
            />
          ) : null}
        </View>
      ))}
    </SectionBlock>
  )
}
