#!/usr/bin/env python3
"""App-compatible relational fixtures; V1 remains byte-for-byte unchanged."""
import argparse
import contextlib
from datetime import datetime, timedelta
import gzip
import json
from pathlib import Path
import uuid

import dataset as v1

TABLES = (*v1.TABLES, "app_contracts")
PROVIDER = v1.PROVIDER
PASSWORD = v1.PASSWORD
ORIGIN = "https://costfn.research.invalid"
SERVICES = ("posts", "profile", "reactions", "comments")
DISCOVER = f"{PROVIDER}/groups/web10/discover"


def check_recipe(recipe):
    v1.check_recipe({k: recipe[k] for k in ("creators", "follow", "readers", "seed")})
    if set(recipe) != {"creators", "follow", "readers", "seed", "locality"} or recipe["locality"] not in ("hot", "dispersed"):
        raise ValueError("expected a hot or dispersed v2 recipe")


def creator(recipe, index):
    return f"c{recipe['seed']}-c{index:06d}"


def followers(user):
    return v1.group(user, "followers")


def followed_indices(recipe, reader_index):
    start = 0 if recipe["locality"] == "hot" else reader_index * recipe["follow"] % recipe["creators"]
    return [(start + i) % recipe["creators"] for i in range(recipe["follow"])]


def doc_id(user, service):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"costfn-v2/{user}/{service}"))


def stamp(index):
    return (datetime(2026, 1, 1) + timedelta(seconds=index)).strftime("%Y-%m-%d %H:%M:%S.000")


def document(user, service, body, index, ref=""):
    return {"doc_id": doc_id(user, service), "author_key": user, "posted_by": user,
            "collection_name": service, "body": v1.encoded(body).decode().strip(),
            "ref_value": ref, "tags": [], "ad_mode": "none", "ad_target": "",
            "created_at": stamp(index), "updated_at": stamp(index), "deleted": 0}


def rows(recipe):
    readers = v1.reader_names(recipe)
    for r, reader in enumerate(readers):
        yield "users", v1.account(reader)
        yield "group_members", v1.membership(DISCOVER, reader, "member")
        yield "app_contracts", {"user_key": reader, "allowed_origin": ORIGIN,
            "permissions": v1.encoded({s: ["readAll"] for s in SERVICES}).decode().strip(),
            "client_id": "", "created_at": v1.STAMP, "updated_at": v1.STAMP, "deleted": 0}
        for i in followed_indices(recipe, r):
            yield "group_members", v1.membership(followers(creator(recipe, i)), reader, "member")
    for i in range(recipe["creators"]):
        user = creator(recipe, i)
        group = followers(user)
        yield "users", v1.account(user)
        yield "group_contracts", {**v1.contract(group), "tags": ["web10-social-followers"]}
        yield "group_members", v1.membership(group, user, "owner")
        yield "group_members", v1.membership(group, "anyone", "member")
        yield "group_members", v1.membership(DISCOVER, user, "member")
        post = doc_id(user, "posts")
        docs = [("posts", {"text": f"Frozen post {i}"}, "", [group, DISCOVER]),
                ("profile", {"display_name": f"Creator {i}", "bio": "Synthetic research profile"}, "", [group]),
                ("reactions", {"type": "like"}, post, [DISCOVER])]
        if i % 10 == 0:
            docs.append(("comments", {"text": "Synthetic comment", "post_id": post}, post, [DISCOVER]))
        for service, body, ref, groups in docs:
            doc = document(user, service, body, i, ref)
            yield "documents", doc
            for gid in groups:
                yield "doc_groups", {"doc_id": doc["doc_id"], "group_id": gid,
                    "created_at": stamp(i), "updated_at": stamp(i), "deleted": 0}


def manifest_base(recipe):
    readers = v1.reader_names(recipe)
    first = [creator(recipe, i) for i in followed_indices(recipe, 0)]
    # Coverage is analytical, not a claim about physical database reads.
    coverage = recipe["follow"] if recipe["locality"] == "hot" else min(recipe["creators"], recipe["readers"] * recipe["follow"])
    return {"format": "web10-costfn-dataset-v2", "recipe": recipe,
        "generator_sha256": v1.digest(__file__), "shared_generator_sha256": v1.digest(v1.__file__),
        "provider": PROVIDER, "credential_kind": "public-synthetic-only", "password": PASSWORD,
        "origin": ORIGIN, "seed": recipe["seed"], "reader": readers[0], "readers": readers,
        "k": recipe["follow"], "creators_total": recipe["creators"],
        "registered_accounts_total": recipe["creators"] + recipe["readers"],
        "followed": first, "creator_groups": {u: followers(u) for u in first},
        "discover_board": DISCOVER, "posts_per_creator": 1,
        "candidate_author_coverage": coverage,
        "limitations": ["synthetic text only", "no media or ad inventory", "one current version per document",
                        "no user writes under load", "no browser/rendering measurement"]}


def build(directory, recipe):
    check_recipe(recipe)
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {t: stack.enter_context(gzip.GzipFile(filename="", mode="wb", mtime=0,
            fileobj=stack.enter_context((directory / f"{t}.jsonl.gz").open("xb")))) for t in TABLES}
        for index, (table, row) in enumerate(rows(recipe), 1):
            streams[table].write(v1.encoded(row))
            counts[table] += 1
            if index % 1000000 == 0:
                print(f"[dataset-v2] generated {index:,} rows", flush=True)
    manifest = manifest_base(recipe)
    manifest["files"] = {t: {"name": f"{t}.jsonl.gz", "rows": counts[t],
        "bytes": (directory / f"{t}.jsonl.gz").stat().st_size,
        "sha256": v1.digest(directory / f"{t}.jsonl.gz")} for t in TABLES}
    manifest["dataset_id"] = v1.identity(manifest)
    (directory / "manifest.json").write_bytes(v1.encoded(manifest))
    return manifest


def validate(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    check_recipe(manifest["recipe"])
    if manifest.get("dataset_id") != v1.identity(manifest) or manifest != {
            **manifest_base(manifest["recipe"]), "files": manifest.get("files"), "dataset_id": manifest["dataset_id"]}:
        raise ValueError("v2 manifest/generator identity mismatch")
    if set(manifest["files"]) != set(TABLES) or {p.name for p in directory.iterdir()} != {"manifest.json", *(f"{t}.jsonl.gz" for t in TABLES)}:
        raise ValueError("unexpected v2 files")
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {}
        for table, info in manifest["files"].items():
            path = directory / f"{table}.jsonl.gz"
            if path.is_symlink() or info != {**info, "name": path.name} or path.stat().st_size != info["bytes"] or v1.digest(path) != info["sha256"]:
                raise ValueError("v2 file integrity mismatch")
            streams[table] = stack.enter_context(gzip.open(path, "rb"))
        for table, row in rows(manifest["recipe"]):
            if streams[table].readline() != v1.encoded(row):
                raise ValueError("v2 row mismatch")
            counts[table] += 1
        if any(streams[t].read(1) or counts[t] != manifest["files"][t]["rows"] for t in TABLES):
            raise ValueError("v2 row count mismatch")
    return {"dataset_id": manifest["dataset_id"], "rows": counts,
            "registered_accounts": manifest["registered_accounts_total"],
            "compressed_bytes": sum(i["bytes"] for i in manifest["files"].values())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "validate"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--creators", type=int, default=40)
    parser.add_argument("--follow", type=int, default=25)
    parser.add_argument("--readers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--locality", choices=["hot", "dispersed"], default="hot")
    args = parser.parse_args()
    result = build(args.directory, {k: getattr(args, k) for k in ("creators", "follow", "readers", "seed", "locality")}) if args.command == "build" else validate(args.directory)
    print(json.dumps(result, indent=2))
