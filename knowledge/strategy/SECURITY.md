# Security Policy

web10 nodes hold people's data and (increasingly) creators' money. We take
security seriously and welcome reports from the community.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via one of:
- **GitHub Private Vulnerability Reporting** — the "Report a vulnerability"
  button under this repo's *Security* tab (preferred; works even with no
  dedicated inbox).
- **Email** — security@web10.app (route this to the maintainer; until it's
  set up, use the maintainer's contact on the repo).

Please include: what you found, how to reproduce it, the impact you think it
has, and any suggested fix. If you have a proof-of-concept, even better.

## What to expect
- Acknowledgement of your report as soon as we can.
- An honest assessment of severity and a fix timeline.
- Credit in the release notes / CHANGELOG when the fix ships, if you want it.
- No legal action against good-faith research that follows this policy.

## Safe harbor
We consider security research conducted in good faith — accessing only your
own accounts/nodes, not degrading service for others, not exfiltrating others'
data, and giving us reasonable time to fix before disclosure — to be
authorized. We will not pursue or support legal action for such research.

## Scope
In scope: the node (`api/`), the auth/consent UI, the SDK (`sdk/`), the RTC
service, and the federation protocol between nodes. Out of scope: third-party
apps built on web10 (report those to their authors) and infrastructure we
don't operate.

## Security model (for researchers)
web10's guarantees are defined as invariants I1–I5 in `plan.txt` (cross-cutting
security section). The most valuable reports are ones that break one of them:
- I1: a provider verifying another provider's token without trusting the
  token's own claims;
- I2: any authorization decision made on unverified token data;
- I3: any path that reaches a collection other than the addressed user's;
- I4: the node operator reading content that should be end-to-end encrypted;
- I5: a scoped token exceeding its scope, or a token that can't be revoked
  when it should be.

## Project maturity — read this
web10 is **pre-production and not yet independently audited.** There are known
issues being actively addressed (see the security section of `plan.txt`),
including a federation-signing weakness (migration from symmetric HS256 to
asymmetric RS256/EdDSA is in progress). Do not run a production node holding
real users' sensitive data until an external security review has been
completed. We'd rather say this plainly than have you find out the hard way.

## For contributors
Security is end-to-end, not a phase. If your change touches auth, the DB
layer, tokens, or federation, keep the permission/conformance test suite green
— it mechanically enforces I1–I5. See `AGENTS.md` for the working rules.
