import Link from "next/link"
import Avatar from "@/components/Avatar"
import Spinner from "@/components/Spinner"
import VerifiedBadge from "@/components/VerifiedBadge"

export interface ListUser {
  username: string
  is_verified: number
  is_private: boolean
  avatar_url: string | null
}

// Followers / following bottom sheet, shared by the account and public profile
// pages (previously two near-identical copies). `open` doubles as the
// capitalized title; `users === null` is the loading state (spinner); each page
// supplies its own `emptyMessage`. Rows use next/link.
export default function FollowListSheet({
  open,
  onClose,
  users,
  emptyMessage,
}: {
  open: "followers" | "following" | null
  onClose: () => void
  users: ListUser[] | null
  emptyMessage: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-surface-0/70" />
      <div
        className="stage-sheet-in absolute inset-x-3 bottom-3 max-w-[406px] mx-auto max-h-[70dvh] rounded-3xl bg-surface-1/95 backdrop-blur-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-ink text-sm font-semibold capitalize">{open}</p>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          {users === null ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : users.length === 0 ? (
            <p className="text-ink-muted text-sm text-center py-8">{emptyMessage}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {users.map((u) => (
                <li key={u.username}>
                  <Link
                    href={`/profile/${u.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-white/[0.06] transition-colors duration-150"
                  >
                    <Avatar username={u.username} avatarUrl={u.avatar_url} size={40} verified={u.is_verified} />
                    <span className="flex items-center gap-1.5 text-ink text-sm font-medium">
                      @{u.username}
                      {u.is_verified > 0 && <VerifiedBadge size={14} level={u.is_verified} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
