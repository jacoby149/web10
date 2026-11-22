CREATE TABLE strings (
    owner_key String, field_name String, value String,
    author_key String, doc_id String, version DateTime64(3)
) ENGINE = MergeTree ORDER BY (owner_key,field_name,value,author_key,doc_id)
SETTINGS index_granularity=64
