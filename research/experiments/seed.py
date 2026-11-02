#!/usr/bin/env python3
"""Deterministic synthetic data generator for the web10 SIGMOD experiment.

Generates N users, each with a followers group, M posts, and K comments/reactions,
directly into ClickHouse (bypassing the API for speed — the seed is a bulk load,
not a user flow). The data is deterministic: the same --seed produces the same
dataset, so the experiment is reproducible.

Usage:
  python3 seed.py --users 10000 --posts-per-user 50 --seed 42
  python3 seed.py --users 100000 --posts-per-user 20 --seed 42

The data model (matches the live node):
  - users: one row per user in the `users` table
  - followers group: one group per user, the user is the `owner`,
    an `anyone` member row with `reader` role (public by default)
  - posts: M docs in the `posts` service, attached to the user's followers group
  - comments: K docs in the `comments` service, ref_value = a random post's doc_id
  - reactions: K docs in the `reactions` service, ref_value = a random post's doc_id
  - profile: one doc in the `profile` service per user (the author's face)

Environment (same as the docker-compose stack):
  CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DATABASE, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone

import clickhouse_connect

# ── config ──────────────────────────────────────────────────────────────────

CH_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CH_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CH_DB = os.getenv("CLICKHOUSE_DATABASE", "web10")
CH_USER = os.getenv("CLICKHOUSE_USER", "web10")
CH_PASS = os.getenv("CLICKHOUSE_PASSWORD", "web10")

# Batch size for ClickHouse inserts (one insert per batch, not per row).
BATCH = 5000

# ── helpers ─────────────────────────────────────────────────────────────────


def _gen_doc_id(rng: random.Random) -> str:
    """A doc_id in the same shape the node generates (uuid7-ish hex)."""
    return format(rng.getrandbits(128), "032x")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── seed ────────────────────────────────────────────────────────────────────


def seed(
    client,
    n_users: int,
    posts_per_user: int,
    comments_per_post: int,
    reactions_per_post: int,
    rng: random.Random,
) -> dict:
    """Generate the synthetic dataset. Returns a summary dict."""
    t0 = time.time()
    now = _now()

    # Phase 1: users + followers groups + profiles.
    print(f"[seed] {n_users} users...")
    users_rows = []
    group_rows = []
    member_rows = []
    profile_rows = []
    doc_group_rows = []

    for i in range(n_users):
        username = f"user{i:07d}"
        author_key = f"web10.users/{username}"
        group_id = f"followers-{username}"
        doc_id = _gen_doc_id(rng)

        created = now - timedelta(days=rng.randint(30, 730))

        # users table
        users_rows.append(
            [
                username,
                "bcrypt-fake-hash",  # the bench doesn't authenticate via password
                "",
                0,
                "",
                0,
                created,
                now,
                0,
            ]
        )

        # followers group: the user is owner, anyone is reader (public).
        roles = json.dumps(
            [
                {
                    "name": "owner",
                    "permissions": {
                        "posts": ["readAll", "create", "updateOwn", "deleteOwn"],
                        "comments": ["readAll", "create", "deleteOwn"],
                        "reactions": ["readAll", "create", "deleteOwn"],
                        "profile": ["readAll", "create", "updateOwn"],
                        "group": ["manageRoles", "assignRoles", "deleteGroup"],
                    },
                },
                {
                    "name": "reader",
                    "permissions": {
                        "posts": ["readAll"],
                        "comments": ["readAll"],
                        "reactions": ["readAll"],
                        "profile": ["readAll"],
                    },
                },
            ]
        )
        group_rows.append(
            [group_id, roles, "open", 1, created, now, 0, json.dumps(["web10-social-group"]), "public"]
        )
        # owner member row
        member_rows.append([group_id, author_key, "owner", created, now, 0])
        # anyone member row (public)
        member_rows.append([group_id, "anyone", "reader", created, now, 0])

        # profile doc
        profile_doc_id = _gen_doc_id(rng)
        profile_body = json.dumps(
            {
                "display_name": username,
                "bio": f"synthetic user {i}",
                "avatar_ref": "",
            }
        )
        profile_rows.append(
            [profile_doc_id, author_key, "profile", profile_body, "", [], created, now, 0, "none", ""]
        )
        doc_group_rows.append([profile_doc_id, group_id, created, now, 0])

    _batch_insert(client, "users", users_rows, _user_columns())
    _batch_insert(client, "group_contracts", group_rows, _group_columns())
    _batch_insert(client, "group_members", member_rows, _member_columns())
    _batch_insert(client, "documents", profile_rows, _doc_columns())
    _batch_insert(client, "doc_groups", doc_group_rows, _doc_group_columns())

    t_users = time.time() - t0
    print(f"[seed] users+groups+profiles: {t_users:.1f}s")

    # Phase 2: posts + comments + reactions.
    # For speed, generate in batches. Each user's posts go into their followers
    # group. Comments/reactions reference a random post from the same user
    # (keeps the data local to the group — the feed query reads the followers
    # group, so the engagement joins resolve within it).
    print(f"[seed] {n_users * posts_per_user} posts, "
          f"{n_users * posts_per_user * comments_per_post} comments, "
          f"{n_users * posts_per_user * reactions_per_post} reactions...")

    post_rows = []
    post_dg_rows = []
    comment_rows = []
    comment_dg_rows = []
    reaction_rows = []
    reaction_dg_rows = []

    # We need a pool of post doc_ids per user for comment/reaction refs.
    # Generate all post ids first (they're deterministic from the rng).
    all_post_ids: list[list[str]] = []  # per user: list of post doc_ids
    for i in range(n_users):
        ids = [_gen_doc_id(rng) for _ in range(posts_per_user)]
        all_post_ids.append(ids)

    post_count = 0
    comment_count = 0
    reaction_count = 0

    for i in range(n_users):
        username = f"user{i:07d}"
        author_key = f"web10.users/{username}"
        group_id = f"followers-{username}"
        user_posts = all_post_ids[i]

        for j, doc_id in enumerate(user_posts):
            created = now - timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 23))
            body = json.dumps(
                {
                    "text": f"post {j} by {username}",
                    "media_refs": [],
                }
            )
            post_rows.append(
                [doc_id, author_key, "posts", body, "", [], created, now, 0, "none", ""]
            )
            post_dg_rows.append([doc_id, group_id, created, now, 0])
            post_count += 1

            # comments on this post
            for _ in range(comments_per_post):
                c_doc_id = _gen_doc_id(rng)
                c_created = created + timedelta(minutes=rng.randint(1, 1440))
                c_author = author_key  # same user comments (keeps it in-group)
                c_body = json.dumps({"text": "comment", "post_id": doc_id})
                comment_rows.append(
                    [c_doc_id, c_author, "comments", c_body, doc_id, [], c_created, now, 0, "none", ""]
                )
                comment_dg_rows.append([c_doc_id, group_id, c_created, now, 0])
                comment_count += 1

            # reactions on this post
            for _ in range(reactions_per_post):
                r_doc_id = _gen_doc_id(rng)
                r_created = created + timedelta(minutes=rng.randint(1, 1440))
                r_author = author_key
                r_body = json.dumps({"type": "like", "post_id": doc_id})
                reaction_rows.append(
                    [r_doc_id, r_author, "reactions", r_body, doc_id, [], r_created, now, 0, "none", ""]
                )
                reaction_dg_rows.append([r_doc_id, group_id, r_created, now, 0])
                reaction_count += 1

        # Flush in batches to keep memory bounded.
        if len(post_rows) >= BATCH:
            _batch_insert(client, "documents", post_rows, _doc_columns())
            _batch_insert(client, "doc_groups", post_dg_rows, _doc_group_columns())
            post_rows, post_dg_rows = [], []
        if len(comment_rows) >= BATCH:
            _batch_insert(client, "documents", comment_rows, _doc_columns())
            _batch_insert(client, "doc_groups", comment_dg_rows, _doc_group_columns())
            comment_rows, comment_dg_rows = [], []
        if len(reaction_rows) >= BATCH:
            _batch_insert(client, "documents", reaction_rows, _doc_columns())
            _batch_insert(client, "doc_groups", reaction_dg_rows, _doc_group_columns())
            reaction_rows, reaction_dg_rows = [], []

    # Flush remaining.
    if post_rows:
        _batch_insert(client, "documents", post_rows, _doc_columns())
        _batch_insert(client, "doc_groups", post_dg_rows, _doc_group_columns())
    if comment_rows:
        _batch_insert(client, "documents", comment_rows, _doc_columns())
        _batch_insert(client, "doc_groups", comment_dg_rows, _doc_group_columns())
    if reaction_rows:
        _batch_insert(client, "documents", reaction_rows, _doc_columns())
        _batch_insert(client, "doc_groups", reaction_dg_rows, _doc_group_columns())

    total = time.time() - t0
    print(f"[seed] done: {post_count} posts, {comment_count} comments, "
          f"{reaction_count} reactions in {total:.1f}s")

    return {
        "users": n_users,
        "groups": n_users,
        "posts": post_count,
        "comments": comment_count,
        "reactions": reaction_count,
        "profiles": n_users,
        "total_docs": post_count + comment_count + reaction_count + n_users,
        "seed_time_s": round(total, 1),
    }


def _batch_insert(client, table: str, rows: list, columns: list[str]) -> None:
    """Insert rows in batches of BATCH."""
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        client.insert(table, chunk, column_names=columns)


def _user_columns() -> list[str]:
    return ["username", "password_hash", "phone", "phone_verified", "email", "email_verified", "created_at", "updated_at", "deleted"]


def _group_columns() -> list[str]:
    return ["group_id", "roles", "join_policy", "discoverable", "created_at", "updated_at", "deleted", "tags", "membership_visibility"]


def _member_columns() -> list[str]:
    return ["group_id", "member_key", "role", "created_at", "updated_at", "deleted"]


def _doc_columns() -> list[str]:
    return ["doc_id", "author_key", "collection_name", "body", "ref_value", "tags", "created_at", "updated_at", "deleted", "ad_mode", "ad_target"]


def _doc_group_columns() -> list[str]:
    return ["doc_id", "group_id", "created_at", "updated_at", "deleted"]


# ── main ────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="web10 SIGMOD experiment data seeder")
    parser.add_argument("--users", type=int, default=10000, help="number of synthetic users")
    parser.add_argument("--posts-per-user", type=int, default=50, help="posts per user")
    parser.add_argument("--comments-per-post", type=int, default=2, help="comments per post")
    parser.add_argument("--reactions-per-post", type=int, default=3, help="reactions per post")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed (determinism)")
    parser.add_argument("--host", default=CH_HOST, help="ClickHouse host")
    parser.add_argument("--port", type=int, default=CH_PORT, help="ClickHouse port")
    parser.add_argument("--db", default=CH_DB, help="ClickHouse database")
    parser.add_argument("--user", default=CH_USER, help="ClickHouse user")
    parser.add_argument("--password", default=CH_PASS, help="ClickHouse password")
    parser.add_argument("--truncate", action="store_true", help="TRUNCATE the tables first (fresh seed)")
    args = parser.parse_args()

    client = clickhouse_connect.get_client(
        host=args.host,
        port=args.port,
        database=args.db,
        username=args.user,
        password=args.password,
    )

    if args.truncate:
        print("[seed] truncating tables...")
        for table in ["documents", "doc_groups", "group_members", "group_contracts", "users"]:
            client.command(f"TRUNCATE TABLE {table}")
        print("[seed] truncated.")

    rng = random.Random(args.seed)
    summary = seed(
        client,
        n_users=args.users,
        posts_per_user=args.posts_per_user,
        comments_per_post=args.comments_per_post,
        reactions_per_post=args.reactions_per_post,
        rng=rng,
    )

    print(f"\n[seed] summary: {json.dumps(summary, indent=2)}")

    # Write the summary to a file the bench can read (the scale numbers for
    # the paper's evaluation section).
    out = os.path.join(os.path.dirname(__file__), "seed-summary.json")
    with open(out, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"[seed] summary written to {out}")


if __name__ == "__main__":
    main()
