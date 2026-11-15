"""Read-only reconstruction, not another API request, T2 trial or oracle change."""
import hashlib
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, '/research')
import arm_satellite_api as adapter
from app.v3.endpoints import query as endpoint
from app.v3.models import PrepareSpec
import core_feed

ROOT = Path('/satellite-diagnosis')
queries = json.loads((ROOT / 'private-queries.json').read_bytes())
main = [row for row in queries if 'as profile_body' in row['query'].lower() and 'counting_numbers_p2' in row['query']]
if len(main) != 1:
    raise ValueError('cannot identify one actual canonical main query; do not guess')
sql = re.sub(r'\s+FORMAT\s+Native\s*;?\s*$', '', main[0]['query'], flags=re.I)
adapter.observer.current.set({'request_id': 'd' * 32})
columns, values = adapter.ch.execute_query(sql, settings={'max_execution_time': 10, 'max_threads': 8})
rows = [endpoint._serialize_row(dict(zip(columns, row))) for row in values]
profile = json.loads(Path('/satellite-state/profile.json').read_bytes())
pool = []
inventory = adapter.ch.get_active_node_ads


def tracked_inventory():
    ads = inventory()
    pool.extend(ad['doc_id'] for ad in ads)
    return ads


adapter.ch.get_active_node_ads = tracked_inventory
prepared = endpoint._prepare_rows(rows, profile['reader'], PrepareSpec(**core_feed.wire()['requests'][0]['payload']['prepare']),
                                  profile['actual_readable_by_kind']['main'], True)
expected = json.loads(Path('/satellite-reference/rows.json').read_bytes())
differences = []


def compare(a, b, path='rows'):
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                differences.append(path + '.' + key + ':presence')
            else:
                compare(a[key], b[key], path + '.' + key)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            differences.append(path + ':length')
        for index, (left, right) in enumerate(zip(a, b)):
            compare(left, right, path + '[' + str(index) + ']')
    elif a != b:
        differences.append(path)


compare(expected, prepared)
ties = adapter.run("SELECT toString(version) AS version,count() AS n FROM strings "
                   "WHERE owner_key='api.localhost/groups/web10/discover' AND field_name='tag:node_ad' GROUP BY version ORDER BY version DESC")
raw = json.dumps(prepared, sort_keys=True).encode()
(ROOT / 'private-reconstructed-rows.json').write_bytes(raw)
core = lambda data: [{key: value for key, value in row.items() if key != 'node_ad'} for row in data]
report = {'kind': 'READ_ONLY_RECONSTRUCTION_NOT_HTTP_REPLAY', 'original_query_id': main[0]['query_id'],
          'original_sql_sha256': main[0]['sql_sha256'], 'difference_paths': differences,
          'core_equal_excluding_node_ad': core(expected) == core(prepared),
          'reconstructed_sha256': hashlib.sha256(raw).hexdigest(), 'node_ad_pool_size': len(pool),
          'node_ad_pool_ids_sha256': hashlib.sha256(json.dumps(pool).encode()).hexdigest(),
          'inventory_version_groups': ties,
          'limitation': 'original HTTP body was not retained; this is a same-source read-only reconstruction, not proof of its exact bytes',
          'T2': 'FAIL_PRESERVED', 'new_feed_request': False, 'delivery_logging_invoked': False}
(ROOT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
