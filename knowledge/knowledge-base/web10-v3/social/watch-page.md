# The Watch Page — the YouTube-shaped video destination

`discover-card.md` settled the **card** (the Home wall's 16:9 tile, the hover preview, the attribution). `shorts.md` settled the **vertical lens** (the full-screen swipe feed). This doc settles the destination they both point at but that did not exist: **you click a video in the Home wall, and you land somewhere that keeps you on the content train.**

Today that destination is the wrong one. Clicking a Home tile fires `navigateToPost` → `/u/:username/p/:postId` → the **profile screen** with a `PostLightbox` modal on top. You clicked a video; you got a profile page with a modal. The feed context — the ranking, the position, the "what's next" — is gone. This is the off-the-train yank.

## The use case

A fan is on the Discover **Home** wall (the YouTube-shaped video grid, the default view). They click a video. They want to **watch it big**, with the player's full control rack, and they want to see **what's next** — a queue of related videos they can keep clicking. They do *not* want to be dropped on a stranger's profile page. The video is the destination; the author is a detail *on* the destination, not the destination itself.

That is the whole goal. Everything below is in service of keeping the fan on the train.

## The two destinations, decided by aspect ratio

The Video wall is **landscape-only** (the YouTube shape). A portrait (9:16) video is a **short** — it lives in the Shorts destination (the TikTok shape, `shorts.md`), not the wall. The aspect-ratio split keeps the two from bleeding into each other: a fan clicks a landscape video in the wall (→ the watch page) or a short in the Shorts wall (→ the lens), never the other way around. The wall's render gate is `postHasVideo(post) && !postIsPortraitVideo(post)` — the same `width < height` signal Shorts' render-time backstop already runs, re-derived from the resolved media (not the client-asserted tag).

The "What's next" queue is landscape-only for the same reason — it is the watch page's version of the wall, so a short never appears in it (the operator: "it is really disorienting to be ripped out of video view without any indication"; YouTube keeps the two separate).

A click still routes by the **same signal** — the resolved media's aspect ratio (`width < height`), not the client-asserted tag:

| Click target | Destination | Shape |
|---|---|---|
| **9:16** (portrait) | `/shorts/:postId` | the vertical swipe lens (`shorts.md`) — already built |
| **16:9 / landscape** | **`/watch/:postId`** (this doc) | the watch page — big video + "What's next" queue |

No new signal, no new read. The wall filters portrait out, so the portrait branch of the click handler is a **backstop** (a portrait card can only reach it via a stale read) — the wall's gate is the primary split. (A multi-media post routes on its **first** video's ratio, the same rule the wall's gate uses to decide "is this a video at all.")

## The URL is the entire state (no client-side preservation)

The deep-link rule, taken to its conclusion: **the URL is the single source of truth for the watch state, and nothing else is.** There is no "remember where you were" store, no playback-position cache, no in-memory feed snapshot. If it is not in the URL, it does not survive a refresh — and that is the point.

```
/watch/:postId?from=discover&knobs=<recency,likes,comments,halfLife,character>[&t=<seconds>]
```

| Param | Holds | Why |
|---|---|---|
| `:postId` | which video | the primary key of the page |
| `?from=discover` | where the "What's next" queue comes from | the Discover board (v1); a future `from=feed` variant is a different queue source, same page |
| `?knobs=…` | the feed ranking | the five detent indices, the same encoding `DiscoverScreen` already uses (`encodeKnobState`). The queue is ranked with **the ranking the fan had when they clicked** — "keep you in the same feed settings you had before." |
| `?related=<preset>` | the "What's next" relatedness | the plain-English relatedness preset (`mixed` / `more-like-this` / `same-creator` / `just-the-feed`), the watch page's own tuning of the similarity boost (the "all feed is tunable" rule). Omitted when at the default (Mixed). Persisted to the settings doc (URL > saved > default), the `feedKnobs` idiom. |
| `?t=<seconds>` | the playback position | the YouTube `?t=` idiom. Refresh / back / share restores the position. **Optional** — absent means start at 0. |

The consequence the operator asked for: **a watch link gets you back to the watch state you had, entirely.** `youtube.com/watch?v=…` does this; so does `/watch/:postId?from=discover&knobs=…&t=…`. Browser **back** pops to the previous URL (the Discover wall, which holds *its* state in *its* URL — `?view=…&knobs=…&tag=…`), and the router rebuilds it. No preservation logic anywhere; the URL *is* the preservation.

**The `?t=` write-back:** the player's `timeupdate` (throttled) writes `?t=` via `setSearchParams({ replace: true })` so the address bar tracks the position without flooding the history. On load, the player seeks to `?t=` once metadata is ready. This is the only "state" the page holds, and it lives in the URL, not in a ref.

## The layout

### Desktop (the YouTube watch shape)

Two columns. Left (the wide one): the video, the title, the author row, the action bar, the comments. Right (the narrow one): the "What's next" queue.

```
┌───────────────────────────────────────────┬─────────────────────────┐
│  <VideoPlayer mode="full" fit="contain">  │  What's next            │
│                                           │  ┌───────────────────┐  │
│                                           │  │ thumb  title      │  │
│                                           │  │        author · 3m │  │
│                                           │  └───────────────────┘  │
│  Title (the post text)                    │  ┌───────────────────┐  │
│  ┌────┐  Author Name          [Follow]    │  │ thumb  title      │  │
│  │ av │  N followers                    │  │        author · 8m │  │
│  └────┘                                  │  └───────────────────┘  │
│  [👍 4.6K] [👎] [💬 128] [↗ Share] [🔁]   │  …                       │
│  ─────────────────────────────────────     │                         │
│  Comments (CommentThread)                  │                         │
└───────────────────────────────────────────┴─────────────────────────┘
```

- **The player:** `<VideoPlayer source={hlsOrFile} mode="full" fit="contain">` — the full control rack (scrubber · play/pause · mute · volume · time · speed · quality · fullscreen), the same surface the lightbox uses. `sourceFromMedia` picks hls.js (transcoded) vs the direct file, the rule every surface already follows.
- **The author row:** avatar + display name + follower count + a **Follow** button, *under* the video (the operator's "author under the vid for video view"). The Shorts lens puts the author bottom-left *over* the video; the watch page puts it under, because the watch page has room and the video is not full-bleed.
- **The action bar:** the existing `PostActions` (like/dislike pair, comment count, share, repost) — the same component the feed and the card use. No new engagement surface.
- **The queue:** a vertical list of video cards (16:9 thumbnail + title + author + duration), each a link to `/watch/:nextPostId?from=discover&knobs=…`. Clicking one navigates (a new history entry, so back steps through the queue the way YouTube does). The card is the `HomeCard` shape, narrower.
- **Comments:** `CommentThread` below the action bar (the operator's "comments below sounds awesome"). Same component, same data seam (`readThreadComments` / `readThreadReplies` / `createComment`), the same I3-scoped read the card and the lightbox use.

### Mobile

Stacked: the video on top (16:9, full width), then title, author row, action bar, comments, then the "What's next" queue below. No side-by-side (there is no room). The swipe-up-for-next (the Shorts gesture applied to landscape) is a **v2** nicety — v1 is the scroll-down queue.

## The "What's next" queue — a client-side re-rank, not a filter

The queue is **the Discover board the fan already had, re-ranked for similarity to the current video.** No new API call, no server-side similarity engine, no new collection. The board is the 50 posts `readDiscoverFeed` already returns (with engagement counts, tags, authors) — the watch page re-reads it (it is a fresh page load, so it fetches its own copy) and re-ranks it client-side.

**The score.** The base is the **knob ranking** the `?knobs=` param carries (the D36 power-mean score, `scorePost` — the same function the board uses for display). On top of it, a **similarity boost** derived from the current post:

```
queue_score(post) = knob_score(post) × ( 1
                    + tagWeight(rel)   × |tags(post) ∩ tags(current)|
                    + authorWeight(rel) × [author(post) == author(current)] )
```

- **`tags(post) ∩ tags(current)`** — the set intersection of the two posts' `tags` arrays (already on every `PostRecord`). The operator's "filtering by tags that user put in the video, prioritizing those in sort to get similar videos." Two posts that both carry `#climbing` float above one that shares nothing.
- **`[author == author]`** — same-author posts get a boost (the YouTube "more from this channel" signal, folded into the same score).
- **It is a boost, not a filter.** A post with zero shared tags and a different author still appears — just lower. The knob ranking is the floor; the similarity is the multiplier. The fan's ranking preference (Most Loved vs Most Recent vs Balanced) still governs the base order; similarity tilts it.

### The relatedness is a knob, not a constant (all feed is tunable)

The operator (28.09.2026): **"should be configurable knobs, all feed is tunable in web10, but reasonable defaults to set."** The similarity boost is therefore **not a hardcoded constant** — it is a tunable control on the watch page, with a reasonable default. The two weights (`tagWeight`, `authorWeight`) are the *mechanism*; the fan tunes a **plain-English "Relatedness" preset**, not the raw numbers.

**Why presets, not raw weight dials:** this is the exact trap D36 already rejected. The Character knob (the power-mean exponent `p`) and the Time knob (the recency half-life) were both killed because they were "math wearing a costume" — an obfuscated dial with no plain-English concept (3.73.0 / 3.87.0). A "tag weight 0.5 / author weight 0.3" slider is the same disease. The fix is the same: the fan picks a **named, plain-English relatedness**, and the preset maps to the weights underneath (the `FIXED_*_DETEENT` pattern — the value is in the state so the URL/persist shape is stable, but the fan never sees the number).

**The Relatedness presets** (the plain-English concepts a fan actually understands):

| Preset | Meaning | `tagWeight` | `authorWeight` |
|---|---|---|---|
| **Mixed** (default) | a balance of similar topics + same creator | 0.5 | 0.3 |
| **More like this** | lean on the *topic* (tags) — "more videos like this one" | 0.8 | 0.1 |
| **Same creator** | lean on the *author* — "more from this person" | 0.1 | 0.8 |
| **Just the feed** | no similarity tilt — the queue is the plain knob ranking (the boost is off) | 0 | 0 |

- **The default is Mixed** — the reasonable default the operator asked for. A fan who never touches it gets a balanced "what's next."
- **The control is a small chip row** on the watch page (next to the queue header, or a "Tune what's next" affordance) — the same visual idiom as the board's preset chips (Most Recent / Most Liked / Most Commented / Balanced). It is a *separate* control from the board's `?knobs=` ranking: `?knobs=` is *how the board ranks* (recency/likes/comments), `?related=` is *how the queue tilts toward the current video*. The two compose (the knob score is the floor, the relatedness is the multiplier).
- **Deep-linkable + persisted** — the same idiom as the board knobs. `?related=<preset>` in the URL (the deep-link rule: refresh restores it, a shared link carries it); persisted to the user's `settings` service (`watchRelatedness` on the settings doc, the `feedKnobs` pattern — URL > saved > default). Absent `?related=` → the saved value → **Mixed**.
- **The weights are the preset's values, not the fan's input.** `tagWeight(rel)` / `authorWeight(rel)` read the active preset's row. If the operator later wants a continuous dial, it is a preset-to-detent generalization (the `KnobState` shape already supports it) — but v1 is the four named presets, because a named concept is what a fan can reason about and a raw weight is not.

**Excluded from the queue:** the current post (it is playing), and ad docs (the `dropAdPosts` rule — an ad is inventory, not a "what's next" suggestion).

**Bounded for v1.** The queue is the 50 posts on the board, re-ranked. Infinite scroll (fetching the next board page as the fan reaches the bottom of the queue) is a follow-up. The operator signed off on bounded-for-v1.

## The author — the overlay, not the navigation

The operator's core concern: **sending someone from the watch page straight to a profile gets them off the train.** The author is reachable, but reaching them does not leave the page.

The author row's avatar + name open a **profile overlay** — a slide-in panel (desktop: right-side drawer over the queue; mobile: bottom sheet) showing the author's face, display name, bio, follower count, a **Follow/Unfollow** button, and a small strip of their recent posts. From the overlay, **"View all posts"** is the one explicit link that navigates to `/u/:username` (the full profile). Everything else — see who they are, follow them, peek at a post — happens *without* leaving the watch page. Close the overlay and the video is still playing at the same `?t=`.

This is the "stay on the train" rule made concrete: the profile is *reachable from* the watch page, never the *default* of clicking the author. (The old behavior — author click → full profile navigation — is retired for the watch page; it remains the correct behavior on the Home card's attribution and on the feed, where there is no watch context to preserve.)

**The overlay is a new component** (`ProfileOverlay`, or a `modal` mode on the existing profile read). It reuses `readUserProfile` / `readUserPublicProfile` (the face + the public posts, the 3.166.0 read) — no new data layer. The Follow button drives the existing follow seam.

## The exit — no back-to-discover button

The operator: **no "back to Discover" button.** The watch page does not render an exit affordance of its own. The fan leaves by:

- **Browser back** — pops to the previous URL (the Discover wall, or wherever they came from). The router rebuilds that page from its URL. This is the primary exit, and it "does what it needs to do" because the previous page's state is in its URL.
- **The sidebar** — the **Discover** nav item (or the web10 logo → home) takes them back to Discover. On mobile, the bottom tab bar.

No in-page "← Discover" button. The page is a destination, not a detour, and it does not need to advertise the way out — the app chrome already does.

## The IA this lives inside (the Discover split)

The watch page is one destination in a **flatter Discover**. Today Discover is a salad — a `Trending | People` tab row *plus* a `Home | Hot Gossip` view toggle inside Trending, three levels of "which list am I looking at" in one screen. The operator's call (28.09.2026): **flatten it to separate sidebar destinations.**

| Today (one Discover tab, nested) | The flat model (sidebar items) |
|---|---|
| Discover → Trending → **Home** (video wall) | **Video** — the video wall (the watch page's source) |
| Discover → Trending → **Hot Gossip** (post board) | **Hot Gossip** — the Threads-style post board |
| (Shorts is already its own sidebar item) | **Shorts** — the vertical lens |
| Discover → **People** (people + groups browser) | **People** — the people + groups browser |

Each is a **place**, not a sub-state of another place. The `?view=` toggle and the `?tab=` row retire; the four destinations are top-level routes (the sidebar owns the nav, the way it already owns Feed / Messages / Profile). The video wall is called **Video**, not Home — it is called what it is, because it *is* videos (the operator: "dont call it home, call it Video … i am saying like it is because it is videos!"). The watch page is reachable from the **Video** destination in both apps.

### The marketing site: the experience IS the home (show, don't tell)

The marketing site (`marketing-ui`) is a multi-page react-router app with a top `Navbar` (`Home | Discover | App Store | Import | Join`) — not a monopage — and its `/trending` page carries the same tabs-and-toggle salad the social Discover has. The operator's call (28.09.2026): **the marketing site leads with the product, not a pitch.**

- **`Home` → `About`.** The landing page (the pitch) is renamed **About** — it is no longer the front door.
- **`Discover` → `Home`.** The social experience (`/trending`) becomes the marketing **Home** — the front door. The nav reads **Home · App Store · Import · Join · About** (the experience first, the pitch last).
- **The experience gets its own sidebar** — **Video · Shorts · Hot Gossip · People** — "YouTube but two more things on the sidebar than YouTube!" (the operator's line). The first item is **Video**, not Home — the video wall is called what it is, because it *is* videos (the operator: "dont call it home, call it Video … i am saying like it is because it is videos!"). The current `/trending`'s `Trending | People` tabs + `Home | Hot Gossip` toggle (the salad) retire in favor of the four flat destinations, the same split as the social app. The `TrendingSidebar` (the "Top 10" rail) is a *content* rail (a ranked list that scrolls the grid into view), not a *nav* rail — it is not the sidebar this means; the nav sidebar is the four destinations.

This is the "show, don't tell" rule applied to the marketing site: a visitor lands on the live social experience (the Video wall, the knobs, the people) instead of a landing page that *describes* it. The pitch (About) is one click away; the product is zero clicks away.

### The four destinations are anon link-outs (1:1)

The marketing site is the **anon preview** of the social app. Its four destinations (Video · Shorts · Hot Gossip · People) are anon reads of the public board — the same content the social app shows, signed-out. **Clicking an item link-outs to web10-social at the matching destination, 1:1** — the operator (28.09.2026): "if in video tab and click, brings you to vid tab in web10 social, if short then short, if hot gossip then hot gossip … if people then people! like 1:1." The destination is set by **the tab you're in**, not the content type:

| Marketing destination (anon) | Click link-outs to (web10-social) | The shape |
|---|---|---|
| **Video** (the video wall) | `/watch/:postId?from=discover&knobs=…` | the watch page — the YouTube view |
| **Shorts** (the vertical lens) | `/shorts/:postId` | the Shorts lens |
| **Hot Gossip** (the post board) | the Hot Gossip feed, scrolled to + highlighting that post (`/hot-gossip?post=<id>` or the equivalent) | the Threads view — the post in the middle of the board, **not** a profile, **not** a detail page |
| **People** (the people browser) | the People destination (the person's profile) | the People view |

The point (the operator: "it is pretty much youtube + youtube shorts + threads living together under the same roof"): the marketing site is the four destinations under one roof, and each one is a door into the matching destination in the real app. **Clicking a Hot Gossip post does NOT go to a profile and does NOT go to the YouTube view** — it goes to the Hot Gossip (Threads) feed, **in the middle of the board, at that post** (the operator: "the hot gossip link shoots you to somewhere in the discover feed, similar concept to this youtube thing but twitter equivalent … somewhere in the middle of the hot gossip"). The post is already a full card in the Hot Gossip board (the `DiscoverCard` — inline video, inline comments, the engagement bar), so there is nothing to "enlarge" and no separate detail page: the link-out scrolls the board to that post and highlights it, the way the watch page keeps you in the video context. It is the **Twitter/Threads equivalent** of the YouTube watch page — the YouTube watch page keeps you in the *video* context (big player + "what's next"), the Hot Gossip link-out keeps you in the *feed* context (the post is one card in the stream, where you left off).

**Naming:** it is **Hot Gossip**, not "the discover feed" (the operator: "it isnt called discover feed anymore it is just hot gossip by itself!"). The `?view=grid` / "discover feed" framing retires with the split; the destination is Hot Gossip, full stop.

The marketing site does **not** have its own watch page / Shorts lens / Hot Gossip feed — those live in web10-social. The marketing site is the anon preview; the link-out is the bridge. (The watch page, the Shorts lens, and the Hot Gossip feed are all anon-capable, so the link-out lands on a working screen for a signed-out visitor.)

**This is the long-term shape; the watch page is the first piece.** The split is its own lane (it touches `Layout.tsx` nav + the `DiscoverScreen` shell + the marketing `Navbar`/`Trending`). The watch page can land *first* (it is a new route + a new screen, it does not require the sidebar split to exist — it is reachable from the current Home view's card click). The split lands after, and the watch page's entry point moves from "the Home view toggle" to "the Home sidebar item" with no change to the page itself.

## The "beyond your community" note (open, not a v1 decision)

The operator flagged, looking at YouTube's **Community** tab (posts *strictly for your subscribed community*): web10's posts go **beyond** that — a public post is on the **discover group** (readable by `anyone`, D41/D58), not just the author's followers. That is the differentiator: YouTube's feed is your subscription graph; web10's Home wall is the **public ledger** — anyone's post, ranked by the knobs, discoverable by anyone. The watch page inherits this: its "What's next" queue is drawn from the **public discover board**, not the viewer's follow graph. (The *following* feed — `/feed` — is the subscription-graph surface; the watch page is the discovery surface. They are different queues over different groups, and the `?from=` param is the seam that keeps them distinct if a `/feed`-sourced watch page is ever wanted.)

This is a product note to carry, not a v1 build. It does not change the watch page's mechanics — it changes the *story* of why the queue is what it is.

## What this is not

- **Not a modal.** The watch page is a **route** (`/watch/:postId`), a full page, not a `PostLightbox` overlay. The lightbox stays the profile's modality (the grid cell → modal, `video-player.md`). The watch page is the *stream's* modality for a clicked video.
- **Not the profile.** The profile is reachable *from* the watch page (the overlay's "View all posts"), never the default of a video click. The old `navigateToPost → /u/:username/p/:postId` (profile + lightbox) is retired as the Home card's destination.
- **Not a new collection or group.** The queue is a re-rank of the discover board. No `watch` group, no `watch` collection, no node change (D60 — the node stays generic; this is entirely client-side).
- **Not infinite (v1).** The queue is the loaded 50, re-ranked. Infinite scroll is a follow-up.
- **Not the Shorts lens.** A 9:16 video goes to `/shorts/:postId` (the swipe feed). The watch page is the landscape destination. The two share the aspect-ratio gate and the `sourceFromMedia` rule; they are different surfaces.
- **Not a server-side similarity engine.** The "related" signal is a client-side tag/author boost over the knob score. There is no node-side "similar videos" query (and there should not be — D60, and the signal is good enough without it).

## Decisions (operator sign-off, 28.09.2026)

1. **The URL is the entire state** (the operator: "dont do any preservation thing besides having the link be able to exactly get you back … these youtube links get you back to the watch state you had entirely"). `/watch/:postId?from=discover&knobs=…[&t=…]`; no client-side preservation; browser back pops to the previous URL and the router rebuilds it. `?t=` is written back via `setSearchParams({ replace: true })`.
2. **Aspect-ratio routing** — portrait → `/shorts/:postId`, landscape → `/watch/:postId`, the Shorts render-time gate (`width < height` on the resolved media), no new signal.
3. **The "What's next" queue** — the loaded Discover board (50), client-side re-rank: `knob_score × (1 + tagWeight·|tag∩| + authorWeight·[same author])`. A boost, not a filter. Bounded for v1 (the operator: "that sounds great for the whats next"). `?knobs=` carries the ranking the fan had.
4. **The layout** (the operator: "yupp i like that for the layout") — desktop: video left, queue right; mobile: stacked. `<VideoPlayer mode="full">`. Author row **under** the video (watch) vs bottom-left over the video (shorts). Comments below (`CommentThread`).
5. **The author overlay** — the author row opens a profile overlay (face, bio, follow, recent posts, "View all posts" → `/u/:username`), not a navigation. The "stay on the train" rule.
6. **No back-to-discover button** (the operator: "dont need a back to discover, if they click discover tab again … or the web10 social logo could do it too"). Exit is browser-back or the sidebar/logo.
7. **The Discover split** (the operator: "takes these 4 things and turns it into three sidebar things" + "the marketing page could benefit from a sidebar home (video tab), shorts, hot gossip, people, so youtube but two more things on the sidebar than youtube!" + "dont call it home, call it Video … i am saying like it is because it is videos!") — **Video · Shorts · Hot Gossip · People** as flat sidebar destinations, both apps (the first item is **Video**, not Home — it is called what it is, because it *is* videos). The `?view=` / `?tab=` nesting retires. **A separate lane; the watch page lands first and is reachable from the current Home view until the split moves its entry point.**
8. **Hot Gossip stays Threads-style** (the operator: "i wouldnt change hot gossip much … hot gossip is great"). The split gives it its own destination; its content model (the ranked post board, the Threads shape) is unchanged.
9. **"Beyond your community"** — the queue is the public discover board, not the follow graph. A product note (the differentiator vs YouTube's subscription-gated Community tab), not a v1 mechanic.
10. **The marketing site leads with the product** (the operator: "want it to be renamed to home, and then have the current home be about page, instead of home discover, i.e. social experience show dont tell on the marketing page!"): `Home` (the landing/pitch) → **About**; `Discover` (`/trending`) → **Home** (the front door); the experience gets its own nav sidebar **Video · Shorts · Hot Gossip · People** ("youtube but two more things on the sidebar than youtube!" — the first item is **Video**, not Home, because it *is* videos). The `Trending | People` + `Home | Hot Gossip` salad on `/trending` retires to the four flat destinations.
11. **The four destinations are anon link-outs, 1:1** (the operator: "if in video tab and click, brings you to vid tab in web10 social, if short then short, if hot gossip then hot gossip … if people then people! like 1:1 … it is pretty much youtube + youtube shorts + threads living together under the same roof" + "the hot gossip link shoots you to somewhere in the discover feed, similar concept to this youtube thing but twitter equivalent … somewhere in the middle of the hot gossip" + "it isnt called discover feed anymore it is just hot gossip by itself!"). The marketing site is the **anon preview**; each destination link-outs to web10-social at the **matching** destination — Video → the watch page, Shorts → the Shorts lens, Hot Gossip → the Hot Gossip feed **in the middle of the board at that post** (the Twitter/Threads equivalent of the watch page — the post is a full card in the stream, scrolled to + highlighted, **not** a profile, **not** a detail page), People → the People destination. The destination is set by the tab, not the content type. The old `HomeCard` remote-mode link-out (→ the post permalink → profile + lightbox) is retired; the 1:1 mapping replaces it for every destination. It is **Hot Gossip**, not "the discover feed."
12. **The relatedness is a knob, not a constant** (the operator: "should be configurable knobs, all feed is tunable in web10, but reasonable defaults to set"). The similarity boost's weights are **not hardcoded** — the fan tunes a plain-English **Relatedness** preset (Mixed default / More like this / Same creator / Just the feed), the same "named concept, not a raw dial" rule that killed the Character + Time knobs (D36, 3.73.0/3.87.0). `?related=<preset>` in the URL + persisted to the settings doc (URL > saved > default, the `feedKnobs` idiom). It is a *separate* control from `?knobs=` (the board ranking): `?knobs=` is how the board ranks, `?related=` is how the queue tilts toward the current video; the two compose.

## Reference

- The card this is reached from (the Home wall tile, the hover preview, the attribution): `discover-card.md`
- The vertical destination the aspect-ratio gate routes to (the swipe lens, the render-time 9:16 gate this reuses): `shorts.md`
- The player this composes (one `<VideoPlayer>`, the `mode="full"` rack, `sourceFromMedia`): `video-player.md`
- The engagement bar + comment thread this reuses: `post-actions.md`, `comments.md`
- The public-board read the queue is drawn from (the discover group, `anyone`-readable, D41/D58): `../groups/discoverability.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
