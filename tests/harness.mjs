// Test harness: the real API code on an in-process Postgres (PGlite) loaded with supabase/schema.sql,
// with fake storage and admin login so no account or network is needed.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.mjs';

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
export const ADMIN_TOKEN = 'admin-token', OUTSIDER_TOKEN = 'outsider-token';

export async function makeHarness() {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const db = { query: async (text, params) => (await pg.query(text, params)).rows };
  const files = {};
  const app = createApp({
    db,
    storage: {
      upload: async (bucket, path, bytes, type) => { files[bucket + '/' + path] = { bytes, type }; },
      publicUrl: (bucket, path) => 'https://example.supabase.co/storage/v1/object/public/' + bucket + '/' + path,
      remove: async (bucket, paths) => paths.forEach(p => delete files[bucket + '/' + p])
    },
    auth: { emailFromToken: async t => ({ [ADMIN_TOKEN]: 'Admin@Example.com', [OUTSIDER_TOKEN]: 'someone@example.com' }[t] || null) },
    config: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' }
  });
  await db.query(`insert into admins (email) values ('admin@example.com')`);
  await db.query(`insert into stations (id, name, address) values ('TD', 'Trạm chó Thủ Đức', '88 Lê Văn Việt')`);

  const call = (method, path, body, opts = {}) =>
    app.handle({ method, path, body, query: opts.query || {}, headers: opts.token ? { authorization: 'Bearer ' + opts.token } : {} });
  const admin = (method, path, body, query) => call(method, path, body, { token: ADMIN_TOKEN, query });

  async function addPet(fields) {
    const r = await admin('POST', 'admin/pets/save', { pet: { name: 'Bé', species: 'cat', sex: 'Cái', age: 8, weight: 3.2, station: 'VML', ...fields } });
    if (r.status !== 200) throw new Error(JSON.stringify(r.body));
    return r.body.id;
  }
  return { app, db, files, call, admin, addPet };
}
