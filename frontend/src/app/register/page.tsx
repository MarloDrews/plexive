"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/app/lib/auth"

export default function RegisterPage() {
  const { user, loading, register } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
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
      await register(email, username, password)
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.")
    } finally {
      setSubmitting(false)
    }
  }

  // Render nothing while loading or redirecting to avoid a flash.
  if (loading || user) return null

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] flex flex-col items-center justify-center px-6">
        <div className="w-full bg-surface-1 rounded-card px-6 py-8">
          <h1 className="text-white text-xl font-semibold mb-1">Create account</h1>
          <p className="text-zinc-500 text-sm mb-6">Join Deepscroll</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              className="w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
              className="w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-xl text-sm mt-1 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="text-zinc-500 text-sm text-center mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-zinc-300 hover:text-white transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
