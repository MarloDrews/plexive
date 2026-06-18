import { View } from "react-native"
import type { Section } from "../types/post"
import { colors } from "../theme/tokens"
import EssenceSection from "./sections/EssenceSection"
import VoicesSection from "./sections/VoicesSection"
import AtAGlanceSection from "./sections/AtAGlanceSection"
import WhyEnduresSection from "./sections/WhyEnduresSection"
import HeartSection from "./sections/HeartSection"
import StructureSection from "./sections/StructureSection"
import CoreIdeasSection from "./sections/CoreIdeasSection"
import TakeawaySection from "./sections/TakeawaySection"
import QuizSection from "./sections/QuizSection"
import RelatedPostsSection from "./sections/RelatedPostsSection"
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
import AuthorsContextSection from "./sections/AuthorsContextSection"

// Port of frontend/src/components/SectionRenderer.tsx: sorts sections by
// order and dispatches on section.type. isUserContent flows to every
// SVG-rendering section (seed-vs-user security rule), postId to QuizSection.
// The web's divide-y hairlines become a top border on every section after
// the first.

interface Props {
  sections: Section[]
  isUserContent: boolean
  postId: number
}

function renderSection(section: Section, isUserContent: boolean, postId: number) {
  const c = section.content
  switch (section.type) {
    case "essence":
      return <EssenceSection content={c as string} />
    case "voices":
      return <VoicesSection content={c as any} />
    case "at_a_glance":
      return <AtAGlanceSection content={c as any} />
    case "why_endures":
      return <WhyEnduresSection content={c as string} />
    case "heart":
      return <HeartSection content={c as string} />
    case "structure":
      return <StructureSection content={c as string[]} />
    case "core_ideas":
      return <CoreIdeasSection content={c as any} isUserContent={isUserContent} />
    case "takeaway":
      return <TakeawaySection content={c as any} isUserContent={isUserContent} />
    case "quiz":
      return <QuizSection content={c as any} postId={postId} />
    case "related_posts":
      return <RelatedPostsSection content={c as any} />
    case "world_context":
      return <WorldContextSection content={c as string} />
    case "author_context":
      return <AuthorContextSection content={c as any} />
    case "critique":
      return <CritiqueSection content={c as string} />
    case "sources":
      return <SourcesSection content={c as any} />
    case "headline":
      return <HeadlineSection content={c as string} />
    case "see_it":
      return <SeeItSection content={c as any} isUserContent={isUserContent} />
    case "key_numbers":
      return <KeyNumbersSection content={c as any} />
    case "tangible":
      return <TangibleSection content={c as string[]} />
    case "how_we_know":
      return <HowWeKnowSection content={c as string} />
    case "surprises":
      return <SurprisesSection content={c as string} />
    case "angles":
      return <AnglesSection content={c as any} isUserContent={isUserContent} />
    case "story":
      return <StorySection content={c as any} isUserContent={isUserContent} />
    case "bigger_picture":
      return <BiggerPictureSection content={c as string} />
    case "misconceptions":
      return <MisconceptionsSection content={c as any} />
    case "identity":
      return <IdentitySection content={c as string} />
    case "portrait":
      return <PortraitSection content={c as any} />
    case "why_they_matter":
      return <WhyTheyMatterSection content={c as string} />
    case "life_arc":
      return <LifeArcSection content={c as any} isUserContent={isUserContent} />
    case "defining_moments":
      return <DefiningMomentsSection content={c as any} isUserContent={isUserContent} />
    case "greatest_work":
      return <GreatestWorkSection content={c as any} isUserContent={isUserContent} />
    case "what_drove_them":
      return <WhatDroveThemSection content={c as string} />
    case "legacy":
      return <LegacySection content={c as any} />
    case "their_world":
      return <TheirWorldSection content={c as string} />
    case "the_question":
      return <TheQuestionSection content={c as string} />
    case "setup":
      return <SetupSection content={c as string} />
    case "why_its_hard":
      return <WhyItsHardSection content={c as string} />
    case "what_hangs_on_it":
      return <WhatHangsOnItSection content={c as string} />
    case "perspectives":
      return <PerspectivesSection content={c as any} />
    case "where_they_clash":
      return <WhereTheyClashSection content={c as string} />
    case "what_science_says":
      return <WhatScienceSaysSection content={c as any} isUserContent={isUserContent} />
    case "your_turn":
      return <YourTurnSection content={c as any} />
    case "history_of_the_question":
      return <HistoryOfTheQuestionSection content={c as string} />
    case "where_the_debate_stands":
      return <WhereTheDebateStandsSection content={c as string} />
    case "cold_open":
      return <ColdOpenSection content={c as string} />
    case "setting":
      return <SettingSection content={c as any} />
    case "chapters":
      return <ChaptersSection content={c as any} />
    case "the_turn":
      return <TheTurnSection content={c as any} />
    case "the_aftermath":
      return <TheAftermathSection content={c as any} isUserContent={isUserContent} />
    case "what_it_means":
      return <WhatItMeansSection content={c as string} />
    case "what_we_learn":
      return <WhatWeLearnSection content={c as string} />
    case "unanswered":
      return <UnansweredSection content={c as string} />
    case "cast":
      return <CastSection content={c as any} />
    case "historical_context":
      return <HistoricalContextSection content={c as string} />
    case "one_liner":
      return <OneLinerSection content={c as string} />
    case "intuition":
      return <IntuitionSection content={c as string} />
    case "visual_explanation":
      return <VisualExplanationSection content={c as any} isUserContent={isUserContent} />
    case "how_it_works":
      return <HowItWorksSection content={c as any} />
    case "formal_definition":
      return <FormalDefinitionSection content={c as any} />
    case "real_world_examples":
      return <RealWorldExamplesSection content={c as any} />
    case "how_to_apply":
      return <HowToApplySection content={c as any} isUserContent={isUserContent} />
    case "where_it_breaks":
      return <WhereItBreaksSection content={c as string} />
    case "mental_takeaway":
      return <MentalTakeawaySection content={c as any} isUserContent={isUserContent} />
    case "origin":
      return <OriginSection content={c as any} />
    case "nearby_concepts":
      return <NearbyConceptsSection content={c as any} />
    case "paper_card":
      return <PaperCardSection content={c as any} />
    case "tldr":
      return <TldrSection content={c as string} />
    case "headline_figure":
      return <HeadlineFigureSection content={c as any} isUserContent={isUserContent} />
    case "the_big_idea":
      return <TheBigIdeaSection content={c as string} />
    case "field_context":
      return <FieldContextSection content={c as any} />
    case "approach":
      return <ApproachSection content={c as any} isUserContent={isUserContent} />
    case "formalism":
      return <FormalismSection content={c as any} />
    case "key_findings":
      return <KeyFindingsSection content={c as any} isUserContent={isUserContent} />
    case "robustness":
      return <RobustnessSection content={c as string} />
    case "limitations":
      return <LimitationsSection content={c as string} />
    case "objections":
      return <ObjectionsSection content={c as string} />
    case "implications":
      return <ImplicationsSection content={c as string} />
    case "connections_to_other_fields":
      return <ConnectionsToOtherFieldsSection content={c as string} />
    case "authors_context":
      return <AuthorsContextSection content={c as any} />
    default:
      console.warn(`SectionRenderer: unknown section type "${section.type}"`)
      return null
  }
}

export default function SectionRenderer({ sections, isUserContent, postId }: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order)

  return (
    <View>
      {sorted.map((section, i) => {
        const rendered = renderSection(section, isUserContent, postId)
        if (rendered === null) return null
        return (
          <View
            key={i}
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.edge } : undefined}
          >
            {rendered}
          </View>
        )
      })}
    </View>
  )
}
