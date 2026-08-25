import type { SVGProps } from "react"

// Stage glyph set — simple, solid-friendly icon forms shared by the feed action
// bar, the detail bar and the comments sheet. Heart, bookmark and the comment
// bubble are outline by default and become solid via the filled prop (the feed
// action bar renders them solid; CommentBar and the saved-posts empty state use
// the outline). The share plane (SendIcon) is always solid. Callers size with
// className and may pass any svg prop (e.g. onAnimationEnd for the heart-pop
// animation).
//
// The nav dock keeps its own NAV_ICONS in BottomNav.tsx (canonical chrome).
//
// Every glyph is aria-hidden by default (A11Y-023): each one sits inside a
// button that already carries its own accessible name, so announcing the icon
// as well would repeat it. The attribute precedes the props spread, so a caller
// that ever needs a standalone named icon can override it.

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean }

export function HeartIcon({ filled = false, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 20.5C12 20.5 3 15.2 3 8.75 3 5.85 5.35 3.75 8 3.75c1.7 0 3.2.9 4 2.35.8-1.45 2.3-2.35 4-2.35 2.65 0 5 2.1 5 5C21 15.2 12 20.5 12 20.5Z" />
    </svg>
  )
}

export function CommentIcon({ filled = false, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3.5V16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

export function BookmarkIcon({ filled = false, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

// Comment submit — an upward arrow (inside the circular submit button it
// reads as "arrow up in circle"), deliberately distinct from the SendIcon
// paper plane used for sharing.
export function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  )
}

// Share paper plane. Solid by default (a single filled triangle) to match the
// filled action-bar glyphs; deliberately distinct from the ArrowUpIcon used
// for comment submit.
export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 11 21 3l-8 18-2.5-7.5L3 11Z" />
    </svg>
  )
}

// Read-aloud transport controls on the post detail page.
export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 5.25v13.5M15 5.25v13.5" />
    </svg>
  )
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" {...props}>
      <rect x="6.75" y="6.75" width="10.5" height="10.5" rx="2" />
    </svg>
  )
}

export function SpeakerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  )
}
