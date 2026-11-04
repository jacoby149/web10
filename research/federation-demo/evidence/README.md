# Retained federation receipts

`2026-11-04-merged-dev.tar.gz` contains 16 allowlisted receipt/input files from
`20261104T000152Z-60683`: merged-dev revision
`0acc771e2efc36b9787d38d32450af026eb3895e` after #1360, with a zero-byte
`source.patch`. The full unchanged scenario passes and every cleanup flag is
true. The same credential/environment/raw-log exclusions below apply. SHA256:
`de7f26383cd6860175d86a76618b60b9a32e78cda4b3999154eb37bdca40c9f8`.

`2026-11-03-committed-source.tar.gz` contains the 16 allowlisted receipt/input
files from `20261103T233658Z-46307`: committed revision
`3be1f1ec10fdb1cdc4ba59b07a4971f1b5087dfa`, with zero-byte `source.patch`.
The same scenario and cache controls pass, and all cleanup flags are true.
This historical run used the then-unmerged #1360 owner-fix branch, not merged
`origin/dev`; the newer archive above closes that separate replay gate. SHA256:
`1c62dc5d671078f51452dd9fc2ccf38d6be37a83240c6c53a3979b5bd5db3849`.
The same credential/environment/raw-log exclusions below apply.

`2026-11-03.tar.gz` contains an allowlisted copy of the completed run
`20261103T225210Z-14642`, plus the initial import-failure receipt. It excludes
Compose configuration, private directories, signing/TLS/CA keys, environments,
tokens and raw API logs. The successful source is revision
`04da544442c33a99df1203866ba83efa1c8b4251` plus `source.patch`, not the current
branch without PR #1360. Executable runner/scenario copies preserve the exact
code that produced the run; later cleanup-hardening code is separately tested.

Archive SHA256:
`5f74c0bb0a68f4814e0e5bc6d50e7b306e330d10d2e44e54e01a857128c33daf`.

The API build log identifies its base as
`ghcr.io/jacoby149/base-uv:python3.12-bookworm-slim@sha256:e5b65587bce7de595f299855d7385fe7fca39b8a74baa261ba1b7147afa78e58`.
Other runtime image identities/digests are in `images.txt`. Docker was 27.4.0,
Linux/arm64 under Docker Desktop. Mutable image tags and package repositories
mean these receipts do not promise bit-for-bit future rebuilds.
