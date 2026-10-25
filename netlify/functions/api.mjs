// HTTP entry point: every /api/* request lands here and is routed by netlify/lib/app.mjs.
import { getApp } from '../lib/deps.mjs';

const MAX_BODY = 6 * 1024 * 1024;

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  let body = {};
  if (req.method !== 'GET') {
    const text = await req.text();
    if (text.length > MAX_BODY) return Response.json({ error: 'Dữ liệu gửi lên quá lớn.' }, { status: 413 });
    try { body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 }); }
  }
  let res;
  try {
    res = await getApp().handle({
      method: req.method, path, body,
      query: Object.fromEntries(url.searchParams),
      headers: { authorization: req.headers.get('authorization') || '' }
    });
  } catch (e) {
    console.error(e);
    // Only the variable's name is shown, never a value, so the site owner can see what to add in Netlify.
    const missing = /^Missing environment variable (\w+)$/.exec(e && e.message || '');
    res = { status: 500, body: { error: 'Máy chủ chưa được cấu hình xong' + (missing ? ' (thiếu biến ' + missing[1] + ')' : '') + ', vui lòng thử lại sau.' } };
  }
  return Response.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config = { path: '/api/*' };
