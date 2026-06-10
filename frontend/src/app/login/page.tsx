"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/app/lib/auth"

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

  // Render nothing while loading or redirecting to avoid a flash.
  if (loading || user) return null

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] flex flex-col items-center justify-center px-6">
        <div className="w-full bg-surface-1 rounded-card px-6 py-8">
          <h1 className="text-white text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-zinc-500 text-sm mb-6">Welcome back to Deepscroll</p>

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
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
              className="w-full bg-surface-2 border border-edge-strong rounded-field text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-xl text-sm mt-1 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-zinc-500 text-sm text-center mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-zinc-300 hover:text-white transition-colors">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
