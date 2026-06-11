const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Props {
  username: string
  avatarUrl?: string | null
  // diameter in px
  size: number
  className?: string
}

// Supabase Storage URLs are already absolute; legacy /uploads/ paths get the
// API base URL prepended for backwards compatibility with existing records.
function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url
}

export default function Avatar({ username, avatarUrl, size, className = "" }: Props) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveUrl(avatarUrl)}
        alt={`@${username}`}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={`rounded-full bg-surface-3 border border-edge flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
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
