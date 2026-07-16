"use client"

import Avatar from "./Avatar"
import VerifiedBadge from "./VerifiedBadge"
import { badgeSrc } from "@/lib/accessories"

// Portrait badge tile that mirrors the Arena ranked waiting-room look (see
// QueueTile in Arena.tsx): the equipped badge is the tile's backdrop, with the
// avatar and name over its upper half. Geometry matches the waiting room so the
// two read as one object; unlike the fluid grid there, this tile's width is
// fixed, so the avatar size is a plain fraction of it -- no ResizeObserver.
const TILE_RATIO = 1.5 // tile height / tile width
const AVATAR_WIDTH = 0.5 // avatar diameter / tile width
// Avatar's top edge as a percentage of the tile HEIGHT (what CSS `top` resolves
// against), placing the avatar centred in the tile's upper half.
const AVATAR_TOP_PCT = ((TILE_RATIO / 4 - AVATAR_WIDTH / 2) / TILE_RATIO) * 100

interface Props {
  username: string
  avatarUrl?: string | null
  // Equipped badge id (lib/accessories). Null/unknown = plain tile fill.
  badgeId?: number | null
  verified?: number
  // Tile width in px; height and avatar size derive from it.
  width?: number
}

export default function ProfileBadgeCard({
  username,
  avatarUrl,
  badgeId = null,
  verified = 0,
  width = 112,
}: Props) {
  const height = Math.round(width * TILE_RATIO)
  const avatarSize = Math.round(width * AVATAR_WIDTH)
  const badge = badgeSrc(badgeId)
  return (
    <div
      className="relative shrink-0 rounded-3xl border-2 overflow-hidden"
      style={{
        width,
        height,
        borderColor: "var(--color-ink-muted)",
        // Only fill when there is no badge art to show through.
        background: badge ? undefined : "rgb(255 255 255 / 0.04)",
      }}
    >
      {badge && (
        // Decorative backdrop; the art is authored 1:1.5 so object-cover crops
        // nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badge}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Avatar + name anchored to the avatar's top edge, both sitting in the
          tile's upper half. The avatar carries no frame or ring here -- the
          badge tile is the decoration. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-1.5 px-2"
        style={{ top: `${AVATAR_TOP_PCT}%` }}
      >
        <Avatar username={username} avatarUrl={avatarUrl} size={avatarSize} />
        <span
          className="flex items-center gap-1 text-sm font-bold max-w-full"
          // White over a black shadow so the name holds up against whatever the
          // badge artwork puts behind it, light or dark.
          style={{ color: "#ffffff", textShadow: "0 1px 2px rgb(0 0 0 / 0.95), 0 2px 8px rgb(0 0 0 / 0.8)" }}
        >
          <span className="truncate">{username}</span>
          {verified > 0 && <VerifiedBadge size={13} level={verified} />}
        </span>
      </div>
    </div>
  )
}
