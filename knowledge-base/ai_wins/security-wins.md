# Security Wins

Security improvements use the same rows as everything else. They are already
included in the monthly totals, not counted again here.

## Find Them

- [August](2026-08.md): fixed consent approval, duplicate groups, stale membership reads, account mix-ups and ineffective blocking; added returning-browser and access-denial tests.
- [September](2026-09.md): added the query boundary, checked private group metadata, repaired permission checks and added browser tests for real user journeys.
- [October](2026-10.md): removed credential copies from logs and tools, enforced token freshness, bound browser messages to the intended sender and checked SDK builds.

## Examples

The dated rows and PRs are in the monthly files:

- Stopped HTTP logs copying request bodies and credentials.
- Stopped the settings command printing configured secrets.
- Stopped database exports copying connection passwords into manifests.
- Stopped query diagnostics copying private SQL content.
- Rejected expired tokens and tokens without a usable expiry.
- Required auth messages to come from the expected popup and origin.
- Stopped cookie parsing accepting an inherited token.
- Made Docker builds stop when frozen dependency installation fails.
- Stopped old account reads replacing the current account's information.

Exact tests, open findings and rollout status live in
[Written Security](../security/README.md) and its
[repair receipts](../security/scans/2026-10/README.md). A source repair is not proof
that every deployed node has it. The security campaign is not complete.
