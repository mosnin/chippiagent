# chippi-deal-tracker

Rental deal pipeline tracking for the Chippi CRM. Inspect deals by
stage, view aggregate pipeline value, and check recently closed wins
without leaving Claude.

## Commands

- `/deal-status` - look up a single deal by name or id
- `/pipeline` - stage-by-stage pipeline summary with top deals
- `/wins` - recently closed deals

Slash commands live in `commands/`. The MCP server config lives in
`.mcp.json` and points at `https://my.usechippi.com/api/mcp` - generate
an API key under Chippi Settings -> Integrations before first use.

## Origin

This plugin originated from the CRM half of the repo. It was ported
here so the chippi-agent framework can surface the same Claude Code
slash commands the standalone CRM exposes.

The canonical implementation still lives at
`crm/plugins/chippi-deal-tracker/`. This directory is a structural
mirror; keep edits in sync (or, preferably, edit the CRM copy and
re-port).

## Shape

Claude Code plugin layout (not the chippi-agent Python plugin layout):

```
chippi-deal-tracker/
  .claude-plugin/plugin.json   # plugin manifest
  .mcp.json                    # MCP server endpoint
  commands/*.md                # slash command prompts
  README.md
```

It does not expose a `plugin.yaml` or Python `__init__.py` because the
behaviour is fully MCP-driven rather than implemented as agent tools.
