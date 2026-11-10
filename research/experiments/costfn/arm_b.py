#!/usr/bin/env python3
"""Arm B — the 30-day date bound as pure SQL on the pinned core-feed capture.

Arm B is Arm A's real main query plus `p.created_at >= <cutoff>` — no new
index, no design change. On today's (author_key, doc_id)-ordered table this
is a column scan + filter, not a range seek: it shrinks the candidate set for
the downstream steps, it does not skip the table (PROTOCOL §4).

The cutoff is a DECLARED CONSTANT per dataset: input max(created_at) minus
30 days, anchored to the frozen input (not wall-clock) so receipts stay
reproducible. On the base all-recent inputs (1M authors span ~11.6 days from
2026-01-01) the bound is a VACUOUS CONTROL on the personal K=20 feed: all 20
eligible posts sit in-window, the output must equal Arm A exactly, and the
expected result is neutral-to-negative. A non-vacuous date-bound measurement
belongs on the Discover-balanced surface (the one that honestly applies the
bound) on a long-span derivative input — named in PROTOCOL §4.
"""
import core_feed

ORDER_ANCHOR = " ORDER BY toUnixTimestamp64Milli(p.created_at) DESC"


def max_created_at_for_creators(creators):
    """The V2 generator stamps creator i at 2026-01-01 + i seconds."""
    from datetime import datetime, timedelta
    return (datetime(2026, 1, 1) + timedelta(seconds=creators - 1)).strftime("%Y-%m-%d %H:%M:%S.000")


def cutoff_for_creators(creators, window_days=30):
    from datetime import datetime, timedelta
    return (datetime(2026, 1, 1) + timedelta(seconds=creators - 1) - timedelta(days=window_days)) \
        .strftime("%Y-%m-%d %H:%M:%S.000")


def cutoff_for(manifest):
    """The declared per-input Arm B cutoff.

    Date-contract inputs (the K=20 long-span derivative, dataset_v2_date)
    carry their pinned cutoff in the manifest (web10-costfn-date-k20-v1
    format: CLOCK - 30 days, a declared constant). Base all-recent inputs
    use input max(created_at) - 30 days (vacuous control on the personal
    K=20 feed — PROTOCOL §4).
    """
    contract = manifest.get("date_contract")
    if contract and contract.get("cutoff_ms") is not None:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(contract["cutoff_ms"] / 1000, tz=timezone.utc) \
            .strftime("%Y-%m-%d %H:%M:%S.000"), f"manifest date_contract cutoff_ms={contract['cutoff_ms']}"
    return cutoff_for_creators(manifest["recipe"]["creators"]), "input max(created_at) - 30 days"


def arm_b_main_sql(cutoff, basis="declared constant"):
    """The pinned v5 main SQL with the inclusive lower bound injected."""
    capture = core_feed.wire()
    sql = capture["requests"][0]["payload"]["sql"]
    if ORDER_ANCHOR not in sql:
        raise ValueError("pinned main SQL lost its Newest ORDER BY anchor; recapture and review")
    if "created_at >=" in sql:
        raise ValueError("Arm B SQL must start from the undated Arm A main query")
    modified = sql.replace(ORDER_ANCHOR,
                           f" AND p.created_at >= '{cutoff}'{ORDER_ANCHOR}")
    # The arm variant must still carry the real core-feed shape.
    for fragment in ("FROM posts p", "FROM reactions", "FROM comments", "FROM profile", "LIMIT 21"):
        if fragment not in modified:
            raise ValueError(f"Arm B main SQL lost a core fragment: {fragment}")
    return {"sql": modified, "cutoff": cutoff, "cutoff_basis": basis,
            "note": "On the all-recent base inputs this is a declared vacuous control at K=20 "
                    "(all 20 eligible posts in-window; expected neutral-to-negative). On the "
                    "date-k20 long-span input the window is ~1/30 of the posts and the bound is "
                    "the non-vacuous date treatment. Output must equal Arm A exactly or the "
                    "arm is INVALID."}
