# Contact delivery inside the node API

## Operator experience

**Hosted web10 direction (operator, 13.11.2026):** configure SendGrid for email
and Twilio Verify for SMS as one delivery path. Gmail OAuth adds unwanted setup
and reconnect complexity for this hosted rollout. Keep the existing optional
Gmail implementation intact for independent nodes; do not rebuild delivery or
remove it as part of the authenticator visual PR. Actual target/admin access,
verified sender/domain, private provider credentials and approved inbox/phone
tests are still required before claiming hosted contact signup/sign-in works.

Small nodes connect a dedicated Gmail/Google Workspace support mailbox using
send-only Google OAuth. Larger nodes configure SendGrid email and optionally
Twilio Verify SMS. These are recommendations, not size restrictions. Email
recipients may use any provider. No separate service or mandatory Google login.

Settings distinguishes configuration from successful delivery: connected,
not configured, reconnect/error and a separately requested test email. Provider
credentials never return through the general config response. Existing Twilio
Verify remains the compatibility default until an operator selects another email
provider. Provider failure never falls back to weaker authentication.

## Authority and persistence

The API owns OAuth start/callback/finalization, token refresh, sending and code
verification. A callback only stages credentials; the initiating, still-authorized
admin must finalize under the same login token. OAuth state is short-lived,
single-use and PKCE-bound. Callback and email-link destinations come from fixed
server configuration, never request input. Disconnect or a newer connection
invalidates stale pending completions. Requests and errors log metadata only.

New delivery state uses the existing S3-compatible storage, in a separate private
`CONTACT_DELIVERY_STATE_BUCKET`, with conditional writes. Encrypted records use a
separate persistent Fernet `CONTACT_DELIVERY_KEY`; never the JWT signing key.
The bucket must be provisioned private and support If-Match/If-None-Match. No new
database or central credential broker. Multi-host safety depends on shared state
and actual conditional-write support; local doubles alone are not that proof.

Google credentials (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REDIRECT_URI`) are API environment configuration. `CONTACT_AUTH_URL` is
the fixed authenticator root URL. Independent self-hosters register their own
Google OAuth client/callback. Public Google deployment requires OAuth verification.

### Deployment setup (not applied by this change)

Pass these environment variables to the existing API container/process. Adding
them to a host `.env` alone does not inject them into Compose services; use an
operator-managed Compose override or secret/environment configuration:

```yaml
services:
  api:
    environment:
      CONTACT_DELIVERY_STATE_BUCKET: ${CONTACT_DELIVERY_STATE_BUCKET}
      CONTACT_DELIVERY_KEY: ${CONTACT_DELIVERY_KEY}
      CONTACT_AUTH_URL: https://auth.your-domain.example
      GMAIL_CLIENT_ID: ${GMAIL_CLIENT_ID}
      GMAIL_CLIENT_SECRET: ${GMAIL_CLIENT_SECRET}
      GMAIL_REDIRECT_URI: https://api.your-domain.example/admin/contact/gmail/callback
```

Generate a Fernet key using `python -c 'from cryptography.fernet import Fernet;
print(Fernet.generate_key().decode())'` in a private operator terminal, save it in
the deployment secret store, and retain it across restarts. Do not paste it in
issues/logs. Key loss makes existing delivery state unavailable; it does not
authorize legacy fallback. Key rotation requires a separate migration of encrypted
records, not replacing the key and hoping old records remain readable.

Provision the private bucket using the API's existing S3 endpoint/credentials.
It must not be the media bucket and must deny anonymous reads. Require real
If-Match/If-None-Match support. Use a dedicated bucket per node. Configure lifecycle
expiry for `contact/oauth/`, `contact/link/`, `contact/challenge/` and
`contact/budget/` records after at least one day; never expire `contact/settings`,
which contains the connected sender credentials. No lifecycle is installed here.
Keep object versioning/backups and retention policy aligned with contact data.

The authenticator's `REACT_APP_API_ORIGIN` must be the issuing HTTPS API origin.
Strip query strings from reverse-proxy/access logs on the OAuth callback path;
the API also scrubs its callback query before access-log output. Do not record
OAuth requests or callback bodies/URLs in external telemetry. This change does
not modify deployment-owned Compose or proxy files, provision buckets, register
a Google project, connect a mailbox or send live test messages.

For Gmail, register the exact callback in the Google OAuth web application,
enable the Gmail API, configure consent with `openid email gmail.send`, and obtain
production OAuth approval before general use. For SendGrid, verify the sender or
domain and use a restricted Mail Send API key. Save sender/key in Node Config,
then request its test email separately. Twilio SMS requires an Account SID,
Auth Token and Verify Service SID; it does not need a sender phone number for
the Verify path. Existing legacy Twilio settings remain in an advanced section.

## Verification and password reset

Gmail/SendGrid emails contain a six-digit code and a random reset/sign-in link.
The API stores no plaintext code or link secret: encrypted records contain keyed
contact identifiers, code/link digests, deadline and bounded attempts. Per-contact
and node-wide hourly send limits are conditional shared-state updates; failed
attempts count, and every consumed code/link loses a conditional-write race.
Resending supersedes old links/codes. Sending failures leave the reserved challenge
inactive. Verification is ten minutes; OAuth handoff is ten minutes.

The email link opens the authenticator's recovery screen, not an API GET that
changes authentication. The fragment is removed immediately and exchanged only
on explicit confirmation; mail previews/GET scanners do not consume it. Code and
link consumption converge on existing D61 accounts/verify_token handling, then
the chosen account can set a new password. Contact verification proves reachability,
not humanity or age. SMS retains Twilio Verify's code flow.

The email includes an issuer hint, but that hint never selects an arbitrary
credential destination. It must match the authenticator SDK's configured HTTPS
API origin. Link exchange and reset completion stay pinned there, independent
of the current session's token provider; mismatched nodes are rejected locally.
Independent nodes must deploy/configure their own matching authenticator. This
does not implement a destination-consent flow for arbitrary shared-auth nodes.

This delivery work does not silently change legacy signup admission policy or
claim that `require_contact` already means verified contact. Policy reconciliation
is separate. Existing five-minute D61 verify-token semantics remain unchanged.

## Acceptance gates

### Read-only release preflight

`scripts/contact-delivery-preflight.mjs` starts with a network-free manifest,
even when credentials are present. It names missing environment variables and
the remaining live acceptance steps:

```sh
node scripts/contact-delivery-preflight.mjs
node --test scripts/contact-delivery-preflight.test.mjs
```

An operator may separately supply `WEB10_API_ORIGIN` (the exact canonical HTTPS
API origin) and `WEB10_ADMIN_TOKEN` through their private environment, then run:

```sh
node scripts/contact-delivery-preflight.mjs --preflight
```

This makes exactly one `POST /admin/contact/status` read, with redirects/cookies
disabled, a 15-second timeout and 64-KiB response ceiling. Only known provider and
boolean setup fields enter the receipt; sender addresses, credentials and unknown
response/error fields are omitted. Missing/malformed/denied status fails safely;
reported missing configuration produces named blockers and a nonzero exit code.
It does not inspect a bucket policy, validate Google approval or prove delivery:
`reported_configuration_ready` means only what the API reports. There is no
send, provider-connection or account-reset mode. No live preflight was run when
this checker was added. Mailbox/account acceptance remains a separate authorized
operation, not a side effect of checking readiness.

Local tests must cover admin denial, stale/expired/replayed OAuth, withheld secrets,
provider failure/no fallback, incorrect/expired/replayed code and link, shared-state
races, resend, disconnect, and reset completion. UI checks include keyboard,
desktop/375px, unavailable/loading/error states and direct recovery links.
Live Google approval, real Gmail/SendGrid/Twilio delivery, multi-worker storage,
independent security review and approved rollout remain separate gates. No live
sends, cloud purchase, credential connection or deployment without operator access
and approval.
