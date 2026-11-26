import assert from 'node:assert/strict';
import { agKur } from './mekanik.js';
import { malzeme, zincirHesap } from './zincir.js';
import { kirisBul } from './kiris.js';
import { perdeAg, perdeOku, perdeTasarla, duraylilik, duraylilikKatli } from './perde.js';

const ag = agKur([4], [4]), p = perdeAg(ag, perdeOku('A/1–2').liste).perdeler[0];
const g = { p, bw: 250, n: 3, H: 3000, G1: 200, Q1: 50, bt: 0.95, mz: malzeme(30, 420), sds: 1, kDeprem: 1, sabit: true };
const oz = 0.25 * 4.25 * 3 * 25, eski = perdeTasarla(g);
const katli = perdeTasarla({ ...g, katYuk: { Gdiger: 3 * g.G1 + 2 * oz, Qham: 3 * g.Q1, Hw: 9000 } });
for (const k of ['NG', 'NQ', 'Nd', 'Ndm', 'Hw', 'bw', 'lw']) assert.ok(Math.abs(eski[k] - katli[k]) < 1e-9, k);
const ara = perdeTasarla({ ...g, H: 3500, n: 2, katYuk: { Gdiger: 500, Qham: 75, Hw: 10500 } });
assert.ok(Math.abs(ara.NG - (500 + 0.25 * 4.25 * 3.5 * 25)) < 1e-9);
assert.equal(ara.Hw, 10500); assert.equal(ara.NQ, 75 * g.bt);
assert.throws(() => perdeTasarla({ ...g, katYuk: { Gdiger: 0, Qham: 0, Hw: 0 } }), RangeError);

const w = [{ bw: 250, lw: 4250 }], Ec = 30000, uniform = Array.from({ length: 3 }, () => ({ H: 3000, W: 1000, perdeler: w }));
const a = duraylilik({ perdeler: w, n: 3, H: 3000, W: 1000, Ec }), b = duraylilikKatli({ katlar: uniform, Ec });
assert.ok(Math.abs(a.phi - b.phi) < 1e-10); assert.equal(a.kat, b.kat);
assert.ok(Number.isFinite(duraylilikKatli({ katlar: [{ ...uniform[0], H: 4000 }, ...uniform.slice(1)], Ec }).phi));
assert.equal(duraylilikKatli({ katlar: [{ H: 3000, W: 1000, perdeler: [] }], Ec }).phi, Infinity);
// Kesişen perdelerde ortak düğüm bir kez taşınır; her katın tepkileri ve gerçek öz ağırlığı temele iner.
const inp = { ax: [4], ay: [4], katSayisi: 2, H: 3000, katYukseklikleri: [3000, 3400], beton: 'C30', celik: 'B420C', dosemeTuru: 'plak',
  disAralik: 500, disGen: 120, dolgu: 0, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, dosemeDuvar: true,
  sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75, yanalTutulu: true, kolonOzel: {}, perdeler: 'A/1–2; 1/A–B' };
const sonuc = zincirHesap(inp), pa = perdeAg(ag, perdeOku(inp.perdeler).liste);
assert.ok(sonuc.katlar.every(k => k.kolonlar.length === 1 && k.perdeler.length === 2 && k.perdeler.every(p => p.Hw === 6400)));
let beklenenG = 0, beklenenQ = 0;
for (const k of sonuc.katlar) {
  const d = k.dosemeler[0], dos = { h: k.h, tabla: k.tabla, gAlan: d.gAlan, qAlan: d.qAlan };
  const boy = c => k.kolonlar.find(e => e.ad === c.ad) ?? (() => { const bw = Math.max(...k.perdeler.filter(p => p.dugumler.includes(c.ad)).map(p => p.bw)); return { b: bw, h: bw }; })();
  const kr = kirisBul(ag, { ...inp, H: k.H }, g.mz, dos, boy, { perde: pa.bay });
  const topla = a => a.reduce((x, y) => x + y, 0), tep = [...kr.tepki.values()], py = [...kr.perdeYuk.values()];
  beklenenG += topla(tep.map(t => topla(t.G))) + topla(py.map(t => t.G)) + topla([...k.kolonlar, ...k.perdeler].map(e => (e.b ?? e.bw) * (e.h ?? e.lw) * k.H * 25 / 1e9));
  beklenenQ += topla(tep.map(t => topla(t.Q))) + topla(py.map(t => t.Q));
}
const temelYuk = [...sonuc.katlar[0].kolonlar, ...sonuc.katlar[0].perdeler];
assert.ok(Math.abs(temelYuk.reduce((s, e) => s + e.NG, 0) - beklenenG) < 1e-7);
assert.ok(Math.abs(temelYuk.reduce((s, e) => s + e.NQ, 0) - beklenenQ) < 1e-7);
const sumNd = temelYuk.reduce((s, e) => s + e.Nd, 0), rd = sonuc.radye;
assert.ok(Math.abs(rd.qo - (sumNd / rd.A + 1.4 * (25 * rd.h / 1000 + 20 * Math.max(0, inp.Df - rd.h / 1000)))) < 1e-7);
console.log('katlı perde: yük ve duraylılık kontrolleri geçti');
