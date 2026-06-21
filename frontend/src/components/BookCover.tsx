"use client"

// The one entry point for a book's cover, used everywhere a book renders (the
// feed card, the detail header, the my-posts list) so a given book always shows
// the same cover. It resolves the two tiers through the shared resolver
// (@/lib/bookCover): a real cover only on a complete, verified, freely licensed
// rights record, otherwise the generated Stage cover. See IMAGE_STANDARD.md and
// LAYOUT_STANDARD.md.

import { useState } from "react"
import { resolveBookCover, generatedCoverStyle } from "@/lib/bookCover"
import { fcStr } from "@/types/post"
import GeneratedBookCover from "./GeneratedBookCover"

interface Props {
  feedCard: Record<string, unknown> | undefined
  // Sizing / rounding for the cover box, supplied by the caller.
  className?: string
  // Show the credit line beneath, per IMAGE_STANDARD.md s3, where the cover is at
  // readable size (the detail header). Off for small thumbnails.
  showCredit?: boolean
}

export default function BookCover({ feedCard, className, showCredit = false }: Props) {
  // If a real cover image fails to load, fall back to the generated cover so the
  // book is never blank. The credit is dropped in that case too, so a credit line
  // never sits under a generated cover.
  const [imgFailed, setImgFailed] = useState(false)

  const decision = resolveBookCover(feedCard)
  const title = fcStr(feedCard, "title")
  const author = fcStr(feedCard, "author")
  const style = generatedCoverStyle(feedCard)
  const showReal = decision.kind === "real" && !imgFailed

  const box = (
    <div className={className}>
      {showReal ? (
        <img
          src={decision.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <GeneratedBookCover
          title={title}
          author={author}
          className="w-full h-full"
          background={style.background}
          ink={style.ink}
          titleFont={style.titleFont}
        />
      )}
    </div>
  )

  if (showCredit && showReal) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        {box}
        <p className="text-[10px] text-ink-faint leading-snug text-center max-w-[240px]">
          {decision.attribution}
        </p>
      </div>
    )
  }

  return box
}
