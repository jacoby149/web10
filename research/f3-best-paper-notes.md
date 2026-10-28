# F3 (SIGMOD 2025 Best Paper) — Structural Notes + Contrast with web10

**Paper:** "F3: The Open-Source Data File Format for the Future"
**Authors:** Xinyu Zeng, Ruijun Meng, Martin Prammer, Wes McKinney, Jignesh M. Patel, Andrew Pavlo, Huanchen Zhang (Tsinghua + CMU + Posit)
**Venue:** SIGMOD 2025 (Proc. ACM Manag. Data 3(4), Article 245), 27 pages
**Award:** Best Paper

---

## 1. Paper structure (section by section)

| § | Title | Pages (approx) | What it does |
|---|---|---|---|
| 1 | Introduction | 1–3 | Problem (Parquet/ORC are 10+ yrs old, built for different hardware/workloads), why existing "new format" proposals make the same mistake, the F3 pitch (interoperability + extensibility + efficiency simultaneously), 3 contributions |
| 2 | Background and Motivation | 3–5 | 2.1 Columnar formats (PAX layout, encodings, nested data, indexing) — the reader's shared vocabulary. 2.2 Interoperability & extensibility — the two properties that matter, with **real-world evidence** (300 Parquet files from public S3 buckets showing most only use v1 features) |
| 3 | F3 Overview | 5–6 | Figure 2 (the file structure diagram) + a paragraph mapping each component to its section. The "here's the whole system in one figure" moment |
| 4 | Metadata | 6–7 | The metadata design (OptData, ColMetadata, Footer, Postscript). Why it eliminates Parquet's deserialization overhead |
| 5 | Data Layout | 7–10 | 5.1 Decoupled I/O Unit, 5.2 Flexible Dictionary Scope, 5.3 Nested Data Handling. Each is a design decision with a "why not the alternative" argument |
| 6 | Decoders | 10–16 | The core novelty. 6.1 Decoding API, 6.2 Embedded Wasm Decoders, 6.3 Wasm Decoder Implementation, 6.4 Combining Native and Wasm, 6.5 Discussion. **6 of 27 pages** — the contribution gets the most space |
| 7 | Evaluation | 16–23 | 7.1 Setup, 7.2 Metadata Overhead, 7.3 Compression + Throughput, 7.4 Random Access, 7.5 Decoupled IOUnit, 7.6 Dictionary Scopes, 7.7 Wasm Decoder Evaluation (4 sub-experiments), 7.8 Data Integrity Overhead. **7 of 27 pages** |
| 8 | Related Works | 23–24 | 3 paragraphs: existing formats, format extensibility, Wasm in databases. Each paragraph positions F3 against 3–5 specific systems |
| 9 | Conclusion | 24 | 4 sentences |
| — | References | 24–27 | ~87 references |

**Page budget (27 pages total, ~24 content + 3 refs):**
- Intro: 3pp (12%)
- Background/Motivation: 2pp (8%)
- System (Overview + Metadata + Layout + Decoders): 11pp (46%)
- Evaluation: 7pp (29%)
- Related Work: 1pp (4%)
- Conclusion: <1pp

---

## 2. What makes it a Best Paper (the structural moves)

### 2.1 The claim is a trilemma, not a monolemma

F3 doesn't claim "we built a fast file format." It claims **three properties simultaneously** that prior work treated as a tradeoff triangle (Table 1: Interoperability × Extensibility × Efficiency). Every prior system picks two corners; F3 claims all three. The intro spends a full paragraph on why the triangle is a real tradeoff (proprietary = efficient but not interoperable; Parquet/ORC = interoperable but not extensible in practice).

**The move:** name the tradeoff triangle explicitly, show prior work lives on the edges, then claim the center.

### 2.2 Real-world evidence in the motivation, not just the evaluation

Section 2.2 doesn't just argue "interoperability matters" abstractly. It **collected ~300 Parquet files from public object stores** and showed (Figure 1) that most only use v1 (2013) features despite being written by post-2020 software. That's a motivation section that *is* a mini-evaluation. The reviewer can't dismiss the problem as hypothetical because the authors went and counted.

**The move:** the motivation section contains empirical evidence that the problem is real and prevalent, not just theoretically possible.

### 2.3 The contribution gets 46% of the paper

The Decoders section (§6) is 6 of 27 pages — the single largest section. The system description (Overview + Metadata + Layout + Decoders) is 11 pages. The paper is *about* the design, not about the benchmark. The evaluation exists to validate the design, not to be the star.

**The move:** the novel contribution (Wasm-embedded decoders) gets the most space. The evaluation is large (7pp) but it's in service of the design, not the other way around.

### 2.4 Evaluation answers specific questions, not "is it fast"

Each evaluation subsection opens with the question it answers:
- 7.2: "What is the metadata overhead under wide-table projection?"
- 7.4: "How does random access compare across formats?"
- 7.7: "Can Wasm decoding match native? How large is the Wasm binary? What's the AOT compile time? What's the end-to-end impact? How does it enable extensibility?"

The Wasm evaluation (§7.7) alone has **4 sub-experiments** (microbenchmark, binary size + compile time, end-to-end file read, extensibility demo). Each sub-experiment answers one question from the list at the top of the section.

**The move:** the evaluation is structured as a Q&A. Each subsection answers a named question. The reader always knows why they're looking at the chart.

### 2.5 Head-to-head against every relevant baseline

The evaluation compares against **6 formats**: Parquet, ORC, Lance, Vortex, Nimble, BtrBlocks. Not just the obvious incumbent (Parquet) but every system that could claim to be the alternative. BtrBlocks is explicitly excluded with a fairness justification (limited data types, no metadata support) — the authors show they considered it and explain why it's not in the chart.

**The move:** the baseline set is exhaustive. Exclusions are justified, not silent.

### 2.6 The "honest caveat" pattern

F3 reports its own weaknesses:
- "F3 achieves comparable or superior decompression throughput to Parquet, **albeit with a slightly worse compression ratio**" (§7.3)
- "Wasm-based decoding kernels experience a slowdown of up to 46% when decoding strings" (§7.7)
- "BtrBlocks... we therefore did not include it to ensure fairness" (§7.1)

The paper doesn't hide the tradeoffs. It names them, quantifies them, and argues they're acceptable given the benefits.

**The move:** report the number that hurts, then argue why it's the right tradeoff. A reviewer who finds the weakness themselves trusts the paper less than one who reads it in the paper.

### 2.7 Related Work is 1 page, 3 paragraphs, every sentence positions

The Related Work section is not a survey. It's 3 paragraphs, each one a positioning statement:
- "Existing formats: Parquet/ORC are studied [cites]. Lance/Nimble/Bullion are newer. Lance's layout is similar to F3 (both separate I/O from row group) — **however** F3 preserves the row group and allows more flexibility."
- "Extensibility: extending Nimble requires a C++ PR + fleet upgrade. **In contrast**, F3's Wasm plug-in allows any language, no core update."
- "Wasm in DBs: DuckDB/Umbra/Haffner/Sok used Wasm for X. **None** explored Wasm as a format extension mechanism."

Every paragraph ends with the "here's what F3 has that they don't" sentence.

**The move:** related work is positioning, not surveying. Each paragraph is "they did X, here's the gap, F3 fills it."

### 2.8 The intro's contribution list is 3 items, each one sentence

> "First, we introduce the F3 specification that addresses many inefficient file layout designs in previous formats. Second, we propose a plug-in-based decoding API that allows the embedding Wasm binaries of the decoding implementation in the file... Lastly, we evaluate the performance of F3's layout design considerations and the Wasm-embedding mechanism on real-world data sets."

Three contributions. Each is one sentence. The first two are the design (spec + API). The third is the evaluation. No fourth "we also built a prototype" item.

**The move:** 3 contributions, max. Design, mechanism, evaluation. Each one sentence.

### 2.9 The figure that maps the paper

Figure 2 (the F3 file structure) has **blue section labels** (§4, §5.1, §5.2, §5.3, §6) mapped onto the diagram. The reader can look at the figure and know which section explains which part. The figure is a table of contents.

**The move:** the overview figure is annotated with section references. It's a visual TOC.

### 2.10 7 authors, 3 institutions, industry + academic mix

Tsinghua (3), CMU (3), Posit PBC (1 — Wes McKinney, the pandas/Arrow creator). The industry author signals "this is real, not a toy." The academic authors signal "this is rigorous." The mix is the credibility.

---

## 3. Contrast: what web10's paper has vs. what F3 has

### 3.1 The claim structure

| | F3 | web10 (workshop draft) |
|---|---|---|
| Claim shape | Trilemma: interop + extensibility + efficiency simultaneously | Monolemma: "IAM to the front" (one claim) |
| Tradeoff named? | Yes — Table 1 (the triangle) | No — the gap is stated but not as a named tradeoff |
| Prior work's position | "They pick 2 corners" | "They lack the combination" (weaker — doesn't explain *why* they can't have it) |

**What's missing:** web10 doesn't name a tradeoff triangle. The access model is presented as "new," but the paper doesn't show *why* prior systems can't have it (Solid's per-Pod architecture makes cross-user queries intractable — that's the tradeoff, but it's buried in Related Work, not named in the Intro as the structural reason). The Intro should say: "There's a triangle: user-ownership × fine-grained access × query performance. Solid picks ownership + access but not performance. ActivityPub picks performance + access but not ownership. Cloud IAM picks access + performance but not ownership. web10 claims all three."

### 3.2 Motivation evidence

| | F3 | web10 |
|---|---|---|
| Empirical motivation | Yes — 300 Parquet files from S3, showing v1-only feature usage | No — the motivation is argumentative ("platforms solve engagement well, ownership poorly") |
| Problem prevalence | Quantified (most files don't use new features) | Qualitative (users can't leave with their data) |

**What's missing:** web10's motivation is a value argument, not an empirical one. F3 went and *counted*. web10 could go and count: "We analyzed N social platforms' data-export APIs. M of them don't support group-level access control. K of them don't allow the user to define roles." Or: "We instrumented web10 for N weeks. X% of access decisions were group/role checks that a follow/block model cannot express." The motivation needs a number that proves the problem is real and prevalent, not just philosophically correct.

### 3.3 Contribution space allocation

| | F3 (27pp) | web10 workshop (5pp) | web10 SIGMOD target (12pp) |
|---|---|---|---|
| System/design | 11pp (46%) | 3pp (60%) | ~5pp (42%) — on track |
| Evaluation | 7pp (29%) | 0.5pp (10%) — "extended version" stub | ~3pp (25%) — **the gap** |
| Related Work | 1pp (4%) | 0.5pp (10%) | ~1pp (8%) — on track |
| Intro | 3pp (12%) | 1.5pp (30%) | ~2pp (17%) — on track |

**What's missing:** the evaluation. F3's evaluation is 29% of the paper. web10's workshop evaluation is a stub ("the extended version adds..."). For the 12-page SIGMOD paper, the evaluation needs to be ~3 pages of real numbers. That's E1–E6 in the plan, and it's the critical path.

### 3.4 Evaluation structure

| | F3 | web10 (planned) |
|---|---|---|
| Structure | Q&A: each subsection answers a named question | Metric list: scale, latency, cost, case study, conformance, methodology |
| Baselines | 6 formats, head-to-head, exclusions justified | "A conventional shared-DB backend" (singular, unspecified) |
| Sub-experiments | 4 in the Wasm section alone | Not specified |
| Honest caveats | Yes (worse compression ratio, 46% Wasm slowdown) | Not yet (the "data policy, not privacy" section is the closest) |

**What's missing:**
1. **The evaluation needs to be Q&A, not a metric list.** Instead of "we report p50/p95/p99 latency," it should be "Q: Is the access-check overhead measurable against the data read? A: No — the resolve+compute phase is Xms at p99, Y% of the total read latency, because the role check is an index lookup into small metadata tables, not a per-document scan." Each subsection answers a question a reviewer will ask.
2. **The baseline needs to be specific.** F3 names 6 formats with versions. web10's "a conventional shared-DB backend" is vague. It should be: "We built the same social app on Postgres with row-level security (PostgreSQL 16, RLS policies per group) and on a shared-table ClickHouse (no per-user key-space, RLS via WHERE author_key = current_user)." Name the system, the version, the configuration.
3. **The honest caveats need to be in the evaluation, not the discussion.** F3 reports its worse compression ratio in §7.3 (the results section), not in a "limitations" section. web10's "data policy, not privacy" caveat is in the system section. The cost of the per-user key-space (more storage, more metadata) should be in the evaluation with numbers, not argued in the system section.

### 3.5 Related Work

| | F3 | web10 |
|---|---|---|
| Length | 1pp, 3 paragraphs | 0.5pp (workshop), planned ~1pp (SIGMOD) |
| Structure | Positioning: "they did X, gap is Y, F3 has Z" | Survey: "here's what each system did" |
| Gap check | Implicit (each paragraph ends with the gap) | Explicit but NOT DONE (all TODO citations, no [CONFIRMED GAP]) |

**What's missing:** the gap check. `related-work.md` has all TODO citations and empty status boxes. F3's related work is 1 page of positioning, not a survey. web10's related work needs to be rewritten from "here's what Solid/ActivityPub/ATProto/IAM did" to "Solid has ownership but not performance (here's why: per-Pod architecture), ActivityPub has performance but not ownership (here's why: server-owned data), IAM has access but not user-ownership (here's why: infrastructure boundary). web10 is the only system with all three."

### 3.6 The "real system" credibility

| | F3 | web10 |
|---|---|---|
| Authors | 7, 3 institutions, industry + academic | 1 (planned), 1 institution (web10 Inc.) |
| "It's real" signal | Wes McKinney (pandas/Arrow) as co-author; open-source repo; comparisons against production formats | "Deployed and running" (the README's "unfair advantage"); 267→1 feed number |
| Open source | Yes (github.com/future-file-format) | Yes (the repo) |

**What's missing:** the authorship question. F3 has 7 authors from 3 institutions. web10 is planned as 1 author from 1 institution. For SIGMOD industry track, a single founder is defensible (the system is real, it's deployed), but it's weaker than F3's credibility stack. Options: (a) add a second author (a collaborator, a mentor, a CS professor who can vouch for the rigor), (b) lean harder on the "deployed and running" evidence (production numbers, uptime, user count) to compensate for the single-author thinness.

### 3.7 The figure that maps the paper

| | F3 | web10 |
|---|---|---|
| Overview figure | Figure 2: file structure with §4, §5.1, §5.2, §5.3, §6 labels | None (the workshop paper has fig-feed.png and fig-groups.png, but no system-overview figure) |

**What's missing:** a system overview figure that maps the paper. The web10 paper needs a Figure 1 that shows: the node (documents table + metadata tables), the two trust layers (app contract + group role), the query boundary (the CTE injection), and the read path (resolve → compute → scan). With section labels (§Access Model, §Enforcement, §Evaluation). The reader should be able to look at the figure and know the paper's structure.

### 3.8 The "why not the alternative" argument

| | F3 | web10 |
|---|---|---|
| Present? | Yes — every design decision has a "why not X" (why not Parquet's row group? why not ORC's L&P? why not a static RLS predicate?) | Partially — the "wall, not a membrane" section is excellent (why not output-side filtering? why not ClickHouse RLS?), but the access model section doesn't have the same "why not X" for each design choice |

**What's missing:** the access model section needs "why not X" for each design decision:
- Why not a separate visibility table? (Answer: publicness is a grant, not a flag — but this is stated as a design choice, not argued against the alternative)
- Why not multi-role stacking? (Answer: the per-service map makes a single role fully expressive — but the "why not multi-role" isn't argued)
- Why not ABAC? (Answer: not stated. The paper uses RBAC-style roles but doesn't say why not attribute-based)
- Why not a separate auth service? (Answer: not stated. The enforcement is at the query layer, but why not a sidecar auth service?)

F3's pattern: each design decision is a paragraph that says "the obvious approach is X. X fails because Y. We do Z instead. Z gives us W." The web10 access model section needs this pattern for each of its 4 subsections.

---

## 4. The gap list (what to add to the web10 paper, prioritized)

### P0 — without these, the paper is not competitive

1. **The evaluation (3 pages, real numbers).** E1–E6 from the plan. Q&A structure, not a metric list. Specific baselines (Postgres 16 + RLS, shared-table ClickHouse). Honest caveats with numbers (the cost of per-user key-space). This is the single biggest gap. F3's evaluation is 29% of the paper; web10's is currently 0%.

2. **The tradeoff triangle in the Intro.** Name it: user-ownership × fine-grained access × query performance. Show prior work on the edges (Solid = ownership + access, no performance; ActivityPub = performance + access, no ownership; IAM = access + performance, no ownership). Claim the center. This is the F3 Table 1 move.

3. **The gap check in Related Work.** `related-work.md` is all TODO. The gap must be `[YES]` before the Related Work section freezes. Rewrite from survey to positioning (1 page, 3 paragraphs, each ending with "here's what web10 has that they don't").

### P1 — these make the paper strong, not just acceptable

4. **The system overview figure (Figure 1).** The node + two trust layers + query boundary + read path, with section labels. The visual TOC.

5. **Empirical motivation.** A number in the motivation section that proves the problem is prevalent. "We analyzed N platforms' export APIs" or "X% of web10's access decisions are group/role checks that follow/block cannot express."

6. **"Why not X" for each access-model design decision.** The wall-not-membrane section has this pattern; the access model section doesn't. Add it: why not a visibility table, why not multi-role, why not ABAC, why not a separate auth service.

7. **The baseline, specified.** Not "a conventional backend" but "PostgreSQL 16 with RLS policies per group, same schema, same workload" + "ClickHouse shared table with WHERE author_key filter, same workload." Name the versions, the configs, the workload.

### P2 — these are polish, not structure

8. **Authorship.** Consider a second author (a collaborator or academic advisor) to match F3's credibility stack. If single-author, lean harder on the production evidence.

9. **The 3-contribution intro list.** The workshop paper has 3 contributions (generic node, access model, proof it's fast). That's the right shape. Keep it. Make each one sentence.

10. **The honest caveat in the evaluation, not the discussion.** The "data policy, not privacy" section is in the system description. Move the *cost* of that choice (the node can read your data — here's what that costs in trust, here's the terms-level mitigation) into the evaluation with the conformance results.

---

## 5. The one-paragraph summary

F3 won Best Paper because it (1) named a tradeoff triangle that prior work treated as a monolemma, (2) brought empirical evidence to the motivation (300 files from S3), (3) gave the novel contribution 46% of the page budget, (4) structured the evaluation as Q&A with 6 named baselines and honest caveats, (5) made Related Work a 1-page positioning statement, not a survey, and (6) had a 7-author, 3-institution, industry+academic credibility stack. web10 has the system and the "it's real" evidence (the unfair advantage), but the paper is missing the evaluation (P0), the tradeoff triangle (P0), the gap check (P0), the overview figure (P1), the empirical motivation (P1), and the "why not X" pattern in the access model (P1). The workshop draft is 40% of the paper; the missing 60% is mostly the evaluation and the structural moves that make a SIGMOD reviewer say "this is real and this is new."
