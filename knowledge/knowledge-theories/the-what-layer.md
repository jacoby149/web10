# The What Layer

Where does everything live? What code does what? Where is it deployed? The what layer is the map — the orientation doc that lets a new developer understand the terrain in minutes, not days.

## The Problem

A new developer joins. They see a tree of directories. `api/`, `ui/`, `marketing/marketing-ui/`, `marketing/marketing-api/`, `marketing/web10-social/`, `sdk/`, `mobile/`, `e2e/`, `knowledge/`. They don't know which one to open. They grep for a function and find it in three places. They ask "where does the auth code live?" and get different answers depending on who they ask.

Without a map, every new person spends their first week figuring out structure instead of shipping work.

## The Theory

A knowledge base must answer "what exists and where" before it answers "why" or "how." You can't understand the purpose or mechanics of something if you can't find it. The what layer is the index — fast, accurate, and maintained.

## How It Works

### 1. The Code Map

Every top-level directory gets one line. What it is. What it does.

| Path | What It Is |
|------|-----------|
| `api/` | Backend API — FastAPI, CRUD, auth, metering, discovery, media |
| `ui/` | Auth UI — login, signup, consent, token handoff (Vite + React) |
| `marketing/marketing-ui/` | Marketing site — landing page, docs, app store, exporter (Vite + React) |
| `marketing/marketing-api/` | Marketing API — ZIP import pipeline, analytics, feedback endpoint (FastAPI) |
| `marketing/web10-social/` | Social app — posts, feed, DMs, profile, composer (Vite + React) |
| `sdk/` | Client SDK — typed API client for building apps on the platform |
| `e2e/` | E2E tests — Playwright harness against the full stack |
| `knowledge/` | This — writing styles, knowledge theories, editing styles, scenarios |
| `ubuntu-deployment/` | Deployment — compose files, runbooks, ops procedures |

### 2. The Deploy Map

Where does each piece run? What URL does it serve?

| Service | Dev URL | Prod URL |
|---------|---------|----------|
| API | `api.dev.web10.app` | `api.web10.app` |
| Auth UI | `auth.dev.web10.app` | `auth.web10.app` |
| Social | `social.dev.web10.app` | `social.web10.app` |
| Marketing | `dev.web10.app` | `web10.app` |
| Marketing API | (behind marketing) | (behind marketing) |
| RTC | `rtc.dev.web10.app` | `rtc.web10.app` |

### 3. The Ownership Map

Who touches what? This prevents cross-lane conflicts and tells you who to ask.

- **Lane A** owns `api/`, `docker-compose`, settings
- **Lane B** owns `ui/`
- **Lane D** owns `marketing/`, docs
- **Lane C** owns `sdk/`, `e2e/`, new services
- **Lane E** owns deployment infra, CI/CD, provisioning

### 4. The Data Map

Where does data live? What's the shape?

- Primary store: MongoDB (or FerretDB in dev) — users, apps, posts, terms, tokens, metering events
- Media: Minio (S3-compatible) — videos, images, presigned URLs
- Discovery index: `web10.discovery_posts` collection — public post index for cross-node search
- Schema registry: `web10.schemas` collection — content type definitions

## When to Write a What

- Adding a new service, directory, or deploy target
- Restructuring the codebase (moves, renames, consolidations)
- Onboarding a new developer — this is the first thing they read
- When someone asks "where does X live?" more than once

## When Not to

- Temporary scripts and experiments — don't canonize throwaway code
- Vendored dependencies — they're in `node_modules` or `venv`, not your map
- Build artifacts — `dist/`, `build/`, `.next/` don't belong here

## The Test

Can a developer who just cloned the repo find the file they need in under 30 seconds? If not, the map is missing something. Can they tell you which service handles a request before they grep? If not, it's not specific enough.