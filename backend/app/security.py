"""Signed development identities; replace with verified campus identity in production."""
import base64
import hashlib
import hmac
import json
import os
import time


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign(user_id: str, secret: str, ttl: int = 3600) -> str:
    payload = _encode(json.dumps({"sub": user_id, "exp": int(time.time()) + ttl}, separators=(",", ":")).encode())
    signature = _encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return payload + "." + signature


def verify(token: str, secret: str) -> str | None:
    try:
        payload, signature = token.split(".")
        expected = _encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if not isinstance(data.get("sub"), str) or data.get("exp", 0) <= time.time():
            return None
        return data["sub"]
    except (ValueError, KeyError, TypeError, UnicodeDecodeError):
        return None


def secret() -> str:
    value = os.getenv("KART_SESSION_SECRET", "")
    if len(value) < 32:
        raise RuntimeError("Set KART_SESSION_SECRET to a random value of at least 32 characters.")
    return value
