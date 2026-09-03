# Engagement (Comments + Reactions)

Comments and reactions are **documents** in the `comments` / `reactions`
services — the same CRUD + groups + refs model as posts. No special tables,
no special endpoints. (D62.)

## The Model

- A comment/reaction is authored by the **engager** (the person who comments
  or reacts), *not* the post's author. `author_key` = the engager.
- It points at its target post via **`ref_value`** = the post's `doc_id`.
- The read joins on `ref_value` and filters to the groups the reader can read
  — "comments joined to the post ids they refer, filtered by the groups
  you're in."
- **Authorship ≠ visibility.** The doc lives in the engager's data (whose it
  is); the group decides who can see it (who sees it). That split *is* the
  model — there is no contradiction between "the post lives in the author's
  group" and "the comment lives in the commenter's service."

## Where It Lives (the group)

**Default: discover.** A comment/reaction attaches to
`web10.app/groups/web10/discover` — the universal public board. Every user is
a member of discover (auto-enroll), so the engager can always write there; it
is `anyone`-readable, so the public surface sees it. For **public** posts this
is correct, and it is the default.

**The group-picker (feature, not built):** the comment/reaction UI should let
the user choose which groups to attach it to — the same group-picker the post
composer has. In a community you'd attach to `discover` + the community group,
so the community's members see it in their feed too. The post's own groups are
the suggested default; the user can add or remove. (This is what
`post-detail.md` shows for a community post — the reaction attached to the
community group — with discover as the base.)

## The Read

Read the `comments` / `reactions` service over the post's groups, filter by
`ref_value === post._id`. The server already filters to the groups the reader
can read (the D58 read gate). Dedupe by `doc_id` if you read a post's full
group set in one call — a doc attached to 2 of the requested groups comes back
once per group (a read-time JOIN artifact, **not** storage duplication: the
doc is stored once in `documents`; `doc_groups` is just the bridge).

## The Bug (why it "doesn't persist" today)

The client **never sends `ref_value` to the server.** `createComment` /
`createReaction` set `doc.ref_value` *after* the create (client-side only);
the SDK's `create` has no `ref_value` param, so the server stores `""`. The
read filters `ref_value === post_id`, which never matches → the comment is
created but orphaned (never found again). **Fix:** the SDK's `create` accepts
a `ref_value`; the client passes `ref_value = post._id`. This is independent
of the group design above and is the actual reason engagement doesn't persist.

## Private Accounts — deferred (needs a design pass)

The discover default is correct for **public** accounts. **Private accounts**
(Instagram-style: your posts + engagement are not on the public board) are
**not implemented** and need thought before we build them:

- A private account's posts would not attach to discover (followers group only).
- Its comments/reactions would not be on discover either — they'd live in the
  followers group, readable only by followers. A reaction on a private-group
  post must not leak onto the public board.
- The **default** for a private account has to be "not discover" — a
  per-account setting we don't have yet. The group-picker (above) is the
  mechanism, but the *default* is the missing piece.

**TODO (before private accounts):** design the per-account "private" setting
and how it changes the default group for posts + engagement. Not a blocker —
public accounts work with the discover default.
