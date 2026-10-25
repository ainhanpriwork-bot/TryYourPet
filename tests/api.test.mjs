import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHarness, goodCustomer, goodAnswers, PNG, OUTSIDER_TOKEN } from './harness.mjs';

const V1 = 'visitor-aaaaaaaaaaaaaaaa', V2 = 'visitor-bbbbbbbbbbbbbbbb';
const DAY = 864e5;

async function orderFor(h, visitor, extra = {}) {
  const email = extra.email || 'khach@example.com';
  const token = await h.verifiedToken(email);
  const cat = (await h.call('GET', 'catalog', null, { query: { visitor } })).body;
  const day = cat.days[0];
  return h.call('POST', 'orders', {
    visitorId: visitor, emailToken: token, customer: goodCustomer(email), answers: { ...goodAnswers, ...(extra.answers || {}) },
    date: extra.date || day.date, slotId: extra.slotId || day.slots[0].id, commits: [true, true, true, true]
  });
}

test('catalog lists published pets with their state for the visitor', async () => {
  const h = await makeHarness();
  const a = await h.addPet({ name: 'Mướp' });
  await h.addPet({ name: 'Ẩn', published: false });
  assert.equal((await h.call('POST', 'holds', { visitorId: V1, petId: a })).status, 200);
  const mine = (await h.call('GET', 'catalog', null, { query: { visitor: V1 } })).body;
  assert.deepEqual(mine.pets.map(p => [p.name, p.state]), [['Mướp', 'mine']]);
  const other = (await h.call('GET', 'catalog', null, { query: { visitor: V2 } })).body;
  assert.equal(other.pets[0].state, 'held');
  assert.equal(mine.days.length, 6);
  assert.ok(mine.days.every(d => [0, 2, 3, 4, 5, 6].includes(d.weekday)), 'Mondays are closed by default');
});

test('holds: max 2 pets, same station, not twice, released after 7 days', async () => {
  const h = await makeHarness();
  const [a, b, c] = [await h.addPet({ name: 'A' }), await h.addPet({ name: 'B' }), await h.addPet({ name: 'C' })];
  const dog = await h.addPet({ name: 'Lu', species: 'dog', sex: 'Đực', station: 'TD' });
  assert.equal((await h.call('POST', 'holds', { visitorId: V1, petId: a })).status, 200);
  const diff = await h.call('POST', 'holds', { visitorId: V1, petId: dog });
  assert.equal(diff.status, 409);
  assert.match(diff.body.error, /cùng một trạm/);
  assert.equal((await h.call('POST', 'holds', { visitorId: V1, petId: b })).status, 200);
  assert.match((await h.call('POST', 'holds', { visitorId: V1, petId: c })).body.error, /tối đa 2/);
  assert.match((await h.call('POST', 'holds', { visitorId: V2, petId: a })).body.error, /người khác/);
  h.clock.t += 7 * DAY + 1;
  assert.equal((await h.call('POST', 'holds', { visitorId: V2, petId: a })).status, 200, 'expired hold can be taken');
  assert.equal((await h.call('POST', 'holds', { visitorId: 'short', petId: a })).status, 400);
});

test('OTP: wrong code counted, resend throttled, token required for the order', async () => {
  const h = await makeHarness();
  assert.equal((await h.call('POST', 'otp/send', { email: 'Khach@Example.com' })).status, 200);
  assert.equal(h.sent.at(-1).to, 'khach@example.com');
  assert.equal((await h.call('POST', 'otp/send', { email: 'khach@example.com' })).status, 429);
  assert.equal((await h.call('POST', 'otp/verify', { email: 'khach@example.com', code: '000000' })).status, 400);
  const code = h.sent.at(-1).subject.match(/(\d{6})$/)[1];
  const ok = await h.call('POST', 'otp/verify', { email: 'khach@example.com', code });
  assert.ok(ok.body.token);
  assert.equal((await h.call('POST', 'otp/verify', { email: 'khach@example.com', code })).status, 400, 'code is single use');
});

test('order auto-confirms good answers, emails the adopter and the team, and blocks the slot', async () => {
  const h = await makeHarness();
  await h.db.query(`update slots set capacity = 1 where id = 's1'`);
  const a = await h.addPet({ name: 'Mướp' });
  await h.call('POST', 'holds', { visitorId: V1, petId: a });
  const r = await orderFor(h, V1);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.status, 'confirmed');
  assert.match(r.body.order.code, /^TYP-\d{4}-\d{4}$/);
  assert.ok(h.sent.some(m => m.to === 'khach@example.com' && /đã được xác nhận/.test(m.subject)));
  assert.ok(h.sent.some(m => m.to === 'notify@example.com'));
  const cat = (await h.call('GET', 'catalog', null, { query: { visitor: V1 } })).body;
  assert.equal(cat.pets[0].state, 'held');
  assert.equal(cat.myHolds.length, 0, 'cart is empty after ordering');
  assert.equal(cat.days[0].slots[0].left, 0);
  const b = await h.addPet({ name: 'Đen' });
  await h.call('POST', 'holds', { visitorId: V2, petId: b });
  const full = await orderFor(h, V2, { email: 'b@example.com' });
  assert.equal(full.status, 409);
  assert.match(full.body.error, /kín/);
});

test('order goes to review on flagged answers; validation errors come back per field', async () => {
  const h = await makeHarness();
  const a = await h.addPet({ name: 'Mướp' });
  await h.call('POST', 'holds', { visitorId: V1, petId: a });
  const token = await h.verifiedToken('khach@example.com');
  const cat = (await h.call('GET', 'catalog', null, { query: { visitor: V1 } })).body;
  const base = { visitorId: V1, emailToken: token, answers: goodAnswers, date: cat.days[0].date, slotId: 's2', commits: [true, true, true, true] };
  const minor = await h.call('POST', 'orders', { ...base, customer: { ...goodCustomer(), adult: false } });
  assert.equal(minor.status, 400);
  assert.match(minor.body.fields.adult, /18 tuổi/);
  const otherEmail = await h.call('POST', 'orders', { ...base, customer: goodCustomer('khac@example.com') });
  assert.match(otherEmail.body.error, /xác thực/);
  const noCommit = await h.call('POST', 'orders', { ...base, customer: goodCustomer(), commits: [true, false, true, true] });
  assert.equal(noCommit.status, 400);
  const badDate = await h.call('POST', 'orders', { ...base, customer: goodCustomer(), date: '2020-01-01' });
  assert.equal(badDate.status, 400);
  const r = await h.call('POST', 'orders', { ...base, customer: goodCustomer(), answers: { ...goodAnswers, permit: 'no' } });
  assert.equal(r.body.order.status, 'review');
  assert.deepEqual(r.body.order.flags, ['Nơi ở không cho phép nuôi']);
});

test('admin: login required, actions follow the order lifecycle', async () => {
  const h = await makeHarness();
  assert.equal((await h.call('GET', 'admin/overview')).status, 401);
  assert.equal((await h.call('GET', 'admin/overview', null, { token: 'bad' })).status, 401);
  assert.equal((await h.call('GET', 'admin/overview', null, { token: OUTSIDER_TOKEN })).status, 403);
  const a = await h.addPet({ name: 'Mướp' });
  await h.call('POST', 'holds', { visitorId: V1, petId: a });
  await orderFor(h, V1, { answers: { permit: 'unsure' } });
  let ov = (await h.admin('GET', 'admin/overview')).body;
  const o = ov.orders[0];
  assert.equal(o.status, 'review');
  assert.equal((await h.admin('POST', 'admin/orders/action', { id: o.id, action: 'complete' })).status, 409);
  assert.equal((await h.admin('POST', 'admin/orders/action', { id: o.id, action: 'approve' })).status, 200);
  assert.equal((await h.admin('POST', 'admin/orders/action', { id: o.id, action: 'complete' })).status, 200);
  ov = (await h.admin('GET', 'admin/overview')).body;
  assert.equal(ov.orders[0].status, 'completed');
  assert.equal(ov.orders[0].decided_by, 'admin@example.com');
  assert.equal(ov.pets[0].state, 'adopted');
  assert.equal((await h.call('POST', 'holds', { visitorId: V2, petId: a })).status, 409, 'adopted pet cannot be held');
});

test('admin: reject releases the pet for others', async () => {
  const h = await makeHarness();
  const a = await h.addPet({ name: 'Mướp' });
  await h.call('POST', 'holds', { visitorId: V1, petId: a });
  await orderFor(h, V1, { answers: { allergy: 'yes' } });
  const o = (await h.admin('GET', 'admin/overview')).body.orders[0];
  await h.admin('POST', 'admin/orders/action', { id: o.id, action: 'reject' });
  assert.equal((await h.call('POST', 'holds', { visitorId: V2, petId: a })).status, 200);
});

test('maintenance cancels missed appointments, reminds the day before, releases expired holds', async () => {
  const h = await makeHarness();
  const [a, b] = [await h.addPet({ name: 'A' }), await h.addPet({ name: 'B' })];
  await h.call('POST', 'holds', { visitorId: V1, petId: a });
  const r = await orderFor(h, V1);
  await h.call('POST', 'holds', { visitorId: V2, petId: b });
  const date = r.body.order.date;
  // Move the clock to noon (Vietnam) of the day before the appointment.
  const [y, m, d] = date.split('-').map(Number);
  h.clock.t = Date.UTC(y, m - 1, d - 1, 5);
  let res = await h.app.maintenance();
  assert.equal(res.reminded, 1);
  assert.ok(h.sent.some(x => /Nhắc lịch/.test(x.subject)));
  assert.equal((await h.app.maintenance()).reminded, 0, 'reminder sent once');
  h.clock.t = Date.UTC(y, m - 1, d + 1, 5);
  res = await h.app.maintenance();
  assert.equal(res.cancelled, 1);
  assert.equal(res.released, 0, 'V2 still has days left on the hold');
  assert.ok(h.sent.some(x => /đã bị hủy/.test(x.subject)));
  assert.equal((await h.call('POST', 'holds', { visitorId: 'visitor-cccccccccccccccc', petId: a })).status, 200, 'no-show pet is free again');
  h.clock.t = Date.parse('2026-10-26T03:00:00Z') + 7 * DAY + 1;
  assert.equal((await h.app.maintenance()).released, 1, 'V2 hold is past 7 days, the newer one is not');
});

test('support: cash needs a real image proof, stored privately; admin can view and confirm', async () => {
  const h = await makeHarness();
  const base = { type: 'cash', amount: 150000, name: 'Lê A', email: 'a@example.com', target: 'station:VML' };
  assert.match((await h.call('POST', 'supports', base)).body.fields.proof, /minh chứng/);
  const fake = await h.call('POST', 'supports', { ...base, proof: { name: 'x.png', type: 'image/png', data: Buffer.from('not an image').toString('base64') } });
  assert.match(fake.body.error, /không khớp/);
  assert.equal((await h.call('POST', 'supports', { ...base, amount: 5000, proof: { name: 'x.png', type: 'image/png', data: PNG } })).status, 400);
  const ok = await h.call('POST', 'supports', { ...base, proof: { name: 'x.png', type: 'image/png', data: PNG } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.support.target, 'Vườn Mèo Lang Thang');
  assert.ok(Object.keys(h.files).some(k => k.startsWith('proofs/')));
  const s = (await h.admin('GET', 'admin/overview')).body.supports[0];
  assert.equal(s.hasProof, true);
  assert.equal(s.proof_path, undefined, 'storage path is not exposed');
  assert.match((await h.admin('GET', 'admin/supports/proof', null, { id: s.id })).body.url, /signed\/proofs\//);
  assert.equal((await h.admin('POST', 'admin/supports/action', { id: s.id, action: 'received' })).status, 200);
  assert.equal((await h.admin('POST', 'admin/supports/action', { id: s.id, action: 'received' })).status, 409);
});

test('support: items need at least one quantity and no proof', async () => {
  const h = await makeHarness();
  const base = { type: 'items', name: 'Lê A', email: 'a@example.com', method: 'ship' };
  assert.equal((await h.call('POST', 'supports', { ...base, items: { pate: 0 } })).status, 400);
  const ok = await h.call('POST', 'supports', { ...base, items: { pate: 6, unknown: 3 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.support.what, '6 hộp pate, đồ ăn ướt');
});

test('admin: settings, stations and pet photos', async () => {
  const h = await makeHarness();
  assert.equal((await h.admin('POST', 'admin/settings', { openDays: [], capacities: {} })).status, 400);
  assert.equal((await h.admin('POST', 'admin/settings', { openDays: [1, 2], capacities: { s1: 5 } })).status, 200);
  const cat = (await h.call('GET', 'catalog')).body;
  assert.ok(cat.days.every(d => [1, 2].includes(d.weekday)));
  assert.equal(cat.days[0].slots.find(s => s.id === 's1').capacity, 5);
  assert.equal((await h.admin('POST', 'admin/stations/save', { station: { id: 'VML', name: 'Vườn Mèo Lang Thang', address: '1 Đường A', needs: ['catfood', 'bogus'] } })).status, 200);
  assert.deepEqual(cat.stations.find(s => s.id === 'VML').needs, ['catfood', 'litter', 'milk']);
  assert.deepEqual((await h.call('GET', 'catalog')).body.stations.find(s => s.id === 'VML').needs, ['catfood']);
  const id = await h.addPet({ name: 'Mướp' });
  const save = await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML' }, newPhotos: [{ name: 'a.png', type: 'image/png', data: PNG }] });
  assert.equal(save.status, 200);
  const photo = (await h.call('GET', 'catalog')).body.pets[0].photos[0];
  assert.match(photo, /pet-media\//);
  await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML' }, removePhotos: [photo] });
  assert.deepEqual((await h.call('GET', 'catalog')).body.pets[0].photos, []);
  assert.equal(Object.keys(h.files).length, 0, 'removed photo is deleted from storage');
  const badPet = await h.admin('POST', 'admin/pets/save', { pet: { name: '', species: 'fish', sex: 'x', age: -1, weight: 0, station: 'NOPE' } });
  assert.deepEqual(Object.keys(badPet.body.fields).sort(), ['age', 'name', 'sex', 'species', 'station', 'weight']);
});
