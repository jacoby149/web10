"""texter.py — SMS on crucial events, Steve Jobs top engineer style.

Uses Twilio by default. No Hammerspoon dependency.
"""

import json
import os
import random
import subprocess
import sys
from pathlib import Path

CONFIG_DIR = Path(__file__).parent

MESSAGES = {
    "web10web10": [
        "Boss — need web10web10. Board blocked on 3 gates. Kick it?",
        "Hey — the board's gotten messy. Need a web10web10 to realign the fleet.",
        "Operator — K3 agents are stalling on gates. web10web10 time?",
    ],
    "gather_up": [
        "Gather up is clean. {} PRs merged, prod green. Shipping.",
        "Batch is solid. {} PRs, zero findings. Promoting to main.",
        "All green. {} PRs ready. Pushing to prod.",
    ],
    "unbrick": [
        "K3 bricked on {}. Running unbrick! — structural fix, not a rule.",
        "Agent choked on {}. Diagnosing the failure class. Fixing the flow.",
        "Brick detected on {}. Turning it into a process fix now.",
    ],
    "brick_detected": [
        "Heads up — K3 hit a wall on {}. Investigating.",
        "Agent stalled on {}. Sending in the big model to unbrick.",
        "Blocker on {}. Not a task issue — the system tripped it up. Fixing.",
    ],
    "horizon_exhausted": [
        "Horizon exhausted — {} PRs landed since last intervention. Ready for next round.",
        "Fleet's burned through the queue. {} PRs in. Need fresh bites.",
        "The K3 agents cleared the board. {} PRs. Time for another web10web10.",
    ],
}


def load_config() -> dict:
    path = CONFIG_DIR / "config.json"
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def format_message(event: str, extra=None) -> str | None:
    pool = MESSAGES.get(event)
    if not pool:
        return None
    template = random.choice(pool)
    if extra is not None:
        return template.format(extra)
    return template


def send_twilio(to: str, from_: str, body: str) -> bool:
    """Send SMS via Twilio API using curl."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not account_sid or not auth_token:
        print("night_owl: Twilio credentials not set", file=sys.stderr)
        return False

    auth = (account_sid + ":" + auth_token).encode()
    auth_b64 = __import__("base64").b64encode(auth).decode()

    data = f"From={from_}&To={to}&Body={__import__('urllib.parse').quote(body)}"
    try:
        result = subprocess.run(
            [
                "curl", "-s", "-X", "POST",
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                "-H", f"Authorization: Basic {auth_b64}",
                "-H", "Content-Type: application/x-www-form-urlencoded",
                "-d", data,
            ],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            print(f"night_owl: SMS sent: {body}")
            return True
        print(f"night_owl: Twilio error: {result.stderr}", file=sys.stderr)
        return False
    except subprocess.TimeoutExpired:
        print("night_owl: Twilio request timed out", file=sys.stderr)
        return False


def send_imessage(to: str, body: str) -> bool:
    """Send via macOS Messages app (no API cost)."""
    escaped = body.replace('"', '\\"')
    script = (
        f'tell application "Messages" to send "{escaped}" '
        f'to buddy "{to}" of (first chat service)'
    )
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            print(f"night_owl: iMessage sent: {body}")
            return True
        print(f"night_owl: iMessage failed: {result.stderr}", file=sys.stderr)
        return False
    except subprocess.TimeoutExpired:
        print("night_owl: iMessage timed out", file=sys.stderr)
        return False


def send(event: str, extra=None) -> bool:
    """Send a text for a crucial event. Returns True if sent."""
    cfg = load_config()
    texting = cfg.get("texting", {})
    if not texting.get("enabled"):
        msg = format_message(event, extra)
        print(f"night_owl: [texting disabled] would send [{event}]: {msg}")
        return False

    body = format_message(event, extra)
    if not body:
        print(f"night_owl: no message template for event: {event}", file=sys.stderr)
        return False

    print(f"night_owl: sending [{event}]: {body}")

    if texting.get("provider") == "imessage":
        return send_imessage(texting["to_phone"], body)
    else:
        return send_twilio(
            texting["to_phone"],
            texting.get("from_phone", ""),
            body,
        )


if __name__ == "__main__":
    # Test: print a sample unbrick message
    event = sys.argv[1] if len(sys.argv) > 1 else "unbrick"
    extra = sys.argv[2] if len(sys.argv) > 2 else "D-mail-experience bite b"
    msg = format_message(event, extra)
    if msg:
        print(msg)
    else:
        print(f"No template for: {event}", file=sys.stderr)
        sys.exit(1)
