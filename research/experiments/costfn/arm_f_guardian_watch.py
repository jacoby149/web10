"""Secondary Mac observer for exactly one independently self-expiring controller."""
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parent))
import arm_f_cloud as cloud
import arm_f_guardian as guardian

path=Path(sys.argv[-1])
lease=json.loads(path.read_bytes())
guardian.validate(lease)
cloud.API_TIMEOUT=20
cloud.account(lease)
if time.time()>=lease['deadline'] or lease.get('cancelled'):
    for row in cloud.api('compute','droplet','list') or []:
        if row['id']==lease.get('droplet_id') or lease['tag'] in row.get('tags',[]):
            guardian.identity(lease,row['id'])
            guardian.finish(lease,row['id'],stop=bool(lease.get('cancelled')))
