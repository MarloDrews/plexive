# Cosmetic accessories

Placeholder art for the two cosmetics on `users`:

- `frames/` — the overlay circle drawn on top of a profile picture (`users.avatar_frame_id`)
- `badges/` — the Arena ranked waiting-room tile (`users.badge_id`)

## Adding a design

1. Export a PNG into `frames/` or `badges/` (see the contract below).
2. Add the id to the matching map in `src/lib/accessories.ts`.
3. Set that number on a user in the Supabase `users` table.

No backend change is needed: the database stores only the number, and the id to
artwork map lives in the frontend. An id with no entry in the map falls back to
the default look, so unfinished art can sit in the folder harmlessly.

## The contract

| | Frames | Badges |
|---|---|---|
| Size | 320x320 | 480x720 |
| Shape | square | 1:1.5, matching the tile so `object-cover` crops nothing |
| Alpha | transparent middle, required | opaque |
| Rendered at | 24-88 CSS px | ~150-200 CSS px wide |

Two rules the art itself has to respect:

**A frame's hole must sit at 87.7% of the canvas** (a circle of diameter ~281px
centred in the 320px square). `FRAME_SCALE` in `src/lib/accessories.ts` decides
how far a frame overhangs the picture it rings, and the art is drawn so its
inner edge lands exactly on the picture's edge at that scale. The two are
coupled — change one without the other and the ring floats off the avatar.

**Badges must stay dark.** The avatar and username render on top in white. The
three here sit at a background luminance of roughly 15-22 out of 255; a badge
bright enough to admire is a badge bright enough to swallow the name.

Frames are rendered as small as 24px on post cards, so check the small end: a
busy design turns to mud there.

## Regenerating

These placeholders were drawn as SVG and exported to PNG, then quantised to 256
colours with dithering (measured error: mean under 3/255, imperceptible) which
cut the set from 482K to 58K. Real art from a design tool needs none of that —
just export a PNG at the size above.
