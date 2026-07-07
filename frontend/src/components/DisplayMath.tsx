import { useKatex } from "@/lib/katexLoader"

// Block-level display math, shared by FormalismSection and
// FormalDefinitionSection (previously a local copy in each). The latex prop is
// raw LaTeX, not wrapped in $...$, so it renders directly in display mode.
// KaTeX loads lazily: the raw LaTeX shows as plain text until the module is
// ready, and stays visible (as before) if rendering fails.
export default function DisplayMath({
  latex,
  className = "",
}: {
  latex: string
  className?: string
}) {
  const katex = useKatex(true)
  if (!katex) {
    return <div className={`overflow-x-auto py-1 ${className}`}>{latex}</div>
  }
  let html = latex
  try {
    html = katex.renderToString(latex, { displayMode: true, throwOnError: false, output: "html" })
  } catch {
    // fall through to the raw string
  }
  return (
    <div
      className={`overflow-x-auto py-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
