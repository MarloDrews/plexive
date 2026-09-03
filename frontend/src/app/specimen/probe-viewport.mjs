// Measures a local HTML file in a real browser over the DevTools protocol.
// Run by hand, never imported.
//
//   node src/app/specimen/probe-viewport.mjs <path-to-html> [width] [height]
//
// WHY THIS EXISTS. Three of the acceptance conditions on the standalone
// specimen file are ABSENCES -- no horizontal scroll at 411 pixels, no button
// under 44 pixels, no request leaving the page -- and an absence is the result
// believed too easily. Reading the source cannot establish any of the three:
// a grid column that refuses to shrink, a button whose padding is eaten by a
// line-height, and a stylesheet reference hidden inside a string all look fine
// in the source and all fail in a browser.
//
// THE REQUEST COUNT IS THE ONE THE GREP CANNOT DO. The grep in the report reads
// the file; this reads what the browser actually asked for. A page that fetches
// something the grep did not think to look for shows up here as a second URL.
//
// NO NEW DEPENDENCY. Chrome is driven directly: its debugging port serves a
// plain HTTP endpoint that lists targets, and Node 22 and later ship a global
// WebSocket client, so no puppeteer, no playwright and no ws package.

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]

const target = process.argv[2]
const WIDTH = Number(process.argv[3] || 411)
const HEIGHT = Number(process.argv[4] || 915)

if (!target) {
  console.error("FAIL: pass the path to the HTML file to measure.")
  process.exit(1)
}
// The probe measures a file on disk or a URL, so the same command can be run
// against the standalone specimen and against /specimen on a local server.
const isRemote = /^https?:\/\//.test(target)
if (!isRemote && !existsSync(target)) {
  console.error("FAIL: no such file: " + target)
  process.exit(1)
}

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error("FAIL: no Chrome or Edge found at any of:")
  CHROME_CANDIDATES.forEach((p) => console.error("  " + p))
  process.exit(1)
}

const PORT = 9333
const profile = mkdtempSync(join(tmpdir(), "specimen-probe-"))

const proc = spawn(chrome, [
  "--headless=new",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + profile,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--allow-file-access-from-files",
  "about:blank",
], { stdio: "ignore" })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// /json/new refuses GET in current Chrome ("Using unsafe HTTP verb GET to
// invoke /json/new"), and the refusal comes back as plain text, so a caller that
// assumes JSON fails with a parse error that says nothing about the cause.
// Hence the explicit method, and the text-first read below.
async function endpoint(path, method) {
  const res = await fetch("http://127.0.0.1:" + PORT + path, { method: method || "GET" })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(path + " returned " + res.status + ": " + text.slice(0, 200))
  }
}

async function waitForPort() {
  for (let i = 0; i < 100; i += 1) {
    try {
      return await endpoint("/json/version")
    } catch {
      await sleep(200)
    }
  }
  throw new Error("Chrome never opened the debugging port")
}

function cdp(ws) {
  let next = 1
  const pending = new Map()
  const events = []
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
        else p.resolve(msg.result)
      }
    } else {
      events.push(msg)
    }
  })
  const send = (method, params) =>
    new Promise((resolve_, reject) => {
      const id = next
      next += 1
      pending.set(id, { resolve: resolve_, reject })
      ws.send(JSON.stringify({ id, method, params: params || {} }))
    })
  return { send, events }
}

// The measurements, all read from the live layout rather than from the source.
const PROBE = `(() => {
  const doc = document.documentElement;
  const buttons = Array.from(document.querySelectorAll("button, summary"));
  const heights = buttons.map((b) => Math.round(b.getBoundingClientRect().height));
  const overflowing = Array.from(document.querySelectorAll("*"))
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
    .map((el) => el.tagName + "." + (el.className || "") + " right=" +
      Math.round(el.getBoundingClientRect().right))
    .slice(0, 8);
  const half = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { height: Math.round(r.height), background: getComputedStyle(el).backgroundColor };
  };
  const probeFont = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const span = document.createElement("span");
    span.style.font = cs.font;
    span.style.fontSizeAdjust = cs.fontSizeAdjust;
    span.style.position = "absolute";
    span.style.height = "1ex";
    span.style.width = "1ex";
    el.appendChild(span);
    const ex = span.getBoundingClientRect().height;
    span.remove();
    return { fontFamily: cs.fontFamily, fontSize: cs.fontSize,
      fontSizeAdjust: cs.fontSizeAdjust, exPixels: Math.round(ex * 1000) / 1000 };
  };
  // scrollWidth ON ITS OWN IS A CHECK THAT CANNOT FIRE, and it was one here
  // until an 800px block was injected and it still read 411. The page sets
  // overflow-x: hidden on html and body, which CLAMPS documentElement.scrollWidth
  // to the viewport whatever the content does. So scrollWidth is reported twice:
  // as the page ships, and again with the clamp lifted, which is the number that
  // can actually be wrong. The element-overflow count below is the third reading
  // and needs no undressing of the page at all.
  const clamped = doc.scrollWidth;
  const prevHtml = doc.style.overflowX;
  const prevBody = document.body.style.overflowX;
  doc.style.overflowX = "visible";
  document.body.style.overflowX = "visible";
  void doc.offsetWidth;
  const unclamped = Math.max(doc.scrollWidth, document.body.scrollWidth);
  doc.style.overflowX = prevHtml;
  document.body.style.overflowX = prevBody;

  return JSON.stringify({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: clamped,
    scrollWidthUnclamped: unclamped,
    scrollHeight: doc.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
    horizontalScroll: unclamped > window.innerWidth,
    buttonCount: buttons.length,
    minButtonHeight: heights.length ? Math.min.apply(null, heights) : null,
    buttonsUnder44: heights.filter((h) => h < 44).length,
    overflowing: overflowing,
    halfLight: half("halfLight"),
    halfDark: half("halfDark"),
    readingFace: probeFont("p.body"),
  });
})()`

async function main() {
  const version = await waitForPort()
  const url = isRemote ? target : pathToFileURL(resolve(target)).href
  const created = await endpoint("/json/new?" + encodeURIComponent(url), "PUT")
  const ws = new WebSocket(created.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener("open", r, { once: true }))
  const { send, events } = cdp(ws)

  await send("Network.enable")
  await send("Page.enable")
  // Optional Basic credentials, so the same probe can measure /specimen behind
  // the closed-beta gate as well as a file:// page. Chrome no longer honours
  // credentials embedded in a navigation URL, so they go in as a header.
  if (process.env.PROBE_BASIC_AUTH) {
    await send("Network.setExtraHTTPHeaders", {
      headers: { Authorization: "Basic " + Buffer.from(process.env.PROBE_BASIC_AUTH).toString("base64") },
    })
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true,
  })
  await send("Page.navigate", { url })
  // Give the font, the layout and any request the page might make time to
  // happen. A request that fails still shows up as requestWillBeSent, which is
  // what is being counted.
  await sleep(2500)

  const res = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true })
  const m = JSON.parse(res.result.value)

  const requests = events
    .filter((e) => e.method === "Network.requestWillBeSent")
    .map((e) => e.params.request.url)
  // A page served over http is its own origin, so its own document and any
  // same-origin asset are local. Only a third-party URL counts as leaving.
  const origin = url.startsWith("http") ? new URL(url).origin : null
  const external = requests.filter(
    (u) => !u.startsWith("file://") && !u.startsWith("data:") && !(origin && u.startsWith(origin)),
  )

  console.log("browser:        " + version.Browser)
  console.log("file:           " + url)
  console.log("viewport:       " + WIDTH + " x " + HEIGHT + "  (innerWidth measured " + m.innerWidth + ")")
  console.log("")
  console.log("scrollWidth as it ships:  " + m.scrollWidth + "   (clamped by overflow-x: hidden, so this alone proves nothing)")
  console.log("scrollWidth unclamped:    " + m.scrollWidthUnclamped + "   this is the one that can be wrong")
  console.log("body scrollWidth:         " + m.bodyScrollWidth)
  console.log("horizontal scroll:        " + m.horizontalScroll + "   expected false")
  console.log("elements past the right edge: " + m.overflowing.length)
  m.overflowing.forEach((o) => console.log("    " + o))
  console.log("")
  console.log("buttons and summaries:    " + m.buttonCount)
  console.log("smallest height:          " + m.minButtonHeight + " px   floor 44")
  console.log("under 44 px:              " + m.buttonsUnder44 + "   expected 0")
  console.log("")
  console.log("light half height:        " + (m.halfLight ? m.halfLight.height + " px, background " + m.halfLight.background : "MISSING"))
  console.log("dark half height:         " + (m.halfDark ? m.halfDark.height + " px, background " + m.halfDark.background : "MISSING"))
  console.log("total document height:    " + m.scrollHeight + " px")
  console.log("")
  console.log("reading face on p.body:   " + JSON.stringify(m.readingFace))
  console.log("")
  console.log("requests the page made:   " + requests.length)
  requests.forEach((u) => console.log("    " + (u.length > 90 ? u.slice(0, 90) + "..." : u)))
  console.log("requests leaving the page (not file: and not data:): " + external.length + "   expected 0")
  external.forEach((u) => console.log("    " + u))

  ws.close()
  proc.kill()
  await sleep(400)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // A Chrome profile directory sometimes keeps a lock for a moment after the
    // process exits. Leaving it in the OS temp directory is harmless.
  }

  const pass =
    m.horizontalScroll === false &&
    m.buttonsUnder44 === 0 &&
    external.length === 0 &&
    m.halfLight !== null &&
    m.halfDark !== null
  console.log("")
  console.log("ALL FOUR CONDITIONS HOLD: " + pass)
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error("FAIL: " + err.message)
  proc.kill()
  process.exit(1)
})
