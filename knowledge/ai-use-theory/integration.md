# Integration Possibilities: AI Use Theory

The theory is built but not wired in. This doc lays out the options for
integrating it into the agent flow — for a ~260k-context workhorse model (the
Qwen-class agents that do most of the work) — and where each option makes sense.
It is a decision doc, not a writing-framework doc (unlike Why/How/What).

## The Problem

The theory + refutations live in `knowledge/ai-use-theory/`.
Nothing in the agent flow points at them:

- Not referenced in `AGENTS.md`, `CLAUDE.md`, or `plan.md`.
- The four-phase debugging flow (orient → generate → compare → repair) and the
  pyramid exist only in the theory doc — no agent is pointed at them.
- The closest operational echo is `AGENTS.md`'s "Debugging: log everything"
  section — a partial (logs-only) version of the pyramid's Step 2, unlinked.

So an agent debugging a bug follows "log everything" but has no idea the
four-phase flow or the pyramid exist. The theory needs a **trigger** — a place in
the flow that says "do this."

## The Constraint: a 260k Window

This is the key fact that shapes every option. A ~260k-token window is large
enough that **context budget is not the constraint.**

- The full theory + refutations is ~6–8k tokens — roughly 3% of the window.
  Trivial to load.
- The baseline an agent already carries (`AGENTS.md` + `CLAUDE.md` + `plan.md`)
  is ~15–20k tokens. Adding the theory is a rounding error.

What this means:

1. **You are not forced to inline or summarize.** A small window would force you
   to cram the theory into `AGENTS.md` (or lose it). At 260k, the agent can read
   the full doc on demand and still have ~250k of headroom for code.
2. **The design is driven by enforcement and clarity, not budget.** The question
   is "how do I make a Qwen actually follow this," not "will it fit."
3. **On-demand reads are reliable.** Because loading the doc is cheap, a "read
   the theory when you debug" instruction is something the agent will actually
   do, not a suggestion it skips under context pressure.

The one cost that *does* scale: an **always-in-context** copy (inlined in
`AGENTS.md`) adds ~6–8k tokens to *every* session, including ones that never
debug. At 260k that's affordable (<5% of the window) but it's paying for the
theory in sessions that don't use it.

## The Surfaces (where it can live)

| Surface | Read by | Always-on? | Notes |
|---|---|---|---|
| `AGENTS.md` | every agent, every session | yes | Has the "Debugging: log everything" section — the natural home for debugging rules. |
| `CLAUDE.md` | every agent, read first | yes | Orientation + working conventions. Holds the kickoff-block spec. |
| `knowledge/AGENTS.md` | agents writing KB docs | yes (for KB work) | "Pick a knowledge theory" list (Why/How/What). The AI Use Theory is a *methodology*, not a writing framework — weak fit here. |
| Code words (`web10web10!`, `unbrick!`, `imma rant`) | strong model, operator-triggered | no (opt-in) | Rituals, not per-task. Qwens don't run these. |
| A new code word (e.g. `debug!`) | strong model, operator-triggered | no (opt-in) | Would be a deliberate deep-debug ritual. |
| Kickoff-block spec (in `CLAUDE.md`) | each Qwen workspace at start | per-workspace | The self-contained block handed to each parallel workspace. |
| Tooling / script | on invocation | no | A concrete checklist or prompt template, not just prose. |
| The theory doc itself | on demand | no | The canonical detail. Already written. |

## The Options

### Option 1 — Pointer + on-demand (always-on trigger, reference detail)

`AGENTS.md`'s Debugging section gets a short always-on rule + a link: *"When
debugging, run the AI Use Theory's four-phase flow (orient → generate → compare
→ repair) — `knowledge/.../ai-use-theory.md`. When starting new work, build the
pyramid bottom-up (KB → logs → tests → features)."* Plus the 2–3 load-bearing
one-liners inline (KB = root of trust; parallelize breadth not depth; debugging
= convergence). The full detail stays in the doc, read when relevant.

- **Pro:** lean `AGENTS.md`; always-on enforcement; the 260k window makes the
  on-demand read cheap and reliable.
- **Con:** relies on the agent actually reading the linked doc (mitigated by the
  inline one-liners surviving even if it doesn't).
- **Makes sense when:** you want always-on enforcement without bloating
  `AGENTS.md`. *This is the default recommendation.*

### Option 2 — Inline (always-on, full theory in `AGENTS.md`)

Write the four-phase flow + pyramid + assumptions directly into `AGENTS.md`.

- **Pro:** maximum enforcement; no read step; always in context; a Qwen can't
  skip what's already in front of it.
- **Con:** `AGENTS.md` +~300 lines; every session pays ~6–8k tokens even when
  not debugging; `AGENTS.md` drifts toward a grab-bag.
- **Makes sense when:** you observe Qwens *not* reading the linked doc (Option 1
  failing) and you'll pay the always-in-context cost. The 260k window makes this
  affordable — a fallback, not the first choice.

### Option 3 — Command (opt-in code word, e.g. `debug!`)

Operator types `debug!` → the strong model runs the four-phase flow as a ritual,
like `unbrick!`.

- **Pro:** deliberate; matches the existing code-word pattern; good for a "dig
  in hard" moment.
- **Con:** only fires when the operator types it; Qwens don't run code words
  (they're for the strong model); defeats the always-on enforcement the theory
  needs (the LLM is "shy about signal" — it won't do this on its own).
- **Makes sense when:** as a *complement* — a deliberate deep-debug ritual for
  the strong model — not as the primary integration.

### Option 4 — Weave into existing sections (no new home)

Distribute the theory across existing `AGENTS.md` sections: logging → the Logs
layer; "when you finish a task" → KB/changelog alignment; "before starting a
task" → the pyramid setup order.

- **Pro:** native; no new top-level section; integrates with what's already
  there.
- **Con:** the theory gets scattered; hard to keep coherent; the four-phase flow
  still needs a home.
- **Makes sense when:** combined with Option 1 (the one-liners get woven in, the
  flow gets a pointer).

### Option 5 — Kickoff-block integration (per-workspace)

Add a line to the `CLAUDE.md` kickoff-block spec so every Qwen workspace's
kickoff block says: *"Read the AI Use Theory (`knowledge/.../ai-use-theory.md`);
follow the four-phase flow when debugging; build the pyramid for new work."*

- **Pro:** every parallel workspace gets it via its kickoff; no `AGENTS.md`
  bloat; catches workspaces that would otherwise start blind.
- **Con:** only covers workspaces started via the `web10web10!` kickoff flow;
  doesn't cover ad-hoc debugging in an already-running session.
- **Makes sense when:** layered on top of Option 1 to close the new-workspace gap.

### Option 6 — Tooling (make it concrete, not just prose)

Turn parts of the flow into real artifacts: a `scripts/debug-flow` checklist or
prompt template; the `[llm-debug]` log level as an actual convention; a
"generate signal" step that emits the orient/generate/compare/repair checklist.

- **Pro:** enforceable and concrete, not just prose; the `[llm-debug]` prefix
  gives the "generate" phase a real, greppable output.
- **Con:** more work; some phases (orient: align KB↔code↔changelog) are
  judgment, not scriptable.
- **Makes sense when:** after the doc-level integration (Option 1) is in and you
  want to harden the parts that are mechanical.

## Recommended Combination

Layered, so each layer covers the gap the others leave:

1. **Primary — Option 1** (pointer + on-demand) in `AGENTS.md`'s Debugging
   section. Always-on trigger + 2–3 load-bearing one-liners inline + link to the
   doc. This is the enforcement.
2. **Reinforce — Option 5** (kickoff-block line) in `CLAUDE.md`. Every Qwen
   workspace is explicitly told to read the theory. Closes the new-workspace gap.
3. **Weave — Option 4.** The load-bearing one-liners (KB = root of trust;
   parallelize breadth not depth) land in the working-conventions sections where
   they're already half-present.
4. **Optional complement — Option 3** (`debug!` command) for the strong model, a
   deliberate deep-debug ritual. Not required; the always-on convention is the
   real integration.
5. **Harden later — Option 6.** Once 1–4 are in and you see where Qwens still
   fumble, make the mechanical parts concrete (`[llm-debug]` prefix, a
   debug-flow checklist).

Why this shape: the 260k window means you don't need Option 2 (inline) — the
on-demand read is cheap, so keep `AGENTS.md` lean. The always-on *trigger*
(Option 1) is what enforces it; the inline *one-liners* are the fallback if an
agent skips the doc; the *kickoff line* (Option 5) catches new workspaces; and
the *command* (Option 3) is a deliberate escalation, not the baseline.

## Decision Points

1. **Always-on vs opt-in?** Recommend always-on (the theory's own logic: the LLM
   won't do it voluntarily).
2. **Inline vs reference?** Recommend reference, *because* of the 260k window
   (on-demand read is cheap). Inline (Option 2) is the fallback if Qwens skip
   the doc.
3. **Which file?** `AGENTS.md`'s Debugging section is the natural home.
4. **Add a `debug!` command?** Optional complement; not the primary integration.
5. **Add the kickoff-block line?** Recommended — cheap, closes the new-workspace
   gap.
