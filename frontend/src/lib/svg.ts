// Shared SVG helpers. btoa alone throws on non-ASCII characters, so round-trip
// the markup through UTF-8 bytes before base64-encoding it for a data URL. Used
// by SvgBlock and BookCover for the user-content <img> security path.
export function toBase64Utf8(svg: string): string {
  return btoa(unescape(encodeURIComponent(svg)))
}
