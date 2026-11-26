import assert from 'node:assert/strict';
import { zincirHesap, malzeme } from './zincir.js';
import { kolonMr, kirisMr } from './kolon.js';
import { alan } from './donati.js';
import { yeniDurum, excelSayfalar } from './calisma.js';
import { katliHesap } from './katli.js';

const g = { ax: [4], ay: [4], katSayisi: 2, H: 3000, beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: 500, disGen: 120,
  dolgu: 0, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, duvarDisTur: 'tugla19', dosemeDuvar: true,
  sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75, yanalTutulu: true,
  kolonOzel: Object.fromEntries(['S1', 'S2', 'S3', 'S4'].map(ad => [ad, { b: 350, h: 350 }])) };
const hesap = h => zincirHesap({ ...g, katYukseklikleri: h });
const a = hesap([3000, 3000]), alt = hesap([3400, 3000]), ust = hesap([3000, 3400]);
const ng = (r, kat) => r.katlar[kat].kolonlar[0].NG;
assert.equal(ng(a, 1), ng(alt, 1)); // Alt kattaki yük artışı üst kat kolonuna eklenmez.
assert.ok(ng(alt, 0) > ng(a, 0) && ng(ust, 0) > ng(a, 0) && ng(ust, 1) > ng(a, 1));
for (const r of [a, alt, ust]) {
  const sum = r.katlar[0].kolonlar.reduce((s, c) => s + c.Nd, 0), rd = r.radye;
  assert.ok(Math.abs(rd.qo - (sum / rd.A + 1.4 * (25 * rd.h / 1000 + 20 * Math.max(0, g.Df - rd.h / 1000)))) < 1e-6);
}
// Kiriş birleşimi ve eksenel kuvvetten bağımsız kesme üst sınırı gerçek kesit hesabını kapsamalı.
const kat = a.katlar[0], c = kat.kolonlar[0], beam = kat.kirisler.find(e => e.hat === 0 && e.k === 0), mz = malzeme(30, 420);
const brl = c.maddeler.find(m => m.ad === 'Birleşim kesmesi');
assert.ok(brl && Math.abs(brl.deger - 1.25 * mz.fyk * Math.max(beam.AsUst, beam.AsAlt) / 1000) < 1e-6);
const phi = Number(c.boyuna.split('φ')[1]), Af = c.nh * alan(phi);
const Mp = 1.4 * Math.max(...Array.from({ length: 21 }, (_, i) => kolonMr(c.h, c.b, Af, 45, c.Nd * i / 20, mz)));
const bp = 1.4 * Math.max(kirisMr(beam.AsUst, beam.b, beam.h - 50, mz), kirisMr(beam.AsAlt, beam.b, beam.h - 50, mz));
assert.ok(c.VeX >= (Mp + Math.min(Mp, bp)) / ((kat.H - beam.h) / 1000));
assert.match(c.iz.join(' '), /sarılmada V_c = 0/);
assert.throws(() => katliHesap({ ...g, katYukseklikleri: [3000, 3400], perdeler: 'A/1–9' }, mz), /aks ağının dışında/);
const d = yeniDurum(); d.form.kat = '2'; d.form.katYukseklikleri = '3000 3000';
const tablo = excelSayfalar(d, a).find(s => s.ad === 'Kolon');
assert.equal(tablo.sutunlar[0].baslik, 'Kat');
assert.deepEqual([...new Set(tablo.satirlar.map(s => s[0]))], [1, 2]);
assert.equal(tablo.satirlar.length, a.katlar.reduce((n, k) => n + k.kolonlar.length, 0));
const tipik = zincirHesap({ ...g, ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, katYukseklikleri: [3000, 3200, 3000, 3000, 3000], kolonOzel: {}, yanalTutulu: false });
assert.ok(tipik.katlar.every(k => k.kolonlar.every(c => Math.max(c.b, c.h) <= 800)), 'tipik projede kolonlar gereksiz büyümemeli');
const kalkma = zincirHesap({ ...g, ax: [4.2, 8], ay: [5], katYukseklikleri: [3000, 3200], kolonOzel: {} });
assert.ok(kalkma.notlar.some(n => n.includes('kalkıyor')), 'mesnet kalkması kullanıcıya bildirilmeli');
console.log('katlı hesap: yük aktarımı ve temel dengesi geçti');
