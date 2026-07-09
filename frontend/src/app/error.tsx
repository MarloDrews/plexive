"use client"

// Route-segment error boundary. The App Router mounts this in place of the
// crashed page (and its children), so an uncaught render/commit throw degrades
// to a recoverable card instead of white-screening the whole app. reset()
// re-renders the segment; the home link is the escape hatch when it re-throws.
import Link from "next/link"

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="card px-8 py-10 flex flex-col items-center gap-4 text-center max-w-sm">
        <p className="label-caps text-ink-muted">Something went wrong</p>
        <h1 className="font-serif text-2xl">This screen ran into a problem</h1>
        <p className="text-sm text-ink-muted">
          The rest of the app is fine. You can try again or head back to your feed.
        </p>
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={reset} className="btn btn-primary px-5 py-2">
            Try again
          </button>
          <Link href="/" className="btn px-5 py-2">
            Go home
          </Link>
        </div>
      </div>
    </main>
  )
}
