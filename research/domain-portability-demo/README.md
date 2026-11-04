# One website, another account

A creator loses access to their old provider. Their audience should not have
to find and follow another account. This experiment keeps a subscription to
the creator's website in the reader's own web10 data and resolves that website
again before reading its current account's public posts.

**Status: implementation in progress; no connected result yet.** This is an
isolated research client, not a change to web10-social's existing follows.

## Run

```sh
npm ci --prefix e2e --ignore-scripts
node e2e/node_modules/playwright/cli.js install chromium
WEB10_DOMAIN_DEMO=1 python3 research/federation-demo/run.py
```

The self-booting runner uses only the local Docker socket. It owns a unique
project/image, generates synthetic keys and a fixture-control secret in a
temporary private directory, initializes both real ClickHouse schemas before
the APIs, and removes only those labelled resources after collecting receipts.
No foreground dev server or host/public DNS changes are needed. Only readiness
probes retry; scenario assertions do not.

Nine containers supply two APIs, two databases, two stores, two TLS proxies and
the DNS/UI fixture. APIs/databases/storage remain on an internal bridge. Only
TLS frontends and the DNS/UI fixture join a second browser bridge with random
loopback-published ports; Docker suppresses port publication on internal-only
bridges. DNS UDP port 53 is container-internal, not published on the host.

The browser's DNS JSON bridge is loopback HTTP; backend verification uses real
UDP TXT from the same authoritative fixture state. TTL 0 forces fresh fixture
answers, not a public-DNS propagation guarantee. Browser tests ignore errors
from ephemeral lab TLS certificates, so this is not browser CA/public-TLS
validation evidence. The existing production HTTPS/public-address guard is not
weakened. The client has a fixed two-node origin allowlist.

Offline/control checks:

```sh
node --test research/domain-portability-demo/client.test.mjs
uv run --project api --frozen python -m unittest discover -s research/domain-portability-demo -p 'test_*.py'
python3 -m unittest discover -s research/federation-demo -p 'test_*.py'
```

## The contract

1. The creator signs into an actual web10 account and claims a domain using
   the existing authenticated `/v3/domains/verify` flow. The node performs its
   own real DNS TXT lookup; the browser does not supply verification results.
2. The reader's Follow action creates a private app document containing only
   the normalized domain, not a pinned provider/account. The reader's home node
   is independent of the old creator host. Existing app/group gates apply.
3. The client resolves `web10.<domain>` and checks the selected account's
   verified alias, then anonymously reads the demo's public-post group.
4. The harness stops the old provider's API/TLS services. The existing follow
   remains stored; failure to read the old target is explicit, not a false
   empty feed or a successful cached rendering.
5. The creator changes the real local DNS TXT pointer to a fresh account on
   the other node and verifies it there, without the old provider's consent.
6. After reload and ordinary reader login, the same stored follow/document ID
   retrieves the new account's public posts, without a second Follow action.

The domain is an app subscription/discovery key, **not an authentication
principal**. Tokens, membership rows, access gates and audit actors retain their
ordinary identities. A changed DNS answer cannot inherit private access,
moderator roles, old content or revoked grants. Domain theft, sale or expiry
can change who controls a public subscription's destination; no cryptographic
principal continuity is claimed.

## Boundaries and proof

- No production DNS/accounts, deployment, data migration, signing-key changes,
  new node endpoints or web10-social follow-graph rewrite.
- Reuse ordinary DNS TXT format and current verification endpoints; do not
  reactivate the deferred Shadowguard/registry protocol or invent cryptography.
- Use real local DNS plus its DNS-JSON lookup interface, local
  synthetic accounts, actual node APIs and isolated storage.
- The research client permits only the two configured lab provider origins.
  DNS and remote posts are untrusted input. Public target reads omit all
  credentials, reject redirects and use bounded, validated response shapes.
- Reader credentials go only to the fixed reader home. Creator credentials
  go only to the explicitly selected configured account's node. No token in
  domain-follow documents, DNS, screenshots, logs, traces or receipt archives.
- DNS failures, ambiguity, unsafe/unknown targets and unverified target aliases
  fail explicitly; stale async completions after logout/account changes must
  not write a follow or repopulate the UI.
- App-contract setup is a disclosed synthetic fixture, not browser-consent
  evidence. The domain hookup itself uses actual login and verify requests.
- Capture desktop and 375px claim/follow/unavailable/relocated states. Screen
  and selected-domain state live in URLs; screenshots contain synthetic data.
- Retain exact source/patch, input/image/runtime IDs, status-only DNS/API
  receipts, follow IDs/normalized domains and project-only cleanup results.

The acceptance story is public audience continuity despite loss of the old
provider, under retained DNS control and an available reader/new node/resolver.
It is not absolute "unbannability", ordinary app integration, private-permission
portability, public DNS propagation timing or production federation assurance.
Do not add manuscript claims before connected evidence and bounded review.
