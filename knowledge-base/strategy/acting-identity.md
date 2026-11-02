# App-Wide Acting Identity

Status: implemented and locally verified as 3.254.0; PR #1308 is an
existing composer-only proposal, not evidence of completion. No publication is
authorized for this work.

## Intent

Replace the composer-only choice with one navigation-avatar switcher. Personal
identity is always first. Eligible groups are searchable, pinnable and recent;
desktop uses a popover and phones a sheet. Always say `Acting as`. Selection is
per tab and per authenticated account, never a replacement credential. Existing
post/comment drafts keep the identity under which writing began.

Picker safety: clicking a row previews a choice only. `Use identity` commits it;
Close, Escape, outside dismissal and trigger dismissal discard the preview.
Reopening starts from the active identity, never an abandoned preview. This
addresses the reported accidental switch while dismissing the picker; the exact
live click sequence that selected lil-k has not been reproduced.

Posts, comments, likes, dislikes and reposts use the selected identity. DMs,
billing, account settings, group administration and node administration continue
to use personal authority. Reading content remains authorized by the human
session; being able to read does not authorize the selected group to act there.

## Verified Dependencies

- Create already accepts generic `author_as`, checks the human's service-specific
  create grant in that group, checks target access as the group, and sets
  `posted_by` from the verified session. Preserve these independent gates.
- Composer currently replaces explicit destinations with Discover and runs
  personal follower fan-out for group posts. Neither behavior is acceptable.
- `groups/list` only lists the authenticated human's memberships; the earlier
  group-as-author plan incorrectly says it accepts arbitrary `member_key`.
- Delete only looks up documents under the human's key. Update's fallback is
  restricted to the original `posted_by` and checks create rather than update.
  Shared group reaction removal needs an explicit, currently authorized generic
  delegated-document mutation seam before enabling group reaction writes.
- Reaction ownership is repeatedly matched against extracted usernames, which
  loses full group IDs. Counts may stay aggregate, but selected-state and
  removal must match full `author_key`, not a group slug or `posted_by`.
- Feed/profile/permalink/group rendering and comment faces must distinguish
  group IDs from personal usernames. A UI-only switch is not completion.

## Implementation Order And Gates

1. [x] Orient: inspect branch/PR, strategy, current generic operations and data
   consumers. Worktree initially clean; keep branch name and unrelated edits.
2. [x] Generic protocol seams: authorized group membership lookup and delegated
   update/delete with exact author key, live per-service permission checks and
   unchanged original `posted_by`. Tests deny revoked authority, foreign
   identity, human-only target membership and forged audit attribution. No
   social-specific endpoints or group credentials.
3. [x] Shared identity state and navigation switcher: account-scoped session
   storage, personal-first, pinned/recent/search, loading/error/empty states,
   keyboard dismissal and desktop/mobile presentation. Invalid/revoked choices
   must not silently send an action as the human instead.
4. [x] Posts and drafts: bind identity at draft start; replace composer picker
   with a display; derive destinations from group memberships, retain explicit
   destination, reject empty destinations, never fan out to personal followers.
   Reposts use the same draft identity and destination rules.
5. [x] Comments and reactions: bind comment drafts; use full identity keys for
   writes, reads and selected state; group reactions are shared across human
   operators and removable only with current service authority. Preserve
   personal reaction state separately. Fence stale async results on switch.
6. [x] Rendering and mutations: group face/name/routes on all affected reads;
   edit/delete preserve authorship and use current authority, not the selected
   navigation avatar as proof of ownership.
7. [x] Verify locally: focused protocol/SDK/social tests, full applicable suites,
   typecheck/build, desktop and 375px self-boot screenshots inspected, final diff
   and status. Record exact results and remaining connected-service/review gaps.

## Local Verification (02.11.2026)

- API: `uv run --frozen pytest -q`: 1,583 passed plus eight subtests.
- SDK: `bun run test`: 285 passed; `bun run typecheck` passed.
- Social: `bun run test:run --maxWorkers=2 --testTimeout=20000`: 1,584 passed
  across 109 files; `bun run build` passed with bundling warnings.
- `git diff --check` passed. Identity popover and 375px sheet captured and
  inspected at `.context/acting-identity-{desktop,375}.png`.
- Continuation review repaired repost destination loss, stale reaction rollback
  and pagination, tombstone audit loss, selection-based mutation affordances,
  Watch group author display and all-or-nothing identity lookup.

## Remaining Release Gates

Performance follow-up: `batching-performance.md` C01-C04 records authority-read
single-flight, eligible-identity metadata batching, avatar-only preparation and
comment enrichment fan-out. Local functional verification above is not a
large-identity-count performance claim. These items retain live server write
checks and credential/identity-generation invalidation.

- [ ] Connected multi-operator/revocation acceptance - exercise real API/storage
  with two operators sharing group reactions, revoke one operator, verify denied
  writes and preserved audit attribution, and replay concurrent actions. Local
  storage/permission doubles do not establish connected behavior.
- [ ] Independent security review and publication/CI gates. Nothing committed,
  pushed, merged or deployed by this continuation.

## Acceptance

A human can switch once and post/comment/react as an eligible group without
borrowing personal target memberships. Another authorized operator sees the
same group reaction and can remove it; revoked operators cannot. Changing
identity in another tab has no effect. Switching with a draft does not reauthor
it. Every rendered author and selected action state uses the document identity,
while the immutable human audit column remains intact. Failed authorization
leaves the draft/action retryable, never silently personal. No completion or
merged-status ticks until the relevant gates have actually passed.
