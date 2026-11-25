// Kiriş tasarımı: her aks çizgisi bir sürekli kiriş; kesit (b × h) hat boyunca aynı, koşullar sağlanana dek büyütülür.
// Birimler: açıklık m, kesit mm, kN, kN/m, kNm.
import { surekliKiris, desenler, zarf, ortaMomentler, kenarParcasi } from './mekanik.js';
import { egilmeAs, mMax, rhoMax, rhoMinKiris, kirisCubuk, etriyeSec, alan, CAP } from './donati.js';
import { kesit, aciklikSehim } from './sehim.js';
import { panoGeo, GAMMA_BA, seritler, oz } from './doseme.js';

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
const ETR = Math.max(...CAP.etriye); // sığmada etriye en büyük çapla (φ10; d2 = h − 75 de bunu varsayar)

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

// Hattın yükleri: G ve Q parçaları (açıklık başına). gAlan, qAlan: döşeme alan yükleri; govde: kiriş gövdesi kN/m.
function hatYukleri(ag, hat, g, tur, gAlan, qAlan, govde) {
  const G = [], Q = [], iz = [];
  hat.kirisler.forEach((_, k) => {
    const pG = [], pQ = [], z = [];
    const komsu = hat.yon === 'x' ? [[k, hat.no - 1, 'ust'], [k, hat.no, 'alt']] : [[hat.no - 1, k, 'sag'], [hat.no, k, 'sol']];
    for (const [i, j, kenar] of komsu) {
      const d = ag.dosemeler.find(x => x.i === i && x.j === j); if (!d) continue;
      const pg = dosemedenKenar(d, kenar, gAlan, tur, ag, 'G'), pq = dosemedenKenar(d, kenar, qAlan, tur, ag, 'Q');
      if (pg.w === 0) { z.push(`${d.ad}: yük vermez (tek doğrultuda taşır)`); continue; }
      pG.push(pg); pQ.push(pq);
      z.push(`${d.ad}: ${pg.a === 0 ? 'düzgün' : 2 * pg.a >= (hat.L[k]) - TOL ? 'üçgen' : 'yamuk'}, tepe g ${tr(pg.w)} + q ${tr(pq.w)} kN/m` +
        (pg.kat || pq.kat ? ` (sürekli şerit tepkisi: g ×${tr(pg.kat ?? 1)}, q ×${tr(pq.kat ?? 1)}; TS 500 11.2.2/11.3.2, 6.3.3)` : ''));
    }
    const duvar = hat.dis ? g.duvarDis : g.duvarIc;
    pG.push({ w: duvar + govde, a: 0 });
    z.push(`${hat.dis ? 'Dış' : 'İç'} duvar ${tr(duvar)} + kiriş gövdesi ${tr(govde)} kN/m`);
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
  const { G, Q, iz } = hatYukleri(ag, hat, g, tur, dos.gAlan, dos.qAlan, govde);
  const z = zarf(hat.L, G, Q), rG = surekliKiris(hat.L, G), rQ = surekliKiris(hat.L, Q);
  const sG = ortaMomentler(hat.L, G), sGQ = ortaMomentler(hat.L, G.map((p, k) => [...p, ...Q[k]]));
  const d = h - 50;
  const n = hat.L.length;
  const kirisler = hat.kirisler.map((kr, k) => {
    const uc = [k, k + 1].map(u => kolonOlcu(ag.kolonlar.find(c => hat.yon === 'x' ? c.i === u && c.j === hat.no : c.i === hat.no && c.j === u)));
    const boy = uc.map(o => (hat.yon === 'x' ? o.b : o.h) / 1000), dik = Math.min(...uc.map(o => hat.yon === 'x' ? o.h : o.b));
    // Kolonlar açıklıktan genişse ℓn ≤ 0 (sehim sınırı 0/0 = NaN ya da eksi): hesapta en az 0,1 m, ayrıca 'Net açıklık' sağlanmaz
    const ln = kr.L - (boy[0] + boy[1]) / 2, lnH = Math.max(ln, 0.1), e = { ad: kr.ad, aks: kr.aks, hat: hi, k, L: kr.L, ln, b, h, duvar: hat.dis ? g.duvarDis : g.duvarIc,
      gOrt: rG.acikliklar[k].W / kr.L, qOrt: rQ.acikliklar[k].W / kr.L, ...z[k], maddeler: [], iz: [...iz[k]] };
    // Boyuna donatı: mesnet üst, açıklık alt (TBDY 7.4.2: ρ ≥ 0,8fctd/fyd, mesnet altı ≥ 0,5·üst, en az 2φ12)
    // Tek sıra sığmazsa iki sıra (d = h − 75: örtü 25 + etriye 10 + φ + sıra arası/2)
    const sec = (M, ek = 0) => {
      const tek = kirisCubuk(Math.max(egilmeAs(M, b, d, mz), rhoMinKiris(mz) * b * d, ek), b, { caplar: CAP.kiris, etriye: ETR });
      if (tek.sigar) return { ...tek, d, gerek: Math.max(egilmeAs(M, b, d, mz), rhoMinKiris(mz) * b * d, ek) };
      const d2 = h - 75, gerek = Math.max(egilmeAs(M, b, d2, mz), rhoMinKiris(mz) * b * d2, ek);
      return { ...kirisCubuk(gerek, b, { caplar: CAP.kiris, sira: 2, etriye: ETR }), d: d2, gerek };
    };
    const ust = sec(e.MdMesnet), alt = sec(e.MdAcik, 0.5 * ust.As);
    const AsU = ust.gerek, AsA0 = alt.gerek;
    const surekliUst = kirisCubuk(Math.max(ust.As / 4, 0), b, { caplar: CAP.kiris, etriye: ETR });            // TBDY 7.4.3.1(a) ≥ 1/4, en az 2φ12
    // Kesme: TBDY 7.4.5.1 kapasite kesmesi Ve kirişin tüm boyunda enine donatıyı belirler; orta bölgede Vc = 0,8Vcr (7.4.5.3 →
    // TS 500 8.1.4), sarılma bölgesinde Vc = 0 (güvenli yan). TS 500 8.1 düşey yük kesmesi Vd de sağlanır.
    const Vcr = 0.65 * mz.fctd * b * d / 1000, Vc = 0.8 * Vcr, fywd = mz.fyd;
    const MpU = 1.4 * Mr(ust.As, b, ust.d, mz), MpA = 1.4 * Mr(alt.As, b, alt.d, mz);
    const Vdy = (sGQ[k] ? (rG.acikliklar[k].W + rQ.acikliklar[k].W) : 0) / 2;                     // G + Q basit kiriş kesmesi
    const Ve = Vdy + (MpU + MpA) / lnH;
    const awsMin = 0.3 * mz.fctd * b / fywd;
    const Vo = Math.max(e.Vd, Ve);                                                                  // orta bölge tasarım kesmesi
    const orta = etriyeSec(Math.max((Vo - Vc) * 1000 / (fywd * d), awsMin), Vo > 3 * Vcr ? d / 4 : d / 2); // TS 500 8.1.5 aralık sınırı
    const phiMin = Math.min(ust.phi, alt.phi);
    const sar = etriyeSec(Math.max(Ve * 1000 / (fywd * d), awsMin), Math.min(d / 4, 8 * phiMin, 150));
    Object.assign(e, { Ve, ust: cn(ust), alt: cn(alt), surekliUst: cn(surekliUst), etrSar: `φ${sar.phi}/${sar.s}`, etrOrta: `φ${orta.phi}/${orta.s}`,
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
    madde(e, 'Donatı sığma', `${cn(ust)} / ${cn(alt)}`, 'en çok iki sırada sığmalı (net aralık ≥ 25 mm, ≥ φ)', ust.sigar && alt.sigar, 'TS 500 9.5.2');
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
    const kes = { m: kesit({ bw: b, h, bf, hf: tSlab, As: alt.As, d: alt.d }, mz.fck, mz.fctd), s1: kesit({ bw: b, h, bf, hf: tSlab, As: ust.As, d: ust.d, cekme: 'ust' }, mz.fck, mz.fctd) };
    kes.s2 = kes.s1;
    const sh = aciklikSehim({ l: kr.L * 1000, ln: lnH * 1000, kesitler: kes, G: sG[k], GQ: sGQ[k], rhoP: Math.min(ust.As, alt.As) / (b * d) * 0, duvar: e.duvar > 0 || g.dosemeDuvar, fck: mz.fck });
    e.sehim = sh;
    madde(e, 'Sehim', sh.deger, `${sh.yazi.replace(/ ≤.*/, '')} ≤ ${tr(sh.sinir, 1)} mm`, sh.deger <= sh.sinir + TOL, 'TS 500 13.2, Çizelge 13.3', sh.deger / sh.sinir);
    e.iz.push(`${n} açıklıklı sürekli kiriş, rijit mesnet; 1,4G + 1,6Q, hareketli yük dama yüklemesi (TS 500 6.3.3)`,
      `M_d mesnet ${tr(e.MdMesnet, 1)} kNm → üst ${cn(ust)} (gerekli ${tr(AsU, 0)} mm²); açıklık ${tr(e.MdAcik, 1)} kNm → alt ${cn(alt)} (gerekli ${tr(Math.max(AsA0, 0.5 * ust.As), 0)} mm²)`,
      `Orta bölge: max(V_d ${tr(e.Vd, 1)}; V_e ${tr(Ve, 1)}) − V_c ${tr(Vc, 1)} = ${tr(Vo - Vc, 1)} kN (V_c = 0,8·V_cr, TBDY 7.4.5.3) → ${e.etrOrta}`,
      `V_e = V_dy + (M_pi + M_pj)/ℓn = ${tr(Vdy, 1)} + (${tr(MpU, 1)} + ${tr(MpA, 1)})/${tr(lnH)} = ${tr(Ve, 1)} kN (M_p ≈ 1,4·M_r) → sarılma bölgesi (2h = ${tr(2 * h)} mm) ${e.etrSar}`,
      `Sehim: tabla ${tr(bf, 0)} mm; δ_G ${tr(sh.dG)}, δ_G+Q ${tr(sh.dGQ)} → ${tr(sh.deger)} mm`);
    return sonla(e);
  });
  return { kirisler, G, Q, rG, rQ };
}

// Kirişleri boyutlandır: hat başına b = 250'den, h = en küçük yükseklikten başla; koşullar sağlanana dek önce h'yi
// (h ≤ 2,5b), sonra b'yi 50 mm büyüt. Dönüş: kirişler ve kolonlara gidecek tepkiler.
export function kirisBul(ag, g, mz, dos, kolonOlcu) {
  const tur = g.dosemeTuru, tSlab = dos.tabla ?? dos.h;
  const hBas = yukari(Math.max(300, 3 * tSlab, tur === 'disli' || tur === 'kaset' ? dos.h : 0), 50);
  const kirisler = [], tepki = new Map(), kalkma = [];
  ag.hatlar.forEach((hat, hi) => {
    let b = 250, h = hBas, r, enIyi = null, bos = 0;
    for (let adim = 0; adim < 60; adim++) {
      r = hatTasarla(ag, hat, hi, g, mz, dos, kolonOlcu, b, h);
      // ℓn ≤ 0 açıklık kiriş büyütmekle düzelmez (kolon boyutu): büyütmeyi o açıklık sürmez, 'Net açıklık' sağlanmaz kalır
      if (r.kirisler.every(e => e.gecti || e.ln <= TOL)) break;
      // Yalnız etriye yetmiyor ve büyütme gereksinimi azaltmıyorsa dur: V_e'nin kapasite terimi (TBDY Denk. 7.9) kesitle büyür,
      // iki kollu etriye kesit büyütmekle çözülmez (sınırsız büyüme); üç adımda iyileşmezse en iyi kesitte kalınır.
      if (r.kirisler.every(e => e.ln <= TOL || e.maddeler.every(m => m.gecti || m.uyari || m.ad === 'Etriye'))) {
        const kul = Math.max(...r.kirisler.filter(e => e.ln > TOL).map(e => e.etrKul));
        if (!enIyi || kul < enIyi.kul - TOL) { enIyi = { r, kul }; bos = 0; }
        else if (++bos >= 3) {
          r = enIyi.r;
          for (const e of r.kirisler) if (!e.gecti) e.iz.push('Kesit büyütmek etriye gereksinimini azaltmıyor (V_e kapasite kesmesi kesitle artıyor): büyütme durduruldu; çok kollu etriye ya da daha yüksek beton sınıfı gerekir (TBDY 7.4.4, 7.4.5)');
          break;
        }
      } else { enIyi = null; bos = 0; }
      if (adim === 59) for (const e of r.kirisler) if (!e.gecti) e.iz.push(`Kesit 60 adımda ${b}×${h} mm'ye büyütüldü (büyütme sınırı); sağlanamayan koşullar yukarıda`);
      if (h + 50 <= 2.5 * b) h += 50; else b += 50; // ponytail: h ≤ 2,5b tercihi (TBDY sınırı 3,5b), sonra genişlik
    }
    kirisler.push(...r.kirisler);
    // Kolona giden tepki: G alan payıyla alttan sınırlı; Q her mesnet için en elverişsiz desen (TS 500 6.3.3)
    const pay = rr => rr.R.map((_, u) => ((rr.acikliklar[u - 1]?.W ?? 0) + (rr.acikliklar[u]?.W ?? 0)) / 2);
    const RQ = pay(r.rQ);
    for (const d of desenler(hat.L.length))
      surekliKiris(hat.L, r.Q.map((p, k) => d[k] ? p : [])).R.forEach((x, u) => { RQ[u] = Math.max(RQ[u], x); });
    if (desenler(hat.L.length).some(d => surekliKiris(hat.L, r.G.map((p, k) => [...p.map(y => ({ w: 1.4 * y.w, a: y.a })),
      ...(d[k] ? r.Q[k].map(y => ({ w: 1.6 * y.w, a: y.a })) : [])])).R.some(x => x < -TOL))) kalkma.push(`${hat.aks} aksı`);
    tepki.set(hi, { G: r.rG.R.map((x, u) => Math.max(x, pay(r.rG)[u])), Q: RQ });
  });
  return { kirisler, tepki, kalkma };
}
