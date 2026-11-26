// Çalıştır: node hesap/donati.test.mjs
import assert from 'node:assert/strict';
import { alan, egilmeAs, mMax, rhoMax, rhoB, dosemeCubuk, kirisCubuk, kolonCubuk, etriyeSec, sKod } from './donati.js';
import { malzeme } from './zincir.js';

const yakin = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const c30 = malzeme(30, 420);

// ρb, C30/B420C: 0,85·0,82·(20/365,2)·600/965,2 ≈ 0,02373; ρmax = 0,02
yakin(rhoB(c30), 0.85 * 0.82 * (20 / (420 / 1.15)) * 600 / (600 + 420 / 1.15));
assert.equal(rhoMax(c30), 0.02);
// Eğilme: As ile bulunan moment geri hesapta Md'yi verir.
const As = egilmeAs(100, 250, 450, c30), a = As * c30.fyd / (0.85 * c30.fcd * 250);
yakin(As * c30.fyd * (450 - a / 2) / 1e6, 100);
assert.equal(egilmeAs(0, 250, 450, c30), 0);
assert.equal(egilmeAs(1e4, 250, 450, c30), Infinity);
assert.ok(egilmeAs(mMax(250, 450, c30), 250, 450, c30) <= rhoMax(c30) * 250 * 450 + 1e-6);

// Döşeme: 300 mm²/m → φ8/160 (50,27·1000/300 = 167 → 160); çok büyük As → φ10 ve aralık sınırı.
assert.deepEqual((({ phi, s }) => [phi, s])(dosemeCubuk(300, 200)), [8, 160]);
assert.deepEqual((({ phi, s }) => [phi, s])(dosemeCubuk(100, 200)), [8, 200]);         // sMax sınırı
assert.deepEqual((({ phi, s }) => [phi, s])(dosemeCubuk(600, 200)), [10, 130]);        // φ8 aralığı 80 < 100 → φ10
assert.ok(dosemeCubuk(300, 200).As >= 300);
// F5 — aralık 0'a düşünce As sonsuz değil 0 (kullanım 0 sayılıp geçiyordu); TS 500 9.5.2 kod aralığı (φ12 de denendiği için As = 12000)
assert.ok((({ s, As, kod }) => s === 0 && As === 0 && !kod)(dosemeCubuk(12000, 200)) && [8, 10, 12, 16].map(p => sKod(p)).join() === '40,40,50,50');

// Kiriş: 600 mm², bw 250 → 3φ16 (603) ya da 4φ14 (616); en az çelik 3φ16. Sığma: 2·33 + 3·16 + 2·25 = 164 ≤ 250.
assert.deepEqual((({ n, phi, sigar }) => [n, phi, sigar])(kirisCubuk(600, 250)), [3, 16, true]);
assert.deepEqual((({ n, phi }) => [n, phi])(kirisCubuk(100, 250)), [2, 12]);           // en az 2 çubuk
assert.equal(kirisCubuk(3000, 250).sigar, false);
// Kolon: %1·400·400 = 1600 → 8φ16 (1608) ya da 12φ14 (1847); en az çelik 8φ16.
assert.deepEqual((({ n, phi }) => [n, phi])(kolonCubuk(1600)), [8, 16]);
assert.deepEqual((({ n, phi }) => [n, phi])(kolonCubuk(100)), [4, 14]);
// Etriye: Asw/s = 0,5 mm²/mm, iki kol φ8 → 2·50,27/0,5 = 201 → 200, sMax 150 → 150.
assert.deepEqual((({ phi, s }) => [phi, s])(etriyeSec(0.5, 150)), [8, 150]);
assert.deepEqual((({ phi, s }) => [phi, s])(etriyeSec(2.5, 150)), [10, 60]);           // φ8: 40 < 50 → φ10: 62 → 60
yakin(alan(10), 78.54);
// Faz 1 — çap takımları: döşeme/şerit/tabla φ8/10/12, kolon etriyesi φ8/10/12 (kiriş etriyesinden ayrı), kolon boyunası φ14/16
// (TBDY 7.3.2.1, TS 500 7.4.1: φ14'ten ince olamaz). 900 mm²/m: φ8/50, φ10/80 < 100 → φ12/120.
import { CAP } from './donati.js';
assert.deepEqual([CAP.doseme, CAP.kolon, CAP.etriye, CAP.kolonEtriye], [[8, 10, 12], [14, 16], [8, 10], [8, 10, 12]]);
assert.deepEqual((({ phi, s }) => [phi, s])(dosemeCubuk(900, 200)), [12, 120]);

console.log('donati: tüm kontroller geçti');
