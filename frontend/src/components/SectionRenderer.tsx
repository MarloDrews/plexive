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
          default:
            console.warn(`SectionRenderer: unknown section type "${section.type}"`)
            return null
        }
      })}
    </div>
  )
}
