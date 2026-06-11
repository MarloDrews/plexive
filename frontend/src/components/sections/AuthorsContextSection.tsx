import SectionLabel from "../SectionLabel"
import type { AuthorsContextItem } from "../../types/post"

interface Props {
  content: AuthorsContextItem[]
}

export default function AuthorsContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>{content.length === 1 ? "Author" : "Authors"}</SectionLabel>
      {content.map((author, i) => (
        <div key={i} className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">{author.name}</p>
          <p className="text-xs text-ink-muted">{author.role}</p>
          <p className="text-sm text-ink-dim leading-snug">{author.one_line}</p>
          {author.affiliation && (
            <p className="text-xs text-ink-faint">{author.affiliation}</p>
          )}
        </div>
      ))}
    </div>
  )
}
