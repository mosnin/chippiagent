# chippi-lead-manager

Day-to-day rental lead management for the Chippi CRM. View hot leads
ranked by score, check overdue and same-day follow-ups, and create new
contacts inline from Claude.

## Commands

- `/add-lead` - create a new contact (name, phone, email, budget, area)
- `/follow-ups` - overdue and today's follow-ups with contact details
- `/hot-leads` - hottest leads sorted by score with next-action hints

Slash commands live in `commands/`. The MCP server config lives in
`.mcp.json` and points at `https://my.usechippi.com/api/mcp` - generate
an API key under Chippi Settings -> Integrations before first use.

## Origin

This plugin originated from the CRM half of the repo. It was ported
here so the chippi-agent framework can surface the same Claude Code
slash commands the standalone CRM exposes.

The canonical implementation still lives at
`crm/plugins/chippi-lead-manager/`. This directory is a structural
mirror; keep edits in sync (or, preferably, edit the CRM copy and
re-port).

## Shape

Claude Code plugin layout (not the chippi-agent Python plugin layout):

```
chippi-lead-manager/
  .claude-plugin/plugin.json   # plugin manifest
  .mcp.json                    # MCP server endpoint
  commands/*.md                # slash command prompts
  README.md
```

It does not expose a `plugin.yaml` or Python `__init__.py` because the
behaviour is fully MCP-driven rather than implemented as agent tools.
