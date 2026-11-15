INSERT INTO strings SELECT doc_id,concat('document:',collection_name),author_key,author_key,doc_id,updated_at FROM documents FINAL WHERE deleted=0
