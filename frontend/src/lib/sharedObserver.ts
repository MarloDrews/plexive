// One IntersectionObserver shared by every feed card (they all use the same
// threshold) instead of one instance per mounted card. Callbacks register per
// element; the singleton is created lazily and torn down when the last
// element unobserves.
type Callback = (entry: IntersectionObserverEntry) => void

const callbacks = new Map<Element, Callback>()
let observer: IntersectionObserver | null = null

function ensureObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry)
      },
      { threshold: 0.6 }
    )
  }
  return observer
}

// Returns the unobserve cleanup for the element.
export function observeCard(el: Element, cb: Callback): () => void {
  callbacks.set(el, cb)
  ensureObserver().observe(el)
  return () => {
    callbacks.delete(el)
    observer?.unobserve(el)
    if (callbacks.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}
