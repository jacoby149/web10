import { isDeepStrictEqual } from 'node:util';

const app = 'http://snake.localhost';
const auth = 'http://auth.localhost';
const social = 'http://social.localhost';
const base = { snake_scores: ['create', 'readAll'], marketplace_listings: ['create', 'readAll'] };
const check = condition => { if (!condition) throw new Error('InteroperabilityCorrectness'); };
const literal = value => `'${value.replaceAll("'", "''")}'`;

// HTTP-only API interoperability, not a second app's UI/consent test.
export async function runInteroperability({ api, poll, op, accounts: { creator, reader, outsider }, followers }) {
  const users = [creator, reader, outsider];
  const call = (user, path, data, status = 200, origin = app) => api(path, { token: user.token, ...data }, status, origin);
  const contract = (user, permissions) => call(user, '/v3/app-contracts/add', { allowed_origin: app, permissions }, 200, auth);
  const revoke = user => call(user, '/v3/app-contracts/revoke', { allowed_origin: app }, 200, auth);
  const step = (name, action) => op(`interop.${name}`, 'correctness', action);
  async function exact(sql, groups, expected) {
    await poll(async () => {
      const result = await call(reader, '/v3/query', { sql, groups });
      const rows = result.rows.map(row => ({ ...row,
        ...(typeof row.profile_body === 'string' ? { profile_body: JSON.parse(row.profile_body) } : {}) }));
      return result.count === expected.length && isDeepStrictEqual(rows, expected);
    });
  }
  let failed = false;
  try {
    const profiles = [];
    const profileGroups = [followers, `api.localhost/groups/users/${outsider.username}/followers`];
    await step('social-written-profiles', async () => {
      for (const [i, user] of [creator, outsider].entries()) {
        await poll(async () => {
          const docs = await call(user, '/v3/read', { service: 'profile', groups: [profileGroups[i]] }, 200, social);
          if (docs.length !== 1) return false;
          check(docs[0].author_key === user.username && isDeepStrictEqual(docs[0].body, { display_name: user.username }));
          profiles[i] = docs[0]; return true;
        });
      }
    });
    let group;
    const documents = {};
    await step('app-b-crud', async () => {
      for (const user of users) await contract(user, base);
      group = (await call(creator, '/v3/groups/create', { name: 'interop-app-b', roles: [
        { name: 'writer', permissions: { '*': ['create', 'readAll'] } },
        { name: 'reader', permissions: { '*': ['readAll'] } },
      ], members: users.map(user => ({ member_key: user.username, role: user === reader ? 'reader' : 'writer' })) }, 200, social)).group_id;
      for (const service of Object.keys(base)) {
        documents[service] = [];
        for (const [i, user] of [creator, outsider].entries()) {
          const body = service === 'snake_scores' ? { score: 200 - i * 100 } : { title: `Synthetic listing ${i}`, price: 20 + i };
          const doc = await call(user, '/v3/create', { service, groups: [group], body });
          check(typeof doc.doc_id === 'string' && doc.doc_id.length > 0);
          documents[service].push({ doc_id: doc.doc_id, author_key: user.username, body });
        }
      }
    });
    const groups = [group, ...profileGroups];
    const joins = Object.keys(base).map(service => ({ service,
      sql: `SELECT b.doc_id AS doc_id, b.author_key AS author_key, b.body AS body,
        p.doc_id AS profile_id, p.author_key AS profile_author, p.body AS profile_body
        FROM ${service} b INNER JOIN profile p ON b.author_key = p.author_key
        WHERE p.doc_id IN (${profiles.map(p => literal(p.doc_id)).join(',')})
        ORDER BY JSONExtractInt(b.body, '${service === 'snake_scores' ? 'score' : 'price'}') DESC, b.doc_id`,
      expected: documents[service].map((doc, i) => ({ ...doc, profile_id: profiles[i].doc_id,
        profile_author: profiles[i].author_key, profile_body: profiles[i].body }))
        .sort((a, b) => (b.body.score ?? b.body.price) - (a.body.score ?? a.body.price)),
    }));
    await step('missing-profile-app-grant', async () => {
      for (const { sql } of joins) await call(reader, '/v3/query', { sql, groups }, 403);
    });
    await step('grant-cross-author-joins', async () => {
      await contract(reader, { ...base, profile: ['readAll'] });
      for (const { sql, expected } of joins) await exact(sql, groups, expected);
    });
    await step('app-revoke-denial', async () => {
      await revoke(reader);
      for (const { sql } of joins) await call(reader, '/v3/query', { sql, groups }, 403);
    });
    await step('independent-private-profile-gate', async () => {
      await contract(reader, { ...base, profile: ['readAll'] });
      const privateGroup = (await call(creator, '/v3/groups/create', { name: 'interop-synthetic-private-profile', roles: [
        { name: 'owner', permissions: { '*': ['create', 'readAll'], group: ['assignRoles', 'revokeRoles'] } },
        { name: 'reader', permissions: { profile: ['readAll'] } },
      ], members: [{ member_key: creator.username, role: 'owner' }] }, 200, social)).group_id;
      // This fixture is NOT the social-written reuse evidence above.
      const body = { display_name: 'Synthetic private profile fixture' };
      const fixture = await call(creator, '/v3/create', { service: 'profile', groups: [privateGroup], body }, 200, social);
      const score = documents.snake_scores[0];
      const sql = `SELECT b.doc_id AS doc_id, b.author_key AS author_key, b.body AS body,
        p.doc_id AS profile_id, p.author_key AS profile_author, p.body AS profile_body
        FROM snake_scores b INNER JOIN profile p ON b.author_key = p.author_key
        WHERE p.doc_id = ${literal(fixture.doc_id)} ORDER BY b.doc_id`;
      const scope = [group, privateGroup];
      const scores = () => exact('SELECT doc_id, author_key, body FROM snake_scores ORDER BY JSONExtractInt(body, \'score\') DESC, doc_id', [group], documents.snake_scores);
      await call(reader, '/v3/read', { service: 'profile', groups: [privateGroup] }, 403);
      await exact(sql, scope, []); await scores();
      await call(creator, '/v3/groups/members/add', { group_id: privateGroup, member_key: reader.username, role: 'reader' }, 200, social);
      await exact(sql, scope, [{ ...score, profile_id: fixture.doc_id, profile_author: creator.username, profile_body: body }]);
      await call(creator, '/v3/groups/members/remove', { group_id: privateGroup, member_key: reader.username }, 200, social);
      await exact(sql, scope, []); await scores();
      await call(reader, '/v3/read', { service: 'profile', groups: [privateGroup] }, 403);
    });
  } finally {
    // Attempt every revoke even when setup, a join, or an earlier cleanup fails.
    for (const [i, user] of users.entries()) {
      try { await step(`cleanup-${i}`, () => revoke(user)); } catch { failed = true; }
    }
    if (failed) throw new Error('InteroperabilityCleanup');
  }
}
