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

// Zincir: yük kaybolmaz. Temele inen G ve (azaltılmamış) Q elle hesapla aynı olmalı.
const G0 = { ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, H: 3000, beton: 'C30', celik: 'B420C', t: 140, kirisB: 250, kirisH: 500,
  kolonB: 400, kolonH: 400, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, sds: 0, kDeprem: 1, zemin: 400, Df: 1.5, kolonOzel: {} };
assert.deepEqual(girdiDenetle(G0), {});
const zr = zincirHesap(G0);
const alan = 13 * 9.5, disBoy = 2 * 13 + 2 * 9.5, icBoy = 13 + 2 * 9.5, kirisBoy = 3 * 13 + 4 * 9.5;
const katG = alan * (0.14 * 25 + 2) + disBoy * 6 + icBoy * 3 + kirisBoy * 0.25 * 0.36 * 25 + 12 * 0.4 * 0.4 * 3 * 25;
// Kolon tepkisi alan payıyla alttan sınırlı ve Q desenli: toplam kat yükünden az olamaz, fazlası %15'i geçmemeli.
const sNG = zr.kolonlar.reduce((a, c) => a + c.NG, 0), sNQ = zr.kolonlar.reduce((a, c) => a + c.NQ, 0);
assert.ok(sNG >= 5 * katG - 1e-6 && sNG <= 1.15 * 5 * katG, `ΣNG ${sNG}`);
assert.ok(sNQ >= 5 * alan * 2 * zr.beta - 1e-6 && sNQ <= 1.25 * 5 * alan * 2 * zr.beta, `ΣNQ ${sNQ}`);
assert.equal(zr.beta, 0.88);                                                   // TS 498 Çizelge 8, 5 kat konut
yakin(zr.katYukAlan, (katG + alan * 2) / alan);                               // kat yükü ortalaması uygulanan yükten
// Kalkma uyarısı hareketli yük deseniyle de: G altında pozitif, 1,4G + 1,6Q (yalnız uzun açıklık) altında negatif uç.
assert.ok(zincirHesap({ ...G0, ax: [4.2, 8], ay: [5] }).notlar.some(n => n.includes('kalkıyor')));
// Kısa uç açıklıkta negatif tepki kolona geçmez (ax = [2, 8]); köşe kolon alan payından az yük almaz.
const kisa = zincirHesap({ ...G0, ax: [2, 8], ay: [5] });
assert.ok(kisa.kolonlar.every(c => c.NG > 0 && c.NQ >= 0 && c.tur === 'kolon'));
assert.ok(kisa.notlar.some(n => n.includes('kalkıyor')));
const kose = zr.kolonlar[0], payKat = 2 * 2.5 * (0.14 * 25 + 2) + (2 + 2.5) * 6 + (2 + 2.5) * 0.25 * 0.36 * 25 + 0.4 * 0.4 * 3 * 25;
assert.ok(kose.NG >= 5 * payKat - 1e-6, `köşe ${kose.NG} < ${5 * payKat}`);
// Kare panoda sehim sütunu planın yönüne bağlı değil.
const sehim = r => r.dosemeler.map(d => d.maddeler[1].sinir).sort().join();
assert.equal(sehim(zincirHesap({ ...G0, ax: [5, 5, 5], ay: [5] })), sehim(zincirHesap({ ...G0, ax: [5], ay: [5, 5, 5] })));
// Duvar taşıyan kirişte sehim muafiyeti yok (TS 500 13.2.1).
assert.ok(zr.kirisler.every(k => !k.maddeler.at(-1).gecti && k.gecti));
assert.ok(zr.temeller.every(t => t.sigma <= G0.zemin / 1.4 + 1e-9 && Math.min(t.Bx, t.By) >= 0.7 - 1e-9 && t.Bx * t.By >= 1 - 1e-9));
assert.ok(zr.temeller.every(t => t.hT >= 250 && t.hT >= t.kon * 1000 / 4 && t.gecti));
// Kolon özel boyutu zincire girer; girdi hatası yakalanır.
assert.equal(zincirHesap({ ...G0, kolonOzel: { S6: { b: 300, h: 300 } } }).kolonlar[5].b, 300);
assert.ok(girdiDenetle({ ...G0, ax: [4, -1] }).ax && girdiDenetle({ ...G0, katSayisi: 2.5 }).katSayisi && girdiDenetle({ ...G0, kirisH: 120 }).kirisH);

console.log('zincir: tüm kontroller geçti');
