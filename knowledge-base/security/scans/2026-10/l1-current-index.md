# Protocol L1 Current Read Pass

27.10.2026. Current pin: `1332abc678344d24dc6f85227549dda2b0bef9a9` (O10 merged).
Base read pass: `f7aabdb26346752141f46f19c393dbadfd25ddd2` (#1255 merged).
Scanners/reviewers: separate OpenCode `openai/gpt-6.1-sol` contexts
(`openrouter/openai/gpt-6.1-sol`), not different model families.
**Selected source read coverage complete; protocol L1 security gate OPEN.**
No scan runtime changes. B-8 remains a separately recorded repair overlay in this publication.

## Exact Denominator

O10 overlay: [source rescan](l1-o10-source.md), [artifact delta](l1-o10-artifacts.md)
and [fresh review](l1-o10-review.md) cover the only subsequent selected-runtime
drift: complete v3/index sources (2,006 lines), nine changed artifact paths with
full declaration/map reads and generated semantic-delta correspondence. Other
160 selected paths are byte-identical to the base pass. **Current selected union:
171 paths/31,537 logical lines**, +260 source and +826 artifact lines. 107 paths/
23,772 lines have current-campaign full/delta reads; 64 paths/7,765 lines retain
older byte-equal historical credit. SDK source is now seven/2,760. Whole pinned
tree is 1,518 paths: 171 selected + 1,347 excluded, including six new research
docs. The table below preserves base-pass counts, not current-pin counts.

Publication review after fetching `origin/dev` at `7c14b8806`: the only later
changes are `research/workshop/main.tex` and `main.pdf`, both excluded research
artifacts. All 171 selected paths remain byte-identical to the O10 pin; the
upstream tree now has 1,520 paths, with 1,349 excluded. Pinned counts above remain
historical. Fresh same-model review replayed the receipt probes and accounting;
1,180 API tests plus four subtests, focused lint and formatting pass again.

[Executable accounting](l1-current-exclusions.md) defines the complete selected
path union, historic byte-equality proofs, all exclusions and reproducible selectors.
No arbitrary claim of whole-project coverage, deployed behavior or external-code safety.

| Base-pass disjoint credit | Paths | Logical lines | Evidence |
|---|---:|---:|---|
| Current API whole-file refresh | 16 | 8,102 | Identity/data/store A-C and fresh API review |
| API packaging/tools/lock | 8 | 2,417 | Packaging receipt |
| SDK artifacts/producers/token | 32 | 6,398 | SDK receipt; identical copies explicitly mapped |
| Deployment/serve/CI edges | 37 | 3,200 | Deploy receipt |
| Additional executable/config/preview edges | 12 | 823 | Exclusion-accounting supplement |
| Historical byte-equal API/SDK/B1/RTC/preview | 66 | 9,511 | Exact per-category pins in supplement, historical credit only |
| **Selected physical-path union** | **171** | **30,451** | **0 selected unread paths/lines** |

105 base-pin full-read paths total 20,940 logical lines; this is attributed
scanner coverage, not a second exhaustive read by every reviewer. Four equal
browser files remain four physical paths; unique semantic streams are separately
counted. API now has 61 files/13,887 lines, SDK source seven/2,500. Settings at
the pin still has the dump; the one-line local repair does not change line count.

The base pinned tracked inventory is 1,512 paths: 171 selected + 1,341 excluded.
Exclusions are explicit Wave 2 implementation, tests, vendor code, documentation
and residual configuration/assets. Twelve first-party public scripts/workers are
unscanned Wave 2 debt, not inert docs. Necessary caller/cache behaviors remain
limits on protocol claims; external dependencies are assumptions, not certified.

## Receipts And Review

| Receipt | Exact scope | Fresh evidence review |
|---|---|---|
| [Identity](l1-current-identity.md) | Eight files/1,555 lines, includes new OAuth handlers/models | API review |
| [Data](l1-current-data.md) | Seven files/1,230 lines, including middleware/settings | API review |
| [Store A](l1-current-store-a.md) | ClickHouse 1-1975 | API review |
| [Store B](l1-current-store-b.md) | ClickHouse 1976-3891 | API review |
| [Store C](l1-current-store-c.md) | ClickHouse 3892-5317 | API review |
| [Packaging](l1-current-packaging.md) | Eight complete files, lock/tools included | Edge review |
| [SDK](l1-current-sdk-artifacts.md) | All 24 dist paths, three public copies, four producers, token source | Edge review |
| [Deploy](l1-current-deploy.md) | 37 complete runtime/configuration paths | Edge review |
| [Exclusions](l1-current-exclusions.md) | 12 additional reads and exact whole-tree reconciliation | Final integration review |
| [O10 source](l1-o10-source.md) | Complete v3/index at new pin, 2,006 lines | O10 review |
| [O10 artifacts](l1-o10-artifacts.md) | Nine changed outputs, exact five-runtime build correspondence | O10 review |

[API review](l1-current-api-review.md) replayed six published evidence blocks and
strict identity controls; [edge review](l1-current-edge-review.md) independently
replayed URI output, SDK probes and deployment/gate facts. All assigned reads
considered all six checklist classes. No real DB/browser/host/production access.
Local synthetic/model controls do not prove actual authorization or ClickHouse
merge effects. Fenced probes read pinned Git objects; never print captured secrets.

## Current Disposition Ledger

Merged repair means source repaired, NOT rollout/exposure/model-diverse sign-off.
Conditional local facts remain bounded; no production breach is established.

| Stable ID/class | Current disposition and next gate |
|---|---|
| B-1 / BP-1 | OPEN architectural issuer trust; S3 per-node keys/JWKS foundation and coordinated release |
| B-2 | OPEN repeatable/source credential defaults; current packaging/deploy correspondence adds evidence, not live validity. S1 provisioning before removal/approved rotation |
| B-3 | OPEN unsigned-default decoder footgun; authoritative callers vs metadata extraction need S3 separation, not assumed bypass |
| B-4 | Source repair merged #1225; other loggers/history/exposure remain separate |
| B-5 | OPEN wildcard-CORS credential-boundary pinning obligation; no demonstrated wildcard exploit |
| B-6 | OPEN unscoped-getter/capability caller handoff, not independently a data leak |
| B-8 | Source repair merged #1265 at b5d128a52; four red/green CLI cases, 1,180 API tests at repair pin; not B-2/deployment closure |
| L1-A-02 | OPEN manifest caller-destination routing/JSON proxy primitive; fake HTTP evidence, real network reach not shown; S1 |
| L1-B-01 | OPEN unsigned remote-helper destination/status trust; actual callers/reach unverified; S3 |
| L1-D-01 | [Source freshness repair merged #1271](repair-d01-token-freshness.md) at b828736b4; 92 controls/1,325 API passes at repair pin, fresh same-model review. Rollout/diverse review OPEN; S3 |
| L1-D-02 | Same local freshness repair: oracle classifies invalid versus expired and skips stores; no oracle-to-CRUD grant claimed. Integration/rollout/diverse review OPEN; S3 |
| L1-E-01 | OPEN account token GET-query transport; no theft shown; S7 body-authenticated detail and consumers |
| L1-G-01 | [Source repair merged #1266](repair-g01-query-logging.md) at b5ebcd7e7: safe query diagnostics; red -> green, 1,216 API passes at repair pin, fresh same-model review. Deployment/diverse sign-off OPEN; S4 |
| L1-H-01 | OPEN object-signing provenance concern; fake-auth/signer proves forwarding, not private retrieval; S5 |
| L1-J-01 | [Source repair merged #1267](repair-j01-import-traces.md) at e0c271da1: context-owned traces/pre-lock guards; contamination and lock-cycle red -> green. Nine controls/1,225 API passes at repair pin; deployment/history/diverse sign-off OPEN; S5 |
| S-1 | [Source repair merged #1273](repair-s1-auth-sender.md) at c258ce048; 246 SDK passes at repair pin, browser/package/Docker/security CI passed on identical a2262c620 inputs. Migration/delivery/diverse review OPEN; S2 |
| L1-SDK-A-01/F-01 | OPEN: [local sender slice verified](repair-consent-senders.md), 19 new cases/265 SDK passes. Request/batch correlation remains locally reproduced: one matching reply satisfies two pending callbacks. Browser CI/rollout/diverse review pending; S2 |
| S-6 | OPEN wildcard recipient metadata hygiene, not token exfiltration; S2 |
| SDK-B-01 | Source/five-runtime repair merged #1255; remaining browser/rollout/sign-off limits retained |
| L1-OAUTH-01 | OAuth occurrence of D-01 root: local repair denies expired/malformed users before code storage in real HTTP/inert-store controls; valid code flow preserved. Integration/rollout/diverse review OPEN; no live takeover/issuance claim |
| L1-CURRENT-STORE-B-01 | Conditional single-use code consumption failure: two forced active snapshots both return user. Actual schema/ClickHouse/endpoint issuance unverified |
| L1-CURRENT-STORE-B-02 | Bulk revoke/cleanup SQL omits delegated client identity; actual default/merge/authorization impact UNVERIFIED, not proven revoke bypass |
| STORE-A-SCHEMA | OAuth code DDL references undeclared version column; insert compatibility and existing/fresh schema need real evidence; correctness/reachability, not C+I exploit |
| L1-PKG-01 | Source repair merged #1265 at b5d128a52: whole URI omitted from audit/stdout/file manifests, 12 red -> green cases and fresh same-model review; [repair](repair-pkg01-mongo-output.md). Deployment/sign-off/history remain open; S1 |
| L1-PKG-02 | Conditional backup protection risk; actual permissions/symlink/access UNVERIFIED, not a replayed filesystem disclosure |
| L1-DEPLOY-01 | [Source repair merged #1268](repair-deploy01-frozen-installs.md) at c6f9cc85d: frozen-only installs and actual production-social matrix, eight controls/1,233 API passes at repair pin; both production-image CI jobs passed on 8a420f767. Deployment/diverse sign-off OPEN; no poisoned artifact shown |
| ART-01 / orphan artifacts | Producer pin/publication drift, six orphan declaration/maps and docs RTC provenance OPEN; hashes not build/publication/deployment assurance |
| L1-OAUTH-02 | Availability/order observation; C+I UNVERIFIED. Do not count refresh denial as unauthorized grant or access-token revocation |
| L1-DEPLOY-02 | Deliberate exemption interface with grammar/eligibility policy limitations; not a newly demonstrated application bypass |
| L1-O10-01 / O10-ART-01 | One conditional callback-result binding concern: readable wrong-path/concurrent results accepted; caller-managed optional state deliberate, no auth bypass demonstrated |
| L1-O10-02 / O10-ART-02 | One refresh/logout/client ownership concern: retention/composition proved, authority after logout/revocation bypass UNVERIFIED; secret and server acceptance required |
| L1-O10-C01 / O10-ART-C01 | Confirmed first-connection correctness gap: exchange requires a preexisting delegated token, not an unauthorized access exploit |
| L1-O10-C02 / O10-ART-C02 | New refresh selector accepts ambient inherited material under additional pollution precondition; repaired parser unchanged, no attacker-controlled global pollution proved |

Historical M-R/SDK candidate labels remain L2+ handoffs in original receipts,
not new confirmed exploits: tombstone order, service roles, media keys, migration,
recovery, prepared-query/analytics authority and real RTC admission. S-2/S-4/S-5,
B-7, D41/D56 and deliberate public grants remain by design; S-3/shared-array and
parser resource behavior stay functionality/reliability unless C+I demonstrated.
BP-2/BP-3 architectural delegation/RTC guarantees remain OPEN with owners; BP-4
historical exposure/rotation, BP-5 coordinated release and BP-6 external audit
remain obligations. No BP reference alone passes a blocked guarantee.

## Repair And Publication Gates

Do not advance PROTOCOL-02. To finish L1 assurance: substantively resolve local
findings one at a time with exploit-red/denied-green plus legitimate behavior,
fresh design-intent review, KB write-back and current-pin delta review; obtain
required independent model-diverse three-dry review. This environment supplies
same-model agents only; those reviews cannot earn diversity credit.

Operator authorized one larger evidence PR on 27.10.2026 after O10 rescan.
It includes bounded B-8 plus read-only evidence; no unrelated source fixes.
Code/test budget remains below 500 (Markdown excluded by the existing CI gate),
with record/repro checks intact and no exemption marker. Earlier split-batch
recommendation is superseded for this approved publication. No source fixes
besides the separately recorded B-8 overlay were made by scans.

Fresh read-only design-intent reviews preserve generic D60, D41 node readability,
D56 telemetry, deliberate body tokens/JS cookies, public/group-authorized reads,
operator bootstrap and valid confidential-client workflows. No conventional
hardening policy reversal, risk acceptance, credential rotation or rollout is
authorized by a scan receipt. Runnable evidence and negative controls are bounded
in each report; green controls are not whole-file safety. All repairs, producer
provenance, external operational/integration evidence and sign-off stay visible.
