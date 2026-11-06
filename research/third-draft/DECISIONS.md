# Third-draft paper — decisions

The decision log for `research/third-draft/` (the SIGMOD 2027
industry-track manuscript, written fresh from shot 0 + the figure set).
Newest entry first. Operator decisions are marked **(operator)**; agent
defaults the operator has not yet reviewed are marked **(agent — open to
review)**. `research/second-draft/` and `research/first-draft/` are
frozen records — nothing in this file applies to them. The writing
method lives in the `research/ai-paper-theory/` folder; the figure and
experiment KBs remain at `research/second-draft/kb/` (the shared paper
KB).

## 06.11.2026

### The figure pass + the abstract rewrite: padding, the two half-width figures made full, the benefits abstract, the line count out of the body

- **(operator)** "these figures need some bottom padding just a little,
  and figure 5 needs to be the whole horizontal widtth like the other
  figures, otherwise too hard to see" + "i find the abstract just hard to
  read, and the introduction dropping the lines of code written i dont
  like. maybe i think abstract should be shorter and get to the essence,
  summarize the benefits of web10, doesnt have to totally follow shot 0,
  just dont like the abstract so much"
- **(agent)** Bottom padding: the five rasters that ended flush or
  near-flush at the bottom edge (measured @1x: composition 2px ·
  platforms 2px · node-market 12px · query-engine 12px ·
  audience-portability 14px) get their HTML body height extended to a
  uniform 40px bottom gap — the spacing `fig-app-arch` already had.
  Re-rendered with `figs/capture.mjs`, content untouched (the padding is
  background): new rasters 2880x1636 (composition) · 2880x1636
  (platforms) · 2880x1616 (node-market) · 2880x1616 (query-engine) ·
  2880x1492 (audience-portability) @2x. The rasters already at ≥40px
  (app-arch 40 · monetization 60 · k1000-curve 48 · feed 184) are
  unchanged. `kb/diagrams.md` + `figs/README.md` note the intentional
  dimension changes so the next round doesn't "repair" them.
- **(agent)** Full width: in the manuscript numbering, Figure 5 is
  `fig-query-engine` — already a full-width `figure*`. The half-width
  pair is Figure 3 (`fig-feed`) + Figure 6 (`fig-groups`), both
  `\columnwidth` `figure`s — the two "too hard to see" ones. Both are now
  `figure*` + `\textwidth`, as wide as every other figure. Figure
  numbering is unchanged (1–11, same order); the build goes 19 → 20
  pages (the budget is off).
- **(agent)** Abstract: rewritten to the operator's spec — ~150 words
  (was ~190), benefit-first instead of the shot-4 mechanism enumeration:
  the rules are your data (grants are rows in the store they protect) ·
  per-service grants finer than OAuth 2.0 · "a new read pattern is a new
  query, not a new backend" · the audience travels with you (the domain
  the node verifies but cannot control) · the platform takes no cut,
  nodes compete on terms not leverage · the ClickHouse scale anchor with
  the 7.64 s → 363 ms number · the close ("when the data leaves a node,
  the rules leave with it"). Every benefit is asserted in the body it
  points at (§2, §5/§6, §4/§8, §6/§9, §8). This closes the
  shot-4-reconstruction open item: the abstract is no longer a
  reconstruction, it is its own thing.
- **(agent)** The line count is out of the manuscript: §1's "958,824
  lines were added and 568,594 deleted" sentence is cut — the operator's
  "the introduction dropping the lines of code written i dont like", and
  the theory says the same thing (voice rule 2: "Not the line count — no
  one cares how much code we wrote"; README: the line count is "a pinned
  reproducible fact … not a story beat"). The labor beat survives without
  the bookkeeping ("this paper is about the system that was built and is
  running"). §10's conclusion reference ("the visible part of the
  568,594 deleted lines") is reworded so no orphan number remains ("the
  visible part"). The stat stays pinned in
  `research/ai-paper-theory/ops/numbers.md`.
- **(agent)** Tectonic: 20 pages, no overfull hbox, no undefined
  references, all 11 figures placed. Pages 1/5/7/9/12 rendered and
  inspected. Still open (unchanged): the three first-shot figures + the
  monetization beat ride the "all the figures done" call; the 1M subs /
  300k delivered rent number is in §9's body. Next gate: the operator's
  read of the rebuilt PDF (the abstract, the two full-width figures, the
  padding), then the compression test.

## 05.11.2026

### The resynthesis: no second-draft gravity — the manuscript is the beats + the figures, nothing else

- **(operator)** "table 1 figure 1, and figure 5, i think these are the
  weakest. table 4, do we need that? if we have a line chart showing the
  same thing? want to use our amazing new figures instead of these" +
  "yupp, this is talking about the second draft. and i dont care about
  paper length, i woudl lke to use all the figures we made, because they
  all make a great point, it is like we made a pictographic story,
  instead of making little edits to the paper, even starting fresh but
  using the story we told in the shot 0 and the figuress is best" +
  "actually make a third draft, starting from the shot 0 and hte figures
  please" + "a new folder, etc!" + "dont want to get sucked up by the
  second draft paper, want a clean starting point, synthesize this
  again, ai paper theory, papers are cheap"
- **(agent)** The critique maps onto the second-draft artifacts the
  inherited third-draft structure still carried: Table 1 (the capability
  matrix) · Figure 1 (the TikZ system overview) · Figure 5 (the domain
  before/after captures) · Table 4 (the fan-out table, beside its own
  curve). All four are out of the manuscript now, each replaced by the
  figure that makes its point:
  - **Table 1 (capability) → out.** The comparison lives in the two VS
    figures (composition, platforms) + the §9 positioning paragraphs +
    §1's five-properties list ("no prior system we compare carries the
    conjunction"). The "Table 1 organizes the comparison" opener in §9 is
    reworded to point at the figures.
  - **Figure 1 (TikZ overview) → out.** `fig-app-arch` is now the §1
    system figure (Figure 1 of the manuscript): the data layer in the
    browser, the thin generic node, the two stores, the messages on the
    wire. The section mapping the TikZ labels used to carry lives in the
    paper-map paragraph (§1's last prose paragraph, one sentence per
    section). The "visual ToC" label pass of 4.10.37 is retired with the
    figure — the new figure set is the map.
  - **Figure 5 (domain captures) → out.** `fig-audience-portability`
    carries the DNS story (§4 mechanism, §8 evidence pointer); the exact
    panel captures, the authenticated hookup, and the 375px evidence are
    named as remaining in the prototype artifact (scope as fact — the
    receipts are not deleted, they move out of the paper).
  - **Table 4 (fan-out) → out.** The curve (Figure 10) + the finding
    prose carry it: the full K10/100/1000 B numbers with p95, the
    variant-C separation (8,388.39 vs 222.57 ms at K=1,000), the
    direct-scan range (28.6–54.2 ms), the 35.22×/21.04× factors, the
    4.47× handler growth, the K=1 counterweight, the setup (host, seed 42,
    20 samples/cell, 400 measurements, ClickHouse 24.3.18.7), and the
    single-trial scope — every printed number still traces to the
    measurement artifact.
- **(agent)** The manuscript was re-synthesized from shot 0 + the figure
  set (`main.tex` replaced, not patched): §1 the split → the labor
  (958,824/568,594 pinned) → the five properties → the evidence → the
  contributions → the map + Figure 1 · §2 the forcing move (the grant is a
  row, so the readable set is computable before any query runs) · §3 the
  composition fork + data-policy-not-privacy · §4 verified-not-registered
  (the SPF/DKIM parallel) + the concrete domain + `fig-feed` · §5 the
  wall (the count(*) blunder first, then the refutation) +
  `fig-query-engine` · §6 the killer app + the interop + `fig-platforms`
  + the ad rail (`fig-monetization`) · §7 the four built-and-deleted
  surfaces (carried — the labor resolution) · §8 the evidence, Q&A, with
  `fig-k1000-curve` · §9 positioning + `fig-node-market` · §10 the email
  frame closed + the labor + the market. **All the figures we made are in
  the paper** (the operator's "pictographic story"): app-arch,
  composition, feed, audience-portability, query-engine, groups,
  platforms, interop, monetization, k1000-curve, node-market — 11 figure
  floats; the only tables left are the two definitional/evidence ones the
  story needs (media spectrum, interop apps).
- **(agent)** Page budget: lifted (the operator's "i dont care about paper
  length") — 19 pages at this build, complete over concise. Tectonic
  clean: no overfull hbox, no undefined references, all figures placed
  with figure-describing captions. The fan-out table being out does not
  touch the check-paper harness (it verifies the first draft's committed
  table, hardwired to `first-draft/main.tex`).
- **(agent)** Carried over as open items (unchanged by this round): the
  abstract is still the shot-4 spec reconstruction (the verbatim lived
  only in the #1396 thread) — open to the operator's re-pass; the three
  first-shot figures (monetization, audience-portability, k1000-curve) +
  the monetization beat ride the "all the figures done" call — open to
  review; the 1M subs / 300k delivered rent number is now in §9's body
  (grounded in the business plan) — flag if not paper-ready.
- **(agent)** Housekeeping: the LaTeX build artifacts that rode into dev
  with the previous commit (main.aux/.bbl/.blg/.log/.out) are removed
  and gitignored in `third-draft/` (only main.tex + main.pdf + DECISIONS
  + OUTLINE + figs/ are the record).

### The third draft: the actual shot — the manuscript written from shot 0 + the figures

- **(operator)** "okay, disregard the sigmod limit of 12 pages, now that
  you got all the figures + this shot 0, can you take a shot at writing
  the paper? this second draft attempt wasnt actual, take an actual shot
  please, start fresh with the shot 0 + figs now that we made them!"
- **(agent)** The loop completes its order: shot 0 (locked, 12 beats) →
  abstract → figures (all 13, settled by the figure phase) → **the
  paper**. `research/third-draft/` is the working manuscript from this
  entry forward; `research/second-draft/` stays intact as the record
  (the open question from 4.10.1 — "in-place vs. a third-draft folder" —
  answers itself: fresh folder). The second draft's evidence base is
  inherited unchanged (the verified tables, the artifact pins, the
  18-citation bibliography, the §8 trial data — the fan-out table is
  byte-identical, so the check-paper harness's verification carries
  over); its prose is the rewrite target, because it predates shot 0
  and the figure phase ("No manuscript prose changed" was the invariant
  across the whole shot loop — the section shots never ran).
- **(agent)** What the rewrite does, against the 12-beat content
  checklist (voice rule 16: the body says the beats naturally):
  - **Abstract:** reconstructed to the shot-4 spec (~160–230 words,
    every concrete anchor kept — the feed/follow/like endpoints, the
    snake game, OAuth 2.0, ClickHouse "at scale", email confirming a
    sender, the domain; the 7.64 s → 363 ms number; the "data policy,
    not privacy" stance; the close "When the data leaves a node, the
    rules leave with it"). **Open to review:** the shot-3/shot-4
    verbatim text lived only in the PR #1396 thread (not retrievable);
    this is the spec-faithful reconstruction — operator to re-pass.
  - **§1 (the intro):** the email split lead (kept — the outline's
    "P1–P2 KEEP"); the labor lede lands here for the first time
    (958,824 added / 568,594 deleted — the pinned range: all text
    files, all commits since November 2021, merge commits excluded);
    the five properties, one bold line each (the outline's P3, stated
    boldly per voice rule 3); the evidence paragraph (architectural /
    business / scale, each pointing at §8); the contributions (three,
    kept); Table 1 moved after the claims (the outline's "KEEP,
    moved"); the paper map + Figure 1 (now the completed visual ToC —
    the label pass of 4.10.37).
  - **§2:** lead-in states beat 3 (the permission model belongs to the
    user, not the platform); the definitions / two trust layers / the
    set expression / publicness-is-a-grant all carried unchanged.
  - **§3:** the composition fork lands in "why not a database per
    user" (beat 10's capability asymmetry: a node pools millions of
    users, discover/trending/ranking are ordinary queries; Solid's
    pods cannot compose across — Figure 2, `fig-composition`);
    "Data policy, not privacy" gains the beat-10 stance in full (not a
    privacy play — Signal/WhatsApp exist; the node-readable bet buys
    the ClickHouse + lakehouse composition; users control who else
    reaches; the operator is bound by law, not encryption; "what the
    user owns is the policy, not the secrecy"); the ClickHouse
    bedrock sentence (beat 9) is now in the body.
  - **§4:** the /certify subsection carries beat 11's authentic
    email-sender parallel (SPF/DKIM: "a handshake, not a registry,
    because every node still re-checks its own rules on every read");
    the domain-alias subsection carries beat 12 concretized
    (jacobhoffman.xyz; the follow is a private document in the
    follower's own store whose body is exactly the domain; the
    re-point; "no platform holds a ban switch over an address the user
    keeps").
  - **§5:** Figure 3 (`fig-query-engine`) wired in with a
    caption-describes-the-figure caption; the opening states beat 4's
    division of labor (the developer writes and tunes; the platform
    guarantees the boundary, not the performance); beat 6 (RLS as the
    OLTP-era predecessor; the boundary moves to the query) is the
    "why policy lives above the engine" paragraph.
  - **§6:** Figure 4 (`fig-app-arch`) opens the section; Figure 7
    (`fig-platforms`) lands in "multiple applications, one data
    plane" with beat 7 stated (a role and a policy; OAuth 2.0's job,
    but the grant names the service, the group, and the operation);
    **the new subsection "How money flows on web10: the ad rail"**
    (Figure 9, `fig-monetization`) carries the monetization beat that
    the 4.10.34 round drafted: the free web should have ads; the
    alternatives ship no ad mechanism (the documented design property,
    gap stays OPEN); the rail is service-agnostic (a new ad surface is
    a new query, not a new backend); the density split (creator's
    layer ~80–90%, node's layer ~5–10%, node-controlled, default 10,
    deterministic per reader; non-steal); the money off-platform
    (creator keeps 100%, no payment processed; the node operator is a
    media company, ~85–90%; nodes compete for influencers by lowering
    rates). The groups UI screenshot (the old cut candidate) stays —
    the page budget is off.
  - **§7:** carried unchanged (the strongest section; the K1000 lede
    already in place).
  - **§8:** Figure 11 (`fig-audience-portability`) wired into the
    domain results beside the before/after capture; Figure 12
    (`fig-k1000-curve`) wired beside the fan-out table ("the same
    table as a curve").
  - **§9:** the Solid and decentralized-social paragraphs now point at
    their VS figures; **the new "Monetization, and the market the data
    plane makes" paragraph** (Figure 13, `fig-node-market`) carries
    the three rents (reach throttling · demonetization ·
    deplatforming; 1M subs, 300k delivered), the ad-rail answer, and
    the matching-market consequence ("a flip is a rematch, not a
    loss"; "the competition is on terms, not on leverage").
  - **§10:** the labor resolution added (the generic core was earned,
    not designed; the four built-and-deleted surfaces are the visible
    part of the 568,594 deleted lines) + the market close (the
    creator keeps their own monetization; nodes compete on terms).
- **(agent)** The figure set as printed (manuscript numbering):
  1 overview (TikZ, labeled) · 2 composition fork · 3 query engine ·
  4 app-arch · 5 federated feed · 6 groups UI · 7 platforms fork · 8
  interop captures · 9 monetization · 10 domain before/after · 11
  audience portability · 12 K1000 curve · 13 node market. The three
  first-shot figures (monetization, audience-portability, k1000-curve)
  are printed under the operator's blanket "all the figures … done"
  for this round — **open to review**; a re-shot on any of them is a
  re-render + caption check, the prose stands.
- **(agent)** The page budget is lifted (the operator's "disregard the
  sigmod limit of 12 pages"): the draft is complete over concise —
  20 pages at this build (body + references). The SIGMOD 2027
  industry-track target and the Nov 24 deadline are unchanged; what
  changes is that the 12-page constraint no longer governs the write
  (the cut candidate is off, the monetization + market material is
  full). If a page limit comes back, the compression order is: §9
  positioning paragraphs, §4 implementation-status, the groups UI
  figure.
- **(agent)** Build state: tectonic clean — 20 pages, no overfull
  hbox (one fixed: the §1 item-3 `provider/username` line, breakable
  at the slash), no undefined references, all 13 figures placed with
  captions describing the figure they sit under; the fan-out table
  byte-identical to the second draft's (the check-paper harness's
  verification carries over).
