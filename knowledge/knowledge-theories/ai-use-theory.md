# AI Use Theory

How to use AI to build software without burning money on debugging loops.

## What an LLM Actually Is

An LLM is a language translator. That is its core capability — mapping one well-defined space to another with near-perfect accuracy. Fortran to Python. COBOL to TypeScript. 2021 React to 2026 TypeScript. Code to documentation. Conversations to structured knowledge. Literal to literal, it is almost too good at it. This is not a side effect — it is the model's primary strength, baked into how it was trained.

But an LLM is also benchmaxed. It was optimized for benchmarks like SWE-bench, where trying and failing scores higher than doing nothing. So when it hits a wall, it does not stop — it claws and tries and tries. It will riddle a codebase with speculative fixes, each one introducing new bugs, because getting a 75% on a benchmark is better than getting 0%. This is the terminator instinct: keep trying until the target is hit, even if the path is destruction.

These two traits — perfect translation and relentless overtrying — define how an LLM should be used. Give it translation tasks, and it excels. Give it open-ended debugging, and it destroys.

## The Cost of Not Doing This

On a personal web10 project, a single debugging session — no logs, no KB, no tests, just AI guessing — cost $100 in tokens. The AI would claw and try and try, re-reading the same code, making speculative fixes, breaking other things, looping. Each loop is context window + reasoning tokens. Five or ten loops and you're bleeding money with nothing to show.

With this five-step process, the same debugging drops to $5-$10. That's 10x cheaper. The difference is **signal**: logs tell the AI where the break is, tests confirm the fix, and the KB tells it what the code is supposed to do. No guessing.

## The Problem

AI is optimized for benchmarks, not for debugging. It will claw and try and try to hit a target score. It may ask for more context, but it is shy — it won't always ask for enough. And when it writes code, it defaults to industry standard: minimal logs, sleek abstractions, productionized polish. Then when something breaks, it speculatively debugs its own minimally-logged code and enters expensive doom loops.

Every speculative debug loop burns tokens on two things: re-reading the same code (context) and reasoning about what might be wrong (generation). Without signal, both are wasted.

```mermaid
flowchart TD
    A[Bug appears] --> B{Any logs?}
    B -- No --> C[Re-read all code\n~2000 tokens]
    C --> D[Guess where the break is\n~1000 tokens]
    D --> E[Apply speculative fix\n~1500 tokens]
    E --> F{Still broken?}
    F -- Yes --> C
    F -- No --> G{Tests pass?}
    G -- No tests to run --> H[Guess it works\nhope for the best]
    G -- Yes --> I[Done]

    C -.->|loop 2| C
    C -.->|loop 3| C
    C -.->|loop 4| C
    C -.->|loop 5| C

    style C fill:#f88,color:#fff
    style D fill:#f88,color:#fff
    style E fill:#f88,color:#fff
    style H fill:#f88,color:#fff
```

Each red box is a token burn. Five loops is 5 × (2000 + 1000 + 1500) = **22,500 tokens** wasted on re-reading and guessing before you even know if the fix is right. But that's the optimistic case. In a conductor.build harness with no signal, an AI can idle for hours — reading way more code than it needs, loading the wrong files into context, polluting its own context window with noise. That's $60+ burning on idle context alone, before the speculative fixes even start. At typical API pricing, a session can easily exceed $100 with nothing to show.

---

## The Eureka Moment

With the pyramid, something unexpected happens. You ask the AI to debug a bug, and it **disobeys you**. You said "fix the bug." It said "no." This is where the AI stops being a dumb code monkey and starts being an engineer — it refuses to patch symptoms because it knows a code fix on a broken foundation is temporary.

It works in three phases: **orient, generate, fix.** Each phase has branching paths — the AI can take different actions depending on what it finds.

### Phase 1: Orient — KB ↔ Code ↔ Changelog alignment

```mermaid
flowchart TD
    START["You: debug this bug"] --> REFUSE["AI: no. Let me orient first."]
    REFUSE --> LOAD["Load KB + Code + Changelog\ninto context window"]
    LOAD --> CHECK{"Do KB, Code,\nand Changelog align?"}

    CHECK -- Yes --> ORIENTED["Oriented. Proceed to generate."]
    CHECK -- KB drift --> FIX_KB["Fix KB flaw:\nupdate knowledge base\nto match reality"]
    FIX_KB --> LOAD

    CHECK -- Code drift --> FIX_CODE["Fix code drift:\ncode doesn't match\nwhat KB says it should do"]
    FIX_CODE --> LOAD

    CHECK -- Changelog obtuse --> FIX_LOG["Fix changelog:\nobscure entry means the AI that\nwrote this code didn't understand it"]
    FIX_LOG --> LOAD

    classDef prompt fill:#333,color:#fff,stroke:#fff,stroke-width:2px
    classDef refuse fill:#d32f2f,color:#fff,stroke:#fff,stroke-width:2px
    classDef orient fill:#1565c0,color:#fff,stroke:#fff,stroke-width:2px
    classDef action fill:#f57c00,color:#fff,stroke:#fff,stroke-width:2px
    classDef ok fill:#2e7d32,color:#fff,stroke:#fff,stroke-width:2px

    class START prompt
    class REFUSE refuse
    class LOAD orient
    class CHECK orient
    class FIX_KB action
    class FIX_CODE action
    class FIX_LOG action
    class ORIENTED ok
```

The AI loads three reference resources into its context window and checks them against each other. The code will almost certainly match the changelog — LLMs are nearly perfect at literal translation, so the code it wrote matches the intent it recorded. The real check is: does the knowledge base match what was built? If your words say "rectangle" but the knowledge base says "square," the AI flags the mismatch and asks. This is why the knowledge base makes sloppy chat safe — your spontaneous, inaccurate instructions are caught before the AI acts on them.

**Strategic context management:** this phase loads all the reference material before spending any tokens on test runs. If the KB is wrong, there's no point running tests yet — fix the foundation first.

### Phase 2: Generate — run tests, produce logs

```mermaid
flowchart TD
    GEN_START["Oriented. Generate signal."] --> SOURCE{"Where are the logs?"}

    SOURCE -- CI/CD has them --> PULL["Pull verbose logs from CI/CD\nbuild artifacts"]
    SOURCE -- No logs yet --> RUN["Run tests locally\nor trigger CI build"]

    PULL --> ENOUGH{"Are logs verbose\nenough to diagnose?"}
    RUN --> ENOUGH

    ENOUGH -- Yes --> GENERATED["Logs ready. Proceed to compare."]
    ENOUGH -- No --> ADD_LOGS["Add more logging to the code"]
    ADD_LOGS --> PR["Make a PR with denser logs"]
    PR --> WATCH["Watch the build"]
    WATCH --> RUN

    ENOUGH -- Missing test coverage --> ADD_TESTS["Add test gauntlet, unit test,\nor E2E test for the concern"]
    ADD_TESTS --> RUN

    classDef orient fill:#1565c0,color:#fff,stroke:#fff,stroke-width:2px
    classDef action fill:#f57c00,color:#fff,stroke:#fff,stroke-width:2px
    classDef ok fill:#2e7d32,color:#fff,stroke:#fff,stroke-width:2px

    class GEN_START orient
    class SOURCE orient
    class PULL action
    class RUN action
    class ENOUGH orient
    class ADD_LOGS action
    class PR action
    class WATCH action
    class ADD_TESTS action
    class GENERATED ok
```

Now oriented, the AI needs signal. The logs come from test runs — you can't analyze logs you don't have. It first checks CI/CD: if a recent build ran tests with verbose logging, it pulls those logs directly. No booting a local stack, no waiting. If CI/CD logs aren't available or aren't verbose enough, it either runs tests locally or makes a PR to add denser logging, then watches the build.

If the concern isn't covered by existing tests, the AI writes a test gauntlet, unit test, or E2E test to exercise the specific code path — then runs it to produce the logs. This is the generate step: produce the signal before analyzing it.

### Phase 3: Compare — logs vs expectation, then fix

```mermaid
flowchart TD
    COMP_START["Logs generated. Compare."] --> COMPARE{"Do logs match expectation\nfrom the aligned KB/Code/Changelog?"}

    COMPARE -- Yes --> TEST_CHECK{"Does the test pass?"}
    TEST_CHECK -- Yes --> DONE["Done. Bug fixed."]
    TEST_CHECK -- No --> WRONG_EXP["Expectation is wrong.\nGo back to Orient — fix KB."]
    WRONG_EXP --> ORIENT_AGAIN["Re-orient with corrected KB"]

    COMPARE -- No --> DIVERGE["Runtime path diverged from expectation"]
    DIVERGE --> DIAGNOSE{"What's missing?"}

    DIAGNOSE -- KB incomplete --> MORE_KB["KB doesn't cover this path.\nAdd to knowledge base."]
    MORE_KB --> ORIENT_AGAIN

    DIAGNOSE -- Logs too thin --> MORE_LOGS["Logs don't show enough detail.\nGo back to Generate — add logs."]
    MORE_LOGS --> GEN_AGAIN["Re-generate with denser logs"]

    DIAGNOSE -- Code bug --> FIX_BUG["Found the bug.\nOne targeted code change."]
    FIX_BUG --> VERIFY["Run tests to verify"]
    VERIFY --> DONE

    classDef orient fill:#1565c0,color:#fff,stroke:#fff,stroke-width:2px
    classDef action fill:#f57c00,color:#fff,stroke:#fff,stroke-width:2px
    classDef ok fill:#2e7d32,color:#fff,stroke:#fff,stroke-width:2px

    class COMP_START orient
    class COMPARE orient
    class DIVERGE orient
    class DIAGNOSE orient
    class MORE_KB action
    class MORE_LOGS action
    class FIX_BUG action
    class WRONG_EXP action
    class ORIENT_AGAIN action
    class GEN_AGAIN action
    class VERIFY action
    class DONE ok
```

This is the creative part. The AI has everything: the aligned KB, code, changelog, and now the logs. It compares what actually happened (logs) against what should have happened (KB + changelog expectation). Several things can go wrong, and each has a specific response:

- **Logs match expectation but test fails** — the expectation itself is wrong. The KB needs correction. Loop back to orient.
- **Logs show a path the KB doesn't cover** — the knowledge base is incomplete. Add the missing knowledge, re-orient.
- **Logs are too thin to diagnose** — not enough logging. Loop back to generate: add logs, make a PR, watch the build, re-run.
- **Logs show the bug clearly** — one targeted code change. Run tests to verify. Done.

Every branch is deterministic. No guessing. No speculative fixes. No doom loops.

That refusal — that disobedience at the start — is what saves the money. Because a code fix on a broken foundation is always temporary. Fixing the foundation makes the code fix permanent.

## The Pyramid

The pyramid is built from the LLM's two traits. Steps 1 and 3 are **translation tasks** — the LLM's strength. Steps 2, 4, and 5 create the **signal** that prevents the LLM's weakness (speculative overtrying) from burning money. Build from the bottom up:

```
           ┌───────┐
           │  STEP  │   Build features — fast, confident, debuggable
           │  FIVE  │
         ┌─┤       ├─┐
         │ └───────┘ │
         │  STEP 4   │   Tests — binary signal, no ambiguity
         │           │
       ┌─┤         ├─┐
       │ │  STEP 3 │ │
       │ │         │ │
       ├─┤ STEP 2  ├─┤   Logs — deterministic diagnosis, no guessing
       │ │         │ │
       ├─┤         ├─┤
       │ │ STEP 1  │ │   KB — the AI knows what to build before it builds it
       └─┤         ├─┘
         └─────────┘
```

### Step 1: Perfect the Knowledge Base

Before writing any code, the AI must understand what the code is supposed to do. Code → Knowledge base. Conversations → Knowledge base. The KB should read like it was written by a person, not generated lazily. If the KB is inaccurate, incomplete, or contradictory, the AI will build the wrong thing and you won't know until it's too late.

**This step is the foundation.** A shitty KB is the root cause of every "why did the AI do that" moment. Without it, the AI is guessing at intent — and guessing costs tokens.

### Step 2: Max the Logs

Every piece of code gets ridiculous levels of logging. Cover the entire API surface. Log every step of the way. Prefix logs so they're filterable. Log payloads, log decision paths, log errors with full context.

The reasoning is simple: if something breaks, the logs are the signal. Dense logging turns speculative debugging into deterministic diagnosis. Instead of the AI re-reading code and guessing where the break is, it reads the logs and knows. That's the difference between $100 and $10 in debug tokens.

### Step 3: Modernize the Stack

Low-hanging fruit. pipenv → ux. 2021 React → 2026 TypeScript. These are translation tasks — AI is good at them. Get the stack current so the codebase is maintainable and the AI can work in idiomatic patterns.

### Step 4: Make Tests for Everything

Unit tests. E2E tests. Gauntlets. Tests give the AI a deterministic way to verify its work instead of guessing. A test that fails is a clearer signal than a log that's missing — and tests are cheaper to fix than debugging sessions. One failing test tells the AI exactly what's wrong. No loops.

### Step 5: Build New Features

Only after the above is the codebase truly debuggable and the AI's understanding of intent is solid. The AGENTS.md makes the AI aware of the KB. The plans make it aware of what to build. The tests make it aware of what "done" looks like. Now features can be built with confidence.

## Why This Saves Tokens

Each layer of the pyramid eliminates a category of token waste:

| Layer | Without It | With It |
|-------|-----------|---------|
| KB | AI guesses intent, builds wrong, re-builds | AI knows what to build, first attempt is right |
| Logs | AI re-reads code, speculates, loops | AI reads logs, pinpoints the break, fixes once |
| Stack | AI fights outdated patterns, works around broken tooling | AI works in idiomatic code, fewer surprises |
| Changelog | AI can't see if the code was understood when written; obtuse code gets obtuse fixes | AI sees the intention behind every change; an obtuse changelog flags an oversight — even in a simple patch, the AI might have missed an edge case it didn't consider |
| Tests | AI guesses if a fix works, re-runs, re-breaks | AI runs tests, binary pass/fail, done |

On an ambiguous, rapidly developing product — where requirements change, the API surface shifts, and nothing is stable — this pyramid is not optional. Without it, every change introduces new debugging debt. With it, debugging is cheap and deterministic.

## Why This Works

This approach suits the strengths of an LLM:

- **Translation over invention.** AI is great at mapping between known spaces. Steps 1 and 3 are translation tasks.
- **Signal over speculation.** Dense logging (Step 2) gives AI the context it needs to debug deterministically instead of guessing.
- **Verification over faith.** Tests (Step 4) give AI a binary signal: pass or fail. No ambiguity, no doom loops.
- **Knowledge over assumptions.** A perfect KB (Step 1) means the AI understands intent before touching code.
- **Disobedience over compliance.** The AI refuses to patch symptoms. It works the six signals — user input, KB, code, logs, changelog, tests — and fixes the broken layer, not just the code. That refusal is what makes debugging cheap.

## The Alternative

Skip the KB, write minimal logs, modernize the stack, and start building features. The AI will build the wrong thing, break things, and enter debugging loops with no signal to work from. Every loop is context + reasoning tokens. Five loops is $100. Ten is $200.

The five-step process is the only way to use AI that doesn't waste money. It takes patience upfront — building the foundation — but it makes every dollar spent on AI features actually buy features instead of debugging.