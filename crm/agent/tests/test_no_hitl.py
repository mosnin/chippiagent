"""The Python loop cannot stall on human-in-the-loop.

Covers orchestrator / chippi / security / tools.base — the files that
own run execution. drafts.py is out of scope.

tools/__init__.py imports SDK-backed modules, so tools.base is loaded
from the file path rather than `from tools.base import ...`.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

AGENT = Path(__file__).resolve().parents[1]
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

from security.guardrails import is_hitl_block_reason, payload_is_unsafe  # noqa: E402

OWNED = (
    AGENT / "orchestrator.py",
    AGENT / "chippi.py",
    AGENT / "tools" / "base.py",
    AGENT / "security" / "guardrails.py",
    AGENT / "security" / "context.py",
    AGENT / "security" / "budget.py",
)


def _load_base():
    spec = importlib.util.spec_from_file_location(
        "chippi_tool_base_hitl", AGENT / "tools" / "base.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


base = _load_base()


def test_owned_sources_never_say_chippy():
    for path in OWNED:
        assert "Chippy" not in path.read_text()


def test_chippi_has_no_hitl_guardrail():
    text = (AGENT / "chippi.py").read_text()
    assert "pending_drafts_guardrail" not in text
    assert "input_guardrails" not in text
    assert "disable_tool_approvals" in text


def test_orchestrator_does_not_skip_for_human_review():
    text = (AGENT / "orchestrator.py").read_text()
    assert "InputGuardrailTripwireTriggered" not in text
    assert "awaiting review" not in text
    assert "guardrail_blocked" not in text
    assert "increment_attempts=False" not in text
    assert "_execute_pending_tools" in text
    assert "resolve_pending_tool_pauses" in text


def test_guardrails_module_has_no_draft_tripwire():
    text = (AGENT / "security" / "guardrails.py").read_text()
    assert "pending_drafts_guardrail" not in text
    assert "tripwire_triggered" not in text
    assert "AgentDraft" not in text
    assert "@input_guardrail" not in text


def test_hitl_reason_is_recognized_and_never_a_valid_block():
    assert is_hitl_block_reason("needs human approval")
    assert is_hitl_block_reason("Run skipped — 10 draft(s) awaiting review.")
    assert is_hitl_block_reason("permission required")
    assert not is_hitl_block_reason("unsafe payload: spaceId is not a tool argument")
    assert not is_hitl_block_reason("invalid payload: null byte")


def test_payload_safety_rejects_tenant_escape_and_malformed():
    assert payload_is_unsafe({"spaceId": "spc_other"}) == (
        "unsafe payload: spaceId is not a tool argument"
    )
    assert payload_is_unsafe({"space_id": "spc_other"})
    assert payload_is_unsafe([{"ok": True}]) == (
        "invalid payload: tool arguments must be an object"
    )
    assert payload_is_unsafe({"body": "hi\x00"}) == "invalid payload: null byte"
    assert payload_is_unsafe({"nested": {"spaceId": "x"}})


def test_payload_safety_allows_normal_tool_args():
    assert payload_is_unsafe(None) is None
    assert payload_is_unsafe({"contact_id": "c1", "channel": "sms"}) is None
    assert payload_is_unsafe("plain text") is None
    reason = payload_is_unsafe({"spaceId": "x"})
    assert reason is not None
    assert not is_hitl_block_reason(reason)


def test_disable_tool_approval_clears_hitl_flags():
    tool = SimpleNamespace(
        needs_approval=True,
        require_approval=True,
        tool_config={"require_approval": "always"},
        on_approval=None,
    )
    base.disable_tool_approval(tool)
    assert tool.needs_approval is False
    assert tool.require_approval is False
    assert tool.tool_config["require_approval"] == "never"
    assert tool.on_approval is not None


def test_disable_tool_approvals_returns_same_list():
    a = SimpleNamespace(needs_approval=True)
    b = SimpleNamespace(needs_approval=True)
    out = base.disable_tool_approvals([a, b])
    assert out == [a, b]
    assert a.needs_approval is False
    assert b.needs_approval is False


def test_no_interruptions_means_nothing_to_resume():
    result = SimpleNamespace(interruptions=[])
    assert base.pending_tool_interruptions(result) == []
    assert base.resolve_pending_tool_pauses(result) is None


def test_pending_tools_are_approved_not_left_waiting():
    approved: list[object] = []
    rejected: list[object] = []

    class State:
        def approve(self, item, always_approve=False):
            approved.append((item, always_approve))

        def reject(self, item, rejection_message=None):
            rejected.append((item, rejection_message))

    state = State()
    safe = SimpleNamespace(arguments='{"contact_id": "c1"}')
    unsafe = SimpleNamespace(arguments='{"spaceId": "spc_x"}')
    result = SimpleNamespace(interruptions=[safe, unsafe], to_state=lambda: state)

    out = base.resolve_pending_tool_pauses(result)
    assert out is state
    assert approved == [(safe, True)]
    assert rejected == [(unsafe, "unsafe payload: spaceId is not a tool argument")]
    assert not any(is_hitl_block_reason(msg) for _, msg in rejected)


def test_drain_loop_finishes_without_a_human():
    """Contract of orchestrator._execute_pending_tools: approve, resume, stop."""
    approved: list[object] = []

    class State:
        def approve(self, item, always_approve=False):
            approved.append(item)

        def reject(self, item, rejection_message=None):
            raise AssertionError("safe payload must not be rejected")

    state = State()
    first = SimpleNamespace(
        interruptions=[SimpleNamespace(arguments='{"contact_id": "c1"}')],
        to_state=lambda: state,
    )
    done = SimpleNamespace(interruptions=[])

    result = first
    resumes = 0
    while True:
        nxt = base.resolve_pending_tool_pauses(result)
        if nxt is None:
            break
        result = done
        resumes += 1
        if resumes > 8:
            raise AssertionError("drain loop stalled")

    assert resumes == 1
    assert len(approved) == 1
