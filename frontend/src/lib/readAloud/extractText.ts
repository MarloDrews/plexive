// Reads the visible text out of a rendered DOM subtree and splits it into
// sentences, while remembering which characters came from which Text node
// so highlights can later be mapped back onto the page (see highlights.ts).

export interface TextSegment {
  node: Text
  start: number // offset of this node's first character in the combined string
  end: number // offset just past this node's last character
}

export interface Sentence {
  text: string // exactly the characters [start, end) of the combined string
  start: number
  end: number
}

export interface ReadableText {
  segments: TextSegment[]
  sentences: Sentence[]
}

// Text that must never be spoken: interactive controls (quiz options),
// embedded code/styles, SVG internals, anything hidden from assistive
// technology, and visible chrome explicitly opted out with data-no-read
// (section labels, metadata rows, attribution, interest tags).
const SKIP_SELECTOR = "button, script, style, svg, [aria-hidden='true'], [data-no-read]"

// Tags treated as paragraph-like boundaries. When two text nodes belong to
// different blocks, a separator forces a sentence break between them, so a
// heading without a period does not merge into the next paragraph.
const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "FIGCAPTION",
  "DIV", "SECTION", "ARTICLE", "UL", "OL", "TABLE", "TR", "TD", "TH", "DT", "DD",
])

function closestBlock(node: Text, root: HTMLElement): Element {
  let el: Element | null = node.parentElement
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.tagName)) return el
    el = el.parentElement
  }
  return root
}

function isReadable(node: Text): boolean {
  const el = node.parentElement
  if (!el) return false
  if (el.closest(SKIP_SELECTOR)) return false
  // Elements hidden with display:none (collapsed quiz answers, broken
  // images' captions, ...) have no client rects.
  if (el.getClientRects().length === 0) return false
  return true
}

// One sentence = the shortest run ending in .!?… followed by whitespace
// (so "3.14" inside a run does not split it), or the trailing fragment
// without a terminator (headings, list items).
const SENTENCE_RE = /.*?[.!?…]+["')\]]*(?:\s+|$)|.+/g

// Common abbreviations whose period is followed by whitespace but does not
// end the sentence ("e.g. a lemur", "Dr. Julius"). A chunk ending in one is
// merged with the chunk after it. Conservative on purpose: words like "etc."
// or "no." often DO end sentences and stay split.
const ABBREVIATION_END_RE = /\b(?:e\.g|i\.e|vs|cf|ca|dr|mr|mrs|ms|prof|st|fig)\.$/i

function splitSentences(combined: string): Sentence[] {
  const sentences: Sentence[] = []
  let blockStart = 0
  for (const block of combined.split("\n")) {
    const chunks: Sentence[] = []
    for (const m of block.matchAll(SENTENCE_RE)) {
      const start = blockStart + m.index
      chunks.push({ text: m[0], start, end: start + m[0].length })
    }
    // Abbreviation guard: a chunk whose terminator is an abbreviation period
    // is not a sentence end; rejoin it with the next chunk.
    const merged: Sentence[] = []
    for (const chunk of chunks) {
      const prev = merged[merged.length - 1]
      if (prev && prev.end === chunk.start && ABBREVIATION_END_RE.test(prev.text.trimEnd())) {
        prev.text = combined.slice(prev.start, chunk.end)
        prev.end = chunk.end
      } else {
        merged.push({ ...chunk })
      }
    }
    for (const chunk of merged) {
      // Only queue chunks containing at least one letter or digit; bare
      // punctuation/separator chunks are not worth an utterance.
      if (/[\p{L}\p{N}]/u.test(chunk.text)) sentences.push(chunk)
    }
    blockStart += block.length + 1 // +1 for the "\n" block separator
  }
  return sentences
}

export function extractReadableText(root: HTMLElement): ReadableText {
  const segments: TextSegment[] = []
  let combined = ""
  let lastBlock: Element | null = null
  let pendingSpace = false

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text
    if (!isReadable(node)) continue
    const text = node.textContent ?? ""
    if (!text.trim()) {
      // A whitespace-only node between kept siblings still separates words;
      // dropping it silently used to hand the synthesizer concatenations
      // like "fastthinking". Remember it and emit one unmapped space below.
      if (segments.length > 0) pendingSpace = true
      continue
    }

    const block = closestBlock(node, root)
    if (lastBlock && block !== lastBlock) {
      // Separator is not mapped to any node; rangeFromOffsets skips it.
      combined += "\n"
    } else if (pendingSpace) {
      // Unmapped like the block separator above.
      combined += " "
    }
    pendingSpace = false
    lastBlock = block

    const start = combined.length
    combined += text
    segments.push({ node, start, end: combined.length })
  }

  return { segments, sentences: splitSentences(combined) }
}
