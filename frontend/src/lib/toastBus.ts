// Tiny pub/sub so any card can raise the single page-level toast (ToastHost)
// instead of every PostCard mounting its own fixed, backdrop-blurred Toast
// element into the layer tree.
type Listener = (message: string) => void

let listener: Listener | null = null

export function showToast(message: string): void {
  listener?.(message)
}

// One host per page; a late subscriber replaces the previous one.
export function subscribeToast(fn: Listener): () => void {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}
