"use client"

import { memo } from "react"
import { FieldError, inputCls, labelCls } from "./formUi"
import { API_URL } from "@/lib/storage"

export const emptyBooksFeedCard = () => ({
  cover_url: "", title: "", author: "", essence: "",
  teaser1: "", teaser2: "", teaser3: "",
  difficulty: "2" as "1" | "2" | "3",
  year: "", genre: "",
})
export type BooksFeedCard = ReturnType<typeof emptyBooksFeedCard>

// Memoized Books feed-card block. onField and onCoverUpload are stable
// callbacks from the page; errors keeps its identity between validation
// changes, so typing in the section accordions below never re-renders this.
const BooksFeedCardBlock = memo(function BooksFeedCardBlock({
  value,
  onField,
  errors,
  coverUploading,
  onCoverUpload,
}: {
  value: BooksFeedCard
  onField: (key: keyof BooksFeedCard, value: string) => void
  errors: Record<string, string>
  coverUploading: boolean
  onCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="border border-lamp/30 rounded-card px-4 pb-4 pt-3 mb-3 bg-lamp/5">
      <p className="label-caps text-lamp mb-3">Feed Card</p>

      <label className={labelCls}>Book title *</label>
      <input type="text" value={value.title} onChange={(e) => onField("title", e.target.value)} maxLength={200} placeholder="Thinking, Fast and Slow" className={inputCls} data-err={errors.fc_title || undefined} />
      <FieldError msg={errors.fc_title} />

      <label className={labelCls}>Author *</label>
      <input type="text" value={value.author} onChange={(e) => onField("author", e.target.value)} placeholder="Daniel Kahneman" className={inputCls} />
      <FieldError msg={errors.fc_author} />

      <label className={labelCls}>Essence * <span className="normal-case text-ink-faint">(~200 chars, why this book matters)</span></label>
      <textarea value={value.essence} onChange={(e) => onField("essence", e.target.value)} maxLength={300} rows={3} placeholder="The core insight in one or two sentences..." className={`${inputCls} resize-none`} />
      <FieldError msg={errors.fc_essence} />

      <label className={labelCls}>Teaser 1 * <span className="normal-case text-ink-faint">(~40 chars)</span></label>
      <input type="text" value={value.teaser1} onChange={(e) => onField("teaser1", e.target.value)} maxLength={80} placeholder="What you'll learn..." className={inputCls} />
      <FieldError msg={errors.fc_teaser1} />
      <label className={labelCls}>Teaser 2 *</label>
      <input type="text" value={value.teaser2} onChange={(e) => onField("teaser2", e.target.value)} maxLength={80} placeholder="Another insight..." className={inputCls} />
      <FieldError msg={errors.fc_teaser2} />
      <label className={labelCls}>Teaser 3 *</label>
      <input type="text" value={value.teaser3} onChange={(e) => onField("teaser3", e.target.value)} maxLength={80} placeholder="A third takeaway..." className={inputCls} />
      <FieldError msg={errors.fc_teaser3} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Difficulty *</label>
          <select value={value.difficulty} onChange={(e) => onField("difficulty", e.target.value as "1" | "2" | "3")} className={inputCls}>
            <option value="1">1 — Easy</option>
            <option value="2">2 — Medium</option>
            <option value="3">3 — Hard</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Year *</label>
          <input type="number" value={value.year} onChange={(e) => onField("year", e.target.value)} placeholder="2011" className={inputCls} />
          <FieldError msg={errors.fc_year} />
        </div>
        <div>
          <label className={labelCls}>Genre *</label>
          <input type="text" value={value.genre} onChange={(e) => onField("genre", e.target.value)} placeholder="Psychology" className={inputCls} />
          <FieldError msg={errors.fc_genre} />
        </div>
      </div>

      <label className={labelCls}>Cover image</label>
      <div className="flex items-center gap-3">
        <label className="btn btn-ghost shrink-0 px-3 py-2 text-xs cursor-pointer">
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onCoverUpload} />
          {coverUploading ? "Uploading..." : "Upload"}
        </label>
        {value.cover_url && (
          <img src={`${API_URL}${value.cover_url}`} alt="" className="w-10 h-14 object-cover rounded" />
        )}
        {!value.cover_url && <span className="text-ink-faint text-xs">or type /uploads/… URL</span>}
      </div>
      <FieldError msg={errors.cover} />
    </div>
  )
})

export default BooksFeedCardBlock
