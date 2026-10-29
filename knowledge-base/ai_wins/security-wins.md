# Security Wins

Things that actually became more secure through the recent L1-L4 security
process. This is separate from the general AI Use Theory improvement list.

The security method was introduced on **13 October 2026** in #1185. The campaign
order was set on **18 October**, when the systematic file-scan receipts began.
The first repair listed here is dated **20 October**.

**15 source-level repair outcomes recorded so far.** Each has a campaign finding,
a changed behavior and failing-before/passing-after evidence. Scanning a file,
writing a plan or producing a report is not a security win in this list.

Dates are the changelog repair dates, not necessarily merge dates. All listed
repairs are source-merged in the current branch's history; older receipts may
still say local. That updates merge status only, not their remaining test or
rollout gates. Tests below were recorded during the repairs, not rerun here.

| Date | ID | PR | Type | Changed | Human description | Finding and evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 20.10.2026 | SEC-001 | #1225 | fix | KB, code, tests | Stopped automatic HTTP logs copying credentials and private request or response content. | B-4: nine disclosure regressions repaired; [receipt](../security/scans/2026-10/repair-b4-middleware.md). |
| 26.10.2026 | SEC-002 | #1255 | fix | KB, code, tests | Stopped the cookie parser accepting a token inherited from another object instead of an actual token cookie. | SDK-B-01: source and browser-output replays repaired; [receipt](../security/scans/2026-10/repair-sdk-b01-cookie.md). |
| 27.10.2026 | SEC-003 | #1265 | fix | KB, code, tests | Stopped the settings command printing configured secrets. | B-8: four command-line cases repaired; [receipt](../security/scans/2026-10/repair-b8-settings.md). |
| 27.10.2026 | SEC-004 | #1265 | fix | KB, code, tests | Stopped audit reports and account-export manifests copying database connection secrets. | L1-PKG-01: twelve disclosure cases repaired; [receipt](../security/scans/2026-10/repair-pkg01-mongo-output.md). |
| 27.10.2026 | SEC-005 | #1266 | fix | KB, code, tests | Stopped query logs and parser warnings copying private SQL content and database error text. | L1-G-01: disclosure replays repaired, 24 focused controls recorded; [receipt](../security/scans/2026-10/repair-g01-query-logging.md). |
| 27.10.2026 | SEC-006 | #1267 | fix | KB, code, tests | Stopped overlapping imports copying each other's logs into saved import traces. | L1-J-01: cross-job contamination repaired, nine new controls; [receipt](../security/scans/2026-10/repair-j01-import-traces.md). |
| 27.10.2026 | SEC-007 | #1268 | fix | KB, code, tests | Made production builds stop instead of silently ignoring a failed locked dependency install. | L1-DEPLOY-01: three failure cases repaired, eight controls; [receipt](../security/scans/2026-10/repair-deploy01-frozen-installs.md). |
| 27.10.2026 | SEC-008 | #1271 | fix | KB, code, tests | Rejected expired user tokens and user tokens with missing or malformed expiry before trusting their claims. | D-01/D-02: 48 initial failures repaired, 92 focused controls; [receipt](../security/scans/2026-10/repair-d01-token-freshness.md). |
| 28.10.2026 | SEC-009 | #1273 | fix | KB, code, tests | Required login-token messages to come from the expected popup and authenticator origin. | S-1: ten initial sender cases repaired; [receipt](../security/scans/2026-10/repair-s1-auth-sender.md). |
| 28.10.2026 | SEC-010 | #1275 | fix | KB, code, tests | Rejected consent replies from unrelated windows or origins. | A-01/F-01 sender slice: nineteen initial failures repaired; [receipt](../security/scans/2026-10/repair-consent-senders.md). |
| 28.10.2026 | SEC-011 | #1277 | fix | KB, code, tests | Stopped old consent work changing newer batches or applying the same decision twice. | A-01/F-01 UI ownership slice: replay, duplicate and stale-timer controls; [receipt](../security/scans/2026-10/consent-ui-ownership-foundation.md). |
| 28.10.2026 | SEC-012 | #1282, #1293 | fix | KB, code, tests | Kept logged-out consent cancelled and stopped old handoffs closing newer popups. | Consent lifecycle: seven failing cases repaired in the corrective follow-up; [receipt](../security/scans/2026-10/repair-consent-postmerge.md). |
| 28.10.2026 | SEC-013 | #1290 | fix | KB, code, tests | Stopped validation errors copying credentials from malformed requests into logs and error responses. | L1-VAL-01: three actual-route disclosures repaired; [receipt](../security/scans/2026-10/repair-val01-validation.md). |
| 28.10.2026 | SEC-014 | #1291 | fix | KB, code, tests | Stopped revoked or missing OAuth source clients minting authorization codes. | L1-OAUTH-SOURCE-01: five initial failures repaired, twelve final controls; [receipt](../security/scans/2026-10/repair-oauth-source01.md). |
| 28.10.2026 | SEC-015 | #1293 | fix | KB, code, tests | Stopped old account reads replacing the current account's displayed information or using captured old credentials. | Account-read ownership: 24 initial failures repaired, 52 final controls; [receipt](../security/scans/2026-10/repair-account-read-ownership.md). |

## What Is Not Counted

- August and September security-related work: it belongs to the earlier development history, not this campaign.
- The method, inventories, scans, findings and plans: they help find problems but do not repair them.
- SDK browser alignment #1248 and the docs RTC producer #1294: useful build/correspondence work, but not additional demonstrated security repairs here.
- Generic bugs, new features and new tests without a repaired unsafe behavior.
- Separate occurrences or corrective PRs for the same repair: token freshness is one row, and consent lifecycle plus its correction is one row.

Some repairs also appear in October's general chronological ledger. That does
not make them extra wins to add to its total. Membership here requires evidence
that the security campaign produced the repair, not just an October date.

## Still Open

These are bounded repairs, not fifteen fully closed security classes. Consent
sender and UI ownership fixes do not finish strict request correlation. Connected
browser confirmation remains open for the lifecycle/account fixes; #1290's merge
retained a consent E2E failure. OAuth storage/delegation checks, historical secret
copies, deployment and required diverse review retain their own gates.

**L1 has not passed, and L2-L4 are not complete.** L1-L4 names the process we are
following, not four levels we have already finished. A source repair is not proof
that every deployed node has it. See the [campaign strategy](../security/strategy.md),
[security record](../security/security-record.md) and [learnings](../security/learnings.md).
