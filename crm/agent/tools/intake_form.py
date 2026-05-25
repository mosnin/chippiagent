"""Intake form tools — read and edit the realtor's lead intake form config.

The form config lives in SpaceSetting.rentalFormConfig / buyerFormConfig as
jsonb.  These tools give Chippi the ability to inspect and surgically modify
the form without the realtor having to open the form builder UI.

All mutations operate on a full read-modify-write cycle so concurrent writes
from the UI and the agent are handled gracefully (last-write-wins, which is
acceptable for form config at this scale).

spaceId always comes from AgentContext — never from tool arguments.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Literal

from agents import RunContextWrapper, function_tool

from db import supabase
from errors import from_supabase_error, from_exception
from security.context import AgentContext
from tools.base import idempotent_tool, with_retry
from tools.streaming import publish_event

# ---------------------------------------------------------------------------
# Types / constants
# ---------------------------------------------------------------------------

LeadType = Literal["rental", "buyer"]

VALID_QUESTION_TYPES = frozenset(
    {
        "text",
        "textarea",
        "email",
        "phone",
        "number",
        "select",
        "multi_select",
        "radio",
        "checkbox",
        "date",
    }
)

# System fields that are always present and must not be removed or relabelled.
_SYSTEM_LABELS = frozenset({"Name", "Email", "Phone"})

# ---------------------------------------------------------------------------
# Default form template — returned when no config has been saved yet.
# ---------------------------------------------------------------------------

def _default_form(lead_type: LeadType) -> dict[str, Any]:
    """Minimal valid IntakeFormConfig with the three required system fields."""
    return {
        "version": 1,
        "leadType": lead_type,
        "sections": [
            {
                "id": str(uuid.uuid4()),
                "title": "Contact Information",
                "position": 0,
                "questions": [
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "label": "Name",
                        "required": True,
                        "position": 0,
                        "system": True,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "email",
                        "label": "Email",
                        "required": True,
                        "position": 1,
                        "system": True,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "phone",
                        "label": "Phone",
                        "required": True,
                        "position": 2,
                        "system": True,
                    },
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _column(lead_type: LeadType) -> str:
    return "rentalFormConfig" if lead_type == "rental" else "buyerFormConfig"


async def _fetch_form(db, space_id: str, lead_type: LeadType) -> dict[str, Any]:
    """Read the form config from SpaceSetting. Returns the default template if
    no config has been saved yet."""
    col = _column(lead_type)
    result = await (
        db.table("SpaceSetting")
        .select(f"{col},formConfigSource")
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    row = result.data
    if not row or row.get(col) is None:
        return _default_form(lead_type)
    config = row[col]
    # Defensive: ensure the blob has the expected top-level shape.
    if not isinstance(config, dict) or "sections" not in config:
        return _default_form(lead_type)
    return config


async def _upsert_form(
    db,
    space_id: str,
    lead_type: LeadType,
    form_config: dict[str, Any],
) -> None:
    """Write the form config back to SpaceSetting, inserting the row if needed."""
    col = _column(lead_type)

    # Check whether a SpaceSetting row already exists for this space.
    existing = await (
        db.table("SpaceSetting")
        .select("spaceId")
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )

    if existing.data:
        await with_retry(
            lambda: db.table("SpaceSetting")
            .update({col: form_config, "formConfigSource": "custom"})
            .eq("spaceId", space_id)
            .execute()
        )
    else:
        await with_retry(
            lambda: db.table("SpaceSetting")
            .insert(
                {
                    "spaceId": space_id,
                    col: form_config,
                    "formConfigSource": "custom",
                }
            )
            .execute()
        )


def _find_question(
    form_config: dict[str, Any],
    question_label: str,
) -> tuple[dict[str, Any], dict[str, Any]] | tuple[None, None]:
    """Return (section, question) for the first question whose label matches
    (case-insensitive).  Returns (None, None) if not found."""
    needle = question_label.strip().lower()
    for section in form_config.get("sections", []):
        for q in section.get("questions", []):
            if q.get("label", "").strip().lower() == needle:
                return section, q
    return None, None


def _rebuild_positions(items: list[dict[str, Any]]) -> None:
    """Rewrite the 'position' field on a list of questions or sections in place."""
    for i, item in enumerate(items):
        item["position"] = i


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@function_tool
async def get_intake_form(
    ctx: RunContextWrapper[AgentContext],
    lead_type: LeadType,
) -> dict[str, Any]:
    """Fetch the current intake form config for this space.

    lead_type: 'rental' or 'buyer'.

    Returns the full IntakeFormConfig object with all sections and questions.
    If the realtor has not yet created a custom form, returns the default
    template (Name, Email, Phone system fields).
    """
    space_id = ctx.context.space_id
    try:
        db = await supabase()
        form = await _fetch_form(db, space_id, lead_type)
        return {"ok": True, "leadType": lead_type, "formConfig": form}
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}


@function_tool
@idempotent_tool
async def add_intake_question(
    ctx: RunContextWrapper[AgentContext],
    lead_type: LeadType,
    section_title: str,
    question_label: str,
    question_type: str,
    required: bool,
    options: list[str] | None = None,
) -> dict[str, Any]:
    """Add a new question to the intake form.

    lead_type: 'rental' or 'buyer'.
    section_title: The title of the section to add the question to.  If no
      section with that title exists, a new section is created.
    question_label: The visible label for the question, e.g. 'Move-in date'.
    question_type: One of: text, textarea, email, phone, number, select,
      multi_select, radio, checkbox, date.
    required: Whether the question must be answered before submission.
    options: Required for select / multi_select / radio questions.  Provide a
      list of option strings, e.g. ['Studio', '1BR', '2BR'].

    Returns the updated section with its new question list.
    """
    space_id = ctx.context.space_id

    # Validate question type
    if question_type not in VALID_QUESTION_TYPES:
        return {
            "error": (
                f"Invalid question_type '{question_type}'. "
                f"Must be one of: {', '.join(sorted(VALID_QUESTION_TYPES))}."
            ),
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    # Options are required for choice-based types
    choice_types = {"select", "multi_select", "radio"}
    if question_type in choice_types and not options:
        return {
            "error": f"question_type '{question_type}' requires at least one option.",
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    # Reject duplicate label against system fields for safety
    clean_label = question_label.strip()
    if clean_label in _SYSTEM_LABELS:
        return {
            "error": (
                f"'{clean_label}' is a system field and cannot be re-added. "
                "System fields (Name, Email, Phone) are always present."
            ),
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    try:
        db = await supabase()
        form = await _fetch_form(db, space_id, lead_type)

        # Check for duplicate label across all sections
        for section in form.get("sections", []):
            for q in section.get("questions", []):
                if q.get("label", "").strip().lower() == clean_label.lower():
                    return {
                        "error": (
                            f"A question labelled '{clean_label}' already exists in "
                            f"section '{section.get('title')}'. "
                            "Use update_intake_question to modify it."
                        ),
                        "code": "VALIDATION_ERROR",
                        "retryable": False,
                    }

        # Find or create the target section
        clean_section_title = section_title.strip()
        target_section: dict[str, Any] | None = None
        for s in form.get("sections", []):
            if s.get("title", "").strip().lower() == clean_section_title.lower():
                target_section = s
                break

        if target_section is None:
            target_section = {
                "id": str(uuid.uuid4()),
                "title": clean_section_title,
                "position": len(form.get("sections", [])),
                "questions": [],
            }
            form.setdefault("sections", []).append(target_section)

        # Build the new question
        new_question: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "type": question_type,
            "label": clean_label,
            "required": required,
            "position": len(target_section.get("questions", [])),
        }
        if options:
            new_question["options"] = [
                {"value": opt.strip(), "label": opt.strip()} for opt in options if opt.strip()
            ]

        target_section.setdefault("questions", []).append(new_question)

        await _upsert_form(db, space_id, lead_type, form)

        await publish_event(
            ctx.context,
            "action",
            f"Added question '{clean_label}' to {lead_type} intake form",
            agent_type=ctx.context.current_agent_type,
            metadata={"leadType": lead_type, "section": clean_section_title, "questionId": new_question["id"]},
        )

        return {
            "ok": True,
            "questionId": new_question["id"],
            "sectionTitle": target_section["title"],
            "leadType": lead_type,
        }
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}


@function_tool
@idempotent_tool
async def remove_intake_question(
    ctx: RunContextWrapper[AgentContext],
    lead_type: LeadType,
    question_label: str,
) -> dict[str, Any]:
    """Remove a question from the intake form by its label.

    lead_type: 'rental' or 'buyer'.
    question_label: The exact (case-insensitive) label of the question to remove.

    System fields (Name, Email, Phone) cannot be removed.
    Returns an error if the label is not found.
    """
    space_id = ctx.context.space_id

    clean_label = question_label.strip()
    if clean_label in _SYSTEM_LABELS:
        return {
            "error": (
                f"'{clean_label}' is a system field and cannot be removed. "
                "System fields (Name, Email, Phone) are always required."
            ),
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    try:
        db = await supabase()
        form = await _fetch_form(db, space_id, lead_type)

        section, question = _find_question(form, clean_label)
        if section is None or question is None:
            return {
                "error": (
                    f"No question labelled '{clean_label}' found in the {lead_type} intake form. "
                    "Use get_intake_form to see current questions."
                ),
                "code": "VALIDATION_ERROR",
                "retryable": False,
            }

        # Block removal of any question marked as a system field in the data
        if question.get("system"):
            return {
                "error": f"'{question.get('label')}' is marked as a system field and cannot be removed.",
                "code": "VALIDATION_ERROR",
                "retryable": False,
            }

        question_id = question.get("id")
        section["questions"] = [
            q for q in section["questions"] if q.get("id") != question_id
        ]
        _rebuild_positions(section["questions"])

        await _upsert_form(db, space_id, lead_type, form)

        await publish_event(
            ctx.context,
            "action",
            f"Removed question '{clean_label}' from {lead_type} intake form",
            agent_type=ctx.context.current_agent_type,
            metadata={"leadType": lead_type, "section": section.get("title"), "questionId": question_id},
        )

        return {
            "ok": True,
            "removedLabel": clean_label,
            "removedId": question_id,
            "leadType": lead_type,
        }
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}


@function_tool
@idempotent_tool
async def update_intake_question(
    ctx: RunContextWrapper[AgentContext],
    lead_type: LeadType,
    question_label: str,
    new_label: str | None = None,
    new_options: list[str] | None = None,
    new_required: bool | None = None,
) -> dict[str, Any]:
    """Update an existing question on the intake form. Pass only the fields to change.

    lead_type: 'rental' or 'buyer'.
    question_label: The current (case-insensitive) label of the question to update.
    new_label: Rename the question to this label.  Cannot rename to a system
      field label (Name, Email, Phone).
    new_options: Replace the question's options.  Provide a list of option
      strings.  Only valid for select, multi_select, and radio questions.
    new_required: Change whether the question is required.  System fields
      remain required regardless.

    Returns an error if question_label is not found.
    """
    space_id = ctx.context.space_id

    if new_label is None and new_options is None and new_required is None:
        return {
            "error": "Pass at least one of: new_label, new_options, new_required.",
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    # Validate the new label won't clobber a system field
    if new_label is not None and new_label.strip() in _SYSTEM_LABELS:
        return {
            "error": (
                f"Cannot rename a question to '{new_label.strip()}' — that is a reserved system field label."
            ),
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    try:
        db = await supabase()
        form = await _fetch_form(db, space_id, lead_type)

        section, question = _find_question(form, question_label)
        if section is None or question is None:
            return {
                "error": (
                    f"No question labelled '{question_label.strip()}' found in the {lead_type} intake form. "
                    "Use get_intake_form to see current questions."
                ),
                "code": "VALIDATION_ERROR",
                "retryable": False,
            }

        changes: list[str] = []

        if new_label is not None:
            # Prevent renaming system fields
            if question.get("system"):
                return {
                    "error": f"'{question.get('label')}' is a system field and its label cannot be changed.",
                    "code": "VALIDATION_ERROR",
                    "retryable": False,
                }
            # Check for duplicate label
            cleaned_new = new_label.strip()
            for s in form.get("sections", []):
                for q in s.get("questions", []):
                    if (
                        q.get("id") != question.get("id")
                        and q.get("label", "").strip().lower() == cleaned_new.lower()
                    ):
                        return {
                            "error": (
                                f"A question labelled '{cleaned_new}' already exists "
                                f"in section '{s.get('title')}'."
                            ),
                            "code": "VALIDATION_ERROR",
                            "retryable": False,
                        }
            question["label"] = cleaned_new
            changes.append(f"label → '{cleaned_new}'")

        if new_options is not None:
            choice_types = {"select", "multi_select", "radio"}
            if question.get("type") not in choice_types:
                return {
                    "error": (
                        f"new_options is only valid for select/multi_select/radio questions. "
                        f"This question is type '{question.get('type')}'."
                    ),
                    "code": "VALIDATION_ERROR",
                    "retryable": False,
                }
            if not new_options:
                return {
                    "error": "new_options must contain at least one option.",
                    "code": "VALIDATION_ERROR",
                    "retryable": False,
                }
            question["options"] = [
                {"value": opt.strip(), "label": opt.strip()} for opt in new_options if opt.strip()
            ]
            changes.append(f"options updated ({len(question['options'])} choices)")

        if new_required is not None:
            if question.get("system") and not new_required:
                return {
                    "error": f"'{question.get('label')}' is a system field and cannot be made optional.",
                    "code": "VALIDATION_ERROR",
                    "retryable": False,
                }
            question["required"] = new_required
            changes.append(f"required → {new_required}")

        await _upsert_form(db, space_id, lead_type, form)

        await publish_event(
            ctx.context,
            "action",
            f"Updated question '{question_label.strip()}' on {lead_type} intake form: {', '.join(changes)}",
            agent_type=ctx.context.current_agent_type,
            metadata={"leadType": lead_type, "questionId": question.get("id"), "changes": changes},
        )

        return {
            "ok": True,
            "questionId": question.get("id"),
            "leadType": lead_type,
            "changes": changes,
        }
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}


@function_tool
@idempotent_tool
async def save_intake_form(
    ctx: RunContextWrapper[AgentContext],
    lead_type: LeadType,
    form_config: str,
) -> dict[str, Any]:
    """Replace the entire intake form config with the provided structure.

    Use this when you have built or heavily restructured the form and want
    to write the complete new config in one operation.  For targeted edits,
    prefer add_intake_question / remove_intake_question / update_intake_question.

    lead_type: 'rental' or 'buyer'.
    form_config: A JSON-encoded string of the complete IntakeFormConfig:
      {
        "version": 1,
        "leadType": "rental" | "buyer",
        "sections": [
          {
            "id": "<uuid>",
            "title": "...",
            "position": 0,
            "questions": [
              {
                "id": "<uuid>",
                "type": "text",
                "label": "...",
                "required": true,
                "position": 0
              },
              ...
            ]
          },
          ...
        ]
      }

    The form must contain the three system fields (Name, Email, Phone).
    Returns an error if the config is structurally invalid.
    """
    space_id = ctx.context.space_id

    try:
        form_config = json.loads(form_config)
    except (json.JSONDecodeError, TypeError):
        return {"error": "form_config must be a JSON-encoded object.", "code": "VALIDATION_ERROR", "retryable": False}

    if not isinstance(form_config, dict):
        return {"error": "form_config must decode to a dict.", "code": "VALIDATION_ERROR", "retryable": False}
    if "sections" not in form_config or not isinstance(form_config["sections"], list):
        return {"error": "form_config must have a 'sections' list.", "code": "VALIDATION_ERROR", "retryable": False}

    # Check system fields are present
    all_labels = {
        q.get("label", "").strip()
        for s in form_config["sections"]
        for q in s.get("questions", [])
    }
    missing_system = _SYSTEM_LABELS - all_labels
    if missing_system:
        return {
            "error": (
                f"form_config is missing required system fields: {', '.join(sorted(missing_system))}. "
                "These fields must always be present."
            ),
            "code": "VALIDATION_ERROR",
            "retryable": False,
        }

    # Ensure leadType is set correctly
    form_config["leadType"] = lead_type
    form_config.setdefault("version", 1)

    try:
        db = await supabase()
        await _upsert_form(db, space_id, lead_type, form_config)

        section_count = len(form_config["sections"])
        question_count = sum(len(s.get("questions", [])) for s in form_config["sections"])

        await publish_event(
            ctx.context,
            "action",
            f"Saved {lead_type} intake form ({section_count} sections, {question_count} questions)",
            agent_type=ctx.context.current_agent_type,
            metadata={"leadType": lead_type, "sectionCount": section_count, "questionCount": question_count},
        )

        return {
            "ok": True,
            "leadType": lead_type,
            "sectionCount": section_count,
            "questionCount": question_count,
        }
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
