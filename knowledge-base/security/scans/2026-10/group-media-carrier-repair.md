# Group media carrier playback — 03.11.2026

Author and fresh bounded reviewer: `openrouter/openai/gpt-6.1-sol`.
Scope: `can_read_carrier_post`, not whole-media assurance or L1 advancement.

## Intent and reproduced failure

A creator uploads while acting as a group; its public readers must play the
attachment without becoming members or owning the upload. Production's Century
Club Movies carrier is group-authored with human `posted_by`; metadata and bytes
belong to that human. A fresh anonymous read mints HLS, but the master returns
403 because the carrier lookup searches only human-authored documents.

## Repair and repro gate

Use the resolver's server-set `posted_by or author_key` owner. Rank current
documents and attachments before deletion/reference filtering, with deletion
winning ties. Resolve the actual carrier service's readable groups; exact
document/author/group tuples, owner and reference then pass through the ordinary
safe-query visibility boundary. No new membership/publicness, ownership move,
SDK/schema changes or relaxed direct-key signing. Logs contain only phase/result.

Synthetic SQLite SQL plus real signed ASGI manifest requests reproduce six
permitted-flow failures and nine stale/visibility/service denials failing under
the original function; the original restored-group flow also fails (16 red).
The repair retains private/revoked/authenticated-only, foreign uploader/reference,
deletion/tie, hidden/blocked/paused/banned and independent-group controls. Resolver
controls cover image, audio, video and document files under the human owner.
Final API suite: 1,930 passed plus eight subtests, one opt-in lifecycle skip;
36 focused carrier cases, full Ruff lint/format and whitespace checks pass.

## Existing data and rollout

SSH inventory: eight current group carriers, eleven distinct references (four
completed videos, seven images); no missing owner-scoped metadata or invalid
object namespaces. All eleven public raw URLs return 206 to one-byte range GETs.
In a short-lived read-only interpreter, original lookup denies all four videos,
repaired lookup permits them, and real handlers produce four 200 masters plus
eight 200 variants and eight nonempty 200 sample segments using existing storage.
No production files, serving workers, data, memberships or settings changed.
No backfill candidates found: these existing records recover through the new
read path after deployment, not through a public-media or ownership rewrite.

Fresh same-model intent review found no blocker; its multi-group/local-block
coverage suggestions were added. Intent: authorized group-carrier streaming;
delta: correct uploader lookup plus current service/visibility checks; no D41,
D58/D60/D68/D75 conflict or new conventional deviation. Expiring bearer URLs
remain intentional. Model-diverse three-dry, representative cost, deployed HTTP/
browser playback and broader HLS/direct-media authority remain OPEN. This is
isolated real-data handler evidence, not a deployment or mobile playback claim.
