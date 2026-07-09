"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth, hasToken } from "@/lib/auth"

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Redirect already-authenticated users away from this form immediately.
  useEffect(() => {
    if (!loading && user) router.replace("/")
  }, [user, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      await login(email, password)
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.")
    } finally {
      setSubmitting(false)
    }
  }

  // Once logged in we redirect, so render nothing. During session restore blank
  // only when a token exists (probably logged in) to avoid a form flash; a
  // visitor with no token sees the sign-in form immediately, not a blank frame.
  if (user) return null
  if (loading && hasToken()) return null

  // Stage composition: heading floats in the dark above the slab, the
  // frosted slab holds only the form, the cross-link floats below it.
  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative flex flex-col justify-center px-6">

        {/* Back — for someone who tapped into sign-in but wants to return */}
        <button
          onClick={() => router.back()}
          className="btn-icon absolute top-4 left-4"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="px-2 mb-5">
          <p className="label-caps text-lamp">Deepscroll</p>
          <h1 className="font-serif text-ink text-3xl font-medium leading-tight mt-3">Sign in</h1>
          <p className="text-ink-dim text-sm mt-1.5">Welcome back</p>
        </div>

        <div className="card px-6 py-7">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              aria-label="Email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              className="field rounded-full text-sm px-5 py-3.5"
            />
            <input
              type="password"
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
              className="field rounded-full text-sm px-5 py-3.5"
            />
            {error && <p role="alert" className="text-bad text-sm px-2">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full py-3 mt-1"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-ink-muted text-sm text-center mt-6">
          Don&apos;t have an account?{" "}
          {/* Underlined: inside a text block, color alone is not enough to mark
              a link (A11Y-030, link-in-text-block). Matches the sign-in link in
              CommentsBottomSheet. */}
          <Link href="/register" className="text-lamp hover:text-ink underline transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
