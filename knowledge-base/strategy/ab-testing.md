# Experimentation program (A/B testing)

Status: planned (17.11.2026). Lane: `ab-testing` in `parallel-execution.md`.
This is web10's general experimentation capability — how we run controlled
experiments on any surface. It does not depend on any specific experiment;
the classic-homepage test from `homepage-classic-revival.md` Phase 4 is the
intended first candidate, nothing more.

## Why

web10 competes on experience (D56 intent, D103 vendor): measurement exists
to make that true. Today every surface decision — landing copy, onboarding,
affordances, defaults — is intuition plus anecdote. The operator wants
experimentation as a standing capability, not a one-off for one homepage.
PostHog already ships deterministic flag evaluation plus experiment
reporting; the work is opening that surface generally inside the D103-
hardened telemetry stack without breaking the invariants that got us here.

## Scope — surfaces and treatment types

| Surface | Treatment types | Flag evaluation | Phase |
|---|---|---|---|
| marketing-ui (landing, docs site) | copy, layout, CTA, page composition | client-side, assigned per anonymous session | 1 |
| web10-social | onboarding, affordances, copy, user-visible defaults | client-side, assigned **per person after identify resolves** | 2 |
| ui/ (authenticator) | — | excluded by default: app -> authenticator credential/consent exchange requires separate review | — |
| node-served data (feed order, ad density, sort defaults) | data treatments | none until the generic node flag seam (§ seam) | 3 |

**Client-side-only rule (phases 1–2):** a variant must be fully realizable
in the client's rendering. No experiment may depend on node behavior, and
the client never dictates a data treatment. That is what keeps D60 intact:
the node doesn't learn about experiments, and an app can't smuggle a
treatment into a query.

**The generic node flag seam (phase 3, protocol decision — not a build
commitment of this lane).** When data treatments become worth testing, the
primitive must be universal (a notes app and a social app consume it
identically — the D60 test). Candidate shapes:
- node-side PostHog server SDK, gated by the existing operator config
  (`posthog_enabled` + key in node settings); vendor sees a hashed
  person/device, no content; config fails closed to "no flags"; or
- an operator-managed flag set served via the existing `GET /telemetry`
  config — node-level, not per-user. That is a rollout mechanism, not an
  A/B; label it as such when used.
Admission when wanted: its own task, a D-number, review of the new
API -> PostHog service exchange for flag decisions, and operator
admission. Until then the seam does not exist, and experiments stay
presentation-layer.

## Grounding (17.11.2026)

- **D103, PostHog only.** `@web10/telemetry` (`marketing/shared/telemetry/`)
  wraps posthog-js 1.447.3. Node config `GET /telemetry` carries the master
  switch: `posthog_enabled` (default off), project key, host (allowlisted
  us/eu). Disabled → SDK not initialized, nothing sent, zero flags.
- **Explicit wire gate.** `sanitizeEvent` drops every event not in the
  `EVENTS` allowlist and every property not in the SDK-ids / campaign-utms /
  `STRUCTURAL` sets. Content-free by construction (D56/D41).
- **Attribution chain (built, unproven).** Landing → `_w10a` acquisition
  ticket (sessionStorage) + allowlisted utm params → decorated trusted-
  origin links → auth-ui handoff → `POST /analytics/context` → campaign
  properties → node-verified `POST /analytics/identity` → `w10_<sha256>`
  person, anon device id merged via `$identify`. A signup therefore joins
  the anonymous session that saw the landing — the experiment report can
  attribute it to the arm. That is a design claim; AB-02 makes it evidence.
- **Deliberate hardening (the delta we open).** `posthogOptions` sets
  `disable_web_experiments: true` and `advanced_disable_feature_flags: true`
  for every app; autocapture off; sessionStorage persistence; no IP; no
  external dependency loading.

## The deltas (what the program builds)

1. **Generic per-app flag option** in the shared package: `posthogOptions`
   gains an app-scoped flags switch designed generically from day one —
   marketing-ui on in phase 1, web10-social on in phase 2 (a one-line flip
   plus its EVENTS additions, not a redesign), auth-ui off.
   `disable_web_experiments` stays `true` everywhere: variants render in
   code, never in PostHog's visual editor.
2. **Wire-gate passthrough** for `$feature/<flag>` (slug-validated) and
   `$feature_enrollment` — posthog-js attaches these to captured events
   once flags are live; the current gate silently drops them, which would
   blind the experiment reports. Red/green: flags off → zero flag
   properties on the wire; flags on → they survive.
3. **Tracker `flag(name): string | boolean | null`** + per-app pass-throughs
   (marketing-ui first). **Null renders the control experience** — a
   disabled node, a missing key, or a failed `/decide` call must be
   indistinguishable from control, and an experiment must never break the
   page.
4. **Assignment rule.** Anonymous surfaces: PostHog hashes the distinct id
   — stable within a session/tab; sessionStorage persistence means a closed
   tab can re-roll. Document that; the signup handoff happens inside the
   same tab session, which is what attribution needs. Identified surfaces
   (social): evaluate **after `identify()` resolves**, so assignment is per
   `w10_` person — stable across tabs, devices, and sessions, and merged
   with the account the way every other web10 identity is.
5. **Attribution proof** (AB-02): synthetic replay + connected-stack
   receipt that a signup joins the session/person that carried the variant.

## Experiment contract (every experiment, any surface, no exceptions)

Pre-declared in `knowledge-base/strategy/experiments.md` **before the first
visit of the window**:

- hypothesis (falsifiable, one sentence)
- surface, variants (named; one marked control), and which client
  realization each variant is (the client-side-only rule checked here)
- **primary metric: exactly one**, placed on the metric ladder below
- guardrail metrics: error beacons per pageview/session; abandonment of the
  flow under test; primary-metric regression on the opposite arm; for
  social, activation (first post/follow) alongside the conversion metric
- window: `max(N days, M visits-or-sessions per arm)` from the sample-size
  table
- minimum lift to ship; **no peeking** — one read at the end
- dated operator approval line

**Metric ladder** — engagement (depth, CTA clicks) → conversion (signup)
→ activation (first post/follow within N days) → retention. Declare which
rung the primary sits on. Signup is a middle rung: a variant that lifts
signups but breaks activation is a liability, so conversion experiments
carry activation as a declared guardrail, not an afterthought.

**Concurrency** — at most one active experiment per surface + primary-
metric combination; no overlapping experiments on the same funnel step; a
new experiment starts only after the previous outcome is recorded.

**End of window** — SRM check first: chi-square on the actual variant
split; >1 % deviation from the configured ratio invalidates the run (bot
traffic, flag flapping, identity churn) and it reruns or dies. Then the
single read, then the outcome — ship / iterate / kill — recorded in
`experiments.md` with the numbers, and a `decisions.md` D-number when the
outcome changes what we build.

Sample size (two-sided 95 % confidence, 80 % power, metric = share of
arm traffic completing the primary action):

| Baseline | Lift to detect | Visits/sessions per arm |
|---|---|---|
| 2 % | 3 % (+50 % rel.) | ~4,000 |
| 3 % | 5 % (+67 % rel.) | ~1,500 |
| 5 % | 8 % (+60 % rel.) | ~1,100 |

If the traffic can't fill one arm inside ~8 weeks, a formal A/B is not
runnable on that metric — fall back to observational comparison (separate
routes, longer horizon) and say so plainly rather than fake significance.

**Long horizon.** Presentation effects decay; run the window, read once,
record, move on. Do not keep watching a finished experiment — that is
peeking with better manners.

## Scope / non-goals

- **No server-side flags until the seam lands** (phase 3: protocol decision
  + D-number + security review + operator admission).
- **No experiments on consent/authority surfaces** (`auth-ui`) without a
  separate review of the app -> authenticator credential/consent exchange.
- **No PostHog visual/web experiments** (`disable_web_experiments` stays
  true).
- **No content in events** (D56/D41): flag properties are slugs; experiment
  events carry allowlisted structural properties only. Flag requests to the
  vendor carry a hashed distinct id, no content — the terms-level tracking
  stance applies.
- **Default-off invariant holds.** `posthog_enabled=false` → no flags, no
  events, control experience everywhere; that is the shipped state until
  the operator enables collection.
- **No `api/` app-specific surface** (D60): the program touches no node
  code in phases 1–2; the seam, when built, is a universal primitive.
- **Deployment is a separate operator gate** for every phase.

## Phases (lane `ab-testing`)

- **AB-01 — Foundation (code, marketing-ui).** The generic per-app flag
  option, `$feature/*` + enrollment wire-gate passthrough, tracker
  `flag()` + marketing-ui pass-through, null → control guarantee, first-
  experiment events on the explicit EVENTS allowlist. Red/green controls
  for the off-state (zero flag properties, `flag()` null, control render).
  All telemetry + marketing suites. The wire-gate delta is reviewed as
  app -> API credential-handling work (SDK credential surface; AGENTS.md security protocol).
- **AB-02 — Attribution proof.** Synthetic replay: anon landing with
  variant → CTA click with ticket → signup → `$identify` merge; assert the
  experiment report joins the signup to the arm. Connected e2e-node
  receipt. Identity rules unchanged (no aliasing of shared anon ids;
  account-row context semantics untouched). No production writes.
- **AB-03 — Experiments ledger.** Create `knowledge-base/strategy/
  experiments.md` with the record format above; first record is a candidate
  experiment — the classic-homepage test or a cheaper smoke experiment on
  an existing surface (operator's choice).
- **AB-04 — Run experiment #1.** Flag live on enabled origins only;
  operator reads the PostHog dashboard at window end only; SRM first;
  single read; outcome recorded; D-number when warranted.
- **AB-05 — Phase 2 rollout: web10-social.** One-line flag flip for the
  app (after AB-01's generic option), per-person assignment after
  `identify()`, its EVENTS additions, onboarding surface as the first
  social candidate. Guardrail ops: SRM procedure + read cadence in
  `experiments.md`, dashboard ownership (operator's PostHog project), wire-
  gate re-scan after every allowlist change, the concurrency rule enforced.
- **AB-06 — Node flag seam (deferred; research, not build).** When data
  treatments are worth testing: pick the candidate shape, open the D-
  number, run the security review, get operator admission. No code in this
  lane; it exists so the question is planned, not improvised.

## Open questions (operator)

1. PostHog project: can the plan/seat run flag-based Experiments (the
   reporting product) on the us/eu host? Verify before AB-04; not blocking
   the foundation.
2. Confirm the surface order: marketing-ui → web10-social (default: yes).
3. First experiment: the classic-homepage test, or a cheaper smoke test?
4. Is the node flag seam (AB-06) worth a research pass now, or stays
   deferred until a data treatment actually wants it?
5. PR order: does `#1585` (classic-revival plan) land before this one, so
   the first experiment record can name its variant?
