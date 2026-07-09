// Hands the "start reading when the detail page opens" request from the
// feed card's speaker button to the detail page. sessionStorage survives the
// client-side navigation but not a freshly opened share link, which is the
// behavior we want (links never start talking on their own).

const KEY = "readAloudAutostart"

export function requestAutoRead(postId: number) {
  try {
    sessionStorage.setItem(KEY, String(postId))
  } catch {
    // Storage unavailable (private mode quirks): the tap simply opens the post.
  }
}

// Returns true exactly once per request, and only for the matching post.
export function consumeAutoRead(postId: number): boolean {
  try {
    const v = sessionStorage.getItem(KEY)
    if (v === null) return false
    // Remove the key ONLY when it is for this post. Removing it before the check
    // let any other early consumer (React StrictMode's double-invoke, an
    // intermediate page) delete the request, so the matching post then saw
    // nothing and never auto-started.
    if (v !== String(postId)) return false
    sessionStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
