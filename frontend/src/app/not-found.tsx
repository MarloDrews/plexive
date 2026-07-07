import Link from "next/link"

// Rendered for unmatched routes and explicit notFound() calls. A calm dead-end
// with a way back into the app rather than the framework default.
export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="card px-8 py-10 flex flex-col items-center gap-4 text-center max-w-sm">
        <p className="label-caps text-ink-muted">Page not found</p>
        <h1 className="font-serif text-2xl">This page does not exist</h1>
        <p className="text-sm text-ink-muted">
          The link may be broken or the page may have moved.
        </p>
        <Link href="/" className="btn btn-primary px-5 py-2 mt-2">
          Go home
        </Link>
      </div>
    </main>
  )
}
