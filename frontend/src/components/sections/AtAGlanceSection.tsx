import type { ReactNode } from "react"
import { unescapeDollar } from "@/lib/prose"
import type {
  AtAGlanceBooksContent,
  AtAGlancePeopleContent,
  AtAGlanceQuestionsContent,
  AtAGlanceStoriesContent,
  AtAGlanceAcademyContent,
} from "../../types/post"

type AnyAtAGlance =
  | AtAGlanceBooksContent
  | AtAGlancePeopleContent
  | AtAGlanceQuestionsContent
  | AtAGlanceStoriesContent
  | AtAGlanceAcademyContent

interface Props {
  content: AnyAtAGlance
  // Server-computed reading time (post.reading_minutes); not stored in content.
  readingMinutes: number
}

// Drop rows whose value is missing (an absent optional key coerces to "" via
// unescapeDollar) so a partial at_a_glance renders the keys it has instead of
// blank rows. Numbers (including 0) and rendered elements are kept.
function visible(rows: { label: string; value: ReactNode }[]) {
  return rows.filter((r) => r.value !== "" && r.value !== null && r.value !== undefined)
}

function DotScale({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${i < value ? "bg-(--accent)" : "bg-surface-3"}`}
        />
      ))}
    </span>
  )
}

function isAcademy(c: AnyAtAGlance): c is AtAGlanceAcademyContent {
  return "study_type" in c
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

export default function AtAGlanceSection({ content, readingMinutes }: Props) {
  // Guard the type: a missing reading time would otherwise render "null min".
  // An empty string is dropped by visible(), so the row simply does not show.
  const readTime = typeof readingMinutes === "number" ? `${readingMinutes} min` : ""
  if (isAcademy(content)) {
    // Only the keys actually present are shown: an absent optional (sample_size,
    // pre_registered, open_data, open_code) reads as not-applicable per the
    // skeleton, so it must not render as a "No". The always-present signals come
    // first, then any optional ones, then read time + difficulty.
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Study type", value: unescapeDollar(content.study_type) },
      { label: "Peer review", value: unescapeDollar(content.peer_review_status) },
      { label: "Result direction", value: unescapeDollar(content.result_direction) },
      { label: "Replication", value: unescapeDollar(content.replication_status) },
    ]
    if (content.sample_size) rows.push({ label: "Sample size", value: unescapeDollar(content.sample_size) })
    if (content.pre_registered !== undefined)
      rows.push({ label: "Pre-registered", value: content.pre_registered ? "Yes" : "No" })
    if (content.open_data !== undefined)
      rows.push({ label: "Open data", value: content.open_data ? "Yes" : "No" })
    if (content.open_code !== undefined)
      rows.push({ label: "Open code", value: content.open_code ? "Yes" : "No" })
    rows.push({ label: "Read time", value: readTime })
    rows.push({ label: "Difficulty", value: <DotScale value={content.post_difficulty} /> })
    return (
      <div className="px-6 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {visible(rows).map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
              <span className="text-sm text-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isQuestions(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Field", value: unescapeDollar(content.field) },
      { label: "Type", value: unescapeDollar(content.type) },
      { label: "First posed by", value: unescapeDollar(content.first_posed_by) },
      { label: "Key year", value: String(content.year) },
      { label: "Still debated", value: content.still_debated ? "Yes" : "No" },
      { label: "Read time", value: readTime },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-6 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {visible(rows).map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
              <span className="text-sm text-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isStories(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Era", value: unescapeDollar(content.era) },
      { label: "Location", value: unescapeDollar(content.location) },
      { label: "Category", value: unescapeDollar(content.category) },
      { label: "Source reliability", value: <DotScale value={content.sources_reliability} /> },
      { label: "Read time", value: readTime },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-6 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {visible(rows).map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
              <span className="text-sm text-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isPeople(content)) {
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Born", value: unescapeDollar(content.born) },
      ...(content.died ? [{ label: "Died", value: unescapeDollar(content.died) }] : []),
      { label: "Nationality", value: unescapeDollar(content.nationality) },
      { label: "Field", value: unescapeDollar(content.field) },
      { label: "Read time", value: readTime },
      { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
    ]

    return (
      <div className="px-6 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {visible(rows).map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
              <span className="text-sm text-ink">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 pt-3 border-t border-edge">
          <span className="text-xs text-ink-muted uppercase tracking-wide">Known for</span>
          <span className="text-sm text-ink">{unescapeDollar(content.known_for)}</span>
        </div>
      </div>
    )
  }

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Genre", value: unescapeDollar(content.genre) },
    { label: "Year", value: content.year },
    { label: "Country", value: unescapeDollar(content.country) },
    { label: "Pages", value: content.pages },
    { label: "Reading ease", value: <DotScale value={content.reading_ease} /> },
    { label: "Read time", value: readTime },
    { label: "Difficulty", value: <DotScale value={content.post_difficulty} /> },
  ]

  return (
    <div className="px-6 py-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {visible(rows).map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
            <span className="text-sm text-ink">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 pt-3 border-t border-edge">
        <span className="text-xs text-ink-muted uppercase tracking-wide">Best for</span>
        <span className="text-sm text-ink">{unescapeDollar(content.best_for)}</span>
      </div>
    </div>
  )
}
