import SectionLabel from "../SectionLabel"
import type { TheTurnContent } from "../../types/post"

interface Props {
  content: TheTurnContent
}

export default function TheTurnSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>The Turn</SectionLabel>
      <p className="prose-post">{content.body}</p>
      {content.image_url && (
        <div className="flex flex-col gap-1">
          <img
            src={content.image_url}
            alt=""
            loading="lazy"
            className="w-full rounded-lg object-cover max-h-[260px]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
          {content.image_caption && (
            <p className="text-xs text-ink-muted leading-snug">{content.image_caption}</p>
          )}
          {content.image_attribution && (
            <p className="text-xs text-ink-faint">{content.image_attribution}</p>
          )}
        </div>
      )}
    </div>
  )
}
