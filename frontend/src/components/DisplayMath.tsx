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
  // On a KaTeX failure, render the raw LaTeX as a plain text node, never through
  // __html (M124/SEC-010): the latex is user-controlled, so injecting it as HTML
  // would be stored XSS.
  let html: string | null = null
  try {
    html = katex.renderToString(latex, { displayMode: true, throwOnError: false, output: "html" })
  } catch {
    html = null
  }
  if (html === null) {
    return <div className={`overflow-x-auto py-1 ${className}`}>{latex}</div>
  }
  return (
    <div
      className={`overflow-x-auto py-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
