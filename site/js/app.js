// Customer page: browse pets, then adopt by messaging a fanpage or calling the project.
// All data comes from the API; only the chosen filters live in this page.
import { CONTACT } from './rules.js';
import { esc, ageText, kg, species, art, api } from './ui.js';

const app = document.getElementById('app');
const S = { filters: { species:'all', breed:'all', sex:'all', weight:'all' } };
let C = null;            // catalog from the API
let loadError = '';
let gallerySel = 0, openPetId = null;

/* ---------- data ---------- */
async function load() {
  try { C = await api('GET', 'catalog'); loadError = ''; }
  catch (e) { loadError = e.message; }
  render();
}
const pet = id => C.pets.find(p => p.id === id);
const station = id => C.stations.find(s => s.id === id) || { name: 'Trạm cứu hộ', area: '' };
const STATE_LABEL = { available:'Đang tìm nhà', adopted:'Đã có nhà' };
const fbLink = st => st.facebook ? `<br><a href="${esc(st.facebook)}" target="_blank" rel="noopener">Trang Facebook của trạm</a>` : '';

/** Ways to adopt: message one of the fanpages, or call the project manager. */
function contactBlock(p) {
  const ph = CONTACT.phone;
  return `<div class="contact">
    ${p ? `<p>Muốn đón <b>${esc(p.name)}</b> về nhà? Nhắn tin cho một trong hai fanpage hoặc gọi điện, nhớ nói tên bé để trạm hỗ trợ nhanh hơn.</p>`
        : `<p>Chọn bé bạn thương, rồi nhắn tin cho một trong hai fanpage hoặc gọi điện. Nhớ nói tên bé để trạm hỗ trợ nhanh hơn.</p>`}
    <div class="contact-actions">
      ${CONTACT.fanpages.map(f => `<a class="btn" href="${f.messenger}" target="_blank" rel="noopener">Inbox ${esc(f.name)}</a>`).join('')}
      <a class="btn add" href="tel:${ph.number}">Gọi ${ph.display}</a>
    </div>
    <p class="hint">${CONTACT.fanpages.map(f => `<a href="${f.page}" target="_blank" rel="noopener">Fanpage ${esc(f.name)}</a>`).join(', ')}. Số điện thoại: ${ph.role} ${esc(ph.name)}, <b class="phone">${ph.display}</b>.</p>
  </div>`;
}

/* ---------- list ---------- */
function filtered() {
  const f = S.filters;
  return C.pets.filter(p =>
    (f.species === 'all' || p.species === f.species) && (f.breed === 'all' || p.breed === f.breed) && (f.sex === 'all' || p.sex === f.sex) &&
    (f.weight === 'all' || ({ s:p.weight < 5, m:p.weight >= 5 && p.weight < 10, l:p.weight >= 10 && p.weight < 20, xl:p.weight >= 20 })[f.weight]));
}
function cardActions(p) {
  return p.state === 'adopted'
    ? `<button class="btn small" disabled>Đã có nhà</button>`
    : `<button class="btn small add" data-act="detail" data-id="${p.id}" data-adopt>Nhận nuôi bé</button>`;
}
function render() {
  if (!C) {
    app.innerHTML = loadError
      ? `<div class="empty"><img class="mascot-empty" src="assets/dog-grumpy.png" alt="">${esc(loadError)} <button class="btn small" data-act="reload">Thử lại</button></div>`
      : '<p class="loading">Đang tải danh sách các bé…</p>';
    return;
  }
  const f = S.filters, list = filtered();
  const breeds = [...new Set(C.pets.filter(p => f.species === 'all' || p.species === f.species).map(p => p.breed).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const waiting = C.pets.filter(p => p.state !== 'adopted').length;
  app.innerHTML = `
  <section class="hero">
    <div class="hero-text">
      <h1>Anh Chị tới, <em>thương bé cả đời!</em></h1>
      <p class="lead">TryYourPet là dự án phi lợi nhuận kết nối các trạm cứu hộ với cộng đồng nhằm tìm mái nhà phù hợp cho các bé chó, mèo trên khu vực TP.HCM thông qua hệ thống nhận nuôi.</p>
      <div class="hero-cta"><button class="btn add" data-act="scroll" data-to="pets">Xem ${waiting} bé đang chờ</button><button class="btn ghost on-band" data-act="scroll" data-to="contact">Liên hệ nhận nuôi</button></div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <img class="bone" src="assets/bone.png" alt="">
      <svg class="burst" viewBox="0 0 100 100"><path d="M50 2 61 30 92 18 74 45 98 62 67 66 70 98 50 74 30 98 33 66 2 62 26 45 8 18 39 30Z" fill="#FA5A2C"/></svg>
      <img class="ball" src="assets/ball.png" alt="">
      <img class="m1" src="assets/dog-sit.png" alt="">
      <img class="m2" src="assets/cat-walk.png" alt="">
    </div>
  </section>
  <ol class="flow three" aria-label="Các bước nhận nuôi">
    <li><b>Chọn bé hợp với bạn</b>Xem hồ sơ, ảnh và video của từng bé</li>
    <li><b>Inbox hoặc gọi điện</b>Nhắn fanpage Purr Nature, Try Your Pet hoặc gọi ${CONTACT.phone.display}</li>
    <li><b>Hẹn ngày đón bé</b>Trạm trao đổi với bạn và hẹn ngày đón</li>
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
  : `<div class="empty"><img class="mascot-empty" src="assets/dog-surprised.png" alt="">Chưa có bé nào khớp bộ lọc. <button class="btn small ghost" data-act="clearfilter">Xóa bộ lọc</button></div>`}
  <section class="panel contact-panel" id="contact">
    <h2>Liên hệ <em>nhận nuôi</em></h2>
    ${contactBlock(null)}
  </section>`;
}

/* ---------- pet detail ---------- */
function renderDetail(focusContact) {
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
      ${p.state === 'adopted' ? `<p class="hint">${esc(p.name)} đã có nhà. Bạn xem các bé khác đang chờ nhé.</p>` : `<div id="adopt">${contactBlock(p)}</div>`}
    </div></div>`;
  m.hidden = false;
  if (focusContact) m.querySelector('#adopt')?.scrollIntoView({ block: 'nearest' });
}
function closeModal() { const m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; openPetId = null; }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'modal') closeModal(); return; }
  const a = el.dataset.act;
  if (a === 'reload') { C = null; loadError = ''; render(); load(); }
  else if (a === 'detail') { openPetId = el.dataset.id; gallerySel = 0; renderDetail('adopt' in el.dataset); }
  else if (a === 'gal') { gallerySel = +el.dataset.i; renderDetail(false); }
  else if (a === 'close') closeModal();
  else if (a === 'scroll') document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: 'smooth' });
  else if (a === 'filter') { S.filters[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'species') S.filters.breed = 'all'; render(); }
  else if (a === 'clearfilter') { S.filters = { species:'all', breed:'all', sex:'all', weight:'all' }; render(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.filter) { S.filters[t.dataset.filter] = t.value; render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });

render();
load();
