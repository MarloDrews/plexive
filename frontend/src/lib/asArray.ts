// Coerces unknown section content to a safe array. Seed and legacy post rows
// are arbitrary JSON that Pydantic does not validate, so an array-shaped section
// can arrive as null, an object, or a missing field; calling .map or .length on
// that throws during render. Returns [] for anything that is not already an
// array, matching the guarded sections that already tolerate this shape.
//
// The typed overload preserves the declared element type, so call sites keep
// their inferred callback types without any annotation.
export function asArray<T>(value: readonly T[]): T[]
export function asArray(value: unknown): unknown[]
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
