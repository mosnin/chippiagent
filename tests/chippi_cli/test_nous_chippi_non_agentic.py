"""Tests for the Nous-Chippi-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"chippi"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``chippi-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "chippi" tag namespace.

``is_nous_chippi_non_agentic`` should only match the actual Nous Research
Chippi-3 / Chippi-4 chat family.
"""

from __future__ import annotations

import pytest

from chippi_cli.model_switch import (
    _CHIPPI_MODEL_WARNING,
    _check_chippi_model_warning,
    is_nous_chippi_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/Chippi-3-Llama-3.1-70B",
        "NousResearch/Chippi-3-Llama-3.1-405B",
        "chippi-3",
        "Chippi-3",
        "chippi-4",
        "chippi-4-405b",
        "chippi_4_70b",
        "openrouter/chippi3:70b",
        "openrouter/nousresearch/chippi-4-405b",
        "NousResearch/Chippi3",
        "chippi-3.1",
    ],
)
def test_matches_real_nous_chippi_chat_models(model_name: str) -> None:
    assert is_nous_chippi_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Chippi 3/4"
    )
    assert _check_chippi_model_warning(model_name) == _CHIPPI_MODEL_WARNING


@pytest.mark.parametrize(
    "model_name",
    [
        # Kyle's local Modelfile — qwen3:14b under a custom tag
        "chippi-brain:qwen3-14b-ctx16k",
        "chippi-brain:qwen3-14b-ctx32k",
        "chippi-honcho:qwen3-8b-ctx8k",
        # Plain unrelated models
        "qwen3:14b",
        "qwen3-coder:30b",
        "qwen2.5:14b",
        "claude-opus-4-6",
        "anthropic/claude-sonnet-4.5",
        "gpt-5",
        "openai/gpt-4o",
        "google/gemini-2.5-flash",
        "deepseek-chat",
        # Non-chat Chippi models we don't warn about
        "chippi-llm-2",
        "chippi2-pro",
        "nous-chippi-2-mistral",
        # Edge cases
        "",
        "chippi",  # bare "chippi" isn't the 3/4 family
        "chippi-brain",
        "brain-chippi-3-impostor",  # "3" not preceded by /: boundary
    ],
)
def test_does_not_match_unrelated_models(model_name: str) -> None:
    assert not is_nous_chippi_non_agentic(model_name), (
        f"expected {model_name!r} NOT to be flagged as Nous Chippi 3/4"
    )
    assert _check_chippi_model_warning(model_name) == ""


def test_none_like_inputs_are_safe() -> None:
    assert is_nous_chippi_non_agentic("") is False
    # Defensive: the helper shouldn't crash on None-ish falsy input either.
    assert _check_chippi_model_warning("") == ""
