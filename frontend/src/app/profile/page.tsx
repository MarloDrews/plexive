"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import BottomNav from "@/app/components/BottomNav"
import VerifiedBadge from "@/components/VerifiedBadge"

export default function ProfilePage() {
  const { user, loading, logout, updateUser } = useAuth()
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

  // Follow requests
  const [pendingRequests, setPendingRequests] = useState<{ username: string; is_verified: boolean; created_at: string }[]>([])
  const [showRequests, setShowRequests] = useState(false)
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null)

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
      .then((r) => r.json())
      .then(setPendingRequests)
      .catch(() => {})
  }, [user])

  if (loading || !user) return null

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
      if (!r.ok) throw new Error(data.detail ?? "Failed to update username.")
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
      if (!r.ok) throw new Error(data.detail ?? "Failed to change password.")
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
        throw new Error(data.detail ?? "Failed to delete account.")
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
      if (!r.ok) throw new Error(data.detail ?? "Failed to save bio.")
      updateUser(data)
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Failed to save bio.")
    } finally {
      setBioLoading(false)
    }
  }

  async function handleTogglePrivacy() {
    if (!user) return
    setPrivacyLoading(true)
    try {
      const r = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ is_private: !user.is_private }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail ?? "Failed to update privacy.")
      updateUser(data)
    } finally {
      setPrivacyLoading(false)
    }
  }

  async function handleAcceptRequest(requesterUsername: string) {
    setRequestActionLoading(requesterUsername)
    try {
      await apiFetch(`/api/users/${requesterUsername}/follow/accept`, { method: "POST" })
      setPendingRequests((prev) => prev.filter((r) => r.username !== requesterUsername))
    } finally {
      setRequestActionLoading(null)
    }
  }

  async function handleDeclineRequest(requesterUsername: string) {
    setRequestActionLoading(requesterUsername)
    try {
      await apiFetch(`/api/users/${requesterUsername}/follow/reject`, { method: "DELETE" })
      setPendingRequests((prev) => prev.filter((r) => r.username !== requesterUsername))
    } finally {
      setRequestActionLoading(null)
    }
  }

  // Derive initials from username for the avatar.
  const initial = user.username.charAt(0).toUpperCase()

  const inputClass =
    "w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
  const submitClass =
    "w-full bg-white text-zinc-950 font-semibold py-3 rounded-xl text-sm disabled:opacity-50 transition-opacity"

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        <div className="h-full overflow-y-auto pb-14 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-10 w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Header — avatar + identity */}
        <div className="flex flex-col items-center pt-16 pb-8 px-6">
          <div className="w-20 h-20 rounded-full bg-violet-900/60 flex items-center justify-center mb-4">
            <span className="text-violet-300 text-2xl font-bold">{initial}</span>
          </div>
          <p className="flex items-center gap-1.5 text-white text-xl font-semibold">
            @{user.username}
            {user.is_verified && <VerifiedBadge size={20} />}
          </p>
          <p className="text-zinc-500 text-sm mt-1">{user.email}</p>
          <button onClick={() => router.push("/my-posts")} className="text-zinc-400 text-sm mt-2">
            My posts →
          </button>
          <button onClick={() => router.push("/saved-posts")} className="text-zinc-400 text-sm mt-1">
            Saved posts →
          </button>
        </div>

        {/* Bio */}
        <div className="mx-6 mb-4">
          <label className="block text-zinc-400 text-xs mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Tell people about yourself..."
            className="w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-zinc-600 text-xs">{bio.length}/160</span>
            <button
              onClick={handleSaveBio}
              disabled={bioLoading}
              className="text-xs text-zinc-400 disabled:opacity-50"
            >
              {bioLoading ? "Saving..." : "Save bio"}
            </button>
          </div>
          {bioError && <p className="text-red-400 text-xs mt-1">{bioError}</p>}
        </div>

        {/* Follow Requests (private accounts only) */}
        {user.is_private && (
          <div className="mx-6 mb-4 bg-surface-1 rounded-card overflow-hidden">
            <button
              onClick={() => setShowRequests((v) => !v)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-white text-sm flex items-center gap-2">
                Follow Requests
                {pendingRequests.length > 0 && (
                  <span className="bg-sky-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                )}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-zinc-500 transition-transform ${showRequests ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {showRequests && (
              <div className="px-5 pb-5 flex flex-col gap-3">
                {pendingRequests.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No pending requests.</p>
                ) : (
                  pendingRequests.map((req) => (
                    <div key={req.username} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white text-sm font-medium">@{req.username}</span>
                        {req.is_verified && <VerifiedBadge size={14} />}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(req.username)}
                          disabled={requestActionLoading === req.username}
                          className="bg-white text-zinc-950 rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.username)}
                          disabled={requestActionLoading === req.username}
                          className="border border-zinc-600 text-zinc-400 rounded-lg px-3 py-1 text-xs disabled:opacity-50"
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
        <div className="mx-6 mb-8 bg-surface-1 rounded-card overflow-hidden">

          {/* Private Account toggle */}
          <div className="border-b border-edge">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white text-sm">Private account</p>
                <p className="text-zinc-500 text-xs mt-0.5">New followers must be approved</p>
              </div>
              <button
                onClick={handleTogglePrivacy}
                disabled={privacyLoading}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
                  user.is_private ? "bg-sky-500" : "bg-zinc-700"
                }`}
                aria-label="Toggle private account"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  user.is_private ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>
          </div>

          {/* Change username */}
          <div className="border-b border-edge">
            <button
              onClick={() => togglePanel("username")}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="text-white text-sm">Change username</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-zinc-500 transition-transform ${open === "username" ? "rotate-90" : ""}`}>
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
                {usernameError && <p className="text-red-400 text-sm">{usernameError}</p>}
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
              <span className="text-white text-sm">Change password</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-zinc-500 transition-transform ${open === "password" ? "rotate-90" : ""}`}>
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
                {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
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
              className="w-full px-5 py-4 text-left text-red-400 text-sm"
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
              <span className="text-red-400 text-sm">Delete account</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`w-4 h-4 text-zinc-500 transition-transform ${open === "delete" ? "rotate-90" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {open === "delete" && (
              <form onSubmit={handleDeleteAccount} className="px-5 pb-5 flex flex-col gap-3">
                <p className="text-zinc-400 text-sm">This will permanently delete your account and all your data.</p>
                <input
                  type="password"
                  placeholder="Enter password to confirm"
                  value={deletePw}
                  onChange={(e) => setDeletePw(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
                {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="w-full bg-red-500 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 transition-opacity"
                >
                  {deleteLoading ? "Deleting..." : "Confirm delete"}
                </button>
              </form>
            )}
          </div>

        </div>
        </div>
        <BottomNav activeTab="profile" />
      </div>
    </div>
  )
}
