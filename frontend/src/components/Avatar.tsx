"use client"

import { useEffect, useState } from "react"
import AppImage from "./AppImage"
import { API_URL } from "@/lib/storage"
import { FRAME_SCALE, frameSrc } from "@/lib/accessories"

const RING_COLOR: Record<number, string> = {
  1: "var(--color-fmt-concepts)",
  2: "var(--color-good)",
  3: "#b91c1c",
}

function ringColor(level: number): string {
  return RING_COLOR[level] ?? RING_COLOR[3]
}

interface Props {
  username: string
  avatarUrl?: string | null
  // diameter in px
  size: number
  verified?: number
  // Cosmetic overlay circle (lib/accessories). Null/unknown = no frame.
  frameId?: number | null
  className?: string
}

// Supabase Storage URLs are already absolute; legacy /uploads/ paths get the
// API base URL prepended for backwards compatibility with existing records.
function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url
}

export default function Avatar({
  username,
  avatarUrl,
  size,
  verified = 0,
  frameId = null,
  className = "",
}: Props) {
  const frame = frameSrc(frameId)

  // An equipped frame REPLACES the verified ring: the two are both a circle on
  // the picture's edge, and drawing them together reads as a rendering fault.
  const ringStyle = !frame && verified > 0
    ? { boxShadow: `0 0 0 2px var(--color-surface-0), 0 0 0 4px ${ringColor(verified)}` }
    : {}

  // A dead avatar URL falls back to the serif initial instead of showing the
  // browser's broken-image glyph; reset when the URL changes (new upload).
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [avatarUrl])

  // Unframed, the picture is the whole component and takes the caller's
  // className, as it always has. Framed, the wrapper below takes it instead so
  // callers keep positioning one box.
  const pictureClass = frame ? "" : className

  const picture = avatarUrl && !failed ? (
    <AppImage
      src={resolveUrl(avatarUrl)}
      alt={`@${username}`}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={`rounded-full object-cover shrink-0 ${pictureClass}`}
      style={{ width: size, height: size, ...ringStyle }}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`rounded-full bg-surface-3 border border-edge flex items-center justify-center shrink-0 ${pictureClass}`}
      style={{ width: size, height: size, ...ringStyle }}
    >
      {/* Serif initial, like a drop cap (Lamplight identity). */}
      <span
        className="text-ink-dim font-serif font-semibold uppercase"
        style={{ fontSize: Math.max(12, Math.round(size * 0.44)) }}
      >
        {username.charAt(0)}
      </span>
    </div>
  )

  if (!frame) return picture

  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {picture}
      {/* Decorative, so no alt text: the frame says nothing about who this is.
          max-w-none defeats the preflight img rule, which would otherwise clamp
          the frame to the wrapper's width and undo the overhang. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frame}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute pointer-events-none max-w-none"
        style={{
          width: size * FRAME_SCALE,
          height: size * FRAME_SCALE,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
    </span>
  )
}
