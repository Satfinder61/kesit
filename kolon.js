// Kolon tasarımı: boyut, boyuna donatı, etriye. Birimler: mm, kN, kNm, MPa.
// Boyuna donatı TBDY 7.3.2 (%1 ≤ ρ ≤ %4, φ14/φ16); en küçük dışmerkezlik TS 500 6.3.10 (e ≥ 15 + 0,03h), narinlikte
// β ile büyütülür (TS 500 7.6.2); güçlü kolon TBDY 7.3.5 (ΣMr,kolon ≥ 1,2·ΣMr,kiriş); etriye TBDY 7.3.4 (sarılma Denk. 7.1,
// orta bölge 7.3.4.2) ve kesme güvenliği TBDY 7.3.7.
// ponytail: detay kuralları her zaman süneklik düzeyi yüksek (DTS 1–2) — DTS 3–4 için de güvenli yan.
import { kolonCubuk, kolonYuzMax, alan, CAP } from './donati.js';
import { EC } from './sehim.js';

const ES = 2e5, ECU = 0.003, ORTU = 25;
const ETR = Math.max(...CAP.kolonEtriye), DP = ORTU + ETR + 8; // donatı ağırlık merkezi: örtü + en büyük etriye (φ12) + φ16/2
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
// bX, bY: narinlik moment büyütme çarpanı (TS 500 7.6.2.5; Denk. 7.26: M_d = β·M2, M2 ≥ N_d·e_min).
export function boyunaDonati(b, h, Nd, mz, gucluX, gucluY, bX = 1, bY = 1) {
  const Ac = b * h, dp = DP;
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
      const MdX = bX * Nd * eX / 1000, MdY = bY * Nd * eY / 1000;
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
// kes (isteğe bağlı) = { VeX, VeY, Nmin }: kapasite kesmesi (TBDY 7.3.7) için aralık sıklaştırılır (≥ 50 mm, 7.3.4.1(a)); X kesmesini
// h boyunca dizili ky kol, Y kesmesini kx kol taşır. V_c TS 500 Denk. 8.1, 8.4 (N = en üst katın N_d'si, güvenli yan); sarılma bölgesinde
// N_d ≤ 0,05·A_c·fck ise V_c = 0 (TBDY 7.3.7.6; deprem kesmesinin toplamın yarısını aştığı kapasite tasarımında kabul edildi).
// Seçim sırası: kollar çubuğa yeter ve kesme yeter > ara çubukla kesme yeter > kesme yetmez (kesme = false: kesit büyümeli).
export function etriye(b, h, phiL, Nd, ln, mz, nb, nh, kes = null) {
  const bmin = Math.min(b, h), bmax = Math.max(b, h), Ac = b * h, Ack = (b - 2 * ORTU) * (h - 2 * ORTU);
  const sarBoy = Math.max(ln / 6, 1.5 * bmax, 500);                                   // TBDY 7.3.4.1
  const katsayi = Nd * 1000 > 0.2 * Ac * mz.fck ? 1 : 2 / 3;                         // Denk. 7.1; Nd ≤ 0,2·Ac·fck ise 2/3
  const fywk = mz.fyk, fywd = mz.fyk / 1.15, dX = b - DP, dY = h - DP;
  const vc = (bw, d) => kes ? 0.8 * 0.65 * mz.fctd * bw * d * (1 + 0.07 * kes.Nmin * 1000 / Ac) / 1000 : 0; // TS 500 Denk. 8.1, 8.4
  const VcX = vc(h, dX), VcY = vc(b, dY), sifir = !!kes && kes.Nmin * 1000 <= 0.05 * Ac * mz.fck;   // TBDY 7.3.7.6
  let ek = null, kesmesiz = null;
  for (const phi of CAP.kolonEtriye) {
    if (phi < phiL / 3) continue;                                                    // TS 500 7.4.1: φw ≥ φl/3
    const sSar0 = Math.max(50, Math.floor(Math.min(bmin / 3, 150, 6 * phiL) / 10) * 10); // TBDY 7.3.4.1(a)
    const kol = dim => {
      const bk = dim - 2 * ORTU - phi;
      const Ash = katsayi * Math.max(0.30 * sSar0 * bk * (Ac / Ack - 1) * mz.fck / fywk, 0.075 * sSar0 * bk * mz.fck / fywk);
      return Math.max(2, Math.ceil(Ash / alan(phi) - 1e-9), Math.ceil(bk / (25 * phi)) + 1); // kol aralığı ≤ 25φw
    };
    const kx = kol(b), ky = kol(h);                                                  // b doğrultusundaki boyut için kol sayısı
    const sOrta0 = Math.floor(Math.min(bmin / 2, 200, 12 * phiL) / 10) * 10;         // TBDY 7.3.4.2; TS 500 7.4.1
    // V_w = (A_sw/s)·f_ywd·d (TS 500 Denk. 8.5) ≥ V_e − V_c → s ≤ A_sw·f_ywd·d/(V_e − V_c)
    const sK = (n, d, Ve, Vc) => Ve > Vc ? n * alan(phi) * fywd * d / ((Ve - Vc) * 1000) : Infinity;
    const Vr = (n, d, Vc, s) => Vc + n * alan(phi) * fywd * d / s / 1000;
    const sSar = kes ? Math.floor(Math.min(sSar0, sK(ky, dX, kes.VeX, sifir ? 0 : VcX), sK(kx, dY, kes.VeY, sifir ? 0 : VcY)) / 10) * 10 : sSar0;
    const sOrta = kes ? Math.floor(Math.min(sOrta0, sK(ky, dX, kes.VeX, VcX), sK(kx, dY, kes.VeY, VcY)) / 10) * 10 : sOrta0;
    const r = { phi, sSar, sOrta, kx, ky, sarBoy, katsayi, nb: Math.max(nb, kx), nh: Math.max(nh, ky), kesme: sSar >= 50 && sOrta >= 50 };
    if (kes) {
      const [sS, sO] = [Math.max(sSar, 50), Math.max(sOrta, 50)];                   // yetmezse 50 mm ile verilen dayanım (dürüst kullanım)
      Object.assign(r, { VcX, VcY, sifir, VrSarX: Vr(ky, dX, sifir ? 0 : VcX, sS), VrSarY: Vr(kx, dY, sifir ? 0 : VcY, sS), VrOrtaX: Vr(ky, dX, VcX, sO), VrOrtaY: Vr(kx, dY, VcY, sO) });
    }
    if (kx <= nb && ky <= nh) { if (r.kesme) return r; kesmesiz ??= r; continue; }   // her kol bir çubuğu sarar
    r.nGerek = 2 * (r.nb + r.nh) - 4;                                                // çiroz bağlanacak çubuk yok: büyük çap dene
    if (!ek || (r.kesme && !ek.kesme) || (r.kesme === ek.kesme && r.nGerek < ek.nGerek)) ek = r;
  }
  return ek?.kesme ? ek : kesmesiz ?? ek;
}

// TBDY 7.3.7: kolon kapasite kesmesi V_e = (M_a + M_ü)/ℓn (Denk. 7.5), bir doğrultuda. bw: eğilmeye dik kenar, hd: eğilme
// doğrultusundaki kenar, Af: bir yüzdeki çubuk alanı, ln: serbest boy (mm), SMp: düğüme bu doğrultuda bağlanan kirişlerin
// ΣM_p = 1,4·ΣM_r (kNm; 7.3.7.2, Denk. 7.6), 0: kiriş yok. Kolon ucu M_p ≈ 1,4·M_r (7.3.7.3), N momenti en büyük yapan kat N_d'si
// (k/n·N_d, k = 1…n); zemin kat alt ucu temelde kolon kapasitesi (7.3.7.4). Düğümdeki uç kirişlerin verebileceği ΣM_p'yi aşamaz
// (denge); ΣM_p'nin alt/üst kolona dağıtımı (7.3.7.2) çözümleme ister → güvenli yanda tamamı bu kolona.
export function kolonVe(bw, hd, Af, Nd, n, ln, SMp, mz) {
  const Mp = N => 1.4 * kolonMr(bw, hd, Af, DP, N, mz), ust = SMp > 0 ? SMp : Infinity, MpZ = Mp(Nd);
  let M = MpZ + Math.min(MpZ, ust), kat = 1;
  if (MpZ < ust) for (let k = 1; k < n; k++) { const m = 2 * Math.min(Mp(Nd * k / n), ust); if (m > M) { M = m; kat = n - k + 1; } }
  return { Ve: M / (ln / 1000), M, MpZ, kat };
}

// TS 500 7.6 narinlik, yaklaşık yöntem (7.6.2), bir eğilme doğrultusu. bw: eğilmeye dik kenar, hd: eğilme doğrultusundaki kenar,
// ln: serbest boy, H: kat yüksekliği (mm); kirisR: düğümdeki kirişlerin Σ(I/ℓ), çatlamış I = 0,5·I_g (7.6.2.2; tabla ihmal: α büyür,
// güvenli yan; kirişsizde kolon şeridi), mm³. Ngd = 1,4G. tutulu: yanal ötelenme önlenmiş (perde, 7.6.2.1).
// Katlar: zemin (temel ucu ankastre, α = 0), ara kat (iki uç ara düğüm), n = 2'de üst kat, n = 1'de çatı düğümünde tek kolon (α/2).
// Uç momentleri e_min'den eşit (tek eğrilik): M1/M2 = 1 → Denk. 7.17 sınırı 22, C_m = 1 (7.25).
// Bireysel β (Denk. 7.24): k önlenmiş (7.14, ≤ 1), R_m = N_gd/N_d (7.22). Önlenmemişte ayrıca β_s (Denk. 7.27): k Denk. 7.15,
// R_m = ΣV_gd/ΣV_d ≈ 0 (7.23: ötelenme kesmesi deprem kaynaklı, kalıcı payı yok); kat: [ΣN_d/ΣN_k] (kat başına, bütün kolonlar)
// verilmezse β_s kolonun N_d/N_k'sıyla kestirilir ve Denk. 7.28 aranmaz (ilk tur). M_d = max(β; β_s)·M2, Denk. 7.29 aşılırsa β·β_s.
// Dönüş: belirleyici kat + λ, duraylılık en büyükleri; katlar: her katın N ve N_k'sı (kat toplamı için).
export function narinlik({ bw, hd, ln, H, n, kirisR, Nd, Ngd, fck, tutulu, kat = null }) {
  const Ic = bw * hd ** 3 / 12, i = 0.3 * hd, a = kirisR > 0 ? Math.min(2 * Ic / H / kirisR, 1e6) : 1e6; // Denk. 7.16
  const Rm = Nd > 0 ? Ngd / Nd : 0, EIb = 0.4 * EC[fck] * Ic / (1 + Rm), EIs = 0.4 * EC[fck] * Ic; // Denk. 7.21
  const kB = (a1, a2) => Math.min(0.7 + 0.05 * (a1 + a2), 0.85 + 0.05 * Math.min(a1, a2), 1);    // Denk. 7.14
  const kS = am => am < 2 ? (20 - am) / 20 * Math.sqrt(1 + am) : 0.9 * Math.sqrt(1 + am);        // Denk. 7.15
  const Nk = (EI, lk) => Math.PI ** 2 * EI / lk ** 2 / 1000, buy = o => o < 1 ? 1 / (1 - o) : null; // Denk. 7.19, kN; null: 1,3·N ≥ N_k (burkulma)
  const katlar = n === 1 ? [[0, a / 2, Nd, 'zemin']] : [[0, a, Nd, 'zemin'], n >= 3 ? [a, a, Nd * (n - 1) / n, '2. kat'] : [a, a / 2, Nd / 2, 'üst kat']];
  const r = katlar.map(([a1, a2, N, ad], j) => {
    const k = tutulu ? kB(a1, a2) : kS((a1 + a2) / 2), lk = k * ln, lam = lk / i, ihmal = lam <= 22 + 1e-9;  // Denk. 7.17 / 7.18
    const NkB = Nk(EIb, kB(a1, a2) * ln), NkS = tutulu ? null : Nk(EIs, lk), oranS = tutulu ? 0 : kat ? kat[j] : N / NkS;
    const b1 = ihmal ? 1 : buy(1.3 * N / NkB), bs = tutulu || ihmal ? 1 : buy(1.3 * oranS);
    const carpim = !tutulu && !ihmal && ln / i > 35 / Math.sqrt(N * 1000 / (fck * bw * hd));        // Denk. 7.29
    return { kat: ad, a1, a2, k, lk, lam, N, NkB, NkS, oranS, katToplam: !!kat, ihmal, b1, bs, carpim, beta: b1 == null || bs == null ? null : carpim ? b1 * bs : Math.max(b1, bs),
      dur: tutulu || ihmal || !kat ? 0 : oranS / 0.45, bur: ihmal ? 0 : Math.max(1.3 * N / NkB, tutulu ? 0 : 1.3 * oranS) }; // bur ≥ 1: β sonsuz (burkulma)
  });
  const B = x => x.beta ?? Infinity, en = r.reduce((x, y) => B(y) > B(x) || (B(y) === B(x) && y.lam > x.lam) ? y : x);
  return { ...en, i, a, Rm, tutulu, katlar: r.map(x => [x.N, x.NkS]), lamMax: Math.max(...r.map(x => x.lam)), durMax: Math.max(...r.map(x => x.dur)), burMax: Math.max(...r.map(x => x.bur)) };
}
