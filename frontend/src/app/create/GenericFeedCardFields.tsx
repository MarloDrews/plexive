"use client"

import { memo, useId } from "react"
import type { FormatId } from "@/lib/formats"
import { FieldError, inputCls, labelCls } from "./formUi"

export const emptyGenericFeedCard = () => ({
  field: "", headline: "",
  name: "", role: "", born: "", died: "", nationality: "",
  concept_name: "", one_liner: "",
  the_question: "", framing: "empirical",
  era: "", location: "",
  authors_compact: "", venue: "", key_finding_one_line: "", published_year: "",
  essence: "", teaser1: "", teaser2: "", teaser3: "",
  difficulty: "2" as "1" | "2" | "3",
})
export type GenericFeedCard = ReturnType<typeof emptyGenericFeedCard>

// Memoized feed-card block for the non-Books formats: the per-format field
// branches plus the shared essence/teasers/difficulty. onField is a stable
// callback from the page, so typing in the body/quiz/sources sections below
// never re-renders this block.
const GenericFeedCardFields = memo(function GenericFeedCardFields({
  format,
  value,
  onField,
  errors,
}: {
  format: FormatId
  value: GenericFeedCard
  onField: (key: keyof GenericFeedCard, value: string) => void
  errors: Record<string, string>
}) {
  // Namespaces the field ids. Only one format branch renders at a time, so the
  // names reused across branches never collide in the DOM.
  const uid = useId()
  return (
    <div className="rounded-3xl bg-white/[0.04] px-4 pb-4 pt-3 mb-3">
      <p className="label-caps text-lamp mb-3">Feed Card</p>

      {format === "facts" && (
        <>
          <label htmlFor={`${uid}-field`} className={labelCls}>Field *</label>
          <input id={`${uid}-field`} type="text" value={value.field} onChange={e => onField("field", e.target.value)} placeholder="Physics" className={inputCls} />
          <FieldError msg={errors.gfc_field} />
          <label htmlFor={`${uid}-headline`} className={labelCls}>Headline *</label>
          <input id={`${uid}-headline`} type="text" value={value.headline} onChange={e => onField("headline", e.target.value)} placeholder="The mind-blowing fact in one line..." className={inputCls} />
          <FieldError msg={errors.gfc_headline} />
        </>
      )}

      {format === "people" && (
        <>
          <label htmlFor={`${uid}-name`} className={labelCls}>Full name *</label>
          <input id={`${uid}-name`} type="text" value={value.name} onChange={e => onField("name", e.target.value)} placeholder="Marie Curie" className={inputCls} />
          <FieldError msg={errors.gfc_name} />
          <label htmlFor={`${uid}-role`} className={labelCls}>Role *</label>
          <input id={`${uid}-role`} type="text" value={value.role} onChange={e => onField("role", e.target.value)} placeholder="Physicist & Chemist" className={inputCls} />
          <FieldError msg={errors.gfc_role} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${uid}-born`} className={labelCls}>Born</label>
              <input id={`${uid}-born`} type="text" value={value.born} onChange={e => onField("born", e.target.value)} placeholder="1867" className={inputCls} />
            </div>
            <div>
              <label htmlFor={`${uid}-died`} className={labelCls}>Died</label>
              <input id={`${uid}-died`} type="text" value={value.died} onChange={e => onField("died", e.target.value)} placeholder="1934" className={inputCls} />
            </div>
          </div>
          <label htmlFor={`${uid}-nationality`} className={labelCls}>Nationality</label>
          <input id={`${uid}-nationality`} type="text" value={value.nationality} onChange={e => onField("nationality", e.target.value)} placeholder="Polish-French" className={inputCls} />
        </>
      )}

      {format === "concepts" && (
        <>
          <label htmlFor={`${uid}-concept_name`} className={labelCls}>Concept name *</label>
          <input id={`${uid}-concept_name`} type="text" value={value.concept_name} onChange={e => onField("concept_name", e.target.value)} placeholder="Confirmation Bias" className={inputCls} />
          <FieldError msg={errors.gfc_concept_name} />
          <label htmlFor={`${uid}-field`} className={labelCls}>Field</label>
          <input id={`${uid}-field`} type="text" value={value.field} onChange={e => onField("field", e.target.value)} placeholder="Psychology" className={inputCls} />
          <label htmlFor={`${uid}-one_liner`} className={labelCls}>One-liner *</label>
          <input id={`${uid}-one_liner`} type="text" value={value.one_liner} onChange={e => onField("one_liner", e.target.value)} placeholder="The concept in a single clear sentence..." className={inputCls} />
          <FieldError msg={errors.gfc_one_liner} />
        </>
      )}

      {format === "questions" && (
        <>
          <label htmlFor={`${uid}-the_question`} className={labelCls}>The question *</label>
          <input id={`${uid}-the_question`} type="text" value={value.the_question} onChange={e => onField("the_question", e.target.value)} placeholder="Is free will an illusion?" className={inputCls} />
          <FieldError msg={errors.gfc_the_question} />
          <label htmlFor={`${uid}-framing`} className={labelCls}>Framing</label>
          <select id={`${uid}-framing`} value={value.framing} onChange={e => onField("framing", e.target.value)} className={inputCls}>
            {["empirical", "ethical", "aesthetic", "practical", "metaphysical"].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </>
      )}

      {format === "stories" && (
        <>
          <label htmlFor={`${uid}-headline`} className={labelCls}>Headline *</label>
          <input id={`${uid}-headline`} type="text" value={value.headline} onChange={e => onField("headline", e.target.value)} placeholder="The story in one compelling line..." className={inputCls} />
          <FieldError msg={errors.gfc_headline} />
          <label htmlFor={`${uid}-era`} className={labelCls}>Era *</label>
          <input id={`${uid}-era`} type="text" value={value.era} onChange={e => onField("era", e.target.value)} placeholder="1940s" className={inputCls} />
          <FieldError msg={errors.gfc_era} />
          <label htmlFor={`${uid}-location`} className={labelCls}>Location</label>
          <input id={`${uid}-location`} type="text" value={value.location} onChange={e => onField("location", e.target.value)} placeholder="Berlin, Germany" className={inputCls} />
        </>
      )}

      {format === "academy" && (
        <>
          <label htmlFor={`${uid}-concept_name`} className={labelCls}>Paper / Article title *</label>
          <input id={`${uid}-concept_name`} type="text" value={value.concept_name} onChange={e => onField("concept_name", e.target.value)} placeholder="On the Origin of Species" className={inputCls} />
          <FieldError msg={errors.gfc_concept_name} />
          <label htmlFor={`${uid}-field`} className={labelCls}>Field</label>
          <input id={`${uid}-field`} type="text" value={value.field} onChange={e => onField("field", e.target.value)} placeholder="Evolutionary Biology" className={inputCls} />
          <label htmlFor={`${uid}-authors_compact`} className={labelCls}>Authors *</label>
          <input id={`${uid}-authors_compact`} type="text" value={value.authors_compact} onChange={e => onField("authors_compact", e.target.value)} placeholder="Darwin, C." className={inputCls} />
          <FieldError msg={errors.gfc_authors_compact} />
          <label htmlFor={`${uid}-venue`} className={labelCls}>Journal / Venue</label>
          <input id={`${uid}-venue`} type="text" value={value.venue} onChange={e => onField("venue", e.target.value)} placeholder="Nature" className={inputCls} />
          <label htmlFor={`${uid}-key_finding_one_line`} className={labelCls}>Key finding (one line) *</label>
          <input id={`${uid}-key_finding_one_line`} type="text" value={value.key_finding_one_line} onChange={e => onField("key_finding_one_line", e.target.value)} placeholder="Species evolve through natural selection..." className={inputCls} />
          <FieldError msg={errors.gfc_key_finding_one_line} />
          <label htmlFor={`${uid}-published_year`} className={labelCls}>Published year</label>
          <input id={`${uid}-published_year`} type="number" value={value.published_year} onChange={e => onField("published_year", e.target.value)} placeholder="1859" className={inputCls} />
        </>
      )}

      {format !== "academy" && (
        <>
          <label htmlFor={`${uid}-essence`} className={labelCls}>Essence * <span className="normal-case text-ink-muted">(why this matters)</span></label>
          <textarea id={`${uid}-essence`} value={value.essence} onChange={e => onField("essence", e.target.value)} maxLength={300} rows={3} placeholder="In one or two sentences..." className={`${inputCls} resize-none`} />
          <FieldError msg={errors.gfc_essence} />
        </>
      )}

      <label htmlFor={`${uid}-teaser1`} className={labelCls}>Teaser 1 *</label>
      <input id={`${uid}-teaser1`} type="text" value={value.teaser1} onChange={e => onField("teaser1", e.target.value)} maxLength={80} placeholder="What you'll learn..." className={inputCls} />
      <FieldError msg={errors.gfc_teaser1} />
      <label htmlFor={`${uid}-teaser2`} className={labelCls}>Teaser 2 *</label>
      <input id={`${uid}-teaser2`} type="text" value={value.teaser2} onChange={e => onField("teaser2", e.target.value)} maxLength={80} placeholder="Another insight..." className={inputCls} />
      <FieldError msg={errors.gfc_teaser2} />
      <label htmlFor={`${uid}-teaser3`} className={labelCls}>Teaser 3 *</label>
      <input id={`${uid}-teaser3`} type="text" value={value.teaser3} onChange={e => onField("teaser3", e.target.value)} maxLength={80} placeholder="A third takeaway..." className={inputCls} />
      <FieldError msg={errors.gfc_teaser3} />

      <div className="mt-1">
        <div>
          <label htmlFor={`${uid}-difficulty`} className={labelCls}>Difficulty *</label>
          <select id={`${uid}-difficulty`} value={value.difficulty} onChange={e => onField("difficulty", e.target.value as "1" | "2" | "3")} className={inputCls}>
            <option value="1">1 — Easy</option>
            <option value="2">2 — Medium</option>
            <option value="3">3 — Hard</option>
          </select>
        </div>
      </div>
    </div>
  )
})

export default GenericFeedCardFields
