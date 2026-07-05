import { Text, View } from "react-native"
import { colors, fonts } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/EssenceSection.tsx
// Large centered statement, min-height 140.
export default function EssenceSection({ content }: { content: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 40,
        minHeight: 140,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.serifMedium,
          fontSize: 24,
          lineHeight: 32,
          color: colors.ink,
          textAlign: "center",
          maxWidth: 384,
        }}
      >
        {unescapeDollar(content)}
      </Text>
    </View>
  )
}
