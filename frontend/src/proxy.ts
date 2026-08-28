// Closed-beta gate (2026-08) for the web app. Meant to be deleted when the
// beta opens; see src/lib/betaGate.ts for why it is HTTP Basic.
//
// FILE NAME: this project is on Next 16, where the `middleware` convention was
// deprecated and renamed to `proxy` (v16.0.0). Naming it middleware.ts here
// would be the vacuous version of this change -- a gate that never runs looks
// exactly like a gate that runs and admits everyone. The verification for this
// batch probes an anonymous page and asserts 401, which is what tells the two
// apart.
//
// NO `config.matcher` IS EXPORTED, AND THAT IS THE POINT. Next's own words:
// "Without a matcher, Proxy runs on every request, including static files
// (_next/static), image optimizations (_next/image), and assets in the public/
// folder." The commonly copied matcher is a negative lookahead that EXCLUDES
// exactly those, which would leave the app shell, its JS and its CSS readable
// to anyone. The cost of running on every asset request is Hobby invocations,
// which is the right trade for a beta with a handful of testers.
//
// What this does NOT cover, stated so nobody mistakes it for total coverage:
// api.plexive.org and the three websockets (battle, arena, chat) connect
// straight to the API origin and never reach the Next server. Those are the
// backend gate's job (backend/app/main.py ClosedBetaMiddleware), and they are
// the half that actually closes the product -- every page here is a client
// component that ships no content and fetches everything from the API in the
// browser. This gate covers the shell.
//
// The proxy runs before filesystem routes, so it also covers prerendered pages
// served from the Vercel cache; that is verified from outside rather than
// assumed, because a cached page served past the gate would be silent.

import { isAuthorized } from "./lib/betaGate"

export function proxy(request: Request): Response | undefined {
  if (isAuthorized(request.headers.get("authorization"), process.env)) {
    return undefined // continue to the route
  }

  return new Response("Plexive is in closed beta.\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Plexive closed beta", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      // Never let a CDN or browser keep the challenge, or lifting the gate
      // would leave people locked out of a page nobody is guarding any more.
      "Cache-Control": "no-store",
    },
  })
}
