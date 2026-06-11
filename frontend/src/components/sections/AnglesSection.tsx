import SectionLabel from "../SectionLabel"
import type { AngleItem } from "../../types/post"
import SvgBlock from "../SvgBlock"

interface Props {
  content: AngleItem[]
  isUserContent: boolean
}

export default function AnglesSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-8">
      <SectionLabel>Multiple Angles</SectionLabel>
      {content.map((angle, i) => (
        <div key={i} className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-(--accent) leading-snug">{angle.title}</h3>
          <p className="prose-post">{angle.body}</p>
          {angle.visual_svg && (
            <div className="w-full max-w-[360px] mx-auto bg-transparent mt-2">
              <SvgBlock svg={angle.visual_svg} isUserContent={isUserContent} />
            </div>
          )}
          {angle.image_url && !angle.visual_svg && (
            <div className="w-full max-w-[360px] mx-auto mt-2">
              <img src={angle.image_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg object-cover" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
