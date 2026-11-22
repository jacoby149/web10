CREATE TABLE web10.documents_d
(
    `doc_id` String,
    `author_key` String,
    `collection_name` String,
    `body` String,
    `ref_value` String DEFAULT '',
    `tags` Array(String),
    `created_at` DateTime64(3),
    `updated_at` DateTime64(3),
    `deleted` UInt8 DEFAULT 0,
    `ad_mode` String DEFAULT 'none',
    `ad_target` String DEFAULT '',
    `posted_by` String DEFAULT ''
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, created_at, doc_id, updated_at)
SETTINGS index_granularity = 8192
