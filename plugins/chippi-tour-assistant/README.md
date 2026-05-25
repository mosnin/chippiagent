# chippi-tour-assistant

Prepare for property tours with your Chippi data: tour schedules, prep sheets, and post-tour follow-up guidance.

## Slash commands

- `/today-tours` — tours for today and this week with guest, address, time, and status.
- `/tour-prep` — pull guest contact info, budget, preferences, and score; suggest talking points and questions. Takes `$ARGUMENTS`.
- `/tour-debrief` — post-tour walkthrough (reaction, interest level, next steps) with a recommendation to create a deal or schedule a follow-up. Takes `$ARGUMENTS`.

## Origin and canonical source

This plugin originated from the CRM half of the repo (`mosnin/realestatecrm`) and was copied here so the chippi-agent framework can discover it alongside its native Python plugins. **The canonical implementation lives in `crm/plugins/chippi-tour-assistant/`** — make edits there, then re-port.

## Shape

This is a Claude Code style plugin:

- `commands/*.md` — slash command prompts.
- `.claude-plugin/plugin.json` — plugin manifest.
- `.mcp.json` — MCP server config pointing at `https://my.usechippi.com/api/mcp` (requires a Chippi API key from Settings → Integrations).

The top-level chippi-agent framework expects Python packages (`__init__.py`, `plugin.yaml`, `tools.py`). These CRM plugins do not follow that shape; they are usable via Claude Code's plugin loader and the MCP server, not as native chippi-agent tools.
