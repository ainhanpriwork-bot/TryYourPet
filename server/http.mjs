// Turns a web Request into an API call. vercel.json rewrites /api/<path>?<query> to /api/handler?__path=<path>&<query>.
const MAX_BODY = 4 * 1024 * 1024;   // Vercel refuses request bodies above 4.5 MB

export async function handleRequest(req, getApp, env = process.env) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const path = String(query.__path ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  delete query.__path;
  const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

  // Daily job called by Vercel Cron, which sends "Authorization: Bearer <CRON_SECRET>".
  if (path === 'cron') {
    if (!env.CRON_SECRET || req.headers.get('authorization') !== 'Bearer ' + env.CRON_SECRET) return json(401, { error: 'unauthorized' });
    try { return json(200, await getApp().maintenance()); } catch (e) { console.error(e); return json(500, { error: 'maintenance failed' }); }
  }

  let body = {};
  if (req.method !== 'GET') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json(413, { error: 'Dữ liệu gửi lên quá lớn, chọn file nhỏ hơn 3 MB.' });
    try { body = text ? JSON.parse(text) : {}; } catch { return json(400, { error: 'Dữ liệu gửi lên không hợp lệ.' }); }
  }
  try {
    const res = await getApp().handle({ method: req.method, path, body, query, headers: { authorization: req.headers.get('authorization') || '' } });
    return json(res.status, res.body);
  } catch (e) {
    console.error(e);
    // Only the variable's name is shown, never a value, so the site owner can see what to add.
    const missing = /^Missing environment variable (\w+)$/.exec(e && e.message || '');
    return json(500, { error: 'Máy chủ chưa được cấu hình xong' + (missing ? ' (thiếu biến ' + missing[1] + ')' : '') + ', vui lòng thử lại sau.' });
  }
}
