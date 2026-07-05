import { Text, View } from "react-native"
import { SectionBlock, SectionLabel, Prose, NumberBubble, sansSemiBold } from "./primitives"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/HowItWorksSection.tsx
// Numbered steps with accent ring number, accent title, dim prose body.

interface Step {
  step_number: number
  title: string
  body: string
}

export default function HowItWorksSection({ content }: { content: Step[] }) {
  const accent = useAccent()
  return (
    <SectionBlock gap={32}>
      <SectionLabel style={{ marginBottom: -16 }}>How It Works</SectionLabel>
      {content.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 16 }}>
          <NumberBubble n={step.step_number} size={24} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={sansSemiBold(14, accent, { lineHeight: 19 })}>{unescapeDollar(step.title)}</Text>
            <Prose dim>{step.body}</Prose>
          </View>
        </View>
      ))}
    </SectionBlock>
  )
}
