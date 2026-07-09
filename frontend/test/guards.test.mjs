import { test } from "node:test"
import assert from "node:assert/strict"
// Imported with the .ts extension on purpose (see italics.test.mjs): Node/tsx
// strips the types at load time and keeping the test as .mjs means tsc never
// sees these imports.
import { asArray } from "../src/lib/asArray.ts"
import { relativeTime } from "../src/lib/relativeTime.ts"
import { detailToMessage } from "../src/lib/errorMessage.ts"
import { numericMatch } from "../src/lib/train/numeric.ts"
import { safeHref, safeImageSrc } from "../src/lib/safeUrl.ts"

// asArray: the guard every array-shaped section leans on so a malformed row
// renders empty instead of throwing on .map / .length.
test("asArray returns an array as-is", () => {
  const input = [1, 2, 3]
  assert.equal(asArray(input), input)
})

test("asArray coerces non-arrays (null, object, undefined, number) to []", () => {
  for (const bad of [null, undefined, {}, 5, "text", true]) {
    assert.deepEqual(asArray(bad), [])
  }
})

// relativeTime: never render "Invalid Date" and never throw on a null/blank
// timestamp (BUG-092).
test("relativeTime returns '' for null, undefined or an empty string", () => {
  assert.equal(relativeTime(null), "")
  assert.equal(relativeTime(undefined), "")
  assert.equal(relativeTime(""), "")
})

test("relativeTime returns '' for an unparseable value instead of 'Invalid Date'", () => {
  assert.equal(relativeTime("not a date"), "")
})

test("relativeTime reads a value that already carries a Z or offset", () => {
  // A trailing Z or +/-hh:mm must be left alone: appending another Z would make
  // an invalid date and return "". A non-empty result proves it parsed.
  assert.notEqual(relativeTime("2020-01-01T00:00:00Z"), "")
  assert.notEqual(relativeTime("2020-01-01T00:00:00+02:00"), "")
})

test("relativeTime formats a naive UTC datetime without throwing", () => {
  // A datetime with no timezone designator (the common API shape) gets a Z
  // appended and formats to a real relative string.
  const result = relativeTime("2020-01-01T00:00:00")
  assert.equal(typeof result, "string")
  assert.ok(result.length > 0)
})

// detailToMessage: a FastAPI 422 detail is an array of objects; rendering it
// directly crashes React or prints "[object Object]".
test("detailToMessage passes a string detail through", () => {
  assert.equal(detailToMessage("Post not found", "fallback"), "Post not found")
})

test("detailToMessage renders a 422 array as its first message, stripping the Value error prefix", () => {
  const detail = [{ msg: "Value error, title is required", loc: ["body", "title"] }]
  assert.equal(detailToMessage(detail, "fallback"), "title is required")
})

test("detailToMessage falls back for a shape it does not recognize", () => {
  assert.equal(detailToMessage({ unexpected: true }, "Something went wrong."), "Something went wrong.")
  assert.equal(detailToMessage([], "fallback"), "fallback")
})

// numericMatch: compare step-scaled indices, not raw floats, so a slider answer
// on the min+k*step grid is reachable despite float drift.
test("numericMatch matches values that differ only by float accumulation", () => {
  // 0.1 * 3 !== 0.3 under strict equality, but both land on step index 3.
  assert.equal(numericMatch(0.1 + 0.1 + 0.1, 0.3, 0, 0.1), true)
})

test("numericMatch rejects values a step or more apart", () => {
  assert.equal(numericMatch(0.2, 0.3, 0, 0.1), false)
})

test("numericMatch falls back to strict equality when step is not positive", () => {
  assert.equal(numericMatch(5, 5, 0, 0), true)
  assert.equal(numericMatch(5, 6, 0, 0), false)
})

// safeHref / safeImageSrc: the scheme allowlist for user-controlled URLs
// (M123). Only http(s) and same-origin relative paths pass; a javascript:/data:
// scheme is refused (undefined href, "" src) so it never reaches the DOM.
test("safeHref keeps http(s) and relative URLs, drops dangerous schemes", () => {
  assert.equal(safeHref("https://example.org/a"), "https://example.org/a")
  assert.equal(safeHref("http://example.org"), "http://example.org")
  assert.equal(safeHref("/profile/me"), "/profile/me")
  assert.equal(safeHref("javascript:alert(1)"), undefined)
  assert.equal(safeHref("data:text/html,x"), undefined)
  assert.equal(safeHref(null), undefined)
  assert.equal(safeHref(""), undefined)
})

test("safeImageSrc keeps http(s) and relative URLs, blanks dangerous schemes", () => {
  assert.equal(safeImageSrc("https://cdn.example/x.png"), "https://cdn.example/x.png")
  assert.equal(safeImageSrc("/uploads/x.png"), "/uploads/x.png")
  assert.equal(safeImageSrc("javascript:alert(1)"), "")
  assert.equal(safeImageSrc("data:image/svg+xml,x"), "")
  assert.equal(safeImageSrc(null), "")
})
