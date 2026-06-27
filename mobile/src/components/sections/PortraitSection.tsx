import { Text, View, useWindowDimensions } from "react-native"
import { Image } from "expo-image"
import { sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { resolveImageUrl } from "../../config"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/PortraitSection.tsx
// Full-bleed portrait (no section padding), caption block below.

interface PortraitContent {
  image_url: string
  image_caption?: string
  image_attribution?: string
}

export default function PortraitSection({ content }: { content: PortraitContent }) {
  const { width } = useWindowDimensions()
  return (
    <View>
      <Image
        source={{ uri: resolveImageUrl(content.image_url) }}
        style={{ width, height: Math.min(420, width * 1.1), backgroundColor: colors["surface-2"] }}
        contentFit="cover"
        transition={150}
      />
      {content.image_caption ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={sans(14, colors["ink-dim"], { lineHeight: 19 })}>{unescapeDollar(content.image_caption)}</Text>
          {content.image_attribution ? (
            <Text style={[sans(12, colors["ink-faint"]), { marginTop: 4 }]}>{unescapeDollar(content.image_attribution)}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
