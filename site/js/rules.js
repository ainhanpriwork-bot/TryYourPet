// Rules and contact details shared by the browser and the server (Vercel Functions).

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const FILE_MAX = 3 * 1024 * 1024; // 3 MB: Vercel caps request bodies at 4.5 MB and base64 adds a third

// Adoption happens by message or phone: visitors pick a pet on the site, then contact one of these.
export const CONTACT = {
  fanpages: [
    { name: 'Purr Nature', page: 'https://www.facebook.com/purr.nature.store/', messenger: 'https://m.me/purr.nature.store' },
    { name: 'Try Your Pet', page: 'https://www.facebook.com/profile.php?id=61595854864529', messenger: 'https://m.me/61595854864529' }
  ],
  phone: { name: 'Đặng Hương Giang', role: 'PM', number: '0364124467', display: '0364 124 467' }
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normEmail = e => String(e || '').trim().toLowerCase();
