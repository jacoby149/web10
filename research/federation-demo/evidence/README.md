# Retained federation receipts

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
