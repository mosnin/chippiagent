"""Studio tool — Chippi generates branded images and video for the realtor.

fal.ai and Wasabi live in the Next.js app, so this tool calls the internal
Studio endpoint (AGENT_INTERNAL_SECRET-authed). Generation, storage, and
usage-metering logic stays in one place — the Next.js side — exactly as
`config.py` intends for agent write operations.
"""

from __future__ import annotations

from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from security.context import AgentContext
from tools.base import rate_limited

# Video generation can run a few minutes — give the call room.
_TIMEOUT = 300.0


@function_tool
@rate_limited(max_calls=20, window_seconds=3600)
async def generate_studio_image(
    ctx: RunContextWrapper[AgentContext],
    prompt: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Generate a branded image or video for the realtor with Studio.

    Use this when the realtor asks Chippi to create marketing content — a
    listing graphic, a social image, a branded quote card, a short listing
    video. The result is saved to the realtor's Files library and appears in
    Studio; its cost is metered into their usage automatically.

    prompt: a vivid, plain-English description of what to create. Be
            specific — "a warm dusk photo of a modern two-story home with a
            manicured lawn and the porch lights on". The realtor's brand
            palette is folded in automatically; don't restate colors.

    model: optional. One of:
      - 'flux-schnell'   — fast draft image (default)
      - 'flux-2'         — high-quality image
      - 'seedream-4'     — photoreal image
      - 'seedance-video' — a short video (takes a few minutes)

    Returns {file_id, url, kind, cost_usd} on success, or {error: "..."}.
    """
    space_id = ctx.context.space_id

    clean_prompt = (prompt or "").strip()
    if not clean_prompt:
        return {"error": "prompt is required"}

    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return {"error": "Studio generation is not configured."}

    payload: dict[str, Any] = {"spaceId": space_id, "prompt": clean_prompt}
    if model:
        payload["model"] = model

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/internal/studio/generate",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as exc:  # noqa: BLE001 — surface to the agent, never throw
        return {"error": f"generation request failed: {exc}"}

    if resp.status_code >= 400:
        detail = ""
        try:
            detail = resp.json().get("error", "")
        except Exception:  # noqa: BLE001
            detail = ""
        return {"error": detail or f"generation failed ({resp.status_code})"}

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        return {"error": "generation returned an unreadable response"}

    return {
        "file_id": data.get("fileId"),
        "url": data.get("url"),
        "kind": data.get("kind"),
        "cost_usd": data.get("costUsd"),
    }


@function_tool
@rate_limited(max_calls=20, window_seconds=3600)
async def edit_studio_image(
    ctx: RunContextWrapper[AgentContext],
    file_id: str,
    tool: str,
    prompt: str | None = None,
) -> dict[str, Any]:
    """Edit an image the realtor already has, with Studio.

    Use this to transform an existing image — one Chippi just generated with
    generate_studio_image, or any image in the realtor's Files. The edited
    result is saved as a NEW image in their Files and Studio; the original is
    left untouched.

    file_id: the id of the image to edit. For an image you just generated,
             pass the file_id that generate_studio_image returned.

    tool: one of
      - 'upscale'   — sharpen and enlarge the image
      - 'remove-bg' — cut out the background (transparent PNG)
      - 'restyle'   — change the image by instruction (needs `prompt`)

    prompt: required only for 'restyle' — a plain-English instruction
            ("warm up the lighting", "make the sky blue", "remove the car").

    Returns {file_id, url, cost_usd} on success, or {error: "..."}.
    """
    space_id = ctx.context.space_id

    clean_file_id = (file_id or "").strip()
    clean_tool = (tool or "").strip()
    if not clean_file_id or not clean_tool:
        return {"error": "file_id and tool are required"}

    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return {"error": "Studio editing is not configured."}

    payload: dict[str, Any] = {
        "spaceId": space_id,
        "fileId": clean_file_id,
        "tool": clean_tool,
    }
    if prompt:
        payload["prompt"] = prompt

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/internal/studio/edit",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as exc:  # noqa: BLE001 — surface to the agent, never throw
        return {"error": f"edit request failed: {exc}"}

    if resp.status_code >= 400:
        detail = ""
        try:
            detail = resp.json().get("error", "")
        except Exception:  # noqa: BLE001
            detail = ""
        return {"error": detail or f"edit failed ({resp.status_code})"}

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        return {"error": "edit returned an unreadable response"}

    return {
        "file_id": data.get("fileId"),
        "url": data.get("url"),
        "cost_usd": data.get("costUsd"),
    }
