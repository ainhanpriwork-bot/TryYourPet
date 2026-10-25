// Admin page: sign in with Supabase Auth (email + password); every action goes through /api/admin/*,
// where the server checks the login and the admins list again.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { QUESTIONS, ITEMS, WEEKDAYS, PHOTO_TYPES, FILE_MAX, itemsText, fmtVND } from './rules.js';
import { esc, fmtDT, fmtDay, dayChip, ageText, kg, species, toast, api, fileToPayload, busy } from './ui.js';

const app = document.getElementById('app');
const ORDER_LABEL = { review:'Chờ duyệt', confirmed:'Đã xác nhận', completed:'Đã nhận bé', cancelled:'Đã hủy' };
const SUPPORT_LABEL = { pending:'Chờ nhận', received:'Đã nhận', rejected:'Không khớp' };
const STATE_LABEL = { available:'Đang tìm nhà', held:'Đã có người đăng ký', adopted:'Đã có nhà', mine:'Đang giữ' };
const TABS = [['home','Tổng quan'],['orders','Đơn nhận nuôi'],['supports','Hỗ trợ'],['pets','Thú cưng'],['stations','Trạm'],['settings','Cài đặt lịch'],['emails','Email']];

let sb = null, me = null, D = null, recovery = false;
const UI = { tab: 'home', orderFilter: 'review', open: {}, petForm: null, petErr: {}, stationErr: {} };

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
const petName = id => (D.pets.find(p => p.id === id) || { name: '(đã xóa)' }).name;
const station = id => D.stations.find(s => s.id === id) || { name: id, needs: [] };
const slotLabel = id => (D.slots.find(s => s.id === id) || { label: id }).label;
function targetLabel(t) {
  if (!t || t === 'all') return 'Quỹ chung';
  const [k, v] = t.split(':');
  return k === 'station' ? station(v).name : 'Bé ' + petName(v);
}

function render() {
  if (!D) { app.innerHTML = '<p class="loading">Đang tải…</p>'; return; }
  const reviewN = D.orders.filter(o => o.status === 'review').length, pendingN = D.supports.filter(s => s.status === 'pending').length;
  app.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap"><h1>Quản trị</h1><button class="btn ghost small" data-act="refresh">Tải lại dữ liệu</button></div>
    <nav class="admin-tabs">${TABS.map(([k, l]) => `<button data-act="tab" data-k="${k}" aria-pressed="${UI.tab === k}">${l}${k === 'orders' && reviewN ? ' (' + reviewN + ')' : ''}${k === 'supports' && pendingN ? ' (' + pendingN + ')' : ''}</button>`).join('')}</nav>
    <div id="view">${({ home: vHome, orders: vOrders, supports: vSupports, pets: vPets, stations: vStations, settings: vSettings, emails: vEmails })[UI.tab]()}</div>`;
}

function vHome() {
  const upcoming = D.orders.filter(o => o.status === 'confirmed' && D.days.includes(o.appt_date));
  const active = D.orders.filter(o => o.status === 'confirmed' || o.status === 'review');
  const adopted = D.pets.filter(p => p.state === 'adopted').length;
  return `<div class="kpis">
      <div class="kpi ${active.some(o => o.status === 'review') ? 'attn' : ''}"><b>${D.orders.filter(o => o.status === 'review').length}</b><span>Đơn chờ duyệt</span></div>
      <div class="kpi"><b>${upcoming.length}</b><span>Lịch đón 7 ngày tới</span></div>
      <div class="kpi"><b>${D.holds.length}</b><span>Bé đang trong giỏ của khách</span></div>
      <div class="kpi"><b>${adopted}</b><span>Bé đã có nhà / ${D.pets.length} bé</span></div>
      <div class="kpi ${D.supports.some(s => s.status === 'pending') ? 'attn' : ''}"><b>${D.supports.filter(s => s.status === 'pending').length}</b><span>Hỗ trợ chờ đối soát</span></div>
    </div>
    <section class="panel"><h2>Lịch đón 7 ngày tới</h2><div class="scroll"><table class="cal"><thead><tr><th>Khung giờ</th>${D.days.map(k => { const c = dayChip(k); return `<th>${c.wd} ${c.dm}</th>`; }).join('')}</tr></thead><tbody>
      ${D.slots.map(s => `<tr><th>${esc(s.label)}</th>${D.days.map(k => {
        if (!D.settings.openDays.includes(new Date(k + 'T00:00:00Z').getUTCDay())) return '<td class="closed">Nghỉ</td>';
        const os = active.filter(o => o.appt_date === k && o.slot_id === s.id);
        return `<td>${os.map(o => `<span class="chip ${o.status}">${esc(o.name.split(' ').pop())}, ${o.pet_ids.map(petName).map(esc).join(', ')}</span>`).join('')}<span class="chip free">${s.capacity - os.length > 0 ? 'Trống ' + (s.capacity - os.length) + '/' + s.capacity : 'Kín'}</span></td>`;
      }).join('')}</tr>`).join('')}
    </tbody></table></div></section>`;
}

function answersHtml(o) {
  const a = o.answers || {};
  return QUESTIONS.filter(q => a[q.id]).map(q => `<div><b>${q.t}</b> ${esc((q.opts.find(([k]) => k === a[q.id]) || [, a[q.id]])[1])}</div>`).join('')
    + (a.cannotText ? `<div><b>Phương án khác:</b> ${esc(a.cannotText)}</div>` : '') + (a.care ? `<div><b>Ai chăm bé khi vắng nhà:</b> ${esc(a.care)}</div>` : '');
}
function vOrders() {
  const f = UI.orderFilter, list = D.orders.filter(o => f === 'all' || o.status === f);
  return `<section class="panel"><h2>Đơn nhận nuôi</h2>
    <div class="tabs seg" style="display:inline-flex">${[['review','Chờ duyệt'],['confirmed','Đã xác nhận'],['completed','Đã nhận bé'],['cancelled','Đã hủy'],['all','Tất cả']].map(([k, l]) => `<button data-act="ofilter" data-k="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    <div class="scroll"><table><thead><tr><th>Mã đơn</th><th>Người nhận</th><th>Bé</th><th>Lịch đón</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${list.length ? list.map(o => `<tr>
      <td><b>${esc(o.code)}</b><br><small class="meta">${fmtDT(o.created_at)}</small></td>
      <td>${esc(o.name)}<br><small class="meta">${esc(o.phone)}<br>${esc(o.email)}</small></td>
      <td>${o.pet_ids.map(petName).map(esc).join(', ')}<br><small class="meta">${esc(station(o.station_id).name)}</small></td>
      <td>${fmtDay(o.appt_date)}<br><small class="meta">${esc(slotLabel(o.slot_id))}</small></td>
      <td><span class="pill ${o.status}">${ORDER_LABEL[o.status]}</span>${o.status === 'review' && o.flags.length ? `<br><small class="meta">${o.flags.map(esc).join('; ')}</small>` : ''}${o.cancel_reason ? `<br><small class="meta">${esc(o.cancel_reason)}</small>` : ''}${o.decided_by ? `<br><small class="meta">Xử lý: ${esc(o.decided_by)}</small>` : ''}</td>
      <td><div class="acts">
        ${o.status === 'review' ? `<button class="btn small" data-act="order" data-a="approve" data-id="${o.id}">Duyệt</button><button class="btn small danger" data-act="order" data-a="reject" data-id="${o.id}">Từ chối</button>` : ''}
        ${o.status === 'confirmed' ? `<button class="btn small" data-act="order" data-a="complete" data-id="${o.id}">Đã giao bé</button><button class="btn small danger" data-act="order" data-a="noshow" data-id="${o.id}">Vắng mặt</button>` : ''}
        <button class="btn small ghost" data-act="toggle" data-id="${o.id}">${UI.open[o.id] ? 'Ẩn chi tiết' : 'Chi tiết'}</button></div>
        ${UI.open[o.id] ? `<div class="detail"><div><b>Địa chỉ:</b> ${esc(o.address)}, ${esc(o.district)}</div><div><b>Nghề nghiệp:</b> ${esc(o.job)}</div><div><b>CCCD:</b> ${esc(o.cccd)}</div>${answersHtml(o)}</div>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="6" class="meta">Không có đơn ở trạng thái này.</td></tr>'}
    </tbody></table></div></section>`;
}

function vSupports() {
  return `<section class="panel"><h2>Hỗ trợ từ cộng đồng</h2>
    <p class="hint" style="margin-bottom:8px">Với hỗ trợ bằng tiền: mở minh chứng, đối chiếu với sao kê ${esc(D.bank.bank)} ${esc(D.bank.number)}, rồi bấm "Đã nhận tiền" hoặc "Không khớp".</p>
    <div class="scroll"><table><thead><tr><th>Ngày</th><th>Người hỗ trợ</th><th>Nội dung</th><th>Dành cho</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${D.supports.length ? D.supports.map(s => `<tr>
      <td>${fmtDT(s.created_at)}</td>
      <td>${esc(s.name)}${s.anon ? ' <small class="meta">(ẩn tên công khai)</small>' : ''}<br><small class="meta">${esc(s.email)}${s.phone ? '<br>' + esc(s.phone) : ''}</small></td>
      <td>${s.type === 'cash' ? 'Hiện kim, ' + fmtVND(s.amount) : 'Hiện vật, ' + esc(itemsText(s.items || {}))}${s.method ? `<br><small class="meta">${s.method === 'ship' ? 'Gửi chuyển phát' : 'Mang đến trạm'}</small>` : ''}${s.note ? `<div class="detail">${esc(s.note)}</div>` : ''}</td>
      <td>${esc(targetLabel(s.target))}</td>
      <td><span class="pill ${s.status === 'received' ? 'completed' : s.status === 'rejected' ? 'cancelled' : 'review'}">${SUPPORT_LABEL[s.status]}</span>${s.decided_by ? `<br><small class="meta">Xử lý: ${esc(s.decided_by)}</small>` : ''}</td>
      <td><div class="acts">${s.hasProof ? `<button class="btn small ghost" data-act="proof" data-id="${s.id}">Xem minh chứng</button>` : ''}
        ${s.status === 'pending' ? `<button class="btn small" data-act="support" data-a="received" data-id="${s.id}">${s.type === 'cash' ? 'Đã nhận tiền' : 'Đã nhận đồ'}</button>${s.type === 'cash' ? `<button class="btn small danger" data-act="support" data-a="rejected" data-id="${s.id}">Không khớp</button>` : ''}` : ''}</div></td></tr>`).join('')
    : '<tr><td colspan="6" class="meta">Chưa có lượt hỗ trợ nào.</td></tr>'}
    </tbody></table></div></section>`;
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
      <div class="field full"><span>Ảnh (tối đa 10 ảnh, JPG/PNG/WEBP, mỗi ảnh tối đa 4 MB)</span>
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
      <label class="field full"><span>Địa chỉ đón bé và nhận đồ</span><input type="text" data-st="address" value="${esc(s.address || '')}" placeholder="Số nhà, đường, phường, quận"></label>
      <label class="field"><span>Trang Facebook</span><input type="text" data-st="facebook" value="${esc(s.facebook || '')}" placeholder="https://"><span class="err">${esc(e.facebook || '')}</span></label>
      <label class="field"><span>Email trạm</span><input type="email" data-st="email" value="${esc(s.email || '')}"><span class="err">${esc(e.email || '')}</span></label>
      <div class="field full"><span>Đồ trạm đang cần</span><div class="choices">${ITEMS.map(([k, l]) => `<label class="choice"><input type="checkbox" data-need="${k}" ${(s.needs || []).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    </div>
    <div class="nav-steps"><span></span><button class="btn" data-act="stationsave">${isNew ? 'Thêm trạm' : 'Lưu trạm'}</button></div></section>`;
}
function vStations() {
  return D.stations.map(s => stationForm(s, false)).join('') + stationForm({ needs: [] }, true);
}

function vSettings() {
  return `<section class="panel"><h2>Cài đặt lịch đón bé</h2>
    <p class="section-label">Ngày mở cửa</p>
    <div class="daytoggles" style="margin:6px 0 14px">${[1, 2, 3, 4, 5, 6, 0].map(x => `<label class="choice"><input type="checkbox" data-openday="${x}" ${D.settings.openDays.includes(x) ? 'checked' : ''}>${WEEKDAYS[x]}</label>`).join('')}</div>
    <p class="section-label">Số khách tối đa mỗi khung giờ</p>
    ${D.slots.map(s => `<label class="cap-row"><input type="number" min="0" max="50" data-cap="${esc(s.id)}" value="${s.capacity}"><span>${esc(s.label)}</span></label>`).join('')}
    <div class="nav-steps"><span class="hint">Thay đổi chỉ áp dụng cho lịch đặt mới. Đơn đã đặt giữ nguyên.</span><button class="btn" data-act="settingssave">Lưu cài đặt</button></div></section>`;
}

function vEmails() {
  return `<section class="panel"><h2>20 email gần nhất</h2>
    ${D.emails.length ? D.emails.map(m => `<div class="mail"><b>${esc(m.subject)}</b> ${m.ok ? '' : '<span class="pill cancelled">Gửi lỗi</span>'}<br><small>${esc(m.to_email)}, ${fmtDT(m.created_at)}${m.error ? '<br>' + esc(m.error) : ''}</small></div>`).join('') : '<p class="meta">Chưa gửi email nào.</p>'}</section>`;
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
  if (a === 'ofilter') { UI.orderFilter = el.dataset.k; render(); return; }
  if (a === 'toggle') { UI.open[id] = !UI.open[id]; render(); return; }
  if (a === 'order') {
    const act = el.dataset.a;
    const ask = { reject: 'Từ chối đơn này? Bé sẽ được nhả cho người khác và khách nhận email báo.', noshow: 'Đánh dấu khách vắng mặt? Đơn bị hủy và bé được nhả.', complete: 'Xác nhận đã giao bé cho khách?' }[act];
    if (ask && !confirm(ask)) return;
    await busy(el, async () => { try { await call('POST', 'admin/orders/action', { id, action: act }); toast('Đã cập nhật đơn.'); await refresh(); } catch (err) { toast(err.message); } });
    return;
  }
  if (a === 'support') {
    if (el.dataset.a === 'rejected' && !confirm('Đánh dấu minh chứng không khớp? Người hỗ trợ sẽ nhận email đề nghị gửi lại thông tin.')) return;
    await busy(el, async () => { try { await call('POST', 'admin/supports/action', { id, action: el.dataset.a }); toast('Đã cập nhật.'); await refresh(); } catch (err) { toast(err.message); } });
    return;
  }
  if (a === 'proof') {
    const w = window.open('', '_blank');
    try { const r = await call('GET', 'admin/supports/proof?id=' + encodeURIComponent(id)); if (w) w.location = r.url; else location.href = r.url; }
    catch (err) { if (w) w.close(); toast(err.message); }
    return;
  }
  if (a === 'petnew') { newPetForm(null); render(); return; }
  if (a === 'petedit') { newPetForm(D.pets.find(p => p.id === id)); render(); document.getElementById('petform').scrollIntoView(); return; }
  if (a === 'petcancel') { UI.petForm.newFiles.forEach(f => URL.revokeObjectURL(f.url)); UI.petForm = null; render(); return; }
  if (a === 'photoremove') { const u = el.dataset.u, r = UI.petForm.remove; UI.petForm.remove = r.includes(u) ? r.filter(x => x !== u) : [...r, u]; render(); return; }
  if (a === 'photodrop') { const [f] = UI.petForm.newFiles.splice(+el.dataset.i, 1); URL.revokeObjectURL(f.url); render(); return; }
  if (a === 'petsave') { await savePet(el); return; }
  if (a === 'stationsave') {
    const box = el.closest('[data-station]'), isNew = !box.dataset.station;
    const s = { needs: [...box.querySelectorAll('[data-need]')].filter(x => x.checked).map(x => x.dataset.need) };
    box.querySelectorAll('[data-st]').forEach(x => { s[x.dataset.st] = x.value; });
    await busy(el, async () => {
      try { await call('POST', 'admin/stations/save', { station: s }); toast('Đã lưu trạm ' + s.name); if (isNew) UI.stationErr = {}; await refresh(); }
      catch (err) { if (isNew) { UI.stationErr = err.fields || {}; render(); } toast(err.message); }
    });
    return;
  }
  if (a === 'settingssave') {
    const openDays = [...document.querySelectorAll('[data-openday]')].filter(x => x.checked).map(x => +x.dataset.openday);
    const capacities = Object.fromEntries([...document.querySelectorAll('[data-cap]')].map(x => [x.dataset.cap, +x.value]));
    await busy(el, async () => { try { await call('POST', 'admin/settings', { openDays, capacities }); toast('Đã lưu cài đặt lịch.'); await refresh(); } catch (err) { toast(err.message); } });
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
    UI.petErr = bad.length ? { photos: 'Bỏ qua ' + bad.join(', ') + ': chỉ nhận ảnh JPG, PNG, WEBP tối đa 4 MB.' } : {};
    render();
  }
});

start();
