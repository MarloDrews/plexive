// Shared in-post image, per IMAGE_STANDARD.md: rounded corners (16-24), full
// content width, never distorted, caption then a smaller muted credit line
// below. A failed load hides the figure rather than leaving a broken image.

import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { sizedImageUrl } from "@/lib/imageUrl"

interface Props {
  url: string
  caption?: string
  attribution?: string
  // Wrapper classes; callers pass their max-width / centering.
  className?: string
}

export default function ContentImage({ url, caption, attribution, className = "w-full max-w-[360px] mx-auto" }: Props) {
  return (
    <figure className={`${className} flex flex-col gap-1.5`}>
      {/* Plain img on purpose: the intrinsic ratio is unknown (not in the post
          JSON), so a next/image nominal width/height painted a large dark
          placeholder box before every load. Body figures grow in like before;
          only fixed-slot images (avatars, bands, portraits) use AppImage. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sizedImageUrl(url, 720)}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full rounded-2xl object-cover"
        onError={(e) => {
          const fig = (e.currentTarget as HTMLImageElement).closest("figure")
          if (fig) (fig as HTMLElement).style.display = "none"
        }}
      />
      {caption && (
        <figcaption className="text-xs text-ink-muted leading-snug"><MathText text={caption} /></figcaption>
      )}
      {attribution && (
        <p className="text-[10px] text-ink-muted leading-snug">{unescapeDollar(attribution)}</p>
      )}
    </figure>
  )
}
