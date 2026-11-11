#!/usr/bin/env python3
"""K=20 date-minority derivative — the 30-day window engineered as a minority.

Parent (pinned): the frozen ``k20-1m-hot`` V2 input
(``ed2e8a02c2c213eb12d4d2fb1ce78c1ec13b6f58b7de0c4f968eca0a45bbf637``):
1M creators, K=20 hot (every reader follows creators 0..19), seed 42.

The base V2 inputs are all-recent (1M authors span ~11.6 days), so no 30-day
bound prunes anything there (PROTOCOL §4: Arm B is a declared vacuous control
on the personal feed). This derivative makes the date mechanisms earn their
keep, in the shape the operator declared (09.11.2026): ~1/30 of the post
dataset is inside the last 30 days, the rest is old history.

Contract (declared constants, pinned in the manifest — reproducible on the
frozen artifact):

* ``CLOCK``   = 2026-11-09T12:00:00Z (same pinned clock as the #1464 date
  fixture, for cross-receipt continuity)
* ``cutoff``  = CLOCK - 30 days (inclusive lower bound)
* cohort      = creators 0..19 (the hot followed set of EVERY reader) ->
  the newest 20 seconds before CLOCK (index 19 newest). These 20 posts are
  the measured personal feed's entire top-20 on every arm: output parity
  with Arm A holds by construction (all other readable posts are old).
* background  = the last ``R = floor(creators / 30)`` creator indices ->
  spread evenly over (cutoff, CLOCK - 21 s), so ~1/30 of the POSTS sit in
  the window. (As a fraction of all documents the window is ~1.1%; profiles,
  reactions and comments of non-cohort creators stay old — declared.)
* everyone else keeps the parent's January-2026 stamps (old).

Only ``documents`` + ``doc_groups`` are re-stamped (links mirror their
docs); all other tables are byte-copied. New format tag
``web10-costfn-date-k20-v1``, new identity, all-row validation re-applies
the transform to the parent recipe. The oracle (``date_indices``) is
independent arithmetic, not a replay of the transform.
"""
import argparse
import contextlib
from datetime import datetime, timedelta, timezone
import gzip
import json
from pathlib import Path
import shutil

import dataset as v1
import dataset_v2 as v2

TABLES = v2.TABLES
PARENT_ID = "ed2e8a02c2c213eb12d4d2fb1ce78c1ec13b6f58b7de0c4f968eca0a45bbf637"
CLOCK = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
CUTOFF_MS = int((CLOCK - timedelta(days=30)).timestamp() * 1000)
COHORT_SPAN_S = 20            # cohort occupies CLOCK-20s .. CLOCK-1s
BACKGROUND_STEP_S = 77        # oldest background = CLOCK - 21 - (R-1)*77s > CLOCK - 30d


def background_count(creators):
    return creators // 30


def contract(recipe):
    r = background_count(recipe["creators"])
    return {"format": "web10-costfn-date-k20-contract",
            "clock": CLOCK.isoformat(), "cutoff_ms": CUTOFF_MS, "window_days": 30,
            "cohort": f"creators 0..{recipe['follow'] - 1} (the hot followed set of every reader)",
            "cohort_stamps": "CLOCK - 20s .. CLOCK - 1s (newest posts in the store)",
            "background": f"last {r} creator indices",
            "background_stamps": f"spread over (CLOCK - 30d, CLOCK - {COHORT_SPAN_S + 1}s), step {BACKGROUND_STEP_S}s",
            "posts_in_window": r + recipe["follow"],
            "scope": "Declared date-minority input for the K=20 personal feed: the 30-day "
                     "window is ~1/30 of the posts; every arm's top-20 equals the cohort, "
                     "so output parity with Arm A holds by construction."}


def stamp_for(index, recipe):
    creators = recipe["creators"]
    if index < recipe["follow"]:
        return (CLOCK - timedelta(seconds=COHORT_SPAN_S - index)).strftime("%Y-%m-%d %H:%M:%S.000")
    r = background_count(creators)
    if index >= creators - r:
        return (CLOCK - timedelta(seconds=COHORT_SPAN_S + 1 + (index - (creators - r)) * BACKGROUND_STEP_S)) \
            .strftime("%Y-%m-%d %H:%M:%S.000")
    return None  # unchanged


def transform(table, row, recipe):
    if table not in ("documents", "doc_groups"):
        return row
    index = int((datetime.fromisoformat(row["created_at"]) - datetime(2026, 1, 1)).total_seconds())
    stamp = stamp_for(index, recipe)
    if stamp is None:
        return row
    return {**row, "created_at": stamp, "updated_at": stamp}


def base(parent):
    return {**v2.manifest_base(parent["recipe"]), "format": "web10-costfn-date-k20-v1",
            "parent_dataset_id": parent["dataset_id"], "date_contract": contract(parent["recipe"]),
            "date_generator_sha256": v1.digest(__file__)}


def derive(source, destination):
    source, destination = Path(source), Path(destination)
    v2.validate(source)
    parent = json.loads((source / "manifest.json").read_bytes())
    if parent["dataset_id"] != PARENT_ID:
        raise ValueError("the K=20 date derivative requires the frozen k20-1m-hot parent")
    if parent["recipe"]["locality"] != "hot" or parent["recipe"]["follow"] != COHORT_SPAN_S:
        raise ValueError("the derivative's cohort contract requires the K=20 hot parent")
    destination.mkdir(exist_ok=False, parents=True)
    manifest = base(parent)
    manifest["files"] = {}
    for table, info in parent["files"].items():
        target = destination / info["name"]
        if table in ("documents", "doc_groups"):
            with gzip.open(source / info["name"], "rb") as incoming, target.open("xb") as raw:
                with gzip.GzipFile(filename="", mode="wb", mtime=0, fileobj=raw) as outgoing:
                    for line in incoming:
                        outgoing.write(v1.encoded(transform(table, json.loads(line), parent["recipe"])))
        else:
            shutil.copyfile(source / info["name"], target)
        manifest["files"][table] = {**info, "bytes": target.stat().st_size, "sha256": v1.digest(target)}
        print(f"[date-k20] derived {table}", flush=True)
    manifest["dataset_id"] = v1.identity(manifest)
    (destination / "manifest.json").write_bytes(v1.encoded(manifest))
    return manifest


def validate(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    if manifest.get("parent_dataset_id") != PARENT_ID:
        raise ValueError("date-k20 fixture requires the frozen k20-1m-hot parent")
    v2.check_recipe(manifest["recipe"])
    expected = {**base({"recipe": manifest["recipe"], "dataset_id": PARENT_ID}),
                "files": manifest["files"], "dataset_id": manifest["dataset_id"]}
    if manifest != expected or v1.identity(manifest) != manifest["dataset_id"]:
        raise ValueError("date-k20 manifest/source mismatch")
    if set(manifest["files"]) != set(TABLES) or {p.name for p in directory.iterdir()} != {"manifest.json", *(f"{t}.jsonl.gz" for t in TABLES)}:
        raise ValueError("unexpected date-k20 files")
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {}
        for table, info in manifest["files"].items():
            path = directory / f"{table}.jsonl.gz"
            if path.is_symlink() or info["name"] != path.name or path.stat().st_size != info["bytes"] or v1.digest(path) != info["sha256"]:
                raise ValueError("date-k20 file integrity mismatch")
            streams[table] = stack.enter_context(gzip.open(path, "rb"))
        for table, row in v2.rows(manifest["recipe"]):
            if streams[table].readline() != v1.encoded(transform(table, row, manifest["recipe"])):
                raise ValueError("date-k20 row mismatch")
            counts[table] += 1
        if any(streams[t].read(1) or counts[t] != manifest["files"][t]["rows"] for t in TABLES):
            raise ValueError("date-k20 row count mismatch")
    return {"dataset_id": manifest["dataset_id"], "rows": counts,
            "date_contract": manifest["date_contract"],
            "compressed_bytes": sum(i["bytes"] for i in manifest["files"].values())}


def date_indices(manifest, reader, offset=0):
    """Independent arithmetic oracle: the measured top-20 = the cohort, index desc."""
    recipe = manifest["recipe"]
    wanted = list(range(recipe["follow"] - 1, -1, -1))
    return wanted[offset:offset + 21]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["derive", "validate"])
    parser.add_argument("source", type=Path, help="parent (k20-1m-hot) input directory")
    parser.add_argument("destination", type=Path, nargs="?")
    args = parser.parse_args()
    if args.command == "derive":
        if not args.destination:
            parser.error("destination required")
        manifest = derive(args.source, args.destination)
        print(json.dumps({"dataset_id": manifest["dataset_id"],
                          "date_contract": manifest["date_contract"]}, indent=2))
    else:
        if not args.source:
            parser.error("directory required")
        print(json.dumps(validate(args.source), indent=2))
