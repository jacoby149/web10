# Post Detail

Single post view. Content, reactions, comments, share options.

## What the Screen Shows

```
jacoby149 · 2h ago · [web10.app/groups/charlie/st-louis-chess-club]
─────────────────────
"just shipped the new groups feature"

[📷 attachment]

❤️ 42    💬 8    ↗ Share

--- Comments ---
alice · 1h ago
  "this is fire 🔥"

  bob · 45m ago (reply to alice)
    "agree, the ref type is genius"

  charlie · 30m ago
    "can't wait to try it"
```

## Protocol Mapping

**The post:** Direct read by doc_id.
```
GET /jacoby149/posts/{doc_id}
→ check group permissions → allowed
→ return post with presigned media URLs
```

**Reactions:** Posts in the `reactions` collection with a ref to this post.
```sql
SELECT p.doc_id, p.author_key, p.body, p.created_at
FROM documents p
WHERE p.deleted = 0
  AND p.collection_name = 'reactions'
  AND hasToken(p.body, '{doc_id}')
ORDER BY p.created_at DESC;
```

The body contains `{ "ref": {"type": "ref", "value": "{doc_id}"}, "reaction_type": {"type": "text", "value": "like"} }`.

**Reaction count:**
```sql
SELECT count() FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND hasToken(body, '{doc_id}');
```

**Reaction breakdown (by type):**
```sql
SELECT extractJSONString(body, '$.reaction_type.value') AS rtype, count()
FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND hasToken(body, '{doc_id}')
GROUP BY rtype;
```

Returns: `like: 35, love: 5, laugh: 2`.

**Your reaction:** Check if you've reacted.
```sql
SELECT body FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND author_key = 'jacoby149'
  AND hasToken(body, '{doc_id}');
```

If a row exists, show the active reaction type. Tap again → tombstone old reaction, insert new one.

**Comments:** Posts in the `comments` collection with a ref to this post.
```sql
SELECT p.doc_id, p.author_key, p.body, p.created_at
FROM documents p
WHERE p.deleted = 0
  AND p.collection_name = 'comments'
  AND hasToken(p.body, '{doc_id}')
  AND extractJSONString(p.body, '$.parent_ref.value') IS NULL  -- top-level only
ORDER BY p.created_at ASC;
```

**Replies to a comment:** Same query, filtered by parent_ref.
```sql
SELECT p.doc_id, p.author_key, p.body, p.created_at
FROM documents p
WHERE p.deleted = 0
  AND p.collection_name = 'comments'
  AND hasToken(p.body, '{doc_id}')
  AND extractJSONString(p.body, '$.parent_ref.value') = '{comment_id}'
ORDER BY p.created_at ASC;
```

**Comment count:**
```sql
SELECT count() FROM documents
WHERE deleted = 0
  AND collection_name = 'comments'
  AND hasToken(body, '{doc_id}');
```

## React to a Post

```
User taps ❤️
  → POST /jacoby149/reactions
     { "ref": {"type": "ref", "value": "{doc_id}"},
       "reaction_type": {"type": "text", "value": "like"},
       "groups": ["web10.app/groups/charlie/st-louis-chess-club"] }
   → API: INSERT INTO documents (jacoby149's collection)
   → API: INSERT INTO doc_groups (web10.app/groups/charlie/st-louis-chess-club, so others can see your reaction)
```

The reaction is a post. It lives in your collection. It's attached to the same group as the original post so group members can see it.

## Comment on a Post

```
User types comment, taps send
  → POST /jacoby149/comments
     { "ref": {"type": "ref", "value": "{doc_id}"},
       "text": {"type": "text", "value": "this is fire"},
       "groups": ["web10.app/groups/charlie/st-louis-chess-club"] }
  → API: INSERT INTO documents
  → API: INSERT INTO doc_groups
```

Reply to a comment: add `parent_ref` to the body. Same endpoint. Same table.

## The Data Flow

```
User opens post detail
  → GET /jacoby149/posts/{doc_id}        (the post)
  → query: reactions + count               (documents table, reactions collection)
  → query: comments + count                (documents table, comments collection)
  → query: your reaction                   (documents table, reactions collection)
  → parallel: resolve author avatars
  → render
```

Five parallel queries. One table. Different collections and filters.

## TODO

- [ ] Reaction toggle — tap to react, tap again to change, tap again to remove
- [ ] Comment threading — nested replies via parent_ref
- [ ] Comment pagination — load more on scroll
- [ ] Share flow — attach post to a different group (copy the doc_groups entry)
- [ ] Report post — INSERT into a moderation table (future)
- [ ] Reaction animation — client-side, no protocol impact

## Proof

Post detail is one post read, plus queries for reactions and comments — all posts in the same table. The `ref` type links everything. The `collection_name` distinguishes reactions from comments from posts. No dedicated tables. No dedicated endpoints. The protocol handles it.
