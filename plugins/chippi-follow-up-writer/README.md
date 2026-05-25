# chippi-follow-up-writer

Drafts personalised follow-up messages from your Chippi contact data.
Covers single-contact follow-ups, batch cold-lead reactivation, and the
morning daily-brief that surfaces what needs attention.

## Commands

- `/cold-reactivation` - draft re-engagement messages for stale leads
- `/draft-followup` - personalised follow-up email for one contact
- `/morning-brief` - concise morning summary of the day ahead

Slash commands live in `commands/`. The MCP server config lives in
`.mcp.json` and points at `https://my.usechippi.com/api/mcp` - generate
an API key under Chippi Settings -> Integrations before first use.

## Origin

This plugin originated from the CRM half of the repo. It was ported
here so the chippi-agent framework can surface the same Claude Code
slash commands the standalone CRM exposes.

The canonical implementation still lives at
`crm/plugins/chippi-follow-up-writer/`. This directory is a structural
mirror; keep edits in sync (or, preferably, edit the CRM copy and
re-port).

## Shape

Claude Code plugin layout (not the chippi-agent Python plugin layout):

```
chippi-follow-up-writer/
  .claude-plugin/plugin.json   # plugin manifest
  .mcp.json                    # MCP server endpoint
  commands/*.md                # slash command prompts
  README.md
```

It does not expose a `plugin.yaml` or Python `__init__.py` because the
behaviour is fully MCP-driven rather than implemented as agent tools.
