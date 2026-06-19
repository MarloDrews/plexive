import type { ReadNextItem } from "../../types/post"

interface Props {
  content: ReadNextItem[]
}

const FORMAT_LABELS: Record<string, string> = {
  books: "Book",
  facts: "Fact",
  people: "Person",
  concepts: "Idea",
  questions: "Q&A",
  stories: "Story",
  academy: "Academy",
}

function RelatedCard({ item }: { item: ReadNextItem }) {
  // Resolved (live target) entries are clickable; latent ones (target_post_id
  // null) stay non-clickable with the "Coming soon" treatment.
  const hasLink = item.target_post_id != null
  const label = FORMAT_LABELS[item.format] ?? item.format

  const inner = (
    <div className="flex flex-col gap-1.5 p-4 border border-edge-strong rounded-card min-w-[160px] flex-1">
      <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
      <p className="text-sm font-medium text-ink leading-snug line-clamp-2">{item.title}</p>
    </div>
  )

  if (hasLink) {
    return <a href={`/post/${item.target_post_id}`}>{inner}</a>
  }

  return (
    <div className="opacity-60 relative">
      {inner}
      <span className="absolute bottom-2 right-3 text-xs text-ink-faint">Coming soon</span>
    </div>
  )
}

export default function RelatedPostsSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {content.map((item, i) => (
          <RelatedCard key={i} item={item} />
        ))}
      </div>
    </div>
  )
}
