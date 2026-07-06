import { TOKEN_KEY } from "@/lib/storage"

const API_URL = process.env.NEXT_PUBLIC_API_URL

// Wrapper around fetch that automatically attaches the Authorization header
// when a token is present in localStorage. Use this for any API call that
// may require authentication.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  }
  // FormData bodies must NOT get an explicit Content-Type — the browser sets
  // multipart/form-data with the correct boundary itself.
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(`${API_URL}${path}`, { ...options, headers })
}
