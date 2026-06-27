// Shared unescape for plain-text prose paths. Currency is authored with the
// content rule's escaped "\$" (so it never collides with inline math); on the
// non-math prose paths there is no math parser to strip that backslash, so we
// strip it here. The math branch (MathText) handles its own escaping and is
// never routed through this.
export function unescapeDollar(text: string): string {
  return text.replace(/\\\$/g, "$")
}
