// Çalıştır: node hesap-isci.test.mjs — hesap işçisi (hesap-isci.js): sonuç yapılandırılmış kopyayla aktarılabilir, işlevler ayıklanır
import assert from 'node:assert/strict';
import { aktarilabilir } from './hesap-isci.js';
import { yeniDurum, hesap, katGorunumu } from './calisma.js';

// İşlev ve simge düşer; ortak başvuru, döngü, Map ve Set korunur
const ortak = { a: 1 }, x = { ortak, b: [ortak, () => 1, 2], f() {}, m: new Map([['k', ortak], ['f', () => 0]]), s: new Set([ortak]), t: new Date(0), [Symbol('s')]: 1 };
x.kendi = x;
const y = aktarilabilir(x);
assert.equal(y.f, undefined); assert.ok(!('f' in y)); assert.equal(y.b[1], undefined); assert.equal(y.b[2], 2);
assert.equal(y.ortak, y.b[0]); assert.equal(y.m.get('k'), y.ortak); assert.ok(!y.m.has('f')); assert.ok(y.s.has(y.ortak)); assert.equal(y.kendi, y);
assert.notEqual(y.ortak, ortak); assert.deepEqual(x.ortak, { a: 1 }); // girdi değişmez
const z = structuredClone(y); assert.equal(z.kendi, z); assert.equal(z.b[0], z.ortak);
assert.equal(aktarilabilir(5), 5); assert.equal(aktarilabilir(null), null); assert.equal(aktarilabilir(() => 1), undefined);

// Motor sonuçları (ortak ve kat bazlı; perde, su basman, kolon düzeni, kirişsiz, dişli) işlevsiz: işçiden olduğu gibi gelir, kopyası aynı
const durum = f => Object.assign(yeniDurum(), { form: { ...yeniDurum().form, ...f } });
for (const f of [{}, { dosemeTuru: 'kirissiz' }, { dosemeTuru: 'disli', perdeler: 'A/1–2', subasman: '3/A–B' }, { kolonDuzen: '2B kaldırıldı' },
  { kat: '3', katYukseklikleri: '3000 3200 3400', dosemeTuru: 'kaset', perdeler: '4/A–B' }, { kat: '2', katYukseklikleri: '3000 3400', kolonDuzen: '3A X +0,40 m' }]) {
  const r = hesap(durum(f)).sonuc; assert.ok(r, JSON.stringify(f));
  const c = structuredClone(r); // işlev olsaydı DataCloneError
  assert.deepEqual(c, aktarilabilir(r));
  if (r.katlar?.length) assert.deepEqual(katGorunumu(c, r.katlar.at(-1).kat).kolonlar, katGorunumu(r, r.katlar.at(-1).kat).kolonlar);
}
console.log('hesap-isci: tamam');
