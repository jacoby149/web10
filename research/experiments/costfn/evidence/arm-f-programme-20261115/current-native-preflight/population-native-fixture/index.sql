INSERT INTO doc_groups_t
SELECT g.group_id,d.created_at,g.doc_id,d.author_key,g.created_at,g.updated_at,g.deleted,
       d.collection_name,d.tags,d.ref_value,
       JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of')
FROM (SELECT * FROM doc_groups) AS g
INNER JOIN (SELECT * FROM documents) AS d ON g.doc_id=d.doc_id
