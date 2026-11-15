CREATE TABLE users (username String,updated_at DateTime64(3),deleted UInt8) ENGINE=ReplacingMergeTree(updated_at) ORDER BY username
