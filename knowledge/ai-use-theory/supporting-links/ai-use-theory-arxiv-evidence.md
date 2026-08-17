# ArXiv Evidence: AI Use Theory

[← back to overview](../overview.md) · [← AI Use Theory](../ai-use-theory.md)

Peer-reviewed papers, benchmarks, and industry deployments backing every claim in the AI Use Theory.

---

## Claim 1: LLMs excel at code translation and refactoring

See [AI Use Theory — "perfect translator" trait](../ai-use-theory.md#what-an-llm-actually-is).

LLMs are nearly perfect at mapping one well-defined code space to another — language-to-language, framework-to-framework, old-to-new.

**Google deployed production LLM refactoring at warehouse scale.** ECO, a system built by Google Research, automatically refactors production code using a fine-tuned LLM. It drove 25,000+ changed lines across 6,400 commits with a >99.5% production success rate, saving the equivalent of 500,000+ CPU cores per quarter. The task was translation: find anti-patterns, generate idiomatic edits, preserve behavior. [arxiv.org/abs/2503.15669](https://arxiv.org/abs/2503.15669) (OSDI 2026)

**LLMs translate between parallel programming languages with high accuracy.** LASSI translates OpenMP ↔ CUDA using LLMs with self-correcting compilation loops. It achieved 80% OpenMP-to-CUDA and 85% CUDA-to-OpenMP translations producing expected output, with ~78% executing within 10% of original benchmark runtime. The core task is literal translation between known spaces. [arxiv.org/abs/2407.01638](https://arxiv.org/abs/2407.01638) (IEEE CLUSTER 2024)

**Few-shot LLM refactoring preserves correctness while reducing complexity.** GPT-3.5 refactored Python programs using few-shot examples: 95.68% could be refactored, achieving 17.35% reduction in cyclomatic complexity and 25.84% decrease in lines of code while preserving semantic correctness. [arxiv.org/abs/2311.11690](https://arxiv.org/abs/2311.11690) (APSEC 2023)

**Augmented LLM code translation outperforms baseline by 4-15%.** APIRAT adds API knowledge retrieval to LLM code translation, surpassing existing methods by 4% to 15.1% in computational accuracy on CodeNet and AVATAR benchmarks. The translation task itself is the strength; context just makes it stronger. [arxiv.org/abs/2504.14852](https://arxiv.org/abs/2504.14852) (COMPSAC 2025)

---

## Claim 2: LLMs struggle with debugging, especially without signal

When an LLM hits a bug without logs, tests, or documentation to work from, it doesn't stop — it guesses, and guessing compounds.

**Long-context reasoning doesn't fix debugging failure.** A systematic evaluation on SWE-bench Verified showed that single-shot patch generation at 64K context degrades sharply: Qwen3-Coder-30B achieves only 7% resolve rate, GPT-5-nano solves zero tasks. Agentic success only comes from task decomposition into short-context steps, not from dumping more code into context. The failure modes are systematic: hallucinated diffs, wrong file targets, malformed patches. [arxiv.org/abs/2602.16069](https://arxiv.org/abs/2602.16069) (ICLR 2026)

**Even perfect file localization doesn't solve debugging.** On SWE-bench Verified, baseline repair without explicit localization resolves 44.7% of issues. Adding gold (perfect) file localization only raises this to 52.4%. The remaining failure is deeper: debugging and patch synthesis, not finding the right file. This proves the bottleneck is reasoning about the bug, not finding the code. [arxiv.org/abs/2606.30963](https://arxiv.org/abs/2606.30963) (GeCoIn 2026)

**Cascading errors make LLM debugging trajectories nearly impossible to trace.** Analysis of 486 manually annotated failed trajectories from SWE-bench Pro and Tau2Bench found that LLM agents suffer from cascading errors — each wrong guess corrupts the context for the next. Evidence for judging individual steps is scattered across distant instructions and observations. Long trajectories make it extremely difficult to identify which errors caused final failure. [arxiv.org/abs/2608.06346](https://arxiv.org/abs/2608.06346)

---

## Claim 3: LLMs overtry and make speculative changes

An LLM optimized for benchmarks will keep trying — even when trying makes things worse. Confident but wrong code changes are the default failure mode.

**LLMs produce confident but fabricated code artifacts.** Research shows that prompts encouraging "imagination" and "exhaustiveness" increase LLM package hallucination propensity. The models shift toward generating non-existent package names and fabricated APIs — with high confidence. The benchmaxing instinct: produce something plausible rather than admit uncertainty. [arxiv.org/abs/2605.29354](https://arxiv.org/abs/2605.29354)

**LLM code reasoning is "ungrounded deliberation" — rhetorical, not factual.** Analysis of LLM vulnerability detection found that agents fabricate cross-function dependencies and conclusions are driven by "rhetorical persuasiveness rather than verifiable facts." Without grounding in actual evidence (logs, test output), LLMs confidently generate incorrect code analysis. Constraining reasoning to a closed evidence boundary reduced false positive rate by up to 54.40%. [arxiv.org/abs/2603.20637](https://arxiv.org/abs/2603.20637)

**Hallucinated diffs are a systematic failure mode, not an edge case.** The same SWE-bench study found LLMs produce hallucinated diffs (changes to code that doesn't exist), target wrong files, and generate malformed patch headers — all with high confidence. These are classic overtry behaviors: the model generates plausible-looking but incorrect code changes because "trying and failing" scores higher than doing nothing on benchmarks. [arxiv.org/abs/2602.16069](https://arxiv.org/abs/2602.16069)

---

## Claim 4: Knowledge bases and documentation dramatically improve LLM output

Without accurate context, LLMs work from stale or invented assumptions. With it, they work from reality.

**Documentation raises executable code from 42% to 66%.** When APIs evolve, LLMs average only 42.55% executable code without comprehensive documentation. Providing structured documentation raises this to 66.36%. Reasoning strategies with documentation boost performance by an additional 11%. Without up-to-date context, LLMs persist in generating code using outdated patterns. [arxiv.org/abs/2604.09515](https://arxiv.org/abs/2604.09515)

**RAG with code structure triples LLM accuracy.** An AST-aware agentic approach with RAG context for documentation achieved an automated judge score of 3.44/5.0 vs. 1.91 for CodeT5-base without structural context. Providing the code structure as context substantially improves semantic correctness. [arxiv.org/abs/2605.02163](https://arxiv.org/abs/2605.02163)

**RAG-assisted LLM code translation eliminates unsafe patterns.** A RAG framework guiding LLMs with retrieved Rust documentation and compiler references for C-to-Rust transpilation improved both correctness and security, with several programs achieving complete elimination of raw pointer dereferences and unsafe type casts. Retrieved context prevents the LLM from inventing APIs. [arxiv.org/abs/2604.15485](https://arxiv.org/abs/2604.15485)

**Explicit context files are a consistent repair lever.** Providing the right context files consistently improves LLM repair rates from 44.7% (baseline) to 48.9-49.1% (predicted localization) and 52.4% (gold localization), while reducing mean elapsed time by 52-154 seconds. The right context in the window matters more than the model size. [arxiv.org/abs/2606.30963](https://arxiv.org/abs/2606.30963)

---

## Claim 5: Tests and verification improve LLM development outcomes

Tests give the LLM a binary signal. No ambiguity, no speculation, no doom loops.

**Test-driven workflows push LLMs to human-level resolution.** TDFlow decomposes repair into patch proposing, debugging, patch revision, and test generation sub-agents. With human-written tests, it achieves 88.8% pass rate on SWE-Bench Lite (27.8% absolute improvement over next best) and 94.3% on SWE-Bench Verified. Modern LLMs in test-driven workflows achieve human-level test resolution. [arxiv.org/abs/2510.23761](https://arxiv.org/abs/2510.23761) (EACL 2026)

**Without test-driven iteration, even the strongest agents fail half the time.** Analysis of repository-level synthesis showed that even the strongest LLM agents achieve only 30-55% pass rates without test-driven iteration. Self-verification via test generation is a critical direction for advancing LLM-based coding agents. [arxiv.org/abs/2605.07122](https://arxiv.org/abs/2605.07122)

**Verification loops mitigate hallucinations in autonomous generation.** Integrating self-consistency, chain-of-verification, and dual execution agreement to synthesize tests improved test validity by up to 39%, line coverage by 28%, and mutation scores by 18% over baselines. Verification loops are the antidote to hallucination. [arxiv.org/abs/2602.10522](https://arxiv.org/abs/2602.10522)

**Single-shot LLM code is insecure; only iterative verification produces secure code.** Evaluation of LLM-generated authentication code against NIST standards showed that single-shot prompts consistently omit critical security protections. Only iterative reprompting — forcing models into a contextual self-auditing verification loop — achieves comprehensive security. [arxiv.org/abs/2607.23710](https://arxiv.org/abs/2607.23710)

---

## Summary

| AI Use Theory claim | Evidence strength | Key paper |
|---|---|---|
| LLMs excel at code translation | Google production deployment, 99.5% success rate | ECO (OSDI 2026) |
| LLMs fail at debugging without signal | 7% resolve rate at 64K context, cascading errors | SWE-bench Verified (ICLR 2026) |
| LLMs overtry with speculative changes | Hallucinated diffs, ungrounded reasoning, fabricated artifacts | Multiple (2025-2026) |
| KB + documentation improves output | 42% → 66% executable code with docs | Evolving APIs (2026) |
| Tests push LLMs to human-level | 88.8% pass rate with test-driven workflow | TDFlow (EACL 2026) |

The pyramid is not a theory — it is the shape that emerges when you give an LLM what it's good at (translation) and protect it from what it's bad at (speculative debugging).
