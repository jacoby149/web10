import { APIRequestContext, APIResponse } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
export const API_BASE = `http://api.localhost${p}`;

/**
 * Post JSON to a v3 endpoint. Playwright's `json:` option doesn't work
 * with the nginx proxy + API (body arrives as None), so we use `data:`
 * with explicit Content-Type.
 */
export async function v3Post(
  request: APIRequestContext,
  url: string,
  body: Record<string, unknown>,
): Promise<APIResponse> {
  return request.post(url, {
    data: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Login via v3 and return the JWT token.
 */
export async function v3Login(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/login`, { username, password });
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login failed for ${username}: ${res.status()} ${body}`);
  }
  return (await res.json()).token;
}

/**
 * Signup via v3.
 */
export async function v3Signup(
  request: APIRequestContext,
  username: string,
  password: string,
  phone: string = '',
): Promise<void> {
  const body: Record<string, string> = { username, password };
  if (phone) body.phone = phone;
  const res = await v3Post(request, `${API_BASE}/v3/signup`, body);
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`Signup failed for ${username}: ${res.status()} ${body}`);
  }
}
