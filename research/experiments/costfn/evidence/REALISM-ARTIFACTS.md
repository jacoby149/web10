# Realism artifact index

Operator-requested cleanup, 11 November 2026: **14 new generated JSON/TAR files
were removed from the repo after an exact backup/readback verification**.
Generator/tests/plans, existing test fixtures, dataset manifests and active
cloud-monitoring state are not part of this cleanup.

## Archive location

- Local recovery bundle: `.context/realism-artifacts-20261111.tar.gz` (44,369 bytes).
- SHA-256: `7603a70924855cddfe2da7707b5755f215b0de43268a34128a708a6987403f1c`.
- MinIO destination: existing `https://minio.web10.app`, `web10-media`, private
  research artifact storage. **Upload is pending; do not claim a remote backup.**
- The archive preserves original repo-relative paths. Required floor receipts
  can be restored under those paths on the preparation host before input
  verification; cleanup does not waive any source/byte/validation gate.

Do not regenerate historical failure receipts and present them as originals.
Do not delete the recovery bundle until its MinIO copy is verified. No public
bucket-policy or production-object changes are authorized by this cleanup.

## Floors

The current floor receipts are the two `v4` files: both have all 50 checks
passing. The earlier files are historical failures/passes, not current admission.
All names below were under `research/experiments/costfn/evidence/`.

| Archived artifact | SHA-256 |
|---|---|
| `realism-10k-20261111-v4.json` | `4f7f40cfaaaf7d530d168d044ce3e6a08cd915bb8f84198a6bf3a15970df6f53` |
| `realism-100k-20261111-v4.json` | `654375c681e57b4c2305421aa6f1b452284bdf27a7c0354c6e7fb5e7e197a95a` |
| `realism-repeat-10k-20261111.json` | `37f1e5740a340ff3f98ca631608277fb5bfdf06613db32be004f07f6f9e74518` |

## Scratch and resource assessment

| Archived artifact | SHA-256 |
|---|---|
| `realism-scratch-assessment-20261111.json` | `602d46b0787a332326326033dd43f080d1d5a65d0fc12a93f07b9d3f9f2e6e99` |
| `realism-scratch-20261111.tar.gz` | `29e957036f6989ff2706c25964ada9de27ade901b1ff97eba39d22d7367283fe` |
| `realism-1m-local-admission-20261111.json` | `ba611a77dd43559cf516dd503dae8a6e6c232e609188fe10aa9fe67d0af40006` |
| `realism-contract-20261111.json` | `782a2553c12e62aef5d5a8db3d507b6d46e4d43bce588f593f7bccd9b8bd6013` |

## Earlier attempts

| Archived artifact | SHA-256 |
|---|---|
| `realism-attempts-20261111.json` | `9a64e1282f581f3a0d469330da872918620149d968c507890bc4bb8201e97102` |
| `realism-10k-20261111.json` | `5ed4cab18b1d1d2d97139f3ceec31313359ec93235de8197402c80ab2e454a29` |
| `realism-10k-20261111-v2.json` | `db15a7b1b8c31e4b096ec6555b21ac7807d4d5b2173a56c68a2ac757e5dd1426` |
| `realism-10k-20261111-v3.json` | `5c51fd2014ee28101b69076f889601a8a40a1e539bd975d8e81122ffa9889606` |
| `realism-100k-20261111.json` | `9f6f6497a5c87bef997e384101a6b87324a721d608abfdbbfe0355bc86dccf9d` |
| `realism-100k-20261111-v2.json` | `5bf687bccaafbb9d4bc9f5d0a1dbc987755723f1f41265c309a36d30d571f922` |
| `realism-100k-20261111-v3.json` | `c6297151a351ced02424745d4d11ead930e6ee512d57609ffb62876123b61c1a` |
