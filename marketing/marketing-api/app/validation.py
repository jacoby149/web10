import json
from pathlib import Path

# Load schemas from marketing/marketing-ui/public/docs/schemas/ (same source of truth as the conventions doc)
_SCHEMAS_DIR = Path(__file__).parent.parent.parent / "marketing-ui" / "public" / "docs" / "schemas"

# Simple JSON Schema validation (lightweight, no ajv dependency)
# For the marketing-api, we do basic structural validation:
# - required fields present
# - correct types
# This is sufficient for import quality; the node's own validation is the authority.


def _load_schema(name: str) -> dict:
    schema_path = _SCHEMAS_DIR / f"{name}.json"
    if schema_path.exists():
        return json.loads(schema_path.read_text())
    return {}


def _validate_schema(record: dict, schema: dict) -> bool:
    """Basic structural validation against JSON Schema."""
    if not schema:
        return True

    props = schema.get("properties", {})
    required = schema.get("required", [])

    for field in required:
        if field not in record:
            return False

    for field, spec in props.items():
        if field not in record:
            continue
        val = record[field]
        expected_type = spec.get("type")
        if expected_type and val is not None:
            type_map = {
                "string": str,
                "number": (int, float),
                "integer": int,
                "boolean": bool,
                "array": list,
                "object": dict,
            }
            expected = type_map.get(expected_type)
            if expected and not isinstance(val, expected):
                return False

    return True


# Schema definitions (mirrors exporters/src/schemas.ts)
POSTS_SCHEMA = _load_schema("posts") or {
    "type": "object",
    "required": ["created_at"],
    "properties": {
        "text": {"type": "string"},
        "created_at": {"type": "string"},
        "origin": {"type": "string"},
        "origin_id": {"type": "string"},
        "visibility": {"type": "string"},
        "tags": {"type": "array"},
        "mentions": {"type": "array"},
        "media_refs": {"type": "array"},
        "location": {"type": "object"},
    },
}

MEDIA_SCHEMA = _load_schema("media") or {
    "type": "object",
    "required": ["url", "created_at"],
    "properties": {
        "url": {"type": "string"},
        "created_at": {"type": "string"},
        "origin": {"type": "string"},
        "origin_id": {"type": "string"},
        "width": {"type": "integer"},
        "height": {"type": "integer"},
        "duration_seconds": {"type": "number"},
        "caption": {"type": "string"},
        "alt_text": {"type": "string"},
    },
}

COMMENTS_SCHEMA = _load_schema("comments") or {
    "type": "object",
    "required": ["post_id", "text", "created_at"],
    "properties": {
        "post_id": {"type": "string"},
        "text": {"type": "string"},
        "created_at": {"type": "string"},
        "origin": {"type": "string"},
        "origin_id": {"type": "string"},
        "parent_id": {"type": "string"},
    },
}

CONTACTS_SCHEMA = _load_schema("contacts") or {
    "type": "object",
    "required": ["username", "provider"],
    "properties": {
        "username": {"type": "string"},
        "provider": {"type": "string"},
        "display_name": {"type": "string"},
        "added_at": {"type": "string"},
    },
}

PROFILE_SCHEMA = _load_schema("profile") or {
    "type": "object",
    "properties": {
        "display_name": {"type": "string"},
        "bio": {"type": "string"},
        "website": {"type": "string"},
        "updated_at": {"type": "string"},
    },
}

VALIDATORS = {
    "posts": POSTS_SCHEMA,
    "media": MEDIA_SCHEMA,
    "comments": COMMENTS_SCHEMA,
    "contacts": CONTACTS_SCHEMA,
    "profile": PROFILE_SCHEMA,
}


def get_validators() -> dict:
    return VALIDATORS


def validate_record(record: dict) -> tuple[bool, str | None]:
    """Validate a record against its service schema. Returns (valid, error_message)."""
    service = record.get("service", "")
    body = record.get("body", {})
    schema = VALIDATORS.get(service)
    if not schema:
        return True, None
    if _validate_schema(body, schema):
        return True, None
    return False, f"[{service}] validation failed for {record.get('origin_id', 'unknown')}"
