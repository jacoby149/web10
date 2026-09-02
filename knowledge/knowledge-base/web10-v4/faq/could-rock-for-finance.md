# Why This Rocks For Finance

## The Vision

One database for everything. ClickHouse. OLAP only. Tombstoning. TTL cleanup. No Postgres. No middleware. No sync.

The question: can OLAP-only handle finance?

**Yes. And it's better.**

## The Brittle Balance (Why OLTP Is Dead)

Every OLTP database holds a brittle balance:

```sql
accounts: {id: 123, balance: 1000}
```

It's a lie. It's a snapshot of the past that drifts the moment two threads touch it. You spend millions building CDC pipelines, lock managers, and transaction coordinators to keep this one row "correct." It's brittle. It races. It breaks.

**Why are we holding a brittle balance ever?**

The balance doesn't exist. It's derived. It's the sum of events. The events are immutable. The sum is always correct.

```sql
ledger: {event: deposit, account: 123, amount: +100}
ledger: {event: withdrawal, account: 123, amount: -50}
ledger: {event: withdrawal, account: 123, amount: -50}
Balance = SUM(amount) WHERE account = '123' → 900. Always correct.
```

Two concurrent withdrawals? Both INSERT. Both survive. The sum is correct. No race condition because there's no row to race on. You're appending events, not updating state.

**OLTP is dead.** Stop holding brittle balances. Stop racing on rows. Stop building CDC pipelines to keep a snapshot "correct." The history is the source of truth. The balance is a query. Always accurate. Always derived. Never stale.

## The Current State

ClickHouse doesn't have row-level locking, immediate consistency, or multi-row transactions. For banking, that's a gap. But the gap is closing, and the path is clear.

## The Path: Event Sourcing

Finance is append-only. Every transaction is an event. Every balance is a derived state.

```
INSERT INTO ledger (deposit, account: 123, amount: +100, timestamp: now())
INSERT INTO ledger (withdrawal, account: 123, amount: -50, timestamp: now())
```

The balance is a query:
```sql
SELECT sum(amount) FROM ledger WHERE account = '123' AND deleted = 0
```

**This is OLAP.** Finance is OLAP. The ledger is append-only. The balance is an aggregate. No updates. No deletes. Just inserts.

## No Guards Needed

You don't need optimistic concurrency, version checks, or locks. You're always just computing with the data you have.

```sql
-- Two concurrent withdrawals:
INSERT INTO ledger (account: 123, amount: -50, id: 1001)  -- Thread A
INSERT INTO ledger (account: 123, amount: -50, id: 1002)  -- Thread B

-- Balance is a query, not a row:
SELECT sum(amount) FROM ledger WHERE account = '123' AND deleted = 0
→ 900. Always correct. No race condition.
```

There's no row to race on. You're appending events, not updating state. Both withdrawals survive. The sum is correct. The balance is derived. Always accurate.

**The balance is a query.** `SELECT sum(amount) FROM ledger WHERE account = '123'`. That's it. No guards. No locks. No version checks. Just compute from the data you have.

**Write-time materialization is optional.** You can cache the balance for fast reads. But if the cache is wrong, you recompute from the ledger. The ledger is always correct. The balance is derived. No guards needed.

The OLTP guards (optimistic concurrency, idempotency, double-entry) are legacy thinking. They exist to protect brittle balances. With append-only + compute-on-read, there's nothing to protect. The history is the source of truth. The balance is a query. Always accurate. Always derived. Never stale.

Every transaction has a unique key. Duplicate inserts are harmless:

```sql
INSERT INTO ledger (idempotency_key, account, amount, timestamp)
VALUES ('txn-abc-123', '123', -50, now())
```

ReplacingMergeTree keeps the latest. Duplicates collapse. Safe to retry.

### 3. Append-Only Ledger

No updates. No deletes. Just inserts. Every change is a new row:

```
deposit: +100
withdrawal: -50
correction: +5 (if needed)
```

The balance is always `SUM(amount)`. No read-modify-write. No race conditions. Just appends.

### 4. Double-Entry Accounting

Every transaction has two sides. Debits and credits. The ledger is self-balancing:

```sql
INSERT INTO ledger (type, account, amount) VALUES ('debit', '123', -50)
INSERT INTO ledger (type, account, amount) VALUES ('credit', '456', +50)
```

The integrity check is a query:
```sql
SELECT sum(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as total_debits,
       sum(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as total_credits
FROM ledger
-- total_debits should equal total_credits
```

If they don't, there's an error. The ledger is self-auditing.

## Why This Works

**Append-only is finance's native format.** Ledgers are append-only. Balances are derived. Transactions are immutable. This is OLAP.

**No updates needed.** Every change is a new row. Corrections are new rows. Reversals are new rows. The history is complete. The audit trail is native.

**Analytics are free.** Fraud detection, trend analysis, compliance reporting — all are queries against the same table. No ETL. No sync. No pipeline.

**Tombstones are reversals.** A reversed transaction is a tombstone. `deleted = 1`. The history is preserved. The balance is correct. The audit trail is complete.

**TTL is retention.** 90 days of hot data. Older data moves to cold storage. Regulatory requirements are met. Cleanup is automatic.

## The Compute-On-Read Optimization (Write-Time Materialization)

The honest downside: computing `SUM(amount)` on every read costs CPU. For a high-traffic account, that's repeated work.

**The pragmatic answer: materialize the balance at write time, not read time.**

```sql
-- Write: compute delta, tombstone old balance, insert new balance
INSERT INTO balances (account: 123, balance: 950, deleted: 1, updated_at: now())  -- tombstone old
INSERT INTO balances (account: 123, balance: 900, deleted: 0, updated_at: now())  -- insert new

-- Read: O(1), always accurate, no staleness
SELECT balance FROM balances WHERE account = '123' AND deleted = 0 ORDER BY updated_at DESC LIMIT 1
```

**The flow:**
1. New transaction: INSERT into ledger (append-only, immutable)
2. Compute delta: `SELECT sum(amount) FROM ledger WHERE account = '123' AND id > last_id`
3. New balance = cached_balance + delta
4. Tombstone old balance row
5. Insert new balance row
6. Read balance: O(1), always accurate, no background merges, no staleness

**Why it's savage:** you get the audit trail (full ledger, append-only, immutable) AND the fast balance (materialized at write time, O(1) read, always accurate). The compute happens at write time (fast, delta is tiny). The read is trivial. No materialized views. No async merges. No staleness.

**The trade-off:** slightly heavier write (compute delta + tombstone + insert). The read is O(1). For finance, write-time compute is fine — transactions are rare, reads are frequent.

## The HFT Ensemble (The Food Pyramid)

HFT is an ensemble. Microsecond insights and millisecond insights feed the same algorithm. Different timescales, same decision.

```
Microsecond insights (fast, narrow):
  → Order book depth
  → Spread changes
  → Queue position
  → Latency arbitrage

Millisecond insights (slower, broader):
  → Cross-exchange correlation
  → Sentiment analysis
  → Pattern matching across assets
  → Complex aggregations

The algorithm:
  Microsecond signals + Millisecond signals → Trading decision
```

You don't throw the millisecond stuff out just because it's different. It's a food pyramid. The microsecond insights are the base (fast, frequent, narrow). The millisecond insights are the top (slower, broader, deeper). Both feed the algorithm.

**ClickHouse is the millisecond layer.** Aggregating millions of events in milliseconds beats the market. Cross-exchange correlations, sentiment analysis, complex pattern matching — these are OLAP queries. ClickHouse is a beast here.

**The microsecond layer is separate.** KDB+, custom C++, FPGA. Order book matching, latency arbitrage. Different tool, different timescale.

**The ensemble is the edge.** Microsecond signals tell you *when* to act. Millisecond signals tell you *what* to act on. Together, they beat the market.

**OLAP-only is the millisecond layer.** The ledger is the source of truth. The insight is a query. No brittle balances. No sync. No drift. Just compute from the data you have.

## The Trade-offs

### Latency

Append-only is fast. Queries are fast. The balance is an aggregate — fast on indexed data. For retail finance, milliseconds don't matter. For HFT, they do. HFT doesn't use ClickHouse today. Retail finance does.

### Consistency

Eventual consistency is acceptable for retail finance. A balance that's 1 second stale is fine. A transaction that retries is fine. The user sees "processing" and waits.

### Complexity

You're rebuilding transaction logic at the application layer. More code. More tests. But one database. No sync. No drift. No pipeline.

## The Long Term

ClickHouse is adding OLTP capabilities:
- **Projections** — secondary indexes for faster point queries
- **Materialized views** — real-time aggregations
- **ReplicatedMergeTree** — cross-node consistency
- **ALTER TABLE** — mutations for updates (slow but works)

The path is clear. OLAP-only is the future. One database. No sync. No drift. No pipeline.

## The Honest Answer

ClickHouse for finance requires no guards. You're always just computing with the data you have. The ledger is append-only. The balance is derived. Always accurate. No race conditions. No locks. No version checks.

**The trade-off, stated plainly:** you're trading one complexity (two databases, sync, drift) for simplicity (one database, append-only, compute-on-read). The net is less infrastructure, less code, less complexity. For social media, it works. For finance, it works. For everything, it works.

Long term, as ClickHouse adds OLTP capabilities, the complexity decreases. The vision holds: one database for everything. OLAP only. Tombstoning. TTL cleanup. No Postgres. No sync. No pipeline.

**For social media today:** OLAP only. Works now.

**For finance today:** OLAP only. Works now. No guards.

**For analytical HFT today:** OLAP only. Works now. Millisecond insights feed the ensemble. The algorithm combines microsecond + millisecond signals.

**For everything tomorrow:** ClickHouse adds native OLTP. One database. No trade-offs.

## Summary

Finance is append-only. Ledgers are OLAP. Balances are aggregates. Transactions are immutable. ClickHouse is built for this.

**OLTP is dead.** Stop holding brittle balances. Stop racing on rows. Stop building CDC pipelines to keep a snapshot "correct." The history is the source of truth. The balance is a query. Always accurate. Always derived. Never stale.

**Auditability is native.** Every transaction is immutable. The history is complete. Compliance is a query. Fraud detection is a query. Reconciliations are a query. No ETL. No sync. No pipeline.

**No guards needed.** You're always just computing with the data you have. The ledger is append-only. The balance is derived. Two concurrent withdrawals? Both INSERT. Both survive. The sum is correct. No race condition. No locks. No version checks. Just compute from the data you have.

OLAP only. Tombstoning. TTL cleanup. One database. The vision holds. OLTP is fucking dead.