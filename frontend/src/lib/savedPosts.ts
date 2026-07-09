// TODO: replace localStorage with a backend endpoint once user accounts are fully integrated
const KEY = "deepscroll_saved"

// Parsed-once cache, same pattern as likedPosts.ts: this module is the single
// write path, so writers refresh the cache and reads parse at most once per
// session instead of on every call from every mounted card.
let savedCache: number[] | null = null

// Reads tolerate a corrupt or wrong-shaped value (a valid-JSON non-array would
// otherwise pass the try/catch and later throw on .includes); writes tolerate a
// quota/security error.
function safeSet(value: string): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {}
}

export function getSavedPostIds(): number[] {
  if (typeof window === "undefined") return []
  if (savedCache === null) {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]")
      savedCache = Array.isArray(parsed) ? parsed : []
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
    safeSet(JSON.stringify(savedCache))
  }
}

export function unsavePost(id: number): void {
  if (typeof window === "undefined") return
  savedCache = getSavedPostIds().filter((x) => x !== id)
  safeSet(JSON.stringify(savedCache))
}

export function isPostSaved(id: number): boolean {
  return getSavedPostIds().includes(id)
}

// Wipe this device's saved-post ids (key + in-memory cache) so a different
// account signing in on the same device does not see them. Called on
// login/register/logout alongside the like and interest clears.
export function clearSavedStorage(): void {
  savedCache = null
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
