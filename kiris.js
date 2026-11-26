// Kiriş tasarımı: her aks çizgisi bir sürekli kiriş; kesit (b × h) hat boyunca aynı, koşullar sağlanana dek büyütülür.
// Birimler: açıklık m, kesit mm, kN, kN/m, kNm.
import { surekliKiris, desenler, zarf, ortaMomentler, kenarParcasi, parcaToplam, bantCholesky, bantCoz, elemanK, parcaIntegral } from './mekanik.js';
import { egilmeAs, mMax, rhoMax, rhoMinKiris, kirisCubuk, etriyeSec, alan, CAP } from './donati.js';
import { kesit, ief, aciklikSehim, sehimSinir, EC } from './sehim.js';
import { panoGeo, GAMMA_BA, seritler, oz } from './doseme.js';
import { duvarYuku } from './kurallar.js';
import { yonlendirilir, dikAciklik } from './kolonduzen.js';
import { bicim } from './bicim.js';

const TOL = 1e-9;
const tr = (x, d = 2) => bicim(x, d); // bicim.js: biçimleyici ve sonuç önbellekte
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

function kirisDonati(e, tSlab, mz, surekli, cikinti = false) {
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
  const yuksekKiris = !cikinti && ln > TOL && ln * 1000 < (surekli ? 2.5 : 1.5) * h - TOL; // kısa uç çıkıntısı yüksek kiriş sayılmaz (kiris.js izgaraBul)
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

// Bir açıklığa döşemelerden gelen G ve Q parçaları; Q parçası hangi panodan geldiğini taşır (p: döşeme sırası; ızgarada pano başına
// hareketli yük yerleşimi, TS 500 6.3.3). k: hattaki açıklık sırası.
function dosemeYukleri(ag, hat, k, tur, gAlan, qAlan, L = hat.L[k]) {
  const pG = [], pQ = [], z = [];
  const komsu = hat.yon === 'x' ? [[k, hat.no - 1, 'ust'], [k, hat.no, 'alt']] : [[hat.no - 1, k, 'sag'], [hat.no, k, 'sol']];
  for (const [i, j, kenar] of komsu) {
    if (i < 0 || j < 0 || i >= ag.nx || j >= ag.ny) continue;
    const p = j * ag.nx + i, d = ag.dosemeler[p];
    const pg = dosemedenKenar(d, kenar, gAlan, tur, ag, 'G'), pq = dosemedenKenar(d, kenar, qAlan, tur, ag, 'Q');
    if (pg.w === 0) { z.push(`${d.ad}: yük vermez (tek doğrultuda taşır)`); continue; }
    pG.push(pg); pQ.push(Object.assign(pq, { p }));
    z.push(`${d.ad}: ${pg.a === 0 ? 'düzgün' : 2 * pg.a >= L - TOL ? 'üçgen' : 'yamuk'}, tepe g ${tr(pg.w)} + q ${tr(pq.w)} kN/m` +
      (pg.kat || pq.kat ? ` (sürekli şerit tepkisi: g ×${tr(pg.kat ?? 1)}, q ×${tr(pq.kat ?? 1)}; TS 500 11.2.2/11.3.2, 6.3.3)` : ''));
  }
  return { pG, pQ, z };
}

// Hattın yükleri: G ve Q parçaları (açıklık başına). gAlan, qAlan: döşeme alan yükleri; govde: kiriş gövdesi kN/m (null: perde
// açıklığı, gövde yok); dv: duvarYuku. hat.ofs: parça hattın ilk açıklığının hat içindeki sırası (perdeyle bölünen hat).
function hatYukleri(ag, hat, g, tur, gAlan, qAlan, govde, dv) {
  const G = [], Q = [], iz = [];
  hat.kirisler.forEach((_, k0) => {
    const { pG, pQ, z } = dosemeYukleri(ag, hat, k0 + (hat.ofs ?? 0), tur, gAlan, qAlan, hat.L[k0]);
    pG.push({ w: dv.w + (govde ?? 0), a: 0 });
    z.push(`${hat.dis ? 'Dış' : 'İç'} duvar ${dv.yazi}${govde == null ? '' : ` + kiriş gövdesi ${tr(govde)} kN/m`}`);
    G.push(pG); Q.push(pQ); iz.push(z);
  });
  return { G, Q, iz };
}

// Kesitin taşıma gücü momenti (tek donatılı dikdörtgen), kNm
const Mr = (As, b, d, mz) => { const a = As * mz.fyd / (0.85 * mz.fcd * b); return As * mz.fyd * (d - a / 2) / 1e6; };

// Bir kirişin (iki mesnet arası açıklık ya da konsol) donatı, kesme, boyut ve sehim denetimi; sürekli kiriş ve ızgara yolunda ortak.
// e: { ad, aks, hat, k, L, b, h, duvar, gOrt, qOrt, zarf alanları (MdMesnet, MdAcik, MdSolUst …, Vd), iz }; c:
//   uc: iki uçtaki mesnet ölçüsü ({ b, h } mm ya da null: kolon/perde yok), ucPay: kolon olmayan uçta ℓn'den düşülen (m; kirişe oturan uçta
//   mesnet kirişinin yarı genişliği), mafsal: deprem kapasite momenti gelişen uç sayısı (2 çerçeve kirişi, 1 bir ucu kirişe oturan, 0 konsol),
//   surekli, lp (TS 500 Denk. 6.13 katsayısı), Vdy, sehim(kes, lnH) → aciklikSehim çıktısı, izBas: ilk iz satırı
function kirisTasarla(e, c, { g, mz, dos, tur, dis }) {
  const { b, h, L } = e, tSlab = dos.tabla ?? dos.h, d = h - 50, yon = c.yon;
  const boy = c.uc.map((o, i) => o ? (yon === 'x' ? o.b : o.h) / 1000 : 2 * (c.ucPay?.[i] ?? 0)), uclar = c.uc.filter(Boolean);
  const dik = Math.min(...uclar.map(o => yon === 'x' ? o.h : o.b));
  // Kolonlar açıklıktan genişse ℓn ≤ 0 (sehim sınırı 0/0 = NaN ya da eksi): hesapta en az 0,1 m, ayrıca 'Net açıklık' sağlanmaz
  const ln = L - (boy[0] + boy[1]) / 2, lnH = Math.max(ln, 0.1);
  Object.assign(e, { ln, maddeler: [] });
  const { ust, alt, ustUclar, altS, metin, durum, yuksekKiris, sigar, tbd, ts, govdeAs, govde: govdeDonati } = kirisDonati(e, tSlab, mz, c.surekli, c.cikinti);
  const AsOrtaAlt = altS * alan(alt.phi);
  const altAcik = { ...alt, n: altS, sira: kirisCubuk(AsOrtaAlt, b, { caplar: [alt.phi], ortu: ORTU, etriye: ETR, net: NET }).sigar ? 1 : alt.sira };
  // Kesme: TBDY 7.4.5.1 kapasite kesmesi Ve kirişin tüm boyunda enine donatıyı belirler; orta bölgede Vc = 0,8Vcr (7.4.5.3 →
  // TS 500 8.1.4), sarılma bölgesinde Vc = 0 (güvenli yan). TS 500 8.1 düşey yük kesmesi Vd de sağlanır.
  // Konsolda serbest uçta mafsal oluşmaz: V_e = V_dy; bir ucu kirişe oturan kirişte yalnız kolon ucunun M_p'si (Denk. 7.9, yorum).
  const Vcr = 0.65 * mz.fctd * b * d / 1000, Vc = 0.8 * Vcr, fywd = mz.fyd;
  const MpU = 1.4 * Mr(ust.As, b, ust.d, mz), MpA = 1.4 * Mr(alt.As, b, alt.d, mz);
  const Vdy = c.Vdy;
  const Ve = c.mafsal === 2 ? Vdy + (MpU + MpA) / lnH : c.mafsal === 1 ? Vdy + Math.max(MpU, MpA) / lnH : Vdy;
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
  if (uclar.length) madde(e, 'Gövde genişliği üst sınırı', b, `≤ h + kolon genişliği = ${tr(h + dik)} mm`, b <= h + dik, 'TBDY 7.4.1.1(a)');
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
  if (c.cikinti && ln > TOL && ln * 1000 < 1.5 * h - TOL) madde(e, 'Kısa çıkıntı', `ℓn = ${tr(ln)} m < 1,5·h`, 'kolon yüzünden kısa taşma, ucunda kiriş oturmuyor: yalnız kendi yükü; bitişik açıklığın mesnet üst donatısı uca dek uzatılıp kenetlenir (yorum)', true, 'TS 500 7.3, 9.1', null, true);
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
  const lp = c.lp * L * 1000;
  const bf = dis ? Math.min(b + 0.1 * lp, b + 6 * tSlab) : Math.min(b + 0.2 * lp, b + 12 * tSlab);
  const ucKesit = n => kesit({ bw: b, h, bf, hf: tSlab, As: n * alan(ust.phi), d: ust.d, cekme: 'ust' }, mz.fck, mz.fctd);
  const kes = { m: kesit({ bw: b, h, bf, hf: tSlab, As: AsOrtaAlt, d: alt.d }, mz.fck, mz.fctd), s1: ucKesit(ustUclar[0]), s2: ucKesit(ustUclar[1]) };
  const sh = c.sehim(kes, lnH, { duvar: e.duvar > 0 || g.dosemeDuvar, fck: mz.fck, rhoP: Math.min(ust.As, alt.As) / (b * d) * 0 });
  e.sehim = sh;
  madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, `TS 500 13.2, Çizelge 13.3${sh.kaynak ?? ''}`, sh.deger / sh.sinir);
  e.iz.push(c.izBas,
    `Düşey yük uç momentleri (kNm): sol üst ${tr(e.MdSolUst, 1)}, sol alt ${tr(e.MdSolAlt, 1)}; sağ üst ${tr(e.MdSagUst, 1)}, sağ alt ${tr(e.MdSagAlt, 1)}. Açıklık ortası üst momenti ${tr(e.MdOrtaUst, 1)} kNm.`,
    `Donatı ön hesabı: orta üst/alt ${e.orta}; sol üst/alt ilave ${e.solUstEk} / ${e.solAltEk}; sağ üst/alt ilave ${e.sagUstEk} / ${e.sagAltEk}. Mesnet alt alanı aynı mesnette üst alanın en az %50’si. Sürekli üst alan en büyük mesnet üst alanının en az %25’i (TBDY 7.4.2–7.4.3).`,
    'Çubuk adetleri ve çapları düşey yük ön hesabına aittir. İlave çubuk uzatmaları, kenetlenme, donatı bindirmeleri ve deprem momentleri kesin hesapta belirlenir.',
    `Orta bölge: max(V_d ${tr(e.Vd, 1)}; V_e ${tr(Ve, 1)}) − V_c ${tr(Vc, 1)} = ${tr(Vo - Vc, 1)} kN (V_c = 0,8·V_cr, TBDY 7.4.5.3) → ${e.etrOrta}`,
    c.mafsal === 2 ? `V_e = V_dy + (M_pi + M_pj)/ℓn = ${tr(Vdy, 1)} + (${tr(MpU, 1)} + ${tr(MpA, 1)})/${tr(lnH)} = ${tr(Ve, 1)} kN (M_p ≈ 1,4·M_r) → sarılma bölgesi (2h = ${tr(2 * h)} mm) ${e.etrSar}`
      : c.mafsal === 1 ? `V_e = V_dy + M_pi/ℓn = ${tr(Vdy, 1)} + ${tr(Math.max(MpU, MpA), 1)}/${tr(lnH)} = ${tr(Ve, 1)} kN: kirişe oturan uçta kolon yok, deprem momenti ve mafsal yalnız kolon ucunda (TBDY Denk. 7.9, yorum) → kolon ucunda sarılma bölgesi (2h = ${tr(2 * h)} mm) ${e.etrSar}`
      : `V_e = V_dy = ${tr(Ve, 1)} kN: konsolun serbest ucunda mafsal oluşmaz, (M_pi + M_pj)/ℓn terimi yok (TBDY Denk. 7.9, yorum); mesnette sarılma bölgesi (2h = ${tr(2 * h)} mm) ${e.etrSar}, serbest uçta gerekmez (TBDY 7.4.4 kolon yüzü)`,
    `Sehim: tabla ${tr(bf, 0)} mm; δ_G ${tr(sh.dG)}, δ_G+Q ${tr(sh.dGQ)} → ${tr(sh.deger)} mm${sh.iz ? `; ${sh.iz}` : ''}`);
  if (tbd && govdeDonati) e.iz.push('Gövde çirozlarının düşeyde en çok 600 mm ve kiriş boyunca en çok 400 mm aralıkla düzenlenmesi ve gövde çubuklarının kenetlenmesi kesin detayda denetlenir (TBDY 7.4.1.1(c)).');
  return sonla(e);
}

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
  const n = hat.L.length, P = hat.yon === 'x' ? ag.xs : ag.ys;
  const kirisler = hat.kirisler.map((kr, k) => {
    const K = k + (hat.ofs ?? 0); // hat içindeki açıklık sırası
    const uc = [K, K + 1].map(u => kolonOlcu(ag.kolonlar.find(c => hat.yon === 'x' ? c.i === u && c.j === hat.no : c.i === hat.no && c.j === u)));
    const e = { ad: kr.ad, aks: kr.aks, hat: hi, k: K, L: kr.L, x0: P[K], x1: P[K + 1], uclar: ['kolon', 'kolon'], b, h, duvar: dv.w,
      gOrt: rG.acikliklar[k].W / kr.L, qOrt: rQ.acikliklar[k].W / kr.L, ...z[k], maddeler: [], iz: [...iz[k]] };
    return kirisTasarla(e, { yon: hat.yon, uc, mafsal: 2, surekli: n > 1 || ank?.some(Boolean), lp: n === 1 ? 1 : k === 0 || k === n - 1 ? 0.8 : 0.6,
      Vdy: (sGQ[k] ? (rG.acikliklar[k].W + rQ.acikliklar[k].W) : 0) / 2,                     // G + Q basit kiriş kesmesi
      sehim: (kes, lnH, o) => aciklikSehim({ l: kr.L * 1000, ln: lnH * 1000, kesitler: kes, G: sG[k], GQ: sGQ[k], ...o }),
      izBas: `${n} açıklıklı sürekli kiriş, rijit mesnet; 1,4G + 1,6Q, hareketli yük dama yüklemesi (TS 500 6.3.3)` }, { g, mz, dos, tur, dis: hat.dis });
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
// izgara: kolon düzeni değişmemiş ağda da ızgara yolu (yalnız sınama: sürekli kirişlerle aynı sonucu vermeli).
// onb: çağıranın hesap boyunca tuttuğu önbellek (Map; zincir.js ve katli.js turlarında, katlarda aynı hat aynı girdilerle — yük,
// mesnet ölçüleri — yeniden boyutlanır). Saklanan: bulunan kesit ve iz iletileri; kesit tek çözümle yeniden kurulur (sonuç nesneleri
// her çağrıda yeni); ızgarada ayrıca kesitlere göre çözüm (mekanik). Verilmezse önbellek yalnız bu çağrıda.
const olcuYaz = o => o ? `${o.b}x${o.h}` : '-';
export function kirisBul(ag, g, mz, dos, kolonOlcu, { perde = new Set(), hEk = new Map(), ozel = {}, izgara = false, onb = new Map() } = {}) {
  const tur = g.dosemeTuru, tSlab = dos.tabla ?? dos.h;
  const gk = JSON.stringify([g, mz, dos, ozel]);
  const hBas = yukari(Math.max(300, 3 * tSlab, tur === 'disli' || tur === 'kaset' ? dos.h : 0), 50);
  const kirisler = [], tepki = new Map(), kalkma = [], perdeYuk = new Map();
  // Perde açıklığı: kirişin alacağı döşeme payı (aynı aktarım) ve duvar (net yükseklik H − döşeme h), kiriş gövdesi yok
  ag.hatlar.forEach((hat, hi) => { for (let k = 0; k < hat.L.length; k++) if (perde.has(`${hi}:${k}`)) {
    const dv = { w: 0, yazi: 'perde açıklığında dolgu duvar yok' }; // perde yerinde örme duvar olmaz; perdenin öz ağırlığı perde.js'de
    const y = hatYukleri(ag, { ...hat, L: [hat.L[k]], kirisler: [hat.kirisler[k]], ofs: k }, g, tur, dos.gAlan, dos.qAlan, null, dv);
    const W = p => p.reduce((t, x) => t + parcaToplam(x, hat.L[k]), 0);
    perdeYuk.set(`${hi}:${k}`, { G: W(y.G[0]), Q: W(y.Q[0]), duvar: dv.w * hat.L[k], iz: y.iz[0] });
  } });
  if (ag.duzen || izgara) return izgaraBul(ag, g, mz, dos, kolonOlcu, { perde, hEk, ozel, hBas, perdeYuk, boyOnb: onb, gk });
  ag.hatlar.forEach((hat, hi) => {
    const n = hat.L.length, RG = Array(n + 1).fill(0), RQ = Array(n + 1).fill(0), pMi = k => perde.has(`${hi}:${k}`);
    const hMin = yukari(Math.max(hBas, hEk.get(hi) ?? 0), 50);
    for (let a = 0; a < n;) {
      if (pMi(a)) { a++; continue; }
      let son = a; while (son < n && !pMi(son)) son++;
      const par = { ...hat, L: hat.L.slice(a, son), kirisler: hat.kirisler.slice(a, son), ofs: a, uc: [a > 0, son < n] };
      const { b: bS, h: hS } = ozel[hat.aks] ?? {};
      const boyutlanabilir = e => e.ln > TOL && !e.yuksekKiris;
      // Önbellek anahtarı: hat parçası, en küçük h ve parçanın mesnet ölçüleri (kirisTasarla yalnız bunları kullanır)
      const key = `${gk}|${hi}:${a}:${son}:${hMin}|${Array.from({ length: son - a + 1 }, (_, t) => olcuYaz(kolonOlcu(ag.kolonlar.find(c => hat.yon === 'x' ? c.i === a + t && c.j === hat.no : c.i === hat.no && c.j === a + t)))).join()}`;
      const bilinen = onb.get(key), mesaj = [], ilet = t => { mesaj.push(t); for (const e of r.kirisler) if (!e.gecti) e.iz.push(t); };
      let b = bS ?? 250, h = hS ?? hMin, r, rb, rh, enIyi = null, bos = 0;
      if (bilinen) { r = hatTasarla(ag, par, hi, g, mz, dos, kolonOlcu, bilinen.b, bilinen.h); bilinen.mesaj.forEach(ilet); }
      else for (let adim = 0; adim < 60; adim++) {
        r = hatTasarla(ag, par, hi, g, mz, dos, kolonOlcu, rb = b, rh = h);
        if (bS != null && hS != null) break;
        // Net açıklık yoksa veya yüksek kiriş hesabı gerekiyorsa kesiti büyütmek çözmez.
        if (r.kirisler.every(e => e.gecti || !boyutlanabilir(e))) break;
        // Yalnız etriye yetmiyor ve büyütme gereksinimi azaltmıyorsa dur: V_e'nin kapasite terimi (TBDY Denk. 7.9) kesitle büyür,
        // iki kollu etriye kesit büyütmekle çözülmez (sınırsız büyüme); üç adımda iyileşmezse en iyi kesitte kalınır.
        if (r.kirisler.every(e => !boyutlanabilir(e) || e.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Etriye'))) {
          const kul = Math.max(...r.kirisler.filter(boyutlanabilir).map(e => e.etrKul));
          if (!enIyi || kul < enIyi.kul - TOL) { enIyi = { r, kul, b, h }; bos = 0; }
          else if (++bos >= 3) {
            ({ r, b: rb, h: rh } = enIyi);
            ilet('Kesit büyütmek etriye gereksinimini azaltmıyor (V_e kapasite kesmesi kesitle artıyor): büyütme durduruldu; çok kollu etriye ya da daha yüksek beton sınıfı gerekir (TBDY 7.4.4, 7.4.5)');
            break;
          }
        } else { enIyi = null; bos = 0; }
        if (adim === 59) ilet(`Kesit 60 adımda ${b}×${h} mm'ye büyütüldü (büyütme sınırı); sağlanamayan koşullar yukarıda`);
        // Elle verilen boyut sabit: yalnız öbürü büyür (b ≤ h, h ≤ 3,5b; aşılacaksa durur, koşullar sağlanmaz kalır)
        if (hS != null ? b + 50 > hS : bS != null && h + 50 > 3.5 * bS) {
          ilet(`Elle verilen ${hS != null ? `h = ${hS} mm ile b ≤ h` : `b = ${bS} mm ile h ≤ 3,5·b`} sınırına ulaşıldı: büyütme durdu; sağlanamayan koşullar yukarıda`);
          break;
        }
        if (hS != null) b += 50; else if (bS != null) h += 50;
        else if (h + 50 <= 2.5 * b) h += 50; else b += 50; // ponytail: h ≤ 2,5b tercihi (TBDY sınırı 3,5b), sonra genişlik
      }
      if (!bilinen) onb.set(key, { b: rb, h: rh, mesaj });
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
  // Kolona birleşen kirişler (her doğrultuda sol/alt ve sağ/üst; perde açıklığında yok) ve kiriş eksenlerinin kolon eksenine kaçıklığı (mm)
  const at = new Map(kirisler.map(e => [`${e.hat}:${e.k}`, e])), kolonKiris = new Map(ag.kolonlar.map(c => [c.ad, {
    x: [at.get(`${c.j}:${c.i - 1}`) ?? null, at.get(`${c.j}:${c.i}`) ?? null], y: [at.get(`${ag.ny + 1 + c.i}:${c.j - 1}`) ?? null, at.get(`${ag.ny + 1 + c.i}:${c.j}`) ?? null], e: { x: 0, y: 0 } }]));
  return { kirisler, tepki, kalkma, perdeYuk, kolonKiris };
}

// ── Izgara kiriş sistemi: bir kolon kaldırıldı ya da kaydırıldı (ag.duzen; kolonduzen.js). Bütün hatlar birlikte çözülür.
// Düğümler: her hattaki aks kesişimleri ve hat boyunca kaydırılan kolonun yeri. Bilinmeyenler: düğümde düşey yer değiştirme (kolonsuz
// kesişimde iki hatta ortak) ve her hattın kendi eğilme dönmesi: kirişlerin burulma rijitliği ihmal (X ve Y dönmeleri bağımsız; çatlamış
// kirişte burulma rijitliği küçük, ön tasarımda yaygın ve kesişimde yükü eğilmeyle taşıtan güvenli yan kabul). Mesnet: kolon ve perde
// düğümleri düşeyde tutulu, eğilmede mafsallı (sürekli kiriş yoluyla aynı); perdeye saplanan kiriş ucu ankastre. EI = Ec·b·h³/12
// (dikdörtgen brüt; TBDY Tablo 4.2'deki gibi bütün kirişlere aynı çatlama katsayısı uygulansa da kuvvet dağılımı değişmez, sehimde
// TS 500 13.2.2 etkili eylemsizlik momentiyle düzeltilir). Kolon düzeni değişmemiş ağda hatlar ayrışır ve sürekli kirişlere eşittir.
// Yük: açıklık başına aynı döşeme/duvar/öz ağırlık parçaları; kaydırılan kolonun böldüğü açıklıkta parça konumuna göre dilimlenir
// (eşdeğer düğüm yükleri Gauss ile tam). Hareketli yük: G bir kez, Q her döşeme panosu için ayrı çözülür (tek ayrıştırma); her büyüklükte
// zarf = 1,4G + 1,6·Σ max(0, q_pano) ve 1,4G + 1,6·Σ min(0, q_pano) — panoların her yerleşimi içinde tam en elverişsiz (TS 500 6.3.3).
const NS = 24; // eleman başına örnek aralığı (moment zarfı, sehim tümlevi)
const MEK_EN = 50; // ızgara mekanik çözüm önbelleği kayıt sınırı (kayıt başına ~150 kB; daha çoğu hızlandırmıyor)
const YUK_ONB = new WeakMap(); // ağ → döşeme yükü tümlevleri
const harfK = j => String.fromCharCode(65 + j);
function izgaraBul(ag, g, mz, dos, kolonOlcu, { perde, hEk, ozel, hBas, perdeYuk, boyOnb, gk }) {
  const tur = g.dosemeTuru, tSlab = dos.tabla ?? dos.h, nx = ag.nx, Ec = EC[mz.fck] * 1000; // kN/m²
  const kol = (yon, no, u) => ag.kolonlar[yon === 'x' ? no * (nx + 1) + u : u * (nx + 1) + no];
  const dugumP = new Set();
  for (const key of perde) { const [hi, k] = key.split(':').map(Number), t = ag.hatlar[hi]; dugumP.add(kol(t.yon, t.no, k).ad); dugumP.add(kol(t.yon, t.no, k + 1).ad); }
  // Kesişim durumu. yon: hat boyunca kaydırılan kolon, dik kiriş kolona yönlendirilir (e ≤ L/10, kolonduzen.js): dik hatta mesnet aks
  // kesişiminde kalır (aks boyu; eğik boy farkı ≤ %0,5), kolonun kendi hattındaki kesişim düğümü serbest (dik kiriş oraya gelmez);
  // bag: kolonsuz kesişim (kaldırılan ya da L/10'dan çok kaçan kolon), iki hattın düğümü ortak w ile birbirine oturur.
  const durum = new Map(ag.kolonlar.map(c => {
    if (dugumP.has(c.ad)) return [c.ad, { tip: 'perde' }];
    if (c.sil) return [c.ad, { tip: 'bag' }];
    if (!(c.dx || c.dy)) return [c.ad, { tip: 'kolon' }];
    const yon = c.dx ? 'x' : 'y', e = Math.abs(c.dx || c.dy), L = dikAciklik(ag.ax, ag.ay, c), y = yonlendirilir(ag.ax, ag.ay, c);
    return [c.ad, { tip: y ? 'yon' : 'bag', yon, e, L, kacik: !y }];
  }));
  // Hatlar: düğümler (s: hat başından konum, m), elemanlar (açıklık içinde ardışık düğümler; perde açıklığında yok)
  const hatlar = ag.hatlar.map((hat, hi) => {
    const P = hat.yon === 'x' ? ag.xs : ag.ys, n = hat.L.length;
    const dg = P.map((s, u) => { const c = kol(hat.yon, hat.no, u), t = durum.get(c.ad);
      return { s, u, c, destek: t.tip === 'kolon' || t.tip === 'perde' || (t.tip === 'yon' && t.yon !== hat.yon) ? c : null,
        bag: t.tip === 'bag', yonl: t.tip === 'yon' && t.yon !== hat.yon }; });
    for (const c of ag.duzen?.kay ?? []) if ((hat.yon === 'x' ? c.j : c.i) === hat.no && (hat.yon === 'x' ? c.dx : c.dy))
      dg.push({ s: hat.yon === 'x' ? c.x : c.y, u: null, c, destek: c, kay: true });
    dg.sort((a, b) => a.s - b.s);
    const el = [];
    let k = 0;
    for (let t = 0; t < dg.length - 1; t++) {
      if (dg[t].u != null) k = dg[t].u;
      if (perde.has(`${hi}:${k}`)) continue;
      el.push({ hi, a: t, b: t + 1, k, Lb: hat.L[k], ua: dg[t].s - P[k], ub: dg[t + 1].s - P[k], L: dg[t + 1].s - dg[t].s, // çözüm alanları baştan: nesne biçimi sabit kalsın
        K: null, fG: null, FG: null, MG: null, Mmax: null, Mmin: null, MGQ: null, V: null, VGQ: null, FGQ: null, uG: null, uGQ: null });
    }
    return { hat, hi, P, n, dg, el };
  });
  // Kiriş dizileri (perde açıklıkları arası; kesit b × h dizi boyunca sabit) ve kirişler (dizide ardışık mesnetler arası ya da konsol)
  const parlar = [];
  for (const H of hatlar) for (let a = 0; a < H.n;) {
    if (perde.has(`${H.hi}:${a}`)) { a++; continue; }
    let son = a; while (son < H.n && !perde.has(`${H.hi}:${son}`)) son++;
    const { b: bS, h: hS } = ozel[H.hat.aks] ?? {}, hMin = yukari(Math.max(hBas, hEk.get(H.hi) ?? 0), 50);
    const par = { no: parlar.length, H, a, son, uc: [a > 0, son < H.n], bS, hS, hMin, b: bS ?? 250, h: hS ?? hMin, enIyi: null, bos: 0, kilit: false, mesaj: [], el: H.el.filter(e => e.k >= a && e.k < son) };
    for (const e of par.el) e.par = par;
    parlar.push(par); a = son;
  }
  const hatSonu = (H, t) => !H.el.some(e => e.a === t) || !H.el.some(e => e.b === t); // dizinin ucu (tek yanda eleman)
  const dikDugum = (H, d) => { const D = hatlar[H.hat.yon === 'x' ? ag.ny + 1 + d.c.i : d.c.j]; return [D, D.dg.findIndex(x => x.u != null && x.c === d.c)]; };
  // Öbür hattın ucundaki düğüm: o kiriş burada konsol; mesnede (kolon/perde) uzaklığı = konsol boyu
  const konsolBoy = (D, td) => { const yon = D.el.some(e => e.a === td) ? 1 : -1;
    for (let k = td + yon; k >= 0 && k < D.dg.length; k += yon) if (D.dg[k].destek) return Math.abs(D.dg[k].s - D.dg[td].s);
    return 0; };
  const ucTip = (H, t, L = 0) => { const d = H.dg[t];
    if (d.destek) return durum.get(d.destek.ad).tip === 'perde' ? 'perde' : 'kolon';
    if (!d.bag) return 'serbest';
    const [D, td] = dikDugum(H, d); if (td < 0) return 'serbest';
    if (!hatSonu(D, td)) return 'kiris';
    // İki hattın ucu buluşuyor (köşe): kısa, rijit bir konsolun ucuna oturan uzun kiriş o uçta kirişe oturur (L ≥ 2·konsol boyu);
    // boyları benzer iki konsol birbirine yaslanır, ikisi de konsol kalır (serbest uçta mafsal yok)
    const kL = konsolBoy(D, td); return kL > 0 && L >= 2 * kL ? 'kiris' : 'serbest'; };
  const kirisPar = [];
  for (const par of parlar) {
    const H = par.H, kes = []; let cur = null;
    for (const e of par.el) {
      if (!cur) cur = { par, H, el: [], t0: e.a };
      cur.el.push(e);
      if (H.dg[e.b].destek || e === par.el.at(-1)) { cur.t1 = e.b; kes.push(cur); cur = null; }
    }
    for (const sg of kes) {
      sg.x0 = H.dg[sg.t0].s; sg.x1 = H.dg[sg.t1].s; sg.L = sg.x1 - sg.x0; sg.uclar = [ucTip(H, sg.t0, sg.L), ucTip(H, sg.t1, sg.L)];
      sg.konsol = sg.uclar[0] === 'serbest' ? 'sol' : sg.uclar[1] === 'serbest' ? 'sag' : null;
      const orta = (sg.x0 + sg.x1) / 2, ek = sg.el.find(e => H.dg[e.a].s <= orta + TOL && H.dg[e.b].s >= orta - TOL);
      sg.orta = { e: ek, s: orta - H.dg[ek.a].s };
      sg.k0 = sg.el[0].k; sg.k1 = sg.el.at(-1).k;
    }
    // Ad: ortası hangi açıklıktaysa onun kiriş adı (birleşik açıklık ana açıklığının adını taşır); aynı açıklıkta ikinci kiriş varsa
    // konsol 'k', öbürü 'b' eki alır (önce açıklıklar adlanır: içeri kaydırılan uç kolonda açıklık K1, taşan uç K1k)
    const adlar = new Map();
    for (const sg of [...kes.filter(x => !x.konsol), ...kes.filter(x => x.konsol)]) {
      const ad0 = H.hat.kirisler[sg.orta.e.k].ad, n0 = adlar.get(ad0) ?? 0;
      sg.ad = n0 ? `${ad0}${sg.konsol ? 'k' : String.fromCharCode(97 + n0)}` : ad0; adlar.set(ad0, n0 + 1);
    }
    for (const sg of kes) {
      // Aks yazısı: uçtaki aks; hat boyunca kaydırılan kolonda o kolonun aksı ′ ile (B / 1–2′: 2B kaydı)
      const lbl = u => H.hat.yon === 'x' ? u + 1 : harfK(u), ucL = t => { const d = H.dg[t]; return d.u != null ? lbl(d.u) : `${lbl(H.hat.yon === 'x' ? d.c.i : d.c.j)}′`; };
      sg.aks = `${H.hat.aks} / ${ucL(sg.t0)}–${ucL(sg.t1)}${sg.konsol ? ' konsol' : ''}`;
      sg.birlesik = [...new Set(sg.el.map(e => H.hat.kirisler[e.k].ad))];
      sg.ici = sg.el.slice(1).map(e => e.a).filter(t => H.dg[t].bag); // açıklık içindeki kolonsuz kesişimler
      // Uçların plandaki yeri: kolona yönlendirilen dik kiriş kolonun gerçek yerine gider (plan çizimi; hesapta aks boyu)
      const yer = t => { const d = H.dg[t]; return d.yonl ? [d.destek.x, d.destek.y] : H.hat.yon === 'x' ? [d.s, ag.ys[H.hat.no]] : [ag.xs[H.hat.no], d.s]; };
      sg.p0 = yer(sg.t0); sg.p1 = yer(sg.t1); sg.yonl = [sg.t0, sg.t1].map(t => H.dg[t]).filter(d => d.yonl).map(d => d.destek);
      // Serbest ucunda bir şey oturmayan kısa uç (kolon yüzünden taşma): yüksek kiriş hesabı değil, mesnet donatısının devamı (yorum)
      sg.cikinti = !!sg.konsol && !sg.ici.length && !H.dg[sg.konsol === 'sol' ? sg.t0 : sg.t1].bag;
    }
    for (const sg of kes) kirisPar.push(sg);
  }
  // Serbestlik dereceleri: konum sırasıyla (y, x) numaralanır → dar bant
  const wOrtak = new Map(), tum = [];
  for (const H of hatlar) H.dg.forEach((d, t) => {
    if (!H.el.some(e => e.a === t || e.b === t)) return;
    const [x, y] = H.hat.yon === 'x' ? [d.s, ag.ys[H.hat.no]] : [ag.xs[H.hat.no], d.s];
    if (!d.destek) {
      if (d.bag) { if (!wOrtak.has(d.c.ad)) { const w = { x, y, o: 0 }; wOrtak.set(d.c.ad, w); tum.push(w); } d.w = wOrtak.get(d.c.ad); }
      else { d.w = { x, y, o: 0.1 }; tum.push(d.w); }
    }
    const sabitT = d.u != null && durum.get(d.c.ad).tip === 'perde' && [d.u - 1, d.u].some(k => perde.has(`${H.hi}:${k}`));
    if (!sabitT) { d.t = { x, y, o: H.hat.yon === 'x' ? 0.2 : 0.3 }; tum.push(d.t); }
  });
  tum.sort((p, q) => p.y - q.y || p.x - q.x || p.o - q.o).forEach((d, i) => { d.i = i; });
  const N = tum.length, elemanlar = hatlar.flatMap(H => H.el);
  let B = 0;
  for (const e of elemanlar) {
    const da = hatlar[e.hi].dg[e.a], db = hatlar[e.hi].dg[e.b];
    e.dof = [da.w?.i ?? -1, da.t?.i ?? -1, db.w?.i ?? -1, db.t?.i ?? -1];
    const v = e.dof.filter(i => i >= 0); if (v.length) B = Math.max(B, Math.max(...v) - Math.min(...v));
  }
  // Örnek noktaları ve döşeme yükü tümlevleri (kesitten bağımsız: bir kez). Kirişin orta noktası da örneklenir.
  // (zincir/katlı turlarında aynı ağ ve döşeme yüküyle defalarca çağrılır: ağ başına önbellek)
  const ortaS = new Map(kirisPar.map(sg => [sg.orta.e, sg.orta.s]));
  let onb = YUK_ONB.get(ag); if (!onb) YUK_ONB.set(ag, onb = new Map());
  const yukOn = new Map(), panolar = new Set(), yk = `${tur}:${dos.gAlan}:${dos.qAlan}`;
  for (const e of elemanlar) {
    const s = Array.from({ length: NS + 1 }, (_, i) => i * e.L / NS), m = ortaS.get(e);
    if (m != null && !s.some(x => Math.abs(x - m) < 1e-9)) s.push(m);
    e.s = s.sort((a, b) => a - b);
    const key = `${e.hi}:${e.k}`, ok = `${yk}:${key}`;
    if (!onb.has(ok)) onb.set(ok, dosemeYukleri(ag, ag.hatlar[e.hi], e.k, tur, dos.gAlan, dos.qAlan));
    const y = onb.get(ok); yukOn.set(key, y);
    const ek = `${ok}:${e.ua}:${e.ub}:${e.L}:${m}`; // örnek noktaları e.L ve m ile belirli
    if (!onb.has(ek)) {
      const grup = new Map(); for (const q of y.pQ) { if (!grup.has(q.p)) grup.set(q.p, []); grup.get(q.p).push(q); }
      onb.set(ek, { IG: parcaIntegral(y.pG, e.Lb, e.ua, e.ub, e.s), IQ: new Map([...grup].map(([p, l]) => [p, parcaIntegral(l, e.Lb, e.ua, e.ub, e.s)])) });
    }
    ({ IG: e.IG, IQ: e.IQ } = onb.get(ek));
    for (const p of e.IQ.keys()) panolar.add(p);
  }
  const PN = [...panolar].sort((a, b) => a - b), pSira = new Map(PN.map((p, i) => [p, i]));
  // Hat düğümlerine genel sıra (tepki dizileri); mesnet ve kolonsuz kesişim düğüm listeleri
  let nD = 0; for (const H of hatlar) for (const d of H.dg) d.gi = nD++;
  for (const e of elemanlar) { e.gia = hatlar[e.hi].dg[e.a].gi; e.gib = hatlar[e.hi].dg[e.b].gi; }
  const kolonSira = new Map(), destekD = [], kesD = [];
  for (const H of hatlar) for (const d of H.dg) {
    if (d.destek) { if (!kolonSira.has(d.destek.ad)) kolonSira.set(d.destek.ad, kolonSira.size); destekD.push([d.gi, kolonSira.get(d.destek.ad)]); }
    if (d.bag && H.hat.yon === 'x') kesD.push([d.gi, d.c.ad]);
  }
  const kolonAd = [...kolonSira.keys()];
  // Mekanik çözüm önbelleği: yalnız dizilerin rijitliği (EI) ve yayılı yükü (w) ile döşeme yüküne bağlı (mesnet ölçüsünden bağımsız);
  // komşu katlar ve turlar aynı kesit dizilerinden geçer. Eleman dizileri hesaptan sonra yalnız okunur. En çok MEK_EN kayıt.
  const mekK = `${[...perde].sort()}|${tur}|${dos.gAlan}|${dos.qAlan}|${Ec}|`;
  let mekOnb = boyOnb.get('mekanik'); if (!mekOnb) boyOnb.set('mekanik', mekOnb = new Map());
  // Bir çözüm: dizilerin o anki b × h kesitleriyle bütün kirişler
  const coz = () => {
    for (const par of parlar) {
      const { b, h } = par, dis = par.H.hat.dis;
      par.govde = b / 1000 * Math.max(0, h / 1000 * GAMMA_BA - oz(g, tSlab, dos.h));
      par.dv = duvarYuku(dis ? g.duvarDisTur : g.duvarIcTur, dis ? g.duvarDis : g.duvarIc, g.H - h);
      par.w = par.dv.w + par.govde; par.EI = Ec * (b / 1000) * (h / 1000) ** 3 / 12;
    }
    const mk = mekK + parlar.map(p => `${p.EI} ${p.w}`).join();
    let mek = mekOnb.get(mk);
    if (mek) mek.el.forEach((x, i) => Object.assign(elemanlar[i], x));
    else { mek = mekanik(); if (mekOnb.size >= MEK_EN) mekOnb.delete(mekOnb.keys().next().value); mekOnb.set(mk, mek); }
    return kirislerKur(mek);
  };
  const mekanik = () => {
    const W1 = B + 1, A = new Float64Array(N * W1), FG = new Float64Array(N), FQ = PN.map(() => new Float64Array(N));
    for (const e of elemanlar) {
      const L = e.L, w = e.par.w;
      e.K = elemanK(e.par.EI, L);
      e.fG = e.IG.f.map((f, r) => f + w * [L / 2, L * L / 12, L / 2, -L * L / 12][r]);
      for (let r = 0; r < 4; r++) { const I = e.dof[r]; if (I < 0) continue;
        FG[I] += e.fG[r];
        for (const [p, q] of e.IQ) FQ[pSira.get(p)][I] += q.f[r];
        for (let c = 0; c < 4; c++) { const J = e.dof[c]; if (J >= 0 && J <= I) A[I * W1 + I - J] += e.K[r][c]; } }
    }
    const tek = N ? bantCholesky(A, N, B) : -1;
    if (tek >= 0) {
      const d = tum[tek], yer = ag.kolonlar.reduce((a, c) => Math.hypot(c.gx - d.x, c.gy - d.y) < Math.hypot(a.gx - d.x, a.gy - d.y) ? c : a);
      throw new RangeError(`Kiriş ızgarası ${yer.aks} kolonu çevresinde dayanaksız (tekil rijitlik): bu kolon düzeninde kiriş mesnetleri yetersiz`);
    }
    const UG = N ? bantCoz(A, N, B, FG) : [], UQ = FQ.map(f => N ? bantCoz(A, N, B, f) : []);
    // Eleman uç kuvvetleri F = K·u − f (aşağı ve θ yönünde pozitif) ve örnek noktalarda moment (alt lif çekme pozitif):
    // M(s) = −s·F0 + F1 − (s·Q0(s) − Q1(s)); kesme V(0) = −F0, V(L) = F2.
    const u4 = [0, 0, 0, 0], F4 = [0, 0, 0, 0]; // panel döngüsünde yeniden kullanılır (ayırma yok)
    const uc = (e, U, f, F = [0, 0, 0, 0]) => { for (let r = 0; r < 4; r++) u4[r] = e.dof[r] < 0 ? 0 : U[e.dof[r]];
      for (let r = 0; r < 4; r++) { const k = e.K[r]; F[r] = k[0] * u4[0] + k[1] * u4[1] + k[2] * u4[2] + k[3] * u4[3] - (f ? f[r] : 0); } return F; };
    const Mdiz = (e, F, I, w = 0) => e.s.map((s, i) => -s * F[0] + F[1] - (I ? s * I.Q0[i] - I.Q1[i] : 0) - w * s * s / 2);
    for (const e of elemanlar) {
      e.FG = uc(e, UG, e.fG); e.MG = Mdiz(e, e.FG, e.IG, e.par.w);
      e.Mmax = e.MG.map(m => 1.4 * m); e.Mmin = e.Mmax.slice(); e.MGQ = e.MG.slice();
      e.V = [[1.4 * -e.FG[0], 1.4 * -e.FG[0]], [1.4 * e.FG[2], 1.4 * e.FG[2]]]; e.VGQ = [-e.FG[0], e.FG[2]];
      e.FGQ = e.FG.slice(); e.uG = e.dof.map(i => i < 0 ? 0 : UG[i]); e.uGQ = e.uG.slice();
    }
    // Hat düğüm tepkileri (yukarı pozitif, o hattın elemanlarından): R = −Σ F_düşey; kolon toplamı ve kolonsuz kesişimde X hattının aldığı
    // tepki (Y hattına aktarılan): G, pano başına Σ max(0, ·) ve Σ min(0, ·)
    const R = new Float64Array(nD), RG = new Float64Array(nD), RQp = new Float64Array(nD), RQn = new Float64Array(nD), RQt = new Float64Array(nD);
    const kolonG = new Float64Array(kolonAd.length), kolonQn = new Float64Array(kolonAd.length), kp = new Float64Array(kolonAd.length);
    const kesF = kesD.map(() => [0, 0, 0]);
    for (const e of elemanlar) { RG[e.gia] -= e.FG[0]; RG[e.gib] -= e.FG[2]; }
    for (const [gi, ci] of destekD) kolonG[ci] += RG[gi];
    kesD.forEach(([gi], i) => { kesF[i][0] = RG[gi]; });
    PN.forEach((p, pi) => {
      const U = UQ[pi]; R.fill(0); kp.fill(0);
      for (const e of elemanlar) {
        const I = e.IQ.get(p), F = uc(e, U, I?.f, F4), s = e.s, Mx = e.Mmax, Mn = e.Mmin, MGQ = e.MGQ, F0 = F[0], F1 = F[1];
        if (I) { const Q0 = I.Q0, Q1 = I.Q1; // panonun yükü bu elemanda (x − 0 = x: yüksüz elemanda aynı sonuç, ayrı döngü)
          for (let i = 0; i < s.length; i++) { const M = -s[i] * F0 + F1 - (s[i] * Q0[i] - Q1[i]), m = 1.6 * M; if (m > 0) Mx[i] += m; else Mn[i] += m; MGQ[i] += M; }
        } else for (let i = 0; i < s.length; i++) { const M = -s[i] * F0 + F1, m = 1.6 * M; if (m > 0) Mx[i] += m; else Mn[i] += m; MGQ[i] += M; }
        const v0 = -F[0], v1 = F[2];
        if (v0 > 0) e.V[0][0] += 1.6 * v0; else e.V[0][1] += 1.6 * v0; if (v1 > 0) e.V[1][0] += 1.6 * v1; else e.V[1][1] += 1.6 * v1;
        e.VGQ[0] += v0; e.VGQ[1] += v1;
        for (let r = 0; r < 4; r++) { e.FGQ[r] += F[r]; if (e.dof[r] >= 0) e.uGQ[r] += U[e.dof[r]]; }
        R[e.gia] -= F[0]; R[e.gib] -= F[2];
      }
      for (let gi = 0; gi < nD; gi++) { const v = R[gi]; if (v > 0) RQp[gi] += v; else RQn[gi] += v; RQt[gi] += v; }
      for (const [gi, ci] of destekD) kp[ci] += R[gi];
      for (let ci = 0; ci < kp.length; ci++) if (kp[ci] < 0) kolonQn[ci] += kp[ci];
      kesD.forEach(([gi], i) => { const v = R[gi]; if (v > 0) kesF[i][1] += v; else kesF[i][2] += v; });
    });
    return { el: elemanlar.map(e => ({ FG: e.FG, MG: e.MG, Mmax: e.Mmax, Mmin: e.Mmin, MGQ: e.MGQ, V: e.V, VGQ: e.VGQ, FGQ: e.FGQ, uG: e.uG, uGQ: e.uGQ })),
      RG, RQp, RQn, RQt, kolonG, kolonQn, kesF };
  };
  // Kirişin kesitten bağımsız bilgileri (dizideki sırası, açıklık ortası örneği, döşeme yükü izleri, toplam Q): çağrı başına bir kez
  for (const sg of kirisPar) {
    const kp = kirisPar.filter(x => x.par === sg.par && !x.konsol), sira = kp.indexOf(sg), iz = [];
    for (const e of sg.el) { const y = yukOn.get(`${e.hi}:${e.k}`); for (const z of y.z) if (!iz.includes(z)) iz.push(z); }
    const e0 = sg.el[0];
    Object.assign(sg, { kpN: kp.length, lpK: sg.konsol ? 1.5 : kp.length === 1 ? 1 : sira === 0 || sira === kp.length - 1 ? 0.8 : 0.6, izTaban: iz,
      WQ: sg.el.reduce((t, e) => t + [...e.IQ.values()].reduce((x, q) => x + q.W, 0), 0), oi: sg.orta.e.s.findIndex(x => Math.abs(x - sg.orta.s) < 1e-9),
      duzgun: sg.el.length === 1 && e0.ua < TOL && Math.abs(e0.ub - e0.Lb) < TOL && sg.uclar.every(x => x === 'kolon' || x === 'perde'),
      mafsal: sg.konsol ? 0 : sg.uclar.filter(x => x === 'kolon' || x === 'perde').length });
  }
  const kirislerKur = ({ RG, RQp, RQn, RQt, kolonG, kolonQn, kesF }) => {
    // Kirişler
    const kirisler = [], pay = new Map(); // düğüm sırası → alan payı [G, Q] (alt sınır, sürekli kiriş yoluyla aynı)
    for (const sg of kirisPar) {
      const { par, H, WQ, oi, duzgun, mafsal } = sg, b = par.b, h = par.h, yon = H.hat.yon;
      const WG = sg.el.reduce((t, e) => t + e.IG.W + par.w * e.L, 0);
      for (const [t, oran] of [[sg.t0, sg.konsol === 'sag' ? 1 : sg.konsol ? 0 : 0.5], [sg.t1, sg.konsol === 'sol' ? 1 : sg.konsol ? 0 : 0.5]]) {
        const k = H.dg[t].gi, x = pay.get(k) ?? [0, 0]; x[0] += oran * WG; x[1] += oran * WQ; pay.set(k, x); }
      const e0 = sg.el[0], e1 = sg.el.at(-1), uz = (e, i) => e.Mmin[i], ta = (e, i) => e.Mmax[i];
      const Mbas = [ta(e0, 0), uz(e0, 0)], Mson = [ta(e1, e1.s.length - 1), uz(e1, e1.s.length - 1)];
      let MdAcik = 0, MdMesnet = Math.max(0, -Mbas[1], -Mson[1]), Vd = -Infinity;
      for (const e of sg.el) for (let i = 0; i < e.s.length; i++) {
        MdMesnet = Math.max(MdMesnet, -e.Mmin[i]);
        if (i > 0 && i < e.s.length - 1 && e.Mmax[i] >= e.Mmax[i - 1] && e.Mmax[i] >= e.Mmax[i + 1]) MdAcik = Math.max(MdAcik, tepe(e.s, e.Mmax, i));
        else MdAcik = Math.max(MdAcik, e.Mmax[i]);
      }
      let MdOrtaUst = Math.max(0, -sg.orta.e.Mmin[oi]);
      for (const t of sg.ici) { const e = sg.el.find(x => x.b === t); MdOrtaUst = Math.max(MdOrtaUst, -e.Mmin.at(-1)); }
      for (const e of sg.el) for (const v of e.V) Vd = Math.max(Vd, Math.abs(v[0]), Math.abs(v[1]));
      const MGQ = (e, i) => e.MGQ[i], MG = (e, i) => e.MG[i], ns1 = e1.s.length - 1;
      const sG = { Mm: MG(sg.orta.e, oi), M1: MG(e0, 0), M2: MG(e1, ns1) }, sGQ = { Mm: MGQ(sg.orta.e, oi), M1: MGQ(e0, 0), M2: MGQ(e1, ns1) };
      const VL = e0.VGQ[0], VR = -e1.VGQ[1], dM = (sGQ.M2 - sGQ.M1) / sg.L;
      const Vdy = sg.konsol ? Math.abs(sg.konsol === 'sag' ? e0.VGQ[0] : e1.VGQ[1]) : Math.max(Math.abs(VL - dM), Math.abs(VR + dM));
      // Uçlar: kolon/perde ölçüsü; kirişe oturan uçta mesnet kirişinin yarı genişliği; serbest uçta 0
      const ucD = [sg.t0, sg.t1].map(t => H.dg[t]), uc = ucD.map(d => d.destek ? kolonOlcu(d.destek) : null);
      const ucPay = ucD.map((d, i) => { if (sg.uclar[i] !== 'kiris') return 0; const [D, td] = dikDugum(H, d); return (D.el.find(e => e.a === td || e.b === td)?.par.b ?? 250) / 2000; });
      const duvar = par.dv.w, gOrt = WG / sg.L, qOrt = WQ / sg.L, MdSolUst = Math.max(0, -Mbas[1]), MdSagUst = Math.max(0, -Mson[1]),
        MdSolAlt = Math.max(0, Mbas[0]), MdSagAlt = Math.max(0, Mson[0]);
      // Tasarım girdileri önceki adımdakiyle aynıysa (kesiti ve kuvvetleri değişmeyen kiriş) önceki sonuç kullanılır: sonuç aynı, süre kısalır
      const imzaK = [b, h, duvar, gOrt, qOrt, MdMesnet, MdSolUst, MdSagUst, MdSolAlt, MdSagAlt, Math.max(0, MdAcik), MdOrtaUst, Vd, Vdy, sG.Mm, sG.M1, sG.M2, sGQ.Mm, sGQ.M1, sGQ.M2,
        ...uc.flatMap(o => o ? [o.b, o.h] : [0, 0]), ...ucPay];
      if (!duzgun) for (const e of sg.el) imzaK.push(...e.FG, ...e.FGQ, ...e.uG, ...e.uGQ);
      if (sg.onceki && sg.onceki.imza.length === imzaK.length && sg.onceki.imza.every((x, i) => x === imzaK[i])) { if (!sg.onceki.e.gizli) kirisler.push(sg.onceki.e); continue; }
      const iz = [...sg.izTaban];
      iz.push(`${H.hat.dis ? 'Dış' : 'İç'} duvar ${par.dv.yazi} + kiriş gövdesi ${tr(par.govde)} kN/m`);
      for (const c of sg.yonl) { const e = Math.abs(c.dx || c.dy); iz.push(`Dik kiriş ${c.aks} kolonuna yönlendirildi (eksen kırıklığı e = ${tr(e)} m, açı ${tr(Math.atan(e / sg.L) * 180 / Math.PI, 1)}°; e ≤ L/10): kiriş kolona birleşir, hesapta aks boyu ${tr(sg.L)} m (eğik boy ${tr(Math.hypot(sg.L, e), 3)} m); kesin hesapta eğik kiriş geometrisiyle`); }
      const kr = { ad: sg.ad, aks: sg.aks, hat: H.hi, k: sg.k0, k1: sg.k1, L: sg.L, x0: sg.x0, x1: sg.x1, p0: sg.p0, p1: sg.p1, uclar: sg.uclar, konsol: sg.konsol, birlesik: sg.birlesik, par: par.no,
        b, h, duvar, gOrt, qOrt, MdMesnet, MdSolUst, MdSagUst, MdSolAlt, MdSagAlt, MdAcik: Math.max(0, MdAcik), MdOrtaUst, Vd, maddeler: [], iz };
      kirisTasarla(kr, { yon, uc, ucPay, mafsal, surekli: sg.kpN > 1 || par.uc.some(Boolean) || !!sg.konsol, lp: sg.lpK, Vdy, cikinti: sg.cikinti,
        sehim: duzgun ? (kes, lnH, o) => aciklikSehim({ l: sg.L * 1000, ln: lnH * 1000, kesitler: kes, G: sG, GQ: sGQ, ...o })
          : (kes, lnH, o) => izgaraSehim(sg, kes, lnH, o, { sG, sGQ, b, h, EI: par.EI }),
        izBas: izBaslik(sg, ag, durum) }, { g, mz, dos, tur, dis: H.hat.dis });
      sg.onceki = { imza: imzaK, e: kr };
      // Kaydırılan kolon yüzünden taşan küçük uç (ℓn ≤ 0; uç kolonun içinde kalıyor): kiriş sayılmaz, yükü kolona
      if (sg.konsol && kr.ln <= TOL) { kr.gizli = true; continue; }
      kirisler.push(kr);
    }
    return { kirisler, RG, RQp, RQn, RQt, pay, kolonG, kolonQn, kesF };
  };
  // Boyutlandırma: dizi başına sürekli kiriş yolundaki adımlar (önce h ≤ 2,5b, sonra b; elle boyut sabit), bütün diziler birlikte; her
  // adımda ızgara yeniden çözülür (kesit rijitliği ve öz ağırlık yük dağılımını değiştirir). Boyutlar yalnız büyür → sınırlı adımda biter.
  const boyutlanabilir = e => e.ln > TOL && !e.yuksekKiris;
  let r, cozulen = null;
  const imza = () => parlar.map(p => `${p.b}×${p.h}`).join();
  // Önbellek: aynı girdi (yük, perde, en küçük h, mesnet ölçüleri) daha önce boyutlandıysa diziler son kesitleriyle bir kez çözülür
  const key = `${gk}|ızgara|${[...perde].sort()}|${[...hEk]}|${hatlar.map(H => H.dg.map(d => d.destek ? olcuYaz(kolonOlcu(d.destek)) : '').join()).join(';')}`;
  const bilinen = boyOnb.get(key);
  if (bilinen) parlar.forEach((p, i) => Object.assign(p, bilinen[i], { mesaj: [...bilinen[i].mesaj] }));
  else for (let adim = 0; adim < 60; adim++) {
    r = coz(); cozulen = imza();
    let degisti = false;
    for (const par of parlar) {
      if (par.kilit) continue;
      const ks = r.kirisler.filter(e => e.par === par.no), { bS, hS } = par;
      if (!ks.length || (bS != null && hS != null)) { par.kilit = true; continue; }
      if (ks.every(e => e.gecti || !boyutlanabilir(e))) { par.enIyi = null; par.bos = 0; continue; }
      if (ks.every(e => !boyutlanabilir(e) || e.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Etriye'))) {
        const kul = Math.max(...ks.filter(boyutlanabilir).map(e => e.etrKul));
        if (!par.enIyi || kul < par.enIyi.kul - TOL) { par.enIyi = { kul, b: par.b, h: par.h }; par.bos = 0; }
        else if (++par.bos >= 3) {
          Object.assign(par, { b: par.enIyi.b, h: par.enIyi.h, kilit: true }); degisti = true;
          par.mesaj.push('Kesit büyütmek etriye gereksinimini azaltmıyor (V_e kapasite kesmesi kesitle artıyor): büyütme durduruldu; çok kollu etriye ya da daha yüksek beton sınıfı gerekir (TBDY 7.4.4, 7.4.5)');
          continue;
        }
      } else { par.enIyi = null; par.bos = 0; }
      if (adim === 59) { par.mesaj.push(`Kesit 60 adımda ${par.b}×${par.h} mm'ye büyütüldü (büyütme sınırı); sağlanamayan koşullar yukarıda`); continue; }
      if (hS != null ? par.b + 50 > hS : bS != null && par.h + 50 > 3.5 * bS) {
        par.mesaj.push(`Elle verilen ${hS != null ? `h = ${hS} mm ile b ≤ h` : `b = ${bS} mm ile h ≤ 3,5·b`} sınırına ulaşıldı: büyütme durdu; sağlanamayan koşullar yukarıda`);
        par.kilit = true; continue;
      }
      if (hS != null) par.b += 50; else if (bS != null) par.h += 50;
      else if (par.h + 50 <= 2.5 * par.b) par.h += 50; else par.b += 50; // ponytail: h ≤ 2,5b tercihi (TBDY sınırı 3,5b), sonra genişlik
      degisti = true;
    }
    if (!degisti) break;
  }
  if (!bilinen) boyOnb.set(key, parlar.map(p => ({ b: p.b, h: p.h, mesaj: [...p.mesaj] })));
  if (imza() !== cozulen) r = coz();
  const kirisler = r.kirisler;
  for (const e of kirisler) {
    const par = parlar[e.par], { bS, hS } = par;
    if (par.uc.some(Boolean)) e.iz.push(`Perdeye saplanan ${par.uc[0] && par.uc[1] ? 'iki' : par.uc[0] ? 'sol' : 'sağ'} uç ankastre alındı (perde düzlem içinde rijit; ızgarada perde düğümünde dönme tutulu)`);
    if (par.hMin > hBas && hS == null) e.iz.push(`Kolon narinliği için kiriş yüksekliği en az ${par.hMin} mm alındı (yanal ötelenmesi önlenmemiş çerçeve: kiriş rijitliği α'yı küçültür, k ve λ azalır; TS 500 7.6.2.2, Denk. 7.15–7.16)`);
    if (bS != null || hS != null) {
      e.ozel = { b: bS != null, h: hS != null };
      e.iz.push(`${par.H.hat.aks} aksı boyunca ${[bS != null && `b = ${bS}`, hS != null && `h = ${hS}`].filter(Boolean).join(', ')} mm elle verildi: araç bu boyutu büyütmedi, koşullar bu kesitle denetlendi`);
    }
    if (!e.gecti) for (const m of par.mesaj) e.iz.push(m);
  }
  // Kolonlara tepkiler (hat başına, aks kesişim sırasıyla; kaydırılan kolon kendi sırasında). G: alan payıyla alttan sınırlı, Q: pano
  // yerleşimlerinin en elverişsizi (Σ max(0, q)) ve alan payı (sürekli kiriş yoluyla aynı). tepkiHam: sınırsız G ve bütün panolar yüklü Q (denge).
  const tepki = new Map(), tepkiHam = new Map(), kalkma = [], kesisim = [];
  for (const H of hatlar) {
    const t = { G: Array(H.n + 1).fill(0), Q: Array(H.n + 1).fill(0) }, th = { G: Array(H.n + 1).fill(0), Q: Array(H.n + 1).fill(0) };
    H.dg.forEach(d => { if (!d.destek) return; const k = d.gi, u = H.hat.yon === 'x' ? d.destek.i : d.destek.j, p = r.pay.get(k) ?? [0, 0];
      t.G[u] += Math.max(r.RG[k], p[0]); t.Q[u] += Math.max(r.RQp[k], p[1]); th.G[u] += r.RG[k]; th.Q[u] += r.RQt[k]; });
    tepki.set(H.hi, t); tepkiHam.set(H.hi, th);
  }
  r.kolonG.forEach((G, ci) => { if (1.4 * G + 1.6 * r.kolonQn[ci] < -TOL) kalkma.push(ag.kolonlar.find(c => c.ad === kolonAd[ci]).aks); });
  // Kolona birleşen kirişler: kolonun her hattaki mesnet düğümünde biten ve başlayan kiriş; dışmerkez birleşimde kaçıklık (mm)
  const kolonKiris = new Map(), sgAd = new Map();
  for (const sg of kirisPar) { const k = `${sg.H.hi}|${sg.ad}`; if (!sgAd.has(k)) sgAd.set(k, sg); } // hat ve ad → kiriş parçası (ilk eşleşen)
  for (const c of ag.kolonlar) {
    const o = { x: [null, null], y: [null, null] };
    for (const H of [hatlar[c.j], hatlar[ag.ny + 1 + c.i]]) {
      const yon = H.hat.yon, t = H.dg.findIndex(d => d.destek === c); if (t < 0) continue;
      o[yon] = [kirisler.find(e => e.hat === H.hi && sgAd.get(`${H.hi}|${e.ad}`)?.t1 === t) ?? null,
        kirisler.find(e => e.hat === H.hi && sgAd.get(`${H.hi}|${e.ad}`)?.t0 === t) ?? null];
    }
    kolonKiris.set(c.ad, o);
  }
  // Kolonsuz kesişimler: aktarılan kuvvet zarfı (1,4G + 1,6Q), askı donatısı (TS 500 8.1.2 dolaylı mesnet, 8.1.6)
  for (const [i, [G, qp, qn]] of r.kesF.entries()) { const ad = kesD[i][1];
    const c = ag.kolonlar.find(x => x.ad === ad), Fd = Math.max(Math.abs(1.4 * G + 1.6 * qp), Math.abs(1.4 * G + 1.6 * qn));
    const ks = kirisler.filter(e => { const H = hatlar[e.hat]; return (H.hat.yon === 'x' ? H.hat.no === c.j : H.hat.no === c.i) && e.x0 - TOL <= (H.hat.yon === 'x' ? c.gx : c.gy) && e.x1 + TOL >= (H.hat.yon === 'x' ? c.gx : c.gy); });
    const As = Fd * 1000 / mz.fyd, t = durum.get(ad);
    kesisim.push({ aks: c.aks, ad, x: c.gx, y: c.gy, Fd, As, kirisler: ks.map(e => e.ad), kacik: !!t.kacik });
    for (const e of ks) {
      e.iz.push(`${c.aks} kesişiminde kolon yok${t.kacik ? ` (kolon ${t.yon.toUpperCase()} doğrultusunda ${tr(t.e)} m kaydı: e > L/10 = ${tr(t.L / 10)} m, dik kiriş kolona yönlendirilmedi)` : ' (kaldırıldı)'}: ` +
        `${ks.map(x => x.ad).join(' ile ')} birbirine oturur, yük rijitlikle paylaşılır; aktarılan F_d = ${tr(Fd, 1)} kN → askı donatısı A_s ≥ F_d/f_yd = ${tr(As, 0)} mm² (TS 500 8.1.2 dolaylı mesnet: kesme mesnet yüzünde; 8.1.6 askı donatısı)`);
      madde(e, 'Askı donatısı', `${c.aks}: ${tr(As, 0)} mm²`, `kolonsuz kesişimde F_d/f_yd (F_d = ${tr(Fd, 1)} kN), kirişe oturan kirişin yükünü üst yüze taşır`, true, 'TS 500 8.1.2, 8.1.6', null, true);
      sonla(e);
    }
  }
  return { kirisler, tepki, tepkiHam, kalkma, perdeYuk, kolonKiris, izgara: { kesisim, N, B } };
}
// Örneklerde yerel en büyük değerin çevresinde dört noktadan geçen kübik eğrinin tepesi (parça parça doğrusal yükte moment kübiktir:
// kırılma noktası arada değilse tam); kübik tepe aralık dışındaysa örnek değeri
function tepe(x, y, i) {
  const j = i + 2 < x.length && (i < 2 || y[i + 1] >= y[i - 1]) ? i - 1 : i - 2;
  if (j < 0 || j + 3 >= x.length) return y[i];
  const [x0, x1, x2, x3] = x.slice(j, j + 4), [y0, y1, y2, y3] = y.slice(j, j + 4);
  // Newton bölünmüş farkları → u = t − x0 cinsinden katsayılar; p'(u) = 3A₃u² + 2A₂u + A₁ = 0 kökleri
  const f01 = (y1 - y0) / (x1 - x0), f12 = (y2 - y1) / (x2 - x1), f23 = (y3 - y2) / (x3 - x2);
  const f012 = (f12 - f01) / (x2 - x0), f123 = (f23 - f12) / (x3 - x1), c3 = (f123 - f012) / (x3 - x0), d1 = x1 - x0, d2 = x2 - x0;
  const A3 = c3, A2 = f012 - c3 * (d1 + d2), A1 = f01 - f012 * d1 + c3 * d1 * d2, p = u => y0 + u * (A1 + u * (A2 + u * A3));
  const lo = x[i - 1] - x0, hi = x[i + 1] - x0, a = 3 * A3, bb = 2 * A2, D = bb * bb - 4 * a * A1;
  const kok = Math.abs(a) < 1e-14 ? (Math.abs(bb) > 1e-14 ? [-A1 / bb] : []) : D < 0 ? [] : [(-bb + Math.sqrt(D)) / (2 * a), (-bb - Math.sqrt(D)) / (2 * a)];
  return Math.max(y[i], ...kok.filter(u => u >= lo && u <= hi).map(p));
}
function izBaslik(sg, ag, durum) {
  const H = sg.H, ad = sg.birlesik.length > 1 ? `${sg.birlesik.join(' + ')} birleşik (açıklık ${tr(sg.L)} m)` : `açıklık ${tr(sg.L)} m`;
  const uc = sg.uclar.map(u => ({ kolon: 'kolon', perde: 'perde', kiris: 'kirişe oturan uç (dolaylı mesnet)', serbest: 'serbest uç' })[u]).join(' – ');
  return `Izgara kiriş sistemi (kolon düzeni değişti): ${ad}; uçlar ${uc}${sg.konsol ? '; konsol: mesnette yalnız üst çekme momenti, serbest uçta moment ve mafsal yok' : ''}. ` +
    '1,4G + 1,6Q; hareketli yük her döşeme panosu için ayrı çözülüp en elverişsiz biçimde toplandı (TS 500 6.3.3). Kesişen kirişlerde düşey yer değiştirme ortak, burulma ihmal';
}
// Düzgün olmayan kirişte (birleşik açıklık, konsol, kirişe oturan uç, kaydırılan kolonun böldüğü açıklık) sehim ızgara çözümünden:
// w'' = −M/EI kiriş boyunca tümlenir (kesişen kirişin çökmesi dahil, mutlak), brüt I'dan etkili I'ya oranla düzeltilir: açıklıkta
// I_ef = 0,5·I_ef,açıklık + 0,25·(I_ef,1 + I_ef,2), konsolda mesnet kesitininki (TS 500 13.2.2). Konsolda ℓn konsolun serbest boyu
// (TS 500 simge listesindeki "konsolda iki katı" yalnız yükleme deneyi açıklığı ℓt içindir; tek kat boy daha sıkı sınır verir).
function izgaraSehim(sg, kes, lnH, o, { sG, sGQ, b, h, EI }) {
  const Ig = b * h ** 3 / 12, dg = sg.H.dg;
  const w = (M, u) => { let mx = 0;
    for (const e of sg.el) {
      const m = M(e), s = e.s; let th = u(e)[1], ww = u(e)[0];
      const ws = [ww];
      for (let i = 1; i < s.length; i++) { const hs = s[i] - s[i - 1], th1 = th - (m[i - 1] + m[i]) / 2 * hs / EI; ww += (th + th1) / 2 * hs; th = th1; ws.push(ww); }
      const hata = ws.at(-1) - u(e)[2];
      ws.forEach((x, i) => { mx = Math.max(mx, Math.abs(x - hata * s[i] / e.L)); });
    }
    return mx * 1000; };
  const dGg = w(e => e.MG, e => e.uG), dGQg = w(e => e.MGQ, e => e.uGQ);
  const kok = sg.konsol === 'sol' ? kes.s2 : kes.s1;
  const Ief = M => sg.konsol ? ief(kok, sg.konsol === 'sol' ? M.M2 : M.M1) : 0.5 * ief(kes.m, M.Mm) + 0.25 * (ief(kes.s1, M.M1) + ief(kes.s2, M.M2));
  const dG = dGg * Ig / Ief(sG), dGQ = Math.max(dG, dGQg * Ig / Ief(sGQ));
  return { ...sehimSinir({ dG, dGQ, ln: lnH * 1000, rhoP: o.rhoP, duvar: o.duvar }), kaynak: sg.konsol ? ' (konsol: mesnet kesiti I_ef, 13.2.2)' : ' (ızgara çözümü, 13.2.2)',
    iz: `ızgara çözümünden w'' = −M/EI tümlendi (brüt ${tr(Ig / 1e9, 2)}·10⁹ mm⁴ → I_ef oranıyla)${sg.konsol ? `; konsolda ℓn = serbest boy ${tr(lnH)} m (TS 500 Çizelge 13.3, güvenli yan)` : ''}` };
}
