// Shared in-post image, per IMAGE_STANDARD.md: rounded corners (16-24), full
// content width, never distorted, caption then a smaller muted credit line
// below. A failed load hides the figure rather than leaving a broken image.

import AppImage from "../AppImage"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

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
      <AppImage
        src={url}
        alt=""
        width={860}
        height={645}
        sizes="(max-width: 430px) 100vw, 430px"
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
        <p className="text-[10px] text-ink-faint leading-snug">{unescapeDollar(attribution)}</p>
      )}
    </figure>
  )
}
