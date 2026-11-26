import assert from 'node:assert/strict';
import { agKur } from './mekanik.js';
import { katKirissiz, katSeritRijitligi } from './katli-kirissiz.js';
import { zincirHesap } from './zincir.js';
import { perdeAg, perdeOku, duraylilikKatli } from './perde.js';
import { EC } from './sehim.js';
import { yeniDurum, excelSayfalar } from './calisma.js';

const ag = agKur([4, 4, 4], [4, 4, 4]);
const g = { ax: ag.ax, ay: ag.ay, dosemeTuru: 'kirissiz', dosemeOzel: { h: 250 }, gKaplama: 2, q: 2,
  duvarDisTur: 'tugla19', duvarDis: 0, duvarIcTur: 'elle', duvarIc: 0, dosemeDuvar: true };
const mz = { fck: 30, fyk: 420, fcd: 20, fctd: 0.35 * Math.sqrt(30) / 1.5, fyd: 420 / 1.15, k1: 0.82 };
const olcu = () => ({ b: 400, h: 400 });
const a = katKirissiz(ag, g, mz, 3000, olcu), b = katKirissiz(ag, g, mz, 3400, olcu);
assert.equal(a.h, 250); assert.equal(a.zimbD.length, 16);
assert.ok(Math.abs((b.yukler.get('S1').G1 - a.yukler.get('S1').G1) - 4.32) < 1e-9);
assert.equal(a.yukler.get('S6').G1, b.yukler.get('S6').G1);
assert.ok(katSeritRijitligi(ag, 250, ag.kolonlar[5], 'x') > 0);
const perdeli = katKirissiz(ag, g, mz, 3000, olcu, new Map([['S1', 'P1']]));
assert.ok(!perdeli.zimbD.some(z => z.kolon === 'S1') && perdeli.yukler.has('S1'));
const otomatik = katKirissiz(ag, { ...g, dosemeOzel: null }, mz, 3000, olcu);
assert.ok(otomatik.h >= 200 && [...otomatik.dosemeler, ...otomatik.seritler, ...otomatik.zimbD].every(e => e.gecti));
const yetersiz = katKirissiz(ag, { ...g, dosemeOzel: { h: 100 } }, mz, 3000, olcu);
assert.equal(yetersiz.h, 100); assert.ok(yetersiz.dosemeler.some(e => !e.gecti));
// Kesişen perdelerde kirişsiz kat yükleri düğüm başına bir kez, öz ağırlıklarla birlikte temele iner.
const inp = { ...g, dosemeOzel: undefined, katSayisi: 2, H: 3000, katYukseklikleri: [3000, 3400], beton: 'C30', celik: 'B420C',
  disAralik: 500, disGen: 120, dolgu: 0, kullanim: 'konut', sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75,
  kolonOzel: {}, yanalTutulu: true, perdeler: 'A/1–2; 1/A–B' };
const r = zincirHesap(inp), pd = perdeAg(ag, perdeOku(inp.perdeler).liste);
let toplamG = 0, toplamQ = 0;
for (const [i, kat] of r.katlar.entries()) {
  assert.equal(kat.kirisler.length, 0); assert.equal(kat.perdeler.length, 2); assert.equal(kat.zimbD.length, 13);
  const destek = c => {
    const w = kat.perdeler.filter(p => p.dugumler.includes(c.ad));
    if (w.length) { const bw = Math.max(...w.map(p => p.bw)); return { b: bw, h: bw }; }
    const x = kat.kolonlar.find(e => e.ad === c.ad), y = r.katlar[i + 1]?.kolonlar.find(e => e.ad === c.ad) ?? x;
    return { b: Math.min(x.b, y.b), h: Math.min(x.h, y.h) };
  };
  const f = katKirissiz(ag, inp, mz, kat.H, destek, pd.dugum);
  toplamG += [...f.yukler.values()].reduce((s, y) => s + y.G1, 0) + [...kat.kolonlar, ...kat.perdeler].reduce((s, e) => s + (e.b ?? e.bw) * (e.h ?? e.lw) * kat.H * 25 / 1e9, 0);
  toplamQ += [...f.yukler.values()].reduce((s, y) => s + y.Q1, 0);
}
const temelde = [...r.katlar[0].kolonlar, ...r.katlar[0].perdeler];
assert.ok(Math.abs(temelde.reduce((s, e) => s + e.NG, 0) - toplamG) < 1e-6);
assert.ok(Math.abs(temelde.reduce((s, e) => s + e.NQ, 0) - toplamQ) < 1e-6);
const sumNd = temelde.reduce((s, e) => s + e.Nd, 0), rd = r.radye;
assert.ok(Math.abs(rd.qo - (sumNd / rd.A + 1.4 * (25 * rd.h / 1000 + 20 * Math.max(0, inp.Df - rd.h / 1000)))) < 1e-6);
const durum = yeniDurum(); Object.assign(durum.form, { ax: '4 4 4', ay: '4 4 4', kat: '2', katYukseklikleri: '3000 3400', dosemeTuru: 'kirissiz', perdeler: inp.perdeler });
const sayfalar = excelSayfalar(durum, r);
for (const ad of ['Döşeme', 'Şeritler', 'Zımbalama', 'Kolon', 'Perde']) {
  const sayfa = sayfalar.find(s => s.ad === ad);
  assert.equal(sayfa.sutunlar[0].baslik, 'Kat');
  assert.deepEqual([...new Set(sayfa.satirlar.map(s => s[0]))], [1, 2]);
}
const otomatikYanal = zincirHesap({ ...inp, yanalTutulu: false });
const veri = otomatikYanal.katlar.map((kat, i) => {
  const toplam = k => k ? [...k.kolonlar, ...k.perdeler].reduce((s, e) => s + e.NG + e.NQ, 0) : 0;
  return { H: kat.H, W: toplam(kat) - toplam(otomatikYanal.katlar[i + 1]), perdeler: kat.perdeler.filter(p => p.yon === 'x' && p.tur === 'perde') };
});
const phi = duraylilikKatli({ katlar: veri, Ec: EC[30] }).phi;
assert.ok(Math.abs(phi - otomatikYanal.yanal.x.phi) < 1e-8);
console.log('katlı kirişsiz döşeme: yük ve zımbalama kontrolleri geçti');
