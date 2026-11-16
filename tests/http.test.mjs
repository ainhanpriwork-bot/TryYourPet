import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server/http.mjs';
import { makeHarness } from './harness.mjs';

test('requests rewritten by vercel.json reach the right route', async () => {
  const h = await makeHarness();
  const getApp = () => h.app;
  const r = await handleRequest(new Request('https://x.test/api/handler?__path=catalog'), getApp);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray((await r.json()).pets));
  const nested = await handleRequest(new Request('https://x.test/api/handler?__path=admin/overview'), getApp);
  assert.equal(nested.status, 401, 'nested admin path is routed and still needs login');
  const post = await handleRequest(new Request('https://x.test/api/handler?__path=admin/pets/save', { method: 'POST', body: '{bad' }), getApp);
  assert.equal(post.status, 400);
  assert.equal((await handleRequest(new Request('https://x.test/api/handler?__path=cron'), getApp)).status, 404, 'no daily job any more');
});

test('a missing environment variable is named, never its value', async () => {
  const r = await handleRequest(new Request('https://x.test/api/handler?__path=catalog'), () => { throw new Error('Missing environment variable DATABASE_URL'); });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /thiếu biến DATABASE_URL/);
});
