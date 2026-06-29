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

test("a routed Academy prose field italicizes a theory name and leaves math tokens raw", () => {
  // Freezes the text-segment contract the newly-routed Academy fields rely on
  // (field_context body + key_priors.claim, limitations, objections,
  // implications, cross_field_reach, robustness, authors_context one_line):
  // MathText hands splitItalics only the text OUTSIDE $...$ (math segments go
  // to KaTeX and never reach this helper), so a routed field renders *theory*
  // as an <em> while a math/subscript token in the same text segment is left
  // byte-for-byte intact.
  const runs = splitItalics("the *Bayesian brain* inverts a model and a_{b} stays raw")
  assert.deepEqual(runs, [
    { text: "the ", italic: false },
    { text: "Bayesian brain", italic: true },
    { text: " inverts a model and a_{b} stays raw", italic: false },
  ])
})
