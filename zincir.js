// Döşeme → kiriş → kolon → radye ön tasarım zinciri: boyutları bulur, donatıyı seçer, sehimi ve zımbalamayı denetler.
// Düzenli dikdörtgen aks ağı; bütün katlar aynı plan ve aynı yükte; düşey yük (1,4G + 1,6Q). Deprem kuvvetleri kesin hesapta.
import { BETON, kontrol, kolonOner, beta, Q_MIN } from './kurallar.js';
import { parcaToplam, parcaAnkastre, parcaSiddet, kenarParcasi, surekliKiris, desenler, zarf, agKur } from './mekanik.js';
import { dosemeBul, ddmCerceveler, seritDonati, zimbalama, panoYuk, TUR_ADI, GAMMA_BA, oz, DIS_GEN_MIN } from './doseme.js';
import { kirisBul } from './kiris.js';
import { boyunaDonati, etriye, kirisMr } from './kolon.js';
import { CAP, alan, kolonYuzMax } from './donati.js';
import { radyeBul } from './radye.js';
import { kesit, aciklikSehim } from './sehim.js';
export { parcaToplam, parcaAnkastre, parcaSiddet, kenarParcasi, surekliKiris, desenler, zarf, agKur, GAMMA_BA };

export const CELIK = { B420C: 420, B500C: 500 };                          // TBDY 7.2.5.3(b)
const GAMMA_DOLGU = 20;   // radye üstündeki dolgu, kN/m³ (kabul; zemin etüdündeki değerle değiştirilebilir)
const K1 = { 25: .85, 30: .82, 35: .79, 40: .76, 45: .73, 50: .70 };      // TS 500 Çizelge 7.1
const TOL = 1e-9;
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);
const yukari = (x, adim) => Math.ceil(x / adim - TOL) * adim;
// Malzeme, MPa (TS 500 3.3.2, 6.2.5; TBDY 7.2.5.2 nitelik denetimi zorunlu → γmc = 1,5, γms = 1,15)
export const malzeme = (fck, fyk) => ({ fck, fyk, fcd: fck / 1.5, fctd: 0.35 * Math.sqrt(fck) / 1.5, fyd: fyk / 1.15, k1: K1[fck] });
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null, uyari = false) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari });
const sonla = e => {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
  return e;
};
export const TURLER = TUR_ADI;

export function girdiDenetle(g) {
  const h = {}, poz = x => Number.isFinite(x) && x > 0, sifir = x => Number.isFinite(x) && x >= 0;
  for (const k of ['ax', 'ay']) if (!(g[k].length >= 1 && g[k].length <= 12 && g[k].every(x => x >= 1 && x <= 15)))
    h[k] = `${k === 'ax' ? 'X' : 'Y'} aks aralıkları 1–12 adet, her biri 1–15 m olmalı`;
  if (!(Number.isInteger(g.katSayisi) && g.katSayisi >= 1 && g.katSayisi <= 40)) h.katSayisi = 'Kat sayısı 1–40 arası tam sayı olmalı';
  if (!(g.H >= 2000 && g.H <= 8000)) h.H = 'Kat yüksekliği 2.000–8.000 mm olmalı';
  const ad0 = { gKaplama: 'g', q: 'q', duvarDis: 'Dış duvar yükü', duvarIc: 'İç duvar yükü', sds: 'S_DS', Df: 'Temel derinliği' };
  for (const k of Object.keys(ad0)) if (!sifir(g[k])) h[k] = `${ad0[k]} ≥ 0 olmalı`;
  if (!(g.kDeprem >= 1)) h.kDeprem = 'Yatay deprem katsayısı ≥ 1 olmalı';
  if (!(g.dosemeTuru in TUR_ADI)) h.dosemeTuru = 'Döşeme türü seçilmeli';
  if (g.dosemeTuru === 'disli' || g.dosemeTuru === 'kaset') { // diş alanları yalnız bu türlerde görünür ve denetlenir
    if (!sifir(g.dolgu)) h.dolgu = 'Dolgu ağırlığı ≥ 0 olmalı';
    if (!(g.disAralik >= 200 && g.disAralik <= 700)) h.disAralik = 'Diş aralığı 200–700 mm olmalı (TS 500 11.3.1: ≤ 700)';
    const bwMin = DIS_GEN_MIN; // 2φ12 + φ8 etriye + 20 mm örtü (TS 500 9.5.1–9.5.2) = 105
    if (!(g.disGen >= bwMin && g.disGen <= 300)) h.disGen = `Diş genişliği ${bwMin}–300 mm olmalı (TS 500 11.3.2 ≥ 100; 2φ${CAP.kiris[0]} + φ8 etriye + 20 mm örtü sığması için ≥ ${bwMin}, TS 500 9.5.1–9.5.2)`;
  }
  if (!(g.tasma >= 0 && g.tasma <= 5)) h.tasma = 'Radye taşması 0–5 m olmalı';
  if (!poz(g.zemin)) h.zemin = 'Zemin taşıma gücü q_k > 0 kN/m² olmalı';
  else if (sifir(g.Df) && g.zemin / 1.4 - 1.4 * (GAMMA_BA * 0.3 + GAMMA_DOLGU * Math.max(0, g.Df - 0.3)) <= 0) h.Df = 'Temel derinliği zemin taşıma gücünü tüketiyor';
  if (!(g.beton in BETON)) h.beton = 'Beton C25 … C50 olmalı (TBDY 7.2.5.1)';
  if (!(g.celik in CELIK)) h.celik = 'Donatı B420C ya da B500C olmalı (TBDY 7.2.5.3)';
  return h;
}

// Kolon kesitini büyüt: kısa kenarı 50 mm artır; oran 1,5'i aşacaksa iki kenarı da artır.
const buyut = ({ b, h }) => {
  if (b <= h) { const nb = b + 50; return Math.max(nb, h) / Math.min(nb, h) <= 1.5 + TOL ? { b: nb, h } : { b: nb, h: h + 50 }; }
  const nh = h + 50; return Math.max(b, nh) / Math.min(b, nh) <= 1.5 + TOL ? { b, h: nh } : { b: b + 50, h: nh };
};

// Kirişsiz döşemede kolon yükü: alan payı × süreklilik katsayısı (birim yüklü sürekli şerit tepkisi / alan payı, ≥ 1).
function surekliKatsayi(L) {
  const r = surekliKiris(L, L.map(() => [{ w: 1, a: 0 }]));
  return r.R.map((R, u) => Math.max(1, R / (((L[u - 1] ?? 0) + (L[u] ?? 0)) / 2)));
}

export function zincirHesap(g) {
  const ag = agKur(g.ax, g.ay), mz = malzeme(BETON[g.beton], CELIK[g.celik]), n = g.katSayisi, fck = mz.fck;
  const notlar = [], tur = g.dosemeTuru, kirissiz = tur === 'kirissiz', bt = beta(g.kullanim, n);
  const W = ag.xs.at(-1), Lp = ag.ys.at(-1), plan = W * Lp;
  const hatBoy = h => h.L.reduce((a, b) => a + b, 0);
  const icDuvar = ag.hatlar.filter(h => !h.dis).reduce((a, h) => a + hatBoy(h) * g.duvarIc, 0);
  const gg = { ...g, duvarEsdeger: kirissiz ? icDuvar / plan : 0 };
  const ozel = g.kolonOzel ?? {};
  let olcu = new Map(ag.kolonlar.map(c => [c.ad, { b: ozel[c.ad]?.b ?? 300, h: ozel[c.ad]?.h ?? 300 }]));
  const olcuF = c => olcu.get(c.ad);
  let dos, kr = { kirisler: [], tepki: new Map(), kalkma: [] }, dosemeler, seritler = [], zimbD = [], kolonlar;
  const katKx = ag.hatlar.filter(h => h.yon === 'x').map(h => surekliKatsayi(h.L)), katKy = ag.hatlar.filter(h => h.yon === 'y').map(h => surekliKatsayi(h.L));
  // Kolon öz ağırlığı A_c ile artar (tüm katlar n·H·γ, kN/m²): birim alan payı sınırı aşıyorsa TBDY 7.3.1.2 (0,40·fck) ya da
  // TS 500 Denk. 7.7 (0,9·fcd = 0,6·fck) hiçbir kesitte sağlanmaz → büyütmek boşuna (sınırsız büyüme)
  const ozA = n * g.H / 1000 * GAMMA_BA, ozDm = g.kDeprem * (1 + 0.2 * g.sds) * ozA;
  const ozBosuna = ozDm >= 0.4 * fck * 1000 ? `N_dm: k·(1 + 0,2·S_DS)·n·H·γ = ${tr(ozDm, 0)} ≥ 0,40·fck = ${tr(0.4 * fck * 1000, 0)} kN/m² (TBDY 7.3.1.2)`
    : 1.4 * ozA >= 0.6 * fck * 1000 ? `N_d: 1,4·n·H·γ = ${tr(1.4 * ozA, 0)} ≥ 0,9·fcd = ${tr(0.6 * fck * 1000, 0)} kN/m² (TS 500 Denk. 7.7)` : null;
  if (ozBosuna) notlar.push(`Kolon öz ağırlığı tek başına kesit sınırını aşıyor (${ozBosuna}): kolon kesiti büyütülerek sağlanamaz; kat sayısı, kat yüksekliği ya da deprem katsayısı küçültülmeli veya beton sınıfı yükseltilmeli.`);
  const adimTop = new Map(); // kolon başına toplam büyütme adımı, bütün çağrılarda (iz'de doğru sayı: kirişlide 5 tur, kirişsizde 90 × 4 çağrı)

  // Kolon yükleri ve tasarımı (yükler: kat başına G, Q; tüm katlar n ile)
  // oneri = false: kolonOner atlanır; yükler her adımda o anki kesitle kurulur (turlar oturmadıysa son, dürüst denetim)
  const kolonTasarla = (yukF, kirisMrF, ln, oneri = true) => ag.kolonlar.map(c => {
    let { b, h } = olcu.get(c.ad);
    const sabit = ozel[c.ad] != null;
    let e;
    for (let adim = 0; adim < 30; adim++) {
      const { G1, Q1, iz } = yukF(c, b, h);
      const G = n * G1, Q = n * Q1 * bt, Ndm = (G + Q + 0.2 * g.sds * G) * g.kDeprem, Nd = 1.4 * G + 1.6 * Q;
      const kirissizL = kirissiz ? Math.max(...[g.ax[c.i - 1], g.ax[c.i], g.ay[c.j - 1], g.ay[c.j]].filter(Boolean)) * 1000 : null;
      if (!sabit && adim === 0 && oneri) {
        const o = kolonOner({ fck, Ndm, Nd, kirissizAciklik: kirissizL });
        if (o) { b = Math.max(b, o.b); h = Math.max(h, o.h); if (h / b > 1.5) h = Math.ceil(b * 1.5 / 50) * 50; }
      }
      const r = kontrol({ b, h, fck, Ndm, Nd, katYuksekligi: g.H, kirissizAciklik: kirissizL });
      const kirisX = kirisMrF(c, 'x'), kirisY = kirisMrF(c, 'y');
      // TBDY 7.3.5.1: her kolon–kiriş düğümünde. Alttan L. düğümde alttaki kolon k = n − L + 1, üstteki k − 1 katı taşır;
      // N = 0,9·G·k/n (7.3.5.2: Mr'yi en küçük yapan N_d; depremsiz ön tasarımda 0,9G, yorum). Çatı düğümü ve tek katlı bina
      // muaf (7.3.5.3(b)); alttaki kolonda N_d ≤ 0,10·A_c·f_ck ise üsttekinde de sağlanır → düğüm muaf (7.3.5.3(a)).
      const dugum = [];
      for (let k = 2; k <= n; k++) if (Nd * k / n * 1000 > 0.10 * b * h * fck) dugum.push([0.9 * G * k / n, 0.9 * G * (k - 1) / n, n - k + 1]);
      const muafX = !kirisX || !dugum.length, muafY = !kirisY || !dugum.length;
      const bd0 = boyunaDonati(b, h, Nd, mz, muafX ? null : { Mr: kirisX, dugum }, muafY ? null : { Mr: kirisY, dugum });
      const bd = bd0?.cubuk ? bd0 : null, sigmazEnAz = !!bd0?.sigmaz && bd0.enAz;
      let et = bd && etriye(b, h, bd.cubuk.phi, Nd, ln(c), mz, bd.nb, bd.nh);
      if (et?.nGerek) { // kollar yüzdeki çubuktan çok: aynı çaptan ara çubuk ekle (%4 ve TS 500 9.5.2 sığma içinde), olmazsa kesit büyür
        const phi = bd.cubuk.phi, A = alan(phi), n2 = et.nGerek;
        if (n2 * A <= 0.04 * b * h && et.nb <= kolonYuzMax(b, phi) && et.nh <= kolonYuzMax(h, phi))
          Object.assign(bd, { cubuk: { n: n2, phi, As: n2 * A }, rho: n2 * A / (b * h), nb: et.nb, nh: et.nh, araCubuk: n2 - bd.cubuk.n });
        else et = null;
      }
      e = { ad: c.ad, aks: c.aks, i: c.i, j: c.j, b, h, NG: G, NQ: Q, Ndm, Nd, Nk: G + Q, tur: r.tur, ozel: sabit,
        oneri: kolonOner({ fck, Ndm, Nd, kirissizAciklik: kirissizL }), maddeler: [...r.maddeler], iz: [...iz] };
      madde(e, 'Boyuna donatı', bd ? `${bd.cubuk.n}φ${bd.cubuk.phi} (%${tr(bd.rho * 100, 2)})` : bd0?.sigmaz ? 'sığmaz' : 'yetmez',
        '%1 ≤ ρ ≤ %4; e_min ve güçlü kolon sağlanmalı; yüzde net aralık ≥ max(1,5φ; 40 mm)', !!bd, 'TBDY 7.3.2, 7.3.5; TS 500 6.3.10, 9.5.2', bd ? bd.rho / 0.04 : 2);
      if (bd) {
        madde(e, 'En küçük dışmerkezlik', tr(Math.max(bd.MdX / bd.MrX, bd.MdY / bd.MrY) * 100, 0) + ' %', 'M_d = N_d·(15 + 0,03h) ≤ M_r', true, 'TS 500 6.3.10', Math.max(bd.MdX / bd.MrX, bd.MdY / bd.MrY));
        const gk = [kirisX && !muafX ? 1.2 * kirisX / bd.gX : 0, kirisY && !muafY ? 1.2 * kirisY / bd.gY : 0], dB = dugum[gk[0] >= gk[1] ? bd.gXi : bd.gYi];
        if (kirisX || kirisY) madde(e, 'Güçlü kolon', muafX && muafY ? (n === 1 ? 'gerekmez (tek katlı bina / çatı düğümü, TBDY 7.3.5.3(b))' : 'gerekmez (N_d ≤ 0,10·A_c·f_ck, TBDY 7.3.5.3(a))')
          : `alttan ${dB[2]}. düğüm ${gk[0] >= gk[1] ? 'X' : 'Y'}: N ${tr(dB[0], 0)} / ${tr(dB[1], 0)} kN`, '(M_ra + M_rü) ≥ 1,2·(M_ri + M_rj), her düğümde', true, 'TBDY 7.3.5, Denk. 7.3', Math.max(...gk) || null);
      }
      madde(e, 'Etriye', et ? `φ${et.phi}/${et.sSar} · φ${et.phi}/${et.sOrta}` : 'yetmez', 'sarılma s ≤ min(b/3; 150; 6φ), A_sh (Denk. 7.1)', !!et, 'TBDY 7.3.4');
      if (bd && et) Object.assign(e, { boyuna: `${bd.cubuk.n}φ${bd.cubuk.phi}`, rho: bd.rho, nb: bd.nb, nh: bd.nh, etrSar: `φ${et.phi}/${et.sSar}`, etrOrta: `φ${et.phi}/${et.sOrta}`,
        kol: `${et.kx}×${et.ky}`, sarBoy: et.sarBoy });
      sonla(e);
      e.iz.push(`${n} kat: G = ${tr(G, 0)} kN, βQ = ${tr(bt)}·${n}·${tr(Q1)} = ${tr(Q, 0)} kN (TS 498 Çizelge 8)`,
        `N_dm = (G + βQ + 0,2·S_DS·G)·k = ${tr(Ndm, 0)} kN; N_d = 1,4G + 1,6βQ = ${tr(Nd, 0)} kN`);
      if (bd) e.iz.push(`Boyuna: ${bd.cubuk.n}φ${bd.cubuk.phi} (yüz başına: b yüzünde ${bd.nb}, h yüzünde ${bd.nh}), ρ = %${tr(bd.rho * 100, 2)}; M_r (N_d altında) X ${tr(bd.MrX, 0)} / Y ${tr(bd.MrY, 0)} kNm ≥ N_d·e_min ${tr(bd.MdX, 0)} / ${tr(bd.MdY, 0)} kNm` +
        (bd.araCubuk ? `; etriye kollarının saracağı ${bd.araCubuk} ara çubuk eklendi (TBDY 7.3.4 → 7.2.8)` : ''));
      else if (sigmazEnAz) e.iz.push(`%1 en az donatı bile φ${CAP.kolon.join('/φ')} ile yüzlere (uzun yüze kaydırılarak) tek sırada sığmıyor (TS 500 9.5.2): ` +
        `çubuk sayısı alanla, yer çevreyle arttığından kesiti büyütmek bunu çözmez; daha büyük çap ya da demet donatı (TS 500 9.5.3) gerekir`);
      const dYaz = i => i >= 0 ? `alttan ${dugum[i][2]}. düğüm (N ${tr(dugum[i][0], 0)} / ${tr(dugum[i][1], 0)} kN)` : 'muaf';
      if (bd && (kirisX || kirisY)) e.iz.push(dugum.length ? `Güçlü kolon (TBDY 7.3.5, her düğümde; alttaki kolon k, üstteki k − 1 kat, N = 0,9G·k/n): en elverişsiz X ${dYaz(bd.gXi)}, Y ${dYaz(bd.gYi)}; ` +
        `kolon M_ra + M_rü X ${tr(bd.gX === Infinity ? 0 : bd.gX, 0)} / Y ${tr(bd.gY === Infinity ? 0 : bd.gY, 0)} kNm; kirişler 1,2·ΣM_r X ${tr(1.2 * (kirisX ?? 0), 0)} / Y ${tr(1.2 * (kirisY ?? 0), 0)} kNm`
        : `Güçlü kolon gerekmez: ${n === 1 ? 'tek katlı bina (TBDY 7.3.5.3(b))' : `her düğümde N_d ≤ 0,10·A_c·f_ck (TBDY 7.3.5.3(a)); çatı düğümü 7.3.5.3(b)`}`);
      if (et) e.iz.push(`Etriye: sarılma (uçlarda ${tr(et.sarBoy, 0)} mm) φ${et.phi}/${et.sSar}, kol ${et.kx}×${et.ky}; orta φ${et.phi}/${et.sOrta}${et.katsayi < 1 ? ' (N_d ≤ 0,2·A_c·f_ck: A_sh 2/3)' : ''}`);
      // %1 bile sığmıyorsa büyütmek sığmayı kötüleştirir (sınırsız büyüme): kesit/eksenel koşullar sağlandıysa dur, yoksa onlar için büyüt
      if (sabit || (e.gecti && bd && et) || (sigmazEnAz && r.maddeler.every(x => x.gecti))) break;
      if (ozBosuna) { e.iz.push(`Kolon öz ağırlığının birim alan payı taşıma sınırını aşıyor (${ozBosuna}): kesit büyüdükçe yük de aynı oranda büyüdüğünden ` +
        `kesit koşulu hiçbir boyutta sağlanamaz; büyütme durduruldu. Kat sayısı, kat yüksekliği ya da deprem katsayısı küçültülmeli veya beton sınıfı yükseltilmeli`); break; }
      if (adim === 29) { e.iz.push(`Kesit toplam ${adimTop.get(c.ad) ?? 0} büyütme adımında ${b}×${h} mm'ye ulaştı (büyütme sınırı: çağrı başına 29 adım); sağlanamayan koşullar yukarıda`); break; }
      adimTop.set(c.ad, (adimTop.get(c.ad) ?? 0) + 1); // yalnız uygulanan adımlar sayılır
      ({ b, h } = buyut({ b, h }));
    }
    return e;
  });

  if (!kirissiz) {
    // 1. Döşeme
    const d0 = dosemeBul(ag, gg, mz, 250);
    dosemeler = d0.panolar;
    dos = { h: d0.h, tabla: dosemeler[0].t, gAlan: dosemeler[0].gAlan, qAlan: dosemeler[0].qAlan };
    // 2–3. Kiriş ve kolon: kolon boyutu kiriş açıklığını ve güçlü kolonu, kiriş donatısı kolonu etkiler; birkaç turda oturur
    for (let tur_ = 0; tur_ < 5; tur_++) {
      kr = kirisBul(ag, gg, mz, dos, olcuF);
      const hatX = j => ag.hatlar.findIndex(t => t.yon === 'x' && t.no === j), hatY = i => ag.hatlar.findIndex(t => t.yon === 'y' && t.no === i);
      const kirisAt = (hi, k) => kr.kirisler.find(e => e.hat === hi && e.k === k);
      const kirisMrF = (c, yon) => {
        const hi = yon === 'x' ? hatX(c.j) : hatY(c.i), u = yon === 'x' ? c.i : c.j;
        const [sol, sag] = [kirisAt(hi, u - 1), kirisAt(hi, u)];
        const mr = (e, tip) => e ? kirisMr(tip === 'u' ? e.AsUst : e.AsAlt, e.b, e.h - 50, mz) : 0;
        const t = Math.max(mr(sol, 'u') + mr(sag, 'a'), mr(sol, 'a') + mr(sag, 'u'));
        return t > 0 ? t : null;
      };
      const yukF = (c, b, h) => {
        const tx = kr.tepki.get(hatX(c.j)), ty = kr.tepki.get(hatY(c.i));
        const oz = b / 1000 * h / 1000 * g.H / 1000 * GAMMA_BA;
        const G1 = tx.G[c.i] + ty.G[c.j] + oz, Q1 = tx.Q[c.i] + ty.Q[c.j];
        return { G1, Q1, iz: [`Kat başına G: X kirişlerinden ${tr(tx.G[c.i])} + Y kirişlerinden ${tr(ty.G[c.j])} + öz ağırlık ${tr(oz)} = ${tr(G1)} kN; Q: ${tr(Q1)} kN`] };
      };
      const hK = c => Math.max(...kr.kirisler.filter(e => { const h_ = ag.hatlar[e.hat]; return (h_.yon === 'x' && h_.no === c.j && (e.k === c.i || e.k === c.i - 1)) || (h_.yon === 'y' && h_.no === c.i && (e.k === c.j || e.k === c.j - 1)); }).map(e => e.h), 0);
      kolonlar = kolonTasarla(yukF, kirisMrF, c => g.H - hK(c));
      const yeni = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
      const ayni = [...yeni].every(([k, v]) => olcu.get(k).b === v.b && olcu.get(k).h === v.h);
      olcu = yeni;
      if (ayni) break;
      if (tur_ === 4) { // oturmadı: önerinin büyüttüğü kesit eski (küçük) öz ağırlıkla denetlenmiş olabilir; son kesitleri kendi yükleriyle yeniden denetle
        kolonlar = kolonTasarla(yukF, kirisMrF, c => g.H - hK(c), false);
        olcu = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
        notlar.push('Kiriş–kolon boyutları 5 turda oturmadı; kolonlar son kesitleriyle (öz ağırlık dahil) yeniden denetlendi, kirişler bir önceki kolon boyutlarıyla boyutlandı.');
      }
    }
  } else {
    // Kirişsiz: döşeme kalınlığı zımbalama ve sehimle bulunur; kolon boyutu döşeme yüküne bağlı
    const lnMax = Math.max(...g.ax, ...g.ay);
    let h = yukari(Math.max(200, lnMax * 1000 / 30), 10);   // TS 500 11.4.2 Denk. 11.2 (11.4.4 yöntemleri kullanıldığından)
    for (let adim = 0; adim < 90; adim++) {
      const yk = panoYuk(gg, h, h);
      const yukF = (c, b, hh) => {
        const ax = ((g.ax[c.i - 1] ?? 0) + (g.ax[c.i] ?? 0)) / 2, ay = ((g.ay[c.j - 1] ?? 0) + (g.ay[c.j] ?? 0)) / 2;
        const k = Math.max(katKx[c.j][c.i], katKy[c.i][c.j]), A = ax * ay;
        const disBoy = (c.j === 0 || c.j === ag.ny ? ax : 0) + (c.i === 0 || c.i === ag.nx ? ay : 0);
        const oz = b / 1000 * hh / 1000 * g.H / 1000 * GAMMA_BA;
        const G1 = A * yk.g * k + disBoy * g.duvarDis + oz, Q1 = A * yk.q * k;
        return { G1, Q1, iz: [`Kat başına: alan payı ${tr(A)} m² × süreklilik ${tr(k, 3)}; G = ${tr(A * yk.g * k)} + dış duvar ${tr(disBoy * g.duvarDis)} + öz ağırlık ${tr(oz)} = ${tr(G1)} kN; Q ${tr(Q1)} kN`] };
      };
      for (let tur_ = 0; tur_ < 4; tur_++) {
        kolonlar = kolonTasarla(yukF, () => null, () => g.H - h, tur_ < 3); // son tur: öneri yok, yükler o anki kesitle (eski öz ağırlıkla geçmesin)
        const yeni = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
        const ayni = [...yeni].every(([k_, v]) => olcu.get(k_).b === v.b && olcu.get(k_).h === v.h);
        olcu = yeni; if (ayni) break;
      }
      const sonuc = kirissizDoseme(ag, gg, h, mz, yk, olcuF, katKx, katKy);
      seritler = sonuc.seritler; zimbD = sonuc.zimb; dosemeler = sonuc.panolar;
      if ([...seritler, ...zimbD, ...dosemeler].every(e => e.gecti)) break;
      if (seritler.some(s => !s.sd.minKod)) { notlar.push(`h = ${h} mm: en az donatı (0,00175·h) φ${CAP.doseme.at(-1)} ile TS 500 9.5.2 aralığına sığmıyor; kalınlaştırmak çözmez, daha büyük çap gerekir.`); break; }
      // Yalnız zımbalama yetmiyorsa önce o kolonları büyüt (en çok 800 mm), sonra döşemeyi kalınlaştır (TS 500 11.4.2)
      const zKotu = zimbD.filter(z => !z.gecti), digerKotu = [...seritler, ...dosemeler].some(e => !e.gecti);
      const buyur = zKotu.filter(z => !ozel[z.kolon] && Math.max(olcu.get(z.kolon).b, olcu.get(z.kolon).h) < 800);
      if (!digerKotu && zKotu.length && buyur.length === zKotu.length) { for (const z of zKotu) olcu.set(z.kolon, buyut(olcu.get(z.kolon))); continue; }
      if (adim === 89) { notlar.push(`Kirişsiz döşeme h = ${h} mm'ye dek kalınlaştırıldı (90 adım sınırı); koşullar sağlanamadı.`); break; } // h şeritlerinki kalsın
      h += 10;
    }
    dos = { h, gAlan: dosemeler[0].gAlan, qAlan: dosemeler[0].qAlan };
    if (Math.min(ag.nx, ag.ny) < 3) notlar.push('TS 500 11.4.4.2 moment katsayıları en az 3 açıklık ister; bu planda yaklaşık kabul edildi, çerçeve yöntemiyle (11.4.4.1) kesin hesap yapılmalı.');
    notlar.push('Kirişsiz döşemeli sistemde deprem etkilerinin tamamı perdelerle karşılanmalıdır (TBDY 4.3.4.4); perde tasarımı bu aracın kapsamı dışında.');
  }

  // 4. Radye
  const rd = radyeBul(ag, g, mz, kolonlar.map(c => ({ ...ag.kolonlar.find(k => k.ad === c.ad), b: c.b, h: c.h, Nd: c.Nd })));

  // Notlar
  if (kr.kalkma.length) notlar.push(`${kr.kalkma.join(', ')}: kısa uç açıklığında sürekli kiriş ucu kalkıyor (negatif tepki); kolon yükü alan payıyla alındı.`);
  if ((tur === 'disli' || tur === 'kaset') && !(g.dolgu > 0)) notlar.push('Dolgu (asmolen) ağırlığı 0 girildi: TS 500 ve TS 498 değer vermiyor (TS ISO 9194); kullanılacak bloğun ağırlığını girin.');
  if (tur === 'disli') notlar.push('Perde içermeyen tek doğrultulu dişli döşemeli çerçeve yalnız DTS 3–4\'te kullanılabilir (TBDY 4.3.4.3).');
  notlar.push('Kiriş ve kolon detayları süneklik düzeyi yüksek kurallarıyla (DTS 1–2) seçildi; DTS 3–4 binada da güvenli yandadır.');
  notlar.push('Deprem kuvvetleri, kolon kesme kapasite tasarımı (TBDY 7.3.7), perde ve göreli kat ötelemesi kesin hesapta denetlenmeli.');
  const qMin = Q_MIN[g.kullanim];
  if (qMin != null && g.q < qMin) notlar.push(`q = ${tr(g.q)} kN/m², TS 498 Çizelge 7 değerinin (${tr(qMin)} kN/m²) altında.`);
  const duvarTop = ag.hatlar.reduce((a, h) => a + hatBoy(h) * (h.dis ? g.duvarDis : g.duvarIc), 0);
  const kirisAg = kr.kirisler.reduce((a, e) => a + e.L * e.b / 1000 * Math.max(0, e.h / 1000 * GAMMA_BA - oz(gg, dos.tabla ?? dos.h, dos.h)), 0); // kiris.js hatTasarla ile aynı
  const kolonAg = kolonlar.reduce((a, c) => a + c.b / 1000 * c.h / 1000 * g.H / 1000 * GAMMA_BA, 0);
  const katYuk = plan * (dos.gAlan - (kirissiz ? gg.duvarEsdeger : 0) + dos.qAlan) + duvarTop + kirisAg + kolonAg;
  return { ag, tur, katSayisi: n, beta: bt, h: dos.h, tabla: dos.tabla, katYukAlan: katYuk / plan,
    dosemeler, seritler, zimbD, kirisler: kr.kirisler, kolonlar, radye: rd.radye, radyeSerit: rd.seritler, radyeZimb: rd.zimb, notlar };
}

// Kirişsiz döşeme: şerit donatısı (TS 500 11.4.4.2), zımbalama (8.3.1, dengelenmemiş moment γ), pano sehimi.
function kirissizDoseme(ag, g, h, mz, yk, olcuF, katKx, katKy) {
  const wD = 1.4 * g.duvarDis;  // dış duvar (G, TS 498; 1,4 TS 500 6.2.6): kenar kirişi yok, döşeme kenarına oturur → zımbalama ve kenar şeridi
  const cer = ddmCerceveler(ag, yk.pd, h, mz, olcuF, { wKenar: wD });
  const seritler = cer.map(c => {
    const sd = seritDonati(c, h, mz);
    const e = { ad: `Ş${c.yon.toUpperCase()}${c.hatNo + 1}-${c.k + 1}`, aks: c.yon === 'x' ? `${String.fromCharCode(65 + c.hatNo)} / ${c.k + 1}–${c.k + 2}` : `${c.hatNo + 1} / ${String.fromCharCode(65 + c.k)}–${String.fromCharCode(66 + c.k)}`,
      yon: c.yon, l1: c.l1, l2: c.l2, Mo: c.Mo, cs: c.cs, ms: c.ms, c, sd, maddeler: [],
      csUst: `φ${sd.cCsN.phi}/${sd.cCsN.s}`, csAlt: `φ${sd.cCsP.phi}/${sd.cCsP.s}`, msUst: `φ${sd.cMsN.phi}/${sd.cMsN.s}`, msAlt: `φ${sd.cMsP.phi}/${sd.cMsP.s}` };
    madde(e, 'Eğilme', sd.yetmez ? 'yetmez' : 'yeter', 'kesit momenti karşılamalı', !sd.yetmez, 'TS 500 7.1', sd.kul);
    madde(e, 'Donatı aralığı', `${e.csUst} / ${e.csAlt} / ${e.msUst} / ${e.msAlt}`, 'net aralık ≥ max(φ; 4/3·Dmax; 25 mm), Dmax 22 mm', sd.kod, 'TS 500 9.5.2', sd.kod ? null : 2);
    madde(e, 'Pratik aralık', `${e.csUst} / ${e.csAlt}`, 'φ8/φ10 ile aralık ≥ 100 mm önerilir; değilse daha büyük çap', [sd.cCsN, sd.cCsP, sd.cMsN, sd.cMsP].every(x => x.yeter), 'uygulama', null, true);
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
  const zimb = ag.kolonlar.map(c => {
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
