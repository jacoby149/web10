# Groups gauntlet — join, leave, remove, block, hide, share

[← back to the gauntlet doctrine](./README.md)

Groups are the core social primitive: follows, communities, DMs, close-friends
are all groups with different join policies and roles. The group lifecycle is the
most stateful surface — a group has members, roles, a feed, a face, and the
moderation/sharing controls. This is the surface where "my group disappeared" /
"I can't see the feed" / "I'm still a member after I left" bugs live.

The existing `social-groups.spec.ts` gauntlet (follow/unfollow) is migrated into
this space and extended to the full group lifecycle.

## The surface

- **Routes:** `/groups` (the directory: My Groups + Discover), `/groups/:id`
  (the detail: the group feed + composer + members).
- **Testids:** `data-testid="groups-tab-my"` / `"groups-tab-discover"`,
  `"group-card"`, `"group-post-card"`, `"group-composer"`, the create-group sheet
  (`CreateGroupSheet`), the member list, the block/hide/share controls.
- **The truth:** the `group_members` rows (who's in the group, their role), the
  `group_contracts` row (the group's roles + join policy), the posts in the group
  (the group feed), the `group_hidden_docs` rows (moderation), the
  `user_group_sharing` row (the sharing toggle), the blacklists
  (`user_blacklist` / `group_blacklist`).

## The state machine

```
cold (a fresh user, no groups)
→ create group            group exists (owner is a member, role=owner)
→ RELOAD                  the group persists (in My Groups)
→ member joins            membership: member (role=member)
→ member sees the feed    the group feed renders the posts
→ member leaves           membership: (gone)
→ RELOAD                  the leave persists (the member is gone)
→ owner removes a member  membership: (gone)
→ owner blocks a member   the member's posts are hidden (user_blacklist / group_blacklist)
→ owner unblocks          the member's posts return
→ owner hides a post      the post is hidden from the group (group_hidden_docs)
→ owner unhides           the post returns
→ owner pauses sharing    the member's posts are hidden (user_group_sharing=0)
→ owner resumes sharing   the posts return
→ RELOAD                  every control state persists
```

**The membership truth (the load-bearing assertion):** after every join/leave/
remove, assert the `group_members` row (the DB truth) AND the UI (the member list,
the join button's label). A join that updates the button but not the row, or a
row that doesn't update the UI, is a bug the UI-only assertion misses.

**The feed truth:** a member sees the group's posts; a non-member does not (the
I3 "join to view" state). The gauntlet asserts the group feed content for a
member vs. a non-member.

**The moderation truth:** a hidden post is in `group_hidden_docs`; the gauntlet
asserts the row AND that the post is absent from the group feed for the reader
(but still exists for the author — hiding is group-scoped, not a delete).

**The sharing truth:** a paused-sharing author's posts are hidden from the group
(`user_group_sharing=0`); the gauntlet asserts the row AND the feed content.

## The forks

- **Join:** the join button on the group card (directory) vs. the join button on
  the group detail. Drive each.
- **Create:** the create-group sheet is the reference.
- **Moderate:** the block/hide/share controls on the group detail (owner only).
- **Read:** the group feed (detail) vs. the My Groups list (directory) — the
  same group, two surfaces.

## The truth fields

- **DB:** the `group_members` rows, the `group_contracts` row, the posts in the
  group, the `group_hidden_docs` rows, the `user_group_sharing` row, the
  blacklists.
- **UI:** the member list, the join button's label, the group feed content, the
  moderation control states.

## The anti-tests

- **I3:** a non-member cannot read the group's posts (the "join to view" state).
- **Join a deleted group:** the join fails gracefully (the group is gone).
- **Leave a group you're not in:** a no-op (no error, no duplicate row).
- **Block yourself:** the designed behavior (the owner can't block themselves, or
  the consequence is clear).
- **Remove the owner:** not allowed (the owner role is protected).
- **The return run (idempotency):** re-joining a group you already left does not
  create a duplicate `group_members` row (the state rule — the duplicate-row bug
  the notes-app return run hit).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 10 contexts):** 10 users in a group (10 contexts). One
  member posts. Every other member's group feed shows the post. The count is
  consistent across all 10 views. (The "the group feed is consistent for every
  member" test — the single-user gauntlet only checks one member's view.)
- **The group join race (API floor, 100 users):** 100 users join the same group
  in parallel → 100 distinct membership rows, the member count is 100 (no
  duplicates — the ReplacingMergeTree dedup under concurrent writes).
- **The group feed at 20 members (API floor):** a group with 20 members, each
  with posts → every member's view of the group feed is the same set of posts
  (the same count, the same order). No member sees a different feed.
- **The block at N (API floor):** a member blocks another member → the blocked
  member's posts are hidden for the blocker (the `user_blacklist` row), but still
  visible to the other members (the block is per-reader).

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the lifecycle via raw group ops, the membership + feed +
   moderation rows asserted after each step.
2. **Browser gauntlet — create + join + leave** — the core membership permutation,
   truth + reloads. (Migrates the existing `social-groups` gauntlet.)
3. **Browser gauntlet — the group feed** — member sees the feed, non-member
   doesn't, the composer posts to the group.
4. **Browser gauntlet — moderation** — block/unblock/hide/unhide/share, truth +
   reloads.
5. **Browser gauntlet — the return run** — re-join idempotency (no duplicate row).
