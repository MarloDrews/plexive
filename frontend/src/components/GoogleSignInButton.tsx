"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { GOOGLE_CLIENT_ID } from "@/lib/storage"

// Google Identity Services (GIS) is loaded from Google's CDN at runtime and is
// not typed as an npm package, so declare just the slice of window.google we
// call. `any` keeps this minimal without pulling in a types dependency.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client"

type GisButtonText = "signin_with" | "signup_with" | "continue_with"

interface GoogleSignInButtonProps {
  onError?: (message: string) => void
  // Custom handler for the Google ID token. When omitted, the default is to sign
  // in (auth.googleLogin) and navigate home -- used on the login/register pages.
  // The profile page passes auth.linkGoogle here to connect Google to the
  // current account instead of switching accounts.
  onCredential?: (credential: string) => Promise<void>
  // Called after onCredential succeeds (e.g. to show a "connected" toast). The
  // default login flow navigates home instead and ignores this.
  onSuccess?: () => void
  // Whether to show the "or" divider above the button (login/register pages).
  showDivider?: boolean
  // Google's own button label.
  text?: GisButtonText
}

// Renders Google's official "Sign in with Google" button. By default it exchanges
// the Google ID token for our own session and navigates home; pass onCredential
// to handle the token differently (e.g. link Google to the logged-in account).
// Renders nothing when GOOGLE_CLIENT_ID is unset, so email/password is unaffected.
export default function GoogleSignInButton({
  onError,
  onCredential,
  onSuccess,
  showDivider = true,
  text = "continue_with",
}: GoogleSignInButtonProps) {
  const { googleLogin } = useAuth()
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks without listing them in the effect deps: parents
  // pass fresh functions each render (e.g. setError), and we do not want that to
  // tear down and re-create the Google button on every keystroke.
  const onErrorRef = useRef(onError)
  const onCredentialRef = useRef(onCredential)
  const onSuccessRef = useRef(onSuccess)
  onErrorRef.current = onError
  onCredentialRef.current = onCredential
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false

    // GIS hands back the signed ID token as response.credential.
    async function handleCredential(response: { credential: string }) {
      try {
        if (onCredentialRef.current) {
          await onCredentialRef.current(response.credential)
          onSuccessRef.current?.()
        } else {
          await googleLogin(response.credential)
          router.replace("/")
        }
      } catch (err) {
        onErrorRef.current?.(err instanceof Error ? err.message : "Google sign-in failed.")
      }
    }

    function render() {
      if (cancelled || !window.google || !containerRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      })
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        text,
        shape: "pill",
        width: 320,
      })
    }

    // Load the GIS script once (reused across pages), then render the button. If
    // the script is already present or loaded, render now.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (window.google) {
      render()
    } else if (existing) {
      existing.addEventListener("load", render, { once: true })
    } else {
      const script = document.createElement("script")
      script.src = GIS_SRC
      script.async = true
      script.defer = true
      script.addEventListener("load", render, { once: true })
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
    }
  }, [googleLogin, router, text])

  // No client id configured: hide the whole block so nothing broken is shown.
  if (!GOOGLE_CLIENT_ID) return null

  return (
    <div className="flex flex-col items-center gap-4 mt-5">
      {showDivider && (
        // "or" divider between the email/password form and the Google button.
        <div className="flex items-center gap-3 w-full">
          <span className="h-px flex-1 bg-edge" />
          <span className="text-ink-muted text-xs uppercase tracking-wide">or</span>
          <span className="h-px flex-1 bg-edge" />
        </div>
      )}
      {/* GIS renders its own button into this container. */}
      <div ref={containerRef} />
    </div>
  )
}
