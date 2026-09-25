# Repost — amplifying a post into your own feed

A repost is a fan saying "this deserves more eyes" — and saying it *from themselves*. A repost resurfaces someone else's post in the reposter's own feed, optionally with the reposter's own comment on top (a quote). This doc defines what a repost *is* on the wire, how the composer creates one, how the feed renders it, and how it is counted. The feed / discover / groups docs define *where* a post shows; `post-actions.md` defines *how the engagement row renders*.

> **Model change (3.110.0):** a repost is **a post, not a reaction.** The pre-3.110.0 model (a `reactions` doc with `type: 'repost'`, a countable signal on the target) is retired as the primary mechanism. A repost now creates a real `posts` doc that references the original by `repost_of` and carries the reposter's comment in `text`. That is what makes it show up in the reposter's feed as "reposted" — a reaction never appears in a feed. (The legacy `type: 'repost'` reaction still reads as a "reposted" fill for old data — a read-only fallback. **The repeat icon on every surface is unified onto the post model** (3.154.0): it opens the composer in repost mode, and the count is the number of `repost_of` posts.)

## The use case

A fan sees a post they want to amplify. They tap the repeat icon. The composer opens with the original post shown as a context block and a comment field ("why are you reposting this?"). They add a comment (or none — a plain repost) and hit Repost. A new post lands in their followers' feed, rendered as a "reposted" card with the original embedded. If they change their mind, they delete their own repost post (the owner menu) and it's gone.

## What a repost is on the wire

A repost is a **`posts` doc** in the reposter's followers group (the same groups a normal public post uses) whose body carries:

- `repost_of` — the `doc_id` of the original post. This is the reference; the repost carries **no copy** of the original's content.
- `text` — the reposter's optional comment (the quote). Empty for a plain repost.

It is created by `createRepost(original, comment)` in `src/data/posts.ts`, which calls `createPost` with `repost_of` set. A repost is a public post: it attaches to the discover group + the reposter's followers group, so it surfaces in the reposter's followers' feed.

This is the load-bearing decision. A repost is **a post, not a reaction**: it creates new content (the reposter's voice + the reference), it resurfaces the original in the reposter's feed, and it carries a quote. That is exactly what the operator asked for ("it should let you add some kind of comment, where it shows up in your feed as reposted").

## The composer: repost mode

The composer (`src/components/Feed/PostComposer.tsx`) is app-level (above the feed, in `App.tsx`'s `FeedRoute`). It takes a `repostingTo?: PostRecord` prop. When set, it is in **repost mode**:

- A **repost context block** (`RepostContext`) renders at the top: the original author, the original text (truncated), and the original's first media item — so the user knows exactly what they're amplifying. An **X** cancels the repost (`onRepostCancel`).
- The textarea placeholder becomes **"Add a comment…"** (the comment is the quote).
- The submit button reads **"Repost"**.
- A **plain repost is postable** with no comment and no media (the repost itself is the content).
- Submitting calls `createRepost(repostingTo, text)` — it never uploads the user's own media (the original's media is referenced by the original post, not copied). On success it clears the repost state and fires `onPostCreated` (the feed remounts so the new repost shows up).

The repeat icon is wired to open the composer in repost mode on **every surface** — not just the feed. The repost state (`repostingTo`) is app-wide (a `RepostProvider` in `App.tsx`, read through `useRepost`), so the feed's `onRepost` → `repostingTo` pattern (3.110.0) is a single shared seam: the feed, Discover, PostLightbox, ProfileFeed, and Groups all call `setRepostingTo(post)` to open the same app-level composer in repost mode. Discover / Groups (which have no composer of their own) navigate to the feed after setting the repost, so the composer is always the one that creates the post. The composer's `createRepost` is the single write — no surface writes a `type:'repost'` reaction anymore.

## The feed render: the "reposted" card

A post whose body has `repost_of` renders as a **reposted card** (`PostCard` in `FeedScreen.tsx`):

- A **"reposted" badge** (a `Repeat2` icon + the word "reposted") in the header, next to the reposter's name + timestamp.
- The **reposter's comment** (the repost post's own `text`) — the quote, above the original.
- The **embedded original post** (`RepostedEmbed`) — fetched by `repost_of` doc_id (`readPostById`), rendered as a nested read-only card (author, text, media). This is the X/Twitter quote-tweet layout: the quote above, the original below.
- The engagement row (likes / comments) is on the **repost post itself**, not the original.

`RepostedEmbed` is I3-scoped: it reads the original by doc_id, and a post the reader **cannot** read degrades to an "Original post unavailable" placeholder. A repost never grants access to the original beyond what the reader can already read.

**The original's ad rides along (D55).** The embed's `readPostById` runs the single-doc read, which attaches the original's creator-pinned ad (`attach_pinned_ads`) — so `original.ad` is populated. `RepostedEmbed` renders that ad (`<AdBlock>`) inside the embed: the repost resurfaces the original's content **and** its monetization, so the original creator earns from the reach the repost gives them (the positive-sum loop the creator platform is built on). Only the **creator's pinned ad** (`original.ad`) renders — never a **node ad** (`original.node_ad`): the repost post's own node ad (D57, attached at read time) already covers the node's inventory, and two ads in a compact embed is too much. A repost post itself carries no creator-pinned ad (`createRepost` sets no `ad_preference`).

## The count is real

The repost count on a post is the number of **posts whose `repost_of` points at it** — one per reposter, so it is self-healing (delete your repost post and the tally drops). It is stable across refresh (no `1 0 1 0` toggle), because it is a read of the post docs, not a reaction flip.

- **Feed** — the D73 feed query joins `posts` on `JSONExtractString(body, 'repost_of') = p.doc_id` and counts, so `post.reposts` rides in the payload (the same path as `likes` / `dislikes` / `comments`). The join is scoped to the reader's groups (I3), so a private post's repost tally is not visible to non-members.
- **Discover / Lightbox / Profile / Groups** — the same count, lifted to a surface read: `readRepostCounts(postIds, groups)` runs an I3-scoped `count(DISTINCT doc_id)` over `posts` whose `repost_of` points at the post (the feed query's join, run per-surface). `count(DISTINCT doc_id)` — not `count()` — because a post attached to N readable groups surfaces N rows in the boundary CTE; one reposter is one repost, not N.

## The "I reposted this" state (the filled icon)

The fill is the reader's **own repost post** — `readMyRepostedIds()` reads the reader's own followers group and returns the set of `repost_of` targets (the `readFeedReactions` own-post read, lifted to a surface read). A surface fills the repeat icon when the reader has a repost post for the target, **or** holds a legacy `type: 'repost'` reaction on it (the read-only fallback for old data). The feed's `readFeedReactions` does the same two-part check inline.

## Independent of like / dislike

A repost is a separate axis from the like/dislike pair. A user can like *and* repost the same post; the two are independent. Liking does not clear a repost, and reposting does not touch the like.

## Security invariants

- **I3 holds** — a repost is a normal post in the reposter's followers group; reading it is gated by the same group membership as any post. The embedded original is read by doc_id and degrades to "unavailable" when the reader can't read it. The repost count is scoped to the reader's groups, so a private post's tally is not visible to non-members.
- **No escalation** — a repost carries no content from the original (it references it by `repost_of` only). Reading a repost never grants access to the original post.

## What this is not

- **Not the share / link action.** "Share" (the `Share2` icon, `navigator.share` / clipboard of the permalink) is a separate, surface-owned action. Repost is a data write (a new post); share is a link.
- **Not a reaction (anymore).** The pre-3.110.0 `type: 'repost'` reaction is retired as the primary mechanism. It still reads as a "reposted" fill for old data (a read-only fallback) — no surface writes it anymore.
- **Not a ranking signal (yet).** The power-mean scorer normalizes a `reposts` signal but weights it `0`. Wiring it into the ranking (a knob or a fixed weight) is a separate decision.

## Follow-ups (open)

- **Author nudge** — a repost does not yet notify the original's author. A "X reposted your post" notification is a new notification type + a destination in `notifications.md`.
- **Ranking weight** — giving the repost signal a non-zero weight in the power-mean (a knob or a fixed value).

## Reference

- The shared engagement bar (the repeat icon axis): `./post-actions.md`
- The post data layer (`createRepost`, `readRepostCounts`, `readMyRepostedIds`): `../../../../marketing/web10-social/src/data/posts.ts`
- The composer (repost mode): `../../../../marketing/web10-social/src/components/Feed/PostComposer.tsx`
- The shared repost seam (`RepostProvider` / `useRepost`): `../../../../marketing/web10-social/src/context/RepostContext.tsx`
- The feed render (the reposted card): `../../../../marketing/web10-social/src/components/Feed/FeedScreen.tsx`
- The notification a like fires (the repost nudge is an open follow-up): `./notifications.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
