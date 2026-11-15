CREATE TABLE IF NOT EXISTS f_seed_members (reader_key String,group_id String) ENGINE=MergeTree ORDER BY (reader_key,group_id) SETTINGS index_granularity=64
