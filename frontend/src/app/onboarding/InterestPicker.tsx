"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface Interest {
  id: number
  name: string
  slug: string
}

export interface Category {
  label: string
  slugs: string[]
}

export const CATEGORIES: Category[] = [
  {
    label: "Science & Nature",
    slugs: [
      "physics", "quantum-physics", "astronomy", "cosmology",
      "chemistry", "biology", "genetics", "neuroscience",
      "evolution", "ecology", "climate", "geology", "oceans",
      "animals", "mathematics", "statistics", "medicine",
      "materials-science",
    ],
  },
  {
    label: "Technology & Engineering",
    slugs: [
      "artificial-intelligence", "machine-learning", "computing",
      "internet", "cybersecurity", "robotics", "biotech",
      "space-tech", "energy-tech", "engineering", "gadgets",
      "cryptography", "blockchain", "aviation", "transportation",
    ],
  },
  {
    label: "Business & Economics",
    slugs: [
      "economics", "behavioral-economics", "finance",
      "entrepreneurship", "startups", "marketing", "management",
      "negotiation", "money-history", "markets", "career",
      "productivity-work", "supply-chains", "advertising",
    ],
  },
  {
    label: "Self-Improvement & Psychology",
    slugs: [
      "psychology", "cognitive-biases", "habits", "productivity",
      "focus", "motivation", "decision-making",
      "emotional-intelligence", "mental-health", "mindfulness",
      "happiness", "relationships", "communication", "learning",
      "discipline", "confidence", "stoicism-practice",
    ],
  },
  {
    label: "Philosophy & Ideas",
    slugs: [
      "philosophy", "ethics", "stoicism", "existentialism",
      "eastern-philosophy", "logic", "epistemology",
      "consciousness", "free-will", "political-philosophy",
      "philosophy-of-mind", "meaning", "mental-models",
    ],
  },
  {
    label: "History & Civilization",
    slugs: [
      "ancient-history", "medieval-history", "modern-history",
      "world-wars", "cold-war", "empires", "revolutions",
      "ancient-egypt", "ancient-rome", "ancient-greece",
      "exploration", "archaeology", "history-of-science",
      "forgotten-history", "military-history", "history",
      "anthropology",
    ],
  },
  {
    label: "Politics & Society",
    slugs: [
      "politics", "geopolitics", "political-systems", "democracy",
      "law", "human-rights", "social-movements", "inequality",
      "propaganda", "diplomacy", "elections", "public-policy",
    ],
  },
  {
    label: "Arts & Culture",
    slugs: [
      "art-history", "music", "music-theory", "literature", "film",
      "architecture", "design", "photography", "writing",
      "mythology", "religion", "language", "poetry", "theater",
    ],
  },
  {
    label: "Health & Body",
    slugs: [
      "nutrition", "fitness", "sleep", "longevity", "human-body",
      "brain-health", "immunity", "public-health", "sports-science",
    ],
  },
  {
    label: "Curiosity & Everyday",
    slugs: [
      "everyday-science", "food-science", "games", "sports",
      "travel", "nature-phenomena", "curiosities", "future",
      "internet-culture", "crime", "money-everyday",
      "exponential-growth", "patience", "critical-thinking",
      "trade-offs", "scarcity",
    ],
  },
]

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function InterestPicker() {
  const router = useRouter()
  const [interests, setInterests] = useState<Interest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (localStorage.getItem("deepscroll_interests")) {
      router.replace("/")
      return
    }
    fetch(`${API_URL}/api/interests`)
      .then((r) => r.json())
      .then((data: Interest[]) => {
        setInterests(data)
        setLoading(false)
      })
  }, [router])

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function handleContinue() {
    localStorage.setItem("deepscroll_interests", JSON.stringify([...selected]))
    router.push("/")
  }

  const canContinue = selected.size >= 1

  // Build a lookup map from slug to Interest for fast grouping
  const bySlug = new Map(interests.map((i) => [i.slug, i]))

  // Build category sections: each entry is { label, items: Interest[] }
  const categorySections = CATEGORIES.map((cat) => ({
    label: cat.label,
    items: cat.slugs.flatMap((s) => {
      const interest = bySlug.get(s)
      return interest ? [interest] : []
    }),
  })).filter((sec) => sec.items.length > 0)

  // Interests that don't belong to any category
  const categorisedSlugs = new Set(CATEGORIES.flatMap((c) => c.slugs))
  const otherItems = interests.filter((i) => !categorisedSlugs.has(i.slug))

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
    <div className="w-full max-w-[430px] h-[100dvh] flex flex-col">
      {/* Top bar — fixed height, does not scroll */}
      <div className="shrink-0 px-6 pt-10 pb-4">
        <p className="text-zinc-500 text-xs font-semibold tracking-widest uppercase">
          Deepscroll
        </p>
        <h1 className="text-3xl font-bold text-white leading-tight mt-4">
          What are you into?
        </h1>
        <p className="text-zinc-400 text-sm mt-2">
          Pick topics to personalize your feed.
        </p>
        <p className="text-zinc-500 text-sm mt-1">
          {selected.size} selected
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {loading ? (
          <p className="text-zinc-600 text-sm mt-4">Loading...</p>
        ) : (
          <>
            {categorySections.map((section, index) => (
              <div key={section.label} className="mb-6">
                {index > 0 && (
                  <div className="border-t border-zinc-800 mb-3" />
                )}
                <p className="text-zinc-200 font-semibold text-base uppercase tracking-wider mb-3">
                  {section.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {section.items.map((i) => {
                    const isSelected = selected.has(i.slug)
                    return (
                      <button
                        key={i.id}
                        onClick={() => toggle(i.slug)}
                        className={`px-4 py-1.5 rounded-full text-sm transition-all duration-150 ${
                          isSelected
                            ? "bg-white text-zinc-950 font-semibold"
                            : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {i.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {otherItems.length > 0 && (
              <div className="mb-6">
                <div className="border-t border-zinc-800 mb-3" />
                <p className="text-zinc-200 font-semibold text-base uppercase tracking-wider mb-3">
                  Other
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherItems.map((i) => {
                    const isSelected = selected.has(i.slug)
                    return (
                      <button
                        key={i.id}
                        onClick={() => toggle(i.slug)}
                        className={`px-4 py-1.5 rounded-full text-sm transition-all duration-150 ${
                          isSelected
                            ? "bg-white text-zinc-950 font-semibold"
                            : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {i.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom bar — fixed height, does not scroll */}
      <div className="shrink-0 px-6 pt-4 pb-8 bg-surface-overlay backdrop-blur">
        <p className="text-zinc-500 text-sm mb-3">
          {selected.size} of {interests.length} selected
        </p>
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full h-12 rounded-full font-semibold text-sm transition-all ${
            canContinue
              ? "bg-white text-zinc-950 hover:bg-zinc-100"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>
    </div>
    </div>
  )
}
