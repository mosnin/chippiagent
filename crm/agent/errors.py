"""
Normalised error taxonomy for the agent tool-use loop.

Every error that escapes a tool handler should be wrapped in AgentError
before it reaches the orchestrator.  This gives the orchestrator a
machine-readable ``code``, a human-readable ``message``, and a
``retryable`` flag so it can make intelligent retry decisions instead of
treating all failures the same way.

Zero external dependencies — stdlib only.  No pip installs required.

Error codes mirror the TypeScript version in lib/agent/errors.ts exactly.
They are plain string literals rather than an enum so downstream callers
can compare with ``==`` without importing the enum type.

Importable as::

    from errors import AgentError, from_supabase_error, from_exception

Valid error codes
-----------------
'TOOL_NOT_FOUND'   – named tool does not exist in the registry
'PERMISSION_DENIED' – caller lacks the required permission
'RATE_LIMITED'     – upstream service is throttling us (retry after back-off)
'NETWORK_ERROR'    – transient connectivity failure
'VALIDATION_ERROR' – arguments or data failed schema validation
'DB_ERROR'         – database read/write failure
'SPACE_DISABLED'   – the realtor's space has been suspended
'BUDGET_EXCEEDED'  – the caller has exhausted their token/credit budget
'TIMEOUT'          – operation exceeded its deadline
'UNKNOWN'          – none of the above; inspect context for details
"""

from __future__ import annotations

import json
from typing import Any


# ── AgentError ────────────────────────────────────────────────────────────


class AgentError(Exception):
    """Normalised agent error with machine-readable code and retryable flag.

    Parameters
    ----------
    code:
        One of the 10 valid ErrorCode string literals.
    message:
        Human-readable description of what went wrong.
    retryable:
        ``True`` when the orchestrator should attempt a retry (e.g. network
        blip, rate limit).  ``False`` for permanent failures (e.g. bad args,
        permission denied).
    context:
        Optional arbitrary data for debugging — raw exception, HTTP body, etc.
    """

    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool,
        context: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.context = context

    def to_dict(self) -> dict[str, Any]:
        """Serialisable representation — safe to store in ExecutionStep.error."""
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"AgentError(code={self.code!r}, message={self.message!r}, "
            f"retryable={self.retryable!r})"
        )


# ── Supabase / PostgreSQL error → AgentError ─────────────────────────────

# PostgreSQL SQLSTATE class → (ErrorCode, retryable)
# Only the first two characters of the SQLSTATE are checked.
_SQLSTATE_CLASS_MAP: dict[str, tuple[str, bool]] = {
    "08": ("NETWORK_ERROR", True),   # Connection Exception
    "22": ("VALIDATION_ERROR", False),  # Data Exception
    "23": ("VALIDATION_ERROR", False),  # Integrity Constraint Violation
    "28": ("PERMISSION_DENIED", False), # Invalid Authorization Specification
    "40": ("DB_ERROR", True),        # Transaction Rollback (deadlocks)
    "53": ("DB_ERROR", True),        # Insufficient Resources
    "57": ("DB_ERROR", True),        # Operator Intervention
    "58": ("DB_ERROR", True),        # System Error
}


def from_supabase_error(err_dict: dict[str, Any]) -> AgentError:
    """Map a Supabase/PostgREST error dict to an AgentError.

    The dict is expected to have some subset of::

        {"code": "23505", "message": "...", "status": 409}

    where ``code`` is a PostgreSQL SQLSTATE or a PostgREST ``PGRST*`` code,
    and ``status`` is the HTTP status surfaced by the Supabase client.
    """
    raw_code: str = err_dict.get("code") or ""
    status: int = int(err_dict.get("status") or 0)
    message: str = err_dict.get("message") or "Unknown Supabase error"

    # HTTP-layer shortcuts from the PostgREST / Supabase client.
    if status == 429:
        return AgentError("RATE_LIMITED", message, True, err_dict)
    if status in (401, 403):
        return AgentError("PERMISSION_DENIED", message, False, err_dict)

    # SQLSTATE class check (first two chars).
    sql_class = raw_code[:2]
    if sql_class in _SQLSTATE_CLASS_MAP:
        error_code, retryable = _SQLSTATE_CLASS_MAP[sql_class]
        return AgentError(error_code, message, retryable, err_dict)

    # Generic server error via HTTP status.
    if status >= 500:
        return AgentError("DB_ERROR", message, True, err_dict)

    # PostgREST-specific codes (PGRST…) that aren't already mapped.
    if raw_code.startswith("PGRST"):
        return AgentError("DB_ERROR", message, False, err_dict)

    return AgentError("UNKNOWN", message, False, err_dict)


# ── Generic exception → AgentError ───────────────────────────────────────

# Ordered list of (substring_list, error_code, retryable).
# Checked against the lowercased exception message; first match wins.
_PATTERN_MAP: list[tuple[list[str], str, bool]] = [
    (
        ["timeout", "timed out", "etimedout", "deadline exceeded"],
        "TIMEOUT",
        True,
    ),
    (
        ["network", "econnrefused", "econnreset", "enotfound",
         "fetch failed", "socket hang up", "connection refused",
         "connection reset", "name or service not known"],
        "NETWORK_ERROR",
        True,
    ),
    (
        ["rate limit", "rate_limit", "too many requests"],
        "RATE_LIMITED",
        True,
    ),
    (
        ["permission", "unauthorized", "forbidden", "not allowed", "access denied"],
        "PERMISSION_DENIED",
        False,
    ),
    (
        ["not found", "no such tool", "unknown tool"],
        "TOOL_NOT_FOUND",
        False,
    ),
    (
        ["validation", "invalid", "schema", "parse error"],
        "VALIDATION_ERROR",
        False,
    ),
    (
        ["budget", "quota exceeded", "credit"],
        "BUDGET_EXCEEDED",
        False,
    ),
    (
        ["space disabled", "space is disabled"],
        "SPACE_DISABLED",
        False,
    ),
    (
        ["database", "db error", "sql", "supabase"],
        "DB_ERROR",
        True,
    ),
]


def from_exception(exc: Any) -> AgentError:
    """Wrap any raised value in an AgentError.

    - If *exc* is already an :class:`AgentError`, it is returned unchanged.
    - Otherwise the exception message is inspected for known patterns.
    - Falls back to ``UNKNOWN`` when no pattern matches.
    """
    if isinstance(exc, AgentError):
        return exc

    if isinstance(exc, Exception):
        message = str(exc) or type(exc).__name__
    elif isinstance(exc, str):
        message = exc
    else:
        try:
            message = json.dumps(exc)
        except (TypeError, ValueError):
            message = repr(exc)

    lower = message.lower()

    for patterns, code, retryable in _PATTERN_MAP:
        if any(pat in lower for pat in patterns):
            return AgentError(code, message, retryable, exc)

    return AgentError("UNKNOWN", message, False, exc)
