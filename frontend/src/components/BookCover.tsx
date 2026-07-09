"use client"

// The one entry point for a book's cover, used everywhere a book renders (the
// feed card, the detail header, the my-posts list) so a given book always shows
// the same cover. It resolves the cover in this order (see @/lib/bookCover):
//   1. a real cover, only on a complete, verified, freely licensed rights record;
//   2. otherwise the baked generated cover SVG (cover.svg), a bespoke SVG that
//      reproduces the real cover's arrangement in a similar loaded typeface on the
//      sampled background color (the normal case);
//   3. otherwise the live GeneratedBookCover fallback (for books with no baked svg).
// See IMAGE_STANDARD.md and LAYOUT_STANDARD.md.

import { useEffect, useState } from "react"
import { resolveBookCover, generatedCoverStyle, bakedCoverSvg } from "@/lib/bookCover"
import { toBase64Utf8 } from "@/lib/svg"
import { sizedImageUrl } from "@/lib/imageUrl"
import { fcStr } from "@/types/post"
import GeneratedBookCover from "./GeneratedBookCover"

interface Props {
  feedCard: Record<string, unknown> | undefined
  // Sizing / rounding for the cover box, supplied by the caller.
  className?: string
  // Show the credit line beneath, per IMAGE_STANDARD.md s3, where the cover is at
  // readable size (the detail header). Off for small thumbnails.
  showCredit?: boolean
  // The post's content origin, for the SVG security split on the baked cover.
  // Required (SEC-026): an omitted flag must never silently default a user
  // submission to the dangerouslySetInnerHTML path.
  isUserContent: boolean
}

// Render the baked cover SVG with the SVG security split, and without the legacy
// accent re-palette SvgBlock applies (a cover carries its own sampled colors).
// User content renders as a base64 <img> (no script execution); seed/official
// content may use dangerouslySetInnerHTML.
function BakedCover({
  svg,
  className,
  isUserContent,
}: {
  svg: string
  className?: string
  isUserContent: boolean
}) {
  if (isUserContent) {
    return (
      <div className={className}>
        <img
          src={`data:image/svg+xml;base64,${toBase64Utf8(svg)}`}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>
    )
  }
  return (
    <div
      className={`${className ?? ""} [&_svg]:w-full [&_svg]:h-full [&_svg]:block`}
      // Decision 12: the title and author render as text beside every cover.
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default function BookCover({
  feedCard,
  className,
  showCredit = false,
  isUserContent,
}: Props) {
  // If a real cover image fails to load, fall back to the generated cover so the
  // book is never blank. The credit is dropped in that case too, so a credit line
  // never sits under a generated cover.
  const [imgFailed, setImgFailed] = useState(false)

  const decision = resolveBookCover(feedCard)
  // Reset the failure flag when the resolved cover changes, so a component
  // instance reused for a different book (e.g. a recycled feed card) does not
  // stay stuck on the generated fallback from the previous cover's load error.
  const resolvedUrl = decision.kind === "real" ? decision.url : null
  useEffect(() => {
    setImgFailed(false)
  }, [resolvedUrl])

  const title = fcStr(feedCard, "title")
  const author = fcStr(feedCard, "author")
  const baked = bakedCoverSvg(feedCard)
  const style = generatedCoverStyle(feedCard)
  const showReal = decision.kind === "real" && !imgFailed

  let cover
  if (showReal) {
    cover = (
      <div className={className}>
        <img
          src={sizedImageUrl(decision.url, 400)}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  } else if (baked) {
    cover = <BakedCover svg={baked} className={className} isUserContent={isUserContent} />
  } else {
    cover = (
      <div className={className}>
        <GeneratedBookCover
          title={title}
          author={author}
          className="w-full h-full"
          background={style.background}
          ink={style.ink}
          titleFont={style.titleFont}
        />
      </div>
    )
  }

  if (showCredit && showReal) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        {cover}
        <p className="text-[10px] text-ink-faint leading-snug text-center max-w-[240px]">
          {decision.attribution}
        </p>
      </div>
    )
  }

  return cover
}
