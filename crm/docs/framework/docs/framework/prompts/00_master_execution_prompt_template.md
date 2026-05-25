# 00 Master Execution Prompt Template

> **TL;DR:** Provides the standard startup prompt to paste into Claude Code for initiating a new project with this framework.
> **Covers:** startup instruction, use pattern, session resumption | **Phase:** 0

## Purpose

This is the standard startup prompt for a new project using this framework. Paste this into a Claude Code session to begin. You do not need to include your app idea in the same message — Claude will ask for it.

For the full protocol, see `00_kickoff_system.md`.

## Prompt

Use the following startup instruction:

```text
This project uses a SaaS framework located in docs/framework/.

Follow the phased process defined in CLAUDE.md:

1. Detect what phase this project is in
2. If starting fresh, welcome me and ask for my app idea
3. Walk me through discovery, then generate project docs for my review
4. Plan the architecture and get my confirmation
5. Build phase by phase, checking in between each one

Read framework files just-in-time — only what's needed for the current phase.
Do not try to do everything at once.
```

## Use Pattern

1. Paste this prompt into a new Claude Code session
2. Claude will detect the project state and start at the right phase
3. If no app idea exists, Claude will ask for one
4. Each phase ends with a summary and a check-in before continuing
5. You can pause, adjust, or skip phases at any time

## Resuming a Project

If you start a new session on an existing project, Claude will automatically detect where you left off by checking for `docs/project/` and existing source code. Just start the session — no special prompt needed.
