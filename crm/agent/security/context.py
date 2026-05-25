"""AgentContext — runtime-injected security boundary.

spaceId is NEVER taken from LLM tool arguments. It is injected once when the
agent run starts and flows through every tool call via RunContextWrapper.
This prevents prompt-injection attacks from crossing tenant boundaries.

Autonomy is fixed: every contact-facing action drafts. There is no per-space
or per-agent override. Configuration is failure to decide.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from schemas import AgentSettings


@dataclass
class AgentContext:
    """Per-run context injected at orchestration time."""

    space_id: str
    space_name: str
    daily_token_budget: int
    run_id: str

    # Tokens consumed so far this run (mutable — updated after each LLM call)
    tokens_used: int = field(default=0, compare=False)
    # Audit-log tag — fixed to "chippi" since there is one agent. Tools read
    # this when stamping AgentActivityLog rows; keep the field so call sites
    # don't have to special-case the single-agent world.
    current_agent_type: str = field(default="chippi", compare=False)

    @classmethod
    def from_settings(cls, settings: AgentSettings, run_id: str, space_name: str) -> "AgentContext":
        return cls(
            space_id=settings.space_id,
            space_name=space_name,
            daily_token_budget=settings.daily_token_budget,
            run_id=run_id,
        )

