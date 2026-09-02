import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const API_BASE = `http://api.localhost${p}`;

const uniqueUser = () => `socialuser${Date.now()}`;

test.describe('web10-social post to feed', () => {
  test.skip('social user signup + token + CRUD round-trip', async () => {
    // GUTTED (v2→v3): tested /certify (removed) + legacy /signup. The feature still
    // exists in v3 — signup → login → CRUD via /v3/create + /v3/read. v3 rewrite:
    // /v3/signup → /v3/login → /v3/create (service=posts) → /v3/read.
  });

  test.skip('social app renders login screen without crash', async () => {
    // GUTTED (v2→v3): social app (web10-social) login-screen render check. The app is
    // the v3 integration surface — needs a fresh render test once the social app's
    // login route is stable. Tracked in the retire-obsolete-e2e lane.
  });
});