"""Probe the three Plexive websockets from outside, with and without a token.

Run with the backend venv, which already pins the websockets client:
    backend/.venv/Scripts/python.exe tools/probe_websocket.py
    backend/.venv/Scripts/python.exe tools/probe_websocket.py --token "<jwt>"

Why this exists as its own tool rather than a line in
tools/probe_public_surface.sh: these endpoints do not authenticate by header.
The token arrives in the FIRST FRAME, deliberately, so that it cannot reach an
access log. Two consequences that a status-code probe gets wrong:

  1. An anonymous handshake returns 101, and that is NOT a leak. The upgrade
     succeeding says nothing about whether any content follows it.
  2. Nothing in the HTTP layer can gate them, which is exactly why the closed
     beta's ASGI middleware passes the websocket scope through untouched. A
     header check there would reject every socket and break battle, arena and
     chat silently.

So the questions here are different from the HTTP ones:

  ANONYMOUS -- does the socket receive content, and does it CLOSE? Both halves
  matter. Receiving nothing is the security answer. Closing is the resource
  answer: a socket that hangs open unauthenticated holds one of the server's 32
  pre-auth slots, and this project has already lost three CI runs to a frame
  that never arrived, so "it went quiet" is not good enough. The close code and
  the time to close are printed for that reason.

  WITH A TOKEN -- does a real frame come back? Not "did the socket open". A gate
  in front of a tunnel is exactly the thing that breaks an upgrade in a way that
  still looks like a successful connection.
"""

import argparse
import asyncio
import json
import sys
import time

try:
    import websockets
except ImportError:
    sys.exit("websockets is not installed. Use backend/.venv/Scripts/python.exe.")

PATHS = ("/api/chat/ws", "/api/battle/ws", "/api/arena/ws")
# Long enough that a slow-but-healthy close is not misread as a hang, short
# enough to stay usable by hand. The server's own pre-auth timeout is what this
# is measuring, so a value below it would report a false "hung".
ANON_WAIT_SECONDS = 45.0


async def probe_anonymous(base: str, path: str) -> None:
    """Connect, send NOTHING, and report what the server does about it."""
    url = base + path
    started = time.monotonic()
    try:
        async with websockets.connect(url, open_timeout=20) as ws:
            handshake = time.monotonic() - started
            print(f"  {path}: upgraded in {handshake:.2f}s (101 is expected, not a leak)")
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=ANON_WAIT_SECONDS)
            except asyncio.TimeoutError:
                elapsed = time.monotonic() - started
                print(f"  {path}: LEAK/HANG -- still open and silent after {elapsed:.1f}s.")
                print(f"  {path}: it is holding a pre-auth slot. This is a finding.")
                return
            except websockets.exceptions.ConnectionClosed as exc:
                elapsed = time.monotonic() - started
                print(f"  {path}: CLOSED after {elapsed:.2f}s, "
                      f"code={exc.code} reason={exc.reason!r}, no content received. OK")
                return
            # A frame arrived without us ever authenticating.
            elapsed = time.monotonic() - started
            print(f"  {path}: LEAK -- received a frame at {elapsed:.2f}s "
                  f"without authenticating: {str(message)[:200]}")
    except Exception as exc:  # noqa: BLE001 -- a probe reports, it does not raise
        print(f"  {path}: connect failed: {type(exc).__name__}: {exc}")


async def probe_authenticated(base: str, path: str, token: str) -> bool:
    """Send the first-frame auth and require a REAL frame back.

    Returns True only when a frame actually arrived, so the caller can assert on
    a count rather than on the absence of an exception.
    """
    url = base + path
    started = time.monotonic()
    try:
        async with websockets.connect(url, open_timeout=20) as ws:
            await ws.send(json.dumps({"type": "auth", "token": token}))
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=30)
            except asyncio.TimeoutError:
                print(f"  {path}: NO FRAME within 30s of authenticating. "
                      f"The socket opened and produced nothing -- this is the "
                      f"quiet breakage the gate could cause.")
                return False
            elapsed = time.monotonic() - started
            print(f"  {path}: frame received at {elapsed:.2f}s: {str(message)[:300]}")
            return True
    except Exception as exc:  # noqa: BLE001
        print(f"  {path}: connect/auth failed: {type(exc).__name__}: {exc}")
        return False


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="wss://api.plexive.org",
                        help="websocket base, e.g. ws://localhost:8000")
    parser.add_argument("--token", default=None,
                        help="a real JWT; without it only the anonymous half runs")
    args = parser.parse_args()

    print(f"Websocket probe against {args.base}")
    print()
    print("ANONYMOUS (no auth frame is ever sent):")
    for path in PATHS:
        await probe_anonymous(args.base, path)

    if not args.token:
        print()
        print("No --token given, so the signed-in half did not run.")
        print("That half is the one that proves the gate did not break the upgrade.")
        return 0

    print()
    print("AUTHENTICATED (first-frame auth, then wait for a real frame):")
    got = 0
    for path in PATHS:
        if await probe_authenticated(args.base, path, args.token):
            got += 1
    print()
    print(f"Frames received on {got} of {len(PATHS)} sockets.")
    # Assert on the count: a run where every socket failed would otherwise read
    # as a clean report made of nothing.
    return 0 if got == len(PATHS) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
