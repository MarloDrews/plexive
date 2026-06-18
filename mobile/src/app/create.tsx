import { useEffect, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as ImagePicker from "expo-image-picker"
import { File as FsFile } from "expo-file-system"
import { Image } from "expo-image"
import Svg, { Circle, Path } from "react-native-svg"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { FORMAT_IDS, FORMAT_STYLES, formatStyle, type FormatId } from "../lib/formats"
import { CATEGORIES } from "../lib/categories"
import { fcStr, type Post } from "../types/post"
import { colors, fills, fonts, radius } from "../theme/tokens"
import { BASE_URL } from "../config"
import BottomNav from "../components/BottomNav"

// Port of frontend/src/app/create/page.tsx: the 3-step post-creation wizard
// (format select -> duplicate check -> format-specific form) for all 7 formats.
// The pure build/validate logic is copied verbatim from the web; the UI is
// rebuilt with the mobile "Stage" conventions (login fieldStyle inputs, pill
// selectors instead of <select>, ImagePicker for the cover upload).

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
  accent: FORMAT_STYLES[id].accent,
  description: FORMAT_DESCRIPTIONS[id],
}))

interface Interest { id: number; name: string; slug: string }

const SOURCE_TYPES = ["wikipedia", "paper", "book", "article", "database"]

const DIFFICULTY_OPTIONS = [
  { value: "1", label: "1 — Easy" },
  { value: "2", label: "2 — Medium" },
  { value: "3", label: "3 — Hard" },
]
const READING_EASE_OPTIONS = [
  { value: "1", label: "1 — Easy" },
  { value: "2", label: "2 — Moderate" },
  { value: "3", label: "3 — Dense" },
]

// --- Shared field style (the login.tsx recipe) ---
const fieldStyle = {
  backgroundColor: colors["surface-2"],
  borderWidth: 1,
  borderColor: colors["edge-strong"],
  borderRadius: radius.field,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontFamily: fonts.sans,
  fontSize: 15,
  color: colors.ink,
} as const

// --- Reusable presentational primitives (module scope so inputs never remount) ---

function Caps({ text, color = colors["ink-dim"], style }: { text: string; color?: string; style?: object }) {
  return (
    <Text
      style={[
        { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color },
        style,
      ]}
    >
      {text}
    </Text>
  )
}

function Label({ text }: { text: string }) {
  return <Caps text={text} style={{ marginTop: 16, marginBottom: 8 }} />
}

function SubLabel({ text }: { text: string }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-faint"], marginBottom: 6 }}>
      {text}
    </Text>
  )
}

function Help({ text }: { text: string }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-muted"], marginBottom: 8 }}>
      {text}
    </Text>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.bad, marginTop: 4 }}>{msg}</Text>
  )
}

function Field(props: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  keyboardType?: "default" | "numeric" | "url"
  maxLength?: number
  autoCapitalize?: "none" | "sentences" | "words"
  style?: object
}) {
  const { value, onChangeText, placeholder, multiline, rows = 3, keyboardType = "default", maxLength, autoCapitalize, style } = props
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors["ink-muted"]}
      multiline={multiline}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      style={[
        fieldStyle,
        multiline ? { minHeight: rows * 20 + 20, textAlignVertical: "top" as const } : null,
        style,
      ]}
    />
  )
}

function SegmentedSelect({
  value, options, onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const sel = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: sel ? "rgba(124, 111, 255, 0.5)" : colors["edge-strong"],
              backgroundColor: sel ? "rgba(124, 111, 255, 0.16)" : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: sel ? fonts.sansSemiBold : fonts.sans,
                fontSize: 13,
                color: sel ? colors.lamp : colors["ink-dim"],
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Accordion({
  title, required, defaultOpen, children,
}: {
  title: string
  required?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.edge,
        borderRadius: radius.card,
        marginBottom: 12,
        overflow: "hidden",
        backgroundColor: fills.slab,
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink, flex: 1 }}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              backgroundColor: required ? "rgba(124, 111, 255, 0.15)" : fills.chrome,
            }}
          >
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: required ? colors.lamp : colors["ink-muted"] }}>
              {required ? "Required" : "Optional"}
            </Text>
          </View>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors["ink-muted"]} strokeWidth={2}>
            <Path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
          </Svg>
        </View>
      </Pressable>
      {open && <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>{children}</View>}
    </View>
  )
}

function QuietButton({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: accent ? colors.lamp : colors["ink-dim"] }}>
        {label}
      </Text>
    </Pressable>
  )
}

function BigButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: "rgba(124, 111, 255, 0.15)",
        borderRadius: 999,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: "#9d93ff" }}>{label}</Text>
    </Pressable>
  )
}

// Inner block wrapper (the "card" / feed-card containers on the web).
function Block({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: accent ? "rgba(124, 111, 255, 0.3)" : colors.edge,
        borderRadius: radius.card,
        paddingHorizontal: 16,
        paddingBottom: 16,
        paddingTop: 12,
        marginBottom: 12,
        backgroundColor: accent ? "rgba(124, 111, 255, 0.05)" : fills.slab,
      }}
    >
      {children}
    </View>
  )
}

// Inner card used to wrap repeated array items (quiz/source/voice/idea).
function ItemCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: fills.slab, borderRadius: radius.field, padding: 12, marginBottom: 12 }}>
      {children}
    </View>
  )
}

// --- Default state shapes (copied verbatim from the web) ---
const emptyVoice = () => ({ quote: "", attribution: "" })
const emptyCoreIdea = () => ({ title: "", body: "", in_practice: "", visual_svg: "", image_url: "", quote: "" })
const emptyQuizItem = () => ({ question: "", options: ["", "", "", ""] as [string, string, string, string], answer_index: "0" as "0" | "1" | "2" | "3", explanation: "" })
const emptySource = () => ({ label: "", url: "", type: "article" as string })
const emptyRelated = () => ({ post_id: "", title: "", format: "books", mini_teaser: "" })

type Voice = ReturnType<typeof emptyVoice>
type CoreIdea = ReturnType<typeof emptyCoreIdea>
type QuizItem = ReturnType<typeof emptyQuizItem>
type Source = ReturnType<typeof emptySource>
type Related = ReturnType<typeof emptyRelated>

export default function CreateScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, loading } = useAuth()
  const scrollRef = useRef<ScrollView>(null)

  const [step, setStep] = useState<1 | 2 | 3 | "success">(1)
  const [selectedFormat, setSelectedFormat] = useState<FormatId | null>(null)

  // Step 2 — duplicate check
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Post[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Feed Card state (Books)
  const [fc, setFc] = useState({
    cover_url: "", title: "", author: "", essence: "",
    teaser1: "", teaser2: "", teaser3: "",
    reading_time: "", difficulty: "2" as "1" | "2" | "3",
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
    reading_ease: "2" as "1" | "2" | "3",
    post_reading_time_min: "", post_difficulty: "2" as "1" | "2" | "3",
    best_for: "",
  })

  // Array sections
  const [voices, setVoices] = useState<Voice[]>([emptyVoice(), emptyVoice(), emptyVoice()])
  const [structure, setStructure] = useState<string[]>(["", "", ""])
  const [coreIdeas, setCoreIdeas] = useState<CoreIdea[]>(Array.from({ length: 6 }, emptyCoreIdea))
  const [takeaway, setTakeaway] = useState({ framing: "framework" as "framework" | "question", body: "", visual_svg: "" })
  const [quizItems, setQuizItems] = useState<QuizItem[]>(Array.from({ length: 5 }, emptyQuizItem))
  const [relatedPosts, setRelatedPosts] = useState<Related[]>([emptyRelated(), emptyRelated(), emptyRelated()])
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
    reading_time: "", difficulty: "2" as "1" | "2" | "3",
  })
  const [genericBody, setGenericBody] = useState("")

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

  // Fetch the interest list once on mount (no SWR on mobile, like onboarding).
  useEffect(() => {
    apiFetch("/api/interests")
      .then((r) => r.json())
      .then((data: Interest[]) => setAllInterests(data))
      .catch(() => setAllInterests([]))
  }, [])

  // Debounced duplicate search while on step 2 (mirrors the web effect).
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
    setFc((prev) => ({ ...prev, [key]: value }) as typeof prev)
    setErrors((prev) => { const n = { ...prev }; delete n[`fc_${key}`]; return n })
  }

  function setGFcField(key: keyof typeof gFc, value: string) {
    setGFc((prev) => ({ ...prev, [key]: value }) as typeof prev)
    setErrors((prev) => { const n = { ...prev }; delete n[`gfc_${key}`]; return n })
  }

  function setAagField(key: keyof typeof atAGlance, value: string) {
    setAtAGlance((prev) => ({ ...prev, [key]: value }) as typeof prev)
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

  async function handleCoverUpload() {
    setErrors((prev) => { const n = { ...prev }; delete n.cover; return n })
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    setCoverUploading(true)
    try {
      const form = new FormData()
      // Expo's WinterCG fetch rejects the classic RN {uri, name, type} part;
      // the expo-file-system File class implements Blob and is the SDK 56
      // supported way to put a local file into FormData (see profile upload).
      form.append("file", new FsFile(asset.uri) as unknown as Blob)
      const res = await apiFetch("/api/upload/image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Upload failed")
      setFcField("cover_url", data.url)
    } catch (err) {
      setErrors((prev) => ({ ...prev, cover: err instanceof Error ? err.message : "Upload failed" }))
    } finally {
      setCoverUploading(false)
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
        reading_ease: parseInt(aag.reading_ease) as 1 | 2 | 3,
        post_reading_time_min: parseInt(aag.post_reading_time_min) || 0,
        post_difficulty: parseInt(aag.post_difficulty) as 1 | 2 | 3,
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
        answer_index: parseInt(q.answer_index) as 0 | 1 | 2 | 3,
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
      post_reading_time_min: parseInt(gFc.reading_time) || 0,
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
    const validQuiz = quizItems.filter((q) => q.question.trim() && q.options.every((o) => o.trim()) && q.explanation.trim())
    if (validQuiz.length >= 5) sections.push({
      type: "quiz", order: 3,
      content: validQuiz.map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => o.trim()) as [string, string, string, string],
        answer_index: parseInt(q.answer_index) as 0 | 1 | 2 | 3,
        explanation: q.explanation.trim(),
      })),
    })
    const validSources = sources.filter((s) => s.label.trim() && s.url.trim())
    if (validSources.length >= 1) sections.push({
      type: "sources", order: 4,
      content: validSources.map((s) => ({ label: s.label.trim(), url: s.url.trim(), type: s.type })),
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
    if (!gFc.reading_time || parseInt(gFc.reading_time) < 1) errs.gfc_reading_time = "Enter a positive number"
    if (!genericBody.trim()) errs.generic_body = "Required"
    const validQuiz = quizItems.filter((q) => q.question.trim() && q.options.every((o) => o.trim()) && q.explanation.trim())
    if (validQuiz.length < 5) errs.s_quiz = "Need at least 5 complete questions"
    const validSources = sources.filter((s) => s.label.trim() && s.url.trim())
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
        scrollRef.current?.scrollTo({ y: 0, animated: true })
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
        if (res.status === 201) { setStep("success") }
        else { const data = await res.json(); setServerError(typeof data.detail === "string" ? data.detail : "Something went wrong.") }
      } catch { setServerError("Network error. Please try again.") }
      finally { setSubmitting(false) }
      return
    }

    // Books path
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      scrollRef.current?.scrollTo({ y: 0, animated: true })
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
          post_difficulty: parseInt(fc.difficulty) as 1 | 2 | 3,
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
        setServerError(typeof data.detail === "string" ? data.detail : "Something went wrong.")
      }
    } catch {
      setServerError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setGFc({ field: "", headline: "", name: "", role: "", born: "", died: "", nationality: "", concept_name: "", one_liner: "", the_question: "", framing: "empirical", era: "", location: "", authors_compact: "", venue: "", key_finding_one_line: "", published_year: "", essence: "", teaser1: "", teaser2: "", teaser3: "", reading_time: "", difficulty: "2" })
    setGenericBody("")
    setStep(1); setSelectedFormat(null); setSearchQuery(""); setSearchResults([])
    setFc({ cover_url: "", title: "", author: "", essence: "", teaser1: "", teaser2: "", teaser3: "", reading_time: "", difficulty: "2", year: "", genre: "" })
    setSEssence(""); setSWhyEndures(""); setSHeart(""); setSWorldContext(""); setSCritique("")
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

  // Group the fetched interests under the shared CATEGORIES labels.
  const bySlug = new Map(allInterests.map((i) => [i.slug, i]))
  const interestSections = CATEGORIES.map((cat) => ({
    label: cat.label,
    items: cat.slugs.flatMap((s) => { const i = bySlug.get(s); return i ? [i] : [] }),
  })).filter((sec) => sec.items.length > 0)

  // --- Shared render helpers (return element trees, not nested components) ---

  function renderInterests() {
    return (
      <Block>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Caps text="Interests *" color={colors.lamp} />
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors["ink-muted"] }}>{selectedInterests.length}/5</Text>
        </View>
        <FieldError msg={errors.interests} />
        {interestSections.map((sec) => (
          <View key={sec.label} style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-faint"], marginBottom: 6 }}>{sec.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {sec.items.map((interest) => {
                const isSelected = selectedInterests.includes(interest.slug)
                return (
                  <Pressable
                    key={interest.slug}
                    onPress={() => toggleInterest(interest.slug)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      backgroundColor: isSelected ? fills.active12 : fills.slab,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: isSelected ? colors.ink : colors["ink-dim"] }}>
                      {interest.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </Block>
    )
  }

  function setQuiz(i: number, patch: Partial<QuizItem>) {
    const n = [...quizItems]; n[i] = { ...n[i], ...patch }; setQuizItems(n)
  }

  function renderQuizAccordion() {
    return (
      <Accordion title="Quiz (5–10 questions)" required defaultOpen>
        <FieldError msg={errors.s_quiz} />
        {quizItems.map((q, i) => (
          <ItemCard key={i}>
            <Help text={`Question ${i + 1}`} />
            <SubLabel text="Question text *" />
            <Field value={q.question} onChangeText={(t) => setQuiz(i, { question: t })} multiline rows={2} style={{ marginBottom: 8 }} />
            {(["A", "B", "C", "D"] as const).map((opt, j) => {
              const selected = q.answer_index === (String(j) as "0" | "1" | "2" | "3")
              return (
                <View key={j} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => setQuiz(i, { answer_index: String(j) as "0" | "1" | "2" | "3" })}
                    style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? colors.lamp : colors["edge-strong"], alignItems: "center", justifyContent: "center" }}
                  >
                    {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.lamp }} />}
                  </Pressable>
                  <Field
                    value={q.options[j]}
                    onChangeText={(t) => { const opts = [...q.options] as [string, string, string, string]; opts[j] = t; setQuiz(i, { options: opts }) }}
                    placeholder={`Option ${opt}`}
                    style={{ flex: 1 }}
                  />
                </View>
              )
            })}
            <SubLabel text="Explanation *" />
            <Field value={q.explanation} onChangeText={(t) => setQuiz(i, { explanation: t })} multiline rows={2} placeholder="Why this is the correct answer..." />
          </ItemCard>
        ))}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {quizItems.length < 10 && <QuietButton label="+ Add question" accent onPress={() => setQuizItems([...quizItems, emptyQuizItem()])} />}
          {quizItems.length > 5 && <QuietButton label="Remove last" onPress={() => setQuizItems(quizItems.slice(0, -1))} />}
        </View>
      </Accordion>
    )
  }

  function setSource(i: number, patch: Partial<Source>) {
    const n = [...sources]; n[i] = { ...n[i], ...patch }; setSources(n)
  }

  function renderSourcesAccordion() {
    return (
      <Accordion title="Sources (1–10)" required defaultOpen>
        <FieldError msg={errors.s_sources} />
        {sources.map((s, i) => (
          <ItemCard key={i}>
            <SubLabel text="Label *" />
            <Field value={s.label} onChangeText={(t) => setSource(i, { label: t })} placeholder="Book title, article name..." style={{ marginBottom: 8 }} />
            <SubLabel text="URL *" />
            <Field value={s.url} onChangeText={(t) => setSource(i, { url: t })} placeholder="https://..." keyboardType="url" autoCapitalize="none" style={{ marginBottom: 8 }} />
            <SubLabel text="Type" />
            <SegmentedSelect value={s.type} options={SOURCE_TYPES.map((t) => ({ value: t, label: t }))} onChange={(v) => setSource(i, { type: v })} />
          </ItemCard>
        ))}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {sources.length < 10 && <QuietButton label="+ Add source" accent onPress={() => setSources([...sources, emptySource()])} />}
          {sources.length > 1 && <QuietButton label="Remove last" onPress={() => setSources(sources.slice(0, -1))} />}
        </View>
      </Accordion>
    )
  }

  // --- Auth gate / loading ---
  if (!loading && !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["surface-0"], justifyContent: "center", paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: colors["surface-1"], borderWidth: 1, borderColor: colors.edge, borderRadius: radius.card, paddingHorizontal: 24, paddingVertical: 32, alignItems: "center", gap: 16 }}>
          <Text style={{ fontFamily: fonts.serifMedium, fontSize: 20, color: colors.ink, textAlign: "center" }}>Sign in to create a post</Text>
          <BigButton label="Sign in" onPress={() => router.push("/login")} />
        </View>
        <BottomNav active="create" />
      </View>
    )
  }
  if (loading) return <View style={{ flex: 1, backgroundColor: colors["surface-0"] }} />

  // --- Success state ---
  if (step === "success") {
    return (
      <View style={{ flex: 1, backgroundColor: colors["surface-0"], justifyContent: "center", paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: colors["surface-1"], borderWidth: 1, borderColor: colors.edge, borderRadius: radius.card, paddingHorizontal: 24, paddingVertical: 32, alignItems: "center", gap: 12 }}>
          <Text style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink }}>Post submitted</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-dim"], textAlign: "center" }}>
            {user?.is_verified ? "It is now live in the feed." : "It will appear once approved."}
          </Text>
          <View style={{ width: "100%", gap: 12, marginTop: 16 }}>
            <BigButton label="Create another" onPress={resetForm} />
            <Pressable
              onPress={() => user && router.push(`/profile/${user.username}`)}
              style={{ height: 48, alignItems: "center", justifyContent: "center", borderRadius: 999 }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors["ink-dim"] }}>View my posts</Text>
            </Pressable>
          </View>
        </View>
        <BottomNav active="create" />
      </View>
    )
  }

  const stepNum = step as number

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors["surface-0"] }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors["ink-muted"], textAlign: "center", marginBottom: 12 }}>
          Step {stepNum} of 3
        </Text>
        <View style={{ height: 3, backgroundColor: fills.dotOff, borderRadius: 999, marginBottom: 24 }}>
          <View style={{ height: 3, backgroundColor: colors.lamp, borderRadius: 999, width: `${(stepNum / 3) * 100}%` }} />
        </View>

        {step > 1 && (
          <Pressable onPress={() => setStep((prev) => ((prev as number) - 1) as 1 | 2 | 3)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors["ink-dim"]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors["ink-dim"] }}>Back</Text>
          </Pressable>
        )}

        {/* STEP 1: Format selection */}
        {step === 1 && (
          <>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink, marginBottom: 4 }}>Choose a format</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-dim"], marginBottom: 20 }}>What kind of post are you creating?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              {FORMATS.map((fmt) => {
                const selected = selectedFormat === fmt.id
                return (
                  <Pressable
                    key={fmt.id}
                    onPress={() => setSelectedFormat(fmt.id)}
                    style={{
                      width: "47%",
                      borderRadius: radius.slab,
                      padding: 18,
                      borderWidth: 2,
                      borderColor: selected ? fmt.accent : "transparent",
                      backgroundColor: selected ? fills.active12 : fills.slab,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink }}>{fmt.name}</Text>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"], marginTop: 2 }}>{fmt.description}</Text>
                  </Pressable>
                )
              })}
            </View>
            <BigButton label="Next →" disabled={!selectedFormat} onPress={() => { if (selectedFormat) setStep(2) }} />
          </>
        )}

        {/* STEP 2: Duplicate check */}
        {step === 2 && (
          <>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink, marginBottom: 4 }}>Does this already exist?</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-dim"], marginBottom: 20 }}>Search to avoid duplicates</Text>
            <View style={{ position: "relative", marginBottom: 16 }}>
              <View style={{ position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors["ink-muted"]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx={11} cy={11} r={8} />
                  <Path d="m21 21-4.35-4.35" />
                </Svg>
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search existing posts..."
                placeholderTextColor={colors["ink-muted"]}
                autoCapitalize="none"
                style={[fieldStyle, { paddingLeft: 36 }]}
              />
            </View>
            {searchLoading && (
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors["ink-faint"], textAlign: "center", paddingVertical: 16 }}>Searching...</Text>
            )}
            {!searchLoading && searchResults.length > 0 && (
              <View style={{ gap: 8, marginBottom: 16 }}>
                {searchResults.map((post) => {
                  const style = formatStyle(post.format)
                  const essence = fcStr(post.feed_card, "essence")
                  return (
                    <Pressable
                      key={post.id}
                      onPress={() => router.push(`/post/${post.id}`)}
                      style={{ borderWidth: 1, borderColor: colors.edge, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: fills.slab }}
                    >
                      <Caps text={style.badge} color={style.accent} />
                      <Text numberOfLines={2} style={{ fontFamily: fonts.serifMedium, fontSize: 15, color: colors.ink, marginTop: 2 }}>{post.title}</Text>
                      {essence !== "" && (
                        <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"], marginTop: 4 }}>{essence}</Text>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            )}
            <BigButton label="Continue anyway" onPress={() => setStep(3)} />
          </>
        )}

        {/* STEP 3: Generic form (non-Books) */}
        {step === 3 && selectedFormat && selectedFormat !== "books" && (
          <>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink, marginBottom: 20 }}>
              {FORMAT_STYLES[selectedFormat].label} post
            </Text>

            {/* Feed card */}
            <Block>
              <Caps text="Feed Card" color={colors.lamp} />

              {selectedFormat === "facts" && (
                <>
                  <Label text="Field *" />
                  <Field value={gFc.field} onChangeText={(t) => setGFcField("field", t)} placeholder="Physics" />
                  <FieldError msg={errors.gfc_field} />
                  <Label text="Headline *" />
                  <Field value={gFc.headline} onChangeText={(t) => setGFcField("headline", t)} placeholder="The mind-blowing fact in one line..." />
                  <FieldError msg={errors.gfc_headline} />
                </>
              )}

              {selectedFormat === "people" && (
                <>
                  <Label text="Full name *" />
                  <Field value={gFc.name} onChangeText={(t) => setGFcField("name", t)} placeholder="Marie Curie" />
                  <FieldError msg={errors.gfc_name} />
                  <Label text="Role *" />
                  <Field value={gFc.role} onChangeText={(t) => setGFcField("role", t)} placeholder="Physicist & Chemist" />
                  <FieldError msg={errors.gfc_role} />
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Label text="Born" />
                      <Field value={gFc.born} onChangeText={(t) => setGFcField("born", t)} placeholder="1867" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label text="Died" />
                      <Field value={gFc.died} onChangeText={(t) => setGFcField("died", t)} placeholder="1934" />
                    </View>
                  </View>
                  <Label text="Nationality" />
                  <Field value={gFc.nationality} onChangeText={(t) => setGFcField("nationality", t)} placeholder="Polish-French" />
                </>
              )}

              {selectedFormat === "concepts" && (
                <>
                  <Label text="Concept name *" />
                  <Field value={gFc.concept_name} onChangeText={(t) => setGFcField("concept_name", t)} placeholder="Confirmation Bias" />
                  <FieldError msg={errors.gfc_concept_name} />
                  <Label text="Field" />
                  <Field value={gFc.field} onChangeText={(t) => setGFcField("field", t)} placeholder="Psychology" />
                  <Label text="One-liner *" />
                  <Field value={gFc.one_liner} onChangeText={(t) => setGFcField("one_liner", t)} placeholder="The concept in a single clear sentence..." />
                  <FieldError msg={errors.gfc_one_liner} />
                </>
              )}

              {selectedFormat === "questions" && (
                <>
                  <Label text="The question *" />
                  <Field value={gFc.the_question} onChangeText={(t) => setGFcField("the_question", t)} placeholder="Is free will an illusion?" />
                  <FieldError msg={errors.gfc_the_question} />
                  <Label text="Framing" />
                  <SegmentedSelect
                    value={gFc.framing}
                    options={["empirical", "ethical", "aesthetic", "practical", "metaphysical"].map((f) => ({ value: f, label: f }))}
                    onChange={(v) => setGFcField("framing", v)}
                  />
                </>
              )}

              {selectedFormat === "stories" && (
                <>
                  <Label text="Headline *" />
                  <Field value={gFc.headline} onChangeText={(t) => setGFcField("headline", t)} placeholder="The story in one compelling line..." />
                  <FieldError msg={errors.gfc_headline} />
                  <Label text="Era *" />
                  <Field value={gFc.era} onChangeText={(t) => setGFcField("era", t)} placeholder="1940s" />
                  <FieldError msg={errors.gfc_era} />
                  <Label text="Location" />
                  <Field value={gFc.location} onChangeText={(t) => setGFcField("location", t)} placeholder="Berlin, Germany" />
                </>
              )}

              {selectedFormat === "academy" && (
                <>
                  <Label text="Paper / Article title *" />
                  <Field value={gFc.concept_name} onChangeText={(t) => setGFcField("concept_name", t)} placeholder="On the Origin of Species" />
                  <FieldError msg={errors.gfc_concept_name} />
                  <Label text="Field" />
                  <Field value={gFc.field} onChangeText={(t) => setGFcField("field", t)} placeholder="Evolutionary Biology" />
                  <Label text="Authors *" />
                  <Field value={gFc.authors_compact} onChangeText={(t) => setGFcField("authors_compact", t)} placeholder="Darwin, C." />
                  <FieldError msg={errors.gfc_authors_compact} />
                  <Label text="Journal / Venue" />
                  <Field value={gFc.venue} onChangeText={(t) => setGFcField("venue", t)} placeholder="Nature" />
                  <Label text="Key finding (one line) *" />
                  <Field value={gFc.key_finding_one_line} onChangeText={(t) => setGFcField("key_finding_one_line", t)} placeholder="Species evolve through natural selection..." />
                  <FieldError msg={errors.gfc_key_finding_one_line} />
                  <Label text="Published year" />
                  <Field value={gFc.published_year} onChangeText={(t) => setGFcField("published_year", t)} placeholder="1859" keyboardType="numeric" />
                </>
              )}

              {selectedFormat !== "academy" && (
                <>
                  <Label text="Essence * (why this matters)" />
                  <Field value={gFc.essence} onChangeText={(t) => setGFcField("essence", t)} maxLength={300} multiline rows={3} placeholder="In one or two sentences..." />
                  <FieldError msg={errors.gfc_essence} />
                </>
              )}

              <Label text="Teaser 1 *" />
              <Field value={gFc.teaser1} onChangeText={(t) => setGFcField("teaser1", t)} maxLength={80} placeholder="What you'll learn..." />
              <FieldError msg={errors.gfc_teaser1} />
              <Label text="Teaser 2 *" />
              <Field value={gFc.teaser2} onChangeText={(t) => setGFcField("teaser2", t)} maxLength={80} placeholder="Another insight..." />
              <FieldError msg={errors.gfc_teaser2} />
              <Label text="Teaser 3 *" />
              <Field value={gFc.teaser3} onChangeText={(t) => setGFcField("teaser3", t)} maxLength={80} placeholder="A third takeaway..." />
              <FieldError msg={errors.gfc_teaser3} />

              <Label text="Read time (min) *" />
              <Field value={gFc.reading_time} onChangeText={(t) => setGFcField("reading_time", t)} keyboardType="numeric" placeholder="10" />
              <FieldError msg={errors.gfc_reading_time} />
              <Label text="Difficulty *" />
              <SegmentedSelect value={gFc.difficulty} options={DIFFICULTY_OPTIONS} onChange={(v) => setGFcField("difficulty", v)} />
            </Block>

            {renderInterests()}

            <Caps text="Sections" style={{ marginTop: 20, marginBottom: 12 }} />

            <Accordion title="Body" required defaultOpen>
              <Help text="The main content — explain, describe, or narrate in full" />
              <Field value={genericBody} onChangeText={(t) => { setGenericBody(t); clearError("generic_body") }} multiline rows={10} placeholder="Write the full content here..." />
              <FieldError msg={errors.generic_body} />
            </Accordion>

            {renderQuizAccordion()}
            {renderSourcesAccordion()}

            {serverError !== "" && <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.bad, marginBottom: 12 }}>{serverError}</Text>}
            <View style={{ marginTop: 8 }}>
              <BigButton label={submitting ? "Submitting..." : "Submit post"} disabled={submitting} onPress={handleSubmit} />
            </View>
          </>
        )}

        {/* STEP 3: Books form */}
        {step === 3 && selectedFormat === "books" && (
          <>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 24, color: colors.ink, marginBottom: 20 }}>Books post</Text>

            {/* Feed Card block */}
            <Block accent>
              <Caps text="Feed Card" color={colors.lamp} />

              <Label text="Book title *" />
              <Field value={fc.title} onChangeText={(t) => setFcField("title", t)} maxLength={200} placeholder="Thinking, Fast and Slow" />
              <FieldError msg={errors.fc_title} />

              <Label text="Author *" />
              <Field value={fc.author} onChangeText={(t) => setFcField("author", t)} placeholder="Daniel Kahneman" />
              <FieldError msg={errors.fc_author} />

              <Label text="Essence * (~200 chars, why this book matters)" />
              <Field value={fc.essence} onChangeText={(t) => setFcField("essence", t)} maxLength={300} multiline rows={3} placeholder="The core insight in one or two sentences..." />
              <FieldError msg={errors.fc_essence} />

              <Label text="Teaser 1 * (~40 chars)" />
              <Field value={fc.teaser1} onChangeText={(t) => setFcField("teaser1", t)} maxLength={80} placeholder="What you'll learn..." />
              <FieldError msg={errors.fc_teaser1} />
              <Label text="Teaser 2 *" />
              <Field value={fc.teaser2} onChangeText={(t) => setFcField("teaser2", t)} maxLength={80} placeholder="Another insight..." />
              <FieldError msg={errors.fc_teaser2} />
              <Label text="Teaser 3 *" />
              <Field value={fc.teaser3} onChangeText={(t) => setFcField("teaser3", t)} maxLength={80} placeholder="A third takeaway..." />
              <FieldError msg={errors.fc_teaser3} />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Label text="Read time (min) *" />
                  <Field value={fc.reading_time} onChangeText={(t) => setFcField("reading_time", t)} keyboardType="numeric" placeholder="15" />
                  <FieldError msg={errors.fc_reading_time} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label text="Year *" />
                  <Field value={fc.year} onChangeText={(t) => setFcField("year", t)} keyboardType="numeric" placeholder="2011" />
                  <FieldError msg={errors.fc_year} />
                </View>
              </View>

              <Label text="Difficulty *" />
              <SegmentedSelect value={fc.difficulty} options={DIFFICULTY_OPTIONS} onChange={(v) => setFcField("difficulty", v)} />

              <Label text="Genre *" />
              <Field value={fc.genre} onChangeText={(t) => setFcField("genre", t)} placeholder="Psychology" />
              <FieldError msg={errors.fc_genre} />

              <Label text="Cover image" />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable
                  onPress={handleCoverUpload}
                  disabled={coverUploading}
                  style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: fills.chrome }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors["ink-dim"] }}>
                    {coverUploading ? "Uploading..." : "Upload"}
                  </Text>
                </Pressable>
                {fc.cover_url ? (
                  <Image
                    source={{ uri: fc.cover_url.startsWith("http") ? fc.cover_url : `${BASE_URL}${fc.cover_url}` }}
                    style={{ width: 40, height: 56, borderRadius: 4 }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-faint"] }}>optional book cover</Text>
                )}
              </View>
              <FieldError msg={errors.cover} />
            </Block>

            {renderInterests()}

            <Caps text="Sections" style={{ marginTop: 20, marginBottom: 12 }} />

            <Accordion title="Essence" required defaultOpen>
              <Help text="The core insight in one strong sentence (shown full-screen on the detail page)" />
              <Field value={sEssence} onChangeText={(t) => { setSEssence(t); clearError("s_essence") }} multiline rows={2} maxLength={300} placeholder="Why our fast intuitive thinking often misleads us..." />
              <FieldError msg={errors.s_essence} />
            </Accordion>

            <Accordion title="Voices (3–4 quotes)" required defaultOpen>
              <FieldError msg={errors.s_voices} />
              {voices.map((v, i) => (
                <ItemCard key={i}>
                  <Help text={`Quote ${i + 1}`} />
                  <Field value={v.quote} onChangeText={(t) => { const n = [...voices]; n[i] = { ...n[i], quote: t }; setVoices(n) }} multiline rows={2} placeholder="Quote text..." style={{ marginBottom: 8 }} />
                  <Field value={v.attribution} onChangeText={(t) => { const n = [...voices]; n[i] = { ...n[i], attribution: t }; setVoices(n) }} placeholder="Attribution (name, role, page, etc.)" />
                </ItemCard>
              ))}
              <View style={{ flexDirection: "row", gap: 12 }}>
                {voices.length < 4 && <QuietButton label="+ Add quote" accent onPress={() => setVoices([...voices, emptyVoice()])} />}
                {voices.length > 3 && <QuietButton label="Remove last" onPress={() => setVoices(voices.slice(0, -1))} />}
              </View>
            </Accordion>

            <Accordion title="At a Glance" required defaultOpen>
              <FieldError msg={errors.s_at_a_glance} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {([
                  { key: "genre", label: "Genre", placeholder: "Psychology", numeric: false },
                  { key: "year", label: "Year", placeholder: "2011", numeric: true },
                  { key: "country", label: "Country", placeholder: "United States", numeric: false },
                  { key: "pages", label: "Pages", placeholder: "499", numeric: true },
                  { key: "post_reading_time_min", label: "Read time (min)", placeholder: "15", numeric: true },
                  { key: "best_for", label: "Best for", placeholder: "Curious minds", numeric: false },
                ] as const).map(({ key, label, placeholder, numeric }) => (
                  <View key={key} style={{ width: "47%" }}>
                    <SubLabel text={label} />
                    <Field
                      value={atAGlance[key]}
                      onChangeText={(t) => setAagField(key, t)}
                      placeholder={placeholder}
                      keyboardType={numeric ? "numeric" : "default"}
                    />
                  </View>
                ))}
              </View>
              <Label text="Reading ease" />
              <SegmentedSelect value={atAGlance.reading_ease} options={READING_EASE_OPTIONS} onChange={(v) => setAtAGlance({ ...atAGlance, reading_ease: v as "1" | "2" | "3" })} />
              <Label text="Difficulty" />
              <SegmentedSelect value={atAGlance.post_difficulty} options={DIFFICULTY_OPTIONS} onChange={(v) => setAtAGlance({ ...atAGlance, post_difficulty: v as "1" | "2" | "3" })} />
            </Accordion>

            <Accordion title="Heart" required defaultOpen>
              <Help text="The central argument of the book in a paragraph" />
              <Field value={sHeart} onChangeText={(t) => { setSHeart(t); clearError("s_heart") }} multiline rows={4} placeholder="The heart of the book is..." />
              <FieldError msg={errors.s_heart} />
            </Accordion>

            <Accordion title="Core Ideas (6–12)" required defaultOpen>
              <FieldError msg={errors.s_core_ideas} />
              {coreIdeas.map((ci, i) => (
                <ItemCard key={i}>
                  <Help text={`Idea ${i + 1}`} />
                  <SubLabel text="Title *" />
                  <Field value={ci.title} onChangeText={(t) => { const n = [...coreIdeas]; n[i] = { ...n[i], title: t }; setCoreIdeas(n) }} placeholder="Concept name..." style={{ marginBottom: 8 }} />
                  <SubLabel text="Body *" />
                  <Field value={ci.body} onChangeText={(t) => { const n = [...coreIdeas]; n[i] = { ...n[i], body: t }; setCoreIdeas(n) }} multiline rows={3} placeholder="Explain the idea..." style={{ marginBottom: 8 }} />
                  <SubLabel text="In practice (optional)" />
                  <Field value={ci.in_practice} onChangeText={(t) => { const n = [...coreIdeas]; n[i] = { ...n[i], in_practice: t }; setCoreIdeas(n) }} placeholder="How to apply this..." style={{ marginBottom: 8 }} />
                  <SubLabel text="Pull quote (optional)" />
                  <Field value={ci.quote} onChangeText={(t) => { const n = [...coreIdeas]; n[i] = { ...n[i], quote: t }; setCoreIdeas(n) }} placeholder="A notable quote..." />
                </ItemCard>
              ))}
              <View style={{ flexDirection: "row", gap: 12 }}>
                {coreIdeas.length < 12 && <QuietButton label="+ Add idea" accent onPress={() => setCoreIdeas([...coreIdeas, emptyCoreIdea()])} />}
                {coreIdeas.length > 6 && <QuietButton label="Remove last" onPress={() => setCoreIdeas(coreIdeas.slice(0, -1))} />}
              </View>
            </Accordion>

            <Accordion title="Takeaway" required defaultOpen>
              <FieldError msg={errors.s_takeaway} />
              <SubLabel text="Framing" />
              <SegmentedSelect
                value={takeaway.framing}
                options={[
                  { value: "framework", label: "Framework (a model or principle)" },
                  { value: "question", label: "Question (a reflection prompt)" },
                ]}
                onChange={(v) => setTakeaway({ ...takeaway, framing: v as "framework" | "question" })}
              />
              <Label text="Body *" />
              <Field value={takeaway.body} onChangeText={(t) => { setTakeaway({ ...takeaway, body: t }); clearError("s_takeaway") }} multiline rows={3} placeholder="The key thing to take away..." />
            </Accordion>

            {renderQuizAccordion()}
            {renderSourcesAccordion()}

            {/* Optional sections */}
            <Accordion title="Why It Endures">
              <Field value={sWhyEndures} onChangeText={setSWhyEndures} multiline rows={3} placeholder="Why this book is still relevant today..." />
            </Accordion>

            <Accordion title="Structure">
              {structure.map((s, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <Field value={s} onChangeText={(t) => { const n = [...structure]; n[i] = t; setStructure(n) }} placeholder={`Part ${i + 1}...`} style={{ flex: 1 }} />
                  {structure.length > 1 && (
                    <Pressable onPress={() => setStructure(structure.filter((_, idx) => idx !== i))} style={{ width: 32, height: 40, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 20, color: colors["ink-muted"] }}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {structure.length < 10 && <QuietButton label="+ Add part" accent onPress={() => setStructure([...structure, ""])} />}
            </Accordion>

            <Accordion title="Related Posts (3)">
              {relatedPosts.map((r, i) => (
                <ItemCard key={i}>
                  <SubLabel text="Title" />
                  <Field value={r.title} onChangeText={(t) => { const n = [...relatedPosts]; n[i] = { ...n[i], title: t }; setRelatedPosts(n) }} placeholder="Related book or post title..." style={{ marginBottom: 8 }} />
                  <SubLabel text="Mini teaser" />
                  <Field value={r.mini_teaser} onChangeText={(t) => { const n = [...relatedPosts]; n[i] = { ...n[i], mini_teaser: t }; setRelatedPosts(n) }} placeholder="One line about it..." style={{ marginBottom: 8 }} />
                  <SubLabel text="Format" />
                  <SegmentedSelect value={r.format} options={FORMAT_IDS.map((f) => ({ value: f, label: f }))} onChange={(v) => { const n = [...relatedPosts]; n[i] = { ...n[i], format: v }; setRelatedPosts(n) }} />
                </ItemCard>
              ))}
            </Accordion>

            <Accordion title="World Context">
              <Field value={sWorldContext} onChangeText={setSWorldContext} multiline rows={3} placeholder="The historical or cultural context when the book was written..." />
            </Accordion>

            <Accordion title="Author Context">
              <Field value={authorContext.body} onChangeText={(t) => setAuthorContext({ ...authorContext, body: t })} multiline rows={3} placeholder="About the author..." style={{ marginBottom: 8 }} />
              <SubLabel text="Wikipedia URL" />
              <Field value={authorContext.wikipedia_url} onChangeText={(t) => setAuthorContext({ ...authorContext, wikipedia_url: t })} placeholder="https://en.wikipedia.org/wiki/..." keyboardType="url" autoCapitalize="none" />
            </Accordion>

            <Accordion title="Critique & Limitations">
              <Field value={sCritique} onChangeText={setSCritique} multiline rows={3} placeholder="Where the book falls short or has been criticized..." />
            </Accordion>

            {errors.image_urls && (
              <View style={{ backgroundColor: "rgba(192, 88, 112, 0.1)", borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.bad }}>{errors.image_urls}</Text>
              </View>
            )}
            {serverError !== "" && <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.bad, marginBottom: 12 }}>{serverError}</Text>}
            <View style={{ marginTop: 8 }}>
              <BigButton label={submitting ? "Submitting..." : "Submit post"} disabled={submitting} onPress={handleSubmit} />
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav active="create" />
    </KeyboardAvoidingView>
  )
}
