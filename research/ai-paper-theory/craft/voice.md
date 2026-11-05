# The voice: the editorial rules

1. Open with the tension, not the definition — and name the stakes
   concretely: the *pet test* (if the reader can swap a pet into the
   stake, the stake isn't named; "your data … a pet?").
2. The stakes are a lede: what's at risk (your audience, your content,
   the rules of who can touch what) — early and concrete. **Not the
   line count** — no one cares how much code we wrote.
3. The differentiators are stated boldly — five of them — each tied to
   the evidence that proves it and carrying its why-not-X step.
4. Claims stand at full strength inside their domain; the domain is
   stated as fact, not apologized for.
5. **No hedging, ever.** If a claim can't survive the evidence oracle,
   cut the claim — don't weaken it. A bold claim that gets defended
   beats a safe claim that gets hedged into the ground.
6. One idea per paragraph, **one claim per sentence**; lead with the
   punchline; no clause-stacking (the take-1 pitch miss: "almost too
   dense" — a pitch that enumerates like the abstract is a missed shot).
7. Definitions before use; no noun the reader doesn't own.
8. Every figure: referenced from the body, caption describes the figure
   it sits under, asserts only what the body asserts.
9. No internal IDs in conference-facing prose (decision numbers, PR
   numbers) — per the 4.5.4 cleanup.
10. The email frame: open in the intro, close in the conclusion.
11. Related work = positioning (three paragraphs, each ending with the
    gap); the verified bibliography carries it; the gap check must be
    YES before it freezes.
12. Evaluation = Q&A: one named question per subsection; baselines
    named with versions; the number that hurt reported with its
    tradeoff argument.
13. **The awe beats are structure, not adjectives:** logical awe (the
    combination: setup → forcing move → calculation → finish; the
    why-not-X chain as visible verification steps; the NP-looking system
    contrasted with the P-looking proof), original work (the structural
    conjunction argument), importance (the stakes + the running system up
    front — calibrated, no overspend).
14. **The known ↔ advanced register (the whole paper, not just the
    pitch).** Every advanced concept is tethered to a known one, and the
    pair is what does the work: the *advanced* (bespoke APIs, AST,
    "completely generic," interoperating, boundary CTE, readable set)
    makes a reviewer think "this is going to be interesting" — it
    signals depth *and shows understanding* (the writer commands the
    domain — a credibility signal), not a product pitch; the *known* (OAuth 2.0, the
    snake game, the marketplace, feed/follow/like, ClickHouse, billions
    of rows) makes it verifiable at a glance — the reader anchors each
    advanced claim to something they already understand and can check.
    Neither half works alone: all-advanced is impenetrable, all-known is
    a marketing pitch. This is the balance the operator named: simple
    examples that show understanding while keeping it "a little
    advanced" — "this balances it well." The awe lives in the gap the tether closes — the
    reader meets the advanced concept and the known one beside it makes
    it click ("like OAuth 2.0, but finer"). That is the NP-looking
    system made P-verifiable, one pair at a time. The locked pitch is the
    proof it works: advanced = bespoke APIs / AST / generic /
    interoperating; known = OAuth 2.0 / snake game / marketplace /
    feed-follow-like. Apply it to every section: theorem-term ↔ concrete
    (readable set ↔ a grant row; boundary CTE ↔ the snake game reading
    the profile; the fan-out cost ↔ 7.64 s → 363 ms).

The no-hedging pass (the repair phase): find every weakened claim,
restore it to full strength inside its domain, cut it if it can't
survive the evidence oracle. Grep targets: "arguable", "exhaustive
claim", "must not be mistaken", "unfortunately".
