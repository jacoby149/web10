# V2 preparation receipts

These are preparation/functional receipts, **not new paper performance results**.

- `v2-hot-publication.json`, `v2-dispersed-publication.json`: six frozen table
  objects plus manifest, full authenticated remote-byte verification and a fresh
  download/all-row replay validation. The operator approved only this immutable
  research prefix in the existing bucket. No bucket policy or existing object
  was changed. Public synthetic account credentials are intentional; JWTs and
  storage/signing credentials are not artifacts.
- `v2-local-receipt.json`: actual current-source two-reader acceptance, runtime
  software/image IDs, seven lifecycle controls before/after, three measured
  paired smoke pairs, 24 correlated core requests, three resource samples, peak
  three actual HTTP requests with zero after drain, and verified empty owned
  project storage after cleanup. HTTP requests and feed tasks are separate units.
- `v2-local-acceptance-r2.tar.gz`: the receipt's SHA-256 pins raw requests/feeds,
  generator/container/database traces, matched server phases and residuals,
  warm-up separation, paired observations/EXPLAIN hashes, lifecycle controls,
  initial restore counts/exact results and final cleanup. No saved bearer token,
  password, signed media URL or HTTP body is present in these diagnostic files.
  Initial local indexes are preserved as `v2-local-receipt-r1.json` and
  `v2-preparation-r1.json`, with their original `v2-local-acceptance.tar.gz`.
- `v2-preparation.json`: receipt-driven 30-point dry schedule with actual H/S
  dataset IDs and status `PREPARED_FOR_HOST_PREFLIGHT`. It explicitly does not
  authorize a cloud run or certify unchecked hosts/submission readiness.
- `core-feed-wire-v3.json`: first-page actual app/SDK builders after the bounded
  cursor fix; transport remains fake and the exclusions stay explicit.
- `core-feed-next-page-v1.json`: initial builder reproduction of the String
  cursor expression; `core-feed-next-page-v2.json` is the repaired numeric
  millisecond expression. These are source captures, not measured timings.

## Failures that informed the preparation

The first live floor on the historical 24.3 image failed actual group discovery:
current app SQL uses QUALIFY. V2 pins 24.8.14.39 in the observed receipt; no API
rewrite hides that incompatibility, and historical 24.3 results stay separate.

The cursor control then reproduced HTTP 400/code 43: the app called
`toUnixTimestamp64Milli` on a String. The operator authorized the small app change;
three regression cases first failed, then passed with finite epoch-millisecond
comparison (including timezone offsets). A fresh restore now passes actual
second-page ordered-ID checks for both readers. Tied-timestamp general pagination
and browser-authenticated paging are not established by that fixture.

Other harness-floor failures were repaired at their real seam: bounded health
wait after recreate; private-control owner role needs `revokeRoles`; the container
needs a declared source root and read-only SDK/app mounts; a copied handler-log
observation has a provisional status before ASGI response.start, so paired records
use the actual response status. None required relaxing production authorization.
Initial local logs remain in the workspace `.context/`; the tracked archive is
the guarded final run, not an assertion those failed attempts succeeded.

## What remains

Local tooling gates: 60 Python tests, four Bun tests, all 2,088 social tests with
one worker, production typecheck/build and inspected desktop/375px Following
captures. Initial full UI runs had three then two 5-second timeouts; both focused
87-case reruns pass, as does unchanged origin/dev 7381d872d's full 2,188-case run.
The final identical full branch command passes all 2,088. No timeout/config change
was used; the earlier failures remain recorded rather than being labelled proven
pre-existing. These are local checks, not PR/CI acceptance.

No million-row DB restore, three-physical-host integration/headroom receipt,
independent performance repeats or paid study has been run here. The distributed
adapter has offline controls and Compose validation, not connected cloud proof.
Normal document histories are clean synthetic current versions; media, ads,
private-policy load mixes, user-write churn and browser rendering remain outside
the named workload. The production batching default and manuscript measurements
are unchanged. See `../RUNNING-V2.md` for actual-host gates and execution controls.
