export interface VoiceItem {
  quote: string
  attribution: string
}

export interface AtAGlanceBooksContent {
  genre: string
  year: number
  country: string
  pages: number
  reading_ease: 1 | 2 | 3
  post_difficulty: 1 | 2 | 3
  best_for: string
}

export interface AtAGlancePeopleContent {
  born: string
  died?: string
  nationality: string
  field: string
  known_for: string
  movement_or_era?: string
  post_difficulty: 1 | 2 | 3
}

export interface CoreIdeaItem {
  title: string
  body: string
  in_practice?: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
  quote?: string
}

export interface TakeawayContent {
  framing: "framework" | "question"
  body: string
  visual_svg?: string
}

// answer_index and explanation are stripped by the API before delivery;
// correctness comes from POST /api/quiz/answer (validated server-side).
export interface QuizItem {
  question: string
  options: [string, string, string, string]
  answer_index?: 0 | 1 | 2 | 3
  explanation?: string
}

// Server-resolved "read next" edge (PostOut.read_next; produced by the backend
// graph_edges.resolved_read_next). A resolved entry carries the live target's id;
// a latent one has target_post_id null and latent true (target not published yet).
export interface ReadNextItem {
  target_post_id: number | null
  format: string
  title: string
  latent: boolean
}

export interface SourceItem {
  label: string
  url: string
  type: "wikipedia" | "paper" | "book" | "article" | "database"
}

export interface AuthorContextContent {
  body: string
  image_url?: string
  image_attribution?: string
  wikipedia_url?: string
}

export interface SeeItContent {
  visual_svg?: string
  image_url?: string
  image_caption: string
  image_attribution?: string
}

export interface KeyNumberItem {
  label: string
  value: string
  unit?: string
}

export interface TangibleContent {
  items: string[]
  visual_svg?: string
}

export interface AngleItem {
  title: string
  body: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface KeyFigure {
  name: string
  role: string
  one_line?: string
  lifespan?: string
  birth_year?: number
  featured?: boolean
  image_url?: string
  image_attribution?: string
}

// A connection's target identity. The shape depends on the connection's `format`:
// people -> { name, birth_year? }, books -> { title, author }, any other -> { title }.
export type ConnectionRef =
  | { name: string; birth_year?: number }   // target: people
  | { title: string; author: string }       // target: books
  | { title: string }                        // any other format

// Graph edge to another post (top-level on Post). The target may not exist yet
// (latent edge), so it is identified by natural identity in `ref`, not an id.
export interface ConnectionItem {
  format: string
  ref: ConnectionRef
  featured: boolean
}

export interface StoryContent {
  body: string
  key_figures?: KeyFigure[]
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface MisconceptionItem {
  myth: string
  reality: string
}

export interface AtAGlanceQuestionsContent {
  field: string
  type: string
  first_posed_by: string
  year: string | number
  still_debated: boolean
  post_difficulty: 1 | 2 | 3
}

export interface AtAGlanceStoriesContent {
  era: string
  location: string
  category: string
  sources_reliability: 1 | 2 | 3
  post_difficulty: 1 | 2 | 3
}

export interface PerspectiveItem {
  position_name: string
  school_or_thinker?: string
  body: string
  strongest_argument: string
  concrete_example?: string
  visual_svg?: string
  image_url?: string
  image_attribution?: string
}

export interface WhatScienceSaysContent {
  body: string
  key_findings: string[]
  visual_svg?: string
}

export interface YourTurnContent {
  intro: string
  prompts: string[]
  closing_thought: string
}

export interface StoryChapter {
  title: string
  body: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface SettingContent {
  body: string
  // The one rare drawn slot in Stories: a map where place genuinely needs
  // showing (stories_skeleton VISUAL PLAN). The format is image-led, not drawn.
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface TheTurnContent {
  body: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface TheAftermathContent {
  body: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface CastMember {
  name: string
  role: string
  one_line?: string
  lifespan?: string
  // Graph fields (birth_year/featured) are not displayed; image fields render
  // an optional portrait + its required credit (IMAGE_STANDARD s3).
  birth_year?: number
  featured?: boolean
  image_url?: string
  image_attribution?: string
}

// Academy section types

export interface PaperAuthor {
  name: string
  affiliation: string
}

export interface PaperCardContent {
  title: string
  authors: PaperAuthor[]
  venue: string
  year: number
  doi?: string
  arxiv_id?: string
  code_url?: string
  data_url?: string
  funding_source?: string
  conflicts_of_interest?: string
}

export interface HeadlineFigureContent {
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

// One of the paper's own multi-panel figures (the optional `figures` section).
// Always a sourced image with attribution (IMAGE_STANDARD s3-s4); rebuilt SVGs
// live inside the finding they support, not here.
export interface FigureItem {
  figure_label: string
  image_url: string
  image_caption: string
  image_attribution: string
}

export interface KeyPriorItem {
  citation: string
  claim: string
}

export interface FieldContextContent {
  body: string
  key_priors: KeyPriorItem[]
}

export interface ApproachContent {
  body: string
  visual_svg?: string
}

export interface EquationItem {
  latex: string
  label: string
  description: string
}

export interface NotationItem {
  symbol: string
  meaning: string
}

export interface FormalismContent {
  body: string
  equations: EquationItem[]
  notation_legend: NotationItem[]
}

export interface KeyFindingItem {
  title: string
  finding: string
  effect_size?: string
  statistical_detail?: string
  source_in_paper?: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

export interface AtAGlanceAcademyContent {
  study_type: string
  // Optional methodology signals: an absent key reads as not-applicable, so the
  // renderer only shows the keys that are present (skeleton: omit when N/A).
  sample_size?: string
  pre_registered?: boolean
  open_data?: boolean
  open_code?: boolean
  replication_status: string
  peer_review_status: string
  result_direction: string
  post_difficulty: 1 | 2 | 3
}

export interface AuthorsContextItem {
  name: string
  role: string
  one_line?: string
  affiliation?: string
  // Graph fields (birth_year/featured) are not displayed; image fields render an
  // optional portrait + its required credit (IMAGE_STANDARD s3).
  birth_year?: number
  featured?: boolean
  image_url?: string
  image_attribution?: string
}

export interface OpenQuestionsContent {
  body: string
  items?: string[]
}

export type SectionType =
  | "essence"
  | "voices"
  | "at_a_glance"
  | "why_endures"
  | "heart"
  | "structure"
  | "core_ideas"
  | "takeaway"
  | "quiz"
  | "world_context"
  | "author_context"
  | "critique"
  | "sources"
  | "headline"
  | "see_it"
  | "key_numbers"
  | "tangible"
  | "how_we_know"
  | "surprises"
  | "angles"
  | "story"
  | "bigger_picture"
  | "misconceptions"
  | "open_questions"
  | "identity"
  | "portrait"
  | "why_they_matter"
  | "life_arc"
  | "defining_moments"
  | "greatest_work"
  | "what_drove_them"
  | "legacy"
  | "their_world"
  | "the_question"
  | "setup"
  | "why_its_hard"
  | "what_hangs_on_it"
  | "perspectives"
  | "where_they_clash"
  | "what_science_says"
  | "your_turn"
  | "history_of_the_question"
  | "where_the_debate_stands"
  | "cold_open"
  | "setting"
  | "chapters"
  | "the_turn"
  | "the_aftermath"
  | "what_it_means"
  | "what_we_learn"
  | "unanswered"
  | "cast"
  | "historical_context"
  | "one_liner"
  | "intuition"
  | "visual_explanation"
  | "how_it_works"
  | "formal_definition"
  | "real_world_examples"
  | "how_to_apply"
  | "where_it_breaks"
  | "mental_takeaway"
  | "origin"
  | "nearby_concepts"
  | "paper_card"
  | "tldr"
  | "headline_figure"
  | "the_big_idea"
  | "field_context"
  | "approach"
  | "formalism"
  | "key_findings"
  | "robustness"
  | "limitations"
  | "objections"
  | "implications"
  | "connections_to_other_fields"
  | "cross_field_reach"
  | "data_or_sample"
  | "figures"
  | "authors_context"

export interface Section {
  type: SectionType | string
  order: number
  content: unknown
}

// feed_card is format-specific JSON, so fields arrive as unknown.
// This accessor narrows a field to string for display without unsafe casts.
export function fcStr(fc: Record<string, unknown> | undefined, key: string): string {
  const v = fc?.[key]
  return typeof v === "string" ? v : ""
}

// Same narrowing for numeric fields; 0 means absent (no field uses 0 as a real value).
export function fcNum(fc: Record<string, unknown> | undefined, key: string): number {
  const v = fc?.[key]
  return typeof v === "number" ? v : 0
}

export interface Post {
  id: number
  format: string
  title: string
  feed_card: Record<string, unknown>
  sections: Section[]
  tags?: string[]
  connections?: ConnectionItem[]
  // Server-resolved featured edges for the detail page (only GET /api/posts/{id}
  // populates it). The client renders this directly; it never re-derives it.
  read_next?: ReadNextItem[]
  author_id: number | null
  author_username: string | null
  author_is_verified: number | null
  author_avatar_url: string | null
  status: string
  created_at: string
  is_user_content: boolean
  like_count: number
  comment_count: number
  // Reading time computed on the server from the post's text (see backend
  // reading_time.py); present on both list and detail responses.
  reading_minutes: number
  interests: string[]
  // Display name of the primary category (tags[0]), resolved on the server from
  // the post's own interests (Interest.name) so the card eyebrow and the interest
  // chips label the same slug identically. Null when tags[0] is absent/unmapped.
  primary_category_name?: string | null
}
