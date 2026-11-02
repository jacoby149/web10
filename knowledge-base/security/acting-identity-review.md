# Acting Identity Boundary Review

Date: 01.11.2026. Model: openai/gpt-6.1-sol. State: OPEN, local feature work,
not an exhaustive L1 scan or independent security sign-off.

## Scope

Reviewed the selected generic create/update/delete and group-list branches,
SDK payload construction and social post/comment/reaction consumers. Existing
JWT verification, app-contract and effective-role helpers remain the authority;
the client selection is an untrusted request parameter. No group token is minted.

## Checks

- `author_as` mutations look up the exact document author; a current service
  update/delete grant is required, independent of create permission or who
  originally pressed Post. Human app-contract authority is retained.
- The original `posted_by` column is neither input to nor replaced by the
  mutation. Client body fields do not determine displayed ownership.
- Group membership discovery needs a current service create grant. It returns
  the group's memberships and never runs the human's owner-heal loop on them.
- Create checks target authority as the display author before inserting;
  requested attachment changes are checked before update. No human target
  membership is substituted for a group membership.
- Reaction matching keeps complete group keys, with legacy personal-key
  normalization restricted to non-group keys. Removal uses the captured group
  identity and the live server delete grant, not the original human audit key.
- Comment/post drafts retain their origin through identity switches. Raw
  document author/audit fields survive mapping; group faces use the existing
  owner-scoped face-prepare query, not a media read under group credentials.

## Evidence And Limits

`api/tests/test_acting_identity.py` exercises eight direct endpoint controls,
including revoked/missing group membership discovery, action-specific grant
denial, a different human's group-document mutation and denied-target
non-insertion. Storage and permission helpers are doubled; these controls do
not establish actual ClickHouse or deployment behavior. SDK tests pin delegated
payloads retaining the human token. Social tests cover full-key shared reaction
removal, later-page lookup and originating draft identity.

No production requests, external identities, deployment, CI publication or
independent/model-diverse review occurred. The existing generic role model
remains: a create grant on a service is permission to create as that group, not
a special owner/moderator-name restriction. Concurrent reaction creation is not
an atomic uniqueness primitive; duplicate cleanup on interaction remains the
existing client-side convergence mechanism. Connected multi-operator/revocation
and race testing remains a release gate, not a local PASS claim.

## Continuation Review (02.11.2026)

Same-model delegated backend/SDK and frontend reviews found tombstone audit loss,
repost destination loss, unfenced reaction rollback/pagination, selection-based
mutation controls, Watch group-author rendering and all-or-nothing identity
discovery. These were repaired with focused regressions. The tombstone SQL
regression was observed failing before the repair; no connected storage exploit
or authorization bypass is claimed. Final local suites: 1,583 API tests plus eight
subtests, 285 SDK tests and 1,584 social tests; SDK typecheck and social production
build pass. Identity desktop/375px screenshots were inspected. Connected
multi-operator, concurrent/revocation, deployment/CI and independent/model-diverse
review gates remain OPEN. This is not whole-file or protocol L1 closure.
