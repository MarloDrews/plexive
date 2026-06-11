import type { CoreIdeaItem } from "../../types/post"
import SvgBlock from "../SvgBlock"

interface Props {
  content: CoreIdeaItem[]
  isUserContent: boolean
}

export default function CoreIdeasSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-10">
      {content.map((idea, i) => (
        <div key={i} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-(--accent) leading-snug">{idea.title}</h2>
          <p className="prose-post">{idea.body}</p>

          {idea.visual_svg && (
            <SvgBlock svg={idea.visual_svg} isUserContent={isUserContent} className="w-full max-w-[360px] mx-auto my-4" />
          )}

          {idea.image_url && (
            <div className="max-w-[360px] mx-auto my-2">
              <img
                src={idea.image_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full rounded-lg object-cover"
              />
            </div>
          )}

          {idea.quote && (
            <blockquote className="border-l-2 border-edge-strong pl-4 my-2">
              <p className="text-base italic text-ink-dim leading-relaxed">&ldquo;{idea.quote}&rdquo;</p>
            </blockquote>
          )}

          {idea.in_practice && (
            <div className="bg-(--accent)/10 border border-(--accent)/30 rounded-lg px-4 py-3">
              <p className="text-sm text-ink leading-relaxed">{idea.in_practice}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
