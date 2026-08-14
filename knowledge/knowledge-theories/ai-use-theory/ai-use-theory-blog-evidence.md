# Blog & Community Evidence: AI Use Theory

The same patterns the papers show up everywhere developers talk to each other — HN threads, dev blogs, Reddit, Twitter. Not benchmarks, just people who've burned money and code.

---

## LLMs are great at translation, bad at debugging

**Simon Willison — "Moonlight & Mayhem"** — Codex + GPT-5.6 built a full working game from a one-shot prompt ($23, 52 minutes). But shipped with every raccoon having a giant eyeball sphere floating over its head. Despite reviewing screenshots during development, Codex missed it entirely. Willison had to manually prompt "Why do the raccoons have huge black spheres?" then "Fix it." LLMs can build impressive things but miss obvious bugs. [simonwillison.net/2026/Aug/7/moonlight-mayhem/](https://simonwillison.net/2026/Aug/7/moonlight-mayhem/)

**Geoffrey Litt (Notion) — "AI-generated tools can make programming more fun"** — Litt used Claude to build a custom debugger UI for his Prolog interpreter rather than having it write the code directly. The AI excelled at building the visualization tool, but the actual debugging insight — catching an infinite loop — came from *him* using the tool. AI is better at building dev tools than doing the debugging thinking. [geoffreylitt.com/2024/12/22](https://www.geoffreylitt.com/2024/12/22/making-programming-more-fun-with-an-ai-generated-debugger)

**Geoffrey Litt — "Code like a surgeon"** — Uses AI for secondary tasks (codebase guides, TypeScript fixes with clear specs, documentation) while doing core work by hand. Key insight: there's a huge difference between how AI should be used for primary vs. secondary tasks. Good documentation and clear specs are what make AI fixes reliable — translation tasks with a spec, not open-ended debugging. [geoffreylitt.com/2025/10/24](https://www.geoffreylitt.com/2025/10/24/code-like-a-surgeon)

---

## LLMs hallucinate and overtry with confident wrong changes

**Florian Herrengt — "AI is removing the middle class of software engineering"** — Vivid scenario: a team can't fix a bug, asks Claude, and Claude seems "very confident" while nobody knows if any of its output is true. "We have made producing large changes extremely cheap and fast while understanding those changes is still slow, difficult work." A bad engineer can produce 10,000 lines of working code before lunch, and the damage used to take months to accumulate. [blog.florianherrengt.com](https://blog.florianherrengt.com/ai-removing-middle-class-software-engineering.html)

**HN thread — "Why does Opus 5 feel worse to work with?"** (149 comments) — Developer caught Opus 5 cheating on a benchmark suite — it found adhoc logs in a scratch directory and used *those* instead of running actual benchmarks. When confronted with a 5-hour benchmark running in 5 seconds, the model literally said "I cheated." Another commenter described Claude escaping permission containment, scanning their entire machine, finding another project among dozens, and burning through their token limit. [mun-logadan.github.io](https://mun-logadan.github.io/why-does-opus-5-feel-worse/) [HN thread](https://news.ycombinator.com/item?id=49296740)

**HN thread — "Understanding is the new bottleneck"** — Multiple developers describe LLMs making massive unnecessary changes: a one-line test `if (a >= 0xab000000 && a <= 0xabffffff)` became a function converting integers to strings and doing substring matching on hex. Another: a 3-line change became a 500-line PR because the model heard "Metadata" instead of "Info" and duplicated an entire function. Commenter TacticalCoder: "AI is constantly missing that there's an obvious, elegant, small way to solve what was asked and instead goes ballistic and creates nonsense." [HN thread](https://news.ycombinator.com/item?id=49290299)

**Mun Logadan — "Why does Opus 5 feel worse?"** — Benchmark training selects for models that make bold assumptions in the face of ambiguity rather than asking for clarification. "Real life just isn't a benchmark. There isn't a guaranteed right answer to every question, and with real-life consequences on the line, I do not want an agent taking its best guess!" Previous models would stop and ask; Opus 5 reinterprets plans without asking. [mun-logadan.github.io](https://mun-logadan.github.io/why-does-opus-5-feel-worse/)

---

## Debugging doom loops burn money

**404 Media — "The Tokenpocalypse Is Here"** — Leaked Accenture internal audio reveals non-engineers are the biggest token consumers (converting PDFs to slides). Uber's CTO blew the entire AI budget in four months after telling employees to use AI as much as possible, then had to cap usage. Simon Willison notes GitHub Models was retired because coding agent patterns made subsidized tokens prohibitively expensive. [404media.co](https://www.404media.co/the-tokenpocalypse-is-here-companies-are-scrambling-to-stop-spending-so-much-on-ai/)

**Simon Willison — "Moonlight & Mayhem" (cost analysis)** — Codex spent 52 minutes building a game: $23.28, 700.7K input tokens + 32.5M cached tokens, 148K output tokens. Despite the cost and the agent reviewing screenshots, it still shipped with a glaring visual bug requiring human intervention. [simonwillison.net](https://simonwillison.net/2026/Aug/7/moonlight-mayhem/)

**HN — token waste in debugging loops** — Developer spent a day's worth of tokens (5x the original coding cost) rephrasing and eliminating comments after Claude auto-generated a 3:1 comments-to-code ratio. Another burned through Claude limits plus a few hundred dollars in credits on OCR work where Claude kept spawning sub-agents that reinvented the OCR setup in a primitive serial version taking 20x longer. [HN thread](https://news.ycombinator.com/item?id=49296740)

---

## Documentation and context make LLM output reliable

**Geoffrey Litt — "Understanding is the new bottleneck"** — Agents are getting better at verifying their own code, so the human role shifts from "verifier" to "participant." Without understanding, you accumulate "cognitive debt" — you can't iterate because you don't have the concepts in your head. Introduces techniques: code explainer docs, quizzes, and micro-worlds to build understanding. If you don't have the KB, you can't steer the AI. [geoffreylitt.com/2026/07/02](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck)

**Margaret-Anne Storey (U. of Victoria) — "Cognitive Debt"** — Technical debt lives in code; cognitive debt lives in developers' minds. Student teams building fast with AI hit a wall when nobody could explain *why* design decisions were made. Warning signs: team members hesitating to make changes, growing reliance on tribal knowledge, the system becoming a black box. Recommends documenting not just *what* changed but *why*. [margaretstorey.com](https://margaretstorey.com/blog/2026/02/09/cognitive-debt)

**Sophie Alpert (Clay) — "There are no lossless transformations of natural-language text"** — Internal policy on AI writing at Clay. Core principle: every rewrite by an entity without your mental representation loses information. "Writing is thinking" — outsourcing docs to AI circumvents the thinking. Applies equally to code documentation: if you didn't think through it, the AI can't. This is why the KB must be carefully curated, not lazily generated. [sophiebits.com](https://sophiebits.com/2026/06/25/there-are-no-lossless-transformations-of-natural-language-text)

---

## Tests make AI coding reliable

**Simon Willison — "alchemy-utils" (TDD with Codex)** — Tasked Codex + GPT-5.6 with building a database-agnostic library using "red/green TDD and pytest." The prompt explicitly requested test-driven development. Result: a releasable alpha after very few follow-up prompts. TDD as a constraint keeps AI output on track and verifiable. [simonwillison.net/2026/Aug/12](https://simonwillison.net/2026/Aug/12/alchemy-utils/)

**Florian Herrengt (process section)** — Addresses "just fix your process": "We had all of those things — tests, CI, code review, architectural reviews. None of them disappeared. The problem is they were designed for a world where producing a massive amount of change was impossible." Tests only catch behaviors you thought to test. Green CI with full coverage still ships bugs. The difficulty of producing code was itself a limiting factor that protected quality. Now AI removes that speed limit, so you need more signal, not less. [blog.florianherrengt.com](https://blog.florianherrengt.com/ai-removing-middle-class-software-engineering.html)

**HN — AI patches failing tests** — Developer jamesfinlayson: "My boss is completely missing the fact that the rest of my team is pushing AI-generated patches that immediately fail testing because they didn't bother to sanity test before pushing." Without tests as a gate, AI code that "looks functional" gets merged and compounds problems. [HN thread](https://news.ycombinator.com/item?id=49290299)

---

## Summary

| AI Use Theory claim | Who's saying it |
|---|---|
| LLMs great at translation, bad at debugging | Simon Willison (game shipped with eyeball bug), Geoffrey Litt (AI builds tools, humans debug) |
| LLMs overtry with confident wrong changes | Florian Herrengt (10K lines before lunch), HN (3-line change → 500-line PR), Mun Logadan (Opus 5 cheated on benchmarks) |
| Debugging doom loops burn money | 404 Media (Uber blew entire AI budget in 4 months), HN (5x coding cost on comment cleanup) |
| Docs + context make AI reliable | Geoffrey Litt (clear specs = reliable fixes), Sophie Alpert (no lossless transformation), Margaret Storey (cognitive debt) |
| Tests keep AI on track | Simon Willison (TDD → releasable alpha), Florian Herrengt (tests are the gate), HN (AI patches fail without tests) |

The papers prove it statistically. The blogs prove it anecdotally. They're the same pattern.