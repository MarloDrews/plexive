import type { ReactNode } from "react"
import type {
  AtAGlanceBooksContent,
  AtAGlancePeopleContent,
  AtAGlanceQuestionsContent,
  AtAGlanceStoriesContent,
} from "../../types/post"

type AnyAtAGlance =
  | AtAGlanceBooksContent
  | AtAGlancePeopleContent
  | AtAGlanceQuestionsContent
  | AtAGlanceStoriesContent

interface Props {
  content: AnyAtAGlance
}

function DotScale({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${i < value ? "bg-amber-400" : "bg-zinc-600"}`}
        />
      ))}
    </span>
  )
}

function isPeople(c: AnyAtAGlance): c is AtAGlancePeopleContent {
  return "born" in c
}

function isQuestions(c: AnyAtAGlance): c is AtAGlanceQuestionsContent {
  return "still_debated" in c
}

function isStories(c: AnyAtAGlance): c is AtAGlanceStoriesContent {
  return "sources_reliability" in c
}

export default function AtAGlanceSection({ content }: Props) {
  if (isQuestions(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Field", value: content.field },
      { label: "Type", value: content.type },
      { label: "First posed by", value: content.first_posed_by },
      { label: "Key year", value: String(content.year) },
      { label: "Still debated", value: content.still_debated ? "Yes" : "No" },
      { label: "Read time", value: `${content.post_reading_time_min} min` },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-5 py-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
              <span className="text-sm text-zinc-200">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isStories(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Era", value: content.era },
      { label: "Location", value: content.location },
      { label: "Category", value: content.category },
      { label: "Source reliability", value: <DotScale value={content.sources_reliability} /> },
      { label: "Read time", value: `${content.post_reading_time_min} min` },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-5 py-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
              <span className="text-sm text-zinc-200">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isPeople(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Born", value: content.born },
      ...(content.died ? [{ label: "Died", value: content.died }] : []),
      { label: "Nationality", value: content.nationality },
      { label: "Field", value: content.field },
      { label: "Read time", value: `${content.post_reading_time_min} min` },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-5 py-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
              <span className="text-sm text-zinc-200">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 pt-3 border-t border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Known for</span>
          <span className="text-sm text-zinc-200">{content.known_for}</span>
        </div>
      </div>
    )
  }

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Genre", value: content.genre },
    { label: "Year", value: content.year },
    { label: "Country", value: content.country },
    { label: "Pages", value: content.pages },
    { label: "Reading ease", value: <DotScale value={content.reading_ease} /> },
    { label: "Read time", value: `${content.post_reading_time_min} min` },
    { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
  ]

  return (
    <div className="px-5 py-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
            <span className="text-sm text-zinc-200">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 pt-3 border-t border-zinc-800">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Best for</span>
        <span className="text-sm text-zinc-200">{content.best_for}</span>
      </div>
    </div>
  )
}
