import { test } from "node:test"
import assert from "node:assert/strict"
import { isAuthorized, gateEnabled } from "../src/lib/betaGate.ts"

const PROD = { NODE_ENV: "production", BETA_USER: "plexive", BETA_PASSWORD: "s3cret" }

function basic(user, password) {
  return "Basic " + Buffer.from(`${user}:${password}`).toString("base64")
}

// --- the direction the gate exists to allow ----------------------------------

test("the right credentials are admitted", () => {
  assert.equal(isAuthorized(basic("plexive", "s3cret"), PROD), true)
})

test("the username defaults to plexive so only the password must be shared", () => {
  const env = { NODE_ENV: "production", BETA_PASSWORD: "s3cret" }
  assert.equal(isAuthorized(basic("plexive", "s3cret"), env), true)
})

test("a password containing a colon still works (split on the first one only)", () => {
  const env = { NODE_ENV: "production", BETA_USER: "plexive", BETA_PASSWORD: "a:b:c" }
  assert.equal(isAuthorized(basic("plexive", "a:b:c"), env), true)
})

test("the gate is off outside production, so dev and build need no credentials", () => {
  assert.equal(gateEnabled({ NODE_ENV: "development" }), false)
  assert.equal(isAuthorized(null, { NODE_ENV: "development" }), true)
})

// --- the direction the gate exists to catch ----------------------------------

test("no Authorization header is refused", () => {
  assert.equal(isAuthorized(null, PROD), false)
})

test("the wrong password is refused", () => {
  assert.equal(isAuthorized(basic("plexive", "wrong"), PROD), false)
})

test("the wrong username is refused", () => {
  assert.equal(isAuthorized(basic("someone", "s3cret"), PROD), false)
})

test("a Bearer token is not a way past a Basic gate", () => {
  assert.equal(isAuthorized("Bearer s3cret", PROD), false)
})

test("a malformed header is refused rather than throwing", () => {
  for (const h of ["Basic", "Basic ", "Basic !!!not-base64!!!", "s3cret", ""]) {
    assert.equal(isAuthorized(h, PROD), false, `header: ${JSON.stringify(h)}`)
  }
})

test("base64 without a colon is refused", () => {
  const h = "Basic " + Buffer.from("nocolonhere").toString("base64")
  assert.equal(isAuthorized(h, PROD), false)
})

// --- fail closed --------------------------------------------------------------
// The case that matters most in production: a typo in the Vercel env var name.
// Waving everyone through there would silently restore the exact state this
// change exists to end, and nothing would report it.

test("an unset password in production denies everyone, including correct-looking creds", () => {
  const env = { NODE_ENV: "production", BETA_USER: "plexive" }
  assert.equal(isAuthorized(basic("plexive", "s3cret"), env), false)
  assert.equal(isAuthorized(null, env), false)
})

test("an empty-string password in production also denies", () => {
  const env = { NODE_ENV: "production", BETA_USER: "plexive", BETA_PASSWORD: "" }
  assert.equal(isAuthorized(basic("plexive", ""), env), false)
})
