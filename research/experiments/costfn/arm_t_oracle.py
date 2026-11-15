"""Exact-ID bound for one independently queried canonical setup oracle.

No expected value changes, no transpose access and no request-path treatment.
Only the literal source oracle shape below is accepted; drift refuses.
"""
import re

PREFIX = ("SELECT ref_value,countIf(collection_name='reactions' AND JSONExtractString(body,'type')='like') AS likes,"
          "countIf(collection_name='reactions' AND JSONExtractString(body,'type')='dislike') AS dislikes,"
          "countIf(collection_name='comments') AS comments FROM documents FINAL ")
SUFFIX = " GROUP BY ref_value SETTINGS max_execution_time=120, max_threads=4 FORMAT JSON"


def bounded(sql):
    if not sql.startswith(PREFIX):
        return sql
    literal_list = r"('[^'\\]*'(?:,'[^'\\]*')*)"
    pattern = (re.escape(PREFIX) + r"WHERE ref_value IN \(" + literal_list
               + r"\) AND collection_name IN \('reactions','comments'\) AND deleted=0 "
               r"AND doc_id IN \(SELECT doc_id FROM doc_groups FINAL WHERE group_id IN \(" + literal_list
               + r"\) AND deleted=0\)" + re.escape(SUFFIX))
    match = re.fullmatch(pattern, sql)
    if match is None:
        raise ValueError("canonical engagement oracle changed; review before bounding")
    refs, _groups = match.groups()
    ids = ("SELECT doc_id FROM documents FINAL WHERE ref_value IN (" + refs
           + ") AND collection_name IN ('reactions','comments') AND deleted=0")
    return sql.replace("FROM doc_groups FINAL WHERE group_id IN (",
                       "FROM doc_groups FINAL WHERE doc_id IN (" + ids + ") AND group_id IN (", 1)
