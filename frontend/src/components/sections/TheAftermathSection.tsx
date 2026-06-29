import SectionLabel from "../SectionLabel"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import type { TheAftermathContent } from "../../types/post"

interface Props {
  content: TheAftermathContent
}

export default function TheAftermathSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>The Aftermath</SectionLabel>
      <Prose><MathText text={content.body} /></Prose>
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
