# K20 findings: what the projected and hybrid arms established

This document interprets two banked runs on the same fixed slice, under the same independent complete-response oracle: the projected canonical arm (evidence/k20-projected-20261125/RESULTS.md) and the hybrid attachment-history arm (evidence/k20-attachment-20261125/RESULTS.md). Figures stated as measured are transcribed from those two records. Figures stated as arithmetic are computed from the realism contract and are labelled as arithmetic, not measurement.

## Two quantities answer to "memory," and they behaved differently

The first quantity is peak statement memory: the largest amount of memory any single statement held at once. It did not materially change. In the hybrid comparison, the indexed arm's largest statement memory was 87,968,547 and 89,277,539 bytes in the two measurement orders; the hybrid arm's was 85,807,499 and 90,930,384 bytes. The large stages stream rows rather than accumulating them, so reading fewer bytes did not reduce the peak. Against the reference node's memory allowance of roughly 17 GB per read, this quantity was never close to binding, and no memory saving of this kind is claimed.

The second quantity is captured logical bytes read: the volume of data the engine read to produce the response. Every logical byte travels from storage through memory to the processor, so this quantity is the numerator of the bandwidth budgets — how much data movement each read demands. It fell by 70.6%. This is the saving the hybrid actually produced, and the rest of this document is about it.

## Step 2: the payload was never the cost

The projected canonical arm verified that the layout can omit the document body during ranking: the projected key statements' native receipts omit the body column. The complete-read cost did not fall. Projected canonical read 622,458,125 logical bytes against the indexed arm's 620,851,039, an increase of 0.26%, and the complete HTTP wall times were 6,020.980 ms and 6,014.100 ms. The two large stages were not spending their reads on the body. Resolution with embedded counts selected 323 and 54 granules from the group-membership structure where a canonical document lookup selects two, and preparation's remaining canonical creative query read 98,434,862 logical bytes on its own. The cost sat in granule selection over the attachment history. The step-2 record's prescription — prioritize the attachment history access pattern, not another body-column rewrite — set step 3's target.

## Step 3: the hybrid cut data movement by 70.6%, at exact parity

The hybrid arm stores the attachment history in a skinny table under its own sort key, beside the canonical store, under the settled write discipline. Both measurement orders passed the independent oracle at exact parity. Captured rows read fell from 8,942,938 to 3,265,935, a reduction of 63.5%. Captured logical bytes read fell from 620,851,039 to 182,335,633, a reduction of 70.6%. The stage that owned the indexed arm's cost collapsed: resolution with embedded counts fell from 240,762,306 logical bytes to 4,938,909. Preparation fell from 303,819,000 to 101,119,929, a figure that still includes creative preparation the hybrid did not change. On the native plans, the two attachment reads went from selecting 323 and 54 granules to selecting 21 and 1 in the skinny table.

## What the reduction is worth at the contract's scale (arithmetic, not measurement)

The realism contract fixes 0.25 page reads per account per day, which at 1,000,000 accounts is 250,000 page reads per day and a peak rate of 15 reads per second. The measured saving is 438,515,406 logical bytes per read. Multiplied out: about 110 MB less data movement per account per day; about 110 TB less data movement per node per day; and a peak sustained throughput demand of about 2.7 GB/s in place of about 9.3 GB/s, on this slice's profile. The budget's disk line allows 73 MB per read at the reference array's guaranteed 1.09 GB/s; on the slice profile the indexed arm stood at about 8.5 times that allowance and the hybrid at about 2.5 times it. The full store's profile is lighter — its indexed complete response measured 123,119,689 logical bytes in PR #1618 — and a reduction of the measured size applied to that profile lands inside the disk allowance. That last sentence is arithmetic on a measured ratio, not a measurement of the full store under the hybrid; the full-store hybrid response has not been run.

## The debit: latency rose, and the six-case gate stays closed

Complete HTTP wall time rose in both measurement orders: 5,741.635 ms to 6,739.253 ms, and 5,490.085 ms to 6,336.874 ms. Summed native duration did not rise (1,094 ms against 1,093 ms; 1,054 ms against 1,059 ms), so the added time sits outside the engine's statement execution, in the hybrid's generation-fence work on the application side; captured statements rose from 75 to 80. Neither arm meets the 500 ms latency target. Under the pre-committed decision rule, this run does not advance to the six-case cell: the reduction in data movement did not carry through to latency, and dynamic publication with concurrent cleanup has not been proven. The frozen-generation fault lab passed seven named cases with 43 native statement receipts — an unpublished missing staged row, identical publication retry after a discarded acknowledgement, a detached committed satellite and its reattachment, stale-generation refusal after a canonical edit, exact rebuild after satellite loss, and missing or conflicting exact-version payloads — on isolated fixtures. Live concurrent publish and cleanup remain unproven.

## The remaining problem is named

After this run, storage is no longer the open problem in the complete response. Rows, logical bytes, and granule counts fell by the measured amounts above; peak statement memory was never the constraint. The open problem is the latency the generation fence adds outside the engine — about a second of complete wall time in these samples — and the unproven live-publication case. Both are application-side. Neither requires another storage arm to investigate.

## Process note

This was the first task run under the operator directive of November 24, 2026. Step 2's first attempt met a tally-verifier name collision before measurement; repair 93806d5c resumed the original admission, validated the five completed setup stages, and did not reissue confirmed slice or tally writes. Steps 2 and 3 and the fault lab completed under one admission on one host, with a task compute estimate of $3.795870 including idle time. Under the rules this directive replaced, the name collision would have ended the run.

## Related records

The design outcomes this run's findings feed: [DESIGN-OUTCOMES.md](DESIGN-OUTCOMES.md) (the hybrid read path, entry 5; the body-pruning rejection, entry 9; the cleanup regime, entry 15).
