// FastAPI returns `detail` as a string for HTTPException but as an ARRAY of
// objects for 422 validation errors. Rendering that array directly ("{detail}")
// throws "Objects are not valid as a React child" and stringifying it gives
// "[object Object]". Route every data.detail through this so both shapes become
// one readable line.
export function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    const first = detail[0]
    if (first && typeof first.msg === "string") return first.msg.replace(/^Value error, /, "")
  }
  return fallback
}
