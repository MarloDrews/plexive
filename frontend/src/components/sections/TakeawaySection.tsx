import type { TakeawayContent } from "../../types/post"
import SvgBlock from "../SvgBlock"

interface Props {
  content: TakeawayContent
  isUserContent: boolean
}

export default function TakeawaySection({ content, isUserContent }: Props) {
  if (content.framing === "framework") {
    return (
      <div className="px-6 py-8">
        <div className="bg-(--accent)/10 border border-(--accent)/40 rounded-card px-5 py-5">
          <p className="prose-post text-ink font-medium">{content.body}</p>
          {content.visual_svg && (
            <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="max-w-[360px] mx-auto mt-4" color="inherit" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-8">
      <p className="text-xl font-semibold text-(--accent) leading-snug text-center">
        {content.body}
      </p>
      {content.visual_svg && (
        <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="max-w-[360px] mx-auto mt-4" color="inherit" />
      )}
    </div>
  )
}
