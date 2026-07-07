// Shared relative-time formatting for timestamps coming from the API
// (naive UTC datetimes without a trailing Z).
export function relativeTime(iso: string | null | undefined): string {
  // created_at can be null (e.g. the chat serializer), so guard before .endsWith.
  if (!iso) return ""
  // Append Z only when there is no timezone designator: a value already carrying
  // Z or a +/-hh:mm offset must be left alone, else it becomes an invalid date.
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const date = new Date(hasTz ? iso : iso + "Z")
  // Never render the literal "Invalid Date"; fall back to empty.
  if (Number.isNaN(date.getTime())) return ""
  const diff = Date.now() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
