export default function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.10] backdrop-blur-xl text-ink text-sm px-4 py-2 rounded-full pointer-events-none transition-opacity duration-300 whitespace-nowrap ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {message}
    </div>
  )
}
