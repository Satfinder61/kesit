// Perde (betonarme deprem perdesi) ön tasarımı: plandaki yer, düşey yük, kesit, uç bölgeleri ve gövde donatısı (TBDY 2018 7.6),
// perdeli çerçevede yanal ötelenme ölçütü (TS 500 7.6.2.1). Birimler: mm, kN, kNm, MPa; açıklık m.
// Perde bir aks çizgisinde bir ya da ardışık açıklıkları eksenden eksene kaplar; uç düğümlerdeki kolonlar perdenin uç bölgesi olur
// (kolon olarak ayrıca tasarlanmaz), aradaki düğümler gövdeye katılır. ℓw = eksen boyu + bw: uçlar aks dışına bw/2 taşar (dik
// doğrultudaki aynı kalınlıklı perde ya da kirişle yüz yüze; TBDY ℓw'yi 'perdenin plandaki uzunluğu' diye tanımlar).
// Deprem kuvvetleri (M_d, V_e; TBDY 7.6.6), göreli kat ötelemesi (4.9.1) ve burulma düzensizliği (3.6.2.1) deprem çözümlemesi ister.
import { kontrol } from './kurallar.js';
import { alan, CAP, dosemeCubuk, kolonYuzMax } from './donati.js';
import { kolonMr } from './kolon.js';

const TOL = 1e-9, ORTU = 25, GAMMA_BA = 25, DP = ORTU + Math.max(...CAP.perdeEtriye) + Math.max(...CAP.perde) / 2;
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);
const yukari = (x, adim) => Math.ceil(x / adim - TOL) * adim;
const harf = j => String.fromCharCode(65 + j);
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null, uyari = false) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari });
const sonla = e => {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
  return e;
};

// ── Girdi: "A/1–2; 3/A–B" (aks / açıklık). Harfli aks (A, B…) X doğrultusundaki hat, açıklığı sayılı akslar arasında; sayılı aks
// (1, 2…) Y doğrultusundaki hat, açıklığı harfli akslar arasında. Tire türü (-, –, —), boşluk ve küçük harf önemsiz; ayraç ; , ya da
// satır sonu. "A/1–3" iki açıklık; "1–2/A" de okunur. Dönüş: { liste: [{ yon, no, k0, k1 }] (bitişikler birleşik), hata: [] }.
// Aks sayısına göre aralık perdeDisari ile denetlenir. Dizi verilirse ({ yon, no, k0, k1 } ya da { yon, no, k }) olduğu gibi alınır.
export function perdeOku(metin) {
  if (Array.isArray(metin)) return { liste: perdeBirlestir(perdeAciklik(metin)), hata: [] };
  const liste = [], hata = [], A = '([A-Z]|\\d{1,2})';
  for (const ham of String(metin ?? '').split(/[;,\n]+/)) {
    const s = ham.replace(/\s+/g, '').toLocaleUpperCase('en').replace(/[‐-―−]/g, '-'), yaz = `"${ham.trim().replace(/[<>&"]/g, "")}"`; // hata metninde HTML karakteri kalmasın
    if (!s) continue;
    let m = new RegExp(`^${A}/${A}-${A}$`).exec(s), hat, a, b;
    if (m) [, hat, a, b] = m;
    else if ((m = new RegExp(`^${A}-${A}/${A}$`).exec(s))) [, a, b, hat] = m;
    else { hata.push(`${yaz}: aks/açıklık biçiminde yaz (A/1–2 ya da 3/A–B)`); continue; }
    const harfli = /^[A-Z]$/.test(hat);
    if ([a, b].some(x => /^[A-Z]$/.test(x) === harfli)) { hata.push(`${yaz}: harfli aksta açıklık sayılı akslar (A/1–2), sayılı aksta harfli akslar (3/A–B) arasında olmalı`); continue; }
    const no = harfli ? hat.charCodeAt(0) - 65 : +hat - 1, u = [a, b].map(x => harfli ? +x - 1 : x.charCodeAt(0) - 65);
    if (no < 0 || u.some(x => x < 0)) { hata.push(`${yaz}: 0 diye aks yok (akslar 1'den başlar)`); continue; }
    if (u[0] === u[1]) { hata.push(`${yaz}: açıklık iki farklı aks arasında olmalı`); continue; }
    liste.push({ yon: harfli ? 'x' : 'y', no, k0: Math.min(...u), k1: Math.max(...u) - 1 });
  }
  return { liste: perdeBirlestir(perdeAciklik(liste)), hata };
}
// Perde listesi → tek tek açıklıklar [{ yon, no, k }] (tekrarsız, sıralı)
export function perdeAciklik(liste) {
  const m = new Map();
  for (const p of liste) for (let k = p.k0 ?? p.k; k <= (p.k1 ?? p.k); k++) m.set(`${p.yon}:${p.no}:${k}`, { yon: p.yon, no: p.no, k });
  return [...m.values()].sort((a, b) => (a.yon > b.yon) - (a.yon < b.yon) || a.no - b.no || a.k - b.k);
}
// Aynı hatta bitişik açıklıklar tek perde (ortadaki kolon gövdeye katılır; aynı hatta yan yana iki ayrı perde fiziksel değil)
export function perdeBirlestir(aciklik) {
  const l = [];
  for (const a of perdeAciklik(aciklik)) {
    const s = l.at(-1);
    if (s && s.yon === a.yon && s.no === a.no && s.k1 + 1 === a.k) s.k1 = a.k; else l.push({ yon: a.yon, no: a.no, k0: a.k, k1: a.k });
  }
  return l;
}
export const perdeYaz = liste => liste.map(p => p.yon === 'x' ? `${harf(p.no)}/${p.k0 + 1}–${p.k1 + 2}` : `${p.no + 1}/${harf(p.k0)}–${harf(p.k1 + 1)}`).join('; ');
// Aks sayısına göre aralık dışı girdiler (nx, ny: X ve Y açıklık sayısı)
export const perdeDisari = (liste, nx, ny) => liste.filter(p => p.yon === 'x' ? p.no > ny || p.k1 > nx - 1 : p.no > nx || p.k1 > ny - 1);
// Aralık içinde kalan açıklıklar (aks sayısı değişince girdi kırpılır)
export const perdeKirp = (liste, nx, ny) => perdeBirlestir(perdeAciklik(liste).filter(a => a.yon === 'x' ? a.no <= ny && a.k <= nx - 1 : a.no <= nx && a.k <= ny - 1));

// ── Ağ üzerinde perdeler: ad P1, P2… (X hatları önce), hat sırası, düğümler (yutulan kolon adları). Bir düğüm birden çok perdede ise
// (köşe) düğüme gelen kiriş tepkisi ve alan payı yalnız ilk perdeye yazılır (sahip). ikiUcTutulu: iki uç da dik perdede (7.6.1.2(c)).
export function perdeAg(ag, liste) {
  const bay = new Set(), dugum = new Map();
  const perdeler = liste.map((p, i) => {
    const hi = ag.hatlar.findIndex(h => h.yon === p.yon && h.no === p.no), hat = ag.hatlar[hi], dugumler = [];
    for (let u = p.k0; u <= p.k1 + 1; u++) dugumler.push(ag.kolonlar.find(c => p.yon === 'x' ? c.i === u && c.j === p.no : c.i === p.no && c.j === u).ad);
    for (let k = p.k0; k <= p.k1; k++) bay.add(`${hi}:${k}`);
    return { ad: `P${i + 1}`, yon: p.yon, no: p.no, hi, k0: p.k0, k1: p.k1, L: hat.L.slice(p.k0, p.k1 + 1).reduce((a, b) => a + b, 0),
      aks: perdeYaz([p]).replace('/', ' / '), dugumler, uclar: [dugumler[0], dugumler.at(-1)] };
  });
  for (const p of perdeler) for (const ad of p.dugumler) if (!dugum.has(ad)) dugum.set(ad, p.ad);
  for (const p of perdeler) {
    p.sahip = p.dugumler.filter(ad => dugum.get(ad) === p.ad);
    p.ikiUcTutulu = p.uclar.every(ad => perdeler.some(q => q.yon !== p.yon && q.dugumler.includes(ad)));
  }
  return { perdeler, bay, dugum };
}

// ── Perde tasarımı. p: perdeAg elemanı; bw: başlangıç kalınlığı (mm); G1, Q1: kat başına perdeye gelen yük (öz ağırlık hariç, kN);
// bt: TS 498 β; iz: yük açıklaması; bwGirdi: kullanıcının kalınlığı (büyütme notu için; bw önceki turdan büyümüş olabilir). Kalınlık koşulu ya da eksenel sınır sağlanmazsa bw 50 mm adımla büyür (en çok 20 adım, ℓw/bw ≥ 6
// kaldıkça). N_dm = (G + βQ + 0,2·S_DS·G)·k (kolondaki gibi, TBDY 7.6.1.1), N_d = 1,4G + 1,6βQ.
// sabit: kalınlık elle verildi, büyütülmez; koşullar bu kalınlıkla denetlenir.
export function perdeTasarla({ p, bw, bwGirdi = bw, n, H, G1, Q1, bt, mz, sds, kDeprem, iz = [], sabit = false, katYuk = null }) {
  // Gdiger: bu katın perde öz ağırlığı dışındaki birikmiş G; Qham: birikmiş azaltılmamış Q.
  if (katYuk && (![katYuk.Gdiger, katYuk.Qham].every(x => Number.isFinite(x) && x >= 0) || !(Number.isFinite(katYuk.Hw) && katYuk.Hw >= H)))
    throw new RangeError('Katlı perde yükleri ve bina yüksekliği geçerli olmalı');
  const bw0 = Math.min(bw, bwGirdi);
  let e;
  for (let adim = 0; ; adim++) {
    e = perdeKesit({ p, bw, n, H, G1, Q1, bt, mz, sds, kDeprem, iz, katYuk });
    if (sabit) { e.ozel = { bw: true }; e.iz.splice(iz.length, 0, `b_w = ${bw} mm elle verildi: araç kalınlığı büyütmedi, koşullar bu kalınlıkla denetlendi`); return e; }
    if (!e.maddeler.some(m => !m.gecti && (m.ad === 'Perde kalınlığı' || m.ad === 'Net kesit alanı'))) break;
    if (adim >= 20 || (p.L * 1000 + bw + 50) / (bw + 50) < 6 - TOL) {
      e.iz.push(`Kalınlık ${bw} mm'de durduruldu: ${adim >= 20 ? 'büyütme sınırı (20 adım)' : 'daha kalın perdede ℓw/bw < 6 olur, eleman perde sayılmaz (TBDY 7.6.1.2)'}; sağlanamayan koşullar yukarıda`);
      break;
    }
    bw += 50;
  }
  if (e.bw > bw0) e.iz.splice(iz.length, 0, `Kalınlık ${bw0} mm'den ${e.bw} mm'ye büyütüldü (kalınlık / eksenel kuvvet koşulu, 50 mm adım)`);
  return e;
}

function perdeKesit({ p, bw, n, H, G1, Q1, bt, mz, sds, kDeprem, iz, katYuk }) {
  const fck = mz.fck, lw = p.L * 1000 + bw, Hw = katYuk?.Hw ?? n * H, Ac = bw * lw;
  const oz = bw / 1000 * lw / 1000 * H / 1000 * GAMMA_BA;
  const G = katYuk ? katYuk.Gdiger + oz : n * (G1 + oz), Q = katYuk ? katYuk.Qham * bt : n * Q1 * bt;
  const Ndm = (G + Q + 0.2 * sds * G) * kDeprem, Nd = 1.4 * G + 1.6 * Q;
  const yuksek = Hw > 70000; // TBDY Tablo 3.3: H_N > 70 m → BYS = 1 (DTS 1–2 varsayımı) → 13.1.6 perde ≥ 300 mm
  const ara = p.dugumler.slice(1, -1);
  const e = { ad: p.ad, aks: p.aks, yon: p.yon, no: p.no, hi: p.hi, k0: p.k0, k1: p.k1, L: p.L, bw, lw, Hw, NG: G, NQ: Q, Ndm, Nd, Nk: G + Q,
    uclar: p.uclar, dugumler: p.dugumler, maddeler: [], iz: [...iz,
      `Kat başına öz ağırlık b_w·ℓw·H·γ = ${tr(bw / 1000, 3)}·${tr(lw / 1000, 3)}·${tr(H / 1000)}·${GAMMA_BA} = ${tr(oz)} kN`,
      `${n} kat: G = ${tr(G, 0)} kN, βQ = ${tr(bt)}·${katYuk ? tr(katYuk.Qham) : `${n}·${tr(Q1)}`} = ${tr(Q, 0)} kN; N_dm = (G + βQ + 0,2·S_DS·G)·k = ${tr(Ndm, 0)} kN; N_d = 1,4G + 1,6βQ = ${tr(Nd, 0)} kN`] };
  const r = kontrol({ b: bw, h: lw, fck, Ndm, katYuksekligi: H, ikiUcTutulu: p.ikiUcTutulu, yuksekBina: yuksek });
  e.tur = r.tur;
  if (r.tur !== 'perde') {
    madde(e, 'Perde tanımı', `ℓw/b_w = ${tr(lw)}/${tr(bw)} = ${tr(lw / bw)}`, '≥ 6 (TBDY 7.6.1.2); değilse eleman kolondur: açıklığı büyüt, kalınlığı küçült ya da kolon olarak bırak', false, 'TBDY 7.6.1.2', 6 / (lw / bw));
    e.iz.push(`ℓw = eksen ${tr(p.L)} m + b_w = ${tr(lw, 0)} mm; ℓw/b_w < 6: perde tanımına girmiyor, donatı seçilmedi`);
    return sonla(e);
  }
  for (const m of r.maddeler) e.maddeler.push({ ...m, uyari: false }); // uzun kenar/kalınlık, kalınlık (7.6.1.2), net kesit (7.6.1.1)
  // Uç bölgeleri (TBDY 7.6.2): H_w/ℓw > 2 ise zorunlu; kritik yükseklik Denk. 7.15; boy H_cr boyunca ≥ max(0,2ℓw; 2bw)
  const ucGerek = Hw / lw > 2, Hcr = Math.min(Math.max(lw, Hw / 6), 2 * lw, Hw);
  const luMin = Math.max(0.2 * lw, 2 * bw), lu = yukari(luMin, 50), luUst = Math.max(0.1 * lw, bw);
  madde(e, 'Uç bölgesi boyu', `${tr(lu, 0)} mm`, `H_cr boyunca ≥ max(0,2·ℓw; 2·b_w) = ${tr(luMin, 0)} mm, üstünde ≥ max(0,1·ℓw; b_w) = ${tr(luUst, 0)} mm`,
    lu >= luMin - TOL && 2 * lu <= lw + TOL, 'TBDY 7.6.2.1–7.6.2.3', luMin / lu);
  e.iz.push(`Geometri: ℓw = eksen ${tr(p.L)} m + b_w = ${tr(lw, 0)} mm (uçlar aks dışına b_w/2); H_w = ${katYuk ? 'ΣH' : 'n·H'} = ${tr(Hw, 0)} mm, H_w/ℓw = ${tr(Hw / lw)} ` +
    (ucGerek ? '> 2: uç bölgeleri zorunlu (7.6.2.1)' : '≤ 2: uç bölgesi zorunlu değil, güvenli yanda yine oluşturuldu; gövde donatısı tüm kesitte (7.6.3.1)') +
    `; H_cr = min(max(ℓw; H_w/6); 2ℓw) = ${tr(Hcr, 0)} mm (Denk. 7.15); uç bölgesi ℓu = ${tr(lu, 0)} mm`,
    `Uç bölgeleri ${p.uclar.join(' ve ')} kolonlarının yerinde: bu kolonlar kolon olarak ayrıca tasarlanmadı${ara.length ? `; ${ara.join(', ')} perde gövdesine katıldı` : ''}`);
  // Gövde (7.6.3.1): her doğrultuda iki yüz toplamı ρ ≥ 0,0025, aralık ≤ 250 mm (0,002 / 300 mm indirimi Denk. 7.14 ister: uygulanmadı)
  const AsM = 0.0025 * bw * 1000 / 2, gD = dosemeCubuk(AsM, 250, { caplar: CAP.perde, sAlt: 100 }), gY = gD;
  const rhoG = 2 * gD.As / (bw * 1000), lGovde = ucGerek ? Math.max(0, lw - 2 * lu) : lw, AsGovde = 2 * gD.As * lGovde / 1000;
  // Uç bölgesi boyuna (7.6.5.1): her uçta ≥ 0,002·A_c (H_cr boyunca; üstünde 0,001) ve ≥ 4φ14 alanı; ≤ 0,03·b_w·ℓu. Gerekli donatı:
  // düşey yükte en küçük dışmerkezlik (TS 500 6.3.10 kolon kuralı, perdeye uygulandı — yorum) düzlem içinde ve dışında.
  const As0 = Math.max(0.002 * Ac, 4 * alan(14)), AsMax = 0.03 * bw * lu, MdIc = Nd * (15 + 0.03 * lw) / 1000, MdDis = Nd * (15 + 0.03 * bw) / 1000;
  const aday = [];
  for (const phi of CAP.perde) for (let k = Math.max(4, Math.ceil(As0 / alan(phi) - TOL)); k * alan(phi) <= AsMax + TOL; k++) {
    if (k % 2) continue;
    if (k / 2 > kolonYuzMax(lu, phi) || kolonYuzMax(bw, phi) < 2) break; // iki b_w yüzünde tek sıra (TS 500 9.5.2)
    aday.push({ n: k, phi, As: k * alan(phi) });
  }
  // Seçim (kiriş çubuğu gibi): en az çeliğin %10 yakınındakiler arasında en az çubuklu, sonra en az çelik
  const enAz = Math.min(...aday.map(c => c.As));
  aday.sort((a, b) => (a.As > 1.1 * enAz + TOL) - (b.As > 1.1 * enAz + TOL) || a.n - b.n || a.As - b.As);
  const mr = c => [kolonMr(bw, lw, c.As, lu / 2, Nd, mz), kolonMr(lw, bw, (2 * c.As + AsGovde) / 2, DP, Nd, mz)];
  // Etriye (7.6.5.2): φ ≥ 8, H_cr boyunca 50 ≤ s ≤ min(150; 6φ; b_w/3), üstünde s ≤ min(b_w; 200); A_sh ≥ 2/3 × Denk. 7.1 ikinci koşul
  // (0,075·s·b_k·fck/fywk) her doğrultuda; kol aralığı a ≤ 25φ. Kollar boyuna çubuğu sarar: ℓu boyunca kol ≤ b_w yüzündeki çubuk,
  // b_w boyunca 2'den çok kol gerekirse kısa yüzlere ara çubuk (yüzde sığdıkça): b_w yüzünde nL = n/2 − (kBw − 2).
  const etr = c => {
    for (const phi of CAP.perdeEtriye) {
      if (phi < c.phi / 3) continue; // TS 500 7.4.1 (kolon kuralı)
      const s = Math.max(50, Math.floor(Math.min(150, 6 * c.phi, bw / 3) / 10) * 10), sUst = Math.floor(Math.min(bw, 200) / 10) * 10;
      const kol = d => { const bk = d - 2 * ORTU - phi; return Math.max(2, Math.ceil(2 / 3 * 0.075 * s * bk * mz.fck / mz.fyk / alan(phi) - TOL), Math.ceil(bk / (25 * phi) - TOL) + 1); };
      const kLu = kol(lu), kBw = kol(bw), nL = c.n / 2 - Math.max(0, kBw - 2);
      if (kLu <= nL && kBw <= kolonYuzMax(bw, c.phi)) return { phi, s, sUst, kLu, kBw, nL };
    }
    return null;
  };
  let ub = null, et = null, MrIc = 0, MrDis = 0;
  for (const c of aday) {
    [MrIc, MrDis] = mr(c);
    if (MrIc < MdIc - TOL || MrDis < MdDis - TOL) continue;
    et = etr(c); if (et) { ub = c; break; } // kollar çubuktan çok: daha çok çubuklu aday
  }
  madde(e, 'Uç bölgesi boyuna donatı', ub ? `${ub.n}φ${ub.phi} (${tr(ub.As, 0)} mm²)` : 'yetmez',
    `her uçta ≥ max(0,002·A_c; 4φ14) = ${tr(As0, 0)} mm², ≤ 0,03·b_w·ℓu = ${tr(AsMax, 0)} mm²; e_min momenti karşılanmalı`,
    !!ub, 'TBDY 7.6.5.1; TS 500 6.3.10, 9.5.2', ub ? Math.max(As0 / ub.As, MdIc / MrIc, MdDis / MrDis) : 2);
  madde(e, 'Uç bölgesi etriyesi', et ? `φ${et.phi}/${et.s} (${et.kLu}×${et.kBw} kol) · üstte φ${et.phi}/${et.sUst}` : 'yetmez',
    'H_cr boyunca 50 ≤ s ≤ min(150; 6φ; b_w/3), A_sh ≥ 2/3·0,075·s·b_k·fck/fywk, kol aralığı a ≤ 25φ; üstünde s ≤ min(b_w; 200 mm)', !!et, 'TBDY 7.6.5.2');
  madde(e, 'Gövde donatısı', `düşey φ${gD.phi}/${gD.s}, yatay φ${gY.phi}/${gY.s} (iki yüz, ρ = %${tr(rhoG * 100, 3)})`,
    'her doğrultuda iki yüz toplamı ρ ≥ 0,0025, aralık ≤ 250 mm; net aralık TS 500 9.5.2', rhoG >= 0.0025 - TOL && gD.s <= 250 && gD.kod, 'TBDY 7.6.3.1; TS 500 12.3', 0.0025 / rhoG);
  // Çiroz (7.6.3.3): H_cr boyunca ≥ 10, üstünde ≥ 4 adet/m²; çap yatay gövde çapından küçükse sayı φ_gövde/φ_çiroz oranında artar
  const phiC = Math.min(gY.phi, Math.max(...CAP.perdeEtriye)), cAdet = x => Math.ceil(x * gY.phi / phiC - TOL);
  madde(e, 'Çiroz', `φ${phiC}: ${cAdet(10)} adet/m² (H_cr), ${cAdet(4)} adet/m² (üstte)`, '≥ 10 adet/m² H_cr boyunca, ≥ 4 adet/m² üstünde; φ ≥ yatay gövde çapı (değilse sayı oranla artar)', true, 'TBDY 7.6.3.3');
  // Kesme (7.6.7.1): V_r = A_ch·(0,65·fctd + ρsh·fywd), üst sınır 0,85·A_ch·√fck; V_e (Denk. 7.16) deprem çözümlemesi ister
  const rhoSh = 2 * alan(gY.phi) / (gY.s * bw), Ach = Ac, Vr = Ach * (0.65 * mz.fctd + rhoSh * mz.fyd) / 1000, VeMax = 0.85 * Ach * Math.sqrt(fck) / 1000;
  madde(e, 'Kesme dayanımı', `V_r = ${tr(Vr, 0)} kN`, `V_e ≤ V_r ve V_e ≤ 0,85·A_ch·√fck = ${tr(VeMax, 0)} kN; V_e = β_v·(M_p/M_d)·V_d deprem çözümlemesiyle (Denk. 7.16), kesin hesapta`,
    false, 'TBDY 7.6.7.1, Denk. 7.17–7.18', null, true);
  madde(e, 'Deprem etkileri', 'kesin hesapta', 'M_d ve V_e (TBDY 7.6.6), perdede güçlü kolon (7.6.6.2), göreli kat ötelemesi (4.9.1), burulma düzensizliği (3.6.2.1), derz kesme sürtünmesi (7.6.7.2)',
    false, 'TBDY 7.6.6–7.6.7, 4.9.1, 3.6.2.1', null, true);
  Object.assign(e, { lu, luUst, Hcr, ucGerek, rhoG, rhoSh, Vr, VeMax, govdeDusey: `φ${gD.phi}/${gD.s}`, govdeYatay: `φ${gY.phi}/${gY.s}`, ciroz: `φ${phiC} ${cAdet(10)}/m²` });
  if (ub) Object.assign(e, { ucBoyuna: `${ub.n}φ${ub.phi}`, AsUc: ub.As, MrIc, MrDis });
  if (et) Object.assign(e, { ucEtriye: `φ${et.phi}/${et.s}`, ucEtriyeUst: `φ${et.phi}/${et.sUst}`, kol: `${et.kLu}×${et.kBw}` });
  e.iz.push(ub ? `Uç boyuna: her uçta ${ub.n}φ${ub.phi} (b_w yüzlerinde ${et.nL}'şer${et.kBw > 2 ? `, kısa yüzlerde ${et.kBw - 2}'şer ara çubuk` : ''}) = ${tr(ub.As, 0)} mm² ≥ max(0,002·A_c = ${tr(0.002 * Ac, 0)}; 4φ14 = ${tr(4 * alan(14), 0)}) mm²; ` +
      `H_cr üstünde 0,001·A_c = ${tr(0.001 * Ac, 0)} mm² yeter (7.6.5.1). e_min (TS 500 6.3.10; kolon kuralı perdeye uygulandı, yorum; narinlik büyütmesi yok): düzlem içi N_d·(15 + 0,03ℓw) = ` +
      `${tr(MdIc, 0)} ≤ M_r ${tr(MrIc, 0)} kNm (uç bölgesi çubukları), düzlem dışı N_d·(15 + 0,03b_w) = ${tr(MdDis, 0)} ≤ M_r ${tr(MrDis, 0)} kNm (tüm düşey donatı)`
    : `Uç boyuna: φ${CAP.perde.join('/φ')} ile ≤ 0,03·b_w·ℓu içinde ve b_w yüzlerine tek sırada sığan, e_min momentini ve etriye kollarını karşılayan düzen yok; perde kalınlığı ya da beton sınıfı artırılmalı`);
  if (et) e.iz.push(`Uç etriyesi: H_cr (${tr(Hcr, 0)} mm) boyunca φ${et.phi}/${et.s}, ℓu boyunca ${et.kLu}, b_w boyunca ${et.kBw} kol (A_sh ≥ 2/3·0,075·s·b_k·fck/fywk, b_k = ölçü − 2·${ORTU} − φ; a ≤ 25φ); ` +
    `üstünde φ${et.phi}/${et.sUst}; etriyeler temele ≥ max(300; b_w) mm devam eder (7.6.5.2(b))`);
  e.iz.push(`Gövde: ${ucGerek ? `uç bölgeleri arası ${tr(lGovde, 0)} mm` : 'tüm kesit'}, her yüzde düşey φ${gD.phi}/${gD.s} ve yatay φ${gY.phi}/${gY.s} → ρ = 2·A_s/(s·b_w) = %${tr(rhoG * 100, 3)} ≥ %0,25 (7.6.3.1); çiroz φ${phiC} ${cAdet(10)}/m² (H_cr), ${cAdet(4)}/m² üstte (7.6.3.3)`,
    `Kesme dayanımı (bilgi): V_r = A_ch·(0,65·fctd + ρsh·fywd) = ${tr(Ach / 1e6, 3)} m²·(0,65·${tr(mz.fctd, 3)} + ${tr(rhoSh, 5)}·${tr(mz.fyd, 1)}) = ${tr(Vr, 0)} kN; üst sınır 0,85·A_ch·√fck = ${tr(VeMax, 0)} kN (7.6.7.1); ` +
      'V_e deprem çözümlemesiyle (7.6.6.3) bulunur',
    'Perde eksenel kuvveti yalnız düşey yükten. Deprem eğilme momenti ve kesmesi (TBDY 7.6.6), perdede güçlü kolon (7.6.6.2), göreli kat ötelemesi (4.9.1) ve burulma düzensizliği (3.6.2.1, Tablo 3.6 A1) kesin hesapta denetlenmeli');
  return sonla(e);
}

// ── TS 500 7.6.2.1, Denk. 7.13 duraylılık göstergesi bir doğrultuda: φ_i = 1,5·ΣN_i·Δ_i/(V_i·ℓ_i) ≤ 0,05 ise o katta yanal ötelenme
// önlenmiş sayılır. Perdeler tabanda ankastre konsol, çatlamamış kesit (TS 500: 'çatlamamış kesit varsayımı'), eğilme + kayma
// (G = Ec/2,4, ν = 0,2; κ = 5/6); çerçeve katkısı ihmal (güvenli yan). Yatay yük TBDY Denk. 4.22–4.23 dağılımı (eşit kat kütlesi:
// F_i ∝ i, tepeye ΔF_N = 0,0075·N·V_t). Yükün büyüklüğü sadeleşir: φ yalnız rijitliğe ve düşey yüke bağlı.
// perdeler: [{ bw, lw }] (mm, bu doğrultudaki perdeler), n kat, H (mm), W: kat başına düşey yük (G + Q, kN), Ec (MPa).
export function duraylilik({ perdeler, n, H, W, Ec }) {
  const EI = perdeler.reduce((t, p) => t + Ec * 1000 * (p.bw / 1000) * (p.lw / 1000) ** 3 / 12, 0);       // kN·m²
  const GA = perdeler.reduce((t, p) => t + Ec * 1000 / 2.4 * 5 / 6 * (p.bw / 1000) * (p.lw / 1000), 0);   // kN
  const h = H / 1000, dF = Math.min(0.0075 * n, 1), top = n * (n + 1) / 2;
  const F = Array.from({ length: n }, (_, i) => (1 - dF) * (i + 1) / top); F[n - 1] += dF;
  const z = i => i * h, d = [0];
  for (let i = 1; i <= n; i++) d.push(F.reduce((t, f, j) => { const zj = z(j + 1), zi = z(i);
    return t + f * ((zi <= zj ? zi * zi * (3 * zj - zi) : zj * zj * (3 * zi - zj)) / (6 * EI) + Math.min(zi, zj) / GA); }, 0));
  let en = { phi: 0, kat: 1 };
  for (let i = 1; i <= n; i++) {
    const V = F.slice(i - 1).reduce((a, b) => a + b, 0), phi = 1.5 * (n - i + 1) * W * (d[i] - d[i - 1]) / (V * h);
    if (phi > en.phi) en = { phi, kat: i };
  }
  return { ...en, EI, GA };
}

// Değişken katlar için aynı konsol yaklaşımı: H (mm), W (kN) ve o kattaki perde kesitleri tabandan yukarı.
// ponytail: her katta perdeler eşdeğer tek konsol kabul edilir; burulma ve çerçeve katkısı için uzaysal çözüm gerekir.
export function duraylilikKatli({ katlar, Ec }) {
  if (!Array.isArray(katlar) || !katlar.length || !(Number.isFinite(Ec) && Ec > 0) ||
    katlar.some(k => !(Number.isFinite(k.H) && k.H > 0 && Number.isFinite(k.W) && k.W >= 0 && Array.isArray(k.perdeler))))
    throw new RangeError('Kat yüksekliği, ağırlığı ve perde kesitleri geçerli olmalı');
  const n = katlar.length, z = [0], EI = [], GA = [];
  for (const k of katlar) {
    if (k.perdeler.some(p => !(Number.isFinite(p.bw) && p.bw > 0 && Number.isFinite(p.lw) && p.lw > 0)))
      throw new RangeError('Perde boyutları pozitif olmalı');
    z.push(z.at(-1) + k.H / 1000);
    EI.push(k.perdeler.reduce((t, p) => t + Ec * 1000 * (p.bw / 1000) * (p.lw / 1000) ** 3 / 12, 0));
    GA.push(k.perdeler.reduce((t, p) => t + Ec * 1000 / 2.4 * 5 / 6 * (p.bw / 1000) * (p.lw / 1000), 0));
  }
  const wz = katlar.map((k, i) => k.W * z[i + 1]), toplam = wz.reduce((a, b) => a + b, 0);
  if (!(toplam > 0) || EI.some(x => !(x > 0)) || GA.some(x => !(x > 0)))
    return { phi: Infinity, kat: 1, EI, GA };
  const dF = Math.min(0.0075 * n, 1), F = wz.map(x => (1 - dF) * x / toplam); F[n - 1] += dF;
  const d = [0];
  for (let i = 1; i <= n; i++) d.push(F.reduce((total, f, j) => {
    const zi = z[i], zj = z[j + 1], limit = Math.min(zi, zj);
    return total + f * EI.reduce((sum, ei, s) => {
      const a = z[s], b = Math.min(z[s + 1], limit);
      if (b <= a) return sum;
      return sum + (zi * zj * (b - a) - (zi + zj) * (b * b - a * a) / 2 + (b ** 3 - a ** 3) / 3) / ei + (b - a) / GA[s];
    }, 0);
  }, 0));
  let en = { phi: 0, kat: 1 };
  for (let i = 1; i <= n; i++) {
    const V = F.slice(i - 1).reduce((a, b) => a + b, 0), N = katlar.slice(i - 1).reduce((a, k) => a + k.W, 0);
    const phi = V > 0 ? 1.5 * N * (d[i] - d[i - 1]) / (V * (z[i] - z[i - 1])) : Infinity;
    if (phi > en.phi) en = { phi, kat: i };
  }
  return { ...en, EI, GA };
}
