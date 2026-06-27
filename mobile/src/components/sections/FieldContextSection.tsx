import { Text, View } from "react-native"
import type { FieldContextContent } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, sans, sansSemiBold } from "./primitives"
import { colors } from "../../theme/tokens"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/FieldContextSection.tsx
// Body + "Key prior work" list with left-bordered citation entries.
export default function FieldContextSection({ content }: { content: FieldContextContent }) {
  return (
    <SectionBlock gap={16}>
      <SectionLabel>Field Context</SectionLabel>
      <Prose dim>{content.body}</Prose>
      {content.key_priors.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text
            style={sans(12, colors["ink-faint"], { textTransform: "uppercase", letterSpacing: 2 })}
          >
            Key prior work
          </Text>
          {content.key_priors.map((prior, i) => (
            <View
              key={i}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: colors["edge-strong"],
                paddingLeft: 12,
                gap: 2,
              }}
            >
              <Text style={sansSemiBold(12, colors["ink-muted"])}>{unescapeDollar(prior.citation)}</Text>
              <Text style={sans(14, colors["ink-body"], { lineHeight: 19 })}>{unescapeDollar(prior.claim)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </SectionBlock>
  )
}
