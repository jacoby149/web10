# telemetry.md — why web10 watches how you use it (and what it never sees)

The Why layer: the reason web10 runs aggressive, platform-wide usage
telemetry (GA4 + Hotjar, content masked) — and the line it does not
cross. Read this before adding, removing, or "tightening" any tracking.
The decision record is D56 (`knowledge/strategy/decisions.md`).

## the abstract use case

A fan leaves TikTok because the algorithm buried their creator. They
land on a web10 node expecting the person they followed — and a product
that feels as alive as the one they left. "Alive" is not an accident.
TikTok's feed feels alive because a thousand engineers spent a decade
watching how people use it: where they tap, where they stall, where
they rage-quit at eleven on a Tuesday. The feeling is the *output* of
the telemetry.

web10 competes with Meta and TikTok for the same attention. A node that
cannot see its own usage is a blog from 2003 — the operator flies blind,
the UX rots quietly, and the fan who came for 100% delivery leaves
because the product feels *dead* next to the app they grew up on. So
web10 tracks hard. Deliberately. Platform-wide. It is how you build the
most competitive user experience in the business: you watch, you learn,
you fix, you repeat, faster than the incumbent can turn around.

## the specific use case

The operator of a 500k-follower node wants to know: which screen do new
fans bounce from? Where does the export flow stall? Why do people open
messages and leave without sending? The database cannot answer these —
the database says *what* happened (a post was made), not *how it felt*
(three taps, a four-second stall, a scroll back, a close). That is what
session recordings and heatmaps are for.

At the same time, the fan's content — their posts, their DMs, their
photos — is the one thing this platform exists to keep out of the ad
machine. So the telemetry watches the *hands*, never the *words*: every
recording masks all text and blocks all images. The operator sees a
cursor moving over a blurred page, not the page itself. It is the
difference between watching someone drive a car and reading their
diary.

## the technical how

Two tools, on every user-facing surface (marketing-ui, web10-social,
the authenticator `ui/`):

- **GA4 (gtag.js)** — pageviews + structural events (login, logout,
  post_created, follow, unfollow). Events are content-free by
  convention: paths, actions, counts, visibility — never post text,
  media URLs, or PII. Loaded from `VITE_GA4_MEASUREMENT_ID`; a no-op
  when unset (local dev).
- **Hotjar** — session recordings + heatmaps. Initialised with
  `maskAllText: true` + `blockAllImages: true`: all text blurred, all
  images blocked. A recording is layout + cursor + timing, nothing
  else. Loaded from `VITE_HOTJAR_SITE_ID`; a no-op when unset.

Both IDs are baked at build time (Vite env → Dockerfile ARG → compose,
per environment). The per-app module lives in each app's
`src/lib/analytics.ts`. marketing-ui additionally keeps its own
in-house pageview/funnel/error beacon to the marketing-api on top —
the three are complementary, not redundant (the beacon is
first-party, the other two are the industry-standard instruments).

**The one GA4 flag we keep:** `advertising_id: 'OFF'`. We track hard,
but we do not feed the ad machine — the only sponsors a fan ever sees
are the ones the creator chose (D50/D55). Google's ad network is not
one of them. Everything else runs at full strength; there is no IP
anonymization, because the trade is stated, not hidden (below).

## the line it does not cross

- **Content is never tracked.** Post bodies, DMs, media, profile data:
  not in GA4 events (the content-free convention), not in Hotjar
  recordings (text masked, images blocked). If a change would put
  content into telemetry, it is a thesis violation, not a config
  tweak.
- **Not sold, not scanned for ads.** The manifesto's "nobody is mining
  you" stands: telemetry is first-party product analytics (web10's own
  GA4/Hotjar properties) used to build the product — not a data feed
  to advertisers.
- **The trade is stated, not hidden.** This is a data-policy platform
  (D41): the terms say we watch how you use the place so we can keep
  it the best version of itself. If that is not for you, this is the
  wrong platform for you — and that sentence belongs in the terms,
  verbatim or close to it.

## logistics

- **Built (3.26.0):** GA4 + masked Hotjar on all three surfaces,
  env-gated, no-op in dev.
- **Enable per environment:** set `GA4_MEASUREMENT_ID` +
  `HOTJAR_SITE_ID` in the deployment env — compose passes them to the
  three frontend builds as `VITE_GA4_MEASUREMENT_ID` /
  `VITE_HOTJAR_SITE_ID`.
- **Deferred:** per-creator audience analytics in the Studio
  (the influencer-facing numbers — that is the `ads`/metrics lanes'
  job, not this one).
