import type { ReactNode } from "react"
import { unescapeDollar } from "@/lib/prose"

// Single funnel for plain-prose body text (the bare <p className="prose-post">
// sites). It unescapes a literal "\$" (currency) in string children so the
// "always write \$" content rule is safe on the non-math prose paths. Element
// children (e.g. <MathText/>) pass through unchanged, so math behavior is never
// touched. Pass extra utility classes via className; they append after
// prose-post.
function unescapeNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return unescapeDollar(node)
  if (Array.isArray(node)) return node.map(unescapeNode)
  return node
}

export default function Prose({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <p className={className ? `prose-post ${className}` : "prose-post"}>{unescapeNode(children)}</p>
}
