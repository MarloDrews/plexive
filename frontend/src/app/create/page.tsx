"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
import { invalidateFeedCaches } from "@/lib/swr"
import { detailToMessage } from "@/lib/errorMessage"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"
import { fcStr, type Post } from "@/types/post"
import { CATEGORIES } from "@/lib/interests"
import BottomNav from "@/components/BottomNav"
import Spinner from "@/components/Spinner"
import {
  emptyQuizItem,
  emptySource,
  type Interest,
  type QuizItem,
  type Source,
} from "./formUi"
import QuizEditor from "./QuizEditor"
import SourcesEditor from "./SourcesEditor"
import InterestPickerBlock from "./InterestPickerBlock"
import TextSectionAccordion from "./TextSectionAccordion"
import VoicesEditor, { emptyVoice, type Voice } from "./VoicesEditor"
import AtAGlanceEditor, { emptyAtAGlance } from "./AtAGlanceEditor"
import CoreIdeasEditor, { emptyCoreIdea, type CoreIdea } from "./CoreIdeasEditor"
import TakeawayEditor, { emptyTakeaway, type TakeawayState } from "./TakeawayEditor"
import StructureEditor from "./StructureEditor"
import AuthorContextEditor, { emptyAuthorContext, type AuthorContextState } from "./AuthorContextEditor"
import BooksFeedCardBlock, { emptyBooksFeedCard, type BooksFeedCard } from "./BooksFeedCardBlock"
import GenericFeedCardFields, { emptyGenericFeedCard, type GenericFeedCard } from "./GenericFeedCardFields"

const FORMAT_DESCRIPTIONS: Record<FormatId, string> = {
  books: "Summarize a book's key ideas",
  facts: "Share a mind-blowing fact",
  people: "Profile an inspiring person",
  concepts: "Explain a mental model",
  questions: "Pose a thought experiment",
  stories: "Tell a gripping true story",
  academy: "Teach something valuable",
}

const FORMATS = FORMAT_IDS.map((id) => ({
  id,
  name: FORMAT_STYLES[id].label,
  accent: FORMAT_STYLES[id].border,
  description: FORMAT_DESCRIPTIONS[id],
}))

// The wizard's state stays on the page (one source of truth for submit); every
// step-3 block is a memoized component receiving only its slice plus a stable
// setter, so one keystroke re-renders its own section instead of the whole
// step-3 tree (feed card + ~15 accordions + ~140 interest pills).
export default function CreatePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3 | "success">(1)
  const [selectedFormat, setSelectedFormat] = useState<FormatId | null>(null)

  // Step 2 — duplicate check
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Post[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Feed Card state
  const [fc, setFc] = useState<BooksFeedCard>(emptyBooksFeedCard)

  // Section states — simple text sections
  const [sEssence, setSEssence] = useState("")
  const [sWhyEndures, setSWhyEndures] = useState("")
  const [sHeart, setSHeart] = useState("")
  const [sWorldContext, setSWorldContext] = useState("")
  const [sCritique, setSCritique] = useState("")

  // At-a-glance section
  const [atAGlance, setAtAGlance] = useState(emptyAtAGlance)

  // Array sections
  const [voices, setVoices] = useState<Voice[]>([emptyVoice(), emptyVoice(), emptyVoice()])
  const [structure, setStructure] = useState<string[]>(["", "", ""])
  const [coreIdeas, setCoreIdeas] = useState<CoreIdea[]>(Array.from({ length: 6 }, emptyCoreIdea))
  const [takeaway, setTakeaway] = useState<TakeawayState>(emptyTakeaway)
  const [quizItems, setQuizItems] = useState<QuizItem[]>(Array.from({ length: 5 }, emptyQuizItem))
  const [authorContext, setAuthorContext] = useState<AuthorContextState>(emptyAuthorContext)
  const [sources, setSources] = useState<Source[]>([emptySource()])

  // Generic form state (non-Books formats)
  const [gFc, setGFc] = useState<GenericFeedCard>(emptyGenericFeedCard)
  const [genericBody, setGenericBody] = useState("")

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  // Interests via SWR: the list is static, so a revisit renders it from
  // cache instead of refetching. Error keeps the old behavior (empty list).
  const { data: interestsData } = useSWR<Interest[]>("/api/interests")
  const allInterests: Interest[] = useMemo(() => interestsData ?? [], [interestsData])

  // Cover upload
  const [coverUploading, setCoverUploading] = useState(false)

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState("")
  // The status of the just-created post ("published" or "pending"), read from
  // the POST /api/posts response so the success message reflects what actually
  // happened -- publishing is gated by can_publish now, not the verified badge.
  const [createdStatus, setCreatedStatus] = useState<string | null>(null)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against a slow response for an earlier query landing after a later one.
  const searchSeq = useRef(0)

  useEffect(() => {
    if (step !== 2) return
    const trimmed = searchQuery.trim()
    // Clearing the query must also clear the spinner, or it stays on forever.
    if (!trimmed) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const seq = ++searchSeq.current
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (selectedFormat) params.set("format", selectedFormat)
        const res = await apiFetch(`/api/search?${params}`)
        const data: Post[] = await res.json()
        if (seq === searchSeq.current) setSearchResults(data.slice(0, 5))
      } catch {
        // Swallow so a failed duplicate check is not an unhandled rejection.
      } finally {
        if (seq === searchSeq.current) setSearchLoading(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, step, selectedFormat])

  // Every handler below is useCallback-stable and clears errors without
  // replacing the errors object when the key is absent, so the memoized
  // section components are not invalidated by keystrokes elsewhere.
  const clearError = useCallback((key: string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const n = { ...prev }
      delete n[key]
      return n
    })
  }, [])

  const setFcField = useCallback((key: keyof BooksFeedCard, value: string) => {
    setFc((prev) => ({ ...prev, [key]: value }))
    clearError(`fc_${key}`)
  }, [clearError])

  const setGFcField = useCallback((key: keyof GenericFeedCard, value: string) => {
    setGFc((prev) => ({ ...prev, [key]: value }))
    clearError(`gfc_${key}`)
  }, [clearError])

  const toggleInterest = useCallback((slug: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= 5) return prev
      return [...prev, slug]
    })
    clearError("interests")
  }, [clearError])

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch("/api/upload/image", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(detailToMessage(data.detail, "Upload failed"))
      setFcField("cover_url", data.url)
    } catch (err) {
      setErrors((prev) => ({ ...prev, cover: err instanceof Error ? err.message : "Upload failed" }))
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }, [setFcField])

  // Per-section change handlers for the plain-text accordions.
  const onEssenceChange = useCallback((v: string) => { setSEssence(v); clearError("s_essence") }, [clearError])
  const onHeartChange = useCallback((v: string) => { setSHeart(v); clearError("s_heart") }, [clearError])
  const onWhyEnduresChange = useCallback((v: string) => setSWhyEndures(v), [])
  const onWorldContextChange = useCallback((v: string) => setSWorldContext(v), [])
  const onCritiqueChange = useCallback((v: string) => setSCritique(v), [])
  const onGenericBodyChange = useCallback((v: string) => { setGenericBody(v); clearError("generic_body") }, [clearError])
  const onTakeawayChange = useCallback((v: TakeawayState) => { setTakeaway(v); clearError("s_takeaway") }, [clearError])

  function buildSections() {
    const sections: Array<{ type: string; order: number; content: unknown }> = []

    if (sEssence.trim()) sections.push({ type: "essence", order: 1, content: sEssence.trim() })

    const validVoices = voices.filter((v) => v.quote.trim() && v.attribution.trim())
    if (validVoices.length >= 3) sections.push({
      type: "voices", order: 3,
      content: validVoices.map((v) => ({ quote: v.quote.trim(), attribution: v.attribution.trim() })),
    })

    const aag = atAGlance
    if (aag.genre && aag.country && aag.best_for) sections.push({
      type: "at_a_glance", order: 4,
      content: {
        genre: aag.genre.trim(),
        year: parseInt(aag.year) || 0,
        country: aag.country.trim(),
        pages: parseInt(aag.pages) || 0,
        reading_ease: parseInt(aag.reading_ease) as 1|2|3,
        post_difficulty: parseInt(aag.post_difficulty) as 1|2|3,
        best_for: aag.best_for.trim(),
      },
    })

    if (sWhyEndures.trim()) sections.push({ type: "why_endures", order: 5, content: sWhyEndures.trim() })
    if (sHeart.trim()) sections.push({ type: "heart", order: 6, content: sHeart.trim() })

    const validStructure = structure.filter((s) => s.trim())
    if (validStructure.length > 0) sections.push({ type: "structure", order: 7, content: validStructure })

    const validIdeas = coreIdeas.filter((ci) => ci.title.trim() && ci.body.trim())
    if (validIdeas.length >= 6) sections.push({
      type: "core_ideas", order: 8,
      content: validIdeas.map((ci) => ({
        title: ci.title.trim(), body: ci.body.trim(),
        ...(ci.in_practice.trim() ? { in_practice: ci.in_practice.trim() } : {}),
        ...(ci.visual_svg.trim() ? { visual_svg: ci.visual_svg.trim() } : {}),
        ...(ci.image_url.trim() ? { image_url: ci.image_url.trim() } : {}),
        ...(ci.quote.trim() ? { quote: ci.quote.trim() } : {}),
      })),
    })

    if (takeaway.body.trim()) sections.push({
      type: "takeaway", order: 9,
      content: {
        framing: takeaway.framing, body: takeaway.body.trim(),
        ...(takeaway.visual_svg.trim() ? { visual_svg: takeaway.visual_svg.trim() } : {}),
      },
    })

    const validQuiz = quizItems.filter(
      (q) => q.question.trim() && q.options.every((o) => o.trim()) && q.explanation.trim()
    )
    if (validQuiz.length >= 5) sections.push({
      type: "quiz", order: 10,
      content: validQuiz.map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => o.trim()) as [string, string, string, string],
        answer_index: parseInt(q.answer_index) as 0|1|2|3,
        explanation: q.explanation.trim(),
      })),
    })

    if (sWorldContext.trim()) sections.push({ type: "world_context", order: 12, content: sWorldContext.trim() })

    if (authorContext.body.trim()) sections.push({
      type: "author_context", order: 13,
      content: {
        body: authorContext.body.trim(),
        ...(authorContext.image_url.trim() ? { image_url: authorContext.image_url.trim() } : {}),
        ...(authorContext.image_attribution.trim() ? { image_attribution: authorContext.image_attribution.trim() } : {}),
        ...(authorContext.wikipedia_url.trim() ? { wikipedia_url: authorContext.wikipedia_url.trim() } : {}),
      },
    })

    if (sCritique.trim()) sections.push({ type: "critique", order: 14, content: sCritique.trim() })

    const validSources = sources.filter((s) => s.label.trim() && s.url.trim())
    if (validSources.length >= 1) sections.push({
      type: "sources", order: 15,
      content: validSources.map((s) => ({ label: s.label.trim(), url: s.url.trim(), type: s.type })),
    })

    return sections
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}

    if (!fc.title.trim()) errs.fc_title = "Required"
    if (!fc.author.trim()) errs.fc_author = "Required"
    if (!fc.essence.trim()) errs.fc_essence = "Required"
    if (!fc.teaser1.trim()) errs.fc_teaser1 = "Required"
    if (!fc.teaser2.trim()) errs.fc_teaser2 = "Required"
    if (!fc.teaser3.trim()) errs.fc_teaser3 = "Required"
    if (!fc.year || parseInt(fc.year) < 1000) errs.fc_year = "Enter a valid year"
    if (!fc.genre.trim()) errs.fc_genre = "Required"

    if (selectedInterests.length < 1 || selectedInterests.length > 5) {
      errs.interests = "Select 1–5 interests"
    }

    if (!sEssence.trim()) errs.s_essence = "Required"
    if (!sHeart.trim()) errs.s_heart = "Required"

    const validVoices = voices.filter((v) => v.quote.trim() && v.attribution.trim())
    if (validVoices.length < 3) errs.s_voices = "Need at least 3 complete quotes"

    const aag = atAGlance
    if (!aag.genre.trim() || !aag.country.trim() || !aag.best_for.trim() || !aag.year || !aag.pages) {
      errs.s_at_a_glance = "Fill in all At a Glance fields"
    }

    const validIdeas = coreIdeas.filter((ci) => ci.title.trim() && ci.body.trim())
    if (validIdeas.length < 6) errs.s_core_ideas = "Need at least 6 complete ideas (title + body)"

    if (!takeaway.body.trim()) errs.s_takeaway = "Required"

    const validQuiz = quizItems.filter(
      (q) => q.question.trim() && q.options.every((o) => o.trim()) && q.explanation.trim()
    )
    if (validQuiz.length < 5) errs.s_quiz = "Need at least 5 complete questions"

    const validSources = sources.filter((s) => s.label.trim() && s.url.trim())
    if (validSources.length < 1) errs.s_sources = "Add at least 1 source"

    // Image URL validation
    const allImageUrls = [
      fc.cover_url,
      ...coreIdeas.map((ci) => ci.image_url),
      authorContext.image_url,
    ].filter(Boolean)
    for (const url of allImageUrls) {
      if (url && !url.startsWith("https://")) {
        errs.image_urls = "All image URLs must use the upload button"
        break
      }
    }

    return errs
  }

  // Build feed_card dict for non-Books formats based on gFc state
  function buildGenericFeedCard(format: FormatId): Record<string, unknown> {
    const teasers = [gFc.teaser1.trim(), gFc.teaser2.trim(), gFc.teaser3.trim()]
    const base = {
      teasers,
      post_difficulty: parseInt(gFc.difficulty),
    }
    if (format === "facts") return { ...base, field: gFc.field.trim(), headline: gFc.headline.trim(), essence: gFc.essence.trim() }
    if (format === "people") return { ...base, name: gFc.name.trim(), role: gFc.role.trim(), born: gFc.born.trim(), died: gFc.died.trim(), nationality: gFc.nationality.trim(), essence: gFc.essence.trim() }
    if (format === "concepts") return { ...base, concept_name: gFc.concept_name.trim(), field: gFc.field.trim(), one_liner: gFc.one_liner.trim(), essence: gFc.essence.trim() }
    if (format === "questions") return { ...base, the_question: gFc.the_question.trim(), framing: gFc.framing, essence: gFc.essence.trim() }
    if (format === "stories") return { ...base, headline: gFc.headline.trim(), era: gFc.era.trim(), location: gFc.location.trim(), essence: gFc.essence.trim() }
    if (format === "academy") return { ...base, field: gFc.field.trim(), title: gFc.concept_name.trim(), authors_compact: gFc.authors_compact.trim(), venue: gFc.venue.trim(), key_finding_one_line: gFc.key_finding_one_line.trim(), published_year: parseInt(gFc.published_year) || 0 }
    return base
  }

  function buildGenericSections() {
    const sections: Array<{ type: string; order: number; content: unknown }> = []
    if (genericBody.trim()) sections.push({ type: "heart", order: 2, content: genericBody.trim() })
    const validQuiz = quizItems.filter(q => q.question.trim() && q.options.every(o => o.trim()) && q.explanation.trim())
    if (validQuiz.length >= 5) sections.push({
      type: "quiz", order: 3,
      content: validQuiz.map(q => ({
        question: q.question.trim(),
        options: q.options.map(o => o.trim()) as [string, string, string, string],
        answer_index: parseInt(q.answer_index) as 0|1|2|3,
        explanation: q.explanation.trim(),
      })),
    })
    const validSources = sources.filter(s => s.label.trim() && s.url.trim())
    if (validSources.length >= 1) sections.push({
      type: "sources", order: 4,
      content: validSources.map(s => ({ label: s.label.trim(), url: s.url.trim(), type: s.type })),
    })
    return sections
  }

  function validateGeneric(): Record<string, string> {
    const errs: Record<string, string> = {}
    const format = selectedFormat!
    if (format === "facts") {
      if (!gFc.field.trim()) errs.gfc_field = "Required"
      if (!gFc.headline.trim()) errs.gfc_headline = "Required"
    } else if (format === "people") {
      if (!gFc.name.trim()) errs.gfc_name = "Required"
      if (!gFc.role.trim()) errs.gfc_role = "Required"
    } else if (format === "concepts") {
      if (!gFc.concept_name.trim()) errs.gfc_concept_name = "Required"
      if (!gFc.one_liner.trim()) errs.gfc_one_liner = "Required"
    } else if (format === "questions") {
      if (!gFc.the_question.trim()) errs.gfc_the_question = "Required"
    } else if (format === "stories") {
      if (!gFc.headline.trim()) errs.gfc_headline = "Required"
      if (!gFc.era.trim()) errs.gfc_era = "Required"
    } else if (format === "academy") {
      if (!gFc.concept_name.trim()) errs.gfc_concept_name = "Required"
      if (!gFc.authors_compact.trim()) errs.gfc_authors_compact = "Required"
      if (!gFc.key_finding_one_line.trim()) errs.gfc_key_finding_one_line = "Required"
    }
    if (!gFc.essence.trim() && format !== "academy") errs.gfc_essence = "Required"
    if (!gFc.teaser1.trim()) errs.gfc_teaser1 = "Required"
    if (!gFc.teaser2.trim()) errs.gfc_teaser2 = "Required"
    if (!gFc.teaser3.trim()) errs.gfc_teaser3 = "Required"
    if (!genericBody.trim()) errs.generic_body = "Required"
    const validQuiz = quizItems.filter(q => q.question.trim() && q.options.every(o => o.trim()) && q.explanation.trim())
    if (validQuiz.length < 5) errs.s_quiz = "Need at least 5 complete questions"
    const validSources = sources.filter(s => s.label.trim() && s.url.trim())
    if (validSources.length < 1) errs.s_sources = "Add at least 1 source"
    if (selectedInterests.length < 1) errs.interests = "Select 1–5 interests"
    return errs
  }

  // Derive the post title from the format's primary field
  function genericTitle(): string {
    const format = selectedFormat!
    if (format === "facts") return gFc.headline.trim()
    if (format === "people") return gFc.name.trim()
    if (format === "concepts") return gFc.concept_name.trim()
    if (format === "questions") return gFc.the_question.trim()
    if (format === "stories") return gFc.headline.trim()
    if (format === "academy") return gFc.concept_name.trim()
    return ""
  }

  async function handleSubmit() {
    // Re-entrancy guard: a second click before the pending POST resolves used
    // to submit the post twice (the disabled state only lands after the
    // re-render).
    if (submitting) return

    if (selectedFormat !== "books") {
      const errs = validateGeneric()
      if (Object.keys(errs).length > 0) {
        setErrors(errs)
        const firstErrEl = document.querySelector("[data-err]")
        if (firstErrEl) firstErrEl.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }
      setSubmitting(true)
      setServerError("")
      try {
        const title = genericTitle()
        const payload = {
          format: selectedFormat,
          title,
          feed_card: buildGenericFeedCard(selectedFormat as FormatId),
          sections: buildGenericSections(),
          interests: selectedInterests,
        }
        const res = await apiFetch("/api/posts", { method: "POST", body: JSON.stringify(payload) })
        // Cached feed lists may now be missing the new post; drop them so the
        // next feed visit fetches fresh.
        if (res.status === 201) { const data = await res.json().catch(() => null); setCreatedStatus(data?.status ?? null); invalidateFeedCaches(); setStep("success") }
        else { const data = await res.json(); setServerError(detailToMessage(data.detail, "Something went wrong.")) }
      } catch { setServerError("Network error. Please try again.") }
      finally { setSubmitting(false) }
      return
    }

    // Books path (unchanged)
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      const firstErrEl = document.querySelector("[data-err]")
      if (firstErrEl) firstErrEl.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setSubmitting(true)
    setServerError("")
    try {
      const title = fc.title.trim()
      const payload = {
        format: "books",
        title,
        feed_card: {
          cover_url: fc.cover_url.trim() || null,
          title,
          author: fc.author.trim(),
          essence: fc.essence.trim(),
          teasers: [fc.teaser1.trim(), fc.teaser2.trim(), fc.teaser3.trim()] as [string, string, string],
          post_difficulty: parseInt(fc.difficulty) as 1|2|3,
          year: parseInt(fc.year),
          genre: fc.genre.trim(),
        },
        sections: buildSections(),
        interests: selectedInterests,
      }
      const res = await apiFetch("/api/posts", { method: "POST", body: JSON.stringify(payload) })
      if (res.status === 201) {
        const data = await res.json().catch(() => null)
        setCreatedStatus(data?.status ?? null)
        invalidateFeedCaches()
        setStep("success")
      } else {
        const data = await res.json()
        setServerError(detailToMessage(data.detail, "Something went wrong."))
      }
    } catch {
      setServerError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Discard everything authored for a post (feed cards, sections, quiz,
  // sources, duplicate-check search, errors). Interests are format-independent
  // and survive a format switch; resetForm additionally clears them and
  // returns to step 1.
  function resetAuthoredContent() {
    setGFc(emptyGenericFeedCard())
    setGenericBody("")
    setSearchQuery(""); setSearchResults([])
    setFc(emptyBooksFeedCard())
    setSEssence(""); setSWhyEndures(""); setSHeart(""); setSWorldContext(""); setSCritique("")
    setAtAGlance(emptyAtAGlance())
    setVoices([emptyVoice(), emptyVoice(), emptyVoice()])
    setStructure(["", "", ""])
    setCoreIdeas(Array.from({ length: 6 }, emptyCoreIdea))
    setTakeaway(emptyTakeaway())
    setQuizItems(Array.from({ length: 5 }, emptyQuizItem))
    setAuthorContext(emptyAuthorContext())
    setSources([emptySource()])
    setErrors({}); setServerError("")
  }

  function resetForm() {
    resetAuthoredContent()
    setStep(1)
    setSelectedFormat(null)
    setSelectedInterests([])
    setCreatedStatus(null)
  }

  // Switching formats at step 1 discards the authored content so nothing
  // written for one format leaks into a post of another format (essence,
  // teasers, quiz and sources used to carry over silently).
  function handleSelectFormat(id: FormatId) {
    if (id === selectedFormat) return
    if (selectedFormat !== null) resetAuthoredContent()
    setSelectedFormat(id)
  }

  // Rebuilt only when the interest list itself changes (it is a static list
  // fetched once), never per keystroke.
  const interestSections = useMemo(() => {
    const bySlug = new Map(allInterests.map((i) => [i.slug, i]))
    return CATEGORIES.map((cat) => ({
      label: cat.label,
      items: cat.slugs.flatMap((s) => { const i = bySlug.get(s); return i ? [i] : [] }),
    })).filter((sec) => sec.items.length > 0)
  }, [allInterests])

  if (!loading && !user) {
    return (
      <div className="h-[100dvh] bg-surface-0 flex justify-center">
        <div className="w-full max-w-[430px] h-[100dvh] relative flex items-center justify-center px-6">
          <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-4">
            <p className="font-serif text-ink text-xl font-medium">Sign in to create a post</p>
            <button onClick={() => router.push("/login")} className="btn btn-primary px-8 py-3">Sign in</button>
          </div>
        </div>
      </div>
    )
  }
  if (loading) return null

  if (step === "success") {
    return (
      <div className="h-[100dvh] bg-surface-0 flex justify-center">
        <div className="w-full max-w-[430px] h-[100dvh] relative flex items-center justify-center px-6">
          <div className="card px-8 py-10 text-center w-full max-w-xs flex flex-col items-center gap-4">
            <p className="font-serif text-ink text-2xl font-medium">Post submitted</p>
            <p className="text-ink-dim text-sm">
              {createdStatus === "published" ? "It is now live in the feed." : "It will appear once approved."}
            </p>
            <div className="flex flex-col gap-3 w-full mt-4">
              <button onClick={resetForm} className="btn btn-primary h-12 w-full">Create another</button>
              <button onClick={() => router.push("/my-posts")} className="btn btn-ghost h-12 w-full">View my posts</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stepNum = step as number

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        <div className="h-full overflow-y-auto pb-24 px-4 pt-6">

          <p className="text-ink-muted text-xs font-mono text-center mb-3">Step {stepNum} of 3</p>
          <div className="h-0.5 bg-white/[0.08] rounded-full mb-6">
            <div className="h-full bg-lamp rounded-full transition-all duration-300" style={{ width: `${(stepNum / 3) * 100}%` }} />
          </div>

          {step > 1 && (
            <button onClick={() => setStep((prev) => (prev as number) - 1 as 1|2|3)} className="btn btn-ghost text-sm mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>
              Back
            </button>
          )}

          {/* STEP 1: Format selection */}
          {step === 1 && (
            <>
              <h1 className="font-serif text-ink text-2xl font-medium mb-1">Choose a format</h1>
              <p className="text-ink-dim text-sm mb-5">What kind of post are you creating?</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {FORMATS.map((fmt) => {
                  const selected = selectedFormat === fmt.id
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => handleSelectFormat(fmt.id)}
                      className={`rounded-3xl p-5 text-left transition-colors border-2 ${selected ? `${fmt.accent} bg-white/[0.08]` : "border-transparent bg-white/[0.04]"} cursor-pointer`}
                    >
                      <div className="font-semibold text-ink text-sm">{fmt.name}</div>
                      <div className="text-ink-dim text-xs mt-0.5">{fmt.description}</div>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => { if (selectedFormat) setStep(2) }}
                disabled={!selectedFormat}
                className="btn btn-primary h-12 w-full disabled:opacity-30"
              >
                Next &rarr;
              </button>
            </>
          )}

          {/* STEP 2: Duplicate check */}
          {step === 2 && (
            <>
              <h1 className="font-serif text-ink text-2xl font-medium mb-1">Does this already exist?</h1>
              <p className="text-ink-dim text-sm mb-5">Search to avoid duplicates</p>
              <div className="relative mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search existing posts..."
                  className="field text-sm pl-9 py-3"
                />
              </div>
              {searchLoading && <div className="flex justify-center py-4"><Spinner size="sm" /></div>}
              {!searchLoading && searchResults.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {searchResults.map((post) => {
                    const style = FORMAT_STYLES[post.format as FormatId]
                    return (
                      <button key={post.id} onClick={() => window.open(`/post/${post.id}`, "_blank")} className="w-full text-left card px-4 py-3 cursor-pointer hover:bg-white/[0.07] transition-colors duration-150">
                        {style && <span className={`label-caps ${style.text}`}>{style.badge}</span>}
                        <p className="text-ink font-serif font-medium text-[15px] mt-0.5 line-clamp-2">{post.title}</p>
                        {fcStr(post.feed_card, "essence") && <p className="text-ink-dim text-xs mt-1 line-clamp-2">{fcStr(post.feed_card, "essence")}</p>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button onClick={() => setStep(3)} className="btn btn-primary h-12 w-full mt-4">
                Continue anyway
              </button>
            </>
          )}

          {/* STEP 3: Generic form for non-Books formats */}
          {step === 3 && selectedFormat && selectedFormat !== "books" && (
            <>
              <h1 className="font-serif text-ink text-2xl font-medium mb-5">{FORMAT_STYLES[selectedFormat]?.label ?? selectedFormat} post</h1>

              <GenericFeedCardFields
                format={selectedFormat}
                value={gFc}
                onField={setGFcField}
                errors={errors}
              />

              <InterestPickerBlock
                sections={interestSections}
                selected={selectedInterests}
                onToggle={toggleInterest}
                error={errors.interests}
              />

              <p className="label-caps mb-3 mt-5">Sections</p>

              <TextSectionAccordion
                title="Body"
                required
                defaultOpen
                hint="The main content — explain, describe, or narrate in full"
                rows={10}
                placeholder="Write the full content here..."
                value={genericBody}
                onChange={onGenericBodyChange}
                error={errors.generic_body}
              />

              <QuizEditor items={quizItems} onChange={setQuizItems} radioNamePrefix="gquiz_answer_" error={errors.s_quiz} />

              <SourcesEditor items={sources} onChange={setSources} labelPlaceholder="Source name..." error={errors.s_sources} />

              {serverError && <p className="text-bad text-sm mb-3">{serverError}</p>}
              <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary h-12 w-full mt-4">
                {submitting ? "Submitting..." : "Submit post"}
              </button>
            </>
          )}

          {/* STEP 3: Books form */}
          {step === 3 && selectedFormat === "books" && (
            <>
              <h1 className="font-serif text-ink text-2xl font-medium mb-5">Books post</h1>

              <BooksFeedCardBlock
                value={fc}
                onField={setFcField}
                errors={errors}
                coverUploading={coverUploading}
                onCoverUpload={handleCoverUpload}
              />

              <InterestPickerBlock
                sections={interestSections}
                selected={selectedInterests}
                onToggle={toggleInterest}
                error={errors.interests}
              />

              {/* Section accordions */}
              <p className="label-caps mb-3 mt-5">Sections</p>

              <TextSectionAccordion
                title="Essence"
                required
                defaultOpen
                hint="The core insight in one strong sentence (shown full-screen on the detail page)"
                rows={2}
                maxLength={300}
                placeholder="Why our fast intuitive thinking often misleads us..."
                value={sEssence}
                onChange={onEssenceChange}
                error={errors.s_essence}
              />

              <VoicesEditor items={voices} onChange={setVoices} error={errors.s_voices} />

              <AtAGlanceEditor value={atAGlance} onChange={setAtAGlance} error={errors.s_at_a_glance} />

              <TextSectionAccordion
                title="Heart"
                required
                defaultOpen
                hint="The central argument of the book in a paragraph"
                rows={4}
                placeholder="The heart of the book is..."
                value={sHeart}
                onChange={onHeartChange}
                error={errors.s_heart}
              />

              <CoreIdeasEditor items={coreIdeas} onChange={setCoreIdeas} error={errors.s_core_ideas} />

              <TakeawayEditor value={takeaway} onChange={onTakeawayChange} error={errors.s_takeaway} />

              <QuizEditor items={quizItems} onChange={setQuizItems} radioNamePrefix="quiz_answer_" error={errors.s_quiz} />

              <SourcesEditor items={sources} onChange={setSources} labelPlaceholder="Book title, article name..." error={errors.s_sources} />

              {/* Optional sections */}
              <TextSectionAccordion
                title="Why It Endures"
                rows={3}
                placeholder="Why this book is still relevant today..."
                value={sWhyEndures}
                onChange={onWhyEnduresChange}
              />

              <StructureEditor items={structure} onChange={setStructure} />

              <TextSectionAccordion
                title="World Context"
                rows={3}
                placeholder="The historical or cultural context when the book was written..."
                value={sWorldContext}
                onChange={onWorldContextChange}
              />

              <AuthorContextEditor value={authorContext} onChange={setAuthorContext} />

              <TextSectionAccordion
                title="Critique & Limitations"
                rows={3}
                placeholder="Where the book falls short or has been criticized..."
                value={sCritique}
                onChange={onCritiqueChange}
              />

              {/* Submit */}
              {errors.image_urls && (
                <div className="bg-bad/10 rounded-2xl px-4 py-3 mb-3">
                  <p className="text-bad text-sm">{errors.image_urls}</p>
                </div>
              )}
              {serverError && <p className="text-bad text-sm mb-3">{serverError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary h-12 w-full mt-4"
              >
                {submitting ? "Submitting..." : "Submit post"}
              </button>
            </>
          )}
        </div>

        <BottomNav activeTab="create" />
      </div>
    </div>
  )
}
