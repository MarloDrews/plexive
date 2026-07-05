import { Text, View } from "react-native"
import type { WhatScienceSaysContent } from "../../types/post"
import { SectionBlock, SectionLabel, Prose, SvgFigure, sans } from "./primitives"
import { colors } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { unescapeDollar } from "../../lib/prose"

// Port of frontend/src/components/sections/WhatScienceSaysSection.tsx
// Body prose + arrow bullet list of key findings + optional SVG.
export default function WhatScienceSaysSection({
  content,
  isUserContent,
}: {
  content: WhatScienceSaysContent
  isUserContent: boolean
}) {
  const accent = useAccent()
  return (
    <SectionBlock gap={16}>
      <SectionLabel>What Science Says</SectionLabel>
      <Prose>{content.body}</Prose>
      {content.key_findings && content.key_findings.length > 0 ? (
        <View style={{ gap: 8 }}>
          {content.key_findings.map((finding, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={[sans(14, accent), { paddingTop: 2 }]}>{"→"}</Text>
              <Text style={[sans(14, colors["ink-dim"], { lineHeight: 20 }), { flex: 1 }]}>{unescapeDollar(finding)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {content.visual_svg ? (
        <SvgFigure svg={content.visual_svg} isUserContent={isUserContent} maxWidth={400} style={{ marginTop: 8 }} />
      ) : null}
    </SectionBlock>
  )
}
