"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"
import { fcStr, type Post } from "@/types/post"
import { CATEGORIES } from "@/app/onboarding/InterestPicker"
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

// Only the Books wizard exists so far.
const ENABLED_FORMATS = new Set<FormatId>(["books"])

const FORMATS = FORMAT_IDS.map((id) => ({
  id,
  name: FORMAT_STYLES[id].label,
  accent: FORMAT_STYLES[id].border,
  description: FORMAT_DESCRIPTIONS[id],
  enabled: ENABLED_FORMATS.has(id),
}))

interface Interest { id: number; name: string; slug: string }

const inputCls =
  "w-full bg-surface-2 border border-edge-strong rounded-field px-4 py-3 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-600"
const labelCls = "text-zinc-400 text-xs uppercase tracking-wider mb-2 mt-4 block"

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null
  return <p className="text-red-400 text-xs mt-1">{msg}</p>
}

function Accordion({
  title, required, children, defaultOpen,
}: {
  title: string; required?: boolean; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60 text-left"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <div className="flex items-center gap-2">
          {required && (
            <span className="text-xs text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
              Required
            </span>
          )}
          {!required && (
            <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
              Optional
            </span>
          )}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className={`text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-zinc-950/40">{children}</div>}
    </div>
  )
}

// Default state shapes
const emptyVoice = () => ({ quote: "", attribution: "" })
const emptyCoreIdea = () => ({ title: "", body: "", in_practice: "", visual_svg: "", image_url: "", quote: "" })
const emptyQuizItem = () => ({ question: "", options: ["", "", "", ""] as [string, string, string, string], answer_index: "0" as "0"|"1"|"2"|"3", explanation: "" })
const emptySource = () => ({ label: "", url: "", type: "article" as string })
const emptyRelated = () => ({ post_id: "", title: "", format: "books", mini_teaser: "" })

type Voice = ReturnType<typeof emptyVoice>
type CoreIdea = ReturnType<typeof emptyCoreIdea>
type QuizItem = ReturnType<typeof emptyQuizItem>
type Source = ReturnType<typeof emptySource>
type Related = ReturnType<typeof emptyRelated>

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
    reading_time: "", difficulty: "2" as "1"|"2"|"3",
    year: "", genre: "",
  })

  // Section states — simple text sections
  const [sEssence, setSEssence] = useState("")
  const [sQuizBadge, setSQuizBadge] = useState("")
  const [sWhyEndures, setSWhyEndures] = useState("")
  const [sHeart, setSHeart] = useState("")
  const [sWorldContext, setSWorldContext] = useState("")
  const [sCritique, setSCritique] = useState("")

  // At-a-glance section
  const [atAGlance, setAtAGlance] = useState({
    genre: "", year: "", country: "", pages: "",
    reading_ease: "2" as "1"|"2"|"3",
    post_reading_time_min: "", post_difficulty: "2" as "1"|"2"|"3",
    best_for: "",
  })

  // Array sections
  const [voices, setVoices] = useState<Voice[]>([emptyVoice(), emptyVoice(), emptyVoice()])
  const [structure, setStructure] = useState<string[]>(["", "", ""])
  const [coreIdeas, setCoreIdeas] = useState<CoreIdea[]>(Array.from({ length: 6 }, emptyCoreIdea))
  const [takeaway, setTakeaway] = useState({ framing: "framework" as "framework"|"question", body: "", visual_svg: "" })
  const [quizItems, setQuizItems] = useState<QuizItem[]>(Array.from({ length: 5 }, emptyQuizItem))
  const [relatedPosts, setRelatedPosts] = useState<Related[]>([emptyRelated(), emptyRelated(), emptyRelated()])
  const [authorContext, setAuthorContext] = useState({ body: "", image_url: "", image_attribution: "", wikipedia_url: "" })
  const [sources, setSources] = useState<Source[]>([emptySource()])

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [allInterests, setAllInterests] = useState<Interest[]>([])

  // Cover upload
  const [coverUploading, setCoverUploading] = useState(false)

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState("")

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    apiFetch("/api/interests")
      .then((r) => r.json())
      .then((data: Interest[]) => setAllInterests(data))
      .catch(() => {})
  }, [])

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
    if (sQuizBadge.trim()) sections.push({ type: "quiz_badge", order: 2, content: sQuizBadge.trim() })

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
        post_reading_time_min: parseInt(aag.post_reading_time_min) || 0,
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

    const validRelated = relatedPosts.filter((r) => r.title.trim())
    if (validRelated.length === 3) sections.push({
      type: "related_posts", order: 11,
      content: validRelated.map((r) => ({
        post_id: r.post_id.trim(), title: r.title.trim(),
        format: r.format, mini_teaser: r.mini_teaser.trim(),
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
    if (!fc.reading_time || parseInt(fc.reading_time) < 1) errs.fc_reading_time = "Enter a positive number"
    if (!fc.year || parseInt(fc.year) < 1000) errs.fc_year = "Enter a valid year"
    if (!fc.genre.trim()) errs.fc_genre = "Required"

    if (selectedInterests.length < 1 || selectedInterests.length > 5) {
      errs.interests = "Select 1–5 interests"
    }

    if (!sEssence.trim()) errs.s_essence = "Required"
    if (!sQuizBadge.trim()) errs.s_quiz_badge = "Required"
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
      if (url && !url.startsWith("/uploads/")) {
        errs.image_urls = "All image URLs must start with /uploads/ — use the upload button"
        break
      }
    }

    return errs
  }

  async function handleSubmit() {
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
          post_reading_time_min: parseInt(fc.reading_time),
          post_difficulty: parseInt(fc.difficulty) as 1|2|3,
          year: parseInt(fc.year),
          genre: fc.genre.trim(),
        },
        sections: buildSections(),
        interests: selectedInterests,
      }
      const res = await apiFetch("/api/posts", { method: "POST", body: JSON.stringify(payload) })
      if (res.status === 201) {
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
    setStep(1); setSelectedFormat(null); setSearchQuery(""); setSearchResults([])
    setFc({ cover_url: "", title: "", author: "", essence: "", teaser1: "", teaser2: "", teaser3: "", reading_time: "", difficulty: "2", year: "", genre: "" })
    setSEssence(""); setSQuizBadge(""); setSWhyEndures(""); setSHeart(""); setSWorldContext(""); setSCritique("")
    setAtAGlance({ genre: "", year: "", country: "", pages: "", reading_ease: "2", post_reading_time_min: "", post_difficulty: "2", best_for: "" })
    setVoices([emptyVoice(), emptyVoice(), emptyVoice()])
    setStructure(["", "", ""])
    setCoreIdeas(Array.from({ length: 6 }, emptyCoreIdea))
    setTakeaway({ framing: "framework", body: "", visual_svg: "" })
    setQuizItems(Array.from({ length: 5 }, emptyQuizItem))
    setRelatedPosts([emptyRelated(), emptyRelated(), emptyRelated()])
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
      <div className="h-[100dvh] bg-zinc-950 flex justify-center">
        <div className="w-full max-w-[430px] h-[100dvh] relative flex flex-col items-center justify-center px-8 text-center gap-4">
          <p className="text-white text-lg font-semibold">Sign in to create a post</p>
          <button onClick={() => router.push("/login")} className="bg-white text-zinc-950 font-semibold rounded-full px-8 py-3 text-sm">Sign in</button>
        </div>
      </div>
    )
  }
  if (loading) return null

  if (step === "success") {
    return (
      <div className="h-[100dvh] bg-zinc-950 flex justify-center">
        <div className="w-full max-w-[430px] h-[100dvh] relative flex flex-col items-center justify-center px-8 text-center gap-4">
          <p className="text-white text-2xl font-bold">Post submitted</p>
          <p className="text-zinc-400 text-sm">
            {user?.is_verified ? "It is now live in the feed." : "It will appear once approved."}
          </p>
          <div className="flex flex-col gap-3 w-full mt-4">
            <button onClick={resetForm} className="bg-white text-zinc-950 font-semibold rounded-full h-12 w-full text-sm">Create another</button>
            <button onClick={() => router.push("/my-posts")} className="border border-zinc-700 text-white rounded-full h-12 w-full text-sm">View my posts</button>
          </div>
        </div>
      </div>
    )
  }

  const stepNum = step as number

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        <div className="h-full overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 pt-6">

          <p className="text-zinc-500 text-xs text-center mb-3">Step {stepNum} of 3</p>
          <div className="h-0.5 bg-zinc-800 rounded-full mb-6">
            <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${(stepNum / 3) * 100}%` }} />
          </div>

          {step > 1 && (
            <button onClick={() => setStep((prev) => (prev as number) - 1 as 1|2|3)} className="flex items-center gap-1 text-zinc-400 text-sm mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>
              Back
            </button>
          )}

          {/* STEP 1: Format selection */}
          {step === 1 && (
            <>
              <h1 className="text-white text-xl font-bold mb-1">Choose a format</h1>
              <p className="text-zinc-400 text-sm mb-5">What kind of post are you creating?</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {FORMATS.map((fmt) => {
                  const selected = selectedFormat === fmt.id
                  if (!fmt.enabled) {
                    return (
                      <div key={fmt.id} className="rounded-card p-5 border border-zinc-800 bg-zinc-900/30 opacity-50 relative">
                        <div className="font-semibold text-zinc-400 text-sm">{fmt.name}</div>
                        <div className="text-zinc-600 text-xs mt-0.5">{fmt.description}</div>
                        <span className="absolute top-2 right-2 text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">Coming soon</span>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`rounded-card p-5 text-left transition-colors ${selected ? `border-2 ${fmt.accent} bg-zinc-900` : "border border-zinc-800 bg-zinc-900/50"}`}
                    >
                      <div className="font-semibold text-white text-sm">{fmt.name}</div>
                      <div className="text-zinc-400 text-xs mt-0.5">{fmt.description}</div>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => { if (selectedFormat) setStep(2) }}
                disabled={!selectedFormat}
                className="bg-white text-zinc-950 font-semibold rounded-full h-12 w-full text-sm disabled:opacity-30 transition-opacity"
              >
                Next &rarr;
              </button>
            </>
          )}

          {/* STEP 2: Duplicate check */}
          {step === 2 && (
            <>
              <h1 className="text-white text-xl font-bold mb-1">Does this already exist?</h1>
              <p className="text-zinc-400 text-sm mb-5">Search to avoid duplicates</p>
              <div className="relative mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search existing posts..."
                  className="w-full bg-surface-2 border border-edge-strong rounded-field pl-9 pr-4 py-3 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
              {searchLoading && <div className="flex justify-center py-4"><Spinner size="sm" /></div>}
              {!searchLoading && searchResults.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {searchResults.map((post) => {
                    const style = FORMAT_STYLES[post.format as FormatId]
                    return (
                      <button key={post.id} onClick={() => window.open(`/post/${post.id}`, "_blank")} className="w-full text-left bg-surface-1 rounded-card px-4 py-3">
                        {style && <span className={`text-xs font-medium ${style.text}`}>{style.badge}</span>}
                        <p className="text-white font-semibold text-sm mt-0.5 line-clamp-2">{post.title}</p>
                        {fcStr(post.feed_card, "essence") && <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{fcStr(post.feed_card, "essence")}</p>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button onClick={() => setStep(3)} className="bg-white text-zinc-950 font-semibold rounded-full h-12 w-full text-sm mt-4">
                Continue anyway
              </button>
            </>
          )}

          {/* STEP 3: Books form */}
          {step === 3 && (
            <>
              <h1 className="text-white text-xl font-bold mb-5">Books post</h1>

              {/* Feed Card block */}
              <div className="border border-amber-400/30 rounded-xl px-4 pb-4 pt-3 mb-3 bg-amber-400/5">
                <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">Feed Card</p>

                <label className={labelCls}>Book title *</label>
                <input type="text" value={fc.title} onChange={(e) => setFcField("title", e.target.value)} maxLength={200} placeholder="Thinking, Fast and Slow" className={inputCls} data-err={errors.fc_title || undefined} />
                <FieldError msg={errors.fc_title} />

                <label className={labelCls}>Author *</label>
                <input type="text" value={fc.author} onChange={(e) => setFcField("author", e.target.value)} placeholder="Daniel Kahneman" className={inputCls} />
                <FieldError msg={errors.fc_author} />

                <label className={labelCls}>Essence * <span className="normal-case text-zinc-600">(~200 chars, why this book matters)</span></label>
                <textarea value={fc.essence} onChange={(e) => setFcField("essence", e.target.value)} maxLength={300} rows={3} placeholder="The core insight in one or two sentences..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.fc_essence} />

                <label className={labelCls}>Teaser 1 * <span className="normal-case text-zinc-600">(~40 chars)</span></label>
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
                    <label className={labelCls}>Read time (min) *</label>
                    <input type="number" min={1} value={fc.reading_time} onChange={(e) => setFcField("reading_time", e.target.value)} placeholder="15" className={inputCls} />
                    <FieldError msg={errors.fc_reading_time} />
                  </div>
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
                  <label className="shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-400 cursor-pointer hover:border-zinc-500 transition-colors">
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverUpload} />
                    {coverUploading ? "Uploading..." : "Upload"}
                  </label>
                  {fc.cover_url && (
                    <img src={`${API_URL}${fc.cover_url}`} alt="" className="w-10 h-14 object-cover rounded" />
                  )}
                  {!fc.cover_url && <span className="text-zinc-600 text-xs">or type /uploads/… URL</span>}
                </div>
                <FieldError msg={errors.cover} />
              </div>

              {/* Interests */}
              <div className="border border-zinc-800 rounded-xl px-4 pb-4 pt-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Interests *</p>
                  <span className="text-zinc-500 text-xs">{selectedInterests.length}/5</span>
                </div>
                <FieldError msg={errors.interests} />
                {interestSections.map((sec) => (
                  <div key={sec.label} className="mb-3">
                    <p className="text-zinc-600 text-xs mb-1.5">{sec.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sec.items.map((interest) => {
                        const isSelected = selectedInterests.includes(interest.slug)
                        return (
                          <button
                            key={interest.slug}
                            onClick={() => toggleInterest(interest.slug)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${isSelected ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}
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
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3 mt-5">Sections</p>

              <Accordion title="Essence" required defaultOpen>
                <p className="text-zinc-500 text-xs mb-2">The core insight in one strong sentence (shown full-screen on the detail page)</p>
                <textarea value={sEssence} onChange={(e) => { setSEssence(e.target.value); clearError("s_essence") }} rows={2} maxLength={300} placeholder="Why our fast intuitive thinking often misleads us..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.s_essence} />
              </Accordion>

              <Accordion title="Quiz Badge" required defaultOpen>
                <p className="text-zinc-500 text-xs mb-2">Short amber pill text above the quiz (e.g. &ldquo;Test your understanding&rdquo;)</p>
                <input type="text" value={sQuizBadge} onChange={(e) => { setSQuizBadge(e.target.value); clearError("s_quiz_badge") }} maxLength={60} placeholder="Test your understanding" className={inputCls} />
                <FieldError msg={errors.s_quiz_badge} />
              </Accordion>

              <Accordion title="Voices (3–4 quotes)" required defaultOpen>
                <FieldError msg={errors.s_voices} />
                {voices.map((v, i) => (
                  <div key={i} className="mb-3 border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-2">Quote {i + 1}</p>
                    <textarea value={v.quote} onChange={(e) => { const n = [...voices]; n[i] = { ...n[i], quote: e.target.value }; setVoices(n) }} rows={2} placeholder="Quote text..." className={`${inputCls} resize-none mb-2`} />
                    <input type="text" value={v.attribution} onChange={(e) => { const n = [...voices]; n[i] = { ...n[i], attribution: e.target.value }; setVoices(n) }} placeholder="Attribution (name, role, page, etc.)" className={inputCls} />
                  </div>
                ))}
                {voices.length < 4 && (
                  <button onClick={() => setVoices([...voices, emptyVoice()])} className="text-amber-400 text-xs">+ Add quote</button>
                )}
                {voices.length > 3 && (
                  <button onClick={() => setVoices(voices.slice(0, -1))} className="text-zinc-500 text-xs ml-3">Remove last</button>
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
                    { key: "post_reading_time_min" as const, label: "Read time (min)", placeholder: "15" },
                    { key: "best_for" as const, label: "Best for", placeholder: "Curious minds" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-zinc-500 text-xs mb-1 block">{label}</label>
                      <input type="text" value={atAGlance[key]} onChange={(e) => setAtAGlance({ ...atAGlance, [key]: e.target.value })} placeholder={placeholder} className={inputCls} />
                    </div>
                  ))}
                  <div>
                    <label className="text-zinc-500 text-xs mb-1 block">Reading ease</label>
                    <select value={atAGlance.reading_ease} onChange={(e) => setAtAGlance({ ...atAGlance, reading_ease: e.target.value as "1"|"2"|"3" })} className={inputCls}>
                      <option value="1">1 — Easy</option><option value="2">2 — Moderate</option><option value="3">3 — Dense</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-zinc-500 text-xs mb-1 block">Difficulty</label>
                    <select value={atAGlance.post_difficulty} onChange={(e) => setAtAGlance({ ...atAGlance, post_difficulty: e.target.value as "1"|"2"|"3" })} className={inputCls}>
                      <option value="1">1 — Easy</option><option value="2">2 — Medium</option><option value="3">3 — Hard</option>
                    </select>
                  </div>
                </div>
              </Accordion>

              <Accordion title="Heart" required defaultOpen>
                <p className="text-zinc-500 text-xs mb-2">The central argument of the book in a paragraph</p>
                <textarea value={sHeart} onChange={(e) => { setSHeart(e.target.value); clearError("s_heart") }} rows={4} placeholder="The heart of the book is..." className={`${inputCls} resize-none`} />
                <FieldError msg={errors.s_heart} />
              </Accordion>

              <Accordion title="Core Ideas (6–12)" required defaultOpen>
                <FieldError msg={errors.s_core_ideas} />
                {coreIdeas.map((ci, i) => (
                  <div key={i} className="mb-4 border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-2">Idea {i + 1}</p>
                    <label className="text-zinc-600 text-xs mb-1 block">Title *</label>
                    <input type="text" value={ci.title} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], title: e.target.value }; setCoreIdeas(n) }} placeholder="Concept name..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">Body *</label>
                    <textarea value={ci.body} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], body: e.target.value }; setCoreIdeas(n) }} rows={3} placeholder="Explain the idea..." className={`${inputCls} resize-none mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">In practice (optional)</label>
                    <input type="text" value={ci.in_practice} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], in_practice: e.target.value }; setCoreIdeas(n) }} placeholder="How to apply this..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">Pull quote (optional)</label>
                    <input type="text" value={ci.quote} onChange={(e) => { const n = [...coreIdeas]; n[i] = { ...n[i], quote: e.target.value }; setCoreIdeas(n) }} placeholder="A notable quote..." className={inputCls} />
                  </div>
                ))}
                <div className="flex gap-3">
                  {coreIdeas.length < 12 && (
                    <button onClick={() => setCoreIdeas([...coreIdeas, emptyCoreIdea()])} className="text-amber-400 text-xs">+ Add idea</button>
                  )}
                  {coreIdeas.length > 6 && (
                    <button onClick={() => setCoreIdeas(coreIdeas.slice(0, -1))} className="text-zinc-500 text-xs">Remove last</button>
                  )}
                </div>
              </Accordion>

              <Accordion title="Takeaway" required defaultOpen>
                <FieldError msg={errors.s_takeaway} />
                <label className="text-zinc-500 text-xs mb-1 block">Framing</label>
                <select value={takeaway.framing} onChange={(e) => setTakeaway({ ...takeaway, framing: e.target.value as "framework"|"question" })} className={`${inputCls} mb-3`}>
                  <option value="framework">Framework (a model or principle)</option>
                  <option value="question">Question (a reflection prompt)</option>
                </select>
                <label className="text-zinc-500 text-xs mb-1 block">Body *</label>
                <textarea value={takeaway.body} onChange={(e) => { setTakeaway({ ...takeaway, body: e.target.value }); clearError("s_takeaway") }} rows={3} placeholder="The key thing to take away..." className={`${inputCls} resize-none`} />
              </Accordion>

              <Accordion title="Quiz (5–10 questions)" required defaultOpen>
                <FieldError msg={errors.s_quiz} />
                {quizItems.map((q, i) => (
                  <div key={i} className="mb-4 border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-2">Question {i + 1}</p>
                    <label className="text-zinc-600 text-xs mb-1 block">Question text *</label>
                    <textarea value={q.question} onChange={(e) => { const n = [...quizItems]; n[i] = { ...n[i], question: e.target.value }; setQuizItems(n) }} rows={2} className={`${inputCls} resize-none mb-2`} />
                    {(["A", "B", "C", "D"] as const).map((opt, j) => (
                      <div key={j} className="flex items-center gap-2 mb-1.5">
                        <input
                          type="radio"
                          name={`quiz_answer_${i}`}
                          checked={q.answer_index === String(j) as "0"|"1"|"2"|"3"}
                          onChange={() => { const n = [...quizItems]; n[i] = { ...n[i], answer_index: String(j) as "0"|"1"|"2"|"3" }; setQuizItems(n) }}
                          className="shrink-0 accent-amber-400"
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
                    <label className="text-zinc-600 text-xs mb-1 block mt-2">Explanation *</label>
                    <textarea value={q.explanation} onChange={(e) => { const n = [...quizItems]; n[i] = { ...n[i], explanation: e.target.value }; setQuizItems(n) }} rows={2} placeholder="Why this is the correct answer..." className={`${inputCls} resize-none`} />
                  </div>
                ))}
                <div className="flex gap-3">
                  {quizItems.length < 10 && (
                    <button onClick={() => setQuizItems([...quizItems, emptyQuizItem()])} className="text-amber-400 text-xs">+ Add question</button>
                  )}
                  {quizItems.length > 5 && (
                    <button onClick={() => setQuizItems(quizItems.slice(0, -1))} className="text-zinc-500 text-xs">Remove last</button>
                  )}
                </div>
              </Accordion>

              <Accordion title="Sources (1–10)" required defaultOpen>
                <FieldError msg={errors.s_sources} />
                {sources.map((s, i) => (
                  <div key={i} className="mb-3 border border-zinc-800 rounded-lg p-3">
                    <label className="text-zinc-600 text-xs mb-1 block">Label *</label>
                    <input type="text" value={s.label} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], label: e.target.value }; setSources(n) }} placeholder="Book title, article name..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">URL *</label>
                    <input type="url" value={s.url} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], url: e.target.value }; setSources(n) }} placeholder="https://..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">Type</label>
                    <select value={s.type} onChange={(e) => { const n = [...sources]; n[i] = { ...n[i], type: e.target.value }; setSources(n) }} className={inputCls}>
                      {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
                <div className="flex gap-3">
                  {sources.length < 10 && (
                    <button onClick={() => setSources([...sources, emptySource()])} className="text-amber-400 text-xs">+ Add source</button>
                  )}
                  {sources.length > 1 && (
                    <button onClick={() => setSources(sources.slice(0, -1))} className="text-zinc-500 text-xs">Remove last</button>
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
                      <button onClick={() => setStructure(structure.filter((_, idx) => idx !== i))} className="text-zinc-500 text-lg w-8 h-10 flex items-center justify-center shrink-0">×</button>
                    )}
                  </div>
                ))}
                {structure.length < 10 && (
                  <button onClick={() => setStructure([...structure, ""])} className="text-amber-400 text-xs mt-1">+ Add part</button>
                )}
              </Accordion>

              <Accordion title="Related Posts (3)">
                {relatedPosts.map((r, i) => (
                  <div key={i} className="mb-3 border border-zinc-800 rounded-lg p-3">
                    <label className="text-zinc-600 text-xs mb-1 block">Title</label>
                    <input type="text" value={r.title} onChange={(e) => { const n = [...relatedPosts]; n[i] = { ...n[i], title: e.target.value }; setRelatedPosts(n) }} placeholder="Related book or post title..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">Mini teaser</label>
                    <input type="text" value={r.mini_teaser} onChange={(e) => { const n = [...relatedPosts]; n[i] = { ...n[i], mini_teaser: e.target.value }; setRelatedPosts(n) }} placeholder="One line about it..." className={`${inputCls} mb-2`} />
                    <label className="text-zinc-600 text-xs mb-1 block">Format</label>
                    <select value={r.format} onChange={(e) => { const n = [...relatedPosts]; n[i] = { ...n[i], format: e.target.value }; setRelatedPosts(n) }} className={inputCls}>
                      {["books", "facts", "people", "concepts", "questions", "stories", "academy"].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </Accordion>

              <Accordion title="World Context">
                <textarea value={sWorldContext} onChange={(e) => setSWorldContext(e.target.value)} rows={3} placeholder="The historical or cultural context when the book was written..." className={`${inputCls} resize-none`} />
              </Accordion>

              <Accordion title="Author Context">
                <textarea value={authorContext.body} onChange={(e) => setAuthorContext({ ...authorContext, body: e.target.value })} rows={3} placeholder="About the author..." className={`${inputCls} resize-none mb-2`} />
                <label className="text-zinc-600 text-xs mb-1 block">Wikipedia URL</label>
                <input type="url" value={authorContext.wikipedia_url} onChange={(e) => setAuthorContext({ ...authorContext, wikipedia_url: e.target.value })} placeholder="https://en.wikipedia.org/wiki/..." className={inputCls} />
              </Accordion>

              <Accordion title="Critique &amp; Limitations">
                <textarea value={sCritique} onChange={(e) => setSCritique(e.target.value)} rows={3} placeholder="Where the book falls short or has been criticized..." className={`${inputCls} resize-none`} />
              </Accordion>

              {/* Submit */}
              {errors.image_urls && (
                <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 mb-3">
                  <p className="text-red-400 text-sm">{errors.image_urls}</p>
                </div>
              )}
              {serverError && <p className="text-red-400 text-sm mb-3">{serverError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-white text-zinc-950 font-semibold rounded-full h-12 w-full text-sm disabled:opacity-50 transition-opacity mt-4"
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
