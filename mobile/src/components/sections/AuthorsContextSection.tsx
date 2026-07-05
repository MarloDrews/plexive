import { Text, View } from "react-native"
import type { AuthorsContextItem } from "../../types/post"
import { SectionBlock, SectionLabel, sans, sansSemiBold } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/AuthorsContextSection.tsx
export default function AuthorsContextSection({ content }: { content: AuthorsContextItem[] }) {
  return (
    <SectionBlock gap={16}>
      <SectionLabel>{content.length === 1 ? "Author" : "Authors"}</SectionLabel>
      {content.map((author, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Text style={sansSemiBold(14, colors.ink)}>{unescapeDollar(author.name)}</Text>
          <Text style={sans(12, colors["ink-muted"])}>{unescapeDollar(author.role)}</Text>
          <Text style={sans(14, colors["ink-dim"], { lineHeight: 19 })}>{unescapeDollar(author.one_line)}</Text>
          {author.affiliation ? (
            <Text style={sans(12, colors["ink-faint"])}>{unescapeDollar(author.affiliation)}</Text>
          ) : null}
        </View>
      ))}
    </SectionBlock>
  )
}
