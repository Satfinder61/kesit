// Kesit hesabı ve donatı seçimi. Birimler: mm, mm², kN, kNm, MPa.
// Eğilme: TS 500 7.1 eşdeğer dikdörtgen basınç bloğu (0,85·fcd, a = k1·c), tek donatılı dikdörtgen kesit.

export const alan = phi => Math.PI * phi * phi / 4;

// Kullanıcının çap seçenekleri
export const CAP = { doseme: [8, 10], kiris: [12, 14, 16], kolon: [14, 16], etriye: [8, 10], radye: [12, 14, 16] };

// ρb = 0,85·k1·(fcd/fyd)·600/(600 + fyd) (TS 500 0.2.5 ve 7.1 varsayımlarından; εcu = 0,003, Es = 2·10⁵ MPa)
export const rhoB = mz => 0.85 * mz.k1 * mz.fcd / mz.fyd * 600 / (600 + mz.fyd);
// Kirişte en büyük çekme donatısı oranı: ρ ≤ 0,02 ve ρ ≤ 0,85ρb (TBDY 7.4.2.4; TS 500 7.3 Denk. 7.4, 7.5)
export const rhoMax = mz => Math.min(0.02, 0.85 * rhoB(mz));
// Kirişte en küçük çekme donatısı oranı: 0,8·fctd/fyd (TBDY 7.4.2.1 Denk. 7.8; TS 500 Denk. 7.3)
export const rhoMinKiris = mz => 0.8 * mz.fctd / mz.fyd;

// Md (kNm) için gerekli çekme donatısı (mm²); kesit basınç bloğuyla taşıyamıyorsa Infinity.
export function egilmeAs(Md, b, d, mz) {
  if (!(Md > 0)) return 0;
  const disk = d * d - 2 * Md * 1e6 / (0.85 * mz.fcd * b);
  if (disk < 0) return Infinity;
  return 0.85 * mz.fcd * b * (d - Math.sqrt(disk)) / mz.fyd;
}
// ρ = ρmax iken kesitin alabileceği en büyük moment (kNm)
export function mMax(b, d, mz) {
  const a = rhoMax(mz) * mz.fyd * d / (0.85 * mz.fcd);
  return 0.85 * mz.fcd * b * a * (d - a / 2) / 1e6;
}

// Döşeme: metre başına gereken As (mm²/m) için çap ve aralık. Aralık 10 mm'ye aşağı yuvarlanır, sMax'ı aşmaz.
// Önce küçük çap denenir; aralık sAlt'tan (pratik en küçük aralık) küçük kalırsa bir büyük çapa geçilir.
// yeter: s ≥ sAlt (uygulama tercihi); kod: s ≥ sKod (TS 500 9.5.2). s ≤ 0 ise As = 0 (sonsuz çelik sayılmaz).
export function dosemeCubuk(As, sMax, { caplar = CAP.doseme, sAlt = 100 } = {}) {
  let son = null;
  for (const phi of caplar) {
    const s = Math.min(Math.floor(sMax / 10) * 10, Math.floor(alan(phi) * 1000 / Math.max(As, 1e-9) / 10) * 10);
    son = { phi, s, As: s > 0 ? alan(phi) * 1000 / s : 0, yeter: s >= sAlt, kod: s >= sKod(phi) };
    if (son.yeter) return son;
  }
  return son; // en büyük çapla bile aralık sAlt'ın altında: kalınlık ya da çap artırılmalı
}

// TS 500 9.5.2: aynı sıradaki çubuklar arası net aralık ≥ max(φ; 4/3·Dmax; 25 mm); Dmax = 22 mm varsayımı → eksen aralığı,
// 10 mm'ye yukarı: φ8/φ10 40 mm, φ12–φ16 50 mm.
export const sKod = (phi, dmax = 22) => Math.ceil((phi + Math.max(25, phi, 4 / 3 * dmax)) / 10 - 1e-9) * 10;

// Kiriş: gereken As için tek sırada sığan, en az çelik veren çap/adet (en az 2 çubuk, TBDY 7.4.2.2).
// Sığma: 2·(örtü + etriye) + n·φ + (n − 1)·max(25, φ) ≤ bw (TS 500 9.5.2 net aralık ≥ 25 mm ve ≥ φ).
// Seçim: sığan düzenlerden en az çeliği verenin %10 yakınındakiler arasında en az çubuklu olanı (uygulamada az çubuk tercih edilir).
// sira: 2 ise çubuklar iki sıraya bölünür (sıra başına ⌈n/2⌉; TS 500 9.5.2 sıralar arası net ≥ 25 mm, aynı düşey eksende).
export function kirisCubuk(As, bw, { caplar = CAP.kiris, ortu = 25, etriye = 8, enAz = 2, sira = 1 } = {}) {
  const adaylar = caplar.map(phi => {
    const n = Math.max(enAz, Math.ceil(As / alan(phi) - 1e-9)), m = Math.ceil(n / sira);
    return { n, phi, sira, As: n * alan(phi), sigar: 2 * (ortu + etriye) + m * phi + (m - 1) * Math.max(25, phi) <= bw };
  });
  const sigan = adaylar.filter(a => a.sigar);
  if (!sigan.length) return { ...adaylar.at(-1), sigar: false };
  const enAzAs = Math.min(...sigan.map(a => a.As));
  return sigan.filter(a => a.As <= 1.1 * enAzAs + 1e-9).sort((a, b) => a.n - b.n || a.As - b.As)[0];
}

// Kolon: gereken As için çift sayıda, en az 4 çubuk; en az çelik veren çap.
export function kolonCubuk(As, { caplar = CAP.kolon, enAz = 4 } = {}) {
  let en = null;
  for (const phi of caplar) {
    let n = Math.max(enAz, Math.ceil(As / alan(phi) - 1e-9));
    if (n % 2) n++;
    const s = { n, phi, As: n * alan(phi) };
    if (!en || s.As < en.As - 1e-9) en = s;
  }
  return en;
}
// Kolon: bir yüze tek sırada sığan en çok çubuk (köşeler dahil). TS 500 9.5.2: kolonda net aralık ≥ 1,5φ, ≥ 40 mm, ≥ 4/3·Dmax
// (Dmax ≤ 30 mm varsayımı: 40 mm belirler); örtü 25 + etriye φ10 (güvenli yan).
export const kolonYuzMax = (D, phi, { ortu = 25, etriye = 10 } = {}) => { const s = Math.max(1.5 * phi, 40); return Math.floor((D - 2 * (ortu + etriye) + s) / (phi + s) + 1e-9); };

// Etriye: gereken Asw/s (mm²/mm) için çap ve aralık; aralık 10 mm'ye aşağı yuvarlanır, sMax'ı aşmaz.
// Önce küçük çap; aralık sAlt'tan küçük kalırsa büyük çap.
export function etriyeSec(aswS, sMax, { caplar = CAP.etriye, kol = 2, sAlt = 50 } = {}) {
  let son = null;
  for (const phi of caplar) {
    const s = Math.min(Math.floor(sMax / 10) * 10, Math.floor(kol * alan(phi) / Math.max(aswS, 1e-9) / 10) * 10);
    son = { phi, s, kol, yeter: s >= sAlt };
    if (son.yeter) return son;
  }
  return son;
}

export const cubukYaz = c => `${c.n}φ${c.phi}${c.sira === 2 ? ' (2 sıra)' : ''}`;
export const aralikYaz = c => `φ${c.phi}/${c.s}`;
