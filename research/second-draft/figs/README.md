# figs/ — figure sources and rasters

LaTeX includes the PNGs; the `.html` files are the editable sources for the
diagrams. UI screenshots (`fig-groups.png`, the interop/domain captures) are
PNG-only app captures — no HTML source. Convention and rationale:
`../DECISIONS.md` (04.11.2026, "The figure system").

## Adding or changing a figure

1. Write `figs/<name>.html` — fixed-size `<body>` (e.g. 1440x900), dark
   web10 theme, consistent with the existing figures.
2. Render (playwright is not a repo dependency — scratch install; browsers
   are cached in `~/Library/Caches/ms-playwright`, so no Chromium download):

   ```sh
   SCRATCH="$(mktemp -d)"
   cd "$SCRATCH" && bun add playwright@1.62.0
   NODE_PATH="$SCRATCH/node_modules" \
     node research/second-draft/figs/capture.mjs <name> [out.png]
   ```

   `capture.mjs` renders the body at its natural size, @2x. Default output
   is `figs/<name>.png`.
3. Commit `figs/<name>.html` + `figs/<name>.png`, and wire into
   `main.tex`: `\includegraphics` + a caption that describes *this* figure +
   at least one `\ref` in the body.

## Rules

- A figure may only assert what the paper body or the knowledge base
  already asserts — a figure that adds a new claim is a new claim that
  needs evidence.
- No internal decision/PR IDs in figure text or captions
  (conference-facing, per the 4.5.4 cleanup).
- Keep committed rasters at the existing dimensions where possible so the
  page layout does not shift (fig-feed: 2880x1800 = 1440x900 @2x).
