# web10 Document Typing

Documents are opaque JSON. The API doesn't care about the schema. But there's a convention for typing at the leaf level — the "bottomest level" — so the API knows what to do with values.

## The Convention

Every leaf value is wrapped in a type object:

```json
{
  "cat": {"type": "text", "value": "henry"},
  "cat-pic": {"type": "minio", "value": "alice/henry.png"},
  "cat-vids": [
    {"type": "minio", "value": "alice/henry.mp4"},
    {"type": "minio", "value": "alice/henry2.mp4"}
  ],
  "age": {"type": "number", "value": 5}
}
```

## The Types

| Type | What it is | API behavior |
|---|---|---|
| `text` | Plain text | Render as-is |
| `minio` | Media reference | Convert to presigned URL (if permissions pass) |
| `number` | Numeric value | Sortable, filterable |
| `bool` | Boolean | Filterable |
| `datetime` | ISO 8601 timestamp | Sortable, filterable |
| `ref` | Reference to another doc | Resolve on read |
| `array` | Array of typed values | Recurse into children |
| `object` | Nested object | Recurse into children |

## How the API Uses It

The API recursively scans the JSON for typed values. When it finds `{"type": "minio", "value": "..."}`, it converts the value to a presigned MinIO URL (if group permissions pass).

```
1. Request: GET /alice/posts/123
2. API: check group permissions → allowed
3. API: recursively scan JSON
4. API: find {"type": "minio", "value": "alice/henry.png"}
5. API: convert → {"type": "minio", "url": "https://minio/...?sig=..."}
6. Return document with URLs
```

If permissions fail, the whole document is hidden. No URLs exposed.

## Why This Works

- **The app owns the schema** — `cat`, `cat-pic`, `cat-vids` are whatever the app wants
- **The API knows what to do** — `minio` gets converted, `text` gets rendered, `number` gets sorted
- **Freeform but typed** — the structure is freeform, the leaves are typed
- **Recursive** — arrays and objects recurse, so nested structures work

## The Danger

This is weak typing. The API trusts the `type` field. If an app lies:

```json
{"type": "number", "value": "not-a-number"}
```

The API can't validate it. The app is responsible for correct types. The convention is a contract between app and API — not enforced, just expected.

**Beware:** if the API assumes a type and the value doesn't match, things break. The app is the source of truth. The API is just a scanner.

## Summary

Documents are opaque JSON. The leaf-level type convention lets the API do useful things (convert MinIO URLs, sort numbers, filter booleans) without knowing the schema. The app owns the structure. The API trusts the types. Weak typing today.

**Enforced schemas** — planned for v4. Service contract schemas, `$schema` field per document, validation at write and read time. See `../../web10-v4/sdk/advanced.md`.

Freeform but useful.