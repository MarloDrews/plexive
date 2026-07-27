// API addressing for the mobile app.
//
// The backend never lives on the phone, so "localhost" never works from the
// app. Three situations:
//
// 1. Android emulator (default): the emulator maps the host machine's
//    127.0.0.1 to the special address 10.0.2.2, so a backend started with
//    `uvicorn app.main:app` on the dev PC is reachable at
//    http://10.0.2.2:8000. This is the built-in default below.
//
// 2. Real device on the same WLAN: set EXPO_PUBLIC_API_URL to the dev PC's
//    LAN address, e.g. http://192.168.1.50:8000 (find it with `ipconfig`).
//    The backend must listen on 0.0.0.0, not 127.0.0.1.
//
// 3. Real device outside the WLAN: point EXPO_PUBLIC_API_URL at the deployed
//    backend over HTTPS, e.g. https://api.plexive.example. Plain http is
//    blocked by Android/iOS cleartext policies for non-local addresses, and
//    the chat websocket upgrade to wss requires TLS anyway.
//
// EXPO_PUBLIC_* variables are inlined by Expo at bundle time; set them in
// mobile/.env or the shell before `npx expo start`.

const DEFAULT_DEV_URL = "http://10.0.2.2:8000"

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_DEV_URL

// Websocket URL derived from the same origin (http -> ws, https -> wss).
export const WS_URL = BASE_URL.replace(/^http/, "ws")

// Public web frontend origin used when sharing post links (the app shares a
// browser-openable URL, mirroring window.location.origin on the web).
// Set EXPO_PUBLIC_WEB_URL once the frontend is deployed; the default matches
// the web dev server.
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000"

// Origin for seed images stored as web-relative paths (/seed-images/... in
// frontend/public). Shares the WEB_URL override, but the dev default must be
// 10.0.2.2 because localhost inside the emulator is the emulator itself.
export const SEED_IMAGE_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "http://10.0.2.2:3000"

// Seed content stores some image paths relative to the web frontend origin.
// Absolute URLs (Supabase, Wikimedia, ...) pass through unchanged.
export function resolveImageUrl(url: string): string {
  return url.startsWith("/") ? `${SEED_IMAGE_ORIGIN}${url}` : url
}
