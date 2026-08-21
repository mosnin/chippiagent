"""Strip secret-shaped substrings from text before it hits logs or clients.

Provider SDKs (OpenAI, OpenRouter, Stripe, Telnyx, …) embed API keys in
auth-failure messages. Those strings must never reach a realtor's browser
or an unredacted log line.
"""

from __future__ import annotations

import re

_SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{8,}"), "[REDACTED]"),
    (re.compile(r"sk_(?:live|test)_[A-Za-z0-9]+"), "[REDACTED]"),
    (re.compile(r"rk_(?:live|test)_[A-Za-z0-9]+"), "[REDACTED]"),
    (re.compile(r"\bre_[A-Za-z0-9]{8,}"), "[REDACTED]"),
    (re.compile(r"\bwhsec_[A-Za-z0-9]+"), "[REDACTED]"),
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.I), "Bearer [REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), "[jwt]"),
    (re.compile(r"\bKEY[A-Z0-9]{16,}"), "[REDACTED]"),
    (re.compile(r"\bak_[A-Za-z0-9]{8,}"), "[REDACTED]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]+"), "[REDACTED]"),
    (re.compile(r"\bgh[ps]_[A-Za-z0-9]{20,}"), "[REDACTED]"),
    (re.compile(r"(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+", re.I), "[REDACTED]"),
    (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "[email]"),
    (re.compile(r"\+?1?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}"), "[phone]"),
]

# Safe to show a realtor. Never interpolate an exception into this.
CLIENT_ERROR_MESSAGE = "Something went wrong. Try again."


def mask_secrets(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
