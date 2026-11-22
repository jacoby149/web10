SELECT DISTINCT author_key FROM documents WHERE author_key>unhex('') ORDER BY author_key LIMIT 128
