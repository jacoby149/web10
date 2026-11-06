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

## 05.11.2026

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
