"""First-touch reply SMS — fail if the draft is missing, empty, or sent."""

from __future__ import annotations

from pathlib import Path

import pytest

from first_touch_reply import (
    INBOUND_MESSAGE_EVENT,
    assert_valid_first_touch_reply_text,
    compose_first_touch_reply_sms,
    extract_window_labels,
    first_touch_reply_instruction,
    is_inbound_message_event,
    pick_offered_window,
)


SOURCE = Path(__file__).resolve().parents[1] / "first_touch_reply.py"


def test_source_never_sends():
    text = SOURCE.read_text()
    assert "send_sms" not in text
    assert "status\": \"sent\"" not in text
    assert "Chippy" not in text
    assert '"status": "pending"' in text


def test_inbound_message_event():
    assert INBOUND_MESSAGE_EVENT == "inbound_message"
    assert is_inbound_message_event("inbound_message")
    assert not is_inbound_message_event("new_lead")
    assert not is_inbound_message_event("tour_completed")


def test_pick_offered_window():
    offered = ["Tue 11am", "Wed 4pm"]
    assert pick_offered_window("Tue 11am works", offered) == "Tue 11am"
    assert pick_offered_window("the first one", offered) == "Tue 11am"
    assert pick_offered_window("second", offered) == "Wed 4pm"
    assert pick_offered_window("yes", offered) is None


def test_empty_or_sent_drafts_fail():
    with pytest.raises(ValueError, match="empty"):
        assert_valid_first_touch_reply_text(
            "",
            windows=["Tue 11am", "Wed 4pm"],
            agent_token="Jordan",
            tone="warm",
        )
    with pytest.raises(ValueError, match="sent"):
        assert_valid_first_touch_reply_text(
            "Hi Sam — auto-sent. Tue 11am is held.",
            windows=["Tue 11am"],
            agent_token="Jordan",
            tone="direct",
            picked="Tue 11am",
        )


def test_compose_confirms_picked_window_in_voice():
    text = compose_first_touch_reply_sms(
        contact_first_name="Sam Rivera",
        agent_first_name="Jordan Lee",
        tone="direct",
        windows=[{"label": "Tue 11am"}, {"label": "Wed 4pm"}],
        picked="Tue 11am",
    )
    assert text
    assert "Sam" in text
    assert "Jordan" in text
    assert "Tue 11am" in text
    assert "is held" in text.lower()
    assert "chippy" not in text.lower()
    assert "sent" not in text.lower()


def test_compose_reoffers_two_windows_when_they_did_not_pick():
    text = compose_first_touch_reply_sms(
        contact_first_name="Sam",
        agent_first_name="Jordan",
        tone="warm",
        windows=[{"label": "Thu 11am"}, {"label": "Fri 4pm"}],
    )
    assert "Thu 11am" in text
    assert "Fri 4pm" in text
    assert text.strip()


def test_opening_prompt_names_the_reply_job():
    block = first_touch_reply_instruction(
        [{"event": "inbound_message", "contactId": "c1"}]
    )
    assert block is not None
    assert "Never send" in block
    assert "book" in block.lower()
    assert "c1" in block
    assert first_touch_reply_instruction([{"event": "new_lead", "contactId": "c1"}]) is None


def test_extract_windows_from_first_touch_body():
    labels = extract_window_labels(
        "Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?"
    )
    assert labels == ["Tue 11am", "Wed 4pm"]
