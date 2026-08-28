"""Freezes the closed-beta gate (2026-08).

Run from anywhere:
    .venv\\Scripts\\python.exe tests\\closed_beta_test.py

The gate is the one guard here whose broken state and whose working state look
identical from the inside: if CLOSED_BETA never reaches the process, every
endpoint answers exactly as it always did and nothing errors anywhere a person
can see. So this suite asserts BOTH directions on counts -- that the gate
refuses what it exists to refuse, and that it still admits what it exists to
admit -- rather than only that it is installed.

CLOSED_BETA is read at import time in app/auth.py, so it is set below before
any app import, the same way _throwaway_db redirects DATABASE_URL. That is safe
because backend-checks.yml runs each suite as its own subprocess: the other 16
suites still import with the gate off and still assert their anonymous 200s.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 — must run before any app import

os.environ.setdefault("JWT_SECRET", "closed-beta-test-secret")
# Must precede the app import: app/auth.py reads it at module level.
os.environ["CLOSED_BETA"] = "1"

import io  # noqa: E402
from contextlib import redirect_stdout  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app import main as main_module  # noqa: E402
from app.auth import CLOSED_BETA, create_access_token  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASS = 0

# The gate's own refusal body. Used to tell "the gate stopped this" apart from
# "the endpoint ran and rejected the credentials", which are both 401.
GATE_MARKER = "closed beta"


def check(name: str, condition: bool, detail: str = ""):
    global PASS
    assert condition, f"FAIL: {name} {detail}"
    PASS += 1
    print(f"ok: {name}")


Base.metadata.create_all(bind=engine)
client = TestClient(app)

check("the flag reached the app (without this the whole suite is vacuous)",
      CLOSED_BETA is True)

# A user made directly in the DB, because the endpoint that would normally
# create one is exactly what this suite asserts is closed.
_db = SessionLocal()
_user = User(email="beta@example.com", username="betauser", password_hash="x")
_db.add(_user)
_db.commit()
_db.refresh(_user)
TOKEN = create_access_token(_user.id, _user.token_version)
_db.close()
AUTH = {"Authorization": f"Bearer {TOKEN}"}


# --- 1. Anonymous callers are refused -----------------------------------------
# Includes paths whose rows do not exist: the gate short-circuits before
# routing, so a missing post must still be 401 and never 404. A 404 here would
# mean the request reached the router and leaked existence.
BLOCKED = [
    "/api/feed",
    "/api/feed/following",
    "/api/feed/user/betauser",
    "/api/interests",
    "/api/stats/global",
    "/api/stats/me",
    "/api/posts/1",
    "/api/posts/1/comments",
    "/api/posts/1/likes",
    "/api/posts/mine",
    "/api/search?q=eye",
    "/api/search/users?q=beta",
    "/api/users/betauser/profile",
    "/api/users/betauser/elo",
    "/api/users/betauser/followers",
    "/api/users/betauser/following",
    "/api/graph",
    "/api/quiz/answered",
    "/api/quiz/state/1",
    "/api/train/leaderboard",
    "/api/chat/conversations",
    "/api/auth/me",
    "/api/thumbnails/basemap/status",
]

_leaked = [p for p in BLOCKED if client.get(p).status_code != 401]
check(f"all {len(BLOCKED)} anonymous endpoints refused with 401",
      not _leaked, f"these answered something else: {_leaked}")
check("the blocked list is not empty (a list that shrank to nothing would pass vacuously)",
      len(BLOCKED) >= 20, f"only {len(BLOCKED)} paths")

_r = client.get("/api/feed")
check("the refusal carries WWW-Authenticate: Bearer so a client can key re-auth on it",
      _r.headers.get("www-authenticate") == "Bearer", str(_r.headers.get("www-authenticate")))

# --- 2. The schema and both doc UIs are gone ----------------------------------
_DOC_PATHS = ("/openapi.json", "/docs", "/redoc")
_docs_anon = {p: client.get(p).status_code for p in _DOC_PATHS}
check("openapi.json, /docs and /redoc are refused anonymously",
      all(v == 401 for v in _docs_anon.values()), str(_docs_anon))

# The stronger claim, and the one worth freezing: these are REMOVED, not merely
# gated. A signed-in beta tester cannot read the schema either, so lifting the
# gate later does not silently republish it -- that needs a deliberate edit.
_docs_authed = {p: client.get(p, headers=AUTH).status_code for p in _DOC_PATHS}
check("they are 404 even with a valid token, so the routes are gone rather than gated",
      all(v == 404 for v in _docs_authed.values()), str(_docs_authed))
_route_paths = {getattr(r, "path", "") for r in app.routes}
check("and they are absent from the route table",
      not (_route_paths & set(_DOC_PATHS)), str(_route_paths & set(_DOC_PATHS)))
check("app.openapi() still works with the routes removed, so the CI path-count floor holds",
      len(app.openapi()["paths"]) >= 20, str(len(app.openapi()["paths"])))

# --- 3. Registration is closed, independently of the gate ---------------------
# Registration is shut TWICE, by two independent mechanisms, and the caller
# decides which one they meet. /api/auth/register is deliberately NOT in
# GATE_EXEMPT_PATHS, so an anonymous attempt never reaches the handler at all.
_reg = client.post("/api/auth/register", json={
    "email": "new@example.com", "username": "newcomer", "password": "password123",
})
check("an anonymous registration attempt is stopped by the gate before the handler runs",
      _reg.status_code == 401 and GATE_MARKER in _reg.text.lower(), _reg.text)

# Past the gate, the handler refuses on its own. This is the half that matters
# for the day the gate lifts: reopening the door must not silently reopen
# sign-up with it, so the two are separate decisions.
_reg_authed = client.post("/api/auth/register", headers=AUTH, json={
    "email": "new2@example.com", "username": "newcomer2", "password": "password123",
})
check("past the gate, the handler itself refuses with 403 (registration closed independently)",
      _reg_authed.status_code == 403, _reg_authed.text)
check("and it says accounts are by invitation, not that the caller should sign in",
      "invitation" in _reg_authed.text.lower(), _reg_authed.text)

# The user row count is the assertion that neither refusal quietly created an
# account: a 403 that still wrote a row would pass every status check above.
_count_db = SessionLocal()
_users_after = _count_db.query(User).count()
_count_db.close()
check("no account was created by either attempt (exactly the one seeded user exists)",
      _users_after == 1, f"user rows: {_users_after}")

# --- 4. The named exceptions still answer -------------------------------------
check("/health answers anonymously (a monitor needs it; it carries no app content)",
      client.get("/health").status_code == 200)

# A wrong password must reach the login handler and be rejected BY IT. Both the
# gate and a bad password answer 401, so the status alone proves nothing; the
# body is what separates them.
_login = client.post("/api/auth/login", json={"email": "beta@example.com", "password": "wrong"})
check("POST /api/auth/login reaches its handler anonymously (401 from the endpoint, not the gate)",
      _login.status_code == 401 and GATE_MARKER not in _login.text.lower(), _login.text)

_pre = client.options("/api/feed", headers={
    "Origin": "http://localhost:3000",
    "Access-Control-Request-Method": "GET",
})
check("CORS preflight passes the gate (rejecting it would break every browser request)",
      _pre.status_code < 400, str(_pre.status_code))

# --- 5. A valid token is admitted ---------------------------------------------
# The other half of the guard. A gate that refused everything would pass every
# assertion above and still be broken.
ADMITTED = [
    "/api/feed",
    "/api/feed/following",
    "/api/interests",
    "/api/stats/global",
    "/api/stats/me",
    "/api/search?q=eye",
    "/api/search/users?q=beta",
    "/api/graph",
    "/api/quiz/answered",
    "/api/train/leaderboard",
    "/api/chat/conversations",
    "/api/auth/me",
    "/api/posts/mine",
]
_codes = {p: client.get(p, headers=AUTH).status_code for p in ADMITTED}
_refused = [p for p, c in _codes.items() if c != 200]
check(f"all {len(ADMITTED)} endpoints answer 200 to a valid token",
      not _refused, f"these did not: {[(p, _codes[p]) for p in _refused]}")
check("the admitted list is not empty either",
      len(ADMITTED) >= 10, f"only {len(ADMITTED)} paths")

# A credential that is not ours must not open the door.
check("a garbage bearer token is refused",
      client.get("/api/feed", headers={"Authorization": "Bearer not.a.token"}).status_code == 401)
check("a non-Bearer Authorization header is refused",
      client.get("/api/feed", headers={"Authorization": "Basic aGk6dGhlcmU="}).status_code == 401)

# --- 6. The startup announcement, both branches -------------------------------
# Its whole job is to make a forgotten variable visible in journalctl, so a
# silent announcer is the same failure as a silent gate.
_buf = io.StringIO()
with redirect_stdout(_buf):
    main_module._announce_gate()
_on = _buf.getvalue()
check("startup announces the gate is ON", "gate ON" in _on, _on)
check("the ON announcement names the open paths", "/api/auth/login" in _on, _on)

_was = main_module.CLOSED_BETA
try:
    main_module.CLOSED_BETA = False
    _buf = io.StringIO()
    with redirect_stdout(_buf):
        main_module._announce_gate()
    _off = _buf.getvalue()
finally:
    main_module.CLOSED_BETA = _was
check("startup announces the gate is OFF when it is off, rather than staying silent",
      "gate OFF" in _off, _off)
check("the OFF announcement says how to close it", "CLOSED_BETA=1" in _off, _off)

print(f"\nAll {PASS} closed-beta checks passed.")
