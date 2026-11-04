# Second-draft paper — decisions

The decision log for `research/second-draft/` (the SIGMOD 2027
industry-track manuscript). Newest entry first. Operator decisions are marked
**(operator)**; agent defaults the operator has not yet reviewed are marked
**(agent — open to review)**. `research/first-draft/` is a frozen record —
nothing in this file applies to it. The writing approach (spine, method,
editorial rules, pinned numbers, the diagnosis of the current draft) lives in
`research/ai-paper-theory.md`.

## 04.11.2026

### Narrative pivot: the churn is the lede; the approach is pinned in `ai-paper-theory.md`

- **(operator) The second-draft prose is "not hitting the mark" — "there is
  potential."** The brief: tell the best story of the ~1.1M code additions /
  ~700K deletions that went into the project. We don't have to line up with
  the first draft; deviate a lot. It's 12 pages — re-drafting is cheap.
- **(operator) Make the paper-writing approach a document: `research/ai-paper-theory.md`**
  — done. It pins: the three-act spine (the split / the churn / the proof;
  "the generic core was earned, not designed"), the four-phase method
  (orient → draft → compare → repair, paper edition), the 12 editorial
  rules, the pinned reproducible numbers, the diagnosis of the current
  draft (what works: §7, wall-not-membrane, the email frame; what isn't
  landing: the mechanism-list abstract, the absent churn, hedge density),
  and the open questions for the operator (spine confirmation, churn range,
  evaluation scope, authorship, surgical pass vs. third draft).
- **(agent) Pinned churn count:** `git log --numstat` over all text files,
  all commits since 2021-11-14, merge commits excluded = **958,824 added /
  568,594 deleted** (04.11.2026). The operator's ~1.1M/~700K is not
  reproducible at that range (since-2025: 676,325/494,782; code-extensions
  only: 457,655/257,104; merge diffs included: 1,611,136/837,686). The range
  is an open question before any number is printed.
- **(agent) The new-figure work (fig:app, fig:boundary) is paused** pending
  spine confirmation — figure content is downstream of the story. The
  figure system itself (below) stands.
- **(agent) Recommended prose pass is surgical, not a third draft:** rewrite
  the abstract (three acts, ~150 words), rework the intro (churn lifted,
  contributions with so-whats, Table 1 after the story), open §7 with the
  churn numbers, close the conclusion with the churn resolution, voice pass
  across. A whole re-draft only on operator direction.

### The figure system: HTML source, PNG raster, 2x

- **(operator) Diagrams are authored in HTML.** Every architecture diagram in
  the second draft is a committed `figs/<name>.html` (fixed-size body, dark
  web10 theme) rendered to `figs/<name>.png` with `figs/capture.mjs`
  (headless Chromium, `deviceScaleFactor: 2`). LaTeX includes the PNG; the
  HTML is the editable source. Rationale: the previous PNGs were uneditable
  rasters with no source in the repo, and HTML iteration with the operator is
  fast. How-to: `figs/README.md`.
- **(agent — open to review) UI screenshots stay PNG-only.** `fig-groups.png`
  and the interop/domain screenshots are captures of the running app, not
  diagrams — no HTML source; they follow the app's screenshot harness.
- **(operator) The figure set grows: 3–4 more architecture figures are
  warranted** — the system has unusual mechanisms that deserve their own
  figures (planned set below). Constraint: the 12-body-page budget (internal
  freeze Nov 20). New figures must earn their height; wide/short canvases and
  full-width floats preferred. If the body exceeds 12 pages, the operator
  picks which figures stay.
- **(agent) Figure-accuracy invariant:** a figure may only assert what the
  paper body or the knowledge base already asserts (e.g. `/certify` = "one
  cached answer per token, never a grant"; boundary CTEs sit before
  aggregation). A figure that adds a new claim is a new claim that needs
  evidence. No internal decision/PR IDs in figure text or captions
  (conference-facing, per the 4.5.4 cleanup).

### Planned figure set

| Figure | Section | Content | Status |
|---|---|---|---|
| `fig:overview` (TikZ) | §1 | one client, two sovereign nodes, `/certify` | existing |
| `fig:feed` (HTML) | §6 float | federated node architecture — identical A/B internals, `/certify` the only difference | **redrawn today** (below) |
| `fig:groups` (screenshot) | §6 | groups UI | existing |
| **`fig:app` (HTML)** | §6 "A frontend over the shared node" | web10-social as a stateless lens: app surfaces → app-defined expressions (documents in app services / social graph as group rows / feeds & search as app queries / media as the generic pipeline) → one generic node with the "refuses to learn" callout | in flight |
| **`fig:boundary` (HTML)** | §5 enforcement | wall not membrane: the broken output-filter pipeline vs the boundary-CTE pipeline | in flight |
| `fig:interop` (screenshots) | §6 | snake / marketplace identity screens | existing |
| `fig:domain-follow` (screenshots) | §8 | domain portability before/after | existing |
| (candidate) data-model (HTML) | §3 | one table: `{service, body}`, updates-as-inserts, tombstones, `doc_groups` | candidate, not started |
| (candidate) two-trust-layers (HTML) | §2 | app trust (outer) / person trust (inner), a grant is a row | candidate, not started |

### `fig:feed` (Figure 2) redraw

- **(operator) node B does the same access checks as node A, with `/certify`;
  the old diagram showed the internals as different.** Fix: both nodes draw
  the identical card structure (users / data / contracts / memberships), the
  same violet "access check — contracts + membership · every read" box on
  each, bridged by a "same access check" pill. The only differences: the
  token-verification step (own signature at A vs `/certify(A)` cached until
  expiry at B), the matching "enforces" lines, and A's "serves /certify" box,
  which B's green `/certify` line targets. Node B is mirrored so the two
  identical access-check boxes sit adjacent in the middle.
- **(agent) Stale caption replaced.** The `fig:feed` caption described the
  feed UI (ranking tabs, tag filters) that was never in the figure —
  inherited from the first draft (both drafts shipped the architecture PNG
  with the UI caption). New caption: pulling the feed across nodes,
  `/certify`, the same access check.
- **(agent) First body citation added** in §4 "The read model:
  client-side fan-out" — the figure was previously uncited (no `\ref`
  anywhere in the manuscript).
- Tectonic after the change: 14-page PDF = 12 body + references
  (unchanged), no overfull hboxes, same 1.166pt final-page overfull vbox as
  4.8.2.
