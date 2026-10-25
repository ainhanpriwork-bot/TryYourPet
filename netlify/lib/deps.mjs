// Real dependencies for Netlify: Postgres (Supabase), Supabase Storage and Auth, Gmail SMTP.
// Configured entirely by environment variables; see .env.example.
import pg from 'pg';
import nodemailer from 'nodemailer';
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
  const db = {
    query: async (text, params) => (await pool.query(text, params)).rows,
    tx: async fn => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn(async (text, params) => (await client.query(text, params)).rows);
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
  };

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      if (error) throw error;
    },
    publicUrl: (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
    async signedUrl(bucket, path, seconds) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
      if (error) throw error;
      return data.signedUrl;
    },
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

  // Gmail is checked when an email is sent, not at start-up, so the site keeps working without it
  // (the failed send is recorded in email_log and shown on the admin page).
  let transport = null;
  const mailer = {
    send: ({ to, subject, text, html }) => {
      if (!transport) transport = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD') }
      });
      return transport.sendMail({ from: '"TryYourPet" <' + process.env.GMAIL_USER + '>', to, subject, text, html });
    }
  };

  app = createApp({
    db, storage, auth, mailer,
    config: {
      tokenSecret: env('TOKEN_SECRET'),
      notifyEmail: process.env.NOTIFY_EMAIL || process.env.GMAIL_USER || '',
      siteUrl: process.env.URL || process.env.SITE_URL || '',
      supabaseUrl: env('SUPABASE_URL'),
      supabaseAnonKey: env('SUPABASE_ANON_KEY')
    }
  });
  return app;
}
