# Two-node IAM correctness demo

Alice keeps her account on A; Bob grants and removes her access on B. The
question is deliberately small: does B keep checking its own grants after
authenticating Alice at her home node? No browser, throughput or full-federation
claim is hiding in the machinery.

## Run locally

The owner-list repair **#1360 is merged**. The full unchanged scenario passes
on clean merged dev revision `0acc771e2efc`, with an empty source patch and no
overlay. Earlier source-specific runs remain in [RESULTS.md](RESULTS.md).

```sh
python3 research/federation-demo/run.py
```

Requires local Docker with Compose, OpenSSL, Git and Python 3; it installs no
host dependencies, provisions no cloud host and accepts no production target.
It builds the current API source, boots eight containers with no published
ports, initializes separate ClickHouse schemas before starting the APIs, runs
the scenario once and removes only its own uniquely named project/image.
Readiness probes retry; scenario assertions do not.

The two nodes have separate ClickHouse and MinIO instances, independently
generated HS256 signing secrets, and separate TLS certificates signed by an
ephemeral test CA. A single API worker on each node makes the process-local
certification cache deterministic. The production verifier is unchanged: HTTPS,
public-address checks, pinned numeric connections and issuer hostname checks
remain enabled. The Docker-internal `11.252.77.0/24` network deliberately uses
globally classified addresses; it has no external routing or published ports.
This exercises real local TLS, not public-internet reachability or a deployment
recipe. A subnet conflict fails rather than borrowing another stack.

## Assertions and limits

- Independently signed A credentials fail local verification under B's key;
  B's issuer-only `/certify` never forwards them.
- B denies both read/query before the foreign membership exists, including
  when an independently registered B-side Alice has the membership.
- Bob grants the exact `node-a.federation.test/users/alice` principal through
  the owner API: both read and query return the exact seeded document.
- App permission is independent: a local namesake's grant does not suffice;
  a labelled canonical foreign app-contract fixture permits the Origin-gated
  query, and revocation denies it without changing direct/group access.
- Removing foreign membership denies the same JWT; regrant restores access.
- A foreign-provider token signed with B's key is denied twice; the second
  attempt must use the short negative cache.
- A's TLS proxy records exactly one successful certification and one rejected
  forgery. All subsequent decisions therefore reuse cached identity, not grants.

Content and memberships are created through the API. The foreign app contract
uses the existing service function as a controlled setup fixture, not foreign
browser consent or public app enrollment. Foreign self-join, Phase A migration,
feed merge, production key provisioning, media, capacity and global revocation
timing remain outside this experiment. MinIO instances are isolated but media
delivery is not exercised.

## Evidence

Runs write `.context/federation-demo/<UTC>-<pid>/`: source revision/patch and
runner/scenario hashes, build output, status-only scenario events, issuer-call
receipts, allowlisted container/image identities and cleanup status. Synthetic
signing keys, CA keys and compose credentials live only in a temporary private
directory, removed on ordinary exit; never publish Docker environment dumps.
An interrupted host/process kill may require project-scoped manual cleanup.
Do not promote a failed or unreviewed run into a manuscript result.

Cleanup fault-injection check (no Docker or IAM operations):

```sh
python3 -m unittest discover -s research/federation-demo -p 'test_*.py'
```
