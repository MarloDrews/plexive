// Shared renderer for visual_svg fields in post sections.
//
// SECURITY: user-submitted SVGs (isUserContent=true) MUST render as a base64
// <img> data URL — JavaScript cannot execute in an image context. Only
// seed/official SVGs (controlled content pipeline) may use
// dangerouslySetInnerHTML. Never relax this rule.

import { useMemo } from "react"
import { LEGACY_SVG_ACCENT_MAP } from "@/lib/formats"
import { toBase64Utf8 } from "@/lib/svg"

interface Props {
  svg: string
  isUserContent: boolean
  // Wrapper classes; callers pass their layout (max-width, margins).
  className?: string
  // currentColor for stroke-based seed SVGs.
  color?: string
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

function containsLegacyHex(svg: string): boolean {
  for (const legacy of Object.keys(LEGACY_SVG_ACCENT_MAP)) {
    if (svg.includes(legacy)) return true
  }
  return false
}

export default function SvgBlock({ svg, isUserContent, className = "w-full", color = "#c4c8e0" }: Props) {
  // Memoized per svg string: the per-hex split/join scans (and the base64
  // encode on the user-content path) used to re-run on every render,
  // including each feed visibility flip. Strings with no legacy hex (every
  // FIELD_GLYPH, all new-palette content) skip the rewrite entirely.
  const { themed, dataUrl } = useMemo(() => {
    const rewritten = containsLegacyHex(svg) ? repaletteSvg(svg) : svg
    return {
      themed: rewritten,
      dataUrl: isUserContent ? `data:image/svg+xml;base64,${toBase64Utf8(rewritten)}` : null,
    }
  }, [svg, isUserContent])

  // ACCESSIBILITY (A11Y-005): every visual this renders is either captioned by
  // its section (the caption is real text right below, so naming the graphic
  // would read it twice) or is a field glyph with no text of its own. The
  // content schema carries no alt field, so there is nothing left to name a
  // diagram with. Both paths are therefore hidden from assistive tech rather
  // than announced as an unlabelled graphic. Naming explanatory diagrams needs
  // a new schema field; until then silence beats invented alt text.
  if (dataUrl) {
    return (
      <div className={className}>
        <img src={dataUrl} alt="" className="w-full" />
      </div>
    )
  }
  return (
    <div
      className={className}
      style={{ color }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: themed }}
    />
  )
}
