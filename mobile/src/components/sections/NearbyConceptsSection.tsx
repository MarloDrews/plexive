import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, sansSemiBold } from "./primitives"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/NearbyConceptsSection.tsx

interface NearbyConceptItem {
  concept: string
  distinction: string
}

export default function NearbyConceptsSection({ content }: { content: NearbyConceptItem[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Nearby Concepts</SectionLabel>
      <View style={{ gap: 16 }}>
        {content.map((item, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Text style={sansSemiBold(14, accent)}>{unescapeDollar(item.concept)}</Text>
            <Prose dim>{item.distinction}</Prose>
          </View>
        ))}
      </View>
    </SectionBlock>
  )
}
