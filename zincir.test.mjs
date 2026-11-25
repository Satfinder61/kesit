// Çalıştır: node hesap/zincir.test.mjs
import assert from 'node:assert/strict';
import { surekliKiris, kenarParcasi, parcaToplam, parcaAnkastre, agKur, zarf, desenler, zincirHesap, girdiDenetle } from './zincir.js';

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
// Duvar taşıyan kirişte sehim sınırı ℓn/480 (TS 500 Çizelge 13.3)
for (const e of zr.kirisler) yakin(e.sehim.sinir, e.ln * 1000 / 480);
// Kirişte donatı ≥ en küçük oran; mesnet altı ≥ 0,5·üst (TBDY 7.4.2)
for (const e of zr.kirisler) assert.ok(e.AsAlt >= 0.5 * e.AsUst - 1e-6 && e.AsUst >= 0.8 * (0.35 * Math.sqrt(30) / 1.5) / (420 / 1.15) * e.b * (e.h - 75) - 1e-6);
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
import { kolonYuzMax } from './donati.js';
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
  const [kx, ky] = c.kol.split('×').map(Number);
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
assert.ok(zincirHesap({ ...G0, katSayisi: 1, ax: [8, 8], ay: [8, 8] }).kolonlar.every(c => c.b <= 350 && /7\.3\.5\.3\(b\)/.test(c.maddeler.find(m => m.ad === 'Güçlü kolon').deger)));
// F6 — TBDY 7.4.5.1/7.4.5.3: kiriş orta bölge etriyesi V_e için (V_c = 0,8·V_cr); K5'te φ8/160 V_e'nin 1/1,31'ini karşılıyordu.
for (const e of zincirHesap({ ...G0, ax: [6, 7, 6], ay: [6, 6], q: 3.5, duvarIc: 6 }).kirisler) {
  const [phi, s] = e.etrOrta.slice(1).split('/').map(Number), d = e.h - 50;
  assert.ok(0.8 * 0.65 * fctd30 * e.b * d / 1000 + 2 * Math.PI * phi * phi / 4 * mz30.fyd * d / s / 1000 >= Math.max(e.Vd, e.Ve) - 1e-6, `${e.ad}: orta bölge V_r < V_e`);
}
// Büyüme sınırı: yalnız etriye yetmeyen kirişte büyütme V_e'yi artırır; iyileşmeyince durur (1300×3150'ye koşuyordu), açıklama iz'de
const kE = zincirHesap({ ...G0, dosemeTuru: 'disli', disGen: 105, ax: [11, 8.8, 11], ay: [11, 11], q: 5, katSayisi: 3 }).kirisler;
assert.ok(kE.every(e => e.b <= 900 && (e.gecti || e.iz.some(x => x.includes('büyütme durduruldu')))));

console.log('zincir: tüm kontroller geçti');
