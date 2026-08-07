# Influencer Deals Marketplace

## The Problem

Influencer deals are messy. Broken contracts. Missing signatures. Lost audit trails. Disputes over terms. "I never agreed to that." "You changed the deliverables." The current system is email chains, PDF attachments, and broken tracking spreadsheets.

## The OLAP Solution

An append-only ledger for every action. Offer made. Offer viewed. Terms negotiated. Agreement signed. Deliverables submitted. Payment processed. Every state change is an immutable event.

```sql
INSERT INTO deals (deal_id: 'deal-123', type: 'offer_created', creator: 'brand-a', influencer: 'influencer-b', terms: {...}, timestamp: now())
INSERT INTO deals (deal_id: 'deal-123', type: 'offer_viewed', viewer: 'influencer-b', timestamp: now())
INSERT INTO deals (deal_id: 'deal-123', type: 'terms_negotiated', negotiator: 'influencer-b', changes: {...}, timestamp: now())
INSERT INTO deals (deal_id: 'deal-123', type: 'agreement_signed', signer: 'influencer-b', signature_hash: 'abc123', timestamp: now())
INSERT INTO deals (deal_id: 'deal-123', type: 'deliverable_submitted', submitter: 'influencer-b', content_ref: 'minio/ref', timestamp: now())
INSERT INTO deals (deal_id: 'deal-123', type: 'payment_processed', amount: 5000, timestamp: now())
```

## DocuSign-Style Agreements

The agreement itself is a document. The signatures are events. The execution is an event. The ledger is the source of truth.

**Creating an agreement:**
```sql
INSERT INTO agreements (agreement_id: 'agr-456', deal_id: 'deal-123', content_hash: 'sha256...', timestamp: now())
```

**Signing:**
```sql
INSERT INTO signatures (agreement_id: 'agr-456', signer: 'influencer-b', signature_hash: 'ecdsa...', ip_address: '1.2.3.4', timestamp: now())
INSERT INTO signatures (agreement_id: 'agr-456', signer: 'brand-a', signature_hash: 'ecdsa...', ip_address: '5.6.7.8', timestamp: now())
```

**Execution status (derived, not held):**
```sql
SELECT count() as signatures, groupArray(signer) as signers
FROM signatures
WHERE agreement_id = 'agr-456' AND deleted = 0
```
If `signatures = 2` (both parties), the agreement is executed. No brittle state. No `UPDATE agreements SET status = 'executed'`. Just compute from the events.

## Why OLAP-Only Rocks Here

**Auditability is native.** Every action is immutable. The history is complete. Compliance is a query. Disputes are resolved by looking at the immutable ledger. "I never agreed to that" is answered by the ledger. "You changed the deliverables" is answered by the ledger.

**No brittle state.** The deal status isn't a row in a table. It's derived from the events. Offer created → viewed → negotiated → signed → executed. The status is a query: `SELECT max(type) FROM deals WHERE deal_id = 'deal-123'`. Always accurate. Always derived. Never stale.

**Fast queries for active deals.**
```sql
SELECT deal_id, max(type) as status, creator, influencer
FROM deals
WHERE deleted = 0
GROUP BY deal_id, creator, influencer
HAVING status IN ('offer_viewed', 'terms_negotiated')
ORDER BY created_at DESC
```
ClickHouse handles this in milliseconds. Active deals, pending signatures, expired offers — all are queries against the same table. No sync. No drift. No pipeline.

**Tombstones for cancellations.** A deal is cancelled? Tombstone it. `INSERT INTO deals (deal_id: 'deal-123', type: 'cancelled', reason: 'mutual_agreement', timestamp: now())`. The history is preserved. The audit trail is complete.

**TTL for retention.** 90 days of hot data. Older deals move to cold storage. Regulatory requirements are met. Cleanup is automatic.

## The Summary

Influencer deals are append-only. Agreements are immutable. Signatures are events. Execution is derived. ClickHouse is built for this.

One database. OLAP only. Tombstoning. TTL cleanup. No Postgres. No sync. No drift. No pipeline.

The ledger is the source of truth. The status is a query. Always accurate. Always derived. Never stale.

OLTP is dead. OLAP only.