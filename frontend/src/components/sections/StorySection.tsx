import SectionLabel from "../SectionLabel"
import type { StoryContent } from "../../types/post"
import SvgBlock from "../SvgBlock"

interface Props {
  content: StoryContent
  isUserContent: boolean
}

export default function StorySection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      <SectionLabel>The Story Behind It</SectionLabel>
      <p className="prose-post">{content.body}</p>

      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto bg-transparent">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
      {content.image_url && !content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto">
          <img src={content.image_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg object-cover" />
        </div>
      )}

      {content.key_figures && content.key_figures.length > 0 && (
        <div className="flex flex-col gap-3 mt-1">
          {content.key_figures.map((fig, i) => (
            <div key={i} className="bg-surface-2 border border-edge-strong rounded-field px-4 py-4 flex gap-3 items-start">
              {fig.image_url && (
                <img
                  src={fig.image_url}
                  alt={fig.name}
                  loading="lazy"
                  decoding="async"
                  className="w-10 h-10 rounded-full object-cover shrink-0 bg-surface-2"
                />
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{fig.name}</span>
                  {fig.lifespan && (
                    <span className="text-xs text-ink-muted">{fig.lifespan}</span>
                  )}
                </div>
                <span className="text-xs text-(--accent)/70">{fig.role}</span>
                {fig.one_line && (
                  <p className="text-xs text-ink-dim leading-relaxed mt-1">{fig.one_line}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
