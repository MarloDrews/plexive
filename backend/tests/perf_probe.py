"""Endpoint timing probe for the performance work on perf/backend-audit.

Times a fixed set of hot endpoints against an already-running backend and
optionally saves response bodies so a before/after comparison can verify that
an optimization did not change behavior.

Usage:
    .venv\\Scripts\\python.exe tests\\perf_probe.py [--base URL] [--runs N] [--out DIR] [--no-auth]

The backend must already be running (default http://127.0.0.1:8123):
    .venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8123 --log-level warning

Auth: /api/stats/me and /api/feed/following need a token. The probe logs in as
the seed admin (email from PROBE_EMAIL, password from SEED_ADMIN_PASSWORD in
backend/.env) and caches the token in --out/token.txt to stay under the login
rate limit (10 per 5 min per email). Pass --no-auth to skip authed endpoints.

Comparison notes for verifiers:
- /api/feed responses are deliberately jittered (scoring.py random factor):
  compare the saved *.normalized.json files (lists sorted by id), not order.
- like_count/comment_count can drift if the live DB receives traffic between
  runs; a count-only diff is drift, not a behavior change - re-run to confirm.
- run 1 may include connection-pool warmup; compare runs 2+.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (name, path, needs_auth)
ENDPOINTS = [
    ("health", "/health", False),
    ("interests", "/api/interests", False),
    ("feed_books", "/api/feed?format=books", False),
    ("feed_interests", "/api/feed?interests=politics,history,philosophy", False),
    ("feed_user", "/api/feed/user/Marlo", False),
    ("profile", "/api/users/Marlo/profile", False),
    ("elo", "/api/users/Marlo/elo", False),
    ("stats_global", "/api/stats/global", False),
    ("search", "/api/search?q=history", False),
    ("stats_me", "/api/stats/me", True),
    ("feed_following", "/api/feed/following", True),
]


def read_env_value(key):
    env_path = os.path.join(BACKEND_DIR, ".env")
    if not os.path.exists(env_path):
        return None
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return None


def request(base, path, token=None, method="GET", body=None):
    req = urllib.request.Request(base + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, data=data, timeout=60) as r:
        raw = r.read()
    ms = (time.perf_counter() - t0) * 1000
    return ms, raw


def get_token(base, out_dir):
    """Login as the seed admin, reusing a cached token to respect rate limits."""
    cache = os.path.join(out_dir, "token.txt") if out_dir else None
    if cache and os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            token = f.read().strip()
        try:
            request(base, "/api/auth/me", token=token)
            return token
        except urllib.error.HTTPError:
            pass  # expired or invalid - fall through to login
    email = os.environ.get("PROBE_EMAIL", "marlo07drews@gmail.com")
    password = os.environ.get("SEED_ADMIN_PASSWORD") or read_env_value("SEED_ADMIN_PASSWORD")
    if not password:
        return None
    try:
        _, raw = request(base, "/api/auth/login", method="POST",
                         body={"email": email, "password": password})
    except urllib.error.HTTPError as e:
        print(f"login failed ({e.code}); skipping authed endpoints", file=sys.stderr)
        return None
    token = json.loads(raw)["access_token"]
    if cache:
        with open(cache, "w", encoding="utf-8") as f:
            f.write(token)
    return token


def normalize(parsed):
    """Stable form for diffing: feed lists are sorted by id (order is jittered)."""
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict) and "id" in parsed[0]:
        return sorted(parsed, key=lambda x: x["id"])
    return parsed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8123")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--out", default=None, help="directory to save timings and bodies")
    ap.add_argument("--no-auth", action="store_true")
    args = ap.parse_args()

    # Wait for the server.
    for _ in range(40):
        try:
            request(args.base, "/health")
            break
        except Exception:
            time.sleep(0.5)
    else:
        sys.exit("backend not reachable at " + args.base)

    if args.out:
        os.makedirs(args.out, exist_ok=True)

    token = None if args.no_auth else get_token(args.base, args.out)

    results = {}
    for name, path, needs_auth in ENDPOINTS:
        if needs_auth and not token:
            print(f"{name:18s} SKIPPED (no token)")
            continue
        runs, body = [], b""
        for _ in range(args.runs):
            try:
                ms, body = request(args.base, path, token=token if needs_auth else None)
                runs.append(round(ms))
            except urllib.error.HTTPError as e:
                runs.append(f"HTTP{e.code}")
        results[name] = {"path": path, "runs_ms": runs, "bytes": len(body)}
        print(f"{name:18s} runs_ms={runs} bytes={len(body)}")
        if args.out and body:
            with open(os.path.join(args.out, name + ".json"), "wb") as f:
                f.write(body)
            try:
                norm = normalize(json.loads(body))
                with open(os.path.join(args.out, name + ".normalized.json"), "w", encoding="utf-8") as f:
                    json.dump(norm, f, indent=1, sort_keys=True)
            except (ValueError, TypeError):
                pass

    if args.out:
        with open(os.path.join(args.out, "timings.json"), "w", encoding="utf-8") as f:
            json.dump(results, f, indent=1)
        print("saved to", args.out)


if __name__ == "__main__":
    main()
