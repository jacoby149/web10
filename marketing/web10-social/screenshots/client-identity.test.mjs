import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('screenshot client retains the singleton identity used by live feed-source effects', () => {
  // Execute the actual fixture module, without adding its preview-only wrapper
  // types or Node built-ins to the browser application's TypeScript graph.
  const source = readFileSync(new URL('./harness/mock-v3.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, require: name => {
    if (name === './mock-wapi') return { getWapi: () => ({ readToken: () => null }) };
    if (name === '../../src/data/v3') return {};
    throw new Error(`Unexpected fixture dependency: ${name}`);
  } });
  assert.equal(exports.getV3Client(), exports.getV3Client());
});
