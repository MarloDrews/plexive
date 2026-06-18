// Interest categories, ported from frontend/src/app/onboarding/InterestPicker.tsx.
// Shared by the onboarding screen and the create screen (both group the
// /api/interests list under these labels), mirroring the web where create
// imports CATEGORIES from the onboarding module. The slugs are copied verbatim
// from the web file.

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
