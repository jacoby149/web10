# Tallies: fetch numbers, not the documents behind them

**D114, Jacob Hoffman,18 November2026: platform design intent; isolated research
implementation first.** A tally is a generic satellite in the fanout family.
The platform is intended to maintain it; an app supplies the counter's meaning
as data. This admission builds canonical setup tallies and verifies them. It
does not implement production write maintenance, a new API or a protocol rollout.

## Build, verify, then read

1. Resolve current canonical document/attachment history and the existing reader's
   actual per-service group/policy scope. No author hint replaces an attachment.
2. Apply named recipes to authorized current rows, then aggregate by target.
   The generic schema is `(doc_id, counter_name, scope_key, value UInt64)`, ordered
   by those lookup keys. The research instance is `counting_numbers_tally`.
3. Bind each completed scope to reader, exact service/groups, recipe definitions,
   canonical policy generation and migrated-copy part identity. Missing or stale
   scope is a refusal, not a zero or permission to read another scope's scalar.
4. Verify before serving: every ordinary/paired page root against the independent
   oracle, the banked fat verification fixture, and a deterministic store-wide
   root sample. Any mismatch stops measurement admission.
5. Keep the existing authenticated compiler and live scope/generation checks.
   Only the known displayed-count aggregates become literal target/scope/kind
   lookups. Canonical post/profile/preparation and document-on-open reads remain.

Setup partitions by stable engagement doc_id before history resolution; versions
and attachments of an identity never split across batches. The existing query
contract's authorized attachment multiplicity is retained, not silently DISTINCTed.
No target is page-pinned at build time. Count absence means zero only inside a
completed, verified matching scope; unknown reaction kinds retain presence rows.

## Root and finer-target meanings are separate counter kinds

Under uniform refs, every engagement contributes to its root. A finer body target
also receives that engagement, once per distinct target. Comments name parents
with `parent_id`; reactions name finer targets with `target_id`. Recipes, not
table columns or node concepts, carry these meanings.

`reactions:like` counts all matching reactions at their root and finer target.
The existing feed query explicitly displays reactions with empty `target_id`;
its lookup uses `reactions:like:direct` (and the corresponding dislike/presence
kinds). This does not change its oracle or mislabel comment likes as post likes.
Comments/reposts retain the existing displayed-count aliases and meanings.

The banked fat fixture therefore verifies50,000 comments,13,462 root-wide likes,
6,731 direct post likes and6,731 likes distributed over the exact comment target
map. Reconstructing its deterministic canonical document/link fixture is setup
for tally verification, not a Stage D performance rerun. No view events or
aggregate are seeded by that reconstruction.

## This experiment's verdict

PR#1590's actual treated FAILs and original F FAIL remain banked. The new verdict
is exact parity with count stages in the counter-scope class—thousands of rows,
not hundreds of millions. Report the whole response too, with raw views,
unclassified and unchanged node-ad preparation named separately. Those remainders
are neither a tally failure nor a feed PASS. No arithmetic Stage B substitution.

The new task admits one fresh DO lease,26.10.4.207 and32/28/22GiB, bound before
execution. No row stop;600s statements/native-completion polling; agent~300s and
self-kill timers only, no guardian. Uniform K20 is required; old-semantics
projection K20 is optional if the original clock allows. No baseline/B/D/§8 or
production work. Live write maintenance, invalidation and rollout need separate
protocol/production admission. Contract: the existing engagement task block.

## First run: ordinary cost measured; paired precheck incomplete

The19 November run measures ordinary count-stage collapse with exact response
parity: three isolated table reads each1,600 rows/107,200 bytes and two follow-ups
total2,688 rows/353,839 bytes. Fat maps and60 sampled roots verify; whole responses
retain their preparation/views/unclassified budget FAILs. However, the final
audit finds all20 actual paired roots absent from five legacy-inventory-derived
verification domains. Raw PASS flags are preserved but do not satisfy that
gate. Full tally acceptance is OPEN. Source now builds verification targets from
the independent oracle's actual IDs and refuses omitted roots even for all-zero
counts. Cleanup is verified; native repair acceptance needs fresh admission.
Receipts and limitations: `research/experiments/costfn/evidence/engagement-tally-20261119/RESULTS.md`.
