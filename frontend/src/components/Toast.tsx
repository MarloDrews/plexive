// The toast element stays mounted so it can fade, which means a hidden toast
// would otherwise leave its stale message in the accessibility tree (A11Y-017).
// The spoken copy is therefore a separate live region holding the message only
// while the toast is visible: it announces on show and empties on hide. The
// visual element is hidden from assistive tech so the text is not read twice.
export default function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {visible ? message : ""}
      </div>
      <div
        aria-hidden="true"
        className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.10] backdrop-blur-xl text-ink text-sm px-4 py-2 rounded-full pointer-events-none transition-opacity duration-300 whitespace-nowrap ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {message}
      </div>
    </>
  )
}
