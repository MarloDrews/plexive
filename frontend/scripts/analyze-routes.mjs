// Per-route bundle report: measures the eager-loaded JS/CSS of each route by
// serving the production build and summing the /_next/static assets its HTML
// references. Turbopack (the Next 16 default bundler) has no webpack-style
// bundle analyzer, and the build output no longer prints a per-route size
// table, so this script is the regression check for route chunk sizes.
//
// Usage: run `npm run build` first, then `npm run analyze` (optionally with
// custom routes: `npm run analyze -- / /post/1 /stats`).
import { spawn } from "node:child_process"
import { statSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = 4321
const DEFAULT_ROUTES = [
  "/",
  "/post/1",
  "/stats",
  "/create",
  "/search",
  "/chat",
  "/saved-posts",
  "/login",
]
const routes = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ROUTES

function assetSize(ref) {
  const rel = ref.replace(/^\/_next\//, "").split("?")[0]
  try {
    return statSync(join(frontendDir, ".next", rel)).size
  } catch {
    return 0
  }
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error("server did not start")
}

const server = spawn(`npx next start -p ${PORT}`, {
  cwd: frontendDir,
  shell: true,
  stdio: "ignore",
})
try {
  await waitForServer(`http://localhost:${PORT}/login`)
  const report = {}
  console.log("route".padEnd(16) + "eager JS".padStart(10) + "CSS".padStart(9))
  for (const route of routes) {
    const html = await (await fetch(`http://localhost:${PORT}${route}`)).text()
    const refs = new Set()
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) refs.add(m[1])
    let js = 0
    let css = 0
    const files = []
    for (const ref of refs) {
      const size = assetSize(ref)
      files.push({ ref, size })
      const path = ref.split("?")[0]
      if (path.endsWith(".css")) css += size
      else if (path.endsWith(".js")) js += size
    }
    files.sort((a, b) => b.size - a.size)
    report[route] = { jsBytes: js, cssBytes: css, files }
    console.log(
      route.padEnd(16) +
        `${(js / 1024).toFixed(0)} KB`.padStart(10) +
        `${(css / 1024).toFixed(0)} KB`.padStart(9)
    )
  }
  const out = join(frontendDir, ".next", "route-report.json")
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log("\nfull per-file breakdown: " + out)
} finally {
  server.kill()
  // `shell: true` on Windows leaves the child listening; kill by port.
  if (process.platform === "win32") {
    await new Promise((r) => {
      const kill = spawn(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`,
        ],
        { stdio: "ignore" }
      )
      kill.on("exit", r)
    })
  }
}
