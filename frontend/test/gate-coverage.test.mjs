import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"
import { apiFetch } from "../src/lib/api.ts"

// WHY THIS FILE EXISTS. On 2026-08-28, 4fe760a put ClosedBetaMiddleware in front of
// the API. Every path not in GATE_EXEMPT_PATHS now answers 401 without a bearer
// token. One caller was not adjusted -- onboarding's interest picker -- and NOTHING
// FAILED: no gate, no test and no type error. It was found by a user who could not
// finish signing up, three days later.
//
// So the guard here is not "InterestPicker calls apiFetch". That would only re-check
// the line that broke. It is the INVARIANT that broke: a frontend call to a backend
// path the gate does not exempt must carry an Authorization header. That invariant
// has two sides in two languages, and this file is the only thing comparing them --
// the same shape as taxonomy-drift.test.mjs, which reads backend/seed.py as TEXT to
// cross-check the frontend's copy of the taxonomy.
//
// It therefore also reds on the OTHER direction of the same mistake: removing a path
// from GATE_EXEMPT_PATHS without fixing its caller. That is 2026-08-28 replayed.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..")
const srcDir = join(here, "..", "src")
const mainPy = join(repoRoot, "backend", "app", "main.py")

// --- the backend side: what the gate lets through anonymously --------------------

// Read as text on purpose. This is Python; nothing here can import it, and a copy of
// the list kept on this side would be the very drift the file exists to catch.
function readExemptPaths(source) {
  const block = source.match(/GATE_EXEMPT_PATHS\s*=\s*frozenset\(\{([\s\S]*?)\}\)/)
  if (!block) return []
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

const exemptPaths = readExemptPaths(readFileSync(mainPy, "utf8"))

// A PARSE FLOOR, and deliberately NOT a deletion detector at the observed 3. If a
// path is removed from the exempt set, this file must still run and red on that
// path's CALLER, which is the failure it was written for. Pinning 3 here would
// instead red on this line and hide which caller broke. What a floor of 1 catches is
// the regex above matching nothing, which would silently exempt every path.
assert.ok(
  exemptPaths.length >= 1,
  `parsed no exempt paths out of ${relative(repoRoot, mainPy)} -- the regex stopped matching, ` +
    `so every path below would have been treated as gated and nothing was really compared`
)

// --- the frontend side: every call that names the API base URL -------------------

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

// Matches a global fetch whose URL is a template naming API_URL. The leading
// (^|[^\w$.]) is what keeps apiFetch( and router.prefetch( out: both end in the same
// six characters. Prose in a comment does not match either, because the backtick and
// the ${API_URL} have to be there.
const FETCH_CALL = /(^|[^\w$.])fetch\(\s*`\$\{API_URL\}([^`]*)`/g

// The path as the backend router sees it: everything before the first interpolation
// or query string. `/api/posts/${id}` is /api/posts.
function routePath(template) {
  return template.split("${")[0].split("?")[0]
}

// Does this call attach the header? Two shapes are in use and both are legitimate:
// inline in the call (auth.tsx:108) and built into a `headers` object just above it
// (eventQueue.ts:28-30). So the region searched is the call itself plus the lines
// leading up to it. The window is what makes this a heuristic, and the direction of
// its error is the safe one: it can only ever call a site SAFER than it is, never
// falsely accuse one -- and the checker self-tests at the foot of this file pin both
// directions so the window cannot quietly stop working.
const LOOKBACK_LINES = 10

function attachesAuthorization(source, matchIndex) {
  const before = source.slice(0, matchIndex).split("\n")
  const region = before.slice(Math.max(0, before.length - LOOKBACK_LINES)).join("\n") +
    source.slice(matchIndex, matchIndex + 400)
  return region.includes("Authorization")
}

function scan(source, label) {
  const sites = []
  for (const m of source.matchAll(FETCH_CALL)) {
    sites.push({
      file: label,
      line: source.slice(0, m.index).split("\n").length,
      path: routePath(m[2]),
      authorized: attachesAuthorization(source, m.index),
    })
  }
  return sites
}

const sourceFiles = walk(srcDir)
const sites = sourceFiles.flatMap((f) =>
  scan(readFileSync(f, "utf8"), relative(repoRoot, f).split("\\").join("/"))
)

// A COLLAPSE DETECTOR, well under the 7 observed on 2026-08-31 (6 once the picker
// moves to apiFetch, which is what this batch does). A regex that matches nothing
// finds no violations and reports a green, reassuring, meaningless pass.
const MIN_FETCH_SITES = 4

// The two call sites that reach a non-exempt path WITHOUT a token on purpose. Each is
// a decision with a reason, not an oversight, so each is named here rather than
// quietly skipped -- an exception nobody can see is how the next one gets added.
//
//   /api/auth/register  Registration is closed TWICE while the beta is on: by the
//                       gate and, independently, by a 403 in its own handler
//                       (backend/app/main.py:30-32). Its 401 is the design.
//   /api/events         The header is attached WHEN A TOKEN EXISTS
//                       (eventQueue.ts:28-30). An anonymous visitor's view events are
//                       fire-and-forget telemetry and losing them to the gate costs
//                       nothing, so this site is conditional by intent.
const DELIBERATELY_ANONYMOUS = new Set(["/api/auth/register", "/api/events"])

// api.ts IS the mechanism: the one fetch that decides whether a header is attached.
const HELPER_FILE = "frontend/src/lib/api.ts"

// Also a collapse detector, well under the 214 observed. A walk that lost the tree
// finds no call sites and reports the same green as a clean one.
const MIN_SOURCE_FILES = 100

test("the exempt set and the call sites were both really read", () => {
  console.log(
    `gate coverage: ${exemptPaths.length} exempt paths (${exemptPaths.join(", ")}), ` +
      `${sites.length} API_URL fetch sites across ${sourceFiles.length} source files`
  )
  assert.ok(
    sourceFiles.length >= MIN_SOURCE_FILES,
    `walked only ${sourceFiles.length} source files, expected at least ${MIN_SOURCE_FILES}`
  )
  assert.ok(
    sites.length >= MIN_FETCH_SITES,
    `found only ${sites.length} fetch sites, expected at least ${MIN_FETCH_SITES}. ` +
      `The scan matched nothing meaningful, so a green result below proves nothing.`
  )
})

test("every call to a gated backend path attaches Authorization", () => {
  const offenders = sites.filter(
    (s) =>
      s.file !== HELPER_FILE &&
      !exemptPaths.includes(s.path) &&
      !DELIBERATELY_ANONYMOUS.has(s.path) &&
      !s.authorized
  )
  assert.deepEqual(
    offenders.map((s) => `${s.file}:${s.line} -> ${s.path}`),
    [],
    "These calls request a path ClosedBetaMiddleware gates, with no Authorization header, " +
      "so the backend answers 401 before the router runs and the screen shows its error " +
      "branch. Route them through apiFetch (frontend/src/lib/api.ts), which attaches the " +
      "token. Do NOT instead add the path to GATE_EXEMPT_PATHS: that opens it to everyone."
  )
})

test("every path a call site names is one the backend still knows about", () => {
  // The other direction of the same drift: an exempt path that no longer exists on
  // the backend means this file is exempting something by a name nothing answers to.
  const main = readFileSync(mainPy, "utf8")
  for (const p of exemptPaths) {
    assert.ok(main.includes(p), `${p} is in GATE_EXEMPT_PATHS but appears nowhere else in main.py`)
  }
})

test("the deliberately-anonymous allowlist has not grown and has not gone stale", () => {
  // A DELETION DETECTOR, sitting exactly on the observed 2, unlike the floors above.
  // An exception list is where a pending fix goes to stop being noticed, so a third
  // entry has to be a deliberate edit here carrying its own reason.
  assert.equal(
    DELIBERATELY_ANONYMOUS.size,
    2,
    "the allowlist changed size -- add the new entry's reason above, or delete the stale one"
  )
  // And an entry the backend has since exempted is no longer an exception to
  // anything; leaving it would be a permanent free pass nobody re-reads.
  for (const p of DELIBERATELY_ANONYMOUS) {
    assert.ok(
      !exemptPaths.includes(p),
      `${p} is now in GATE_EXEMPT_PATHS, so it no longer needs an allowlist entry here`
    )
  }
})

// --- the checker, checked ---------------------------------------------------------
// Without these, a scanner that quietly stopped matching would report the same clean
// pass as a correct one, and the clean pass is the reassuring output.

test("the scanner catches a bare fetch to a gated path", () => {
  const bad = "fetch(`${API_URL}/api/interests`)\n  .then((r) => r.json())"
  const found = scan(bad, "synthetic.ts")
  assert.equal(found.length, 1)
  assert.equal(found[0].path, "/api/interests")
  assert.equal(found[0].authorized, false)
})

test("the scanner accepts a header attached inline", () => {
  const good = "fetch(`${API_URL}/api/auth/me`, {\n  headers: { Authorization: `Bearer ${t}` },\n})"
  assert.equal(scan(good, "synthetic.ts")[0].authorized, true)
})

test("the scanner accepts a header built just above the call", () => {
  const good =
    'const headers = {}\nif (token) headers["Authorization"] = `Bearer ${token}`\n' +
    "fetch(`${API_URL}/api/events`, { method: \"POST\", headers })"
  assert.equal(scan(good, "synthetic.ts")[0].authorized, true)
})

test("an Authorization far above the call does not count as attached", () => {
  // Pins the window's discrimination. Without this the lookback could quietly widen
  // to the whole file, at which point auth.tsx's four call sites would all read as
  // authorized because :108 attaches one 40 lines away, and the scan would pass
  // everything. Measured 2026-08-31: the largest real attach-to-call distance in this
  // tree is ONE line, so 10 is headroom rather than a fit.
  const far = 'headers: { Authorization: `Bearer ${t}` }\n' +
    "x\n".repeat(20) +
    "fetch(`${API_URL}/api/interests`)"
  assert.equal(scan(far, "synthetic.ts")[0].authorized, false)
})

test("the scanner does not mistake apiFetch or prefetch for a bare fetch", () => {
  assert.equal(scan("apiFetch(`${API_URL}/api/posts`)", "synthetic.ts").length, 0)
  assert.equal(scan("router.prefetch(`${API_URL}/x`)", "synthetic.ts").length, 0)
})

test("the exempt-path parser reads a frozenset and returns [] when the shape changes", () => {
  const py = 'GATE_EXEMPT_PATHS = frozenset({\n    "/health",\n    "/api/auth/login",\n})'
  assert.deepEqual(readExemptPaths(py), ["/health", "/api/auth/login"])
  assert.deepEqual(readExemptPaths("GATE_EXEMPT_PATHS = set()"), [])
})

// --- the mechanism the fix leans on, proved at runtime ----------------------------
// The scan above is static: it proves the call site reaches apiFetch, not that
// apiFetch attaches anything. These four run it. THEY PASS BOTH BEFORE AND AFTER THE
// FIX, because apiFetch is not what changed -- they are here so the static claim
// rests on a demonstrated fact rather than on an assumption about the helper.

function withBrowser(token, run) {
  const realFetch = globalThis.fetch
  let seen = null
  globalThis.fetch = (url, init) => {
    seen = { url, init }
    return Promise.resolve(new Response("[]", { status: 200 }))
  }
  // api.ts:10 reads the token only when `typeof window !== "undefined"`, so a shim
  // for localStorage alone is not enough to exercise the real path.
  globalThis.window = globalThis
  globalThis.localStorage = { getItem: (k) => (k === "deepscroll_token" ? token : null) }
  return run().then((r) => {
    globalThis.fetch = realFetch
    delete globalThis.window
    delete globalThis.localStorage
    return { seen, res: r }
  })
}

test("apiFetch attaches the bearer token when one is stored", async () => {
  const { seen } = await withBrowser("tok123", () => apiFetch("/api/interests"))
  assert.equal(seen.init.headers["Authorization"], "Bearer tok123")
})

test("apiFetch sends no Authorization header when no token is stored", async () => {
  const { seen } = await withBrowser(null, () => apiFetch("/api/interests"))
  assert.equal(seen.init.headers["Authorization"], undefined)
})

test("apiFetch prepends the API base URL to the path it is given", async () => {
  const { seen } = await withBrowser("tok123", () => apiFetch("/api/interests"))
  assert.ok(String(seen.url).endsWith("/api/interests"), `url was ${seen.url}`)
})

test("apiFetch returns the response to its caller untouched", async () => {
  const { res } = await withBrowser("tok123", () => apiFetch("/api/interests"))
  assert.equal(res.status, 200)
})
