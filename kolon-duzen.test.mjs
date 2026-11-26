// Çalıştır: node kolon-duzen.test.mjs — tek kolon kaldırma/kaydırma (kolonduzen.js) ve ızgara kiriş çözümü (kiris.js izgaraBul)
import assert from 'node:assert/strict';
import { agKur } from './mekanik.js';
import { kirisBul } from './kiris.js';
import { dosemeBul } from './doseme.js';
import { zincirHesap, girdiDenetle, malzeme } from './zincir.js';
import { perdeAg, perdeOku } from './perde.js';
import { kolonDuzenOku, kolonDuzenYaz, kolonDuzenUygula, kolonKaymaSiniri } from './kolonduzen.js';
import { yeniDurum, girdiYaz, girdiOku, hesap, durumKaydet, durumYukle, kolonDuzenDegistir, excelSayfalar, yerlesimKaydir, ANAHTAR } from './calisma.js';

const yakin = (a, b, tol = 1e-3, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} ≠ ${b}`);
const G0 = { ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, H: 3000, beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: 500, disGen: 120,
  dolgu: 0.5, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, dosemeDuvar: true, sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75, kolonOzel: {} };
const mz = malzeme(30, 420);
const kirisKur = (g, duzen = {}, perde = '') => {
  const ag = kolonDuzenUygula(agKur(g.ax, g.ay), duzen), d0 = dosemeBul(ag, g, mz, 250);
  const dos = { h: d0.h, tabla: d0.panolar[0].t, gAlan: d0.panolar[0].gAlan, qAlan: d0.panolar[0].qAlan };
  return { ag, dos, pd: perdeAg(ag, perdeOku(perde).liste, {}) };
};
const olcu = c => ({ b: 300 + 50 * (c.i % 2), h: 350 });

// Metin ↔ nesne: aks adı iki yazımda, ondalık virgül, kanonik yazım; yanlış yazım ve tekrar hata verir
{ const r = kolonDuzenOku('2B kaldırıldı; 3a x +0,40 m\nB4 Y −0,25; 12C X 0.125');
  assert.deepEqual(r, { duzen: { '2B': { sil: true }, '3A': { dx: 0.4 }, '4B': { dy: -0.25 }, '12C': { dx: 0.125 } }, hata: [] });
  assert.equal(kolonDuzenYaz(r.duzen), '2B kaldırıldı; 3A X +0,40 m; 4B Y −0,25 m; 12C X +0,125 m');
  assert.equal(kolonDuzenOku('5D; 2B sil; 2B X 1').hata.length, 2); assert.deepEqual(kolonDuzenOku('3A X 0').duzen, {}); }

// 1 — Düzenli ağda ızgara yolu sürekli kirişlerle aynı (ayrışan hatlar; pano başına zarf = dama desenleri)
for (const [tur, ax, ay, pr] of [['plak', [4, 5, 4], [5, 4.5], ''], ['disli', [6, 6, 6], [4, 4], ''], ['kaset', [6, 6, 6, 6], [4, 7], 'B/2–3'], ['plak', [3, 8], [5, 5, 5], 'A/1–2; 3/A–B']]) {
  const g = { ...G0, dosemeTuru: tur, ax, ay }, { ag, dos, pd } = kirisKur(g, {}, pr);
  const A = kirisBul(ag, g, mz, dos, olcu, { perde: pd.bay }), B = kirisBul(ag, g, mz, dos, olcu, { perde: pd.bay, izgara: true });
  assert.ok(!A.izgara && B.izgara && A.kirisler.length === B.kirisler.length);
  for (const a of A.kirisler) {
    const b = B.kirisler.find(x => x.ad === a.ad);
    for (const f of ['b', 'h', 'L', 'ln', 'MdMesnet', 'MdAcik', 'MdSolUst', 'MdSagUst', 'MdSolAlt', 'MdSagAlt', 'MdOrtaUst', 'Vd', 'Ve', 'AsUst', 'AsAlt', 'gOrt', 'qOrt']) yakin(b[f], a[f], 1e-3, `${tur} ${a.ad}.${f}`);
    yakin(b.sehim.deger, a.sehim.deger, 1e-3, `${tur} ${a.ad} sehim`); assert.equal(a.gecti, b.gecti);
  }
  for (const [hi, t] of A.tepki) for (const k of ['G', 'Q']) t[k].forEach((x, u) => yakin(B.tepki.get(hi)[k][u], x, 1e-6, `tepki ${hi}${k}${u}`));
}

// 2 — Denge: uygulanan yük = kolon ve perde düğümü tepkileri (ham), kaldırma ve kaydırmada; G ve Q ayrı (1,4G + 1,6Q de doğrusal)
for (const duzen of [{ '2B': { sil: true } }, { '1A': { sil: true } }, { '2A': { sil: true } }, { '2B': { dx: 0.6 } }, { '2B': { dx: 0.05 } }, { '2B': { sil: true }, '3A': { dx: 0.4 }, '2C': { dy: -0.5 } }]) {
  const { ag, dos } = kirisKur(G0, duzen), r = kirisBul(ag, G0, mz, dos, olcu, {});
  const plan = 13 * 9.5, w = r.kirisler.reduce((t, e) => t + (e.gOrt * e.L), 0), q = r.kirisler.reduce((t, e) => t + e.qOrt * e.L, 0);
  const sumR = k => [...r.tepkiHam.values()].reduce((t, x) => t + x[k].reduce((a, b) => a + b, 0), 0);
  yakin(sumR('G'), w, 1e-9, `${JSON.stringify(duzen)} ΣG`); yakin(sumR('Q'), q, 1e-9, 'ΣQ');
  yakin(q, plan * dos.qAlan, 1e-9, 'Q bütün döşemeden'); // döşeme yükünün tamamı kirişlere (45°), kaybolmaz
  for (const t of r.tepki.values()) assert.ok(t.G.every(x => x >= 0) && t.Q.every(x => x >= 0));
}

// 3 — İç kolon kaldırıldı (2B): üstündeki kirişler birleşik açıklık, kolon satırı yok, komşular daha çok yük alır; kesişimde askı
const r0 = zincirHesap(G0), r1 = zincirHesap({ ...G0, kolonDuzen: '2B kaldırıldı' });
{ assert.ok(!r0.duzen && r1.duzen.sil[0] === '2B' && !r1.kolonlar.some(c => c.aks === '2B') && r1.kolonlar.length === 11);
  const k5 = r1.kirisler.find(e => e.ad === 'K5'), k12 = r1.kirisler.find(e => e.ad === 'K12');
  // birleşik kiriş, ortası hangi açıklıktaysa onun adını taşır (B/1–3: 4 + 5 m → K5); öbür ad listeden düşer
  assert.ok(k5.L === 9 && k5.birlesik.join() === 'K4,K5' && k5.aks === 'B / 1–3' && !r1.kirisler.some(e => e.ad === 'K4'));
  assert.ok(k12.L === 9.5 && k12.birlesik.join() === 'K12,K13' && k12.uclar.join() === 'kolon,kolon');
  for (const a of ['1B', '3B', '2A', '2C']) assert.ok(r1.kolonlar.find(c => c.aks === a).Nd > r0.kolonlar.find(c => c.aks === a).Nd, a);
  const ks = r1.duzen.kesisim[0];
  assert.ok(ks.aks === '2B' && ks.Fd > 0 && ks.kirisler.join() === 'K5,K12' && k5.maddeler.some(m => m.ad === 'Askı donatısı' && m.uyari));
  assert.ok(r1.radyeZimb.length === 11 && r1.radyeSerit.some(s => s.aks === 'B / 1–3') && r1.notlar.some(n => n.includes('Radye şerit momentleri yaklaşık')));
  // Toplam kolon yükü (G) kaybolmaz: kaldırılan kolonun yükü komşulara gider (kolon öz ağırlığı ve alan payı alt sınırı dışında)
  assert.ok(r1.kolonlar.every(c => c.gecti) && r1.kirisler.every(e => e.gecti)); }

// 4 — Köşe kolonu kaldırıldı (1A): iki konsol; serbest uçta moment yok, mesnette üst; V_e = V_dy; sehim ℓn = konsol serbest boyu
{ const r = zincirHesap({ ...G0, kolonDuzen: '1A kaldırıldı' }), k1 = r.kirisler.find(e => e.ad === 'K1'), k10 = r.kirisler.find(e => e.ad === 'K10');
  assert.ok(k1.konsol === 'sol' && k10.konsol === 'sol' && k1.uclar[0] === 'serbest' && k1.aks.endsWith('konsol'));
  for (const e of [k1, k10]) {
    const w = 1.4 * e.gOrt + 1.6 * e.qOrt;
    assert.ok(e.MdSolUst < 1e-6 && e.MdSagUst > 0.5 * w * e.L ** 2 / 2 && e.MdSagUst < 2 * w * e.L ** 2 / 2, `${e.ad} kök momenti`);
    assert.ok(e.iz.some(x => x.includes('serbest ucunda mafsal oluşmaz')) && e.sehim.kaynak.includes('konsol'));
    yakin(e.sehim.sinir, e.ln * 1000 / 480, 1e-9);
  }
  assert.ok(r.notlar.some(n => n.startsWith('Konsol kirişler'))); }

// 5 — Kaydırılan kolon: açıklıklar değişir. Dik kiriş: e ≤ L/10 (L: komşu dik açıklıkların kısası; 2B'de min(5; 4,5) = 4,5 → 0,45 m)
// ise kolona yönlendirilir (birleşir, b_j azalmaz, planda kolona eğik), fazlasında öbür kirişe oturur (kolonsuz kesişim)
{ const r = zincirHesap({ ...G0, kolonDuzen: '2B X +0,6' }), k4 = r.kirisler.find(e => e.ad === 'K4'), k5 = r.kirisler.find(e => e.ad === 'K5');
  yakin(k4.L, 4.6, 1e-12); yakin(k5.L, 4.4, 1e-12); assert.equal(k4.aks, 'B / 1–2′');
  const s6 = r.kolonlar.find(c => c.ad === 'S6'), m = s6.maddeler.find(x => x.ad === 'Dik kiriş');
  assert.ok(m.uyari && !m.gecti && /L\/10 = 0,45 m/.test(m.sinir) && r.duzen.kesisim.some(k => k.aks === '2B' && k.kacik) && r.ag.kolonlar[5].x === 4.6);
  for (const [kd, L4] of [['2B X +0,05', 4.05], ['2B X +0,45', 4.45], ['2B X −0,4', 3.6]]) {
    const r2 = zincirHesap({ ...G0, kolonDuzen: kd }), s6b = r2.kolonlar.find(c => c.ad === 'S6'), m2 = s6b.maddeler.find(x => x.ad === 'Dik kiriş');
    assert.ok(m2.gecti && /yönlendirildi/.test(m2.deger) && !r2.duzen.kesisim.length, kd);
    yakin(r2.kirisler.find(e => e.ad === 'K4').L, L4, 1e-12);
    const k11 = r2.kirisler.find(e => e.ad === 'K12'); // 2 / A–B: kolona yönlendirilen Y kirişi, planda kolonun gerçek yerine eğik
    assert.ok(k11.p1[0] === 4 + (kd.includes('−') ? -0.4 : +kd.match(/[\d,]+$/)[0].replace(',', '.')) && k11.iz.some(x => x.startsWith('Dik kiriş 2B kolonuna yönlendirildi')), kd);
    assert.ok(s6b.iz.some(x => /Birleşim \(TBDY 7\.5/.test(x)) && s6b.maddeler.some(x => x.ad === 'Güçlü kolon'), kd); // Y kirişleri birleşimde
  }
  // Kenarda kaydırılan kolon perdesiz çerçevede narinliği sağlar (dik kiriş yönlendirildi); L/10'dan çok kayınca öbür kirişe oturur
  const ke = { ...G0, ax: [5, 5, 5], ay: [5, 5] };
  for (const n of [5, 12]) { const s3 = zincirHesap({ ...ke, katSayisi: n, kolonDuzen: '3A X +0,25' }).kolonlar.find(c => c.ad === 'S3');
    assert.ok(s3.gecti && s3.maddeler.find(x => x.ad === 'Narinlik').gecti, `${n} kat`); }
  const r3 = zincirHesap({ ...ke, kolonDuzen: '3A X +0,6' });
  assert.ok(r3.duzen.kesisim.some(k => k.aks === '3A' && k.kacik) && !r3.kolonlar.find(c => c.ad === 'S3').maddeler.find(x => x.ad === 'Dik kiriş').gecti);
  // İçeri kaydırılan köşe kolonu: dik kiriş kolona yönlendirilir; hat ucunda kalan kısa uç "kısa çıkıntı" (yüksek kiriş sayılmaz)
  const r4 = zincirHesap({ ...G0, kolonDuzen: '1A X +0,4' }), k1k = r4.kirisler.find(e => e.ad === 'K1k');
  assert.ok(k1k.konsol === 'sol' && k1k.uclar[0] === 'serbest' && !k1k.yuksekKiris && k1k.maddeler.some(x => x.ad === 'Kısa çıkıntı' && x.uyari) && k1k.gecti);
  assert.ok(!r4.kirisler.find(e => e.ad === 'K10').konsol && !r4.duzen.kesisim.length); }

// 6 — Yasak durumlar girdi hatası verir (kolon adıyla)
const hata = g => girdiDenetle(g).kolonDuzen ?? '';
assert.match(hata({ ...G0, perdeler: 'A/1–2', kolonDuzen: '2A kaldırıldı' }), /2A: perde düğümü/);
assert.match(hata({ ...G0, kolonDuzen: '2B X 0,3 Y 0,2' }), /tek doğrultuda/);
assert.match(hata({ ...G0, kolonDuzen: '2B X 4,5' }), /2B: X kaydırması −3,00 … \+4,00 m/);
assert.match(hata({ ...G0, kolonDuzen: '1A X -0,5' }), /1A: X kaydırması/); // plan dışına taşınmaz
assert.equal(hata({ ...G0, kolonDuzen: '2B kaldırıldı; 3B X -4' }), ''); assert.match(hata({ ...G0, kolonDuzen: '2B kaldırıldı; 3B X -8,5' }), /3B: X kaydırması −8,00/); // komşu kaldırılınca yer açılır
assert.match(hata({ ...G0, ax: [5], kolonDuzen: '1A kaldırıldı' }), /A aksı \(1–2\): 1A sonrası kiriş dizisinde en az iki mesnet/);
assert.match(hata({ ...G0, kolonDuzen: '1A kaldırıldı; 1B kaldırıldı' }), /1 aksı \(A–C\)/);
assert.match(hata({ ...G0, kolonDuzen: '9Z kaldırıldı' }), /9Z: planda böyle kolon yok/);
assert.match(hata({ ...G0, kolonDuzen: '2B sağa' }), /"2B sağa"/);
assert.deepEqual(kolonKaymaSiniri(G0, '2B', { '3B': { dx: -2 } }).x, [-3, 2]);
assert.equal(hata({ ...G0, ax: [5], kolonDuzen: '1A Y +0,4' }), '');                                    // 1 aksında kalır; A aksına dik kiriş yönlendirilir (≤ 5/10)
assert.match(hata({ ...G0, ax: [5], kolonDuzen: '1A Y +0,6' }), /A aksı \(1–2\): 1A sonrası/);        // A kirişi kolona ulaşmaz: A dizisinde tek mesnet

// 7 — Kirişsiz: kaldırma yasak (TS 500 11.4.4), kaçıklık ≤ açıklığın 1/10'u; şerit açıklıkları ve zımbalama gerçek yerde
const K = { ...G0, dosemeTuru: 'kirissiz', ax: [5, 5, 5], ay: [5, 5, 5], katSayisi: 3 };
assert.match(hata({ ...K, kolonDuzen: '2B kaldırıldı' }), /kirişsiz döşemede kolon kaldırılamaz.*11\.4\.4/);
assert.match(hata({ ...K, kolonDuzen: '2B X 0,6' }), /1\/10.*11\.4\.4\.2\(d\)/);
{ const r = zincirHesap({ ...K, kolonDuzen: '2B X +0,4' }), sx = r.seritler.filter(s => s.yon === 'x' && s.c.hatNo === 1);
  assert.deepEqual(sx.map(s => +s.l1.toFixed(6)), [5.4, 4.6, 5]);
  assert.ok(r.seritler.filter(s => s.yon === 'y' && s.c.hatNo === 1).every(s => s.l1 === 5)); // dik çerçevede aks üzerinde
  assert.ok(r.kolonlar.find(c => c.ad === 'S6').maddeler.some(m => m.ad === 'Kolon kaçıklığı' && m.gecti) && r.zimbD.length === 16); }

// 8 — Katlı hesap: aynı düzen her katta; kaldırılan kolon hiçbir katta yok
{ const r = zincirHesap({ ...G0, katSayisi: 3, katYukseklikleri: [3000, 3300, 3000], kolonDuzen: '2B kaldırıldı; 3A X +0,40' });
  assert.ok(r.katlar.every(k => k.kolonlar.length === 11 && !k.kolonlar.some(c => c.ad === 'S6') && k.kirisler.find(e => e.ad === 'K5').L === 9));
  assert.ok(r.katlar.every(k => k.kolonlar.find(c => c.ad === 'S3').maddeler.some(m => m.ad === 'Dik kiriş' && m.gecti)));
  assert.ok(r.duzen.kay[0].aks === '3A' && r.radyeZimb.length === 11 && r.notlar[0].startsWith('Kolon düzeni')); }
{ const r = zincirHesap({ ...K, katYukseklikleri: [3000, 3300, 3000], kolonDuzen: '2B X +0,4' });
  assert.ok(r.katlar.every(k => k.zimbD.length === 16 && k.seritler.some(s => Math.abs(s.l1 - 5.4) < 1e-9))); }

// 9 — Kayıt ve temizlik: metin girdisi kanonik yazılır, gidiş-dönüş, aks azalınca planda kalmayan kolon düşer; eski kayıt açılır
{ const d = yeniDurum();
  assert.equal(d.form.kolonDuzen, '');
  girdiYaz(d, 'kolonDuzen', 'b2 sil; 3a x 0.4', true); assert.equal(d.form.kolonDuzen, '2B kaldırıldı; 3A X +0,40 m');
  assert.ok(hesap(d).sonuc.duzen.sil.includes('2B'));
  const depo = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); } };
  durumKaydet(d, depo); assert.equal(durumYukle(depo).form.kolonDuzen, d.form.kolonDuzen);
  depo.setItem(ANAHTAR, JSON.stringify({ form: { ax: '4 5 4' } })); assert.equal(durumYukle(depo).form.kolonDuzen, ''); // eski kayıt
  assert.deepEqual([...girdiYaz(d, 'ax', '4 5', true)].includes('kolonDuzen'), false);         // 2B, 3A hâlâ planda
  girdiYaz(d, 'ax', '4', true); assert.equal(d.form.kolonDuzen, '2B kaldırıldı');               // 3A (X aksı 3) düştü
  // Panel: geçersiz değişiklik uygulanmaz, geçerli olan yazılır; geri al
  d.form.ax = '4 5 4';
  assert.match(kolonDuzenDegistir(d, '1A', { dx: -1 }).hata, /1A: X kaydırması/); assert.equal(d.form.kolonDuzen, '2B kaldırıldı');
  assert.deepEqual([...kolonDuzenDegistir(d, '3B', { dy: 0.5 }).degisen], ['kolonDuzen']); assert.equal(d.form.kolonDuzen, '2B kaldırıldı; 3B Y +0,50 m');
  kolonDuzenDegistir(d, '2B', null); assert.equal(d.form.kolonDuzen, '3B Y +0,50 m');
  // Aks kaydırma kolon düzenini bozuyorsa reddedilir
  { const e = yeniDurum(); kolonDuzenDegistir(e, '3B', { dx: 0.9 });
    assert.match(yerlesimKaydir(e, { ax: { indeks: 3, metin: '-2,9' } }).hata, /3B: X kaydırması/); assert.equal(e.form.ax, '4 5 4'); }
  // Girdiler sayfası (Excel) okunur tek satır
  assert.equal(excelSayfalar(d)[0].satirlar.find(x => x[1] === 'Kolon düzeni')[2], '3B Y +0,50 m');
  d.form.kolonDuzen = '2B kaldır; ?'; assert.match(hesap(d).hata.kolonDuzen, /Kolon düzeni: "\?"/); }

// Köşede iki hattın ucu buluşuyor: kısa konsolun ucuna oturan uzun kiriş o uçta kirişe oturur; benzer boylu iki konsol konsol kalır
{ const G = { ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, H: 3000, beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: 500, disGen: 120, dolgu: 0, dosemeDuvar: true,
    gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75 };
  const kay = zincirHesap({ ...G, kolonDuzen: '1A X +0,9' }), uzun = kay.kirisler.find(k => k.L > 4.9 && k.uclar.includes('kiris') && !k.konsol);
  assert.ok(uzun, '0,9 m konsolun ucuna oturan 5 m kiriş konsol sayılmamalı');
  assert.ok(kay.kirisler.some(k => k.konsol && k.L < 1), 'kısa çıkıntı konsol kalmalı');
  const sil = zincirHesap({ ...G, kolonDuzen: '1A kaldırıldı' });
  assert.equal(sil.kirisler.filter(k => k.konsol && k.L >= 4).length, 2, 'köşede iki konsol'); }

console.log('kolon düzeni: tüm kontroller geçti');
