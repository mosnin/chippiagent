# Chippi CRM Plugins

This index covers the eight CRM-flavored plugins ported from the `mosnin/realestatecrm` half of the repo into the top-level `plugins/` directory so the chippi-agent framework can see them next to its native Python plugins.

## How these relate to the agent framework

The chippi-agent framework's native plugins are Python packages (e.g. `plugins/kanban/`, `plugins/spotify/`, `plugins/google_meet/`) with `__init__.py`, `plugin.yaml`, `tools.py`, and a `client.py`. They register tools the agent can call directly.

The eight `chippi-*` plugins listed below are a different shape — **Claude Code plugins**, with `commands/*.md` slash-command prompts, a `.claude-plugin/plugin.json` manifest, and a `.mcp.json` that points the Claude Code client at the Chippi MCP server (`https://my.usechippi.com/api/mcp`). They run by:

1. Claude Code loads the `commands/` and `.mcp.json` from the plugin directory.
2. The user invokes a slash command (e.g. `/hot-leads`).
3. The model executes the prompt against the Chippi MCP tools (requires an API key from Chippi Settings → Integrations).

They do not expose Python entry points to chippi-agent. If a future port surfaces these as native agent tools, the work is to wrap the same MCP server calls in a `tools.py` per plugin — the prompts in `commands/` are the spec.

The canonical source for each is `crm/plugins/chippi-*/`. The copies here are mirrors; edit the CRM source and re-port.

## The eight plugins

### chippi-analytics
CRM analytics and performance insights. Weekly reports, conversion-rate funnels, revenue forecasts.
- `/weekly-report`, `/conversion-rate`, `/revenue-forecast`

### chippi-broker-tools
Brokerage-side management for teams. Team performance, unassigned-lead distribution, lead assignment.
- `/team-performance`, `/unassigned-leads`, `/assign-lead`

### chippi-deal-tracker
Rental deal pipeline visibility. Pipeline summaries, per-deal status, recent wins.
- `/pipeline`, `/deal-status`, `/wins`

### chippi-follow-up-writer
Personalized follow-up message drafting. Morning briefings, per-contact drafts, cold-lead reactivation.
- `/morning-brief`, `/draft-followup`, `/cold-reactivation`

### chippi-lead-manager
Day-to-day lead management. Hot leads by score, overdue and today's follow-ups, new lead creation.
- `/hot-leads`, `/follow-ups`, `/add-lead`

### chippi-listing-writer
Marketing copy generation from deal data. Listing descriptions, social posts, HTML email blasts.
- `/write-listing`, `/social-post`, `/email-blast`

### chippi-notes
Workspace note access and creation. New notes with `@mentions`, structured meeting notes, full-text note search.
- `/new-note`, `/meeting-notes`, `/search-notes`

### chippi-tour-assistant
Property-tour workflow support. Tour schedule, pre-tour prep sheets, post-tour debrief and follow-up recommendations.
- `/today-tours`, `/tour-prep`, `/tour-debrief`

## Note

`plugins/chippi-achievements/` is separate from this set — it came from the hermes-agent rename, not from the CRM, and is not part of this port.
