import type { Section } from "../types/post"
import EssenceSection from "./sections/EssenceSection"
import QuizBadgeSection from "./sections/QuizBadgeSection"
import VoicesSection from "./sections/VoicesSection"
import AtAGlanceSection from "./sections/AtAGlanceSection"
import WhyEnduresSection from "./sections/WhyEnduresSection"
import HeartSection from "./sections/HeartSection"
import StructureSection from "./sections/StructureSection"
import CoreIdeasSection from "./sections/CoreIdeasSection"
import TakeawaySection from "./sections/TakeawaySection"
import QuizSectionPlaceholder from "./sections/QuizSectionPlaceholder"
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

interface Props {
  sections: Section[]
  isUserContent: boolean
}

export default function SectionRenderer({ sections, isUserContent }: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col divide-y divide-edge">
      {sorted.map((section, i) => {
        const c = section.content
        switch (section.type) {
          case "essence":
            return <EssenceSection key={i} content={c as string} />
          case "quiz_badge":
            return <QuizBadgeSection key={i} content={c as string} />
          case "voices":
            return <VoicesSection key={i} content={c as any} />
          case "at_a_glance":
            return <AtAGlanceSection key={i} content={c as any} />
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
            return <QuizSectionPlaceholder key={i} content={c as any} />
          case "related_posts":
            return <RelatedPostsSection key={i} content={c as any} />
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
            return <TangibleSection key={i} content={c as string[]} />
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
            return <PerspectivesSection key={i} content={c as any} />
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
            return <SettingSection key={i} content={c as any} />
          case "chapters":
            return <ChaptersSection key={i} content={c as any} />
          case "the_turn":
            return <TheTurnSection key={i} content={c as any} />
          case "the_aftermath":
            return <TheAftermathSection key={i} content={c as any} isUserContent={isUserContent} />
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
            return <HowItWorksSection key={i} content={c as any} />
          case "formal_definition":
            return <FormalDefinitionSection key={i} content={c as any} />
          case "real_world_examples":
            return <RealWorldExamplesSection key={i} content={c as any} />
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
          default:
            console.warn(`SectionRenderer: unknown section type "${section.type}"`)
            return null
        }
      })}
    </div>
  )
}
