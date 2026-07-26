# night_owl

The supervisor that moonlights so you don't have to.

Runs every 40 minutes on your Mac. An AI agent sees the Conductor app,
drives it, kicks off K3 workspaces, and texts you on crucial moments.

## What it does

```
cron (40min) → screenshot Conductor → AI vision model sees the UI
  → clicks buttons, types prompts, creates workspaces
  → on crucial events, texts you like your top engineer
```

The AI is the eyes — it adapts to UI changes. No hardcoded coordinates.

## Components

- `init.lua` — Hammerspoon entry point, timer, main loop
- `conductor_agent.lua` — screenshot → AI vision → click/keystroke pipeline
- `texter.lua` — Twilio texting on crucial events (web10web10, gather up, brick)
- `config.json` — API keys, phone numbers, model settings, schedule
- `README.md` — this file

## Text style — Steve Jobs to top engineer

Short, direct, from your lead:

- "Boss — need web10web10. Board blocked on 3 gates. Kick it?"
- "Gather up is clean. 7 PRs merged, prod green. Shipping."
- "K3 bricked on D-mail-experience bite b. Running unbrick!"
- "Horizon exhausted — 12 PRs landed. Ready for next round."

## Prerequisites

- Hammerspoon: `brew install --cask hammerspoon`
- Conductor.app running
- Vision API key (Anthropic or OpenAI)
- Twilio (or iMessage) for texting

## Setup

1. `brew install --cask hammerspoon`
2. Copy `init.lua`, `conductor_agent.lua`, `texter.lua` to `~/.hammerspoon/`
3. In `~/.hammerspoon/init.lua`: `require("night_owl")`
4. Edit `config.json` — API keys, phone numbers, enable schedule
5. Accessibility: System Settings → Privacy → Accessibility → Hammerspoon ✓
6. Restart Hammerspoon

## Hotkeys

- `Cmd+Opt+Ctrl+C` — manual supervisor trigger (test now)
- `Cmd+Opt+Ctrl+S` — toggle scheduler on/off
