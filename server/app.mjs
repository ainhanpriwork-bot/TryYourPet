// TryYourPet API: the public pet list, and the admin pages that manage pets and stations.
// Visitors adopt by messaging a fanpage or calling, so there are no orders, holds or emails here.
// createApp() takes its dependencies so the same code runs on Vercel and in the local tests:
//   db:      { query(text, params) -> rows }
//   storage: { upload(bucket, path, bytes, type), publicUrl(bucket, path), remove(bucket, paths) }
//   auth:    { emailFromToken(token) -> email | null }   (Supabase Auth access token of an admin)
//   config:  { supabaseUrl, supabaseAnonKey }
//   now:     () -> ms
import { PHOTO_TYPES, FILE_MAX, normEmail, EMAIL_RE } from '../site/js/rules.js';

/** Plain-language cause for common setup mistakes; never includes connection strings, keys or data. */
export function setupHint(e) {
  const code = e && e.code, msg = String(e && e.message || '');
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'DATABASE_URL: sai mật khẩu database';
  if (/Tenant or user not found/i.test(msg)) return 'DATABASE_URL: sai tên người dùng, cần dạng postgres.<mã project>';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    // The host name is not a secret (the project URL is public), and seeing it shows which part of the string is wrong.
    const host = String(e.hostname || '').replace(/[^A-Za-z0-9.-]/g, '').slice(0, 80);
    return 'DATABASE_URL: không tìm thấy máy chủ database' + (host ? ' "' + host + '"' : '') + ', kiểm tra lại địa chỉ';
  }
  if (code === 'ENETUNREACH' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'DATABASE_URL: không kết nối được, hãy dùng chuỗi Transaction pooler (cổng 6543)';
  if (code === 'ERR_INVALID_URL' || /Invalid URL|invalid connection/i.test(msg)) return 'DATABASE_URL: chuỗi kết nối không đúng định dạng';
  if (code === '42P01') return 'chưa tạo bảng, hãy chạy supabase/schema.sql';
  if (code === '3D000') return 'DATABASE_URL: sai tên database, phải là postgres';
  if (/self.signed|certificate/i.test(msg)) return 'lỗi chứng chỉ SSL khi kết nối database';
  if (code === 'XX000') {
    // Supabase's pooler explains refusals in plain words; drop anything URL- or credential-shaped first.
    const safe = msg.replace(/\S*[@:/]\S*/g, '…').replace(/["'`]/g, '').slice(0, 120);
    return 'DATABASE_URL bị pooler từ chối: ' + safe;
  }
  // Error codes and class names carry no data, so they are safe to show and let the cause be looked up.
  return 'mã lỗi: ' + (code || (e && e.name) || 'không rõ');
}

export class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
const bad = (msg, fields) => { throw new HttpError(400, msg, fields); };

export function createApp({ db, storage, auth, config, now = () => Date.now() }) {
  const q = (text, params) => db.query(text, params);
  const one = async (text, params) => (await q(text, params))[0] || null;
  const ms = v => (v == null ? null : new Date(v).getTime());
  const stationsList = () => q('select id, name, area, address, facebook, email, phone from stations order by sort, name');
  const petColumns = `id, name, species, breed, sex, age_months, weight_kg::float8 as weight_kg, vaccine, neutered, traits, story,
           station_id, photos, video_url, published, adopted_at`;

  function petOut(p) {
    return {
      id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, age: p.age_months, weight: Number(p.weight_kg),
      vaccine: p.vaccine, neutered: p.neutered, traits: p.traits || [], story: p.story, station: p.station_id,
      photos: p.photos || [], video: p.video_url || null, state: p.adopted_at ? 'adopted' : 'available'
    };
  }

  /* ---------- file upload ---------- */
  function decodeFile(f, types, label) {
    if (!f || typeof f.data !== 'string') bad('Thiếu ' + label + '.');
    if (!types.includes(f.type)) bad(label[0].toUpperCase() + label.slice(1) + ' phải là ảnh JPG, PNG hoặc WEBP.');
    const bytes = Buffer.from(f.data, 'base64');
    if (!bytes.length) bad(label[0].toUpperCase() + label.slice(1) + ' bị rỗng.');
    if (bytes.length > FILE_MAX) bad(label[0].toUpperCase() + label.slice(1) + ' lớn hơn 3 MB, chọn file nhỏ hơn.');
    // The declared type must match the file's own signature, so a renamed file cannot slip through.
    const sig = {
      'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8,
      'image/png': b => b.subarray(0, 4).toString('hex') === '89504e47',
      'image/webp': b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
    }[f.type];
    if (!sig(bytes)) bad('Nội dung ' + label + ' không khớp với loại file.');
    const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[f.type];
    return { bytes, ext, type: f.type };
  }

  /* ================= public routes ================= */
  async function getConfig() {
    return { supabaseUrl: config.supabaseUrl || null, supabaseAnonKey: config.supabaseAnonKey || null };
  }

  async function getCatalog() {
    const [pets, stations] = await Promise.all([
      q(`select ${petColumns} from pets where published order by adopted_at nulls first, created_at`),
      stationsList()
    ]);
    return { pets: pets.map(petOut), stations };
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
    const [pets, stations] = await Promise.all([q(`select ${petColumns} from pets order by created_at desc`), stationsList()]);
    return { pets: pets.map(p => ({ ...petOut(p), published: p.published, adoptedAt: ms(p.adopted_at) })), stations };
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
    await q(`insert into stations (id, name, area, address, facebook, email, phone) values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (id) do update set name=excluded.name, area=excluded.area, address=excluded.address, facebook=excluded.facebook,
      email=excluded.email, phone=excluded.phone`,
      [id, name, String(s.area || 'TP.HCM').trim().slice(0, 60), String(s.address || '').trim().slice(0, 300), fb || null, email || null, String(s.phone || '').trim().slice(0, 20) || null]);
    return { ok: true };
  }

  /* ================= router ================= */
  const routes = {
    'GET config': () => getConfig(),
    'GET catalog': () => getCatalog(),
    'GET admin/me': async ({ admin }) => ({ email: admin }),
    'GET admin/overview': () => overview(),
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

  return { handle };
}
