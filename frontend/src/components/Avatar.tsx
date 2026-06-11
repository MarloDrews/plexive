const API_URL = process.env.NEXT_PUBLIC_API_URL

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
  className?: string
}

// Supabase Storage URLs are already absolute; legacy /uploads/ paths get the
// API base URL prepended for backwards compatibility with existing records.
function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url
}

export default function Avatar({ username, avatarUrl, size, verified = 0, className = "" }: Props) {
  const ringStyle = verified > 0
    ? { boxShadow: `0 0 0 2px var(--color-surface-0), 0 0 0 4px ${ringColor(verified)}` }
    : {}

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveUrl(avatarUrl)}
        alt={`@${username}`}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size, ...ringStyle }}
      />
    )
  }
  return (
    <div
      className={`rounded-full bg-surface-3 border border-edge flex items-center justify-center shrink-0 ${className}`}
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
}
