import SectionLabel from "../SectionLabel"
import type { AngleItem } from "../../types/post"
import SvgBlock from "../SvgBlock"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: AngleItem[]
  isUserContent: boolean
}

export default function AnglesSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-8">
      <SectionLabel>Multiple Angles</SectionLabel>
      {asArray(content).map((angle, i) => (
        <div key={i} className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-(--accent) leading-snug">{unescapeDollar(angle.title)}</h3>
          <Prose><MathText text={angle.body} /></Prose>
          {angle.visual_svg && (
            <div className="w-full max-w-[360px] mx-auto bg-transparent mt-2">
              <SvgBlock svg={angle.visual_svg} isUserContent={isUserContent} />
            </div>
          )}
          {angle.image_url && !angle.visual_svg && (
            <ContentImage
              url={angle.image_url}
              caption={angle.image_caption}
              attribution={angle.image_attribution}
              className="w-full max-w-[360px] mx-auto mt-2"
            />
          )}
        </div>
      ))}
    </div>
  )
}
