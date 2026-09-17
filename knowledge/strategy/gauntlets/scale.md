# Scale gauntlet — the social surface at N users

[← back to the gauntlet doctrine](./README.md)

The other nine plans are single-user state machines. This plan is the **Multi-User
rule** (README, Rule 4) made concrete: the cross-user consistency, the race, and
the data integrity at 10-100 users. It is the dimension that separates a toy from
a flagship — the bugs here are "the count is wrong when 50 people like it," "I
don't see your like," "the group feed is different for each member." None of them
is reproducible with one user.

The runner-feasible split (README, the scale axis): the **API floor carries the
scale** (up to 100 users, seconds, no browser) and the **browser carries the
cross-user consistency** (10-20 contexts, a minute or two). 1000 users is out of
scope — 10-100 is the bar.

## The truth, at N users

The truth is no longer "user A's view matches the DB." It is:

1. **The aggregate is correct.** N users act on a target → the DB holds exactly N
   (no lost updates, no double-counts, no duplicate rows).
2. **Every user's view is correct.** Each of the N users, viewing the target,
   sees the correct aggregate *and* their own contribution.
3. **The dedup holds.** After N concurrent mutations, the DB has N distinct rows
   (not 2N from a race, not N-1 from a lost update). The ReplacingMergeTree + the
   ref-count + the membership rows are stressed, not just exercised.

The primitive extends `assertTruth` to `assertAggregate(request, target, n)` —
read the DB, assert the count is exactly `n` and the row count is exactly `n`
(no duplicates) — and `assertTruthFor(page, request, target, asUser)` — assert
what a *specific* user's context sees matches the DB truth for that user.

## The cross-user consistency tests (browser, 10-20 contexts)

Two or more real browser contexts, each a different user, viewing the same
target. Drive one user's action, assert the other users' views.

- **The like is seen.** User A (context 1) likes a post. User B (context 2) views
  the same post. Assert B's like count includes A's like, and B's heart is off
  (B hasn't liked). Then B likes → both counts are 2, B's heart is on. **Reload
  B** → B's view still reflects both likes.
- **The comment is seen.** User A comments. User B views the post → the thread
  shows A's comment. B comments → the thread shows both, in order.
- **The follow is seen.** User A follows creator C. C's profile (context 3) → the
  follower count includes A. A's feed → C's posts appear.
- **The post is seen.** User A posts (public). User B (who follows A) → A's post
  is in B's feed. User D (who does not follow A) → A's post is NOT in D's feed
  (I3 at the feed level).
- **The group feed is consistent.** 10 users in a group (10 contexts). One member
  posts. Every other member's group feed shows the post. The count is consistent
  across all 10 views.

These are the "does B see A" tests. They are the browser layer of the multi-user
rule — the API floor can't drive a second user's *view*, only the DB.

## The race tests (API floor, up to 100 users)

Concurrent mutations on the same target, via raw API calls (fast, no browser).
The assertion is the aggregate + the dedup.

- **The like storm.** 100 users (100 API tokens) like the same post, in parallel
  (a `Promise.all` of 100 `create` calls). Assert: the like count is exactly 100,
  the DB has exactly 100 reaction rows (no duplicates, no lost updates). Then 50
  of them unlike (100 → 50) → the count is 50, the DB has 50 live rows + 50
  tombstones (the dedup picks the tombstone).
- **The like/unlike race.** 50 users like, 50 unlike, the same post, in parallel.
  Assert: the final count is 0 (or the correct net), and the DB dedup is correct
  (no user holds both a live like and a live unlike).
- **The comment burst.** 100 users comment on the same post, in parallel. Assert:
  the comment count is exactly 100, the thread has 100 distinct comments.
- **The follow burst.** 100 users follow a creator, in parallel. Assert: the
  creator's follower count is 100, the `group_members` table has 100 distinct
  rows (no duplicates — the ReplacingMergeTree dedup under concurrent writes).
- **The group join race.** 100 users join the same group, in parallel. Assert: 100
  distinct membership rows, the member count is 100.

These are the data-integrity tests. They are where the ClickHouse semantics
(ReplacingMergeTree, the tombstone dedup, the ref-count) are actually *stressed*
— the single-user test never populates the tables enough to break them. A lost
update or a duplicate row under concurrency is a flagship bug; the single-user
gauntlet could never see it.

## The scale / data-integrity tests (API floor, up to 100 users)

Not concurrent — just *populated*. The tables are full, and the reads must stay
correct.

- **The count at 100.** A post with 100 likes + 30 dislikes → the like count is
  100, the dislike count is 30 (the two tallies are independent — the dislike
  counter fix). The feed query's `countIf` per type is correct at scale.
- **The group feed at 20 members.** A group with 20 members, each with posts →
  every member's view of the group feed is the same set of posts (the same
  count, the same order). No member sees a different feed.
- **The feed at 50 follows.** A user follows 50 creators, each with posts → the
  feed has all 50 creators' posts, ranked correctly. The `getFeedGroups` filter
  is correct at 50 groups.
- **The dedup under volume.** After 100 users like + 50 unlike, a fresh read
  (the dedup) returns exactly 50 live likes (the tombstones are deduped out). The
  `row_number() ... ORDER BY updated_at DESC` picks the right row at volume.

## The "funny" edge cases (the operator's "some funny tests")

The weird states that only show up at N users or after a sequence:

- **A user who liked, then deleted their account.** The like is a tombstone (the
  account deletion); the count drops by 1; the post still renders (the like is
  gone, not the post).
- **A post that 100 people like, then the author deletes.** The post is a
  tombstone; the 100 likes are orphaned (their `ref_value` points at a deleted
  post); the count is 0 (or the post is gone, depending on the surface). No
  phantom likes.
- **Two users in a DM, one blocks the other.** The DM is still there (the block
  is the user-wide blacklist); the blocked user's messages are hidden (I3). The
  conversation doesn't corrupt.
- **A group where the owner leaves.** The owner can't leave if they're the only
  owner (the designed behavior); or the ownership transfers (the consequence is
  clear, not a silent corruption).
- **The same user, two contexts (a double-session).** User A in two browser
  contexts (two tabs) likes the same post in both → the count is 1 (the dedup
  keys on the user, not the session), not 2.

## The anti-tests (the broken states, at N users)

- **I3 at scale:** a stranger (not in the group, not following the creator) views
  the target → they see the public aggregate (the like count) but cannot mutate
  (the like 403s / is display-only). The aggregate is public (D41 — the node is
  readable by design); the mutation is gated.
- **The race that corrupts:** a concurrent like + delete that leaves the DB in an
  inconsistent state (a user holding both a live like and a live unlike, or a
  count that doesn't match the rows) → the gauntlet catches it (the dedup assert
  fails).
- **The lost update:** 100 concurrent likes that produce 99 rows (one lost) → the
  aggregate assert fails (count 99 ≠ 100).

## The bites

1. **API floor — the like storm + the race** — 100 users like/unlike in parallel,
   the aggregate + dedup asserted. (The data-integrity core.)
2. **API floor — the follow burst + the group join race** — 100 users follow /
   join in parallel, the membership dedup asserted.
3. **API floor — the scale reads** — the count at 100, the group feed at 20
   members, the feed at 50 follows, the dedup under volume.
4. **Browser — the cross-user consistency** — 2-10 contexts, the "does B see A"
   tests (the like, the comment, the follow, the post, the group feed).
5. **Browser — the concurrent UI** — 10 contexts like one post, the count is 10,
   each context sees it.
6. **The funny edge cases** — the account-deletion like, the deleted-post likes,
   the double-session dedup, the block-in-DM.

Bites 1-3 (the API floor) are the fast, every-PR data-integrity core. Bites 4-5
(the browser) are the cross-user consistency, kept to 10-20 contexts for runner
feasibility. Bite 6 is the edge cases, added as the gauntlet matures.

## The runner budget (honest)

- **API floor (100 users):** seconds. Raw API calls, no browser. Runs on every PR.
  This is the heavy lifting — the scale + race + data integrity.
- **Browser (10-20 contexts):** a minute or two. The cross-user consistency. Runs
  on every PR, kept small.
- **The total:** the scale gauntlet adds ~1-2 min to the e2e job (the browser
  part) + seconds (the API floor). The existing e2e is ~10 min; the gauntlet
  suite (all surfaces + scale) must fit that budget, which is why the browser is
  10-20 contexts and the scale is the API floor. If the budget is exceeded, the
  scale tests (API floor) stay (they're fast) and the browser contexts drop
  (10 → 5), never the reverse.
