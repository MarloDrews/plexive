import SectionLabel from "../SectionLabel"
import type { SettingContent } from "../../types/post"

interface Props {
  content: SettingContent
}

export default function SettingSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Setting</SectionLabel>
      <p className="text-sm text-zinc-300 leading-relaxed">{content.body}</p>
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
            <p className="text-xs text-zinc-500 leading-snug">{content.image_caption}</p>
          )}
          {content.image_attribution && (
            <p className="text-xs text-zinc-700">{content.image_attribution}</p>
          )}
        </div>
      )}
    </div>
  )
}
