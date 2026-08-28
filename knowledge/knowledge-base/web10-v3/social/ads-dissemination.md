# Ad Dissemination: Where the Curation Lives

> **Design under discussion** (27.08.2026). This doc captures a reframe of how a
> post's ad gets chosen, and the tension it creates. It is **not** a locked
> decision — it is the KB-side starting point for the discussion. The open
> `curateAds` PR (the client-side SDK helper, 3.26.0) is **Option A** below. Read `ads.md` (the ad object, D55) and `ads-catalog.md` (the catalog +
> composer) first.

## The Reframe

The ad is not a client-side computation. It is a **property of the post read**.
When you read posts, each opted-in post comes back *with* its ad — curated from
the post's author's ad catalog, per the author's ad preference. The curation is
**on the data** (the read), not in the app.

Why this matters: it makes the ad a **platform capability**. Any dev — web10
social, or any app that reads `posts` — gets the ads for free, with no per-app
curation logic. That is "100% delivery by architecture" applied to the ad: the
read delivers the post *and* its ad, the way it delivers every other post.

The model, end to end:

- **Per creator:** an ad catalog (their `posts` tagged `ad`) + an ad preference
  (the D51 dissemination setting: `round_robin` / `greedy` / `pinned` /
  `frequency_capped`).
- **Per post:** an opt-in — does this post carry an ad, and under which mode?
- **The read:** for each post that opted in, attach the curated ad from the
  author's catalog. The post comes back *with* its ad.

## What the KB Says Today (and why)

The current design splits the carrying two ways:

- **Explicit:** the post's `ref_value` = the ad's `doc_id` (write-time). This
  *is* on the data — the post carries a specific ad.
- **Round-robin:** the post has no `ref`; the **client** picks which ad to show
  via the `curateAds` SDK helper, with app-local state (last-shown, session
  counts). This is *not* on the data — it is computed at render time.

`ads.md` (Dissemination) explicitly says the curation is "a shared,
deterministic SDK helper, not SQL" and "not server logic." The reasoning: the
stateful algorithms (round-robin needs "which ad showed last," greedy needs the
performance numbers) "do not belong in a query."

That reasoning is sound **for the stateful modes**. It is the source of the
tension below.

## The Strong Argument for the Reframe: the Read Already Projects

The KB's doctrine is "the API is just a scanner, the app owns the schema." But
the read was never a *pure* scanner — it already does read-time projections:

- **media-URL resolution** — a `minio` leaf becomes a fresh presigned URL on
  read (`resolve_minio_types`).
- **HLS manifest minting** — a transcoded video gets a signed `manifest_url`
  bound to the reader on read.
- **power-mean ranking** — when `sort` is requested, the read joins exact
  engagement counts and scores in SQL (3.18.2 / 3.21.1).

So "the read computes a projection of the data at read time" is already the
house pattern. **Attaching the curated ad to an opted-in post is the same
category** — a read-time projection, not a violation of the scanner doctrine.
This is the strongest case for the reframe, and it undercuts the main "against"
in Option B.

## The Wall: Stateful Curation vs. a Stateless Query

A ClickHouse query is stateless — it computes a function of the current data. It
has no memory of "what was shown last" or "how many times this session." So the
curation modes split cleanly:

| mode | state needed? | data-layer-able? |
|---|---|---|
| `pinned` | none — the pinned ad is a field on the settings doc | **yes** |
| `round_robin` | "which ad showed last" (per viewer) | **no** — unless redefined as a deterministic rotation |
| `frequency_capped` | per-session show counts | **no** |
| `greedy` | performance numbers (v0 has none — D55) | **no** in v0 |

"More ClickHouse-y" works cleanly for `pinned` and a *deterministic*
`round_robin`, but the stateful modes hit the wall. It is the same wall D55 hit
with the `stats` counters: a per-view, per-session fact is a write on a read
path, and the node does not want that.

## The Options

**A. Client-side curation (the current KB + the `curateAds` helper).**
The app reads the posts, reads the author's catalog + settings, calls
`curateAds`, attaches the ad.
- *For:* no server logic, no stateful ClickHouse, the API stays closest to a
  scanner.
- *Against:* not "on the data" — the ad is computed, not delivered. Every app
  replicates the logic. It is the opposite of "free for all apps."

**B. Data-layer curation (the reframe).**
The read returns posts *with* their ads, curated in ClickHouse.
- *For:* on the data, delivered by the architecture, free for all apps. The
  read already projects (media URLs, ranking) — this is the same category.
- *Against:* the stateful modes don't fit a stateless query (the wall). The
  query is more complex (join to the author's catalog + settings).

**C. Hybrid.**
The data layer does the *deterministic* curation (`pinned`, a deterministic
`round_robin`) — the ad comes with the post. The stateful modes
(`frequency_capped`, true per-viewer `round_robin`) either degrade to the
deterministic version or stay client-side.
- *For:* the common case (pinned, rotation) is on the data and free for all
  apps; the exotic stateful modes don't force a write-on-read.
- *Against:* two mechanisms. The line between "deterministic" and "stateful"
  has to be drawn and kept honest.

## My Honest Take (for the discussion, not a decision)

The reframe is right in spirit: the ad should be **delivered by the
architecture, not computed by the app.** Option A is the weakest — it makes the
ad an app responsibility, which is exactly what the thesis says no to. And the
"read already projects" precedent (media URLs, ranking) means data-layer
curation is not a doctrine break.

The wall is real, but it is a wall around the *stateful* modes, not around
curation in general. The clean resolution is to make the curation a
**deterministic function of the data** (no state) — which is precisely what
makes it data-layer-able:

- `pinned` — already deterministic (a field on the settings doc).
- `round_robin` — **redefined** as a deterministic rotation, not "which ad
  showed last." E.g. the ad at position `floor(now / interval) % count` in the
  author's catalog (a time-bucket rotation — stateless, changes over time so
  each ad gets exposure), or hashed with the viewer for per-viewer rotation.
- `frequency_capped` — genuinely stateful; defer to v4 (or approximate with a
  time-bucket).
- `greedy` — needs performance data; v4 (degrades to the rotation in v0, as the
  current helper already does).

That lands on **Option C leaning B**: the read attaches the deterministic ad
(pinned / rotation) to opted-in posts, on the data, free for all apps; the
stateful modes are v4. The cost is that "round-robin" stops meaning "per-viewer
sequential" and starts meaning "deterministic rotation" — a real semantic change
to D51 that needs sign-off before it is locked.

## Open Questions

1. **The state fork** — is the curation a *deterministic function of the data*
   (no state → data-layer), or does it need *state* (last-shown / session
   counts → client-side, or a write-on-read the node rejects)? This is the whole
   ballgame.
2. **The opt-in location** — per-post field (the post says "I carry an ad, mode
   X") or per-creator (the settings doc says "all my posts carry ads")? The
   reframe reads per-post.
3. **The round-robin semantics** — if deterministic: a time-bucket rotation
   (same ad for everyone in a bucket) or a per-viewer hash (each viewer sees a
   different rotation)?
4. **The read's shape** — does the read return the ad *inline* on the post (a
   resolved ad object), or as a *ref* the app resolves? Inline is "free for all
   apps"; a ref keeps the read leaner.
5. **What happens to `curateAds`** — does it die (Option B/C), stay for the
   stateful modes (hybrid), or become the reference implementation the data
   layer mirrors?
