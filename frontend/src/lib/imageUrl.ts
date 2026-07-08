// Wikimedia serves a resized copy of a file when a width is appended to a
// Special:FilePath URL (e.g. .../Special:FilePath/Foo.jpg?width=860). The post
// JSON stores the full-resolution original, which is often 1 MB or more; a
// stories lead band or a portrait only needs a few hundred pixels on screen, so
// requesting a display-sized copy cuts the download by up to ~50x. The smaller
// file loads almost instantly, so the image trickles in quickly instead of
// holding a dark placeholder box open while the original downloads.
//
// Anything that is not a Wikimedia Special:FilePath URL (a Supabase upload, an
// already-sized URL, a relative path) is returned unchanged.
export function sizedImageUrl(url: string, width: number): string {
  try {
    const u = new URL(url)
    const isWikimedia =
      u.hostname === "commons.wikimedia.org" || u.hostname === "upload.wikimedia.org"
    if (isWikimedia && u.pathname.includes("Special:FilePath") && !u.searchParams.has("width")) {
      u.searchParams.set("width", String(width))
      return u.toString()
    }
    return url
  } catch {
    // Relative or malformed URL: leave it for the browser to resolve as-is.
    return url
  }
}
