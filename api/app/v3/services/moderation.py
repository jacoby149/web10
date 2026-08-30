"""Content moderation (D59) — sensitive-language detection + discover suppression.

The detection is a pure whole-word, case-insensitive blocklist check. The
blocklist lives in node_config (operator-curated). A matching post attached to
the discover group is auto-hidden from the board via the existing
``group_hidden_docs`` mechanism (no new read-path change). A flag row is
recorded for the operator's review queue.

KB: knowledge/knowledge-base/web10-v3/social/content-moderation.md
Default list: knowledge/knowledge-base/web10-v3/social/sensitive-words-default.md
"""

import logging
import re

from app.v3.services import clickhouse as ch

log = logging.getLogger(__name__)

# Sentinel recorded as the moderator_key when the node (not a human) hides a
# post automatically. It's just a String column — a marker, not a principal.
NODE_MODERATOR = "node"


def _word_re(word: str) -> re.Pattern:
    """A whole-word, case-insensitive match for one blocklist entry.

    Word boundaries so "ass" does not match "assassin". The entry itself is
    escaped (leetspeak variants like "n1gger" contain no metacharacters, but
    escaping keeps the matcher safe if the operator adds a pattern later).
    """
    return re.compile(r"\b" + re.escape(word) + r"\b", re.IGNORECASE)


def check_text(text: str, words: list[str]) -> list[str]:
    """Return the blocklist words found in ``text`` (whole-word, case-insensitive).

    Empty/None text or an empty blocklist returns []. The result is deduped and
    preserves blocklist order (stable for the flag record + tests).
    """
    if not text or not words:
        return []
    matched = []
    for word in words:
        if not word:
            continue
        if _word_re(word).search(text):
            matched.append(word)
    return matched


def moderation_config() -> dict:
    """The effective moderation settings from node_config.

    Returns {sensitive_words, auto_moderate, moderation_enabled, auto_hide_users}.
    Defaults: the shipped blocklist, auto_moderate on, moderation_enabled on,
    no auto-hide users. (effective_config already merges the saved config over
    these defaults — see services/config.py.)
    """
    from app.services import config as config_svc

    cfg = config_svc.effective_config()
    return {
        "sensitive_words": cfg.get("sensitive_words") or [],
        "auto_moderate": bool(cfg.get("auto_moderate", True)),
        "moderation_enabled": bool(cfg.get("moderation_enabled", True)),
        "auto_hide_users": cfg.get("auto_hide_users") or [],
    }


def should_auto_hide(username: str, text: str, cfg: dict | None = None) -> list[str]:
    """Decide whether a new post by ``username`` should be auto-hidden from
    discover, and why.

    Returns a list of reasons (empty = do not hide):
      - ``["auto_hide_users"]`` — the username is on the operator's list
        (no blocklist match needed).
      - the matched blocklist words — the text tripped the filter.

    A user on ``auto_hide_users`` is hidden regardless of text. Otherwise the
    text is checked against the blocklist. ``moderation_enabled`` off (or an
    empty blocklist with the user not on the list) returns [].
    """
    if cfg is None:
        cfg = moderation_config()
    if not cfg["moderation_enabled"]:
        return []
    if username in cfg["auto_hide_users"]:
        return ["auto_hide_users"]
    matched = check_text(text, cfg["sensitive_words"])
    return matched


def record_flag(username: str, doc_id: str, matched: list[str]) -> None:
    """Append a moderation flag (the review queue). Best-effort — a failure to
    record a flag must never fail the post create."""
    log.info("[moderation] flag %s doc=%s matched=%s", username, doc_id, matched)
    try:
        ch.insert_moderation_flag(username, doc_id, matched)
    except Exception as e:
        log.warning("[moderation] flag record failed (non-fatal): %s: %s", type(e).__name__, e)


def get_flags() -> list[dict]:
    """The review queue: one row per flagged user, with the flag count, the
    latest flag time, and a sample of the matched words. Newest first."""
    return ch.get_moderation_flags()
