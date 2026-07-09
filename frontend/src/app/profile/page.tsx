"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
import { detailToMessage } from "@/lib/errorMessage"
import BottomNav from "@/components/BottomNav"
import VerifiedBadge from "@/components/VerifiedBadge"
import Avatar from "@/components/Avatar"
import FollowListSheet, { type ListUser } from "@/components/FollowListSheet"

// The knowledge score is one unified rating; the backend no longer sends a
// per-format breakdown.
interface EloData {
  global_rating: number | null
}

export default function ProfilePage() {
  const { user, loading, logout, updateUser, applyFreshToken } = useAuth()
  const router = useRouter()

  // Which settings panel is open: "username" | "password" | "delete" | null
  const [open, setOpen] = useState<"username" | "password" | "delete" | null>(null)

  // Change username form
  const [newUsername, setNewUsername] = useState("")
  const [usernameError, setUsernameError] = useState("")
  const [usernameLoading, setUsernameLoading] = useState(false)

  // Change password form
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Delete account form
  const [deletePw, setDeletePw] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Bio
  const [bio, setBio] = useState("")
  const [bioLoading, setBioLoading] = useState(false)
  const [bioError, setBioError] = useState("")

  // Privacy toggle
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [privacyError, setPrivacyError] = useState("")

  // Follow requests
  const [pendingRequests, setPendingRequests] = useState<{ username: string; is_verified: number; avatar_url?: string | null; created_at: string }[]>([])
  const [showRequests, setShowRequests] = useState(false)
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null)
  const [requestError, setRequestError] = useState("")

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError, setAvatarError] = useState("")

  // Knowledge score, and follower/following/post counts via SWR keyed on the
  // same URLs the public profile page uses, so navigating between the two shares
  // one cache instead of refetching (writes stay on apiFetch).
  const { data: eloData } = useSWR<EloData>(user ? `/api/users/${user.username}/elo` : null)
  const elo = eloData ?? null
  const { data: profileCounts, mutate: mutateCounts } = useSWR<{ follower_count: number; following_count: number; post_count: number }>(
    user ? `/api/users/${user.username}/profile` : null
  )
  const followerCount = profileCounts?.follower_count ?? null
  const followingCount = profileCounts?.following_count ?? null
  const postCount = profileCounts?.post_count ?? null

  // Followers / following bottom-sheet
  const [listOpen, setListOpen] = useState<"followers" | "following" | null>(null)
  const [listUsers, setListUsers] = useState<ListUser[] | null>(null)

  // Redirect unauthenticated visitors to login.
  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  // Sync bio state when user loads
  useEffect(() => {
    if (user) setBio(user.bio ?? "")
  }, [user])

  // Fetch pending follow requests for private accounts
  useEffect(() => {
    if (!user?.is_private) return
    apiFetch(`/api/users/${user.username}/follow-requests`)
      // Guard the shape: a non-ok error body is a JSON object, not an array, and
      // would throw on .map when the requests panel opens.
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPendingRequests(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [user])

  function openList(kind: "followers" | "following") {
    if (!user) return
    setListOpen(kind)
    setListUsers(null)
    apiFetch(`/api/users/${user.username}/${kind}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setListUsers)
      .catch(() => setListUsers([]))
  }

  if (loading || !user) return null

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setAvatarError("")
    setAvatarLoading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const r = await apiFetch("/api/auth/me/avatar", { method: "POST", body: form })
      const data = await r.json()
      if (!r.ok) throw new Error(detailToMessage(data.detail, "Failed to upload picture."))
      updateUser(data)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to upload picture.")
    } finally {
      setAvatarLoading(false)
    }
  }

  function togglePanel(panel: "username" | "password" | "delete") {
    setOpen((prev) => (prev === panel ? null : panel))
    setUsernameError("")
    setPasswordError("")
    setDeleteError("")
    setNewUsername("")
    setCurrentPw("")
    setNewPw("")
    setDeletePw("")
  }

  async function handleChangeUsername(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError("")
    setUsernameLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ username: newUsername }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(detailToMessage(data.detail, "Failed to update username."))
      updateUser(data)
      setOpen(null)
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : "Failed to update username.")
    } finally {
      setUsernameLoading(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError("")
    setPasswordLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(detailToMessage(data.detail, "Failed to change password."))
      // The server bumped the token version, revoking every other session; keep
      // this one signed in with the re-minted token it returned (M126).
      if (data.access_token) applyFreshToken(data.access_token)
      setOpen(null)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.")
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault()
    setDeleteError("")
    setDeleteLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "DELETE",
        body: JSON.stringify({ current_password: deletePw }),
      })
      if (!r.ok) {
        const data = await r.json()
        throw new Error(detailToMessage(data.detail, "Failed to delete account."))
      }
      logout()
      router.replace("/")
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.")
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleSaveBio() {
    setBioError("")
    setBioLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ bio }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(detailToMessage(data.detail, "Failed to save bio."))
      updateUser(data)
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Failed to save bio.")
    } finally {
      setBioLoading(false)
    }
  }

  async function handleTogglePrivacy() {
    if (!user) return
    setPrivacyError("")
    setPrivacyLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ is_private: !user.is_private }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(detailToMessage(data.detail, "Failed to update privacy."))
      updateUser(data)
    } catch (err) {
      // Without this catch the throw escaped the handler with no feedback.
      setPrivacyError(err instanceof Error ? err.message : "Failed to update privacy.")
    } finally {
      setPrivacyLoading(false)
    }
  }

  async function handleAcceptRequest(requesterUsername: string) {
    setRequestError("")
    setRequestActionLoading(requesterUsername)
    try {
      const r = await apiFetch(`/api/users/${requesterUsername}/follow/accept`, { method: "POST" })
      if (!r.ok) throw new Error("Failed to accept the request.")
      // Only drop the row when the accept succeeded, and refresh the follower
      // count so it reflects the new accepted follower.
      setPendingRequests((prev) => prev.filter((r) => r.username !== requesterUsername))
      mutateCounts()
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Failed to accept the request.")
    } finally {
      setRequestActionLoading(null)
    }
  }

  async function handleDeclineRequest(requesterUsername: string) {
    setRequestError("")
    setRequestActionLoading(requesterUsername)
    try {
      const r = await apiFetch(`/api/users/${requesterUsername}/follow/reject`, { method: "DELETE" })
      if (!r.ok) throw new Error("Failed to decline the request.")
      setPendingRequests((prev) => prev.filter((r) => r.username !== requesterUsername))
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Failed to decline the request.")
    } finally {
      setRequestActionLoading(null)
    }
  }

  const inputClass =
    "field text-sm py-3"
  const submitClass =
    "btn btn-primary w-full py-3"

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        <div className="h-full overflow-y-auto pb-24">

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="btn-icon absolute top-4 left-4 z-10"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Header — avatar + identity */}
        <div className="flex flex-col items-center pt-16 pb-6 px-6">
          <div className="relative mb-4">
            <Avatar username={user.username} avatarUrl={user.avatar_url} size={88} verified={user.is_verified} className={avatarLoading ? "opacity-50" : ""} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarLoading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white/[0.12] backdrop-blur-md border-2 border-surface-0 flex items-center justify-center text-ink-dim hover:text-ink cursor-pointer transition-colors"
              aria-label="Change profile picture"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          {avatarError && <p className="text-bad text-xs mb-2">{avatarError}</p>}
          <h1 className="flex items-center gap-1.5 font-serif text-ink text-2xl font-medium">
            @{user.username}
            {user.is_verified > 0 && <VerifiedBadge size={20} level={user.is_verified} />}
          </h1>

          {/* Followers / Following / Posts row */}
          <div className="flex gap-6 mt-3 mb-1">
            <div className="text-center">
              <p className="text-ink font-bold text-base font-mono">{postCount ?? "—"}</p>
              <p className="text-ink-muted text-xs">Posts</p>
            </div>
            <button className="text-center cursor-pointer" onClick={() => openList("followers")}>
              <p className="text-ink font-bold text-base font-mono">{followerCount ?? "—"}</p>
              <p className="text-ink-muted text-xs">Followers</p>
            </button>
            <button className="text-center cursor-pointer" onClick={() => openList("following")}>
              <p className="text-ink font-bold text-base font-mono">{followingCount ?? "—"}</p>
              <p className="text-ink-muted text-xs">Following</p>
            </button>
          </div>

          <p className="text-ink-muted text-sm mt-1">{user.email}</p>
          <Link href={`/profile/${user.username}`} className="btn btn-ghost text-sm mt-2 px-3 py-1.5">
            View public profile
          </Link>
        </div>

        {/* Knowledge score */}
        <div className="mx-6 mb-4 card px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-ink text-sm font-medium">Knowledge score</p>
              <p className="text-ink-muted text-xs mt-0.5">Answer quizzes to raise it</p>
            </div>
            <p className="text-lamp text-2xl font-bold font-mono">
              {elo?.global_rating ?? "—"}
            </p>
          </div>
        </div>

        {/* My content */}
        <div className="mx-6 mb-4 card overflow-hidden">
          <button
            onClick={() => router.push("/my-posts")}
            className="w-full px-5 py-4 flex items-center justify-between text-left border-b border-edge"
          >
            <span className="flex items-center gap-3 text-ink text-sm font-medium">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-ink-dim">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              My posts
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-ink-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/saved-posts")}
            className="w-full px-5 py-4 flex items-center justify-between text-left"
          >
            <span className="flex items-center gap-3 text-ink text-sm font-medium">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-ink-dim">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
              </svg>
              Saved posts
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-ink-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Bio */}
        <div className="mx-6 mb-4 card px-5 py-4">
          <label className="block label-caps mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Tell people about yourself..."
            className="field text-sm py-3 resize-none"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-ink-faint text-xs font-mono">{bio.length}/160</span>
            <button
              onClick={handleSaveBio}
              disabled={bioLoading}
              className="btn btn-quiet text-lamp text-xs px-2 py-1"
            >
              {bioLoading ? "Saving..." : "Save bio"}
            </button>
          </div>
          {bioError && <p className="text-bad text-xs mt-1">{bioError}</p>}
        </div>

        {/* Follow Requests (private accounts only) */}
        {user.is_private && (
          <div className="mx-6 mb-4 card overflow-hidden">
            <button
              onClick={() => setShowRequests((v) => !v)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-ink text-sm font-medium flex items-center gap-2">
                Follow Requests
                {pendingRequests.length > 0 && (
                  <span className="bg-lamp text-surface-0 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                )}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-ink-muted transition-transform ${showRequests ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {showRequests && (
              <div className="px-5 pb-5 flex flex-col gap-3">
                {requestError && <p className="text-bad text-xs">{requestError}</p>}
                {pendingRequests.length === 0 ? (
                  <p className="text-ink-muted text-sm">No pending requests.</p>
                ) : (
                  pendingRequests.map((req) => (
                    <div key={req.username} className="flex items-center justify-between gap-3">
                      <Link href={`/profile/${req.username}`} className="flex items-center gap-2 min-w-0">
                        <Avatar username={req.username} avatarUrl={req.avatar_url} size={32} verified={req.is_verified} />
                        <span className="text-ink text-sm font-medium truncate">@{req.username}</span>
                        {req.is_verified > 0 && <VerifiedBadge size={14} level={req.is_verified} />}
                      </Link>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(req.username)}
                          disabled={requestActionLoading === req.username}
                          className="btn btn-primary px-3 py-1 text-xs"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.username)}
                          disabled={requestActionLoading === req.username}
                          className="btn btn-ghost px-3 py-1 text-xs"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings card */}
        <div className="mx-6 mb-8 card overflow-hidden">

          {/* Private Account toggle */}
          <div className="border-b border-edge">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-ink text-sm font-medium">Private account</p>
                <p className="text-ink-muted text-xs mt-0.5">New followers must be approved</p>
              </div>
              <button
                onClick={handleTogglePrivacy}
                disabled={privacyLoading}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
                  user.is_private ? "bg-lamp" : "bg-white/[0.10]"
                }`}
                aria-label="Toggle private account"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-ink rounded-full transition-transform duration-200 ${
                  user.is_private ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>
            {privacyError && <p className="text-bad text-xs px-5 pb-3 -mt-1">{privacyError}</p>}
          </div>

          {/* Change username */}
          <div className="border-b border-edge">
            <button
              onClick={() => togglePanel("username")}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-ink text-sm font-medium">Change username</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-ink-muted transition-transform ${open === "username" ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {open === "username" && (
              <form onSubmit={handleChangeUsername} className="px-5 pb-5 flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="New username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="off"
                  required
                  className={inputClass}
                />
                {usernameError && <p className="text-bad text-sm">{usernameError}</p>}
                <button type="submit" disabled={usernameLoading} className={submitClass}>
                  {usernameLoading ? "Saving..." : "Save username"}
                </button>
              </form>
            )}
          </div>

          {/* Change password */}
          <div className="border-b border-edge">
            <button
              onClick={() => togglePanel("password")}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-ink text-sm font-medium">Change password</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-ink-muted transition-transform ${open === "password" ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {open === "password" && (
              <form onSubmit={handleChangePassword} className="px-5 pb-5 flex flex-col gap-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
                {passwordError && <p className="text-bad text-sm">{passwordError}</p>}
                <button type="submit" disabled={passwordLoading} className={submitClass}>
                  {passwordLoading ? "Saving..." : "Save password"}
                </button>
              </form>
            )}
          </div>

          {/* Sign out */}
          <div className="border-b border-edge">
            <button
              onClick={() => { logout(); router.replace("/") }}
              className="btn btn-destructive w-full py-4 text-left text-sm"
            >
              Sign out
            </button>
          </div>

          {/* Delete account */}
          <div>
            <button
              onClick={() => togglePanel("delete")}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-bad text-sm">Delete account</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-ink-muted transition-transform ${open === "delete" ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {open === "delete" && (
              <form onSubmit={handleDeleteAccount} className="px-5 pb-5 flex flex-col gap-3">
                <p className="text-ink-dim text-sm">This will permanently delete your account and all your data.</p>
                <input
                  type="password"
                  placeholder="Enter password to confirm"
                  value={deletePw}
                  onChange={(e) => setDeletePw(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
                {deleteError && <p className="text-bad text-sm">{deleteError}</p>}
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="btn btn-destructive w-full py-3"
                >
                  {deleteLoading ? "Deleting..." : "Confirm delete"}
                </button>
              </form>
            )}
          </div>

        </div>
        </div>

        <FollowListSheet
          open={listOpen}
          onClose={() => setListOpen(null)}
          users={listUsers}
          emptyMessage="Nothing here yet."
        />

        <BottomNav activeTab="profile" />
      </div>
    </div>
  )
}
