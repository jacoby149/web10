"""web10 export parser — bite d.

A web10 export ZIP contains the user's own collections in the conventions-doc
format so the bite-b pipeline ingests it like any takeout. The format:

  web10_export.json          — manifest (export date, source node, username)
  {service}/records.json     — one JSONL file per service, each line is a record
                               with {_id, body} (the node's canonical shape)

The parser reads the manifest, then each service's records, and outputs records
in the pipeline format:
  {
    "service": "staging_posts" | "media" | ...,
    "body": { ... },
    "origin": "web10",
    "origin_id": "<source _id>"
  }

Post records are remapped to staging_posts (D19/D30: imports must not auto-
publish). All other services keep their name.
"""

import json

from .utils import find_json_entries


# Services whose records should land in staging_posts on import (the D19 rule:
# imported content is owner-only until the user publishes it from staging).
_POST_SERVICES = {"posts", "public_posts", "private_posts"}


def _remap_service(service: str) -> str:
    """Remap source service names to the import target.

    All post-like services go to staging_posts so the import doesn't
    auto-publish. Everything else keeps its name.
    """
    if service in _POST_SERVICES:
        return "staging_posts"
    return service


def parse_web10(zf, entries: list[dict]) -> list[dict]:
    """Parse a web10 export ZIP into pipeline records."""
    records = []
    json_entries = find_json_entries(entries)

    # ── Read manifest ──────────────────────────────────────────────────────
    manifest_entry = next(
        (e for e in json_entries if "web10_export.json" in e["path"] or "manifest" in e["path"].lower()),
        None,
    )
    if manifest_entry:
        try:
            json.loads(zf.read(manifest_entry["path"]).decode("utf-8"))
        except Exception:
            pass

    # ── Read service records ───────────────────────────────────────────────
    # Look for {service}/records.json or {service}.json
    service_files: dict[str, str] = {}
    for entry in json_entries:
        path = entry["path"]
        # {service}/records.json
        if "/records.json" in path:
            parts = path.split("/")
            if len(parts) >= 2:
                service_name = parts[0]
                service_files[service_name] = path
                continue
        # Top-level {service}.json (fallback format)
        base = path.rsplit("/", 1)[-1]
        if base.endswith(".json") and base not in ("web10_export.json", "manifest.json"):
            service_name = base[:-5]
            if service_name and service_name not in service_files:
                service_files[service_name] = path

    for service_name, file_path in service_files.items():
        try:
            raw = zf.read(file_path).decode("utf-8")
            data = json.loads(raw)
        except Exception:
            continue

        target_service = _remap_service(service_name)

        # Handle both list-of-records and single-record formats
        if isinstance(data, dict):
            data = [data] if data else []

        if not isinstance(data, list):
            continue

        for item in data:
            if not isinstance(item, dict):
                continue

            if "body" not in item:
                continue
            body = item["body"]
            if not isinstance(body, dict):
                continue

            record_id = item.get("_id") or body.get("_id")

            records.append(
                {
                    "service": target_service,
                    "body": body,
                    "origin": "web10",
                    "origin_id": str(record_id) if record_id else None,
                }
            )

    return records
