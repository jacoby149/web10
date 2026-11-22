CREATE TABLE timestamps (
    field_name String, value DateTime64(3), author_key String,
    doc_id String, version DateTime64(3)
) ENGINE = MergeTree ORDER BY (field_name,value,doc_id,author_key)
SETTINGS index_granularity=64
