import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('marketplace cannot publish before the initial listing read settles', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: true, value: '', replaceChildren() {}, append() {}, reset() {} });
    return nodes.get(id);
  };
  let ready, finishQuery;
  const query = new Promise(resolve => { finishQuery = resolve; });
  const sandbox = {
    document: { getElementById: node },
    location: { href: 'http://marketing.localhost/docs/marketplace/' },
    URL,
    window: {
      addEventListener() {},
      interop: {
        el: () => ({}), object: value => value, identity() {}, prepare: {}, profiles: '',
        session(_service, onReady, onReset) { ready = onReady; onReset(); },
      },
    },
  };
  vm.runInNewContext(readFileSync(new URL('../../marketing/marketing-ui/public/docs/marketplace/script.js', import.meta.url), 'utf8'), sandbox);
  const loading = ready({ w: { query: () => query }, valid: () => true, ticket: () => () => true, state() {}, failure(error) { throw error; } });
  const disabledDuringRead = node('fields').disabled;
  finishQuery({ rows: [] });
  await loading;
  assert.equal(disabledDuringRead, true, 'initial read must not overwrite an enabled form publication');
  assert.equal(node('fields').disabled, false, 'form enables after the initial read');
});
