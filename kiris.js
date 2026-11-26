// Kiriş tasarımı: her aks çizgisi bir sürekli kiriş; kesit (b × h) hat boyunca aynı, koşullar sağlanana dek büyütülür.
// Birimler: açıklık m, kesit mm, kN, kN/m, kNm.
import { surekliKiris, desenler, zarf, ortaMomentler, kenarParcasi, parcaToplam } from './mekanik.js';
import { egilmeAs, mMax, rhoMax, rhoMinKiris, kirisCubuk, etriyeSec, alan, CAP } from './donati.js';
import { kesit, aciklikSehim } from './sehim.js';
import { panoGeo, GAMMA_BA, seritler, oz } from './doseme.js';
import { duvarYuku } from './kurallar.js';

const TOL = 1e-9;
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);
const yukari = (x, adim) => Math.ceil(x / adim - TOL) * adim;
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null, uyari = false) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari });
const sonla = e => {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
  return e;
};
const cn = c => `${c.n}φ${c.phi}${c.sira === 2 ? ' (2 sıra)' : ''}`;
const ETR = Math.max(...CAP.etriye); // sığmada en büyük etriye çapı
const ORTU = 25;
const NET = 4 / 3 * 22; // TS 500 9.5.2, varsayılan en büyük agrega 22 mm

// Kiriş yüzü boyunca aynı çap: sürekli çubuklar ile ilaveler tek bir düzen olarak sığar.
function yuzDonati(b, h, mz, moment, enAzAs = 0) {
  const sec = (d, sira) => {
    const gerekli = M => Math.max(egilmeAs(M, b, d, mz), rhoMinKiris(mz) * b * d);
    const gerek = Math.max(gerekli(moment), enAzAs);
    const c = kirisCubuk(gerek, b, { ortu: ORTU, etriye: ETR, sira, net: NET });
    return { ...c, d, gerekli };
  };
  const tek = sec(h - 50, 1);
  return tek.sigar ? tek : sec(h - 75, 2);
}

function kirisDonati(e, tSlab, mz, surekli) {
  const { b, h, ln } = e;
  const ust = yuzDonati(b, h, mz, e.MdMesnet);
  const alt = yuzDonati(b, h, mz, e.MdAcik, ust.As / 2);
  const adet = (As, c) => Math.ceil(As / alan(c.phi) - TOL);
  const ustS = Math.max(2, Math.ceil(ust.n / 4), e.MdOrtaUst > TOL ? adet(ust.gerekli(e.MdOrtaUst), ust) : 0);
  const altS = Math.max(2, adet(alt.gerekli(e.MdAcik), alt));
  const ustUclar = [e.MdSolUst, e.MdSagUst].map(M => Math.max(ustS, adet(ust.gerekli(M), ust)));
  const altUclar = [e.MdSolAlt, e.MdSagAlt].map((M, i) =>
    Math.max(altS, adet(Math.max(alt.gerekli(M), ustUclar[i] * alan(ust.phi) / 2), alt)));
  const yaz = (n, c) => n > 0 ? `${n}φ${c.phi}` : 0;
  const yuksekKiris = ln > TOL && ln * 1000 < (surekli ? 2.5 : 1.5) * h - TOL;
  const serbest = h - 2 * (ORTU + ETR) - (ust.phi + alt.phi) / 2;
  const icSinir = serbest - (ust.sira - 1) * (ust.phi + NET) - (alt.sira - 1) * (alt.phi + NET);
  const sigar = ust.sigar && alt.sigar && icSinir >= NET + (ust.phi + alt.phi) / 2 - TOL;
  const sinirda = Math.max(ust.As / (b * ust.d), alt.As / (b * alt.d)) <= rhoMax(mz) + TOL;
  const durum = ln <= TOL ? 'Geçersiz açıklık' : yuksekKiris ? 'Özel hesap gerekli' : !sigar ? 'Sığmıyor' : !sinirda ? 'Kesit yetersiz' : null;

  const tbd = ln > TOL && h > ln * 250 + TOL, ts = h - tSlab > 600 + TOL;
  const mesnetAs = Math.max(...ustUclar.map((n, i) => n * alan(ust.phi) + altUclar[i] * alan(alt.phi)));
  const govdeAs = Math.max(tbd ? 0.30 * mesnetAs : 0, ts ? 0.001 * b * (h - 50) : 0);
  // Eşit dağılımda, dış sıra köşe donatıları ile gövde çubukları arasında da 300 mm sınırını uygula.
  let govde = null;
  if (!durum && govdeAs > TOL) for (const phi of CAP.kiris) {
    const n = Math.max(1, Math.ceil(govdeAs / (2 * alan(phi)) - TOL), Math.ceil(serbest / 300 - TOL) - 1);
    if (icSinir / (n + 1) >= NET + Math.max(phi, ust.phi, alt.phi) - TOL) { govde = { n, phi }; break; }
  }
  const metin = {
    montaj: yaz(ustS, ust), duz: yaz(altS, alt), orta: `${yaz(ustS, ust)} / ${yaz(altS, alt)}`, pilye: 0,
    solUstEk: yaz(ustUclar[0] - ustS, ust), sagUstEk: yaz(ustUclar[1] - ustS, ust),
    solAltEk: yaz(altUclar[0] - altS, alt), sagAltEk: yaz(altUclar[1] - altS, alt),
    govde: govde ? `${yaz(govde.n, govde)}/yüz` : govdeAs > TOL ? 'Sığmıyor' : 0,
  };
  if (durum) for (const k of Object.keys(metin)) metin[k] = durum;

  return { ust, alt, ustUclar, altS, metin, durum, yuksekKiris, sigar, tbd, ts, govdeAs, govde };
}

// Bir doğrultuda taşıyan şeritlerin süreklilik katsayısı: sürekli kiriş mesnet tepkisi / alan payı (p·s/2), kenar başına.
// Şeritler döşeme tasarımındakiyle aynı (TS 500 11.2.2 / 11.3.2 sürekli kiriş); G tüm açıklıklarda, Q dama zarfı (6.3.3).
// Dönüş: `${pano}:${kenar}` → { G, Q }. Yalnız açıklıklara bağlı: ağ başına bir kez hesaplanır.
const SERIT_KAT = new WeakMap();
function seritKatsayi(ag, tur) {
  let m = SERIT_KAT.get(ag); if (!m) SERIT_KAT.set(ag, m = {}); if (m[tur]) return m[tur];
  const pl = ag.dosemeler.map(d => ({ d, geo: panoGeo(d) })), kat = new Map();
  for (const dz of seritler(pl, tur === 'disli' ? () => true : p => p.geo.m > 2 + TOL)) {
    const L = dz.panolar.map(p => p.geo.s), rG = surekliKiris(L, L.map(() => [{ w: 1, a: 0 }])), q = L.map(() => [0, 0]);
    for (const de of desenler(L.length)) surekliKiris(L, L.map((_, k) => de[k] ? [{ w: 1, a: 0 }] : [])).acikliklar
      .forEach((a, k) => { q[k][0] = Math.max(q[k][0], a.VL); q[k][1] = Math.max(q[k][1], a.VR); });
    const [k1, k2] = dz.yon === 'x' ? ['sol', 'sag'] : ['alt', 'ust'];
    dz.panolar.forEach((p, k) => {
      kat.set(`${p.d.ad}:${k1}`, { G: rG.acikliklar[k].VL / (L[k] / 2), Q: q[k][0] / (L[k] / 2) });
      kat.set(`${p.d.ad}:${k2}`, { G: rG.acikliklar[k].VR / (L[k] / 2), Q: q[k][1] / (L[k] / 2) });
    });
  }
  return (m[tur] = kat);
}

// Döşemeden kirişe yük: iki doğrultulu plak ve kasette 45° (TS 500 11.4.3). Bir doğrultulu plakta ve dişlide yükün tamamı
// uzun kenar kirişlerine (TBDY 17.5.2.1; dişlerin saplandığı kirişler), şeridin sürekli kiriş tepkisiyle: p·s/2 × max(1, katsayı)
// (TS 500 11.2.2, 11.3.2; kenarda alan payının altına inilmez — burulma tutulması ihmal, güvenli yan). bil: 'G' ya da 'Q'.
// Dönüş: kenar boyu Le olan kenarın parçası (kat: süreklilik katsayısı, > 1 ise).
export function dosemedenKenar(d, kenar, p, tur, ag = null, bil = 'G') {
  const Le = kenar === 'alt' || kenar === 'ust' ? d.lx : d.ly, geo = panoGeo(d);
  const kat = () => Math.max(1, (ag && seritKatsayi(ag, tur).get(`${d.ad}:${kenar}`)?.[bil]) ?? 1);
  const parca = w => { const k = kat(); return k > 1 + TOL ? { w: w * k, a: 0, kat: k } : { w, a: 0 }; };
  if (tur !== 'disli') { const r = kenarParcasi(Le, d.lx, d.ly, p); return tur === 'plak' && geo.m > 2 + TOL && r.w > 0 ? parca(r.w) : r; }
  const uzunKenar = (kenar === 'alt' || kenar === 'ust') === geo.uzunX;
  return uzunKenar ? parca(p * geo.s / 2) : { w: 0, a: 0 };
}

// Hattın yükleri: G ve Q parçaları (açıklık başına). gAlan, qAlan: döşeme alan yükleri; govde: kiriş gövdesi kN/m (null: perde
// açıklığı, gövde yok); dv: duvarYuku. hat.ofs: parça hattın ilk açıklığının hat içindeki sırası (perdeyle bölünen hat).
function hatYukleri(ag, hat, g, tur, gAlan, qAlan, govde, dv) {
  const G = [], Q = [], iz = [];
  hat.kirisler.forEach((_, k0) => {
    const pG = [], pQ = [], z = [], k = k0 + (hat.ofs ?? 0);
    const komsu = hat.yon === 'x' ? [[k, hat.no - 1, 'ust'], [k, hat.no, 'alt']] : [[hat.no - 1, k, 'sag'], [hat.no, k, 'sol']];
    for (const [i, j, kenar] of komsu) {
      const d = ag.dosemeler.find(x => x.i === i && x.j === j); if (!d) continue;
      const pg = dosemedenKenar(d, kenar, gAlan, tur, ag, 'G'), pq = dosemedenKenar(d, kenar, qAlan, tur, ag, 'Q');
      if (pg.w === 0) { z.push(`${d.ad}: yük vermez (tek doğrultuda taşır)`); continue; }
      pG.push(pg); pQ.push(pq);
      z.push(`${d.ad}: ${pg.a === 0 ? 'düzgün' : 2 * pg.a >= (hat.L[k0]) - TOL ? 'üçgen' : 'yamuk'}, tepe g ${tr(pg.w)} + q ${tr(pq.w)} kN/m` +
        (pg.kat || pq.kat ? ` (sürekli şerit tepkisi: g ×${tr(pg.kat ?? 1)}, q ×${tr(pq.kat ?? 1)}; TS 500 11.2.2/11.3.2, 6.3.3)` : ''));
    }
    pG.push({ w: dv.w + (govde ?? 0), a: 0 });
    z.push(`${hat.dis ? 'Dış' : 'İç'} duvar ${dv.yazi}${govde == null ? '' : ` + kiriş gövdesi ${tr(govde)} kN/m`}`);
    G.push(pG); Q.push(pQ); iz.push(z);
  });
  return { G, Q, iz };
}

// Kesitin taşıma gücü momenti (tek donatılı dikdörtgen), kNm
const Mr = (As, b, d, mz) => { const a = As * mz.fyd / (0.85 * mz.fcd * b); return As * mz.fyd * (d - a / 2) / 1e6; };

// Bir hattın tasarımı (b, h verilmiş). tSlab: döşeme (tabla) kalınlığı, hMin: en küçük yükseklik.
function hatTasarla(ag, hat, hi, g, mz, dos, kolonOlcu, b, h) {
  const tur = g.dosemeTuru, tSlab = dos.tabla ?? dos.h;
  // Gövde: b × h dolu beton (TS 498 1.3), döşeme öz ağırlığı kiriş izinde de alana yayıldığından düşülür (dişli/kasette ortalama yoğunluk)
  const govde = b / 1000 * Math.max(0, h / 1000 * GAMMA_BA - oz(g, tSlab, dos.h));
  // Duvar: türü seçildiyse kN/m² × net yükseklik (H − kiriş h; kiriş büyüdükçe azalır), değilse elle kN/m (TS 498 1.5)
  const dv = duvarYuku(hat.dis ? g.duvarDisTur : g.duvarIcTur, hat.dis ? g.duvarDis : g.duvarIc, g.H - h);
  const { G, Q, iz } = hatYukleri(ag, hat, g, tur, dos.gAlan, dos.qAlan, govde, dv);
  const ank = hat.uc; // perdeye saplanan uç ankastre (perdenin düzlem içi rijitliği)
  const z = zarf(hat.L, G, Q, ank), rG = surekliKiris(hat.L, G, ank), rQ = surekliKiris(hat.L, Q, ank);
  const sG = ortaMomentler(hat.L, G, ank), sGQ = ortaMomentler(hat.L, G.map((p, k) => [...p, ...Q[k]]), ank);
  const d = h - 50;
  const n = hat.L.length;
  const kirisler = hat.kirisler.map((kr, k) => {
    const K = k + (hat.ofs ?? 0); // hat içindeki açıklık sırası
    const uc = [K, K + 1].map(u => kolonOlcu(ag.kolonlar.find(c => hat.yon === 'x' ? c.i === u && c.j === hat.no : c.i === hat.no && c.j === u)));
    const boy = uc.map(o => (hat.yon === 'x' ? o.b : o.h) / 1000), dik = Math.min(...uc.map(o => hat.yon === 'x' ? o.h : o.b));
    // Kolonlar açıklıktan genişse ℓn ≤ 0 (sehim sınırı 0/0 = NaN ya da eksi): hesapta en az 0,1 m, ayrıca 'Net açıklık' sağlanmaz
    const ln = kr.L - (boy[0] + boy[1]) / 2, lnH = Math.max(ln, 0.1), e = { ad: kr.ad, aks: kr.aks, hat: hi, k: K, L: kr.L, ln, b, h, duvar: dv.w,
      gOrt: rG.acikliklar[k].W / kr.L, qOrt: rQ.acikliklar[k].W / kr.L, ...z[k], maddeler: [], iz: [...iz[k]] };
    const { ust, alt, ustUclar, altS, metin, durum, yuksekKiris, sigar, tbd, ts, govdeAs, govde: govdeDonati } =
      kirisDonati(e, tSlab, mz, n > 1 || ank?.some(Boolean));
    const AsOrtaAlt = altS * alan(alt.phi);
    const altAcik = { ...alt, n: altS, sira: kirisCubuk(AsOrtaAlt, b, { caplar: [alt.phi], ortu: ORTU, etriye: ETR, net: NET }).sigar ? 1 : alt.sira };
    // Kesme: TBDY 7.4.5.1 kapasite kesmesi Ve kirişin tüm boyunda enine donatıyı belirler; orta bölgede Vc = 0,8Vcr (7.4.5.3 →
    // TS 500 8.1.4), sarılma bölgesinde Vc = 0 (güvenli yan). TS 500 8.1 düşey yük kesmesi Vd de sağlanır.
    const Vcr = 0.65 * mz.fctd * b * d / 1000, Vc = 0.8 * Vcr, fywd = mz.fyd;
    const MpU = 1.4 * Mr(ust.As, b, ust.d, mz), MpA = 1.4 * Mr(alt.As, b, alt.d, mz);
    const Vdy = (sGQ[k] ? (rG.acikliklar[k].W + rQ.acikliklar[k].W) : 0) / 2;                     // G + Q basit kiriş kesmesi
    const Ve = Vdy + (MpU + MpA) / lnH;
    const awsMin = 0.3 * mz.fctd * b / fywd;
    const Vo = Math.max(e.Vd, Ve);                                                                  // orta bölge tasarım kesmesi
    const orta = etriyeSec(Math.max((Vo - Vc) * 1000 / (fywd * d), awsMin), Vo > 3 * Vcr ? d / 4 : d / 2); // TS 500 8.1.5 aralık sınırı
    const phiMin = Math.min(ust.phi, alt.phi, govdeDonati?.phi ?? Infinity);
    const sar = etriyeSec(Math.max(Ve * 1000 / (fywd * d), awsMin), Math.min(d / 4, 8 * phiMin, 150));
    Object.assign(e, metin, { Ve, ust: durum ?? cn(ust), alt: durum ?? cn(altAcik), surekliUst: metin.montaj, yuksekKiris, etrSar: `φ${sar.phi}/${sar.s}`, etrOrta: `φ${orta.phi}/${orta.s}`,
      AsUst: ust.As, AsAlt: alt.As, sarilma: 2 * h,
      etrKul: Math.max(Ve * 1000 / (fywd * d), (Vo - Vc) * 1000 / (fywd * d)) / (2 * alan(ETR) / 50) }); // > 1: iki kollu φ10/50 yetmez
    // Boyut koşulları (TBDY 7.4.1.1)
    madde(e, 'Gövde genişliği', b, '≥ 250 mm', b >= 250, 'TBDY 7.4.1.1(a)');
    madde(e, 'Gövde genişliği üst sınırı', b, `≤ h + kolon genişliği = ${tr(h + dik)} mm`, b <= h + dik, 'TBDY 7.4.1.1(a)');
    const hAlt = Math.max(300, 3 * tSlab, tur === 'disli' || tur === 'kaset' ? dos.h : 0);
    madde(e, 'Kiriş yüksekliği', h, `≥ max(300; 3·t${tur === 'disli' || tur === 'kaset' ? '; diş yüksekliği' : ''}) = ${tr(hAlt)} mm`, h >= hAlt, 'TBDY 7.4.1.1(b)');
    madde(e, 'Kiriş yüksekliği üst sınırı', h, `≤ 3,5·b = ${tr(3.5 * b)} mm`, h <= 3.5 * b + TOL, 'TBDY 7.4.1.1(b)');
    if (ln <= TOL) madde(e, 'Net açıklık', `ℓn = ${tr(ln)} m`, 'ℓn = L − (c₁ + c₂)/2 > 0: kolon yüzleri arasında açıklık kalmalı (kolonlar bu açıklığa sığmıyor)', false, 'geometri', 2);
    // Dayanım
    const MkU = mMax(b, ust.d, mz), MkA = mMax(b, alt.d, mz);
    madde(e, 'Mesnet momenti', e.MdMesnet, `ρ ≤ min(0,02; 0,85ρb) → M ≤ ${tr(MkU, 1)} kNm`, e.MdMesnet <= MkU, 'TBDY 7.4.2.4; TS 500 Denk. 7.4, 7.5', e.MdMesnet / MkU);
    madde(e, 'Açıklık momenti', e.MdAcik, `ρ ≤ min(0,02; 0,85ρb) → M ≤ ${tr(MkA, 1)} kNm`, e.MdAcik <= MkA, 'TBDY 7.4.2.4; TS 500 Denk. 7.4, 7.5', e.MdAcik / MkA);
    madde(e, 'Donatı sığma', `${cn(ust)} / ${cn(alt)}`, `en çok iki sıra, net aralık ≥ ${tr(NET, 1)} mm`, sigar, 'TS 500 9.5.2');
    if (yuksekKiris) madde(e, 'Yüksek kiriş', 'Özel hesap gerekli', 'Gerilme dağılımı ve kesme yüksek kiriş olarak denetlenmeli', false, 'TS 500 7.3, 8.5', 2);
    if (govdeAs > TOL && ln > TOL && !yuksekKiris) madde(e, 'Gövde donatısı', metin.govde, `iki yüzde toplam ≥ ${tr(govdeAs, 1)} mm², düşey aralık ≤ 300 mm`, !!govdeDonati,
      [tbd && 'TBDY 7.4.1.1(c)', ts && 'TS 500 7.3'].filter(Boolean).join(' / '), govdeDonati ? govdeAs / (2 * govdeDonati.n * alan(govdeDonati.phi)) : null);
    const rhoK = Math.max(ust.As / (b * ust.d), alt.As / (b * alt.d)), rM = rhoMax(mz); // seçilen çubuklarla (yuvarlama sonrası)
    madde(e, 'Konan donatı oranı', `%${tr(rhoK * 100, 2)}`, `ρ ≤ min(0,02; 0,85ρb) = %${tr(rM * 100, 2)}`, rhoK <= rM + TOL, 'TBDY 7.4.2.4; TS 500 Denk. 7.4', rhoK / rM);
    const Vmax = 0.22 * mz.fcd * b * d / 1000;
    madde(e, 'Kesme kuvveti', e.Vd, `≤ 0,22·fcd·b·d = ${tr(Vmax, 1)} kN`, e.Vd <= Vmax, 'TS 500 8.1.5, Denk. 8.7', e.Vd / Vmax);
    const VeMax = 0.85 * b * d * Math.sqrt(mz.fck) / 1000;
    madde(e, 'Deprem kesmesi (kapasite)', Ve, `≤ 0,85·b·d·√fck = ${tr(VeMax, 1)} kN`, Ve <= VeMax, 'TBDY 7.4.5.1–7.4.5.2, Denk. 7.9–7.10', Ve / VeMax);
    madde(e, 'Etriye', `${e.etrSar} / ${e.etrOrta}`, 'φ8/φ10, aralık ≥ 50 mm', sar.yeter && orta.yeter, 'TBDY 7.4.4; TS 500 8.1.4–8.1.6');
    // Sehim: T (iç hat) ya da L (dış hat) kesit, TS 500 6.3.6 tabla genişliği
    const lp = (n === 1 ? 1 : k === 0 || k === n - 1 ? 0.8 : 0.6) * kr.L * 1000;
    const bf = hat.dis ? Math.min(b + 0.1 * lp, b + 6 * tSlab) : Math.min(b + 0.2 * lp, b + 12 * tSlab);
    const ucKesit = n => kesit({ bw: b, h, bf, hf: tSlab, As: n * alan(ust.phi), d: ust.d, cekme: 'ust' }, mz.fck, mz.fctd);
    const kes = { m: kesit({ bw: b, h, bf, hf: tSlab, As: AsOrtaAlt, d: alt.d }, mz.fck, mz.fctd), s1: ucKesit(ustUclar[0]), s2: ucKesit(ustUclar[1]) };
    const sh = aciklikSehim({ l: kr.L * 1000, ln: lnH * 1000, kesitler: kes, G: sG[k], GQ: sGQ[k], rhoP: Math.min(ust.As, alt.As) / (b * d) * 0, duvar: e.duvar > 0 || g.dosemeDuvar, fck: mz.fck });
    e.sehim = sh;
    madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, 'TS 500 13.2, Çizelge 13.3', sh.deger / sh.sinir);
    e.iz.push(`${n} açıklıklı sürekli kiriş, rijit mesnet; 1,4G + 1,6Q, hareketli yük dama yüklemesi (TS 500 6.3.3)`,
      `Düşey yük uç momentleri (kNm): sol üst ${tr(e.MdSolUst, 1)}, sol alt ${tr(e.MdSolAlt, 1)}; sağ üst ${tr(e.MdSagUst, 1)}, sağ alt ${tr(e.MdSagAlt, 1)}. Açıklık ortası üst momenti ${tr(e.MdOrtaUst, 1)} kNm.`,
      `Donatı ön hesabı: orta üst/alt ${e.orta}; sol üst/alt ilave ${e.solUstEk} / ${e.solAltEk}; sağ üst/alt ilave ${e.sagUstEk} / ${e.sagAltEk}. Mesnet alt alanı aynı mesnette üst alanın en az %50’si. Sürekli üst alan en büyük mesnet üst alanının en az %25’i (TBDY 7.4.2–7.4.3).`,
      'Çubuk adetleri ve çapları düşey yük ön hesabına aittir. İlave çubuk uzatmaları, kenetlenme, donatı bindirmeleri ve deprem momentleri kesin hesapta belirlenir.',
      `Orta bölge: max(V_d ${tr(e.Vd, 1)}; V_e ${tr(Ve, 1)}) − V_c ${tr(Vc, 1)} = ${tr(Vo - Vc, 1)} kN (V_c = 0,8·V_cr, TBDY 7.4.5.3) → ${e.etrOrta}`,
      `V_e = V_dy + (M_pi + M_pj)/ℓn = ${tr(Vdy, 1)} + (${tr(MpU, 1)} + ${tr(MpA, 1)})/${tr(lnH)} = ${tr(Ve, 1)} kN (M_p ≈ 1,4·M_r) → sarılma bölgesi (2h = ${tr(2 * h)} mm) ${e.etrSar}`,
      `Sehim: tabla ${tr(bf, 0)} mm; δ_G ${tr(sh.dG)}, δ_G+Q ${tr(sh.dGQ)} → ${tr(sh.deger)} mm`);
    if (tbd && govdeDonati) e.iz.push('Gövde çirozlarının düşeyde en çok 600 mm ve kiriş boyunca en çok 400 mm aralıkla düzenlenmesi ve gövde çubuklarının kenetlenmesi kesin detayda denetlenir (TBDY 7.4.1.1(c)).');
    return sonla(e);
  });
  return { kirisler, G, Q, rG, rQ };
}

// Kirişleri boyutlandır: hat başına b = 250'den, h = en küçük yükseklikten başla; koşullar sağlanana dek önce h'yi
// (h ≤ 2,5b), sonra b'yi 50 mm büyüt. Dönüş: kirişler ve kolonlara gidecek tepkiler.
// perde: perde açıklıkları (`${hat}:${açıklık}`): orada kiriş yok, hat perdeyle parçalara bölünür ve her parça ayrı boyutlanır;
// perdeye saplanan parça ucu ankastre (perde düzlem içinde çok rijit). Perde açıklığına kirişe gelecek döşeme ve duvar yükü
// çizgisel yük olarak perdeye (perdeYuk, kat başına kN). hEk: hat → en küçük kiriş h (yanal ötelenmesi önlenmemiş çerçevede kolon
// narinliği için rijitleştirme, TS 500 7.6.2.2 Denk. 7.16: α kiriş rijitliğiyle küçülür). ozel: aks adı → { b?, h? } (mm), elle verilen
// boyut aks boyunca bütün parçalarda sabit kalır, yalnız denetlenir; verilmeyen boyut büyütülür (b ≤ h, h ≤ 3,5b içinde).
export function kirisBul(ag, g, mz, dos, kolonOlcu, { perde = new Set(), hEk = new Map(), ozel = {} } = {}) {
  const tur = g.dosemeTuru, tSlab = dos.tabla ?? dos.h;
  const hBas = yukari(Math.max(300, 3 * tSlab, tur === 'disli' || tur === 'kaset' ? dos.h : 0), 50);
  const kirisler = [], tepki = new Map(), kalkma = [], perdeYuk = new Map();
  ag.hatlar.forEach((hat, hi) => {
    const n = hat.L.length, RG = Array(n + 1).fill(0), RQ = Array(n + 1).fill(0), pMi = k => perde.has(`${hi}:${k}`);
    // Perde açıklığı: kirişin alacağı döşeme payı (aynı aktarım) ve duvar (net yükseklik H − döşeme h), kiriş gövdesi yok
    for (let k = 0; k < n; k++) if (pMi(k)) {
      const dv = { w: 0, yazi: 'perde açıklığında dolgu duvar yok' }; // perde yerinde örme duvar olmaz; perdenin öz ağırlığı perde.js'de
      const y = hatYukleri(ag, { ...hat, L: [hat.L[k]], kirisler: [hat.kirisler[k]], ofs: k }, g, tur, dos.gAlan, dos.qAlan, null, dv);
      const W = p => p.reduce((t, x) => t + parcaToplam(x, hat.L[k]), 0);
      perdeYuk.set(`${hi}:${k}`, { G: W(y.G[0]), Q: W(y.Q[0]), duvar: dv.w * hat.L[k], iz: y.iz[0] });
    }
    const hMin = yukari(Math.max(hBas, hEk.get(hi) ?? 0), 50);
    for (let a = 0; a < n;) {
      if (pMi(a)) { a++; continue; }
      let son = a; while (son < n && !pMi(son)) son++;
      const par = { ...hat, L: hat.L.slice(a, son), kirisler: hat.kirisler.slice(a, son), ofs: a, uc: [a > 0, son < n] };
      const { b: bS, h: hS } = ozel[hat.aks] ?? {};
      const boyutlanabilir = e => e.ln > TOL && !e.yuksekKiris;
      let b = bS ?? 250, h = hS ?? hMin, r, enIyi = null, bos = 0;
      for (let adim = 0; adim < 60; adim++) {
        r = hatTasarla(ag, par, hi, g, mz, dos, kolonOlcu, b, h);
        if (bS != null && hS != null) break;
        // Net açıklık yoksa veya yüksek kiriş hesabı gerekiyorsa kesiti büyütmek çözmez.
        if (r.kirisler.every(e => e.gecti || !boyutlanabilir(e))) break;
        // Yalnız etriye yetmiyor ve büyütme gereksinimi azaltmıyorsa dur: V_e'nin kapasite terimi (TBDY Denk. 7.9) kesitle büyür,
        // iki kollu etriye kesit büyütmekle çözülmez (sınırsız büyüme); üç adımda iyileşmezse en iyi kesitte kalınır.
        if (r.kirisler.every(e => !boyutlanabilir(e) || e.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Etriye'))) {
          const kul = Math.max(...r.kirisler.filter(boyutlanabilir).map(e => e.etrKul));
          if (!enIyi || kul < enIyi.kul - TOL) { enIyi = { r, kul }; bos = 0; }
          else if (++bos >= 3) {
            r = enIyi.r;
            for (const e of r.kirisler) if (!e.gecti) e.iz.push('Kesit büyütmek etriye gereksinimini azaltmıyor (V_e kapasite kesmesi kesitle artıyor): büyütme durduruldu; çok kollu etriye ya da daha yüksek beton sınıfı gerekir (TBDY 7.4.4, 7.4.5)');
            break;
          }
        } else { enIyi = null; bos = 0; }
        if (adim === 59) for (const e of r.kirisler) if (!e.gecti) e.iz.push(`Kesit 60 adımda ${b}×${h} mm'ye büyütüldü (büyütme sınırı); sağlanamayan koşullar yukarıda`);
        // Elle verilen boyut sabit: yalnız öbürü büyür (b ≤ h, h ≤ 3,5b; aşılacaksa durur, koşullar sağlanmaz kalır)
        if (hS != null ? b + 50 > hS : bS != null && h + 50 > 3.5 * bS) {
          for (const e of r.kirisler) if (!e.gecti) e.iz.push(`Elle verilen ${hS != null ? `h = ${hS} mm ile b ≤ h` : `b = ${bS} mm ile h ≤ 3,5·b`} sınırına ulaşıldı: büyütme durdu; sağlanamayan koşullar yukarıda`);
          break;
        }
        if (hS != null) b += 50; else if (bS != null) h += 50;
        else if (h + 50 <= 2.5 * b) h += 50; else b += 50; // ponytail: h ≤ 2,5b tercihi (TBDY sınırı 3,5b), sonra genişlik
      }
      for (const e of r.kirisler) {
        if (par.uc.some(Boolean)) e.iz.push(`Perdeye saplanan ${par.uc[0] && par.uc[1] ? 'iki' : par.uc[0] ? 'sol' : 'sağ'} uç ankastre alındı (perde düzlem içinde rijit; üç moment denkleminde sıfır boylu hayali açıklık)`);
        if (hMin > hBas && hS == null) e.iz.push(`Kolon narinliği için kiriş yüksekliği en az ${hMin} mm alındı (yanal ötelenmesi önlenmemiş çerçeve: kiriş rijitliği α'yı küçültür, k ve λ azalır; TS 500 7.6.2.2, Denk. 7.15–7.16)`);
        if (bS != null || hS != null) {
          e.ozel = { b: bS != null, h: hS != null };
          e.iz.push(`${hat.aks} aksı boyunca ${[bS != null && `b = ${bS}`, hS != null && `h = ${hS}`].filter(Boolean).join(', ')} mm elle verildi: araç bu boyutu büyütmedi, koşullar bu kesitle denetlendi`);
        }
      }
      kirisler.push(...r.kirisler);
      // Kolona giden tepki: G alan payıyla alttan sınırlı; Q her mesnet için en elverişsiz desen (TS 500 6.3.3)
      const pay = rr => rr.R.map((_, u) => ((rr.acikliklar[u - 1]?.W ?? 0) + (rr.acikliklar[u]?.W ?? 0)) / 2);
      const rq = pay(r.rQ), pg = pay(r.rG);
      for (const d of desenler(par.L.length))
        surekliKiris(par.L, r.Q.map((p, k) => d[k] ? p : []), par.uc).R.forEach((x, u) => { rq[u] = Math.max(rq[u], x); });
      if (!kalkma.includes(`${hat.aks} aksı`) && desenler(par.L.length).some(d => surekliKiris(par.L, r.G.map((p, k) => [...p.map(y => ({ w: 1.4 * y.w, a: y.a })),
        ...(d[k] ? r.Q[k].map(y => ({ w: 1.6 * y.w, a: y.a })) : [])]), par.uc).R.some(x => x < -TOL))) kalkma.push(`${hat.aks} aksı`);
      r.rG.R.forEach((x, u) => { RG[a + u] += Math.max(x, pg[u]); RQ[a + u] += rq[u]; });
      a = son;
    }
    tepki.set(hi, { G: RG, Q: RQ });
  });
  return { kirisler, tepki, kalkma, perdeYuk };
}
