// Admin page: sign in with Supabase Auth (email + password); every action goes through /api/admin/*,
// where the server checks the login and the admins list again.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { PHOTO_TYPES, FILE_MAX } from './rules.js';
import { esc, ageText, kg, species, toast, api, fileToPayload, busy } from './ui.js';

const app = document.getElementById('app');
const STATE_LABEL = { available:'Đang tìm nhà', adopted:'Đã có nhà' };
const TABS = [['pets','Thú cưng'],['stations','Trạm']];

let sb = null, me = null, D = null, recovery = false;
const UI = { tab: 'pets', petForm: null, petErr: {}, stationErr: {} };

async function token() { const { data } = await sb.auth.getSession(); return data.session ? data.session.access_token : null; }
const call = async (method, path, body) => api(method, path, body, await token());

/* ---------- start and sign-in ---------- */
async function start() {
  let cfg;
  try { cfg = await api('GET', 'config'); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (cfg.devAuth) sb = devAuth();   // local preview only (npm run dev); the real server never sends devAuth
  else if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { app.innerHTML = '<div class="empty">Máy chủ chưa được cấu hình Supabase. Xem hướng dẫn cài đặt trong docs/HUONG-DAN-CAI-DAT.md.</div>'; return; }
  else sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') { recovery = true; renderLogin(); } });
  if (location.hash.includes('type=recovery')) { recovery = true; }
  const { data } = await sb.auth.getSession();
  if (data.session && !recovery) await enter(); else renderLogin();
}

/* Stand-in for Supabase Auth used by the local dev server, which accepts the token "dev-admin". */
function devAuth() {
  let session = null;
  return { auth: {
    getSession: async () => ({ data: { session } }),
    signInWithPassword: async () => { session = { access_token: 'dev-admin' }; return {}; },
    signOut: async () => { session = null; },
    onAuthStateChange: () => {},
    resetPasswordForEmail: async () => ({}),
    updateUser: async () => ({})
  } };
}

function renderLogin(msg = '') {
  document.getElementById('who').innerHTML = '';
  app.innerHTML = recovery ? `<form class="panel login" id="pwform">
      <h2>Đặt mật khẩu mới</h2>
      <label class="field"><span>Mật khẩu mới (ít nhất 8 ký tự)</span><input type="password" id="newpw" autocomplete="new-password" minlength="8" required></label>
      <button class="btn" type="submit">Lưu mật khẩu</button>
      <p class="err">${esc(msg)}</p></form>`
    : `<form class="panel login" id="loginform">
      <h2>Đăng nhập quản trị</h2>
      <p class="meta">Chỉ dành cho quản trị viên TryYourPet.</p>
      <label class="field"><span>Email</span><input type="email" id="lemail" autocomplete="username" required></label>
      <label class="field"><span>Mật khẩu</span><input type="password" id="lpw" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Đăng nhập</button>
      <button class="btn ghost small" type="button" data-act="forgot">Quên mật khẩu</button>
      <p class="err">${esc(msg)}</p></form>`;
}

async function enter() {
  try { me = (await call('GET', 'admin/me')).email; }
  catch (e) {
    if (e.status === 403) { await sb.auth.signOut(); renderLogin('Tài khoản này không có quyền quản trị.'); return; }
    renderLogin(e.message); return;
  }
  document.getElementById('who').innerHTML = `<span class="who">${esc(me)}</span> <button class="btn ghost small" data-act="logout">Đăng xuất</button>`;
  await refresh();
}

async function refresh() {
  try { D = await call('GET', 'admin/overview'); }
  catch (e) { if (e.status === 401) { renderLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'); return; } toast(e.message); }
  render();
}

/* ---------- views ---------- */
const station = id => D.stations.find(s => s.id === id) || { name: id };
function render() {
  if (!D) { app.innerHTML = '<p class="loading">Đang tải…</p>'; return; }
  app.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap"><h1>Quản trị</h1><button class="btn ghost small" data-act="refresh">Tải lại dữ liệu</button></div>
    <nav class="admin-tabs">${TABS.map(([k, l]) => `<button data-act="tab" data-k="${k}" aria-pressed="${UI.tab === k}">${l}</button>`).join('')}</nav>
    <div id="view">${({ pets: vPets, stations: vStations })[UI.tab]()}</div>`;
}

function petFormHtml() {
  const p = UI.petForm, e = UI.petErr;
  const err = k => `<span class="err">${esc(e[k] || '')}</span>`;
  return `<section class="panel" id="petform"><h2>${p.id ? 'Sửa hồ sơ ' + esc(p.name) : 'Thêm bé mới'}</h2>
    <div class="form-grid">
      <label class="field"><span>Tên bé</span><input type="text" id="p-name" data-p="name" value="${esc(p.name)}">${err('name')}</label>
      <label class="field"><span>Trạm chăm sóc</span><select id="p-station" data-p="station"><option value="">Chọn trạm</option>${D.stations.map(s => `<option value="${esc(s.id)}" ${p.station === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>${err('station')}</label>
      <label class="field"><span>Loài</span><select id="p-species" data-p="species"><option value="cat" ${p.species === 'cat' ? 'selected' : ''}>Mèo</option><option value="dog" ${p.species === 'dog' ? 'selected' : ''}>Chó</option></select>${err('species')}</label>
      <label class="field"><span>Giới tính</span><select id="p-sex" data-p="sex"><option ${p.sex === 'Cái' ? 'selected' : ''}>Cái</option><option ${p.sex === 'Đực' ? 'selected' : ''}>Đực</option></select>${err('sex')}</label>
      <label class="field"><span>Giống</span><input type="text" id="p-breed" data-p="breed" value="${esc(p.breed)}" placeholder="Ví dụ: Mèo ta"></label>
      <label class="field"><span>Tuổi (tháng)</span><input type="number" id="p-age" data-p="age" min="0" max="300" value="${esc(p.age)}">${err('age')}</label>
      <label class="field"><span>Cân nặng (kg)</span><input type="number" id="p-weight" data-p="weight" min="0.1" step="0.1" value="${esc(p.weight)}">${err('weight')}</label>
      <label class="field"><span>Tiêm phòng</span><input type="text" id="p-vaccine" data-p="vaccine" value="${esc(p.vaccine)}" placeholder="Ví dụ: Đã tiêm 4 bệnh + dại"></label>
      <label class="field full"><span>Tính cách (cách nhau bằng dấu phẩy)</span><input type="text" id="p-traits" data-p="traits" value="${esc(p.traits)}" placeholder="Hiền, Thích được vuốt ve"></label>
      <label class="field full"><span>Lịch sử cứu hộ</span><textarea id="p-story" data-p="story">${esc(p.story)}</textarea></label>
      <label class="field full"><span>Link video (YouTube, Facebook, Google Drive…)</span><input type="text" id="p-video" data-p="video" value="${esc(p.video)}" placeholder="https://">${err('video')}</label>
      <label class="check"><input type="checkbox" id="p-neutered" data-p="neutered" ${p.neutered ? 'checked' : ''}>Đã triệt sản</label>
      <label class="check"><input type="checkbox" id="p-published" data-p="published" ${p.published ? 'checked' : ''}>Hiện trên website</label>
      <label class="check"><input type="checkbox" id="p-adopted" data-p="adopted" ${p.adopted ? 'checked' : ''}>Đã có nhà</label>
      <div class="field full"><span>Ảnh (tối đa 10 ảnh, JPG/PNG/WEBP, mỗi ảnh tối đa 3 MB)</span>
        <div class="photos">${p.photos.map(u => `<figure class="${p.remove.includes(u) ? 'removed' : ''}"><img src="${esc(u)}" alt=""><button type="button" data-act="photoremove" data-u="${esc(u)}">${p.remove.includes(u) ? 'Giữ lại' : 'Xóa'}</button></figure>`).join('')}
          ${p.newFiles.map((f, i) => `<figure><img src="${f.url}" alt=""><button type="button" data-act="photodrop" data-i="${i}">Bỏ</button></figure>`).join('')}</div>
        <input type="file" id="p-files" accept="image/jpeg,image/png,image/webp" multiple>${err('photos')}</div>
    </div>
    ${e._ ? `<p class="err">${esc(e._)}</p>` : ''}
    <div class="nav-steps"><button class="btn ghost" data-act="petcancel">Hủy</button><button class="btn" data-act="petsave">Lưu hồ sơ</button></div></section>`;
}
function vPets() {
  return `${UI.petForm ? petFormHtml() : `<div class="nav-steps" style="margin:0 0 12px"><span class="meta">${D.pets.length} bé trong hệ thống</span><button class="btn" data-act="petnew">Thêm bé mới</button></div>`}
    <section class="panel"><h2>Danh sách các bé</h2><div class="scroll"><table><thead><tr><th>Bé</th><th>Thông tin</th><th>Trạm</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${D.pets.length ? D.pets.map(p => `<tr>
      <td><b>${esc(p.name)}</b><br><small class="meta">${p.photos.length} ảnh${p.video ? ', có video' : ''}</small></td>
      <td>${species(p.species)}${p.breed ? ', ' + esc(p.breed) : ''}<br><small class="meta">${p.sex}, ${ageText(p.age)}, ${kg(p.weight)}</small></td>
      <td>${esc(station(p.station).name)}</td>
      <td><span class="pill ${p.state}">${STATE_LABEL[p.state]}</span>${p.published ? '' : '<br><small class="meta">Đang ẩn</small>'}</td>
      <td><button class="btn small ghost" data-act="petedit" data-id="${p.id}">Sửa</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="meta">Chưa có bé nào. Bấm "Thêm bé mới" để nhập hồ sơ đầu tiên.</td></tr>'}
    </tbody></table></div></section>`;
}

function stationForm(s, isNew) {
  const e = isNew ? UI.stationErr : {};
  return `<section class="panel" data-station="${isNew ? '' : esc(s.id)}"><h2>${isNew ? 'Thêm trạm mới' : esc(s.name)}</h2>
    <div class="form-grid">
      <label class="field"><span>Mã trạm</span><input type="text" data-st="id" value="${esc(s.id || '')}" ${isNew ? '' : 'readonly'} placeholder="Ví dụ: VML"><span class="err">${esc(e.id || '')}</span></label>
      <label class="field"><span>Tên trạm</span><input type="text" data-st="name" value="${esc(s.name || '')}"><span class="err">${esc(e.name || '')}</span></label>
      <label class="field"><span>Khu vực</span><input type="text" data-st="area" value="${esc(s.area || 'TP.HCM')}"></label>
      <label class="field"><span>Số điện thoại</span><input type="tel" data-st="phone" value="${esc(s.phone || '')}"></label>
      <label class="field full"><span>Địa chỉ đón bé</span><input type="text" data-st="address" value="${esc(s.address || '')}" placeholder="Số nhà, đường, phường, quận"></label>
      <label class="field"><span>Trang Facebook</span><input type="text" data-st="facebook" value="${esc(s.facebook || '')}" placeholder="https://"><span class="err">${esc(e.facebook || '')}</span></label>
      <label class="field"><span>Email trạm</span><input type="email" data-st="email" value="${esc(s.email || '')}"><span class="err">${esc(e.email || '')}</span></label>
    </div>
    <div class="nav-steps"><span></span><button class="btn" data-act="stationsave">${isNew ? 'Thêm trạm' : 'Lưu trạm'}</button></div></section>`;
}
function vStations() {
  return D.stations.map(s => stationForm(s, false)).join('') + stationForm({}, true);
}

/* ---------- actions ---------- */
function newPetForm(p) {
  UI.petErr = {};
  UI.petForm = p ? { id: p.id, name: p.name, station: p.station, species: p.species, sex: p.sex, breed: p.breed, age: p.age, weight: p.weight, vaccine: p.vaccine,
    traits: p.traits.join(', '), story: p.story, video: p.video || '', neutered: p.neutered, published: p.published, adopted: p.state === 'adopted', photos: p.photos, remove: [], newFiles: [] }
    : { name: '', station: D.stations[0] ? D.stations[0].id : '', species: 'cat', sex: 'Cái', breed: '', age: '', weight: '', vaccine: '', traits: '', story: '', video: '', neutered: false, published: true, adopted: false, photos: [], remove: [], newFiles: [] };
}
async function savePet(btn) {
  const p = UI.petForm;
  if (p.photos.length - p.remove.length + p.newFiles.length > 10) { UI.petErr = { photos: 'Mỗi bé tối đa 10 ảnh.' }; render(); return; }
  await busy(btn, async () => {
    try {
      const newPhotos = [];
      for (const f of p.newFiles) newPhotos.push(await fileToPayload(f.file));
      await call('POST', 'admin/pets/save', { pet: { ...p, newFiles: undefined, photos: undefined }, newPhotos, removePhotos: p.remove });
      p.newFiles.forEach(f => URL.revokeObjectURL(f.url));
      toast('Đã lưu hồ sơ ' + p.name);
      UI.petForm = null;
      await refresh();
    } catch (e) { UI.petErr = { ...(e.fields || {}), _: e.message }; render(); }
  });
}

document.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if (e.target.id === 'loginform') {
    await busy(btn, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: document.getElementById('lemail').value.trim(), password: document.getElementById('lpw').value });
      if (error) renderLogin(error.message === 'Invalid login credentials' ? 'Email hoặc mật khẩu chưa đúng.' : error.message);
      else await enter();
    });
  } else if (e.target.id === 'pwform') {
    await busy(btn, async () => {
      const { error } = await sb.auth.updateUser({ password: document.getElementById('newpw').value });
      if (error) renderLogin(error.message);
      else { recovery = false; history.replaceState(null, '', location.pathname); toast('Đã lưu mật khẩu mới.'); await enter(); }
    });
  }
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'forgot') {
    const email = document.getElementById('lemail').value.trim();
    if (!email) { renderLogin('Nhập email trước, rồi bấm "Quên mật khẩu".'); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    renderLogin('Nếu email này có tài khoản, một link đặt lại mật khẩu đã được gửi tới hộp thư.');
    return;
  }
  if (a === 'logout') { await sb.auth.signOut(); D = null; me = null; renderLogin(); return; }
  if (a === 'refresh') { await busy(el, refresh); return; }
  if (a === 'tab') { UI.tab = el.dataset.k; render(); return; }
  if (a === 'petnew') { newPetForm(null); render(); return; }
  if (a === 'petedit') { newPetForm(D.pets.find(p => p.id === id)); render(); document.getElementById('petform').scrollIntoView(); return; }
  if (a === 'petcancel') { UI.petForm.newFiles.forEach(f => URL.revokeObjectURL(f.url)); UI.petForm = null; render(); return; }
  if (a === 'photoremove') { const u = el.dataset.u, r = UI.petForm.remove; UI.petForm.remove = r.includes(u) ? r.filter(x => x !== u) : [...r, u]; render(); return; }
  if (a === 'photodrop') { const [f] = UI.petForm.newFiles.splice(+el.dataset.i, 1); URL.revokeObjectURL(f.url); render(); return; }
  if (a === 'petsave') { await savePet(el); return; }
  if (a === 'stationsave') {
    const box = el.closest('[data-station]'), isNew = !box.dataset.station;
    const s = {};
    box.querySelectorAll('[data-st]').forEach(x => { s[x.dataset.st] = x.value; });
    await busy(el, async () => {
      try { await call('POST', 'admin/stations/save', { station: s }); toast('Đã lưu trạm ' + s.name); if (isNew) UI.stationErr = {}; await refresh(); }
      catch (err) { if (isNew) { UI.stationErr = err.fields || {}; render(); } toast(err.message); }
    });
    return;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.p && UI.petForm) UI.petForm[t.dataset.p] = t.type === 'checkbox' ? t.checked : t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.p && UI.petForm) UI.petForm[t.dataset.p] = t.type === 'checkbox' ? t.checked : t.value;
  if (t.id === 'p-files' && UI.petForm) {
    const bad = [];
    [...t.files].forEach(f => {
      if (!PHOTO_TYPES.includes(f.type) || f.size > FILE_MAX) bad.push(f.name);
      else UI.petForm.newFiles.push({ file: f, url: URL.createObjectURL(f) });
    });
    UI.petErr = bad.length ? { photos: 'Bỏ qua ' + bad.join(', ') + ': chỉ nhận ảnh JPG, PNG, WEBP tối đa 3 MB.' } : {};
    render();
  }
});

start();
