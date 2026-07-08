"use client"

import Image from "next/image"
import { safeImageSrc } from "@/lib/safeUrl"

// Shared raster-image element for post/profile imagery. URLs on the hosts
// configured in next.config.ts images.remotePatterns render through
// next/image (resized, re-encoded and srcset-ed by the optimizer); anything
// else falls back to a plain <img>, because the optimizer rejects
// unconfigured hosts at request time and official content may reference a
// new host before the config catches up. Layout stays with the caller's
// className either way; width/height inform the optimizer and give the
// browser a pre-load aspect ratio (less mid-article reflow while images
// trickle in).
const OPTIMIZED_HOSTS = [
  /(^|\.)supabase\.co$/,
  /^commons\.wikimedia\.org$/,
  /^upload\.wikimedia\.org$/,
  /^localhost$/,
]

function canOptimize(src: string): boolean {
  try {
    const url = new URL(src)
    if (url.protocol !== "https:" && url.protocol !== "http:") return false
    return OPTIMIZED_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    // Relative or malformed: leave it to the browser as-is.
    return false
  }
}

interface Props {
  src: string
  alt: string
  // Nominal dimensions for the optimizer and the pre-load aspect ratio; the
  // caller's className keeps controlling the rendered box.
  width: number
  height: number
  sizes?: string
  className?: string
  style?: React.CSSProperties
  draggable?: boolean
  onError?: React.ReactEventHandler<HTMLImageElement>
}

export default function AppImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  style,
  draggable,
  onError,
}: Props) {
  // Scheme allowlist (M123/SEC-024): a non-http(s) src never reaches the DOM.
  src = safeImageSrc(src)
  if (canOptimize(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        style={style}
        draggable={draggable}
        onError={onError}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
      style={style}
      draggable={draggable}
      onError={onError}
    />
  )
}
