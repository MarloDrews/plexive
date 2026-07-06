"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { invalidateFeedCaches } from "@/app/lib/swr"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"
import { fcStr, type Post } from "@/types/post"
import { CATEGORIES } from "@/lib/interests"
import BottomNav from "@/app/components/BottomNav"
import Spinner from "@/components/Spinner"

const API_URL = process.env.NEXT_PUBLIC_API_URL

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

interface Interest { id: number; name: string; slug: string }

const inputCls =
  "field text-sm py-3"
const labelCls = "label-caps mb-2 mt-4 block"

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null
  return <p className="text-bad text-xs mt-1">{msg}</p>
}

function Accordion({
  title, required, children, defaultOpen,
}: {
  title: string; required?: boolean; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="card overflow-hidden mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-ink">{title}</span>
        <div className="flex items-center gap-2">
          {required && (
            <span className="text-xs text-lamp bg-lamp/15 rounded-full px-2 py-0.5">
              Required
            </span>
          )}
          {!required && (
            <span className="text-xs text-ink-muted bg-white/[0.06] rounded-full px-2 py-0.5">
              Optional
            </span>
          )}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className={`text-ink-dim transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-surface-0/40">{children}</div>}
    </div>
  )
}

// Default state shapes
const emptyVoice = () => ({ quote: "", attribution: "" })
const emptyCoreIdea = () => ({ title: "", body: "", in_practice: "", visual_svg: "", image_url: "", quote: "" })
const emptyQuizItem = () => ({ question: "", options: ["", "", "", ""] as [string, string, string, string], answer_index: "0" as "0"|"1"|"2"|"3", explanation: "" })
const emptySource = () => ({ label: "", url: "", type: "article" as string })

type Voice = ReturnType<typeof emptyVoice>
type CoreIdea = ReturnType<typeof emptyCoreIdea>
type QuizItem = ReturnType<typeof emptyQuizItem>
type Source = ReturnType<typeof emptySource>

const SOURCE_TYPES = ["wikipedia", "paper", "book", "article", "database"]

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
  const [fc, setFc] = useState({
    cover_url: "", title: "", author: "", essence: "",
    teaser1: "", teaser2: "", teaser3: "",
    difficulty: "2" as "1"|"2"|"3",
    year: "", genre: "",
  })

  // Section states — simple text sections
  const [sEssence, setSEssence] = useState("")
  const [sWhyEndures, setSWhyEndures] = useState("")
  const [sHeart, setSHeart] = useState("")
  const [sWorldContext, setSWorldContext] = useState("")
  const [sCritique, setSCritique] = useState("")

  // At-a-glance section
  const [atAGlance, setAtAGlance] = useState({
    genre: "", year: "", country: "", pages: "",
    reading_ease: "2" as "1"|"2"|"3",
    post_difficulty: "2" as "1"|"2"|"3",
    best_for: "",
  })

  // Array sections
  const [voices, setVoices] = useState<Voice[]>([emptyVoice(), emptyVoice(), emptyVoice()])
  const [structure, setStructure] = useState<string[]>(["", "", ""])
  const [coreIdeas, setCoreIdeas] = useState<CoreIdea[]>(Array.from({ length: 6 }, emptyCoreIdea))
  const [takeaway, setTakeaway] = useState({ framing: "framework" as "framework"|"question", body: "", visual_svg: "" })
  const [quizItems, setQuizItems] = useState<QuizItem[]>(Array.from({ length: 5 }, emptyQuizItem))
  const [authorContext, setAuthorContext] = useState({ body: "", image_url: "", image_attribution: "", wikipedia_url: "" })
  const [sources, setSources] = useState<Source[]>([emptySource()])

  // Generic form state (non-Books formats)
  const [gFc, setGFc] = useState({
    field: "", headline: "",
    name: "", role: "", born: "", died: "", nationality: "",
    concept_name: "", one_liner: "",
    the_question: "", framing: "empirical",
    era: "", location: "",
    authors_compact: "", venue: "", key_finding_one_line: "", published_year: "",
    essence: "", teaser1: "", teaser2: "", teaser3: "",
    difficulty: "2" as "1"|"2"|"3",
  })
  const [genericBody, setGenericBody] = useState("")

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  // Interests via SWR: the list is static, so a revisit renders it from
  // cache instead of refetching. Error keeps the old behavior (empty list).
  const { data: interestsData } = useSWR<Interest[]>("/api/interests")
  const allInterests: Interest[] = interestsData ?? []

  // Cover upload
  const [coverUploading, setCoverUploading] = useState(false)

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState("")

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (step !== 2) return
    const trimmed = searchQuery.trim()
    if (!trimmed) { setSearchResults([]); return }
    setSearchLoading(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (selectedFormat) params.set("format", selectedFormat)
        const res = await apiFetch(`/api/search?${params}`)
        const data: Post[] = await res.json()
        setSearchResults(data.slice(0, 5))
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, step, selectedFormat])

  function setFcField(key: keyof typeof fc, value: string) {
    setFc((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => { const n = { ...prev }; delete n[`fc_${key}`]; return n })
  }

  function setGFcField(key: keyof typeof gFc, value: string) {
    setGFc((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => { const n = { ...prev }; delete n[`gfc_${key}`]; return n })
  }

  function clearError(key: string) {
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  function toggleInterest(slug: string) {
    setSelectedInterests((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= 5) return prev
      return [...prev, slug]
    })
    clearError("interests")
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch("/api/upload/image", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Upload failed")
      setFcField("cover_url", data.url)
    } catch (err) {
      setErrors((prev) => ({ ...prev, cover: err instanceof Error ? err.message : "Upload failed" }))
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

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
        if (res.status === 201) { invalidateFeedCaches(); setStep("success") }
        else { const data = await res.json(); setServerError(data.detail ?? "Something went wrong.") }
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
        invalidateFeedCaches()
        setStep("success")
      } else {
        const data = await res.json()
        setServerError(data.detail ?? "Something went wrong.")
      }
    } catch {
      setServerError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setGFc({ field: "", headline: "", name: "", role: "", born: "", died: "", nationality: "", concept_name: "", one_liner: "", the_question: "", framing: "empirical", era: "", location: "", authors_compact: "", venue: "", key_finding_one_line: "", published_year: "", essence: "", teaser1: "", teaser2: "", teaser3: "", difficulty: "2" })
    setGenericBody("")
    setStep(1); setSelectedFormat(null); setSearchQuery(""); setSearchResults([])
    setFc({ cover_url: "", title: "", author: "", essence: "", teaser1: "", teaser2: "", teaser3: "", difficulty: "2", year: "", genre: "" })
    setSEssence(""); setSWhyEndures(""); setSHeart(""); setSWorldContext(""); setSCritique("")
    setAtAGlance({ genre: "", year: "", country: "", pages: "", reading_ease: "2", post_difficulty: "2", best_for: "" })
    setVoices([emptyVoice(), emptyVoice(), emptyVoice()])
    setStructure(["", "", ""])
    setCoreIdeas(Array.from({ length: 6 }, emptyCoreIdea))
    setTakeaway({ framing: "framework", body: "", visual_svg: "" })
    setQuizItems(Array.from({ length: 5 }, emptyQuizItem))
    setAuthorContext({ body: "", image_url: "", image_attribution: "", wikipedia_url: "" })
    setSources([emptySource()])
    setSelectedInterests([]); setErrors({}); setServerError("")
  }

  const bySlug = new Map(allInterests.map((i) => [i.slug, i]))
  const interestSections = CATEGORIES.map((cat) => ({
    label: cat.label,
    items: cat.slugs.flatMap((s) => { const i = bySlug.get(s); return i ? [i] : [] }),
  })).filter((sec) => sec.items.length > 0)

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
              {user?.is_verified ? "It is now live in the feed." : "It will appear once approved."}
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
        <div className="h-full overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 pt-6">

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
                      onClick={() => setSelectedFormat(fmt.id)}
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
          {step === 3 && selectedFormat && selectedFormat !== "books" && (() => {
            const fmt = selectedFormat
            const fmtLabel = FORMAT_STYLES[fmt]?.label ?? fmt
            return (
              <>
                <h1 className="font-serif text-ink text-2xl font-medium mb-5">{fmtLabel} post</h1>

                {/* Feed card */}
                <div className="rounded-3xl bg-white/[0.04] px-4 pb-4 pt-3 mb-3">
                  <p className="label-caps text-lamp mb-3">Feed Card</p>

                  {fmt === "facts" && (
                    <>
                      <label className={labelCls}>Field *</label>
                      <input type="text" value={gFc.field} onChange={e => setGFcField("field", e.target.value)} placeholder="Physics" className={inputCls} />
                      <FieldError msg={errors.gfc_field} />
                      <label className={labelCls}>Headline *</label>
                      <input type="text" value={gFc.headline} onChange={e => setGFcField("headline", e.target.value)} placeholder="The mind-blowing fact in one line..." className={inputCls} />
                      <FieldError msg={errors.gfc_headline} />
                    </>
                  )}

                  {fmt === "people" && (
                    <>
                      <label className={labelCls}>Full name *</label>
                      <input type="text" value={gFc.name} onChange={e => setGFcField("name", e.target.value)} placeholder="Marie Curie" className={inputCls} />
                      <FieldError msg={errors.gfc_name} />
                      <label className={labelCls}>Role *</label>
                      <input type="text" value={gFc.role} onChange={e => setGFcField("role", e.target.value)} placeholder="Physicist & Chemist" className={inputCls} />
                      <FieldError msg={errors.gfc_role} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Born</label>
                          <input type="text" value={gFc.born} onChange={e => setGFcField("born", e.target.value)} placeholder="1867" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Died</label>
                          <input type="text" value={gFc.died} onChange={e => setGFcField("died", e.target.value)} placeholder="1934" className={inputCls} />
                        </div>
                      </div>
                      <label className={labelCls}>Nationality</label>
                      <input type="text" value={gFc.nationality} onChange={e => setGFcField("nationality", e.target.value)} placeholder="Polish-French" className={inputCls} />
                    </>
                  )}

                  {fmt === "concepts" && (
                    <>
                      <label className={labelCls}>Concept name *</label>
                      <input type="text" value={gFc.concept_name} onChange={e => setGFcField("concept_name", e.target.value)} placeholder="Confirmation Bias" className={inputCls} />
                      <FieldError msg={errors.gfc_concept_name} />
                      <label className={labelCls}>Field</label>
                      <input type="text" value={gFc.field} onChange={e => setGFcField("field", e.target.value)} placeholder="Psychology" className={inputCls} />
                      <label className={labelCls}>One-liner *</label>
                      <input type="text" value={gFc.one_liner} onChange={e => setGFcField("one_liner", e.target.value)} placeholder="The concept in a single clear sentence..." className={inputCls} />
                      <FieldError msg={errors.gfc_one_liner} />
                    </>
                  )}

                  {fmt === "questions" && (
                    <>
                      <label className={labelCls}>The question *</label>
                      <input type="text" value={gFc.the_question} onChange={e => setGFcField("the_question", e.target.value)} placeholder="Is free will an illusion?" className={inputCls} />
                      <FieldError msg={errors.gfc_the_question} />
                      <label className={labelCls}>Framing</label>
                      <select value={gFc.framing} onChange={e => setGFcField("framing", e.target.value)} className={inputCls}>
                        {["empirical", "ethical", "aesthetic", "practical", "metaphysical"].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </>
                  )}

                  {fmt === "stories" && (
                    <>
                      <label className={labelCls}>Headline *</label>
                      <input type="text" value={gFc.headline} onChange={e => setGFcField("headline", e.target.value)} placeholder="The story in one compelling line..." className={inputCls} />
                      <FieldError msg={errors.gfc_headline} />
                      <label className={labelCls}>Era *</label>
                      <input type="text" value={gFc.era} onChange={e => setGFcField("era", e.target.value)} placeholder="1940s" className={inputCls} />
                      <FieldError msg={errors.gfc_era} />
                      <label className={labelCls}>Location</label>
                      <input type="text" value={gFc.location} onChange={e => setGFcField("location", e.target.value)} placeholder="Berlin, Germany" className={inputCls} />
                    </>
                  )}

                  {fmt === "academy" && (
                    <>
                      <label className={labelCls}>Paper / Article title *</label>
                      <input type="text" value={gFc.concept_name} onChange={e => setGFcField("concept_name", e.target.value)} placeholder="On the Origin of Species" className={inputCls} />
                      <FieldError msg={errors.gfc_concept_name} />
                      <label className={labelCls}>Field</label>
                      <input type="text" value={gFc.field} onChange={e => setGFcField("field", e.target.value)} placeholder="Evolutionary Biology" className={inputCls} />
                      <label className={labelCls}>Authors *</label>
                      <input type="text" value={gFc.authors_compact} onChange={e => setGFcField("authors_compact", e.target.value)} placeholder="Darwin, C." className={inputCls} />
                      <FieldError msg={errors.gfc_authors_compact} />
                      <label className={labelCls}>Journal / Venue</label>
                      <input type="text" value={gFc.venue} onChange={e => setGFcField("venue", e.target.value)} placeholder="Nature" className={inputCls} />
                      <label className={labelCls}>Key finding (one line) *</label>
                      <input type="text" value={gFc.key_finding_one_line} onChange={e => setGFcField("key_finding_one_line", e.target.value)} placeholder="Species evolve through natural selection..." className={inputCls} />
                      <FieldError msg={errors.gfc_key_finding_one_line} />
                      <label className={labelCls}>Published year</label>
                      <input type="number" value={gFc.published_year} onChange={e => setGFcField("published_year", e.target.value)} placeholder="1859" className={inputCls} />
                    </>
                  )}

                  {fmt !== "academy" && (
                    <>
                      <label className={labelCls}>Essence * <span className="normal-case text-ink-faint">(why this matters)</span></label>
                      <textarea value={gFc.essence} onChange={e => setGFcField("essence", e.target.value)} maxLength={300} rows={3} placeholder="In one or two sentences..." className={`${inputCls} resize-none`} />
                      <FieldError msg={errors.gfc_essence} />
                    </>
                  )}

                  <label className={labelCls}>Teaser 1 *</label>
                  <input type="text" value={gFc.teaser1} onChange={e => setGFcField("teaser1", e.target.value)} maxLength={80} placeholder="What you'll learn..." className={inputCls} />
                  <FieldError msg={errors.gfc_teaser1} />
                  <label className={labelCls}>Teaser 2 *</label>
                  <input type="text" value={gFc.teaser2} onChange={e => setGFcField("teaser2", e.target.value)} maxLength={80} placeholder="Another insight..." className={inputCls} />
                  <FieldError msg={errors.gfc_teaser2} />
                  <label className={labelCls}>Teaser 3 *</label>
                  <input type="text" value={gFc.teaser3} onChange={e => setGFcField("teaser3", e.target.value)} maxLength={80} placeholder="A third takeaway..." className={inputCls} />
                  <FieldError msg={errors.gfc_teaser3} />

                  <div className="mt-1">
                    <div>
                      <label className={labelCls}>Difficulty *</label>
                      <select value={gFc.difficulty} onChange={e => setGFcField("difficulty", e.target.value as "1"|"2"|"3")} className={inputCls}>
                        <option value="1">1 — Easy</option>
                        <option value="2">2 — Medium</option>
                        <option value="3">3 — Hard</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Interests */}
                <div className="card px-4 pb-4 pt-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="label-caps text-lamp">Interests *</p>
                    <span className="text-ink-muted text-xs font-mono">{selectedInterests.length}/5</span>
                  </div>
                  <FieldError msg={errors.interests} />
                  {interestSections.map((sec) => (
                    <div key={sec.label} className="mb-3">
                      <p className="text-ink-faint text-xs mb-1.5">{sec.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sec.items.map((interest) => {
                          const isSelected = selectedInterests.includes(interest.slug)
                          return (
                            <button key={interest.slug} onClick={() => toggleInterest(interest.slug)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 ${isSelected ? "bg-white/[0.12] text-ink" : "bg-white/[0.04] text-ink-dim"}`}>
                              {interest.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sections */}
                <p className="label-caps mb-3 mt-5">Sections</p>

                <Accordion title="Body" required defaultOpen>
                  <p className="text-ink-muted text-xs mb-2">The main content — explain, describe, or narrate in full</p>
                  <textarea value={genericBody} onChange={e => { setGenericBody(e.target.value); clearError("generic_body") }} rows={10} placeholder="Write the full content here..." className={`${inputCls} resize-none`} />
                  <FieldError msg={errors.generic_body} />
                </Accordion>

                <Accordion title="Quiz (5–10 questions)" required defaultOpen>
                  <FieldError msg={errors.s_quiz} />
                  {quizItems.map((q, i) => (
                    <div key={i} className="mb-4 bg-white/[0.04] rounded-2xl p-3">
                      <p className="text-ink-muted text-xs mb-2">Question {i + 1}</p>
                      <label className="text-ink-faint text-xs mb-1 block">Question text *</label>
                      <textarea value={q.question} onChange={e => { const n = [...quizItems]; n[i] = { ...n[i], question: e.target.value }; setQuizItems(n) }} rows={2} className={`${inputCls} resize-none mb-2`} />
                      {(["A", "B", "C", "D"] as const).map((opt, j) => (
                        <div key={j} className="flex items-center gap-2 mb-1.5">
                          <input type="radio" name={`gquiz_answer_${i}`} checked={q.answer_index === String(j) as "0"|"1"|"2"|"3"} onChange={() => { const n = [...quizItems]; n[i] = { ...n[i], answer_index: String(j) as "0"|"1"|"2"|"3" }; setQuizItems(n) }} className="shrink-0 accent-lamp" />
                          <input type="text" value={q.options[j]} onChange={e => { const n = [...quizItems]; const opts = [...n[i].options] as [string,string,string,string]; opts[j] = e.target.value; n[i] = { ...n[i], options: opts }; setQuizItems(n) }} placeholder={`Option ${opt}`} className={`${inputCls} flex-1`} />
                        </div>
                      ))}
                      <label className="text-ink-faint text-xs mb-1 block mt-2">Explanation *</label>
                      <textarea value={q.explanation} onChange={e => { const n = [...quizItems]; n[i] = { ...n[i], explanation: e.target.value }; setQuizItems(n) }} rows={2} placeholder="Why this is the correct answer..." className={`${inputCls} resize-none`} />
                    </div>
                  ))}
                  <div className="flex gap-3">
                    {quizItems.length < 10 && <button onClick={() => setQuizItems([...quizItems, emptyQuizItem()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add question</button>}
                    {quizItems.length > 5 && <button onClick={() => setQuizItems(quizItems.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>}
                  </div>
                </Accordion>

                <Accordion title="Sources (1–10)" required defaultOpen>
                  <FieldError msg={errors.s_sources} />
                  {sources.map((s, i) => (
                    <div key={i} className="mb-3 bg-white/[0.04] rounded-2xl p-3">
                      <label className="text-ink-faint text-xs mb-1 block">Label *</label>
                      <input type="text" value={s.label} onChange={e => { const n = [...sources]; n[i] = { ...n[i], label: e.target.value }; setSources(n) }} placeholder="Source name..." className={`${inputCls} mb-2`} />
                      <label className="text-ink-faint text-xs mb-1 block">URL *</label>
                      <input type="url" value={s.url} onChange={e => { const n = [...sources]; n[i] = { ...n[i], url: e.target.value }; setSources(n) }} placeholder="https://..." className={`${inputCls} mb-2`} />
                      <label className="text-ink-faint text-xs mb-1 block">Type</label>
                      <select value={s.type} onChange={e => { const n = [...sources]; n[i] = { ...n[i], type: e.target.value }; setSources(n) }} className={inputCls}>
                        {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    {sources.length < 10 && <button onClick={() => setSources([...sources, emptySource()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add source</button>}
                    {sources.length > 1 && <button onClick={() => setSources(sources.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>}
                  </div>
                </Accordion>

                {serverError && <p className="text-bad text-sm mb-3">{serverError}</p>}
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary h-12 w-full mt-4">
                  {submitting ? "Submitting..." : "Submit post"}
                </button>
              </>
            )
          })()}

          {/* STEP 3: Books form */}
          {step === 3 && selectedFormat === "books" && (
            <>
              <h1 className="font-serif text-ink text-2xl font-medium mb-5">Books post</h1>

              {/* Feed Card block */}
              <div className="border border-lamp/30 rounded-card px-4 pb-4 pt-3 mb-3 bg-lamp/5">
                <p className="label-caps text-lamp mb-3">Feed Card</p>

                <label className={labelCls}>Book title *</label>
                <input type="text" value={fc.title} onChange={(e) => setFcField("title", e.target.value)} maxLength={200} placeholder="Thinking, Fast and Slow" className={inputCls} data-err={errors.fc_title || undefined} />
                <FieldError msg={errors.fc_title} />

                <label className={labelCls}>Author *</label>
                <input type="text" value={fc.author} onChange={(e) => setFcField("author", e.target.value)} placeholder="Daniel Kahneman" className={inputCls} />
                <FieldError msg={errors.fc_author} />

                <label className={labelCls}>Essence * <span className="normal-case text-ink-faint">(~200 chars, why this book matters)</span></label>
                <textarea value={fc.essence} onChange={(e) => setFcField("essence", e.target.value)} maxLength={300} rows={3} placeholder="The core insight in one or two sentences..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.fc_essence} />

                <label className={labelCls}>Teaser 1 * <span className="normal-case text-ink-faint">(~40 chars)</span></label>
                <input type="text" value={fc.teaser1} onChange={(e) => setFcField("teaser1", e.target.value)} maxLength={80} placeholder="What you'll learn..." className={inputCls} />
                <FieldError msg={errors.fc_teaser1} />
                <label className={labelCls}>Teaser 2 *</label>
                <input type="text" value={fc.teaser2} onChange={(e) => setFcField("teaser2", e.target.value)} maxLength={80} placeholder="Another insight..." className={inputCls} />
                <FieldError msg={errors.fc_teaser2} />
                <label className={labelCls}>Teaser 3 *</label>
                <input type="text" value={fc.teaser3} onChange={(e) => setFcField("teaser3", e.target.value)} maxLength={80} placeholder="A third takeaway..." className={inputCls} />
                <FieldError msg={errors.fc_teaser3} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Difficulty *</label>
                    <select value={fc.difficulty} onChange={(e) => setFcField("difficulty", e.target.value as "1"|"2"|"3")} className={inputCls}>
                      <option value="1">1 — Easy</option>
                      <option value="2">2 — Medium</option>
                      <option value="3">3 — Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Year *</label>
                    <input type="number" value={fc.year} onChange={(e) => setFcField("year", e.target.value)} placeholder="2011" className={inputCls} />
                    <FieldError msg={errors.fc_year} />
                  </div>
                  <div>
                    <label className={labelCls}>Genre *</label>
                    <input type="text" value={fc.genre} onChange={(e) => setFcField("genre", e.target.value)} placeholder="Psychology" className={inputCls} />
                    <FieldError msg={errors.fc_genre} />
                  </div>
                </div>

                <label className={labelCls}>Cover image</label>
                <div className="flex items-center gap-3">
                  <label className="btn btn-ghost shrink-0 px-3 py-2 text-xs cursor-pointer">
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverUpload} />
                    {coverUploading ? "Uploading..." : "Upload"}
                  </label>
                  {fc.cover_url && (
                    <img src={`${API_URL}${fc.cover_url}`} alt="" className="w-10 h-14 object-cover rounded" />
                  )}
                  {!fc.cover_url && <span className="text-ink-faint text-xs">or type /uploads/… URL</span>}
                </div>
                <FieldError msg={errors.cover} />
              </div>

              {/* Interests */}
              <div className="card px-4 pb-4 pt-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="label-caps text-lamp">Interests *</p>
                  <span className="text-ink-muted text-xs font-mono">{selectedInterests.length}/5</span>
                </div>
                <FieldError msg={errors.interests} />
                {interestSections.map((sec) => (
                  <div key={sec.label} className="mb-3">
                    <p className="text-ink-faint text-xs mb-1.5">{sec.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sec.items.map((interest) => {
                        const isSelected = selectedInterests.includes(interest.slug)
                        return (
                          <button
                            key={interest.slug}
                            onClick={() => toggleInterest(interest.slug)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 ${isSelected ? "bg-white/[0.12] text-ink" : "bg-white/[0.04] text-ink-dim"}`}
                          >
                            {interest.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Section accordions */}
              <p className="label-caps mb-3 mt-5">Sections</p>

              <Accordion title="Essence" required defaultOpen>
                <p className="text-ink-muted text-xs mb-2">The core insight in one strong sentence (shown full-screen on the detail page)</p>
                <textarea value={sEssence} onChange={(e) => { setSEssence(e.target.value); clearError("s_essence") }} rows={2} maxLength={300} placeholder="Why our fast intuitive thinking often misleads us..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.s_essence} />
              </Accordion>

              <Accordion title="Voices (3–4 quotes)" required defaultOpen>
                <FieldError msg={errors.s_voices} />
                {voices.map((v, i) => (
                  <div key={i} className="mb-3 bg-white/[0.04] rounded-2xl p-3">
                    <p className="text-ink-muted text-xs mb-2">Quote {i + 1}</p>
                    <textarea value={v.quote} onChange={(e) => { const n = [...voices]; n[i] = { ...n[i], quote: e.target.value }; setVoices(n) }} rows={2} placeholder="Quote text..." className={`${inputCls} resize-none mb-2`} />
                    <input type="text" value={v.attribution} onChange={(e) => { const n = [...voices]; n[i] = { ...n[i], attribution: e.target.value }; setVoices(n) }} placeholder="Attribution (name, role, page, etc.)" className={inputCls} />
                  </div>
                ))}
                {voices.length < 4 && (
                  <button onClick={() => setVoices([...voices, emptyVoice()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add quote</button>
                )}
                {voices.length > 3 && (
                  <button onClick={() => setVoices(voices.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1 ml-3">Remove last</button>
                )}
              </Accordion>

              <Accordion title="At a Glance" required defaultOpen>
                <FieldError msg={errors.s_at_a_glance} />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "genre" as const, label: "Genre", placeholder: "Psychology" },
                    { key: "year" as const, label: "Year", placeholder: "2011" },
                    { key: "country" as const, label: "Country", placeholder: "United States" },
                    { key: "pages" as const, label: "Pages", placeholder: "499" },
                    { key: "best_for" as const, label: "Best for", placeholder: "Curious minds" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-ink-muted text-xs mb-1 block">{label}</label>
                      <input type="text" value={atAGlance[key]} onChange={(e) => setAtAGlance({ ...atAGlance, [key]: e.target.value })} placeholder={placeholder} className={inputCls} />
                    </div>
                  ))}
                  <div>
                    <label className="text-ink-muted text-xs mb-1 block">Reading ease</label>
                    <select value={atAGlance.reading_ease} onChange={(e) => setAtAGlance({ ...atAGlance, reading_ease: e.target.value as "1"|"2"|"3" })} className={inputCls}>
                      <option value="1">1 — Easy</option><option value="2">2 — Moderate</option><option value="3">3 — Dense</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-ink-muted text-xs mb-1 block">Difficulty</label>
                    <select value={atAGlance.post_difficulty} onChange={(e) => setAtAGlance({ ...atAGlance, post_difficulty: e.target.value as "1"|"2"|"3" })} className={inputCls}>
                      <option value="1">1 — Easy</option><option value="2">2 — Medium</option><option value="3">3 — Hard</option>
                    </select>
                  </div>
                </div>
              </Accordion>

              <Accordion title="Heart" required defaultOpen>
                <p className="text-ink-muted text-xs mb-2">The central argument of the book in a paragraph</p>
                <textarea value={sHeart} onChange={(e) => { setSHeart(e.target.value); clearError("s_heart") }} rows={4} placeholder="The heart of the book is..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.s_heart} />
              </Accordion>

              <Accordion title="Core Ideas (6–12)" required defaultOpen>
                <FieldError msg={errors.s_core_ideas} />
                {coreIdeas.map((ci, i) => (
                  <div key={i} className="mb-4 bg-white/[0.04] rounded-2xl p-3">
                    <p className="text-ink-muted text-xs mb-2">Idea {i + 1}</p>
                    <label className="text-ink-faint text-xs mb-1 block">Title *</label>
                    <input type="text" value={ci.title} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], title: e.target.value }; setCoreIdeas(n) }} placeholder="Concept name..." className={`${inputCls} mb-2`} />
                    <label className="text-ink-faint text-xs mb-1 block">Body *</label>
                    <textarea value={ci.body} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], body: e.target.value }; setCoreIdeas(n) }} rows={3} placeholder="Explain the idea..." className={`${inputCls} resize-none mb-2`} />
                    <label className="text-ink-faint text-xs mb-1 block">In practice (optional)</label>
                    <input type="text" value={ci.in_practice} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], in_practice: e.target.value }; setCoreIdeas(n) }} placeholder="How to apply this..." className={`${inputCls} mb-2`} />
                    <label className="text-ink-faint text-xs mb-1 block">Pull quote (optional)</label>
                    <input type="text" value={ci.quote} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], quote: e.target.value }; setCoreIdeas(n) }} placeholder="A notable quote..." className={inputCls} />
                  </div>
                ))}
                <div className="flex gap-3">
                  {coreIdeas.length < 12 && (
                    <button onClick={() => setCoreIdeas([...coreIdeas, emptyCoreIdea()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add idea</button>
                  )}
                  {coreIdeas.length > 6 && (
                    <button onClick={() => setCoreIdeas(coreIdeas.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
                  )}
                </div>
              </Accordion>

              <Accordion title="Takeaway" required defaultOpen>
                <FieldError msg={errors.s_takeaway} />
                <label className="text-ink-muted text-xs mb-1 block">Framing</label>
                <select value={takeaway.framing} onChange={(e) => setTakeaway({ ...takeaway, framing: e.target.value as "framework"|"question" })} className={`${inputCls} mb-3`}>
                  <option value="framework">Framework (a model or principle)</option>
                  <option value="question">Question (a reflection prompt)</option>
                </select>
                <label className="text-ink-muted text-xs mb-1 block">Body *</label>
                <textarea value={takeaway.body} onChange={(e) => { setTakeaway({ ...takeaway, body: e.target.value }); clearError("s_takeaway") }} rows={3} placeholder="The key thing to take away..." className={`${inputCls} resize-none`} />
              </Accordion>

              <Accordion title="Quiz (5–10 questions)" required defaultOpen>
                <FieldError msg={errors.s_quiz} />
                {quizItems.map((q, i) => (
                  <div key={i} className="mb-4 bg-white/[0.04] rounded-2xl p-3">
                    <p className="text-ink-muted text-xs mb-2">Question {i + 1}</p>
                    <label className="text-ink-faint text-xs mb-1 block">Question text *</label>
                    <textarea value={q.question} onChange={(e) => { const n = [...quizItems]; n[i] = { ...n[i], question: e.target.value }; setQuizItems(n) }} rows={2} className={`${inputCls} resize-none mb-2`} />
                    {(["A", "B", "C", "D"] as const).map((opt, j) => (
                      <div key={j} className="flex items-center gap-2 mb-1.5">
                        <input
                          type="radio"
                          name={`quiz_answer_${i}`}
                          checked={q.answer_index === String(j) as "0"|"1"|"2"|"3"}
                          onChange={() => { const n = [...quizItems]; n[i] = { ...n[i], answer_index: String(j) as "0"|"1"|"2"|"3" }; setQuizItems(n) }}
                          className="shrink-0 accent-lamp"
                        />
                        <input
                          type="text"
                          value={q.options[j]}
                          onChange={(e) => { const n = [...quizItems]; const opts = [...n[i].options] as [string,string,string,string]; opts[j] = e.target.value; n[i] = { ...n[i], options: opts }; setQuizItems(n) }}
                          placeholder={`Option ${opt}`}
                          className={`${inputCls} flex-1`}
                        />
                      </div>
                    ))}
                    <label className="text-ink-faint text-xs mb-1 block mt-2">Explanation *</label>
                    <textarea value={q.explanation} onChange={(e) => { const n = [...quizItems]; n[i] = { ...n[i], explanation: e.target.value }; setQuizItems(n) }} rows={2} placeholder="Why this is the correct answer..." className={`${inputCls} resize-none`} />
                  </div>
                ))}
                <div className="flex gap-3">
                  {quizItems.length < 10 && (
                    <button onClick={() => setQuizItems([...quizItems, emptyQuizItem()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add question</button>
                  )}
                  {quizItems.length > 5 && (
                    <button onClick={() => setQuizItems(quizItems.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
                  )}
                </div>
              </Accordion>

              <Accordion title="Sources (1–10)" required defaultOpen>
                <FieldError msg={errors.s_sources} />
                {sources.map((s, i) => (
                  <div key={i} className="mb-3 bg-white/[0.04] rounded-2xl p-3">
                    <label className="text-ink-faint text-xs mb-1 block">Label *</label>
                    <input type="text" value={s.label} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], label: e.target.value }; setSources(n) }} placeholder="Book title, article name..." className={`${inputCls} mb-2`} />
                    <label className="text-ink-faint text-xs mb-1 block">URL *</label>
                    <input type="url" value={s.url} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], url: e.target.value }; setSources(n) }} placeholder="https://..." className={`${inputCls} mb-2`} />
                    <label className="text-ink-faint text-xs mb-1 block">Type</label>
                    <select value={s.type} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], type: e.target.value }; setSources(n) }} className={inputCls}>
                      {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
                <div className="flex gap-3">
                  {sources.length < 10 && (
                    <button onClick={() => setSources([...sources, emptySource()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add source</button>
                  )}
                  {sources.length > 1 && (
                    <button onClick={() => setSources(sources.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
                  )}
                </div>
              </Accordion>

              {/* Optional sections */}
              <Accordion title="Why It Endures">
                <textarea value={sWhyEndures} onChange={(e) => setSWhyEndures(e.target.value)} rows={3} placeholder="Why this book is still relevant today..." className={`${inputCls} resize-none`} />
              </Accordion>

              <Accordion title="Structure">
                {structure.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input type="text" value={s} onChange={(e) => { const n = [...structure]; n[i] = e.target.value; setStructure(n) }} placeholder={`Part ${i + 1}...`} className={`${inputCls} flex-1`} />
                    {structure.length > 1 && (
                      <button onClick={() => setStructure(structure.filter((_, idx) => idx !== i))} className="text-ink-muted text-lg w-8 h-10 flex items-center justify-center shrink-0 cursor-pointer">×</button>
                    )}
                  </div>
                ))}
                {structure.length < 10 && (
                  <button onClick={() => setStructure([...structure, ""])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1 mt-1">+ Add part</button>
                )}
              </Accordion>

              <Accordion title="World Context">
                <textarea value={sWorldContext} onChange={(e) => setSWorldContext(e.target.value)} rows={3} placeholder="The historical or cultural context when the book was written..." className={`${inputCls} resize-none`} />
              </Accordion>

              <Accordion title="Author Context">
                <textarea value={authorContext.body} onChange={(e) => setAuthorContext({ ...authorContext, body: e.target.value })} rows={3} placeholder="About the author..." className={`${inputCls} resize-none mb-2`} />
                <label className="text-ink-faint text-xs mb-1 block">Wikipedia URL</label>
                <input type="url" value={authorContext.wikipedia_url} onChange={(e) => setAuthorContext({ ...authorContext, wikipedia_url: e.target.value })} placeholder="https://en.wikipedia.org/wiki/..." className={inputCls} />
              </Accordion>

              <Accordion title="Critique &amp; Limitations">
                <textarea value={sCritique} onChange={(e) => setSCritique(e.target.value)} rows={3} placeholder="Where the book falls short or has been criticized..." className={`${inputCls} resize-none`} />
              </Accordion>

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
