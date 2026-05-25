"""Pydantic models mirroring the TypeScript types in lib/types.ts.

Keep in sync with supabase/schema.sql and lib/types.ts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums / Literals
# ---------------------------------------------------------------------------

LeadType = Literal["rental", "buyer", "seller"]
DealStatus = Literal["active", "won", "lost", "on_hold"]
Priority = Literal["LOW", "MEDIUM", "HIGH"]
ContactType = Literal["QUALIFICATION", "TOUR", "APPLICATION"]
DraftChannel = Literal["sms", "email", "note"]
DraftStatus = Literal["pending", "approved", "dismissed", "sent"]
ActionOutcome = Literal["completed", "queued_for_approval", "suggested", "failed"]
MemoryType = Literal["fact", "preference", "observation", "reminder"]
EntityType = Literal["contact", "deal", "space"]


# ---------------------------------------------------------------------------
# CRM entities (read from DB)
# ---------------------------------------------------------------------------

class Contact(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    name: str
    email: str | None = None
    phone: str | None = None
    lead_type: LeadType | None = Field(None, alias="leadType")
    address: str | None = None
    notes: str | None = None
    budget: float | None = None
    tags: list[str] = Field(default_factory=list)
    lead_score: int | None = Field(None, alias="leadScore")
    score_label: str | None = Field(None, alias="scoreLabel")
    follow_up_at: datetime | None = Field(None, alias="followUpAt")
    last_contacted_at: datetime | None = Field(None, alias="lastContactedAt")
    type: ContactType = "QUALIFICATION"
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class DealMilestone(BaseModel):
    id: str
    label: str
    due_date: str | None = Field(None, alias="dueDate")
    completed: bool = False
    completed_at: datetime | None = Field(None, alias="completedAt")

    model_config = {"populate_by_name": True}


class Deal(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    title: str
    description: str | None = None
    value: float | None = None
    address: str | None = None
    priority: Priority = "MEDIUM"
    close_date: str | None = Field(None, alias="closeDate")
    stage_id: str | None = Field(None, alias="stageId")
    status: DealStatus = "active"
    follow_up_at: datetime | None = Field(None, alias="followUpAt")
    commission_rate: float | None = Field(None, alias="commissionRate")
    probability: int | None = None
    milestones: list[DealMilestone] = Field(default_factory=list)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class Space(BaseModel):
    id: str
    slug: str
    name: str


# ---------------------------------------------------------------------------
# Agent tables
# ---------------------------------------------------------------------------

class AgentSettings(BaseModel):
    """Per-space agent configuration.

    Autonomy modes, per-agent overrides, confidence thresholds, and the
    enabled-agents list have all been retired — Chippi is one agent and
    every contact-facing action drafts. The DB columns still exist for
    backwards compat with the UI; we just don't read them. `extra="ignore"`
    keeps existing rows loadable without a migration.
    """

    id: str
    space_id: str = Field(alias="spaceId")
    enabled: bool = False
    daily_token_budget: int = Field(50_000, alias="dailyTokenBudget")
    # Realtor-picked primary chat model (OpenRouter slug). None = app default.
    chat_model: str | None = Field(None, alias="chatModel")

    model_config = {"populate_by_name": True, "extra": "ignore"}


class AgentDraft(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    contact_id: str | None = Field(None, alias="contactId")
    deal_id: str | None = Field(None, alias="dealId")
    channel: DraftChannel
    subject: str | None = None
    content: str
    reasoning: str | None = None
    priority: int = 0
    status: DraftStatus = "pending"
    confidence: int | None = None
    outcome: str | None = None
    outcome_detected_at: datetime | None = Field(None, alias="outcomeDetectedAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class AgentActivityLogEntry(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    run_id: str = Field(alias="runId")
    agent_type: str = Field(alias="agentType")
    action_type: str = Field(alias="actionType")
    reasoning: str | None = None
    outcome: ActionOutcome
    related_contact_id: str | None = Field(None, alias="relatedContactId")
    related_deal_id: str | None = Field(None, alias="relatedDealId")
    reversible: bool = True
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class AgentGoal(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    contact_id: str | None = Field(None, alias="contactId")
    deal_id: str | None = Field(None, alias="dealId")
    goal_type: str = Field(alias="goalType")
    description: str
    instructions: str | None = None
    status: str = "active"
    priority: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    completed_at: datetime | None = Field(None, alias="completedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class AgentQuestion(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    run_id: str = Field(alias="runId")
    agent_type: str = Field(alias="agentType")
    question: str
    context: str | None = None
    status: str = "pending"
    answer: str | None = None
    answered_at: datetime | None = Field(None, alias="answeredAt")
    priority: int = 0
    contact_id: str | None = Field(None, alias="contactId")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}
