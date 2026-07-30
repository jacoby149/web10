import re


def safe_str(val) -> str | None:
    if val is None or val == "":
        return None
    return str(val).strip()


def safe_num(val):
    if val is None or val == "":
        return None
    try:
        n = float(val)
        return int(n) if n == int(n) else n
    except (ValueError, TypeError):
        return None


def parse_timestamp(ts: str | None) -> str | None:
    if not ts:
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(ts.replace("Z", "+00:00")).isoformat()
    except (ValueError, TypeError):
        return None


def parse_tags(text: str | None) -> list[str]:
    if not text:
        return []
    return re.findall(r"#(\w+)", text)


def parse_mentions(text: str | None, provider: str) -> list[dict]:
    if not text:
        return []
    usernames = re.findall(r"@(\w+)", text)
    return [{"username": u, "provider": provider} for u in set(usernames)]


def is_instagram_zip(entries: list[dict]) -> bool:
    for e in entries:
        p = e["path"].lower()
        if "instagram" in p:
            return True
        if "posts/" in p and p.endswith(".json"):
            return True
        if "your instagram and basic information" in p:
            return True
    return False


def is_facebook_zip(entries: list[dict]) -> bool:
    for e in entries:
        p = e["path"].lower()
        if "facebook" in p:
            return True
        if "your posts.json" in p and "instagram" not in p:
            return True
        if "your friends list.json" in p:
            return True
        if "your photos.json" in p and "instagram" not in p:
            return True
    return False


def is_youtube_zip(entries: list[dict]) -> bool:
    for e in entries:
        p = e["path"].lower()
        if "youtube" in p or ("takeout" in p and "youtube" in p):
            return True
    return False


def is_web10_zip(entries: list[dict]) -> bool:
    for e in entries:
        p = e["path"].lower()
        if "web10_export.json" in p:
            return True
        if "web10_export" in p and "manifest" in p:
            return True
    return False


def detect_platform(entries: list[dict]) -> str:
    if is_web10_zip(entries):
        return "web10"
    if is_instagram_zip(entries):
        return "instagram"
    if is_facebook_zip(entries):
        return "facebook"
    if is_youtube_zip(entries):
        return "youtube"
    return "unknown"


def find_json_entries(entries: list[dict]) -> list[dict]:
    return [e for e in entries if e["path"].endswith(".json")]


def find_media_entries(entries: list[dict], extensions: list[str]) -> list[dict]:
    exts = {ext.lower() for ext in extensions}
    return [e for e in entries if any(e["path"].lower().endswith(ext) for ext in exts)]
