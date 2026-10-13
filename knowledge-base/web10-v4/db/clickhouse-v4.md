# ClickHouse v4 — Monetization, Ads, Marketplace, Provider

v3 has 10 core tables: documents, doc_groups, group_contracts, group_members, group_join_requests, group_hidden_docs, service_contracts, user_blacklist, group_blacklist, user_group_sharing.

v4 adds 24 more tables across four areas.

## User Schema Extensions

### User Accounts

The star record replacement. One row per user. Holds identity, credentials, Stripe IDs, and metering state.

```sql
CREATE TABLE user_accounts (
    user_key String,
    password_hash String,
    phone String,
    phone_verified UInt8,
    email String,
    display_name String,
    bio String,
    avatar_ref String,
    customer_id String,       -- Stripe Customer ID
    business_id String,       -- Stripe Connect Express Account ID
    credits_spent Float64,
    credit_limit Float64,
    space_used Float64,
    space_limit Float64,
    last_replenish DateTime64(3),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_key;
```

**Primary key:** `user_key`. Protected from CRUD modification — only auth endpoints write to it.

**Stripe IDs are auto-created.** `customer_id` on first payment. `business_id` on first sale.

**Metering is materialized.** `credits_spent` incremented per CRUD operation. `credit_limit` and `space_limit` set by operator or Stripe webhook. `last_replenish` tracks monthly reset. API checks `credits_spent < credit_limit` and `space_used < space_limit` before allowing CRUD.

### Credits Ledger

Append-only event log of credit spending.

```sql
CREATE TABLE credits_ledger (
    user_key String,
    amount Float64,
    action String,             -- 'create', 'update', 'read', 'delete', 'aggregate'
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, created_at);
```

**Primary key:** `(user_key, created_at)`. Immutable — no tombstones, no updates. The `credits_spent` on `user_accounts` is the materialized state; this table is the audit trail.

### Subscriptions

Creator↔fan memberships. The dev_pay flow.

```sql
CREATE TABLE subscriptions (
    subscriber_key String,
    creator_key String,
    title String,              -- membership tier name
    price_cents UInt64,
    status String,             -- 'active', 'canceled', 'past_due', 'trialing'
    stripe_subscription_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (subscriber_key, creator_key);
```

**Primary key:** `(subscriber_key, creator_key)`. One subscription per fan per creator. Stripe webhook drives status transitions.

### Tips

One-time payments. Fans tip creators directly.

```sql
CREATE TABLE tips (
    tip_id String,
    tipper_key String,
    receiver_key String,
    amount_cents UInt64,
    message String,
    stripe_payment_id String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tip_id, created_at);
```

**Primary key:** `tip_id`. Immutable. The audit trail for one-time payments.

### Sponsor Deals

Sponsor marketplace. Brands sponsor creators.

```sql
CREATE TABLE sponsor_deals (
    deal_id String,
    sponsor_key String,
    creator_key String,
    deal_type String,          -- 'sponsored_post', 'product_placement', 'affiliate'
    amount_cents UInt64,
    status String,             -- 'active', 'completed', 'canceled', 'pending'
    start_date DateTime64(3),
    end_date DateTime64(3),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY deal_id;
```

**Primary key:** `deal_id`. Platform takes ~3% cut.

### Sponsored Products

Affiliate tags on posts.

```sql
CREATE TABLE sponsored_products (
    doc_id String,
    product_name String,
    product_url String,
    affiliate_link String,
    commission_pct Float64,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY doc_id;
```

**Primary key:** `doc_id`. One product tag per post. Poster's tag wins, else house tag.

## Provider Schema

### Provider Apps

The app store. Platform-level registry.

```sql
CREATE TABLE provider_apps (
    app_id String,
    name String,
    developer String,
    origin String,
    description String,
    status String,             -- 'active', 'delisted', 'pending_review'
    avg_rating Float64,
    review_count UInt64,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY app_id;
```

**`status` is the gate.** Ratings are cached — materialized at write time.

### Provider App Reviews

```sql
CREATE TABLE provider_app_reviews (
    app_id String,
    user_key String,
    rating UInt8,              -- 1 to 5
    comment String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (app_id, user_key);
```

**Primary key:** `(app_id, user_key)`. One review per user per app.

### Provider App Moderation

```sql
CREATE TABLE provider_app_moderation (
    app_id String,
    moderator_key String,
    action String,             -- 'delist', 'restore', 'suspend', 'approve'
    reason String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (app_id, moderator_key);
```

Immutable audit trail. Provider operator is the only writer.

### Provider Blocked Origins

Provider-level origin blacklist. Server-enforced. Overrides service contracts.

```sql
CREATE TABLE provider_blocked_origins (
    provider String,
    origin String,
    reason String,
    blocked_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (provider, origin);
```

Checked before service contracts. If present, request is rejected regardless of user's service contract.

## Ad Schema

### Ad Campaigns

```sql
CREATE TABLE ad_campaigns (
    campaign_id String,
    advertiser_key String,     -- user advertiser (empty if provider campaign)
    provider_key String,       -- provider advertiser (empty if user campaign)
    name String,
    status String,             -- 'active', 'paused', 'completed', 'rejected'
    daily_budget_cents UInt64,
    total_budget_cents UInt64,
    bid_model String,          -- 'cpm', 'cpc', 'cpa'
    bid_amount_cents UInt64,
    impression_count UInt64,
    click_count UInt64,
    conversion_count UInt64,
    spend_cents UInt64,
    start_date DateTime64(3),
    end_date DateTime64(3),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY campaign_id;
```

Counters are materialized. Budgets enforced at serve time.

### Ad Targeting

```sql
CREATE TABLE ad_targeting (
    campaign_id String,
    targeting_type String,     -- 'demographic', 'interest', 'behavioral', 'geographic', 'audience', 'doc_id'
    targeting_value String,    -- JSON
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (campaign_id, targeting_type);
```

Audience targeting is the killer feature — target a creator's followers group directly. Per-post targeting via `doc_id`.

### Ad Creative

```sql
CREATE TABLE ad_creative (
    creative_id String,
    campaign_id String,
    format String,             -- 'image', 'video', 'carousel', 'text'
    media_url String,
    headline String,
    body String,
    cta_text String,
    landing_url String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY creative_id;
```

Multiple creatives per campaign (A/B testing).

### Ad Inventory

```sql
CREATE TABLE ad_inventory (
    slot_id String,
    placement String,          -- 'feed', 'sidebar', 'between_posts', 'story', 'search', 'in_post'
    format String,
    audience_scope String,     -- 'public', 'group', 'personalized'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY slot_id;
```

### Ad Impressions

```sql
CREATE TABLE ad_impressions (
    impression_id String,
    campaign_id String,
    creative_id String,
    slot_id String,
    user_key String,
    creator_key String,       -- creator whose audience was served
    revenue_cents Float64,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (impression_id, created_at)
TTL created_at + INTERVAL 30 DAY;
```

Immutable. High volume — millions per day. TTL 30 days.

### Ad Clicks

```sql
CREATE TABLE ad_clicks (
    click_id String,
    impression_id String,
    campaign_id String,
    user_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (click_id, created_at)
TTL created_at + INTERVAL 30 DAY;
```

Immutable. TTL 30 days.

### Ad Conversions

```sql
CREATE TABLE ad_conversions (
    conversion_id String,
    click_id String,
    campaign_id String,
    conversion_type String,    -- 'purchase', 'sign_up', 'lead', 'custom'
    value_cents UInt64,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (conversion_id, created_at)
TTL created_at + INTERVAL 90 DAY;
```

Immutable. TTL 90 days (longer for attribution windows).

### Ad Partners

```sql
CREATE TABLE ad_partners (
    partner_id String,
    name String,
    partner_type String,       -- 'dsp', 'ssp', 'exchange', 'direct'
    api_endpoint String,
    status String,             -- 'active', 'suspended', 'pending'
    revenue_share_pct Float64,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY partner_id;
```

### Ad Revenue

```sql
CREATE TABLE ad_revenue (
    revenue_id String,
    campaign_id String,
    creative_id String,
    creator_key String,
    partner_id String,
    gross_cents UInt64,
    platform_cents UInt64,
    creator_cents UInt64,
    partner_cents UInt64,
    status String,             -- 'pending', 'settled', 'paid'
    period_start DateTime64(3),
    period_end DateTime64(3),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY revenue_id;
```

`gross_cents = platform_cents + creator_cents + partner_cents`. Settlement is periodic.

## Marketplace Schema

### Marketplace Products

```sql
CREATE TABLE marketplace_products (
    product_id String,
    seller_key String,
    name String,
    description String,
    product_type String,       -- 'digital', 'physical', 'service'
    price_cents UInt64,
    media_url String,
    download_url String,
    status String,             -- 'active', 'draft', 'sold_out', 'delisted'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY product_id;
```

### Marketplace Orders

```sql
CREATE TABLE marketplace_orders (
    order_id String,
    buyer_key String,
    seller_key String,
    product_id String,
    amount_cents UInt64,
    platform_fee_cents UInt64,
    seller_payout_cents UInt64,
    status String,             -- 'pending', 'paid', 'fulfilled', 'refunded', 'canceled'
    stripe_payment_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY order_id;
```

`amount_cents = platform_fee_cents + seller_payout_cents`. Platform fee ~3%.

### Marketplace Reviews

```sql
CREATE TABLE marketplace_reviews (
    product_id String,
    reviewer_key String,
    rating UInt8,              -- 1 to 5
    comment String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (product_id, reviewer_key);
```

Only verified buyers can review (checked against `marketplace_orders`).

## Summary

v3: 10 tables. Content, groups, access control.
v4: 24 more tables. User accounts (6 monetization), provider app store (4), ads (9), marketplace (3), user accounts (1).

**Total: 34 tables.**