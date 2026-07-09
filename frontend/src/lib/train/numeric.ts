// Numeric answers must not be compared with strict float equality. The slider
// snaps to min + k*step, which accumulates float error (0.1*3 !== 0.3), and an
// intended answer can sit off the min+k*step grid, so === can make the correct
// value literally unreachable. Compare the step-scaled indices instead, mirroring
// the slider's own snap: the same reachable answer maps to the same integer step.
export function numericMatch(chosen: number, answer: number, min: number, step: number): boolean {
  if (!(step > 0)) return chosen === answer
  return Math.round((chosen - min) / step) === Math.round((answer - min) / step)
}
