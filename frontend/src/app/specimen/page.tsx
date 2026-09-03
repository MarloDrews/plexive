"use client"

// TEMPORARY DECISION SURFACE, not part of the product.
//
// It exists to answer one question on one phone: which of four freely licensed
// reading typefaces survives at the sizes Plexive actually renders, on a beige
// background and on a dark one. It is deliberately not in the navigation, not
// linked from anywhere, and meant to be deleted once the decision is made.
//
// Every size, weight and line height below was MEASURED off the live components
// on 2026-09-03 at c558f15, not chosen here. The measurements and their
// file:line citations are in the design token inventory report of that date.
//
// The fonts are self-hosted under public/specimen-fonts/, following the same
// static-asset pattern public/accessories/ and public/seed-images/ already use.
// They are NOT loaded through next/font/google the way layout.tsx loads the
// product faces, because the point of this page is to look at files that would
// ship inside an Android app, and a build-time fetch would not answer that.
// The @font-face block is inline rather than in globals.css because globals.css
// is outside this batch's scope.

import { useState } from "react"

// ---------------------------------------------------------------------------
// The four candidates.
// ---------------------------------------------------------------------------

interface Face {
  id: string
  // Shown on the page so a screenshot identifies itself.
  name: string
  licence: string
  stack: string
  // ET Book ships static files, so it has exactly the two weights this page
  // uses and no more. The other three are variable fonts. Said out loud here
  // because "500 looks heavier in ET Book" would otherwise read as a property
  // of the typeface rather than of which file was cut.
  note: string
}

const FACES: Face[] = [
  {
    id: "garamond",
    name: "EB Garamond",
    licence: "SIL OFL 1.1",
    stack: "SpecEBGaramond, serif",
    note: "variable 400-800, latin subset",
  },
  {
    id: "crimson",
    name: "Crimson Pro",
    licence: "SIL OFL 1.1",
    stack: "SpecCrimsonPro, serif",
    note: "variable 200-900, latin subset",
  },
  {
    id: "etbook",
    name: "ET Book",
    licence: "MIT",
    stack: "SpecETBook, serif",
    note: "static files: roman at 400, semi-bold at 500",
  },
  {
    id: "literata",
    name: "Literata",
    licence: "SIL OFL 1.1",
    stack: "SpecLiterata, serif",
    note: "variable 200-900, latin subset",
  },
]

// ---------------------------------------------------------------------------
// The six grounds. Three beige and three dark, each carrying its own hex on
// the page so a screenshot never has to be matched back to a list.
//
// The ink is not the question this page asks, so it is fixed per family: the
// app's own --color-ink on the dark grounds, and a near-black on the beige
// ones. Both hexes are printed on the page for the same reason.
// ---------------------------------------------------------------------------

interface Ground {
  id: string
  hex: string
  ink: string
  family: "beige" | "dark"
}

const GROUNDS: Ground[] = [
  { id: "L1", hex: "#FAF6EE", ink: "#14110C", family: "beige" },
  { id: "L2", hex: "#F4EFE6", ink: "#14110C", family: "beige" },
  { id: "L3", hex: "#EDE4D3", ink: "#14110C", family: "beige" },
  { id: "D1", hex: "#0B0E15", ink: "#EEEEEE", family: "dark" },
  { id: "D2", hex: "#0F1117", ink: "#EEEEEE", family: "dark" },
  { id: "D3", hex: "#070910", ink: "#EEEEEE", family: "dark" },
]

// ---------------------------------------------------------------------------
// The five measured type roles. Every number here was read off the source on
// 2026-09-03; the citation travels with the row so the page can be checked
// against the code without the report in hand.
// ---------------------------------------------------------------------------

interface Role {
  key: string
  label: string
  cite: string
  fontSize: string
  fontWeight: number
  lineHeight: number
  letterSpacing?: string
  sample: "headline" | "body" | "meta"
}

const ROLES: Role[] = [
  {
    key: "card-headline",
    label: "Feed card headline",
    cite: "PostCard.tsx:486 - font-serif text-[1.75rem] font-medium tracking-tight leading-snug",
    fontSize: "1.75rem",
    fontWeight: 500,
    lineHeight: 1.375,
    letterSpacing: "-0.025em",
    sample: "headline",
  },
  {
    key: "detail-headline",
    label: "Detail view headline",
    cite: "HeadlineSection.tsx:39 - font-serif text-headline (2rem) font-medium tracking-tight leading-snug",
    fontSize: "2rem",
    fontWeight: 500,
    lineHeight: 1.375,
    letterSpacing: "-0.025em",
    sample: "headline",
  },
  {
    key: "detail-body",
    label: "Detail view body, .prose-post",
    cite: "globals.css:303-308 - font-serif, --text-reading 1.0625rem, line-height 1.7",
    fontSize: "1.0625rem",
    fontWeight: 400,
    lineHeight: 1.7,
    sample: "body",
  },
  {
    key: "card-teaser",
    label: "Feed card teaser, the card body text",
    cite: "PostCard.tsx:40 - text-reading 1.0625rem leading-snug; renders in the SANS today",
    fontSize: "1.0625rem",
    fontWeight: 400,
    lineHeight: 1.375,
    sample: "body",
  },
  {
    key: "card-meta",
    label: "Smallest feed card metadata, the question this page exists for",
    cite: "PostCard.tsx:155 - text-[11px] font-mono leading-none; renders in the MONO today",
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: 1,
    sample: "meta",
  },
]

// ---------------------------------------------------------------------------
// One fixed passage, identical for all four faces, so the only thing that
// changes between screenshots is the typeface. No Plexive post content exists
// in this repository (it moved to the private content repo on 2026-08-29), so
// this is a written stand-in on a real subject, carrying the digits, capitals
// and abbreviations that separate these four faces from each other.
// ---------------------------------------------------------------------------

const HEADLINE = "Lise Meitner worked out the arithmetic of fission on a walk through the snow"

const BODY = [
  "In December 1938, Otto Hahn wrote to Lise Meitner from Berlin with a result he",
  "could not explain. He had bombarded uranium with neutrons and found barium in",
  "the residue, an element with roughly half the atomic mass. Meitner, who had fled",
  "to Sweden that July, read the letter in Kungalv over Christmas. Walking in the",
  "snow with her nephew Otto Frisch, she did the sum on a scrap of paper. Bohr had",
  "described the nucleus as a liquid drop, and a drop that elongates far enough will",
  "pinch in two. The two fragments would weigh about one fifth of a proton mass less",
  "than the original nucleus, and that missing fifth, put through E = mc2, came to",
  "roughly 200 million electron volts per event. Frisch measured it within weeks and",
  "the number held. Meitner had supplied the physics and the arithmetic, by post and",
  "on foot, from exile. The 1944 Nobel Prize in Chemistry went to Hahn alone. The",
  "committee papers stayed sealed for 50 years, and when they were opened in 1997",
  "they showed a panel that had not understood the theory it was judging, and had",
  "read a collaboration of 30 years as one laboratory and one man.",
].join(" ")

const META = "12 min read - MEDIUM - 4 sources - 2026"

// ---------------------------------------------------------------------------

// font-display: block, not swap. A specimen page that flashes a fallback face
// is a page that can be screenshotted showing the wrong typeface.
//
// The format() argument is a quoted string, not the CSS Fonts 4 bare keyword:
// the keyword form is newer than some of the Android WebViews this page will be
// opened in, and a src line a browser cannot parse is a src line it skips.
const FONT_FACE_CSS = `
@font-face {
  font-family: "SpecEBGaramond";
  src: url("/specimen-fonts/eb-garamond/eb-garamond-latin-var.woff2") format("woff2");
  font-weight: 400 800;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "SpecCrimsonPro";
  src: url("/specimen-fonts/crimson-pro/crimson-pro-latin-var.woff2") format("woff2");
  font-weight: 200 900;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "SpecLiterata";
  src: url("/specimen-fonts/literata/literata-latin-var.woff2") format("woff2");
  font-weight: 200 900;
  font-style: normal;
  font-display: block;
}
/* ET Book is static: two files, two weights, nothing between them. */
@font-face {
  font-family: "SpecETBook";
  src: url("/specimen-fonts/et-book/et-book-roman.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "SpecETBook";
  src: url("/specimen-fonts/et-book/et-book-semi-bold.woff") format("woff");
  font-weight: 500;
  font-style: normal;
  font-display: block;
}
`

export default function SpecimenPage() {
  const [faceId, setFaceId] = useState(FACES[0].id)
  const [groundId, setGroundId] = useState(GROUNDS[0].id)

  const face = FACES.find((f) => f.id === faceId) ?? FACES[0]
  const ground = GROUNDS.find((g) => g.id === groundId) ?? GROUNDS[0]
  const beige = ground.family === "beige"

  // Chrome that stays readable on every ground without competing with the
  // specimen text: a low-opacity wash of the ink, so it follows the family.
  const chromeInk = beige ? "rgb(0 0 0 / 0.55)" : "rgb(255 255 255 / 0.55)"
  const chromeFill = beige ? "rgb(0 0 0 / 0.06)" : "rgb(255 255 255 / 0.08)"
  const chromeFillOn = beige ? "rgb(0 0 0 / 0.16)" : "rgb(255 255 255 / 0.22)"
  const rule = beige ? "rgb(0 0 0 / 0.12)" : "rgb(255 255 255 / 0.14)"

  const buttonStyle = (on: boolean) => ({
    background: on ? chromeFillOn : chromeFill,
    color: on ? ground.ink : chromeInk,
    border: "none",
    borderRadius: "9999px",
    padding: "0.4rem 0.75rem",
    fontSize: "0.8125rem",
    fontWeight: on ? 600 : 400,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
    lineHeight: 1.2,
  })

  const sampleFor = (kind: Role["sample"]) =>
    kind === "headline" ? HEADLINE : kind === "meta" ? META : BODY

  const labelStyle = {
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.6875rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: chromeInk,
    marginBottom: "0.5rem",
  }

  return (
    <div style={{ background: ground.hex, color: ground.ink, minHeight: "100vh" }}>
      <style>{FONT_FACE_CSS}</style>

      <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "1rem 1.25rem 5rem" }}>
        {/* Controls. Kept in system-ui so the chrome is never mistaken for the
            specimen and never influences the judgement being made. */}
        <div style={{ fontFamily: "system-ui, sans-serif" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
            {FACES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFaceId(f.id)}
                aria-pressed={f.id === faceId}
                style={buttonStyle(f.id === faceId)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {GROUNDS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroundId(g.id)}
                aria-pressed={g.id === groundId}
                style={buttonStyle(g.id === groundId)}
              >
                {g.id} {g.hex}
              </button>
            ))}
          </div>
        </div>

        {/* The identifying strip. A screenshot of this page names its own face,
            its own ground and its own ink, so nobody has to remember which
            button was pressed. */}
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.75rem",
            lineHeight: 1.5,
            color: chromeInk,
            margin: "1rem 0",
            paddingBottom: "1rem",
            borderBottom: "1px solid " + rule,
          }}
        >
          <div style={{ fontSize: "1rem", fontWeight: 700, color: ground.ink, marginBottom: "0.25rem" }}>
            {face.name}
          </div>
          <div>
            {face.licence} - {face.note}
          </div>
          <div>
            ground {ground.id} {ground.hex} - ink {ground.ink} - {ground.family}
          </div>
        </div>

        {ROLES.map((role) => (
          <section key={role.key} style={{ marginBottom: "2.5rem" }}>
            <div style={labelStyle}>{role.label}</div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
                lineHeight: 1.5,
                color: chromeInk,
                marginBottom: "0.75rem",
              }}
            >
              {role.fontSize} / {role.fontWeight} / {role.lineHeight}
              {role.letterSpacing ? " / " + role.letterSpacing : ""}
              <br />
              {role.cite}
            </div>
            <div
              style={{
                fontFamily: face.stack,
                fontSize: role.fontSize,
                fontWeight: role.fontWeight,
                lineHeight: role.lineHeight,
                letterSpacing: role.letterSpacing,
              }}
            >
              {sampleFor(role.sample)}
            </div>
          </section>
        ))}

        {/* The 11px row again, on its own, so it can be looked at without a
            32px headline in the same field of view. The whole question is
            whether the hairlines survive here on a phone. */}
        <section style={{ borderTop: "1px solid " + rule, paddingTop: "1.5rem" }}>
          <div style={labelStyle}>11px, alone</div>
          <div style={{ fontFamily: face.stack, fontSize: "11px", fontWeight: 400, lineHeight: 1 }}>{META}</div>
          <div style={{ height: "1.25rem" }} />
          <div style={{ fontFamily: face.stack, fontSize: "11px", fontWeight: 400, lineHeight: 1.6 }}>{BODY}</div>
        </section>
      </div>
    </div>
  )
}
