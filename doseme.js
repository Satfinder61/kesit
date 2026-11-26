// Döşeme tasarımı: kalınlığı bul, momentleri, donatıyı ve sehimi hesapla. Dört tür: kirişli plak, dişli, kaset, kirişsiz.
// Birimler: açıklık m, kesit mm, kuvvet kN, alan yükü kN/m², moment kNm (şerit başına) ya da kNm/m.
import { egilmeAs, mMax, dosemeCubuk, kirisCubuk, etriyeSec, CAP } from './donati.js';
import { kesit, aciklikSehim } from './sehim.js';
import { zarf, ortaMomentler } from './mekanik.js';

export const GAMMA_BA = 25; // betonarme birim hacim ağırlığı, kN/m³ (genel kabul; TS 498 1.3 TS ISO 9194'e gönderir)
const TOL = 1e-9;
const PLAK_MIN = 120; // Kirişli plak için proje alt sınırı (mm); yönetmelik sınırından ayrı.
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);
const yukari = (x, adim) => Math.ceil(x / adim - TOL) * adim;
export const TUR_ADI = { plak: 'Kirişli plak', disli: 'Dişli', kaset: 'Kaset', kirissiz: 'Kirişsiz' };
// En küçük diş genişliği: TS 500 11.3.2 ≥ 100; 2φ12 + φ8 etriye + 20 mm örtü sığması (9.5.1–9.5.2) için 2·(20 + 8) + 2·12 + 25 = 105
export const DIS_GEN_MIN = 2 * (20 + 8) + 2 * CAP.kiris[0] + Math.max(25, CAP.kiris[0]);

// ── TS 500 Çizelge 11.1: dört kenarından oturan iki doğrultuda donatılı plakların moment katsayıları α
// [kısa doğrultu negatif (m sütunları), kısa doğrultu pozitif, uzun doğrultu negatif, uzun doğrultu pozitif]
export const M_SUTUN = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
export const CIZELGE_11_1 = {
  1: [[.033, .040, .045, .050, .054, .059, .071, .083], [.025, .030, .034, .038, .041, .045, .053, .062], .033, .025],
  2: [[.042, .047, .053, .057, .061, .065, .075, .085], [.031, .035, .040, .043, .046, .049, .056, .064], .041, .031],
  3: [[.049, .056, .062, .066, .070, .073, .082, .090], [.037, .042, .047, .050, .053, .055, .062, .068], .049, .037],
  4: [[.056, .061, .065, .069, .071, .073, .077, .080], [.044, .046, .049, .051, .053, .055, .058, .060], null, .044],
  5: [null, [.044, .053, .060, .065, .068, .071, .077, .080], .056, .044],
  6: [[.058, .065, .071, .077, .081, .085, .092, .098], [.044, .049, .054, .058, .061, .064, .069, .074], .058, .044],
  7: [null, [.050, .057, .062, .067, .071, .075, .081, .083], null, .050],
};
export const DURUM_ADI = { 1: 'dört kenar sürekli', 2: 'bir kenar süreksiz', 3: 'iki komşu kenar süreksiz', 4: 'iki kısa kenar süreksiz',
  5: 'iki uzun kenar süreksiz', 6: 'üç kenar süreksiz', 7: 'dört kenar süreksiz' };
// Ara m değerlerinde doğrusal enterpolasyon (mühendislik uygulaması; metin açıkça yazmıyor).
const ara = (m, dizi) => {
  if (!dizi) return null;
  const k = Math.max(0, M_SUTUN.findIndex((x, i) => m <= (M_SUTUN[i + 1] ?? Infinity) + TOL));
  const a = M_SUTUN[k], b = M_SUTUN[k + 1];
  return b === undefined ? dizi[k] : dizi[k] + (dizi[k + 1] - dizi[k]) * (Math.min(m, 2) - a) / (b - a);
};
// su: sürekli uzun kenar sayısı, sk: sürekli kısa kenar sayısı → Çizelge 11.1 satırı
export function durum(su, sk) {
  const sureksiz = 4 - su - sk;
  if (sureksiz === 0) return 1;
  if (sureksiz === 1) return 2;
  if (sureksiz === 2) return su === 1 ? 3 : su === 2 ? 4 : 5;
  return sureksiz === 3 ? 6 : 7;
}
// α katsayıları (TS 500 Denk. 11.3: md = α·pd·ℓsn²; uzun doğrultuda da ℓsn²)
export function alfalar(m, d) {
  const [kn, kp, un, up] = CIZELGE_11_1[d];
  return { kisaNeg: ara(m, kn), kisaPoz: ara(m, kp), uzunNeg: un, uzunPoz: up };
}

// Pano geometrisi: kısa/uzun kenar, sürekli kenarlar; uzun kenarlar X yönündeyse 'x'.
export function panoGeo(d) {
  const s = Math.min(d.lx, d.ly), L = Math.max(d.lx, d.ly), m = L / s, k = d.kenar;
  const uzunX = d.lx > d.ly + TOL || (Math.abs(d.lx - d.ly) <= TOL && (k.alt + k.ust) <= (k.sol + k.sag)); // karede elverişsizi
  const su = uzunX ? k.alt + k.ust : k.sol + k.sag, sk = uzunX ? k.sol + k.sag : k.alt + k.ust;
  const alfaS = ((k.alt + k.ust) * d.lx + (k.sol + k.sag) * d.ly) / (2 * (d.lx + d.ly)); // sürekli kenar boyu / çevre (TS 500 11.0)
  return { s, L, m, uzunX, su, sk, alfaS, kisaYon: uzunX ? 'y' : 'x' };
}

// Döşeme alan yükü (kN/m²): öz ağırlık + kaplama. Dişli/kaset: tabla + diş + dolgu.
export function oz(g, t, h) {
  if (g.dosemeTuru === 'disli' || g.dosemeTuru === 'kaset') {
    const e = g.disAralik, bw = g.disGen, eks = e + bw;
    const dis = g.dosemeTuru === 'kaset' ? (2 * bw * eks - bw * bw) / (eks * eks) : bw / eks; // diş planda kapladığı oran
    return t / 1000 * GAMMA_BA + dis * (h - t) / 1000 * GAMMA_BA + g.dolgu * (1 - dis);
  }
  return h / 1000 * GAMMA_BA;
}

// ── Ortak yardımcılar
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null, uyari = false) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari });
export function sonla(e) {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
  return e;
}
const cy = c => `φ${c.phi}/${c.s}`;
// Donatı aralığı: TS 500 9.5.2 en küçük net aralık (geçmezse kalınlık artar); 100 mm altı yalnız uyarı (uygulama tercihi)
function aralik(e, cs) {
  const kotu = cs.filter(c => !c.kod), az = cs.filter(c => !c.yeter);
  madde(e, 'Donatı aralığı', cs.map(cy).join(' · '), 'net aralık ≥ max(φ; 4/3·Dmax; 25 mm), Dmax 22 mm', !kotu.length, 'TS 500 9.5.2', kotu.length ? 2 : null);
  if (az.length) madde(e, 'Pratik aralık', az.map(cy).join(' · '), '≥ 100 mm önerilir; daha büyük çap düşünülmeli', false, 'uygulama', null, true);
}
const cn = c => `${c.n}φ${c.phi}`;
// Döşeme donatısı (metre başına): gereken As, alt sınır ve aralık sınırıyla çubuk seçimi
function plakAs(M, h, d, mz, rhoMin, sMax) {
  const gerek = egilmeAs(M, 1000, d, mz);
  const As = Math.max(gerek, rhoMin * 1000 * h);
  return { M, d, gerek, As, c: dosemeCubuk(As, sMax) };
}
// Pano yükleri (kN/m²): g öz ağırlık + kaplama (+ kirişsizde eşdeğer bölme duvar), q hareketli
export function panoYuk(g, t, h) {
  const gA = oz(g, t, h) + g.gKaplama + (g.dosemeTuru === 'kirissiz' ? (g.duvarEsdeger ?? 0) : 0);
  return { g: gA, q: g.q, pd: 1.4 * gA + 1.6 * g.q };
}
const kenarKomsu = { alt: [0, -1, 'ust'], ust: [0, 1, 'alt'], sol: [-1, 0, 'sag'], sag: [1, 0, 'sol'] };
const panoBul = (pl, i, j) => pl.find(p => p.d.i === i && p.d.j === j);

// Tek doğrultuda taşıyan panoların şerit dizileri: aynı taşıma doğrultusundaki komşu panolar sürekli şerit olur.
export function seritler(panolar, tekMi) {
  const atandi = new Set(), diziler = [];
  for (const p of panolar) {
    if (!tekMi(p) || atandi.has(p.d.ad)) continue;
    const yon = p.geo.kisaYon, adim = (q, s) => panoBul(panolar, q.d.i + (yon === 'x' ? s : 0), q.d.j + (yon === 'y' ? s : 0));
    const uygun = q => q && tekMi(q) && q.geo.kisaYon === yon && !atandi.has(q.d.ad);
    let bas = p;
    for (let q = adim(p, -1); uygun(q); q = adim(q, -1)) bas = q;
    const dizi = [];
    for (let q = bas; uygun(q); q = adim(q, 1)) { dizi.push(q); atandi.add(q.d.ad); }
    diziler.push({ yon, panolar: dizi });
  }
  return diziler;
}
const duz = w => ({ w, a: 0 });

// ── Kirişli plak (TS 500 11.2, 11.4). bwK: kiriş genişliği (mm) — serbest açıklık için.
function plakTasarla(ag, g, h, mz, bwK) {
  const yk = panoYuk(g, h, h), panolar = ag.dosemeler.map(d => ({ d, geo: panoGeo(d), e: null }));
  const bir = p => p.geo.m > 2 + TOL;
  const dk = h - 20, du = h - 30; // kısa (dış sıra) ve uzun (iç sıra) doğrultu faydalı yükseklik; örtü 15 mm
  const neg = new Map();          // `${ad}:${kenar}` → mesnet momenti (kNm/m), komşularla eşitlenecek
  const hesap = new Map();
  // Bir doğrultu: sürekli şerit (1 m), 1,4G + 1,6Q dama yüklemesi (TS 500 11.2.2, 6.3.3); şerit uçları mafsallı
  for (const dz of seritler(panolar, bir)) {
    const L = dz.panolar.map(p => p.geo.s), G = L.map(() => [duz(yk.g)]), Q = L.map(() => [duz(yk.q)]);
    const z = zarf(L, G, Q), sG = ortaMomentler(L, G), sGQ = ortaMomentler(L, L.map(() => [duz(yk.g + yk.q)]));
    dz.panolar.forEach((p, k) => {
      const ln = p.geo.s - bwK / 1000;
      const Mpoz = Math.max(z[k].MdAcik, yk.pd * ln * ln / 24); // TS 500 11.2.2: ankastre açıklık momentinden az olamaz
      hesap.set(p.d.ad, { tip: 'bir', Mpoz, sG: sG[k], sGQ: sGQ[k], ln });
      const [k1, k2] = dz.yon === 'x' ? ['sol', 'sag'] : ['alt', 'ust'];
      neg.set(`${p.d.ad}:${k1}`, k > 0 ? z[k].MdMesnet : 0);              // zarf: açıklığın iki ucunun büyüğü (güvenli yan)
      neg.set(`${p.d.ad}:${k2}`, k < L.length - 1 ? z[k].MdMesnet : 0);
    });
  }
  // İki doğrultu: Çizelge 11.1 (TS 500 11.4.3, Denk. 11.3)
  for (const p of panolar.filter(q => !bir(q))) {
    const lsn = p.geo.s - bwK / 1000, dr = durum(p.geo.su, p.geo.sk), al = alfalar(p.geo.m, dr), c = yk.pd * lsn * lsn;
    const M = { kisaNeg: (al.kisaNeg ?? 0) * c, kisaPoz: al.kisaPoz * c, uzunNeg: (al.uzunNeg ?? 0) * c, uzunPoz: al.uzunPoz * c };
    hesap.set(p.d.ad, { tip: 'iki', dr, al, M, lsn });
    for (const kn of ['alt', 'ust', 'sol', 'sag']) {
      if (!p.d.kenar[kn]) continue;
      const uzunKenar = (kn === 'alt' || kn === 'ust') === p.geo.uzunX; // uzun kenarda kısa doğrultu momenti
      neg.set(`${p.d.ad}:${kn}`, uzunKenar ? M.kisaNeg : M.uzunNeg);
    }
  }
  // Ortak mesnette büyük moment (TS 500 11.4.3; ponytail: 2/3 dağıtma yerine büyük değer, mesnet için güvenli yan)
  const mesnet = (p, kn) => {
    const [di, dj, karsi] = kenarKomsu[kn], q = panoBul(panolar, p.d.i + di, p.d.j + dj);
    return Math.max(neg.get(`${p.d.ad}:${kn}`) ?? 0, q ? neg.get(`${q.d.ad}:${karsi}`) ?? 0 : 0);
  };
  return panolar.map(p => {
    const hs = hesap.get(p.d.ad), e = { ad: p.d.ad, aks: p.d.aks, i: p.d.i, j: p.d.j, tur: 'plak', lx: p.d.lx, ly: p.d.ly, m: p.geo.m,
      bir: hs.tip === 'bir', h, gAlan: yk.g, qAlan: yk.q, pd: yk.pd, maddeler: [], iz: [] };
    const sMaxK = Math.min(1.5 * h, 200), sMaxU = Math.min(1.5 * h, 250);
    // kisaKenarlar: kısa doğrultu momentinin oluştuğu (uzun) kenarlar; uzunYonKenarlar: uzun doğrultu momentinin kenarları
    const kisaKenarlar = p.geo.uzunX ? ['alt', 'ust'] : ['sol', 'sag'], uzunYonKenarlar = p.geo.uzunX ? ['sol', 'sag'] : ['alt', 'ust'];
    if (hs.tip === 'iki') {
      const ka = plakAs(hs.M.kisaPoz, h, dk, mz, 0.0015, sMaxK);
      let ua = plakAs(hs.M.uzunPoz, h, du, mz, 0.0015, sMaxU);
      if ((ka.c.As + ua.c.As) / (1000 * h) < 0.0035 - TOL) ua = plakAs(0, h, du, mz, 0.0035 - ka.c.As / (1000 * h), sMaxU); // TS 500 11.4.5 toplam
      const kNeg = Math.max(...kisaKenarlar.map(kn => p.d.kenar[kn] ? mesnet(p, kn) : 0.5 * hs.M.kisaPoz)); // süreksiz kenar: 0,5·Mpoz (11.4.3)
      const uNeg = Math.max(...uzunYonKenarlar.map(kn => p.d.kenar[kn] ? mesnet(p, kn) : 0.5 * hs.M.uzunPoz));
      const ku = plakAs(kNeg, h, dk, mz, 0.0015, sMaxK), uu = plakAs(uNeg, h, dk, mz, 0.0015, sMaxU);
      Object.assign(e, { durum: DURUM_ADI[hs.dr], kisaAlt: cy(ka.c), uzunAlt: cy(ua.c), kisaUst: cy(ku.c), uzunUst: cy(uu.c) });
      aralik(e, [ka.c, ua.c, ku.c, uu.c]);
      const hMin = Math.ceil(Math.max(PLAK_MIN, hs.lsn * 1000 / (15 + 20 / p.geo.m) * (1 - p.geo.alfaS / 4)) - TOL);
      e.hMin = hMin;
      madde(e, 'Döşeme kalınlığı', h, `≥ max(${PLAK_MIN}; ℓsn/(15 + 20/m)·(1 − αs/4)) = ${tr(hMin)} mm`, h >= hMin, 'TS 500 11.4.2, Denk. 11.1; proje alt sınırı 120 mm', hMin / h);
      const Mmax = Math.max(hs.M.kisaPoz, kNeg), Mk = mMax(1000, dk, mz);
      madde(e, 'Eğilme kapasitesi', Mmax, `≤ ${tr(Mk, 1)} kNm/m (ρ ≤ ρmax)`, Mmax <= Mk, 'TS 500 7.1', Mmax / Mk);
      // Sehim: kısa doğrultu 1 m şerit, kullanım momentleri α·p·ℓsn²
      const sm = pp => ({ Mm: hs.al.kisaPoz * pp * hs.lsn ** 2, M1: kisaKenarlar.some(kn => p.d.kenar[kn]) ? (hs.al.kisaNeg ?? 0) * pp * hs.lsn ** 2 : 0, M2: 0 });
      const sGQ = sm(yk.g + yk.q), sG = sm(yk.g);
      const kes = { m: kesit({ bw: 1000, h, As: ka.c.As, d: dk }, mz.fck, mz.fctd), s1: kesit({ bw: 1000, h, As: ku.c.As, d: dk, cekme: 'ust' }, mz.fck, mz.fctd) };
      kes.s2 = kes.s1;
      // iki ucu sürekliyse M1 = M2 = kısaNeg; tek ucu sürekliyse ortalama için M1 = kısaNeg, M2 = 0
      const ikiUc = kisaKenarlar.every(kn => p.d.kenar[kn]);
      if (ikiUc) { sGQ.M2 = sGQ.M1; sG.M2 = sG.M1; }
      const sh = aciklikSehim({ l: p.geo.s * 1000, ln: hs.lsn * 1000, kesitler: kes, G: sG, GQ: sGQ, duvar: g.dosemeDuvar, fck: mz.fck });
      e.sehim = sh;
      madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, 'TS 500 13.2, Çizelge 13.3', sh.deger / sh.sinir);
      e.iz.push(`m = ${tr(p.geo.m, 3)} ≤ 2: iki doğrultuda; ${DURUM_ADI[hs.dr]}; ℓsn = ${tr(hs.lsn)} m; αs = ${tr(p.geo.alfaS, 3)}`,
        `p_d = 1,4·${tr(yk.g)} + 1,6·${tr(yk.q)} = ${tr(yk.pd)} kN/m²; α kısa ${tr(hs.al.kisaNeg ?? 0, 4)} / ${tr(hs.al.kisaPoz, 4)}, uzun ${tr(hs.al.uzunNeg ?? 0, 3)} / ${tr(hs.al.uzunPoz, 3)}`,
        `M kısa: mesnet ${tr(kNeg)} · açıklık ${tr(hs.M.kisaPoz)} kNm/m; uzun: mesnet ${tr(uNeg)} · açıklık ${tr(hs.M.uzunPoz)} kNm/m (süreksiz kenarda 0,5·M_açıklık)`,
        `Sehim: δ_G ${tr(sh.dG)} mm, δ_G+Q ${tr(sh.dGQ)} mm, λ ${tr(sh.lam)} → ${tr(sh.deger)} mm`);
    } else {
      // asal donatı kısa doğrultuda; kisaKenarlar: kısa açıklığı sınırlayan (uzun) kenarlar
      const M1 = mesnet(p, kisaKenarlar[0]), M2 = mesnet(p, kisaKenarlar[1]);
      const ka = plakAs(hs.Mpoz, h, dk, mz, 0.002, sMaxK);
      const dis = [0, 1].map(u => !p.d.kenar[kisaKenarlar[u]]);
      const Mu = Math.max(...[M1, M2].map((M, u) => dis[u] ? 0.5 * hs.Mpoz : M)); // dış mesnet üst ≥ ½ açıklık (11.2.2)
      const ku = plakAs(Mu, h, dk, mz, 0.002, sMaxK);
      const dag = dosemeCubuk(Math.max(ka.c.As / 5, 1e-9), 300);                                 // dağıtma ≥ 1/5, s ≤ 300
      const kk = dosemeCubuk(Math.max(0.6 * ka.c.As, 167.6), 300);                               // kısa kenar mesnet ≥ %60, ≥ φ8/300
      Object.assign(e, { durum: 'bir doğrultu', kisaAlt: cy(ka.c), kisaUst: cy(ku.c), uzunAlt: cy(dag) + ' (dağıtma)', uzunUst: cy(kk) });
      aralik(e, [ka.c, ku.c, dag, kk]);
      const surekli = dis.filter(x => !x).length, oran = surekli ? 30 : 25, hMin = Math.ceil(Math.max(PLAK_MIN, hs.ln * 1000 / oran) - TOL);
      e.hMin = hMin;
      madde(e, 'Döşeme kalınlığı', h, `≥ max(${PLAK_MIN}; ℓn/${oran}) = ${tr(hMin)} mm`, h >= hMin, 'TS 500 11.2.2; proje alt sınırı 120 mm', hMin / h);
      const Mmax = Math.max(hs.Mpoz, Mu), Mk = mMax(1000, dk, mz);
      madde(e, 'Eğilme kapasitesi', Mmax, `≤ ${tr(Mk, 1)} kNm/m (ρ ≤ ρmax)`, Mmax <= Mk, 'TS 500 7.1', Mmax / Mk);
      const kes = { m: kesit({ bw: 1000, h, As: ka.c.As, d: dk }, mz.fck, mz.fctd), s1: kesit({ bw: 1000, h, As: ku.c.As, d: dk, cekme: 'ust' }, mz.fck, mz.fctd) };
      kes.s2 = kes.s1;
      const sh = aciklikSehim({ l: p.geo.s * 1000, ln: hs.ln * 1000, kesitler: kes, G: hs.sG, GQ: hs.sGQ, duvar: g.dosemeDuvar, fck: mz.fck });
      e.sehim = sh;
      madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, 'TS 500 13.2, Çizelge 13.3', sh.deger / sh.sinir);
      e.iz.push(`m = ${tr(p.geo.m, 3)} > 2: bir doğrultuda (TS 500 11.2.1); 1 m şerit sürekli kiriş, hareketli yük dama yüklemesi`,
        `p_d = ${tr(yk.pd)} kN/m²; M açıklık ${tr(hs.Mpoz)} · mesnet ${tr(Mu)} kNm/m`,
        `Sehim: δ_G ${tr(sh.dG)} mm, δ_G+Q ${tr(sh.dGQ)} mm → ${tr(sh.deger)} mm`);
    }
    return sonla(e);
  });
}

// ── Dişli (TS 500 11.3) ve kaset (11.5) döşeme. Dişler kirişler arasında kısa doğrultuda (dişli) ya da iki doğrultuda (kaset).
// Diş başına genişlik e + bw; açıklık kesiti T (tabla genişliği e + bw, TS 500 11.3.1), mesnet kesiti dikdörtgen bw.
function disTasarla(ag, g, h, mz, bwK) {
  const kaset = g.dosemeTuru === 'kaset', e0 = g.disAralik, bw = g.disGen, B = e0 + bw, tElle = g.dosemeOzel?.t;
  const t = tElle ?? yukari(Math.max(70, e0 / 10), 10);                     // TBDY 7.11.2 ≥ 70; TS 500 11.3.2 ≥ e/10; elle verilirse denetlenir
  const yk = panoYuk(g, t, h), k = B / 1000;                                // diş başına yük oranı (m)
  const panolar = ag.dosemeler.map(d => ({ d, geo: panoGeo(d) }));
  const d = h - 35, dUst = h - 25;                                          // diş: örtü 20 + etriye 8 + φ/2; tabla üst: 15 + φ/2
  const dis = new Map();                                                    // ad → { Mpoz, Mneg, Vd, sG, sGQ, ln, L }
  if (!kaset) {
    for (const dz of seritler(panolar, () => true)) {
      const L = dz.panolar.map(p => p.geo.s), G = L.map(() => [duz(yk.g * k)]), Q = L.map(() => [duz(yk.q * k)]);
      const z = zarf(L, G, Q), sG = ortaMomentler(L, G), sGQ = ortaMomentler(L, L.map(() => [duz((yk.g + yk.q) * k)]));
      dz.panolar.forEach((p, i) => dis.set(p.d.ad, { Mpoz: z[i].MdAcik, Mneg: z[i].MdMesnet, Vd: z[i].Vd, sG: sG[i], sGQ: sGQ[i],
        ln: p.geo.s - bwK / 1000, L: p.geo.s, tek: L.length === 1, uc: i === 0 || i === L.length - 1 }));
    }
  } else {
    for (const p of panolar) { // kaset: Çizelge 11.1 diş başına (TS 500 11.5 'yapı mekaniği' — yorum: iki doğrultulu plak katsayıları)
      const lsn = p.geo.s - bwK / 1000, al = alfalar(Math.min(p.geo.m, 2), durum(p.geo.su, p.geo.sk)), c = lsn * lsn * k;
      const kk = p.geo.uzunX ? ['alt', 'ust'] : ['sol', 'sag'], sur = kk.filter(kn => p.d.kenar[kn]).length; // kısa doğrultu mesnetleri: süreksiz kenarda mesnet momenti yok
      const sm = pp => ({ Mm: al.kisaPoz * pp * c, M1: sur >= 1 ? (al.kisaNeg ?? 0) * pp * c : 0, M2: sur === 2 ? (al.kisaNeg ?? 0) * pp * c : 0 });
      dis.set(p.d.ad, { Mpoz: al.kisaPoz * yk.pd * c, Mneg: Math.max(al.kisaNeg ?? 0, al.uzunNeg ?? 0) * yk.pd * c,
        MpozU: al.uzunPoz * yk.pd * c, Vd: yk.pd * p.geo.s / 2 * k, sG: sm(yk.g), sGQ: sm(yk.g + yk.q), ln: lsn, L: p.geo.s, al,
        tek: !p.d.kenar.alt && !p.d.kenar.ust && !p.d.kenar.sol && !p.d.kenar.sag, uc: !(p.geo.su === 2) });
    }
  }
  const caplar = CAP.kiris;                                                  // diş kiriş gibi donatılır: boyuna ≥ φ12 (TS 500 11.3.3, 7.3)
  return panolar.map(p => {
    const s = dis.get(p.d.ad), e = { ad: p.d.ad, aks: p.d.aks, i: p.d.i, j: p.d.j, tur: g.dosemeTuru, lx: p.d.lx, ly: p.d.ly, m: p.geo.m,
      bir: !kaset, h, t, gAlan: yk.g, qAlan: yk.q, pd: yk.pd, maddeler: [], iz: [] };
    // Eğilme: açıklık T kesit (a ≤ t ise tabla genişliği, değilse güvenli yan bw), mesnet dikdörtgen bw
    let Ap = egilmeAs(s.Mpoz, B, d, mz);
    if (Ap * mz.fyd / (0.85 * mz.fcd * B) > t) Ap = egilmeAs(s.Mpoz, bw, d, mz);
    const rmin = 0.8 * mz.fctd / mz.fyd;                                   // dişte kiriş gibi (TS 500 11.3.3, 7.3)
    const alt = kirisCubuk(Math.max(Ap, rmin * bw * d), bw, { caplar, ortu: 20, etriye: 8, enAz: 2 });
    const ust = kirisCubuk(Math.max(egilmeAs(s.Mneg, bw, dUst, mz), rmin * bw * d), B, { caplar, ortu: 15, etriye: 0, enAz: 1 });
    // Kesme: hedef Vd ≤ Vcr (TS 500 11.3.2); aşılırsa 8.1 ile etriye
    const Vcr = 0.65 * mz.fctd * bw * d / 1000, Vmax = 0.22 * mz.fcd * bw * d / 1000, fywd = mz.fyd;
    let etr;
    if (s.Vd <= Vcr) etr = { phi: 8, s: 250, kol: 1, yeter: true };       // açık etriye, s ≤ 250 (11.3.3)
    else etr = etriyeSec(Math.max((s.Vd - 0.8 * Vcr) * 1000 / (fywd * d), 0.3 * mz.fctd * bw / fywd), s.Vd > 3 * Vcr ? d / 4 : d / 2, { kol: 2 });
    const tabla = dosemeCubuk(0.0015 * t * 1000, 250);                    // tabla her doğrultuda ≥ 0,0015, s ≤ 250 (11.3.3)
    // kaset dik diş alt donatısı ana diş çubuklarının üstünde: d − φ
    const uAlt = kaset && kirisCubuk(Math.max(egilmeAs(s.MpozU, B, d - alt.phi, mz), rmin * bw * d), bw, { caplar, ortu: 20, etriye: 8, enAz: 2 });
    Object.assign(e, { durum: kaset ? 'iki doğrultulu diş' : `dişler ${p.geo.kisaYon === 'x' ? 'X' : 'Y'} yönünde`,
      disAlt: cn(alt), disUst: cn(ust), disEtriye: `φ${etr.phi}/${etr.s}${etr.kol === 1 ? ' açık' : ''}`, tabla: cy(tabla),
      kisaAlt: cn(alt), kisaUst: cn(ust), uzunAlt: kaset ? cn(uAlt) : 'tabla ' + cy(tabla),
      uzunUst: cy(tabla), enineDis: kaset ? 0 : s.L > 7 ? 2 : s.L > 4 ? 1 : 0 });
    const oran = s.tek ? 20 : 25, hMin = Math.ceil(Math.max(t + 50, s.ln * 1000 / oran) - TOL);
    e.hMin = hMin;
    madde(e, 'Toplam yükseklik', h, `≥ ℓn/${oran} = ${tr(hMin)} mm`, h >= hMin, kaset ? 'TS 500 11.5 → 11.3.2 (yorum)' : 'TS 500 11.3.2', hMin / h);
    const tMin = Math.max(70, e0 / 10);
    if (tElle == null) madde(e, 'Tabla kalınlığı', t, `≥ max(70; e/10) = ${tr(t)} mm`, true, 'TBDY 7.11.2; TS 500 11.3.2');
    else madde(e, 'Tabla kalınlığı', t, `≥ max(70; e/10) = ${tr(tMin)} mm (elle verildi)`, t >= tMin - TOL, 'TBDY 7.11.2; TS 500 11.3.2', tMin / t);
    madde(e, 'Diş aralığı', e0, '≤ 700 mm', e0 <= 700, 'TS 500 11.3.1');
    madde(e, 'Diş genişliği', bw, `≥ ${DIS_GEN_MIN} mm (≥ 100; 2φ${CAP.kiris[0]} + φ8 etriye + 20 mm örtü sığmalı)`, bw >= DIS_GEN_MIN, 'TS 500 11.3.2, 9.5.1–9.5.2');
    const Mk = mMax(bw, dUst, mz);
    madde(e, 'Mesnette eğilme', s.Mneg, `≤ ${tr(Mk, 1)} kNm/diş (ρ ≤ ρmax)`, s.Mneg <= Mk, 'TS 500 7.3', s.Mneg / Mk);
    madde(e, 'Diş donatısı sığma', alt.n, `${cn(alt)} genişliğe sığmalı`, alt.sigar, 'TS 500 9.5.2', alt.sigar ? 0 : 2);
    if (kaset) madde(e, 'Dik diş donatısı sığma', uAlt.n, `${cn(uAlt)} genişliğe sığmalı`, uAlt.sigar, 'TS 500 9.5.2', uAlt.sigar ? 0 : 2);
    // TS 500 11.3.2: dişte olabildiğince Vd ≤ Vcr; araç kalınlığı buna göre seçer (dişte etriye hesabı gerekmez)
    madde(e, 'Dişte kesme', s.Vd, `≤ V_cr = 0,65·fctd·bw·d = ${tr(Vcr, 1)} kN`, s.Vd <= Vcr, 'TS 500 11.3.2, 8.1.3', s.Vd / Vcr);
    madde(e, 'Dişte kesme üst sınırı', s.Vd, `≤ 0,22·fcd·bw·d = ${tr(Vmax, 1)} kN`, s.Vd <= Vmax, 'TS 500 8.1.5', s.Vd / Vmax);
    const kes = { m: kesit({ bw, h, bf: B, hf: t, As: alt.As, d }, mz.fck, mz.fctd), s1: kesit({ bw, h, bf: B, hf: t, As: ust.As, d: dUst, cekme: 'ust' }, mz.fck, mz.fctd) };
    kes.s2 = kes.s1;
    const sh = aciklikSehim({ l: s.L * 1000, ln: s.ln * 1000, kesitler: kes, G: s.sG, GQ: s.sGQ, duvar: g.dosemeDuvar, fck: mz.fck });
    e.sehim = sh;
    madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, 'TS 500 13.2, Çizelge 13.3', sh.deger / sh.sinir);
    e.iz.push(`Diş aralığı e ${e0} mm, diş ${bw} mm, tabla ${t} mm, toplam ${h} mm; diş başına genişlik ${B} mm`,
      `Yük: g ${tr(yk.g)} kN/m² (tabla + diş + dolgu ${tr(g.dolgu)} + kaplama), q ${tr(yk.q)} kN/m² → diş başına p_d ${tr(yk.pd * k)} kN/m`,
      kaset ? `Kaset: Çizelge 11.1 katsayıları diş başına (TS 500 11.5 'yapı mekaniği ilkeleri'; yorum)` : 'Dişler sürekli kiriş, hareketli yük dama yüklemesi (TS 500 11.3.2, 6.3.3)',
      `M_d açıklık ${tr(s.Mpoz)} · mesnet ${tr(s.Mneg)} kNm/diş; V_d ${tr(s.Vd)} kN ${s.Vd <= Vcr ? '≤' : '>'} V_cr ${tr(Vcr)} kN`,
      `Sehim (T kesit): δ_G ${tr(sh.dG)} mm, δ_G+Q ${tr(sh.dGQ)} mm → ${tr(sh.deger)} mm`);
    if (!kaset && e.enineDis) e.iz.push(`Açıklık ${tr(s.L)} m: ${e.enineDis} enine diş (TS 500 11.3.2)`);
    return sonla(e);
  });
}

// ── Kirişsiz döşeme (TS 500 11.4.4.2 moment katsayıları; kolon/orta şerit). Çerçeve: aks hattı boyunca şerit.
// kolonOlcu(c) → { b, h } (mm). Dönüş: şerit açıklıkları (Ş) ve pano sehimleri.
// wKenar: kenar çerçevenin dış aksındaki çizgisel yük (kN/m, katsayılı; kirişsiz döşemede dış duvar).
export function ddmCerceveler(ag, p, h, mz, kolonOlcu, { radye = false, tasma = 0, wKenar = 0 } = {}) {
  const cerceveler = [];
  for (const yon of ['x', 'y']) {
    const L = yon === 'x' ? ag.ax : ag.ay, dik = yon === 'x' ? ag.ay : ag.ax, n = L.length;
    for (let hatNo = 0; hatNo <= dik.length; hatNo++) {
      const yanlar = [dik[hatNo - 1], dik[hatNo]].map(v => v ?? (radye ? 2 * tasma : 0)); // radyede kenar taşması
      const l2 = (yanlar[0] + yanlar[1]) / 2, kenar = hatNo === 0 || hatNo === dik.length;
      for (let k = 0; k < n; k++) {
        const kol = [k, k + 1].map(u => kolonOlcu(ag.kolonlar.find(c => yon === 'x' ? c.i === u && c.j === hatNo : c.i === hatNo && c.j === u)));
        const cw = kol.map(o => (yon === 'x' ? o.b : o.h) / 1000);
        const l1 = L[k], ln = Math.max(l1 - (cw[0] + cw[1]) / 2, 0.65 * l1);
        const Mo = p * l2 * ln * ln / 8;
        const ucA = k === 0, ucB = k === n - 1;
        // TS 500 11.4.4.2: kenar açıklık dış 0,30 / açıklık 0,50 / iç 0,70; iç açıklık 0,65 / 0,35 / 0,65
        let cA = ucA ? 0.30 : ucB && n > 1 ? 0.70 : 0.65, cB = ucB ? 0.30 : ucA ? 0.70 : 0.65, cP = ucA || ucB ? 0.50 : 0.35;
        if (n === 1) { cA = cB = 0.30; cP = 0.70; }       // tek açıklık: statik denge (yöntem dışı; uyarı verilir)
        // Kolon şeridi: her yanda min(l1, l2_yan)/4 (TS 500 11.4.2); kenar çerçevede tek yan (radyede taşma dahil)
        const csY = yanlar.map(v => Math.min(l1, v) / 4), cs = csY[0] + csY[1], ms = Math.max(l2 - cs, 0);
        // Kolon şeridi payı: iç mesnet %75, kenar kirişsiz dış mesnet %100, açıklık %60 (11.4.4.2)
        const pay = (c, dis) => dis ? 1 : 0.75;
        const MnegA = cA * Mo, MnegB = cB * Mo, Mpoz = cP * Mo;
        let MkA = MnegA, MkB = MnegB;
        if (radye && tasma > 0) { const kons = p * l2 * tasma * tasma / 2; if (ucA) MkA = Math.max(MkA, kons); if (ucB) MkB = Math.max(MkB, kons); }
        // Kenardaki duvar çizgisel yükü (Denk. 11.4 yalnız düzgün p_d için): Mo'su aynı katsayılarla, tamamı kolon şeridinde (statik denge)
        const MoW = kenar && !radye ? wKenar * ln * ln / 8 : 0;
        cerceveler.push({ yon, hatNo, k, kenar, l1, l2, ln, Mo, MoW, cs, ms, n,
          csNeg: Math.max(MkA * pay(cA, ucA) + cA * MoW, MkB * pay(cB, ucB) + cB * MoW), msNeg: Math.max(MkA * (1 - pay(cA, ucA)), MkB * (1 - pay(cB, ucB))),
          csPoz: 0.6 * Mpoz + cP * MoW, msPoz: 0.4 * Mpoz, cA, cB, cP, MnegA: MkA, MnegB: MkB, Mpoz });
      }
    }
  }
  return cerceveler;
}

// Kolon/orta şerit donatısı (metre başına). ust: mesnet (negatif), alt: açıklık (pozitif). radye: mesnette alt, açıklıkta üst çekme.
// TS 500 11.4.5: her doğrultuda ρ ≥ 0,0015, iki doğrultu toplamı ≥ 0,0035 → her doğrultuda 0,00175 alınır (güvenli yan);
// aralık ≤ min(1,5h; 200). TBDY 7.11.14: kolon şeridinde alt donatı ≥ mesnet üst donatısının 1/3'ü (kirişsiz döşeme).
// Radye: TS 500 10.4.3 basınç yüzündeki donatı ≥ çekme donatısının 1/3'ü; çubuklar φ12/14/16.
export function seritDonati(c, h, mz, { radye = false } = {}) {
  const d = c.yon === 'x' ? (radye ? h - 58 : h - 20) : (radye ? h - 74 : h - 30); // radye örtü 50 mm, φ16
  const sMax = Math.min(1.5 * h, 200), caplar = radye ? CAP.radye : CAP.doseme, sAlt = radye ? 100 : 100;
  const sec = (M, w) => {
    const gerek = w > 0 ? egilmeAs(M / w, 1000, d, mz) : 0;
    return { gerek, As: Math.max(gerek, 0.00175 * 1000 * h) };
  };
  const csN = sec(c.csNeg, c.cs), csP = sec(c.csPoz, c.cs), msN = sec(c.msNeg, c.ms), msP = sec(c.msPoz, c.ms);
  if (!radye) csP.As = Math.max(csP.As, csN.As / 3);                       // TBDY 7.11.14 kolon şeridi sürekli alt
  else { csP.As = Math.max(csP.As, csN.As / 3); csN.As = Math.max(csN.As, csP.As / 3); msP.As = Math.max(msP.As, msN.As / 3); msN.As = Math.max(msN.As, msP.As / 3); }
  const c_ = x => dosemeCubuk(x.As, sMax, { caplar, sAlt });
  const r = { d, csN, csP, msN, msP, cCsN: c_(csN), cCsP: c_(csP), cMsN: c_(msN), cMsP: c_(msP) };
  // yetmez: kesit basınç bloğuyla taşıyamıyor ya da en büyük çapla bile aralık 10 mm'nin altında (s = 0, tek sırada konamaz)
  r.yetmez = [csN, csP, msN, msP].some(x => !Number.isFinite(x.gerek)) || [r.cCsN, r.cCsP, r.cMsN, r.cMsP].some(x => !(x.As > 0));
  r.kod = [r.cCsN, r.cCsP, r.cMsN, r.cMsP].every(x => x.kod);                // TS 500 9.5.2 en küçük aralık
  r.minKod = dosemeCubuk(0.00175 * 1000 * h, sMax, { caplar, sAlt }).kod;   // false: en az donatı bile sığmıyor, kalınlaştırmak çözmez
  // Eğilme kullanımı: momentten gereken / seçilen donatı (en az donatı belirleyiciyse küçük kalır)
  r.kul = r.yetmez ? 2 : Math.max(csN.gerek / r.cCsN.As, csP.gerek / r.cCsP.As, msN.gerek / r.cMsN.As, msP.gerek / r.cMsP.As);
  return r;
}

// Zımbalama (TS 500 8.3.1). V: kolondan gelen katsayılı kuvvet (kN), p: çevre içinde düşülen katsayılı yayılı yük (kN/m²).
// kx/ky: x/y doğrultusunda kolon yüzünden serbest kenara uzaklık (m); kenar yoksa Infinity.
// Çevre: kapalı (d/2) ile serbest kenara açılan U/L çevreden küçüğü (TS 500 Şekil 8.5).
// γ = 1/(1 + Σ η·e·u_p·d/W_m) (Denk. 8.22, her doğrultu terimi toplanır — yorum); η = 1/(1 + √(b2/b1)) (Denk. 8.23);
// e = 0,4·M/V (Şekil 8.3); W_m: kritik kesitin (çevre × d) eğilme doğrultusundaki mukavemet momenti (iç kare kolonda
// W_m = 4/3·d·b² ile Denk. 8.24'ün 1,5·e/b'si elde edilir).
export function zimbalama({ V, p, b, hk, d, kx = Infinity, ky = Infinity, Mx = 0, My = 0, fctd }) {
  const B = b / 1000, H = hk / 1000, D = d / 1000;
  // Çevre parçaları [x1, y1, x2, y2] (kolon merkezi orijin; serbest kenar −x ve −y yanında)
  const xs = Number.isFinite(kx) ? -(B / 2 + kx) : -(B / 2 + D / 2), ys = Number.isFinite(ky) ? -(H / 2 + ky) : -(H / 2 + D / 2);
  const x2 = B / 2 + D / 2, y2 = H / 2 + D / 2;
  const kapali = [[-x2, -y2, x2, -y2], [x2, -y2, x2, y2], [x2, y2, -x2, y2], [-x2, y2, -x2, -y2]];
  const acik = [];
  if (Number.isFinite(kx) || Number.isFinite(ky)) {
    if (!Number.isFinite(ky)) acik.push([xs, -y2, x2, -y2], [x2, -y2, x2, y2], [x2, y2, xs, y2]);          // U (x kenarı)
    else if (!Number.isFinite(kx)) acik.push([-x2, ys, -x2, y2], [-x2, y2, x2, y2], [x2, y2, x2, ys]);     // U (y kenarı)
    else acik.push([xs, y2, x2, y2], [x2, y2, x2, ys]);                                                     // L (köşe)
  }
  const uzun = sg => sg.reduce((t, [a, b_, c, e]) => t + Math.hypot(c - a, e - b_), 0);
  const cevre = acik.length && uzun(acik) < uzun(kapali) ? acik : kapali;
  const up = uzun(cevre);
  const xmin = Math.min(...cevre.flatMap(s => [s[0], s[2]])), ymin = Math.min(...cevre.flatMap(s => [s[1], s[3]]));
  const bx = x2 - xmin, by = y2 - ymin, Ap = cevre === kapali ? (B + D) * (H + D) : bx * by;
  // W_m: çevre parçaları üzerinde sayısal (her parça 40 dilim), eksen = çevrenin ağırlık merkezi
  const Wm = eksen => {
    const pts = [];
    for (const [a, b_, c, e] of cevre) for (let k = 0; k < 40; k++) {
      const t = (k + 0.5) / 40, L = Math.hypot(c - a, e - b_) / 40;
      pts.push([eksen === 'x' ? a + (c - a) * t : b_ + (e - b_) * t, L]);
    }
    const toplam = pts.reduce((t, [, L]) => t + L, 0), m = pts.reduce((t, [u, L]) => t + u * L, 0) / toplam;
    const J = D * pts.reduce((t, [u, L]) => t + L * (u - m) ** 2, 0), c = Math.max(...pts.map(([u]) => Math.abs(u - m)));
    return J / c;
  };
  const ex = V > 0 ? 0.4 * Math.abs(Mx) / V : 0, ey = V > 0 ? 0.4 * Math.abs(My) / V : 0;
  const terim = (e, b1, b2, W) => e > 0 ? e * up * D / W / (1 + Math.sqrt(b2 / b1)) : 0;
  const gam = 1 / (1 + terim(ex, bx, by, Wm('x')) + terim(ey, by, bx, Wm('y')));
  const Vpd = Math.max(0, V - p * Ap), Vpr = gam * fctd * 1000 * up * D;   // kN
  return { up, Ap, gam, Vpd, Vpr, acik: cevre !== kapali, ex, ey };
}

// Plak, dişli ve kaset için kalınlığı bul: en küçük kalınlıktan başlayıp tüm panolar sağlanana dek 10 mm artır.
// g.dosemeOzel = { h?, t? } (mm): elle verilen kalınlık boyutlandırılmaz, yalnız denetlenir (t yalnız dişli/kasette).
export function dosemeBul(ag, g, mz, bwK) {
  const tasarla = g.dosemeTuru === 'plak' ? plakTasarla : disTasarla, hElle = g.dosemeOzel?.h;
  let h = hElle ?? (g.dosemeTuru === 'plak' ? PLAK_MIN : (g.dosemeOzel?.t ?? yukari(Math.max(70, g.disAralik / 10), 10)) + 50), panolar;
  for (let adim = 0; adim < 80; adim++) {
    panolar = tasarla(ag, g, h, mz, bwK);
    if (hElle != null) { for (const e of panolar) e.iz.push(`h = ${h} mm elle verildi: araç kalınlığı boyutlandırmadı, koşullar bu kalınlıkla denetlendi`); break; }
    const enAz = Math.max(...panolar.map(e => e.hMin));                    // geçerli en küçük kalınlıktan başla
    if (adim === 0 && enAz > h) { h = yukari(enAz, 10); continue; }
    // elle verilen tabla kalınlığı kalınlaştırmakla düzelmez: o madde sağlanmasa da h büyümez
    if (panolar.every(e => e.maddeler.every(m => m.gecti || m.uyari || (m.ad === 'Tabla kalınlığı' && g.dosemeOzel?.t != null)))) break;
    if (adim === 79) { for (const e of panolar) if (!e.gecti) e.iz.push(`h = ${h} mm'ye dek 10 mm adımla kalınlaştırıldı (80 adım sınırı); sağlanamayan koşul kalınlıkla düzelmiyor`); break; } // h panolarınki kalsın
    h += 10;
  }
  return { h, panolar };
}

// Kirişsiz döşeme: şerit donatısı (TS 500 11.4.4.2), zımbalama (8.3.1, dengelenmemiş moment γ), pano sehimi.
// perdeDugum: perdeye katılan düğümler (zımbalama yok: döşeme perde boyunca çizgisel mesnetli)
export function kirissizDoseme(ag, g, h, mz, yk, olcuF, katKx, katKy, perdeDugum = new Map()) {
  const wD = 1.4 * g.duvarDis;  // dış duvar (G, TS 498; 1,4 TS 500 6.2.6): kenar kirişi yok, döşeme kenarına oturur → zımbalama ve kenar şeridi
  const cer = ddmCerceveler(ag, yk.pd, h, mz, olcuF, { wKenar: wD });
  const seritler = cer.map(c => {
    const sd = seritDonati(c, h, mz);
    const e = { ad: `Ş${c.yon.toUpperCase()}${c.hatNo + 1}-${c.k + 1}`, aks: c.yon === 'x' ? `${String.fromCharCode(65 + c.hatNo)} / ${c.k + 1}–${c.k + 2}` : `${c.hatNo + 1} / ${String.fromCharCode(65 + c.k)}–${String.fromCharCode(66 + c.k)}`,
      yon: c.yon, l1: c.l1, l2: c.l2, Mo: c.Mo, cs: c.cs, ms: c.ms, c, sd, maddeler: [],
      csUst: `φ${sd.cCsN.phi}/${sd.cCsN.s}`, csAlt: `φ${sd.cCsP.phi}/${sd.cCsP.s}`, msUst: `φ${sd.cMsN.phi}/${sd.cMsN.s}`, msAlt: `φ${sd.cMsP.phi}/${sd.cMsP.s}` };
    madde(e, 'Eğilme', sd.yetmez ? 'yetmez' : 'yeter', 'kesit momenti karşılamalı', !sd.yetmez, 'TS 500 7.1', sd.kul);
    madde(e, 'Donatı aralığı', `${e.csUst} / ${e.csAlt} / ${e.msUst} / ${e.msAlt}`, 'net aralık ≥ max(φ; 4/3·Dmax; 25 mm), Dmax 22 mm', sd.kod, 'TS 500 9.5.2', sd.kod ? null : 2);
    madde(e, 'Pratik aralık', `${e.csUst} / ${e.csAlt}`, `φ${CAP.doseme.join('/φ')} ile aralık ≥ 100 mm önerilir; değilse daha büyük çap`, [sd.cCsN, sd.cCsP, sd.cMsN, sd.cMsP].every(x => x.yeter), 'uygulama', null, true);
    e.iz = [`M_o = p_d·ℓ2·ℓn²/8 = ${tr(yk.pd)}·${tr(c.l2)}·${tr(c.ln)}²/8 = ${tr(c.Mo, 1)} kNm (TS 500 Denk. 11.4)` +
      (c.MoW ? `; dış duvar 1,4·${tr(g.duvarDis)}·${tr(c.ln)}²/8 = ${tr(c.MoW, 1)} kNm, tamamı kolon şeridinde (statik denge)` : ''),
      `Katsayılar: mesnet ${tr(c.cA)}/${tr(c.cB)}, açıklık ${tr(c.cP)}; kolon şeridi ${tr(c.cs)} m (mesnette %75, dış mesnette %100, açıklıkta %60), orta şerit ${tr(c.ms)} m`,
      `Kolon şeridi üst ${e.csUst}, alt ${e.csAlt} (≥ üstün 1/3'ü, TBDY 7.11.14); orta şerit üst ${e.msUst}, alt ${e.msAlt}`];
    return sonla(e);
  });
  // Pano sehimi: kolon şeridi (bir doğrultu) + orta şerit (öbür doğrultu) (yorum: çapraz şerit yaklaşımı)
  const sehimSerit = (s, tip) => {
    const w = (tip === 'cs' ? s.cs : s.ms) * 1000; if (w <= 0) return 0;
    const pay = tip === 'cs' ? [s.c.cA === 0.30 ? 1 : 0.75, s.c.cB === 0.30 ? 1 : 0.75, 0.6] : [s.c.cA === 0.30 ? 0 : 0.25, s.c.cB === 0.30 ? 0 : 0.25, 0.4];
    const AsN = (tip === 'cs' ? s.sd.cCsN : s.sd.cMsN).As * w / 1000, AsP = (tip === 'cs' ? s.sd.cCsP : s.sd.cMsP).As * w / 1000;
    const mw = tip === 'cs' ? s.c.MoW / 1.4 : 0;  // dış duvar: kullanımda yalnız G, kolon şeridinde
    const m = sc => ({ Mm: s.c.Mpoz * pay[2] * sc + s.c.cP * mw, M1: s.c.MnegA * pay[0] * sc + s.c.cA * mw, M2: s.c.MnegB * pay[1] * sc + s.c.cB * mw });
    const kes = { m: kesit({ bw: w, h, As: AsP, d: s.sd.d }, mz.fck, mz.fctd), s1: kesit({ bw: w, h, As: AsN, d: s.sd.d, cekme: 'ust' }, mz.fck, mz.fctd) };
    kes.s2 = kes.s1;
    return aciklikSehim({ l: s.c.l1 * 1000, ln: s.c.ln * 1000, kesitler: kes, G: m(yk.g / yk.pd), GQ: m((yk.g + yk.q) / yk.pd), duvar: g.dosemeDuvar, fck: mz.fck }).deger;
  };
  const sx = (j, i) => seritler.find(s => s.yon === 'x' && s.c.hatNo === j && s.c.k === i), sy = (i, j) => seritler.find(s => s.yon === 'y' && s.c.hatNo === i && s.c.k === j);
  const panolar = ag.dosemeler.map(d => {
    const csx = Math.max(sehimSerit(sx(d.j, d.i), 'cs'), sehimSerit(sx(d.j + 1, d.i), 'cs')), msx = Math.max(sehimSerit(sx(d.j, d.i), 'ms'), sehimSerit(sx(d.j + 1, d.i), 'ms'));
    const csy = Math.max(sehimSerit(sy(d.i, d.j), 'cs'), sehimSerit(sy(d.i + 1, d.j), 'cs')), msy = Math.max(sehimSerit(sy(d.i, d.j), 'ms'), sehimSerit(sy(d.i + 1, d.j), 'ms'));
    const deger = Math.max(csx + msy, csy + msx), ln = Math.max(sx(d.j, d.i).c.ln, sy(d.i, d.j).c.ln) * 1000, sinir = ln / (g.dosemeDuvar ? 480 : 360);
    const e = { ad: d.ad, aks: d.aks, i: d.i, j: d.j, tur: 'kirissiz', lx: d.lx, ly: d.ly, m: Math.max(d.lx, d.ly) / Math.min(d.lx, d.ly), h, gAlan: yk.g, qAlan: yk.q, pd: yk.pd,
      durum: 'kirişsiz', sehim: { deger, sinir }, maddeler: [] };
    const hMin = Math.ceil(Math.max(200, Math.max(d.lx, d.ly) * 1000 / 30) - TOL);
    e.hMin = hMin;
    madde(e, 'Döşeme kalınlığı', h, `≥ max(200; ℓℓ/30) = ${hMin} mm`, h >= hMin, 'TS 500 11.4.2, Denk. 11.2', hMin / h);
    madde(e, 'Sehim', deger, `kolon şeridi + orta şerit ≤ ℓn/${g.dosemeDuvar ? 480 : 360} = ${tr(sinir, 1)} mm`, deger <= sinir + TOL, 'TS 500 13.2, Çizelge 13.3 (yorum: çapraz şerit)', deger / sinir);
    e.iz = [`Sehim: kolon şeridi X ${tr(csx)} + orta şerit Y ${tr(msy)} mm; kolon şeridi Y ${tr(csy)} + orta şerit X ${tr(msx)} mm → ${tr(deger)} mm`];
    return sonla(e);
  });
  // Zımbalama: kat başına kolon tepkisi (alan payı × süreklilik), d = h − 25 (iki doğrultu ortalaması)
  const d = h - 25;
  const zimb = ag.kolonlar.filter(c => !perdeDugum.has(c.ad)).map(c => {
    const o = olcuF(c), ax = ((g.ax[c.i - 1] ?? 0) + (g.ax[c.i] ?? 0)) / 2, ay = ((g.ay[c.j - 1] ?? 0) + (g.ay[c.j] ?? 0)) / 2;
    const disBoy = (c.j === 0 || c.j === ag.ny ? ax : 0) + (c.i === 0 || c.i === ag.nx ? ay : 0);
    const V = yk.pd * ax * ay * Math.max(katKx[c.j][c.i], katKy[c.i][c.j]) + wD * disBoy; // TS 500 8.3.1: duvar yükü çevreden geçer (içte kalan payı düşülmedi, güvenli yan)
    // Dengelenmemiş moment: kenarda dış mesnet momenti (0,30·Mo), içte Denk. 11.5
    const dengesiz = (yon) => {
      const L = yon === 'x' ? g.ax : g.ay, u = yon === 'x' ? c.i : c.j, l2 = yon === 'x' ? ay : ax;
      const sideA = L[u - 1], sideB = L[u];
      const kenar = sideA == null || sideB == null, ln = x => x - (yon === 'x' ? o.b : o.h) / 1000;
      const wl = (yon === 'x' ? c.j === 0 || c.j === ag.ny : c.i === 0 || c.i === ag.nx) ? wD : 0; // çerçeve dış aksta: duvar çizgisel yükü
      if (kenar) { const l = sideA ?? sideB; return 0.30 * (yk.pd * l2 + wl) * ln(l) ** 2 / 8; }
      const [uzun, kisa] = sideA >= sideB ? [sideA, sideB] : [sideB, sideA];
      return Math.max(0, 0.07 * (((1.4 * yk.g + 0.5 * 1.6 * yk.q) * l2 + wl) * ln(uzun) ** 2 - (1.4 * yk.g * l2 + wl) * ln(kisa) ** 2));
    };
    const kx = c.i === 0 || c.i === ag.nx ? 0 : Infinity, ky = c.j === 0 || c.j === ag.ny ? 0 : Infinity;
    const z = zimbalama({ V, p: yk.pd, b: o.b, hk: o.h, d, kx, ky, Mx: dengesiz('x'), My: dengesiz('y'), fctd: mz.fctd });
    const e = { ad: c.ad.replace('S', 'Z'), kolon: c.ad, aks: c.aks, i: c.i, j: c.j, Nd: V, d, ...z, maddeler: [] };
    madde(e, 'Zımbalama', z.Vpd, `≤ γ·fctd·u_p·d = ${tr(z.Vpr, 0)} kN`, z.Vpd <= z.Vpr + TOL, 'TS 500 8.3.1', z.Vpd / z.Vpr);
    e.iz = [`Kat başına kolon tepkisi V = p_d·${tr(ax)}·${tr(ay)}·süreklilik${disBoy ? ` + 1,4·${tr(g.duvarDis)}·${tr(disBoy)} (dış duvar)` : ''} = ${tr(V, 0)} kN, d = ${d} mm`,
      `u_p = ${tr(z.up, 3)} m${z.acik ? ' (serbest kenara açık çevre, TS 500 Şekil 8.5)' : ''}; e_x ${tr(z.ex * 1000, 0)} mm, e_y ${tr(z.ey * 1000, 0)} mm (e = 0,4·M/V, Şekil 8.3) → γ = ${tr(z.gam, 3)}`,
      `V_pd = V − p_d·A_p = ${tr(z.Vpd, 0)} kN ≤ V_pr = ${tr(z.Vpr, 0)} kN`];
    return sonla(e);
  });
  return { seritler, panolar, zimb };
}
