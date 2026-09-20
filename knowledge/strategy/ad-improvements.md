# Ad improvements — work order (operator pass, 20.09.2026)

**Status: OPEN.** The operator ran the monetization surfaces + the feed/discover
and filed five ad problems. This is the work order: each problem verbatim, the
verified root cause (with file:line), the fix, and the acceptance bar. All five
live in the `ads (monetization)` lane (`parallel-execution.md`) and are
web10-social surface work (plus one node-side one-liner for #5). None change the
ad *model* (D55/D57/D75) — they make the already-built model actually usable.

> The ad model is sound: an ad is a `posts` doc tagged `ad` (creator) or
> `ad`+`node_ad` (node), with a leaf-typed `offer` + `status`; the read serves a
> pinned ad inline (`doc.ad`) and attaches active node ads at the configured
> percentage (`doc.node_ad`). What's missing is **editability, flexibility, a
> second ad format (post ads), and two render/data gaps** — not a new protocol.

---

## The two ad formats (inline vs post) — the model for Issues 3, 4, 6

**Operator (verbatim):** "we need inline ad, and post ads, (will explain!) inline
ad is the current ads, can have a square thumbnail image, pretty restricted, a
post ad shows up like another post under the post, not showing attached to the
post, looks alot like a post! has likes even potentially, like full blast it is
a different kind of add, that can have everything a post has. node ads and the
account based ads should have both of those options. because otherwise ads are
really really restricted, on other social platforms what looks like a whole post
is an add, but there are also those inline ads just like we have."

An ad is still a `posts` doc tagged `ad` (creator) / `ad`+`node_ad` (node). It
gains a **format** — two ways to run the same ad object:

- **`inline`** (default, the current `AdBlock`): referenced by a post's
  `ad_preference`, rendered as the **restricted block under that post** — a
  square thumbnail + offer CTA + disclosure. It is **not** a standalone feed
  post; it rides on the post it's pinned to.
- **`post`** (new): the **same attachment** as inline (referenced by a post's
  `ad_preference`, or attached by the node at read time), but **rendered as a
  full post** — everything a post has (media, likes, comments, author) — with
  **ad dressing** (the "Ad"/"Sponsored" badge + the offer CTA + the disclosure).
  It sits **under the post it's attached to**, looking like its own post (not an
  AdBlock). This is the Meta/Instagram "sponsored post" model: a full post that's
  an ad, labelled as one, that you can like/comment on.

**The format is purely rendering — the attachment is the same (the "clever
joins").** Both formats are **attached to a post at read time**: a creator ad via
the post's `ad_preference` (the `attach_pinned_ads` join — 100% of the time with
that post), a node ad via `attach_node_ads` (the percentage join — on ~N% of
posts). The ad is **guaranteed to show with the post it's attached to** — it is
**not** a standalone feed post, so it is **not** subject to the feed's ranking /
trending / popularity. **An ad doesn't need to be popular to show; it's
attached.** The only difference between `inline` and `post` is how the attached
ad **renders** (the compact AdBlock vs a full post).

**Where a post ad shows** is wherever the post it's attached to shows: attached
to a public post (discover group) → **discover**; attached to a post in the
followers group → the **feed**; attached to a post in both → both. The ad maker
makes a post, adds an ad to that post (inline or post format) — the ad rides that
post. (This is why it's not "just another post": a standalone post would be
ranked/trended and might not show; an attached ad always shows with its post.)

**Why it's mostly rendering + surfacing, not a new protocol.** An ad is already
a `posts` doc, so it already has everything a post has (media, likes, comments).
The changes are:

1. **Data** — the ad's body gains `format: 'inline' | 'post'` (default
   `inline`, backwards-compatible — every existing ad stays inline). The node
   doesn't read it (D75 — the format is an app-owned rendering shape, like the
   `offer`).
2. **Surfacing (fixes a current leak)** — today the feed/discover read returns
   **all** `posts` docs in the groups, including `ad`-tagged docs, so ad docs
   currently surface as **plain posts** (no ad dressing, and — worse — subject to
   ranking/trending). Verified: the feed query (`feed.ts:319-337`, `FROM posts p`,
   no tag filter) and the discover read (`feed.ts:33`) both return `ad`-tagged
   docs; `getFeedGroups` (`groups.ts:628`) is the reader's `/followers` groups,
   which is exactly where a creator's ad docs live. The fix: the feed/discover
   read **hides `ad`-tagged docs as standalone posts** — **both formats** (they're
   ad inventory, shown only when **attached** to a post via the join, never as
   ranked feed posts). The ad appears only as `doc.ad` / `doc.node_ad` (attached),
   rendered per its format. This is the "sucked in by the join" behavior — the ad
   is never a free-floating post.
3. **Rendering** — the feed (`PostCard`) + discover (`DiscoverCard`) render the
   **attached** ad (`doc.ad` / `doc.node_ad`) per its `format`: `inline` → the
   compact `AdBlock` (today); `post` → a **full post card** + ad dressing (badge +
   offer CTA + disclosure), reusing the `AdBlock`'s offer/disclosure rendering.
   Likes / comments work for free (it's a `posts` doc). The post-format ad renders
   **under the post it's attached to**, looking like its own post.
4. **Maker** — the ad form (Issue 1's `AdForm`) + the node ad form gain a
   **format toggle** (Inline / Post). A post-format ad gets the full post
   treatment (media via Issue 4, etc.). Pinning is the same for both formats
   (`ad_preference` → the ad doc); only the rendering differs.
5. **Node post ads** — a node ad with `format: 'post'` is attached to posts by
   `attach_node_ads` (the **same** percentage join as inline node ads — no new
   mechanism), but rendered as a **full post** instead of an `AdBlock`. So a node
   post ad shows on ~N% of posts (wherever those posts are — feed + discover), as
   a dressed post under them. (The Issue 5a fix — `get_active_node_ads` using the
   canonical `DISCOVER_GROUP_ID` — is what makes this query find the node ads.)

**Where each format surfaces** (both formats ride the post they're attached to —
the ad maker chooses the format, and the post's groups choose the surface):

| Format    | Creator ad                                                        | Node ad                                                              |
|-----------|-------------------------------------------------------------------|----------------------------------------------------------------------|
| `inline`  | the `AdBlock` under the pinned post (wherever that post shows — feed + discover + lightbox) | the `AdBlock` under ~N% of posts (feed + discover) at the density |
| `post`    | a **full post** under the pinned post (wherever that post shows — feed + discover) | a **full post** under ~N% of posts (feed + discover) at the density |

This is the answer to "ads are really restricted": the **post** format is
"full blast" (everything a post has), the **inline** format stays the compact
restricted block. Both node and creator ads offer both.

### Node ads behave exactly like creator ads — plus two node-level knobs

**Operator (verbatim):** "node ads and post ads should work the same exact way!
in the node configurator, the node ads can say how often to override the ad,
None -> ad, or if there is an ad override, so node ad percentage, and write over
creator ad? yes no?"

A **node ad is a creator ad with a different provenance** — the same object
(`posts` doc tagged `ad`+`node_ad`), the same two formats (inline / post), the
same surfaces (feed + discover). The only differences:

- **Provenance / dressing** — the "Sponsored" badge + the node-site disclosure
  (vs the creator's "Ad" badge + their `@handle`). The renderer already dresses
  by the ad's `variant` (`creator` / `node`, derived from the `node_ad` tag), so
  a node ad renders as a node ad in either slot.
- **Two node-level knobs** (in the **node configurator**, not per-ad):
  1. **Node ad percentage** (existing, `node_ad_percentage`) — how often node
     ads show (0–100%). 0 = off.
  2. **Overwrite the creator's ad?** (NEW, `node_ad_overwrite`, default **no**)
     — when a node ad and a creator's ad would both appear on the **same post**,
     does the node ad **replace** the creator's ad?
     - **No** (default — the current D57 non-steal principle): both show; the
       creator's monetization is never suppressed.
     - **Yes**: the node ad replaces the creator's ad on that post (only the
       node ad shows).

**Where the overwrite applies.** It's about the **same post** carrying both a
creator ad and a node ad (each in its slot: `doc.ad` / `doc.node_ad`). It's
**format-agnostic** — it doesn't matter if the ads are inline or post format;
when the node ad overwrites, the node ad (in *its* format) replaces the creator
ad (in *its* format). A node post ad can overwrite a creator inline ad, and vice
versa.

**The same-post question** (operator: *"can you add an inline ad and a post ad
to the same post or one or the other?"*): a post pins **one creator ad** (its
`ad_preference` points to a single ad), so for the creator it's **one or the
other** — that ad is either inline or post format, not both. The **node's** ad is
a separate slot (attached by `attach_node_ads`), also inline or post. So a post
can show a creator ad (inline or post) **+** a node ad (inline or post), with the
**overwrite** knob deciding if the node's replaces the creator's. An ad itself is
one format (inline **or** post), not both.

**The build (node side + configurator):**

- New node-config field `node_ad_overwrite` (bool, default `false`) —
  `api/app/models/config.py` (`NodeConfig` + `ConfigUpdate`) + the
  `effective_config()` default.
- `attach_node_ads` (`clickhouse.py`) reads it: when a node ad fires on a doc
  that already has a creator `ad` **and** `node_ad_overwrite` is true, drop
  `doc['ad']` (set it empty) before attaching `doc['node_ad']` — so only the
  node ad renders. When false (default), both attach (unchanged). This runs
  after `attach_pinned_ads` in both the read path (`documents.py`) and the query
  prepare path (`query.py`), so feed + discover + lightbox all honor it. No
  renderer change (the renderer shows `doc.ad` / `doc.node_ad` as today; the
  node just drops the creator ad when overwriting).
- **Node configurator UI** — the overwrite toggle (yes/no) in the node
  configurator (`ui/src/components/Config/ConfigPage.tsx`) alongside
  `node_ad_percentage`, and in the NodeMonetization surface
  (`NodeMonetization.tsx`) next to the density slider (a `saveNodeAdOverwrite`
  alongside `saveNodeAdPercentage`).

### Acceptance bar (node overwrite)

With a creator's ad pinned to a post + an active node ad + percentage 100, for
**each** format combination: **overwrite no** → the post shows BOTH the creator's
ad and the node's ad (each rendered per its format — e.g. a creator full-post ad
+ a node AdBlock); **overwrite yes** → the post shows ONLY the node's ad (the
creator's is dropped). The overwrite is format-agnostic (node post ad overwrites
a creator inline ad, and vice versa).

---

## Issue 1 — no way to edit an ad

**Surface:** web10-social, `/monetize` (Creator tab → "Your Ads")
**Operator (verbatim):** "I dont see a way to edit ads."

### Root cause (verified)

`CreatorMonetization.tsx` renders each catalog row via `AdRow`
(`:389-442`), which offers only **Pin / Pause / Resume / Retire** — no Edit.
`NewAdForm` (`:525-648`) is create-only: it always calls `createAd`
(`:91-95`, a `w.create`), and there is no code path that calls `w.update` on an
existing ad's body. The data layer already supports it — `buildOfferBody`
(`ads-catalog.ts:123`) is a pure body builder and `w.update(doc_id, body)` is a
normal CRUD op — the UI just never wires it.

### Fix

- Generalize `NewAdForm` into an **`AdForm`** that takes an optional
  `initial?: AdItem`. In edit mode it pre-fills `text`, `offer.{kind,partner,
  link,cta,disclosure}`, `status`, and the selected album chips from
  `parseAd(ad.doc)`.
- Add an **Edit** button (pencil) to `AdRow` → opens `AdForm` in edit mode for
  that ad.
- On save, edit mode calls a new `updateAd(ad, offer, text, status, albumIds)`
  in `ads-catalog.ts` → `w.update(ad.doc.doc_id, buildOfferBody(offer, text,
  status, albumIds))`. **Same `doc_id`** (an update is a new version), so any
  post that has this ad pinned keeps pointing at it — the pin survives the edit
  and the new creative/offer shows immediately on the pinned post.
- Keep Retire (delete) as the only destructive op; Edit never deletes.

### Acceptance bar

Create an ad → pin it to a post → Edit the ad (change copy + CTA + link) →
Save → the catalog row shows the new values **and** the pinned post now renders
the updated ad block. No new ad doc is created (doc_id unchanged).

---

## Issue 2 — can't change the pinned ad from "Edit post"

**Surface:** web10-social, feed card kebab → "Edit post" + the post lightbox
"Edit post"
**Operator (verbatim):** "on posts in my feed when i hit edit post, it doesnt
let me pin a different ad over there."

### Root cause (verified)

Both edit flows are **text-only**:

- `FeedScreen.tsx` — `handleSaveEdit` (`:390-393`) calls
  `updatePost(post._id, { text: editDraft, updated_at })`; the edit UI
  (`:569-586`) is just a `<Textarea>` + Save/Cancel.
- `PostLightbox.tsx` — same shape (`:241-244`, UI `:379-408`).

And `updatePost` (`posts.ts:187-199`) builds a body from text/media/visibility/
tags/location/mentions and calls `w.update(docId, body)` — it **never forwards
`ad_preference`**, so even if the UI had a control there's no path to change the
pin. The SDK already supports it (`sdk/src/v3.ts:740,744` — `w.update(id, body,
{ ad_preference })`), and the create path already uses it (`PostComposer`
`handleSubmit` `:659`). The pin control simply was never added to the *edit*
path.

### Fix

- `updatePost` (`posts.ts`) gains an optional `ad_preference?: V3AdPreference`
  param, forwarded to `w.update(docId, body, { ad_preference })` when present.
- In **both** edit flows (feed `PostCard` + `PostLightbox`), add a **"Pin an ad"**
  control next to Save/Cancel that reuses the existing `AdPicker`
  (`Feed/AdPicker.tsx`), pre-selecting the currently-pinned ad (from
  `post.ad_target` — see the small data change below) and lazy-loading the
  creator's ads via `readMyAds()` (the same `PostComposer` pattern). Selecting an
  ad sets local `pinnedAd` state; "No ad" clears it.
- On Save, pass `ad_preference: pinnedAd ? { mode:'pinned', target: pinnedAd._id }
  : { mode:'none' }` to `updatePost`, then re-read the post so the `AdBlock`
  updates in place.
- **Small data change:** `PostRecord` doesn't currently expose `ad_target`
  (only the resolved `ad`). Add `ad_target?: string` to `PostRecord` and map it
  in `fromV3DocToPost` (`types.ts:79`) from `doc.ad_target`, so the picker can
  pre-select the current pin even when the ad body isn't resolved for the reader.
- Node ads (`node_ad`) are **out of scope** here — they're the operator's
  inventory, attached at read time, not something a creator pins from their post.

### Acceptance bar

Open a post's Edit → tap "Pin an ad" → pick a different ad (or "No ad") → Save →
the post shows the new ad block (or none) immediately and after a refresh. A post
that had no ad can get one; a post with an ad can swap or clear it.

---

## Issue 3 — the ad form is too rigid (the "Get it" CTA)

**Surface:** web10-social, `/monetize` → New Ad (and, after Issue 1, Edit Ad)
**Operator (verbatim):** "this isnt very flexible kind of doesnt make sense, (get
it) might not be relevant to everything being advertised if it is a service, or
trying to generate buzz with an ad like check it out could be more relevant, no
control there."

### Root cause (verified)

Two rigidities in the form + renderer:

1. **The CTA fallback is hardcoded to "Get it."** `NewAdForm` has a CTA field
   (`CreatorMonetization.tsx:594`, placeholder `"Get it"`), but if the creator
   leaves it blank, `AdBlock.tsx:139` renders
   `{offer.cta || (isNode ? 'Learn more' : 'Get it')}` — so a blank CTA on a
   creator ad always shows "Get it," which is wrong for a service, a buzz post,
   a "check it out," etc.
2. **The offer shape is affiliate-shaped.** `kind` is a fixed
   `affiliate | direct | own_store` select and `partner` is a required-looking
   field. For "promote my own website / my service / generate buzz," `partner`
   is meaningless (the operator literally typed "Me") and `kind` doesn't capture
   "self-promo / buzz."

### Fix

- **CTA:** add quick-pick **suggestion chips** above the CTA input
  (`Check it out`, `Learn more`, `Shop now`, `Sign up`, `Book now`, `Get it`)
  that fill the field on tap; the field stays free-text. Change the **blank
  fallback** in `AdBlock.tsx:139` from `'Get it'` to a neutral **`'Learn more'`**
  (fits a service, a buzz post, and a product alike). Node ads already fall back
  to `'Learn more'`.
- **Kind:** make it genuinely optional — add a **`none`** option (the default for
  "just promoting myself"), and **hide the `partner` field when `kind` is
  `none`** (partner only makes sense for `affiliate`/`direct`). Soften the
  partner placeholder to "e.g. Amazon (optional)."
- These are form-only changes; the `offer` object shape and the `AdBlock`
  renderer are unchanged except the CTA fallback, so nothing downstream breaks.

### Acceptance bar

Create an ad with `kind = none`, no partner, CTA "Check it out" → it renders with
a "Check it out" button and no partner line. Leave the CTA blank → the button
reads "Learn more," not "Get it."

---

## Issue 4 — no way to add images/video to an ad

**Surface:** web10-social, `/monetize` → New Ad (and Edit Ad)
**Operator (verbatim):** "no way to add images or video or flexible stuff to an
ad. people need to be able to get creative with ads."

The two formats (above) split this: a **post ad** gets the full post media
treatment (image/video, everything); an **inline ad** stays restricted to a
**square thumbnail**. Both need the form to actually attach media — today it
can't.

### Root cause (verified)

The ad object **already supports media end to end** — the only missing piece is
the form:

- `AdRecord.media_refs` exists (`types.ts:164`); `parseAd` is the only place
  that drops it (it maps `text`/`offer`/`status`/`albums` but **not**
  `media_refs` — `ads-catalog.ts:61-78`).
- `AdBlock` **already renders** the ad's media: `AdMedia` (`AdBlock.tsx:162-239`)
  handles both image and video (play/pause, poster, aspect-ratio), and the block
  resolves `ad.media_refs` on mount (`:69-83`).
- `buildOfferBody` (`ads-catalog.ts:123`) does **not** write `media_refs`, and
  `NewAdForm` has **no attach control** — so a creator can never *make* an ad
  with media, even though the renderer could show it.

### Fix

- `buildOfferBody(offer, text, status, albumIds, mediaRefs?, format?)` — when
  `mediaRefs` is non-empty, include `media_refs`; write `format` (`inline` |
  `post`) into the body.
- `parseAd` — map `media_refs` **and** `format` from the body (so Edit mode can
  show the existing creative + format and re-save them unchanged).
- `AdForm` — add a **media attach control** + the **format toggle** (Inline /
  Post). Reuse the composer's pipeline: `processImage` / `getVideoInfo` /
  `captureVideoPoster` / `uploadMedia` (service `public_media`), with a preview +
  remove. Upload on submit (the `PostComposer` idiom: preview locally, upload at
  save).
- **Rendering per format:**
  - **Post ad** — the feed/discover render it as a full post card (the existing
    `PostCard` / `DiscoverCard` media treatment — image/video, carousel, HLS) +
    the ad dressing. Full blast.
  - **Inline ad** — `AdBlock`'s `AdMedia` renders the creative as a **square
    thumbnail** (capped, `object-cover`) instead of the current natural-ratio
    `object-contain` — the "pretty restricted" compact block.
- **v1 scope:** one media item per ad, no trim/crop editor (the
  `VideoEditorSheet` is a follow-up — see Open items). A video ad is uploaded
  as-is; the node's ffmpeg transcodes it to HLS, and both renderers already play
  transcoded video.

### Acceptance bar

Create a **post ad** with a video → it appears in the creator's followers' feed
as a full post (playable video + likes + comments) with the "Ad" badge + offer +
disclosure. Create an **inline ad** with an image → pin it to a post → the
`AdBlock` shows a square thumbnail + offer + disclosure. Editing either to swap
the media updates the surface.

---

## Issue 5 — node ads show up nowhere (should be on ~10% of posts)

**Surface:** web10-social, feed **and** discover (and the operator's expectation
that ~10% of posts carry a "Sponsored" node ad)
**Operator (verbatim):** "I am not seeing node ads on any posts, should be on
10% of posts, for some reason they are not making it to discover, feed, anywhere
at all."

This is **two independent bugs** — one node-side (ads never get attached) and one
client-side (discover can't render them even when attached).

### 5a. Node side — `get_active_node_ads` looks in the wrong group (primary suspect)

**Root cause (verified in code).** `get_active_node_ads`
(`api/app/v3/services/clickhouse.py:2532`) derives the discover group id from the
**user-editable node_config `provider`**:

```python
discover_group = f"{cfg.get_config_field('provider', 'api.localhost')}/groups/web10/discover"
```

But the discover group is created and addressed everywhere else from the
**canonical** `DISCOVER_GROUP_ID` (`clickhouse.py:535`), which is
`f"{settings.PROVIDER}/groups/web10/discover"` — the node's identity (the
`PROVIDER` env var, e.g. `api.web10.app` in prod). The client builds the same id
from the token's `provider` claim, which token validation
(`auth.py:94`) *requires* to equal `settings.PROVIDER`. So the discover group a
reader actually reads is always `DISCOVER_GROUP_ID`.

`get_config_field('provider', …)` returns the **setup-wizard's** `provider`
(entered independently of the `PROVIDER` env var) — or, if the saved config has
no `provider`, the literal fallback `'api.localhost'`. On any node where that
differs from `settings.PROVIDER` (every deployed node, since prod runs
`PROVIDER=api.web10.app`), the `doc_id IN (… WHERE pg.group_id = %(discover)s)`
subquery matches **nothing** → `get_active_node_ads()` returns `[]` →
`attach_node_ads` attaches **nothing** → node ads are absent from the feed,
discover, and every other read. That is exactly the reported symptom.

This is the **same failure class as 3.78.1** ("the e2e masked it"): the e2e node
runs `PROVIDER=api.localhost` and its setup saves the same, so the two agree in
e2e and `node-ads.spec.ts` passes — but on a real node they diverge.

**Fix (one line):** in `get_active_node_ads`, use the module constant
`DISCOVER_GROUP_ID` instead of reconstructing the id from
`cfg.get_config_field('provider', …)`:

```python
result = client.query(
    "… WHERE pg.group_id = %(discover)s …",
    {"discover": DISCOVER_GROUP_ID},
)
```

and drop the now-unused `from app.services import config as cfg` import in that
function. `DISCOVER_GROUP_ID` is the single source of truth for the discover
group id (it's what creates the group and what every other read uses), so this
can't drift again.

**Also verify on the live node (not a code change, but the other ways this
symptom appears):** (1) that at least one **active** node ad exists on the
discover group (the operator created one via Node Monetization, and it's not
paused); (2) that `node_ad_percentage` is actually 10 in the saved node_config
(the e2e suite resets it to 0 in `afterAll` — if e2e ever ran against this node
it would be off); (3) with a small number of posts, 10% can round to zero by the
deterministic `(doc_id, reader)` hash — bump to 100 temporarily to confirm the
attach path, then set back to 10.

### 5b. Client side — the Discover card can't render ads at all

**Root cause (verified in code).** The node *does* attach `ad`/`node_ad` to
discover reads (`documents.py:278-280`), and `readDiscoverFeed` →
`fromV3DocToPost` carries them onto the `PostRecord` (`types.ts:104-108`). But:

- `DiscoverScreen` maps the record to the shared card via
  `postRecordToDiscoverPost` (`DiscoverScreen.tsx:237-253`), which **drops**
  `ad`/`node_ad` — the shared `DiscoverPost` type
  (`marketing/shared/discover/src/types.ts:144-160`) has no ad fields.
- The shared `DiscoverCard`
  (`marketing/shared/discover/src/DiscoverCard.tsx`) has **no ad slot** — it
  renders header/author/media/tags/`PostActions` and stops.

So even with 5a fixed, a node ad (or a pinned creator ad) attached to a discover
post is silently dropped by the UI. The feed renders both (`FeedScreen.tsx:638-641`);
discover renders neither.

**Fix:**

- Shared `DiscoverPost` gains `ad?: DiscoverAd; node_ad?: DiscoverAd` (a minimal
  `DiscoverAd` shape in the shared `types.ts`, structurally compatible with the
  app's `AdRecord`).
- `DiscoverCardProps` gains an optional **`renderAd?: (ad: DiscoverAd) =>
  ReactNode`** seam (the package stays presentational — same injection pattern as
  `createComment`/`readComments`); when present, the card renders the ad slot
  between the media and the engagement bar, showing `ad` and/or `node_ad`
  (both can be present — neither suppresses the other, the D57 rule).
- `DiscoverScreen` maps `post.ad`/`post.node_ad` through and passes
  `renderAd={(ad) => <AdBlock ad={ad as unknown as AdRecord} />}`.
- **marketing-ui (`/trending`) is unchanged** — it passes no `renderAd`, so the
  anon marketing surface keeps rendering no ads (a separate decision — see Open
  items).

### Acceptance bar

With an active node ad + `node_ad_percentage` 100: a follower's **feed** AND the
**discover** board both render the "Sponsored" node ad block on the matching
posts; a pinned post shows the creator's ad **and** the node ad together. Set the
percentage back to 10 and confirm ~10% of posts carry it (deterministic per
reader).

---

## Issue 6 — post ads: render the attached ad as a full post (the second format)

**Surface:** web10-social, feed + discover + lightbox (a `post`-format ad,
attached to a post, renders as a full post under it)
**Operator (verbatim):** see the two-ad-formats section above.

The model is in the two-ad-formats section. A post ad is **attached to a post**
(the same `ad_preference` / `attach_node_ads` join as inline) and **rendered as a
full post** instead of an `AdBlock`. This is the build: render the attached ad
per its `format`, and stop `ad`-tagged docs leaking into the feed/discover as
ranked standalone posts.

### Root cause (verified)

- The feed query (`feed.ts:319-337`) and the discover read (`feed.ts:33`) return
  **all** `posts` docs in the reader's groups — including `ad`-tagged docs. There
  is no filter, so an ad doc (which lives in the creator's followers group)
  surfaces as a **plain, ranked post** today — exactly the "subject to needing to
  be popular" problem. The ad should be *attached* (via the join), not a free
  post.
- The renderers have no notion of "render this attached ad as a full post":
  `PostCard` (`FeedScreen.tsx`) and the shared `DiscoverCard`
  (`marketing/shared/discover/src/DiscoverCard.tsx`) render the attached ad
  (`post.ad` / `post.node_ad`) **only** via `AdBlock` (the inline block). There's
  no full-post rendering for an attached ad.
- `AdRecord` carries no `format`, so the renderer can't tell inline from post.

### Fix

- **Data** — `AdRecord` gains `format?: 'inline' | 'post'` (mapped from
  `body.format` in `fromV3DocToAd`, default `inline`). `buildOfferBody` /
  `buildNodeAdBody` write it. The ad doc's **groups are unchanged** (a creator ad
  stays in the creator's followers group; a node ad stays on the discover group)
  — the format is a rendering shape, not a group change.
- **Surfacing (read side) — hide `ad`-tagged docs as standalone posts.** In the
  feed (`readFeedPage` / `readFeed`) and discover (`readDiscoverFeed`) mappers (or
  at render time), **drop any post whose `tags ∋ 'ad'`** from the standalone list
  (both formats — they're ad inventory, shown only when **attached** to a post via
  the join, never as ranked feed posts). This fixes the current plain-post leak
  and the "ads get ranked" problem. The ad appears only as `doc.ad` /
  `doc.node_ad` (attached), guaranteed to show with its post.
- **Rendering** — `PostCard` + the shared `DiscoverCard` render the **attached**
  ad (`post.ad` / `post.node_ad`) per its `format`: `inline` → the `AdBlock`
  (today, unchanged); `post` → a **full post card** (media, author, likes,
  comments — all for free, it's a `posts` doc) **+ ad dressing** (the "Ad" /
  "Sponsored" badge — reuse `AdBlock`'s provenance badge — the offer CTA button,
  the disclosure line), rendered **under the post it's attached to**. The shared
  card takes the dressing via a prop/seam (it's presentational — same injection
  pattern as Issue 5b's `renderAd`), so web10-social injects the full-post-ad
  renderer and marketing-ui stays ad-free unless it opts in.
- **Node post ads** — no new mechanism: `attach_node_ads` already attaches node
  ads to ~N% of posts (the percentage join); a node ad with `format: 'post'` is
  just rendered as a full post instead of an `AdBlock`. So a node post ad shows
  on ~N% of posts (wherever those posts are — feed + discover), as a dressed post
  under them.
- **Likes/comments on a post ad** — work for free (it's a `posts` doc in a group
  the reader can read). No extra build; pin a test that a follower can like a
  post ad.

### Acceptance bar

- Create a **creator post ad** with media, pin it to a post → that post shows the
  ad as a **full post** (media + likes + comments) with an "Ad" badge + the offer
  CTA + disclosure, **under** the post. It shows wherever the post shows (feed +
  discover). It is **always** shown with the post (not ranked — a brand-new post
  ad with zero likes still shows). A follower can like it.
- Create a **node post ad** → on ~N% of posts (at the density) it shows as a full
  post with a "Sponsored" badge + offer + disclosure, under those posts (feed +
  discover).
- **Inline ads** keep working as today (the `AdBlock` under the pinned post) and
  **no** `ad`-tagged doc appears as a standalone ranked post in the feed/discover
  (the leak is gone).
- A post ad and a regular post are visually distinguishable (the badge +
  disclosure) but otherwise look like the same product.

---

## Decisions needed (operator)

1. **Issue 3 — default `kind`.** Make `none` (self-promo) the default offer kind,
   with `partner` hidden for it? (Recommended — most creator ads are
   self-promo, not affiliate.)
2. **Issue 4 / 6 — ad media cap.** One media item per ad in v1 (image *or*
   video), no trim/crop editor? (Recommended — clean follow-up.)
3. **Issue 5b / 6 — node ads on marketing `/trending`.** Keep the anon marketing
   surface ad-free for now (recommended), or render node ads (inline + post)
   there too?
 4. **Issue 6 — node post-ad density.** Resolved by the attached model: a node
    post ad rides the **same** `attach_node_ads` percentage join as an inline
    node ad, so it uses the existing `node_ad_percentage` — one fatigue knob for
    all node ads, no separate knob.
5. **Issue 6 — default format.** New ads default to `inline` (backwards
   compatible; the operator opts into `post`)? (Recommended.)
6. **Node overwrite default.** `node_ad_overwrite` defaults to **no** (the
   current D57 non-steal — the creator's monetization is never suppressed unless
   the operator opts in)? (Recommended — the operator explicitly turns on
   overwriting.)

## Bites (suggested order, all in the `ads` lane)

1. **A — data layer:** `PostRecord.ad_target` + `fromV3DocToPost`; `updatePost`
   `ad_preference`; `buildOfferBody`/`parseAd` `media_refs` **+ `format`**;
   `updateAd` helper; the feed/discover **surfacing filter** (drop `ad`-tagged
   docs as standalone ranked posts — both formats; they show only when attached
   via the join). (Unblocks B, C, D, G.)
2. **B — monetization surface:** `AdForm` (create + edit) with the Edit button,
   CTA chips + neutral fallback, optional `kind`/`partner`, the media attach, and
   the **format toggle** (Inline / Post).
3. **C — post edit:** the "Pin an ad" control in the feed + lightbox edit flows,
   save with `ad_preference`, re-read.
4. **D — discover render (inline):** shared `DiscoverPost.ad`/`node_ad` +
   `renderAd` seam + `DiscoverScreen` mapping (the inline AdBlock on discover).
5. **G — post-ad render:** `PostCard` + shared `DiscoverCard` render the
   **attached** ad (`post.ad` / `post.node_ad`) per `format` — `post` → a full
   post card (media/likes/comments) + ad dressing (badge + offer CTA +
   disclosure) under the post; the shared seam; likes-on-a-post-ad test.
6. **E — node ad knobs:** `get_active_node_ads` → `DISCOVER_GROUP_ID` (+ a
   `test_node_ads.py` pin that the query targets the canonical discover id, not a
   config-derived one); the `node_ad_overwrite` config field + the overwrite in
   `attach_node_ads` (+ tests: overwrite yes drops the creator ad, no keeps both);
   the overwrite toggle in the node configurator (`ConfigPage.tsx`) +
   `NodeMonetization.tsx` (a `saveNodeAdOverwrite` alongside the density slider).
7. **F — wrap-up:** KB updates (`ads.md`, `ads-catalog.md`, `monetization.md`,
   `discover-card.md` — the two formats + the post-ad render), screenshots
   (monetize + feed-with-post-ad + discover-with-ads, desktop + 375), CHANGELOG,
   tick the lane.

B can split B1 (edit + CTA/kind flexibility) and B2 (media + format) if it gets
large; E is independent and can land first (it's the one-line node fix that
unblocks the operator's "node ads nowhere" complaint fastest). G depends on A
(the `format` field + surfacing filter) and can land after D.

## Files touched (map)

- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx` — AdForm (edit + CTA chips + kind/partner + media + **format toggle**), Edit button.
- `marketing/web10-social/src/components/Monetization/NodeMonetization.tsx` — (optional) same CTA-chip + **format toggle** for node ads + the **overwrite toggle** (next to the density slider).
- `marketing/web10-social/src/data/ads-catalog.ts` — `buildOfferBody`/`parseAd` media + **format**, `buildNodeAdBody` format, `updateAd`; `saveNodeAdOverwrite` (alongside `saveNodeAdPercentage`).
- `marketing/web10-social/src/data/types.ts` — `PostRecord.ad_target` + `format`, `AdRecord.media_refs` + `format` mapping.
- `marketing/web10-social/src/data/posts.ts` — `updatePost` `ad_preference`.
- `marketing/web10-social/src/data/feed.ts` — the **surfacing filter** (drop `ad`-tagged docs as standalone ranked posts — both formats; they show only when attached) in `readFeedPage`/`readFeed`/`readDiscoverFeed`.
- `marketing/web10-social/src/components/Feed/FeedScreen.tsx` — edit-flow pin control + **post-ad dressing** on `PostCard`.
- `marketing/web10-social/src/components/Bio/PostLightbox.tsx` — edit-flow pin control.
- `marketing/web10-social/src/components/Feed/AdBlock.tsx` — CTA fallback `'Learn more'`; inline media as a **square thumbnail**; the badge/offer/disclosure extracted for reuse by the post-ad dressing.
- `marketing/shared/discover/src/types.ts` — `DiscoverPost.ad`/`node_ad` + `DiscoverAd` + **post-ad dressing props**.
- `marketing/shared/discover/src/DiscoverCard.tsx` — `renderAd` seam (inline) + **post-ad dressing path**.
- `marketing/web10-social/src/components/Discover/DiscoverScreen.tsx` — map + inject `AdBlock` + the post-ad dresser.
- `api/app/v3/services/clickhouse.py` — `get_active_node_ads` → `DISCOVER_GROUP_ID`; `attach_node_ads` reads `node_ad_overwrite` (drops the creator `ad` when overwriting).
- `api/app/models/config.py` — `node_ad_overwrite` field (`NodeConfig` + `ConfigUpdate`) + the `effective_config()` default.
- `ui/src/components/Config/ConfigPage.tsx` — the overwrite toggle in the node configurator (alongside `node_ad_percentage`).
- `api/tests/test_node_ads.py` — pin the canonical discover id + the overwrite yes/no behavior.
