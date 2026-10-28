Citation mapping for the web10 paper — for the agent writing the paper
Source paper: research/workshop/main.tex on origin/dev in ~/workspace/repos/web10.
Title: "Your Data, Your Rules, One Query: Extending the Decentralized Web."
Current state: 5-page workshop draft, 3,765 words, ACM sigconf, nonacm, review.
Target: SIGMOD 2027 Industrial Track, up to 12 pages + references, deadline
Tuesday 24 Nov 2026, 11:59pm AoE. The expansion must keep the existing
sections and add the evaluation promised in research/evaluation-plan.md.
BibTeX pack: ~/workspace/research-citations/web10-references.bib
(26 entries). This mapping is the placement guide for that pack. It does
not replace the pack: use the BibTeX keys below exactly as written.
Rules for the writing agent
Cite a reference ONLY where the sentence it sits next to says what that
   reference actually says. Do not citation-dump: do not add all 26 to the
   bibliography, and do not stack three citations on one sentence.
Fix the four broken entries already in the draft before adding new ones
   (see "Fix first" below). Do not keep the draft's solid, activitypub,
   atproto, or rls entries as written.
Do not invent evaluation numbers, user counts, latencies, or costs.
   Every [N] / [X] / [Y] / [Z] placeholder in §4 (Scale and latency)
   stays a placeholder until Jacob supplies a real, measured number.
Soften or evidence the strong comparative claims flagged under
   "Claims to check before citing" below. A citation to a system's own
   paper does not prove that the system "never shipped" or that a design
   is "intractable" — those are the paper's claims to argue, not facts
   the citation establishes.
Keep the paper's one claim front and centre (see research/brief.md):
   user-owned data + fine-grained, revocable, group/role-scoped contracts,
   enforced at the query layer. A reference that does not serve that claim
   does not belong in the paper, however interesting it is.
web10 Inc. is the sole affiliation. Do not add any other affiliation
   or employer. Domain conflicts for the submission are web10.app only.
The paper's sections (current draft)
Abstract (no section label) — ActivityPub/ATProto as running
  non-cryptographic protocols; web10's no-social-primitives node; 267
  requests → 1 query-engine call.
§1 Introduction (sec:intro) — platform ownership problem; creator
  income / audience portability; "Cloud IAM solved authorization, but at
  the infrastructure boundary"; decentralized lineage (ActivityPub,
  ATProto, Solid) and its access-model gap; "live in the protocol"
  argument; three contributions.
§2 The Access Model (sec:model) — two trust layers (app trust,
  person trust); roles as per-service permission maps; principal classes
  (anyone / authenticated / member) and effective permissions;
  publicness as a grant, not a flag; "IAM to the front" closing sentence.
§3 Enforcement at the Query Layer (sec:enforcement) — one ClickHouse
  documents table keyed by (author_key, doc_id); role check as an
  index lookup into small metadata tables, never a per-document check;
  invariant I3 (no document for an author_key the token does not own
  unless group membership grants access); conformance suite (results
  deferred); two storage dimensions (columnar rows + object storage)
  governed by the same model; presigned URLs and signed HLS manifests.
§4 A Running Social Platform (sec:eval) — the feed as a query
  (267 → 1, user-gated, tunable/generic); durability and extensibility
  to other app shapes; "Scale and latency (extended version)" with
  [N] / [X] / [Y] / [Z] placeholders and a promised cost
  comparison against row-level security.
§5 Related Work (sec:related) — three paragraphs only: "Decentralized
  social data", "Cloud IAM", "Multi-tenant isolation".
§6 Conclusion (sec:concl) — restates the IAM-to-the-front move and
  the 267-to-1 feed; promises extended-version numbers.
Bibliography — currently 6 hand-written \bibitems, 4 of which are
  wrong or incomplete (see "Fix first").
Planned expansion sections (from research/draft/outline.md and
research/evaluation-plan.md, not yet in the draft): Background &
Motivation; full Evaluation (Scale; Access-decision latency; Cost model
vs. shared-table/RLS baseline; Social-app vs. conventional backend;
Correctness/conformance; Methodology); Discussion & Limitations.
References marked "Expansion:" below belong in one of those, and need
new prose — they have no sentence to attach to in the current draft.
Fix first — the draft's existing 6 entries
Key in pack
Draft entry
Action
solid2016
solid: "T. Berners-Lee. Solid: A distributed social web protocol. Solid Project / W3C, 2014–present."
REPLACE. Not a citable paper. Use the Sambra et al. tech report.
activitypub2018
activitypub: Sporny/Wilson/Smith/Sadok, "IETF Internet-Draft", 2023.
REPLACE. Wrong authors, wrong venue, wrong year. It is a W3C Recommendation, 2018.
kleppmann2024
atproto: "D. Holman and M. Roth. AT Protocol... Bluesky Technologies, 2022–present."
REPLACE. Could not be verified. Use the peer-reviewed Kleppmann et al. DIN '24 paper.
awsiam
awsiam: AWS IAM User Guide, 2025.
KEEP, as documentation. Say in the text that it is documentation, not a research result.
sandhu1996
rbac: Sandhu et al., IEEE Computer, 1996.
KEEP. Verified.
postgres-rls
rls: "A. Kemper and S. Lott. Row-level security in PostgreSQL."
REPLACE. That attribution could not be verified. Cite the PostgreSQL documentation as documentation.
Mapping — every reference, and where it belongs
A. Decentralized / user-owned social data
solid2016 — Sambra et al., Solid tech report, 2016.
   Relevant to: §5 Related Work, "Decentralized social data" paragraph
   (Solid's ownership/Pods claim); §1 Introduction, Solid paragraph.
   Supports: Solid as a platform for decentralized social apps on linked
   data; personal data stores. Does NOT support: any claim about WebACL
   detail — that needs wac2022 (below), since this report predates it.
   Priority: MUST (replaces the broken solid entry).
solid-demo2016 — Mansour et al., Solid demo, WWW '16 Companion.
   Relevant to: §5 Related Work, same paragraph; §4 Evaluation, the
   sentence "protocol-first systems such as Solid proposed but did not
   ship" — CHECK that sentence against this demo before keeping it.
   A WWW demo is evidence Solid was demonstrated, not that it never
   shipped; soften the draft's claim or evidence the scale gap another way.
   Priority: SHOULD.
solid-apps2016 — Sambra et al., building decentralized apps for
   the social Web, WWW '16 Companion.
   Relevant to: §5 Related Work, "building social applications over
   [Pods]" sentence; §4, extensibility discussion (apps over generic
   primitives vs. apps over Pods).
   Priority: SHOULD, only if the "applications over Pods" sentence stays.
solid-protocol2024 — Capadisli, Berners-Lee & Kjernsmo, Solid
   Protocol v0.11.0, W3C Solid Community Group draft, 2024.
   Relevant to: §5 Related Work (current spec status); Expansion:
   Background & Motivation, if a Solid protocol overview paragraph is added.
   Supports: what the Solid Protocol specifies today. Does NOT support:
   treating Solid as a finished W3C Recommendation — it is a Community
   Group draft; say so.
   Priority: SHOULD in the expansion; optional in the 5-page draft.
wac2022 — Capadisli, Web Access Control, W3C Solid Community Group, 2022.
   Relevant to: §5 Related Work, the "WebACL answers 'who may read or
   write this container?'" sentence — this is the spec for that sentence;
   §2 Access Model, principal-classes discussion, as the contrast:
   WAC's acl:agent / acl:agentGroup / acl:agentClass and
   Read/Write/Append/Control modes vs. web10's principal classes and
   per-service role maps.
   Priority: MUST for the WebACL sentence; SHOULD for the §2 contrast.
acp2022 — Bosquet, Access Control Policy (ACP), editor's draft, 2022.
   Relevant to: §5 Related Work (ACP as Solid's newer, more expressive
   successor to WAC, with matchers over agent/client/issuer and
   allow/deny mode sets); §2 Access Model / Expansion: Discussion &
   Limitations — ACP already adds a client dimension, which parallels
   web10's outer app-trust layer, so the draft must not claim Solid has
   no app/client dimension at all.
   Priority: SHOULD in the expansion; do not add to the 5-page draft
   without a new sentence acknowledging it.
css2024 — Van Herwegen & Verborgh, Community Solid Server,
   Semantic Web 15(6), 2024.
   Relevant to: §5 Related Work (the current Solid reference
   implementation, modular across authorization/authentication/storage);
   §4 Evaluation — CHECK the "never reached the scale" / "did not ship"
   claims: CSS is a real, maintained server, so any such claim must be
   about deployed social scale specifically, evidenced, not asserted.
   Priority: SHOULD in the expansion.
activitypub2018 — Lemmer-Webber et al., ActivityPub, W3C
   Recommendation, Jan 2018.
   Relevant to: Abstract (ActivityPub/Mastodon as a running,
   non-cryptographic protocol); §1 Introduction, decentralized-lineage
   paragraph; §5 Related Work, first sentence.
   Supports: the protocol definition, client-to-server and federated
   server-to-server APIs, inbox/outbox delivery. Does NOT support: the
   draft's claim that ActivityPub authorization "stops at follow/block
   and collection-level control" — that is the paper's characterisation
   of implementations/practice; cite the spec for what the protocol
   defines, and argue the gap, don't present the gap as the spec's text.
   Priority: MUST (replaces the broken activitypub entry).
kleppmann2024 — Kleppmann et al., Bluesky and the AT Protocol,
   DIN '24.
   Relevant to: Abstract; §1 Introduction, ATProto paragraph (large user
   base, no blockchain, provider switching, user agency over what they
   see, open moderation); §5 Related Work, first paragraph.
   Supports: AT Protocol architecture (repositories, DIDs, relays,
   AppViews as described in that paper), Bluesky's growth to 10M+
   registered users by Oct 2024, and the design goals above. Use this
   paper's own account of ATProto's visibility/authorisation model when
   stating the gap — do not assert collection-level-only authorisation
   without checking what this paper says.
   Priority: MUST (replaces the broken atproto entry).
oshinowo2025 — Oshinowo et al., Seeing the Politics of
    Decentralized Social Media Protocols, arXiv:2505.22962, 2025.
    Relevant to: §5 Related Work ONLY, if the expansion adds a
    four-protocol comparison framing (ActivityPub / AT Protocol / Nostr /
    Farcaster). WEAK: preprint, not peer-reviewed. Never use it as the
    sole support for a technical claim about any protocol.
    Priority: OPTIONAL. Leave out if the related-work section stays
    three paragraphs.
activitypods — ActivityPods project website.
    Relevant to: §5 Related Work ONLY, one naming sentence at most:
    the framework combining ActivityPub with Solid Pods. WEAK: project
    page, not a paper. Do not present it as peer-reviewed evidence, and
    do not use it to support a claim about Solid or ActivityPub themselves.
    Priority: OPTIONAL / DROP if space is tight.
B. Access control — RBAC / ABAC / IAM / ReBAC / credentials
ferraiolo1992 — Ferraiolo & Kuhn, Role-Based Access Controls,
    15th National Computer Security Conference, 1992.
    Relevant to: §5 Related Work, "Cloud IAM" paragraph (origin of RBAC);
    §2 Access Model, opening of the "IAM to the front" discussion;
    Expansion: Background & Motivation.
    Supports: RBAC as non-discretionary access control via roles, as
    opposed to DAC/MAC. Pair with sandhu1996; do not cite both in
    every RBAC sentence — one cite per claim.
    Priority: SHOULD.
sandhu1996 — Sandhu et al., Role-Based Access Control Models,
    IEEE Computer, 1996. KEEP (already in draft).
    Relevant to: §5 Related Work, "Cloud IAM" paragraph ("RBAC/ABAC
    literature" sentence); §2 Access Model.
    Priority: MUST (already placed; keep the placement).
sandhu2000 — Sandhu, Ferraiolo & Kuhn, The NIST Model for
    Role-Based Access Control, 5th ACM Workshop on RBAC, 2000.
    Relevant to: §5 Related Work, RBAC standardisation lineage only.
    Do NOT stack it with ferraiolo1992 and sandhu1996 in one
    sentence — pick the one that matches the sentence, at most two
    across the whole RBAC discussion.
    Priority: OPTIONAL.
abac2014 — Hu et al., NIST SP 800-162, Guide to ABAC, 2014
    (updated 2019).
    Relevant to: §5 Related Work, "Cloud IAM" paragraph — the ABAC half
    of the "RBAC/ABAC literature" sentence, which currently cites only
    sandhu1996; §2 Access Model, if the expansion explains why web10
    uses roles (per-service maps) rather than attribute evaluation.
    Supports: ABAC as evaluation of subject/object/operation/environment
    attributes against policy. Does NOT support: any claim that web10
    implements ABAC — it does not, on the draft's own description.
    Priority: SHOULD (fixes the one-sided RBAC-only cite).
zanzibar2019 — Pang et al., Zanzibar, USENIX ATC '19.
    Relevant to: Expansion: NEW paragraph in §5 Related Work on
    relationship-based / global authorization systems — it has no home
    in the current 3-paragraph draft, so it needs new prose; §3
    Enforcement, revocation/consistency discussion (Zanzibar's external
    consistency, causal ordering of ACL updates, snapshot reads — the
    "new enemy" problem is the right foil for web10's tombstone /
    next-read revocation bound, which the draft must state honestly);
    §4 Evaluation / Expansion: Evaluation, as the scale/latency
    benchmark a reviewer will have in mind (trillions of ACLs, millions
    of checks/sec, p95 < 10ms) — web10's numbers must be reported
    honestly alongside it, never implied equivalent.
    Supports: a uniform data model + configuration language for ACLs
    across hundreds of services (Calendar, Drive, YouTube, ...), and
    consistency as a first-class authorization problem.
    Priority: SHOULD in the expansion; MUST NOT be dropped into the
    bibliography without the new paragraph.
macaroons2014 — Birgisson et al., Macaroons, NDSS '14.
    Relevant to: §2 Access Model / §3 Enforcement ONLY if the expansion
    adds a token-design discussion (scoped, expiring, revocable tokens;
    attenuation by adding caveats). The current draft barely describes
    its token, so there is no sentence for this yet. Relevant also to
    the §3 presigned-URL / signed-manifest discussion ONLY by analogy
    (short-lived, narrowly-scoped capabilities) — say so explicitly if
    used there; web10's URLs are not macaroons.
    Priority: OPTIONAL. Leave out unless the token design is written up.
oauth2012 — Hardt (ed.), The OAuth 2.0 Authorization Framework,
    RFC 6749, 2012.
    Relevant to: §2 Access Model, app-trust layer (scoped delegated
    access, approval interaction) — only as background for the shape of
    web10's app contracts and token scopes; Expansion: Background, if
    the token/contract flow is described in full.
    Priority: OPTIONAL.
awsiam — Amazon Web Services, AWS IAM User Guide (documentation).
    KEEP (already in draft).
    Relevant to: §1 Introduction, "Cloud infrastructure solved the
    authorization half..." paragraph; §5 Related Work, "Cloud IAM"
    paragraph; §2 Access Model, closing "IAM to the front" sentence
    (principal class, service, operation, grant — the policy shape).
    Documentation only: it supports what IAM's policy language looks
    like, not any performance or security result.
    Priority: MUST (already placed; keep the placement, fix nothing
    except saying "documentation" if the text implies a paper).
C. Multi-tenant isolation, row-level security, and the store
jacobs2007 — Jacobs & Aulbach, Ruminations on Multi-Tenant
    Databases, BTW 2007.
    Relevant to: §5 Related Work, "Multi-tenant isolation" paragraph
    (the shared-vs-separate tenant-schema discussion); §3 Enforcement,
    "one columnar table" framing — web10 takes tenant-per-end-user to
    its limit, which is this paper's spectrum taken to the end.
    Priority: SHOULD.
aulbach2008 — Aulbach et al., Multi-Tenant Databases for SaaS:
    Schema-Mapping Techniques, SIGMOD '08.
    Relevant to: §5 Related Work, same paragraph (Chunk Folding:
    vertical partitioning into chunk tables, metadata budget);
    §3 Enforcement, as the contrast to web10's single wide table +
    author_key filter: schema-mapping complexity vs. one table and
    a filter list.
    Priority: SHOULD. Pick this OR aulbach2009 for the schema-mapping
    point — not both in one sentence.
aulbach2009 — Aulbach et al., A Comparison of Flexible Schemas
    for SaaS, SIGMOD '09.
    Relevant to: §5 Related Work, same paragraph, same point as
    aulbach2008. Redundant with it for this paper's purposes.
    Priority: OPTIONAL / DROP. Keep only if the expansion has a
    dedicated flexible-schema discussion.
force2009 — Weissman & Bobrowski, The Design of the Force.com
    Multitenant Platform, SIGMOD '09.
    Relevant to: §5 Related Work, "Multi-tenant isolation" paragraph
    (strongest cite in this group); §3 Enforcement, "one columnar
    table" + author_key filter argument — Force.com's shared tables
    with OrgID isolation and metadata-driven schema are the direct
    ancestor of "isolation expressed as the query's author_key
    filter plus group-grant list".
    Priority: MUST in the expansion; SHOULD in the current draft's
    one multi-tenant paragraph.
postgres-rls — PostgreSQL Global Development Group, PostgreSQL
    Documentation: Row Security Policies.
    Relevant to: §5 Related Work, "Multi-tenant isolation" paragraph
    (RLS as the closest systems ancestor — replaces the broken rls
    entry); §3 Enforcement, as the named alternative web10 differs
    from (per-row policy evaluation vs. a precomputed cleared-group
    filter list); §4 Evaluation / Expansion: Cost model — RLS is the
    baseline the extended version promises to cost-compare against,
    so it must appear in the evaluation section too, not only in
    related work, once that comparison exists. Until the comparison
    is measured, do not claim web10 beats RLS — claim only the
    design difference.
    Priority: MUST (replaces the broken rls entry).
tao2013 — Bronson et al., TAO, USENIX ATC '13.
    Relevant to: §4 Evaluation, "The feed as a query" — TAO resolves
    data dependencies and checks privacy for the viewer at read time
    (pull, not push; a billion reads/sec, privacy check per item) is
    the deployed precedent for web10's "every row access-checked on
    its way out" design; §5 Related Work, if a social-graph store
    paragraph is added in the expansion.
    Supports: read-time privacy checking at social-graph scale. Does
    NOT support: web10's latency or scale numbers, which are web10's
    own and still placeholders.
    Priority: SHOULD in §4; OPTIONAL in §5.
clickhouse2024 — Schulze et al., ClickHouse, PVLDB 17(12), 2024.
    Relevant to: §3 Enforcement, "One columnar table" subsection
    (ClickHouse as a columnar OLAP store for trillions of rows /
    hundreds of columns, vectorised execution — the reason a scan
    plus a filter list is cheap); §4 Evaluation, feed-as-query
    performance framing. The draft names ClickHouse but never cites
    it — this fills that gap.
    Supports: the store's design and scale envelope. Does NOT support:
    any authorization claim — ClickHouse does not do web10's access
    model; the access model is web10's layer on top of it. Keep the
    two claims in separate sentences with separate cites.
    Priority: MUST for the §3 store description.
References with no home in the current draft (need new prose)
These must NOT be added to the bibliography alone. Each needs a new
sentence or paragraph in the expansion, in the section named:
zanzibar2019 — new §5 paragraph (ReBAC/global authorization) +
  §3 revocation/consistency discussion.
acp2022, css2024, solid-protocol2024 — new/expanded §5 Solid
  discussion acknowledging current Solid work.
abac2014 — one sentence in §5 fixing the RBAC-only cite (has a
  home in the existing sentence; smallest addition in this list).
macaroons2014, oauth2012 — only if a token-design subsection is
  written in §2/§3.
aulbach2009 — only if a flexible-schema discussion is added;
  otherwise drop it in favour of aulbach2008.
Claims to check before citing (do not let a citation launder these)
"Solid's per-Pod architecture makes a cross-user feed query
   intractable" (§4). No citation in this pack proves intractability.
   Either evidence it (measurement / cited analysis, e.g. the Solid
   query literature) or soften to "expensive / not demonstrated at
   feed scale in the cited systems".
"Its social applications never reached the scale of Mastodon or
   Bluesky" (§1). solid-demo2016 and css2024 show real Solid
   systems exist. Restate as a deployed-social-scale claim with the
   specific comparison made explicit, or drop "never".
"Authorization stops at follow/block and collection-level control"
   for ActivityPub and ATProto (§1, §5). Check against activitypub2018
   and kleppmann2024 as written, and scope the claim to the
   authorisation model as deployed/described there. Do not cite the
   specs as if they contain that sentence.
"Solid's WebACL ... with no first-class group primitive" (§5).
   wac2022 DOES have acl:agentGroup. The accurate claim is about
   groups carrying roles (per-service permission maps) and the
   request → approve → assign-role lifecycle — argue that distinction,
   and acknowledge agentGroup explicitly, or a reviewer will.
Any sentence implying web10's latency/scale/cost beats RLS,
   Zanzibar, or TAO. The draft has no measured numbers yet. Design
   differences may be claimed; performance superiority may not, until
   §4's placeholders are filled with real measurements.