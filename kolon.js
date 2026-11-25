// Kolon tasarımı: boyut, boyuna donatı, etriye. Birimler: mm, kN, kNm, MPa.
// Boyuna donatı TBDY 7.3.2 (%1 ≤ ρ ≤ %4, φ14/φ16); en küçük dışmerkezlik TS 500 6.3.10 (e ≥ 15 + 0,03h);
// güçlü kolon TBDY 7.3.5 (ΣMr,kolon ≥ 1,2·ΣMr,kiriş); etriye TBDY 7.3.4 (sarılma Denk. 7.1, orta bölge 7.3.4.2).
// ponytail: detay kuralları her zaman süneklik düzeyi yüksek (DTS 1–2) — DTS 3–4 için de güvenli yan.
import { kolonCubuk, kolonYuzMax, alan, CAP } from './donati.js';

const ES = 2e5, ECU = 0.003, ORTU = 25;
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);

// N (kN, basınç +) altında moment kapasitesi (kNm). Kesit b (genişlik) × h (eğilme doğrultusu),
// iki yüzde simetrik AsYuz (yan yüz çubukları güvenli yanda ihmal), dp: donatı ağırlık merkezinin yüze uzaklığı.
export function kolonMr(b, h, AsYuz, dp, N, mz) {
  const d = h - dp;
  const ic = c => {
    const a = Math.min(mz.k1 * c, h), Cc = 0.85 * mz.fcd * b * a;
    const s1 = Math.max(-mz.fyd, Math.min(mz.fyd, ES * ECU * (c - dp) / c)); // basınç donatısı (basınç +)
    const s2 = Math.max(-mz.fyd, Math.min(mz.fyd, ES * ECU * (d - c) / c));  // çekme donatısı (çekme +)
    return { F: Cc + AsYuz * s1 - AsYuz * s2, M: Cc * (h / 2 - a / 2) + AsYuz * s1 * (h / 2 - dp) + AsYuz * s2 * (d - h / 2) };
  };
  const Nn = N * 1000;
  if (ic(50 * h).F < Nn) return 0;                     // eksenel kapasite aşıldı
  let lo = 1e-6, hi = 50 * h;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (ic(m).F > Nn) hi = m; else lo = m; }
  return Math.max(0, ic((lo + hi) / 2).M / 1e6);
}
// Kiriş kesitinin taşıma gücü momenti (tek donatılı), kNm
export const kirisMr = (As, b, d, mz) => { const a = As * mz.fyd / (0.85 * mz.fcd * b); return As * mz.fyd * (d - a / 2) / 1e6; };
// Yüz başına çubuk (köşeler iki yüzde sayılır), simetrik yerleşim: [nb (b uzunluğundaki yüz), nh (h uzunluğundaki yüz)].
// n ≡ 2 (mod 4) ise artan iki çubuk uzun yüzlere (uzunB: b yüzleri uzun): 6 → 3/2, 8 → 3/3, 10 → 4/3, 12 → 4/4.
// mb, mh: yüze tek sırada sığan en çok çubuk (TS 500 9.5.2); eşit dağılım bir yüze sığmıyorsa fazlası öbür (uzun) yüze kaydırılır
// (yüz uzunluğuna orantılıya yakın); hiçbir dağılım sığmıyorsa null.
export const yuzlar = (n, uzunB, mb = Infinity, mh = Infinity) => {
  const t = 2 + Math.floor((n - 4) / 4), f = (n - 4) % 4 === 2 ? 1 : 0, S = n / 2 + 2; // S = nb + nh
  let [nb, nh] = uzunB ? [t + f, t] : [t, t + f];
  if (nb > mb) [nb, nh] = [mb, S - mb]; else if (nh > mh) [nb, nh] = [S - mh, mh];
  return nb >= 2 && nh >= 2 && nb <= mb && nh <= mh ? [nb, nh] : null;
};

// Boyuna donatı: %1'den başla; e_min ve güçlü kolon sağlanana dek çubuk ekle; %4'ü aşarsa yetmez.
// Çubuklar yüze tek sırada sığmalı (TS 500 9.5.2); sığmıyorsa { sigmaz, enAz } döner: daha çok çelik de sığmaz, kesit büyümeli
// (enAz: %1 bile sığmıyor — büyütmek de çözmez, çünkü çubuk sayısı D² ile, yer D ile artar).
// gucluX/gucluY: { Mr: ΣMr,kiriş (kNm), dugum: [[N_alt, N_üst], …] (kN, her düğüm) } ya da null (kiriş yok / muaf).
// Döner: { cubuk, rho, MrX, MrY, gX, gXi (belirleyen düğüm), ... } ya da null.
export function boyunaDonati(b, h, Nd, mz, gucluX, gucluY) {
  const Ac = b * h, dp = ORTU + 10 + 8;                  // örtü + etriye + φ/2
  const eX = 15 + 0.03 * b, eY = 15 + 0.03 * h;         // TS 500 6.3.10 (b: X doğrultusundaki boyut)
  // Güçlü kolon her düğümde: M_ra (alttaki kolon, N_alt) + M_rü (üstteki, N_üst); en küçüğü belirler (TBDY 7.3.5.1–2)
  const gEn = (gl, MrN) => (gl?.dugum ?? []).reduce((m, [Na, Nu], i) => { const v = MrN(Na) + MrN(Nu); return v < m.v ? { v, i } : m; }, { v: Infinity, i: -1 });
  for (let As = 0.01 * Ac; As <= 0.04 * Ac + 1e-6; As += 0.0025 * Ac) {
    const adaylar = CAP.kolon.map(phi => kolonCubuk(As, { caplar: [phi] })).sort((x, y) => x.As - y.As); // en az çelik önce
    if (adaylar[0].As > 0.04 * Ac) return null;
    const yer = (c, uzunB) => yuzlar(c.n, uzunB, kolonYuzMax(b, c.phi), kolonYuzMax(h, c.phi));
    const sigan = adaylar.filter(c => c.As <= 0.04 * Ac + 1e-6 && yer(c, b >= h));
    if (!sigan.length) return { sigmaz: true, enAz: As <= 0.01 * Ac + 1e-6 };
    for (const cubuk of sigan.slice(0, 1)) for (const uzunB of b === h ? [true, false] : [b > h]) { // karede iki yerleşim de denenir
      // X doğrultusunda eğilme: kolonMr(h, b, …) genişlik h, derinlik b → çekme/basınç yüzleri h uzunluğunda (nh çubuk)
      const [nb, nh] = yer(cubuk, uzunB), AfX = nh * alan(cubuk.phi), AfY = nb * alan(cubuk.phi);
      const MrX = kolonMr(h, b, AfX, dp, Nd, mz), MrY = kolonMr(b, h, AfY, dp, Nd, mz);
      const MdX = Nd * eX / 1000, MdY = Nd * eY / 1000;
      const gx = gEn(gucluX, N => kolonMr(h, b, AfX, dp, N, mz)), gy = gEn(gucluY, N => kolonMr(b, h, AfY, dp, N, mz)), gX = gx.v, gY = gy.v;
      const ok = MrX >= MdX && MrY >= MdY && (!gucluX || gX >= 1.2 * gucluX.Mr) && (!gucluY || gY >= 1.2 * gucluY.Mr);
      if (ok) return { cubuk, rho: cubuk.As / Ac, MrX, MrY, MdX, MdY, gX, gY, gXi: gx.i, gYi: gy.i, AfX, AfY, nb, nh };
    }
  }
  return null;
}

// Etriye (TBDY 7.3.4). bmin, bmax: kesit kenarları; phiL: boyuna çap; Nd; ln: kolon serbest boyu (mm); nb, nh: yüz başına çubuk.
// Kollar boyuna çubuğu sarar (7.3.4 → 7.2.8): b boyunca kx kol ≤ nb, h boyunca ky kol ≤ nh. Hiçbir çapta sağlanmazsa en az çubuk
// isteyen çap döner, nGerek: kolları bağlamak için gereken toplam çubuk (ara çubuk eklenir).
export function etriye(b, h, phiL, Nd, ln, mz, nb, nh) {
  const bmin = Math.min(b, h), bmax = Math.max(b, h), Ac = b * h, Ack = (b - 2 * ORTU) * (h - 2 * ORTU);
  const sarBoy = Math.max(ln / 6, 1.5 * bmax, 500);                                   // TBDY 7.3.4.1
  const katsayi = Nd * 1000 > 0.2 * Ac * mz.fck ? 1 : 2 / 3;                         // Denk. 7.1; Nd ≤ 0,2·Ac·fck ise 2/3
  const fywk = mz.fyk;
  let ek = null;
  for (const phi of CAP.etriye) {
    if (phi < phiL / 3) continue;                                                    // TS 500 7.4.1: φw ≥ φl/3
    const sSar = Math.max(50, Math.floor(Math.min(bmin / 3, 150, 6 * phiL) / 10) * 10); // TBDY 7.3.4.1(a)
    const kol = dim => {
      const bk = dim - 2 * ORTU - phi;
      const Ash = katsayi * Math.max(0.30 * sSar * bk * (Ac / Ack - 1) * mz.fck / fywk, 0.075 * sSar * bk * mz.fck / fywk);
      return Math.max(2, Math.ceil(Ash / alan(phi) - 1e-9), Math.ceil(bk / (25 * phi)) + 1); // kol aralığı ≤ 25φw
    };
    const kx = kol(b), ky = kol(h);                                                  // b doğrultusundaki boyut için kol sayısı
    const sOrta = Math.floor(Math.min(bmin / 2, 200, 12 * phiL) / 10) * 10;          // TBDY 7.3.4.2; TS 500 7.4.1
    const r = { phi, sSar, sOrta, kx, ky, sarBoy, katsayi, nb: Math.max(nb, kx), nh: Math.max(nh, ky) };
    if (kx <= nb && ky <= nh) return r;                                              // her kol bir çubuğu sarar
    r.nGerek = 2 * (r.nb + r.nh) - 4;                                                // çiroz bağlanacak çubuk yok: büyük çap dene
    if (!ek || r.nGerek < ek.nGerek) ek = r;
  }
  return ek;
}
