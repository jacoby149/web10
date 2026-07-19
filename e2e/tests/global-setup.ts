import { request } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;

export default async function globalSetup() {
  const req = await request.newContext();

  // Configure the node (required: provider + admin)
  const res = await req.post(`${API_BASE}/setup`, {
    data: {
      provider: 'api.localhost',
      admin_username: 'admin',
      admin_password: 'admin123',
      beta_required: false,
      verify_required: false,
      pay_required: false,
      cors_service_managers: 'auth.localhost,social.localhost',
    },
  });

  if (!res.ok()) {
    // Node may already be configured — that's fine
    const body = await res.json().catch(() => ({}));
    if (body.detail?.includes('already configured') || res.status() === 400) {
      console.log('Node already configured, skipping setup.');
    } else {
      throw new Error(`Failed to configure node: ${res.status()} ${JSON.stringify(body)}`);
    }
  } else {
    console.log('Node configured successfully.');
  }

  await req.dispose();
}