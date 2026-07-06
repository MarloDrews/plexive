import { apiFetch } from "@/lib/api"

// Fetch multiple posts by id via GET /api/posts/{id}, bounding how many
// requests are in flight at once. Saved and liked lists live in localStorage
// and hydrate one detail fetch per id; without a cap a heavy saver fires
// hundreds of fully parallel requests the moment the tab opens, each returning
// a full post body just to draw a title row. A backend batch endpoint
// (GET /api/posts?ids= returning PostListOut) would remove the fan-out
// entirely; until it exists this keeps the burst bounded. Results stay in id
// order; a missing, deleted or failed id resolves to null for the caller to
// drop. The returned promise never rejects.
export async function fetchPostsByIds<T>(ids: number[], concurrency = 6): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(ids.length).fill(null)
  let next = 0
  async function worker() {
    while (next < ids.length) {
      const i = next++
      try {
        const r = await apiFetch(`/api/posts/${ids[i]}`)
        results[i] = r.ok ? ((await r.json()) as T) : null
      } catch {
        results[i] = null
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, worker)
  await Promise.all(workers)
  return results
}
