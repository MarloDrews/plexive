// Closed-beta gate (2026-08). The credential check for src/proxy.ts, kept as a
// pure function so it can be unit tested: the proxy itself runs in a request
// context the test runner cannot construct, and an untested gate is one whose
// broken state and whose working state look identical from the outside.
//
// Deliberately temporary. This whole file, src/proxy.ts and its test are meant
// to be deleted when the beta opens, which is why the gate is HTTP Basic rather
// than a branded page and a cookie: no route, no state, no application code
// that can grow its own bugs, and identical behaviour for a browser, for curl
// and for any other client -- which is the property the outside-in verification
// of this batch depends on.
//
// Vercel cannot do this for us. Password Protection is Enterprise (or a paid
// Pro add-on), and Vercel Authentication on Hobby is "Standard Protection"
// scope, which explicitly excludes production domains. So the gate lives in the
// application.

// Server-side only. NOT NEXT_PUBLIC_: that prefix inlines the value into the
// client bundle at build time, which would publish the password on the very
// page it protects.
export type GateEnv = {
  BETA_USER?: string
  BETA_PASSWORD?: string
  NODE_ENV?: string
}

// Length-independent comparison. Basic auth over TLS is not a timing-attack
// target in any practical sense, but a plain === on a secret is the kind of
// thing that gets copied into somewhere it does matter.
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))
  }
  return diff === 0
}

// Whether the gate should be enforced at all. Off outside production so
// `npm run dev` and `next build` need no credentials, mirroring the isProd
// split next.config.ts already uses for the CSP.
export function gateEnabled(env: GateEnv): boolean {
  return env.NODE_ENV === "production"
}

// FAILS CLOSED. An unset BETA_PASSWORD in production denies everything rather
// than waving everyone through: a typo in a Vercel env var name would otherwise
// reopen the site silently, and silently open is the exact state this batch
// exists to end. The backend flag deliberately does the opposite (unset = open)
// because there a missing value stops a server booting; here it only shows a
// password box.
export function isAuthorized(header: string | null, env: GateEnv): boolean {
  if (!gateEnabled(env)) return true

  const expectedPassword = env.BETA_PASSWORD ?? ""
  if (expectedPassword === "") return false

  // Default the username so only the password has to be shared with a tester.
  const expectedUser = env.BETA_USER ?? "plexive"

  if (!header) return false
  const [scheme, encoded] = header.split(" ")
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return false

  let decoded: string
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8")
  } catch {
    return false
  }

  // Split on the FIRST colon only: a password may legitimately contain one.
  const sep = decoded.indexOf(":")
  if (sep < 0) return false
  const user = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  return safeEqual(user, expectedUser) && safeEqual(password, expectedPassword)
}
