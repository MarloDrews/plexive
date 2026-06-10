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
  post_reading_time_min: number
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
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
}

export interface PeopleFeedCard {
  portrait: { image_url: string; image_attribution: string }
  name: string
  role: string
  lifespan: string
  essence: string
  teasers: [string, string, string]
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
}

export interface CoreIdeaItem {
  title: string
  body: string
  in_practice?: string
  visual_svg?: string
  image_url?: string
  quote?: string
}

export interface TakeawayContent {
  framing: "framework" | "question"
  body: string
  visual_svg?: string
}

export interface QuizItem {
  question: string
  options: [string, string, string, string]
  answer_index: 0 | 1 | 2 | 3
  explanation: string
}

export interface RelatedPostItem {
  post_id: string
  title: string
  format: string
  mini_teaser: string
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

export interface AngleItem {
  title: string
  body: string
  visual_svg?: string
  image_url?: string
}

export interface KeyFigure {
  name: string
  role: string
  one_line?: string
  lifespan?: string
  image_url?: string
}

export interface StoryContent {
  body: string
  key_figures?: KeyFigure[]
  visual_svg?: string
  image_url?: string
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
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
}

export interface AtAGlanceStoriesContent {
  era: string
  location: string
  category: string
  sources_reliability: 1 | 2 | 3
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
}

export interface PerspectiveItem {
  position_name: string
  school_or_thinker: string
  body: string
  strongest_argument: string
  concrete_example: string
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
  visual_svg?: string
  image_caption?: string
}

export interface CastMember {
  name: string
  role: string
  one_line: string
  lifespan: string
}

export type SectionType =
  | "essence"
  | "quiz_badge"
  | "voices"
  | "at_a_glance"
  | "why_endures"
  | "heart"
  | "structure"
  | "core_ideas"
  | "takeaway"
  | "quiz"
  | "related_posts"
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

export interface Section {
  type: SectionType | string
  order: number
  content: unknown
}

export interface BooksFeedCard {
  cover_url: string | null
  title: string
  author: string
  essence: string
  teasers: [string, string, string]
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
  year: number
  genre: string
}

export interface FactsFeedCard {
  field: string
  headline: string
  mini_visual_svg: string | null
  teasers: [string, string, string]
  post_reading_time_min: number
  post_difficulty: 1 | 2 | 3
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
  author_id: number | null
  author_username: string | null
  author_is_verified: boolean | null
  status: string
  created_at: string
  is_user_content: boolean
  like_count: number
  comment_count: number
  interests: string[]
}
