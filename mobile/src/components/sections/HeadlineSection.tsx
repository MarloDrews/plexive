import { Text, View } from "react-native"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/HeadlineSection.tsx
// Digit runs (with optional scale words) are highlighted in the accent ink.

const PATTERN = /(\d[\d,.]*(?:\s*(?:billion|million|trillion|thousand))?)/gi

function AccentNumbers({ text, accent }: { text: string; accent: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <Text key={match.index} style={{ color: accent }}>
        {match[0]}
      </Text>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export default function HeadlineSection({ content }: { content: string }) {
  const accent = useAccent()
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 40,
        minHeight: 120,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.serifMedium,
          fontSize: 30,
          lineHeight: 36,
          color: colors.ink,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        <AccentNumbers text={unescapeDollar(content)} accent={accent} />
      </Text>
    </View>
  )
}
