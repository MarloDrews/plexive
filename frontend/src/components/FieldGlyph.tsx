import { useEffect, useState } from "react"
import SvgBlock from "@/components/SvgBlock"

// The FIELD_GLYPHS record is ~88 KB of inline SVG strings and a session uses
// only a handful of slugs, so the module loads lazily as its own chunk instead
// of riding in the chunk of every route that renders cards. One module-level
// promise loads it at most once; until it lands the glyph renders nothing,
// which shifts no layout because the glyph is an absolute overlay.
let glyphs: Record<string, string> | null = null
let glyphsPromise: Promise<Record<string, string>> | null = null

function loadGlyphs(): Promise<Record<string, string>> {
  if (!glyphsPromise) {
    glyphsPromise = import("@/lib/glyphs").then((m) => {
      glyphs = m.FIELD_GLYPHS
      return m.FIELD_GLYPHS
    })
  }
  return glyphsPromise
}

// Category glyph for the post's primary category (its first tag, tags[0]), from
// the app-owned FIELD_GLYPHS set; trusted content, so the official SVG path
// (isUserContent=false). Two variants:
//   overlay (default) — large glyph anchored to the TOP RIGHT of the field-line
//     zone on the detail header. Occupies no layout space (absolute), so the
//     label and headline do not move; `reach` is a negative-bottom inset that
//     bleeds it toward the headline top. See LAYOUT_STANDARD (s2/s3), SVG (s6).
//   inline — centered, contained glyph sized to fill a small square/circle (the
//     PostCard feed marker), so it flows in normal layout rather than overlaying.
export default function FieldGlyph({
  slug,
  reach = "bottom-0",
  variant = "overlay",
}: {
  slug: string | undefined
  reach?: string
  variant?: "overlay" | "inline"
}) {
  const [record, setRecord] = useState(glyphs)
  useEffect(() => {
    if (record || !slug) return
    let alive = true
    loadGlyphs().then((g) => {
      if (alive) setRecord(g)
    })
    return () => {
      alive = false
    }
  }, [record, slug])

  const svg = slug ? record?.[slug] : undefined
  if (!svg) return null
  return (
    <SvgBlock
      svg={svg}
      isUserContent={false}
      className={
        variant === "inline"
          ? "pointer-events-none w-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-auto [&_img]:w-full [&_img]:h-auto"
          : `pointer-events-none absolute top-0 right-0 ${reach} flex items-center justify-end max-w-[45%] [&_svg]:h-full [&_svg]:w-auto [&_img]:h-full [&_img]:w-auto`
      }
    />
  )
}
