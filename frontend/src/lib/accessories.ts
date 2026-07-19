// Cosmetic accessories: the id -> artwork map for models.User.avatar_frame_id
// (the overlay circle drawn on a profile picture) and models.User.badge_id (the
// Arena ranked waiting-room tile).
//
// The backend only stores and serves the number, so a new design is a file plus
// a line here -- no backend change. Nothing in the UI writes these ids yet: they
// are set by hand in the Supabase users table. An id with no entry here returns
// null and the caller renders the default look, so a typo in the DB costs a
// frame, never a broken avatar.
//
// Both sets are placeholder art pending real designs.
//
// The art is PNG, so a design tool's export drops straight in with no authoring
// rules to remember. Frames need a transparent middle (the picture shows
// through the ring) and are square; badges are opaque and 1:1.5. See
// public/accessories/README.md for the sizes and the rest of the contract.

const FRAMES: Record<number, string> = {
  1: "/accessories/frames/1-halo.png",
  2: "/accessories/frames/2-gilded.png",
  3: "/accessories/frames/3-circuit.png",
}

const BADGES: Record<number, string> = {
  1: "/accessories/badges/1-halo.png",
  2: "/accessories/badges/2-gilded.png",
  3: "/accessories/badges/3-circuit.png",
  4: "/accessories/badges/4-contributor.png",
  5: "/accessories/badges/5-wavelength.png",
  6: "/accessories/badges/6-robin.png"
}

// How far a frame extends past the picture it rings, as a fraction of the
// avatar's diameter. The artwork is drawn so its INNER edge lands on the
// picture's edge at exactly this scale; changing one without the other unseats
// the ring. The frame is positioned absolutely and overflows its box, so the
// avatar keeps its layout size at every call site.
export const FRAME_SCALE = 1.14

export function frameSrc(id: number | null | undefined): string | null {
  if (id == null) return null
  return FRAMES[id] ?? null
}

export function badgeSrc(id: number | null | undefined): string | null {
  if (id == null) return null
  return BADGES[id] ?? null
}
