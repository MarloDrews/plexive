package com.plexive.mobile.core.network

// The single place the backend address is written down. This is the deployed FastAPI backend
// (Raspberry Pi behind a Cloudflare Tunnel, see docs/SERVER.md), reached over HTTPS so Android's
// cleartext policy does not block it. Per-environment configuration, so a debug build can point at
// a local backend instead, is a later batch. Do not read this from anywhere but the HTTP client.
const val API_BASE_URL = "https://api.plexive.org"
