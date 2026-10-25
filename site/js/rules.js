// Adoption and support rules shared by the browser and the server (Vercel Functions).
// The browser uses them to show errors early; the server re-checks everything before saving.

export const HOLD_DAYS = 7;
export const MAX_PETS = 2;
export const BOOKING_DAYS = 6;           // how many upcoming open days a visitor can book
export const NO_SHOW_GRACE_HOURS = 2;    // an order is cancelled this long after its slot ends
export const MIN_AMOUNT = 10000;
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const FILE_MAX = 3 * 1024 * 1024; // 3 MB: Vercel caps request bodies at 4.5 MB and base64 adds a third
export const VN_OFFSET_H = 7;            // Vietnam is UTC+7 all year

export const BANK = { bank: 'Vietcombank', number: '1026229658', holder: 'DANG HUONG GIANG', role: 'Project Manager TryYourPet', qr: 'assets/vcb-qr.png' };

export const DISTRICTS = ['Quận 1','Quận 3','Quận 4','Quận 5','Quận 6','Quận 7','Quận 8','Quận 10','Quận 11','Quận 12','Q. Bình Tân','Q. Bình Thạnh','Q. Gò Vấp','Q. Phú Nhuận','Q. Tân Bình','Q. Tân Phú','TP. Thủ Đức','H. Bình Chánh','H. Cần Giờ','H. Củ Chi','H. Hóc Môn','H. Nhà Bè'];
export const OUTSIDE = 'Ngoài TP.HCM cũ';
export const WEEKDAYS = ['CN','T2','T3','T4','T5','T6','T7'];

export const QUESTIONS = [
  { id:'exp', t:'Bạn đã từng nuôi chó hoặc mèo chưa?', opts:[['never','Chưa từng'],['past','Đã từng nuôi'],['now','Đang nuôi']] },
  { id:'otherPets', t:'Hiện nhà bạn có thú cưng khác không?', opts:[['none','Không có'],['vac','Có, đã tiêm phòng đủ'],['novac','Có, chưa tiêm phòng đủ']], flag:{ novac:'Thú cưng hiện tại chưa tiêm phòng đủ' } },
  { id:'housing', t:'Bạn đang ở loại nhà nào?', opts:[['own','Nhà riêng của gia đình'],['rent','Nhà thuê nguyên căn'],['apt','Chung cư'],['room','Phòng trọ']] },
  { id:'permit', t:'Chủ nhà hoặc ban quản lý có cho phép nuôi chó mèo không?', opts:[['na','Nhà của tôi, không cần xin phép'],['yes','Có, đã cho phép'],['unsure','Chưa rõ'],['no','Không cho phép']], flag:{ unsure:'Chưa rõ chủ nhà/ban quản lý có cho nuôi', no:'Nơi ở không cho phép nuôi' } },
  { id:'family', t:'Mọi người sống cùng có đồng ý nuôi bé không?', opts:[['yes','Có, mọi người đồng ý'],['alone','Tôi sống một mình'],['no','Chưa thống nhất']], flag:{ no:'Gia đình chưa thống nhất việc nuôi' } },
  { id:'allergy', t:'Trong nhà có ai bị dị ứng lông chó mèo không?', opts:[['no','Không'],['mild','Có, nhẹ và kiểm soát được'],['yes','Có, dị ứng rõ']], flag:{ yes:'Có người dị ứng lông thú' } },
  { id:'alone', t:'Mỗi ngày bé phải ở nhà một mình khoảng bao lâu?', opts:[['lt4','Dưới 4 giờ'],['4to8','4–8 giờ'],['8to10','8–10 giờ'],['gt10','Trên 10 giờ']], flag:{ gt10:'Bé phải ở một mình trên 10 giờ/ngày' } },
  { id:'cats', t:'Cửa sổ và ban công nhà bạn đã có lưới chắn chưa?', onlyCat:true, opts:[['yes','Đã có'],['will','Sẽ lắp trước khi đón bé'],['no','Không định lắp']], flag:{ no:'Không lắp lưới chắn cho mèo' } },
  { id:'budget', t:'Bạn sẵn sàng dành khoảng 500.000–1.000.000đ/tháng cho thức ăn, cát, thú y?', opts:[['yes','Sẵn sàng'],['unsure','Chưa chắc'],['no','Không']], flag:{ no:'Chưa sẵn sàng chi phí nuôi' } },
  { id:'cannot', t:'Nếu sau này không thể nuôi tiếp, bạn sẽ làm gì?', opts:[['return','Liên hệ trạm để trả bé về'],['rehome','Tự tìm người nhận, báo trạm trước'],['other','Khác']], flag:{ other:'Phương án khi không nuôi tiếp cần trao đổi thêm' } }
];

export const COMMITS = [
  'Không xích hoặc nhốt bé trong lồng phần lớn thời gian trong ngày.',
  'Không bán, cho, hoặc bỏ rơi bé. Nếu không nuôi được sẽ báo trạm.',
  'Gửi ảnh hoặc video cập nhật về bé cho trạm hằng tháng trong 3 tháng đầu.',
  'Tôi hiểu rằng không thể tự đổi hoặc hủy lịch nhận. Nếu không có mặt đúng hẹn, đơn sẽ bị hủy và bé được nhả cho người khác.'
];

export const ITEMS = [
  ['dogfood','Thức ăn hạt cho chó','kg'], ['catfood','Thức ăn hạt cho mèo','kg'], ['pate','Pate, đồ ăn ướt','hộp'],
  ['milk','Sữa cho chó mèo con','hộp'], ['litter','Cát vệ sinh cho mèo','túi'], ['med','Thuốc, vật tư y tế (bông, băng, sát khuẩn)','phần'],
  ['gear','Đồ dùng: bát ăn, dây dắt, lồng vận chuyển','món'], ['pad','Tã lót, khăn lau','gói']
];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;

export const normPhone = p => String(p || '').replace(/[\s.]/g, '');
export const normEmail = e => String(e || '').trim().toLowerCase();

/* ---------- dates, always in Vietnam time ---------- */
const pad = n => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' of the Vietnam calendar day containing instant `t` (ms). */
export function vnDateKey(t) {
  const d = new Date(t + VN_OFFSET_H * 3600e3);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
/** Weekday (0 = Sunday) of a 'YYYY-MM-DD' key. */
export function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
}
/** Instant (ms) of hour `h` on Vietnam day `key`. */
export function vnInstant(key, h) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, h - VN_OFFSET_H);
}
/** The next `count` open days after today (Vietnam time), as date keys. */
export function bookableDays(openDays, now, count = BOOKING_DAYS) {
  const out = [];
  let k = vnDateKey(now);
  for (let i = 0; i < 40 && out.length < count; i++) { k = addDays(k, 1); if (openDays.includes(weekdayOf(k))) out.push(k); }
  return out;
}
export function apptEnd(dateKey, slot) { return vnInstant(dateKey, slot.end_hour + NO_SHOW_GRACE_HOURS); }

/* ---------- adopter ---------- */
/** Age in years from a 12-digit CCCD (4th digit = century and sex, 5th–6th = year of birth); null if malformed. */
export function cccdAge(c, now = Date.now()) {
  if (!/^\d{12}$/.test(c || '')) return null;
  const g = +c[3];
  if (g > 3) return null;
  const year = (g < 2 ? 1900 : 2000) + +c.slice(4, 6);
  return Number(vnDateKey(now).slice(0, 4)) - year;
}

export function validateCustomer(c, now = Date.now()) {
  const e = {};
  if (!c.name || String(c.name).trim().split(/\s+/).length < 2) e.name = 'Nhập đầy đủ họ và tên.';
  if (!PHONE_RE.test(normPhone(c.phone))) e.phone = 'Số điện thoại gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.';
  if (!c.job || !String(c.job).trim()) e.job = 'Nhập nghề nghiệp.';
  if (!/^\d{12}$/.test(c.cccd || '')) e.cccd = 'Số CCCD gồm đúng 12 chữ số.';
  else {
    const a = cccdAge(c.cccd, now);
    if (a === null) e.cccd = 'Số CCCD không hợp lệ, kiểm tra lại số thứ 4.';
    else if (a < 18) e.cccd = 'Người nhận nuôi cần đủ 18 tuổi.';
  }
  if (!c.address || !String(c.address).trim()) e.address = 'Nhập địa chỉ.';
  if (!c.district || !(DISTRICTS.includes(c.district) || c.district === OUTSIDE)) e.district = 'Chọn quận / huyện.';
  if (!EMAIL_RE.test(normEmail(c.email))) e.email = 'Email chưa đúng định dạng.';
  return e;
}

export const questionsFor = hasCat => QUESTIONS.filter(q => !q.onlyCat || hasCat);

export function validateAnswers(a, hasCat) {
  const e = {};
  questionsFor(hasCat).forEach(q => { if (!q.opts.some(([k]) => k === a[q.id])) e['q-' + q.id] = 'Chọn một câu trả lời.'; });
  if (a.cannot === 'other' && !String(a.cannotText || '').trim()) e['q-cannot'] = 'Mô tả phương án của bạn.';
  if (!String(a.care || '').trim()) e['q-care'] = 'Cho trạm biết ai sẽ chăm bé khi bạn vắng nhà.';
  return e;
}

/** Answers that send an order to manual review instead of auto-confirming it. */
export function evaluateFlags(a, hasCat) {
  return questionsFor(hasCat).filter(q => q.flag && q.flag[a[q.id]]).map(q => q.flag[a[q.id]]);
}

/** Keep only known answer keys, trimmed, so free text from the form cannot bloat the record. */
export function cleanAnswers(a, hasCat) {
  const out = {};
  questionsFor(hasCat).forEach(q => { if (typeof a[q.id] === 'string') out[q.id] = a[q.id]; });
  if (a.cannot === 'other') out.cannotText = String(a.cannotText || '').trim().slice(0, 500);
  out.care = String(a.care || '').trim().slice(0, 500);
  return out;
}

/* ---------- support ---------- */
export function validateSupport(s) {
  const e = {};
  if (s.type !== 'cash' && s.type !== 'items') e.type = 'Chọn hình thức hỗ trợ.';
  if (s.type === 'cash' && !(Number.isInteger(s.amount) && s.amount >= MIN_AMOUNT)) e.amount = 'Số tiền tối thiểu là 10.000đ.';
  if (s.type === 'cash' && !s.hasProof) e.proof = 'Tải lên ảnh chụp minh chứng chuyển khoản.';
  if (s.type === 'items' && !ITEMS.some(([k]) => (s.items || {})[k] > 0)) e.items = 'Nhập số lượng cho ít nhất một món.';
  if (!String(s.name || '').trim()) e.name = 'Nhập họ tên để trạm ghi nhận.';
  if (!EMAIL_RE.test(normEmail(s.email))) e.contact = 'Nhập email để nhận xác nhận.';
  return e;
}

export function cleanItems(items) {
  const out = {};
  ITEMS.forEach(([k]) => { const n = Math.floor(Number((items || {})[k]) || 0); if (n > 0) out[k] = Math.min(n, 999); });
  return out;
}

export function itemsText(items) {
  return ITEMS.filter(([k]) => (items || {})[k] > 0).map(([k, l, u]) => items[k] + ' ' + u + ' ' + l.toLowerCase()).join(', ');
}
export const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ';
