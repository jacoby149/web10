# App Management Delegation

A node operator should be able to moderate, manage monetization, and change
group settings in an app they trust, without visiting the authenticator for
every action. Trust still needs a boundary: approval gives the app permission
to exercise the person's authority, not a spare set of unrestricted keys.

## Approve Once, Work in the App

The authenticator keeps a signed `credential_kind: "self"` session. After the
person approves an app contract, `/v3/delegate` issues a separate
`credential_kind: "app"` session with a canonical signed `app_origin`. Only
that app credential is handed to the opener, using an exact target origin.
An app cannot delegate another credential or approve its own contract.

The existing `app_contracts.permissions` map stores both data operations and
explicit management grants. No implicit management upgrade is applied to old
contracts; requesting new grants returns to consent. Existing approved grants
do not prompt again for every operation. Session expiry can require login
again; an expired session never silently becomes a self session.

## Permission Map

| Key | Operations | Scope |
|---|---|---|
| Any document service | Existing CRUD operations, `hideAll` | That service only; moderation also requires the person's group role or node moderation authority |
| `group` | `createGroup`, `manageRoles`, `assignRoles`, `revokeRoles`, `deleteGroup`, `joinGroup`, `leaveGroup`, `manageSharing`, `blockMembers` | All groups where the person has the corresponding authority; self-membership actions do not confer management authority |
| `node` | `moderate`, `manageMonetization` | Node moderation and the existing generic node-ad policy, respectively; current node-admin status is also required |
| `user` | `blockUsers`, `rateApps` | Respectively change the person's user-wide block list or submit app ratings/reviews as that person; neither changes credentials or recovery contacts |
| `imports` | `create`, `read` | Start an import or read this app's own import progress; execution also requires all affected service/group grants and current target authority |

`*` covers document services, never the reserved `group`, `node`, `user`, or `imports`
keys. These are platform capabilities: a notes app, shop, or music app can
request them too. There is no special trust bypass for web10-social.
Personal ad editing remains ordinary app-service CRUD; it needs no node power.

For a management request the API checks, in order:

1. Verify signature, local issuer/provider, expiry, and credential kind.
2. For an app credential, look up the active contract using the signed
   `app_origin`, not the caller's `Origin` header. A supplied mismatched Origin
   is rejected; omitting it does not skip permission checks.
3. Require the exact management operation in the active contract.
4. Require the person's existing group role or current node-admin authority.

Revocation and permission reductions take effect on subsequent requests even
while the app token is unexpired. Group settings cannot be changed merely
because the person is a member. Delegated node monetization may change only
the existing ad-policy fields, not arbitrary node configuration. Delegated
moderation may change only moderation policy, not credentials or admin lists.
Admin-status discovery conveys status, not permission to perform an action.

Import jobs record the initiating credential kind, app origin, and expiry,
never the bearer token. The worker rechecks the live contract, affected
service/group grants, expiry, and target ownership before writes. Another app
cannot inspect or restart that app's job. Legacy jobs without recorded scope
require renewed authorization. App-store rating submission instead requires exact
`user: rateApps`; `blockUsers` and document wildcards cannot substitute for it.
Consent must describe rating/review authority separately from account-wide blocking.
The current UI labels do not yet make that distinction; this docs pass does not fix them.

These worker checks describe imports, not every background task. Transcode jobs
retain only document/author identifiers, with no persisted initiating app scope or
live app-grant recheck. RTC `/certify` likewise verifies session validity rather
than current app contracts, and existing sockets have no periodic revalidation
in the inspected handler. See security findings SEC-016 and SEC-029; revocation
must not be advertised as immediate cancellation of those activities.

## What Stays in the Authenticator

Passwords, recovery-contact changes, app-contract grants/revocation, node
credentials, and the admin list remain self-session operations. Approving
management in an app is not approval to alter the authority system itself.

Popup requests are bound to the actual opener and its origin. Requested app
origins must match that binding; received auth messages must match the
configured authenticator origin and the popup source. Wildcard token handoff
is forbidden. Failed approvals or failed delegation must remain visible and
must never fall back to handing over the self credential.

## Migration and Verification

Old credentials lack a reliable self/app distinction and must log in again.
Do not infer their authority from `site` or a spoofable request header.
This is a deliberate credential-format break, not completed federation:
foreign issuer acceptance remains gated on canonical principal migration.

Required tests cover self sessions, apps with and without each grant,
non-managers and non-admins with granted apps, live revocation, missing and
spoofed Origin, permission upgrades, and exact-origin app-token handoff.
The node-ad inventory selection must also check operator authority; a
client-supplied tag alone does not designate operator inventory.
