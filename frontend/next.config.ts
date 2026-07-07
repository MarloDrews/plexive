import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev-tools badge sits bottom-right at phone width, exactly
  // over the comment send button — hide it so dev matches what users see.
  devIndicators: false,

  // Hosts allowed through the next/image optimizer: Supabase Storage
  // (uploads), Wikimedia (official content imagery) and localhost (legacy
  // /uploads/ paths against the local API). Keep in sync with AppImage's
  // OPTIMIZED_HOSTS allowlist; a URL on any other host renders there as a
  // plain <img> instead of failing in the optimizer.
  images: {
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
