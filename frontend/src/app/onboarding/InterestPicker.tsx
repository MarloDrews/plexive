"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CATEGORIES } from "@/lib/interests"

interface Interest {
  id: number
  name: string
  slug: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function InterestPicker() {
  const router = useRouter()
  const [interests, setInterests] = useState<Interest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Onboarding gates the whole app, so a transient failure here must not strand
  // the user on pulsing placeholders: check r.ok, validate the payload is a
  // non-empty array (a non-ok body is {detail: ...} which would crash the
  // interests.map below), and surface a retry.
  const loadInterests = useCallback(() => {
    setError(false)
    setLoading(true)
    fetch(`${API_URL}/api/interests`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json()
      })
      .then((data: Interest[]) => {
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty interests")
        setInterests(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (localStorage.getItem("deepscroll_interests")) {
      router.replace("/")
      return
    }
    loadInterests()
  }, [router, loadInterests])

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function handleContinue() {
    try {
      localStorage.setItem("deepscroll_interests", JSON.stringify([...selected]))
    } catch {
      // A full or unwritable storage would otherwise throw here and leave the
      // button doing nothing; surface it instead of silently dead-ending.
      setSaveError("Could not save your interests. Please free up some storage and try again.")
      return
    }
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
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
    <div className="w-full max-w-[430px] h-[100dvh] flex flex-col">
      {/* Top bar — fixed height, does not scroll */}
      <div className="shrink-0 px-6 pt-10 pb-4">
        <p className="label-caps text-lamp">
          Deepscroll
        </p>
        <h1 className="font-serif text-3xl font-medium text-ink leading-tight mt-4">
          What are you into?
        </h1>
        <p className="text-ink-dim text-sm mt-2">
          Pick topics to personalize your feed.
        </p>
        <p className="text-ink-muted text-sm mt-1">
          {selected.size} selected
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {error ? (
          <div className="flex flex-col items-center text-center gap-3 mt-16 px-6">
            <p className="font-serif text-lg text-ink">Could not load topics</p>
            <p className="text-ink-muted text-sm">Check your connection and try again.</p>
            <button onClick={loadInterests} className="btn btn-primary px-5 py-2 mt-1">
              Retry
            </button>
          </div>
        ) : loading ? (
          // Loading: pulsing pill placeholders where the chips will appear.
          <div className="flex flex-wrap gap-2 mt-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="stage-pulse rounded-full bg-white/[0.04] h-9"
                style={{ width: 64 + (i % 4) * 24 }}
              />
            ))}
          </div>
        ) : (
          <>
            {categorySections.map((section, index) => (
              <div key={section.label} className="mb-6">
                {index > 0 && (
                  <div className="border-t border-edge mb-3" />
                )}
                <p className="label-caps text-ink-dim mb-3">
                  {section.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {section.items.map((i) => {
                    const isSelected = selected.has(i.slug)
                    return (
                      <button
                        key={i.id}
                        onClick={() => toggle(i.slug)}
                        className={`chip ${
                          isSelected
                            ? "chip-on font-semibold"
                            : "chip-off"
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
                <div className="border-t border-edge mb-3" />
                <p className="label-caps text-ink-dim mb-3">
                  Other
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherItems.map((i) => {
                    const isSelected = selected.has(i.slug)
                    return (
                      <button
                        key={i.id}
                        onClick={() => toggle(i.slug)}
                        className={`chip ${
                          isSelected
                            ? "chip-on font-semibold"
                            : "chip-off"
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
        <p className="text-ink-muted text-sm mb-3">
          {selected.size} of {interests.length} selected
        </p>
        {saveError && <p className="text-bad text-sm mb-3">{saveError}</p>}
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="btn btn-primary w-full h-12"
        >
          Continue
        </button>
      </div>
    </div>
    </div>
  )
}
