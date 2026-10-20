# SDK L1 Scope D Receipt

- Date: 2026-10-18. Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Status: coverage complete for assigned range; security review pending. No PASS,
  independent/model-diverse review, three-dry sign-off, remediation or deployment claim.
- Read every logical line of `sdk/src/v3.ts:1-633` inclusive: 633 lines,
  including comments/blanks and the factory doc comment; factory starts at 634.
  Whole file: 1,682 newline bytes / 1,683 logical lines, no terminal newline.
  Owned prefix contains 633 terminated lines; 634-1683 is NOT covered here.
- Worktree source matches pin (`git diff <pin> -- sdk/src/v3.ts`: empty).
  Offline probes load `git show <pin>:sdk/src/v3.ts`, not reconstructed helpers.
- No other runtime files, imports' implementations, tests, generated/copied bundles,
  consumers or server gates are certified. Artifact mapping/comparison is separate.

## Orient And Intent

- Read contract, root AGENTS, strategy listing/thesis, current plan/lane L1-008,
  changelog head, security theory/checklist/design-intent gate, learnings, I1-I6,
  October SDK audit, SDK contracts/document-typing and thumbnailing KB;
  inspected relevant SDK API references and contract-healing KB 85-229.
- Onboarding: S-1/S-6 popup findings are outside this range; S-2/B-4 is the
  body-token/log composition, not a transport vulnerability. S-3 is functional;
  S-4 metadata decoding, S-5 cookie model/lifetime remain considered-by-design.
- Recession: no local token verification or access enforcement is implemented
  here. Imported decode/cookie names do not establish unsigned authorization.
  Reconciliation preserves existing member roles and owner extras intentionally.
- Obvious gap: TypeScript types disappear at runtime; neither accepted fields
  nor URL/identifier-shaped strings establish permission or verified provenance.
  I1/I2/I3/I5 enforcement and I6 foreign-content isolation need server/caller tracing.
- Design intent: generic app-defined schemaless documents, service-scoped roles,
  additive consensual contract healing, pure thumbnail selection (D58/D60).
  No behavioral delta or conventional-standard reversal proposed. Preserve D41
  node readability, D56 telemetry, body tokens and JS-readable cookies.

## Exhaustive Symbol Coverage

- 1-37: API examples, authPost/authGet/Web10Error, decodeJwt/readTokenCookie/
  setTokenCookie/scrubTokenCookie, TokenPayload imports; no invocation here.
- 38-68: V3ClientOptions, V3State, V3Body. Caller configuration includes API/RTC
  destinations, bearer and optional ICE credentials; types only, no defaults/sinks.
- 69-145: V3AdPreference, PowerMeanSort, V3ContentEventRow, V3Document, V3Group.
  Author/doc/service IDs, ad targets, body, tags, role/count/discovery/visibility
  are descriptive shapes, not client authority. Ranking bounds are not enforced here.
- 147-222: V3ResolvedMedia, V3Thumbnail, pickThumbnail. Nullish list/object guards;
  video requires poster, otherwise first non-video read_url wins; no URL fetch,
  minting, HTML insertion, escaping or scheme validation. KB allows non-image MIME.
- 224-354: V3GroupMember, V3GroupContractSpec, V3GroupContractDiff,
  diffGroupContract. Map/Set exact identity comparison, service/op union gaps,
  missing-member key comparison, conditional policy drift, missing tags/inSync.
  Different existing member role intentionally survives; undefined policy is not
  marked drifted. Duplicate roles resolve last in Map; no normalization/validation.
- 356-404: mergeGroupRolesForReconcile, findDanglingGrants. Full role-list clone
  and missing-role append; specRoles argument unused. Permission arrays remain
  shared; gap append mutates current arrays. Dangling check uses defined nonempty
  role names, not effective permissions or verified membership authority.
- 406-454: V3InviteResponse, V3JoinRequest, V3ServiceContract, V3QueryResult,
  V3PrepareFace, V3Prepare. Query fields/authorColumn select server minting inputs
  by declaration; no capability issuance/provenance proof implemented in this range.
- 456-535: V3FeedPost, V3GroupRole, V3GroupMemberCR, V3AppCR, V3GroupCR, V3CR,
  V3User, V3LoginResponse. Wildcard/group services and action/policy/member/role/
  origin/identifier fields are contract data; discriminated union is not a gate.
- 536-576: V3DirectoryUser, V3PeoplePage, V3UserGroupMembership, V3UserGroupsPage.
  Public-count/hidden-membership comments are intended server guarantees, not proof.
- 578-633: AccessStatus, AccessTokenState, AccessUserState, AccessContractState,
  AccessAction, AccessVerdict, VerifyAccessOptions and factory heading/comment.
  Unknown-vs-negative recovery intent documented; no decision code here.
- Tags/roles/identifiers use exact strings; no presets or serializer implementation
  exists in this range. Transcoding settings are opaque data; ranking/ad modes
  are typed configuration. Actual validation/JSON transport belongs to later paths.

## Six Classes And Disposition

1. Access control: inspected all authority-bearing fields/helpers; no confirmed
   auth bypass or over-grant. Interfaces accepting arbitrary data are not findings.
2. Injection: no SQL/shell/eval/render/filesystem sink in owned code. URL passthrough
   is locally proven, but XSS/SSRF requires a reachable dangerous consumer.
3. Boundaries/transport: no cookie/network/message call here; imports not certified.
4. Availability: malformed runtime values may throw; reliability, not C+I findings.
5. Data lifecycle: no persistence/revocation code. Shared-array mutation is a proven
   local correctness defect against pure-merge intent, not demonstrated stored ACL harm.
6. Hygiene: no real secret literal, credential log, executable insecure default or
   artifact secret demonstrated; example password is illustrative, not a shipped key.

## Evidence And Handoffs

- Confirmed security IDs: none; no S-1..S-6 closure or new L1 security ID assigned.
- UNVERIFIED D-C1 (L2+): trace shared permission-array mutation at 369-378 through
  reconcile consumers/cache and concurrent full-role replacement before asserting
  durable ACL corruption; pure local mutation alone grants no access.
- UNVERIFIED D-C2 (L2+): trace media URL consumers and prepare-face author/field
  provenance to renderer/signer gates. Accepted data alone proves neither XSS nor
  arbitrary private-media signing. Preserve intentional resolved-media composition.
- Author-reported broader Node v24.18.0 offline VM probe: stripped pinned prefix's
  imports/export modifiers with `node:module.stripTypeScriptTypes` for real helpers.
  Eight reported assertions: posterless-video fallback; synthetic javascript URL
  retained; null media -> null; existing member role preserved; absent current
  policy not drifted; dangling member detected; merged/current array alias mutated;
  diff leaves current roles unchanged. These eight were not independently validated
  in this fresh review; only the single minimal mutation assertion below was replayed.
- Minimal executable reproduction; no network/browser/credentials/services:
```sh
node --input-type=module <<'JS'
import {execFileSync} from 'node:child_process'; import {stripTypeScriptTypes} from 'node:module'; import vm from 'node:vm';
import assert from 'node:assert/strict';
const s=execFileSync('git',['show','caeed44278adb65d19f5c737ed9188ccf589b69c:sdk/src/v3.ts'],{encoding:'utf8'});
const c=vm.createContext({}); vm.runInContext(stripTypeScriptTypes(s.split('\n').slice(0,633).join('\n').replace(/^import .*$/gm,'').replace(/export /g,'')),c);
assert.equal(vm.runInContext(`(()=>{const r=[{name:'reader',permissions:{posts:['readAll']}}];const spec=[{name:'reader',permissions:{posts:['readAll','create']}}];const d=diffGroupContract({roles:spec},{roles:r});mergeGroupRolesForReconcile(r,spec,d);return r[0].permissions.posts.includes('create')})()`,c),true);
JS
```
- Fresh replay: exit 0, mutation assertion satisfied; synthetic in-memory mutation,
  not real origin/issuer/auth validation, network access or protected-data disclosure.
