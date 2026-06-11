import type { SourceItem } from "../../types/post"

interface Props {
  content: SourceItem[]
}

const TYPE_LABELS: Record<string, string> = {
  wikipedia: "W",
  paper: "P",
  book: "B",
  article: "A",
  database: "D",
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SourcesSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <ul className="flex flex-col gap-2">
        {content.map((source, i) => (
          <li key={i}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-ink-dim hover:text-ink transition-colors group"
            >
              <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center bg-surface-2 border border-edge-strong text-[10px] font-bold text-ink-dim">
                {TYPE_LABELS[source.type] ?? "?"}
              </span>
              <span className="flex-1 leading-snug">{source.label}</span>
              <ExternalLinkIcon />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
