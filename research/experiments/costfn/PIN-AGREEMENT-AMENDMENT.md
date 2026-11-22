# Workstream A: D124 pin agreement, not a performance reorder

This is the22 November operator's deliberate behaviour amendment. It changes
the isolated measured composition and its independent oracle/ads gate in one
source PR. It is not described as parity-preserving. No Workstream B selector,
materialization split, cache, production API change or native run is included.

## Old and amended rules

| Eligible live pins for one full-key post | Banked pre-D124 rule | D124 |
|---|---|---|
| None |No ad|No ad|
| One valid pin |Serve its visible creative|Unchanged|
| Multiple pins, same full creative |Refuse|Serve that creative once|
| Agreeing author/node placements |Refuse|Serve as author ad, independent of order|
| Distinct full creative targets |Refuse|Refuse|
| Malformed/placement-unauthorized eligible pin |Refuse|Refuse before coalescing|
| One creative referenced by different posts |Serve each post|Unchanged|

Creative identity is the full`(target_author,target_id)` pair. A matching doc_id
under another author is a different ad. Every eligible pin is body-validated
before duplicate handling; an agreeing duplicate cannot mask invalid placement,
missing target fields or an author placement pointing into a foreign collection.

Existing canonical history and eligibility are unchanged: latest full-key
winner, deletion-winning ties, service/root filters and SQL post_author omission
run exactly as before. A withdrawn/deleted/moved/superseded pin does not count.
Ordinary creative authorization is unchanged; an unreadable/missing creative
remains a no-ad omission. No creative may claim an exclusive slot across posts.

## Source and oracle

`engagement_billboard_reads.attach()` first validates the complete eligible pin
set, then coalesces by full post/full creative. Agreeing placements prefer author.
The original pin SQL and separate canonical creative query are unchanged.

`engagement_billboards.expected_rows()` independently groups immutable eligible
placement records, checks full creative-identity agreement and author precedence,
and returns the expected exact response. It never consumes the runtime pin
lookup or satellite output. The usual banked setup still has one record per
post; amendment fixtures may contain multiple settled placement records. An
inconsistent immutable creative payload for one identity is an oracle-data
error, not permission to choose by row order.

`ads.compare()` and the formal ads receipt name
`D124_FULL_CREATIVE_AGREEMENT_AUTHOR_FIRST`. The ads gate requires that named
semantics in addition to all existing exact-identity/setup/native-evidence
requirements. Old source-policy receipts are not silently accepted as D124
proof; their historical outcomes/files remain untouched.

## Source controls and banked fixture audit

Thirteen new no-engine controls exercise agreeing/conflicting pins, same doc_id
under different authors, malformed/unauthorized duplicates, author precedence
in both orders, shared creatives, zero pins, current withdrawal/service/root/
tombstone history, preserved SQL exclusions, unchanged creative SQL/reader
denial, oracle/gate policy and banked compatibility. The actual pin SQL runs
against a SQLGlot-translated SQLite history model; that is not ClickHouse
optimizer or native execution evidence. Existing duplicate controls are updated
explicitly for this named semantics amendment, not silently weakened inside B.

`fixtures/pin-amendment-bank-audit.json` binds an offline audit of attempt6/7
packets. Both original setup packets have SHA256
`e4f409b048a24004f7dd241c5e43da42b89dfe9cd05ba2f987da63ba75111c14`,
42 posts,32 pins and zero duplicate pin roots. Their338 fixture documents and
950 links are unchanged. The legacy oracle source hash matches both executing
manifests; all12 old/new expected-response comparisons equal their original
captured responses. **No banked fixture configuration changes verdict.** New
same-ad duplicate fixtures intentionally do change the old refusal to serving.

## Sequencing

A merges separately before B. B must target D124, select complete candidate pin
IDs using only named skinny canonical columns after winner resolution, and defer
body-derived ad identities/validation/duplicate comparison to materialization.
The existing creative fetch remains separate and unchanged. Count>1 alone is
not a duplicate refusal under D124. No arbitrary page-size candidate truncation
or guarantee of a small skinny scan is allowed.

No lease/native action/admission follows from this source PR. Native effect is
verified at the separately admitted measuring gate; uniform native work remains
after the row-model run unless Jacob explicitly changes that order. D117 and
the old receipt-ID STOP are not revised by this amendment.
