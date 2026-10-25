import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server/http.mjs';
import { makeHarness } from './harness.mjs';
import { createApp } from '../server/app.mjs';

test('requests rewritten by vercel.json reach the right route with their query', async () => {
  const h = await makeHarness();
  const getApp = () => h.app;
  const r = await handleRequest(new Request('https://x.test/api/handler?__path=catalog&visitor=visitor-aaaaaaaaaaaaaaaa'), getApp);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray((await r.json()).pets));
  const nested = await handleRequest(new Request('https://x.test/api/handler?__path=admin/overview'), getApp);
  assert.equal(nested.status, 401, 'nested admin path is routed and still needs login');
  const post = await handleRequest(new Request('https://x.test/api/handler?__path=holds', { method: 'POST', body: '{bad' }), getApp);
  assert.equal(post.status, 400);
});

test('cron needs the CRON_SECRET bearer token', async () => {
  const h = await makeHarness();
  const getApp = () => h.app;
  const env = { CRON_SECRET: 's3cret' };
  assert.equal((await handleRequest(new Request('https://x.test/api/handler?__path=cron'), getApp, env)).status, 401);
  assert.equal((await handleRequest(new Request('https://x.test/api/handler?__path=cron'), getApp, {})).status, 401, 'no secret configured means no access');
  const ok = await handleRequest(new Request('https://x.test/api/handler?__path=cron', { headers: { authorization: 'Bearer s3cret' } }), getApp, env);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(await ok.json()).sort(), ['cancelled', 'released', 'reminded']);
});

test('a missing environment variable is named, never its value', async () => {
  const r = await handleRequest(new Request('https://x.test/api/handler?__path=catalog'), () => { throw new Error('Missing environment variable DATABASE_URL'); });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /thiếu biến DATABASE_URL/);
});

test('visiting the site runs the clean-up at most once per interval', async () => {
  const h = await makeHarness();
  let runs = 0;
  const app = createApp({
    db: { query: async (t, p) => { if (/^delete from holds where order_id is null/.test(t)) runs++; return h.db.query(t, p); }, tx: h.db.tx },
    mailer: { send: async () => {} }, storage: {}, auth: { emailFromToken: async () => null },
    config: { tokenSecret: 'x' }, now: () => h.clock.t, autoMaintenanceMs: 600e3
  });
  await app.handle({ method: 'GET', path: 'catalog' });
  await app.handle({ method: 'GET', path: 'catalog' });
  assert.equal(runs, 1);
  h.clock.t += 600e3;
  await app.handle({ method: 'GET', path: 'catalog' });
  assert.equal(runs, 2);
});
