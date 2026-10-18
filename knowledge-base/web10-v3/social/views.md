# Views / impressions on the surface — the D86 reach metrics

The on-surface view metrics — the number Twitter shows under a post ("N views")
and YouTube shows under a video — are the **D86 engine's delivery metrics**,
not a separate counter. There are **two** of them, both shown on every surface:

- **Impressions** — the total number of delivery events (how many times the
  content was served). The **bar-chart** icon (the Twitter/X views glyph).
- **Reach** — the number of distinct readers who saw it. The **person** icon.

Both are read from the same `content_events` table the creator dashboard
aggregates (`analytics/overview.md`) — **one source of truth**, not two. This
doc defines what the on-surface number *is*, where it comes from, and where it
renders. `post-actions.md` defines *how the engagement row renders*; the feed /
discover / watch / shorts docs define *where a post shows*.

> **This IS the analytics engine (D86) — the on-surface face of it.** The
> earlier lightweight version (a client-written `views` doc, "a like that isn't
> a like") was **retired**: a client-written count is redundant (the node already
> records the delivery) and gameable (a user in devtools could fire it at will).
> The view **is** the delivery — logged server-side by the read path, un-gameable,
> and it survives a tab crash. Do not reintroduce a client-written `views` doc.

## The use case

A reader is served a post (feed, discover, watch, shorts, profile, groups,
lightbox). The node records a **delivery** for that (doc, reader, surface) —
the server-side, un-gameable floor. The on-surface metrics are the aggregate of
those deliveries: **impressions** (how many times it was served) + **reach**
(how many distinct people saw it). The author and the reader both see them: the
author sees reach on their content, the reader sees how many others saw it.

## What a view is on the wire

A view is a **`content_events` row** with `event_type = 'delivery'`, written by
the **node** (not the client) as a side effect of the read path, when it serves
the doc to a reader. The row carries `doc_id`, `service`, `reader_key` (the
reader's username), `surface` (the app's screen label), and `seen_at`. The
post's `posts` doc is untouched — the view is a separate event, not a counter
on the post.

**Why server-side, not a client write:** the post's `posts` doc is owned by the
**author**, so a viewer can't write a counter to it anyway. More importantly, a
client-written count is gameable (a user in devtools, or a spam app, could fire
it at will) and is lost if the tab dies mid-write. The delivery is recorded by
the node in the read path — the client has no lever to fire it, and a tab crash
can't eat it. This is the D86 anti-gaming floor generalized to the on-surface
number.

## Recording a view (the delivery, server-side)

There is **no client-side "record a view" write.** The delivery is logged by the
node when it serves the doc:

- **The read path** (`POST /v3/read`) — a single-doc read (the watch / short /
  permalink) or a group read (the discover / shorts board) logs a delivery per
  returned doc when the app passes a `surface` label.
- **The query path** (`POST /v3/query`) — the feed-as-query (D73) logs a
  delivery per returned doc when the app passes `surface` + `contentService`.

The delivery is **deduped per (doc, reader, surface) per window** (the D49
pattern generalized) — a reader refreshing the same post on the same surface
within the window is one delivery, not N. **Impressions** = `count()` of
delivery rows; **reach** = `countDistinct(reader_key)` over them.

**Anon gap (planned, not yet built):** delivery is currently logged for
**verified readers only** — a signed-out visitor (often the majority on a
public board) does not count. The fix (log anon deliveries with a coarse hashed-IP
dedupe key) is a separate plan item; see "Anon delivery support" in
`strategy/plan.md`.

## Counting the view (the `contentViews` read)

The on-surface metrics come from the **`contentViews`** read
(`POST /v3/contentViews`), which aggregates the `content_events` delivery rows
for a set of docs:

- **Impressions** — `count()` of delivery rows for the doc (lifetime, bounded by
  the table's 1-year TTL).
- **Reach** — `countDistinct(reader_key)` over the delivery rows.

It is **I3-scoped**: a doc only returns metrics if it is in one of the
reader's readable groups for the service (the `doc_groups` join) — a reader
sees a post's metrics only if they can read that post. The counts themselves are
global; the group filter limits WHICH docs the reader can query, not the count.
A doc with no events is absent → the caller treats absent as `0`.

The data layer (`src/data/views.ts`) wraps this: `readViewCounts(postIds,
groups)` → `Record<doc_id, {impressions, reach}>`, and `readViewCount(postId,
groups)` → `{impressions, reach}`. The feed sources its posts' metrics from the
same read (the D73 feed query no longer has a `views` join — views come from
`contentViews`).

## Where it renders (all surfaces)

Both metrics are **display-only** — not tappable (a view is not an action the
reader takes). They are shown the way each surface shows its reach metrics:

- **Post surfaces (the Twitter idiom)** — the engagement row (`PostActions`)
  shows a **bar-chart + impressions** and a **person + reach**, muted, after the
  repost tally. Each is hidden when `0`. The feed, Discover board, profile feed,
  groups, and the lightbox all run this row.
- **Video / Shorts (the YouTube/TikTok idiom)** — the **`HomeCard`** video wall
  shows impressions in the metadata line ("N views · time-ago"); the **shorts
  lens** rail shows a bar-chart + impressions and a person + reach beside the
  like/comment tallies; the **watch / lightbox** stats row leads with them
  ("N views · M people · K likes · L comments").

**A view is NOT a ranking signal.** It does not feed the power-mean scorer
(`scorePost`). It is a reach metric shown to the author and the reader, not a
signal the feed ranks by. (Giving it a ranking weight would be a separate
decision — the same open question the repost signal carries.)

## Security invariants

- **I3 holds** — the `contentViews` read is scoped to the reader's readable
  groups (the `doc_groups` join). A post the reader cannot read returns no
  metrics.
- **No escalation** — a view carries no content from the post (it references it
  by `doc_id` only). Reading a post's metrics never grants access to the post.
- **Un-gameable floor** — the delivery is logged server-side by the read path;
  the client has no lever to fire it. A user in devtools or a spam app cannot
  inflate the on-surface number the way they could a client-written counter.
- **D60-generic** — `content_events` is a node table keyed on the document, with
  no app-specific columns. The app declares the `surface` label; the node stores
  it verbatim. A notes / music / shop app uses the same table the same way.

## What this is not

- **Not a client-written counter.** There is no `recordView` and no `views`
  service. The view is the server-side delivery. (The earlier lightweight
  `views` doc was retired for exactly this reason.)
- **Not a like / reaction.** A view is passive (recorded by the act of serving,
  not a tap) and is not an engagement signal. Liking does not record a view and
  a view does not toggle anything.
- **Not a per-surface breakdown on the surface.** The on-surface shows the
  lifetime totals (impressions + reach). The per-surface / time-series / dwell
  breakdown is the **creator dashboard** (`analytics/overview.md`) — the same
  table, the sophisticated face.

## Reference

- The view data layer (`readViewCounts`, `readViewCount`):
  `../../../../marketing/web10-social/src/data/views.ts`
- The feed's view read (the D73 feed query no longer joins `views`):
  `../../../../marketing/web10-social/src/data/feed.ts`
- The shared engagement row (the bar-chart + person icons): `./post-actions.md`
- The video wall / shorts / watch surfaces: `./shorts.md`, `./watch-page.md`
- The D86 analytics engine (the on-surface metrics' source + the dashboard):
  `../analytics/overview.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
