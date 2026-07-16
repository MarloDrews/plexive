"use client"

import Avatar from "./Avatar"
import VerifiedBadge from "./VerifiedBadge"
import { badgeSrc } from "@/lib/accessories"

// Shared standard for badge tiles, used by the public profile header and the
// Arena ranked waiting room (QueueTile in Arena.tsx). Every size is a FRACTION
// of the tile's width, so a tile of any width is a proportional scale of the
// same design -- the fixed 112px profile card and a larger fluid waiting-room
// tile read as one object. The fractions are the profile card's original fixed
// sizes over its 112px reference width (avatar 56, name 14px, avatar-to-name gap
// 6px, horizontal padding 8px, verified badge 13px). Change a look here and both
// places follow.
export const BADGE_TILE = {
  ratio: 1.5, // tile height / tile width
  avatar: 0.5, // avatar diameter / tile width
  name: 14 / 112, // name font-size / tile width
  gap: 6 / 112, // avatar-to-name gap / tile width
  padX: 8 / 112, // horizontal padding / tile width
  verified: 13 / 112, // verified badge size / tile width
} as const
// Name line-height as a unitless ratio, matching Tailwind's text-sm (20px on
// 14px) so the fixed 112px card renders pixel-identical to before.
export const BADGE_NAME_LINE_HEIGHT = 20 / 14
// Avatar's top edge as a percentage of the tile HEIGHT (what CSS `top` resolves
// against), placing the avatar centred in the tile's upper half.
export const BADGE_AVATAR_TOP_PCT =
  ((BADGE_TILE.ratio / 4 - BADGE_TILE.avatar / 2) / BADGE_TILE.ratio) * 100
// White over a two-layer black shadow so the name holds up against whatever the
// badge artwork puts behind it, light or dark.
export const BADGE_NAME_SHADOW =
  "0 1px 2px rgb(0 0 0 / 0.95), 0 2px 8px rgb(0 0 0 / 0.8)"

// Portrait badge tile: the equipped badge is the tile's backdrop, with the
// avatar and name over its upper half. Width is fixed (no ResizeObserver); the
// waiting room passes a measured width to the same fractions instead.
interface Props {
  username: string
  avatarUrl?: string | null
  // Equipped badge id (lib/accessories). Null/unknown = plain tile fill.
  badgeId?: number | null
  verified?: number
  // Tile width in px; every other size derives from it.
  width?: number
}

export default function ProfileBadgeCard({
  username,
  avatarUrl,
  badgeId = null,
  verified = 0,
  width = 112,
}: Props) {
  const height = Math.round(width * BADGE_TILE.ratio)
  const avatarSize = Math.round(width * BADGE_TILE.avatar)
  const nameSize = Math.round(width * BADGE_TILE.name)
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
        className="absolute inset-x-0 flex flex-col items-center"
        style={{
          top: `${BADGE_AVATAR_TOP_PCT}%`,
          gap: width * BADGE_TILE.gap,
          paddingLeft: width * BADGE_TILE.padX,
          paddingRight: width * BADGE_TILE.padX,
        }}
      >
        <Avatar username={username} avatarUrl={avatarUrl} size={avatarSize} />
        <span
          className="flex items-center gap-1 font-bold max-w-full"
          style={{
            color: "#ffffff",
            fontSize: nameSize,
            lineHeight: BADGE_NAME_LINE_HEIGHT,
            textShadow: BADGE_NAME_SHADOW,
          }}
        >
          <span className="truncate">{username}</span>
          {verified > 0 && (
            <VerifiedBadge size={Math.round(width * BADGE_TILE.verified)} level={verified} />
          )}
        </span>
      </div>
    </div>
  )
}
