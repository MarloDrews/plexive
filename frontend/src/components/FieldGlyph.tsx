import SvgBlock from "@/components/SvgBlock"
import { FIELD_GLYPHS } from "@/lib/glyphs"

// Large category glyph anchored to the TOP RIGHT of the field-line zone on every
// typographic card (PostCard) and the detail header. It occupies no layout space
// (absolute), so the label and headline do not move; `reach` is a negative-bottom
// inset that bleeds the glyph down toward the headline top. Width follows the
// glyph's own viewBox aspect (landscape ~56x32), capped (max-w) to clear the
// label. The glyph is the post's primary category, its first tag (tags[0]), from
// the app-owned FIELD_GLYPHS set; trusted content, so the official SVG path
// (isUserContent=false). See LAYOUT_STANDARD (s2/s3) and SVG_STANDARD (s6).
export default function FieldGlyph({ slug, reach = "bottom-0" }: { slug: string | undefined; reach?: string }) {
  const svg = slug ? FIELD_GLYPHS[slug] : undefined
  if (!svg) return null
  return (
    <SvgBlock
      svg={svg}
      isUserContent={false}
      className={`pointer-events-none absolute top-0 right-0 ${reach} flex items-center justify-end max-w-[45%] [&_svg]:h-full [&_svg]:w-auto [&_img]:h-full [&_img]:w-auto`}
    />
  )
}
