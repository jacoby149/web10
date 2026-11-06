#!/usr/bin/env python3
"""Sixth-draft offered-load arithmetic, NOT a load generator or measurement.

Run: python3 research/experiments/costfn/capacity_plan.py
One million seeded authors denotes registered namespaces, not observed MAU.
Sessions include idle think time. The activity scenarios are assumptions.
"""

import json


def concurrent_users(sessions_per_hour, session_minutes):
    return sessions_per_hour * session_minutes / 60


def request_rates(users, feed_interval_seconds):
    if users < 0 or feed_interval_seconds <= 0:
        raise ValueError("users must be nonnegative and interval positive")
    loads = users / feed_interval_seconds
    return {"feed_loads_per_second": loads,
            "query_calls_per_second": 3 * loads,
            "content_views_calls_per_second": loads,
            "core_requests_per_second": 4 * loads}


def plan():
    scenarios = []
    # A's 10% daily is of registered accounts; B/C's DAU fractions are of MAU.
    for name, basis, mau, dau, peak, durations in [
        ("A conservative registered", "1000000 registered", 300000, 100000, .12, [5, 15]),
        ("B likely MAU", "1000000 MAU assumed", 1000000, 250000, .15, [5, 15]),
        ("C high stickiness", "1000000 MAU assumed", 1000000, 500000, .15, [15]),
    ]:
        sessions = dau * peak  # assumption: one session per DAU per day
        scenarios.append({"scenario": name, "population_basis": basis,
                          "assumed_mau": mau, "assumed_dau": dau,
                          "daily_sessions_per_dau": 1, "peak_hour_share": peak,
                          "peak_hour_sessions": sessions,
                          "session_concurrency": [
                              {"minutes": d, "concurrent_users": concurrent_users(sessions, d)}
                              for d in durations]})
    return {"status": "PLANNED_NOT_MEASURED", "seeded_authors_target": 1000000,
            "posts_per_author_target": 1, "scenarios": scenarios,
            "stepped_offered_load": [
                {"virtual_users": n, "feed_interval_seconds": interval,
                 **request_rates(n, interval)}
                for n in [1000, 3000, 5000, 10000, 20000] for interval in [60, 30]],
            "exclusions": "Discovery, media, login and auxiliary reads add requests. In-flight requests require measured request latency, not session duration or full-page readiness."}


if __name__ == "__main__":
    print(json.dumps(plan(), indent=2))
