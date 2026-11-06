# The claim: five differentiators ("these things particularly")

What the quabbling settled. Each is stated boldly in the intro, each is
tied to the experiment that proves it, and each carries its why-not-X
step (the visible verification that feeds logical awe). Prior work
lives on the edges: email has the network but no fine-grained access;
Mastodon/Bluesky federate content but access stays platform-defined;
Solid owns the data but is resource-centric with cross-Pod cost that
depends on deployment; a platform lakehouse has scale but no
user-owned access.

1. **User-owned, portable data — all formats.** A post, a profile, a
   game score, and a marketplace listing are documents in the same
   store, differing only in the service string and the JSON shape the
   application agreed to use. *(proven by: interop + operating point)*
2. **Fine-grained, user-managed access.** A grant is a row: principal ×
   group × service × operation; roles are per-service permission maps;
   publicness is a grant, not a flag. The end user runs the IAM
   operations a cloud operator would express as policies — over their
   own data. *(proven by: the theorem + conformance)*
3. **Cross-node-addressable access.** `provider/username` principals;
   the policy reaches across the network; foreign tokens are verified,
   not registered — one cached `/certify` answer per token, and the
   same access check on every read. *(proven by: the two-node IAM
   experiment)*
4. **Composable, app-defined queries.** The node has never learned a
   social concept — no posts table, no feed endpoint, no followers
   construct — and the query boundary keeps the shared store sound.
   *(proven by: the app-as-a-lens figure + interop + the boundary
   experiment)*
5. **A user-addressed network without federation.** Sovereign nodes,
   client-mediated reads, no central authority, no shared database —
   email's architecture, generalized from one format to all, and from
   content routing to access control. *(proven by: the domain
   portability experiment)*

**The rule:** a differentiator that no experiment proves is not in the
paper. Cut it, don't hedge it.

The original-work argument (internal oracle #2) is built on these: they
are a *conjunction* — each prior system drops at least one corner — and
the deletions (the four built-and-deleted surfaces) are the evidence
the conjunction held under pressure.
