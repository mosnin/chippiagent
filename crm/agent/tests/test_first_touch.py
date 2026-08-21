"""First-touch SMS — fail if the draft is missing, empty, off-voice, or sent."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from first_touch import (
    INBOUND_LEAD_EVENTS,
    assert_valid_first_touch_text,
    compose_first_touch_sms,
    first_touch_instruction,
    format_window_label,
    is_inbound_lead_event,
    propose_two_showing_windows,
)


SOURCE = Path(__file__).resolve().parents[1] / "first_touch.py"


def test_source_never_sends():
    text = SOURCE.read_text()
    assert "send_sms" not in text
    assert "book_tour" not in text
    assert "status\": \"sent\"" not in text
    assert '"status": "sent"' not in text
    assert '"status": "live"' not in text
    assert '"status": "booked"' not in text
    assert "Chippy" not in text
    assert '"status": "pending"' in text


def test_inbound_events():
    assert INBOUND_LEAD_EVENTS == {"new_lead", "application_submitted"}
    assert is_inbound_lead_event("new_lead")
    assert is_inbound_lead_event("application_submitted")
    assert not is_inbound_lead_event("tour_completed")


def test_two_windows_are_concrete_and_future():
    now = datetime(2026, 8, 21, 14, 0, tzinfo=timezone.utc)
    windows = propose_two_showing_windows(now)
    assert len(windows) == 2
    assert windows[0]["label"] != windows[1]["label"]
    assert windows[0]["startsAt"] > now
    assert windows[1]["startsAt"] > windows[0]["startsAt"]


def test_compose_requires_two_windows():
    with pytest.raises(ValueError, match="two showing windows"):
        compose_first_touch_sms(
            contact_first_name="Sam",
            agent_first_name="Jordan",
            tone="warm",
            windows=[{"label": "Tue 11am"}],
        )


def test_compose_is_in_assigned_agent_voice():
    windows = [{"label": "Tue 11am"}, {"label": "Wed 4pm"}]
    text = compose_first_touch_sms(
        contact_first_name="Sam Rivera",
        agent_first_name="Jordan Lee",
        tone="direct",
        windows=windows,
        property_name="1422 Pine",
    )
    assert text
    assert "Sam" in text
    assert "Jordan" in text
    assert "Tue 11am" in text
    assert "Wed 4pm" in text
    assert "i can hold" in text.lower()
    assert "chippy" not in text.lower()
    assert "sent" not in text.lower()
    assert "booked" not in text.lower()
    assert "live" not in text.lower()


def test_empty_or_sent_drafts_fail():
    with pytest.raises(ValueError, match="empty"):
        assert_valid_first_touch_text(
            "",
            windows=["Tue 11am", "Wed 4pm"],
            agent_token="Jordan",
            tone="warm",
        )
    with pytest.raises(ValueError, match="sent"):
        assert_valid_first_touch_text(
            "Hi Sam — auto-sent. Tue 11am or Wed 4pm.",
            windows=["Tue 11am", "Wed 4pm"],
            agent_token="Jordan",
            tone="direct",
        )
    with pytest.raises(ValueError, match="booked"):
        assert_valid_first_touch_text(
            "Hey Sam, this is Jordan. Tue 11am is booked. Wed 4pm.",
            windows=["Tue 11am", "Wed 4pm"],
            agent_token="Jordan",
            tone="warm",
        )
    with pytest.raises(ValueError, match="booked"):
        assert_valid_first_touch_text(
            "Hey Sam, this is Jordan. Showing is live. Tue 11am or Wed 4pm.",
            windows=["Tue 11am", "Wed 4pm"],
            agent_token="Jordan",
            tone="warm",
        )


def test_opening_prompt_names_the_first_touch_job():
    block = first_touch_instruction(
        [{"event": "new_lead", "contactId": "c1"}]
    )
    assert block is not None
    assert "Never send" in block
    assert "two concrete showing windows" in block
    assert "c1" in block
    assert first_touch_instruction([{"event": "tour_completed", "contactId": "c1"}]) is None


def test_format_window_label_is_concrete():
    label = format_window_label(datetime(2026, 8, 25, 15, 0))
    assert "Tue" in label
    assert "3pm" in label or "15" in label
