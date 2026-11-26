// Çalıştır: node bina.test.mjs — 3B bina modeli (bina.js): eleman sayıları, kotlar, kolon düzeni, konsol, katlı ölçüler, donatı sayısı
import assert from 'node:assert/strict';
import { binaModeli, donatiCubuklari, kartBilgi, cubukOku } from './bina.js';
import { zincirHesap } from './zincir.js';
import { durumYukle, girdiOku } from './calisma.js';

const bos = { getItem: () => null, setItem() {}, removeItem() {} };
const hesap = (ek = {}) => { const d = durumYukle(bos); const g = girdiOku({ ...d, form: { ...d.form, ...ek } }); return { r: zincirHesap(g), g }; };
const yakin = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const tip = (M, t, k) => M.elemanlar.filter(e => e.tip === t && (k == null || e.kat === k));

// Çubuk yazısı
assert.deepEqual(cubukOku('6φ14'), { n: 6, phi: 14, s: null });
assert.deepEqual(cubukOku('φ10/80'), { n: 1, phi: 10, s: 80 });
assert.deepEqual(cubukOku('tabla φ8/250'), { n: 1, phi: 8, s: 250 });
assert.deepEqual(cubukOku('2φ14 / 2φ14'), { n: 2, phi: 14, s: null });
assert.deepEqual(cubukOku('3φ14/yüz (b, kare)'), { n: 3, phi: 14, s: null });
assert.equal(cubukOku(0), null); assert.equal(cubukOku('—'), null);

// Varsayılan proje: 4 × 3 kolon, 5 kat × 3 m, plak döşeme, radye
{
  const { r, g } = hesap(), M = binaModeli(r, g);
  assert.equal(M.katSayisi, 5);
  assert.deepEqual(M.z, [0, 3, 6, 9, 12, 15]);
  assert.equal(tip(M, 'kolon').length, 12 * 5);
  assert.equal(tip(M, 'doseme', 1).length, 6);
  assert.equal(tip(M, 'kiris', 3).length, r.kirisler.length);
  assert.equal(tip(M, 'radye').length, 1);
  const c = tip(M, 'kolon', 2).find(e => e.ad === 'S1'), k = c.kutular[0];
  yakin(k.c[2], 4.5); yakin(k.h, 1.5); yakin(k.a, r.kolonlar[0].b / 2000);
  const kr = tip(M, 'kiris', 1)[0].kutular[0];
  yakin(kr.c[2] + kr.h, 3); yakin(2 * kr.h, r.kirisler[0].h / 1000); // kiriş üstü kat üstünde
  const ds = tip(M, 'doseme', 1)[0].kutular[0];
  yakin(ds.c[2] + ds.h, 3);
  assert.ok(ds.a < r.ag.ax[0] / 2, 'döşeme kiriş yarı genişliği kadar içeride');
  // Kolon donatısı: 6φ14 (nb 3, nh 2) → 6 boyuna; etriye ucunda sarılma aralığı, ortada orta aralık
  const cb = donatiCubuklari(c), boy = cb.filter(x => x.tur === 'boyuna'), et = cb.filter(x => x.tur === 'etriye');
  assert.equal(boy.length, cubukOku(c.e.boyuna).n);
  assert.equal(et.length % 4, 0); assert.ok(et.length > 0);
  const kotlar = [...new Set(et.map(x => x.a[2].toFixed(4)))].map(Number).sort((a, b) => a - b);
  yakin(kotlar[1] - kotlar[0], cubukOku(c.e.etrSar).s / 1000, 1e-9);
  const orta = kotlar.findIndex(z => z > 3 + 1.5); yakin(kotlar[orta + 1] - kotlar[orta], cubukOku(c.e.etrOrta).s / 1000, 1e-9);
  assert.ok(kotlar.every(z => z > 3 && z < 6), 'etriyeler kendi katında');
  // Kiriş ve döşeme donatısı
  const kb = donatiCubuklari(tip(M, 'kiris', 1)[0]);
  assert.ok(kb.filter(x => x.tur === 'boyuna').length >= cubukOku(r.kirisler[0].alt).n + cubukOku(r.kirisler[0].surekliUst).n);
  assert.ok(kb.some(x => x.tur === 'etriye'));
  const dsb = donatiCubuklari(tip(M, 'doseme', 1)[0]);
  assert.ok(dsb.length > 20 && dsb.every(x => x.a[2] > 3 - 0.13 && x.a[2] < 3));
  assert.ok(donatiCubuklari(tip(M, 'radye')[0]).length > 50);
  // Kart
  const kart = kartBilgi(c, false);
  assert.equal(kart.baslik, 'S1'); assert.match(kart.alt, /2\. kat \(bütün katlarda aynı\)/);
  assert.ok(kart.satirlar.some(([a, v]) => a === 'Boyuna' && v === c.e.boyuna));
}

// Uygun olmayan eleman işaretlenir, katlı değilse adı bir kez sayılır
{
  const { r, g } = hesap(); r.kolonlar[0].gecti = false;
  const M = binaModeli(r, g);
  assert.ok(tip(M, 'kolon').filter(e => e.ad === r.kolonlar[0].ad).every(e => !e.gecti));
  assert.equal(M.uygunDegil.filter(x => x === r.kolonlar[0].ad).length, 1);
  assert.equal(kartBilgi(tip(M, 'kolon', 1).find(e => !e.gecti)).gecti, false);
}

// Katlı: farklı kat yükseklikleri, her kat kendi ölçüsü; perde ve kaset döşeme (tabla + diş)
{
  const { r, g } = hesap({ kat: '3', katYukseklikleri: '3000 3200 3400', dosemeTuru: 'kaset', perdeler: '4/A–B' }), M = binaModeli(r, g);
  assert.ok(M.katli);
  M.z.forEach((z, i) => yakin(z, [0, 3, 6.2, 9.6][i]));
  for (const k of [1, 2, 3]) {
    const c = tip(M, 'kolon', k)[0], f = r.katlar[k - 1].kolonlar.find(x => x.ad === c.ad);
    yakin(2 * c.kutular[0].a, f.b / 1000); yakin(2 * c.kutular[0].h, [3, 3.2, 3.4][k - 1]);
  }
  const p = tip(M, 'perde', 2)[0];
  yakin(2 * p.kutular[0].a, r.katlar[1].perdeler[0].lw / 1000);
  assert.ok(donatiCubuklari(p).length > 20);
  const d = tip(M, 'doseme', 1)[0], s = (d.geo.y1 - d.geo.y0);
  assert.ok(d.kutular.length > 2, 'kaset: tabla + iki doğrultuda diş');
  assert.equal(d.geo.disler.filter(x => x.yon === 'x').length, Math.max(1, Math.round(s / (g.disAralik / 1000))));
  assert.ok(donatiCubuklari(d).length > 10);
  r.katlar[1].kolonlar[0].gecti = false;
  assert.ok(binaModeli(r, g).uygunDegil.includes(`${r.katlar[1].kolonlar[0].ad} (2. kat)`));
}

// Kolon düzeni: kaldırılan çizilmez, kaydırılan yeni yerinde; köşe kolonu kalkınca konsol kiriş
{
  const { r, g } = hesap({ kolonDuzen: '2B kaldırıldı; 3A X +0,40 m' }), M = binaModeli(r, g);
  const sil = r.ag.kolonlar.find(c => c.aks === '2B'), kay = r.ag.kolonlar.find(c => c.aks === '3A');
  assert.ok(!tip(M, 'kolon').some(e => e.ad === sil.ad));
  yakin(tip(M, 'kolon', 1).find(e => e.ad === kay.ad).kutular[0].c[0], r.ag.xs[2] + 0.4);
  const { r: r2, g: g2 } = hesap({ kolonDuzen: '1A kaldırıldı' }), M2 = binaModeli(r2, g2);
  const konsol = tip(M2, 'kiris', 1).filter(e => e.e.konsol);
  assert.ok(konsol.length > 0, 'konsol kiriş var');
  assert.ok(konsol.some(e => Math.abs(e.kutular[0].c[0] - e.kutular[0].a) < 1e-6 || Math.abs(e.kutular[0].c[1] - e.kutular[0].a) < 1e-6), 'konsol serbest ucu aks 1 ya da A üzerinde');
}

// Kirişsiz: kiriş yok, döşeme dolu; dişli + su basman (SB) temelde
{
  const { r, g } = hesap({ dosemeTuru: 'kirissiz' }), M = binaModeli(r, g);
  assert.equal(tip(M, 'kiris').length, 0);
  assert.ok(donatiCubuklari(tip(M, 'doseme', 1)[0]).length > 20);
  const { r: r2, g: g2 } = hesap({ dosemeTuru: 'disli', perdeler: 'A/1–2', subasman: '3/A–B' }), M2 = binaModeli(r2, g2);
  const sb = tip(M2, 'subasman');
  assert.equal(sb.length, 1); yakin(2 * sb[0].kutular[0].h, r2.subasmanlar[0].h / 1000);
  assert.equal(sb[0].gecti, r2.subasmanlar[0].gecti);
  if (!sb[0].gecti) assert.ok(M2.uygunDegil.includes(sb[0].ad));
  assert.equal(donatiCubuklari(sb[0]).length, 0);
  assert.ok(tip(M2, 'doseme', 1).every(d => d.kutular.length > 1), 'dişli: tabla + diş');
}
// Gözden geçirmede bulunanlar: sıfır etriye aralığı ('φ10/0', kısa açıklık) döngüyü kilitlemez; birleşim bölgesi etrBirlesim aralığıyla;
// diş üst donatısı adedi yazıdaki kadar
{
  const { r, g } = hesap({ ax: '1 12', kat: '5' }), M = binaModeli(r, g);
  assert.ok(r.kirisler.some(e => /\/0\b/.test(e.etrSar + e.etrOrta)), 'örnekte sıfır aralıklı kiriş var');
  for (const el of M.elemanlar) assert.ok(donatiCubuklari(el).length < 4000, el.ad);
}
{
  const { r, g } = hesap(), M = binaModeli(r, g), c = tip(M, 'kolon', 1)[0], eb = cubukOku(c.e.etrBirlesim);
  assert.ok(eb?.s > 0, 'motor etrBirlesim yazıyor');
  const kot = [...new Set(donatiCubuklari(c).filter(x => x.tur === 'etriye').map(x => x.a[2].toFixed(4)))].map(Number).sort((a, b) => a - b);
  const zt = 3 - c.geo.kirisH, ust = kot.filter(z => z >= zt);
  if (ust.length > 1) yakin(ust[1] - ust[0], eb.s / 1000, 1e-9);
  assert.ok(kartBilgi(c).satirlar.some(([a, v]) => a === 'Birleşim' && v === c.e.etrBirlesim));
  const { r: r2, g: g2 } = hesap({ dosemeTuru: 'disli' }), d = tip(binaModeli(r2, g2), 'doseme', 1).find(x => cubukOku(x.e.disUst)?.n > 1);
  if (d) {
    const ustKot = d.geo.z1 - (20 + cubukOku(d.e.disUst).phi / 2) / 1000, ust2 = donatiCubuklari(d).filter(x => Math.abs(x.a[2] - ustKot) < 1e-9 && x.r === cubukOku(d.e.disUst).phi / 2000);
    assert.equal(ust2.length, d.geo.disler.length * 2 * cubukOku(d.e.disUst).n);
  }
}
console.log('bina.test.mjs: tamam');
