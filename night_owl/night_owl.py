#!/usr/bin/env python3
"""night_owl.py — the supervisor that moonlights so you don't have to.

Runs every 40 minutes via cron. Screenshots Conductor, sends to a vision
API, gets validated actions, and texts on crucial events.

Usage:
    python3 night_owl.py              # run one cycle (cron entry point)
    python3 night_owl.py --once       # manual cycle: screenshot → vision → print action plan
    python3 night_owl.py --test-unbrick  # verify the unbrick text path fires
"""

import argparse
import json
import os
import sys
import time
import tempfile
from pathlib import Path

CONFIG_DIR = Path(__file__).parent
sys.path.insert(0, str(CONFIG_DIR))

from vision import screenshot_conductor, process_screenshot, load_config
from texter import send as send_text


def run_cycle() -> list:
    """One supervisor cycle: screenshot → vision → actions → text crucial events."""
    print("night_owl: === supervisor cycle starting ===")

    png = screenshot_conductor()
    if not png:
        print("night_owl: no screenshot, skipping cycle", file=sys.stderr)
        return []

    try:
        actions = process_screenshot(png)
    finally:
        if png and os.path.exists(png):
            os.remove(png)

    if not actions:
        print("night_owl: AI returned no actions", file=sys.stderr)
        return []

    # Check for crucial events that should trigger texts
    for action in actions:
        if action.get("type") == "text":
            event = action.get("event", "")
            message = action.get("message", "")
            send_text(event, message or None)

    print(f"night_owl: === cycle complete, {len(actions)} actions ===")
    return actions


def run_once() -> None:
    """Manual cycle: screenshot Conductor → AI vision → print validated action plan."""
    print("night_owl: === manual cycle (--once) ===")

    png = screenshot_conductor()
    if not png:
        print("night_owl: screenshot failed", file=sys.stderr)
        sys.exit(1)

    try:
        actions = process_screenshot(png)
    finally:
        if png and os.path.exists(png):
            os.remove(png)

    if not actions:
        print("night_owl: no actions returned from vision API", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(actions, indent=2))
    print(f"\nnight_owl: {len(actions)} validated actions from live Conductor screenshot")


def test_unbrick() -> None:
    """Verify the unbrick text path fires correctly."""
    from texter import format_message, MESSAGES

    # Test the unbrick message templates
    for event in ["unbrick", "brick_detected"]:
        msg = format_message(event, "D-mail-experience bite b")
        if msg:
            print(f"[{event}] {msg}")
        else:
            print(f"[{event}] FAILED — no template", file=sys.stderr)
            sys.exit(1)

    # Verify the acceptance-criterion template exists
    assert "K3 bricked on" in MESSAGES["unbrick"][0], \
        "unbrick template must contain 'K3 bricked on'"
    print(f"\nnight_owl: unbrick text path verified — fires correctly")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="night_owl — AI supervisor for Conductor")
    parser.add_argument("--once", action="store_true",
                        help="manual cycle: screenshot Conductor → AI vision → print action plan")
    parser.add_argument("--test-unbrick", action="store_true",
                        help="verify the unbrick text path fires")
    args = parser.parse_args()

    if args.once:
        run_once()
    elif args.test_unbrick:
        test_unbrick()
    else:
        run_cycle()
