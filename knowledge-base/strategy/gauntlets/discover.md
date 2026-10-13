# Discover gauntlet — the public board, tortured

[← back to the gauntlet doctrine](./README.md)

Discover is the public board: the node-default discover group
(`{provider}/groups/web10/discover`), readable by anon (D41 — the node is
readable by design). It is ranked by the D36 knobs (server-side), with a grid /
youtube view toggle and a topic filter. The board takes live reactions (the
like/dislike pair, the same way of reacting as the feed — 3.98.2) and comments.

Discover is where the **shared `DiscoverCard`** lives (D74 — one source, both
apps: web10-social + the marketing `/trending` page). A bug in the shared card
shows on both apps, so the gauntlet covers the card's reaction + comment path.

## The surface

- **Route:** `/discover` (the social app). The marketing `/trending` page is the
  same shared card in `remote` mode (the like is display-only, anon) — the
  gauntlet covers the social (interactive) mode; the marketing remote mode is a
  fork noted here, driven in the marketing-ui gauntlet.
- **Testids:** `data-testid="discover-card"`, `"discover-post-actions"`,
  `"like-button"` / `"dislike-button"` / `"comment-button"` (per card),
  `"discover-view-toggle-grid"` / `"discover-view-toggle-youtube"`, the topic
  filter chips.
- **The truth:** the posts in the discover group (the board read), and the
  reaction/comment docs by `ref_value` over the discover group (where board
  reactions are written).

## The state machine

```
cold (the board, ranked)
→ like a board post            like:1  heart:on
→ RELOAD                       like:1  heart:on   (the board reaction persists)
→ dislike a board post (swap)  like:0  dislike:1  thumb:on
→ RELOAD                       the swap persists
→ comment on a board post      the comment renders in the thread
→ RELOAD                       the comment persists
→ view toggle: grid → youtube  the media posts render as 16:9 tiles
→ topic filter: #tag           the board filters to the tag
→ RELOAD                       the filter persists (?tag=)
```

**The board-reaction truth:** a like on a board post is written to the discover
group (the board). The gauntlet asserts the reaction doc in the discover group
AND the card's heart state + count, across a reload. This is the same reaction
state machine as `reactions.md`, driven on the board (a fork of the reaction
surface).

**The ranking truth:** a knob twist is a server-side re-read. The gauntlet asserts
the board's post order changes (the ranking) and the knob state persists across a
reload.

**The view + filter truth:** the grid/youtube toggle and the topic filter are
URL-held (`?view=`, `?tag=`). The gauntlet asserts the toggle/filter changes the
render AND persists across a reload (the deep-link rule).

## The forks

- **Reaction:** the board's like/dislike is a fork of the reaction surface
  (the `DiscoverScreen.handleToggleReaction` + the board reaction read). Drive
  the like → RELOAD sub-sequence (the full permutation is in `reactions.md`).
- **Comment:** the board's comment is a fork of the comment surface.
- **Read:** the board read (discover group) vs. the feed read (followers groups)
  — the same public post is on both; the board gauntlet asserts the board read.
- **Remote mode (marketing):** the same shared card in `remote` mode (the like is
  display-only). Driven in the marketing-ui gauntlet, not here.

## The truth fields

- **DB:** the posts in the discover group (the board read); the reaction/comment
  docs by `ref_value` over the discover group.
- **UI:** the card's rank, the heart/thumb `aria-pressed` + counts, the comment
  count, the view (grid/youtube), the active topic filter.

## The anti-tests

- **Anon read:** an anon visitor (no token) reads the board (D41) but cannot like
  (the like is display-only in remote mode) — the reaction is not created.
- **I3:** a hidden post (a moderator hid it from the board) → not on the board
  for the reader, though it exists.
- **Topic filter on an empty tag:** the designed empty state (not a crash).
- **Video tile:** a 9:16 clip renders at the natural ratio (not letterboxed —
  the 3.100.2 fix); the control rack is reachable (the 3.100.1 fix).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A likes a board post; user B
  (separate context) views the same board post → B's like count includes A's
  like. The board aggregate is public (D41) — both see the same count.
- **The board at scale (API floor):** a board post that 100 users like → the
  board's like count is 100, the ranking (the power-mean score) reflects it.
- **The hidden post at N (API floor):** a moderator hides a post from the board →
  it's absent for all readers (the `group_hidden_docs` row), though it still
  exists for the author.

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the board read + reactions via raw calls, the truth asserted.
2. **Browser gauntlet — board reactions** — the like/dislike/comment permutation
   on a board post, truth + reloads.
3. **Browser gauntlet — ranking + view + filter** — the knob/view/filter
   permutations, truth + reloads (the deep-link persistence).
