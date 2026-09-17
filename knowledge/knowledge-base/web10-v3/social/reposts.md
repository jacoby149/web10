# Repost — a post's amplification signal

A repost is a fan saying "this deserves more eyes." It is the third signal on the engagement row, alongside the like/dislike pair and comments. This doc defines what a repost *is* on the wire, how it is counted, and how the client renders it. The engagement model (D62) defines what a reaction *is*; the feed / discover / groups docs define *where* a post shows; `post-actions.md` defines *how the engagement row renders*. This doc fills in the one signal that was left as a dead icon: the repost.

## The use case

A fan sees a post they want to amplify. They tap the repeat icon. The post's repost count goes up, the icon fills, and the author can see it is spreading. If they change their mind, they tap again and it goes back. That is the whole feature.

## What a repost is on the wire

A repost is a `reactions` doc with `type: 'repost'` and `ref_value` pointing at the target post's `doc_id`. It is the same shape as a like or a dislike — the engagement model (D62) already defines reactions as documents in the engager's own service, joined to their target by `ref_value`. `ReactionRecord.type` is a free string, so `'repost'` needed **zero node changes**: no new collection, no new endpoint, no schema.

This is the load-bearing decision. A repost is **a reaction, not a post**. It does not create new content, does not resurface the post in the reposter's feed, and carries no quote. It is a countable signal on the target post, exactly like a like. (A true "boost" — resurfacing the post in your own feed — is a different, larger feature and is explicitly out of scope here. See "What this is not.")

## Independent of like / dislike

The like/dislike pair is mutually exclusive (one reaction per user — `like` XOR `dislike`, enforced in the data layer by `setReaction` / `toggleReactionKind`). A repost is **not** part of that invariant. A user can like *and* repost the same post; the two are independent axes. Liking does not clear a repost, and reposting does not touch the like.

This is why the data layer has a separate `toggleRepost` rather than overloading `toggleReactionKind`: `toggleReactionKind` only considers `type === 'like' || 'dislike'` when it decides "is this mine?", so a `type: 'repost'` doc is invisible to it. `toggleRepost` matches on `author_username === token.username && type === 'repost'` alone.

## The "mine" match is username-alone (the v3 ownership rule)

Same rule as likes (3.87.2): the node writes `author_key = token.username` — a bare username, the provider implicit — so a reaction's derived `author_provider` is the v2 fallback (`'web10'`) and never equals the token's real provider. Matching "is this my repost?" on `author_username === token.username` alone. A v2-shaped `provider/username` key still matches (the username is the last segment either way).

## Self-heal (no stacking)

Same as likes: `toggleRepost` reads the user's existing reposts (a `filter`, not a `find`) and, if duplicates are stacked (a pre-fix artifact), collapses them to the single newest doc. Idempotent — with zero or one doc it is a no-op.

## The count is real

The repost count is the number of `type: 'repost'` reactions on the post, counted the same way likes and dislikes are:

- **Feed** — the D73 feed query's `eng` subquery counts each reaction type (`countIf(JSONExtractString(body, 'type') = 'repost')`), so `post.reposts` rides in the payload (the same path as `likes` / `dislikes`).
- **Discover** — the board's engagement read counts `type === 'repost'` client-side by `ref_value` (the same loop that counts likes).
- **Lightbox / profile / groups** — the per-post `readReactions` read counts `type === 'repost'` (the same read that derives the like count).

Before this, the count was hardcoded `0` in the feed row mapper and the discover loop, and the icon was a dead `<span>`. Now it is a real tally.

## The UI: a fourth axis on `<PostActions>`

`post-actions.md` defines the engagement row as three axes (`like` / `dislike` / `comments`). A repost is a fourth: `repost` (`interactive` | `display` | `none`, default `none`). It renders a `Repeat2` icon + the repost count, filled (brand) when the reader has reposted, and toggles on tap. The surface owns `reposted` (the reader's own state) + `repostCount` and reports intent via `onToggleRepost` — the same controlled pattern as the like pair.

The axis defaults to `none` so a surface that does not wire it is unaffected. Every surface that renders the engagement row wires it `interactive` (feed, discover, lightbox, profile feed, groups) — one post, one way of reposting, everywhere it shows. In `remote` mode (marketing-ui, anon) the repost is `display` (a count, not a tap target — an anon visitor cannot repost).

## Security invariants

- **I3 holds** — a repost attaches to the same group as the post's other reactions. For a group post, writing a repost requires membership in that group (the same gate as a like). The repost count on any post only reflects reactions in groups the reader can read, so a private post's repost tally is not visible to non-members. A repost doc carries no content from the target (it references it by `ref_value` only), so reading a repost never grants access to the target post.
- **No escalation** — a repost is a content-free `reactions` doc. It is a signal, not a copy; it cannot be used to read or exfiltrate the target.

## What this is not

- **Not a boost / resurface.** A repost does not put the post in the reposter's feed and does not create a new post doc. It is a signal on the target, not a copy. (Resurfacing is a future feature — it needs its own data model: a new post doc that references the original, with attribution + a "reposted from" render + deletion semantics when the original is removed.)
- **Not a quote.** There is no attached comment. (A quote-repost is also a future feature.)
- **Not the share / link action.** "Share" (the `Share2` icon, `navigator.share` / clipboard of the permalink) is a separate, surface-owned action in the bar's `trailing` slot. Repost is a data write; share is a link. They were previously conflated (the feed / lightbox "Share" called a no-op `recordRepost`); they are now distinct.
- **Not a ranking signal (yet).** The power-mean scorer already normalizes a `reposts` signal but weights it `0` ("not a knob yet"). This build makes the count real; wiring it into the ranking (a knob or a fixed weight) is a separate decision.

## Follow-ups (open)

- **Author nudge** — a repost currently does not notify the post's author (the D69 nudge fires for likes / comments, not reposts). A "X reposted your post" notification is a new notification type + a destination in `notifications.md`.
- **Resurface / boost** — putting a repost in the reposter's feed (the true "amplify" behavior).
- **Ranking weight** — giving the repost signal a non-zero weight in the power-mean (a knob or a fixed value).

## Reference

- The engagement model (reactions as docs, the `ref_value` join): `../overview.md` + `../../decisions.md` (D62)
- The shared engagement bar this composes: `./post-actions.md`
- The reaction data layer this builds on: `../../../../marketing/web10-social/src/data/reactions.ts`
- The notification a like fires (the repost nudge is the open follow-up): `./notifications.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
