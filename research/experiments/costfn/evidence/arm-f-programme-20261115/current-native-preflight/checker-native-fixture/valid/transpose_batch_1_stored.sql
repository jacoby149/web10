SELECT count() AS n FROM (SELECT * FROM doc_groups_t WHERE cityHash64(doc_id) % 2 = 1) AS doc_groups_t
