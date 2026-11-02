# Interoperability Demo

The paper demonstration: web10-social writes a profile; Snake and Marketplace
join their own documents to that profile through the generic query boundary.
This folder owns the browser scenario, standalone Playwright configuration, and
execution instructions. The hosted apps stay in their existing deployment paths.

## Run

Use a disposable local Docker stack, never production. The runner creates test
accounts and documents and calls the first-run node configuration endpoint.
Start the repository's normal E2E stack first; this command does not provision
or tear down infrastructure. The stack must route `api.localhost`,
`auth.localhost`, `social.localhost`, and `marketing.localhost`.

Install the standard E2E dependencies first (`bun install` in `e2e/`), since
the runner reuses its node-setup module. Then, from this directory:

```sh
bun ../../e2e/node_modules/playwright/cli.js install chromium
bun run test:list
bun run test
```

Set `E2E_HTTP_PORT` if the stack is not on port 80. Run one viewport with
`bun run test --project=desktop` or `--project=mobile`.
The normal E2E suite also discovers this scenario through
`e2e/tests/interop-demos.spec.ts`.

## Evidence

Outputs are gitignored under `.context/interoperability-demo/`: HTML report,
failure traces, and screenshots. `INTEROP_SHOT_DIR` overrides the screenshot
directory. Retain outputs with the exact source revision and stack configuration.
Inspect desktop and 375px screenshots before using them in the paper.

## Current Boundaries

This is an inherited scenario, not yet a completed connected demonstration.
It currently injects token cookies and preinstalls app contracts; it does not
establish independent app consent. Its app-contract strings include URL paths,
although the browser runtime requests contracts for `location.origin`. Snake
and Marketplace currently share that browser origin, not distinct origins.
Gameplay and responsive selectors also need connected verification. Screenshot
capture currently warns rather than failing the test.

The next implementation step is to replace those shortcuts with real popup
login/consent and assert exact cross-app results, denied access, regrant and
revocation. Do not cite test discovery or static screenshots as connected proof.

The separate HTTP correctness layer already lives at
`../experiments/social/interop.mjs`, with its offline controls and disposable
Ubuntu runner documented in `../experiments/social/README.md`. It covers exact
two-author joins and independent app/group denial cycles, but is not a browser
consent demonstration. Reuse it rather than duplicating its assertions.

On 1 November 2026 the local Docker daemon was unreachable. No connected run
or successful demo screenshots were collected during folder setup.
