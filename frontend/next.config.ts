import type { NextConfig } from "next";

// The CSP is applied for production builds only. `next dev` relies on inline
// eval, HMR and the React refresh runtime, which a strict policy breaks; those
// never run in `next build`/`next start`.
const isProd = process.env.NODE_ENV === "production";

// The backend origin the client actually talks to, derived from the same
// build-time env var it uses (storage.ts). Both the http(s) fetch origin and its
// ws(s) form are returned so connect-src covers REST and the chat/battle sockets
// -- http+ws on the Tailscale box, https+wss behind TLS.
function apiOrigins(): { http: string | null; ws: string | null } {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return { http: null, ws: null };
  try {
    const http = new URL(raw).origin;
    return { http, ws: http.replace(/^http/, "ws") };
  } catch {
    return { http: null, ws: null };
  }
}

const { http: apiHttp, ws: apiWs } = apiOrigins();

// Hosts the in-browser TTS (onnxruntime-web via @diffusionstudio/vits-web)
// reaches: the voice model on huggingface.co and the WASM runtime on the two
// CDNs. Everything else the app loads is same-origin or an allowlisted image.
const TTS_HOSTS = ["https://huggingface.co", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"];

const connectSrc = ["'self'", apiHttp, apiWs, ...TTS_HOSTS].filter(Boolean).join(" ");
const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  apiHttp,
  "https://*.supabase.co",
  "https://commons.wikimedia.org",
  "https://upload.wikimedia.org",
]
  .filter(Boolean)
  .join(" ");

// Google Identity Services ("Sign in with Google") loads its script, renders its
// button/prompt in an iframe, and calls its own endpoints -- all under
// https://accounts.google.com/gsi/. Each needs its own CSP directive per Google's
// documented requirements, or the button silently fails to render.
const GSI_SCRIPT = "https://accounts.google.com/gsi/client";
const GSI_FRAME = "https://accounts.google.com/gsi/";
const GSI_CONNECT = "https://accounts.google.com/gsi/";
const GSI_STYLE = "https://accounts.google.com/gsi/style";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline': Next injects inline bootstrap scripts without a nonce.
  // 'wasm-unsafe-eval' + the CDNs: the TTS runtime instantiates WASM from them.
  // GSI_SCRIPT: the Google Identity Services client library.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net ${GSI_SCRIPT}`,
  // 'unsafe-inline': styled-jsx and inline style attributes. KaTeX CSS is
  // bundled and served from 'self'. GSI_STYLE: Google's button stylesheet.
  `style-src 'self' 'unsafe-inline' ${GSI_STYLE}`,
  `img-src ${imgSrc}`,
  "font-src 'self' data:",
  // TTS audio and the onnxruntime worker are blob: URLs.
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  // GSI_FRAME: the Google Sign-In button and one-tap prompt render in an iframe.
  `frame-src ${GSI_FRAME}`,
  `connect-src ${connectSrc} ${GSI_CONNECT}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The floating dev-tools badge sits bottom-right at phone width, exactly
  // over the comment send button — hide it so dev matches what users see.
  devIndicators: false,

  // Security response headers, production only (SEC-011/M125). The CSP allows
  // same-origin plus the few external hosts the app genuinely needs (the API
  // origin + its ws form, the allowlisted image hosts, and the TTS model/runtime
  // hosts). Kept alongside nosniff and a conservative referrer policy.
  async headers() {
    if (!isProd) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Hosts allowed through the next/image optimizer: Supabase Storage
  // (uploads), Wikimedia (official content imagery) and localhost (legacy
  // /uploads/ paths against the local API). Keep in sync with AppImage's
  // OPTIMIZED_HOSTS allowlist; a URL on any other host renders there as a
  // plain <img> instead of failing in the optimizer.
  images: {
    // Dev serves the original files directly: the dev optimizer fetches and
    // resizes every remote image per request without the production cache,
    // which made first post opens noticeably slower while developing.
    // Production keeps the optimized, disk-cached variants (measured: warm
    // loads drop from ~1 MB/1.2s to ~30 KB/20ms on the stories lead image).
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "http", hostname: "localhost" },
    ],
  },

  // The read-aloud TTS engine (vits-web) ships WASM glue with a Node-only
  // require("fs") branch that never runs in the browser; alias fs to an
  // empty stub so the bundler can resolve it.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/readAloud/nodeStub.ts" },
    },
  },
};

export default nextConfig;
