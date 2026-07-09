// Scheme allowlist for user-controlled URLs (M123/SEC-009/SEC-024). Content can
// carry source links, a Wikipedia link and image URLs; none of them may use a
// javascript:, data:, file: (etc.) scheme that reaches an anchor href or an img
// src. Only http(s) absolute URLs and same-origin relative paths are allowed.

function schemeAllowed(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  // Same-origin relative paths ("/uploads/..") carry no scheme and are safe.
  // A protocol-relative "//host" is treated as absolute below (URL parses it
  // against a base), so exclude it from the relative fast-path.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true
  try {
    const proto = new URL(trimmed).protocol
    return proto === "http:" || proto === "https:"
  } catch {
    return false
  }
}

// A user-controlled href: the URL only when its scheme is allowed, else
// undefined so the anchor renders inert (no destination) instead of a
// javascript: link.
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return schemeAllowed(url) ? url : undefined
}

// A user-controlled image src: the URL only when its scheme is allowed, else ""
// so the browser makes no request to an attacker-chosen scheme/host.
export function safeImageSrc(url: string | null | undefined): string {
  if (!url) return ""
  return schemeAllowed(url) ? url : ""
}
