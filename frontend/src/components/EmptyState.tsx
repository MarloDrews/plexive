import { FORMAT_STYLES, type FormatId } from "@/lib/formats"

interface Props {
  format: string
  accentColor: string
}

function BookIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function FlaskIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7l-4 9h14L15 10V3" />
    </svg>
  )
}

function PersonIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function LightbulbIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21h6M12 3a6 6 0 0 1 6 6c0 2.2-1.2 4.2-3 5.4V17H9v-2.6C7.2 13.2 6 11.2 6 9a6 6 0 0 1 6-6z" />
    </svg>
  )
}

function QuestionIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r=".5" fill={color} />
    </svg>
  )
}

function ScrollIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  )
}

function MortarboardIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10.5L12 6 2 10.5l10 4.5 10-4.5z" />
      <path d="M6 12.5v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      <line x1="22" y1="10.5" x2="22" y2="15.5" />
    </svg>
  )
}

function FormatIcon({ format, color }: { format: string; color: string }) {
  switch (format) {
    case "books":     return <BookIcon color={color} />
    case "facts":     return <FlaskIcon color={color} />
    case "people":    return <PersonIcon color={color} />
    case "concepts":  return <LightbulbIcon color={color} />
    case "questions": return <QuestionIcon color={color} />
    case "stories":   return <ScrollIcon color={color} />
    case "academy":   return <MortarboardIcon color={color} />
    default:          return <BookIcon color={color} />
  }
}

export default function EmptyState({ format, accentColor }: Props) {
  const label = FORMAT_STYLES[format as FormatId]?.label ?? format

  return (
    <div className="flex flex-col items-center gap-4 px-8 text-center">
      <FormatIcon format={format} color={accentColor} />
      <div className="flex flex-col gap-1.5">
        <p className="text-white font-semibold">{label} coming soon</p>
        <p className="text-zinc-500 text-sm leading-relaxed">
          We&apos;re curating quality {label.toLowerCase()} posts. Check back soon.
        </p>
      </div>
    </div>
  )
}
