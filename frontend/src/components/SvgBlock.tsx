// Shared renderer for visual_svg fields in post sections.
//
// SECURITY: user-submitted SVGs (isUserContent=true) MUST render as a base64
// <img> data URL — JavaScript cannot execute in an image context. Only
// seed/official SVGs (controlled content pipeline) may use
// dangerouslySetInnerHTML. Never relax this rule.

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

export default function SvgBlock({ svg, isUserContent, className = "w-full", color = "#e4e4e7" }: Props) {
  if (isUserContent) {
    return (
      <div className={className}>
        <img src={`data:image/svg+xml;base64,${toBase64Utf8(svg)}`} alt="" className="w-full" />
      </div>
    )
  }
  return (
    <div
      className={className}
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
