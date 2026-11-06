# Fourth-draft paper — decisions

The decision log for `research/fourth-draft/` (the SIGMOD 2027
industry-track manuscript, the clean resynthesis of 06.11.2026). Newest
entry first. Operator decisions are marked **(operator)**; agent
defaults the operator has not yet reviewed are marked **(agent — open to
review)**. `research/first-draft/`, `research/second-draft/`, and
`research/third-draft/` are frozen records. The writing method lives in
`research/ai-paper-theory/`; the figure + experiment KBs remain at
`research/second-draft/kb/` (the shared paper KB).

## 06.11.2026

### The captions round: the figures get short captions — the explanation is the body's job

- **(operator)** "this is much much better, another issue though is the
  figures have these monster paragraph captions, that should be the
  writing in the paper to explain the figures, the figures should just
  have a short caption"
- **(agent)** All 11 captions shortened to the figure's name + one
  clause: 1 app-arch "…the data layer in the browser, the thin generic
  node, its two stores, and the messages that move between them" · 2
  composition "…the same feed, composed in two different places" · 3
  query-engine "…the entire end-to-end journey, in three layers---the
  app, the node (the API), and the store (ClickHouse)" · 4 groups
  "A group---'a shared space on your node.'" · 5 platforms "…the
  interoperability fork---where a second app's read of the user's data
  lands and runs" · 6 interop "One social-written profile, two
  application views: Snake's earned score, Marketplace's listing" · 7
  feed "…one node implementation, two sovereign stores; remote data is
  content, never control" · 8 audience-portability "…the DNS
  flip---one DNS change, not a migration" · 9 monetization "…the
  creator keeps 100% of their monetization, the node operator is a
  media company, the platform takes no cut" · 10 node-market "…a 6×6
  matching market---the competition is on terms, not on leverage" · 11
  k1000-curve "…readable-group resolution time versus the number of
  candidate groups K (log-log)---the trial of §9.4".
- **(agent)** The content the captions uniquely carried moved into the
  body at the figure's introduction (the rule: a caption is never the
  only home of a claim): §1's Figure-1 paragraph now carries the six
  data-layer modules, the node frame's parts, the stores' real names,
  and the message payloads (from the app-arch caption) · §4's lede
  gains "the feed code builds that query over service names… the SDK
  posts it with the reader's token ({sql, token} to POST /v3/query):
  the SDK adds no authority" (from the query-engine caption) · §5's
  fork paragraph gains the statusphere clause + "provisioned on the
  node---no database to stand up" (from the platforms caption), and the
  Figure-6 reference gains the capture bookkeeping (direct browser
  captures, synthetic data, the full-page/consent/denial captures in
  the artifact) (from the interop caption) · §7's market paragraph now
  carries the 6×6 detail (the six nodes' terms, the flip dynamics, the
  self-hosted floor) (from the node-market caption). The
  composition/feed/audience-portability/monetization/k1000 captions
  were pure duplication of body text — cut, nothing moved.
- **(agent)** The rule ratchets into the theory: voice.md rule 8 is now
  "the caption is SHORT — it names the figure, it does not explain
  it; the explanation is the body's job at the introduction; a
  monster paragraph caption is a review failure" · the shared figure
  rules in `research/second-draft/kb/diagrams.md` ("The rules") gain
  the same · the fourth-draft `figs/README.md` wiring step says the
  short caption + the body paragraph that explains the figure.
- **(agent)** Tectonic: 15 pages, no overfull hbox, no undefined
  references, all 11 figures placed (the recorded 2.2pt vbox on the
  lessons page stands).

### The fourth draft: a clean start from shot 0 + the figures — the email door is out, the entry is the stakes

- **(operator)** "this has issues, it comes in hot with email when no
  one associates it with decentralization. people associate , solid,
  mastodon bluesky with decentrlization, so this paper loses people
  immediately coming in with email like that" + "not sure what the
  solution is though" + "you didnt do what i said when i said start from
  scratch, clearly, from shot 0 and the figures, the third draft
  inheritted the junk from the other papers, lets do a fourth draft how
  i said please!"
- **(agent)** The diagnosis, agreed in-thread: shot 0's entry (beat 1,
  the bespoke APIs) carries the mechanism but not the stakes — the line
  the paper's own intro carries ("the social graph — the follows, the
  groups, the audience — is what makes a person's data worth owning, and
  it is the part no platform lets the user keep") does not compress back
  into the shot; and the email door ("Email is the decentralized web's
  proof of concept") was never in shot 0 at all — beat 11 is only the
  SPF/DKIM `/certify` parallel. The email frame is paper-level
  decoration the drafts added to carry an arc, and it is what loses the
  reader, because the reader's decentralization world is
  Solid/Mastodon/Bluesky, not the post office. The email frame enters in
  §6 (`/certify` = email's sender check) and closes in §11; it is out of
  the entry and out of the abstract.
- **(agent)** The third draft is frozen as the record (as are the
  second and the first); `research/fourth-draft/` is the working
  manuscript from this entry forward. `main.tex` was written fresh —
  not copied, not patched: the structure follows the beats, the figures
  are the map, and the junk the operator named is out: **the email door**
  (the paper now opens on the stakes + the reader's world — Solid
  decentralized the store, Mastodon/Bluesky decentralized the transport
  and provider choice, none of them the access layer; email enters in
  §6 as the `/certify` mechanism parallel and closes in §11) · **the
  formal apparatus** (the two trust-wall table, the principal-classes
  table, the effective-permission display expression, the content-gate
  caveats — the access model is now prose that states the same facts) ·
  **the implementation-status hedges** (the "trusted implementation",
  "isolation rule and regression coverage", "implementation boundary",
  "implementation status and deployment scope" subsections) · **the two
  definitional tables** (media spectrum, interop apps — the interop
  story is Figure 6 + the body; the surfaces are one sentence in §5) ·
  **the frontend logistics paragraphs** (the SPA/Dockerfile/link-
  preview-renderer material) · **the heavy related work** (the WAC/ACP
  internals, the AWS IAM paragraph, the full multi-tenant literature) —
  replaced by a compact §9, "No new part, one combination" (Solid ·
  federation · the columnar boundary · monetization, each paragraph
  ending on the gap, per voice rule 11).
- **(agent)** What stays, because the theory says it stays: **the
  evidence** (the Q&A structure, voice rule 12 — every number, host,
  seed, sample count, artifact pin, and the setup facts carried as fact
  from the records, the scope stated as fact not apologized for) ·
  **the lessons** (§8 — the industry track's job: the four
  built-and-deleted surfaces, the self-healing schema race, the
  shared-columnar operating envelope) · **the 46,285 lines / 141 files
  pinned fact about the demo app** (it is on the Figure 1 strip; the
  body asserts it in §5 — this is the pinned measured fact about the
  demonstration, not the project line count, which stays out of the
  body per 4.10.40 + voice rule 2) · **the 1M subs / 300k delivered rent
  number** (§7) · the artifact links + the 18-citation bibliography.
- **(agent)** The shot-0 work this draft implies (open to the
  operator's pass): beat 1 gains the stakes line in the manuscript's
  entry — the locked shot 0 in the frozen second-draft record is NOT
  amended in this round; the operator's re-lock of beat 1 is the open
  item, and the compression test should now return the stakes line as
  beat 1. Beat 13 (monetization) is carried in the body (§7) under the
  blanket "all the figures" call — its formal pass is open. The email
  frame is demoted from the door to the §6/§11 positions shot 0
  actually supports (voice rule 10 read as: the email frame enters
  after the stakes, closes in the conclusion).
- **(agent)** Structure: §1 the split every platform inherits (the
  stakes → the reader's world → web10 closes it → the combination → the
  five properties → the evidence → the map + Figure 1) · §2 the node
  stays generic, the rules are your data · §3 one store at the bottom
  (ClickHouse, data policy not privacy, the Solid fork + Figure 2) · §4
  the boundary: your query, compiled before it runs (the count(*)
  blunder → the redirect → the walk → RLS as the OLTP-era answer +
  Figure 3) · §5 extending costs a role and a policy (the killer app +
  the 46,285-line pinned fact + Figure 4 · the three apps + the
  leaderboard seam + the platforms fork Figure 5 · the interop captures
  Figure 6) · §6 the network: verified, not registered (the address ·
  client-mediated reads · `/certify` + email's sender check + Figure 7
  · the domain + Figure 8) · §7 the money: the free web should have ads
  (the rail + Figure 9 · the node market + Figure 10) · §8 lessons from
  running it · §9 the evidence (Q&A, with Figure 11) · §10 no new part,
  one combination · §11 conclusion (the
  stakes close · the evidence close · the labor close · the forward
  scope · the email close: "Email let the data leave the building. web10
  lets the permissions leave it too.").
- **(agent)** Figures: all 11, all full-width `figure*` floats (the
  4.10.40 padded rasters + the feed/groups width carry over; the
  numbering: 1 app-arch · 2 composition · 3 query-engine · 4 groups ·
  5 platforms · 6 interop captures · 7 feed · 8 audience-portability ·
  9 monetization · 10 node-market · 11 k1000-curve).
- **(agent)** Tectonic: 15 pages (vs. 20 in the third draft — the junk
  was most of the length; the budget is off either way), no overfull
  hbox, no undefined references; one recorded 2.2pt overfull vbox on
  the lessons page (invisible: the folio sits 36pt below the text
  block). Pages 1/2/5/9/10/14 rendered and inspected.
- **(agent)** Next gate: the operator's read of the 15 pages (the entry
  + the whole arc), then the compression test.
