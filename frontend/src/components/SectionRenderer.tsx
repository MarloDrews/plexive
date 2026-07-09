import { memo, useMemo } from "react"
import type { Section } from "../types/post"
import ErrorBoundary from "./ErrorBoundary"
import EssenceSection from "./sections/EssenceSection"
import VoicesSection from "./sections/VoicesSection"
import AtAGlanceSection from "./sections/AtAGlanceSection"
import WhyEnduresSection from "./sections/WhyEnduresSection"
import WhyReadItSection from "./sections/WhyReadItSection"
import HeartSection from "./sections/HeartSection"
import StructureSection from "./sections/StructureSection"
import InfluenceSection from "./sections/InfluenceSection"
import CoreIdeasSection from "./sections/CoreIdeasSection"
import TakeawaySection from "./sections/TakeawaySection"
import QuizSection from "./sections/QuizSection"
import WorldContextSection from "./sections/WorldContextSection"
import AuthorContextSection from "./sections/AuthorContextSection"
import CritiqueSection from "./sections/CritiqueSection"
import SourcesSection from "./sections/SourcesSection"
import HeadlineSection from "./sections/HeadlineSection"
import SeeItSection from "./sections/SeeItSection"
import KeyNumbersSection from "./sections/KeyNumbersSection"
import TangibleSection from "./sections/TangibleSection"
import HowWeKnowSection from "./sections/HowWeKnowSection"
import SurprisesSection from "./sections/SurprisesSection"
import AnglesSection from "./sections/AnglesSection"
import StorySection from "./sections/StorySection"
import BiggerPictureSection from "./sections/BiggerPictureSection"
import MisconceptionsSection from "./sections/MisconceptionsSection"
import OpenQuestionsSection from "./sections/OpenQuestionsSection"
import IdentitySection from "./sections/IdentitySection"
import PortraitSection from "./sections/PortraitSection"
import WhyTheyMatterSection from "./sections/WhyTheyMatterSection"
import LifeArcSection from "./sections/LifeArcSection"
import DefiningMomentsSection from "./sections/DefiningMomentsSection"
import GreatestWorkSection from "./sections/GreatestWorkSection"
import WhatDroveThemSection from "./sections/WhatDroveThemSection"
import LegacySection from "./sections/LegacySection"
import TheirWorldSection from "./sections/TheirWorldSection"
import TheQuestionSection from "./sections/TheQuestionSection"
import SetupSection from "./sections/SetupSection"
import WhyItsHardSection from "./sections/WhyItsHardSection"
import WhatHangsOnItSection from "./sections/WhatHangsOnItSection"
import PerspectivesSection from "./sections/PerspectivesSection"
import WhereTheyClashSection from "./sections/WhereTheyClashSection"
import WhatScienceSaysSection from "./sections/WhatScienceSaysSection"
import YourTurnSection from "./sections/YourTurnSection"
import HistoryOfTheQuestionSection from "./sections/HistoryOfTheQuestionSection"
import WhereTheDebateStandsSection from "./sections/WhereTheDebateStandsSection"
import ColdOpenSection from "./sections/ColdOpenSection"
import SettingSection from "./sections/SettingSection"
import ChaptersSection from "./sections/ChaptersSection"
import TheTurnSection from "./sections/TheTurnSection"
import TheAftermathSection from "./sections/TheAftermathSection"
import WhatItMeansSection from "./sections/WhatItMeansSection"
import WhatWeLearnSection from "./sections/WhatWeLearnSection"
import UnansweredSection from "./sections/UnansweredSection"
import CastSection from "./sections/CastSection"
import HistoricalContextSection from "./sections/HistoricalContextSection"
import OneLinerSection from "./sections/OneLinerSection"
import IntuitionSection from "./sections/IntuitionSection"
import VisualExplanationSection from "./sections/VisualExplanationSection"
import HowItWorksSection from "./sections/HowItWorksSection"
import FormalDefinitionSection from "./sections/FormalDefinitionSection"
import RealWorldExamplesSection from "./sections/RealWorldExamplesSection"
import HowToApplySection from "./sections/HowToApplySection"
import WhereItBreaksSection from "./sections/WhereItBreaksSection"
import MentalTakeawaySection from "./sections/MentalTakeawaySection"
import OriginSection from "./sections/OriginSection"
import NearbyConceptsSection from "./sections/NearbyConceptsSection"
import PaperCardSection from "./sections/PaperCardSection"
import TldrSection from "./sections/TldrSection"
import HeadlineFigureSection from "./sections/HeadlineFigureSection"
import TheBigIdeaSection from "./sections/TheBigIdeaSection"
import FieldContextSection from "./sections/FieldContextSection"
import ApproachSection from "./sections/ApproachSection"
import FormalismSection from "./sections/FormalismSection"
import KeyFindingsSection from "./sections/KeyFindingsSection"
import RobustnessSection from "./sections/RobustnessSection"
import LimitationsSection from "./sections/LimitationsSection"
import ObjectionsSection from "./sections/ObjectionsSection"
import ImplicationsSection from "./sections/ImplicationsSection"
import ConnectionsToOtherFieldsSection from "./sections/ConnectionsToOtherFieldsSection"
import DataOrSampleSection from "./sections/DataOrSampleSection"
import FiguresSection from "./sections/FiguresSection"
import AuthorsContextSection from "./sections/AuthorsContextSection"

interface Props {
  sections: Section[]
  isUserContent: boolean
  postId: number
  // Post format, used for the few shared sections whose caps header is
  // per-format (e.g. voices: "In Their Own Words" for people).
  format: string
  // Server-computed reading time (post.reading_minutes), passed down so the
  // at_a_glance row shows the same value as the card footer and detail header.
  readingMinutes: number
}

// Sections that are visible metadata or navigation rather than prose;
// read-aloud skips them via data-no-read so only real content is spoken.
const NO_READ_SECTIONS = new Set([
  "at_a_glance",
  "quiz",
  "paper_card",
  "figures",
  "sources",
])

// Shown by the per-section ErrorBoundary when a section throws while rendering.
function SectionFallback() {
  return (
    <div className="px-6 py-4 text-sm text-ink-muted">This section could not be displayed.</div>
  )
}

// memo (export at the bottom): the detail page re-renders on comment drafts,
// read-aloud status changes and like taps; with a stable (memoized) sections
// prop the whole tree, including every MathText, skips those re-renders.
function SectionRenderer({ sections, isUserContent, postId, format, readingMinutes }: Props) {
  // Skip null/malformed entries and treat a missing order as 0 so the comparator
  // stays consistent (a.order - b.order is NaN when order is absent, which can
  // scramble the whole list).
  const sorted = useMemo(
    () => sections.filter(Boolean).sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0)),
    [sections],
  )

  return (
    // Serif is the reading voice; labels (.label-caps) and data (font-mono)
    // opt back out locally. --accent is set by the post page container.
    // No line dividers: per LAYOUT_STANDARD section 7 whitespace is the single
    // divider system, so sections are separated by their uniform px-6 py-8 rhythm.
    <div className="flex flex-col font-serif">
      {sorted.map((section, i) => {
        const c = section.content
        const rendered = (() => {
        switch (section.type) {
          case "essence":
            return <EssenceSection key={i} content={c as string} />
          case "why_read_it":
            return <WhyReadItSection key={i} content={c as string} />
          case "influence":
            return <InfluenceSection key={i} content={c as string} />
          case "voices":
            return <VoicesSection key={i} content={c as any} label={format === "people" ? "In Their Own Words" : format === "books" ? "Voices from the Book" : undefined} />
          case "at_a_glance":
            return <AtAGlanceSection key={i} content={c as any} readingMinutes={readingMinutes} />
          case "why_endures":
            return <WhyEnduresSection key={i} content={c as string} />
          case "heart":
            return <HeartSection key={i} content={c as string} />
          case "structure":
            return <StructureSection key={i} content={c as string[]} />
          case "core_ideas":
            return <CoreIdeasSection key={i} content={c as any} isUserContent={isUserContent} />
          case "takeaway":
            return <TakeawaySection key={i} content={c as any} isUserContent={isUserContent} />
          case "quiz":
            return <QuizSection key={i} content={c as any} postId={postId} />
          case "world_context":
            return <WorldContextSection key={i} content={c as string} />
          case "author_context":
            return <AuthorContextSection key={i} content={c as any} />
          case "critique":
            return <CritiqueSection key={i} content={c as string} />
          case "sources":
            return <SourcesSection key={i} content={c as any} />
          case "headline":
            return <HeadlineSection key={i} content={c as string} />
          case "see_it":
            return <SeeItSection key={i} content={c as any} isUserContent={isUserContent} />
          case "key_numbers":
            return <KeyNumbersSection key={i} content={c as any} />
          case "tangible":
            return <TangibleSection key={i} content={c as any} isUserContent={isUserContent} />
          case "how_we_know":
            return <HowWeKnowSection key={i} content={c as string} />
          case "surprises":
            return <SurprisesSection key={i} content={c as string} />
          case "angles":
            return <AnglesSection key={i} content={c as any} isUserContent={isUserContent} />
          case "story":
            return <StorySection key={i} content={c as any} isUserContent={isUserContent} />
          case "bigger_picture":
            return <BiggerPictureSection key={i} content={c as string} />
          case "misconceptions":
            return <MisconceptionsSection key={i} content={c as any} />
          case "open_questions":
            return <OpenQuestionsSection key={i} content={c as any} />
          case "identity":
            return <IdentitySection key={i} content={c as string} />
          case "portrait":
            return <PortraitSection key={i} content={c as any} />
          case "why_they_matter":
            return <WhyTheyMatterSection key={i} content={c as string} />
          case "life_arc":
            return <LifeArcSection key={i} content={c as any} isUserContent={isUserContent} />
          case "defining_moments":
            return <DefiningMomentsSection key={i} content={c as any} isUserContent={isUserContent} />
          case "greatest_work":
            return <GreatestWorkSection key={i} content={c as any} isUserContent={isUserContent} />
          case "what_drove_them":
            return <WhatDroveThemSection key={i} content={c as string} />
          case "legacy":
            return <LegacySection key={i} content={c as any} />
          case "their_world":
            return <TheirWorldSection key={i} content={c as string} />
          case "the_question":
            return <TheQuestionSection key={i} content={c as string} />
          case "setup":
            return <SetupSection key={i} content={c as string} />
          case "why_its_hard":
            return <WhyItsHardSection key={i} content={c as string} />
          case "what_hangs_on_it":
            return <WhatHangsOnItSection key={i} content={c as string} />
          case "perspectives":
            return <PerspectivesSection key={i} content={c as any} isUserContent={isUserContent} />
          case "where_they_clash":
            return <WhereTheyClashSection key={i} content={c as string} />
          case "what_science_says":
            return <WhatScienceSaysSection key={i} content={c as any} isUserContent={isUserContent} />
          case "your_turn":
            return <YourTurnSection key={i} content={c as any} />
          case "history_of_the_question":
            return <HistoryOfTheQuestionSection key={i} content={c as string} />
          case "where_the_debate_stands":
            return <WhereTheDebateStandsSection key={i} content={c as string} />
          case "cold_open":
            return <ColdOpenSection key={i} content={c as string} />
          case "setting":
            return <SettingSection key={i} content={c as any} isUserContent={isUserContent} />
          case "chapters":
            return <ChaptersSection key={i} content={c as any} />
          case "the_turn":
            return <TheTurnSection key={i} content={c as any} />
          case "the_aftermath":
            return <TheAftermathSection key={i} content={c as any} />
          case "what_it_means":
            return <WhatItMeansSection key={i} content={c as string} />
          case "what_we_learn":
            return <WhatWeLearnSection key={i} content={c as string} />
          case "unanswered":
            return <UnansweredSection key={i} content={c as string} />
          case "cast":
            return <CastSection key={i} content={c as any} />
          case "historical_context":
            return <HistoricalContextSection key={i} content={c as string} />
          case "one_liner":
            return <OneLinerSection key={i} content={c as string} />
          case "intuition":
            return <IntuitionSection key={i} content={c as string} />
          case "visual_explanation":
            return <VisualExplanationSection key={i} content={c as any} isUserContent={isUserContent} />
          case "how_it_works":
            return <HowItWorksSection key={i} content={c as any} isUserContent={isUserContent} />
          case "formal_definition":
            return <FormalDefinitionSection key={i} content={c as any} />
          case "real_world_examples":
            return <RealWorldExamplesSection key={i} content={c as any} isUserContent={isUserContent} />
          case "how_to_apply":
            return <HowToApplySection key={i} content={c as any} isUserContent={isUserContent} />
          case "where_it_breaks":
            return <WhereItBreaksSection key={i} content={c as string} />
          case "mental_takeaway":
            return <MentalTakeawaySection key={i} content={c as any} isUserContent={isUserContent} />
          case "origin":
            return <OriginSection key={i} content={c as any} />
          case "nearby_concepts":
            return <NearbyConceptsSection key={i} content={c as any} />
          case "paper_card":
            return <PaperCardSection key={i} content={c as any} />
          case "tldr":
            return <TldrSection key={i} content={c as string} />
          case "headline_figure":
            return <HeadlineFigureSection key={i} content={c as any} isUserContent={isUserContent} />
          case "the_big_idea":
            return <TheBigIdeaSection key={i} content={c as string} />
          case "field_context":
            return <FieldContextSection key={i} content={c as any} />
          case "approach":
            return <ApproachSection key={i} content={c as any} isUserContent={isUserContent} />
          case "formalism":
            return <FormalismSection key={i} content={c as any} />
          case "key_findings":
            return <KeyFindingsSection key={i} content={c as any} isUserContent={isUserContent} />
          case "robustness":
            return <RobustnessSection key={i} content={c as string} />
          case "limitations":
            return <LimitationsSection key={i} content={c as string} />
          case "objections":
            return <ObjectionsSection key={i} content={c as string} />
          case "implications":
            return <ImplicationsSection key={i} content={c as string} />
          case "connections_to_other_fields":
          case "cross_field_reach":
            return <ConnectionsToOtherFieldsSection key={i} content={c as string} />
          case "data_or_sample":
            return <DataOrSampleSection key={i} content={c as string} />
          case "figures":
            return <FiguresSection key={i} content={c as any} />
          case "authors_context":
            return <AuthorsContextSection key={i} content={c as any} />
          default:
            console.warn(`SectionRenderer: unknown section type "${section.type}"`)
            return null
        }
        })()
        if (!rendered) return null
        const wrapped = NO_READ_SECTIONS.has(section.type)
          ? <div data-no-read>{rendered}</div>
          : rendered
        // Contain a section-level render throw to this one section: a malformed
        // row degrades to a small notice instead of taking down the whole post.
        // Keyed by post + index so a new post gets a fresh boundary.
        return (
          <ErrorBoundary key={`${postId}-${i}`} fallback={<SectionFallback />}>
            {wrapped}
          </ErrorBoundary>
        )
      })}
    </div>
  )
}

export default memo(SectionRenderer)
