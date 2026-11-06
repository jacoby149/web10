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
8. Every figure: referenced from the body, and the caption is SHORT —
   it names the figure, it does not explain it. The explanation of the
   figure is the body's job, written at the figure's introduction. A
   "monster paragraph caption" is a review failure: it is the caption
   doing the body's work, and when a caption carries content the body
   never states, that content moves into the body at the \ref — a
   caption is never the only home of a claim. The caption still
   describes the figure it sits under (not a previous version of it,
   not the section's topic in general), and asserts only what the body
   asserts. (Operator, 06.11.2026, the fourth-draft round: "the
   figures have these monster paragraph captions, that should be the
   writing in the paper to explain the figures, the figures should
   just have a short caption.")
9. No internal IDs in conference-facing prose (decision numbers, PR
   numbers) — per the 4.5.4 cleanup.
10. Open with the stakes, not the email analogy. Use email only where it
    explains a specific mechanism (for example, sender verification next
    to `/certify`). Neither the introduction nor the conclusion must
    carry an email frame. The operator's fourth-draft correction and
    fifth-draft request supersede the earlier framing rule.
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
    the profile; the fan-out cost ↔ 7.64 s → 363 ms; /certify ↔ email's
    sender check, SPF/DKIM — "a handshake, not a registry"; the user's
    address ↔ a DNS domain they own).
15. **Don't massage what already lands — authenticity over template,
    mechanism over benefit.** When a formulation is clear and true — a
    clean parallel, a crisp contrast, the operator's own words — use it
    *as-is*. Re-compressing a good explanation into a rigid line mangles
    it and loses the clarity that made it land (shot 0's take-25 miss:
    the SPF/DKIM ↔ /certify parallel was "soooo well" said inline, then
    massaged into the pitch until it "completely lost what [it] said";
    the operator: "this is so much more authentic"). And in a research
    paper, name the *specific mechanism* and let the benefit follow as
    the consequence — don't lead with the benefit and drop the mechanism
    (the DNS miss: "you never lose your audience" is the payoff, but what
    actually protects the user is a *TXT record they own that the node
    verifies but cannot touch* — that is the authentic, research-paper
    line; "a TXT record is protecting them, and is untouchable to the
    node owner"). The smart-kid test is a floor for being understood, not
    a ceiling that justifies overworking a good formulation: tighten the
    words, don't restructure the idea.
16. **The pitch finds the beats; the body says them naturally.** The
    shot-0 pitch (the punchy, slogan register) was the compression
    exercise that surfaced the essence — the beats to carry. The
    manuscript does **not** carry that register (operator, 05.11.2026:
    "we arent pitching … we want to say this stuff naturally like you do
    when you arent using a pitching voice"). The body says the same
    things in natural explanatory prose: it states the **mechanism and
    the consequence**, not the punchline. A pitch line ("the audience
    never leaves when an account does") becomes paper prose ("the
    follower's subscription is stored as the creator's domain in the
    follower's own data, so it persists when the creator moves nodes —
    the client re-resolves the domain and the follow continues"). The
    beats are the **content checklist** (each must appear in the body);
    the natural voice is the **delivery**. The test: if a line reads
    like an ad, restate it as an explanation. This is the register the
    section shots are written in.

The no-hedging pass (the repair phase): find every weakened claim,
restore it to full strength inside its domain, cut it if it can't
survive the evidence oracle. Grep targets: "arguable", "exhaustive
claim", "must not be mistaken", "unfortunately".
