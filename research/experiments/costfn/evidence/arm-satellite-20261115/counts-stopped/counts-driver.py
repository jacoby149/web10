"""Build requested native count scopes and T1 only; no feed activation."""
import json
from pathlib import Path
import sys

ROOT = Path('/opt/satellite')
sys.path.insert(0, str(ROOT / 'repo/research/experiments/costfn'))
import arm_satellite_counts

result = arm_satellite_counts.build(ROOT)
print(json.dumps({key: result[key] for key in ('kind', 'outcome', 'T1', 'droplet_id',
                                             'feed_adapter_activated', 'fanout')}, indent=2), flush=True)
