# Group Publishing Findings

## Intent

An authorized operator can create as a group into that group's own audience
without inventing a self-membership row. The verified human remains `posted_by`.
Other destinations still require the group principal's write authority, never
the human's unrelated memberships. Service grants, not owner/moderator labels,
are authoritative.

Every group identity can publish public posts to the node's Discover board.
The canonical board already grants `create` through its `anyone` member role;
individual group enrollment is unnecessary. Read-only production inspection on
02.11.2026 confirmed that role and reserved row. Do not confuse this permission
with `discoverable`, which only controls listing a group in the directory.

Default group destinations include self plus the group's memberships, even when
the membership list is empty. Public composer posts and default public reposts
add Discover once; explicit destinations are retained. An explicit group-only
audience removes Discover and never borrows personal followers. Group-only means
the target's existing readers, not a promise that a public group is private.
The node does not hardcode social destinations or automatically attach anything.

## Findings And Repairs

### Existing Post Edit Acceptance (02.11.2026)

Authorized group operators must edit the original document independently of the
navigation identity. Use the live membership role and exact service updateOwn
grant, not a managing-role label or original posted_by. Denied roles retain no
controls; the server remains the final write authority. Preserve author_key,
posted_by, engagement, media and unrelated destinations on content-only edits.
Failed writes leave the original and the editor draft unchanged and retryable.
Review correction: the initial empty-media edit fixture did not prove preservation
of nonempty media_refs. Edit preview resolution is optional display state, never
removal intent: pending, rejected, empty or partial resolution must retain every
original ref unless the operator explicitly removes that ref. Pin this before
claiming nonempty-media edit safety; explicit removals must retain unresolved
siblings and remain retryable after a failed save.

3.255.1 bounded local repair: explicit removed IDs now drive surviving original
refs independently of preview state. Five pending/failed/empty/partial-preview
and removal-plus-retry regressions reproduced the loss, then pass. The real
group composer-to-updatePost fixture now has nonempty unresolved media refs.
70 focused tests and all 1,673 social tests in 114 files pass with two workers
and 20s timeout; production typecheck/build pass with bundling warnings. This
supersedes the earlier full-suite red result for the current local tree, not
connected persistence or independent review. No visual behavior was changed.

Operator approval (02.11.2026): implement a generic per-target attachment read/set
seam, not replacement from a filtered projection. The caller needs live human
app updateOwn and, for group authors, service updateOwn. New external attachments
check create as the document author, never borrowed human membership; new self
needs create, retained self needs updateOwn. Removal never needs destination create.
Only the named attachment changes; hidden and concurrently changed other targets,
content, audit actor and engagement stay untouched. Separate audience actions from
content Save, with authoritative target state, explicit success/error and retry.
Same-target races and authorization-to-write races are not transactional guarantees.

Audience acceptance is Add to Discover / Remove from Discover in the shared
composer, with explicit copy that other group audiences stay unchanged; never
promise Make private. This requires authoritative current attachments, preserving
hidden destinations and failing safely on stale state. It is NOT satisfied by
body.visibility, default memberships or the groups on a normal read: /v3/read
filters those to the human's readable carriers. /v3/update returns all carriers,
but only after a write; it supplies no revision/conditional replacement gate.
A preliminary no-op/content update is not a read seam and would permit partial
success on later audience failure. The former contract blocker is now approved
as the bounded per-target seam above. Implemented locally in 3.256.0 with signed API,
SDK and composer regression coverage; connected verification and independent review
remain open. No permissions
or social-specific API may be added as a workaround. Personal audience editing
has the same attachment-preservation requirement.

Reproduced menu defect: groups/get returns the contract without my_role, while
mutationAuthority expected my_role there. groups/list is the existing human
membership seam and must supply the role used against the current contract.
Feed cards and grid/media lightboxes share this authority helper.

| Finding | Local disposition |
|---|---|
| All group publishes return 403 | Exact self-target authorized after live service create and human app gates; bystanders and unrelated human-only targets still denied. Existing self attachments can be retained with updateOwn; adding a new self attachment also requires create. |
| New group absent from Discover memberships | Empty memberships no longer block group defaults; self is retained and public posts add Discover using its existing generic grant. |
| First Public selection/Save reverts | Late membership initialization cannot overwrite user selection. Unknown visibility blocks guessed Save. |
| Draft autosave overtakes Publish | Per-group in-process ordering across editor mounts; obsolete queued autosaves cancelled; started writes finish before Publish/Delete. No cross-tab transaction claim. |
| Composer flashes new-group slug | Neutral loading label, then identity name independently of optional avatar. |
| Composer lacks post visibility | New-post audience control restored for group identity; preserves explicit target and makes Discover inclusion explicit. Edit/repost attachment changes remain separate contracts. |
| False name-taken warning | Check only the ID slug actually allocated at create, not a later display-name-derived slug. Display names remain free. |
| Acting identity resets on browser reopen | Remember confirmed identifier per provider/account; each initialized tab retains its own snapshot. No persisted credentials/grants and no personal retry on revoked authority. |
| Picker Close switches identity | Existing 3.254.12 explicit-confirmation repair reverified; not reimplemented or claimed as a new fix. |
| Account profile says no posts | Live current profile SQL returns 400 because deployed compiler lacks posted_by; local compiler already exposes it. Profile failures now show retry/unknown count, optional face failures preserve posts, and stale loads cannot hide newer successful results. Deployment required. |
| Profile says zero followers | Count helpers now honor provider, paginate, exclude infrastructure/owner rows and propagate denied/partial reads rather than invent zero. OPEN: live account has one actual follower, but hidden membership policy prevents anonymous enumeration; original signed-in zero not reproduced. |
| Bulk fill/paste hangs | OPEN: Chromium desktop/375px real editor bulk fill and HTML ClipboardEvent remained responsive. Exact production payload/environment needed; no speculative editor rewrite. |

The Oct 21 post belongs to the exact account `century-club-movies`, not a group
whose slug happens to match. Preserve exact principal matching; never merge these
identities to make a profile look populated.

## Acceptance And Limits

Pin self-only and self-plus-Discover publication, server-set audit attribution,
revocation, wrong-service and foreign-target denial, effective principal-class
and wildcard grants, unchanged-self update and new-attachment checks. Browser
checks cover first Save, draft publication ordering, display names, audience
choices, failed-submit retry and picker dismissal. Profile request ownership and
optional-face degradation have deterministic regressions.

Evidence notes: `.context/group-{settings,composer,profile-identity}-findings.md`.
Security receipt: `knowledge-base/security/group-author-self-target.md`.
Final local verification: 1,796 API tests plus eight subtests and full API Ruff;
1,652 social tests in 113 files, TypeScript/production build and whitespace check
pass. Fresh same-model design-intent review passed the bounded self-target and
current-attachment repair after its stale-history finding was reproduced and
denied. Desktop/375px composer, settings and profile screenshots inspected.
Connected synthetic own-group/Discover persistence, concurrent revocation, live
four-group publication/rendering, the exact follower/paste reports, rollout and
independent model-diverse review remain separate open gates. No production writes
or privacy/listing changes were made in this repair session.
