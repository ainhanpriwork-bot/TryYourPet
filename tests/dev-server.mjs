// Local preview of the whole site without any account: `npm run dev`, then open http://127.0.0.1:8888
// Uses an in-memory Postgres (PGlite) with sample pets, prints emails (and OTP codes) to the console,
// keeps uploads in memory, and signs the admin page in automatically as admin@local.test.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.mjs';

const PORT = Number(process.env.PORT || 8888);
const SITE = new URL('../site/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp', '.otf':'font/otf', '.jpg':'image/jpeg', '.pdf':'application/pdf' };

const pg = new PGlite();
await pg.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await pg.exec(`
  insert into admins (email) values ('admin@local.test');
  update stations set address = '12 Đường Mẫu, Phường Mẫu (địa chỉ thử)' where id = 'VML';
  insert into stations (id, name, area, address, needs, sort) values ('TD', 'Trạm chó Thủ Đức (thử)', 'TP. Thủ Đức', '88 Lê Văn Việt (địa chỉ thử)', '{dogfood,med,gear}', 3);
  insert into pets (name, species, breed, sex, age_months, weight_kg, vaccine, neutered, traits, story, station_id) values
    ('Mướp', 'cat', 'Mèo ta', 'Cái', 8, 3.2, 'Đã tiêm 4 bệnh + dại', true, '{Hiền,Thích được vuốt ve}', 'Bé mẫu để chạy thử.', 'VML'),
    ('Đen', 'cat', 'Mèo ta', 'Đực', 20, 4.8, 'Đã tiêm 4 bệnh + dại', true, '{Tình cảm}', 'Bé mẫu để chạy thử.', 'VML'),
    ('Kem', 'cat', 'Mèo Anh lông ngắn lai', 'Đực', 18, 5.1, 'Đã tiêm 4 bệnh', true, '{Lười biếng}', 'Bé mẫu để chạy thử.', 'PN'),
    ('Lu', 'dog', 'Chó ta', 'Đực', 24, 14, 'Đã tiêm 7 bệnh + dại', true, '{Năng động}', 'Bé mẫu để chạy thử.', 'TD');
`);
const db = {
  query: async (text, params) => (await pg.query(text, params)).rows,
  tx: fn => pg.transaction(tx => fn(async (text, params) => (await tx.query(text, params)).rows))
};
const files = new Map();
const app = createApp({
  db,
  mailer: { send: async m => console.log('\n[email] to ' + m.to + ': ' + m.subject + '\n' + m.text + '\n') },
  storage: {
    upload: async (bucket, path, bytes, type) => { files.set(bucket + '/' + path, { bytes, type }); },
    publicUrl: (bucket, path) => '/_files/' + bucket + '/' + path,
    signedUrl: async (bucket, path) => '/_files/' + bucket + '/' + path,
    remove: async (bucket, paths) => paths.forEach(p => files.delete(bucket + '/' + p))
  },
  auth: { emailFromToken: async t => (t === 'dev-admin' ? 'admin@local.test' : null) },
  config: { tokenSecret: 'dev-secret', notifyEmail: 'team@local.test', siteUrl: 'http://127.0.0.1:' + PORT, supabaseUrl: null, supabaseAnonKey: null }
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const c of req) raw += c;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, 'application/json', '{"error":"bad json"}'); }
    const path = url.pathname.slice(5);
    const r = path === 'config'
      ? { status: 200, body: { ...(await app.handle({ method: 'GET', path })).body, devAuth: true } }
      : await app.handle({ method: req.method, path, body, query: Object.fromEntries(url.searchParams), headers: { authorization: req.headers.authorization || '' } });
    return send(r.status, 'application/json; charset=utf-8', JSON.stringify(r.body));
  }
  if (url.pathname.startsWith('/_files/')) {
    const f = files.get(decodeURIComponent(url.pathname.slice(8)));
    return f ? send(200, f.type, f.bytes) : send(404, 'text/plain', 'not found');
  }
  if (url.pathname === '/_maintenance') return send(200, 'application/json', JSON.stringify(await app.maintenance()));
  const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) return send(403, 'text/plain', 'forbidden');
  try { send(200, TYPES[extname(rel)] || 'application/octet-stream', await readFile(join(SITE, rel))); }
  catch { send(404, 'text/plain', 'not found'); }
}).listen(PORT, '127.0.0.1', () => console.log('TryYourPet dev server: http://127.0.0.1:' + PORT + '  (admin: /admin.html)'));
