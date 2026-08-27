"""PROOF ONLY -- never to be merged.

Reproduces the shape of the 2026-08-27 battle_test.py hangs: a suite that
prints something, starts a background thread, and then blocks forever in the
main thread. Its job is to prove the workflow turns that into a traceback
instead of into silence.
"""

import threading
import time

import _throwaway_db  # noqa: F401


def _pretend_websocket_reader():
    # Stands in for a socket wait, which is what the real hang looked like.
    time.sleep(600)


threading.Thread(
    target=_pretend_websocket_reader, name="proof-ws-reader", daemon=True
).start()

print("zz_proof_hang_test: about to hang in the main thread", flush=True)
time.sleep(600)
