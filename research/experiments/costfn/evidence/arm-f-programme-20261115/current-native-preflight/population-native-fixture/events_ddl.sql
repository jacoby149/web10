CREATE TABLE content_events (doc_id String,reader_key String,service String,event_type String) ENGINE=MergeTree ORDER BY (doc_id,reader_key)
