// TryYourPet API: every rule that matters is enforced here, never only in the browser.
// createApp() takes its dependencies so the same code runs on Netlify and in the local tests:
//   db:      { query(text, params) -> rows, tx(fn(q) -> result) }
//   mailer:  { send({ to, subject, text, html }) }
//   storage: { upload(bucket, path, bytes, type), publicUrl(bucket, path), signedUrl(bucket, path, seconds), remove(bucket, paths) }
//   auth:    { emailFromToken(token) -> email | null }   (Supabase Auth access token of an admin)
//   config:  { tokenSecret, notifyEmail, siteUrl, supabaseUrl, supabaseAnonKey }
//   now:     () -> ms
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  HOLD_DAYS, MAX_PETS, COMMITS, ITEMS, PROOF_TYPES, PHOTO_TYPES, FILE_MAX, BANK, OUTSIDE,
  bookableDays, apptEnd, vnDateKey, addDays, weekdayOf, validateCustomer, validateAnswers, evaluateFlags,
  cleanAnswers, validateSupport, cleanItems, itemsText, fmtVND, normEmail, normPhone, EMAIL_RE
} from '../../site/js/rules.js';

const DAY = 864e5;
const OTP_TTL_MIN = 10, OTP_RESEND_S = 60, OTP_MAX_TRIES = 5, VERIFY_TTL_H = 3;
const VISITOR_RE = /^[A-Za-z0-9-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_LABEL = { review:'Chờ duyệt', confirmed:'Đã xác nhận', completed:'Đã nhận bé', cancelled:'Đã hủy' };

/** Plain-language cause for common setup mistakes; never includes connection strings, keys or data. */
export function setupHint(e) {
  const code = e && e.code, msg = String(e && e.message || '');
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'DATABASE_URL: sai mật khẩu database';
  if (/Tenant or user not found/i.test(msg)) return 'DATABASE_URL: sai tên người dùng, cần dạng postgres.<mã project>';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DATABASE_URL: không tìm thấy máy chủ database, kiểm tra lại địa chỉ';
  if (code === 'ENETUNREACH' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'DATABASE_URL: không kết nối được, hãy dùng chuỗi Transaction pooler (cổng 6543)';
  if (code === 'ERR_INVALID_URL' || /Invalid URL|invalid connection/i.test(msg)) return 'DATABASE_URL: chuỗi kết nối không đúng định dạng';
  if (code === '42P01') return 'chưa tạo bảng, hãy chạy supabase/schema.sql';
  if (code === '3D000') return 'DATABASE_URL: sai tên database, phải là postgres';
  if (/self.signed|certificate/i.test(msg)) return 'lỗi chứng chỉ SSL khi kết nối database';
  // Error codes and class names carry no data, so they are safe to show and let the cause be looked up.
  return 'mã lỗi: ' + (code || (e && e.name) || 'không rõ');
}

export class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
const bad = (msg, fields) => { throw new HttpError(400, msg, fields); };

export function createApp({ db, mailer, storage, auth, config, now = () => Date.now() }) {
  const q = (text, params) => db.query(text, params);
  const one = async (text, params) => (await q(text, params))[0] || null;
  const ms = v => (v == null ? null : new Date(v).getTime());

  /* ---------- helpers ---------- */
  function sign(payload) {
    return createHmac('sha256', config.tokenSecret).update(payload).digest('base64url');
  }
  function makeEmailToken(email) {
    const body = Buffer.from(JSON.stringify({ e: email, x: now() + VERIFY_TTL_H * 3600e3 })).toString('base64url');
    return body + '.' + sign(body);
  }
  function readEmailToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const want = Buffer.from(sign(body)), got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.x > now() ? p.e : null; } catch { return null; }
  }
  const otpHash = (email, code) => createHash('sha256').update(config.tokenSecret + '|' + email + '|' + code).digest('hex');
  const newCode = prefix => {
    const d = new Date(now() + 7 * 3600e3);
    return prefix + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + '-' + randomInt(1000, 10000);
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmtDay = key => {
    const [y, m, d] = key.split('-');
    return ['Chủ nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'][weekdayOf(key)] + ', ' + d + '/' + m + '/' + y;
  };

  async function sendMail(to, subject, lines) {
    const text = lines.join('\n') + '\n\nTryYourPet, kết nối các trạm cứu hộ chó mèo tại TP.HCM' + (config.siteUrl ? '\n' + config.siteUrl : '');
    const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0B0F1F">'
      + lines.map(l => l ? '<p style="margin:0 0 10px">' + esc(l) + '</p>' : '').join('')
      + '<p style="margin:16px 0 0;color:#545B73;font-size:13px">TryYourPet, kết nối các trạm cứu hộ chó mèo tại TP.HCM</p></div>';
    let ok = true, error = null;
    try { await mailer.send({ to, subject, text, html }); } catch (e) { ok = false; error = String(e && e.message || e).slice(0, 500); }
    await q('insert into email_log (to_email, subject, ok, error) values ($1,$2,$3,$4)', [to, subject, ok, error]);
    return ok;
  }
  const notifyAdmins = (subject, lines) => config.notifyEmail ? sendMail(config.notifyEmail, subject, lines) : null;

  async function settings() {
    const s = await one('select open_days from settings where id = 1');
    return { openDays: s ? s.open_days.map(Number) : [0, 2, 3, 4, 5, 6] };
  }
  const slotsList = () => q('select id, label, start_hour, end_hour, capacity from slots order by sort, id');
  const stationsList = () => q('select id, name, area, address, facebook, email, phone, needs from stations order by sort, name');

  async function bookedCounts(dates) {
    if (!dates.length) return {};
    const rows = await q(`select appt_date::text as d, slot_id, count(*)::int as n from orders
      where status in ('review','confirmed') and appt_date = any($1::date[]) group by 1, 2`, [dates]);
    const out = {};
    rows.forEach(r => { out[r.d + '|' + r.slot_id] = r.n; });
    return out;
  }

  function petOut(p, hold, visitorId) {
    let state = 'available';
    if (p.adopted_at) state = 'adopted';
    else if (hold) state = hold.visitor_id === visitorId && !hold.order_id ? 'mine' : 'held';
    return {
      id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, age: p.age_months, weight: Number(p.weight_kg),
      vaccine: p.vaccine, neutered: p.neutered, traits: p.traits || [], story: p.story, station: p.station_id,
      photos: p.photos || [], video: p.video_url || null, state
    };
  }
  const activeHoldsSql = `select pet_id, visitor_id, order_id, expires_at from holds where order_id is not null or expires_at > $1`;

  async function myHolds(visitorId) {
    return q(`select h.pet_id, h.expires_at, p.station_id, p.species, p.name from holds h join pets p on p.id = h.pet_id
      where h.visitor_id = $1 and h.order_id is null and h.expires_at > $2 order by h.created_at`, [visitorId, new Date(now())]);
  }

  function checkVisitor(v) { if (!VISITOR_RE.test(String(v || ''))) bad('Phiên làm việc không hợp lệ, tải lại trang.'); return v; }

  /* ---------- file upload ---------- */
  function decodeFile(f, types, label) {
    if (!f || typeof f.data !== 'string') bad('Thiếu ' + label + '.');
    if (!types.includes(f.type)) bad(label[0].toUpperCase() + label.slice(1) + ' phải là ' + (types.includes('application/pdf') ? 'ảnh JPG, PNG, WEBP hoặc PDF.' : 'ảnh JPG, PNG hoặc WEBP.'));
    const bytes = Buffer.from(f.data, 'base64');
    if (!bytes.length) bad(label[0].toUpperCase() + label.slice(1) + ' bị rỗng.');
    if (bytes.length > FILE_MAX) bad(label[0].toUpperCase() + label.slice(1) + ' lớn hơn 4 MB, chọn file nhỏ hơn.');
    // The declared type must match the file's own signature, so a renamed file cannot slip through.
    const sig = {
      'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8,
      'image/png': b => b.subarray(0, 4).toString('hex') === '89504e47',
      'image/webp': b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
      'application/pdf': b => b.subarray(0, 4).toString() === '%PDF'
    }[f.type];
    if (!sig(bytes)) bad('Nội dung ' + label + ' không khớp với loại file.');
    const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' }[f.type];
    return { bytes, ext, type: f.type };
  }

  /* ================= public routes ================= */
  async function getConfig() {
    return { supabaseUrl: config.supabaseUrl || null, supabaseAnonKey: config.supabaseAnonKey || null, bank: BANK };
  }

  async function getCatalog({ visitor }) {
    const visitorId = VISITOR_RE.test(String(visitor || '')) ? visitor : null;
    const t = new Date(now());
    const [pets, holds, stations, slots, st] = await Promise.all([
      q(`select id, name, species, breed, sex, age_months, weight_kg::float8 as weight_kg, vaccine, neutered, traits, story,
           station_id, photos, video_url, adopted_at from pets where published order by adopted_at nulls first, created_at`),
      q(activeHoldsSql, [t]), stationsList(), slotsList(), settings()
    ]);
    const holdBy = Object.fromEntries(holds.map(h => [h.pet_id, h]));
    const days = bookableDays(st.openDays, now());
    const counts = await bookedCounts(days);
    const mine = visitorId ? (await myHolds(visitorId)).map(h => ({ petId: h.pet_id, expiresAt: ms(h.expires_at) })) : [];
    return {
      now: now(),
      pets: pets.map(p => petOut(p, holdBy[p.id], visitorId)),
      stations, settings: st,
      slots: slots.map(s => ({ id: s.id, label: s.label, capacity: s.capacity })),
      days: days.map(d => ({ date: d, weekday: weekdayOf(d), slots: slots.map(s => ({ id: s.id, label: s.label, capacity: s.capacity, left: Math.max(0, s.capacity - (counts[d + '|' + s.id] || 0)) })) })),
      myHolds: mine
    };
  }

  async function addHold({ visitorId, petId }) {
    checkVisitor(visitorId);
    if (!UUID_RE.test(String(petId || ''))) bad('Không tìm thấy bé này.');
    return db.tx(async tq => {
      const t = new Date(now());
      const pet = (await tq('select id, name, station_id, adopted_at, published from pets where id = $1 for update', [petId]))[0];
      if (!pet || !pet.published) throw new HttpError(404, 'Không tìm thấy bé này.');
      if (pet.adopted_at) throw new HttpError(409, 'Bé đã có nhà.');
      await tq('delete from holds where pet_id = $1 and order_id is null and expires_at <= $2', [petId, t]);
      const mine = await tq(`select h.pet_id, p.station_id, p.name from holds h join pets p on p.id = h.pet_id
        where h.visitor_id = $1 and h.order_id is null and h.expires_at > $2`, [visitorId, t]);
      if (mine.some(h => h.pet_id === petId)) return { ok: true };
      if (mine.length >= MAX_PETS) throw new HttpError(409, 'Mỗi đơn nhận tối đa ' + MAX_PETS + ' bé. Bỏ bớt một bé trong nhà trước.');
      if (mine.length && mine[0].station_id !== pet.station_id) {
        const s = await tq('select name from stations where id = $1', [mine[0].station_id]);
        throw new HttpError(409, 'Các bé trong một đơn cần ở cùng một trạm để bạn đón một lần. ' + mine[0].name + ' đang ở ' + (s[0] ? s[0].name : 'trạm khác') + '.');
      }
      const taken = await tq('select 1 from holds where pet_id = $1', [petId]);
      if (taken.length) throw new HttpError(409, 'Bé vừa được người khác giữ chỗ.');
      const expires = new Date(now() + HOLD_DAYS * DAY);
      await tq('insert into holds (pet_id, visitor_id, expires_at) values ($1, $2, $3)', [petId, visitorId, expires]);
      return { ok: true, expiresAt: expires.getTime(), name: pet.name };
    });
  }

  async function removeHold({ visitorId, petId }) {
    checkVisitor(visitorId);
    await q('delete from holds where pet_id = $1 and visitor_id = $2 and order_id is null', [petId, visitorId]);
    return { ok: true };
  }

  async function sendOtp({ email }) {
    const e = normEmail(email);
    if (!EMAIL_RE.test(e)) bad('Email chưa đúng định dạng.');
    const prev = await one('select sent_at from otp_codes where email = $1', [e]);
    if (prev && now() - ms(prev.sent_at) < OTP_RESEND_S * 1000) throw new HttpError(429, 'Vui lòng đợi 1 phút trước khi gửi lại mã.');
    const code = String(randomInt(100000, 1000000));
    await q(`insert into otp_codes (email, code_hash, expires_at, attempts, sent_at) values ($1,$2,$3,0,$4)
      on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
      [e, otpHash(e, code), new Date(now() + OTP_TTL_MIN * 60e3), new Date(now())]);
    const ok = await sendMail(e, 'Mã xác thực TryYourPet: ' + code, [
      'Mã xác thực email của bạn là: ' + code,
      'Mã có hiệu lực trong ' + OTP_TTL_MIN + ' phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.'
    ]);
    if (!ok) throw new HttpError(502, 'Chưa gửi được email, vui lòng thử lại sau ít phút.');
    return { ok: true };
  }

  async function verifyOtp({ email, code }) {
    const e = normEmail(email);
    const row = await one('select code_hash, expires_at, attempts from otp_codes where email = $1', [e]);
    if (!row || ms(row.expires_at) < now()) bad('Mã đã hết hạn, bấm "Gửi lại mã".');
    if (row.attempts >= OTP_MAX_TRIES) bad('Nhập sai quá nhiều lần, bấm "Gửi lại mã".');
    if (otpHash(e, String(code || '').trim()) !== row.code_hash) {
      await q('update otp_codes set attempts = attempts + 1 where email = $1', [e]);
      bad('Mã chưa đúng. Kiểm tra lại email hoặc gửi lại mã.');
    }
    await q('delete from otp_codes where email = $1', [e]);
    return { ok: true, token: makeEmailToken(e) };
  }

  async function createOrder(body) {
    const visitorId = checkVisitor(body.visitorId);
    const c = body.customer || {};
    const customer = {
      name: String(c.name || '').trim().slice(0, 120), phone: normPhone(c.phone), email: normEmail(c.email),
      address: String(c.address || '').trim().slice(0, 300), district: String(c.district || ''), job: String(c.job || '').trim().slice(0, 120),
      cccd: String(c.cccd || '').trim()
    };
    const tokenEmail = readEmailToken(body.emailToken);
    if (!tokenEmail || tokenEmail !== customer.email) bad('Email chưa được xác thực hoặc đã hết hạn xác thực, vui lòng xác thực lại.', { email: 'Xác thực email trước khi gửi đơn.' });
    const cErr = validateCustomer(customer, now());
    if (Object.keys(cErr).length) bad('Thông tin cá nhân chưa hợp lệ.', cErr);

    const holds = await myHolds(visitorId);
    if (!holds.length) bad('Nhà của bạn đang trống hoặc thời gian giữ chỗ đã hết. Hãy thêm bé vào nhà trước.');
    if (new Set(holds.map(h => h.station_id)).size > 1) bad('Các bé trong một đơn cần ở cùng một trạm.');
    const hasCat = holds.some(h => h.species === 'cat');
    const answers = body.answers || {};
    const aErr = validateAnswers(answers, hasCat);
    if (Object.keys(aErr).length) bad('Câu hỏi sàng lọc chưa trả lời đủ.', aErr);
    const commits = Array.isArray(body.commits) ? body.commits : [];
    if (commits.length !== COMMITS.length || !commits.every(Boolean)) bad('Cần đồng ý tất cả cam kết để gửi đơn.', { commits: 'Cần đồng ý tất cả cam kết để gửi đơn.' });

    const st = await settings();
    const date = String(body.date || ''), slotId = String(body.slotId || '');
    if (!bookableDays(st.openDays, now()).includes(date)) bad('Ngày đón bé không hợp lệ, vui lòng chọn lại.', { slot: 'Chọn lại ngày đón bé.' });
    const flags = evaluateFlags(answers, hasCat);
    const status = flags.length ? 'review' : 'confirmed';

    const order = await db.tx(async tq => {
      const slot = (await tq('select id, label, end_hour, capacity from slots where id = $1 for update', [slotId]))[0];
      if (!slot) throw new HttpError(400, 'Khung giờ không hợp lệ.', { slot: 'Chọn lại khung giờ.' });
      const used = (await tq(`select count(*)::int as n from orders where appt_date = $1::date and slot_id = $2 and status in ('review','confirmed')`, [date, slotId]))[0].n;
      if (used >= slot.capacity) throw new HttpError(409, 'Khung giờ này vừa kín, chọn khung khác.', { slot: 'Khung giờ này vừa kín, chọn khung khác.' });
      // Re-read the holds inside the transaction and lock them, so the same pets cannot go into two orders.
      const locked = await tq(`select pet_id from holds where visitor_id = $1 and order_id is null and expires_at > $2 for update`, [visitorId, new Date(now())]);
      if (locked.length !== holds.length) throw new HttpError(409, 'Giỏ của bạn vừa thay đổi, vui lòng tải lại trang.');
      const end = new Date(apptEnd(date, slot));
      let row = null;
      for (let i = 0; i < 5 && !row; i++) {
        row = (await tq(`insert into orders (code, status, pet_ids, station_id, name, phone, email, address, district, job, cccd, answers, flags, appt_date, slot_id, appt_end)
          values ($1,$2,$3::uuid[],$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15,$16) on conflict (code) do nothing returning id, code`,
          [newCode('TYP'), status, holds.map(h => h.pet_id), holds[0].station_id, customer.name, customer.phone, customer.email, customer.address,
           customer.district, customer.job, customer.cccd, JSON.stringify(cleanAnswers(answers, hasCat)), flags, date, slotId, end]))[0] || null;
      }
      if (!row) throw new HttpError(500, 'Chưa tạo được đơn, vui lòng thử lại.');
      await tq('update holds set order_id = $1, expires_at = $2 where visitor_id = $3 and order_id is null', [row.id, end, visitorId]);
      return { ...row, slot };
    });

    const station = await one('select name, address from stations where id = $1', [holds[0].station_id]);
    const names = holds.map(h => h.name).join(' và ');
    const where = station.name + (station.address ? ', ' + station.address : ' (trạm sẽ báo địa chỉ qua email hoặc điện thoại)');
    const when = fmtDay(date) + ', ' + order.slot.label;
    await sendMail(customer.email, status === 'confirmed' ? 'Đơn ' + order.code + ' đã được xác nhận' : 'TryYourPet đã nhận đơn ' + order.code, status === 'confirmed' ? [
      'Chào ' + customer.name + ',', 'Đơn nhận nuôi ' + names + ' của bạn đã được xác nhận.',
      'Lịch đón bé: ' + when + '.', 'Nơi đón: ' + where + '.', 'Mang theo CCCD bản gốc' + (hasCat ? ' và lồng hoặc túi vận chuyển cho mèo.' : ' và dây dắt cho chó.'),
      'Lịch không thể tự đổi hoặc hủy. Nếu không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.'
    ] : [
      'Chào ' + customer.name + ',', 'TryYourPet đã nhận đơn nhận nuôi ' + names + '. Quản trị viên sẽ xem lại đơn và trả lời bạn qua email.',
      'Lịch đón bé bạn chọn: ' + when + '. Bé vẫn được giữ cho bạn đến hết lịch hẹn.'
    ]);
    await notifyAdmins((status === 'confirmed' ? 'Đơn mới tự xác nhận ' : 'Đơn mới cần duyệt ') + order.code, [
      'Người nhận: ' + customer.name + ', ' + customer.phone + ', ' + customer.email, 'Bé: ' + names + ' (' + station.name + ')', 'Lịch: ' + when,
      ...(flags.length ? ['Lý do cần duyệt: ' + flags.join('; ')] : [])
    ]);
    return { order: { code: order.code, status, statusLabel: ORDER_LABEL[status], date, dateLabel: fmtDay(date), slotLabel: order.slot.label, pets: holds.map(h => h.name), hasCat, station: { name: station.name, address: station.address }, flags, email: customer.email } };
  }

  async function createSupport(body) {
    const s = {
      type: body.type, target: String(body.target || 'all'), amount: body.type === 'cash' ? Math.round(Number(body.amount)) : null,
      items: body.type === 'items' ? cleanItems(body.items) : null, method: body.type === 'items' ? (body.method === 'ship' ? 'ship' : 'dropoff') : null,
      name: String(body.name || '').trim().slice(0, 120), anon: !!body.anon, email: normEmail(body.email),
      phone: String(body.phone || '').trim().slice(0, 20), note: String(body.note || '').trim().slice(0, 1000), hasProof: !!body.proof
    };
    const errs = validateSupport(s);
    if (Object.keys(errs).length) bad('Thông tin hỗ trợ chưa hợp lệ.', errs);
    let targetLabel = 'Quỹ chung TryYourPet', stationId = null;
    if (s.target !== 'all') {
      const [kind, id] = s.target.split(':');
      if (kind === 'station') { const st = await one('select id, name from stations where id = $1', [id]); if (!st) bad('Nơi nhận hỗ trợ không hợp lệ.'); targetLabel = st.name; stationId = st.id; }
      else if (kind === 'pet' && UUID_RE.test(id || '')) { const p = await one('select p.name, s.id as sid, s.name as station from pets p join stations s on s.id = p.station_id where p.id = $1', [id]); if (!p) bad('Nơi nhận hỗ trợ không hợp lệ.'); targetLabel = 'Bé ' + p.name + ', ' + p.station; stationId = p.sid; }
      else bad('Nơi nhận hỗ trợ không hợp lệ.');
    }
    const code = newCode('HT');
    let proofPath = null;
    if (s.type === 'cash') {
      const f = decodeFile(body.proof, PROOF_TYPES, 'minh chứng chuyển khoản');
      proofPath = vnDateKey(now()).slice(0, 7) + '/' + code + '.' + f.ext;
      await storage.upload('proofs', proofPath, f.bytes, f.type);
    }
    await q(`insert into supports (code, type, target, amount, items, method, name, anon, email, phone, note, proof_path)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [code, s.type, s.target, s.amount, s.items ? JSON.stringify(s.items) : null, s.method, s.name, s.anon, s.email, s.phone || null, s.note || null, proofPath]);
    const what = s.type === 'cash' ? fmtVND(s.amount) : itemsText(s.items);
    let addr = '';
    if (s.type === 'items') {
      const st = stationId ? await one('select name, address from stations where id = $1', [stationId]) : null;
      addr = st ? 'Địa chỉ nhận đồ: ' + st.name + (st.address ? ', ' + st.address : ' (trạm sẽ liên hệ báo địa chỉ)') + '.' : 'Bạn có thể gửi đồ đến bất kỳ trạm nào trong danh sách trên website.';
    }
    await sendMail(s.email, s.type === 'cash' ? 'TryYourPet đã nhận minh chứng chuyển khoản' : 'TryYourPet đã nhận đăng ký hỗ trợ', [
      'Chào ' + s.name + ',', 'Cảm ơn bạn đã hỗ trợ ' + targetLabel + ': ' + what + '.',
      s.type === 'cash' ? 'Dự án đã nhận ảnh minh chứng chuyển khoản và sẽ đối soát với tài khoản ngân hàng. Khi tiền đã về, bạn sẽ nhận một email báo lại.' : addr,
      ...(s.type === 'items' ? ['Khi trạm nhận được đồ, bạn sẽ nhận một email báo lại.'] : [])
    ]);
    await notifyAdmins('Hỗ trợ mới ' + code + (s.type === 'cash' ? ' (cần đối soát)' : ''), ['Người hỗ trợ: ' + s.name + ', ' + s.email, 'Dành cho: ' + targetLabel, (s.type === 'cash' ? 'Số tiền: ' : 'Hiện vật: ') + what]);
    return { support: { type: s.type, target: targetLabel, what, method: s.method, email: s.email } };
  }

  /* ================= admin routes ================= */
  async function requireAdmin(headers) {
    const h = headers.authorization || headers.Authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new HttpError(401, 'Vui lòng đăng nhập.');
    const email = normEmail(await auth.emailFromToken(token));
    if (!email) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    if (!(await one('select 1 as ok from admins where email = $1', [email]))) throw new HttpError(403, 'Tài khoản này không có quyền quản trị.');
    return email;
  }

  async function overview() {
    const t = new Date(now());
    const today = vnDateKey(now());
    const [orders, supports, pets, holds, stations, slots, st, emails] = await Promise.all([
      q(`select id, code, status, pet_ids, station_id, name, phone, email, address, district, job, cccd, answers, flags, appt_date::text as appt_date,
           slot_id, appt_end, cancel_reason, decided_by, created_at from orders order by created_at desc limit 300`),
      q(`select id, code, type, target, amount, items, method, name, anon, email, phone, note, proof_path, status, decided_by, created_at
           from supports order by created_at desc limit 300`),
      q(`select id, name, species, breed, sex, age_months, weight_kg::float8 as weight_kg, vaccine, neutered, traits, story, station_id,
           photos, video_url, published, adopted_at, created_at from pets order by created_at desc`),
      q(`select h.pet_id, h.visitor_id, h.order_id, h.expires_at from holds h where h.order_id is not null or h.expires_at > $1`, [t]),
      stationsList(), slotsList(), settings(),
      q('select to_email, subject, ok, error, created_at from email_log order by id desc limit 20')
    ]);
    const holdBy = Object.fromEntries(holds.map(h => [h.pet_id, h]));
    const days = []; for (let i = 0; i < 7; i++) days.push(addDays(today, i));
    return {
      now: now(), today, days,
      settings: st, slots, stations,
      orders: orders.map(o => ({ ...o, appt_end: ms(o.appt_end), created_at: ms(o.created_at) })),
      supports: supports.map(s => ({ ...s, created_at: ms(s.created_at), hasProof: !!s.proof_path, proof_path: undefined })),
      pets: pets.map(p => ({ ...petOut(p, holdBy[p.id], null), published: p.published, adoptedAt: ms(p.adopted_at) })),
      holds: holds.filter(h => !h.order_id).map(h => ({ petId: h.pet_id, expiresAt: ms(h.expires_at) })),
      emails: emails.map(e => ({ ...e, created_at: ms(e.created_at) })),
      bank: BANK
    };
  }

  async function orderAction({ id, action }, admin) {
    const o = await one(`select id, code, status, pet_ids, station_id, name, email, appt_date::text as appt_date, slot_id from orders where id = $1`, [id]);
    if (!o) throw new HttpError(404, 'Không tìm thấy đơn.');
    const allowed = { approve: ['review'], reject: ['review'], complete: ['confirmed'], noshow: ['confirmed'] }[action];
    if (!allowed) bad('Thao tác không hợp lệ.');
    if (!allowed.includes(o.status)) throw new HttpError(409, 'Đơn đang ở trạng thái "' + ORDER_LABEL[o.status] + '", không thể thực hiện thao tác này.');
    const pets = await q('select name from pets where id = any($1::uuid[])', [o.pet_ids]);
    const names = pets.map(p => p.name).join(' và ');
    const slot = await one('select label from slots where id = $1', [o.slot_id]);
    const station = await one('select name, address from stations where id = $1', [o.station_id]);
    if (action === 'approve') {
      await q(`update orders set status = 'confirmed', decided_by = $2 where id = $1`, [id, admin]);
      await sendMail(o.email, 'Đơn ' + o.code + ' đã được duyệt', ['Chào ' + o.name + ',', 'Đơn nhận nuôi ' + names + ' đã được duyệt.',
        'Lịch đón bé: ' + fmtDay(o.appt_date) + ', ' + (slot ? slot.label : '') + '.', 'Nơi đón: ' + station.name + (station.address ? ', ' + station.address : '') + '. Mang theo CCCD bản gốc.',
        'Lịch không thể tự đổi hoặc hủy. Nếu không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.']);
    } else if (action === 'reject' || action === 'noshow') {
      const reason = action === 'reject' ? 'Không đạt sàng lọc' : 'Không đến đúng hẹn';
      await db.tx(async tq => {
        await tq(`update orders set status = 'cancelled', cancel_reason = $2, decided_by = $3 where id = $1`, [id, reason, admin]);
        await tq('delete from holds where order_id = $1', [id]);
      });
      await sendMail(o.email, 'Đơn ' + o.code + (action === 'reject' ? ' chưa được duyệt' : ' đã bị hủy'), action === 'reject'
        ? ['Chào ' + o.name + ',', 'Rất tiếc, đơn nhận nuôi ' + names + ' chưa phù hợp lần này. Cảm ơn bạn đã quan tâm đến các bé.']
        : ['Chào ' + o.name + ',', 'Đơn nhận nuôi ' + names + ' đã bị hủy vì bạn không đến đúng lịch hẹn. Bé đã được nhả cho người khác.']);
    } else {
      await db.tx(async tq => {
        await tq(`update orders set status = 'completed', decided_by = $2 where id = $1`, [id, admin]);
        await tq('update pets set adopted_at = $2 where id = any($1::uuid[])', [o.pet_ids, new Date(now())]);
        await tq('delete from holds where order_id = $1', [id]);
      });
      await sendMail(o.email, 'Cảm ơn bạn đã đón ' + names + ' về nhà', ['Chào ' + o.name + ',', 'Cảm ơn bạn đã đón ' + names + ' về nhà.',
        'Nhớ gửi ảnh hoặc video cập nhật cho trạm hằng tháng trong 3 tháng đầu như đã cam kết nhé.']);
    }
    return { ok: true };
  }

  async function supportAction({ id, action }, admin) {
    const s = await one('select id, code, type, status, name, email, amount, items from supports where id = $1', [id]);
    if (!s) throw new HttpError(404, 'Không tìm thấy lượt hỗ trợ.');
    if (s.status !== 'pending') throw new HttpError(409, 'Lượt hỗ trợ này đã được xử lý.');
    if (action !== 'received' && action !== 'rejected') bad('Thao tác không hợp lệ.');
    await q('update supports set status = $2, decided_by = $3 where id = $1', [id, action, admin]);
    const what = s.type === 'cash' ? fmtVND(s.amount) : itemsText(s.items || {});
    await sendMail(s.email, action === 'received' ? 'TryYourPet đã nhận được hỗ trợ của bạn' : 'TryYourPet chưa đối soát được khoản hỗ trợ', action === 'received'
      ? ['Chào ' + s.name + ',', 'Dự án đã nhận được ' + what + '. Cảm ơn bạn đã thương các bé!']
      : ['Chào ' + s.name + ',', 'Dự án chưa tìm thấy giao dịch ' + what + ' khớp với minh chứng bạn gửi. Bạn vui lòng trả lời email này kèm thời gian chuyển và tên tài khoản chuyển để dự án kiểm tra lại.']);
    return { ok: true };
  }

  async function proofUrl({ id }) {
    const s = await one('select proof_path from supports where id = $1', [id]);
    if (!s || !s.proof_path) throw new HttpError(404, 'Lượt hỗ trợ này không có minh chứng.');
    return { url: await storage.signedUrl('proofs', s.proof_path, 300) };
  }

  async function saveSettings({ openDays, capacities }) {
    const days = [...new Set((openDays || []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) bad('Cần mở cửa ít nhất một ngày.');
    await q('update settings set open_days = $1::int[] where id = 1', [days]);
    for (const [sid, cap] of Object.entries(capacities || {})) {
      const n = Math.floor(Number(cap));
      if (!(n >= 0 && n <= 50)) bad('Số khách mỗi khung phải từ 0 đến 50.');
      await q('update slots set capacity = $2 where id = $1', [sid, n]);
    }
    return { ok: true };
  }

  async function savePet({ pet, newPhotos, removePhotos }) {
    const p = pet || {};
    const f = {
      name: String(p.name || '').trim().slice(0, 60), species: p.species, breed: String(p.breed || '').trim().slice(0, 80), sex: p.sex,
      age: Math.floor(Number(p.age)), weight: Number(p.weight), vaccine: String(p.vaccine || '').trim().slice(0, 200), neutered: !!p.neutered,
      traits: (Array.isArray(p.traits) ? p.traits : String(p.traits || '').split(',')).map(t => String(t).trim()).filter(Boolean).slice(0, 8),
      story: String(p.story || '').trim().slice(0, 3000), station: String(p.station || ''), video: String(p.video || '').trim() || null,
      published: p.published !== false, adopted: !!p.adopted
    };
    const e = {};
    if (!f.name) e.name = 'Nhập tên bé.';
    if (f.species !== 'dog' && f.species !== 'cat') e.species = 'Chọn loài.';
    if (f.sex !== 'Đực' && f.sex !== 'Cái') e.sex = 'Chọn giới tính.';
    if (!(f.age >= 0 && f.age <= 300)) e.age = 'Tuổi tính theo tháng, từ 0 đến 300.';
    if (!(f.weight > 0 && f.weight < 150)) e.weight = 'Cân nặng tính bằng kg.';
    if (!(await one('select 1 as ok from stations where id = $1', [f.station]))) e.station = 'Chọn trạm chăm sóc.';
    if (f.video && !/^https:\/\//.test(f.video)) e.video = 'Link video phải bắt đầu bằng https://';
    if (Object.keys(e).length) bad('Thông tin bé chưa hợp lệ.', e);

    let row = p.id ? await one('select id, photos, adopted_at from pets where id = $1', [p.id]) : null;
    if (p.id && !row) throw new HttpError(404, 'Không tìm thấy bé.');
    const id = row ? row.id : (await one('select gen_random_uuid()::text as id')).id;
    let photos = row ? row.photos || [] : [];
    const drop = new Set(removePhotos || []);
    const dropped = photos.filter(u => drop.has(u));
    photos = photos.filter(u => !drop.has(u));
    for (const [i, file] of (newPhotos || []).entries()) {
      const d = decodeFile(file, PHOTO_TYPES, 'ảnh của bé');
      const path = id + '/' + now() + '-' + i + '.' + d.ext;
      await storage.upload('pet-media', path, d.bytes, d.type);
      photos.push(storage.publicUrl('pet-media', path));
    }
    if (photos.length > 10) bad('Mỗi bé tối đa 10 ảnh.');
    const adoptedAt = f.adopted ? (row && row.adopted_at ? row.adopted_at : new Date(now())) : null;
    if (row) {
      await q(`update pets set name=$2, species=$3, breed=$4, sex=$5, age_months=$6, weight_kg=$7, vaccine=$8, neutered=$9, traits=$10, story=$11,
        station_id=$12, photos=$13, video_url=$14, published=$15, adopted_at=$16 where id = $1`,
        [id, f.name, f.species, f.breed, f.sex, f.age, f.weight, f.vaccine, f.neutered, f.traits, f.story, f.station, photos, f.video, f.published, adoptedAt]);
    } else {
      await q(`insert into pets (id, name, species, breed, sex, age_months, weight_kg, vaccine, neutered, traits, story, station_id, photos, video_url, published, adopted_at)
        values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, f.name, f.species, f.breed, f.sex, f.age, f.weight, f.vaccine, f.neutered, f.traits, f.story, f.station, photos, f.video, f.published, adoptedAt]);
    }
    const prefix = '/storage/v1/object/public/pet-media/';
    const paths = dropped.map(u => u.includes(prefix) ? decodeURIComponent(u.split(prefix)[1]) : null).filter(Boolean);
    if (paths.length) { try { await storage.remove('pet-media', paths); } catch { /* the record is already updated; a leftover file is harmless */ } }
    return { ok: true, id };
  }

  async function saveStation({ station }) {
    const s = station || {};
    const id = String(s.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(id)) bad('Mã trạm gồm 2–10 chữ in hoa hoặc số, ví dụ VML.', { id: 'Mã trạm gồm 2–10 chữ in hoa hoặc số.' });
    const name = String(s.name || '').trim().slice(0, 80);
    if (!name) bad('Nhập tên trạm.', { name: 'Nhập tên trạm.' });
    const fb = String(s.facebook || '').trim();
    if (fb && !/^https:\/\//.test(fb)) bad('Link Facebook phải bắt đầu bằng https://', { facebook: 'Link phải bắt đầu bằng https://' });
    const email = normEmail(s.email);
    if (email && !EMAIL_RE.test(email)) bad('Email trạm chưa đúng định dạng.', { email: 'Email chưa đúng định dạng.' });
    const needs = (s.needs || []).filter(n => ITEMS.some(([k]) => k === n));
    await q(`insert into stations (id, name, area, address, facebook, email, phone, needs) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (id) do update set name=excluded.name, area=excluded.area, address=excluded.address, facebook=excluded.facebook,
      email=excluded.email, phone=excluded.phone, needs=excluded.needs`,
      [id, name, String(s.area || 'TP.HCM').trim().slice(0, 60), String(s.address || '').trim().slice(0, 300), fb || null, email || null, String(s.phone || '').trim().slice(0, 20) || null, needs]);
    return { ok: true };
  }

  /* ================= scheduled maintenance ================= */
  async function maintenance() {
    const t = new Date(now());
    const released = (await q('delete from holds where order_id is null and expires_at <= $1 returning pet_id', [t])).length;
    const late = await q(`select id, code, status, name, email, pet_ids from orders where status in ('review','confirmed') and appt_end <= $1`, [t]);
    for (const o of late) {
      const reason = o.status === 'confirmed' ? 'Không đến đúng hẹn' : 'Quá lịch hẹn khi chưa được duyệt';
      await db.tx(async tq => {
        await tq(`update orders set status = 'cancelled', cancel_reason = $2, decided_by = 'Hệ thống' where id = $1`, [o.id, reason]);
        await tq('delete from holds where order_id = $1', [o.id]);
      });
      const names = (await q('select name from pets where id = any($1::uuid[])', [o.pet_ids])).map(p => p.name).join(' và ');
      await sendMail(o.email, 'Đơn ' + o.code + ' đã bị hủy', ['Chào ' + o.name + ',', o.status === 'confirmed'
        ? 'Đơn nhận nuôi ' + names + ' đã bị hủy vì bạn không đến đúng lịch hẹn. Bé đã được nhả cho người khác.'
        : 'Đơn nhận nuôi ' + names + ' đã quá lịch hẹn trong khi chưa được duyệt nên đã được hủy. Bạn có thể đăng ký lại nếu bé vẫn còn tìm nhà.']);
    }
    const tomorrow = addDays(vnDateKey(now()), 1);
    const due = await q(`select o.id, o.code, o.name, o.email, o.pet_ids, s.label, st.name as station, st.address from orders o
      join slots s on s.id = o.slot_id join stations st on st.id = o.station_id
      where o.status = 'confirmed' and o.appt_date = $1::date and o.reminded_at is null`, [tomorrow]);
    for (const o of due) {
      const names = (await q('select name from pets where id = any($1::uuid[])', [o.pet_ids])).map(p => p.name).join(' và ');
      await sendMail(o.email, 'Nhắc lịch: ngày mai đón ' + names, ['Chào ' + o.name + ',', 'Nhắc bạn lịch đón ' + names + ' vào ' + fmtDay(tomorrow) + ', ' + o.label + '.',
        'Nơi đón: ' + o.station + (o.address ? ', ' + o.address : '') + '. Mang theo CCCD bản gốc.', 'Nếu không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.']);
      await q('update orders set reminded_at = $2 where id = $1', [o.id, t]);
    }
    await q('delete from otp_codes where expires_at <= $1', [new Date(now() - DAY)]);
    return { released, cancelled: late.length, reminded: due.length };
  }

  /* ================= router ================= */
  const routes = {
    'GET config': () => getConfig(),
    'GET catalog': ({ query }) => getCatalog(query),
    'POST holds': ({ body }) => addHold(body),
    'POST holds/remove': ({ body }) => removeHold(body),
    'POST otp/send': ({ body }) => sendOtp(body),
    'POST otp/verify': ({ body }) => verifyOtp(body),
    'POST orders': ({ body }) => createOrder(body),
    'POST supports': ({ body }) => createSupport(body),
    'GET admin/me': async ({ admin }) => ({ email: admin }),
    'GET admin/overview': () => overview(),
    'POST admin/orders/action': ({ body, admin }) => orderAction(body, admin),
    'POST admin/supports/action': ({ body, admin }) => supportAction(body, admin),
    'GET admin/supports/proof': ({ query }) => proofUrl(query),
    'POST admin/settings': ({ body }) => saveSettings(body),
    'POST admin/pets/save': ({ body }) => savePet(body),
    'POST admin/stations/save': ({ body }) => saveStation(body)
  };

  /** Returns { status, body } for one API call; path is the part after /api/. */
  async function handle({ method, path, query = {}, body = {}, headers = {} }) {
    const key = method.toUpperCase() + ' ' + path.replace(/^\/+|\/+$/g, '');
    const fn = routes[key];
    if (!fn) return { status: 404, body: { error: 'Không tìm thấy đường dẫn.' } };
    try {
      const admin = key.includes(' admin/') ? await requireAdmin(headers) : null;
      return { status: 200, body: await fn({ query, body: body || {}, headers, admin }) };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message, fields: e.fields } };
      console.error(e);
      const hint = setupHint(e);
      return { status: 500, body: { error: 'Máy chủ gặp lỗi, vui lòng thử lại sau.' + (hint ? ' (' + hint + ')' : '') } };
    }
  }

  return { handle, maintenance };
}
