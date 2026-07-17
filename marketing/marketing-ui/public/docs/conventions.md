# Social Conventions

**Version:** 1.0.0-draft
**Status:** Draft — defines standard service schemas for social apps and exporters

> **Scope:** this document is an application profile, NOT part of the web10
> protocol (that's `protocol-spec.md`). Nodes have no knowledge of these
> schemas and never enforce them; the only reserved service names in web10
> are `services` and `*`. These conventions are the shared vocabulary of the
> killer app (P8) and the data exporters (P9) so that social apps
> interoperate — apps in other domains are free to define entirely different
> services.

This document defines the shared record schemas that all web10 social apps and
data exporters should use. The schemas are loose, documented, and versioned.
Apps are free to add fields, but should respect the core shape for
interoperability.

Every record lives in a named service within a user's collection:
`POST /alice/posts`, `PATCH /bob/inbox`, etc. The service name comes from the
URL path — it is not a field on the record. The schemas below describe the
record body as apps write and read it.

## Service Index

| Service     | Purpose                                        |
|-------------|-------------------------------------------------|
| `posts`     | User-authored content (text, media, links)      |
| `media`     | Media metadata + object-store URLs              |
| `contacts`  | Friend graph: people you know                   |
| `follows`   | Who you follow (cross-node)                     |
| `comments`  | Threaded replies to posts                       |
| `reactions` | Likes, emojis, etc. on posts/comments           |
| `profile`   | Display name, avatar, bio                       |
| `inbox`     | Delivered feed items (fan-out on write)         |

---

## posts

User-authored content. The primary content type — photos, video, text, links.

### Record Schema

```json
{
  "type": "object",
  "required": ["created_at"],
  "properties": {
    "text": { "type": "string", "maxLength": 10000 },
    "media_refs": {
      "type": "array",
      "items": { "type": "string", "format": "object-id" },
      "description": "References to media service records"
    },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "origin": {
      "type": "string",
      "enum": ["web10", "instagram", "facebook", "youtube", "twitter", "tiktok", "other"],
      "description": "Source platform of the original content"
    },
    "origin_id": {
      "type": "string",
      "description": "Original platform's content ID"
    },
    "visibility": {
      "type": "string",
      "enum": ["public", "friends", "private"],
      "default": "public"
    },
    "location": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "lat": { "type": "number" },
        "lon": { "type": "number" }
      }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "username": { "type": "string" },
          "provider": { "type": "string" }
        },
        "required": ["username", "provider"]
      }
    },
    "encrypted": {
      "type": "boolean",
      "default": false,
      "description": "Whether body fields contain ciphertext (phase 11)"
    }
  }
}
```

### Conventions

- `created_at` is the canonical timestamp for feed ordering.
- `media_refs` references `_id` values in the `media` service.
- `origin` enables imported and native content to coexist.
- Exporters should preserve `origin` and `origin_id` for traceability.

---

## media

Metadata for uploaded files. Blobs live in object storage (S3-compatible);
this service stores the pointer and metadata.

### Record Schema

```json
{
  "type": "object",
  "required": ["url", "created_at"],
  "properties": {
    "url": {
      "type": "string",
      "format": "uri",
      "description": "Signed or public URL to the blob"
    },
    "created_at": { "type": "string", "format": "date-time" },
    "mime_type": { "type": "string", "example": "image/jpeg" },
    "size_bytes": { "type": "integer", "minimum": 0 },
    "width": { "type": "integer", "minimum": 1 },
    "height": { "type": "integer", "minimum": 1 },
    "duration_seconds": {
      "type": "number",
      "description": "For video/audio media"
    },
    "thumbnail_url": {
      "type": "string",
      "format": "uri"
    },
    "hls_manifest_url": {
      "type": "string",
      "format": "uri",
      "description": "HLS manifest for transcoded video"
    },
    "caption": { "type": "string" },
    "alt_text": { "type": "string" },
    "origin": {
      "type": "string",
      "enum": ["web10", "instagram", "facebook", "youtube", "twitter", "tiktok", "other"]
    },
    "origin_id": { "type": "string" },
    "encrypted": { "type": "boolean", "default": false }
  }
}
```

### Conventions

- `url` should be a presigned URL for private media (short-lived).
- `size_bytes` counts against the user's space plan.
- Video uploads should populate `hls_manifest_url` after transcoding.

---

## contacts

The friend graph — people you know. Labels let the user organize relationships.

### Record Schema

```json
{
  "type": "object",
  "required": ["username", "provider"],
  "properties": {
    "username": { "type": "string" },
    "provider": {
      "type": "string",
      "description": "The provider where this person's node lives"
    },
    "display_name": { "type": "string" },
    "labels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "User-defined labels: close-friends, family, colleagues..."
    },
    "added_at": { "type": "string", "format": "date-time" },
    "note": {
      "type": "string",
      "description": "Private note about this contact"
    }
  }
}
```

### Conventions

- Contacts are **unilateral** — adding someone doesn't notify them.
- `(username, provider)` is the identity tuple; unique per user's contacts list.
- Labels are used by the lens record for feed ranking ("close-friends-first").

---

## follows

Who you follow. Cross-node by design — the federation primitive.

### Record Schema

```json
{
  "type": "object",
  "required": ["username", "provider", "status"],
  "properties": {
    "username": { "type": "string" },
    "provider": {
      "type": "string",
      "description": "The provider where the followed person's node lives"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "active", "rejected", "blocked"],
      "description": "Follow request state"
    },
    "followed_at": { "type": "string", "format": "date-time" },
    "notify": {
      "type": "boolean",
      "default": true,
      "description": "Receive push notifications for their posts"
    }
  }
}
```

### Conventions

- `status: "active"` means the followed person's node delivers posts to your
  inbox. The terms handshake whitelists their delivery.
- Cross-node follows require a terms exchange: your node adds the friend's
  `(username, provider)` to the `inbox` terms whitelist with `create`
  permission. (`cross_origins` matches the token's `site`/origin, not a
  provider, and carries no per-action grants.)

---

## comments

Threaded replies to posts.

### Record Schema

```json
{
  "type": "object",
  "required": ["post_id", "text", "created_at"],
  "properties": {
    "post_id": {
      "type": "string",
      "description": "The _id of the post being commented on"
    },
    "text": { "type": "string", "maxLength": 10000 },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "parent_id": {
      "type": "string",
      "description": "The _id of the parent comment (for threading)"
    },
    "author_username": {
      "type": "string",
      "description": "Username of the comment author"
    },
    "author_provider": {
      "type": "string",
      "description": "Provider of the comment author"
    },
    "origin": {
      "type": "string",
      "enum": ["web10", "instagram", "facebook", "youtube", "twitter", "tiktok", "other"]
    },
    "origin_id": { "type": "string" }
  }
}
```

### Conventions

- `parent_id: null` (or absent) means a top-level comment.
- Cross-node comments are delivered as records in the post-owner's collection.

---

## reactions

Likes, emojis, and other reactions on posts and comments.

### Record Schema

```json
{
  "type": "object",
  "required": ["target_service", "target_id", "type", "created_at"],
  "properties": {
    "target_service": {
      "type": "string",
      "enum": ["posts", "comments"],
      "description": "Which service the target record lives in"
    },
    "target_id": {
      "type": "string",
      "description": "The _id of the target record"
    },
    "type": {
      "type": "string",
      "description": "Reaction type: like, love, haha, wow, sad, angry, or custom emoji"
    },
    "created_at": { "type": "string", "format": "date-time" },
    "author_username": { "type": "string" },
    "author_provider": { "type": "string" }
  }
}
```

### Conventions

- Reactions are stored as records (not embedded) so they can be queried
  independently ("what did I like in 2019?").
- Apps should deduplicate: one reaction per `(author, target, type)`.

---

## profile

Display identity — one record per user.

### Record Schema

```json
{
  "type": "object",
  "properties": {
    "display_name": { "type": "string" },
    "avatar_ref": {
      "type": "string",
      "description": "Reference to a media service record"
    },
    "bio": {
      "type": "string",
      "maxLength": 500
    },
    "website": { "type": "string", "format": "uri" },
    "location": { "type": "string" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

### Conventions

- There should be at most one profile record per user.
- `avatar_ref` points to a `media` record.

---

## inbox

The feed. Fan-out on write: friends' nodes deliver new posts into your inbox
at post time. Reading your feed is one indexed query on your own node.

### Record Schema

```json
{
  "type": "object",
  "required": ["author_username", "author_provider", "post_id", "delivered_at"],
  "properties": {
    "author_username": { "type": "string" },
    "author_provider": { "type": "string" },
    "post_id": {
      "type": "string",
      "description": "The _id of the original post on the author's node"
    },
    "delivered_at": { "type": "string", "format": "date-time" },
    "post_body": {
      "type": "object",
      "description": "A copy of the post's body for local reading"
    },
    "read": {
      "type": "boolean",
      "default": false
    },
    "score": {
      "type": "number",
      "description": "Lens-assigned ranking score (set by the chatbox/LLM)"
    },
    "origin": {
      "type": "string",
      "enum": ["web10", "instagram", "facebook", "youtube", "twitter", "tiktok", "other"]
    }
  }
}
```

### Conventions

- `post_body` is a denormalized copy — the inbox is optimized for fast reads.
- `score` is set by the lens record's ranking rules. The chatbox edits the
  lens, which re-scores inbox items.
- The inbox service's terms whitelist friends' providers for `create` access.

---

## Lens Record (Planned — Phase 8)

The feed algorithm and experience config as a record the user owns. Lives in a
`lens` service.

### Record Schema

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Lens name: 'chronological', 'close-friends', 'detox mode'..."
    },
    "ranking_rules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "weight": { "type": "number" },
          "description": { "type": "string" }
        }
      },
      "description": "Weighted fields for feed ranking"
    },
    "muted_topics": {
      "type": "array",
      "items": { "type": "string" }
    },
    "muted_users": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "username": { "type": "string" },
          "provider": { "type": "string" }
        }
      }
    },
    "time_budget_minutes": { "type": "integer", "minimum": 1 },
    "ui_toggles": {
      "type": "object",
      "properties": {
        "hide_like_counts": { "type": "boolean" },
        "chronological_only": { "type": "boolean" },
        "grayscale_after_minutes": { "type": "integer" }
      }
    },
    "updated_at": { "type": "string", "format": "date-time" },
    "updated_by": {
      "type": "string",
      "enum": ["user", "chatbox"],
      "description": "How the lens was last modified"
    }
  }
}
```

### Conventions

- The chatbox LLM's token is scoped to the `lens` service only.
- Preset lenses: chronological, close-friends-only, detox mode, creator mode.
- The lens record is portable — it moves with the user across nodes.

---

## Versioning

Schema evolution is **additive only**: never remove or repurpose a field —
only add optional ones. Old records must validate against new schemas forever;
the data outlives any app, so migrations are not an option.

## Schema Files

Machine-readable JSON Schema files for each service live in `docs/schemas/`.
They validate what the exporters (P9) and the killer app (P8) produce, in
those projects' test suites. They are not conformance criteria for nodes —
the node conformance suite tests `protocol-spec.md` only.
