# chippi-listing-writer

Marketing-copy generator for active properties in the Chippi CRM. Drafts
long-form listing descriptions, social posts, and HTML email blasts
from your live deal data.

## Commands

- `/email-blast` - HTML email campaign for currently active listings
- `/social-post` - Instagram/Facebook-formatted listing post
- `/write-listing` - long-form property listing description

Slash commands live in `commands/`. The MCP server config lives in
`.mcp.json` and points at `https://my.usechippi.com/api/mcp` - generate
an API key under Chippi Settings -> Integrations before first use.

## Origin

This plugin originated from the CRM half of the repo. It was ported
here so the chippi-agent framework can surface the same Claude Code
slash commands the standalone CRM exposes.

The canonical implementation still lives at
`crm/plugins/chippi-listing-writer/`. This directory is a structural
mirror; keep edits in sync (or, preferably, edit the CRM copy and
re-port).

## Shape

Claude Code plugin layout (not the chippi-agent Python plugin layout):

```
chippi-listing-writer/
  .claude-plugin/plugin.json   # plugin manifest
  .mcp.json                    # MCP server endpoint
  commands/*.md                # slash command prompts
  README.md
```

It does not expose a `plugin.yaml` or Python `__init__.py` because the
behaviour is fully MCP-driven rather than implemented as agent tools.
