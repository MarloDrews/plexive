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
// The four component citations were re-checked against 5757481 (the EB Garamond
// merge) on 2026-09-03 and all four still land on the line they name; the
// globals.css one had moved and is corrected in the same pass.
//
// SINCE 5757481 EB GARAMOND IS THE APP'S READING FACE, and it carries an
// x-height correction: globals.css:36-41 and :343 state the reading size in
// x-heights (font-size-adjust: 0.426, which is Newsreader's ratio) so swapping
// the family did not shrink any rendered text. This page reproduces that
// correction on every row set in a candidate face, because without it the
// specimen renders EB Garamond about 6% smaller than the app does and the
// judgement would be made about text the product never shows. The correction is
// stated in x-heights rather than in EB Garamond's own metrics, so it applies
// unchanged to all four candidates and normalises them to each other as a side
// effect. It is deliberately NOT on the chrome: every block below that sets
// fontFamily also sets fontSizeAdjust, which is the pairing contract
// globals.css:25-30 states for the app.
//
// The page also carries THREE decision panels that are not about typefaces, for
// the beige-theme question the 2026-09-03 design token inventory opened: the
// seven format accents (all seven measure 1.69-2.17:1 on every beige, below
// even the 3:1 floor a rule needs), the card surface (a white wash, which on
// beige makes a card LIGHTER than the page), and the ground pair. All three are
// things to look at, not to read off a table.
//
// THE THIRD ONE IS THE ONE THAT DOES NOT SWITCH. The first two show one ground
// at a time, which compares a colour against a memory of the last one; the
// ground-pair panel at the bottom (ground-pair-panel.tsx) puts a light ground
// and a dark ground on the screen at once, chosen independently from six each,
// with the accent palette and the contrast floor chosen once for both. Its
// values are generated into ground-palettes-data.ts by ground-palettes.mjs and
// are never typed in by hand.
//
// The fonts are self-hosted under public/specimen-fonts/, following the same
// static-asset pattern public/accessories/ and public/seed-images/ already use.
// They are NOT loaded through next/font/google the way layout.tsx loads the
// product faces, because the point of this page is to look at files that would
// ship inside an Android app, and a build-time fetch would not answer that.
// The @font-face block is inline rather than in globals.css because globals.css
// is outside this batch's scope.

import { Fragment, useState } from "react"

import GroundPairPanel from "./ground-pair-panel"

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
  // One step off the ground, for the card panel: lighter on a dark ground,
  // darker on a beige one. NOT chosen by eye and not +10 per channel either.
  // Produced by `node src/app/specimen/accent-candidates.mjs step`, which takes
  // the app's own step (--color-surface-0 #0a0a0a to --color-surface-1 #141414,
  // globals.css:60-61, which is also what rgb(255 255 255 / 0.04) composites to
  // over the base) as a lightness difference in OKLab, delta L = 0.046463, and
  // applies it in the direction the ground family needs. Copying the channel
  // arithmetic instead would put a visible step on the dark grounds and an
  // invisible one on the beige ones, and the panel would then answer a question
  // about arithmetic rather than about direction.
  step: string
}

const GROUNDS: Ground[] = [
  { id: "L1", hex: "#FAF6EE", ink: "#14110C", family: "beige", step: "#EBE7DF" },
  { id: "L2", hex: "#F4EFE6", ink: "#14110C", family: "beige", step: "#E5E0D7" },
  { id: "L3", hex: "#EDE4D3", ink: "#14110C", family: "beige", step: "#DED5C4" },
  { id: "D1", hex: "#0B0E15", ink: "#EEEEEE", family: "dark", step: "#151820" },
  { id: "D2", hex: "#0F1117", ink: "#EEEEEE", family: "dark", step: "#191B22" },
  { id: "D3", hex: "#070910", ink: "#EEEEEE", family: "dark", step: "#10131B" },
]

// ---------------------------------------------------------------------------
// The seven format accents, and the two candidate sets for a light ground.
//
// `today` is read from globals.css:97-103. `setA` and `setB` are the output of
// `node src/app/specimen/accent-candidates.mjs emit`, pasted here because this
// page is a client component with no build step: hue held exactly, lightness
// set to 0.50 (A) and 0.44 (B), chroma the largest value in the sRGB gamut at
// that lightness capped at 1.4x the original. The script proves its own
// conversion first -- #FFFFFF to lightness 1 and chroma 0, #000000 to lightness
// 0, and a hex -> OKLCH -> hex round trip of all seven with a maximum
// per-channel error of 0 in 0-255 units.
//
// The point of showing `today` beside the two candidates is that the contrast
// table cannot answer the only question that matters here: whether a colour at
// lightness 0.50 or 0.44 still READS as the colour that format has today.
// ---------------------------------------------------------------------------

interface Accent {
  name: string
  today: string
  setA: string
  setB: string
}

const ACCENTS: Accent[] = [
  { name: "books", today: "#cfa857", setA: "#7f5d00", setB: "#6a4d00" },
  { name: "facts", today: "#7eb1f3", setA: "#1362b8", setB: "#0050a0" },
  { name: "people", today: "#d993ca", setA: "#953986", setB: "#822674" },
  { name: "concepts", today: "#b69feb", setA: "#6f4aae", setB: "#5e389b" },
  { name: "questions", today: "#43c3c4", setA: "#007273", setB: "#005f60" },
  { name: "stories", today: "#eb9288", setA: "#a9352f", setB: "#95201e" },
  { name: "academy", today: "#73c28d", setA: "#00773f", setB: "#006434" },
]

// The app's reading-face x-height correction, globals.css:37 and :343. Applied
// to every row on this page that is set in a candidate face, and to nothing
// else. Kept as one named constant so the page cannot drift from the app by a
// typo in one of seven places.
const READING_FACE_ADJUST = "0.426"

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
    cite: "globals.css:341-347 - font-serif, font-size-adjust 0.426, --text-reading 1.0625rem, line-height 1.7",
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

// The card panel needs a block short enough that four of them fit on one screen
// and long enough to wrap. Two sentences off the passage above, so the card
// panel and the type rows are not comparing different text.
const CARD_TEXT =
  "Meitner, who had fled to Sweden that July, read the letter in Kungalv over " +
  "Christmas. Walking in the snow with her nephew Otto Frisch, she did the sum " +
  "on a scrap of paper."

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
    fontSizeAdjust: "none",
    cursor: "pointer",
    lineHeight: 1.2,
  })

  const sampleFor = (kind: Role["sample"]) =>
    kind === "headline" ? HEADLINE : kind === "meta" ? META : BODY

  const labelStyle = {
    fontFamily: "system-ui, sans-serif",
    fontSizeAdjust: "none" as const,
    fontSize: "0.6875rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: chromeInk,
    marginBottom: "0.5rem",
  }

  // Small chrome caption, for the hexes printed beside every swatch and card.
  const captionStyle = {
    fontFamily: "ui-monospace, monospace",
    fontSizeAdjust: "none" as const,
    fontSize: "0.625rem",
    lineHeight: 1.4,
    color: chromeInk,
  }

  // rgb(255 255 255 / 0.04) over the ground, resolved. The value the app's
  // .card carries today (globals.css:182); shown as a real hex so the
  // inversion on beige is a thing on the screen rather than a claim.
  const whiteWashOver = (groundHex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(groundHex.slice(i, i + 2), 16))
    return (
      "#" +
      channels
        .map((c) => Math.round(255 * 0.04 + c * 0.96).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
    )
  }

  // The four card treatments. Each is a flat fill, a flat rule, both, or the
  // wash that ships. No radius, no shadow, no gradient: those are separate
  // decisions and putting one here would make all four look like a proposal.
  const CARD_TREATMENTS = [
    {
      name: "Step",
      resolved: ground.step + (beige ? " (darker than the ground)" : " (lighter than the ground)"),
      style: { background: ground.step },
    },
    {
      name: "Line",
      resolved: "no fill, 1px " + rule,
      style: { border: "1px solid " + rule },
    },
    {
      name: "Step and line",
      resolved: ground.step + " + 1px " + rule,
      style: { background: ground.step, border: "1px solid " + rule },
    },
    {
      name: "Today, what ships",
      resolved: "rgb(255 255 255 / 0.04) over " + ground.hex + " = " + whiteWashOver(ground.hex),
      style: { background: "rgb(255 255 255 / 0.04)" },
    },
  ]

  return (
    <div style={{ background: ground.hex, color: ground.ink, minHeight: "100vh" }}>
      <style>{FONT_FACE_CSS}</style>

      <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "1rem 1.25rem 5rem" }}>
        {/* Controls. Kept in system-ui so the chrome is never mistaken for the
            specimen and never influences the judgement being made. */}
        <div style={{ fontFamily: "system-ui, sans-serif", fontSizeAdjust: "none" }}>
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
            fontSizeAdjust: "none",
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
          {/* Said on the page, not only in the source: a page that merely
              declares font-size-adjust and a page where it takes effect look
              identical in a screenshot. */}
          <div style={{ marginTop: "0.35rem" }}>
            x-height correction APPLIED: font-size-adjust {READING_FACE_ADJUST} on every row set in{" "}
            {face.name}, the same value globals.css:37 and :343 carry for the app&apos;s reading face.
            The chrome on this page resets it to none.
          </div>
        </div>

        {ROLES.map((role) => (
          <section key={role.key} style={{ marginBottom: "2.5rem" }}>
            <div style={labelStyle}>{role.label}</div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSizeAdjust: "none",
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
              data-specimen-row={role.key}
              style={{
                fontFamily: face.stack,
                fontSizeAdjust: READING_FACE_ADJUST,
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
          <div
            style={{
              fontFamily: face.stack,
              fontSizeAdjust: READING_FACE_ADJUST,
              fontSize: "11px",
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            {META}
          </div>
          <div style={{ height: "1.25rem" }} />
          <div
            style={{
              fontFamily: face.stack,
              fontSizeAdjust: READING_FACE_ADJUST,
              fontSize: "11px",
              fontWeight: 400,
              lineHeight: 1.6,
            }}
          >
            {BODY}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The accent panel. Seven formats, each as small coloured text at the
            11px metadata size and as a 2px coloured rule, because those are the
            two things the app actually does with a format accent and they fail
            different thresholds (4.5:1 and 3:1).

            On a beige ground: three versions side by side, the value shipping
            today and the two candidate sets. On a dark ground: the shipping
            value alone, because the candidate sets were built for a light
            ground and putting them on black would invite a comparison nobody
            is being asked to make.
            ------------------------------------------------------------------ */}
        <section style={{ borderTop: "1px solid " + rule, marginTop: "2.5rem", paddingTop: "1.5rem" }}>
          <div style={labelStyle}>Format accents</div>
          <div style={{ ...captionStyle, marginBottom: "1rem" }}>
            {beige
              ? "today (globals.css:97-103, L 0.75) / set A (L 0.50) / set B (L 0.44). Hue held, chroma the largest in gamut capped at 1.4x. Does a candidate still read as the same colour that format has?"
              : "dark ground: the shipping value alone. The two candidate sets are for a light ground and are not shown here."}
          </div>

          {beige && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "5.5rem 1fr 1fr 1fr",
                gap: "0.5rem 0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              <div style={captionStyle} />
              <div style={captionStyle}>today</div>
              <div style={captionStyle}>set A, L 0.50</div>
              <div style={captionStyle}>set B, L 0.44</div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: beige ? "5.5rem 1fr 1fr 1fr" : "5.5rem 1fr",
              gap: "0.9rem 0.75rem",
              alignItems: "start",
            }}
          >
            {ACCENTS.map((accent) => {
              const shown = beige
                ? [accent.today, accent.setA, accent.setB]
                : [accent.today]
              return (
                <Fragment key={accent.name}>
                  <div style={captionStyle}>{accent.name}</div>
                  {shown.map((hex) => (
                    <div key={hex}>
                      {/* Small coloured text at the 11px metadata size, the
                          size PostCard.tsx:155 renders the meta row at. */}
                      <div
                        style={{
                          fontFamily: face.stack,
                          fontSizeAdjust: READING_FACE_ADJUST,
                          fontSize: "11px",
                          lineHeight: 1.2,
                          color: hex,
                        }}
                      >
                        {accent.name}
                      </div>
                      {/* A 2px coloured rule: the thin non-text element, which
                          needs 3:1 rather than 4.5:1. */}
                      <div style={{ height: "2px", background: hex, marginTop: "0.35rem" }} />
                      <div style={{ ...captionStyle, marginTop: "0.25rem" }}>{hex}</div>
                    </div>
                  ))}
                </Fragment>
              )
            })}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The card panel. The same block of text in four treatments, on every
            ground, so the direction problem is visible: the white wash that
            ships makes a card LIGHTER than a beige page, and no value
            substitution fixes a direction.

            No radius, no shadow, no gradient on any of the four. Those are
            separate decisions, and one of them here would turn a comparison
            into a proposal.
            ------------------------------------------------------------------ */}
        <section style={{ borderTop: "1px solid " + rule, marginTop: "2.5rem", paddingTop: "1.5rem" }}>
          <div style={labelStyle}>Card surface</div>
          <div style={{ ...captionStyle, marginBottom: "1rem" }}>
            same text, four treatments, on {ground.id} {ground.hex}. The step is the app&apos;s own
            #0a0a0a-to-#141414 lightness difference carried across in OKLab, not +10 per channel.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {CARD_TREATMENTS.map((treatment) => (
              <div key={treatment.name} style={{ flex: "1 1 13rem", minWidth: "12rem" }}>
                <div style={{ ...captionStyle, marginBottom: "0.35rem" }}>
                  {treatment.name}
                  <br />
                  {treatment.resolved}
                </div>
                <div style={{ padding: "0.9rem", ...treatment.style }}>
                  <div
                    style={{
                      fontFamily: face.stack,
                      fontSizeAdjust: READING_FACE_ADJUST,
                      fontSize: "1.0625rem",
                      lineHeight: 1.7,
                    }}
                  >
                    {CARD_TEXT}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------
          The ground-pair panel. Full width and OUTSIDE the column above, so
          the two halves are full bleed and neither is tinted by the single
          ground the rest of the page is showing.

          It is the one panel here that does not switch: a light ground and a
          dark ground are on the screen at the same time, chosen
          independently, so a pair is judged as a pair. The x-height
          correction is passed down rather than re-declared, so there is one
          0.426 on this page and not two.
          ------------------------------------------------------------------ */}
      <GroundPairPanel xheight={READING_FACE_ADJUST} />
    </div>
  )
}
