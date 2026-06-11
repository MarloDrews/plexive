// Shared renderer for visual_svg fields in post sections.
//
// SECURITY: user-submitted SVGs (isUserContent=true) MUST render as a base64
// <img> data URL — JavaScript cannot execute in an image context. Only
// seed/official SVGs (controlled content pipeline) may use
// dangerouslySetInnerHTML. Never relax this rule.

import { LEGACY_SVG_ACCENT_MAP } from "@/lib/formats"

interface Props {
  svg: string
  isUserContent: boolean
  // Wrapper classes; callers pass their layout (max-width, margins).
  className?: string
  // currentColor for stroke-based seed SVGs.
  color?: string
}

// btoa alone throws on non-ASCII characters; round-trip through UTF-8 bytes.
function toBase64Utf8(svg: string): string {
  return btoa(unescape(encodeURIComponent(svg)))
}

// Seed SVGs were authored against the pre-redesign accent hexes. Rewrite
// them to the Lamplight format inks at render time so visuals match the
// identity without editing content JSON (styling only, meaning untouched).
function repaletteSvg(svg: string): string {
  let out = svg
  for (const [legacy, ink] of Object.entries(LEGACY_SVG_ACCENT_MAP)) {
    out = out.split(legacy).join(ink)
  }
  return out
}

export default function SvgBlock({ svg, isUserContent, className = "w-full", color = "#c4c8e0" }: Props) {
  const themed = repaletteSvg(svg)
  if (isUserContent) {
    return (
      <div className={className}>
        <img src={`data:image/svg+xml;base64,${toBase64Utf8(themed)}`} alt="" className="w-full" />
      </div>
    )
  }
  return (
    <div
      className={className}
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: themed }}
    />
  )
}
