// Small helpers shared by the customer page and the admin page.
import { WEEKDAYS } from './rules.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const fmtDT = t => new Date(t).toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', timeZone:'Asia/Ho_Chi_Minh' });
export const fmtDay = key => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', timeZone:'UTC' });
};
export const dayChip = key => { const [, m, d] = key.split('-'); return { wd: WEEKDAYS[new Date(key + 'T00:00:00Z').getUTCDay()], dm: d + '/' + m }; };
export const ageText = m => m < 12 ? m + ' tháng' : (m % 12 ? (m / 12).toFixed(1).replace('.', ',') + ' tuổi' : (m / 12) + ' tuổi');
export const kg = w => String(w).replace('.', ',') + ' kg';
export const species = s => s === 'cat' ? 'Mèo' : 'Chó';

/* Pet picture: the station's photo when there is one, otherwise a brand mascot tile. */
const BRAND_BG = ['#FFE7A3', '#D6DFFF', '#FFD6C8'];
const POSES = {
  dog: ['dog-sit','dog-run','dog-stand','dog-spin','dog-stick','dog-surprised','dog-roll','dog-grumpy'],
  cat: ['cat-sit','cat-walk','cat-stand','cat-sleep','cat-crouch','cat-roll','cat-sad']
};
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function art(p, v = 0) {
  if (p.photos && p.photos[v]) return `<img class="photo" src="${esc(p.photos[v])}" alt="Ảnh ${esc(p.name)}" loading="lazy">`;
  const i = hash(p.id) + v, poses = POSES[p.species];
  return `<div class="ph" style="background:${BRAND_BG[i % 3]}"><img src="assets/${poses[i % poses.length]}.png" alt="" loading="lazy"><span>Ảnh đang cập nhật</span></div>`;
}

let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
}

/** Calls the TryYourPet API. Throws an Error carrying .status and .fields (per-field messages) on failure. */
export async function api(method, path, body, token) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw Object.assign(new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Máy chủ gặp lỗi, vui lòng thử lại sau.'), { status: res.status, fields: data.fields || {} });
  return data;
}

/** Reads a File into the { name, type, data(base64) } shape the API accepts. */
export function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, type: file.type, data: String(r.result).split(',')[1] });
    r.onerror = () => reject(new Error('Không đọc được file, chọn lại file khác.'));
    r.readAsDataURL(file);
  });
}

/** Disables a button while an async action runs. */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}

export const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep going without saving */ } }
};
