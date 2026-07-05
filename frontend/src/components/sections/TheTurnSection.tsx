import SectionLabel from "../SectionLabel"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import type { TheTurnContent } from "../../types/post"

interface Props {
  content: TheTurnContent
}

export default function TheTurnSection({ content }: Props) {
  return (
    // The Stories key section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's pivot. Mirrors
    // facts (SurprisesSection), concepts (HowToApplySection), books (HeartSection).
    // Exactly one section per format is marked.
    <div className="px-6 py-8 border-l-2 border-(--accent) bg-(--accent)/[0.06] flex flex-col gap-4">
      <SectionLabel>The Turn</SectionLabel>
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
