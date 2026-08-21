"""Inbound tool — send now, never park a pending draft."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "inbound.py"


def function_tool(fn=None, **_kwargs):
    if fn is None:
        return lambda f: f
    return fn


def _stub(name: str, **attrs: object) -> None:
    if name in sys.modules:
        return
    mod = ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod


_stub("agents", RunContextWrapper=object, function_tool=function_tool)
_stub("db", supabase=lambda: None)
_stub("security")
_stub("security.context", AgentContext=object)
_stub("tools")
_stub("tools.base", idempotent_tool=lambda fn: fn)
_stub("tools.streaming", publish_event=lambda *args, **kwargs: None)

_spec = importlib.util.spec_from_file_location("inbound_under_test", SOURCE)
assert _spec and _spec.loader
inbound = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(inbound)

compose_inbound_reply = inbound.compose_inbound_reply
detect_inbound_intent = inbound.detect_inbound_intent
e164_phone = inbound.e164_phone
send_sms_now = inbound.send_sms_now


def test_source_sends_and_never_parks():
    text = SOURCE.read_text()
    assert "send_sms_now" in text
    assert "telnyx.com/v2/messages" in text
    assert '"status": "pending"' not in text
    assert 'table("AgentDraft").insert' not in text
    assert "Chippy" not in text
    assert "awaiting approval" not in text.lower()


def test_compose_inbound_reply_voices():
    positive = compose_inbound_reply("Sam Rivera", "positive_response", "Jordan Lee")
    inquiry = compose_inbound_reply("Sam Rivera", "inquiry", "Jordan Lee")
    general = compose_inbound_reply("Sam Rivera", "general_reply", "Jordan Lee")
    assert "Sam" in positive
    assert "Jordan" in positive
    assert "which time works" in positive
    assert "pick a time" in inquiry
    assert "Got your message" in general
    for text in (positive, inquiry, general):
        assert "chippy" not in text.lower()
        assert "sent" not in text.lower()
        assert "booked" not in text.lower()


def test_compose_opt_out_does_not_send():
    assert compose_inbound_reply("Sam", "opt_out", "Jordan") == ""


def test_compose_rejects_chippy_agent_name():
    with pytest.raises(ValueError, match="brand"):
        compose_inbound_reply("Sam", "inquiry", "Chippy")


def test_detect_intent():
    assert detect_inbound_intent("Yes, Tuesday works")[0] == "positive_response"
    assert detect_inbound_intent("stop texting me")[0] == "opt_out"
    assert detect_inbound_intent("what is the price?")[0] == "inquiry"
    assert detect_inbound_intent("thanks")[0] == "general_reply"


def test_e164_phone():
    assert e164_phone("5551234567") == "+15551234567"
    assert e164_phone("+15551234567") == "+15551234567"
    assert e164_phone("12") is None
    assert e164_phone(None) is None


@pytest.mark.asyncio
async def test_send_sms_now_skips_without_credentials(monkeypatch):
    monkeypatch.delenv("TELNYX_API_KEY", raising=False)
    monkeypatch.delenv("TELNYX_FROM_NUMBER", raising=False)
    assert await send_sms_now("+15551234567", "Hey Sam, which time works?") is False


@pytest.mark.asyncio
async def test_send_sms_now_rejects_chippy(monkeypatch):
    monkeypatch.setenv("TELNYX_API_KEY", "k")
    monkeypatch.setenv("TELNYX_FROM_NUMBER", "+15550000000")
    assert await send_sms_now("+15551234567", "Hey this is Chippy") is False
