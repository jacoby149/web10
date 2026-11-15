"""Semantic node-ad parity: valid creative choice, not identical tied selection."""
import arm_satellite_sql as typed


def candidate_sql():
    # A superset only: never filter deleted/tag history before ranking heads.
    return "SELECT DISTINCT doc_id FROM documents WHERE has(tags,'node_ad')"


def eligible_heads_sql(ids):
    keys = ",".join(typed.literal(value) for value in sorted(set(ids))) or "''"
    return ("SELECT doc_id,author_key,updated_at FROM (SELECT doc_id,author_key,updated_at,deleted,tags,"
        "row_number() OVER (PARTITION BY doc_id,author_key ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM documents WHERE doc_id IN (" + keys + ")) WHERE rn=1 AND deleted=0 AND has(tags,'node_ad') "
        "AND doc_id IN (SELECT doc_id FROM (SELECT doc_id,group_id,deleted,row_number() OVER "
        "(PARTITION BY doc_id,group_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups "
        "WHERE group_id='api.localhost/groups/web10/discover' AND doc_id IN (" + keys + ")) WHERE rn=1 AND deleted=0) "
        "ORDER BY updated_at DESC LIMIT 20 WITH TIES")


def payload_sql(pairs):
    keys = ",".join("(" + typed.literal(author) + "," + typed.literal(doc) + ")" for author, doc in pairs) or "('','')"
    return ("SELECT doc_id,author_key,body,tags,posted_by FROM (SELECT doc_id,author_key,body,tags,posted_by,deleted,"
            "row_number() OVER (PARTITION BY doc_id,author_key ORDER BY updated_at DESC,deleted DESC) AS rn "
            "FROM documents WHERE (author_key,doc_id) IN (" + keys + ")) WHERE rn=1 AND deleted=0")


def validate_main(actual, expected, eligible_ads):
    allowed = {}
    for ad in eligible_ads:
        key = ad.get("doc_id"), ad.get("author_key")
        if (not all(isinstance(value, str) and value for value in key) or key in allowed
                or not isinstance(ad.get("body"), dict) or ad["body"].get("status") != "active"
                or "node_ad" not in ad.get("tags", [])):
            raise ValueError("invalid independently certified node-ad set")
        allowed[key] = ad
    if len(actual) != len(expected):
        raise ValueError("main row count differs from canonical reference")
    checked = 0
    for row, reference in zip(actual, expected):
        # Creator/pinned ads stay exact, along with IDs/order/body/counts/profiles.
        if {key: value for key, value in row.items() if key != "node_ad"} != {
                key: value for key, value in reference.items() if key != "node_ad"}:
            raise ValueError("main content or pinned-ad semantics differ from canonical reference")
        attached = "node_ad" in row and row["node_ad"] is not None
        expected_placement = "node_ad" in reference and reference["node_ad"] is not None
        if attached != expected_placement:
            raise ValueError("node-ad placement differs from independent reference")
        if not attached:
            continue
        ad = row["node_ad"]
        if not isinstance(ad, dict):
            raise ValueError("malformed attached node ad")
        canonical = allowed.get((ad.get("doc_id"), ad.get("author_key")))
        if canonical is None or ad != canonical:
            raise ValueError("ineligible or noncanonical node ad attached")
        checked += 1
    return {"core_exact": True, "node_ad_placements_exact": True, "canonical_node_ads_checked": checked,
            "creative_identity_equality_required": False, "media_scope": "raw canonical payload; extra unverified signed-media fields refuse"}
