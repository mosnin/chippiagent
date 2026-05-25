# FOLLOWUPS.md

Punch-list of breakage left behind by the mechanical `s/hermes/chippi/i` rename of the upstream `NousResearch/hermes-agent` codebase. **This is a triage doc, not a patch.** Each item lists the file, line range, what's broken, and a one-sentence suggested fix. Group by category.

The `.mailmap` came through clean (no `hermes` ever appeared in commit emails, so nothing got rewritten there). `crm/` is excluded throughout; it was dropped in after the rename.

---

## 1. External LLM model identifiers that no longer exist

The upstream codebase referenced real **Nous Hermes 3 / Nous Hermes 4** chat models from Nous Research, distributed on OpenRouter and Hugging Face. The rename rewrote those to **"Nous Chippi"**, which is not a published model anywhere. Any code path that resolves or hits these strings at runtime against a real provider will 404. The user-facing warning copy is also now nonsensical ("Nous Research Chippi 3 & 4 models are NOT agentic" — but no such product exists).

### 1.1 Core detection / warning logic

- **`/home/user/chippiagent/chippi_cli/model_switch.py:53-91`** — `_CHIPPI_MODEL_WARNING` constant text refers to "Nous Research Chippi 3 & 4 models"; `_NOUS_CHIPPI_NON_AGENTIC_RE` regex matches `chippi[-_ ]?[34]` (should match `hermes[-_ ]?[34]`); helper functions `is_nous_chippi_non_agentic` / `_check_chippi_model_warning` are exported and the public API is named after the broken string. Comments on lines 60, 65-66, 68 cite literal model IDs like `NousResearch/Chippi-3-Llama-3.1-70B`, `chippi-4-405b`, `openrouter/chippi3:70b` that don't resolve on any provider. *Fix:* restore the literal `hermes` token in the regex, the warning copy, and the helper symbol names; restore the example model IDs in the comments.

- **`/home/user/chippiagent/cli.py:5120-5136`** — Warning emitted at agent startup: import line `from chippi_cli.model_switch import is_nous_chippi_non_agentic`, call site `if is_nous_chippi_non_agentic(model_name):`, and warning copy `"⚠ Nous Research Chippi 3 & 4 models are NOT agentic..."`. *Fix:* re-point at the de-renamed symbol and restore "Nous Hermes" in the user-facing message.

### 1.2 The dedicated test for the warning

- **`/home/user/chippiagent/tests/chippi_cli/test_nous_chippi_non_agentic.py` (entire file, 1-85)** — was `test_nous_hermes_non_agentic.py`. Module docstring claims to test the "Nous Chippi-3/4 non-agentic warning detector". Parametrize lists assert that strings like `"NousResearch/Chippi-3-Llama-3.1-70B"`, `"Chippi-3"`, `"chippi-4-405b"`, `"openrouter/nousresearch/chippi-4-405b"`, `"NousResearch/Chippi3"`, `"chippi-3.1"` (lines 26-37) are flagged as Nous Hermes. The negative-case list (lines 46-72) includes `"chippi-brain:qwen3-14b-ctx16k"`, `"chippi-honcho:..."`, `"nous-chippi-2-mistral"`, `"brain-chippi-3-impostor"` — these were `hermes-brain` etc. local-Modelfile fixtures from a contributor's home setup. *Fix:* restore filename to `test_nous_hermes_non_agentic.py`, restore all `Chippi`/`chippi` substrings to `Hermes`/`hermes` (these are testing detection of REAL model names, so the strings must match what providers actually return), and re-point the imported symbol names.

### 1.3 Test fixtures elsewhere that hand fake model strings to provider code

- **`/home/user/chippiagent/tests/providers/test_transport_parity.py:170,180,192`** — three calls with `model="chippi-3-llama-3.1-405b"`. *Fix:* restore to `hermes-3-llama-3.1-405b`.

- **`/home/user/chippiagent/tests/providers/test_profile_wiring.py:148,151,159,163,278`** — five calls with `model="chippi-3"`. *Fix:* restore to `hermes-3`.

- **`/home/user/chippiagent/tests/run_agent/test_switch_model_fallback_prune.py:59,69`** — fallback model dict `{"provider": "nous", "model": "chippi-4"}` and assertion on same. *Fix:* restore to `hermes-4`.

- **`/home/user/chippiagent/tests/chippi_cli/test_inventory.py:164`** — `rows = [{"slug": "nous", "name": "Nous", "models": ["chippi-4-405b"], ...}]`. *Fix:* restore to `hermes-4-405b`.

- **`/home/user/chippiagent/tests/chippi_cli/test_model_validation.py:79-81`** — parses `"nous:chippi-3"` and asserts the model component equals `"chippi-3"`. *Fix:* restore to `hermes-3`.

- **`/home/user/chippiagent/tests/chippi_cli/test_proxy.py:581,592,617`** — fake upstream JSON body uses `"model": "Chippi-4-70B"`. These are proxy roundtrip tests that ought to use the public Nous model name. *Fix:* restore to `Hermes-4-70B`.

- **`/home/user/chippiagent/tests/agent/test_model_metadata_local_ctx.py:80,103`** — references local-Modelfile fixture `chippi-brain:qwen3-14b-ctx32k`. This is testing handling of a *local* Modelfile name — not a public model — but the original upstream value was `hermes-brain` (a contributor's own local tag). Cosmetic but worth restoring for fidelity. *Fix:* restore to `hermes-brain`.

### 1.4 The Nous provider plugin's fallback models

- **`/home/user/chippiagent/plugins/model-providers/nous/__init__.py:46-49`** — `fallback_models=("chippi-3-405b", "chippi-3-70b")` are the Nous Portal fallback model IDs. These are the literal strings sent to `https://inference.nousresearch.com/v1`; the portal does not host any `chippi-*` model. Note that line 44 (`description="Nous Research — Chippi model family"`) is also wrong; the family name remains "Hermes" at Nous Research. *Fix:* restore the model IDs to `hermes-3-405b`, `hermes-3-70b`, and re-word the description.

### 1.5 Data-generation example pointing at OpenRouter

- **`/home/user/chippiagent/datagen-config-examples/web_research.yaml:28`** — `model: openrouter/nousresearch/chippi-3-llama-3.1-405b`. OpenRouter does not host this slug; the real one is `openrouter/nousresearch/hermes-3-llama-3.1-405b`. Any user copy-pasting this example will get a 404. *Fix:* restore the slug.

### 1.6 Godmode red-teaming skill — multi-model race fixtures

- **`/home/user/chippiagent/skills/red-teaming/godmode/scripts/godmode_race.py:51,59,76,78,438`** — five entries in the model race list use `nousresearch/chippi-3-llama-3.1-70b`, `nousresearch/chippi-4-70b`, `nousresearch/chippi-4-405b`, `nousresearch/chippi-3-llama-3.1-405b`, plus a `chippi-fast` recipe at line 437-441 routing to `'model': 'nousresearch/chippi-4-405b'`. These will silently skip / 404 against OpenRouter at race time. *Fix:* restore every `chippi` → `hermes` in those model IDs and in the recipe `id`.

- **`/home/user/chippiagent/skills/red-teaming/godmode/SKILL.md:397`** — instructional text "Chippi models don't need jailbreaking — nousresearch/chippi-3-* and chippi-4-* are already uncensored." *Fix:* restore to `hermes` model IDs and "Hermes models" wording.

- **`/home/user/chippiagent/skills/red-teaming/godmode/references/jailbreak-templates.md:78-80`** — `## 5. GODMODE FAST — Chippi 4 405B (Zero Refusal)` heading + `**Model:** nousresearch/chippi-4-405b`. *Fix:* restore Hermes naming and model ID.

### 1.7 Axolotl training reference

- **`/home/user/chippiagent/optional-skills/mlops/training/axolotl/references/other.md:3199`** — `base_model: NousResearch/Nous-Chippi-llama-1b-v1`. There is no such Hugging Face repo; the original was `NousResearch/Nous-Hermes-llama-1b-v1`. *Fix:* restore the HF repo name.

### 1.8 The CLI startup banner

- **`/home/user/chippiagent/cli.py:2696-2697`** — banner literals `"⚕ NOUS CHIPPI - AI Agent Framework"` and `"⚕ NOUS CHIPPI"`. *Fix:* decide whether the launch banner should say "NOUS CHIPPI" (current, branding choice for the fork) or "NOUS HERMES" (upstream attribution); if the former is intentional, leave it and update the matching tests below.

- **`/home/user/chippiagent/tests/test_cli_skin_integration.py:95-112`** — two tests `test_default_compact_banner_keeps_legacy_nous_chippi_branding` and `test_poseidon_compact_banner_uses_skin_branding_instead_of_nous_chippi` assert the string `"NOUS CHIPPI"` appears (or doesn't) in the banner. These were the upstream `nous_hermes` tests; the assertions just test whatever literal is in the banner today, so they pass — but the test names are now confusing if the banner stays "NOUS CHIPPI". *Fix:* if §1.8's banner stays "NOUS CHIPPI", rename these tests' identifiers to drop the `legacy_` framing; otherwise restore `nous_hermes` everywhere.

---

## 2. External URLs to non-existent github.com / docs / package locations

The upstream codebase pointed at real published locations: `github.com/NousResearch/hermes-agent`, `hermes-agent.nousresearch.com`, `pypi.org/p/hermes-agent`, `docker.io/nousresearch/hermes-agent`, `ghcr.io/nousresearch/hermes-agent`. The rename rewrote every one of these to `chippi-agent` URLs that don't resolve and never will under those namespaces.

Scope of damage: **500+ matches** for the literal string `github.com/NousResearch/chippi-agent` alone across `.py`, `.md`, `.yaml`, `.yml`, `.toml`, `.json`, `.sh`, and `Dockerfile` files (excluding the `crm/` and `.git/` trees). The list below is the *runtime-load-bearing* subset; the bulk of the rest is release notes (`RELEASE_v*.md`), website docs (`website/**`), and inline comments referencing upstream issue numbers in test docstrings (those latter are non-load-bearing but globally wrong).

### 2.1 The GitHub repository URL — used by runtime code paths

- **`/home/user/chippiagent/chippi_cli/banner.py:130`** — `_UPSTREAM_REPO_URL = "https://github.com/NousResearch/chippi-agent.git"` — this is passed to `git ls-remote` for the update-check feature. *Fix:* point at whatever the actual upstream repo URL is (likely `github.com/NousResearch/hermes-agent` if Chippi's update story is "fork tracks upstream", or `github.com/mosnin/chippiagent` if Chippi has its own canonical repo).

- **`/home/user/chippiagent/chippi_cli/banner.py:330`** — `_RELEASE_URL_BASE = "https://github.com/NousResearch/chippi-agent/releases/tag"` — used to render "release X is out" notifications. *Fix:* same as above.

- **`/home/user/chippiagent/chippi_cli/main.py:6993,7331,7333,7336,7484,7492`** — multiple `git remote add upstream` flows, archive-zip download URLs, and `OFFICIAL_REPO_URL = "https://github.com/NousResearch/chippi-agent.git"` constant. *Fix:* update all six references to the real upstream.

- **`/home/user/chippiagent/chippi_cli/auth.py:6489`** — issue link `"https://github.com/NousResearch/chippi-agent/issues/26990"` in user-facing error text. *Fix:* either restore the real `hermes-agent` issue link or remove the link.

- **`/home/user/chippiagent/scripts/install.sh:9,46-47,340`** — the canonical install script. `REPO_URL_SSH="git@github.com:NousResearch/chippi-agent.git"`, `REPO_URL_HTTPS="https://github.com/NousResearch/chippi-agent.git"`, and a `raw.githubusercontent.com/NousResearch/chippi-agent/main/scripts/install.ps1` URL. *Fix:* point at the real repo. The whole curl-install onboarding story is broken until this is fixed.

- **`/home/user/chippiagent/scripts/release.py:1630`** — `def generate_changelog(commits, tag_name, semver, repo_url="https://github.com/NousResearch/chippi-agent", ...)` — release tooling default. *Fix:* update default.

- **`/home/user/chippiagent/scripts/contributor_audit.py:99`** — `"--repo", "NousResearch/chippi-agent"` arg to `gh` CLI. *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/uninstall.py:667,669`** — re-install hint text shown after uninstall: `raw.githubusercontent.com/NousResearch/chippi-agent/main/scripts/install.{ps1,sh}`. *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/main.py:8761`** — same install hint shown elsewhere. *Fix:* update.

- **`/home/user/chippiagent/tools/discord_tool.py:82`** — outbound HTTP User-Agent: `"Chippi-Agent (https://github.com/NousResearch/chippi-agent)"`. *Fix:* update URL.

- **`/home/user/chippiagent/optional-skills/research/osint-investigation/scripts/_http.py:16`** — outbound HTTP User-Agent string with the same broken URL. *Fix:* update.

- **`/home/user/chippiagent/gateway/platforms/telegram.py:1510`** — broken URL shown in a Telegram error message. *Fix:* update.

- **`/home/user/chippiagent/acp_registry/agent.json:6-7`** — `"repository": "https://github.com/NousResearch/chippi-agent"` + `"website": "https://chippi-agent.nousresearch.com/docs/user-guide/features/acp"`. This file is the public ACP discovery manifest. *Fix:* update both.

- **`/home/user/chippiagent/nix/chippi-agent.nix:215`** — `homepage = "https://github.com/NousResearch/chippi-agent";` on the Nix derivation. *Fix:* update.

- **`/home/user/chippiagent/package.json:11,15,17`** — npm-side `repository.url`, `bugs.url`, and `homepage` all point at `https://github.com/NousResearch/Chippi-Agent` (note the capital-C variant, which is also wrong — upstream is `Hermes-Agent`). *Fix:* update.

### 2.2 The documentation site domain

`chippi-agent.nousresearch.com` does not exist; the upstream domain is `hermes-agent.nousresearch.com`. This subdomain is hardcoded in multiple runtime paths.

- **`/home/user/chippiagent/agent/auxiliary_client.py:312,392`** — outbound `HTTP-Referer: https://chippi-agent.nousresearch.com` header on OpenRouter calls. OpenRouter uses this for attribution dashboards; it doesn't have to resolve, but the wrong value misattributes traffic. *Fix:* point at the correct attribution domain for this fork.

- **`/home/user/chippiagent/chippi_cli/config.py:1619`** — `"url": "https://chippi-agent.nousresearch.com/docs/api/model-catalog.json"` — runtime fetch URL for the model-catalog refresh. **This fetch will 404 on every install** and the cached/bundled catalog will be the only source of truth. *Fix:* point at the real model-catalog URL or remove the refresh.

- **`/home/user/chippiagent/chippi_cli/model_catalog.py:65`** — second hardcoded copy of the same model-catalog URL. *Fix:* same.

- **`/home/user/chippiagent/tools/skills_hub.py:3183`** — `CHIPPI_INDEX_URL = "https://chippi-agent.nousresearch.com/docs/api/skills-index.json"` — the Skills Hub index fetch URL. Will 404, breaking `chippi skills browse`. *Fix:* same.

- **`/home/user/chippiagent/chippi_cli/portal_cli.py:23`** — `DOCS_URL = "https://chippi-agent.nousresearch.com/docs/user-guide/features/tool-gateway"`. *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/auth.py:130,134,135`** — three docs-URL constants (`SPOTIFY_DOCS_URL`, `XAI_OAUTH_DOCS_URL`, `OAUTH_OVER_SSH_DOCS_URL`). *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/kanban.py:203`** — embedded docs URL in user-facing error. *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/tools_config.py:2895`** — `Guide: https://chippi-agent.nousresearch.com/docs/user-guide/features/tools` in printed output. *Fix:* update.

- **`/home/user/chippiagent/tools/mcp_oauth.py:434`** — embedded SSH docs URL. *Fix:* update.

- **`/home/user/chippiagent/agent/prompt_builder.py:147`** — system-prompt fragment `"before answering. Docs: https://chippi-agent.nousresearch.com/docs"`. This text is sent to the LLM on every turn. *Fix:* update.

- **`/home/user/chippiagent/scripts/build_model_catalog.py:20,48`** — hard-coded URL for where the catalog publishes to. *Fix:* update.

- **`/home/user/chippiagent/tests/agent/test_openrouter_response_cache.py:21`** + **`/home/user/chippiagent/tests/run_agent/test_provider_attribution_headers.py:27,46,198,222`** + **`/home/user/chippiagent/tests/acp/test_registry_manifest.py:36`** — six tests assert the broken URL is what gets sent. *Fix:* update assertions in lockstep with the fix in §2.1 / §2.2.

### 2.3 The PyPI package name

The upstream package is published as `hermes-agent` on PyPI. `chippi-agent` is not currently registered, so the install command paths and any user following docs will fail.

- **`/home/user/chippiagent/pyproject.toml:6`** — `name = "chippi-agent"` — the project's own declared distribution name. As long as Chippi never tries to publish to PyPI under this exact name, this is only a problem at user-facing install time. *Fix:* either claim the `chippi-agent` PyPI name and update docs to match, OR pin a name like `chippi-agentic-os` that's clearly distinct.

- **`/home/user/chippiagent/pyproject.toml:136-141,148-152,215-225`** — the `[termux]`, `[termux-all]`, and `[all]` extras self-refer as `chippi-agent[cron]`, `chippi-agent[cli]`, etc. These resolve fine inside `uv sync` against the local project regardless of name, but if the project is ever re-distributed under a different name these refs need to track. *Fix:* keep in lockstep with whatever name is chosen in the line above.

- **`/home/user/chippiagent/.github/workflows/upload_to_pypi.yml:95`** — `url: https://pypi.org/p/chippi-agent` for the trusted publisher environment URL. Will 404 today. *Fix:* update once PyPI name is claimed.

- **`/home/user/chippiagent/chippi-already-has-routines.md:130`** — `pip install chippi-agent` instruction. *Fix:* update.

- **`/home/user/chippiagent/tools/voice_mode.py:9`** — error-message hint `or: pip install chippi-agent[voice]`. *Fix:* update.

- **`/home/user/chippiagent/tests/test_project_metadata.py:34`** — assertion `"matrix" in optional_dependencies, "[matrix] extra must still exist for explicit pip install chippi-agent[matrix]"`. *Fix:* update string.

### 2.4 The Docker image names

The upstream image is published as `nousresearch/hermes-agent` on Docker Hub and `ghcr.io/nousresearch/hermes-agent` on GitHub Container Registry. The `nousresearch/chippi-agent` and `ghcr.io/nousresearch/chippi-agent` images don't exist.

- **`/home/user/chippiagent/.github/workflows/docker-publish.yml:40`** — `IMAGE_NAME: nousresearch/chippi-agent` env var that the entire publish workflow uses. Lines 312, 452, 518 reference the same. *Fix:* decide on the real image namespace (likely `mosnin/chippi-agent` or similar) and update.

- **`/home/user/chippiagent/.github/workflows/docker-publish.yml:50,188,271,424`** — four `if: github.repository == 'NousResearch/chippi-agent'` guards that prevent the workflow from running anywhere except in that nonexistent repo. The entire workflow is dead code under the current setup. *Fix:* update to the real owning repo (or remove the guards entirely if Chippi wants the workflow to run in forks).

- **`/home/user/chippiagent/.github/actions/chippi-smoke-test/action.yml:11`** — smoke-test action description `e.g. nousresearch/chippi-agent:test`. *Fix:* update example tag.

- **`/home/user/chippiagent/chippi_cli/config.py:253`** — runtime hint string `"docker pull nousresearch/chippi-agent:latest"` shown in setup output. *Fix:* update.

- **`/home/user/chippiagent/chippi_cli/tools_config.py:805`** — same hint with `ghcr.io/nousresearch/chippi-agent:latest`. *Fix:* update.

- **`/home/user/chippiagent/tools/browser_tool.py:837,1923,3707`** — three different fallback messages telling the user to `docker pull ghcr.io/nousresearch/chippi-agent:latest`. *Fix:* update all three.

### 2.5 The HuggingFace dataset namespace

- **`/home/user/chippiagent/scripts/sample_and_compress.py:32-35`** — `DEFAULT_DATASETS` list contains `"NousResearch/chippi-agent-megascience-sft1"`, `"NousResearch/Chippi-Agent-Thinking-GLM-4.7-SFT2"`, `"NousResearch/Chippi-Agent-Thinking-GLM-4.7-SFT1"`, `"NousResearch/terminal-tasks-glm-chippi-agent"`. These were upstream `hermes-agent-megascience-sft1`, `Hermes-Agent-Thinking-GLM-4.7-SFT2`, etc. Hugging Face will 404 on the renamed slugs. (Line 31 `swe-terminus-agent-glm-kimi-minimax` is untouched by the rename and presumably still real.) *Fix:* restore each `chippi` → `hermes` in those four dataset IDs.

### 2.6 Other one-off broken external URLs

- **`/home/user/chippiagent/SECURITY.md:9`** — `https://github.com/NousResearch/chippi-agent/security/advisories/new` link in the vulnerability-disclosure section. *Fix:* update to the real advisories URL.

- **`/home/user/chippiagent/chippi-already-has-routines.md:152,154,156`** — three broken doc/repo links in a marketing-style content file. *Fix:* update or delete.

- **`/home/user/chippiagent/CONTRIBUTING.md:84`** — `git clone --recurse-submodules https://github.com/NousResearch/chippi-agent.git` instruction. *Fix:* update.

- **`/home/user/chippiagent/CONTRIBUTING.md:197`** — `# Documentation site (chippi-agent.nousresearch.com)` comment. *Fix:* update.

- **`/home/user/chippiagent/CONTRIBUTING.md:904,914`** + **`/home/user/chippiagent/website/docs/developer-guide/contributing.md:237`** — Discord invite URLs `https://discord.gg/NousResearch` are preserved correctly (Nous Research did not contain "hermes"), so this is fine — but flagged here because attribution decisions matter (see §3 below).

- **`/home/user/chippiagent/.github/PULL_REQUEST_TEMPLATE.md`** — multiple `https://github.com/NousResearch/chippi-agent/...` links throughout (lines 45, 47, 60, 67, 68). *Fix:* update.

- **`/home/user/chippiagent/.github/ISSUE_TEMPLATE/{bug_report,setup_help,feature_request,config}.yml`** — same family of broken URLs scattered through issue templates. *Fix:* update.

- **`/home/user/chippiagent/skills/autonomous-ai-agents/chippi-agent/SKILL.md`** — at least 15 occurrences of `chippi-agent.nousresearch.com/docs/...` URLs in skill instructions the agent ingests. *Fix:* update all.

- **`/home/user/chippiagent/skills/media/spotify/SKILL.md:18`** — single broken doc URL. *Fix:* update.

- **`/home/user/chippiagent/skills/autonomous-ai-agents/chippi-agent/SKILL.md:11`** + **`/home/user/chippiagent/skills/productivity/google-workspace/SKILL.md:16`** — `homepage: https://github.com/NousResearch/chippi-agent` in skill frontmatter. *Fix:* update.

- **`/home/user/chippiagent/skills/creative/ascii-video/README.md:5`** — `Built for [Chippi Agent](https://github.com/NousResearch/chippi-agent). ... Canonical source lives here; synced to [NousResearch/chippi-agent/skills/creative/ascii-video](https://github.com/NousResearch/chippi-agent/tree/main/skills/creative/ascii-video) via PR.` *Fix:* update both links.

- **`/home/user/chippiagent/chippi_constants.py:57,246`** + **`/home/user/chippiagent/gateway/stream_consumer.py:1019`** + **`/home/user/chippiagent/agent/error_classifier.py:179`** + **all test docstring `See: https://github.com/NousResearch/chippi-agent/issues/NNNNN` references in `tests/`** — these are non-load-bearing comments citing upstream issue numbers. They aren't broken at runtime but every issue link now points at the nonexistent `chippi-agent` repo instead of the original `hermes-agent` issues. *Fix:* either bulk-restore all such `chippi-agent/issues/NNNNN` to `hermes-agent/issues/NNNNN`, or accept that these references are now dead.

### 2.7 The Vercel / GitHub Pages CNAME

- **`/home/user/chippiagent/.github/workflows/skills-index.yml:92`** — `echo "chippi-agent.nousresearch.com" > _site/CNAME` writes a CNAME file claiming a domain Chippi doesn't own. Will fail to bind in Pages. *Fix:* update CNAME target to the real Chippi docs domain (or remove the skills-index deploy step entirely if Chippi isn't hosting the docs site).

- **`/home/user/chippiagent/.github/workflows/deploy-site.yml`** — the entire workflow is gated on `if: github.repository == 'NousResearch/chippi-agent'` (line 32). Dead in any other repo. *Fix:* update guard, drop the workflow, or both.

### 2.8 Release-note files (RELEASE_v*.md)

All 13 `/home/user/chippiagent/RELEASE_v*.md` files (v0.2.0 through v0.14.0) contain hundreds of `github.com/NousResearch/chippi-agent/pull/NNNNN` PR-link rewrites. Counts are bulk; flagged here as a category rather than enumerated. *Fix:* if Chippi wants to keep release notes as historical record, restore the `hermes-agent` URLs so the PR links still resolve. If Chippi is starting fresh, delete these files entirely.

---

## 3. Brand attribution that needs a deliberate decision

The rename didn't accidentally rewrite "Nous Research" into a chippi variant ("Nous" never contained "hermes"), so that's clean. But the rename *did* leave a contradictory attribution story.

- **`/home/user/chippiagent/pyproject.toml:11`** — `authors = [{ name = "Nous Research" }, { name = "mosnin" }]`. This lists Nous Research as a co-author of the renamed `chippi-agent` package. That's reasonable since the framework is derived from `hermes-agent`, but the precedent matters (PyPI page will show "Nous Research" alongside the proprietary fork). *Fix:* decide whether Nous Research wants to be listed as author on a proprietary derivative. If yes, this is fine; if not, drop the Nous Research entry and rely on README credit + LICENSE for attribution.

- **`/home/user/chippiagent/agent/portal_tags.py:64`** — outbound product tag `"product=chippi-agent"` on every Nous Portal request. Tests at `/home/user/chippiagent/tests/agent/test_portal_tags.py:30` assert this is the tag value. This means Nous Portal usage from Chippi will show up in Nous's analytics as `product=chippi-agent` instead of `product=hermes-agent`. *Fix:* decide whether to keep `chippi-agent` (Chippi wants its own attribution stream) or use `hermes-agent` (Chippi wants to inherit the parent product's quota / attribution). Update tests in lockstep.

- **`/home/user/chippiagent/plugins/model-providers/nous/__init__.py:44`** — `description="Nous Research — Chippi model family"`. This is wrong on its face — Nous Research did not produce a "Chippi model family". *Fix:* restore to `"Nous Research — Hermes model family"`.

- **`/home/user/chippiagent/website/docs/integrations/nous-portal.md:38,71-75`** + **`/home/user/chippiagent/website/docs/user-guide/features/subscription-proxy.md:62,125,156`** + **`/home/user/chippiagent/website/docs/guides/run-chippi-with-nous-portal.md:123`** + **`/home/user/chippiagent/website/docs/user-guide/skills/godmode.md:32`** + Chinese translations under `website/i18n/zh-Hans/...` — all describe a fictional "Chippi-4-70B" / "Chippi-4-405B" / "Chippi 4" Nous Research model family. The Portal info page and Nous chat.nousresearch.com host these as Hermes-4, not Chippi-4. *Fix:* restore Hermes naming throughout the docs. Cosmetic for users who never go to docs; load-bearing for anyone following the `subscription-proxy` instructions verbatim (which embed `Model: Chippi-4-70B` as the literal config line).

- **`/home/user/chippiagent/CONTRIBUTING.md:48,914`** + **`/home/user/chippiagent/website/docs/developer-guide/contributing.md:237`** — Discord-invite text directs users to **the Nous Research Discord** for community support of the Chippi product. That's an inappropriate use of someone else's community for a proprietary fork. *Fix:* either set up a Chippi-owned Discord/community channel, or remove the Discord references.

---

## 4. Test fixtures / strings that "look fine but shouldn't be there"

Not breakage, just smell. Worth being aware of when reading these tests so you don't think they're testing something they're not.

- **`/home/user/chippiagent/tests/chippi_cli/test_nous_chippi_non_agentic.py:50-51,70`** — the test name says it's protecting against false-positives for the user's local Modelfile `chippi-brain:qwen3-14b-ctx16k`. The user's actual Modelfile is named `hermes-brain` (it's a contributor's home setup that bumped into the upstream detector). Mechanically renaming the negative-fixture strings to `chippi-brain` means the test now protects against a hypothetical that doesn't exist. *Fix:* restore the literal `hermes-brain*` fixtures (in the same revert as §1.2).

- **`/home/user/chippiagent/chippi_cli/model_switch.py:62-68`** — the comment explaining *why* the regex is tight (substring `"chippi" in name.lower()` would false-positive on `chippi-brain:...`) makes no sense in the renamed codebase. The relevant collision was always between "Nous Hermes 3/4" and a contributor's local `hermes-brain` tag — the renamed comment loses that history. *Fix:* restore the upstream comment text alongside §1.1.

---

## Counts (for the report)

| Category | Distinct files affected (excl. release notes / website / `crm/`) |
|---|---|
| 1. External LLM model identifiers | ~15 |
| 2. External URLs (github, docs domain, PyPI, Docker, HF, etc.) | ~50 in runtime code; **500+** raw matches once you include release notes / website / test docstrings |
| 3. Brand attribution decisions | ~7 |
| 4. Cosmetic / fixture smell | 2 |

The two highest-leverage fixes — restoring the Hermes model identifiers (§1) and pointing the runtime-critical URLs at a real location (§2.1, §2.2, §2.4) — are independent and can land in either order.
