INSERT INTO strings SELECT author_key,unhex('736572766963653a70726f66696c65'),doc_id,author_key,doc_id,updated_at FROM documents FINAL WHERE deleted=0 AND collection_name=unhex('70726f66696c65')
