import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHarness, PNG, OUTSIDER_TOKEN } from './harness.mjs';

test('catalog lists published pets as available or adopted, with their stations', async () => {
  const h = await makeHarness();
  await h.addPet({ name: 'Mướp' });
  await h.addPet({ name: 'Ẩn', published: false });
  await h.addPet({ name: 'Đen', adopted: true });
  const cat = (await h.call('GET', 'catalog')).body;
  assert.deepEqual(cat.pets.map(p => [p.name, p.state]), [['Mướp', 'available'], ['Đen', 'adopted']], 'hidden pets are left out, adopted ones go last');
  assert.ok(cat.stations.some(s => s.id === 'VML' && s.name === 'Vườn Mèo Lang Thang'));
  assert.equal(cat.days, undefined, 'no booking data any more');
});

test('the old online adoption and support routes are gone', async () => {
  const h = await makeHarness();
  for (const [m, p] of [['POST', 'holds'], ['POST', 'otp/send'], ['POST', 'orders'], ['POST', 'supports'], ['POST', 'admin/orders/action'], ['POST', 'admin/settings']]) {
    assert.equal((await h.call(m, p, {}, { token: 'admin-token' })).status, 404, p);
  }
});

test('admin: login required, outsiders refused', async () => {
  const h = await makeHarness();
  assert.equal((await h.call('GET', 'admin/overview')).status, 401);
  assert.equal((await h.call('GET', 'admin/overview', null, { token: 'bad' })).status, 401);
  assert.equal((await h.call('GET', 'admin/overview', null, { token: OUTSIDER_TOKEN })).status, 403);
  assert.equal((await h.admin('GET', 'admin/me')).body.email, 'admin@example.com');
});

test('admin: overview includes hidden pets; marking a pet adopted shows on the site', async () => {
  const h = await makeHarness();
  const id = await h.addPet({ name: 'Mướp' });
  await h.addPet({ name: 'Ẩn', published: false });
  const ov = (await h.admin('GET', 'admin/overview')).body;
  assert.equal(ov.pets.length, 2);
  assert.ok(ov.pets.some(p => p.name === 'Ẩn' && p.published === false));
  assert.equal((await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML', adopted: true } })).status, 200);
  assert.equal((await h.call('GET', 'catalog')).body.pets[0].state, 'adopted');
});

test('admin: stations and pet photos', async () => {
  const h = await makeHarness();
  assert.equal((await h.admin('POST', 'admin/stations/save', { station: { id: 'VML', name: 'Vườn Mèo Lang Thang', address: '1 Đường A' } })).status, 200);
  assert.equal((await h.call('GET', 'catalog')).body.stations.find(s => s.id === 'VML').address, '1 Đường A');
  assert.equal((await h.admin('POST', 'admin/stations/save', { station: { id: 'x', name: '' } })).status, 400);
  const id = await h.addPet({ name: 'Mướp' });
  const save = await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML' }, newPhotos: [{ name: 'a.png', type: 'image/png', data: PNG }] });
  assert.equal(save.status, 200);
  const photo = (await h.call('GET', 'catalog')).body.pets[0].photos[0];
  assert.match(photo, /pet-media\//);
  const fake = await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML' }, newPhotos: [{ name: 'x.png', type: 'image/png', data: Buffer.from('nope').toString('base64') }] });
  assert.match(fake.body.error, /không khớp/);
  await h.admin('POST', 'admin/pets/save', { pet: { id, name: 'Mướp', species: 'cat', sex: 'Cái', age: 8, weight: 3, station: 'VML' }, removePhotos: [photo] });
  assert.deepEqual((await h.call('GET', 'catalog')).body.pets[0].photos, []);
  assert.equal(Object.keys(h.files).length, 0, 'removed photo is deleted from storage');
  const badPet = await h.admin('POST', 'admin/pets/save', { pet: { name: '', species: 'fish', sex: 'x', age: -1, weight: 0, station: 'NOPE' } });
  assert.deepEqual(Object.keys(badPet.body.fields).sort(), ['age', 'name', 'sex', 'species', 'station', 'weight']);
});
