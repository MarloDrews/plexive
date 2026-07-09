// Flame icon (the mobile FlameIcon path), filled when the streak is alive.
// Shared by Marathon's StreakStat and the stats streak cards (which previously
// rendered a literal fire emoji, against the project no-emoji rule).
export default function FlameIcon({
  size = 15,
  color,
  filled,
}: {
  size?: number
  color: string
  filled: boolean
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path
        d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.048 8.287 8.287 0 0 0 9 9.6a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Zm-5.013 7.74a3.75 3.75 0 0 0 5.272 5.117 5.99 5.99 0 0 0-1.925-3.546 5.974 5.974 0 0 1-2.133-1.001 5.99 5.99 0 0 0-1.214 4.43Z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
