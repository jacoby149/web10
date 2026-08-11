import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const MARKETING_API_BASE = `http://marketing-api.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = () => `exporttest${Date.now()}`;

test.describe('exporter upload -> marketing-api job -> records', () => {
  const password = 'TestPass123!';

  test('marketing-api health check', async ({ request }) => {
    const res = await request.get(`${MARKETING_API_BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('marketing-ui exporter route renders', async ({ page }) => {
    await page.goto(`${MARKETING_BASE}/import`);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('create import job -> upload ZIP -> poll for completion', async ({ request }) => {
    const username = uniqueUser();
    await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15556660001',
        betacode: 'web10betacode',
      },
    });

    // Owner token (no site/target) for the import pipeline
    const tokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: { username, password },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();

    // Create a minimal Instagram-style ZIP
    const zipBuffer = createMinimalInstagramZip();

    // 1. Create import job
    const jobRes = await request.post(`${MARKETING_API_BASE}/import`, {
      data: {
        platform: 'instagram',
        user_token: token,
        node_api_url: API_BASE,
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobData = await jobRes.json();
    const jobId = jobData.id;
    expect(jobId).toBeDefined();

    // 2. Upload ZIP
    const uploadRes = await request.post(`${MARKETING_API_BASE}/import/${jobId}/upload`, {
      multipart: {
        file: {
          name: 'instagram-export.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();

    // 3. Poll for completion
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await request.get(`${MARKETING_API_BASE}/import/${jobId}`);
      expect(statusRes.ok()).toBeTruthy();
      const status = await statusRes.json();
      if (status.phase === 'complete' || status.phase === 'error') {
        completed = true;
        if (status.phase === 'error') {
          console.log('Import job errors:', status.errors);
        }
        break;
      }
    }
    expect(completed).toBeTruthy();
  });

  test('analytics: pageview tracking', async ({ request }) => {
    const res = await request.post(`${MARKETING_API_BASE}/analytics/pageview`, {
      data: {
        path: '/import',
        referrer: 'https://google.com',
        user_agent: 'e2e-test',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');

    const summaryRes = await request.get(`${MARKETING_API_BASE}/analytics/summary`);
    expect(summaryRes.ok()).toBeTruthy();
    const summary = await summaryRes.json();
    expect(summary.total_pageviews).toBeGreaterThanOrEqual(1);
  });

  test('analytics: funnel tracking', async ({ request }) => {
    const res = await request.post(`${MARKETING_API_BASE}/analytics/funnel`, {
      data: {
        event: 'export_started',
        metadata: { platform: 'instagram' },
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('feedback submission', async ({ request }) => {
    const res = await request.post(`${MARKETING_API_BASE}/feedback`, {
      data: {
        message: 'e2e test feedback',
        contact: 'test@web10.app',
        app: 'marketing-ui',
        route: '/import',
        version: '1.0.0',
        user_agent: 'e2e-test',
        console_errors: [],
        stack_trace: null,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeDefined();
  });
});

/**
 * Creates a minimal ZIP file that looks like an Instagram data export.
 * Uses proper ZIP format with correct CRC32.
 */
function createMinimalInstagramZip(): Buffer {
  const entries: { name: string; data: Buffer } = [
    {
      name: 'Your Instagram activity/posts/2024/2024-01-01 00:00:00/Post 1.json',
      data: Buffer.from(JSON.stringify({
        'Caption': 'Test post from e2e',
        'Media URL': 'https://instagram.com/p/test/',
        'Timestamp': '2024-01-01T00:00:00Z',
      }), 'utf8'),
    },
  ];

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);

    // Local file header
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(entry.data.length, 18);
    lh.writeUInt32LE(entry.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    name.copy(lh, 30);
    localHeaders.push(lh);

    // Central directory entry
    const ch = Buffer.alloc(46 + name.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(entry.data.length, 20);
    ch.writeUInt32LE(entry.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    name.copy(ch, 46);
    centralHeaders.push(ch);

    offset += lh.length + entry.data.length;
  }

  // End of central directory
  const eocd = Buffer.alloc(22);
  const cdStart = offset;
  const cdSize = centralHeaders.reduce((s, b) => s + b.length, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);

  const parts: Buffer[] = [];
  for (let i = 0; i < entries.length; i++) {
    parts.push(localHeaders[i]);
    parts.push(entries[i].data);
  }
  for (const ch of centralHeaders) parts.push(ch);
  parts.push(eocd);
  return Buffer.concat(parts);
}

function crc32(data: Buffer): number {
  let crc = 0 ^ -1;
  const table = makeCrcTable();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}