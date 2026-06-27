import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, sansSemiBold } from "./primitives"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/RealWorldExamplesSection.tsx
// Title + accent uppercase domain tag + dim prose body per example.

interface Example {
  title: string
  domain: string
  body: string
}

export default function RealWorldExamplesSection({ content }: { content: Example[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={32}>
      <SectionLabel style={{ marginBottom: -16 }}>Real-World Examples</SectionLabel>
      {content.map((example, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View>
            <Text style={sansSemiBold(14, colors.ink, { lineHeight: 19 })}>{unescapeDollar(example.title)}</Text>
            <Text
              style={{
                fontFamily: fonts.sansSemiBold,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: accent + "cc",
                marginTop: 2,
              }}
            >
              {unescapeDollar(example.domain)}
            </Text>
          </View>
          <Prose dim>{example.body}</Prose>
        </View>
      ))}
    </SectionBlock>
  )
}
