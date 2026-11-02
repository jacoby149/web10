// Research runners share the E2E installation to avoid loading Playwright twice.
export { test, expect, defineConfig, type APIRequestContext, type Page } from '@playwright/test';
