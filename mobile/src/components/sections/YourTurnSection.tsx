import { Text, View } from "react-native"
import type { YourTurnContent } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, NumberBubble } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/YourTurnSection.tsx
// Intro + numbered reflection prompts + italic closing thought.
export default function YourTurnSection({ content }: { content: YourTurnContent }) {
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Your Turn</SectionLabel>
      <Prose dim>{content.intro}</Prose>
      <View style={{ gap: 12 }}>
        {content.prompts.map((prompt, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <NumberBubble n={i + 1} size={20} />
            <Prose style={{ flex: 1 }}>{prompt}</Prose>
          </View>
        ))}
      </View>
      {content.closing_thought ? (
        <Text
          style={{
            fontFamily: fonts.serifItalic,
            fontSize: 13,
            lineHeight: 20,
            color: colors["ink-muted"],
            borderTopWidth: 1,
            borderTopColor: colors.edge,
            paddingTop: 12,
          }}
        >
          {unescapeDollar(content.closing_thought)}
        </Text>
      ) : null}
    </SectionBlock>
  )
}
