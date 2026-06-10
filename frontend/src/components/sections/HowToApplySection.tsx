import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"

interface HowToApplyContent {
  body: string
  checklist?: string[]
  visual_svg?: string
}

interface Props {
  content: HowToApplyContent
  isUserContent: boolean
}

export default function HowToApplySection({ content, isUserContent }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>How to Apply It</SectionLabel>
      <p className="text-sm text-zinc-400 leading-relaxed">{content.body}</p>
      {content.checklist && content.checklist.length > 0 && (
        <ul className="flex flex-col gap-2">
          {content.checklist.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded border border-violet-400/40 mt-0.5 flex items-center justify-center">
                <span className="w-2 h-2 rounded-sm bg-violet-400/50" />
              </span>
              <span className="text-sm text-zinc-300 leading-snug">{item}</span>
            </li>
          ))}
        </ul>
      )}
      {content.visual_svg && (
        <SvgBlock
          svg={content.visual_svg}
          isUserContent={isUserContent}
          className="w-full max-w-[400px] mx-auto mt-2"
        />
      )}
    </div>
  )
}
