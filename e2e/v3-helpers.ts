import { APIRequestContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
export const API_BASE = `http://api.localhost${p}`;

/**
 * Login via v3 and return the JWT token.
 */
export async function v3Login(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/login`, {
    json: {
      token: '',
      body: { username, password },
    },
  });
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
  const res = await request.post(`${API_BASE}/v3/signup`, {
    json: {
      token: '',
      body: { username, password, phone },
    },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`Signup failed for ${username}: ${res.status()} ${body}`);
  }
}
