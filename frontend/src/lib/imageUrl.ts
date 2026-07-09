// Wikimedia serves a resized copy of a file when a width is appended to a
// Special:FilePath URL (e.g. .../Special:FilePath/Foo.jpg?width=860). The post
// JSON stores the full-resolution original, which is often 1 MB or more; a
// stories lead band or a portrait only needs a few hundred pixels on screen, so
// requesting a display-sized copy cuts the download by up to ~50x. The smaller
// file loads almost instantly, so the image trickles in quickly instead of
// holding a dark placeholder box open while the original downloads.
//
import { safeImageSrc } from "./safeUrl"

// Anything that is not a Wikimedia Special:FilePath URL (a Supabase upload, an
// already-sized URL, a relative path) is returned unchanged.
//
// The scheme allowlist runs first (M123/SEC-024): a src whose scheme is not
// http(s) and is not a same-origin relative path becomes "", so a
// javascript:/data:/file: image URL never reaches an <img src>. Every
// sizedImageUrl caller is covered by this one guard.
export function sizedImageUrl(url: string, width: number): string {
  const safe = safeImageSrc(url)
  if (!safe) return ""
  try {
    const u = new URL(safe)
    const isWikimedia =
      u.hostname === "commons.wikimedia.org" || u.hostname === "upload.wikimedia.org"
    if (isWikimedia && u.pathname.includes("Special:FilePath") && !u.searchParams.has("width")) {
      u.searchParams.set("width", String(width))
      return u.toString()
    }
    return safe
  } catch {
    // Relative (scheme already allowed above): leave it for the browser to
    // resolve as-is.
    return safe
  }
}
