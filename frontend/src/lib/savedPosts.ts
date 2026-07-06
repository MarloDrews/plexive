// TODO: replace localStorage with a backend endpoint once user accounts are fully integrated
const KEY = "deepscroll_saved"

export function getSavedPostIds(): number[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]
  } catch {
    return []
  }
}

export function savePost(id: number): void {
  if (typeof window === "undefined") return
  const ids = getSavedPostIds()
  if (!ids.includes(id)) localStorage.setItem(KEY, JSON.stringify([...ids, id]))
}

export function unsavePost(id: number): void {
  if (typeof window === "undefined") return
  localStorage.setItem(KEY, JSON.stringify(getSavedPostIds().filter((x) => x !== id)))
}

export function isPostSaved(id: number): boolean {
  return getSavedPostIds().includes(id)
}
