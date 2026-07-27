"""vision.py — screenshot Conductor → AI vision → validated action list.

No Hammerspoon. Uses macOS screencapture + curl to a vision API.
"""

import json
import base64
import subprocess
import tempfile
import os
import sys
import re
from pathlib import Path

CONFIG_DIR = Path(__file__).parent

SYSTEM_PROMPT = (
    "You see a screenshot of the Conductor Mac app — a coding-agent "
    "orchestrator. Return a JSON array of validated actions. "
    "Each action must be one of:\n"
    "  - {\"type\": \"click\", \"x\": int, \"y\": int, \"target\": \"description\"}\n"
    "  - {\"type\": \"type\", \"text\": \"string\", \"target\": \"where\"}\n"
    "  - {\"type\": \"press\", \"key\": \"Enter|Tab|Escape\", \"target\": \"where\"}\n"
    "  - {\"type\": \"wait\", \"seconds\": int, \"reason\": \"why\"}\n"
    "  - {\"type\": \"text\", \"event\": \"web10web10|gather_up|unbrick|brick_detected|horizon_exhausted\", \"message\": \"string\"}\n"
    "  - {\"type\": \"done\", \"summary\": \"what the cycle accomplished\"}\n"
    "Analyze the workspace states first. Look for: green checks (done), "
    "red errors (bricked), spinning loaders (in progress), idle workspaces "
    "(no activity for >2 cycles). End with a \"done\" action. JSON array only."
)


def load_config() -> dict:
    path = CONFIG_DIR / "config.json"
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"night_owl: failed to load config.json: {e}", file=sys.stderr)
        return {}


def screenshot_conductor() -> str | None:
    """Screenshot the Conductor window using macOS screencapture.
    Returns the path to the PNG file, or None on failure.
    """
    path = tempfile.mktemp(suffix=".png")
    try:
        # Try window-mode first (requires Accessibility perm for screencapture)
        subprocess.run(
            ["screencapture", "-l", "0x19000000", path],  # example window ID
            capture_output=True, timeout=10,
        )
        # Fallback: capture the Conductor app window by name
        # screencapture -w captures a specific window; we need its ID.
        # Use osascript to find the Conductor window ID.
        script = """
        tell application "System Events"
            set condApp to first application process whose name is "Conductor"
            set winList to windows of condApp
            if (count of winList) > 0 then
                set winID to window ID of item 1 of winList
                return winID
            end if
            return -1
        end tell
        """
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip() != "-1":
            win_id = result.stdout.strip()
            subprocess.run(
                ["screencapture", "-x", "-w", win_id, path],
                capture_output=True, timeout=10,
            )
        else:
            # Last resort: capture full screen
            subprocess.run(
                ["screencapture", "-x", path],
                capture_output=True, timeout=10,
            )
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            return path
        return None
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"night_owl: screenshot failed: {e}", file=sys.stderr)
        if os.path.exists(path):
            os.remove(path)
        return None


def image_to_base64(path: str) -> str | None:
    try:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    except OSError as e:
        print(f"night_owl: failed to encode image: {e}", file=sys.stderr)
        return None


def call_anthropic(b64: str, system_prompt: str) -> list | None:
    """Call Anthropic vision API, return parsed action list or None."""
    api_key = os.environ.get("VISION_API_KEY")
    if not api_key:
        print("night_owl: VISION_API_KEY not set", file=sys.stderr)
        return None

    cfg = load_config()
    model = cfg.get("vision_api", {}).get("model", "claude-sonnet-4-20250514")

    body = json.dumps({
        "model": model,
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": b64}
                },
                {"type": "text", "text": "Analyze this Conductor screenshot and return a JSON array of actions."}
            ]
        }]
    })

    try:
        result = subprocess.run(
            [
                "curl", "-s",
                "https://api.anthropic.com/v1/messages",
                "-H", f"x-api-key: {api_key}",
                "-H", "anthropic-version: 2023-06-01",
                "-H", "Content-Type: application/json",
                "-d", body,
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print(f"night_owl: API error: {result.stderr}", file=sys.stderr)
            return None

        resp = json.loads(result.stdout)
        text = resp.get("content", [{}])[0].get("text", "")

        # Extract JSON array from response
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            actions = json.loads(text[start:end + 1])
            return validate_actions(actions)
        return None
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        print(f"night_owl: API call failed: {e}", file=sys.stderr)
        return None


def call_openai(b64: str, system_prompt: str) -> list | None:
    """Call OpenAI vision API, return parsed action list or None."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("night_owl: OPENAI_API_KEY not set", file=sys.stderr)
        return None

    cfg = load_config()
    model = cfg.get("vision_api", {}).get("model", "gpt-4o")

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    {"type": "text", "text": "Analyze this Conductor screenshot and return a JSON array of actions."}
                ]
            }
        ],
        "max_tokens": 2048,
    })

    try:
        result = subprocess.run(
            [
                "curl", "-s",
                "https://api.openai.com/v1/chat/completions",
                "-H", f"Authorization: Bearer {api_key}",
                "-H", "Content-Type: application/json",
                "-d", body,
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print(f"night_owl: API error: {result.stderr}", file=sys.stderr)
            return None

        resp = json.loads(result.stdout)
        text = resp["choices"][0]["message"]["content"]

        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            actions = json.loads(text[start:end + 1])
            return validate_actions(actions)
        return None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError) as e:
        print(f"night_owl: API call failed: {e}", file=sys.stderr)
        return None


def validate_actions(actions: list) -> list:
    """Validate that actions match the expected schema. Filters invalid ones."""
    valid_types = {"click", "type", "press", "wait", "text", "done"}
    valid = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        atype = a.get("type")
        if atype not in valid_types:
            print(f"night_owl: skipping invalid action type: {atype}", file=sys.stderr)
            continue
        if atype == "click" and ("x" not in a or "y" not in a):
            continue
        if atype == "type" and "text" not in a:
            continue
        if atype == "press" and "key" not in a:
            continue
        if atype == "text" and "event" not in a:
            continue
        valid.append(a)
    return valid


def process_screenshot(png_path: str) -> list | None:
    """Main entry: send screenshot to vision API, return validated actions."""
    cfg = load_config()
    provider = cfg.get("vision_api", {}).get("provider", "anthropic")
    system_prompt = cfg.get("system_prompt", SYSTEM_PROMPT)

    print(f"night_owl: sending screenshot to {provider}")
    b64 = image_to_base64(png_path)
    if not b64:
        return None

    if provider == "anthropic":
        return call_anthropic(b64, system_prompt)
    elif provider == "openai":
        return call_openai(b64, system_prompt)
    else:
        print(f"night_owl: unknown provider: {provider}", file=sys.stderr)
        return None


if __name__ == "__main__":
    # Quick test: screenshot and process
    png = screenshot_conductor()
    if png:
        actions = process_screenshot(png)
        if actions:
            print(json.dumps(actions, indent=2))
        else:
            print("No actions returned", file=sys.stderr)
            sys.exit(1)
        os.remove(png)
    else:
        print("Screenshot failed", file=sys.stderr)
        sys.exit(1)
