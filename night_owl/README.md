# night_owl

The supervisor that moonlights so you don't have to.

Runs every 40 minutes via cron on your Mac. An AI agent sees the Conductor app,
drives it, kicks off K3 workspaces, and texts you on crucial moments.

## What it does

```
cron (40min) → screenshot Conductor → AI vision model sees the UI
  → validated action list out
  → on crucial events, texts you like your top engineer
```

The AI is the eyes — it adapts to UI changes. No hardcoded coordinates.

## Components

- `night_owl.py` — entry point: `--once` manual cycle, cron cycle, `--test-unbrick`
- `vision.py` — screenshot Conductor → AI vision → validated action list
- `texter.py` — Twilio/iMessage texting on crucial events
- `config.json` — API keys, phone numbers, model settings, schedule
- `install_cron.sh` — one-command cron install
- `README.md` — this file

## Text style — Steve Jobs to top engineer

Short, direct, from your lead:

- "Boss — need web10web10. Board blocked on 3 gates. Kick it?"
- "Gather up is clean. 7 PRs merged, prod green. Shipping."
- "K3 bricked on D-mail-experience bite b. Running unbrick!"
- "Horizon exhausted — 12 PRs landed. Ready for next round."

## Prerequisites

- macOS (uses `screencapture`)
- Python 3.12+
- Conductor.app running
- Vision API key (Anthropic or OpenAI)
- Twilio or iMessage for texting (optional)

No Hammerspoon. No Accessibility permissions needed (unless you later add
direct UI driving — the vision path only needs `screencapture -x`).

## Setup

```bash
# 1. Export your vision API key
export VISION_API_KEY=sk-ant-...

# 2. Edit config.json — phone numbers, model, schedule interval

# 3. Install the cron (one command, every 40 minutes)
bash install_cron.sh

# 4. Test a manual cycle
python3 night_owl.py --once

# 5. Verify the unbrick text path
python3 night_owl.py --test-unbrick
```

To enable the 24/7 cron scheduler, set `"enabled": true` in `config.json`
`schedule` and re-run `install_cron.sh`.

To enable texting, set `"enabled": true` in `config.json` `texting` and
export `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (or use `provider: "imessage"`).

## Uninstall

```bash
bash install_cron.sh --uninstall
```

## Manual cycle (--once)

```bash
python3 night_owl.py --once
```

Screenshots Conductor, sends to the vision API, prints a validated JSON
action plan to stdout. No cron, no texting — just the vision pipeline.

## Unbrick text path

The unbrick detection is a required acceptance criterion. When a
stalled/bricked workspace is detected, the texter fires:

```
"K3 bricked on {task}. Running unbrick! — structural fix, not a rule."
```

Verify with: `python3 night_owl.py --test-unbrick`
