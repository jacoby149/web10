# Second-draft paper — decisions

The decision log for `research/second-draft/` (the SIGMOD 2027
industry-track manuscript). Newest entry first. Operator decisions are marked
**(operator)**; agent defaults the operator has not yet reviewed are marked
**(agent — open to review)**. `research/first-draft/` is a frozen record —
nothing in this file applies to it. The writing approach lives in the
`research/ai-paper-theory/` folder (start at its README: the two
oracles, the spine, the shot loop, the craft, the ops).

## 04.11.2026

### Shot 0 (take 24): PASSED — the final canonical pitch (9 sentences)

- **(operator)** "wow, this is great!!!!!!" + "this encompasses
  everything we found, all of the decisions we made! where things are
  going to move to!" → the refined 9-sentence pitch is the locked shot 0.
  It supersedes/extends the earlier 6-sentence lock: the "belongs to the
  user" line is restored, and the combination + OLAP/RLS positioning
  sentences stay in the pitch (the operator's "encompasses everything"
  answers the open 6–7 vs 9 question: keep all nine).
- **(agent)** The canonical pitch (locked, 05.11.2026):
  1. Every social platform builds its features as bespoke APIs: a feed
     endpoint, a follow endpoint, a like endpoint.
  2. web10's node is completely generic: read and write on data, and
     configuration for identity and access, executed every time the data
     is used.
  3. The access rules are the user's own data, in the very store they
     protect — the permission model belongs to the user, not the
     platform.
  4. The queries are protected with an AST, and written and tuned by the
     application's developer, not the platform — the platform guarantees
     the boundary, not the performance.
  5. None of this is a new part — user-owned data, app-written queries,
     and a query-layer boundary are each known ideas; the contribution is
     how they combine on one shared columnar store.
  6. The OLTP-era answer to many-users-one-database was row-level
     security inside the engine; on a columnar store, the boundary moves
     to the query, where the readable set is compiled in before any data
     moves.
  7. And extending the platform is as simple as a role and a policy: a
     new app steps into the data boundary the old app set, accomplishing
     what OAuth 2.0 does for cross-platform data sharing, but far more
     fine-grained.
  8. Already running on that node: the social app, the snake game, and
     the marketplace — three apps that interoperate on shared data
     through the same boundary.
  9. And at the bottom of the system is ClickHouse, doing real-time
     analytics over billions of rows, in a way that scales.
- **(agent)** This pitch is now the arc for the outline: each sentence
  moves to a section (outline shot 1, fired next). It compresses the
  **node** story; the **network** story (cross-node `/certify`,
  verified-not-registered, the email-like-not-federation positioning,
  domain portability) is NOT in the nine sentences — that is the open
  two-movements-vs-node-only structural question for the outline.

### Shot 0 (refined post-lock): the pitch gains "belongs to the user" + the combination + the OLAP/RLS positioning

- **(operator)** On the cut "permission model is data in the store it
  protects" line: "this is great, because it shows it belongs to the
  user" → restore it. Then: "we should acknowledge we are combining
  parts, i dont know if postgres RLS is what we should be pointing at
  though since we are saying OLTP is dead, OLAP is awesome, but maybe we
  should add two sentences then."
- **(agent)** Take 24 adds three things to the locked pitch: (1) the
  "the access rules are the user's own data, in the very store they
  protect — the permission model belongs to the user, not the platform"
  line (restored — it shows the access belongs to the user); (2) a
  combination-ownership line ("None of this is a new part … the
  contribution is how they combine on one shared columnar store"); (3) an
  OLAP/RLS positioning line that frames RLS as the *OLTP-era answer* and
  the query-layer boundary as the columnar-era move (so we point at RLS
  as the predecessor, not as what we're like — preserving the "OLTP is
  dead, OLAP is the move" stance without re-adding the literal "OLTP is
  dead" phrase the operator cut). Pitch is now 9 sentences.
- **(agent) Open:** is 9 sentences the right core argument, or do the
  combination + OLAP/RLS lines belong in the body (§1/§5/§9) and the
  pitch stays at 6–7? The two positioning lines are strong body material
  either way.

### The pitch is the paper's information-preserving compression — the shot-0 exercise closes (05.11)

- **(operator)** "so what i like about this paragraph is it is the whole
  essence of the paper, in a paragraph, like this is the idea right? not
  saying the paper should be written like this, but if you were trying to
  preserve the information, compress the paper into a paragraph, this
  would make sure we dont lose what is in there. I think it was a good
  exercise!"
- **(agent)** Framing locked: the pitch is not the paper's style — it is
  the paper's **information-preserving compression**, "the idea." The
  paper is the expansion: every section traces to at least one pitch
  sentence; anything untraceable is filler (or belongs in a different
  paper). The **compression test** is now an acceptance-checklist box
  (re-compress the finished paper → you get the six-sentence pitch back)
  and part of the Shot 0 spec. The shot-0 exercise (23 riffs → the
  operator's final edit → the pass) closes as a success; all of its rules
  (the smart-kid test, no hedging, the pet test, frame accuracy, third
  person, no implementation words, carry a move, the known ↔ advanced
  register, the compression) live in the theory.

### The known ↔ advanced register — the pitch's hidden mechanism, now a paper-wide rule

- **(operator)** On the locked pitch: "i feel like it brings things down
  to known concepts, but also goes all the way to advanced concepts
  simultaneously. bespoke apis, AST, generic, interoperating <- advanced
  enough where is it like okay this is going to be interesting. oauth2.0
  snake game, marketplace, feed follow like, things people know."
- **(agent)** Named and locked as **voice.md rule 14** (and a note in the
  pitch spec): every advanced concept is tethered to a known one; the
  advanced signals depth ("this is going to be interesting"), the known
  makes it verifiable at a glance ("oh, I get it, and I can check
  it"). All-advanced is impenetrable; all-known is a marketing pitch;
  the awe lives in the gap the tether closes — the NP-looking system made
  P-verifiable, one pair at a time. It applies to the whole paper, not
  just the pitch (readable set ↔ a grant row; boundary CTE ↔ the snake
  game reading the profile; the fan-out cost ↔ 7.64 s → 363 ms).

### Shot 0: PASSED — the operator took the final edit; the pitch is locked

- **(operator)** After take 23, the operator made the final edit themselves
  and: "**i think this is it!**" Their changes: cut "not some quirky
  multi-tenant trick" (defensive) and "the one-database-per-user OLTP
  model is dead" (spicy), and moved the ClickHouse line to the very end,
  simplified to pure fact: "And at the bottom of the system is
  ClickHouse, doing real-time analytics over billions of rows, in a way
  that scales."
- **(agent)** **Shot 0 passes.** The canonical pitch is locked (6
  sentences):
  1. Every social platform builds its features as bespoke APIs: a feed
     endpoint, a follow endpoint, a like endpoint.
  2. web10's node is completely generic: read and write on data, and
     configuration for identity and access, executed every time the data
     is used.
  3. The queries are protected with an AST, and written and tuned by the
     application's developer, not the platform — the platform guarantees
     the boundary, not the performance.
  4. And extending the platform is as simple as a role and a policy: a
     new app steps into the data boundary the old app set, accomplishing
     what OAuth 2.0 does for cross-platform data sharing, but far more
     fine-grained.
  5. Already running on that node: the social app, the snake game, and
     the marketplace — three apps that interoperate on shared data
     through the same boundary.
  6. And at the bottom of the system is ClickHouse, doing real-time
     analytics over billions of rows, in a way that scales.
  (The operator's trailing ";" on line 6 normalized to a period.)
- **(agent) The locked pitch locks a new arc — and it has no email lead.**
  The arc is: bespoke APIs → the generic node (data RW + access
  configuration) → the AST-protected query → the OAuth-like extension →
  the three interoperating apps → the ClickHouse bedrock. The email frame
  (the old arc's opener) is NOT in the pitch. Decision for the outline
  shots: does the email frame stay in the intro/abstract, get cut, or
  move to the related-work positioning? The pitch is now the source of
  truth for the arc.
- **(agent) Full bookkeeping lands now that the pitch passed**
  (changelog 4.10.15 + plan + lane), per the earlier "batch until the
  pitch lands" note. Next gate: the outline shots, re-shot against this
  locked arc.

### Shot 0, take 22 → take 23: two add-on sentences — ClickHouse, not quirky multi-tenant, OLTP is dead

- **(operator)** "i think it could use 2 more sentences. that this isnt
  doing quirky multi tenant shit. this is built on clickhouse, this is
  built how every saas app is built for real … i am using kind of
  slang, lets work these 2 sentences give me a shot. clickhouse does
  real time analytics on billions of data points in a way that scales.
  we can bring in a little of our oltp is dead too in these two add on
  sentences."
- **(agent)** Take 23 inserts two sentences after the "completely
  generic" line, worked from the slang into pitch register:
  "The store is built on ClickHouse, the way every serious SaaS app is
  built — not some quirky multi-tenant trick." + "ClickHouse does
  real-time analytics over billions of rows, in a way that scales; the
  one-database-per-user OLTP model is dead." The ClickHouse name is a
  credibility signal for a database venue; "OLTP is dead" is kept but
  scoped to the per-user-DB model (matching §3's "why not a database per
  user?"). Sentences 1, 2, and the AST/extensibility/apps lines
  unchanged. Pitch is now 7 sentences.

### Shot 0, take 21 → take 22: the close "sounds defensive" — make it affirmative

- **(operator)** "It is not hypothetical: … this sounds defensive."
  Preempting the objection is the defensive part; just state the fact.
- **(agent)** Take 22's fifth sentence: "Already running on that node:
  the social app, the snake game, and the marketplace — three apps that
  interoperate on shared data through the same boundary." Sentences 1–4
  unchanged from take 21.

### Shot 0, take 20 → take 21: close on the snake game + marketplace + interoperability

- **(operator)** "i think bring up the sname game and the other thing,
  and interoperability at the end. good conclusion after understanding
  the extensibility part." After the extensibility sentence, name the
  concrete apps (the snake game + the marketplace) and land
  interoperability as the conclusion.
- **(agent)** Take 21 adds a fifth sentence: "It is not hypothetical:
  the social app, the snake game, and the marketplace already run on one
  node, and interoperate on shared data through the same boundary."
  Sentences 1–4 unchanged from take 20. The close gives the extensibility
  its worked proof (three real apps) + the interop payoff.

### Shot 0, take 19 → take 20: sentence 4 removed

- **(operator)** "i think we can just remove this????" — on "So the
  feed, the follow, and the like are definitions the app writes into the
  store — the permission model is data in the very store it protects."
- **(agent)** Removed. The line echoed sentence 1 ("the feed, the
  follow, and the like") and duplicated sentence 2 (the access
  configuration, executed on use) and the last sentence (the data
  boundary the old app set). The pitch is back to four sentences:
  the convention → the generic surface → the protected mechanism →
  the extension (the OAuth 2.0, finer-grained, close). "The permission
  model is data in the very store it protects" survives for the
  abstract / §2, not the pitch.

### Shot 0, take 18 → take 19: the close is "a role, a policy, and the new app is in the old app's data boundary"

- **(operator)** On take 18's 4th + 5th sentences ("So the feed … the
  permission model is data in the very store it protects." / "And that
  generic design is what makes the node extensible:"): "this is killing
  me. it is as simple as a role, a policy, and a new app is in the data
  boundary of the old app, accomplishing what oauth2.0 does for cross
  platform data sharing but even more fine grained." The close should be
  that simple, precise mechanism — not three tangled ideas (definitions
  + provable + extensible).
- **(agent)** Take 19: sentence 4 trimmed to the inversion + the awe
  ("…definitions the app writes into the store — the permission model is
  data in the very store it protects"); sentence 5 becomes the operator's
  mechanism verbatim in shape: "extending the platform is as simple as a
  role and a policy: a new app steps into the data boundary the old app
  set, accomplishing what OAuth 2.0 does for cross-platform data
  sharing, but far more fine-grained." Sentences 1–3 unchanged.
- **(agent) Paper note:** "a new app steps into the data boundary the
  old app set — OAuth 2.0 for cross-platform sharing, finer-grained" is
  a strong §6 extensibility line and a related-work positioning hook
  (web10 vs. OAuth 2.0 / scope-based access).

### Shot 0, take 17 rejected — revert to take 16 with a subtle change

- **(operator)** Pasted take 16 and: "nonono, this one was great. this
  needed subtle changes, i really dont like what you did." Take 17 (the
  big OAuth mechanism rewrite + the standalone snake-game line) was too
  much. The fix is subtle: in take 16's fifth sentence, the opener
  "makes the node interoperable and extensible:" was the no-good part —
  trim it to "makes the node extensible:" and keep "new games and new
  marketplaces run on it, and because every app speaks the same
  primitives, they interoperate by design" exactly as it was.
- **(agent)** Take 18 = take 16 with that one-word trim. The OAuth /
  "new apps request your old data" insight is kept for the *paper body*
  (§6, the extensibility section), not the pitch. Sentences 1–4
  unchanged. (Riff logged here; the full changelog/plan/lane entry lands
  when the pitch gets the pass.)

### Shot 0, take 16 → take 17: the extensibility is programmable identity access, not an adjective

- **(operator)** "And that generic design is what makes the node
  interoperable and extensible: this sentence is no good. should remove.
  a snake game a new marketplace, **because of the programmable identity
  access is what really makes it extensible, new apps can request your
  old data, think of it like oauth2.0 with gmail, but much more fine
  grained**." The bare "interoperable and extensible" adjectives are out;
  the mechanism is in: identity/access are programmable (grants are
  data), so a new app *requests access to the user's existing data* —
  the OAuth2.0-with-Gmail analogy, but far more fine-grained. The snake
  game + new marketplace are the worked examples.
- **(agent)** Take 17 drops the take-16 fifth sentence and closes on the
  mechanism: "because identity and access are programmable — grants are
  data — a new app requests access to the user's existing data the way
  an OAuth app requests Gmail, but far more fine-grained. A snake game
  and a new marketplace run on it that way, without the node learning
  anything about them." Sentences 1–4 unchanged. The OAuth analogy is
  the logical-awe landing for a technical reader. (Riff logged here; the
  full changelog/plan/lane entry lands when the pitch gets the pass.)

### Shot 0, take 15 → take 16: "interoperable and extensible" is the punchline pair

- **(operator)** "interoperable and extensible." The two properties the
  generic design buys are named by those two adjectives — make them the
  claim of the closing sentence.
- **(agent)** Take 16's fifth sentence: "And that generic design is what
  makes the node interoperable and extensible: new games and new
  marketplaces run on it, and because every app speaks the same
  primitives, they interoperate by design." Sentences 1–4 unchanged from
  take 14. (Riff logged here; the full changelog/plan/lane entry lands
  when the pitch gets the pass.)

### Shot 0, take 14 → take 15: "extensible" is the word

- **(operator)** "nice, like the word extensible, it is extensible to a
  new game, a new parketplace." The fifth sentence should say
  *extensible* — it names the extensibility point (new apps keep landing
  on the node) in one adjective.
- **(agent)** Take 15's fifth sentence: "And that generic design is what
  makes the node extensible to new games and new marketplaces: it is a
  substrate, not a social backend, and because every app speaks the same
  primitives, the apps interoperate by design." Sentences 1–4 unchanged
  from take 14. (Riff logged here; the full changelog/plan/lane entry
  lands when the pitch gets the pass.)

### Shot 0, take 13 → take 14: the fifth sentence is about *new* apps on the same platform

- **(operator)** On the fifth sentence's tail: "the social app, a game,
  and a marketplace run on the same store" → "the social app, **a new
  game, a new marketplace** can all run on **the same platform**." The
  point is extensibility (new apps keep landing on it), not just that
  three coexist; and "platform," not "store."
- **(agent)** Take 14's fifth sentence: "…the node is a substrate, not a
  social backend, so the social app, a new game, and a new marketplace
  can all run on the same platform — and because every app speaks the
  same primitives, the apps interoperate by design." Sentences 1–4
  unchanged from take 13. (Pitch riffs are logged here; the full
  changelog/plan/lane entry lands when the pitch gets the pass.)

### Shot 0, take 12 → take 13: take 11 was the better structure; beef the end with the implication

- **(operator)** Pasted take 11 (the bespoke-APIs convention → the
  generic surface → the AST boundary → "the permission model is data in
  the very store it protects") and: "this is better we want to add
  sentences actually beef it up a litte at the end. something about the
  generic design opening the door for everything app +
  interoperability."
- **(agent)** Take 13 = the take 11 structure, kept, with a beefed
  ending: the generic design opens the door to an everything app (the
  node is a substrate, not a social backend; one surface can be a feed,
  a game, and a marketplace), and because every app speaks the same
  primitives, the apps interoperate by design. Take 12's
  email-vs-federation / Mastodon positioning is *not* in the pitch — it
  stays in the paper's positioning notes (§1/§4 + related work, per the
  take 12 entry). The pitch spec is loosened from a hard four sentences
  to ~4–6, with the end beefable for the implication.

### Shot 0, take 11 → take 12: "almost summarizes the paper" — add the implication + the email-vs-federation positioning

- **(operator)** "this is starting to get god, almost summarizes the
  paper. the implication of the generic backend is potential for an
  everything app. it makes it interoperable by design. but this is also
  built to have free choice, with multiple nodes. but this isnt
  federation like on mastodon or bluesky which never took off really
  just one popular server for those, this is more like email, not doing
  anything so complicated for this."
- **(agent)** Take 12 adds the two missing beats: (a) the **implication**
  of the generic backend — everything-app potential, interoperable by
  design, multiple nodes / the user's free choice; and (b) the
  **positioning** — this is *not* Mastodon/Bluesky-style federation
  (which never took off, just one popular server for each), it's more
  like email: user-addressed, without the complicated machinery. The
  "bespoke APIs" convention opener and the "permission model is data /
  provable" landing are traded for these two beats; the AST mechanism
  (the safety awe) stays.
- **(agent) Positioning note for the paper:** the email-vs-federation
  contrast is a sharp differentiator — web10 is *user-addressed* (like
  email), not *server-federated* (like Mastodon/Bluesky). Surface it in
  §1/§4 and the related-work positioning; it reinforces differentiator
  #5 ("a user-addressed network without federation").

### Shot 0, take 10 → take 11: "like a gas station: get rid of that"

- **(operator)** The gas-station simile is out of the pitch.
- **(agent)** Take 11 = take 10 minus the simile: sentence 2 is now
  "web10's node is completely generic: read and write on data, and
  configuration for identity and access, executed every time the data is
  used." Everything else unchanged. (The gas station was the operator's
  own throwaway from the take-5 direction — "or something" — and it
  didn't earn its place in the pitch; it can still live in §1 or a
  figure if it lands there.)

### Shot 0, take 9 → take 10: combine takes 8 + 9, drop the "ecosystem in the bottle"

- **(operator)** "conbine takes 8 and 9, take out the ecosystem in a
  bottle thing … dont need that." The bottle closing is out.
- **(agent)** Take 10 is the combination: take 8's beats (the
  bespoke-APIs convention, the gas-station image, the provable landing)
  + take 9's mechanism (what generic actually is — data RW + IAM
  configuration executed when the data is used; the AST boundary; the
  developer-tuned query). Arc: convention → the generic surface → the
  AST + developer-owned query → the inversion + the provable landing.
  Four sentences, no bottle, no SQL.

### Shot 0, take 8: "okay" but not genius — the operator supplied the real architectural content

- **(operator)** Verbatim: "okay, but you want someone to think you are a
  genious, what is generic, it is generic data RW + identity access
  management configuration RWE -> this gets executed when using the
  data. AST syntax trees are used to protect queries, making sure the
  data you read is data you are supposed to read, and the lakehouse
  queries themselves are up to the developer to optimize, pretty crazy
  it is like an ecosystem in a bottle."
- **(agent)** Take 8 was clean but didn't land the genius — it described
  the inversion without naming *what* is generic. The operator supplied
  the mechanism: the node's surface is generic data RW + IAM
  configuration that is *executed when the data is used*; an AST rewrites
  the query so the reader sees only what their grants allow; the
  application's developer writes and tunes the lakehouse queries (the
  platform guarantees the boundary, not the performance); the whole
  thing is "an ecosystem in a bottle." The genius is *shown*, not
  asserted — this is logical awe producing the genius feel. "SQL" stays
  out; "AST" is the architecture-level word that replaces it. Take 9
  fires this content.
- **(agent) Spec addition:** the pitch lands the genius by naming the
  real mechanism (data RW + executed IAM configuration · the AST
  boundary · developer-tuned lakehouse queries · the ecosystem in the
  bottle), not by adjectives.

### Shot 0, take 7: missed — "no no no the word SQL"; the pitch wants an avant-garde architectural nuance

- **(operator)** Verbatim: "i want to learn a nuance about
  architecture, something avante garde i know this is howard roarke
  now, wow, give me something real, something where it is like yeah
  this is great. **using the word sql no no no.** the ui we built uses
  completely generic functions, we are turning what was bespoke apis
  with social functions into databases like a gas station or
  something."
- **(agent)** Two misses in take 7: it sat in the individualist-hero
  register (Howard Roark — the user vs. the platform) instead of
  carrying an *architectural* nuance, and it leaked an
  implementation-level word ("SQL"). The nuance the operator names:
  **the inversion** — every social platform builds its features as
  bespoke APIs (a feed endpoint, a follow endpoint, a like endpoint);
  web10's UI uses completely generic functions over one shared store,
  and the social features are *definitions the app writes into the
  database* instead. The node is like a gas station: completely
  generic, nothing social in it. The awe landing: the permission model
  is data in the very store it protects, so every read is checked
  against the reader's own grants before it touches anything. Take 8
  fires that angle.
- **(agent) Spec additions:** no implementation-level words in the
  pitch (SQL, CTE, JWT — architectural-level only: store, grants,
  definitions, functions); and the pitch must carry a *move* — an
  architectural nuance that makes an architect go "yeah, this is
  great" — not only the empowerment story.

### Shot 0, take 6: missed — incoherent stakes-list; the fix is a *simple* product hook that builds into the awe

- **(operator)** Verbatim, on "The user can export the posts, but the
  followers, the grants, and the audience stay behind": "what the fuck
  is they talking about, **either it should be technichal, going for the
  awe, dont need a product pitch. told you the hierarchy of
  importance**." Then, the clarification: "**product pitch is simple,
  everyone knows shadowban what that is**."
- **(agent)** Read together: the take-6 failure was not "product vs.
  technical" — it was an **incoherent abstract stakes-list** ("the
  followers, the grants, and the audience stay behind" — what *is*
  that?). The product pitch is fine *when it is simple*: one concrete,
  universally-understood pain. **Shadowban** is the example — everyone
  knows it. So the pitch leads with the simple product hook
  (shadowban) and *builds into* the technical awe (the utmost score),
  instead of opening on an abstract list or on dry mechanism alone.
  Importance (the stakes) stays the calibrated, lowest-priority score —
  but a *simple, concrete* hook is how you earn the reader's ear before
  the awe.
- **(agent) The pitch spec now says:** aim at the *utmost* score
  (logical awe) as the landing; lead with a *simple, universally-known*
  product pain (e.g. shadowban — one word, everyone knows it); third
  person; no incoherent stakes-lists, no dry mechanism with no hook.
  Take 7 fires: shadowban hook → the decision becomes the user's → the
  hard part (shared store, apps write their own SQL) → the compile +
  the replayed proof.

### Shot 0, take 5: missed — "you you you, not professional, third person"

- **(operator)** Verbatim: "this you you you, not professional , i
  think third person." The pitch was written in second person
  (marketing register); a research paper speaks of "the user".
- **(agent)** Locked into the pitch spec: **third person, never second
  person** ("the user", not "you"). Take 6 fires the same angle in
  third person.

### Shot 0, take 4: missed — email is inaccurate, "stuff" is not paper, and stop patching

- **(operator)** Three hits: (1) "Your email address is yours, and it
  follows you when you change providers" — **not accurate**: email does
  not follow you; "no one puts a dns thing in front of their email in
  case they get banned — who gets banned from their emails?" The real
  email insight is user-addressing + no central authority + a standard
  protocol, *not* address portability across providers. (2) "the rules
  of who can see your **stuff**" — "stuff … that is totally stupid way
  to put it … not research paper language." (3) "this isnt an add … it's
  like if our research paper were 4 sentences, so just not written
  right, just off the top … **take a fresh take, 4 sentences! could be
  totally different take, angle, unrelated, different way we could take
  the paper**." "we" is fine (research register); the problem is the
  whole thing was a rough patch of the same skeleton.
- **(agent)** Lessons locked in the theory: the pitch must not overstate
  email (email proved user-addressed + no central authority, not
  "your address follows you"); use the paper's concrete nouns (posts,
  followers, grants, audience), never "stuff"; and a repeated miss on
  the *same* skeleton means the next take changes the **angle**, not
  the words. Take 5 (fired in the thread) drops the email frame
  entirely and leads with the "a company's rules vs. your rules"
  contrast, landing on "safety is a check, not a trust."

### Shot 0, take 3/4: the line count is dead; the pitch is 3rd-grade, 4 short sentences

- **(operator)** "no one cares how many lines of code we wrote." The labor
  number (958,824 added / 568,594 deleted) is not a story beat — it's a
  vanity metric. Take 3 also "feels fake, puts me to sleep" (wordy,
  manufactured drama). And the pitch should be "like a 3rd-grade
  paragraph, like 4 short sentences."
- **(agent)** The line count is pulled from the pitch, the importance
  beat, and the "labor is a lede" rule; it survives only as a
  reproducible fact in `ops/numbers.md`. The pitch spec is rewritten to
  the **smart-kid test**: the core argument in ~4 short, plain sentences,
  simple enough to instantly say yes or no — not the abstract (no
  evidence enumeration), not a dense wall, not a vanity-metric flex.
  Take 4 fired in the thread.

### Shot 0, take 2: missed on the opener — "what is your data, a pet?"

- **(operator)** The critique of take 2, verbatim: "proved your data can
  live with you … what is your data, a pet?" — the opener's stake ("your
  data") is an abstract noun; the reader can put a pet in its place, so
  the stakes aren't named.
- **(agent)** The lesson is in the theory: `method/README.md`'s pitch
  spec gains the **pet test** (name the stakes concretely; the opener's
  noun is the thing — mail, not "data"; the payoff mirrors the opener's
  noun), and `craft/voice.md` rule 1 now carries it. Take 3 fires in
  the PR thread: the opener names the mail proof + the social life as
  the format that matters most; the payoff mirrors it ("Your social life
  leaves the building with you. Now your rules do too.").

### Shot 0, take 1: missed — the pitch spec is now in the theory

- **(operator)** The critique of take 1, verbatim: "**'closes the split,'
  dont like that, also this paragraph is so dense, this is almost too
  dense, dont need to literally be shown the section of the abstract
  like this. lets incorporate this into the theory, show me another
  take.**"
- **(agent)** The lesson is in the theory: `method/README.md` Shot 0 now
  carries **the pitch spec** (the pitch is the argument, not the
  abstract — no evidence enumeration; one claim per sentence, no
  clause-stacking; ~150–230 words; no internal shorthand as a verb; the
  payoff line breathes at the end), and `craft/voice.md` rule 6 now says
  one claim per sentence / no clause-stacking. Take 2 fired in the PR
  thread.

### The theory is a folder — hierarchical, multiple readmes

- **(operator)** "the ai paper theory document needs to be a folder,
  hierarchical broken down multiple readmes."
- **(agent)** `research/ai-paper-theory.md` (the ~550-line monolith) →
  `research/ai-paper-theory/`: README (the map + the fundamental + the
  gates in one line each) · oracles/ (README + external.md the reviewer's
  five questions + internal.md the three awe scores) · spine/ (README the
  journey + the section map + differentiators.md + proof.md the
  combination) · method/README.md (the shot loop, with the same day's
  diagram-gate refinement: pitch → outline → diagram shots → section
  shots → PDF) · craft/ (README + voice.md + figures.md + evidence.md) ·
  ops/ (README + attack-surface.md + numbers.md + rebuild.md +
  checklist.md) · diagnosis.md. Living references updated (the lane
  Owns, kb/README, OUTLINE, this header); historical changelog/plan
  entries keep the old path name. Content carried over unchanged apart
  from the diagram gate; the monolith is retired.

### The outline-synthesis process: shots, human in the loop, restart free

- **(operator)** "We need an outline synthesis process. You have the whole
  knowledge base, the research that was done. **You need to propose
  before an outline — I think like a paragraph, i.e. a shot! Like a
  YES YES YES, that is it, this is what we are going with this.** Then
  you take shots at the outline with human in the loop critique, then
  take shots at sections with human in the loop critique, kind of comes
  together like that. And then can start all over again even if it
  doesn't hit the mark — papers are cheap." Gate order, refined the same
  day: "so **paragraph, get a pass, outline, get a pass. I think actually
  before sections, maybe we should just go straight to the html diagram
  stuff, get approvals on those. then section by section, we can
  attack!**"
- **(agent)** The theory §10 is now **the shot loop**: Shot 0 = the pitch
  (one paragraph, the whole paper: setup → system → theorem → proof →
  labor → payoff; gated on the operator's yes — a miss means the spine
  is wrong, not the wording); Shots 1..n = the outline, shot in slices
  with critique between; Shots m..k = the sections, complete and
  critique-ready, evidence per kb/experiments.md, figures per
  kb/diagrams.md; final gate = the full PDF read (the awe scoring) + the
  acceptance checklist. Shot rules: complete enough to critique, bounded
  enough to restart; carries its own "why"; self-scored against both
  oracles before firing; the operator's critique recorded in this log
  verbatim where sharp; two misses = third shot with a changed structure
  or a restart; restart free at any granularity. The gate order per the
  operator's same-day refinement: **pitch → pass → outline → pass → the
  HTML diagram shots → pass → the section shots ("we can attack!")** —
  the visual spine is approved before the prose writes around it, so the
  section shots reference stable, approved figures and the page-budget
  math is settled early.
- **(agent)** **Shot 0 fired 04.11.2026** (the pitch paragraph, in the
  PR #1396 thread) — awaiting the operator's yes. On a hit: the pitch
  locks into the outline's arc and seeds the abstract; the outline
  (already drafted) is re-shot as slices against it.

### The three awe scores: logical awe the utmost (NP system, P proof), original work second, importance calibrated — the genius score retired

- **(operator)** Ranks the awe scores: **logical awe is the utmost
  important** — "that they see this logic that is really good but
  tactical kind of complex, but if given the steps verifiable! showing
  them something NP with P verifiability is a good analogy." **Never
  been done before is second** — "that it is original work." **Importance
  is third and calibrated** — "this is important, but research
  unfortunately alot of times is not that important and is in
  conferences."
- **(operator)** **The genius score is deleted** — "we can get rid of
  that, that is almost too vague."
- **(agent)** `ai-paper-theory.md` internal oracle rewritten: three
  scores in priority order with targets — **logical awe ≥ 8 (hard gate,
  the utmost), original work ≥ 8 (hard gate), importance ≥ 6
  (calibrated)**; the NP/P analogy pinned as the *definition* of logical
  awe ("awe is the gap between the NP-looking system and the P-looking
  proof, closed by the steps"); the why-not-X chain survives as a device
  feeding logical awe (visible verification steps), not as a scored
  outcome; the six "ohhh moments" demoted from a pinned list to
  technique. `OUTLINE.md`'s awe-beat map re-ranked to the three scores
  (the why-not-X beats moved into the logical-awe row); the acceptance
  checklist now carries three score boxes; the second draft re-diagnosed:
  logical awe ~4, original work ~3, importance ~2.
- **(agent) The outline's genius row is retired in the living docs but
  kept in this log as history** (the log is append-only in spirit; the
  theory and outline are the living spec).

### The two oracles: the five questions + the four awe scores

- **(operator)** The paper has to make the reader *feel* it: "why is this
  important, big picture????" · "why has this never been done
  before????" · "why is this genius????" · "wow, this is procedural,
  logical, wow, this is like a 3-move chess tactic right here, the
  calculation right here, kind of creative, wow! give them this kind of
  awe!" — four scores: the **importance score**, the **never-been-done
  before score**, the **genius score**, the **logical-awe score**.
- **(agent)** `ai-paper-theory.md` now carries **two oracles**: the
  external (the reviewer's five questions — acceptance mechanics) and the
  internal (the four awe scores — the reader's experience), with the
  scoring rule (compare phase scores 0–10 against the named beats; target
  ≥ 8 on all four; the operator's read is the final scoring). The six
  "ohhh moments" are pinned (the grant as a row · publicness as a grant ·
  the wall not the membrane · verified not registered · the social graph
  as data · client-mediated federation) and tagged to the five
  differentiators. The proof skeleton is now presented as a chess
  combination (setup → forcing move → calculation → finish; the
  output-filter is the blunder the wall refutes; the conformance suite is
  the engine verifying the line). The second draft's current awe scores
  are diagnosed: importance ~2, never-before-done ~3, genius ~3,
  logical-awe ~4 — "not hitting the mark" quantified. The acceptance
  checklist gains the awe boxes; the attack surface gains
  "rigorous but flat"; the rebuild order gains the awe pass.
- **(agent) The never-before-done claim stays structural, not
  superlative:** each prior system is forced to drop a corner of the
  five-differentiator conjunction; "first-ever" language is printed only
  when the gap check (`research/related-work.md`) is YES, otherwise the
  claim is scoped to the compared systems, stated as fact.

### The bulletproof turn: papers are cheap, the outline is the review surface, the KB is around the paper

- **(operator) The fundamental redefinition.** The journey: (a) we built a
  whole highly technical system; (b) we wrote a draft on what we *thought*
  made it different (the bones, the references, some actual research);
  (c) we quabbled — no, this isn't what's different, that isn't — it is
  *these things particularly*; (d) we proved it performed and did what it
  promised — tests that prove the architectural claims, the business
  claims, and the scale claims; (e) now we are here, taking a step back
  and constructing a new paper, willing to do as much work as doing it all
  over again; (f) **the million lines of code was the labor — the paper is
  cheap**, and writing it with AI is the easy part.
- **(operator) We can deviate pretty significantly from the first draft**
  for the sake of a more accurate, better paper.
- **(operator) Risk is affordable:** risk sounding too high-ego, risk a
  stylistic gamble — **follow through with it**. "None of that hedging
  bullshit we did before! If papers are cheap, we can afford it!"
- **(operator) The set-inclusion formalization of the permission theory
  (§2's `effective(P, G)` union expression) "is really great"** — it is
  the paper's crown jewel and gets theorem treatment. The paper should
  "make sense, be logical, be like reading a proof or something."
- **(operator) It should look like a research paper:** the diagrams very
  nice, the plots done in familiar ways, "a certain way they just look."
- **(operator) Even cheaper is an outline:** the human operator struggles
  to read the full 12 pages — the review surface is the almost-logical
  flow, "what we are going to write and why."
- **(operator) A knowledge base around the paper:** not just the outline —
  all the accompanying documents: ideas around the experiments, why the
  experiments were important, notes on what to show in the diagrams, why
  that is visually nice.
- **(operator) "We want to guarantee a good paper, getting accepted, have a
  bulletproof theory."**
- **(agent) `research/ai-paper-theory.md` rewritten bulletproof:**
  organized around the reviewer's five questions (the external oracle),
  with the attack-surface table (each failure mode → named
  countermeasure), the acceptance checklist (the guarantee made
  operational), and the residual risks stated as fact. Supersedes the
  4.9.1 three-act "churn as lede" spine: the churn is now "the labor",
  the proof structure is the spine, and the surgical-pass
  recommendation is superseded by the outline → prose rebuild.
- **(agent) `second-draft/OUTLINE.md` drafted:** the arc in one paragraph,
  the five differentiators, section beats with KEEP/REWRITE/NEW/CUT +
  their "why", the Q&A evaluation (Q1 architectural / Q2 business / Q3
  scale / Q4 cost-of-alternative), the figure plan, and a page allocation
  that sums to 12.0 body pages. It is the operator's review surface.
- **(agent) `second-draft/kb/` created:** `README.md` (the map + gates),
  `experiments.md` (six experiments × what / why it was important /
  established / evidence / open / where in the paper), `diagrams.md`
  (the design language — color is semantic, the same mechanism drawn
  identically — plus per-figure rationale and the figure plan).
- **Not done:** the manuscript prose. Gated on the outline approval and
  the open questions (churn range, scale framing, authorship, in place vs.
  new folder).

### Narrative pivot: the churn is the lede; the approach is pinned in `ai-paper-theory.md`

- **(operator) The second-draft prose is "not hitting the mark" — "there is
  potential."** The brief: tell the best story of the ~1.1M code additions /
  ~700K deletions that went into the project. We don't have to line up with
  the first draft; deviate a lot. It's 12 pages — re-drafting is cheap.
- **(operator) Make the paper-writing approach a document: `research/ai-paper-theory.md`**
  — done. It pins: the three-act spine (the split / the churn / the proof;
  "the generic core was earned, not designed"), the four-phase method
  (orient → draft → compare → repair, paper edition), the 12 editorial
  rules, the pinned reproducible numbers, the diagnosis of the current
  draft (what works: §7, wall-not-membrane, the email frame; what isn't
  landing: the mechanism-list abstract, the absent churn, hedge density),
  and the open questions for the operator (spine confirmation, churn range,
  evaluation scope, authorship, surgical pass vs. third draft).
- **(agent) Pinned churn count:** `git log --numstat` over all text files,
  all commits since 2021-11-14, merge commits excluded = **958,824 added /
  568,594 deleted** (04.11.2026). The operator's ~1.1M/~700K is not
  reproducible at that range (since-2025: 676,325/494,782; code-extensions
  only: 457,655/257,104; merge diffs included: 1,611,136/837,686). The range
  is an open question before any number is printed.
- **(agent) The new-figure work (fig:app, fig:boundary) is paused** pending
  spine confirmation — figure content is downstream of the story. The
  figure system itself (below) stands.
- **(agent) Recommended prose pass is surgical, not a third draft:** rewrite
  the abstract (three acts, ~150 words), rework the intro (churn lifted,
  contributions with so-whats, Table 1 after the story), open §7 with the
  churn numbers, close the conclusion with the churn resolution, voice pass
  across. A whole re-draft only on operator direction.

### The figure system: HTML source, PNG raster, 2x

- **(operator) Diagrams are authored in HTML.** Every architecture diagram in
  the second draft is a committed `figs/<name>.html` (fixed-size body, dark
  web10 theme) rendered to `figs/<name>.png` with `figs/capture.mjs`
  (headless Chromium, `deviceScaleFactor: 2`). LaTeX includes the PNG; the
  HTML is the editable source. Rationale: the previous PNGs were uneditable
  rasters with no source in the repo, and HTML iteration with the operator is
  fast. How-to: `figs/README.md`.
- **(agent — open to review) UI screenshots stay PNG-only.** `fig-groups.png`
  and the interop/domain screenshots are captures of the running app, not
  diagrams — no HTML source; they follow the app's screenshot harness.
- **(operator) The figure set grows: 3–4 more architecture figures are
  warranted** — the system has unusual mechanisms that deserve their own
  figures (planned set below). Constraint: the 12-body-page budget (internal
  freeze Nov 20). New figures must earn their height; wide/short canvases and
  full-width floats preferred. If the body exceeds 12 pages, the operator
  picks which figures stay.
- **(agent) Figure-accuracy invariant:** a figure may only assert what the
  paper body or the knowledge base already asserts (e.g. `/certify` = "one
  cached answer per token, never a grant"; boundary CTEs sit before
  aggregation). A figure that adds a new claim is a new claim that needs
  evidence. No internal decision/PR IDs in figure text or captions
  (conference-facing, per the 4.5.4 cleanup).

### Planned figure set

| Figure | Section | Content | Status |
|---|---|---|---|
| `fig:overview` (TikZ) | §1 | one client, two sovereign nodes, `/certify` | existing |
| `fig:feed` (HTML) | §6 float | federated node architecture — identical A/B internals, `/certify` the only difference | **redrawn today** (below) |
| `fig:groups` (screenshot) | §6 | groups UI | existing |
| **`fig:app` (HTML)** | §6 "A frontend over the shared node" | web10-social as a stateless lens: app surfaces → app-defined expressions (documents in app services / social graph as group rows / feeds & search as app queries / media as the generic pipeline) → one generic node with the "refuses to learn" callout | in flight |
| **`fig:boundary` (HTML)** | §5 enforcement | wall not membrane: the broken output-filter pipeline vs the boundary-CTE pipeline | in flight |
| `fig:interop` (screenshots) | §6 | snake / marketplace identity screens | existing |
| `fig:domain-follow` (screenshots) | §8 | domain portability before/after | existing |
| (candidate) data-model (HTML) | §3 | one table: `{service, body}`, updates-as-inserts, tombstones, `doc_groups` | candidate, not started |
| (candidate) two-trust-layers (HTML) | §2 | app trust (outer) / person trust (inner), a grant is a row | candidate, not started |

### `fig:feed` (Figure 2) redraw

- **(operator) node B does the same access checks as node A, with `/certify`;
  the old diagram showed the internals as different.** Fix: both nodes draw
  the identical card structure (users / data / contracts / memberships), the
  same violet "access check — contracts + membership · every read" box on
  each, bridged by a "same access check" pill. The only differences: the
  token-verification step (own signature at A vs `/certify(A)` cached until
  expiry at B), the matching "enforces" lines, and A's "serves /certify" box,
  which B's green `/certify` line targets. Node B is mirrored so the two
  identical access-check boxes sit adjacent in the middle.
- **(agent) Stale caption replaced.** The `fig:feed` caption described the
  feed UI (ranking tabs, tag filters) that was never in the figure —
  inherited from the first draft (both drafts shipped the architecture PNG
  with the UI caption). New caption: pulling the feed across nodes,
  `/certify`, the same access check.
- **(agent) First body citation added** in §4 "The read model:
  client-side fan-out" — the figure was previously uncited (no `\ref`
  anywhere in the manuscript).
- Tectonic after the change: 14-page PDF = 12 body + references
  (unchanged), no overfull hboxes, same 1.166pt final-page overfull vbox as
  4.8.2.
