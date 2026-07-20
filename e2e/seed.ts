import { request } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;

/**
 * Persona fixture factory for e2e tests.
 * Creates a set of pre-configured accounts with known relationships:
 *   - creator: a node operator / content creator
 *   - fan1, fan2: followers with granted terms
 *   - revoked_fan: a user whose terms have been revoked
 *
 * Each persona gets a unique suffix (timestamp) so runs are isolated.
 * Returns tokens for each persona scoped to social.localhost.
 */
export interface PersonaTokens {
  creator: { username: string; password: string; token: string };
  fan1: { username: string; password: string; token: string };
  fan2: { username: string; password: string; token: string };
  revoked_fan: { username: string; password: string; token: string };
}

export async function seedPersonas(
  requestCtx: Awaited<ReturnType<typeof request.newContext>>,
  suffix: string,
): Promise<PersonaTokens> {
  const password = 'SeedPass123!';

  const users = [
    { name: 'creator', phone: '+15550000001' },
    { name: 'fan1', phone: '+15550000002' },
    { name: 'fan2', phone: '+15550000003' },
    { name: 'revoked_fan', phone: '+15550000004' },
  ];

  const personas: Record<string, { username: string; password: string; token: string }> = {};

  // 1. Sign up all users
  for (const u of users) {
    const username = `${u.name}${suffix}`;
    await requestCtx.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: u.phone,
        betacode: 'web10betacode',
      },
    });
    personas[u.name] = { username, password, token: '' };
  }

  // 2. Get social tokens for each persona
  for (const [key, persona] of Object.entries(personas)) {
    const res = await requestCtx.post(`${API_BASE}/web10token`, {
      data: {
        username: persona.username,
        password: persona.password,
        site: 'social.localhost',
        target: persona.username,
      },
    });
    if (res.ok()) {
      const body = await res.json();
      personas[key].token = body.token;
    }
  }

  // 3. Set up terms: creator grants fan1 and fan2 read access to their posts
  //    The creator's services collection needs whitelist entries for fans.
  //    We use the creator's self-token to create the terms records.
  const creatorToken = personas.creator.token;
  const creatorUser = personas.creator.username;

  // Grant fan1 read on posts service
  await requestCtx.post(`${API_BASE}/${creatorUser}/services`, {
    data: {
      token: creatorToken,
      query: {
        service: 'posts',
        whitelist: [
          {
            username: personas.fan1.username,
            provider: 'api.localhost',
            read: true,
          },
        ],
      },
    },
  });

  // Grant fan2 read on posts service
  await requestCtx.post(`${API_BASE}/${creatorUser}/services`, {
    data: {
      token: creatorToken,
      query: {
        service: 'posts',
        whitelist: [
          {
            username: personas.fan2.username,
            provider: 'api.localhost',
            read: true,
          },
        ],
      },
    },
  });

  // Grant revoked_fan read on posts (we'll revoke later)
  await requestCtx.post(`${API_BASE}/${creatorUser}/services`, {
    data: {
      token: creatorToken,
      query: {
        service: 'posts',
        whitelist: [
          {
            username: personas.revoked_fan.username,
            provider: 'api.localhost',
            read: true,
          },
        ],
      },
    },
  });

  return personas as PersonaTokens;
}

/**
 * Revoke terms: move a user from whitelist to blacklist on a service.
 */
export async function revokeTerms(
  requestCtx: Awaited<ReturnType<typeof request.newContext>>,
  ownerUsername: string,
  ownerToken: string,
  service: string,
  revokedUsername: string,
): Promise<void> {
  await requestCtx.put(`${API_BASE}/${ownerUsername}/services`, {
    data: {
      token: ownerToken,
      query: { service },
      update: {
        $set: {
          blacklist: [
            {
              username: revokedUsername,
              provider: 'api.localhost',
            },
          ],
        },
      },
    },
  });
}