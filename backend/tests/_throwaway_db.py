"""Force a throwaway SQLite database BEFORE any app module is imported.

Import this first in every test file:

    import _throwaway_db  # noqa: F401

Why this exists: app/database.py reads DATABASE_URL via load_dotenv(), which
finds backend/.env regardless of the working directory. A test that imports
the app without overriding the variable therefore connects to the REAL
database. load_dotenv never overrides variables that are already set in the
environment, so setting them here (before the import) is a hard guarantee
that test runs cannot touch the real database or the real Supabase storage.
"""

import os
import sys
import tempfile

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

tmp_dir = tempfile.mkdtemp(prefix="deepscroll_test_")

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tmp_dir, "test.db").replace("\\", "/")
# Empty values keep upload_config's supabase_client at None so nothing can
# reach the real storage bucket; tests that exercise uploads install a fake.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
# A strong test secret so the app's startup strength check (M118) passes without
# depending on the developer's real .env. setdefault so a CI-provided secret
# still wins; it runs before any app import, so weaker per-test setdefaults after
# it are no-ops.
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-for-production-0123456789")

# Tests historically ran from a temp dir so stray relative paths stay out of
# the repo; keep that behavior.
os.chdir(tmp_dir)
