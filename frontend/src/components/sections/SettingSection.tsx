import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import type { SettingContent } from "../../types/post"

interface Props {
  content: SettingContent
  isUserContent: boolean
}

export default function SettingSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Setting the Scene</SectionLabel>
      <Prose><MathText text={content.body} /></Prose>
      {/* The one rare drawn slot in Stories: a map where place needs showing
          (stories_skeleton VISUAL PLAN). Sits tight to its text, SVG security
          split handled by SvgBlock. */}
      {content.visual_svg && (
        <SvgBlock
          svg={content.visual_svg}
          isUserContent={isUserContent}
          className="w-full max-w-[400px] mx-auto mt-1"
        />
      )}
      {content.image_url && (
        <ContentImage
          url={content.image_url}
          caption={content.image_caption}
          attribution={content.image_attribution}
          className="w-full mt-1"
        />
      )}
    </div>
  )
}
