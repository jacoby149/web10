#!/usr/bin/env python3
"""fig-k1000-curve — "Where the access layer's cost lives" (Figure 9, §9.4).

The K10/K1000 fan-out curve: readable-group resolution time vs. the number
of candidate groups K. One sequential trial, 20 samples per cell
(research/experiments/costfn/K1000-RESULTS.md): K = 10/100/1000 are personal
queries on the same 1,000-creator dataset; K = 1 is the discover board
(one candidate group). Plotted: the per-group resolver's readable median
(amber — the negative finding: 7.54 s readable at K = 1,000) and the batched
resolver's readable median (green — the design decision that measurement
drove). Every number asserted here is already in the manuscript:
Table~tab:fanout (K = 10/100/1000) and the §9.4 finding + tradeoff prose
(K = 1 discover board: 9.53 / 25.37 ms; the growth factors). These remain
the historical single trial: Task 4 repeat and paired same-engine baseline
are OPEN. The direct-scan variant A is not a causal authorization baseline
and is not plotted.

House language per kb/diagrams.md: dark canvas #0a0a12, semantic colors
(amber = the number that hurts, green = the fix), payoff strip, wide/short
1440 canvas @2x raster (2880x1440). No verdict strip — measurement figure.

matplotlib is not a repo dependency (the figure system is HTML → PNG via
capture.mjs; see figs/README.md for the scratch-venv render command):

  python3 fig-k1000-curve.py   # writes fig-k1000-curve.png next to this file
"""

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# --- the house language (kb/diagrams.md) ---
CANVAS = "#0a0a12"
INK = "#f2f3f8"       # titles / payoff line
GRAY = "#9c9fb3"      # neutral text
AMBER = "#fbbf24"     # the negative finding: what the per-group path costs
GREEN = "#34d399"     # the batched resolver: the design consequence

# --- historical pinned data (K1000-RESULTS.md + manuscript §9.4) ---
K = [1, 10, 100, 1000]
# readable-group median, ms. K = 10/100/1000: personal queries, the same
# 1,000-creator dataset. K = 1: the discover board (one candidate group).
PER_GROUP = [9.53, 75.03, 764.39, 7535.71]
BATCHED = [25.37, 23.47, 41.78, 213.98]

# growth factors over K = 10 -> 1,000 (manuscript §9.4 finding)
GROWTH_PER_GROUP = "×100.44"
GROWTH_BATCHED = "×9.12"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "axes.edgecolor": "#2a2a3a",
    "text.color": GRAY,
    "axes.labelcolor": GRAY,
    "xtick.color": GRAY,
    "ytick.color": GRAY,
})

# 1440x720 canvas @2x raster (the wide/short house canvas, half the
# 900-tall diagrams' height — a curve needs no more)
fig = plt.figure(figsize=(14.4, 7.2), dpi=200)
fig.patch.set_facecolor(CANVAS)

# --- title block (the HTML figures' 26px title / 13.5px subtitle register) ---
fig.text(0.5, 0.955, "Where the access layer's cost lives",
         ha="center", va="center", fontsize=18.7, fontweight="bold", color=INK)
fig.text(0.5, 0.905,
          "historical readable-group resolution time vs. candidate groups K — one sequential trial, 20 samples per cell; "
         "K = 10/100/1,000 are personal queries on one dataset, K = 1 is the discover board",
         ha="center", va="center", fontsize=9.7, color=GRAY)

ax = fig.add_axes([0.085, 0.175, 0.875, 0.66])
ax.set_facecolor(CANVAS)
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlim(0.7, 2200)
ax.set_ylim(4, 16000)
ax.set_xticks([1, 10, 100, 1000])
ax.set_xticklabels(["1", "10", "100", "1,000"], fontsize=9)
ax.set_yticks([10, 100, 1000, 10000])
ax.set_yticklabels(["10 ms", "100 ms", "1 s", "10 s"], fontsize=9)
ax.set_xlabel("candidate groups K (log scale)", fontsize=10.5)
ax.set_ylabel("readable-group median (log scale)", fontsize=10.5)
ax.grid(True, which="major", color=GRAY, alpha=0.14, linewidth=0.7)
for s in ax.spines.values():
    s.set_color("#2a2a3a")
    s.set_linewidth(0.9)

# --- the two resolvers ---
# the personal sweep (K = 10/100/1000) is one dataset, solid; the K = 1
# discover-board point is the comparison the manuscript makes, dashed leg
solid_k = [10, 100, 1000]
ax.plot([K[0], K[1]], [PER_GROUP[0], PER_GROUP[1]], color=AMBER,
        linewidth=1.6, linestyle=(0, (4, 3)), alpha=0.85, zorder=3)
ax.plot(solid_k, PER_GROUP[1:], color=AMBER, linewidth=2.6, zorder=3)
ax.plot([K[0], K[1]], [BATCHED[0], BATCHED[1]], color=GREEN,
        linewidth=1.6, linestyle=(0, (4, 3)), alpha=0.85, zorder=3)
ax.plot(solid_k, BATCHED[1:], color=GREEN, linewidth=2.6, zorder=3)

# markers: the discover-board point open (a different workload), the sweep filled
for color, y in ((AMBER, PER_GROUP), (GREEN, BATCHED)):
    ax.plot([K[0]], [y[0]], marker="o", markersize=8.5,
            markerfacecolor=CANVAS, markeredgecolor=color, markeredgewidth=2.2, zorder=4)
    ax.plot(solid_k, y[1:], marker="o", markersize=8.5,
            markerfacecolor=color, markeredgecolor=color, zorder=4)

# --- point annotations (the numbers the body leads with) ---
ax.annotate("7.54 s readable at K = 1,000", xy=(1000, 7535.71), xytext=(-155, 14),
            textcoords="offset points", fontsize=10, fontweight="bold",
            color=AMBER, ha="left")
ax.annotate("214 ms readable · 363 ms handler", xy=(1000, 213.98),
            xytext=(-160, 18), textcoords="offset points", fontsize=9,
            color=GREEN, ha="left")

# --- the growth factors over the K = 10 -> 1,000 span ---
ax.text(150, 2400, GROWTH_PER_GROUP, fontsize=9.5, fontweight="bold",
        color=AMBER, ha="center",
        bbox=dict(boxstyle="round,pad=0.3", facecolor=CANVAS,
                  edgecolor="none", alpha=0.9))
ax.text(150, 210, GROWTH_BATCHED, fontsize=9.5, fontweight="bold",
        color=GREEN, ha="center",
        bbox=dict(boxstyle="round,pad=0.3", facecolor=CANVAS,
                  edgecolor="none", alpha=0.9))

# --- the knee (the open K = 1 markers: the discover board, one group) ---
ax.text(1.35, 4.85,
        "the knee: at K = 1 the per-group path is faster — three fixed round trips dominate",
        fontsize=7.8, color=GRAY, ha="left", style="italic", zorder=4)

# --- legend ---
leg = ax.legend(
    [plt.Line2D([0], [0], color=AMBER, linewidth=2.6, marker="o",
                markerfacecolor=AMBER, markersize=7),
     plt.Line2D([0], [0], color=GREEN, linewidth=2.6, marker="o",
                markerfacecolor=GREEN, markersize=7)],
    ["per-group resolver — one point query per candidate group",
     "batched resolver — three queries + in-memory resolution (the fix)"],
    loc="upper left", bbox_to_anchor=(0.005, 0.965), fontsize=8.8,
    frameon=False, labelcolor=INK,
)
leg.get_frame().set_alpha(0)

# --- payoff strip (the house strip register; no verdict — measurement figure) ---
strip = fig.add_axes([0.085, 0.055, 0.875, 0.075])
strip.set_facecolor(GREEN)
strip.set_alpha(0.05)
for s in strip.spines.values():
    s.set_color(GREEN)
    s.set_linewidth(0.8)
strip.axis("off")
strip.text(0.5, 0.62,
           "The first measurement pointed at the access layer, not the database — "
           "the batched resolver is the design decision it drove, and the tradeoff has a knee.",
          transform=strip.transAxes, ha="center", va="center",
           fontsize=8, fontweight="bold", color=INK)
strip.text(0.5, 0.24,
           "K = 10 → 1,000: the per-group path grows ×100.44; the batched path ×9.12. "
           "At K = 1,000: 7.64 s vs. 363 ms handler.",
           transform=strip.transAxes, ha="center", va="center",
           fontsize=7.2, color="#b8d9c6")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "fig-k1000-curve.png")
fig.savefig(out, facecolor=CANVAS, dpi=200)
print(f"wrote {out} ({fig.get_size_inches()})")
