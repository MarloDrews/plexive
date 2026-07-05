import type { PaperCardContent } from "../../types/post"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: PaperCardContent
}

export default function PaperCardSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      {/* The title is the page headline (rendered once in the header,
          LAYOUT_STANDARD s3), so it is not repeated here; this is the citation
          record only: authors + affiliations, venue/year, and the locators. */}
      <div className="border border-edge-strong rounded-card px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          {content.authors.map((a, i) => (
            <div key={i}>
              <span className="text-xs text-ink-body font-medium">{unescapeDollar(a.name)}</span>
              {a.affiliation && (
                <span className="text-xs text-ink-muted"> · {unescapeDollar(a.affiliation)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>{unescapeDollar(content.venue)}</span>
          <span>{content.year}</span>
          {content.funding_source && <span>{unescapeDollar(content.funding_source)}</span>}
        </div>
        {(content.doi || content.arxiv_id) && (
          <div className="flex flex-col gap-1">
            {content.doi && (
              <a
                href={`https://doi.org/${content.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-(--accent) hover:text-(--accent) transition-colors break-all"
              >
                doi:{content.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}
              </a>
            )}
            {content.arxiv_id && (
              <a
                href={`https://arxiv.org/abs/${content.arxiv_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-(--accent) hover:text-(--accent) transition-colors break-all"
              >
                arXiv:{content.arxiv_id}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
