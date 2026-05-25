"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase — service role bypasses RLS; never expose to client
    supabase_url: str = Field(alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")

    # Direct Postgres connection for async reads (faster than REST for bulk queries)
    database_url: str = Field(alias="DATABASE_URL", default="")

    # OpenAI — embeddings + fallback when OpenRouter isn't configured.
    # Optional: a pure-OpenRouter deploy doesn't need it.
    openai_api_key: str = Field(alias="OPENAI_API_KEY", default="")

    # OpenRouter — primary LLM gateway. When set, every model call routes
    # through OpenRouter; empty falls back to calling OpenAI directly.
    openrouter_api_key: str = Field(alias="OPENROUTER_API_KEY", default="")

    # Upstash Redis — token budget enforcement
    kv_rest_api_url: str = Field(alias="KV_REST_API_URL", default="")
    kv_rest_api_token: str = Field(alias="KV_REST_API_TOKEN", default="")

    # Internal Next.js API base — agent uses this for write operations
    # so business-logic validation stays in one place
    app_url: str = Field(alias="NEXT_PUBLIC_APP_URL", default="http://localhost:3000")

    # Secret shared between Modal and the Next.js app for internal API calls
    agent_internal_secret: str = Field(alias="AGENT_INTERNAL_SECRET", default="")

    # Model for the swarm orchestrator's fan-out workers (the swarm sub-
    # agents). The main Chippi agent's model is the per-workspace pick
    # (see chippi.py / llm.py); this is swarm-only.
    worker_model: str = Field(default="x-ai/grok-4.3")

    # Context window management
    memory_chars_budget: int = Field(default=3_000)   # ~750 tokens for memory injection
    max_output_tokens: int = Field(default=4_096)      # cap LLM output per turn

    # Max tool-call turns the SDK runner will take in a single agent run
    # before stopping. One agent, no handoffs — 50 is generous headroom for
    # a sweep that acts on a handful of things.
    coordinator_max_turns: int = Field(default=50)

    model_config = {"populate_by_name": True, "env_file": ".env.local"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
