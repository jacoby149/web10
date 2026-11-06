# figs/ — figure sources and rasters (fourth-draft working set)

LaTeX includes the PNGs; the `.html` files are the editable sources for the
diagrams. UI screenshots (`fig-groups.png`, the interop/domain captures) are
PNG-only app captures — no HTML source. Convention and rationale:
`research/second-draft/DECISIONS.md` (04.11.2026, "The figure system");
this set is the third-draft working set copied to `research/fourth-draft/`
at 4.10.41 (the 4.10.40 padded rasters + `capture.mjs` are the baseline).
The interop captures are referenced from `main.tex` as
`../interoperability-demo/figures/*.png` (shared, not copied).

## Adding or changing a figure

1. Write `figs/<name>.html` — fixed-size `<body>` (e.g. 1440x900), dark
   web10 theme, consistent with the existing figures.
2. Render (playwright is not a repo dependency — scratch install; browsers
   are cached in `~/Library/Caches/ms-playwright`, so no Chromium download):

   ```sh
   SCRATCH="$(mktemp -d)"
   cd "$SCRATCH" && bun add playwright@1.62.0
   NODE_PATH="$SCRATCH/node_modules" \
     node research/fourth-draft/figs/capture.mjs <name> [out.png]
   ```

   `capture.mjs` renders the body at its natural size, @2x. Default output
   is `figs/<name>.png`.
3. Commit `figs/<name>.html` + `figs/<name>.png`, and wire into
   `main.tex`: `\includegraphics` + a SHORT caption (it names the figure —
   the explanation is the body's job at the `\ref`, per the 4.10.42 call:
   "the figures should just have a short caption") + the body paragraph at
   the introduction that explains the figure.

## Rules

- A figure may only assert what the paper body or the knowledge base
  already asserts — a figure that adds a new claim is a new claim that
  needs evidence.
- No internal decision/PR IDs in figure text or captions
  (conference-facing, per the 4.5.4 cleanup).
- Keep committed rasters at the existing dimensions where possible so the
  page layout does not shift (fig-feed: 2880x1800 = 1440x900 @2x).
  Exception (4.10.40, operator call): composition · platforms ·
  node-market · query-engine · audience-portability were re-rendered
  with a uniform 40px @1x bottom gap (2880x1636 · 2880x1636 · 2880x1616
  · 2880x1616 · 2880x1492 @2x) — those new dimensions are the baseline
  now.

## Measurement curves (matplotlib)

Performance curves are a committed `.py` script → 2x PNG
(`fig-k1000-curve.py`, 4.10.37) — the HTML system is for mechanism
diagrams; a curve's source is data + layout, and the script is the
reproducible thing. matplotlib is not a repo dependency — scratch venv
(lives outside the repo):

```sh
SCRATCH="$(mktemp -d)"
python3 -m venv "$SCRATCH" && "$SCRATCH/bin/pip" install -q matplotlib
"$SCRATCH/bin/python" research/fourth-draft/figs/fig-k1000-curve.py
```

The rules above apply as-is: the accuracy invariant (curves plot only
numbers the body already asserts), the house language (dark canvas,
semantic colors, payoff strip), the 1440 canvas @2x.
