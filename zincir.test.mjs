// Çalıştır: node hesap/zincir.test.mjs
import assert from 'node:assert/strict';
import { surekliKiris, kenarParcasi, parcaToplam, parcaAnkastre, agKur, zarf, desenler, zincirHesap, girdiDenetle, malzeme } from './zincir.js';

import { kirisBul } from './kiris.js';

const yakin = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const duz = w => ({ w, a: 0 });

// Parça formülleri: üçgen ankastrelik 5wL²/96, yamuk alanı.
yakin(parcaAnkastre({ w: 12, a: 3 }, 6), 5 * 12 * 36 / 96);
yakin(parcaAnkastre(duz(12), 6), 12 * 36 / 12);
yakin(parcaToplam({ w: 10, a: 2 }, 6), 40);

// Sürekli kiriş, bilinen sonuçlar.
let r = surekliKiris([5], [[duz(10)]]);                        // basit kiriş
yakin(r.R[0], 25); yakin(r.acikliklar[0].Macik, 10 * 25 / 8);
r = surekliKiris([5, 5], [[duz(10)], [duz(10)]]);              // iki eşit açıklık: −wL²/8, 3/8, 5/4, 9wL²/128
yakin(r.M[1], -31.25); yakin(r.R[0], 18.75); yakin(r.R[1], 62.5); yakin(r.acikliklar[0].Macik, 9 * 10 * 25 / 128);
r = surekliKiris([4, 4, 4], [[duz(10)], [duz(10)], [duz(10)]]); // üç eşit açıklık: −0,1wL², 0,4wL, 1,1wL
yakin(r.M[1], -16); yakin(r.M[2], -16); yakin(r.R[0], 16); yakin(r.R[1], 44);
r = surekliKiris([6], [[{ w: 12, a: 3 }]]);                    // basit kirişte üçgen: wL²/12
yakin(r.acikliklar[0].Macik, 12 * 36 / 12);
r = surekliKiris([3, 6, 4], [[duz(8)], [{ w: 15, a: 2 }], [{ w: 9, a: 2 }, duz(4)]]); // denge: ΣR = ΣW
yakin(r.R.reduce((a, b) => a + b), 24 + 15 * 4 + 9 * 2 + 16);

// Dama yüklemesi: iki açıklıkta yalnız bir açıklık yüklüyken açıklık momenti 49wL²/512 (hepsi yüklüden büyük).
r = surekliKiris([5, 5], [[duz(10)], []]);
yakin(r.acikliklar[0].Macik, 49 * 10 * 25 / 512);
const z = zarf([5, 5], [[], []], [[duz(10)], [duz(10)]]);               // yalnız Q: 1,6·(49/512)wL², mesnet 1,6·wL²/8
yakin(z[0].MdAcik, 1.6 * 49 * 10 * 25 / 512); yakin(z[0].MdMesnet, 1.6 * 31.25);
for (const [v, beklenen] of [[z[0].MdSolUst, 0], [z[0].MdSagUst, 50], [z[1].MdSolUst, 50], [z[1].MdSagUst, 0]]) yakin(v, beklenen);
// Üç açıklığın yalnız ilki yüklü: uzaktaki mesnette pozitif moment oluşur.
const zUclar = zarf([4, 4, 4], [[], [], []], [[duz(10)], [], []]);
yakin(zUclar[1].MdSolUst, 1.6 * 32 / 3); yakin(zUclar[1].MdSagAlt, 1.6 * 8 / 3);
yakin(zUclar[2].MdSolAlt, zUclar[1].MdSagAlt);
yakin(zUclar[1].MdOrtaUst, 6.4); // yüksüz açıklıkta ortadaki moment, iki ucun aritmetik ortalaması
const zAnk = zarf([5], [[duz(10)]], [[]], [true, true]);
yakin(zAnk[0].MdSolUst, 1.4 * 10 * 25 / 12); yakin(zAnk[0].MdSagUst, zAnk[0].MdSolUst);
assert.deepEqual(desenler(4).slice(3), [[true, true, false, true], [false, true, true, false], [true, false, true, true]]);

// 45° dağıtımı: dört kenarın toplamı pano yüküne eşit; L/s > 2'de kısa kenar yük almaz.
for (const [lx, ly] of [[4, 4], [4, 6], [5, 3], [3, 7]]) {
  const p = 9.5, top = [lx, lx, ly, ly].reduce((t, Le) => t + parcaToplam(kenarParcasi(Le, lx, ly, p), Le), 0);
  yakin(top, p * lx * ly);
}
assert.equal(kenarParcasi(3, 3, 7, 10).w, 0);

// Aks ağı: 3 × 2 açıklık → 6 döşeme, 3+4 hat, 12 kolon; kenar sürekliliği.
const ag = agKur([4, 5, 4], [5, 5]);
assert.equal(ag.dosemeler.length, 6); assert.equal(ag.kolonlar.length, 12);
assert.equal(ag.hatlar.length, 7); assert.equal(ag.hatlar.flatMap(h => h.kirisler).length, 3 * 3 + 2 * 4);
assert.deepEqual(ag.dosemeler[1].kenar, { alt: false, ust: true, sol: true, sag: true });

// Zincir (döşeme → kiriş → kolon → radye): boyut bulunur, her koşul sağlanır, yük kaybolmaz.
const G0 = { ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, H: 3000, beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: 500, disGen: 120,
  dolgu: 0.5, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, dosemeDuvar: true, sds: 1, kDeprem: 1, zemin: 400, Df: 1.5,
  tasma: 0.75, kolonOzel: {} };
assert.deepEqual(girdiDenetle(G0), {});
const tumu = r => [...r.dosemeler, ...r.seritler, ...r.zimbD, ...r.kirisler, ...r.kolonlar, r.radye, ...r.radyeSerit, ...r.radyeZimb];
for (const tur of ['plak', 'disli', 'kaset', 'kirissiz']) {
  const r = zincirHesap({ ...G0, dosemeTuru: tur });
  assert.ok(tumu(r).every(e => e.gecti), `${tur}: uygun olmayan eleman var`);
  // Kat başına uygulanan G (döşeme + duvar + kiriş gövdesi + kolon): kolonlara iner, alan payı alt sınırı yüzünden biraz fazlası
  const plan = 13 * 9.5, hat = h => h.L.reduce((a, b) => a + b, 0);
  const duvar = r.ag.hatlar.reduce((a, h) => a + hat(h) * (h.dis ? 6 : 3), 0);
  // F9 — kiriş gövdesi b × h dolu beton eksi döşemenin kiriş izine yayılmış öz ağırlığı (dişli/kasette ortalama yoğunluk; TS 498 1.3)
  const dis = { disli: 120 / 620, kaset: (2 * 120 * 620 - 120 ** 2) / 620 ** 2 }[tur];
  const ozD = dis ? (r.tabla + dis * (r.h - r.tabla)) * 25 / 1000 + 0.5 * (1 - dis) : r.h * 25 / 1000;
  const govde = r.kirisler.reduce((a, e) => a + e.L * e.b / 1000 * (e.h / 1000 * 25 - ozD), 0);
  if (tur === 'disli') yakin(r.kirisler[0].gOrt, 6 + r.kirisler[0].b / 1000 * (r.kirisler[0].h / 1000 * 25 - ozD)); // K1: döşeme yükü almaz
  const kolon = r.kolonlar.reduce((a, c) => a + c.b * c.h / 1e6 * 3 * 25, 0);
  const g1 = r.dosemeler[0].gAlan - (tur === 'kirissiz' ? (13 + 2 * 9.5) * 3 / plan : 0);
  const katG = plan * g1 + duvar + govde + kolon, sNG = r.kolonlar.reduce((a, c) => a + c.NG, 0) / 5;
  assert.ok(sNG >= katG - 1e-6 && sNG <= 1.25 * katG, `${tur}: ΣN_G/kat ${sNG} ↔ ${katG}`);
  yakin(r.katYukAlan, (katG + plan * 2) / plan);
  for (const c of r.kolonlar) { yakin(c.Nd, 1.4 * c.NG + 1.6 * c.NQ); assert.ok(c.rho >= 0.01 - 1e-9 && c.rho <= 0.04); }
  assert.ok(r.radye.h >= 300 && r.radye.qo <= r.radye.qt + 1e-9);
  if (tur === 'plak') assert.ok(r.dosemeler.every(d => r.h >= d.hMin));
  if (tur === 'kirissiz') assert.ok(r.h >= 200 && r.h >= 5000 / 30 && r.kirisler.length === 0 && r.zimbD.length === 12);
  if (tur === 'disli') assert.ok(r.tabla === 70 && r.dosemeler.every(d => d.maddeler.find(m => m.ad === 'Dişte kesme').gecti));
  // F8 — diş kiriş gibi donatılır (TS 500 11.3.3, 7.3: boyuna ≥ φ12): diş alt/üst ve kaset dik diş çubukları kiriş takımından
  if (tur === 'disli' || tur === 'kaset') assert.ok(r.dosemeler.every(d => [d.disAlt, d.disUst, tur === 'kaset' ? d.uzunAlt : 'φ12'].every(x => /φ(12|14|16)$/.test(x))));
}
const zr = zincirHesap(G0);
assert.equal(zr.beta, 0.88);                                                   // TS 498 Çizelge 8, 5 kat konut
// Majör ve minör için her yüzdeki çubuklar yazılır; köşeler her iki yönde ortak, toplamda bir kez sayılır.
for (const [b, h, major, minor] of [[300, 350, '2φ16/yüz (kısa yüz)', '3φ16/yüz (uzun yüz)'], [350, 300, '2φ16/yüz (kısa yüz)', '3φ16/yüz (uzun yüz)'],
  [300, 300, '3φ14/yüz (b, kare)', '2φ14/yüz (h, kare)']]) {
  const c = zincirHesap({ ...G0, ax: [4], ay: [4], katSayisi: 1, kolonOzel: { S1: { b, h } } }).kolonlar[0];
  assert.equal(c.boyunaMajor, major); assert.equal(c.boyunaMinor, minor);
  assert.equal(2 * (c.nb + c.nh) - 4, Number(c.boyuna.split('φ')[0]));
}
{ const c = zr.kolonlar[0], rows = zr.katKolonYukleri.filter(x => x.ad === c.ad);
  assert.equal(rows.length, 5); assert.deepEqual(rows.map(x => x.kat), [1, 2, 3, 4, 5]);
  yakin(rows[0].NG, c.NG); yakin(rows[0].NQ, c.NQ); yakin(rows[0].Nd, c.Nd);
  yakin(rows[4].NG, c.NG / 5); yakin(rows[4].NQ, c.Q1Ham); // üst kat β=1; zemin β=0,88
  yakin(rows[1].NQ, c.Q1Ham * 4 * 0.95); yakin(rows[4].Nd, 1.4 * rows[4].NG + 1.6 * rows[4].NQ);
}
// Duvar taşıyan kirişte sehim sınırı ℓn/480 (TS 500 Çizelge 13.3)
for (const e of zr.kirisler) yakin(e.sehim.sinir, e.ln * 1000 / 480);
// Kirişte donatı ≥ en küçük oran; mesnet altı ≥ 0,5·üst (TBDY 7.4.2)
for (const e of zr.kirisler) assert.ok(e.AsAlt >= 0.5 * e.AsUst - 1e-6 && e.AsUst >= 0.8 * (0.35 * Math.sqrt(30) / 1.5) / (420 / 1.15) * e.b * (e.h - 75) - 1e-6);
// Asimetrik mesnette ilaveler yalnız gerektiği uçta; moment ortada tersine dönerse sürekli üst donatı karşılar.
const detayKiris = (ax, h = 450, b = 300) => kirisBul(agKur(ax, [5]), G0, malzeme(30, 420),
  { h: 120, gAlan: 5, qAlan: 2 }, () => ({ b: 350, h: 350 }), { ozel: { A: { b, h } } })
  .kirisler.find(e => e.hat === 0 && e.L === Math.min(...ax));
const as = metin => {
  if (metin === 0) return 0;
  const [, n, phi] = String(metin).match(/^(\d+)φ(\d+)/);
  return Number(n) * alan(Number(phi));
};
const sagEk = detayKiris([2, 7]), solEk = detayKiris([7, 2]);
assert.deepEqual([sagEk.solUstEk, sagEk.solAltEk, solEk.sagUstEk, solEk.sagAltEk], [0, 0, 0, 0]);
assert.match(sagEk.sagUstEk, /^[1-9]\d*φ/);
assert.match(sagEk.sagAltEk, /^[1-9]\d*φ/);
assert.deepEqual([solEk.solUstEk, solEk.solAltEk, solEk.govde], [sagEk.sagUstEk, sagEk.sagAltEk, sagEk.govde]);
assert.equal(sagEk.orta, `${sagEk.montaj} / ${sagEk.duz}`);
const mesnetUst = as(sagEk.montaj) + as(sagEk.sagUstEk), mesnetAlt = as(sagEk.duz) + as(sagEk.sagAltEk);
assert.ok(mesnetAlt >= mesnetUst / 2 && as(sagEk.montaj) >= mesnetUst / 4);
assert.match(sagEk.govde, /^[1-9]\d*φ(?:12|14|16)\/yüz$/);
assert.ok(2 * as(sagEk.govde) >= 0.30 * (mesnetUst + mesnetAlt));
assert.equal(detayKiris([4, 5]).govde, 0);
assert.ok(2 * as(detayKiris([5], 750).govde) >= 0.001 * 300 * (750 - 50)); // TS 500 tek başına devrede
const yuksekKiris = detayKiris([1], 650);
assert.equal(yuksekKiris.govde, 'Özel hesap gerekli'); assert.equal(yuksekKiris.gecti, false);
assert.equal(detayKiris([2, 7], 450, 200).sagUstEk, 'Sığmıyor');
// Kalkma uyarısı: G altında pozitif, 1,4G + 1,6Q (yalnız uzun açıklık yüklü) altında negatif uç tepki
assert.ok(zincirHesap({ ...G0, ax: [4.2, 8], ay: [5] }).notlar.some(n => n.includes('kalkıyor')));
const kisa = zincirHesap({ ...G0, ax: [2, 8], ay: [5] });
assert.ok(kisa.kolonlar.every(c => c.NG > 0 && c.NQ >= 0 && c.tur === 'kolon'));
// Kare panoda Çizelge 11.1 durumu planın yönüne bağlı değil
const durumlar = r => r.dosemeler.map(d => d.durum).sort().join();
assert.equal(durumlar(zincirHesap({ ...G0, ax: [5, 5, 5], ay: [5] })), durumlar(zincirHesap({ ...G0, ax: [5], ay: [5, 5, 5] })));
// Kullanıcının kolon boyutu korunur; girdi hatası yakalanır
assert.equal(zincirHesap({ ...G0, kolonOzel: { S6: { b: 300, h: 300 } } }).kolonlar[5].b, 300);
assert.ok(girdiDenetle({ ...G0, ax: [4, -1] }).ax && girdiDenetle({ ...G0, katSayisi: 2.5 }).katSayisi && girdiDenetle({ ...G0, disAralik: 800, dosemeTuru: 'disli' }).disAralik);
assert.ok(girdiDenetle({ ...G0, dosemeTuru: 'disli', disGen: 100 }).disGen && !girdiDenetle({ ...G0, dosemeTuru: 'disli', disGen: 105 }).disGen); // F8: 2φ12 sığmalı
// Diş genişliği maddesi girdi sınırıyla aynı (≥ 105); 80 adım sınırında dönen h panoların tasarlandığı h (h + 10 dönüyordu)
const r104 = zincirHesap({ ...G0, dosemeTuru: 'kaset', disGen: 104 });
assert.ok(r104.dosemeler.every(d => d.h === r104.h && !d.maddeler.find(m => m.ad === 'Diş genişliği').gecti));
// F1 — TS 500 9.5.2: kolon boyuna çubukları yüze tek sırada sığar (net ≥ max(1,5φ; 40 mm)); 8 m açıklıkta 66φ14 sığmıyordu.
// %1 bile sığmayan kesitte büyüme durur (sınırsız büyüme yok).
import { alan, kolonYuzMax } from './donati.js';
import { boyunaDonati } from './kolon.js';
for (const c of zincirHesap({ ...G0, katSayisi: 3, ax: [8, 8, 8], ay: [8, 8] }).kolonlar) {
  const [n, phi] = c.boyuna.split('φ').map(Number);
  assert.ok(c.gecti && 2 * (c.nb + c.nh) - 4 === n && c.nb <= kolonYuzMax(c.b, phi) && c.nh <= kolonYuzMax(c.h, phi), `${c.ad} ${c.b}×${c.h} ${c.boyuna} sığmaz`);
}
assert.deepEqual(boyunaDonati(1500, 1500, 5000, { fck: 30, fyk: 420, fcd: 20, fctd: 1.278, fyd: 365.2, k1: 0.82 }, null, null), { sigmaz: true, enAz: true });
// Dikdörtgen kesitte eşit dağılım kısa yüze sığmıyorsa çubuklar uzun yüze kayar: 1100×1400 %1 = 78φ16 → 19/22 (19 ve 24 sığar); 'sığmaz' veriliyordu
for (const c of zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [8, 8, 8], ay: [8, 8], katSayisi: 12 }).kolonlar) {
  const [n, phi] = c.boyuna.split('φ').map(Number);
  assert.ok(c.gecti && 2 * (c.nb + c.nh) - 4 === n && c.nb <= kolonYuzMax(c.b, phi) && c.nh <= kolonYuzMax(c.h, phi), `${c.ad} ${c.b}×${c.h} ${c.boyuna}`);
}
// %1 sığmayınca büyüme durur, ama eksenel/kesit koşulları sağlanmadan değil (S2 1300×1300'de eksenel sınır aşılmış duruyordu)
assert.ok(zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [15, 15], ay: [15, 15], katSayisi: 40, q: 10 }).kolonlar
  .every(c => c.maddeler.filter(m => /Brüt kesit|Eksenel sınır/.test(m.ad)).every(m => m.gecti)));
// Öz ağırlığın birim alan payı sınırı aşınca (k·(1 + 0,2·S_DS)·n·H·γ ≥ 0,40·fck) büyütme boşuna: durur, Brüt kesit sağlanmaz, not düşülür
// (kirişsizde 165 m'ye koşuyordu)
const rO = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [15, 15], ay: [15, 15], katSayisi: 40, H: 8000, kDeprem: 2, sds: 2, q: 10 });
assert.ok(rO.kolonlar.every(c => Math.max(c.b, c.h) <= 4500 && !c.maddeler.find(m => m.ad === 'Brüt kesit alanı').gecti) && rO.notlar.some(x => x.includes('öz ağırlığı')));
// Kolonlar açıklığı kapatınca (ℓn = 0) kirişte 'Net açıklık' sağlanmaz, kullanımlar sonlu (sehim 0/0 = NaN/∞), hattın öbür kirişleri şişmez
const kN = zincirHesap({ ...G0, kolonOzel: { S1: { b: 4000, h: 4000 }, S2: { b: 4000, h: 4000 } } }).kirisler;
assert.ok(kN[0].ln === 0 && kN[0].maddeler.some(m => m.ad === 'Net açıklık' && !m.gecti) && kN.every(e => e.maddeler.every(m => m.kullanim == null || Number.isFinite(m.kullanim)))
  && kN.filter(e => e.hat === kN[0].hat && e !== kN[0]).every(e => e.gecti && e.h <= 500));
// F4 — yüz başına çubuk eksen eksen sayılır (6φ14 → 3/2) ve etriye kolu yüzdeki çubuktan çok olamaz (TBDY 7.3.4 → 7.2.8);
// 300×300 6φ14'e 4×4 kol veriliyordu.
for (const c of zincirHesap({ ...G0, katSayisi: 3, ax: [4, 4, 4], ay: [4, 4] }).kolonlar) {
  const [kx, ky] = c.kol.split('×').map(x => parseInt(x, 10));
  assert.ok(c.gecti && kx <= c.nb && ky <= c.nh && 2 * (c.nb + c.nh) - 4 === +c.boyuna.split('φ')[0], `${c.ad} ${c.boyuna} kol ${c.kol}`);
}
// F5 — TS 500 9.5.2 en küçük aralık (φ8/φ10 ≥ 40, φ12–16 ≥ 50 mm): geçen döşeme/şerit/radye şeridinde aralık kodda; radyede
// φ16/0 ('sonsuz' çelik) geçiyordu; en az donatı sığmayınca kalınlaştırma durur (h sınırlı).
import { sKod } from './donati.js';
const kodda = xs => xs.every(x => { const [, p, a] = /φ(\d+)\/(\d+)/.exec(x).map(Number); return a >= sKod(p); });
const r12 = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [12, 12, 12], ay: [12, 12], q: 10, katSayisi: 8 });
assert.ok([...r12.seritler, ...r12.radyeSerit].every(s => !s.gecti || kodda([s.csUst, s.csAlt, s.msUst, s.msAlt])) && r12.radyeSerit.some(s => !s.gecti) && r12.h <= 1200);
// s = 0 (φ16/0) çubukta eğilme geçmez, kullanım sonlu (Eğilme kul = ∞ ile 'yeter' ve belirleyici görünüyordu)
assert.ok([...r12.seritler, ...r12.radyeSerit].every(s => { const m = s.maddeler.find(x => x.ad === 'Eğilme');
  return Number.isFinite(m.kullanim) && (!m.gecti || [s.csUst, s.csAlt, s.msUst, s.msAlt].every(x => !/\/0$/.test(x))); }));
assert.ok(zincirHesap({ ...G0, ax: [14, 14], ay: [14], q: 10, katSayisi: 1 }).dosemeler.every(d => d.gecti && kodda([d.kisaAlt, d.uzunAlt, d.kisaUst, d.uzunUst])));
// F7 — TS 500 11.2.2/11.3.2: dişli (ve tek doğrultulu) döşeme kirişe sürekli şerit tepkisiyle yük verir; iki açıklıkta iç kiriş
// 1,25 × alan payı (q 8 → 10 kN/m), kenar kiriş alan payının altına inmez.
const k7 = zincirHesap({ ...G0, dosemeTuru: 'disli', ax: [6, 6, 6], ay: [4, 4] }).kirisler;
yakin(k7.find(e => e.ad === 'K4').qOrt, 1.25 * 2 * 4); yakin(k7.find(e => e.ad === 'K1').qOrt, 2 * 4 / 2);
// F2 — kirişsizde dış duvar döşeme kenarından kolona iner: köşe zımbalamasında V ≥ p_d·A + 1,4·6·(2 + 2,5); kenar şeridinde duvar Mo'su
const rK = zincirHesap({ ...G0, dosemeTuru: 'kirissiz' }), sK = rK.seritler.find(s => s.ad === 'ŞY1-1');
assert.ok(rK.zimbD[0].Nd >= rK.dosemeler[0].pd * 2 * 2.5 + 1.4 * 6 * 4.5 - 1e-6); yakin(sK.c.MoW, 1.4 * 6 * sK.c.ln ** 2 / 8);

// Zımbalama: iç kare kolonda Denk. 8.22 = Denk. 8.24
import { zimbalama } from './doseme.js';
const fctd30 = 0.35 * Math.sqrt(30) / 1.5;
const zi = zimbalama({ V: 500, p: 0, b: 400, hk: 400, d: 200, Mx: 50, fctd: fctd30 });
yakin(zi.gam, 1 / (1 + 1.5 * (0.4 * 50 / 500) / 0.6)); yakin(zi.up, 2.4);
const zk = zimbalama({ V: 300, p: 0, b: 300, hk: 300, d: 200, kx: 0, fctd: fctd30 });
assert.ok(zk.acik && Math.abs(zk.up - (2 * 0.4 + 0.5)) < 1e-9);                // U çevre: 2·(b + d/2) + (h + d)
// Sehim: basit kiriş, düzgün yük 5wl⁴/(384EI)
import { sehimDeger } from './sehim.js';
yakin(sehimDeger(5000, 32000, 1e9, 20 * 25 / 8, 0, 0), 5 * 20 * 5000 ** 4 / (384 * 32000 * 1e9));
// Kolon: N = 0'da moment kapasitesi tek donatılı kesite yakın
import { kolonMr } from './kolon.js';
const mz30 = { fck: 30, fyk: 420, fcd: 20, fctd: fctd30, fyd: 420 / 1.15, k1: 0.82 };
assert.ok(Math.abs(kolonMr(400, 400, 402, 43, 0, mz30) - 402 * mz30.fyd * (357 - 402 * mz30.fyd / (0.85 * 20 * 400) / 2) / 1e6) < 2);
// F3 — TBDY 7.3.5.1: güçlü kolon her düğümde (alttaki kolon k, üstteki k − 1 kat; N = 0,9G·k/n), yalnız temelde değil;
// tek katlı binada aranmaz (7.3.5.3(b)) — 8 m açıklıkta S5 550×550'ye büyüyordu.
import { kirisMr } from './kolon.js';
const hatI = (yon, no) => zr.ag.hatlar.findIndex(t => t.yon === yon && t.no === no);
const kMr = (hi, u) => { const [s, d] = [u - 1, u].map(k => zr.kirisler.find(e => e.hat === hi && e.k === k)), m = (e, A) => e ? kirisMr(e[A], e.b, e.h - 50, mz30) : 0;
  return Math.max(m(s, 'AsUst') + m(d, 'AsAlt'), m(s, 'AsAlt') + m(d, 'AsUst')); };
for (const c of zr.kolonlar) {
  const phi = +c.boyuna.split('φ')[1], A = Math.PI * phi * phi / 4, { nb, nh } = c;
  for (let k = 2; k <= 5; k++) if (c.Nd * k / 5 * 1000 > 0.1 * c.b * c.h * 30) {
    const N = [k, k - 1].map(x => 0.9 * c.NG * x / 5), top = (b_, h_, Af) => N.reduce((t, x) => t + kolonMr(b_, h_, Af, 43, x, mz30), 0);
    assert.ok(top(c.h, c.b, nh * A) >= 1.2 * kMr(hatI('x', c.j), c.i) - 1e-6 && top(c.b, c.h, nb * A) >= 1.2 * kMr(hatI('y', c.i), c.j) - 1e-6, `${c.ad}: ${6 - k}. düğüm güçlü kolon`);
  }
}
// Faz 1: TBDY 7.5 birleşim kesmesi bu açıklıktaki çok donatılı kirişlerde kolonu büyütür; boyut sınırı yerine kolonlar 350×350
// sabitken güçlü kolonun aranmadığı ve yalnız birleşim kesmesinin sağlanmadığı denetlenir.
const k8 = { ...G0, katSayisi: 1, ax: [8, 8], ay: [8, 8] }, s350 = Object.fromEntries(agKur([8, 8], [8, 8]).kolonlar.map(c => [c.ad, { b: 350, h: 350 }]));
assert.ok(zincirHesap(k8).kolonlar.every(c => /7\.3\.5\.3\(b\)/.test(c.maddeler.find(m => m.ad === 'Güçlü kolon').deger)));
assert.ok(zincirHesap({ ...k8, kolonOzel: s350 }).kolonlar.every(c => c.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Birleşim kesmesi')));
// F6 — TBDY 7.4.5.1/7.4.5.3: kiriş orta bölge etriyesi V_e için (V_c = 0,8·V_cr); K5'te φ8/160 V_e'nin 1/1,31'ini karşılıyordu.
for (const e of zincirHesap({ ...G0, ax: [6, 7, 6], ay: [6, 6], q: 3.5, duvarIc: 6 }).kirisler) {
  const [phi, s] = e.etrOrta.slice(1).split('/').map(Number), d = e.h - 50;
  assert.ok(0.8 * 0.65 * fctd30 * e.b * d / 1000 + 2 * Math.PI * phi * phi / 4 * mz30.fyd * d / s / 1000 >= Math.max(e.Vd, e.Ve) - 1e-6, `${e.ad}: orta bölge V_r < V_e`);
}
// Büyüme sınırı: yalnız etriye yetmeyen kirişte büyütme V_e'yi artırır; iyileşmeyince durur (1300×3150'ye koşuyordu), açıklama iz'de
const kE = zincirHesap({ ...G0, dosemeTuru: 'disli', disGen: 105, ax: [11, 8.8, 11], ay: [11, 11], q: 5, katSayisi: 3 }).kirisler;
assert.ok(kE.every(e => e.b <= 900 && (e.gecti || e.iz.some(x => x.includes('büyütme durduruldu')))));


// ── Faz 1
const tr2 = x => x.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
// 3. Duvar türü: kirişte kN/m² × (H − kiriş h), dış/iç ayrı; tür seçiliyken elle kN/m denetlenmez; kirişsizde H − döşeme h
const rD = zincirHesap({ ...G0, duvarDisTur: 'tugla19', duvarIcTur: 'gazbeton20' });
for (const e of rD.kirisler) { const dis = rD.ag.hatlar[e.hat].dis; yakin(e.duvar, (dis ? 2.7 : 1.8) * (3000 - e.h) / 1000); assert.ok(e.iz.some(x => x.includes('kN/m² ×'))); }
assert.ok(!girdiDenetle({ ...G0, duvarDisTur: 'tugla19', duvarDis: NaN }).duvarDis && girdiDenetle({ ...G0, duvarIcTur: 'kerpic' }).duvarIcTur && girdiDenetle({ ...G0, kullanim: 'x' }).kullanim);
const rDK = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', duvarDisTur: 'tugla19' }), wD = 2.7 * (3000 - rDK.h) / 1000;
assert.ok(rDK.zimbD[0].Nd >= rDK.dosemeler[0].pd * 2 * 2.5 + 1.4 * wD * 4.5 - 1e-6 && rDK.notlar.some(x => x.includes(`${tr2(2.7)} kN/m² × ${(3000 - rDK.h).toLocaleString('tr-TR')} mm`)));
// 4. Birleşim (TBDY 7.5): V_e = 1,25·fyk·(A_s1 + A_s2) (V_kol = 0), b_j = min(kolon genişliği; b_w + h), kuşatılmamış 1,0·b_j·h·√fck
for (const c of zr.kolonlar) {
  const at = (yon, k) => zr.kirisler.find(e => e.hat === hatI(yon, yon === 'x' ? c.j : c.i) && e.k === k);
  const oran = ['x', 'y'].map(yon => { const u = yon === 'x' ? c.i : c.j, [s, d] = [at(yon, u - 1), at(yon, u)], As = Math.max((s?.AsUst ?? 0) + (d?.AsAlt ?? 0), (s?.AsAlt ?? 0) + (d?.AsUst ?? 0));
    const hj = yon === 'x' ? c.b : c.h, bj = Math.min(yon === 'x' ? c.h : c.b, Math.min(...[s, d].filter(Boolean).map(e => e.b)) + hj), kus = c.maddeler.find(m => m.ad === 'Birleşim kesmesi').sinir.includes('kuşatılmış');
    return 1.25 * 420 * As / 1000 / ((kus ? 1.7 : 1) * bj * hj * Math.sqrt(30) / 1000); });
  const m = c.maddeler.find(m => m.ad === 'Birleşim kesmesi'); yakin(m.kullanim, Math.max(...oran)); assert.ok(m.gecti && c.etrBirlesim);
}
// 5. Kolon kesmesi (TBDY 7.3.7): V_e ≤ 0,85·A_w·√fck ve orta bölgede V_c + V_w ≥ V_e (X'i h boyunca ky kol, Y'yi kx kol taşır)
for (const c of zr.kolonlar) {
  const [phi, s] = c.etrOrta.slice(1).split('/').map(Number), A = Math.PI * phi * phi / 4, vc = (bw, d) => 0.8 * 0.65 * fctd30 * bw * d * (1 + 0.07 * c.Nd / 5 * 1000 / (c.b * c.h)) / 1000;
  assert.ok(vc(c.h, c.b - 45) + c.ky * A * 365.2 * (c.b - 45) / s / 1000 >= c.VeX - 0.5 && vc(c.b, c.h - 45) + c.kx * A * 365.2 * (c.h - 45) / s / 1000 >= c.VeY - 0.5, `${c.ad} kesme`);
  assert.ok(Math.max(c.VeX, c.VeY) <= 0.85 * c.b * c.h * Math.sqrt(30) / 1000 && c.maddeler.find(m => m.ad === 'Kolon kesmesi').gecti);
}
// 6. Narinlik (TS 500 7.6.2): α = 1,5 → ötelenmede k = (20 − α)/20·√(1 + α) (Denk. 7.15), önlenmişte 0,7 + 0,05·2α ≤ 0,85 + 0,05α (7.14)
import { narinlik, katNarinlik } from './kolon.js';
const Ic3 = 300 ** 4 / 12, nr = t => narinlik({ bw: 300, hd: 300, ln: 2600, H: 3000, n: 5, kirisR: 2 * Ic3 / 3000 / 1.5, Nd: 1000, Ngd: 800, fck: 30, tutulu: t });
yakin(nr(false).lamMax, 18.5 / 20 * Math.sqrt(2.5) * 2600 / 90); yakin(nr(true).lamMax, 0.85 * 2600 / 90); assert.ok(nr(false).beta > nr(true).beta && nr(true).beta >= 1);
// λ > 100 (H = 8 m, sabit 300×300, kirişsiz, ötelenmeli): yaklaşık yöntem dışı, 'Narinlik' sağlanmaz, kullanım sonlu
const rN = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', yanalTutulu: false, H: 8000, kolonOzel: { S1: { b: 300, h: 300 } } }).kolonlar[0].maddeler.find(m => m.ad === 'Narinlik');
assert.ok(!rN.gecti && Number.isFinite(rN.kullanim) && rN.kullanim > 1);
// Kiriş rijitleştirmesi (TS 500 7.6.2.2, Denk. 7.15–7.16): kirişlide aynı kolonun narinliği kirişler yükseltilerek sağlanır (λ ≤ 100),
// yükseltilen hatlar not ve kiriş iz'inde; 1000 mm sınırı aşılmaz
const rR = zincirHesap({ ...G0, H: 8000, kolonOzel: { S1: { b: 300, h: 300 } } });
assert.ok(rR.kolonlar[0].maddeler.find(m => m.ad === 'Narinlik').gecti && rR.kirisler.some(e => e.h > 400) && rR.kirisler.every(e => e.h <= 1000)
  && rR.notlar.some(x => x.includes('rijitleştirildi')) && rR.kirisler.some(e => e.iz.some(x => x.includes('Kolon narinliği için kiriş yüksekliği'))));
// Kolon kirişe göre çok rijitse (4000×4000 sabit) rijitleştirme boşuna: iyileşmeyen hat büyütülmez
assert.ok(zincirHesap({ ...G0, kolonOzel: { S1: { b: 4000, h: 4000 }, S2: { b: 4000, h: 4000 } } }).kirisler.every(e => e.h <= 500));
// 7. Çift etriye: bir doğrultuda ≥ 4 kol → kol alanında 'çift etriye'
assert.ok(zr.kolonlar.every(c => /çift etriye/.test(c.kol) === Math.max(c.kx, c.ky) >= 4) && zr.kolonlar.some(c => c.ciftEtriye));

// ── Perde (TBDY 7.6, TS 500 7.6.2.1)
import { perdeOku, perdeYaz, perdeKirp, duraylilik } from './perde.js';
import { surekliKiris as sk } from './mekanik.js';
// Ankastre uç (perdeye saplanan kiriş): iki ucu ankastre −wL²/12, bir ucu ankastre −wL²/8 (diğer uç 0); denge korunur
r = sk([6], [[duz(10)]], [true, true]); yakin(r.M[0], -30); yakin(r.M[1], -30); yakin(r.R[0] + r.R[1], 60);
r = sk([6], [[duz(10)]], [true, false]); yakin(r.M[0], -45); yakin(r.M[1], 0); yakin(r.R[0], 37.5);
r = sk([4, 5], [[duz(10)], [duz(8)]], [false, true]); yakin(r.R.reduce((a, b) => a + b), 80); assert.ok(r.M[2] < 0 && r.M[0] === 0);
// Girdi metni: tire türü, boşluk, küçük harf, ters yazım ("1–2/A"), ayraç ; , satır; bitişik açıklıklar birleşir
assert.deepEqual(perdeOku(' a/2-3 , 1 / A — B ;B/1–2\nb/2-3; 2–1/C ').liste,
  [{ yon: 'x', no: 0, k0: 1, k1: 1 }, { yon: 'x', no: 1, k0: 0, k1: 1 }, { yon: 'x', no: 2, k0: 0, k1: 0 }, { yon: 'y', no: 0, k0: 0, k1: 0 }]);
assert.equal(perdeYaz(perdeOku('a/2-3, 1/a-b, b/1-2, b/2-3').liste), 'A/2–3; B/1–3; 1/A–B');
assert.equal(perdeOku('A/1-3').liste[0].k1, 1); assert.deepEqual(perdeOku('').liste, []);
assert.equal(perdeOku('A/1-2; A/B-C; 3; 0/A-B; A/2-2').hata.length, 4);           // harfli aksta harfli açıklık, biçim, 0 aks, aynı aks
assert.ok(girdiDenetle({ ...G0, perdeler: 'A/4–5' }).perdeler.includes('planda yok') && !girdiDenetle({ ...G0, perdeler: 'C/3–4; 4/A–C' }).perdeler);
assert.ok(girdiDenetle({ ...G0, perdeler: 'A/1-2', perdeKal: 100 }).perdeKal && !girdiDenetle({ ...G0, perdeKal: 100 }).perdeKal);
assert.equal(perdeYaz(perdeKirp(perdeOku('A/2–4; 3/A–C; C/1–2').liste, 2, 1)), 'A/2–3; 3/A–B'); // aks azalınca kırpılır (C aksı yok)
// Varsayılan plan + A/2–3 (X) ve 1/A–B (Y) perdeleri
const GP = { ...G0, perdeler: 'A/2–3; 1/A–B' }, rp = zincirHesap(GP), [P1, P2] = rp.perdeler;
assert.ok(tumu(rp).every(e => e.gecti) && rp.perdeler.every(e => e.gecti) && rp.radyePerde.every(e => e.gecti), 'perdeli varsayılan plan uygun');
// Uç kolonlar kolon değil perde uç bölgesi; perde açıklığında kiriş yok; zımbalama yalnız kolonlarda
assert.deepEqual(rp.kolonlar.map(c => c.ad), ['S4', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']);
assert.deepEqual([P1.uclar, P2.uclar], [['S2', 'S3'], ['S1', 'S5']]);
assert.ok(!rp.kirisler.some(e => ['K2', 'K10'].includes(e.ad)) && rp.kirisler.length === 15);
assert.deepEqual(rp.radyeZimb.map(z => z.kolon), rp.kolonlar.map(c => c.ad));
// Perdeye saplanan kiriş ucu ankastre: K1 (A/1–2) sağ ucunda mesnet momenti; perdesiz planda K1'in iç mesneti S2 de süreklidir
assert.ok(rp.kirisler.find(e => e.ad === 'K1').iz.some(x => x.includes('ankastre')));
// Yük korunur: kat başına uygulanan G (döşeme + duvar [perde açıklığı dahil] + kiriş gövdesi + kolon ve perde öz ağırlığı) kolon ve
// perdelere iner (alan payı alt sınırı yüzünden biraz fazlası); radyeye giden ΣN_d = Σ(kolon + perde) N_d
{ const plan = 13 * 9.5, n = 5, dis = 0, ozD = rp.h * 25 / 1000;
  const duvar = rp.ag.hatlar.reduce((a, h) => a + h.L.reduce((x, y) => x + y, 0) * (h.dis ? 6 : 3), 0);
  const govde = rp.kirisler.reduce((a, e) => a + e.L * e.b / 1000 * (e.h / 1000 * 25 - ozD), 0);
  const oz = rp.kolonlar.reduce((a, c) => a + c.b * c.h / 1e6 * 3 * 25, 0) + rp.perdeler.reduce((a, e) => a + e.bw * e.lw / 1e6 * 3 * 25, 0);
  const katG = plan * rp.dosemeler[0].gAlan + duvar + govde + oz, el = [...rp.kolonlar, ...rp.perdeler];
  const sNG = el.reduce((a, c) => a + c.NG, 0) / n, sNQ = el.reduce((a, c) => a + c.NQ, 0) / n / rp.beta;
  assert.ok(sNG >= katG - 1e-6 && sNG <= 1.25 * katG, `perdeli ΣN_G/kat ${sNG} ↔ ${katG}`);
  assert.ok(sNQ >= plan * 2 - 1e-6 && sNQ <= 1.25 * plan * 2, `perdeli ΣN_Q/kat ${sNQ}`);
  yakin(rp.katYukAlan, (katG + plan * 2) / plan, 0.25);
  for (const e of el) yakin(e.Nd, 1.4 * e.NG + 1.6 * e.NQ);
  yakin(rp.radye.iz[0].includes('perde') ? el.reduce((a, c) => a + c.Nd, 0) : NaN, Number(rp.radye.iz[0].match(/ΣN_d = ([\d.]+)/)[1].replace(/\./g, '')), 1e-3); }
// Perde koşulları (TBDY 7.6): ℓw = eksen + b_w; ℓw/b_w ≥ 6; b_w ≥ max(250; H/16; ℓw/30); A_c ≥ N_dm/(0,35·fck); ℓu ≥ max(0,2ℓw; 2b_w);
// uç boyuna ≥ max(0,002·A_c; 4φ14), çaplar φ12/14/16, etriye φ8/10/12 ve s ≤ min(150; 6φ; b_w/3); gövde iki yüz ρ ≥ 0,0025, s ≤ 250;
// V_r = A_ch·(0,65·fctd + ρsh·fywd) yalnız bilgi (not), deprem etkileri not
for (const e of rp.perdeler) {
  const m = ad => e.maddeler.find(x => x.ad === ad), [n, phi] = e.ucBoyuna.split('φ').map(Number), [pe, s] = e.ucEtriye.slice(1).split('/').map(Number);
  const [pg, sg] = e.govdeDusey.slice(1).split('/').map(Number), fctd = 0.35 * Math.sqrt(30) / 1.5;
  assert.ok(e.lw === 5000 + e.bw && e.lw / e.bw >= 6 && e.bw >= Math.max(250, 3000 / 16, e.lw / 30) && e.Ndm <= 0.35 * 30 * e.bw * e.lw / 1000);
  assert.ok(e.lu >= Math.max(0.2 * e.lw, 2 * e.bw) && n * Math.PI * phi ** 2 / 4 >= Math.max(0.002 * e.bw * e.lw, 4 * Math.PI * 49) - 1e-6 && [12, 14, 16].includes(phi));
  assert.ok([8, 10, 12].includes(pe) && s <= Math.min(150, 6 * phi, e.bw / 3) && s >= 50 && 2 * Math.PI * pg ** 2 / 4 / (sg * e.bw) >= 0.0025 && sg <= 250);
  assert.ok(m('Kesme dayanımı').uyari && !m('Kesme dayanımı').gecti && m('Deprem etkileri').uyari);
  yakin(e.Vr, e.bw * e.lw * (0.65 * fctd + e.rhoSh * 420 / 1.15) / 1000); yakin(e.VeMax, 0.85 * e.bw * e.lw * Math.sqrt(30) / 1000);
  assert.deepEqual(['Uzun kenar/kalınlık', 'Perde kalınlığı', 'Net kesit alanı', 'Uç bölgesi boyu', 'Uç bölgesi boyuna donatı', 'Uç bölgesi etriyesi', 'Gövde donatısı'].map(a => m(a).gecti), Array(7).fill(true));
}
// Kalınlık koşulu sağlanmazsa büyür (150 → 250, TBDY 7.6.1.2), not iz'de; ℓw/b_w < 6 ise perde değil (açık madde, çökmez)
const rk = zincirHesap({ ...GP, perdeKal: 150 });
assert.ok(rk.perdeler.every(e => e.bw === 250 && e.iz.some(x => x.includes("150 mm'den 250 mm'ye"))));
const r6 = zincirHesap({ ...G0, ax: [4, 1.2, 4], perdeler: 'A/2–3' }).perdeler[0];
assert.ok(!r6.gecti && r6.tur !== 'perde' && r6.maddeler.some(m => m.ad === 'Perde tanımı' && !m.gecti));
// Eksenel sınır: çok katta ince perde N_dm/(0,35·fck) için kalınlaşır (sınırlı döngü)
const rE = zincirHesap({ ...GP, katSayisi: 30, perdeKal: 250 }).perdeler;
assert.ok(rE.every(e => e.Ndm <= 0.35 * 30 * e.bw * e.lw / 1000 + 1e-6 && e.bw <= 250 + 20 * 50));
// Yanal ötelenme (TS 500 Denk. 7.13): φ = 1,5·ΣN·Δ/(V·ℓ); tek katta konsol eğilme + kayma ile elle; perdeli doğrultu önlenmiş
{ const d = duraylilik({ perdeler: [{ bw: 250, lw: 5250 }], n: 1, H: 3000, W: 1000, Ec: 32000 });
  const EI = 32e6 * 0.25 * 5.25 ** 3 / 12, GA = 32e6 / 2.4 * 5 / 6 * 0.25 * 5.25;
  yakin(d.phi, 1.5 * 1000 * (3 ** 3 / (3 * EI) + 3 / GA) / 3); }
assert.ok(rp.yanal.x.tutulu && rp.yanal.y.tutulu && rp.yanal.x.phi < 0.05 && rp.notlar.some(x => x.includes('Denk. 7.13')));
assert.ok(rp.kolonlar.every(c => c.narinlik.every(x => x.tutulu) && c.iz.some(x => x.includes('önlenmiş — P'))));
const rX = zincirHesap({ ...G0, perdeler: 'A/2–3' });                                   // yalnız X'te perde
assert.ok(rX.yanal.x.tutulu && !rX.yanal.y.tutulu && rX.kolonlar.every(c => c.narinlik[0].tutulu && !c.narinlik[1].tutulu));
assert.ok(zincirHesap({ ...G0, yanalTutulu: true }).yanal.y.tutulu);                    // elle (çizilmeyen perdeler)
// 12 katta tek perde yetmez (φ > 0,05): kirişsizde de önlenmemiş sayılır, not perde eklemeyi söyler; zımbalama perde düğümünde yok
const rK12 = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [5, 5, 5], ay: [5, 5], katSayisi: 12, perdeler: 'A/2–3; 1/B–C' });
assert.ok(rK12.yanal.x.phi > 0.05 && !rK12.yanal.x.tutulu && rK12.notlar.some(x => x.includes('yetmiyor')) && rK12.notlar.some(x => x.includes('2 perde yerleştirildi')));
assert.ok(!rK12.zimbD.some(z => ['S2', 'S3', 'S5', 'S9'].includes(z.kolon)) && rK12.zimbD.length === 8);
const rK4 = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', ax: [5, 5, 5], ay: [5, 5], katSayisi: 12, perdeler: 'A/2–3; C/2–3; 1/B–C; 4/B–C' });
assert.ok(rK4.yanal.x.tutulu && rK4.yanal.y.tutulu && [...rK4.kolonlar, ...rK4.perdeler].every(e => e.gecti));
// Köşede birleşen perdeler (L): ortak düğüm yükü tek perdeye; iki ucu dik perdeyle tutulu perdede kalınlık H/20 (7.6.1.2(c))
const rL = zincirHesap({ ...G0, ax: [4], ay: [5], perdeler: 'A/1–2; 1/A–B; B/1–2; 2/A–B' });
assert.ok(rL.kolonlar.length === 0 && rL.perdeler.every(e => e.gecti && e.maddeler.find(m => m.ad === 'Perde kalınlığı').kaynak.includes('(c)')) && rL.radye.gecti);
// Perdesiz 12 katlı dişli (önceden yalnız narinlikten uygun değildi): kirişler rijitleştirilerek sağlanır
const rD12 = zincirHesap({ ...G0, dosemeTuru: 'disli', ax: [5, 5, 5], ay: [5, 5], katSayisi: 12 });
assert.ok(tumu(rD12).every(e => e.gecti) && rD12.notlar.some(x => x.includes('rijitleştirildi')));
// Radye: perde yükü çizgisel; perde yüzünden d uzakta kesme v = p_w·(b − b_w/2 − d), p_w = max(p; q_w/Σb)
for (const e of rp.radyePerde) { const P = rp.perdeler.find(x => x.ad === e.perde); yakin(e.qw, P.Nd / (P.lw / 1000)); assert.ok(e.maddeler[0].kaynak.includes('8.1.2')); }

// ── Elle verilen boyutlar (Excel hücreleri): araç büyütmez, bütün koşullarla denetler; yetmeyen madde sağlanmaz, boyutlandırma yine oturur
for (const ay of [[2], [5]]) { // Kısa açıklıkta tek ve çift doğrultu: proje alt sınırı 120 mm
  const g = { ...G0, ax: [2], ay }, kontrol = h => zincirHesap({ ...g, dosemeOzel: { h } }).dosemeler[0].maddeler.find(m => m.ad === 'Döşeme kalınlığı');
  assert.ok(zincirHesap(g).h >= 120 && !kontrol(119).gecti && kontrol(120).gecti);
}
{ const rH = zincirHesap({ ...G0, dosemeOzel: { h: 100 } });                     // kirişli plak: 100 < h_min
  assert.ok(rH.h === 100 && rH.dosemeler.every(d => d.h === 100 && d.ozel.h && !d.gecti && !d.maddeler.find(m => m.ad === 'Döşeme kalınlığı').gecti));
  assert.ok([...rH.kirisler, ...rH.kolonlar, rH.radye].every(e => e.gecti) && rH.notlar.some(n => n.startsWith('Elle verilen boyutlar') && n.includes('döşeme h = 100 mm')));
  assert.ok(zincirHesap({ ...G0, dosemeOzel: { h: 200 } }).dosemeler.every(d => d.h === 200 && d.gecti));
  const rT = zincirHesap({ ...G0, dosemeTuru: 'disli', dosemeOzel: { t: 60 } }), hD = zincirHesap({ ...G0, dosemeTuru: 'disli' }).h; // tabla < max(70; e/10): kalınlaştırma koşmaz
  assert.ok(rT.tabla === 60 && rT.h === hD && rT.dosemeler.every(d => d.ozel.t && !d.ozel.h && !d.maddeler.find(m => m.ad === 'Tabla kalınlığı').gecti && d.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Tabla kalınlığı')));
  const rK = zincirHesap({ ...G0, dosemeTuru: 'kirissiz', dosemeOzel: { h: 180 } }); // kirişsiz: 180 < 200; zımbalama için kolonlar yine büyür
  assert.ok(rK.h === 180 && rK.dosemeler.every(d => !d.maddeler.find(m => m.ad === 'Döşeme kalınlığı').gecti) && rK.zimbD.every(z => z.d === 155 && z.gecti));
  // Kiriş: aks hattı boyunca; yalnız b verilirse h büyür, yetmeyen h 'Kiriş yüksekliği'ni düşürür
  const hatK = (r, a) => r.kirisler.filter(e => r.ag.hatlar[e.hat].aks === a);
  const rA = zincirHesap({ ...G0, kirisOzel: { A: { b: 300, h: 600 } } });
  assert.ok(hatK(rA, 'A').length === 3 && hatK(rA, 'A').every(e => e.b === 300 && e.h === 600 && e.ozel.b && e.ozel.h && e.gecti) && rA.kirisler.filter(e => !hatK(rA, 'A').includes(e)).every(e => !e.ozel));
  const rA2 = zincirHesap({ ...G0, kirisOzel: { A: { h: 250 } } });
  assert.ok(hatK(rA2, 'A').every(e => e.h === 250 && !e.gecti && !e.maddeler.find(m => m.ad === 'Kiriş yüksekliği').gecti));
  const r1 = zincirHesap({ ...G0, kirisOzel: { 1: { b: 400 } } });
  assert.ok(hatK(r1, '1').every(e => e.b === 400 && e.h >= 300 && e.ozel.b && !e.ozel.h && e.gecti));
  // Narinlik rijitleştirmesi elle verilen kiriş yüksekliğine dokunmaz (sınırlı turda oturur)
  const rN = zincirHesap({ ...G0, H: 8000, kolonOzel: { S1: { b: 300, h: 300 } }, kirisOzel: { A: { h: 400 }, 1: { h: 400 } } });
  assert.ok([...hatK(rN, 'A'), ...hatK(rN, '1')].every(e => e.h === 400) && !rN.notlar.some(n => /\bA aksı h ≥|\b1 aksı h ≥/.test(n)));
  // Radye: elle h ve taşma
  const rR = zincirHesap({ ...G0, radyeOzel: { h: 250 } });
  assert.ok(rR.radye.h === 250 && rR.radye.ozel.h && !rR.radye.gecti && !rR.radye.maddeler.find(m => m.ad === 'Radye kalınlığı').gecti && rR.radyeZimb.every(z => z.d === 180));
  const rR2 = zincirHesap({ ...G0, radyeOzel: { h: 700, a: 0.1 } });
  assert.ok(rR2.radye.h === 700 && rR2.radye.a === 0.1 && !rR2.radye.maddeler.find(m => m.ad === 'Radye taşması').gecti && rR2.radye.Bx === 13.2);
  // Perde: elle kalınlık yazımla ("A/2–3"), büyütülmez; öbür perde yine büyür
  const rP = zincirHesap({ ...GP, perdeKal: 150, perdeOzel: { 'A/2–3': 200 } });
  assert.ok(rP.perdeler[0].bw === 200 && rP.perdeler[0].ozel && !rP.perdeler[0].maddeler.find(m => m.ad === 'Perde kalınlığı').gecti && rP.perdeler[1].bw === 250 && !rP.perdeler[1].ozel);
  // Planda olmayan aks ya da perde anahtarı yok sayılır; aralık dışı değer girdi hatası
  const rS = zincirHesap({ ...GP, kirisOzel: { F: { b: 300 } }, perdeOzel: { 'C/1–2': 300 } });
  assert.deepEqual(rS.kirisler.map(e => [e.b, e.h]), rp.kirisler.map(e => [e.b, e.h])); assert.ok(!rS.notlar.some(n => n.startsWith('Elle')));
  assert.ok(['dosemeOzel', { h: 20 }, 'kirisOzel', { A: { b: 100 } }, 'dosemeOzel', { h: 100, t: 120 }, 'radyeOzel', { a: 12 }, 'perdeOzel', { 'A/2–3': 2000 }, 'kolonOzel', { S1: { b: 50 } }]
    .every((x, i, a) => i % 2 || girdiDenetle({ ...G0, [x]: a[i + 1] }).ozel));
  assert.ok(!girdiDenetle({ ...GP, dosemeOzel: { h: 150 }, kirisOzel: { A: { b: 300 } }, perdeOzel: { 'A/2–3': 300 }, radyeOzel: { h: 600, a: 1 } }).ozel); }

// Gerçek kat narinliği tek katlı eski hesapla aynı; kat toplamı duraylılığı sınırı ayrıca geçerli.
{ const g = { bw: 350, hd: 300, ln: 2600, H: 3000, n: 1, kirisR: 40000, Nd: 500, Ngd: 350, fck: 30, tutulu: false };
  const eski = narinlik(g), yeni = katNarinlik({ ...g, alphaAlt: eski.a1, alphaUst: eski.a2 });
  for (const ad of ['k', 'lk', 'lam', 'NkB', 'NkS', 'beta', 'burMax']) yakin(eski[ad], yeni[ad], 1e-9);
  const ortak = { ...g, ln: 4000, alphaAlt: 2, alphaUst: 3 };
  assert.ok(katNarinlik({ ...ortak, katOran: 0.44 }).durMax < 1 && katNarinlik({ ...ortak, katOran: 0.46 }).durMax > 1);
  assert.throws(() => katNarinlik({ ...ortak, ln: 0 }), RangeError); }

console.log('zincir: tüm kontroller geçti');
