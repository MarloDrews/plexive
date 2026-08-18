"""Talk to RWTH Aachen's KI:connect models.

KI:connect exposes an OpenAI-compatible API, so this is a plain POST to
/chat/completions with a bearer token -- no SDK is needed, and `requests` is
already a dependency.

Configured through the environment, like every other credential here:

    KICONNECT_API_KEY     the personal key from the API-Schluesselverwaltung
    KICONNECT_BASE_URL    defaults to https://chat.kiconnect.nrw/api/v1
    KICONNECT_MODEL       a model SLUG, e.g. "gpt-5.4-mini"

Two things about this API that are easy to lose an afternoon to:

  * The `model` parameter takes the slug that GET /models returns
    ("gpt-oss-120b"), NOT the display name. The RWTH help page says the
    opposite -- "OpenAI GPT OSS 120B" answers 404 model_not_found. Checked
    against the live API, not the documentation.
  * Virtual API keys expire after one month and have to be rotated in the web
    interface, which issues a NEW key. An expired key looks like an auth
    failure, not like an expiry.

A missing key is not an import-time crash -- the module loads fine and the
first call raises, so nothing that merely imports the app breaks without one.
Nothing in the running app imports this today; the caller is
scripts/suggest_thumbnails.py.
"""

import json
import os
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("KICONNECT_API_KEY", "").strip()
BASE_URL = os.getenv("KICONNECT_BASE_URL", "https://chat.kiconnect.nrw/api/v1").rstrip("/")
MODEL = os.getenv("KICONNECT_MODEL", "").strip()

# The API counts against the same quota as the web interface and limits how
# many requests one person may have in flight, so callers run serially and a
# single request is given room to finish rather than being retried into the
# limit.
TIMEOUT_SECONDS = 120


class KiConnectError(RuntimeError):
    """The model could not be reached, or did not answer usefully."""


def chat(
    system: str,
    user: str,
    model: Optional[str] = None,
    temperature: Optional[float] = 0.0,
) -> str:
    """One exchange, returning the assistant's raw text.

    temperature defaults to 0: every use here asks the model to fill in a
    structured spec, where the same post should keep producing the same answer.
    Pass None to leave it out of the request entirely -- some models (gpt-5.5)
    accept only their own default and answer 400 to any explicit value.
    """
    if not API_KEY:
        raise KiConnectError(
            "KICONNECT_API_KEY is not set -- create a key in the KI:connect web "
            "interface (name > API-Schluesselverwaltung) and put it in backend/.env."
        )
    name = (model or MODEL).strip()
    if not name:
        raise KiConnectError(
            "No model chosen -- set KICONNECT_MODEL in backend/.env to a slug "
            'from GET /models, e.g. "gpt-5.4-mini".'
        )

    payload: Dict[str, Any] = {
        "model": name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if temperature is not None:
        payload["temperature"] = temperature

    try:
        response = requests.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise KiConnectError(f"could not reach {BASE_URL}: {exc}") from exc

    if response.status_code == 401:
        raise KiConnectError(
            "KI:connect rejected the key (401). Virtual keys expire after a month -- "
            "rotate it in the web interface and copy the new one into backend/.env."
        )
    if response.status_code >= 400:
        raise KiConnectError(
            f"KI:connect returned {response.status_code}: {response.text[:400]}"
        )

    try:
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError) as exc:
        raise KiConnectError(f"unexpected reply shape: {response.text[:400]}") from exc


def chat_json(
    system: str,
    user: str,
    model: Optional[str] = None,
    temperature: float = 0.0,
) -> Any:
    """`chat`, with the reply parsed as JSON.

    Small models wrap JSON in a ``` fence and add a sentence around it however
    firmly the prompt says not to, so the fence is stripped and the outermost
    braces are located rather than trusting the reply to be bare JSON.
    """
    text = chat(system, user, model=model, temperature=temperature)
    try:
        return json.loads(_extract_json(text))
    except ValueError as exc:
        raise KiConnectError(f"reply was not JSON: {text[:400]}") from exc


def _extract_json(text: str) -> str:
    body = (text or "").strip()

    if body.startswith("```"):
        lines: List[str] = body.splitlines()
        # Drop the opening fence with its optional language tag, and the
        # closing one if the model remembered it.
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        body = "\n".join(lines).strip()

    start = body.find("{")
    end = body.rfind("}")
    if start != -1 and end > start:
        return body[start : end + 1]
    return body
