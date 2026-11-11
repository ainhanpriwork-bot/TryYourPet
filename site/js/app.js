// Customer page: browse pets, hold them in "Nhà của tôi", apply to adopt.
// All data comes from the API; only the visitor id and an unsent form draft stay in this browser.
import {
  HOLD_DAYS, MAX_PETS, COMMITS, DISTRICTS, OUTSIDE, WEEKDAYS,
  EMAIL_RE, questionsFor, validateCustomer, validateAnswers, evaluateFlags, normEmail
} from './rules.js';
import { esc, fmtDT, fmtDay, dayChip, ageText, kg, species, art, toast, api, busy, store } from './ui.js';

const app = document.getElementById('app');
const VISITOR = (() => {
  let v = store.get('typ-visitor', null);
  if (!v || !/^[A-Za-z0-9-]{16,64}$/.test(v)) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2) + 'abcdefgh'); store.set('typ-visitor', v); }
  return v;
})();

const S = {
  view: 'list', step: 1, filters: { species:'all', breed:'all', sex:'all', weight:'all' },
  draft: store.get('typ-draft', { answers:{}, commits:{} }),
  lastOrder: null
};
S.draft.answers = S.draft.answers || {}; S.draft.commits = {};
let C = null;            // catalog from the API
let loadError = '';
let errors = {};
let gallerySel = 0, openPetId = null;

const saveDraft = () => store.set('typ-draft', { ...S.draft, commits: {} });

/* ---------- data ---------- */
async function load() {
  try { C = await api('GET', 'catalog?visitor=' + encodeURIComponent(VISITOR)); loadError = ''; }
  catch (e) { loadError = e.message; }
  render();
}
const pet = id => C.pets.find(p => p.id === id);
const station = id => C.stations.find(s => s.id === id) || { name: 'Trạm cứu hộ', area: '', address: '' };
const myHolds = () => (C ? C.myHolds : []).filter(h => pet(h.petId));
const STATE_LABEL = { available:'Đang tìm nhà', mine:'Trong nhà bạn', held:'Đã có người đăng ký', adopted:'Đã có nhà' };
const fbLink = st => st.facebook ? `<br><a href="${esc(st.facebook)}" target="_blank" rel="noopener">Trang Facebook của trạm</a>` : '';
const addrText = st => st.address ? st.address : 'trạm sẽ báo địa chỉ qua email hoặc điện thoại';

/* ---------- shell ---------- */
function renderNav() {
  const n = myHolds().length, v = S.view;
  document.getElementById('nav').innerHTML = `
    <button data-act="go" data-view="list" aria-current="${v === 'list'}">Thú cưng</button>
    <button data-act="go" data-view="home" aria-current="${v === 'home' || v === 'checkout'}">Nhà của tôi <span class="count" aria-label="${n} bé">${n}</span></button>`;
}
function render() {
  renderNav();
  if (!C) {
    app.innerHTML = loadError
      ? `<div class="empty"><img class="mascot-empty" src="assets/dog-grumpy.png" alt="">${esc(loadError)} <button class="btn small" data-act="reload">Thử lại</button></div>`
      : '<p class="loading">Đang tải danh sách các bé…</p>';
    return;
  }
  ({ list:viewList, home:viewHome, checkout:viewCheckout, done:viewDone })[S.view]();
}

/* ---------- list ---------- */
function filtered() {
  const f = S.filters;
  return C.pets.filter(p =>
    (f.species === 'all' || p.species === f.species) && (f.breed === 'all' || p.breed === f.breed) && (f.sex === 'all' || p.sex === f.sex) &&
    (f.weight === 'all' || ({ s:p.weight < 5, m:p.weight >= 5 && p.weight < 10, l:p.weight >= 10 && p.weight < 20, xl:p.weight >= 20 })[f.weight]));
}
function cardActions(p) {
  if (p.state === 'available') return `<button class="btn small add" data-act="add" data-id="${p.id}">Thêm vào nhà</button>`;
  if (p.state === 'mine') return `<button class="btn small ghost" data-act="go" data-view="home">Xem trong nhà</button>`;
  return `<button class="btn small" disabled>${p.state === 'adopted' ? 'Đã có nhà' : 'Đã được đăng ký'}</button>`;
}
function viewList() {
  const f = S.filters, list = filtered();
  const breeds = [...new Set(C.pets.filter(p => f.species === 'all' || p.species === f.species).map(p => p.breed).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const waiting = C.pets.filter(p => p.state !== 'adopted').length;
  app.innerHTML = `
  <section class="hero">
    <div class="hero-text">
      <h1>Anh Chị tới, <em>thương bé cả đời!</em></h1>
      <p class="lead">TryYourPet là dự án phi lợi nhuận kết nối các trạm cứu hộ với cộng đồng nhằm tìm mái nhà phù hợp cho các bé chó, mèo trên khu vực TP.HCM thông qua hệ thống nhận nuôi.</p>
      <div class="hero-cta"><button class="btn add" data-act="scrollpets">Xem ${waiting} bé đang chờ</button></div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <img class="bone" src="assets/bone.png" alt="">
      <svg class="burst" viewBox="0 0 100 100"><path d="M50 2 61 30 92 18 74 45 98 62 67 66 70 98 50 74 30 98 33 66 2 62 26 45 8 18 39 30Z" fill="#FA5A2C"/></svg>
      <img class="ball" src="assets/ball.png" alt="">
      <img class="m1" src="assets/dog-sit.png" alt="">
      <img class="m2" src="assets/cat-walk.png" alt="">
    </div>
  </section>
  <ol class="flow" aria-label="Các bước nhận nuôi">
    <li><b>Chọn bé hợp với bạn</b>Xem hồ sơ, ảnh và video của từng bé</li>
    <li><b>Thêm bé vào nhà</b>Bé được giữ cho bạn ${HOLD_DAYS} ngày, tối đa ${MAX_PETS} bé</li>
    <li><b>Kể về bạn</b>Xác thực email và trả lời vài câu hỏi</li>
    <li><b>Hẹn ngày đón bé</b>Đón bé tại trạm cứu hộ</li>
  </ol>
  <div class="filters" role="search" id="pets">
    <div class="field"><span>Loài</span>
      <div class="seg">${[['all','Tất cả'],['dog','Chó'],['cat','Mèo']].map(([k, l]) => `<button data-act="filter" data-k="species" data-v="${k}" aria-pressed="${f.species === k}">${l}</button>`).join('')}</div></div>
    <label class="field"><span>Giống</span><select id="f-breed" data-filter="breed"><option value="all">Tất cả giống</option>${breeds.map(b => `<option ${f.breed === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    <label class="field"><span>Giới tính</span><select id="f-sex" data-filter="sex">${[['all','Tất cả'],['Đực','Đực'],['Cái','Cái']].map(([k, l]) => `<option value="${k}" ${f.sex === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Cân nặng</span><select id="f-weight" data-filter="weight">${[['all','Tất cả'],['s','Dưới 5 kg'],['m','5–10 kg'],['l','10–20 kg'],['xl','Trên 20 kg']].map(([k, l]) => `<option value="${k}" ${f.weight === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <span class="result-count">${list.length} bé phù hợp</span>
  </div>
  ${!C.pets.length ? `<div class="empty"><img class="mascot-empty" src="assets/cat-sleep.png" alt="">Các trạm đang cập nhật hồ sơ các bé. Bạn quay lại sau nhé.</div>`
  : list.length ? `<div class="grid">${list.map(p => `<article class="card">
      <button class="pic" data-act="detail" data-id="${p.id}" aria-label="Xem hồ sơ ${esc(p.name)}">${art(p)}${p.state !== 'available' ? `<span class="pill ${p.state}">${STATE_LABEL[p.state]}</span>` : ''}</button>
      <div class="body">
        <h3>${esc(p.name)}</h3>
        <p class="meta">${esc(p.breed || species(p.species))}, ${esc(station(p.station).name)}</p>
        <ul class="vitals" aria-label="Giới tính, tuổi, cân nặng"><li>${p.sex}</li><li>${ageText(p.age)}</li><li>${kg(p.weight)}</li></ul>
        <div class="tags"><span class="tag ${p.neutered ? 'yes' : ''}">${p.neutered ? 'Đã triệt sản' : 'Chưa triệt sản'}</span>${p.vaccine ? `<span class="tag yes">${esc(p.vaccine.split(' (')[0].split(',')[0])}</span>` : ''}</div>
        <div class="actions"><button class="btn small ghost" data-act="detail" data-id="${p.id}">Xem hồ sơ</button>${cardActions(p)}</div>
      </div></article>`).join('')}</div>`
  : `<div class="empty"><img class="mascot-empty" src="assets/dog-surprised.png" alt="">Chưa có bé nào khớp bộ lọc. <button class="btn small ghost" data-act="clearfilter">Xóa bộ lọc</button></div>`}`;
}

/* ---------- pet detail ---------- */
function renderDetail() {
  const p = pet(openPetId), m = document.getElementById('modal');
  if (!p) { closeModal(); return; }
  const n = Math.max(1, p.photos.length), st = station(p.station);
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Hồ sơ ${esc(p.name)}">
    <button class="x" data-act="close" aria-label="Đóng">×</button>
    <div class="gallery">
      <div class="gallery-main">${art(p, Math.min(gallerySel, n - 1))}</div>
      ${n > 1 ? `<div class="thumbs">${p.photos.map((_, i) => `<button class="thumb" data-act="gal" data-i="${i}" aria-pressed="${gallerySel === i}" aria-label="Ảnh ${i + 1}">${art(p, i)}</button>`).join('')}</div>` : ''}
      ${p.video ? `<a class="btn ghost small video-link" href="${esc(p.video)}" target="_blank" rel="noopener">▶ Xem video của ${esc(p.name)}</a>` : ''}
    </div>
    <div class="info">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>${esc(p.name)}</h2><span class="pill ${p.state}">${STATE_LABEL[p.state]}</span></div>
      <dl class="facts">
        <dt>Loài, giống</dt><dd>${species(p.species)}${p.breed ? ', ' + esc(p.breed) : ''}</dd>
        <dt>Giới tính</dt><dd>${p.sex}</dd>
        <dt>Tuổi</dt><dd>${ageText(p.age)}</dd>
        <dt>Cân nặng</dt><dd>${kg(p.weight)}</dd>
        <dt>Tiêm phòng</dt><dd>${esc(p.vaccine || 'Đang cập nhật')}</dd>
        <dt>Triệt sản</dt><dd>${p.neutered ? 'Đã triệt sản' : 'Chưa triệt sản'}</dd>
        <dt>Trạm chăm sóc</dt><dd>${esc(st.name)}${st.area ? ', ' + esc(st.area) : ''}${fbLink(st)}</dd>
      </dl>
      ${p.traits.length ? `<div><p class="section-label">Tính cách</p><div class="tags" style="margin-top:6px">${p.traits.map(t => `<span class="tag yes">${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${p.story ? `<div><p class="section-label">Lịch sử cứu hộ</p><p class="story" style="margin-top:6px">${esc(p.story)}</p></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${cardActions(p)}</div>
      ${p.state === 'available' ? `<p class="hint">Khi thêm vào nhà, bé được giữ cho bạn ${HOLD_DAYS} ngày. Sau thời gian đó nếu chưa gửi đơn, bé tự động được nhả.</p>` : ''}
    </div></div>`;
  m.hidden = false;
}
function closeModal() { const m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; openPetId = null; }

/* ---------- home ---------- */
function holdLeft(until) {
  const msLeft = until - Date.now(), d = Math.max(0, Math.floor(msLeft / 864e5)), h = Math.max(0, Math.floor((msLeft % 864e5) / 3600e3));
  return `Giữ chỗ đến ${fmtDT(until)}, còn ${d ? d + ' ngày ' : ''}${h} giờ`;
}
function viewHome() {
  const hs = myHolds();
  app.innerHTML = `<div class="two">
    <section class="panel">
      <h2>Nhà của tôi</h2>
      <p class="meta" style="margin:4px 0 8px">${hs.length}/${MAX_PETS} bé trong đơn này</p>
      ${hs.length ? hs.map(h => { const p = pet(h.petId); return `<div class="row-pet">
        <div class="mini">${art(p)}</div>
        <div><h3>${esc(p.name)}</h3><p class="meta">${esc(p.breed || species(p.species))}, ${p.sex.toLowerCase()}, ${ageText(p.age)}</p><span class="hold">${holdLeft(h.expiresAt)}</span></div>
        <button class="btn danger small" data-act="remove" data-id="${p.id}">Bỏ khỏi nhà</button></div>`; }).join('')
      : `<div class="empty"><img class="mascot-empty" src="assets/cat-sleep.png" alt="">Nhà bạn đang trống. <button class="btn small" data-act="go" data-view="list">Xem các bé đang tìm nhà</button></div>`}
    </section>
    <aside class="panel">
      <h3>Trước khi gửi đơn</h3>
      <ul class="rules" style="margin-top:10px">
        <li>Mỗi đơn nhận tối đa ${MAX_PETS} bé, các bé cần ở cùng một trạm.</li>
        <li>Bé được giữ ${HOLD_DAYS} ngày kể từ lúc thêm vào nhà.</li>
        <li>Bạn cần xác thực email. Người nhận nuôi phải đủ 18 tuổi.</li>
        <li>Đơn trả lời đạt các câu sàng lọc sẽ được xác nhận ngay. Đơn khác được quản trị viên xem lại.</li>
        <li>Không thể tự đổi hoặc hủy lịch. Không đến đúng hẹn thì đơn bị hủy và bé được nhả.</li>
      </ul>
      <button class="btn" style="width:100%;margin-top:16px" data-act="startcheckout" ${hs.length ? '' : 'disabled'}>Tiếp tục: xác nhận thông tin</button>
    </aside></div>`;
}

/* ---------- checkout ---------- */
const STEPS = ['Thông tin cá nhân', 'Câu hỏi sàng lọc', 'Lịch đón bé', 'Xem lại & cam kết'];
const hasCat = () => myHolds().some(h => pet(h.petId).species === 'cat');
const verified = () => !!S.draft.emailToken && S.draft.verifiedEmail === normEmail(S.draft.email);
function inp(id, label, type = 'text', extra = '', full = false) {
  return `<label class="field ${full ? 'full' : ''}"><span>${label}</span><input id="d-${id}" type="${type}" data-f="${id}" value="${esc(S.draft[id] || '')}" ${extra}><span class="err">${esc(errors[id] || '')}</span></label>`;
}
function viewCheckout() {
  const hs = myHolds();
  if (!hs.length) { S.view = 'home'; return render(); }
  const d = S.draft, step = S.step, st = station(pet(hs[0].petId).station);
  let body = '';
  if (step === 1) {
    body = `<h2>Thông tin người nhận nuôi</h2><p class="meta" style="margin:4px 0 16px">Chỉ thu những thông tin cần cho việc giao nhận và đối chiếu khi bạn đến nhận bé.</p>
    <div class="form-grid">
      ${inp('name', 'Họ và tên', 'text', 'autocomplete="name"')}
      ${inp('phone', 'Số điện thoại', 'tel', 'autocomplete="tel" inputmode="tel" placeholder="09xx xxx xxx"')}
      ${inp('job', 'Nghề nghiệp')}
      ${inp('address', 'Số nhà, đường, phường', 'text', 'autocomplete="street-address"', true)}
      <label class="field full"><span>Quận / huyện</span><select id="d-district" data-f="district"><option value="">Chọn quận / huyện</option>${DISTRICTS.map(x => `<option ${d.district === x ? 'selected' : ''}>${x}</option>`).join('')}<option ${d.district === OUTSIDE ? 'selected' : ''}>${OUTSIDE}</option></select><span class="err">${esc(errors.district || '')}</span></label>
      <label class="check full"><input type="checkbox" id="d-adult" data-adult ${d.adult ? 'checked' : ''}>Tôi xác nhận đã đủ 18 tuổi.<span class="err">${esc(errors.adult || '')}</span></label>
      <div class="field full"><span>Email (để nhận mã xác thực và xác nhận đơn)</span>
        <div class="otp">
          <label class="field"><input id="d-email" type="email" data-f="email" value="${esc(d.email || '')}" autocomplete="email" aria-label="Email" ${verified() ? 'readonly' : ''}></label>
          ${verified() ? `<span class="verified">Đã xác thực</span> <button class="btn ghost small" data-act="unverify">Đổi email</button>` : `<button class="btn ghost" data-act="sendotp">${d.codeSent ? 'Gửi lại mã' : 'Gửi mã xác thực'}</button>`}
        </div>
        ${!verified() && d.codeSent ? `<div class="otp" style="margin-top:8px"><label class="field"><span>Mã 6 số trong email</span><input id="d-otp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" data-f="otp" value="${esc(d.otp || '')}"></label><button class="btn" data-act="verify">Xác thực</button></div>
          <p class="hint" style="margin-top:6px">Không thấy email? Kiểm tra thư mục Spam hoặc Quảng cáo.</p>` : ''}
        <span class="err">${esc(errors.email || '')}</span>
      </div>
    </div>`;
  } else if (step === 2) {
    body = `<h2>Câu hỏi sàng lọc</h2><p class="meta" style="margin:4px 0 6px">Giúp trạm chắc rằng bé hợp với nhà bạn. Không có câu trả lời nào loại bạn ngay, một số câu sẽ chuyển đơn sang quản trị viên xem lại.</p>
    ${questionsFor(hasCat()).map(q => `<fieldset class="q"><legend>${q.t}</legend><div class="choices">${q.opts.map(([k, l]) => `<label class="choice"><input type="radio" name="q-${q.id}" data-q="${q.id}" value="${k}" ${d.answers[q.id] === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
      ${q.id === 'cannot' && d.answers.cannot === 'other' ? `<textarea id="q-cannot-text" data-qt="cannotText" placeholder="Bạn dự định thế nào?">${esc(d.answers.cannotText || '')}</textarea>` : ''}
      <span class="err">${esc(errors['q-' + q.id] || '')}</span></fieldset>`).join('')}
    <div class="q"><label class="field"><span class="qt" style="font-size:15px;color:var(--ink);letter-spacing:0">Khi bạn đi vắng hoặc về quê, ai sẽ chăm bé?</span><textarea id="q-care" data-qt="care" placeholder="Ví dụ: gửi bố mẹ ở cùng quận, hoặc gửi khách sạn thú cưng">${esc(d.answers.care || '')}</textarea><span class="err">${esc(errors['q-care'] || '')}</span></label></div>`;
  } else if (step === 3) {
    const day = C.days.find(x => x.date === d.date);
    body = `<h2>Chọn lịch đón bé tại trạm</h2>
    <div class="callout info" style="margin-top:12px">Đón bé tại: <b>${esc(st.name)}</b>, ${esc(addrText(st))}. Nhớ mang theo giấy tờ tùy thân có ảnh.</div>
    <div class="q"><span class="qt">Ngày đón</span><div class="days">${C.days.map(x => { const c = dayChip(x.date); return `<button class="day" data-act="pickday" data-k="${x.date}" aria-pressed="${d.date === x.date}">${c.wd}<b>${c.dm}</b></button>`; }).join('')}</div>
      <p class="hint">Trạm nhận khách ${C.settings.openDays.slice().sort().map(x => WEEKDAYS[x]).join(', ')}. Bạn chọn được lịch trong ${C.days.length} ngày mở cửa tới.</p></div>
    <div class="q"><span class="qt">Khung giờ</span>
      ${day ? `<div class="slots">${day.slots.map(s => `<button class="slot" data-act="pickslot" data-k="${s.id}" aria-pressed="${d.slot === s.id}" ${s.left <= 0 ? 'disabled' : ''}><b>${s.label}</b><small>${s.left > 0 ? 'Còn ' + s.left + '/' + s.capacity + ' chỗ' : 'Đã kín'}</small></button>`).join('')}</div>` : '<p class="hint">Chọn ngày trước để xem khung giờ còn trống.</p>'}
      <span class="err">${esc(errors.slot || '')}</span></div>
    <div class="callout warn">Lịch đã chọn không thể tự đổi hoặc hủy. Nếu bạn không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.</div>`;
  } else {
    const flags = evaluateFlags(d.answers, hasCat());
    const day = C.days.find(x => x.date === d.date), slot = day && day.slots.find(s => s.id === d.slot);
    body = `<h2>Xem lại và cam kết</h2>
    <dl class="review-list" style="margin-top:12px">
      <dt>Họ tên</dt><dd>${esc(d.name)}</dd><dt>Điện thoại</dt><dd>${esc(d.phone)}</dd><dt>Email</dt><dd>${esc(d.email)}</dd>
      <dt>Địa chỉ</dt><dd>${esc(d.address)}, ${esc(d.district)}</dd><dt>Nghề nghiệp</dt><dd>${esc(d.job)}</dd>
      <dt>Nơi đón bé</dt><dd>${esc(st.name)}</dd><dt>Lịch đón</dt><dd>${d.date ? fmtDay(d.date) : ''}, ${slot ? slot.label : ''}</dd>
    </dl>
    <div class="q" style="margin-top:8px"><span class="qt">Cam kết của người nhận nuôi</span>
      ${COMMITS.map((c, i) => `<label class="check"><input type="checkbox" id="c-${i}" data-c="${i}" ${d.commits[i] ? 'checked' : ''}>${c}</label>`).join('')}
      <span class="err">${esc(errors.commits || '')}</span></div>
    ${flags.length ? `<div class="callout warn"><b>Đơn sẽ được quản trị viên xem lại</b> vì: ${flags.map(esc).join('; ')}. Bé vẫn được giữ cho bạn đến hết lịch hẹn, bạn sẽ nhận kết quả qua email.</div>`
      : `<div class="callout ok"><b>Đơn của bạn đạt các tiêu chí.</b> Đơn sẽ được xác nhận ngay khi gửi.</div>`}
    ${errors._ ? `<p class="err" style="margin-top:8px">${esc(errors._)}</p>` : ''}`;
  }
  app.innerHTML = `<ol class="stepper">${STEPS.map((s, i) => `<li ${i + 1 === step ? 'aria-current="step"' : ''} class="${i + 1 < step ? 'done' : ''}">${i + 1}. ${s}</li>`).join('')}</ol>
  <div class="two">
    <section class="panel">${body}
      <div class="nav-steps"><button class="btn ghost" data-act="back">${step === 1 ? 'Quay lại nhà của tôi' : 'Quay lại'}</button>
      <button class="btn" data-act="next">${step === 4 ? 'Gửi đơn nhận nuôi' : 'Tiếp tục'}</button></div>
    </section>
    <aside class="panel summary"><h3>Các bé trong đơn</h3>
      ${hs.map(h => { const p = pet(h.petId); return `<div class="row-pet"><div class="mini">${art(p)}</div><div><b>${esc(p.name)}</b><p class="meta">${esc(p.breed || species(p.species))}, ${esc(station(p.station).name)}</p><span class="hold">Giữ đến ${fmtDT(h.expiresAt)}</span></div></div>`; }).join('')}
    </aside></div>`;
}
function validateStep(step) {
  const d = S.draft;
  errors = {};
  if (step === 1) {
    errors = validateCustomer(d);
    if (!verified()) errors.email = errors.email || 'Xác thực email trước khi tiếp tục.';
  } else if (step === 2) errors = validateAnswers(d.answers, hasCat());
  else if (step === 3) {
    const day = C.days.find(x => x.date === d.date), slot = day && day.slots.find(s => s.id === d.slot);
    if (!slot) errors.slot = 'Chọn ngày và khung giờ đón bé.';
    else if (slot.left <= 0) errors.slot = 'Khung giờ này vừa kín, chọn khung khác.';
  } else if (COMMITS.some((_, i) => !d.commits[i])) errors.commits = 'Cần đồng ý tất cả cam kết để gửi đơn.';
  return !Object.keys(errors).length;
}
async function submitOrder() {
  const d = S.draft;
  try {
    const r = await api('POST', 'orders', {
      visitorId: VISITOR, emailToken: d.emailToken, answers: d.answers, date: d.date, slotId: d.slot, commits: COMMITS.map((_, i) => !!d.commits[i]),
      customer: { name: d.name, phone: d.phone, email: d.email, address: d.address, district: d.district, job: d.job, adult: !!d.adult }
    });
    S.lastOrder = r.order;
    S.draft = { ...d, answers: {}, commits: {}, date: null, slot: null };
    saveDraft();
    S.step = 1; S.view = 'done';
    await load();
  } catch (e) {
    errors = { ...(e.fields || {}), _: e.message };
    const f = e.fields || {};
    if (f.name || f.phone || f.job || f.adult || f.address || f.district || f.email) S.step = 1;
    else if (Object.keys(f).some(k => k.startsWith('q-'))) S.step = 2;
    else if (f.slot) { S.step = 3; await load(); return; }
    else if (e.status === 409 || /trống|giữ chỗ/.test(e.message)) { toast(e.message); await load(); return; }
    toast(e.message);
    render();
  }
}

function viewDone() {
  const o = S.lastOrder;
  if (!o) { S.view = 'list'; return render(); }
  const names = o.pets.join(' và ');
  app.innerHTML = `<section class="done panel">
    <img class="mascot-empty" src="assets/${o.status === 'confirmed' ? 'dog-spin' : 'cat-sit'}.png" alt="">
    <span class="pill ${o.status}" style="justify-self:center">${esc(o.statusLabel)}</span>
    <h1>${o.status === 'confirmed' ? 'Hẹn gặp bạn ngày đón <em>' + esc(names) + '</em>' : 'Đã nhận <em>đơn của bạn</em>'}</h1>
    <p>Mã đơn <span class="code">${esc(o.code)}</span></p>
    <dl class="review-list" style="text-align:left;justify-self:center">
      <dt>Lịch đón</dt><dd>${esc(o.dateLabel)}, ${esc(o.slotLabel)}</dd><dt>Nơi đón bé</dt><dd>${esc(o.station.name)}, ${esc(addrText(o.station))}</dd>
      <dt>Mang theo</dt><dd>Giấy tờ tùy thân có ảnh${o.hasCat ? ', lồng hoặc túi vận chuyển cho mèo' : ', dây dắt cho chó'}</dd>
    </dl>
    ${o.status === 'review' ? `<div class="callout warn">Quản trị viên sẽ xem lại đơn và trả lời qua email ${esc(o.email)}. Bé vẫn được giữ cho bạn đến hết lịch hẹn.</div>` : `<div class="callout ok">Email xác nhận đã được gửi tới ${esc(o.email)}.</div>`}
    <p class="hint">Lịch không thể tự đổi hoặc hủy. Nếu không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.</p>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn ghost" data-act="go" data-view="list">Xem thêm các bé</button></div>
  </section>`;
}

/* ---------- events ---------- */
async function addPet(id, btn) {
  await busy(btn, async () => {
    try { const r = await api('POST', 'holds', { visitorId: VISITOR, petId: id }); toast('Đã thêm ' + (r.name || 'bé') + ' vào nhà. Bé được giữ cho bạn ' + HOLD_DAYS + ' ngày.'); }
    catch (e) { toast(e.message); }
  });
  await load();
  if (openPetId) renderDetail();
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'modal') closeModal(); return; }
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'go') { S.view = el.dataset.view; closeModal(); window.scrollTo(0, 0); }
  else if (a === 'reload') { C = null; loadError = ''; render(); return load(); }
  else if (a === 'detail') { openPetId = id; gallerySel = 0; renderDetail(); return; }
  else if (a === 'gal') { gallerySel = +el.dataset.i; renderDetail(); return; }
  else if (a === 'close') { closeModal(); return; }
  else if (a === 'add') { return addPet(id, el); }
  else if (a === 'remove') {
    try { await api('POST', 'holds/remove', { visitorId: VISITOR, petId: id }); toast('Đã bỏ ' + pet(id).name + ' khỏi nhà, bé được nhả cho người khác.'); } catch (err) { toast(err.message); }
    return load();
  }
  else if (a === 'scrollpets') { document.getElementById('pets').scrollIntoView({ behavior: 'smooth' }); return; }
  else if (a === 'filter') { S.filters[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'species') S.filters.breed = 'all'; }
  else if (a === 'clearfilter') { S.filters = { species:'all', breed:'all', sex:'all', weight:'all' }; }
  else if (a === 'startcheckout') { S.view = 'checkout'; S.step = 1; errors = {}; window.scrollTo(0, 0); }
  else if (a === 'sendotp') {
    const em = normEmail(S.draft.email);
    if (!EMAIL_RE.test(em)) { errors.email = 'Email chưa đúng định dạng.'; return render(); }
    await busy(el, async () => {
      try { await api('POST', 'otp/send', { email: em }); S.draft.codeSent = true; errors.email = ''; toast('Đã gửi mã xác thực tới ' + em); }
      catch (err) { errors.email = err.message; }
    });
  }
  else if (a === 'verify') {
    await busy(el, async () => {
      try {
        const r = await api('POST', 'otp/verify', { email: S.draft.email, code: S.draft.otp });
        Object.assign(S.draft, { emailToken: r.token, verifiedEmail: normEmail(S.draft.email), codeSent: false, otp: '' });
        errors.email = ''; saveDraft(); toast('Email đã được xác thực.');
      } catch (err) { errors.email = err.message; }
    });
  }
  else if (a === 'unverify') { S.draft.emailToken = null; S.draft.verifiedEmail = null; saveDraft(); }
  else if (a === 'pickday') { S.draft.date = el.dataset.k; S.draft.slot = null; }
  else if (a === 'pickslot') { S.draft.slot = el.dataset.k; errors.slot = ''; }
  else if (a === 'back') { errors = {}; if (S.step === 1) S.view = 'home'; else S.step--; window.scrollTo(0, 0); }
  else if (a === 'next') {
    if (!validateStep(S.step)) { render(); const f = app.querySelector('.err:not(:empty)'); if (f) f.closest('.field,.q,fieldset')?.scrollIntoView({ block: 'center' }); return; }
    if (S.step < 4) { S.step++; window.scrollTo(0, 0); }
    else { await busy(el, submitOrder); window.scrollTo(0, 0); return; }
  }
  render();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f) { S.draft[t.dataset.f] = t.value; if (t.dataset.f === 'district') render(); else saveDraft(); }
  else if (t.dataset.qt) { S.draft.answers[t.dataset.qt] = t.value; saveDraft(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.filter) { S.filters[t.dataset.filter] = t.value; render(); }
  else if (t.dataset.q) { S.draft.answers[t.dataset.q] = t.value; saveDraft(); render(); }
  else if (t.dataset.c !== undefined) { S.draft.commits[t.dataset.c] = t.checked; }
  else if (t.dataset.adult !== undefined) { S.draft.adult = t.checked; errors.adult = ''; saveDraft(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });

render();
load();
