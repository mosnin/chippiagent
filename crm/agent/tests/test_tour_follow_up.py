"""Tour-completed follow-up SMS — fail if sent, live, booked, or not pending."""

from __future__ import annotations

from pathlib import Path

import pytest

from tour_follow_up import (
    TOUR_COMPLETED_EVENT,
    assert_pending_draft_persist,
    assert_valid_tour_follow_up_text,
    compose_tour_follow_up_sms,
    is_tour_completed_event,
    is_tour_follow_up_draft,
    tour_follow_up_instruction,
)


SOURCE = Path(__file__).resolve().parents[1] / "tour_follow_up.py"


def test_source_never_sends():
    text = SOURCE.read_text()
    assert "send_sms" not in text
    assert '"status": "sent"' not in text
    assert '"status": "live"' not in text
    assert '"status": "booked"' not in text
    assert "Chippy" not in text
    assert '"status": "pending"' in text


def test_tour_completed_event():
    assert TOUR_COMPLETED_EVENT == "tour_completed"
    assert is_tour_completed_event("tour_completed")
    assert not is_tour_completed_event("new_lead")
    assert not is_tour_completed_event("inbound_message")
    assert not is_tour_completed_event("deal_stage_changed")
    assert not is_tour_completed_event("goal_completed")


def test_empty_or_sent_drafts_fail():
    with pytest.raises(ValueError, match="empty"):
        assert_valid_tour_follow_up_text("", agent_token="Jordan", tone="warm")
    with pytest.raises(ValueError, match="sent"):
        assert_valid_tour_follow_up_text(
            "Hi Sam — sent this automatically. Thoughts on 1422 Pine?",
            agent_token="Jordan",
            tone="direct",
        )


def test_copy_lie_rejectors():
    for body in (
        "Hey Sam, this is Jordan. Showing is live. Want to talk next steps?",
        "Hey Sam, this is Jordan. Tue 11am is booked. Want to talk next steps?",
        "Hey Sam, this is Jordan. Time is reserved. Want to talk next steps?",
        "Hey Sam, this is Jordan. Slot is locked. Want to talk next steps?",
        "Hey Sam, this is Jordan. 1422 Pine is held. Want to talk next steps?",
    ):
        with pytest.raises(ValueError, match="booked"):
            assert_valid_tour_follow_up_text(body, agent_token="Jordan", tone="warm")
    with pytest.raises(ValueError, match="closed"):
        assert_valid_tour_follow_up_text(
            "Hey Sam, this is Jordan. The deal is closed. Want to talk next steps?",
            agent_token="Jordan",
            tone="warm",
        )


def test_compose_is_an_ask_in_assigned_voice():
    text = compose_tour_follow_up_sms(
        contact_first_name="Sam Rivera",
        agent_first_name="Jordan Lee",
        tone="direct",
        property_name="1422 Pine",
    )
    assert text
    assert "Sam" in text
    assert "Jordan" in text
    assert "1422 Pine" in text
    assert "chippy" not in text.lower()
    for word in ("sent", "booked", "live", "reserved", "locked", "held"):
        assert word not in text.lower()


def test_persist_must_stay_pending():
    with pytest.raises(ValueError, match="pending"):
        assert_pending_draft_persist({"status": "sent"})
    with pytest.raises(ValueError, match="pending"):
        assert_pending_draft_persist({"status": "live"})
    with pytest.raises(ValueError, match="pending"):
        assert_pending_draft_persist({"status": "booked"})
    assert_pending_draft_persist({"status": "pending"})


def test_opening_prompt_names_the_follow_up_job():
    block = tour_follow_up_instruction(
        [{"event": "tour_completed", "contactId": "c1", "tourId": "t1"}]
    )
    assert block is not None
    assert "Never send" in block
    assert "c1" in block
    assert tour_follow_up_instruction([{"event": "new_lead", "contactId": "c1"}]) is None
    assert is_tour_follow_up_draft(
        {"reasoning": "Tour-completed follow-up SMS — ask how the showing felt"}
    )
    assert not is_tour_follow_up_draft({"reasoning": "First-touch SMS"})
