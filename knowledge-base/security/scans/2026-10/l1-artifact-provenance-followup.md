# SDK Artifact Provenance Follow-Up

29.10.2026; pin `b22fdb2ea89aec7a8aa686859bb5ac8d69246bf4`.
Read-only research by OpenCode `openrouter/openai/gpt-6.1-sol`.
Historical origin is now traced; current production, retirement and security
sign-off remain OPEN. This is not a fresh whole-protocol inventory.

## Legacy Declarations

Fully read `sdk/dist/{auth,client,compat}.d.ts` (84, 85 and 16 lines)
and their three complete single-line maps. All six files are byte-identical to
their introduction at `e2a944a035121d5f1ebcb663bc389bb98af7362c` (#531).
Commit `4e8a0a9d3a40fa93979a6440851e2e4b51bd4140` (#547) removed the
corresponding source files and root exports but retained these outputs.
Maps resolve to absent source and have no `sourcesContent`; 937 decoded VLQ
segments passed structural checks. Repository history is not compiler attestation.

Current package exports expose only root and RTC entries. Node resolution denies
`web10-npm/auth`, `/client`, `/compat` and `/dist/compat.d.ts` with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. Bounded SDK/marketing/scripts/workflow searches
found no direct consumer of the orphan paths. External consumers remain unknown.

The package includes all `dist/`; declaration generation does not clean it.
The publish workflow builds in the checkout, and the SDK image copies the whole
SDK tree to its static root. These declared paths can retain residue; no actual
published tarball or deployed image was inspected. Do not delete files or restore
retired implementations on this evidence alone. Next: compare clean staging and
package manifests, then explicitly decide supported published/static surfaces.

## Docs RTC

Fully read `marketing/marketing-ui/public/docs/rtc.js` (85 lines), current
`sdk/src/rtc/index.ts` (227) and `sdk/dist/rtc/index.js` (110). The docs IIFE is
byte-identical to its introduction at
`1f7d7c2b6f6221088613a334711b5038de14d897` (#665). Its wrapper comment
contains a build placeholder, not an executable producer. The bounded producer
search found none. The messages demo loads it and uses `window.web10rtc`;
marketing's Docker build refreshes `wapi.js`, not this RTC asset.

Current RTC gained ICE selection and outbound reply forwarding in
`e7e28fa5d7fe1191c40c03d1fbd2d6eabc829611` (#1079). Six inert-peer controls
under Node 24.18.0 compared the pinned ESM and docs IIFE:

| Configuration | Current ESM | Docs IIFE |
|---|---|---|
| Explicit ICE | supplied list, no helper fetch | no supplied ICE, no fetch |
| Successful helper | returned list, one fetch | no supplied ICE, no fetch |
| Failed helper | five fallback STUN entries, one fetch | no supplied ICE, no fetch |
| Outbound data, each configuration | one callback | no callback |

All six controls passed. Both retained synthetic `token~label`, local port
selection and immediate send behavior. This establishes local drift, not an
impersonation exploit or a demonstrated real-network failure. Normal one-way demo
notifications use inbound connections; missing outbound replies alone does not
prove that journey broken.

Next bounded repair: a tracked browser wrapper and pinned producer preserving
`/docs/rtc.js` and `window.web10rtc`, wired into marketing builds, with fresh-output
parity and explicit ICE/reply compatibility controls. Preserve CRUD-first,
best-effort P2P. Run `e2e/tests/messages-demo.spec.ts` connected two-browser and
offline-recipient controls before claiming integration. Leave legacy declarations
untouched in that repair. ART-02/03 in the original detailed receipt remain OPEN;
the current index groups these under ART-01/orphan artifacts.

## Reproduction And Limits

History and equality can be checked without accessing deployed systems:

```sh
git log --follow --format='%H %s' -- marketing/marketing-ui/public/docs/rtc.js
git diff e2a944a035121d5f1ebcb663bc389bb98af7362c b22fdb2ea89aec7a8aa686859bb5ac8d69246bf4 -- sdk/dist/auth.d.ts sdk/dist/auth.d.ts.map sdk/dist/client.d.ts sdk/dist/client.d.ts.map sdk/dist/compat.d.ts sdk/dist/compat.d.ts.map
git diff 1f7d7c2b6f6221088613a334711b5038de14d897 b22fdb2ea89aec7a8aa686859bb5ac8d69246bf4 -- marketing/marketing-ui/public/docs/rtc.js
```

Also fully read package/tsconfig/SDK Dockerfile, current index/type declarations,
browser artifact test and marketing Docker/package/Vite/nginx configuration.
Relevant publish workflow, messages consumer and existing E2E assertions were
read contextually. No builds, installs, real PeerJS traffic, credentials, images,
publication or external-consumer assessment. Same-model research is not diverse
convergence. Current dist has 26 tracked files; this bounded pass does not silently
replace the historical 24-artifact denominator.
