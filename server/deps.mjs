// Real dependencies on Vercel: Postgres (Supabase), Supabase Storage and Auth.
// Configured entirely by environment variables; see .env.example.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createApp } from './app.mjs';

const env = name => {
  const v = process.env[name];
  if (!v) throw new Error('Missing environment variable ' + name);
  return v;
};

let app = null;

/** One app per function instance; connections are reused across warm invocations. */
export function getApp() {
  if (app) return app;
  const pool = new pg.Pool({ connectionString: env('DATABASE_URL'), max: 3, ssl: { rejectUnauthorized: false } });
  const db = { query: async (text, params) => (await pool.query(text, params)).rows };

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      if (error) throw error;
    },
    publicUrl: (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
    async remove(bucket, paths) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw error;
    }
  };
  const auth = {
    async emailFromToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.email;
    }
  };

  app = createApp({
    db, storage, auth,
    config: { supabaseUrl: env('SUPABASE_URL'), supabaseAnonKey: env('SUPABASE_ANON_KEY') }
  });
  return app;
}
