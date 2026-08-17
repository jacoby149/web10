3.0.49 || 17.08.2026
chore: CHANGELOG.md first prune — 377 entries down to 50. Entries prior to v3.0.1 archived at commit `2ba7fa98`. New rule in AGENTS.md: keep last 50 entries detailed, when file exceeds 200 entries ask the operator then prune.

3.0.48 || 17.08.2026
docs: AI Use Theory — importance-of-knowledge-base.md rewritten with full framing. Opens with the 5 Ws (code answers "how is this implemented," knowledge base answers what, why, how architecturally, where, who). New "Say It Back" section: the knowledge base is a reflective listening loop — the AI drafts the English description of the code, the human confirms or corrects, and the gap between them is where the insight happens. New co-authored section: why it can't be AI-only (no gap, no correction) or human-only (impossible surface area).

3.0.47 || 17.08.2026
docs: AI Use Theory — importance-of-knowledge-base.md expanded with introductory sections: why a knowledge base exists (human-language description of code), onboarding humans, onboarding AI (every agent wakes with no memory), detecting misalignment between code objectives and implementation.

3.0.46 || 17.08.2026
docs: AI Use Theory — overview.md → README.md (auto-displays in GitHub) + "← back to README" nav on every sub-doc.

3.0.45 || 17.08.2026
docs: AI Use Theory — new importance-of-knowledge-base.md + KB → knowledge base everywhere. importance-of-knowledge-base.md: the knowledge base is the lynchpin, entry point of every debugging flow, the funnel where all signal flows through. Overview leads with the knowledge base, not the theory. All "KB" in prose, diagrams, and mermaid charts expanded to "knowledge base" for clarity.

3.0.44 || 17.08.2026
docs: AI Use Theory — cross-link all docs + new overview.md nav hub. overview.md is the entry point: 1-2 sentence summary of each doc with links. Every doc links back to the overview. ai-use-theory.md links to refutations, KB repair, integration, readiness, and supporting links. Evidence docs link back to the theory and overview.

3.0.43 || 17.08.2026
docs: AI Use Theory — integrate Option 1 (the selected way) + tidy the folder. AGENTS.md's Debugging section now carries the always-on pointer to the theory: when debugging, read knowledge/ai-use-theory/ai-use-theory.md and run the four-phase flow (orient → generate → compare → repair); when starting new work, build the pyramid bottom-up (KB → logs → tests → features) — plus the load-bearing one-liners inline (KB = root of trust; debugging = signal-grounded convergence; parallelize breadth not depth). integration.md marks Option 1 as the selected/implemented way. Moved the two evidence docs (blog + arxiv) into a supporting-links/ subfolder.

3.0.42 || 17.08.2026
refactor(docs): move ai-use-theory/ adjacent to knowledge-theories/ — it's a methodology for using AI, not a Why/How/What writing framework, so it no longer lives under knowledge/knowledge-theories/. Pure folder move (git mv) of the 7-file cluster to knowledge/ai-use-theory/; updated the 3 live references (knowledge/README.md, knowledge/knowledge-theories/README.md, and the internal path in integration.md). No content changes.

3.0.41 || 16.08.2026
docs: AI Use Theory — human-assisted KB repair + integration possibilities. New human-assisted-kb-repair.md: the KB is the root of trust and too large for a human to keep accurate alone, so repair is an AI-assisted interactive loop — the AI audits the KB across four dimensions (code alignment, internal consistency, business-plan/manifesto alignment, effectiveness/voice), returns a fixed batch of 6 doubts, the human resolves them, the AI honestly checks whether each is actually resolved (anti-sycophancy gate), and it iterates to convergence. The knowledge theories / writing styles / voices are framed as a menu the AI (chef) picks from per-doc, not a conformance checklist; a robotic AI voice kills operator trust. New integration.md: options for wiring the theory into the agent flow for a ~260k-context workhorse (pointer+on-demand vs inline vs command vs kickoff-block vs tooling), with a recommended layered combination. ai-use-theory.md: the "human repairs KB" step is now the AI-assisted interactive loop (all "human for KB" refs updated, links to the new doc).

3.0.40 || 16.08.2026
docs: AI Use Theory revision — two-round refutation pass + new refutations.md. After a critical audit: three traits (added shy-about-signal — the LLM won't instrument its own code, so the pyramid is a directed plan, not a suggestion); core reframed as converting debugging into a signal-grounded convergence task (KB = target, tests = altitude, logs = gradient) rather than LLMs-can't-debug; stack modernization removed from the pyramid (opportunistic, not foundational) — now four steps KB → Logs → Tests → Features; Step 2 is now Log the Contact Surfaces (seam logging at system boundaries, incremental, staleness-robust because the durable signal is the sequence of comms); KB is co-authored (human supplies intent via conversation, AI supplies the reading of code + existing docs) and framed as an onboarding asset; new The One Assumption section (KB is the root of trust, intent has no higher oracle, human at the base / parallel above it); new Parallelize Breadth Not Depth section (N threads on N independent problems, not N on one bug); consistent napkin cost math (~$10/hr/thread, ~$125 for five threads). Added refutations.md: R1–R12, each objection + answer + verdict (Revised/Holds/Resolved). Cost figures are napkin math, not measurements.

3.0.39 || 13.08.2026
fix(docker): marketing-ui Dockerfile uses `build:browser` to produce browser.js — `bun run build` only produces ESM modules, not the IIFE browser bundle needed by demo apps.
fix(ui): merge app contract permissions instead of filtering by origin — consent UI now checks if specific permissions are already granted, not just if the origin exists. approveContract always calls applyACR to merge new permissions into existing contracts. Also sends contract_response back to opener on ACR success/failure.

3.0.38 || 13.08.2026
chore(sdk+demos): remove sdk/demos/ duplicates — demos live in marketing/marketing-ui/public/docs/ only. Marketing-ui Dockerfile now copies sdk/dist/browser.js → public/docs/wapi.js at build. Fix _popupReady check in SDK contractRequest: second contract (group) sends immediately if popup already sent auth_ready, fixing notes demo where group contract was never delivered.

3.0.37 || 13.08.2026
fix(ui+sdk): popup auth_ready signal — removed continuous broadcast (interval every 500ms). Popup now sends `auth_ready` once on mount. `initAuthenticator` is idempotent (guard flag) — no more stacked listeners/intervals from multiple calls. Resolved merge conflict markers in Interface.tsx. Added comprehensive logging to wapi popup flow: openAuthPortal, contractRequest, initAuthenticator, contract receive, approve/deny, sendContractResponse, goToApp, login/finishLogin. Migrated `checkAdmin` from legacy `/am_admin` axios call to v3 `/v3/appstore/admin` fetch — eliminates CORS errors from legacy endpoints.
fix(ui+sdk): popup auth_ready signal — removed continuous broadcast (interval every 500ms). Popup now sends `auth_ready` once on mount. `initAuthenticator` is idempotent (guard flag) — no more stacked listeners/intervals from multiple calls. Resolved merge conflict markers in Interface.tsx. Added comprehensive logging to wapi popup flow: openAuthPortal, contractRequest, initAuthenticator, contract receive, approve/deny, sendContractResponse, goToApp, login/finishLogin.

3.0.36 || 13.08.2026
fix(ui+sdk): popup-blocked error — SDK `contractRequest` reuses an open auth popup instead of opening a second one (which browsers block). UI `initAuthenticator` sends `ACRListen` to `'*'` instead of `window.location.origin` — the popup is cross-origin so origin-specific target was silently failing. Updated SDK dist and marketing-ui docs wapi.js. (#592)

3.0.35 || 12.08.2026
fix(docs-demos+wapi): marketing-ui docs demos use v3 contract request flow — the demos deployed on dev.web10.app (marketing-ui/public/docs/) are separate copies from sdk/demos/. Updated notes, hello, groups, messages, and tasks docs demos to use `contractRequest` for App CR + Group CR instead of direct API calls. Updated docs wapi.js (was stale, missing `contractRequest` entirely — the root cause of "You're all set / nothing to review" on consent popups).

3.0.34 || 12.08.2026
fix(sdk+demos): all 4 demos use v3 contract request flow — hello, notes, mailer, and groups demos now use `openAuthPortal` for login and `contractRequest` for app/group contracts instead of direct API calls. Notes demo sends both an App CR (notes collection permissions) and a Group CR (personal notes group). Groups demo replaced `ensureAppContract` direct API call with proper App CR via auth UI popup. SDK browser build rebuilt to include `contractRequest` method.

3.0.33 || 12.08.2026
fix(ui): initAuthenticator runs before login in popup — postMessage listener was gated on `I.isAuthenticated()`, but popups opened via `window.open()` show the login screen first and have no referrer. The demo sends the GCR before the user logs in, so the listener must be ready. Also added E2E test suite for full GCR/ACR flow: group create/list/manages/update via API, app contract creation with CORS_SERVICE_MANAGERS gate, document CRUD contract enforcement, browser GCR popup flow, ACR consent rendering.

3.0.32 || 12.08.2026
feat(ui+demos): groups demo uses GCR consent flow — apps no longer create/edit groups directly via API. Groups demo opens auth UI popup, sends GCR via postMessage, user approves, auth UI creates the group (trusted party). Auth UI now tracks message source window and sends `contract_response` back to requesting app after approve/deny. `applyGCR` handles both `create_group` and `update_group` actions. ConsentView summarizes GCRs with action-specific descriptions. 96 UI tests green, tsc clean.
fix(api): /v3/stats includes S3 media blob bytes — `get_node_stats` in clickhouse.py only summed ClickHouse `bytes_on_disk`, missing all user media (photos, videos, imports) stored in S3/MinIO. Now adds `total_s3_size()` (cached 60s TTL, sums `size_bytes` across media metadata records) to the storage total. Gracefully degrades: if S3 scan fails, ClickHouse bytes still report. Closes the A19-stats-s3-bytes fix that was only wired into the old v2 path.

3.0.31 || 12.08.2026
fix(api): remove token requirement from /v3/stats — node_stats required TokenOnly but never used the token, just returned public ClickHouse counts. Marketing-ui sends empty body (pre-signup, no auth) causing 422.

3.0.30 || 12.08.2026
fix(api): ClickHouse decorrelate error on /v3/groups/list — correlated scalar subquery with QUALIFY + row_number() OVER() is not supported by ClickHouse. Extracted member_count into a separate batched query (_get_group_member_counts) so the window function operates at top level. Fixes both get_user_groups and get_groups_manages.
fix(marketing-api): add missing funnel event types to resolve 422 errors — FunnelEvent enum was missing 11 event types the marketing-ui client sends (freedom_view, everything_view, trending_load_more, trending_comment/like/repost_attempt, trending_preset, trending_search, trending_view_toggle, join_view, join_click). FastAPI returned 422 validation errors for unrecognized events.

3.0.29 || 12.08.2026
fix(api): /v3/groups/manages parses list-format roles + cleanup stale app contracts + gate contract endpoints — `get_groups_manages` expected roles as a dict but all groups store roles as a list. Now parses both formats. Added `/v3/app-contracts/cleanup` to tombstone stale contracts where `allowed_origin` is a service name. Gated `/v3/app-contracts/add` and `/revoke` to authenticator origins only (CORS_SERVICE_MANAGERS) — apps cannot directly create or revoke contracts, they must go through the popup consent flow.

3.0.28 || 12.08.2026
fix(api): deduplicate group_contracts in get_user_groups and get_groups_manages — ReplacingMergeTree background merges may not have run, causing duplicate groups and duplicate memberships in the authenticator UI. Both queries now use window functions to deduplicate group_members AND group_contracts by latest updated_at, with a Python set safety net. Also fixed member_count subqueries to deduplicate.

3.0.27 || 12.08.2026
fix(api): verify JWT signatures on all v3 endpoints — `decode_token` was called with `private_key=False` (default), skipping signature verification. Any client could forge tokens with arbitrary usernames. Fixed in auth_helper.py (shared helper), account.py, groups.py, and appstore.py. Also changed /v3/profile to return 401 NO_USER instead of 404 ENTRY_NOT_FOUND when an authenticated user has no DB record (404 leaks user existence).

3.0.26 || 12.08.2026
feat(demos): Groups demo app — the 4th demo in the docs sidebar. Create communities with custom roles (Community/Followers/Close Friends presets), join policies (open/request/invite-only), manage members (view, invite, leave), approve/deny join requests, toggle join policy, post to groups, discover posts across all your groups, filter by group. Files: marketing/marketing-ui/public/docs/groups/ (self-hosted demo), sdk/demos/groups/ (CDN source), Docs.tsx sidebar entry, groups.spec.ts (4 Playwright tests, all green). Shows the full groups lifecycle: create → invite → join requests → post → discover.

3.0.25 || 12.08.2026
fix(clickhouse): resilient init script — retries until server ready before applying schema. The .sql file ran before ClickHouse accepted connections, silently creating 0 tables. Replaced with a .sh wrapper that polls clickhouse-client up to 60s, then pipes the SQL. Original .sql renamed to .sql.template so entrypoint ignores it. Verified all 16 tables created on web10-dev.

3.0.24 || 11.08.2026
fix(api): ClickHouse HTTP port — `clickhouse_connect` uses HTTP (port 8123), not native TCP (port 9000). The default `CLICKHOUSE_PORT` was 9000, causing every v3 endpoint to 500 with "Port 9000 is for clickhouse-client program". Default changed to 8123 in settings.py, docker-compose.yml, and ubuntu-deployment ecosystem compose.

3.0.23 || 11.08.2026
fix(ui): derive SetupWizard defaults from current auth hostname — `auth.dev.web10.app` → provider `api.dev.web10.app`, CORS `auth.dev.web10.app`. No more hardcoded `api.localhost`.

3.0.22 || 11.08.2026
fix(ui): hide broken logo in SetupWizard — added onError handler to gracefully suppress broken image icon when logo asset is missing.

3.0.21 || 11.08.2026
fix(api+marketing-ui): /v3/stats returns apps and storage — the v3 refactor changed the response shape from {users, apps, storage} to {users, documents, groups}, breaking the marketing homepage stats bar and AppStore member counts. get_node_stats() now includes approved apps (from list_apps) with visits=0 placeholder and storage from ClickHouse system.parts. Marketing-ui Home.tsx and AppStore.tsx updated to call /v3/stats instead of /stats. E2E app-store test updated.
fix(marketing-ui): linktree App Store link — /store → /app-store (route was 404). External service URLs (Social, Auth, API, Marketing API) already resolve correctly per environment via VITE_* build args baked at deploy time.
fix(ui): DB config fields updated from MongoDB to ClickHouse — SetupWizard placeholder and default, ConfigPage label, mediaPresign comment.

3.0.20 || 11.08.2026
test(marketing-ui): headless Playwright suite for demo apps — 18 tests across hello (3), notes (7), messages (8). Static server + mock SDK with fetch override, all v3 API calls intercepted. Fixed messages demo: body global collision (document.getElementById fix), guard rejected valid provider. marketing/marketing-ui/package.json gains test:demos scripts.

3.0.19 || 11.08.2026
refactor(api+marketing-api): bug reports → issue-tracking tag, marketing API proxy endpoints. Move bug report endpoints from "admin" to new "issue-tracking" swagger tag. Add /v3/issue-tracking (submit, list, detail) to marketing API — proxies to node API's ClickHouse bug_reports table via NODE_API_URL. Also tag /config, /am_admin, /config/update as "admin" (were untagged), /recovery_bot as "auth" (was untagged), appstore /admin and /approve as "admin" (were "app-store"). Only POST / remains in "default".

3.0.18 || 11.08.2026
fix(api): swagger admin endpoints tagged — /admin/bug_reports and /admin/bug_reports/{report_id} now under "admin" tag (were untagged, falling to "default"). Removed "schemas" tag from docs (no endpoints implement schema registry API yet).

3.0.17 || 11.08.2026
test(social): replace v2 test stubs with v3 — all 16 failing test files rewritten to use v3 group-based data layer (mock getV3Client instead of getWapi). Component tests updated with full wapi shim exports (buildSocialServiceSirs, etc.). socialTokenHandoff test replaced with v3 token handling stubs. 308 tests passing.

3.0.16 || 11.08.2026
refactor(api+sdk): group-scoped block/unblock/sharing under /v3/groups — moved /v3/block-in-group → /v3/groups/block, /v3/unblock-in-group → /v3/groups/unblock, /v3/sharing/set → /v3/groups/sharing/set. General /v3/block and /v3/unblock separated into their own router with "blocking" tag (was incorrectly tagged "group-contracts"). SDK, web10-social client, protocol spec, and all tests updated.

3.0.15 || 11.08.2026
refactor(marketing-api): v3 prefix + section routers + pay + affiliate — all endpoints under /v3 (analytics, feedback, import, infra, pay). main.py reduced from 710 to 18 lines. New pay section: Stripe marketplace endpoints for developer payouts (create, list, cancel). New affiliate section: link generation, click/conversion tracking, stats. New Everything page: web10 as the open-source everything app (social, payments, commerce, app store, livestream, games, flares, global). Links button in navbar.

3.0.14 || 11.08.2026
refactor(api+sdk): strip v2 endpoints — removed 34 v2 routes (schemas, payments, v2 media, v2 auth, migration endpoints, /stats, /pwa_listing, /register_app, /apps/rating). Added v3 app store admin: /v3/apps/admin, /v3/apps/approve. Added missing media pipeline: /v3/media/upload-url (presigned POST), /v3/media/read-url (presigned GET). SDK: login/signup/account methods use v3 endpoints; dev pay throws errors (v4 feature). ConfigPage calls /v3/apps/admin and /v3/apps/approve. E2E: v3 login helper, v2-only tests marked fixme. Added /links page (web10 linktree). Marketing docs wapi.js rebuilt. Net: -710 lines.

3.0.13 || 10.08.2026
feat(ui): bug report buttons hooked up — web10-social and marketing-ui now POST /bug_report (main API, not marketing-api /feedback). Both apps get screenshot capture (getDisplayMedia, up to 5) and paste-to-attach (clipboard images → base64). Old MARKETING_API/console-errors code removed.

feat(social): v3 data layer — replace wapi with createV3Client, groups-based CRUD. Groups are now the core primitive: follows = group membership, discover = group read, DMs = DM groups. Comments and reactions use the ref pattern. New files: data/v3.ts (client singleton + inline SDK helpers), data/groups.ts (group helpers, ensureDiscover/followers/DMs, role definitions, default_role). Rewritten: posts, comments, reactions, follows, profile, dms, settings, staging, types, feed, contacts. Deleted: pullFeed.ts, serviceTerms.ts. Full shim: wapi.ts (backward compat for component migration). KB: groups/social-contracts.md — exact JSON for all 5 social group types. groups/overview.md — default_role section. Net: -1,353 lines. Data layer source tsc clean (component + test migration is next).
3.0.11 || 09.08.2026
ref(sdk+ui+social+kb): SMR → Contract rename — verbose names throughout. SMRListen → contractListen, SMROnReady → contractOnReady, smrResponseListen → contractResponseListen, postMessage types SMRListen/SMRResponseListen → ContractListen/ContractResponseListen, message type smr → contract. ContractRequest union type (ACR | GCR) added and exported. Auth normalizeSMRtoACRs → normalizeContractsToACRs with new contract format + legacy SMR fallback. All demos, wapi.js, web10-social adapter + tests updated. KB contracts.md gains Contract Listen section. 129 SDK + 96 UI tests green, SDK rebuilt.
3.0.12 || 10.08.2026
feat(api): bug reports — separate ClickHouse table `bug_reports` with base64-encoded screenshots. Public POST /bug_report endpoint (no auth required, optional token for username). Admin endpoints: POST /admin/bug_reports (list, screenshots excluded), POST /admin/bug_reports/{report_id} (detail with screenshots). Schema: report_id, username, email, description, page_url, app_version, device_info, browser_info, error_message, stack_trace, screenshots (JSON array of base64 strings). KB clickhouse.md updated with bug_reports table docs.

3.0.11 || 10.08.2026
docs(kb): v3 media folder — transcoding foundation. `media/transcoding-foundation.md`: source video document carries `transcoding_settings` on the `minio` type — array of variants (360p, 720p, 1080p) and thumbnails. Each variant `url` is itself a `minio` type, resolved to presigned URL recursively. v3: `enabled: false` (raw upload only). v4: `enabled: true` with full adaptive bitrate array. Post refs source video, player reads variants, starts low, adapts up. v3 README updated with media folder in structure + quick links.
3.0.11 || 09.08.2026
fix(sdk): wapiAuthInit now reads authUrl and apiOrigin from the wapi object passed in by wapiInit instead of hardcoding auth.web10.app / api.web10.app — login/signup works for any deployment (localhost, dev, prod), fixing "axios error" on every credential flow.

3.0.10 || 09.08.2026
feat(sdk+ui): SMR/SIR/SCR → ACR/GCR model — unified app contract request with no "new" vs "change" distinction. One ACR per origin replaces whatever exists (ReplacingMergeTree handles upsert). KB: auth.md, requests.md, contracts.md, api.md, README.md rewritten for ACR/GCR. SDK: ACR/GCR types added (SIR/SCR deprecated), acrOnReady/acrResponseListen, acrListen; legacy SMR methods kept for v2 compat. Auth UI: I.SMR → I.pendingACRs, submitSIR/changeTerms/purgeSMR → approveACR/denyACR; normalizeSMRtoACRs converts legacy SMR messages; applyACR creates new contract first, then revokes old (no data loss gap); empty cross_origins skipped with warning. ConsentView: removed kind distinction, diffs permissions against existing contract, badge "access request". RequestPage: single ACR list, origin + permissions breakdown. Net: -42 lines. 96 UI + 129 SDK tests green, tsc clean both.

3.0.9 || 09.08.2026
feat(ui): auth UI v2→v3 contract migration — the contracts page now shows v3 app contracts (one per origin, with per-service permissions) instead of v2 service contracts (cross_origins, whitelist, blacklist). ContractPage rewritten: expandable cards show origin, service count, permissions breakdown per service, inline revoke with confirmation. ConsentView: "already shared" check uses v3 contracts (origin-based) instead of v2 services. Interface.submitSIR/approveAll: v3-only — create app contracts directly from SIR whitelist permissions (no v2 wapi.create("services")). Interface.changeTerms: revoke old contract(s) + create updated v3 contracts. Deleted dead v2 components: Contract.tsx, ContractViewer.tsx, ContractEditor.tsx, ContractComponents.tsx, SiteEditor.tsx, ListEditor.tsx, RequestViewer.tsx, ContractInterface.tsx, contractInterface.test.tsx. Net: -762 lines. 96 ui tests green, tsc clean.
3.0.9 || 09.08.2026
docs: marketing docs v2 → v3 rewrite — 5 docs rewritten, 1 deleted. SDK guide (sdk.md): createClient as primary, groups baked into CRUD, group operations, media, app contracts, v2 compat table. Groups (groups.md, new): the unifying primitive — follows, discovery, close friends, communities, DMs all as groups; owned audience, join policies, roles, blocking, sharing toggle, scale. Protocol spec (protocol-spec.md): data lake model, documents table, doc_groups, ref pattern, two-contract permissions (app contracts = user-level IAM, group contracts = people access), auth flow, CRUD API, v2→v3 change table. Conventions (conventions.md): document typing ({type, value}), ref pattern for reactions/comments/replies, media references, tags, service names. Overview (overview.md): creator platform first, user-level IAM, groups as the primitive, "the internet is too permanent", 100% delivery by architecture. Discovery (discovery.md): deleted — v2 only (discovery index, public ledger, schema registry), all covered by groups.md + sdk.md.

3.0.8 || 09.08.2026
fix(sdk): three-way SDK/API/KB alignment — (1) inviteMember return type fixed: API returns invited_key, SDK type now V3InviteResponse (not V3GroupMember which had member_key), (2) read() requires groups param (API rejects without it), (3) added missing methods: verifyPhone(code), verifyEmail(code), requestJoin(groupId), registerApp(), getApps(), rateApp(), getAppRatings(), (4) 43 SDK tests (was 35), 711 API tests, 107 UI tests, 206 marketing-ui tests green, tsc clean all three packages.

3.0.7 || 09.08.2026
feat(sdk+ui+demos): v3 client module, authenticator v3 contracts, demo apps with groups. SDK: new v3.ts client module — full v3 API surface (CRUD with groups, service contracts, group operations, auth, blocking, sharing, media, stats), 35 unit tests, full types, exported from index.ts. Authenticator (ui/): Interface.tsx gains v3 service contract methods (v3ContractsLoad, addV3Contract, revokeV3Contract, hasV3Contract) and v3 group methods (v3GroupsLoad, v3JoinGroup, v3LeaveGroup, block/unblock in group); servicesLoad loads v3 contracts + groups in parallel; submitSIR also adds v3 contracts (one per cross_origin); deleteService also revokes v3 contracts; logout clears v3 state. Demo apps: hello shows user groups on login; notes uses v3 CRUD with groups (public discover attachment); messages uses v3 with DM groups (ensureDmGroup creates invite-only groups per conversation); all three use v3 service contracts for origin allowlisting. 107 ui + 116 sdk + 206 marketing-ui tests green, tsc clean.

3.0.6 || 09.08.2026
fix(api): get_groups_manages now uses ClickHouse JSON functions (extractJSONArray, has) for in-database filtering instead of application-side Python iteration, matching KB sdk/implementation.md specification. 94 tests passing.

3.0.5 || 09.08.2026
fix(api): review findings — (1) user_blacklist subquery in read_documents_in_groups now includes AND deleted = 0 so unblocked authors' content reappears in discover, (2) resolve_media_urls batches all media refs into a single IN (...) query instead of O(N) round trips, (3) insert_document generates doc_id internally (optional override) so endpoints no longer call private _gen_doc_id. 94 tests passing.

3.0.4 || 09.08.2026
fix(api): review findings — (1) N+1 query in get_groups_manages eliminated by selecting gc.roles directly in initial query, (2) group_blacklist schema changed from MergeTree() to ReplacingMergeTree(updated_at) with tombstone columns (updated_at, deleted), unblock_user_in_group uses INSERT INTO ... SELECT ... deleted=1 instead of DELETE, (3) /v3/groups/invite now checks assignRoles permission on requester role before allowing invites. 92 tests passing.

3.0.3 || 09.08.2026
feat(api): KB gap endpoints — read-by-id, groups/manages, groups/members/list, block-in-group, unblock-in-group, node stats. Service layer: read_document_by_id, get_groups_manages, resolve_media_urls, get_node_stats, provider_service_contracts CRUD. Schema: provider_service_contracts table added. Bug fix: get_groups_manages roles_json parsing (dict with "roles" key, not raw list). 91 tests passing (79 existing + 12 new service layer tests + endpoint tests for all new routes).

3.0.2 || 09.08.2026
chore(docker): ClickHouse service in docker-compose with named volume + v3 schema init. All 10 tables from knowledge/knowledge-base/web10-v3/db/clickhouse.md: documents, doc_groups, group_contracts, group_members, group_join_requests, group_hidden_docs, service_contracts, user_blacklist, group_blacklist, user_group_sharing. HTTP port 8123, native port 9002 (9000 reserved for MinIO). Init script at clickhouse-init/001-init-v3-schema.sql mounted read-only.

3.0.1 || 08.08.2026
docs: v3 knowledge base — 9 Mermaid diagrams across 6 files. SDK api.md: CRUD request flow graph (client → API → ClickHouse, groups baked into CRUD) + group operations sequence (create, join, invite, accept, leave, remove). DB clickhouse.md: ER diagram (all 9 tables, PKs, relationships) + data flow graph (create/read/update/delete paths: INSERT, JOIN, tombstone). Groups overview.md: group architecture (contracts → members → doc_groups → documents) + two-contract-type decision chain (service contract outer wall vs group contract inner permissions). Social overview.md: social app architecture (four group types, one primitive, same CRUD/tables). Encryption auth.md: full auth sequence (popup → token mint → postMessage → cookie → API certify → ClickHouse write). FAQ oltp-to-olap-patterns.md: architecture comparison (OLTP stateful → OLAP append-only, ReplacingMergeTree, TTL, background compaction). ALSO restructured plan.md with hierarchy of reliance (Plan → KB → Marketing docs → Backend → Authenticator → Social app) and renumbered phases (Phase 0 KB diagrams, Phase 1 marketing rewrite, Phase 2 backend, Phase 3 apps rebuild).

---
Entries prior to v3.0.1 archived at commit `2ba7fa98`. Full history available via `git show 2ba7fa98:CHANGELOG.md`.
