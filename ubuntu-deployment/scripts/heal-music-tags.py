#!/usr/bin/env python3
"""One-time backfill: restore the `music` tag the 6.28.1 composer bug dropped
from vertical performance videos posted with "Mark as music" checked (they
shipped only `['short']`, so they never reached the Music tab, PR #1613).

Run on stdin inside the API container; --apply uses a reviewed private plan.
No service deployment, environment switch, periodic worker or endpoint is
installed. The candidate set is pinned per document below (operator intent,
22.11.2026 prod investigation) — there is no fuzzy discovery.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

MAX_ITEMS = 6

# Pinned operator intent: single vertical music-performance videos whose
# create-path tag write was swallowed by the exclusive `short` branch.
ALLOWED = [
    {"owner": "lizday", "doc_id": "01a1e226-1e9a-78eb-b89d-2184dca6af11"},
    {"owner": "leowarner", "doc_id": "01a1e13d-a9f3-7ab8-bd13-25275157a927"},
    {"owner": "leowarner", "doc_id": "01a1daf8-96ed-7869-bba2-30f91fcda54d"},
    {"owner": "samhanks", "doc_id": "01a1c790-92e3-7606-be85-18c37db6ae92"},
    {"owner": "clintbruce", "doc_id": "01a1c785-dd4a-7b54-afb0-4dd194109877"},
    {"owner": "samhanks", "doc_id": "01a1c782-e42c-7a18-8cde-158463548061"},
]


class Obsolete(Exception):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def log(phase, **fields):
    print(json.dumps({"phase": phase, **fields}), flush=True)


def state(doc):
    """The fields the heal must not drift under (body included, byte-exact)."""
    return digest(
        [
            doc.get("body"),
            doc.get("ref_value"),
            list(doc.get("tags") or []),
            doc.get("created_at"),
            doc.get("updated_at"),
            doc.get("ad_mode"),
            doc.get("ad_target"),
            doc.get("posted_by"),
        ]
    )


def eligible_media(media, owner):
    """A live single-video media doc the owner uploaded, genuinely 9:16."""
    if (
        not media
        or media.get("deleted")
        or media.get("author_key") != owner
        or media.get("service") not in {"media_metadata", "public_media"}
    ):
        return False
    body = media.get("body") or {}
    if not str(body.get("mime_type", "")).startswith("video/"):
        return False
    width, height = body.get("width"), body.get("height")
    return (
        isinstance(width, int)
        and isinstance(height, int)
        and width > 0
        and height > 0
        and width < height
    )


def inspect(runtime, owner, doc_id):
    """Read-only state check. Returns (outcome, item-or-None)."""
    doc = runtime.ch.get_document_version(doc_id, owner)
    if not doc:
        return "missing", None
    if doc.get("deleted"):
        return "deleted", None
    if doc.get("service") != "posts":
        return "wrong-service", None
    tags = list(doc.get("tags") or [])
    if "music" in tags:
        return "already", None
    if tags != ["short"]:
        return "drifted-tags", None
    refs = (doc.get("body") or {}).get("media_refs") or []
    if len(refs) != 1 or not isinstance(refs[0], str):
        return "drifted-media", None
    media = runtime.ch.get_document_version(refs[0], owner)
    if not eligible_media(media, owner):
        return "drifted-media", None
    if not runtime.ch.get_user(owner):
        return "missing-user", None
    item = {
        "owner": owner,
        "doc_id": doc_id,
        "media_doc_id": refs[0],
        "current_state_sha256": state(doc),
    }
    return "eligible", item


def binding(settings):
    return digest(["music-tag-backfill-v1", settings.PROVIDER])


def discover(runtime):
    items = []
    outcomes = {}
    for row in ALLOWED:
        outcome, item = inspect(runtime, row["owner"], row["doc_id"])
        outcomes[row["doc_id"]] = outcome
        if item:
            items.append(item)
    log("dry-run", outcomes=outcomes, eligible=len(items))
    if len(items) > MAX_ITEMS:
        raise ValueError("plan exceeds bound")
    if not items:
        raise ValueError("nothing eligible to plan; review outcomes above")
    return dict(
        schema=1,
        provider=runtime.settings.PROVIDER,
        node_binding=binding(runtime.settings),
        items=items,
    )


def validate_plan(plan, runtime):
    if (
        plan.get("schema") != 1
        or plan.get("provider") != runtime.settings.PROVIDER
        or plan.get("node_binding") != binding(runtime.settings)
        or not isinstance(plan.get("items"), list)
        or not plan["items"]
        or len(plan["items"]) > MAX_ITEMS
    ):
        raise ValueError("plan does not match this node or supported bounds")
    identities = {(row["owner"], row["doc_id"]) for row in ALLOWED}
    for item in plan["items"]:
        owner, doc_id = item["owner"], item["doc_id"]
        if (
            not isinstance(owner, str)
            or not owner
            or any(c in owner for c in "/\\\r\n")
            or str(UUID(doc_id)) != doc_id
            or (owner, doc_id) not in identities
            or not isinstance(item.get("media_doc_id"), str)
            or len(item.get("current_state_sha256", "")) != 64
        ):
            raise ValueError("invalid planned document")


def apply_one(runtime, item):
    owner, doc_id = item["owner"], item["doc_id"]
    doc = runtime.ch.get_document_version(doc_id, owner)
    if not doc or doc.get("deleted") or "music" in list(doc.get("tags") or []):
        # 'already' is a clean no-op (someone healed it in-app meanwhile);
        # anything else drifted since the plan was reviewed.
        if doc and doc.get("deleted"):
            return "deleted"
        if doc and "music" in list(doc.get("tags") or []):
            return "already"
        return "obsolete"
    if state(doc) != item["current_state_sha256"]:
        return "obsolete"
    tags = list(doc["tags"]) + ["music"]
    runtime.ch.update_document(
        doc_id=doc_id,
        author_key=owner,
        service="posts",
        body=doc["body"],
        ref_value=doc.get("ref_value") or "",
        tags=tags,
        ad_mode=doc.get("ad_mode") or "none",
        ad_target=doc.get("ad_target") or "",
        posted_by=doc.get("posted_by") or "",
    )
    live = runtime.ch.get_document_version(doc_id, owner)
    if (
        not live
        or live.get("deleted")
        or "music" not in list(live.get("tags") or [])
        or live.get("body") != doc["body"]
    ):
        log("post-write-verification-failed", doc_id=doc_id)
        return "failed"
    log("verified", doc_id=doc_id, owner=owner, tags=live["tags"])
    return "done"


def execute(runtime, path, provider, *, apply=False):
    if provider != runtime.settings.PROVIDER:
        raise ValueError("wrong provider for this node")
    if not apply:
        plan = discover(runtime)
        with open(path, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as output:
            json.dump(plan, output, indent=1)
        log("dry-run", plan_path=str(path), writes="private-local-plan-only")
        return 0
    with open(path, "rb") as source:
        raw = source.read(65537)
    if len(raw) > 65536:
        raise ValueError("plan exceeds size bound")
    plan = json.loads(raw)
    validate_plan(plan, runtime)
    failed = False
    for index, item in enumerate(plan["items"], 1):
        outcome = apply_one(runtime, item)
        log("item-result", index=index, total=len(plan["items"]), doc_id=item["doc_id"], outcome=outcome)
        if outcome in {"failed", "obsolete", "deleted", "missing"}:
            failed = True
            break
    log("finished", failed=failed)
    return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", required=True, help="expected node identity (prod: api.web10.app)")
    parser.add_argument("--plan", required=True, type=Path, help="private plan path inside the API container")
    parser.add_argument("--apply", action="store_true", help="apply only the reviewed plan, sequentially")
    args = parser.parse_args()
    from app import settings
    from app.v3.services import clickhouse

    runtime = SimpleNamespace(settings=settings, ch=clickhouse)
    try:
        return execute(runtime, args.plan, args.provider, apply=args.apply)
    except Obsolete:
        log("aborted", error_type="Obsolete")
        return 1
    except Exception as error:
        log("aborted", error_type=type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
