"""Inbound tool — send now, never park a pending draft."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.inbound import compose_inbound_reply, detect_inbound_intent, e164_phone, send_sms_now

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "inbound.py"


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
