# Domain-portability evidence

`2026-11-04-local-demo.tar.gz` contains 135 allowlisted source/input/status/image
and screenshot files, separated into `final/`, `compatibility/`, two failed
attempts and a preceding working-tree pass. Only the final committed desktop/mobile
matrix is the main domain result; other folders are not pooled into a pass.

SHA256: `b255de495083745906c3c4a3b59b08b1c4469772561caef9d6429d570233a8b7`.

Final source: `0932d6643940635fc3a332da46cee70dc06dbc9c`, empty patch. All
critical executable inputs match that commit. `runtime-after-run.json` is an
explicitly labelled locked-environment **read-back after capture**, not an
execution attestation: Node v24.18.0, Playwright 1.63.0, Chromium 153.0.8010.12,
Darwin/arm64. The API runs in Docker Linux/arm64 with image identities retained.

The archive excludes generated Compose/private directories, runtime bearer or
fixture-control tokens, signing/TLS/CA keys, environment dumps, raw API logs,
traces and HARs. Source includes deliberately public synthetic fixture passwords,
not production credentials. Browser text/IDs/domains are synthetic. All text
members were checked for serialized JWTs and forbidden private/config paths.

Curated figures are exact copies of the final captures, not rendered mocks.
Selected screenshots remain under `figures/`; original captures, source hashes,
per-case port/config history and cleanup receipts remain in the archive.
The code was captured under a provisional D96 label; final KB numbering is D97,
without changing its alias-not-principal scope or the tested runtime.
