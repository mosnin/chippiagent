"""App knowledge base — full-text search over AppKnowledgeDoc.

Loaded on demand. Never included in the base context.
Call when the realtor asks how to use a feature, why something isn't
working, or where to find something in the app.
"""

from __future__ import annotations

from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext


@function_tool
async def recall_docs(
    ctx: RunContextWrapper[AgentContext],
    query: str,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Search the app knowledge base for help and how-to documentation.

    query: natural language question or keywords, e.g. "how to create a deal"
      or "why isn't my tour booking working" or "where is commissions".
    category: optional filter — 'contacts' | 'deals' | 'properties' | 'tours'
      | 'calendar' | 'chippi' | 'settings' | 'troubleshooting'.

    Returns up to 5 matching docs with title and content.

    Call this when:
    - The realtor asks "how do I...?", "where is...?", "why isn't...?"
    - You need to explain an app feature accurately rather than guessing.
    - The realtor reports something not working and you need to troubleshoot.

    Do NOT call for routine CRM tasks — only for help/how-to queries.
    """
    clean_query = query.strip()[:500] if query else ""
    if not clean_query:
        return []

    db = await supabase()
    cat = (category or "").strip().lower()

    try:
        result = await db.rpc(
            "search_knowledge_docs",
            {
                "query_text": clean_query,
                "filter_category": cat or None,
                "result_limit": 5,
            },
        ).execute()
        rows = result.data or []
    except Exception:
        # Fallback: ilike search on title + content
        rows = []

    if not rows:
        try:
            fragment = f"%{clean_query[:80]}%"
            q = (
                db.table("AppKnowledgeDoc")
                .select("id,category,title,content")
                .or_(f"title.ilike.{fragment},content.ilike.{fragment}")
                .limit(5)
            )
            if cat:
                q = q.eq("category", cat)
            result = await q.execute()
            rows = result.data or []
        except Exception:
            return []

    return [
        {
            "title": r.get("title", ""),
            "category": r.get("category", ""),
            "content": r.get("content", ""),
        }
        for r in rows
    ]
