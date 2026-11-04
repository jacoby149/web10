# Same website, new account: local browser demonstration

**Final committed-integration run passed:** `20261104T015653Z-30684`, source
`0932d6643940635fc3a332da46cee70dc06dbc9c`, empty `source.patch`. This is the
pushed prototype integration branch, not a merged/deployed social feature.
The client, DNS/runner and browser/proof components are separate bounded PRs.
The decision was provisionally D96 in that capture; the final KB calls it D97
to preserve dev's independently merged D96 upload decision. Runtime fields and
the tested code are unchanged by that documentation renumbering.

## What the reader and creator actually did

Both **1440×1000 desktop** and **375×812 mobile** passed the full scenario:

| Step | Observed result |
|---|---|
| Creator signs into A, copies/publishes the TXT and verifies | Existing node endpoint authenticates and resolves actual local UDP TXT; verified alias stored |
| Reader signs in and clicks Follow | Exactly one private `domain-demo-follows` document, body exactly `{domain}` |
| Reader refreshes | Original account's public post appears; public requests contain no reader credential/cookie |
| Harness stops A's API and TLS frontend | Explicit unavailable state, no stale post rendering; saved follow ID remains |
| Creator signs into B before DNS is changed | Verification denied; no stale verified message |
| Creator publishes B's TXT and verifies there | New account verified without contacting A or releasing A's stored alias |
| Reader reloads and logs in normally | New account's public post appears; identical follow ID/body and still exactly one Follow write |
| DNS becomes absent or ambiguous | Content clears with an explicit error; follow remains; restoring DNS recovers without refollowing |

Each case also positively reads an **explicitly granted old private group (200)**
before the move, then checks **new-target private access is denied (403)** after
the move. The old private grant is a synthetic API fixture, not a consequence
of the domain follow. DNS does not migrate or inherit that authority.

Real backend responses are delayed, not replaced, at login, group creation,
alias lookup, public posts and domain verification. Logout/new-login generations
reject stale completion: no old account's signed-in/verified/feed state returns.
Twenty-six DNS/alias/public requests per viewport are recorded credential-free,
even with an ambient synthetic cookie. No token injection, response-content
mocking or pre-created follow/verified alias substitutes for the browser seam.

## Source, failures and compatibility

- `20261104T004410Z-83352` failed before browser execution: an internal-only
  Docker network suppressed requested loopback port bindings. A separate owned
  Alpine probe reproduced requested-versus-observed binding differences.
- `20261104T010349Z-97593` passed desktop, then failed mobile login: restarting A
  reassigned its random port. Keep it as a failed matrix, not a mobile pass.
- `20261104T011224Z-3265` passed a working-tree matrix before final lifecycle/UI
  hardening. It is separate history, not the final source identity.
- `20261104T015653Z-30684` is the final committed matrix above. Retained source,
  lock/schema/build inputs and images match the pinned source; 10 captures were
  inspected. Configuration history records port changes rather than hiding them.
- `20261104T020002Z-32148` independently passes the original **default IAM mode**
  from the same clean commit, with its original exact 200/401 issuer receipt,
  no published ports and complete cleanup. Do not pool this with domain proof.
- All final-run project containers/networks/volumes, image tags and temporary
  private material are verified removed. Failed-run receipts have five resource
  checks; absence of a private-material flag is not an affirmative receipt.
- Offline: **22 Node client controls, four real loopback DNS/control tests, two
  mocked hooks tests and one default cleanup/topology test** pass. Two client
  continuation gaps reproduced before repair and reject after generation checks.
- The captured source API suite passes **1,929 tests plus eight subtests**, one
  opt-in skip. The later component base independently passes **1,953 plus eight
  subtests**, one skip; that is not a newer connected capture.
- Fresh independent bounded source/receipt review finds no blocker to this
  local claim. It is not a complete scan or model-diverse security sign-off.

## Limits that remain visible

The demo client is new research code. **web10-social's deployed follow graph is
unchanged**; existing followers are not automatically upgraded or migrated.
The prototype permits only two configured lab origins. Reader-home failure,
arbitrary providers, public DNS propagation/TTL timing, browser consent onboarding,
production deployment, scale and cryptographic identity/private-role continuity
are not demonstrated. Domain sale/theft/expiry can redirect a public subscription.

Browser TLS certificate errors are ignored only for the ephemeral lab certificate;
the DNS JSON bridge is loopback HTTP and backend claim verification is real UDP
TXT. TTL 0 is a fixture, not instant public DNS propagation. App grants and the
old private grant are explicit API setup fixtures, not browser consent evidence.
The lab has one operator/daemon, not independently administered adversarial hosts.

The result supports: **a compatible reader-owned domain subscription can survive
loss of the old creator API, under retained DNS control and available reader/new
node/resolver.** It does not establish absolute "unbannability", production social
integration, global availability or whole-paper submission readiness.
