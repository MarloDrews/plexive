import { Linking, Pressable, Text, View } from "react-native"
import Svg, { Path } from "react-native-svg"
import type { SourceItem } from "../../types/post"
import { SectionBlock, sans, sansSemiBold } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/SourcesSection.tsx
// Type badge (W/P/B/A/D) + label + external link icon; opens the URL in the
// system browser.

const TYPE_LABELS: Record<string, string> = {
  wikipedia: "W",
  paper: "P",
  book: "B",
  article: "A",
  database: "D",
}

function ExternalLinkIcon() {
  return (
    <Svg viewBox="0 0 16 16" width={12} height={12}>
      <Path
        d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10"
        stroke={colors["ink-dim"]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

export default function SourcesSection({ content }: { content: SourceItem[] }) {
  return (
    <SectionBlock gap={8}>
      {content.map((source, i) => (
        <Pressable
          key={i}
          onPress={() => Linking.openURL(source.url).catch(() => {})}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors["surface-2"],
              borderWidth: 1,
              borderColor: colors["edge-strong"],
            }}
          >
            <Text style={sansSemiBold(10, colors["ink-dim"])}>{TYPE_LABELS[source.type] ?? "?"}</Text>
          </View>
          <Text style={[sans(14, colors["ink-dim"], { lineHeight: 19 }), { flex: 1 }]}>{unescapeDollar(source.label)}</Text>
          <ExternalLinkIcon />
        </Pressable>
      ))}
    </SectionBlock>
  )
}
