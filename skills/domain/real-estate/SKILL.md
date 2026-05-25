---
name: real-estate
description: Realtor CRM tools — contacts, deals, tours, properties, intake, studio.
version: 0.1.0
author: chippi
license: MIT
platforms: [linux, macos]
prerequisites:
  env_vars: [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY]
metadata:
  chippi:
    tags: [crm, real-estate, contacts, deals, properties, tours, drafts]
    category: domain
    related_skills: []
    source: crm/agent/
---

# Real Estate Skill

Wraps the Chippi CRM agent (`crm/agent/`) — a realtor-facing assistant that
reads, writes, and acts on a Supabase-backed real-estate workspace. Use this
skill when the user is a realtor asking about contacts, deals, properties,
tours, intake forms, or marketing assets, or when an autonomous trigger
(new lead, tour completed, inbound message, etc.) needs to be processed.

The skill exposes 34 native tools sourced from `crm/agent/tools/`. They run
against a per-realtor `spaceId` injected via `AgentContext` — never hardcode
ids; the runtime supplies them.

## When to Use

Trigger this skill when the request touches any of:

- A named contact / lead / buyer / seller / rental prospect
- A deal or pipeline stage
- A property, listing, or packet
- A scheduled tour
- The realtor's intake form or routing rules
- Marketing graphics or short videos for a listing
- Stalled pipeline sweeps and priority lists

Do NOT use this skill for: generic web search, code editing, or anything that
isn't anchored to a real-estate workspace record.

## Prerequisites

- Supabase backing the CRM (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- OpenAI key for the underlying agent (`OPENAI_API_KEY`)
- Optional: Composio integrations (Gmail, Slack, HubSpot, GoogleCalendar)
  surface as toolkit-prefixed tools (`GMAIL_*`, etc.) when the realtor has
  connected them — not part of the 34-tool native surface.

The native CRM tools are defined under `crm/agent/tools/`. Pydantic schemas
they read/write live in `crm/agent/schemas.py` (`Contact`, `Deal`, `Space`,
`AgentSettings`, `AgentDraft`, `AgentActivityLogEntry`, `AgentGoal`,
`AgentQuestion`).

## Execution Modes

The opening message of every run tells the agent which mode it is in. The
agent is one entity — no coordinator, no specialists, no handoffs.

### CHAT mode

The realtor sent a message via `/api/ai/task` (Modal `chat_turn`). Identify
the real job, run tools, answer in chat. Short for simple questions;
structured for synthesis. Drafts surface a draft id ("Drafted for your
review — id {id}") rather than sending anything.

### AUTONOMOUS mode

Woken up by a trigger (`application_submitted`, `tour_completed`,
`new_lead`, `deal_stage_changed`, `inbound_message`, `goal_completed`) or
a periodic sweep. Take actions and stop — no chat reply. Always end with
`log_activity_run` so the realtor has an audit trail.

Sweep mode (no specific trigger):
- `find_contacts(no_followup_quiet_days=7)`
- `find_deals(stalled_days=14)`
- `find_deals(closing_within_days=14)`

Act on at most three things per sweep. Burying the realtor in drafts is
worse than doing nothing.

## Tool Surface (34)

Every tool below is wired in `crm/agent/chippi.py::make_chippi_agent`.
Source paths are relative to repo root.

### Contacts (`crm/agent/tools/contacts.py`)
| Tool | What it does |
|---|---|
| `create_contact` | Create a new contact (lead / buyer / seller / rental) in the workspace. |
| `find_contacts` | Find contacts by id, name substring, lead type, overdue follow-up, or quiet-days sweep filter. |
| `get_contact_activity` | Most recent activity entries for a contact. |
| `update_contact` | Update a contact. Pass only fields to change. |

### Deals (`crm/agent/tools/deals.py`)
| Tool | What it does |
|---|---|
| `create_deal` | Create a new deal in a pipeline stage. Links contact ids when known. |
| `find_deals` | Find deals; supports stalled-days and closing-within-days filters used by sweeps. |
| `update_deal` | Update a deal. Probability and follow-up dates only from chat — never status/value/title. |
| `advance_deal_stage` | Move a deal between pipeline stages by stage name (case-insensitive) or id. |
| `request_deal_review` | Brokerage-only. Flag a deal up to the broker for human review. |

### Tours (`crm/agent/tools/tours.py`)
| Tool | What it does |
|---|---|
| `book_tour` | Book a tour for a contact at a specific time. Requires contact email on file. |

### Routing (`crm/agent/tools/routing.py`)
| Tool | What it does |
|---|---|
| `route_lead` | Brokerage-only. Preview by default (`commit=False`); set `commit=True` to actually move the contact to the destination realtor's space. |

### Properties (`crm/agent/tools/properties.py`)
| Tool | What it does |
|---|---|
| `add_property` | Add a property to the realtor's inventory. |
| `send_property_packet` | Draft a packet share message with the secure packet URL pre-filled. Pass `packet_id` when known, or `property_id` to auto-pick the most recent active packet. |

### Memory (`crm/agent/tools/memory_tools.py`)
| Tool | What it does |
|---|---|
| `recall_memory` | Semantic recall across the workspace. Use `query=` for topic search, `entity_id=` for a specific contact. Always check before drafting anything contact-facing. |
| `store_memory` | Store a memory for future runs. Auto-embedded. Threshold: would a realtor want this six months from now? |

### Goals & routines (`crm/agent/tools/goals.py`, `crm/agent/tools/routines.py`)
| Tool | What it does |
|---|---|
| `manage_goal` | Manage persistent agent goals (create / list / update / complete). |
| `manage_routines` | Manage the realtor's routines — standing instructions Chippi runs on a schedule. |

### Drafting & outcomes (`crm/agent/tools/drafts.py`, `crm/agent/tools/outcome.py`)
| Tool | What it does |
|---|---|
| `draft_message` | Create a pending draft (`AgentDraft`) for the realtor to approve. Auto-dedupes within 48h on contact+channel. NEVER sends. |
| `outcome` | Record an outcome or summarise outcomes. |

### Insights (`crm/agent/tools/portfolio.py`, `crm/agent/tools/priority.py`)
| Tool | What it does |
|---|---|
| `analyze_portfolio` | Analyse the full contact and deal portfolio for the space. |
| `generate_priority_list` | Generate a ranked list of contacts the realtor should focus on today. |

### I/O (`crm/agent/tools/inbound.py`, `crm/agent/tools/attachments.py`)
| Tool | What it does |
|---|---|
| `process_inbound_message` | Process a reply received from a contact. |
| `read_attachment` | Read the contents of a chat attachment by id (PDF / DOCX / XLSX / text). |

### Asking & audit (`crm/agent/tools/questions.py`, `crm/agent/tools/activities.py`)
| Tool | What it does |
|---|---|
| `ask_realtor` | Ask the realtor a one-sentence question when intent is genuinely ambiguous. Not for trivia a tool call would resolve. |
| `log_activity_run` | Persist an entry to `AgentActivityLog` so the realtor has an audit trail. Required at the end of every autonomous run. |

### App help (`crm/agent/tools/docs.py`)
| Tool | What it does |
|---|---|
| `recall_docs` | Search the app knowledge base for help and how-to documentation. Use for "how do I…", "where is…", "what does X do" questions. |

### Planning (`crm/agent/tools/plan.py`)
| Tool | What it does |
|---|---|
| `create_plan` | Announce a structured execution plan BEFORE carrying out a complex task. Required for 2+ contacts/deals, 3+ tool calls, or any sweep/autonomous run. |

### Intake form (`crm/agent/tools/intake_form.py`)
| Tool | What it does |
|---|---|
| `get_intake_form` | Fetch the current intake form config for this space. Always call this first before any edit. |
| `add_intake_question` | Add a new question to a section (creates the section if it doesn't exist). |
| `remove_intake_question` | Remove a question by its label. System fields (Name / Email / Phone) cannot be removed. |
| `update_intake_question` | Rename, re-option, or change required status on an existing question. |
| `save_intake_form` | Replace the entire intake form config in one call. Use only for wholesale rewrites. |

### Studio — content generation (`crm/agent/tools/studio.py`)
| Tool | What it does |
|---|---|
| `generate_studio_image` | Generate a branded image or short video for the realtor with Studio. Saves to Files + Studio. |
| `edit_studio_image` | Edit an image the realtor already has (upscale, cut background, restyle by instruction). Pass `file_id`. Chain after `generate_studio_image` to refine. |

## Procedure

1. **Read the opening message** to determine CHAT vs AUTONOMOUS mode.
2. **Plan first** if the task needs 2+ contacts/deals, 3+ tool calls, or
   any sweep — call `create_plan` BEFORE other tools.
3. **Look up before fabricating.** `find_contacts`, `find_deals`,
   `recall_memory`, `recall_docs` are your eyes. If a tool returns
   nothing, say so plainly. Never invent CRM data.
4. **Mutate carefully.** Writes that change records (`create_contact`,
   `create_deal`, `advance_deal_stage`, `book_tour`, `add_property`)
   require explicit realtor intent. Status / value / title on a deal are
   off-limits from chat.
5. **Draft, never send.** Contact-facing output goes through
   `draft_message`. Surface the returned id.
6. **Store what matters.** `store_memory` for things a realtor will care
   about in six months — deadlines, pre-approvals, neighbourhood
   constraints, channel preferences, ghosting patterns.
7. **Close autonomous runs with `log_activity_run`.**

## Pitfalls

- `spaceId` is ALWAYS pulled from `AgentContext`. Don't surface it, don't
  let the realtor pass one. Cross-space reads silently return `[]`.
- Brokerage-only tools (`route_lead`, `request_deal_review`) return a
  "not part of a brokerage" error for solo realtors — surface it plainly
  and suggest the manual move.
- Connected integrations (Gmail, HubSpot, Slack, GoogleCalendar) arrive
  as TOOLKIT-prefixed tools at runtime — they are NOT in this skill's
  native surface. When the realtor names a service, scan the live tool
  list FIRST before claiming "not connected".
- `book_tour` requires the contact to have an email on file. Check with
  `find_contacts(contact_id=…)` first.
- `pending_drafts_guardrail` (`crm/agent/security/guardrails.py`) blocks
  certain inputs when drafts are unresolved — failures from it are
  intentional, not bugs.
- Intake-form edits always need `get_intake_form` first. For any
  mutation outside of unambiguous instructions, confirm with the realtor
  before calling `save_intake_form` or the surgical edit tools.

## Verification

Run mode is end-to-end through `crm/agent/chippi.py::make_chippi_agent`.
For a smoke test in isolation, import a tool directly and call it with a
mock `AgentContext` carrying a known `space_id` — see the existing CRM
test suite under `crm/agent/` for the canonical pattern. This skill is a
descriptor; it does not ship its own runtime.
