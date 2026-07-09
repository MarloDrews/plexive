import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { sizedImageUrl } from "@/lib/imageUrl"

interface PortraitContent {
  image_url: string
  image_caption?: string
  image_attribution?: string
}

interface Props {
  content: PortraitContent
}

export default function PortraitSection({ content }: Props) {
  return (
    <div className="flex flex-col">
      {/* Plain img on purpose: unknown intrinsic ratio, so a nominal
          next/image size painted a large dark placeholder before load. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sizedImageUrl(content.image_url, 860)}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full object-cover max-h-[420px]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
      />
      {/* Caption is optional; the credit line is required with every image and
          renders independently of it (IMAGE_STANDARD s3-s4). */}
      {(content.image_caption || content.image_attribution) && (
        <div className="px-5 pt-3 pb-2">
          {content.image_caption && (
            <p className="text-sm text-ink-dim leading-snug"><MathText text={content.image_caption} /></p>
          )}
          {content.image_attribution && (
            <p className="text-xs text-ink-muted mt-1">{unescapeDollar(content.image_attribution)}</p>
          )}
        </div>
      )}
    </div>
  )
}
