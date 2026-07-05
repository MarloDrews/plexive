import { Linking, Pressable, Text, View } from "react-native"
import { Image } from "expo-image"
import Svg, { Path } from "react-native-svg"
import type { AuthorContextContent } from "../../types/post"
import { SectionBlock, Prose, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"
import { resolveImageUrl } from "../../config"

// Port of frontend/src/components/sections/AuthorContextSection.tsx
// Round portrait + prose + Wikipedia external link.
export default function AuthorContextSection({ content }: { content: AuthorContextContent }) {
  const accent = useAccent()
  return (
    <SectionBlock>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
        {content.image_url ? (
          <View style={{ alignItems: "center", width: 64 }}>
            <Image
              source={{ uri: resolveImageUrl(content.image_url) }}
              style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors["surface-3"] }}
              contentFit="cover"
            />
            {content.image_attribution ? (
              <Text style={[sans(11, colors["ink-faint"]), { marginTop: 4, textAlign: "center" }]}>
                {unescapeDollar(content.image_attribution)}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 8 }}>
          <Prose dim>{content.body}</Prose>
          {content.wikipedia_url ? (
            <Pressable
              onPress={() => Linking.openURL(content.wikipedia_url!).catch(() => {})}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text style={sans(12, accent)}>Wikipedia</Text>
              <Svg viewBox="0 0 16 16" width={12} height={12}>
                <Path
                  d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10"
                  stroke={accent}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SectionBlock>
  )
}
