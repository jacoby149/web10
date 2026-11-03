# Per-Target Document Attachments

Use this seam when changing one destination without knowing the others. Normal
document read groups are a readable projection, never a replacement snapshot.

`POST /v3/attachment` accepts `token`, `doc_id`, `group_id`, optional `author_as`
and optional boolean `attached`. Omit `attached` to read just the named link;
true attaches, false removes. Response: `{doc_id, group_id, attached}`. It does
not enumerate hidden groups or write document content, timestamps, audit actor,
ad preferences or engagement. A notes app and a shop use the same primitive.

The verified human needs app `updateOwn` on the stored document service. Personal
requests select their own document. Explicit `author_as` selects that group's
document and also requires the human's current effective service `updateOwn`.
It does not use navigation identity or posted_by fallback. A true external target
requires `can_write_group` as the document author, even if already attached.
Exact group-self retains with updateOwn, but a new self attachment needs create.
False requires no destination create grant, allowing removal after revocation.

The SDK's typed `documentAttachment(docId, groupId, opts)` uses the same fields:

```ts
const state = await w.documentAttachment(docId, target, { author_as: groupAuthor });
await w.documentAttachment(docId, target, { author_as: groupAuthor, attached: !state.attached });
```

Storage appends only the selected `(doc_id, group_id)` to the existing
ReplacingMergeTree(updated_at), whose timestamp precision is milliseconds.
Sequential writes advance beyond max stored time by at least one millisecond.
Current reads rank all versions, including removals, before filtering deleted;
removal wins unmerged timestamp ties. MergeTree's equal-version merge choice is
not strengthened here. Different targets never replace one another. There is no
CAS, transaction, same-target race ordering, or atomic authorization-revocation
guarantee. Legacy replacement/delete writers can still race with this seam.

The social edit composer reads Discover explicitly and saves audience separately
from content. It never translates removal into "private" or reconstructs hidden
destinations. Failed reads/writes remain retryable. The generic API contains no
Discover-specific behavior.

Local evidence: signed-route authority/denial tests; real ClickHouse-local 24.8
ReplacingMergeTree add/remove/re-add and FINAL compaction; SDK wire tests and
social component/composer tests. Cross-process same-target and connected browser
publication/revocation, production rollout and independent diverse review remain
open. Isolated synthetic storage only, no production writes.
