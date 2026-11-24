// Döşeme → kiriş → kolon → temel ön boyut zinciri.
// Düzenli dikdörtgen aks ağı; bütün katlar aynı plan ve aynı yükte. Yük, düşey yük olarak yukarıdan aşağı aktarılır.
// Birimler: aks ve açıklık m, kesit boyutu mm, kuvvet kN, yayılı yük kN/m, alan yükü kN/m², moment kNm.
import { BETON, kontrol, kolonOner, beta, Q_MIN } from './kurallar.js';

// ── Mekanik (yönetmelikten bağımsız)

// Simetrik yamuk yük parçası: tepe şiddeti w (kN/m), uçlardaki rampa boyu a (m). a = 0 düzgün, a = L/2 üçgen.
export const parcaToplam = ({ w, a }, L) => w * (L - a);
export const parcaAnkastre = ({ w, a }, L) => w * L * L / 12 * (1 - 2 * (a / L) ** 2 + (a / L) ** 3);
export const parcaSiddet = ({ w, a }, L, x) => a > 0 ? w * Math.min(1, x / a, (L - x) / a) : w;

// 45° kuralı. Pano kenarları s ≤ L, alan yükü p. İki doğrultuda (L/s ≤ 2) her kenar tepe p·s/2, rampa s/2 alır:
// kısa kenara üçgen (alan s²/4), uzun kenara yamuk (alan s(2L − s)/4). Bir doğrultuda yük kısa doğrultuda taşınır:
// uzun kenarlar düzgün p·s/2, kısa kenarlar yük almaz.
// Dönüş: kenar boyu Le olan kenarın yük parçası.
export function kenarParcasi(Le, lx, ly, p) {
  const s = Math.min(lx, ly), L = Math.max(lx, ly);
  if (L / s <= 2) return { w: p * s / 2, a: s / 2 };
  return Le === L ? { w: p * s / 2, a: 0 } : { w: 0, a: 0 };
}

// Rijit mesnetli sürekli kiriş, açıklıklar boyunca sabit EI, uç mesnetler mafsallı.
// L[k]: açıklıklar (m); yukler[k]: k. açıklığa etkiyen simetrik yük parçaları.
// Üç moment denklemi (simetrik yükte yük terimi 6Ax̄/L = 3·F·L, F ankastrelik momenti):
//   M[k−1]·L[k−1] + 2·M[k]·(L[k−1] + L[k]) + M[k+1]·L[k] = −3·(F[k−1]·L[k−1] + F[k]·L[k])
// Momentler alt lif çekme pozitif; mesnet momentleri negatif çıkar.
export function surekliKiris(L, yukler) {
  const n = L.length;
  const F = yukler.map((p, k) => p.reduce((t, y) => t + parcaAnkastre(y, L[k]), 0));
  const W = yukler.map((p, k) => p.reduce((t, y) => t + parcaToplam(y, L[k]), 0));
  const M = Array(n + 1).fill(0);
  if (n > 1) { // Thomas algoritması, bilinmeyen M[1..n−1]
    const a = [], b = [], c = [], d = [];
    for (let k = 1; k < n; k++) {
      a.push(L[k - 1]); b.push(2 * (L[k - 1] + L[k])); c.push(L[k]);
      d.push(-3 * (F[k - 1] * L[k - 1] + F[k] * L[k]));
    }
    for (let i = 1; i < n - 1; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    M[n - 1] = d[n - 2] / b[n - 2];
    for (let i = n - 3; i >= 0; i--) M[i + 1] = (d[i] - c[i] * M[i + 2]) / b[i];
  }
  const acikliklar = L.map((Lk, k) => {
    const VL = W[k] / 2 + (M[k + 1] - M[k]) / Lk, VR = W[k] - VL;
    // en büyük açıklık momenti: V ve M'nin sayısal integrali (yamuk kuralı, 400 adım)
    const N = 400, h = Lk / N, q = x => yukler[k].reduce((t, y) => t + parcaSiddet(y, Lk, x), 0);
    let V = VL, Mx = M[k], enb = Math.max(M[k], M[k + 1]), qo = q(0);
    for (let i = 1; i <= N; i++) {
      const qx = q(i * h), Vy = V - (qo + qx) / 2 * h;
      Mx += (V + Vy) / 2 * h; V = Vy; qo = qx;
      if (Mx > enb) enb = Mx;
    }
    return { L: Lk, W: W[k], VL, VR, Msol: M[k], Msag: M[k + 1], Macik: enb };
  });
  const R = Array(n + 1).fill(0);
  acikliklar.forEach((s, k) => { R[k] += s.VL; R[k + 1] += s.VR; });
  return { M, acikliklar, R };
}

// TS 500 6.3.3: depremsiz birleşimde hareketli yük açıklık açıklık en elverişsiz biçimde yerleştirilir.
// Desenler: hepsi, tek açıklıklar, çift açıklıklar ve her iç mesnet için iki komşu açıklık + birer atlayarak.
export function desenler(n) {
  const d = [Array(n).fill(true), [...Array(n)].map((_, i) => i % 2 === 0), [...Array(n)].map((_, i) => i % 2 === 1)];
  for (let k = 1; k < n; k++)
    d.push([...Array(n)].map((_, i) => i === k - 1 || i === k || (i < k - 1 && (k - 1 - i) % 2 === 0) || (i > k && (i - k) % 2 === 0)));
  return d;
}
// 1,4G (her açıklıkta) + 1,6Q (desene göre) zarfı: açıklık başına en büyük mesnet ve açıklık momenti, uç kesmesi.
export function zarf(L, G, Q) {
  const z = L.map(() => ({ MdMesnet: 0, MdAcik: 0, Vd: 0 }));
  for (const d of desenler(L.length)) {
    const r = surekliKiris(L, G.map((p, k) => [...p.map(y => ({ w: 1.4 * y.w, a: y.a })), ...(d[k] ? Q[k].map(y => ({ w: 1.6 * y.w, a: y.a })) : [])]));
    r.acikliklar.forEach((s, k) => {
      z[k].MdMesnet = Math.max(z[k].MdMesnet, -Math.min(s.Msol, s.Msag, 0));
      z[k].MdAcik = Math.max(z[k].MdAcik, s.Macik);
      z[k].Vd = Math.max(z[k].Vd, Math.abs(s.VL), Math.abs(s.VR));
    });
  }
  return z;
}

// Aks ağı. ax: X yönündeki aks aralıkları, ay: Y yönündeki (m). X aksları 1, 2, 3…; Y aksları A, B, C…
// Döşeme panoları, kiriş açıklıkları (her aks çizgisi bir sürekli kiriş) ve kolonlar (aks kesişimleri).
const harf = j => String.fromCharCode(65 + j);
export function agKur(ax, ay) {
  const xs = [0], ys = [0];
  ax.forEach(v => xs.push(xs.at(-1) + v));
  ay.forEach(v => ys.push(ys.at(-1) + v));
  const nx = ax.length, ny = ay.length;
  const dosemeler = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const kenar = { alt: j > 0, ust: j < ny - 1, sol: i > 0, sag: i < nx - 1 }; // komşu pano varsa kenar sürekli
    dosemeler.push({ ad: `D${dosemeler.length + 1}`, i, j, lx: ax[i], ly: ay[j], kenar,
      aks: `${i + 1}–${i + 2} / ${harf(j)}–${harf(j + 1)}` });
  }
  // Kiriş hatları: X yönünde her Y aksı (j = 0..ny), Y yönünde her X aksı (i = 0..nx).
  const hatlar = [];
  for (let j = 0; j <= ny; j++) hatlar.push({ yon: 'x', no: j, aks: harf(j), L: ax, dis: j === 0 || j === ny });
  for (let i = 0; i <= nx; i++) hatlar.push({ yon: 'y', no: i, aks: String(i + 1), L: ay, dis: i === 0 || i === nx });
  let kn = 0;
  hatlar.forEach(h => {
    h.kirisler = h.L.map((L, k) => ({ ad: `K${++kn}`, L,
      aks: h.yon === 'x' ? `${h.aks} / ${k + 1}–${k + 2}` : `${h.aks} / ${harf(k)}–${harf(k + 1)}` }));
  });
  const kolonlar = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
    kolonlar.push({ ad: `S${kolonlar.length + 1}`, i, j, aks: `${i + 1}${harf(j)}`, x: xs[i], y: ys[j] });
  return { ax, ay, xs, ys, nx, ny, dosemeler, hatlar, kolonlar };
}


// ── Yönetmelik denetimleri
export const CELIK = { B420C: 420, B500C: 500 };                          // TBDY 7.2.5.3(b)
export const GAMMA_BA = 25; // betonarme birim hacim ağırlığı, kN/m³. TS 498 1.3 TS ISO 9194'e gönderir; elimizdeki metinlerde sayı yok, genel kabul.
const GAMMA_DOLGU = 20;   // ponytail: temel + üstündeki dolgunun ortalama birim ağırlığı, kN/m³; zemin etüdündeki değerle değiştirilebilir
const K1 = { 25: .85, 30: .82, 35: .79, 40: .76, 45: .73, 50: .70 };      // TS 500 Çizelge 7.1
const TOL = 1e-9;
const tr = (x, d = 2) => x.toLocaleString('tr-TR', { maximumFractionDigits: d });
const yukari = (x, adim) => Math.ceil(x / adim - TOL) * adim;
// Malzeme, MPa (TS 500 3.3.2, 6.2.5; TBDY 7.2.5.2 nitelik denetimi zorunlu → γmc = 1,5, γms = 1,15)
export const malzeme = (fck, fyk) => ({ fck, fyk, fcd: fck / 1.5, fctd: 0.35 * Math.sqrt(fck) / 1.5, fyd: fyk / 1.15, k1: K1[fck] });

const madde = (m, ad, deger, sinir, gecti, kaynak, kullanim = null, uyari = false) => m.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari });
// Belirleyici: zorunlu koşullardan kullanımı en büyük olan. uyari: sağlanmazsa yalnız uyarı (ör. sehim hesabı gerekir).
function sonla(e) {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
  return e;
}

export function girdiDenetle(g) {
  const h = {}, poz = x => Number.isFinite(x) && x > 0, sifir = x => Number.isFinite(x) && x >= 0;
  for (const k of ['ax', 'ay']) if (!(g[k].length >= 1 && g[k].length <= 12 && g[k].every(x => poz(x) && x <= 20)))
    h[k] = `${k === 'ax' ? 'X' : 'Y'} aks aralıkları 1–12 adet, her biri 0–20 m olmalı`;
  if (!(Number.isInteger(g.katSayisi) && g.katSayisi >= 1 && g.katSayisi <= 60)) h.katSayisi = 'Kat sayısı 1–60 arası tam sayı olmalı';
  const ad = { H: 'Kat yüksekliği', t: 'Döşeme kalınlığı', kirisB: 'Kiriş genişliği', kirisH: 'Kiriş yüksekliği', kolonB: 'Kolon b', kolonH: 'Kolon h' };
  for (const k of Object.keys(ad)) if (!(poz(g[k]) && g[k] <= (k === 'H' ? 10000 : 5000))) h[k] = `${ad[k]} 0–${k === 'H' ? '10.000' : '5.000'} mm arasında olmalı`;
  const ad0 = { gKaplama: 'g', q: 'q', duvarDis: 'Dış duvar yükü', duvarIc: 'İç duvar yükü', sds: 'S_DS', Df: 'Temel derinliği' };
  for (const k of Object.keys(ad0)) if (!sifir(g[k])) h[k] = `${ad0[k]} ≥ 0 olmalı`;
  if (!(g.kDeprem >= 1)) h.kDeprem = 'Yatay deprem katsayısı ≥ 1 olmalı';
  if (!poz(g.zemin)) h.zemin = 'Zemin taşıma gücü q_k > 0 kN/m² olmalı';
  else if (sifir(g.Df) && g.zemin / 1.4 - 1.4 * GAMMA_DOLGU * g.Df <= 0) h.Df = 'Temel derinliği zemin taşıma gücünü tüketiyor: q_k/1,4 − 1,4·γ·D_f ≤ 0';
  if (!(g.beton in BETON)) h.beton = 'Beton C25 … C50 olmalı (TBDY 7.2.5.1)';
  if (!(g.celik in CELIK)) h.celik = 'Donatı B420C ya da B500C olmalı (TBDY 7.2.5.3)';
  if (!h.kirisH && !h.t && g.kirisH <= g.t) h.kirisH = 'Kiriş yüksekliği döşeme kalınlığından büyük olmalı';
  if (!h.ax && !h.ay && !h.kirisB && Math.min(...g.ax, ...g.ay) * 1000 <= g.kirisB) h.kirisB = 'Kiriş genişliği en kısa aks aralığından küçük olmalı';
  return h;
}

// 1. Döşeme: kalınlık (TS 500 11.2.2 / 11.4.2) ve sehim muafiyeti (TS 500 Çizelge 13.1).
function dosemeHesap(d, g) {
  const s = Math.min(d.lx, d.ly), L = Math.max(d.lx, d.ly), m = L / s, bir = m > 2 + TOL; // TS 500 11.2.1, 11.4.1
  const lsn = s - g.kirisB / 1000;              // kısa doğrultuda serbest açıklık, iki yanda yarım kiriş (TS 500 11.0)
  const k = d.kenar;
  const alfaS = ((k.alt + k.ust) * d.lx + (k.sol + k.sag) * d.ly) / (2 * (d.lx + d.ly)); // sürekli kenar boyu / çevre
  // kısa açıklığı sınırlayan (uzun) kenarlardan sürekli olanların sayısı; kare panoda iki doğrultunun elverişsizi
  const surekli = Math.abs(d.lx - d.ly) <= TOL ? Math.min(k.alt + k.ust, k.sol + k.sag) : d.lx > d.ly ? k.alt + k.ust : k.sol + k.sag;
  const gAlan = g.t / 1000 * GAMMA_BA + g.gKaplama;
  const e = { ...d, m, bir, alfaS, lsn, t: g.t, gAlan, qAlan: g.q, maddeler: [] };
  let hGerek, sinir, kaynak;
  if (bir) {
    const oran = surekli ? 30 : 25;
    hGerek = Math.max(80, lsn * 1000 / oran);
    sinir = `≥ max(80; ℓn/${oran})`; kaynak = 'TS 500 11.2.2';
  } else {
    hGerek = Math.max(80, lsn * 1000 / (15 + 20 / m) * (1 - alfaS / 4));
    sinir = '≥ max(80; ℓsn/(15 + 20/m)·(1 − αs/4))'; kaynak = 'TS 500 11.4.2, Denk. 11.1';
  }
  e.hGerek = Math.ceil(hGerek - TOL);
  madde(e.maddeler, 'Döşeme kalınlığı', g.t, `${sinir} = ${tr(e.hGerek)} mm`, g.t >= e.hGerek, kaynak, e.hGerek / g.t);
  // ponytail: Çizelge 13.1'de açıklık türü yazmıyor; eksen açıklığı alındı (güvenli yan).
  const sehim = (bir ? [20, 25, 30] : [25, 30, 35])[surekli], hS = Math.ceil(s * 1000 / sehim - TOL);
  madde(e.maddeler, 'Sehim hesabı gerektirmeyen kalınlık', g.t, `≥ ℓ/${sehim} = ${tr(hS)} mm`, g.t >= hS, 'TS 500 13.2.1, Çizelge 13.1', hS / g.t, true);
  e.iz = [
    `ℓ_kısa = ${tr(s)} m, ℓ_uzun = ${tr(L)} m, m = ${tr(m, 3)} → ${bir ? 'm > 2, bir doğrultuda çalışır (TS 500 11.2.1)' : 'm ≤ 2, iki doğrultuda çalışır (TS 500 11.4.1)'}`,
    `ℓsn = ${tr(s)} − ${tr(g.kirisB / 1000)} (kiriş) = ${tr(lsn)} m; αs = ${tr(alfaS, 3)} (sürekli kenar boyu / çevre)`,
    `g = ${tr(g.t / 1000)}·${GAMMA_BA} + ${tr(g.gKaplama)} = ${tr(gAlan)} kN/m², q = ${tr(g.q)} kN/m²`,
    bir ? 'Yük kısa doğrultuda taşınır: uzun kenar kirişlerine düzgün p·ℓ_kısa/2, kısa kenar kirişlerine yük yok'
      : 'Yük kirişlere köşelerden 45° çizgilerle dağıtılır: kısa kenara üçgen, uzun kenara yamuk (TS 500 11.4.3)',
  ];
  return sonla(e);
}

// 2. Kiriş: düşey yük çözümü (1,4G + 1,6Q, TS 500 6.2.6) ve kesit yeterliliği.
// ponytail: d = h − 50 mm (örtü 25 + etriye + φ/2, TS 500 9.5.1); dikdörtgen kesit (tabla katkısı yok, güvenli yan).
// Deprem momentleri ve kapasite kesmesi (TBDY 7.4.5) kesin hesapta.
function kirisDenetle(e, g, mz, kolonDik, n, k) {
  const b = g.kirisB, h = g.kirisH, d = h - 50, m = e.maddeler;
  madde(m, 'Gövde genişliği', b, '≥ 250 mm', b >= 250, 'TBDY 7.4.1.1(a)', 250 / b);
  const bUst = h + kolonDik;
  madde(m, 'Gövde genişliği üst sınırı', b, `≤ h + kolon genişliği = ${tr(bUst)} mm`, b <= bUst, 'TBDY 7.4.1.1(a)', b / bUst);
  const hAlt = Math.max(300, 3 * g.t);
  madde(m, 'Kiriş yüksekliği', h, `≥ max(300; 3·t) = ${tr(hAlt)} mm`, h >= hAlt, 'TBDY 7.4.1.1(b)', hAlt / h);
  madde(m, 'Kiriş yüksekliği üst sınırı', h, `≤ 3,5·b = ${tr(3.5 * b)} mm`, h <= 3.5 * b + TOL, 'TBDY 7.4.1.1(b)', h / (3.5 * b));
  // ρ ≤ min(0,02; 0,85ρb) ile kesitin alabileceği en büyük moment; ρb = 0,85·k1·(fcd/fyd)·600/(600 + fyd)
  const rhoB = 0.85 * mz.k1 * mz.fcd / mz.fyd * 600 / (600 + mz.fyd), rhoMax = Math.min(0.02, 0.85 * rhoB);
  const aMax = rhoMax * mz.fyd * d / (0.85 * mz.fcd), Mmax = 0.85 * mz.fcd * b * aMax * (d - aMax / 2) / 1e6;
  const mSinir = `ρ ≤ min(0,02; 0,85ρb) = ${tr(rhoMax, 4)} → M ≤ ${tr(Mmax, 1)} kNm`;
  madde(m, 'Mesnet momenti', e.MdMesnet, mSinir, e.MdMesnet <= Mmax, 'TBDY 7.4.2.4; TS 500 7.3 Denk. 7.4, 7.5', e.MdMesnet / Mmax);
  madde(m, 'Açıklık momenti', e.MdAcik, mSinir, e.MdAcik <= Mmax, 'TBDY 7.4.2.4; TS 500 7.3 Denk. 7.4, 7.5', e.MdAcik / Mmax);
  const Vmax = 0.22 * mz.fcd * b * d / 1000;
  madde(m, 'Kesme kuvveti', e.Vd, `≤ 0,22·fcd·b·d = ${tr(Vmax, 1)} kN`, e.Vd <= Vmax, 'TS 500 8.1.5, Denk. 8.7', e.Vd / Vmax);
  const tip = n === 1 ? 10 : k === 0 || k === n - 1 ? 12 : 15, hS = Math.ceil(e.L * 1000 / tip - TOL);
  // TS 500 13.2.1: muafiyet yalnız sehime duyarlı eleman (ör. duvar) taşımayan kirişte
  const duvarli = e.duvar > 0;
  madde(m, 'Sehim hesabı gerektirmeyen yükseklik', h, duvarli ? `kiriş duvar taşıyor, Çizelge 13.1 muafiyeti yok (ℓ/${tip} = ${tr(hS)} mm)` : `≥ ℓ/${tip} = ${tr(hS)} mm`,
    !duvarli && h >= hS, 'TS 500 13.2.1, Çizelge 13.1', duvarli ? null : hS / h, true);
  return sonla(e);
}

// 4. Temel: kolon altına eşit konsollu dikdörtgen tekil temel (TS 500 10.3), yalnız eksenel düşey yük.
// Zemin: TBDY 16.8.3.1 esas (TS 500 10.1'in işletme yükü yaklaşımıyla çakışır): q_o ≤ q_t = q_k/1,4, katsayılı yükle
// (1,4G + 1,6βQ; β TS 498 Madde 13 eşdeğer zemin basıncı). Temel ve üstündeki dolgu ağırlığı da 1,4 ile eklenir.
// Kesit: zımbalama (TS 500 8.3.1, γ = 1) ve kolon yüzünde kesme (TS 500 10.3.2, V_d ≤ V_cr = 0,65·fctd·B·d, 8.1.3),
// net katsayılı zemin tepkisiyle p_d = N_d/A (TS 500 10.1).
// ponytail: d = h − 70 mm (örtü 50, TS 500 10.1, + iki doğrultu ortalaması); konsol ve kalınlık 50 mm adımlı.
// Kolon momenti, deprem ve bodrum perdeleri yok; kenar/köşe kolonda zımbalama çevresi daralmaz (temel kolonu ortalar).
function temelHesap(c, g, mz) {
  const qt = g.zemin / 1.4, qNet = qt - 1.4 * GAMMA_DOLGU * g.Df;
  const b = c.b / 1000, h = c.h / 1000;
  const A = Math.max(c.Nd / qNet, 1);                                        // TS 500 10.3.2: taban alanı ≥ 1,0 m²
  const kon = Math.max(0.05, (0.7 - Math.min(b, h)) / 2,                     // TS 500 10.3.2: en küçük plan boyutu ≥ 0,7 m
    yukari((-(b + h) + Math.sqrt((b - h) ** 2 + 4 * A)) / 4, 0.05));        // (b + 2k)(h + 2k) ≥ A
  const k = yukari(kon, 0.05), Bx = b + 2 * k, By = h + 2 * k, pd = c.Nd / (Bx * By); // p_d: net katsayılı zemin tepkisi
  const kesit = hT => {
    const d = (hT - 70) / 1000, up = 2 * (b + d) + 2 * (h + d);
    const Vpd = c.Nd - pd * Math.min((b + d) * (h + d), Bx * By), Vpr = mz.fctd * 1000 * up * d; // kN
    const Vd = pd * Math.max(Bx, By) * k, Vcr = 0.65 * mz.fctd * 1000 * Math.max(Bx, By) * d;   // kolon yüzü, kN
    return { d, up, Vpd, Vpr, Vd, Vcr };
  };
  const hAlt = Math.max(250, Math.ceil(k * 1000 / 4 - TOL));                 // TS 500 10.3.2: h ≥ 250 mm ve ≥ l/4
  let hT = yukari(hAlt, 50);
  for (let z = kesit(hT); (z.Vpd > z.Vpr || z.Vd > z.Vcr) && hT < 3000; z = kesit(hT)) hT += 50;
  const z = kesit(hT), qo = c.Nd / (Bx * By) + 1.4 * GAMMA_DOLGU * g.Df;
  const e = { ad: c.ad.replace('S', 'T'), kolon: c.ad, aks: c.aks, i: c.i, j: c.j, Nk: c.Nk, Nd: c.Nd, A, Bx, By, kon: k, hT, sigma: qo, maddeler: [] };
  const m = e.maddeler;
  madde(m, 'Zemin taban basıncı', qo, `≤ q_t = q_k/1,4 = ${tr(qt, 0)} kN/m²`, qo <= qt + TOL, 'TBDY 16.8.3.1, Denk. 16.6–16.7', qo / qt);
  madde(m, 'Plan boyutu', Math.min(Bx, By), `≥ 0,7 m ve alan ≥ 1,0 m²`, Math.min(Bx, By) >= 0.7 - TOL && Bx * By >= 1 - TOL, 'TS 500 10.3.2', 0.7 / Math.min(Bx, By));
  madde(m, 'Temel kalınlığı', hT, `≥ max(250; l/4) = ${tr(hAlt)} mm`, hT >= hAlt, 'TS 500 10.3.2', hAlt / hT);
  madde(m, 'Zımbalama', z.Vpd, `≤ γ·fctd·u_p·d = ${tr(z.Vpr, 0)} kN`, z.Vpd <= z.Vpr, 'TS 500 8.3.1, Denk. 8.21', z.Vpd / z.Vpr);
  madde(m, 'Kolon yüzünde kesme', z.Vd, `≤ 0,65·fctd·B·d = ${tr(z.Vcr, 0)} kN`, z.Vd <= z.Vcr, 'TS 500 10.3.2, 8.1.3', z.Vd / z.Vcr);
  e.iz = [
    `N_d = 1,4G + 1,6βQ = ${tr(c.Nd, 0)} kN (N_k = G + βQ = ${tr(c.Nk, 0)} kN bilgi için)`,
    `q_t = ${tr(g.zemin, 0)}/1,4 = ${tr(qt, 0)} kN/m²; temel ve dolgu 1,4·${GAMMA_DOLGU}·${tr(g.Df)} = ${tr(1.4 * GAMMA_DOLGU * g.Df, 0)} kN/m² → A ≥ N_d/${tr(qNet, 0)} = ${tr(A, 3)} m²`,
    `Eşit konsol l = ${tr(k)} m → ${tr(Bx)} × ${tr(By)} m; p_d = N_d/A = ${tr(pd, 0)} kN/m²`,
    `Zımbalama: d = ${tr(z.d * 1000, 0)} mm, u_p = ${tr(z.up, 3)} m, V_pd = N_d − p_d·(b + d)(h + d) = ${tr(z.Vpd, 0)} kN`,
    `Kolon yüzünde kesme: V_d = p_d·B·l = ${tr(z.Vd, 0)} kN`,
  ];
  return sonla(e);
}

export function zincirHesap(g) {
  const ag = agKur(g.ax, g.ay), mz = malzeme(BETON[g.beton], CELIK[g.celik]), n = g.katSayisi;
  const notlar = [];
  // 1. Döşeme
  const dosemeler = ag.dosemeler.map(d => dosemeHesap(d, g));
  const gAlan = g.t / 1000 * GAMMA_BA + g.gKaplama, qAlan = g.q;
  // 2. Kiriş: döşeme kenar yükleri + duvar + gövde öz ağırlığı; her aks çizgisi sürekli kiriş
  const kolonOlcu = c => ({ b: g.kolonOzel?.[c.ad]?.b ?? g.kolonB, h: g.kolonOzel?.[c.ad]?.h ?? g.kolonH });
  const govde = g.kirisB / 1000 * (g.kirisH - g.t) / 1000 * GAMMA_BA;
  const kirisler = [], tepki = new Map(), kalkma = []; // tepki: hat → { G: R[], Q: R[] }
  ag.hatlar.forEach((hat, hi) => {
    const G = [], Q = [], izler = [];
    hat.kirisler.forEach((_, k) => {
      const pG = [], pQ = [], iz = [];
      const komsu = hat.yon === 'x' ? [[k, hat.no - 1], [k, hat.no]] : [[hat.no - 1, k], [hat.no, k]];
      for (const [i, j] of komsu) {
        const d = ag.dosemeler.find(x => x.i === i && x.j === j); if (!d) continue;
        const Le = hat.yon === 'x' ? d.lx : d.ly, pg = kenarParcasi(Le, d.lx, d.ly, gAlan), pq = kenarParcasi(Le, d.lx, d.ly, qAlan);
        if (pg.w === 0) { iz.push(`${d.ad}: bir doğrultulu, bu kenara yük vermez`); continue; }
        pG.push(pg); pQ.push(pq);
        iz.push(`${d.ad}: ${pg.a === 0 ? 'düzgün' : 2 * pg.a >= Le - TOL ? 'üçgen' : 'yamuk'}, tepe g ${tr(pg.w)} + q ${tr(pq.w)} kN/m`);
      }
      const duvar = hat.dis ? g.duvarDis : g.duvarIc;
      pG.push({ w: duvar + govde, a: 0 });
      iz.push(`${hat.dis ? 'Dış' : 'İç'} duvar ${tr(duvar)} + kiriş gövdesi ${tr(govde)} kN/m (düzgün)`);
      G.push(pG); Q.push(pQ); izler.push(iz);
    });
    const rG = surekliKiris(hat.L, G), rQ = surekliKiris(hat.L, Q), z = zarf(hat.L, G, Q);
    // Kolona giden tepki: rijit mesnetli, uçları mafsallı sürekli kiriş dış kolonu az, kısa uç açıklıkta negatif yükler.
    // Alt sınır olarak alan payı (basit kiriş tepkisi, TBDY 17.5.2.4) alınır; hareketli yükte her mesnet için
    // en elverişsiz desen (TS 500 6.3.3). Her kolon kendi en elverişsiz yüküyle boyutlanır; bu yüzden kolon yükleri
    // toplamı kat yükünü aşar (düzenli planda ~%10, kısa uç açıklıklı planda daha çok; güvenli yan).
    const pay = r => r.R.map((_, u) => ((r.acikliklar[u - 1]?.W ?? 0) + (r.acikliklar[u]?.W ?? 0)) / 2);
    const RQ = pay(rQ);
    for (const d of desenler(hat.L.length))
      surekliKiris(hat.L, Q.map((p, k) => d[k] ? p : [])).R.forEach((r, u) => { RQ[u] = Math.max(RQ[u], r); });
    // Kalkma: 1,4G + desenli 1,6Q altında uç tepki negatifse uyar (kolon yükü yine alan payıyla alınır).
    if (desenler(hat.L.length).some(d => surekliKiris(hat.L, G.map((p, k) => [...p.map(y => ({ w: 1.4 * y.w, a: y.a })),
      ...(d[k] ? Q[k].map(y => ({ w: 1.6 * y.w, a: y.a })) : [])])).R.some(r => r < -TOL))) kalkma.push(`${hat.aks} aksı`);
    tepki.set(hi, { G: rG.R.map((r, u) => Math.max(r, pay(rG)[u])), Q: RQ });
    hat.kirisler.forEach((kr, k) => {
      // kirişe dik kolon genişliği: iki uç kolonun küçüğü
      const uc = [k, k + 1].map(u => kolonOlcu(ag.kolonlar.find(c => hat.yon === 'x' ? c.i === u && c.j === hat.no : c.i === hat.no && c.j === u)));
      const kolonDik = Math.min(...uc.map(o => hat.yon === 'x' ? o.h : o.b));
      const e = { ad: kr.ad, aks: kr.aks, hat: hi, k, L: kr.L, b: g.kirisB, h: g.kirisH, duvar: hat.dis ? g.duvarDis : g.duvarIc,
        gOrt: rG.acikliklar[k].W / kr.L, qOrt: rQ.acikliklar[k].W / kr.L,
        ...z[k], maddeler: [] };
      e.iz = [...izler[k],
        `Ortalama g ${tr(e.gOrt)}, q ${tr(e.qOrt)} kN/m; ${hat.L.length} açıklıklı sürekli kiriş, rijit mesnet`,
        `1,4G + 1,6Q, hareketli yük açıklık açıklık en elverişsiz biçimde (TS 500 6.3.3): M_d mesnet ${tr(e.MdMesnet, 1)}, açıklık ${tr(e.MdAcik, 1)} kNm, V_d ${tr(e.Vd, 1)} kN`];
      kirisler.push(kirisDenetle(e, g, mz, kolonDik, hat.L.length, k));
    });
  });
  // 3. Kolon: iki doğrultudaki kiriş tepkileri + öz ağırlık, n kat; β yalnız hareketli yüke (TS 498 Bölüm 13)
  const bt = beta(g.kullanim, n), fck = BETON[g.beton];
  const kolonlar = ag.kolonlar.map(c => {
    const { b, h } = kolonOlcu(c);
    const hx = ag.hatlar.findIndex(t => t.yon === 'x' && t.no === c.j), hy = ag.hatlar.findIndex(t => t.yon === 'y' && t.no === c.i);
    const gx = tepki.get(hx).G[c.i], gy = tepki.get(hy).G[c.j], qx = tepki.get(hx).Q[c.i], qy = tepki.get(hy).Q[c.j];
    const oz = b / 1000 * h / 1000 * g.H / 1000 * GAMMA_BA;
    const G = n * (gx + gy + oz), Q = n * (qx + qy) * bt;
    const Ndm = (G + Q + 0.2 * g.sds * G) * g.kDeprem, Nd = 1.4 * G + 1.6 * Q;
    const r = kontrol({ b, h, fck, Ndm, Nd, katYuksekligi: g.H });
    const e = { ad: c.ad, aks: c.aks, i: c.i, j: c.j, b, h, NG: G, NQ: Q, beta: bt, Ndm, Nd, Nk: G + Q, tur: r.tur,
      oneri: kolonOner({ fck, Ndm, Nd }), maddeler: r.maddeler, belirleyici: r.belirleyici, gecti: r.gecti };
    e.iz = [
      `Kat başına G: X kirişlerinden ${tr(gx)} + Y kirişlerinden ${tr(gy)} + öz ağırlık ${tr(oz)} = ${tr(gx + gy + oz)} kN; Q: ${tr(qx)} + ${tr(qy)} = ${tr(qx + qy)} kN`,
      `${n} kat: G = ${tr(G, 0)} kN, βQ = ${tr(bt)} × ${n} × ${tr(qx + qy)} = ${tr(Q, 0)} kN (TS 498 Çizelge 8)`,
      `N_dm = (G + βQ + 0,2·S_DS·G)·k = (${tr(G, 0)} + ${tr(Q, 0)} + 0,2·${tr(g.sds)}·${tr(G, 0)})·${tr(g.kDeprem)} = ${tr(Ndm, 0)} kN`,
      `N_d = 1,4G + 1,6βQ = ${tr(Nd, 0)} kN`,
    ];
    return e;
  });
  // 4. Temel
  const temeller = kolonlar.map(c => temelHesap(c, g, mz));
  for (const t of temeller) { // komşu temellerle çakışma
    const sag = temeller.find(u => u.i === t.i + 1 && u.j === t.j), ust = temeller.find(u => u.i === t.i && u.j === t.j + 1);
    if (sag && (t.Bx + sag.Bx) / 2 > g.ax[t.i] - TOL) t.cakis = (t.cakis ?? []).concat(sag.ad), sag.cakis = (sag.cakis ?? []).concat(t.ad);
    if (ust && (t.By + ust.By) / 2 > g.ay[t.j] - TOL) t.cakis = (t.cakis ?? []).concat(ust.ad), ust.cakis = (ust.cakis ?? []).concat(t.ad);
  }
  for (const t of temeller) {
    madde(t.maddeler, 'Komşu temelle çakışma', t.cakis ? t.cakis.join(', ') : 'yok', 'çakışmamalı', !t.cakis, 'Tekil temel varsayımı');
    sonla(t);
  }
  const plan = ag.xs.at(-1) * ag.ys.at(-1), temelAlan = temeller.reduce((a, t) => a + t.Bx * t.By, 0);
  if (temeller.some(t => t.cakis)) notlar.push('Bazı tekil temeller çakışıyor: bu akslarda sürekli temel ya da radye düşünün.');
  if (temelAlan > plan / 2) notlar.push(`Tekil temeller plan alanının %${Math.round(temelAlan / plan * 100)}'ini kaplıyor: radye temel daha uygun olabilir.`);
  // TBDY 16.8.5: tekil temeller iki doğrultuda bağ kirişiyle bağlanır (ZA zemin hariç); N_b = 0,10·S_DS·N (en büyük kolon)
  const Nmax = Math.max(...kolonlar.map(c => c.Nd)), Nb = 0.1 * g.sds * Nmax, AsBag = Math.max(0.005 * 300 * 300, Nb * 1000 / mz.fyd);
  notlar.push(`Tekil temeller iki doğrultuda bağ kirişiyle bağlanmalı (ZA zeminde gerekmez): en az 300 × 300 mm, ρ ≥ %0,5, etriye φ8/200; N_b = 0,10·S_DS·N_d,max = ${tr(Nb, 0)} kN → A_s ≥ ${tr(Math.ceil(AsBag))} mm² (TBDY 16.8.5).`);
  if (kalkma.length) notlar.push(`${kalkma.join(', ')}: kısa uç açıklığında sürekli kiriş ucu kalkıyor (negatif tepki); kolon yükü alan payıyla alındı, kiriş uç bağlantısı kesin hesapta denetlenmeli.`);
  notlar.push('Temel hesabı yalnız düşey yükle: depremli birleşimde (TBDY 4.4.4, 16.8.3) taban basıncı, kayma ve kolon momenti; işletme yüküyle oturma (TS 500 6.2.6f, TBDY 16.8.3.4) kesin hesapta denetlenmeli.');
  notlar.push('Kirişler rijit mesnetli sürekli kiriş olarak çözüldü (TS 500 6.3.1): dış mesnet momenti ve kolon eğilmesi (TS 500 6.3.10 en küçük dışmerkezlik dahil) kesin hesapta denetlenmeli.');
  const qMin = Q_MIN[g.kullanim];
  if (qMin != null && g.q < qMin) notlar.push(`q = ${tr(g.q)} kN/m², TS 498 Çizelge 7 değerinin (${tr(qMin)} kN/m²) altında.`);
  // Kat başına uygulanan yük (G + Q), kat alanına bölünmüş: zarf toplamından bağımsız, akıl sağlaması için.
  const plan_ = ag.xs.at(-1) * ag.ys.at(-1), duvarBoy = ag.hatlar.reduce((a, h) => a + h.L.reduce((x, y) => x + y, 0) * (h.dis ? g.duvarDis : g.duvarIc), 0);
  const kirisBoy = ag.hatlar.reduce((a, h) => a + h.L.reduce((x, y) => x + y, 0), 0);
  const katYuk = plan_ * (gAlan + qAlan) + duvarBoy + kirisBoy * govde + kolonlar.reduce((a, c) => a + c.b / 1000 * c.h / 1000 * g.H / 1000 * GAMMA_BA, 0);
  return { ag, katSayisi: n, beta: bt, katYukAlan: katYuk / plan_, dosemeler, kirisler, kolonlar, temeller, notlar };
}
