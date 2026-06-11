import type { AuthorContextContent } from "../../types/post"

interface Props {
  content: AuthorContextContent
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline ml-1 mb-0.5">
      <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AuthorContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className={`flex gap-4 ${content.image_url ? "items-start" : ""}`}>
        {content.image_url && (
          <div className="shrink-0">
            <img
              src={content.image_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-16 h-16 rounded-full object-cover bg-surface-3"
            />
            {content.image_attribution && (
              <p className="text-xs text-ink-faint mt-1 text-center max-w-[4rem]">
                {content.image_attribution}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="prose-post text-ink-dim">{content.body}</p>
          {content.wikipedia_url && (
            <a
              href={content.wikipedia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-(--accent) hover:text-(--accent) transition-colors"
            >
              Wikipedia
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
