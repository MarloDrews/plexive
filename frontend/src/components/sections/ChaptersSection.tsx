import SectionLabel from "../SectionLabel"
import type { StoryChapter } from "../../types/post"

interface Props {
  content: StoryChapter[]
}

export default function ChaptersSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-10">
      <SectionLabel className="-mb-4">Chapters</SectionLabel>
      {content.map((chapter, i) => (
        <div key={i} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-orange-400 leading-snug">{chapter.title}</h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{chapter.body}</p>
          {chapter.image_url && (
            <div className="flex flex-col gap-1">
              <img
                src={chapter.image_url}
                alt=""
                loading="lazy"
                className="w-full rounded-lg object-cover max-h-[260px]"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
              />
              {chapter.image_caption && (
                <p className="text-xs text-zinc-500 leading-snug">{chapter.image_caption}</p>
              )}
              {chapter.image_attribution && (
                <p className="text-xs text-zinc-700">{chapter.image_attribution}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
