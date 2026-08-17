# AI Readiness Assessment

[← back to overview](./overview.md)

Where we are today versus the ideal [AI Use Theory](./ai-use-theory.md) pyramid.

## The Scorecard

| Signal | Status | Notes |
|--------|--------|-------|
| **Knowledge base** | 🟡 Good, not perfect | 72 docs in `knowledge/knowledge-base/`, mostly v3. Covers media, DB, groups, social, encryption, SDK. Gaps: v4 areas, some newer features undocumented, social app internals. |
| **Logs** | 🔴 Incomplete | Some flows are dense (wapi popup auth has comprehensive logging per changelog). Most API endpoints, background jobs, and the social app are sparse. This is the biggest gap — if something breaks in an unlogged area, we're back to guessing. |
| **Code** | 🟢 Modern | TypeScript, React, bun, Vite. Stack is current. No legacy pipenv or old frameworks dragging us down. |
| **Changelog** | 🟢 Excellent | 2532 lines, detailed entries with intent captured. The changelog is one of our strongest signals — it reads like the AI understood what it built. |
| **Tests** | 🟡 Decent, uneven | ~60 unit tests across SDK, UI, social, mobile encryptor. ~17 E2E specs covering auth, social, demos, gauntlet. Good coverage in hot areas (auth, groups, consent). Gaps: API layer, background jobs, media pipeline, many UI components untested. |
| **CI/CD** | 🟢 Solid | 9 workflows: API, CD, deploy, Docker, E2E, JS CI, link health, marketing API. Pipeline is real. |

## What's Working

**The changelog is our best signal.** It's detailed, captures intent, and would serve as a strong retrospective check during debugging. An AI reading it can understand what changed and why.

**The stack is modern.** No legacy drag. TypeScript, React, bun — the AI can work in idiomatic patterns without fighting outdated tooling.

**CI/CD is real.** Tests actually run. E2E gauntlet exists. The pipeline catches regressions.

**The knowledge base is substantial.** 72 docs covering the major systems. It's not perfect, but it's not empty.

## The Gaps

**Logs are the biggest hole.** Dense logging is what turns speculative debugging into deterministic diagnosis. Right now, only the wapi auth flow has the "ridiculous" level of logging the theory calls for. Most endpoints, background jobs, and the social app are sparse. If something breaks in an unlogged area, we're back to $100 debugging loops.

**Tests are uneven.** The hot paths (auth, consent, groups) are covered. The cold paths (media pipeline, API internals, background jobs) are not. Tests in untested areas mean the AI can't verify fixes — it can only hope.

**Knowledge base has v4 gaps.** The knowledge base is mostly v3. v4 changes (ClickHouse v4, new SDK patterns, social app architecture) are partially documented. A knowledge base that doesn't cover the current code is worse than no knowledge base — it misleads the AI.

## The Verdict

We're at about **60% of the ideal** — a rough estimate, not a precise measurement. The method: each of the six signals (knowledge base, logs, code, changelog, tests, CI/CD) is roughly equally weighted. Green = full credit, yellow = half credit, red = zero. Three greens (code, changelog, CI/CD) = 3/6. Two yellows (knowledge base, tests) = 1/6. One red (logs) = 0/6. That's 4/6, or ~67%, rounded down because the yellow areas have significant gaps and the red area (logs) is the single most important signal for cheap debugging.

The foundation exists — changelog, CI/CD, modern stack, decent knowledge base, real tests. But the two signals that matter most for cheap debugging (logs and test coverage) are incomplete. We can debug cheaply in well-covered areas (auth flow, groups, consent) but still burn tokens in the gaps (media, API internals, social app internals).

## To Get to 100%

1. **Max the logs** — every API endpoint, every background job, every message boundary. This is the single highest-ROI change for AI debugging cost.
2. **Fill test gaps** — API layer, media pipeline, social app components. Prioritize areas that break often.
3. **Update knowledge base to v4** — document what changed, what's new, what's different. A knowledge base that's partially wrong is dangerous.

---

## Detailed Logging Gaps

### What's Already Good (the gold standard)

Two files already follow the ideal — dense, prefixed, at every decision point:

- **`sdk/src/browser.ts`** — 20 `[wapi]` prefixed logs covering the entire popup auth flow: open, contract, message, response, error. This is the model.
- **`ui/src/interfaces/Interface.tsx`** — 40 `[auth-ui]` prefixed logs covering consent, contract receive, approve/deny, send response. This is the model.

When something breaks in these flows, debugging is cheap because the signal exists.

### The Gaps

| Area | Functions/Handlers | Logging | Gap | Hypothetical Bug | Why Logs Would Help |
|------|--------------------|---------|-----|-------------------|---------------------|
| **API route handlers** | ~50 Python handlers | 0 request/response logs | **100%** | "Groups endpoint returning 500" — AI has no idea if it's auth, DB, validation, or a missing field. | Logs at entry (method, path, user ID), auth check, DB call, response — AI reads logs, pins it to one layer. |
| **API services** | ~100 Python functions | 2 `log.warning` calls | **~98%** | "Documents not updating" — `documentdb.py` has a logger but only logs 2 edge cases. Silent everywhere else. | Logs at every decision point — which path was taken, what was written, what was rejected. |
| **API media service** | ~10 functions | Logger declared but **never called** | **100%** | "Media upload fails" — `media.py` has `logging.getLogger("web10-media")` but zero calls. Dead code. | Log S3 client creation, presigned URL generation, upload confirm, failures. |
| **API clickhouse service** | ~30 functions | Logger declared but **never called** | **100%** | "Stats endpoint wrong" — `clickhouse.py` has a logger that never fires. | Log query, row count, aggregation result, error. |
| **Social app data layer** | ~100 async functions | 0 logs | **100%** | "Feed not loading posts" — `data/posts.ts`, `data/feed.ts`, `data/dms.ts` all silent. AI has to guess which fetch failed, which returned wrong shape, which threw. | Log at every fetch: URL, params, response shape, error. `[social]` prefix for filtering. |
| **SDK v3.ts** | ~45 methods | 0 logs | **100%** | "Contract request fails silently" — the core client has no logging. Every API call is invisible. | Log method, params, response, error. `[sdk]` prefix. |
| **SDK http.ts** | 1 function | 0 logs | **100%** | "Network request fails" — the transport layer is silent. No signal on fetch failures. | Log URL, status, body, timeout. |
| **SDK token.ts** | ~8 functions | 0 logs | **100%** | "Auth token expired" — cookie/JWT handling is invisible. | Log token present, parsed, expired, missing. |
| **UI credential pages** | ~20 form handlers | 0 logs | **100%** | "Signup form not submitting" — no signal on form state, validation, API call. | Log form submit, validation result, API response. |
| **UI settings pages** | ~30 handlers | 0 logs | **100%** | "Password change fails" — settings UI is completely silent. | Log action, validation, API call, response. |
| **Media pipeline (client)** | 7 async functions | 0 logs | **100%** | "Image thumbnail broken" — `mediaProcessing.ts` has 7 functions (processImage, generateThumbnail, captureVideoPoster…) all silent. | Log input dimensions, output size, processing time, error. |
| **Media pipeline (server)** | 5 route handlers | 0 logs | **100%** | "Media confirm fails" — server media endpoints are silent. | Log upload confirm, S3 write, metadata update. |

### Priority Order (highest ROI first)

1. **Social app data layer** — 100 async functions, zero logs. Every network call, every data shape mismatch, every auth failure is invisible. This is the most broken area for AI debugging.
2. **API route handlers** — 50 handlers, zero request/response logs. Every 500 error is a guessing game.
3. **SDK v3.ts + http.ts** — 46 methods, zero logs. The core client is the most critical path and the most silent.
4. **API media service** — logger exists but is dead code. One line to wire it up, then log the operations.
5. **UI credential + settings pages** — 50 handlers, zero logs. Auth flows are high-stakes and completely silent.
6. **Media pipeline (client)** — 7 functions, zero logs. Image/video processing is error-prone and invisible.