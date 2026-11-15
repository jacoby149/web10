CREATE TABLE doc_groups_t (
    group_id String, created_at DateTime64(3), doc_id String, author_key String,
    link_created_at DateTime64(3), updated_at DateTime64(3), deleted UInt8,
    collection_name LowCardinality(String), tags Array(String), ref_value String,
    comment_post_id String, repost_of String
) ENGINE = MergeTree ORDER BY (group_id, created_at, doc_id) SETTINGS index_granularity=64
