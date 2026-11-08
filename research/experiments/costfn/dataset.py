#!/usr/bin/env python3
"""Offline, content-addressed synthetic fixtures. No node access or DB writes."""
import argparse
import contextlib
import gzip
import hashlib
import json
import platform
from pathlib import Path
import uuid
import zlib

TABLES = ("users", "documents", "doc_groups", "group_contracts", "group_members")
STAMP = "2026-01-01 00:00:00.000"
PROVIDER = "api.localhost"
# Public fixture credentials, deliberately identical; NEVER production accounts.
PASSWORD = "costfn-bench-password"
PASSWORD_HASH = "$2b$12$4qSIbZm5Inl2Gp4V1npoXeCmBPhfKbOSnITTaR0ZO757uNY6yGrgG"
ROLES = [
    {"name": "owner", "permissions": {"posts": ["readAll", "create", "updateOwn", "deleteOwn"],
      "profile": ["readAll", "create", "updateOwn"], "group": ["manageRoles", "assignRoles", "deleteGroup"]}},
    {"name": "writer", "permissions": {"posts": ["readAll", "create"]}},
    {"name": "member", "permissions": {"posts": ["readAll"], "profile": ["readAll"]}},
]


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def check_recipe(recipe):
    limits = {"creators": (1, 1000000), "follow": (1, 1000), "readers": (1, 20000), "seed": (0, 9999)}
    if set(recipe) != set(limits):
        raise ValueError("unknown or missing recipe fields")
    for key, (low, high) in limits.items():
        if type(recipe[key]) is not int or not low <= recipe[key] <= high:
            raise ValueError(f"invalid {key}: expected integer {low}..{high}")
    if recipe["follow"] > recipe["creators"]:
        raise ValueError("follow exceeds creators")


def reader_names(recipe):
    prefix = f"c{recipe['seed']}-"
    return [prefix + ("reader" if i == 0 else f"r{i:06d}") for i in range(recipe["readers"])]


def group(user, slug):
    return f"{PROVIDER}/groups/users/{user}/{slug}"


def account(user):
    return {"username": user, "password_hash": PASSWORD_HASH, "phone": "", "email": "",
            "domain": "", "phone_verified": 0, "email_verified": 0, "domain_verified": 0,
            "created_at": STAMP, "updated_at": STAMP, "deleted": 0}


def membership(gid, user, role):
    return {"group_id": gid, "member_key": user, "role": role,
            "joined_at": STAMP, "updated_at": STAMP, "deleted": 0}


def contract(gid):
    return {"group_id": gid, "roles": encoded(ROLES).decode().strip(), "join_policy": "open",
            "discoverable": 1, "tags": ["web10-social-group"], "membership_visibility": "public",
            "created_at": STAMP, "updated_at": STAMP, "deleted": 0}


def post_rows(user, gid, label):
    doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"costfn-dataset-v1/{user}/{label}"))
    common = {"created_at": STAMP, "updated_at": STAMP, "deleted": 0}
    yield "documents", {**common, "doc_id": doc_id, "author_key": user, "posted_by": user,
                        "collection_name": "posts", "body": encoded({"text": label}).decode().strip(),
                        "ref_value": "", "tags": [], "ad_mode": "none", "ad_target": ""}
    yield "doc_groups", {**common, "doc_id": doc_id, "group_id": gid}


def rows(recipe):
    """Bounded memory even at 1M creators / 20k independent reader accounts."""
    readers = reader_names(recipe)
    discover = f"{PROVIDER}/groups/web10/discover"
    board = group(readers[0], "discover-board")
    for user in readers:
        yield "users", account(user)
        yield "group_members", membership(discover, user, "member")
    yield "group_contracts", contract(board)
    yield "group_members", membership(board, readers[0], "owner")
    yield "group_members", membership(board, "anyone", "member")
    for i in range(recipe["creators"]):
        user = f"c{recipe['seed']}-c{i:06d}"
        gid = group(user, "followers-" + user)
        yield "users", account(user)
        yield "group_members", membership(discover, user, "member")
        yield "group_contracts", contract(gid)
        yield "group_members", membership(gid, user, "owner")
        yield "group_members", membership(gid, "anyone", "member")
        if i < recipe["follow"]:
            for reader in readers:
                yield "group_members", membership(gid, reader, "member")
        yield from post_rows(user, gid, f"post 0 by {user}")
        if i < min(10, recipe["follow"]):
            yield "group_members", membership(board, user, "writer")
            yield from post_rows(user, board, f"board post by {user}")


def manifest_base(recipe):
    readers = reader_names(recipe)
    followed = [f"c{recipe['seed']}-c{i:06d}" for i in range(recipe["follow"])]
    return {"format": "web10-costfn-dataset-v1", "recipe": recipe,
            "generator_sha256": digest(__file__), "provider": PROVIDER,
            "compression_environment": {"python": platform.python_version(), "zlib": zlib.ZLIB_VERSION},
            "credential_kind": "public-synthetic-only", "seed": recipe["seed"],
            "reader": readers[0], "readers": readers, "password": PASSWORD,
            "k": recipe["follow"], "creators_total": recipe["creators"],
            "registered_accounts_total": recipe["creators"] + recipe["readers"],
            "followed": followed, "creator_groups": {u: group(u, "followers-" + u) for u in followed},
            "discover_board": group(readers[0], "discover-board"), "posts_per_creator": 1}


def identity(manifest):
    return hashlib.sha256(encoded({k: v for k, v in manifest.items() if k != "dataset_id"})).hexdigest()


def build(directory, recipe):
    check_recipe(recipe)
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {}
        for table in TABLES:
            raw = stack.enter_context((directory / f"{table}.jsonl.gz").open("xb"))
            streams[table] = stack.enter_context(gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0))
        for index, (table, row) in enumerate(rows(recipe), 1):
            streams[table].write(encoded(row))
            counts[table] += 1
            if index % 1000000 == 0:
                print(f"[dataset] generated {index:,} rows", flush=True)
    manifest = manifest_base(recipe)
    manifest["files"] = {table: {"name": f"{table}.jsonl.gz", "rows": counts[table],
                                "bytes": (directory / f"{table}.jsonl.gz").stat().st_size,
                                "sha256": digest(directory / f"{table}.jsonl.gz")} for table in TABLES}
    manifest["dataset_id"] = identity(manifest)
    (directory / "manifest.json").write_bytes(encoded(manifest))
    return manifest


def validate(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    check_recipe(manifest["recipe"])
    if manifest.get("dataset_id") != identity(manifest):
        raise ValueError("dataset identity mismatch")
    expected = manifest_base(manifest["recipe"])
    # Compression may be validated on a different Python/zlib than the builder.
    expected["compression_environment"] = manifest["compression_environment"]
    if manifest != {**expected, "files": manifest.get("files"), "dataset_id": manifest["dataset_id"]}:
        raise ValueError("manifest does not match this generator and recipe")
    if set(manifest["files"]) != set(TABLES):
        raise ValueError("unexpected table files")
    if {p.name for p in directory.iterdir()} != {"manifest.json", *(f"{t}.jsonl.gz" for t in TABLES)}:
        raise ValueError("unexpected directory entries")
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {}
        for table in TABLES:
            path = directory / f"{table}.jsonl.gz"
            info = manifest["files"][table]
            if path.is_symlink() or info["name"] != path.name or path.stat().st_size != info["bytes"] or digest(path) != info["sha256"]:
                raise ValueError(f"file integrity mismatch: {table}")
            streams[table] = stack.enter_context(gzip.open(path, "rb"))
        for table, row in rows(manifest["recipe"]):
            if streams[table].readline() != encoded(row):
                raise ValueError(f"row/relationship mismatch: {table} row {counts[table] + 1}")
            counts[table] += 1
        for table in TABLES:
            if streams[table].read(1) or counts[table] != manifest["files"][table]["rows"]:
                raise ValueError(f"row count mismatch: {table}")
    return {"dataset_id": manifest["dataset_id"], "rows": counts,
            "registered_accounts": manifest["registered_accounts_total"],
            "compressed_bytes": sum(info["bytes"] for info in manifest["files"].values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("build")
    for name, default in [("creators", 1000), ("follow", 1000), ("readers", 1), ("seed", 42)]:
        create.add_argument("--" + name, type=int, default=default)
    create.add_argument("--out", required=True)
    verify = commands.add_parser("validate")
    verify.add_argument("directory")
    args = parser.parse_args()
    if args.command == "build":
        result = build(args.out, {key: getattr(args, key) for key in ("creators", "follow", "readers", "seed")})
        print(json.dumps({"dataset_id": result["dataset_id"], "files": result["files"]}, indent=2))
    else:
        print(json.dumps(validate(args.directory), indent=2))


if __name__ == "__main__":
    main()
