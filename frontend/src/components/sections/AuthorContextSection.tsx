import type { AuthorContextContent } from "../../types/post"
import AppImage from "../AppImage"
import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

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
      <SectionLabel className="mb-3">About the Author</SectionLabel>
      <div className={`flex gap-4 ${content.image_url ? "items-start" : ""}`}>
        {content.image_url && (
          <div className="shrink-0">
            <AppImage
              src={content.image_url}
              alt=""
              width={64}
              height={64}
              sizes="64px"
              className="w-16 h-16 rounded-full object-cover bg-surface-3"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
            />
            {content.image_attribution && (
              <p className="text-xs text-ink-faint mt-1 text-center max-w-[4rem]">
                {unescapeDollar(content.image_attribution)}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Prose className="text-ink-dim"><MathText text={content.body} /></Prose>
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
