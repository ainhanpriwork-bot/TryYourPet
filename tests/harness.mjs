// Test harness: the real API code on an in-process Postgres (PGlite) loaded with supabase/schema.sql,
// with fake email, storage and admin login so no account or network is needed.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.mjs';

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
export const ADMIN_TOKEN = 'admin-token', OUTSIDER_TOKEN = 'outsider-token';

export async function makeHarness({ start = Date.parse('2026-10-26T03:00:00Z') } = {}) {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const db = {
    query: async (text, params) => (await pg.query(text, params)).rows,
    tx: fn => pg.transaction(tx => fn(async (text, params) => (await tx.query(text, params)).rows))
  };
  const clock = { t: start };
  const sent = [], files = {};
  const app = createApp({
    db,
    mailer: { send: async m => { sent.push(m); } },
    storage: {
      upload: async (bucket, path, bytes, type) => { files[bucket + '/' + path] = { bytes, type }; },
      publicUrl: (bucket, path) => 'https://example.supabase.co/storage/v1/object/public/' + bucket + '/' + path,
      signedUrl: async (bucket, path) => 'https://example.supabase.co/signed/' + bucket + '/' + path,
      remove: async (bucket, paths) => paths.forEach(p => delete files[bucket + '/' + p])
    },
    auth: { emailFromToken: async t => ({ [ADMIN_TOKEN]: 'Admin@Example.com', [OUTSIDER_TOKEN]: 'someone@example.com' }[t] || null) },
    config: { tokenSecret: 'test-secret', notifyEmail: 'notify@example.com', siteUrl: 'https://tryyourpet.test', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' },
    now: () => clock.t
  });
  await db.query(`insert into admins (email) values ('admin@example.com')`);
  await db.query(`insert into stations (id, name, address) values ('TD', 'Trạm chó Thủ Đức', '88 Lê Văn Việt')`);

  const call = async (method, path, body, opts = {}) => {
    const r = await app.handle({ method, path, body, query: opts.query || {}, headers: opts.token ? { authorization: 'Bearer ' + opts.token } : {} });
    return r;
  };
  const admin = (method, path, body, query) => call(method, path, body, { token: ADMIN_TOKEN, query });

  async function addPet(fields) {
    const r = await admin('POST', 'admin/pets/save', { pet: { name: 'Bé', species: 'cat', sex: 'Cái', age: 8, weight: 3.2, station: 'VML', ...fields } });
    if (r.status !== 200) throw new Error(JSON.stringify(r.body));
    return r.body.id;
  }
  async function verifiedToken(email) {
    await call('POST', 'otp/send', { email });
    const code = sent.at(-1).subject.match(/(\d{6})$/)[1];
    return (await call('POST', 'otp/verify', { email, code })).body.token;
  }
  return { app, db, pg, clock, sent, files, call, admin, addPet, verifiedToken };
}

export const goodCustomer = (email = 'khach@example.com') => ({
  name: 'Nguyễn Văn An', phone: '0901234567', email, address: '12 Lê Lợi', district: 'Quận 1', job: 'Nhân viên', cccd: '079099001234'
});
export const goodAnswers = { exp: 'past', otherPets: 'none', housing: 'own', permit: 'na', family: 'yes', allergy: 'no', alone: '4to8', cats: 'yes', budget: 'yes', cannot: 'return', care: 'Gửi bố mẹ' };
