#!/usr/bin/env python3
"""Metadata-only seed for the access-control cost function experiment.

Seeds, through the REAL API (no direct DB writes — the seed must exercise the
same auth/group/document paths the node actually uses):

  - N creators: each signs up, creates a followers group (owner + an `anyone`
    read grant = public), and posts P small posts into it.
  - One reader: signs up and follows K of the creators (joins their followers
    groups) — so the reader's readable set is exactly K contracts.
  - A discover board: one shared group the node's public creators attach to
    (K=1 for the discover feed).

The seed is METADATA-ONLY by intent: posts are tiny JSON bodies (no media), so
the real-scan lines (A/B) of the ablation stay bounded while the policy layer
(C) depends only on K, not post volume. This is what keeps the experiment on
one small box instead of a lakehouse ladder.

Determinism: usernames are derived from --seed, so the same --seed reproduces
the same dataset. The bench reads the manifest (reader username + K + creator
usernames) this script writes, so the two never drift.

Usage (on the experiment host, after compose-up):
  python3 seed.py --creators 1000 --follow 100 --posts-per-creator 5 --seed 42 \
      --api http://localhost:6000 --out ./seed-manifest.json
"""

import argparse
import json
import os
import sys
import time

import requests

API_BASE = os.getenv("API_BASE", "http://localhost:6000")
PASSWORD = "costfn-bench-password"  # synthetic, local-only; never a real credential


def _post(session, path, payload, expect=200, retries=3):
    """POST with a short retry on 429/5xx (the rate limit is 60/min/user)."""
    for attempt in range(retries):
        r = session.post(f"{API_BASE}{path}", json=payload, timeout=30)
        if r.status_code == expect:
            return r.json()
        if r.status_code in (429, 500, 502, 503):
            time.sleep(2 * (attempt + 1))
            continue
        raise RuntimeError(f"{path} -> {r.status_code}: {r.text[:300]}")
    raise RuntimeError(f"{path} -> gave up after {retries} attempts (last {r.status_code})")


def signup(session, username):
    try:
        _post(session, "/v3/signup", {"username": username, "password": PASSWORD}, expect=200)
    except RuntimeError as e:
        if "exists" in str(e).lower() or "EXISTS" in str(e):
            pass  # idempotent re-seed
        else:
            raise
    tok = _post(session, "/v3/login", {"username": username, "password": PASSWORD, "site": "costfn"})["token"]
    return tok


FOLLOWERS_ROLES = [
    {
        "name": "owner",
        "permissions": {
            "posts": ["readAll", "create", "updateOwn", "deleteOwn"],
            "profile": ["readAll", "create", "updateOwn"],
            "group": ["manageRoles", "assignRoles", "deleteGroup"],
        },
    },
    {
        "name": "reader",
        "permissions": {"posts": ["readAll"], "profile": ["readAll"]},
    },
]


def create_followers_group(session, token, name):
    """Create the creator's followers group: owner + an `anyone` reader grant
    (public — the D58 principal-class read, no membership row needed)."""
    body = {
        "token": token,
        "name": name,
        "roles": FOLLOWERS_ROLES,
        "joinPolicy": "open",
        "discoverable": True,
        "tags": ["web10-social-group"],
        "membershipVisibility": "public",
        "members": [{"memberKey": "anyone", "role": "reader"}],
    }
    return _post(session, "/v3/groups/create", body)["group_id"]


def join_group(session, token, group_id):
    """The reader joins a creator's followers group (= follows them)."""
    _post(session, "/v3/groups/join", {"token": token, "groupId": group_id})


def post(session, token, group_id, text):
    _post(
        session,
        "/v3/documents/create",
        {"token": token, "service": "posts", "body": {"text": text}, "groups": [group_id]},
    )


def main():
    p = argparse.ArgumentParser(description="metadata-only seed for the cost-function experiment")
    p.add_argument("--creators", type=int, default=1000, help="number of creators to seed")
    p.add_argument("--follow", type=int, default=100, help="how many creators the reader follows (K)")
    p.add_argument("--posts-per-creator", type=int, default=5, help="tiny posts per creator (keeps the scan bounded)")
    p.add_argument("--seed", type=int, default=42, help="RNG/derivation seed (determinism)")
    p.add_argument("--api", default=API_BASE, help="API base URL")
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "seed-manifest.json"))
    args = p.parse_args()

    global API_BASE
    API_BASE = args.api
    if args.follow > args.creators:
        print(f"error: --follow ({args.follow}) cannot exceed --creators ({args.creators})", file=sys.stderr)
        sys.exit(1)

    t0 = time.time()
    session = requests.Session()

    # Derive deterministic usernames from the seed.
    def uname(prefix, i):
        return f"c{args.seed}-{prefix}{i:06d}"

    reader_name = f"c{args.seed}-reader"
    creator_names = [uname("c", i) for i in range(args.creators)]
    followed_names = creator_names[: args.follow]

    print(f"[seed] api={API_BASE} creators={args.creators} follow(K)={args.follow} posts/creator={args.posts_per_creator}")

    # 1. Reader first (so its token exists for the joins).
    reader_token = signup(session, reader_name)
    print(f"[seed] reader ready: {reader_name}")

    # 2. Creators: signup + followers group + tiny posts.
    creator_groups = {}
    for i, name in enumerate(creator_names):
        tok = signup(session, name)
        gid = create_followers_group(session, tok, f"followers-{name}")
        creator_groups[name] = gid
        for j in range(args.posts_per_creator):
            post(session, tok, gid, f"post {j} by {name}")
        if (i + 1) % 50 == 0 or i + 1 == args.creators:
            print(f"[seed]   {i + 1}/{args.creators} creators seeded")

    # 3. Reader follows K creators (joins their followers groups).
    for name in followed_names:
        join_group(session, reader_token, creator_groups[name])
    print(f"[seed] reader now follows {len(followed_names)} creators")

    # 4. Discover board: one shared group the public creators attach to.
    #    Use the reader's token to own it (it's a node-level board for the test).
    board_gid = create_followers_group(session, reader_token, "discover-board")
    # Attach a few public creators' posts to the board so the discover feed has rows.
    for name in followed_names[: min(10, len(followed_names))]:
        # Re-fetch the creator's token (cheap) to attach to the board.
        ctok = _post(session, "/v3/login", {"username": name, "password": PASSWORD, "site": "costfn"})["token"]
        post(session, ctok, board_gid, f"board post by {name}")
    print(f"[seed] discover board ready: {board_gid}")

    manifest = {
        "seed": args.seed,
        "api": API_BASE,
        "reader": reader_name,
        "password": PASSWORD,
        "k": len(followed_names),
        "creators_total": args.creators,
        "followed": followed_names,
        "creator_groups": creator_groups,
        "discover_board": board_gid,
        "posts_per_creator": args.posts_per_creator,
        "seed_time_s": round(time.time() - t0, 1),
    }
    with open(args.out, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[seed] done in {manifest['seed_time_s']}s; manifest -> {args.out}")


if __name__ == "__main__":
    main()
