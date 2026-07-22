# Architecture

## Overview

web10 is a creator-owned social platform built on an inbox delivery model.

## Services

| Service | Location | Runtime |
|---------|----------|---------|
| API | `api/` | FastAPI (Python) |
| UI | `ui/` | React + Vite + Bun |
| Social | `marketing/web10-social/` | React + Vite + Bun |
| Marketing | `marketing/marketing-ui/` | React + Vite + Bun |
| SDK | `sdk/` | TypeScript |
| Encryptor | `mobile/encryptor/` | Expo |

## Data Layer

- FerretDB (DocumentDB-backed) as default dev database
- MongoDB wire protocol compatible
- Minio for object storage (S3-compatible)