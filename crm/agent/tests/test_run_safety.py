"""Unit tests for orchestrator safety helpers. No Agents SDK required."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from run_safety import (
    STREAM_TIMEOUT_S,
    bind_space_id,
    cancel_stream,
    coerce_lpop_items,
    stored_stream_error,
)


def test_stream_timeout_leaves_time_to_requeue_before_modal_kill():
    assert STREAM_TIMEOUT_S < 600
    assert STREAM_TIMEOUT_S >= 60


def test_bind_space_id_requires_match():
    assert bind_space_id(space_id="space-a", settings_space_id="space-a") == "space-a"
    with pytest.raises(ValueError, match="tenant mismatch"):
        bind_space_id(space_id="space-a", settings_space_id="space-b")
    with pytest.raises(ValueError, match="space_id required"):
        bind_space_id(space_id="", settings_space_id="")
    with pytest.raises(ValueError, match="tenant mismatch"):
        bind_space_id(space_id="space-a", settings_space_id="")


def test_coerce_lpop_string_is_one_item_not_characters():
    raw = '{"event":"new_lead","contactId":"c1"}'
    items = coerce_lpop_items(raw)
    assert items == [raw]
    assert len(items) == 1


def test_coerce_lpop_list_and_empty():
    assert coerce_lpop_items(None) == []
    assert coerce_lpop_items(["a", "b"]) == ["a", "b"]
    assert coerce_lpop_items({"event": "new_lead"}) == [{"event": "new_lead"}]


def test_stored_stream_error_raises_parked_exception():
    class Result:
        _exception = RuntimeError("stream died")

    exc = stored_stream_error(Result())
    assert isinstance(exc, RuntimeError)
    assert "stream died" in str(exc)
    assert stored_stream_error(object()) is None


def test_cancel_stream_calls_cancel():
    class Result:
        def __init__(self):
            self.cancelled = False

        def cancel(self):
            self.cancelled = True

    result = Result()
    cancel_stream(result)
    assert result.cancelled
    cancel_stream(object())  # no cancel attr — must not raise
