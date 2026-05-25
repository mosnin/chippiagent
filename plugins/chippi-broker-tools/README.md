# chippi-broker-tools

Brokerage management tools for the Chippi CRM. Surfaces team
performance, unassigned brokerage leads, and lead-to-agent assignment
suggestions based on current workload.

## Commands

- `/assign-lead` - suggest the best agent fit for a given lead
- `/team-performance` - ranked agent leaderboard
- `/unassigned-leads` - queue of leads that still need to be routed

Slash commands live in `commands/`. The MCP server config lives in
`.mcp.json` and points at `https://my.usechippi.com/api/mcp` - generate
an API key under Chippi Settings -> Integrations before first use.

## Origin

This plugin originated from the CRM half of the repo. It was ported
here so the chippi-agent framework can surface the same Claude Code
slash commands the standalone CRM exposes.

The canonical implementation still lives at
`crm/plugins/chippi-broker-tools/`. This directory is a structural
mirror; keep edits in sync (or, preferably, edit the CRM copy and
re-port).

## Shape

Claude Code plugin layout (not the chippi-agent Python plugin layout):

```
chippi-broker-tools/
  .claude-plugin/plugin.json   # plugin manifest
  .mcp.json                    # MCP server endpoint
  commands/*.md                # slash command prompts
  README.md
```

It does not expose a `plugin.yaml` or Python `__init__.py` because the
behaviour is fully MCP-driven rather than implemented as agent tools.
