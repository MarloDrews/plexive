from pathlib import Path

# Absolute path three levels up from this file (backend/app/upload_config.py),
# placing uploads outside the application directory so they can never be
# accidentally imported or executed as Python modules.
UPLOAD_DIR = Path(__file__).parent.parent.parent / "user_uploads"

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_SVG_SIZE_BYTES   = 512 * 1024         # 512 KB

UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "images").mkdir(exist_ok=True)
(UPLOAD_DIR / "svgs").mkdir(exist_ok=True)
