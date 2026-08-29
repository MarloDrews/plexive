// Interest taxonomy grouping shared by the onboarding picker and the create
// wizard. Both group the flat /api/interests list into these 11 display
// categories, so the grouping lives in one place.
//
// Ten of the eleven groups are SUBJECTS (axis 1): what a post is about. The
// eleventh, "Ways of Thinking", is the KIND OF POST (axis 2): a pattern that
// recurs across subjects, so a reader picking one gets a feed weighted toward
// that shape rather than that topic. The feed only ever weights, never filters
// (feed.py:70-71), so an axis-2 pick narrows nothing.
//
// The axis is marked on the group rather than left to the label, because the
// distinction has to be machine-readable on both sides: backend/seed.py carries
// the same marking as AXIS2_SLUGS and uses it to reject an axis-2 slug at
// tags[0], and frontend/test/taxonomy-drift.test.mjs asserts the two agree in
// both directions.

export interface Category {
  label: string
  slugs: string[]
  // Absent means axis 1, a subject. Only the kind-of-post group sets this.
  axis?: 2
}

export const CATEGORIES: Category[] = [
  {
    label: "Science & Nature",
    slugs: [
      "physics", "quantum-physics", "astronomy", "cosmology",
      "chemistry", "biology", "genetics", "neuroscience",
      "evolution", "ecology", "climate", "geology", "oceans",
      "animals", "paleontology", "botany", "microbiology",
      "mathematics", "statistics", "medicine",
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
      "creativity", "discipline", "confidence", "stoicism-practice",
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
      "food-science", "games", "sports",
      "travel", "nature-phenomena", "curiosities", "future",
      "internet-culture", "crime", "money-everyday",
      "exponential-growth", "patience",
      "trade-offs", "scarcity",
    ],
  },
  // Axis 2. Not a subject: every slug here names a shape a post has, and its
  // posts' primary categories span several of the ten groups above. Kept in the
  // same flat deepscroll_interests array as every other pick (storage.ts:23,29)
  // -- splitting the storage in two would orphan every pick already made.
  {
    label: "Ways of Thinking",
    axis: 2,
    slugs: [
      "hidden-mechanisms", "reasoning-traps", "corrected-beliefs",
      "scale-shock", "overlooked-evidence", "everyday-science",
    ],
  },
]
