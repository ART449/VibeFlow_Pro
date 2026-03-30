from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_dev_jwt(payload: dict[str, Any], secret: str, expires_in: int = 3600) -> str:
    claims = dict(payload)
    claims.setdefault("iat", int(time.time()))
    claims.setdefault("exp", int(time.time()) + expires_in)
    header = {"alg": "HS256", "typ": "JWT"}
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def decode_hs256_jwt(token: str, secret: str) -> dict[str, Any]:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise ValueError("Malformed JWT") from exc

    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_sig = _b64url_decode(signature_segment)
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid JWT signature")

    header = json.loads(_b64url_decode(header_segment))
    if header.get("alg") != "HS256":
        raise ValueError("Unsupported JWT algorithm")

    claims = json.loads(_b64url_decode(payload_segment))
    exp = claims.get("exp")
    if exp is not None and int(exp) < int(time.time()):
        raise ValueError("JWT expired")
    return claims


def extract_bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    if value.startswith("Bearer "):
        return value[7:].strip()
    return value.strip()

