"""Offline preregistration and necessary arithmetic for the derived dataset.

No imports from V2, no network, provisioning, upload or database side effects.
Totals/horizons are deliberately outputs, not a silently retained 150M cap.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

FORMAT = "web10-social-realism-derived-v1"
SOURCES = {
    "original_post_participation_and_shares": "van Mierlo 2014, JMIR",
    "followers": "Kwak et al. 2010",
    "following": "Ugander et al. 2011",
    "likes_comments_impression_shape": "McGrady et al. 2023, JQD:DM",
    "reach": "declared: min(0.8 * impressions, eligible accounts)",
    "node_ads": "declared: 300",
    "total_impressions_and_horizon": "derived attention budget; 150/account/30 days",
}
CELLS = [(k, locality) for k in (10, 20, 100, 1000) for locality in ("hot", "dispersed")]


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def identity(value):
    return hashlib.sha256(encoded({k: v for k, v in value.items() if k != "dataset_id"})).hexdigest()


def contract(accounts, seed=42, readers=None, follow=20, locality="dispersed"):
    if type(accounts) is not int or accounts not in (10000, 100000, 1000000):
        raise ValueError("declared floors are 10k/100k accounts; headline is 1M accounts")
    if type(seed) is not int or not 0 <= seed <= 9999:
        raise ValueError("seed must be an integer in 0..9999")
    if readers is None:
        readers = 20000 if accounts == 1000000 else 16
    if type(readers) is not int or not 2 <= readers <= min(20000, accounts // 10):
        raise ValueError("readers are existing distinct accounts, not additional accounts")
    if (follow, locality) not in CELLS:
        raise ValueError("undeclared K/locality cell")
    posts = accounts * 4
    events = posts * 400
    lower_posts = math.ceil(accounts * .05 / .013)
    lower_events = math.ceil((.5 - .037) * posts * 50 / .07)
    days = math.ceil(events * 30 / (accounts * 150))
    # Necessary conditions only; finished-record validation must still prove
    # the joint distribution, graph, unique audience and feed candidates.
    if posts < lower_posts or events < lower_events or days > 365:
        raise ValueError("inconsistent post/impression budget or one-year event-retention horizon")
    return {
        "format": FORMAT,
        "recipe": {"accounts": accounts, "seed": seed, "readers": readers,
                   "follow": follow, "locality": locality},
        "sources": SOURCES,
        "targets": {"nonposting": .85, "post_shares": [.747, .240, .013],
                    "posts": posts, "likes": posts * 16, "comments": posts * 16 * 3 // 10,
                    "impressions": events, "impression_median": 50,
                    "impression_head_fraction": .037, "impression_head_share": .93,
                    "like_head_fraction": .0016, "like_head_share": .5,
                    "like_nonzero_fraction": .1129, "ads": 300},
        "arithmetic": {"necessary_minimum_posts": lower_posts,
                       "necessary_minimum_impressions_at_chosen_posts": lower_events,
                       "old_attention_budget": accounts * 150,
                       "adjusted_impressions": events, "attention_horizon_days": days,
                       "reason": "Preserve van Mierlo authorship and McGrady impression shape; "
                                 "adjust total and horizon under operator directive section 7.",
                       "sufficient_joint_validation": False},
        "clock": "2026-11-10T12:00:00Z",
        "tolerances": {"share_absolute": .05, "nonposting_absolute": .001,
                       "conservation_rows": 0, "impression_median": 0,
                       "following_mean_relative": .15},
        "model_parameters": {"author_head_cap":5000,"author_head_weight_exponent":.7,
                             "activity_exponent":.5,"popularity_exponent":.6,
                             "intrinsic_post_quality_pareto_shape":2.0,
                             "active_follow_target_fraction":.8,"follow_start_power":4.6,
                             "following_head_weight_exponent":.75,
                             "interpretation":"Declared synthetic coupling parameters, not measured web10 fits"},
        "joint_rules": {
            "posting": "15% of existing accounts; top/next/bottom bands ranked by actual posts",
            "latent": "Activity and popularity ranks share account ordering; original-post zeros "
                      "are separate from viewing, liking and commenting activity.",
            "graph": "Closed directed simple graph, no self edges; 80% active-author targets "
                     "where capacity permits, popularity-biased starting ranks, unique cyclic targets.",
            "cohorts": "Existing nonposting accounts; same biased unique-target rule, exact K. "
                       "Hot shares targets; dispersed varies starting ranks. Selected cell replaces "
                       "those readers' outgoing graph, not their credentials or other accounts. "
                       "Reader zero is a declared viral probe: include the viral author, replacing "
                       "one target if necessary, never increasing K; report it separately from ordinary readers.",
            "post_time": "Originals spread over the declared horizon, unique millisecond order; "
                         "repeat deliveries obey the node's per-reader/per-post 24-hour window. "
                         "Viral probe uses a historical cursor, never an impossible newest viral burst.",
            "engagement": "Unique liking actors drawn from actual exposed audience; comments "
                          "from liking actors; event precedes like, like precedes comment.",
            "reach": "Distinct real viewers, at most impressions and account count; repeats "
                     "spread over the post-to-clock interval.",
            "visibility": "Public synthetic posts and publicly readable engagement; no claim "
                          "that these facts alone exercise private/revoked access.",
        },
        "admission": {"paid_provisioning": False, "uploads": False,
                      "million_build_requires": "passing independent 10k AND 100k receipts",
                      "pilot_requires": "generated statistics review, budget, SKU eligibility, cleanup watchdog"},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accounts", type=int, choices=[10000, 100000, 1000000], default=10000)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = contract(args.accounts)
    with args.out.open("xb") as output:
        output.write(encoded(result))
    print(f"[realism] arithmetic only; not generated evidence: {args.out}")
