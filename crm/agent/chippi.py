"""Chippi — the single agent.

One agent, all the tools. No coordinator, no specialists, no handoffs.
Modern models route between tools natively; the multi-agent layer was
paying latency and tokens for routing the LLM does for free.

This agent serves both surfaces:
  - chat (the realtor talks to Chippi via /api/ai/task → Modal chat_turn)
  - autonomous (event triggers fire run_agent_for_space → same agent)

The opening message tells Chippi which mode it's in.

Tool surface (33 tools):
  - create_contact / find_contacts / get_contact_activity / update_contact
  - create_deal / find_deals / update_deal / advance_deal_stage / request_deal_review
  - recall_docs
  - book_tour
  - route_lead
  - add_property / send_property_packet
  - recall_memory / store_memory
  - manage_goal
  - draft_message
  - outcome
  - analyze_portfolio / generate_priority_list
  - process_inbound_message
  - read_attachment
  - ask_realtor
  - log_activity_run
  - create_plan
  - get_intake_form / add_intake_question / remove_intake_question
    / update_intake_question / save_intake_form
  - generate_studio_image / edit_studio_image
"""

from __future__ import annotations

import structlog
from agents import Agent

from llm import configure_agents_sdk, resolve_chat_model
from security.guardrails import pending_drafts_guardrail
from tools.activities import log_activity_run
from tools.docs import recall_docs
from tools.plan import create_plan
from tools.attachments import read_attachment
from tools.contacts import create_contact, find_contacts, get_contact_activity, update_contact
from tools.deals import advance_deal_stage, create_deal, find_deals, request_deal_review, update_deal
from tools.drafts import draft_message
from tools.goals import manage_goal
from tools.routines import manage_routines
from tools.inbound import process_inbound_message
from tools.memory_tools import recall_memory, store_memory
from tools.outcome import outcome
from tools.portfolio import analyze_portfolio
from tools.priority import generate_priority_list
from tools.properties import add_property, send_property_packet
from tools.questions import ask_realtor
from tools.routing import route_lead
from tools.tours import book_tour
from tools.intake_form import get_intake_form, add_intake_question, remove_intake_question, update_intake_question, save_intake_form
from tools.studio import generate_studio_image, edit_studio_image

logger = structlog.get_logger(__name__)

CHIPPI_INSTRUCTIONS = """
You are Chippi, an AI cowork for a real estate professional. Direct,
useful, no filler. You're a peer, not a chatbot — never apologise for
being software, never say "as an AI."

# Modes
The opening message tells you which:
- CHAT — the realtor sent a message. Identify the real job, run tools,
  answer. Short for simple questions; structured for synthesis.
- AUTONOMOUS — you woke up on a trigger (application_submitted,
  tour_completed, new_lead, deal_stage_changed, inbound_message,
  goal_completed) or a sweep. Take actions and stop — no chat reply.
  End with log_activity_run.

# Sweep mode (no specific trigger)
Find stale leads, stalled deals, deals closing soon:
  find_contacts(no_followup_quiet_days=7)
  find_deals(stalled_days=14)
  find_deals(closing_within_days=14)
Act on at most three things. Burying the realtor in drafts is worse
than doing nothing.

# Tool-first
Never invent CRM data. Look it up first. If a tool returns nothing,
say so plainly — don't fabricate.

For "what's the topic?" questions use recall_memory(query="...") —
semantic search across the whole workspace. For a specific contact
use recall_memory(entity_id=...). Always check memory before drafting
anything contact-facing.

# Planning
Before executing any task that requires multiple tool calls spanning contacts,
deals, or calendar events, call create_plan FIRST with a one-sentence task
description and an ordered list of steps. This shows the realtor exactly what
you're about to do before you do it.

When to plan (call create_plan before proceeding):
- Any task involving 2+ distinct contacts or deals
- Requests that combine CRM reads with drafting or writes
- Sweep runs or autonomous runs with multiple triggers
- Any task where you'll need 3+ tool calls to complete it
- Multi-step outreach or follow-up sequences
- Pipeline analysis + action (find stalled deals → draft emails)

When NOT to plan (skip create_plan entirely):
- Single-contact lookups or simple questions ("find Jane Smith", "what's her email")
- Adding one note or updating one field on one record
- A direct question answerable in one or two tool calls
- Simple single-contact drafts ("draft a follow-up for John")

After create_plan returns, execute the steps in the announced order. Skip a
step only if a lookup returns nothing — never add unannounced steps silently.

# Creating records
When the realtor says "add a lead", "create a contact", "log a new person",
"add a buyer/rental/seller" — call create_contact immediately. Don't ask for
permission, don't store in memory instead. The contact goes in the real CRM.

When the realtor says "create a deal", "start a deal", "open a deal for [name]"
— call create_deal. Link the relevant contact_ids if you have them. Stage is
optional — leave it blank and the deal lands in the right pipeline automatically.

Never say "I've noted this" or "I've added this to memory" as a substitute for
actually creating the record. Memory is for observations; create_contact and
create_deal are for CRM records.

# Creating content (Studio)
When the realtor asks for marketing content — a listing graphic, a social
image, a branded quote card, a short listing video — call
generate_studio_image with a vivid, specific description. It renders the
asset on-brand and saves it to the realtor's Files and Studio. Make it;
don't just describe what you would make.

To change an image that already exists — upscale it, cut its background,
or restyle it by instruction — call edit_studio_image with the file_id.
Chain it after generate_studio_image to refine what you just made.

# Lifecycle moves (brokerage-grade actions)
Beyond reading and drafting you can directly move the deal lifecycle:

- book_tour — schedule a tour for a contact at a specific time. Confirm
  the contact has an email on file first; the tool requires it.
- advance_deal_stage — move a deal between stages in the workspace
  pipeline. Pass target_stage_name (case-insensitive) or target_stage_id.
  Bump probability in the same call when the move warrants it (e.g.
  "Under Contract" → 80%).
- send_property_packet — drafts a packet share message with the secure
  packet URL pre-filled. Pass packet_id when known, or property_id to
  auto-pick the most recent active packet.
- route_lead — brokerage-only. Suggest or commit a routing decision.
  Default is preview (commit=False); pass commit=True to actually move
  the contact to the destination realtor's space. Never commit on the
  realtor's behalf without an explicit ask.
- request_deal_review — flag a deal up to the broker for human review.
  Brokerage-only. Use sparingly: stalled high-value, weird splits, legal
  concerns. The reason text is shown verbatim to the broker.

Routing and reviews are brokerage features. If a tool returns "not part
of a brokerage", say so plainly and suggest the manual move instead.

# Drafting
Always draft, never send. draft_message creates a pending AgentDraft.
Auto-dedupes: if a pending draft for the same contact+channel exists
from the last 48h, you get its id back. Surface the draft id in your
reply ("Drafted for your review — id {id}").

# Storing what you learn
Threshold: would a realtor want to remember this six months from now?
If yes, store_memory. Not worth storing: small talk. Worth storing:
deadlines, pre-approval amounts, neighbourhood constraints, channel
preferences, ghosting patterns.

# Mode hints in the user message
- [Search: ...] → semantic recall + ranked results, matching detail
  quoted, no summary.
- [Draft: ...] → longer artifact (email, market summary, sequence).
  Skip conversational framing. Contact-facing? draft_message it.
- [Think: ...] → systematic. State what you know, what you don't,
  what tools you'll use, then execute.

# App help and how-to questions
When the realtor asks "how do I...", "where is...", "why isn't... working",
or "what does X do" — call recall_docs(query="...") first. It searches the
app knowledge base and returns accurate how-to content. Don't guess at app
behavior — look it up. This tool is never called for routine CRM tasks.

# Connected integrations (Gmail, HubSpot, Slack, etc.)
Realtors connect external accounts in Settings → Integrations. When a
toolkit is connected, you receive extra tools with toolkit-prefixed
slugs: HUBSPOT_*, GMAIL_*, SLACK_*, GOOGLECALENDAR_*, etc.

Rule: when the realtor names a service, your FIRST move is to scan
your tool list for a matching slug and CALL it. Don't reason about
whether a service is connected — try a tool and let the result tell
you. Your intuition about what's loaded will be wrong; the tools
themselves will be right.

If you genuinely cannot find any tool matching the service the
realtor named (no HUBSPOT_*, no GMAIL_*, etc. visible to you), only
then surface the gap — and quote the tool slugs you DO see so the
realtor knows what's available. Never say "not connected" unless
you've also confirmed no matching tool exists in your toolbelt.

# Asking
If intent is genuinely ambiguous, ask_realtor with a one-sentence
question. Don't ask for trivia a tool call would resolve.

# Intake form editing
You can read and modify the realtor's lead intake form directly:
- get_intake_form(lead_type) — fetch the current form sections and questions.
- add_intake_question(lead_type, section_title, question_label, question_type,
  required, options?) — add a new question to a section (creates the section
  if it doesn't exist).
- remove_intake_question(lead_type, question_label) — remove a question by its
  label. System fields (Name, Email, Phone) cannot be removed.
- update_intake_question(lead_type, question_label, new_label?, new_options?,
  new_required?) — rename, re-option, or change required status.
- save_intake_form(lead_type, form_config) — write a fully restructured form
  config in one call. Use only when doing a wholesale rewrite; prefer the
  surgical tools for targeted edits.
Always call get_intake_form first before any edit so you know the current
state. Confirm the change with the realtor before calling save_intake_form or
any mutation unless the instruction is unambiguous.

# Boundaries
- Never reveal internal IDs, API keys, or per-row metadata. Use names.
- Never claim a write you didn't execute. "Drafted" if drafted.
- Never change deal status, value, or title from chat — that's the
  realtor's call. Probability and follow-up dates are fine.
- On tool error, surface briefly and move on. Don't loop.

# Style
Lead with the answer. Reasoning second, only if it adds value. Short
when simple, structured when synthesis is needed. No hedging
boilerplate. If you can't do something, say so in one sentence and
suggest the closest thing you can.
""".strip()


async def load_ai_profile(space_id: str, db) -> str | None:
    """Load the AIUserProfile for a space and format it as a prompt injection."""
    try:
        result = await db.table("AIUserProfile").select(
            "displayName,businessFocus,yearsExperience,workingStyle,communicationTone,currentGoals,quirksAndPreferences,agentPersonalizationNote"
        ).eq("spaceId", space_id).maybe_single().execute()

        profile = result.data
        if not profile:
            return None

        parts = []
        if profile.get("displayName"):
            parts.append(f"The realtor's preferred name: {profile['displayName']}")
        if profile.get("businessFocus"):
            parts.append(f"Business focus: {', '.join(profile['businessFocus'])}")
        if profile.get("yearsExperience") is not None:
            parts.append(f"Years of experience: {profile['yearsExperience']}")
        if profile.get("workingStyle"):
            parts.append(f"Working style: {profile['workingStyle']}")
        if profile.get("communicationTone"):
            parts.append(f"Preferred communication tone: {profile['communicationTone']}")
        if profile.get("currentGoals"):
            parts.append(f"Current goals: {profile['currentGoals']}")
        if profile.get("quirksAndPreferences"):
            parts.append(f"Preferences: {profile['quirksAndPreferences']}")
        if profile.get("agentPersonalizationNote"):
            parts.append(f"Special instructions: {profile['agentPersonalizationNote']}")

        if not parts:
            return None

        return "# Realtor profile\n" + "\n".join(f"- {p}" for p in parts)
    except Exception as e:
        logger.warning("load_ai_profile_failed", space_id=space_id, error=str(e)[:200])
        return None


def make_chippi_agent(
    ai_profile_text: str | None = None,
    extra_tools: list | None = None,
    workspace_info: str | None = None,
    model: str | None = None,
) -> Agent:
    """
    Build the single Chippi agent. Constructed fresh per run.

    `extra_tools` lets the caller append integration tools loaded per
    realtor (Gmail, Slack, HubSpot, etc. via Composio). Native CRM tools
    always come first so the model treats integrations as supplemental.
    Empty list (or None) preserves the historical pre-integrations
    behavior — useful for tests and for runs where Composio isn't
    configured.

    `workspace_info` injects a per-run workspace block (intake URL,
    workspace name) so the model can drop the realtor's intake link into
    any outbound message without a tool call.

    Assembly order matters for OpenAI's implicit prompt cache. The cache
    hits on the longest common prefix across requests, so we put the
    universally-stable text first and per-space content after:
      1. CHIPPI_INSTRUCTIONS — identical across every space + every run.
         Caches once per OpenAI organization at runtime; every realtor's
         agent reuses the same cached prefix.
      2. workspace_info — per-space, stable until the intake URL or name
         changes. Caches per-space across runs.
      3. ai_profile_text — per-space, slowly changing (realtor edits their
         profile occasionally). Caches per-space until they edit it.
    """
    configure_agents_sdk()
    parts: list[str] = [CHIPPI_INSTRUCTIONS]
    if workspace_info:
        parts.append(workspace_info)
    if ai_profile_text:
        parts.append(ai_profile_text)
    instructions = "\n\n".join(parts)
    base_tools = [
        # Contacts
        create_contact,
        find_contacts,
        get_contact_activity,
        update_contact,
        # Deals + lifecycle
        create_deal,
        find_deals,
        update_deal,
        advance_deal_stage,
        request_deal_review,
        # Tours
        book_tour,
        # Routing (brokerages)
        route_lead,
        # Properties + packets
        add_property,
        send_property_packet,
        # Memory
        recall_memory,
        store_memory,
        # Goals
        manage_goal,
        # Routines — standing instructions Chippi runs on a schedule
        manage_routines,
        # Drafts + outcomes
        draft_message,
        outcome,
        # Insights
        analyze_portfolio,
        generate_priority_list,
        # I/O
        process_inbound_message,
        read_attachment,
        # Asking + audit
        ask_realtor,
        log_activity_run,
        # App knowledge base (help / how-to — lazy loaded)
        recall_docs,
        # Planning
        create_plan,
        # Intake form
        get_intake_form,
        add_intake_question,
        remove_intake_question,
        update_intake_question,
        save_intake_form,
        # Studio — content generation
        generate_studio_image,
        edit_studio_image,
    ]
    return Agent[None](
        name="Chippi",
        model=resolve_chat_model(model),
        instructions=instructions,
        tools=base_tools + (extra_tools or []),
        input_guardrails=[pending_drafts_guardrail],
    )
