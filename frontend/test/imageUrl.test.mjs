import { test } from "node:test"
import assert from "node:assert/strict"
import { sizedImageUrl } from "../src/lib/imageUrl.ts"

test("appends a width to a Wikimedia Special:FilePath URL", () => {
  const out = sizedImageUrl(
    "https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg",
    860
  )
  assert.equal(out, "https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg?width=860")
})

test("also sizes upload.wikimedia.org FilePath URLs", () => {
  const out = sizedImageUrl(
    "https://upload.wikimedia.org/wiki/Special:FilePath/Bar.jpg",
    192
  )
  assert.ok(out.endsWith("?width=192"))
})

test("does not double a width that is already present", () => {
  const url = "https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg?width=300"
  assert.equal(sizedImageUrl(url, 860), url)
})

test("leaves a non-Wikimedia URL untouched", () => {
  const url = "https://project.supabase.co/storage/v1/object/public/covers/x.jpg"
  assert.equal(sizedImageUrl(url, 400), url)
})

test("leaves a Wikimedia URL that is not a FilePath untouched", () => {
  const url = "https://commons.wikimedia.org/wiki/File:Foo.jpg"
  assert.equal(sizedImageUrl(url, 400), url)
})

test("returns a relative or malformed URL unchanged", () => {
  assert.equal(sizedImageUrl("/uploads/local.jpg", 400), "/uploads/local.jpg")
  assert.equal(sizedImageUrl("", 400), "")
})
