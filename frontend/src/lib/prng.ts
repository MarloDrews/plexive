// Deterministic, non-cryptographic PRNG helpers shared by the generated book
// cover (bookCover.ts) and the Battle seed (battle/seededQuestions.ts).
//
// Parity note: the Battle sequence math must stay identical to the mobile app
// (mobile/src/lib/battle/seededQuestions.ts). Cross-repo parity is by convention
// (mobile keeps its own copy), so these bodies must not change.

// xmur3: a tiny string hash producing a well-mixed 32-bit seed. Same string in
// -> same seed out, so a book's identity (title + author) always yields the same
// cover. Paired with mulberry32.
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

// mulberry32: a fast, fully deterministic 32-bit PRNG. Same seed -> same stream
// on every device (not cryptographic, does not need to be).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
