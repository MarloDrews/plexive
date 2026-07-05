import type { ReactNode } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Image } from "expo-image"
import { colors, fonts } from "../../theme/tokens"
import { useAccent } from "../../lib/accent"
import { resolveImageUrl } from "../../config"
import { unescapeDollar } from "../../lib/prose"
import SafeSvg from "../SafeSvg"

// Shared building blocks for the ported web section components. On the web
// these are Tailwind utilities (.prose-post, .label-caps, the px-6 py-8
// wrapper); here they are plain components and style constants so each
// section file stays as close to its web counterpart as RN allows.

export const SECTION_PADDING_H = 24
export const SECTION_PADDING_V = 32

// px-6 py-8 section wrapper.
export function SectionBlock({
  children,
  gap,
  style,
}: {
  children: ReactNode
  gap?: number
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View
      style={[
        { paddingHorizontal: SECTION_PADDING_H, paddingVertical: SECTION_PADDING_V },
        gap !== undefined ? { gap } : null,
        style,
      ]}
    >
      {children}
    </View>
  )
}

// .label-caps — tiny uppercase tracked editorial section header.
export function SectionLabel({
  children,
  color,
  style,
}: {
  children: ReactNode
  color?: string
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.sansSemiBold,
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: color ?? colors["ink-muted"],
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

// .prose-post — the 17px/1.7 serif reading voice.
export const proseStyle: TextStyle = {
  fontFamily: fonts.serif,
  fontSize: 17,
  lineHeight: 29,
  color: colors["ink-body"],
}

// Single funnel for plain-prose body text: unescapes a literal "\$" (currency)
// in string children so the "always write \$" content rule is safe on the
// non-math prose paths. Element children (e.g. <MathText/>) pass through, so
// math behavior is never touched.
function unescapeNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return unescapeDollar(node)
  if (Array.isArray(node)) return node.map(unescapeNode)
  return node
}

export function Prose({
  children,
  dim,
  ink,
  medium,
  style,
}: {
  children: ReactNode
  dim?: boolean // text-ink-dim
  ink?: boolean // text-ink
  medium?: boolean // font-medium
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text
      style={[
        proseStyle,
        dim ? { color: colors["ink-dim"] } : null,
        ink ? { color: colors.ink } : null,
        medium ? { fontFamily: fonts.serifMedium } : null,
        style,
      ]}
    >
      {unescapeNode(children)}
    </Text>
  )
}

// Quick TextStyle builders for the web's text-xs/text-sm sans/mono spans.
export function sans(size: number, color: string, extra?: TextStyle): TextStyle {
  return { fontFamily: fonts.sans, fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra }
}

export function sansSemiBold(size: number, color: string, extra?: TextStyle): TextStyle {
  return { fontFamily: fonts.sansSemiBold, fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra }
}

export function mono(size: number, color: string, extra?: TextStyle): TextStyle {
  return { fontFamily: fonts.mono, fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra }
}

// Web SVG blocks size themselves via CSS (width 100%, intrinsic aspect ratio
// from the viewBox). react-native-svg needs explicit numbers, so the aspect
// ratio is read out of the SVG markup: viewBox first, width/height
// attributes as fallback, 16:9 as last resort.
function svgAspect(svg: string): number {
  const vb = svg.match(
    /viewBox\s*=\s*["']\s*[\d.eE+-]+[\s,]+[\d.eE+-]+[\s,]+([\d.eE+-]+)[\s,]+([\d.eE+-]+)/
  )
  if (vb) {
    const w = parseFloat(vb[1])
    const h = parseFloat(vb[2])
    if (w > 0 && h > 0) return w / h
  }
  const wAttr = svg.match(/<svg[^>]*?\swidth\s*=\s*["']?([\d.]+)/)
  const hAttr = svg.match(/<svg[^>]*?\sheight\s*=\s*["']?([\d.]+)/)
  if (wAttr && hAttr) {
    const w = parseFloat(wAttr[1])
    const h = parseFloat(hAttr[1])
    if (w > 0 && h > 0) return w / h
  }
  return 16 / 9
}

// Counterpart of the web's `<SvgBlock className="max-w-[360px] mx-auto" />`
// pattern: centered, capped width, height derived from the SVG's own aspect.
// The seed-vs-user security rule lives in SafeSvg.
export function SvgFigure({
  svg,
  isUserContent,
  maxWidth = 360,
  color,
  style,
}: {
  svg: string
  isUserContent: boolean
  maxWidth?: number
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  const { width: screenWidth } = useWindowDimensions()
  const width = Math.min(maxWidth, screenWidth - SECTION_PADDING_H * 2)
  const height = width / svgAspect(svg)
  return (
    <View style={[{ alignSelf: "center" }, style]}>
      <SafeSvg svg={svg} isUserContent={isUserContent} width={width} height={height} color={color} />
    </View>
  )
}

// Section image with optional caption/attribution lines. Web images size to
// their intrinsic ratio under a max-height; RN needs a concrete height, so
// a fixed height with cover-fit is the closest stable equivalent.
export function CaptionedImage({
  url,
  caption,
  attribution,
  height = 220,
  maxWidth,
  rounded = true,
  centerCaption,
  style,
}: {
  url: string
  caption?: string
  attribution?: string
  height?: number
  maxWidth?: number
  rounded?: boolean
  centerCaption?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { width: screenWidth } = useWindowDimensions()
  const containerWidth = screenWidth - SECTION_PADDING_H * 2
  const width = maxWidth !== undefined ? Math.min(maxWidth, containerWidth) : containerWidth
  const align = { textAlign: (centerCaption ? "center" : "left") as "center" | "left" }
  return (
    <View style={[{ gap: 4, alignSelf: maxWidth !== undefined ? "center" : "stretch" }, style]}>
      <Image
        source={{ uri: resolveImageUrl(url) }}
        style={{
          width,
          height,
          borderRadius: rounded ? 8 : 0,
          backgroundColor: colors["surface-2"],
        }}
        contentFit="cover"
        transition={150}
      />
      {caption ? <Text style={[sans(12, colors["ink-muted"]), align]}>{unescapeDollar(caption)}</Text> : null}
      {attribution ? <Text style={[sans(12, colors["ink-faint"]), align]}>{unescapeDollar(attribution)}</Text> : null}
    </View>
  )
}

// Factory for the many web sections that are exactly "SectionLabel + one
// prose paragraph" (IntuitionSection, SetupSection, CritiqueSection, ...).
// Each ported file stays one line: export default makeLabeledProse("Setup", { dim: true })
export function makeLabeledProse(
  label: string | null,
  opts: { dim?: boolean; ink?: boolean; medium?: boolean } = {}
) {
  return function LabeledProseSection({ content }: { content: string }) {
    return (
      <SectionBlock>
        {label !== null && <SectionLabel style={{ marginBottom: 12 }}>{label}</SectionLabel>}
        <Prose dim={opts.dim} ink={opts.ink} medium={opts.medium}>
          {content}
        </Prose>
      </SectionBlock>
    )
  }
}

// Numbered circle used by HowItWorks / YourTurn lists (accent-tinted ring).
export function NumberBubble({ n, size = 22 }: { n: number | string; size?: number }) {
  const accent = useAccent()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: accent + "26",
        borderWidth: 1,
        borderColor: accent + "66",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: accent }}>{n}</Text>
    </View>
  )
}
