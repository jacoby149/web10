# CLI Quickstart

Scaffold a web10 app from the command line.

## What the CLI does

`web10-cli` is a scaffolding tool that generates a starter web10 app project. It walks you through choosing a framework and template, then writes out a ready-to-run project.

## Install

```bash
npx web10-cli create
```

No global install needed. `npx` runs the latest version.

## Interactive flow

The CLI prompts you for three things:

1. **Framework** — Vanilla JS or React
2. **Template** — a starter app shape (Notes, Todo, etc.)
3. **Folder name** — where your app lives (defaults to `app`)

After you answer, it creates the folder and copies the template files in.

```
$ npx web10-cli create
Which framework would you like?
> Vanilla JS + HTML + CSS
  React

Which template would you like?
> Todo App

Folder Name
What will the folder be named? (app): my-web10-app

✓ success.
Creating Folder : (my-web10-app)
Creating your app : (Todo App)
App Created in framework : (Vanilla JS + HTML + CSS)
```

## Available templates

| Framework | Templates |
|---|---|
| Vanilla JS + HTML + CSS | Todo App |
| React | Notes App |

## What you get

Each template includes:

- A working web10 auth flow (login/logout via the auth portal)
- At least one service round-trip (create + read a record)
- The consent screen on first run — terms are part of the product

## Next steps

After scaffolding:

```bash
cd my-web10-app
# install deps (if any)
# open index.html or run the dev server
```

Point the app at your node by updating the `wapiInit` URL. The demo apps on this site use `https://auth.web10.app`. For a self-hosted node, use your node's auth origin.

## Coming soon

The CLI is the seed of `create-web10` — a proper scaffolder that publishes as an npm `create-*` package (`npm create web10@latest`). The next iteration will:

- Support Vite + TypeScript templates
- Auto-wire the typed SDK (C2)
- Offer a `--node` flag to point at an existing node or spin up a local one
- Generate a consent screen on first run

## Source

The CLI lives in the web10 monorepo: `marketing/web10-cli/`. It's ISC-licensed and open source.