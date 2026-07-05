import SectionLabel from "../SectionLabel"
import ContentImage from "./ContentImage"
import type { StoryChapter } from "../../types/post"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: StoryChapter[]
}

export default function ChaptersSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-10">
      <SectionLabel className="-mb-4">The Story</SectionLabel>
      {content.map((chapter, i) => (
        <div key={i} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-(--accent) leading-snug">{unescapeDollar(chapter.title)}</h3>
          <Prose><MathText text={chapter.body} /></Prose>
          {chapter.image_url && (
            <ContentImage
              url={chapter.image_url}
              caption={chapter.image_caption}
              attribution={chapter.image_attribution}
              className="w-full mt-1"
            />
          )}
        </div>
      ))}
    </div>
  )
}
