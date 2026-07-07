import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import TestRenderer from "react-test-renderer"
import * as EB from "../src/components/ErrorBoundary.tsx"

// tsx compiles the project's .tsx files to CommonJS (frontend/package.json has
// no "type":"module"), so a CJS default export reaches this ESM test double
// wrapped as mod.default.default. Unwrap it to get the real class.
const ErrorBoundary = EB.default.default ?? EB.default

// A stand-in for a section whose render throws (a malformed row the guards did
// not cover). This is exactly what SectionRenderer wraps each section in.
function Boom() {
  throw new Error("section blew up")
}

function Ok({ label }) {
  return React.createElement("span", null, label)
}

// React logs the caught error to console.error during a boundary test; silence
// it around the render so the test output stays clean, then restore.
function renderSilently(element) {
  const orig = console.error
  console.error = () => {}
  let renderer
  try {
    TestRenderer.act(() => {
      renderer = TestRenderer.create(element)
    })
  } finally {
    console.error = orig
  }
  return renderer
}

const h = React.createElement

test("a throwing child is contained and the fallback renders instead", () => {
  const tree = renderSilently(
    h(ErrorBoundary, { fallback: h("span", null, "could not display") }, h(Boom))
  )
  assert.equal(tree.toJSON().children[0], "could not display")
})

test("a crash in one boundary does not take down its siblings", () => {
  // Two sibling boundaries, like two sections in a post: one throws, the other
  // must still render its normal content.
  const tree = renderSilently(
    h(
      "div",
      null,
      h(ErrorBoundary, { fallback: h("span", null, "broken section") }, h(Boom)),
      h(ErrorBoundary, { fallback: h("span", null, "broken section") }, h(Ok, { label: "healthy section" }))
    )
  )
  const text = JSON.stringify(tree.toJSON())
  assert.ok(text.includes("broken section"), "the failed section shows its fallback")
  assert.ok(text.includes("healthy section"), "the sibling section still renders")
})

test("componentDidCatch forwards the error to onError", () => {
  let caught = null
  renderSilently(
    h(ErrorBoundary, { fallback: null, onError: (e) => { caught = e } }, h(Boom))
  )
  assert.ok(caught instanceof Error)
  assert.equal(caught.message, "section blew up")
})

test("a healthy subtree renders its children untouched", () => {
  const tree = renderSilently(
    h(ErrorBoundary, { fallback: h("span", null, "unused fallback") }, h(Ok, { label: "content" }))
  )
  assert.equal(tree.toJSON().children[0], "content")
})
