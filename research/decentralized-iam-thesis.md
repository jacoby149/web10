# The Decentralized-IAM Thesis — web10 Paper Direction

**Status:** adopted 2026-11-02. This is the paper's spine. It supersedes the
"systems-integration / operational-experience report" framing in `brief.md`
and the "single-node, federation is future work" framing that was in the draft.

**One sentence:**

> Email decentralized where your data *goes*. web10 decentralizes who can
> *access* it — a uniform, user-managed access model where any principal on
> any node can hold any role in your groups, over the same user-addressed
> architecture, generalized from one data format (mail) to all data formats.

## Why this framing (and not the old one)

The old draft hedged in two ways that were *false to the system*, not just
timid:

1. **"Single-node; federation is future work."** The KB is unambiguous that
   web10 is a federation of nodes by design (D84, `multi-node.md`). The
   canonical `provider/username` principal format exists *specifically* so a
   node can tell `alice` on node A from `alice` on node B. The SDK already
   routes cross-node (`provider` → origin). The read model is *decided*
   (client-side fan-out, I6). Describing this as "single-node, more later"
   took a novel architectural position and described it as a roadmap.
2. **"A social app on a datalake."** That undersells it. The contribution is
   not the storage choice; it's that the *access layer* is decentralized, not
   just the data layer.

The email analogy is what makes the bold title ("Extending the Decentralized
Web") *load-bearing* instead of an overclaim. Email already proved the
decentralized-web model at global scale — for one format. web10 is the
generalization. The decentralized part is an *inheritance*, not an aspiration.

## The three-property triangle (the F3 move)

The intro now names the tradeoff explicitly. Prior work lives on the edges;
web10 claims the center.

| Property | Email | Solid | ActivityPub/ATProto | web10 |
|---|---|---|---|---|
| User-owned data, portable | mail only | yes (Pods) | yes (repos) | **all formats** |
| Fine-grained, user-managed access | provider-locked | resource-centric (WAC/ACP) | platform-defined | **cross-node-addressable grants** |
| Composable query over the data | none | deployment-dependent | AppView-defined | **application-defined SQL** |

- **Email** has property 1, for one format. Its IAM never left the walled
  garden: you can email a Yahoo user from Gmail, but you can't grant that
  Yahoo user `editor` on your Google Calendar. The payload crossed the
  boundary; the permissions did not.
- **Solid** has user-owned data and *some* cross-Pod access (WAC
  `acl:agentGroup`, ACP client/issuer matchers), but its access model is
  resource-centric (ACLs on LD resources), not a uniform role/grant vocabulary
  over application-defined services, and cross-Pod query cost depends on
  deployment.
- **ActivityPub / ATProto** separate storage from application views, but their
  access relationships are platform-defined, not user-managed grants over a
  shared query surface.
- **web10** claims all three: user-owned data *and* user-managed access *and*
  composable query, over a network that is user-addressed rather than
  server-federated.

## The two directions email didn't go (web10 does)

1. **All data formats, not just mail.** A shared columnar store in which any
   application defines its own services and queries. A post, a profile, a game
   score, and a marketplace listing are all documents in the same store,
   addressed by the same primitives.
2. **The access layer, not just the data layer.** A grant is a row
   `(group, principal, role)` where the principal is the global
   `provider/username`. A user on node A can be granted `editor` on a group
   that lives on node B. The permission vocabulary (principal class × service
   × operation × grant) is the same whether the principal is local or three
   nodes away. **Email let your data leave the building; web10 lets your
   permissions leave it too.**

## What's true today vs. the active build (the honesty bar)

The paper claims the *architecture*, with the runtime maturity stated as
phases. This is the line that keeps it proud *and* defensible:

**In place today (the substrate):**
- Canonical `provider/username` principal format across the identity layer.
- SDK cross-node addressing (`provider` argument routes a call to that node's
  origin).
- Per-node sovereign data plane (one `documents` table per node).
- The query boundary (wall-not-membrane, reader-filtered CTEs).
- The deployed social application (web10-social) + the Snake/Marketplace
  interop demo.

**The active build (D84 phases B–E):**
- **B** — cryptographic verification of a foreign node's token (HS256 →
  RS256/EdDSA + JWKS). Today `certify()` hard-rejects
  `provider != settings.PROVIDER` (`api/app/services/auth.py:111`);
  `certify_with_remote_provider` exists but is dead (never called on the
  active path).
- **C** — cross-node group membership (join/remove a foreign principal in a
  local group). *This is the demo the operator wants to show.*
- **D** — client-side feed merge (the multi-node feed).
- **E** — cross-node engagement aggregation (the "unified" feel, v2).

**The claim the paper makes (and can defend):** "The access model is globally
addressable *by construction* — a grant row already names a global principal —
so the cross-node read is a runtime completion of an existing data model, not
a new design." That is true. What the paper does *not* claim is that the
cross-node read path is *running in production* — it isn't, and saying so
would be the overclaim that sinks the paper.

## The title

Restored: **"Your Data, Your Rules, One Query: Extending the Decentralized
Web."** It is load-bearing because §3 (the User-Addressed Network section)
delivers on it. "One Query" ties the title to the query-boundary mechanism,
the other real contribution.

The title history (for the record):
1. `web10: User-Owned Social Data with IAM-Grade Access Contracts at Zero Scan Penalty`
2. `Your Data, Your Rules, One Query: A User-Sovereign Social Platform Composed of Generic Lakehouse Primitives`
3. `Your Data, Your Rules, One Query: Extending the Decentralized Web` ← restored
4. `Your Data, Your Rules: Query-Layer Access for a Social Data Platform` (the deflated one, rejected)

## What the paper now claims (the three contributions)

1. **A user-addressed network model** (§3): a federation of sovereign nodes in
   which the user's client mediates cross-node reads, each node re-authorizes
   every read against a verified token, and the access model is globally
   addressable by construction. Generalizes email from one format to all
   formats and from content routing to access control.
2. **A reader-specific query boundary** (§4): application-written SQL over a
   shared columnar store; service references resolve to reader-filtered CTEs
   *before* the caller's joins and aggregation. The access decision is made on
   the input, not patched onto the output.
3. **A deployed platform and connected composition** (§5, §6): a social
   application, a game, and a marketplace over the same node, with real browser
   consent, cross-author joins, and revocation exercised. Plus the metadata
   fan-out cost measurement and the batching decision.

## What changed in the draft (2026-11-02)

- **Title** restored to the ambitious one.
- **Abstract** rewritten around the email generalization + decentralized IAM.
  "Preliminary" and "remain pending" removed from the abstract.
- **Intro** rewritten: leads with email as the proof-of-concept, names the
  three-property triangle, stops calling web10-social a "case study" (it's the
  platform's primary deployment).
- **New §3 "A User-Addressed Network"**: email spine, the verified-not-
  registered linchpin, the I6 boundary (HTTP API + verified token, never the
  database), the client-side fan-out read model, and the built-vs-in-flight
  honesty bar.
- **§6 (Evaluation)**: the two in-paper to-do-list subsections ("Remaining
  workload measurements", "Baselines and broader correctness") collapsed into a
  single **Future Work** subsection. The perf subsection reframed from
  "preliminary results" to "the metadata fan-out cost of the access layer" — a
  design-decision finding, not a performance benchmark. New **Deployed
  operating point** subsection (597 accounts, 30 authors, 9 authenticated
  browser checks) honestly labeled as an operating point, not a scale result.
- **Conclusion** rewritten to lead with the email generalization.
- All "single-node architecture" / "federation is future work" lines that
  contradicted the network model replaced with forward-scope references to §3.

## What is NOT claimed (the overclaims to avoid)

- ~~"scales for real"~~ — the perf test is one sequential trial, 20 samples,
  no baseline. It supports "here's the cost structure and the batching
  decision," not a capacity claim.
- ~~"decentralized across nodes, demonstrated"~~ — the cross-node read path is
  in-flight. The *model* is demonstrated by construction; the *runtime* is the
  active build. The cross-node IAM demo (see `cross-node-iam-demo.md`) is the
  thing that would close this gap.
- ~~"first-ever" / universal novelty gap~~ — the related-work gap is still
  OPEN (`related-work.md`). The framing is "generalization of a 50-year-old
  working pattern (email) + a query layer," which is safer than "no one has
  done decentralized social access before."

## Open items for the paper (not blockers to the draft)

- [ ] Related-work gap: reframe from "unverified gap" to "generalization of
  email's model + query layer" with narrow, source-supported distinctions.
  This is the one spot that still needs sign-off on the exact novelty language.
- [ ] If the cross-node IAM demo (`cross-node-iam-demo.md`) lands before
  submission, add it as a §6 subsection ("Cross-Node IAM") and tighten the
  Future Work accordingly.
- [ ] Authorship: single author (Jacob Hoffman, web10 Inc.). The industry
  track accepts a single founder for a deployed system, but consider whether a
  second author (collaborator / academic advisor) strengthens the credibility
  stack. See `f3-best-paper-notes.md` §3.6.
