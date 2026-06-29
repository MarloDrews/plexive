import { test } from "node:test"
import assert from "node:assert/strict"
// Imported with the .ts extension on purpose: Node strips the types at load
// time, and keeping the test as .mjs means tsc never sees this file (so the
// .ts-extension import does not trip allowImportingTsExtensions).
import { splitItalics } from "../src/lib/italics.ts"

test("*italic* outside math becomes an italic run", () => {
  const runs = splitItalics("see *predictive coding* now")
  assert.deepEqual(runs, [
    { text: "see ", italic: false },
    { text: "predictive coding", italic: true },
    { text: " now", italic: false },
  ])
})

test("a string with no asterisks is one untouched non-italic run", () => {
  // Currency ($5) and a subscript-like fragment (a_{b}) must pass through
  // verbatim: the helper only acts on asterisk pairs.
  const input = "it costs $5 and uses a_{b}"
  const runs = splitItalics(input)
  assert.deepEqual(runs, [{ text: input, italic: false }])
})

test("a lone unmatched asterisk stays literal", () => {
  const input = "5 * 3 = 15"
  const runs = splitItalics(input)
  assert.deepEqual(runs, [{ text: input, italic: false }])
})

test("a whole-string italic has no empty surrounding runs", () => {
  assert.deepEqual(splitItalics("*all italic*"), [{ text: "all italic", italic: true }])
})
