# Exact-creative comparator attempt — original FAIL retained

Setup succeeds after the timeout-scope repair. The excluded warm-up main
returns HTTP200, but exact prepared-row equality fails. No follow-ups or three
measured sequences run. Raw diagnostic main observation:4197.900ms,
10,813,341 total native rows /831,927,985 logical bytes, no native exceptions.
Those totals span multiple reads; they are not a single-read10M stop or valid
performance evidence from a parity-passing arm.

The original HTTP body was not retained. A separately labelled, read-only
same-source reconstruction reproduces a difference only in one node ad's
doc_id/author_key/posted_by. All core fields match after excluding node_ad.
All300 inventory records share one version timestamp, so the original
ORDER BY updated_at DESC LIMIT20 does not define one creative identity/order.
The reconstruction is not asserted to be the exact original HTTP bytes.

The operator then rules that ads need to be proper/eligible, not the identical
creative. That is a new comparator revision, not permission to rewrite this
failed result. The following semantic-ad attempt has its own receipts.
Creator/pinned ads and content/counts/order are not relaxed. No delivery API
request was made by reconstruction, and neither this failure nor its timing
opens fanout or constitutes a formal T6 result.

The actual executing code, driver, raw observations and reconstruction metadata
are retained; private response bodies and diagnostic SQL inputs remain outside
Git. `artifact-manifest.json` binds the public artifacts.
