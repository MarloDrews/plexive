import type { PaperCardContent } from "../../types/post"

interface Props {
  content: PaperCardContent
}

export default function PaperCardSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className="border border-edge-strong rounded-card px-4 py-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink leading-snug">{content.title}</p>
        <div className="flex flex-col gap-1">
          {content.authors.map((a, i) => (
            <div key={i}>
              <span className="text-xs text-ink-body font-medium">{a.name}</span>
              {a.affiliation && (
                <span className="text-xs text-ink-muted"> · {a.affiliation}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>{content.venue}</span>
          <span>{content.year}</span>
          {content.funding_source && <span>{content.funding_source}</span>}
        </div>
        {content.doi && (
          <a
            href={content.doi}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-(--accent) hover:text-(--accent) transition-colors break-all"
          >
            {content.doi}
          </a>
        )}
      </div>
    </div>
  )
}
