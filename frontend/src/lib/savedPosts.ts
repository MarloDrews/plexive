// TODO: replace localStorage with a backend endpoint once user accounts are fully integrated
const KEY = "deepscroll_saved"

// Parsed-once cache, same pattern as likedPosts.ts: this module is the single
// write path, so writers refresh the cache and reads parse at most once per
// session instead of on every call from every mounted card.
let savedCache: number[] | null = null

export function getSavedPostIds(): number[] {
  if (typeof window === "undefined") return []
  if (savedCache === null) {
    try {
      savedCache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]
    } catch {
      savedCache = []
    }
  }
  return savedCache
}

export function savePost(id: number): void {
  if (typeof window === "undefined") return
  const ids = getSavedPostIds()
  if (!ids.includes(id)) {
    savedCache = [...ids, id]
    localStorage.setItem(KEY, JSON.stringify(savedCache))
  }
}

export function unsavePost(id: number): void {
  if (typeof window === "undefined") return
  savedCache = getSavedPostIds().filter((x) => x !== id)
  localStorage.setItem(KEY, JSON.stringify(savedCache))
}

export function isPostSaved(id: number): boolean {
  return getSavedPostIds().includes(id)
}
