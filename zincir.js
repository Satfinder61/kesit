// Döşeme → kiriş → kolon → radye ön tasarım zinciri: boyutları bulur, donatıyı seçer, sehimi ve zımbalamayı denetler.
// Düzenli dikdörtgen aks ağı; bütün katlar aynı plan ve aynı yükte; düşey yük (1,4G + 1,6Q). Deprem kuvvetleri kesin hesapta.
import { BETON, kontrol, kolonOner, beta, Q_MIN, KULLANIM, DUVAR, duvarYuku } from './kurallar.js';
import { parcaToplam, parcaAnkastre, parcaSiddet, kenarParcasi, surekliKiris, desenler, zarf, agKur } from './mekanik.js';
import { dosemeBul, kirissizDoseme, panoYuk, TUR_ADI, GAMMA_BA, oz, DIS_GEN_MIN, kolonPay } from './doseme.js';
import { kirisBul } from './kiris.js';
import { boyunaDonati, etriye, kirisMr, kolonVe, narinlik } from './kolon.js';
import { CAP, alan, kolonYuzMax } from './donati.js';
import { radyeBul } from './radye.js';
import { subasmanGirdi } from './subasman.js';
import { EC } from './sehim.js';
import { perdeOku, perdeDisari, perdeYaz, perdeAg, perdeBoyHatalari, perdeDugumOlcu, perdeKismiDenetle, perdeTasarla, duraylilik } from './perde.js';
import { katliHesap } from './katli.js';
import { kolonDuzenOku, kolonDuzenHatalari, kolonDuzenUygula, duzenSonuc } from './kolonduzen.js';
import { bicim } from './bicim.js';
export { parcaToplam, parcaAnkastre, parcaSiddet, kenarParcasi, surekliKiris, desenler, zarf, agKur, GAMMA_BA, perdeOku };

export const CELIK = { B420C: 420, B500C: 500 };                          // TBDY 7.2.5.3(b)
const GAMMA_DOLGU = 20;   // radye üstündeki dolgu, kN/m³ (kabul; zemin etüdündeki değerle değiştirilebilir)
const K1 = { 25: .85, 30: .82, 35: .79, 40: .76, 45: .73, 50: .70 };      // TS 500 Çizelge 7.1
const KIRIS_H_MAX = 1000; // narinlik rijitleştirmesinde kiriş yüksekliği üst sınırı, mm (ön boyut kabulü)
const TOL = 1e-9;
const tr = (x, d = 2) => bicim(x, d); // bicim.js: biçimleyici ve sonuç önbellekte
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
export const AKS_MIN = 1, AKS_MAX = 15; // m

export function girdiDenetle(g) {
  const h = {}, poz = x => Number.isFinite(x) && x > 0, sifir = x => Number.isFinite(x) && x >= 0;
  for (const k of ['ax', 'ay']) if (!(g[k].length >= 1 && g[k].length <= 12 && g[k].every(x => x >= AKS_MIN && x <= AKS_MAX)))
    h[k] = `${k === 'ax' ? 'X' : 'Y'} aks aralıkları 1–12 adet, her biri ${AKS_MIN}–${AKS_MAX} m olmalı`;
  if (!(Number.isInteger(g.katSayisi) && g.katSayisi >= 1 && g.katSayisi <= 40)) h.katSayisi = 'Kat sayısı 1–40 arası tam sayı olmalı';
  if (!(g.H >= 2000 && g.H <= 8000)) h.H = 'Kat yüksekliği 2.000–8.000 mm olmalı';
  if (g.katYukseklikleri != null) {
    if (!Array.isArray(g.katYukseklikleri) || g.katYukseklikleri.length !== g.katSayisi || !g.katYukseklikleri.every(v => Number.isFinite(v) && v >= 2000 && v <= 8000))
      h.katYukseklikleri = 'Her kat için tabandan başlayarak 2.000–8.000 mm arası bir yükseklik gir';
  }
  const ad0 = { gKaplama: 'g', q: 'q', duvarDis: 'Dış duvar yükü', duvarIc: 'İç duvar yükü', sds: 'S_DS', Df: 'Temel derinliği' };
  for (const k of Object.keys(ad0)) if (!sifir(g[k]) && !(g[k + 'Tur'] in DUVAR)) h[k] = `${ad0[k]} ≥ 0 olmalı`; // duvar türü seçiliyse elle değer kullanılmaz
  for (const k of ['duvarDisTur', 'duvarIcTur']) if (g[k] != null && g[k] !== 'elle' && !(g[k] in DUVAR)) h[k] = 'Duvar türü listeden seçilmeli';
  if (g.kullanim != null && !(g.kullanim in KULLANIM)) h.kullanim = 'Kullanım TS 498 Çizelge 7 listesinden seçilmeli';
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
  // Perdeler: aks/açıklık metni ("A/1–2; 3/A–B"); akslar plandaki aks sayısı içinde olmalı
  const pr = perdeOku(g.perdeler);
  if (pr.hata.length) h.perdeler = `Perdeler: ${pr.hata.join('; ')}`;
  else if (!h.ax && !h.ay && perdeDisari(pr.liste, g.ax.length, g.ay.length).length)
    h.perdeler = `Perdeler: ${perdeYaz(perdeDisari(pr.liste, g.ax.length, g.ay.length))} planda yok (X aksları 1–${g.ax.length + 1}, Y aksları A–${String.fromCharCode(65 + g.ay.length)})`;
  if (pr.liste.length && g.perdeKal != null && !(g.perdeKal >= 150 && g.perdeKal <= 1500)) h.perdeKal = 'Perde kalınlığı 150–1.500 mm olmalı (TS 500 12.2: ≥ 150; TBDY 7.6.1.2 en az 250 ayrıca denetlenir)';
  if (!h.ax && !h.ay && !h.perdeler) {
    const boyHatalari = perdeBoyHatalari(g, pr.liste, g.perdeBoyOzel);
    if (boyHatalari.length) h.perdeBoyOzel = `Perde uzunluğu: ${boyHatalari.join(' · ')}`;
  }
  if (!h.ax && !h.ay) Object.assign(h, subasmanGirdi(g, pr.liste).hata);
  // Tek kolon kaldırma/kaydırma (kolonduzen.js): sözdizimi, perde düğümü, tek doğrultu, komşu kolonlara uzaklık, kiriş dizisinde en az iki mesnet
  const kd = kolonDuzenOku(g.kolonDuzen);
  if (kd.hata.length) h.kolonDuzen = `Kolon düzeni: ${kd.hata.join('; ')}`;
  else if (Object.keys(kd.duzen).length && !h.ax && !h.ay && !h.perdeler && !h.perdeBoyOzel && g.dosemeTuru in TUR_ADI) {
    const pa = perdeAg(agKur(g.ax, g.ay), pr.liste, g.perdeBoyOzel), l = kolonDuzenHatalari(g, kd.duzen, { perdeDugum: new Set(pa.dugum.keys()), perdeBay: pa.bay });
    if (l.length) h.kolonDuzen = `Kolon düzeni: ${l.join('; ')}`;
  }
  // Elle verilen boyutlar (Excel hücreleri): yalnız aralık; yetip yetmediğini motor denetler (sağlanmayan madde)
  const ara = (v, a, b) => v == null || (Number.isFinite(v) && v >= a && v <= b), ozH = [];
  for (const [ad, o] of Object.entries(g.kolonOzel ?? {})) if (!ara(o?.b, 100, 10000) || !ara(o?.h, 100, 10000)) ozH.push(`${ad} kolonu b, h 100–10.000 mm`);
  const d = g.dosemeOzel ?? {};
  if (!ara(d.h, 60, 1500)) ozH.push('döşeme h 60–1.500 mm');
  if (!ara(d.t, 40, 300)) ozH.push('tabla t 40–300 mm');
  else if (d.t != null && d.h != null && !(d.t < d.h)) ozH.push('tabla t < döşeme h');
  for (const [a, o] of Object.entries(g.kirisOzel ?? {})) if (!ara(o?.b, 150, 3000) || !ara(o?.h, 200, 5000)) ozH.push(`${a} aksı kirişi b 150–3.000, h 200–5.000 mm`);
  for (const [a, v] of Object.entries(g.perdeOzel ?? {})) if (!(v != null && ara(v, 150, 1500))) ozH.push(`${a} perdesi b_w 150–1.500 mm`);
  if (!ara(g.radyeOzel?.h, 200, 3000)) ozH.push('radye h 200–3.000 mm');
  if (!ara(g.radyeOzel?.a, 0, 10)) ozH.push('radye taşması 0–10 m');
  if (ozH.length) h.ozel = `Elle verilen değer aralık dışında: ${ozH.join('; ')} olmalı`;
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
  if (g.katYukseklikleri != null) {
    const hata = girdiDenetle(g);
    if (Object.keys(hata).length) throw new RangeError(Object.values(hata).join('; '));
    return katliHesap(g, malzeme(BETON[g.beton], CELIK[g.celik]));
  }
  const ag = kolonDuzenUygula(agKur(g.ax, g.ay), kolonDuzenOku(g.kolonDuzen).duzen), mz = malzeme(BETON[g.beton], CELIK[g.celik]), n = g.katSayisi, fck = mz.fck;
  const notlar = [], tur = g.dosemeTuru, kirissiz = tur === 'kirissiz', bt = beta(g.kullanim, n);
  const W = ag.xs.at(-1), Lp = ag.ys.at(-1), plan = W * Lp;
  const hatBoy = h => h.L.reduce((a, b) => a + b, 0);
  const icBoy = ag.hatlar.filter(h => !h.dis).reduce((a, h) => a + hatBoy(h), 0);
  // Duvar çizgisel yükü (kN/m): türü seçildiyse kN/m² × net yükseklik; kirişlide kiriş tasarımında (H − kiriş h), kirişsizde H − döşeme h
  const duvarW = (dis, hNet) => duvarYuku(dis ? g.duvarDisTur : g.duvarIcTur, dis ? g.duvarDis : g.duvarIc, hNet);
  const gg = { ...g, duvarEsdeger: 0 };
  const kirissizDuvar = hs => { const d = duvarW(true, g.H - hs), i = duvarW(false, g.H - hs);
    Object.assign(gg, { duvarDisTur: 'elle', duvarIcTur: 'elle', duvarDis: d.w, duvarIc: i.w, duvarEsdeger: icBoy * i.w / plan, duvarYazi: [d.yazi, i.yazi] }); };
  const ozel = g.kolonOzel ?? {};
  // Tam açıklık perdesi aradaki kiriş ve kolonların yerini alır. Açıklık içinde kalan kısa perde mevcut mesnetleri değiştirmez.
  // Elle kalınlık: perdeOzel anahtarı perdenin yazımı ("A/1–2"); aks ağı ya da perde değişince eşleşmeyen anahtar yok sayılır
  const pd = perdeAg(ag, perdeOku(g.perdeler).liste, g.perdeBoyOzel), pElle = p => g.perdeOzel?.[perdeYaz([p])];
  const pkal = new Map(pd.perdeler.map(p => [p.ad, pElle(p) ?? g.perdeKal ?? 250]));
  const kolonListe = ag.kolonlar.filter(c => !pd.dugum.has(c.ad) && !c.sil); // kaldırılan kolon tasarlanmaz (bütün katlarda)
  const dugumOlcu = ad => perdeDugumOlcu(pd.perdeler, ad, p => pkal.get(p.ad));
  let olcu = new Map(kolonListe.map(c => [c.ad, { b: ozel[c.ad]?.b ?? 300, h: ozel[c.ad]?.h ?? 300 }]));
  const olcuF = c => olcu.get(c.ad) ?? dugumOlcu(c.ad);
  const ozKat = o => o.b / 1000 * o.h / 1000 * g.H / 1000 * GAMMA_BA, ozPerde = e => e.bw / 1000 * e.lw / 1000 * g.H / 1000 * GAMMA_BA; // kat başına öz ağırlık
  let perdeler = [], yanal = null;
  // Perde tasarımı: yukP(p) → kat başına G1, Q1 (öz ağırlık hariç); kalınlık turdan tura yalnız büyür (yakınsama)
  const perdeTasarlaHepsi = yukP => pd.perdeler.map(p => {
    const y = p.kismi ? { G1: 0, Q1: 0, iz: [] } : yukP(p), e = perdeTasarla({ p, bw: pkal.get(p.ad), bwGirdi: g.perdeKal ?? 250, n, H: g.H, G1: y.G1, Q1: y.Q1, bt, mz, sds: g.sds, kDeprem: g.kDeprem, iz: y.iz, sabit: pElle(p) != null });
    pkal.set(p.ad, e.bw); return e;
  });
  // Yanal ötelenme (TS 500 7.6.2.1), doğrultu başına: elle işaretliyse önlenmiş; o doğrultuda perde varsa Denk. 7.13 duraylılık
  // göstergesi φ ≤ 0,05 (perde.js duraylilik; Wkat: kat başına G + Q); perde yoksa kirişlide önlenmemiş, kirişsizde önlenmiş kabul
  // (TBDY 4.3.4.4: deprem etkileri perdelerle karşılanır; 'yanalTutulu: false' ile kapatılır).
  const yanalBul = Wkat => Object.fromEntries(['x', 'y'].map(yon => {
    const ps = perdeler.filter(e => !e.kismi && e.yon === yon && e.tur === 'perde'), D = yon.toUpperCase();
    if (g.yanalTutulu === true) return [yon, { tutulu: true, yazi: 'elle işaretlendi (plana çizilmeyen perdeler)' }];
    if (!ps.length) { const t = kirissiz && g.yanalTutulu !== false && !perdeler.some(p => p.kismi);
      return [yon, { tutulu: t, yazi: `${D} doğrultusunda perde yok${t ? ': kirişsiz sistemde perde zorunlu (TBDY 4.3.4.4), önlenmiş kabul edildi' : ''}` }]; }
    const d = duraylilik({ perdeler: ps, n, H: g.H, W: Wkat, Ec: EC[fck] }), t = d.phi <= 0.05 + TOL;
    return [yon, { tutulu: t, phi: d.phi, kat: d.kat, yazi: `${ps.map(e => e.ad).join(', ')}: φ = 1,5·ΣN·Δ/(V·ℓ) = ${tr(d.phi, 3)} ${t ? '≤' : '>'} 0,05 (${d.kat}. kat; TS 500 Denk. 7.13)` }];
  }));
  let dos, kr = { kirisler: [], tepki: new Map(), kalkma: [] }, dosemeler, seritler = [], zimbD = [], kolonlar;
  const katKx = ag.hatlar.filter(h => h.yon === 'x').map(h => surekliKatsayi(h.L)), katKy = ag.hatlar.filter(h => h.yon === 'y').map(h => surekliKatsayi(h.L));
  // Kolon öz ağırlığı A_c ile artar (tüm katlar n·H·γ, kN/m²): birim alan payı sınırı aşıyorsa TBDY 7.3.1.2 (0,40·fck) ya da
  // TS 500 Denk. 7.7 (0,9·fcd = 0,6·fck) hiçbir kesitte sağlanmaz → büyütmek boşuna (sınırsız büyüme)
  const ozA = n * g.H / 1000 * GAMMA_BA, ozDm = g.kDeprem * (1 + 0.2 * g.sds) * ozA;
  const ozBosuna = ozDm >= 0.4 * fck * 1000 ? `N_dm: k·(1 + 0,2·S_DS)·n·H·γ = ${tr(ozDm, 0)} ≥ 0,40·fck = ${tr(0.4 * fck * 1000, 0)} kN/m² (TBDY 7.3.1.2)`
    : 1.4 * ozA >= 0.6 * fck * 1000 ? `N_d: 1,4·n·H·γ = ${tr(1.4 * ozA, 0)} ≥ 0,9·fcd = ${tr(0.6 * fck * 1000, 0)} kN/m² (TS 500 Denk. 7.7)` : null;
  if (ozBosuna) notlar.push(`Kolon öz ağırlığı tek başına kesit sınırını aşıyor (${ozBosuna}): kolon kesiti büyütülerek sağlanamaz; kat sayısı, kat yüksekliği ya da deprem katsayısı küçültülmeli veya beton sınıfı yükseltilmeli.`);
  // TS 500 Denk. 7.27–7.28 kat toplamı ΣN_d/ΣN_k (doğrultu ve kat durumu başına): bir önceki kolon tasarımından; ilk turda yok
  let katNar = null;
  const katNarHesap = kl => { if (!kl.length) return; katNar = Object.fromEntries(['x', 'y'].map((yon, d) => [yon, kl[0].narinlik[d].katlar.map((_, j) => {
    const t = kl.reduce((a, c) => [a[0] + c.narinlik[d].katlar[j][0], a[1] + (c.narinlik[d].katlar[j][1] ?? 0)], [0, 0]); return t[1] > 0 ? t[0] / t[1] : 0; })])); };
  const NARIN = new Set(['Narinlik', 'Boyuna donatı', 'En küçük dışmerkezlik', 'Etriye', 'Kolon kesmesi']); // narinliğe bağlı sağlanamayanlar
  const adimTop = new Map(); // kolon başına toplam büyütme adımı, bütün çağrılarda (iz'de doğru sayı: kirişlide 5 tur, kirişsizde 90 × 4 çağrı)

  // TBDY 7.5: kiriş–kolon birleşimi (tipik kat), iki doğrultu. Kuşatılmış: dört yanda kiriş ve her kirişin genişliği birleştiği
  // kolon yüzünün ≥ 3/4'ü (7.5.1(a)). V_e = 1,25·fyk·(A_s1 + A_s2) − V_kol (Denk. 7.11); V_kol (Bölüm 4 deprem çözümlemesinde alt/üst
  // kolon kesmesinin küçüğü) burada yok → 0 (güvenli yan). Kiriş ve kolon eksenleri çakışık: b_j = min(kolon genişliği; b_w + h)
  // (TBDY 7.0 b_j tanımı, Şekil 7.10); h: kolonun deprem doğrultusundaki boyutu. Sınır 1,7 / 1,0·b_j·h·√fck (Denk. 7.12–7.13).
  // Kaydırılan kolonda dik kiriş kolona yönlendirilir (kolonduzen.js): eksenler kolonda kesişir, b_j azaltılmaz.
  const birlesim = (kirisAt, c, b, h) => {
    const k = { x: kirisAt(c, 'x'), y: kirisAt(c, 'y') };
    const kus = [...k.x, ...k.y].every(Boolean) && k.x.every(e => e.b >= 0.75 * h - TOL) && k.y.every(e => e.b >= 0.75 * b - TOL);
    const yonlar = ['x', 'y'].filter(y => k[y].some(Boolean)).map(yon => {
      const [s, d] = k[yon], ab = [s?.AsUst ?? 0, d?.AsAlt ?? 0], ba = [s?.AsAlt ?? 0, d?.AsUst ?? 0];
      const [As1, As2] = ab[0] + ab[1] >= ba[0] + ba[1] ? (ab[0] >= ab[1] ? ab : [ab[1], ab[0]]) : (ba[1] >= ba[0] ? [ba[1], ba[0]] : ba);
      const hj = yon === 'x' ? b : h, bj = Math.min(yon === 'x' ? h : b, Math.min(...[s, d].filter(Boolean).map(e => e.b)) + hj);
      return { yon, As1, As2, bj, hj, Ve: 1.25 * mz.fyk * (As1 + As2) / 1000, Vmax: (kus ? 1.7 : 1) * bj * hj * Math.sqrt(fck) / 1000 };
    });
    return { kus, yonlar };
  };

  // Kolon yükleri ve tasarımı (yükler: kat başına G, Q; tüm katlar n ile)
  // oneri = false: kolonOner atlanır; yükler her adımda o anki kesitle kurulur (turlar oturmadıysa son, dürüst denetim)
  // cevre: { kirisAt(c, yon) → [sol, sağ] kiriş (kirişsizde yok: kesme kapasitesi ve birleşim aranmaz), rijit(c, yon) → Σ(0,5·I/ℓ)
  // kiriş ya da kolon şeridi (mm³, TS 500 7.6.2.2), tutulu: yanal ötelenme önlenmiş (perdeli; TS 500 7.6.2.1) }
  // tutulu: { x, y } doğrultu başına (ya da tek değer), yazi: { x, y } gerekçe
  const kolonTasarla = (yukF, kirisMrF, ln, oneri = true, cevre = {}) => kolonListe.map(c => {
    let { b, h } = olcu.get(c.ad);
    const sabit = ozel[c.ad] != null;
    let e, narEn = null, narBos = 0; // narinlik: en iyi adım ve iyileşmeyen adım sayısı
    for (let adim = 0; adim < 30; adim++) {
      const { G1, Q1, iz } = yukF(c, b, h);
      const G = n * G1, Q = n * Q1 * bt, Ndm = (G + Q + 0.2 * g.sds * G) * g.kDeprem, Nd = 1.4 * G + 1.6 * Q;
      const kirissizL = kirissiz ? Math.max(...kolonPay(ag, c).acik.filter(Boolean)) * 1000 : null;
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
      const muafX = !kirisX || !dugum.length, muafY = !kirisY || !dugum.length, lnC = ln(c);
      const tut = yon => !!(typeof cevre.tutulu === 'object' ? cevre.tutulu[yon] : cevre.tutulu), tutulu = tut('x') && tut('y');
      const yanalYazi = tut('x') === tut('y') ? (tutulu ? 'önlenmiş' : 'önlenmemiş') : `X ${tut('x') ? 'önlenmiş' : 'önlenmemiş'}, Y ${tut('y') ? 'önlenmiş' : 'önlenmemiş'}`;
      // Narinlik (TS 500 7.6): X doğrultusunda eğilmede genişlik h, derinlik b; β e_min momentini büyütür (Denk. 7.26)
      const nar = ['x', 'y'].map(yon => narinlik({ bw: yon === 'x' ? h : b, hd: yon === 'x' ? b : h, ln: lnC, H: g.H, n,
        kirisR: cevre.rijit?.(c, yon) ?? 0, Nd, Ngd: 1.4 * G, fck, tutulu: tut(yon), kat: katNar?.[yon] }));
      const bd0 = boyunaDonati(b, h, Nd, mz, muafX ? null : { Mr: kirisX, dugum }, muafY ? null : { Mr: kirisY, dugum }, nar[0].beta ?? Infinity, nar[1].beta ?? Infinity); // null: burkulma → donatı yetmez
      const bd = bd0?.cubuk ? bd0 : null, sigmazEnAz = !!bd0?.sigmaz && bd0.enAz;
      // Kapasite kesmesi (TBDY 7.3.7), yalnız kirişli çerçevede; yüzdeki çubuklarla (ara çubuk eklenince yeniden)
      const kesme = () => bd && cevre.kirisAt ? ['x', 'y'].map(yon => kolonVe(yon === 'x' ? h : b, yon === 'x' ? b : h,
        (yon === 'x' ? bd.nh : bd.nb) * alan(bd.cubuk.phi), Nd, n, lnC, 1.4 * ((yon === 'x' ? kirisX : kirisY) ?? 0), mz)) : null;
      let ve = kesme();
      const etr = () => etriye(b, h, bd.cubuk.phi, Nd, lnC, mz, bd.nb, bd.nh, ve && { VeX: ve[0].Ve, VeY: ve[1].Ve, Nmin: Nd / n });
      let et = bd && etr();
      for (let t = 0; t < 3 && et?.nGerek; t++) { // kollar yüzdeki çubuktan çok: aynı çaptan ara çubuk ekle (%4 ve TS 500 9.5.2 sığma içinde), olmazsa kesit büyür
        const phi = bd.cubuk.phi, A = alan(phi), n2 = et.nGerek;
        if (!(n2 * A <= 0.04 * b * h && et.nb <= kolonYuzMax(b, phi) && et.nh <= kolonYuzMax(h, phi))) { et = null; break; }
        Object.assign(bd, { cubuk: { n: n2, phi, As: n2 * A }, rho: n2 * A / (b * h), nb: et.nb, nh: et.nh, araCubuk: n2 - bd.cubuk.n + (bd.araCubuk ?? 0) });
        ve = kesme(); et = etr(); // ara çubuk M_r'yi, dolayısıyla V_e'yi artırır; etriye yeni çubuklarla yeniden seçilir
      }
      if (et?.nGerek) et = null;
      const brl = bd && cevre.kirisAt ? birlesim(cevre.kirisAt, c, b, h) : null;
      e = { ad: c.ad, aks: c.aks, i: c.i, j: c.j, b, h, NG: G, NQ: Q, Q1Ham: Q1, Ndm, Nd, Nk: G + Q, tur: r.tur, ozel: sabit,
        oneri: kolonOner({ fck, Ndm, Nd, kirissizAciklik: kirissizL }), maddeler: [...r.maddeler], iz: [...iz] };
      madde(e, 'Boyuna donatı', bd ? `${bd.cubuk.n}φ${bd.cubuk.phi} (%${tr(bd.rho * 100, 2)})` : bd0?.sigmaz ? 'sığmaz' : 'yetmez',
        '%1 ≤ ρ ≤ %4; e_min ve güçlü kolon sağlanmalı; yüzde net aralık ≥ max(1,5φ; 40 mm)', !!bd, 'TBDY 7.3.2, 7.3.5; TS 500 6.3.10, 9.5.2', bd ? bd.rho / 0.04 : 1.01); // donatı yoksa asıl neden (ör. kısa kenar) belirleyici kalsın
      const narOk = nar.map(x => x.lamMax <= 100 + TOL && x.durMax <= 1 + TOL && Number.isFinite(x.beta));
      const bY = x => Number.isFinite(x) ? tr(x) : 'burkulma'; // 1,3·N_d ≥ N_k
      madde(e, 'Narinlik', `λ X ${tr(nar[0].lamMax, 0)} / Y ${tr(nar[1].lamMax, 0)}; β X ${bY(nar[0].beta)} / Y ${bY(nar[1].beta)}`,
        `λ = ℓk/i ≤ 100${tutulu ? '' : '; kat ΣN_d ≤ 0,45·ΣN_k (ötelenen doğrultuda)'}; λ ≤ 22 ise β = 1 (yanal ötelenme ${yanalYazi})`, narOk.every(Boolean),
        'TS 500 7.6.1, 7.6.2.2–7.6.2.5', Math.max(...nar.map(x => Math.max(x.lamMax / 100, x.durMax, Number.isFinite(x.beta) ? 0 : 2))));
      if (bd) {
        madde(e, 'En küçük dışmerkezlik', tr(Math.max(bd.MdX / bd.MrX, bd.MdY / bd.MrY) * 100, 0) + ' %', 'M_d = β·N_d·(15 + 0,03h) ≤ M_r', true, 'TS 500 6.3.10, 7.6.2.5', Math.max(bd.MdX / bd.MrX, bd.MdY / bd.MrY));
        const gk = [kirisX && !muafX ? 1.2 * kirisX / bd.gX : 0, kirisY && !muafY ? 1.2 * kirisY / bd.gY : 0], dB = dugum[gk[0] >= gk[1] ? bd.gXi : bd.gYi];
        if (kirisX || kirisY) madde(e, 'Güçlü kolon', muafX && muafY ? (n === 1 ? 'gerekmez (tek katlı bina / çatı düğümü, TBDY 7.3.5.3(b))' : 'gerekmez (N_d ≤ 0,10·A_c·f_ck, TBDY 7.3.5.3(a))')
          : `alttan ${dB[2]}. düğüm ${gk[0] >= gk[1] ? 'X' : 'Y'}: N ${tr(dB[0], 0)} / ${tr(dB[1], 0)} kN`, '(M_ra + M_rü) ≥ 1,2·(M_ri + M_rj), her düğümde', true, 'TBDY 7.3.5, Denk. 7.3', Math.max(...gk) || null);
      }
      madde(e, 'Etriye', et ? `φ${et.phi}/${et.sSar} · φ${et.phi}/${et.sOrta}` : 'yetmez', `sarılma s ≤ min(b/3; 150; 6φ), A_sh (Denk. 7.1)${ve ? '; V_e için sıklaştırılır, s ≥ 50' : ''}`, !!et, 'TBDY 7.3.4');
      if (ve) {
        const VeM = Math.max(ve[0].Ve, ve[1].Ve), VeS = 0.85 * b * h * Math.sqrt(fck) / 1000; // A_w = b·h (dikdörtgen, çıkıntısız)
        madde(e, 'Kesme üst sınırı', VeM, `V_e ≤ 0,85·A_w·√fck = ${tr(VeS, 0)} kN`, VeM <= VeS + TOL, 'TBDY 7.3.7.5, Denk. 7.7', VeM / VeS);
        if (et) {
          const sec = [['X', 'sarılma bölgesi', ve[0].Ve, et.VrSarX], ['Y', 'sarılma bölgesi', ve[1].Ve, et.VrSarY], ['X', 'orta bölge', ve[0].Ve, et.VrOrtaX], ['Y', 'orta bölge', ve[1].Ve, et.VrOrtaY]];
          const [yn, bl, V, Vr] = sec.reduce((a, x) => x[2] / x[3] > a[2] / a[3] ? x : a);
          madde(e, 'Kolon kesmesi', V, `V_e ≤ V_r = V_c + V_w = ${tr(Vr, 0)} kN (${yn}, ${bl})`, sec.every(x => x[2] <= x[3] + TOL), 'TBDY 7.3.7.1–7.3.7.6, Denk. 7.5, 7.7; TS 500 8.1.3–8.1.4', V / Vr);
        }
      }
      if (brl?.yonlar.length) {
        const y = brl.yonlar.reduce((a, x) => x.Ve / x.Vmax > a.Ve / a.Vmax ? x : a);
        madde(e, 'Birleşim kesmesi', y.Ve, `≤ ${brl.kus ? '1,7' : '1,0'}·b_j·h·√fck = ${tr(y.Vmax, 0)} kN (${brl.kus ? 'kuşatılmış' : 'kuşatılmamış'}, ${y.yon.toUpperCase()})`,
          brl.yonlar.every(x => x.Ve <= x.Vmax + TOL), 'TBDY 7.5.1–7.5.2, Denk. 7.11–7.13', y.Ve / y.Vmax);
        if (et) { // TBDY 7.5.2.3: birleşimde alttaki kolonun sarılma etriyesinin ≥ %40 (kuşatılmış) / %60'ı; φ ≥ 8, s ≤ 150 / 100
          const [oran, sLim] = brl.kus ? [0.4, 150] : [0.6, 100];
          e.etrBirlesim = `φ${et.phi}/${Math.floor(Math.min(sLim, et.sSar / oran) / 10) * 10}`;
          madde(e, 'Birleşim etriyesi', e.etrBirlesim, `sarılma etriyesinin ≥ %${oran * 100}'ı, aynı kollarla; φ ≥ 8, s ≤ ${sLim} mm`, true, `TBDY 7.5.2.3(${brl.kus ? 'a' : 'b'})`);
        }
      }
      // Çift etriye: bir doğrultuda ≥ 4 kol gerekiyorsa çirozlar yerine iç içe iki kapalı etriye (özel deprem etriyesi, TBDY 7.2.8);
      // iki etriye her doğrultuda en çok 4 kol verir, tek sayılı ya da 4'ü aşan kollar çirozla (TBDY 7.3.4.1(a): a ≤ 25φ)
      const cift = et && Math.max(et.kx, et.ky) >= 4;
      if (bd && et) Object.assign(e, { boyuna: `${bd.cubuk.n}φ${bd.cubuk.phi}`, rho: bd.rho, nb: bd.nb, nh: bd.nh, etrSar: `φ${et.phi}/${et.sSar}`, etrOrta: `φ${et.phi}/${et.sOrta}`,
        // Majör eğilme ekseni kısa yüze, minör uzun yüze paralel; her iki değer bir yüzdeki çubukları içerir.
        boyunaMajor: `${b <= h ? bd.nb : bd.nh}φ${bd.cubuk.phi}/yüz${b === h ? ' (b, kare)' : ' (kısa yüz)'}`,
        boyunaMinor: `${b <= h ? bd.nh : bd.nb}φ${bd.cubuk.phi}/yüz${b === h ? ' (h, kare)' : ' (uzun yüz)'}`,
        kol: `${et.kx}×${et.ky}${cift ? ` (çift etriye${et.kx > 4 || et.ky > 4 || et.kx % 2 || et.ky % 2 ? ' + çiroz' : ''})` : ''}`, kx: et.kx, ky: et.ky, ciftEtriye: cift, sarBoy: et.sarBoy });
      if (ve) Object.assign(e, { VeX: ve[0].Ve, VeY: ve[1].Ve });
      e.narinlik = nar; e.sigmazEnAz = sigmazEnAz;
      sonla(e);
      e.iz.push(`${n} kat: G = ${tr(G, 0)} kN, βQ = ${tr(bt)}·${n}·${tr(Q1)} = ${tr(Q, 0)} kN (TS 498 Çizelge 8)`,
        `N_dm = (G + βQ + 0,2·S_DS·G)·k = ${tr(Ndm, 0)} kN; N_d = 1,4G + 1,6βQ = ${tr(Nd, 0)} kN`);
      const bT = v => v == null ? 'sınırsız (1,3·N_d ≥ N_k, burkulma)' : tr(v);
      for (const [k, x] of nar.entries()) e.iz.push(`Narinlik ${k ? 'Y' : 'X'} (TS 500 7.6.2, yanal ötelenme ${x.tutulu ? 'önlenmiş' : 'önlenmemiş'}${cevre.yazi?.[k ? 'y' : 'x'] ? ` — ${cevre.yazi[k ? 'y' : 'x']}` : ''}): α = 2·(I/ℓ)_kolon / Σ(0,5·I/ℓ)_${cevre.kirisAt ? 'kiriş' : 'kolon şeridi'} = ${tr(x.a)}; ` +
        `belirleyici ${x.kat} (α₁ ${tr(x.a1)}, α₂ ${tr(x.a2)}): k = ${tr(x.k, 3)}, ℓk = ${tr(x.lk, 0)} mm, λ = ℓk/(0,3·${k ? h : b}) = ${tr(x.lam, 1)}` +
        (x.ihmal ? ' ≤ 22: narinlik ihmal (Denk. 7.17–7.18)' : `; N_d = ${tr(x.N, 0)} kN, bireysel N_k = ${tr(x.NkB, 0)} kN (k ≤ 1, EI = 0,4·Ec·Ic/(1 + R_m), R_m = ${tr(x.Rm)}) → β = ${bT(x.b1)}` +
          (x.tutulu ? '' : `; N_k = ${tr(x.NkS, 0)} kN (ötelenmeli k, R_m ≈ 0, 7.23), ${x.katToplam ? `kat ΣN_d/ΣN_k = ${tr(x.oranS, 3)} (bütün kolonlar)` : `ilk tur: N_d/N_k = ${tr(x.oranS, 3)}`} → β_s = ${bT(x.bs)}${x.carpim ? ', Denk. 7.29: β·β_s' : ', max(β; β_s)'}`) + ` → M_d çarpanı ${bT(x.beta)}`) +
        (x.lamMax > 100 + TOL ? `; λ = ${tr(x.lamMax, 0)} > 100: yaklaşık yöntem geçersiz (7.6.1), kesit büyütülmeli` : '') +
        (x.durMax > 1 + TOL ? `; kat ΣN_d > 0,45·ΣN_k (Denk. 7.28): kolon ya da kiriş rijitliği artırılmalı` : ''));
      if (bd) e.iz.push(`Boyuna: ${bd.cubuk.n}φ${bd.cubuk.phi} (yüz başına: b yüzünde ${bd.nb}, h yüzünde ${bd.nh}), ρ = %${tr(bd.rho * 100, 2)}; M_r (N_d altında) X ${tr(bd.MrX, 0)} / Y ${tr(bd.MrY, 0)} kNm ≥ β·N_d·e_min ${tr(bd.MdX, 0)} / ${tr(bd.MdY, 0)} kNm` +
        (bd.araCubuk ? `; etriye kollarının saracağı ${bd.araCubuk} ara çubuk eklendi (TBDY 7.3.4 → 7.2.8)` : ''));
      else if (sigmazEnAz) e.iz.push(`%1 en az donatı bile φ${CAP.kolon.join('/φ')} ile yüzlere (uzun yüze kaydırılarak) tek sırada sığmıyor (TS 500 9.5.2): ` +
        `çubuk sayısı alanla, yer çevreyle arttığından kesiti büyütmek bunu çözmez; daha büyük çap ya da demet donatı (TS 500 9.5.3) gerekir`);
      if (bd && et) e.iz.push(`Majör/minör: bir yüzdeki çubuk sayısı; köşe çubukları her iki yüze dahildir, toplam donatı hesabında bir kez sayılır.${b === h ? ' Kare kesitte geometrik eksenler eşittir; b ve h yönleri keyfî olarak gösterildi.' : ' Majör eksen kısa yüze, minör eksen uzun yüze paraleldir.'}`);
      const dYaz = i => i >= 0 ? `alttan ${dugum[i][2]}. düğüm (N ${tr(dugum[i][0], 0)} / ${tr(dugum[i][1], 0)} kN)` : 'muaf';
      if (bd && (kirisX || kirisY)) e.iz.push(dugum.length ? `Güçlü kolon (TBDY 7.3.5, her düğümde; alttaki kolon k, üstteki k − 1 kat, N = 0,9G·k/n): en elverişsiz X ${dYaz(bd.gXi)}, Y ${dYaz(bd.gYi)}; ` +
        `kolon M_ra + M_rü X ${tr(bd.gX === Infinity ? 0 : bd.gX, 0)} / Y ${tr(bd.gY === Infinity ? 0 : bd.gY, 0)} kNm; kirişler 1,2·ΣM_r X ${tr(1.2 * (kirisX ?? 0), 0)} / Y ${tr(1.2 * (kirisY ?? 0), 0)} kNm`
        : `Güçlü kolon gerekmez: ${n === 1 ? 'tek katlı bina (TBDY 7.3.5.3(b))' : `her düğümde N_d ≤ 0,10·A_c·f_ck (TBDY 7.3.5.3(a)); çatı düğümü 7.3.5.3(b)`}`);
      if (et) e.iz.push(`Etriye: sarılma (uçlarda ${tr(et.sarBoy, 0)} mm) φ${et.phi}/${et.sSar}, kol ${et.kx}×${et.ky}; orta φ${et.phi}/${et.sOrta}${et.katsayi < 1 ? ' (N_d ≤ 0,2·A_c·f_ck: A_sh 2/3)' : ''}` +
        (cift ? `; bir doğrultuda ≥ 4 kol: çirozlar yerine iç içe iki kapalı etriye (çift etriye, özel deprem etriyesi TBDY 7.2.8)${e.kol.includes('çiroz') ? ', kalan kollar çirozla' : ''}` : ''));
      if (ve) e.iz.push(`Kesme (TBDY 7.3.7): ` + ve.map((x, k) => `${k ? 'Y' : 'X'} V_e = (M_a + M_ü)/ℓn = ${tr(x.M, 0)}/${tr(lnC / 1000)} = ${tr(x.Ve, 0)} kN` +
          ` (temel ucu 1,4·M_r = ${tr(x.MpZ, 0)} kNm, 7.3.7.4; düğüm ucu ≤ kirişlerin ΣM_p = 1,4·${tr((k ? kirisY : kirisX) ?? 0, 0)} kNm, 7.3.7.2${x.kat > 1 ? `; belirleyici ${x.kat}. kat` : ''})`).join('; ') +
        (et ? `; V_c (TS 500 Denk. 8.1, 8.4; en üst kat N_d = ${tr(Nd / n, 0)} kN) X ${tr(et.VcX, 0)} / Y ${tr(et.VcY, 0)} kN${et.sifir ? ', sarılmada V_c = 0 (N_d ≤ 0,05·A_c·fck, 7.3.7.6)' : ''}; ` +
          `V_r sarılma X ${tr(et.VrSarX, 0)} / Y ${tr(et.VrSarY, 0)}, orta X ${tr(et.VrOrtaX, 0)} / Y ${tr(et.VrOrtaY, 0)} kN` : ''));
      if (brl?.yonlar.length) e.iz.push(`Birleşim (TBDY 7.5, ${brl.kus ? 'kuşatılmış' : 'kuşatılmamış'}): ` + brl.yonlar.map(y => `${y.yon.toUpperCase()} V_e = 1,25·fyk·(A_s1 + A_s2) − V_kol = ` +
        `1,25·${mz.fyk}·(${tr(y.As1, 0)} + ${tr(y.As2, 0)})/1000 = ${tr(y.Ve, 0)} kN ≤ ${brl.kus ? '1,7' : '1,0'}·${tr(y.bj, 0)}·${tr(y.hj, 0)}·√fck = ${tr(y.Vmax, 0)} kN`).join('; ') +
        `; V_kol = 0 (deprem çözümlemesi yok, güvenli yan); b_j = min(kolon genişliği; b_w + h)${e.etrBirlesim ? `; birleşim etriyesi ${e.etrBirlesim}` : ''}`);
      // %1 bile sığmıyorsa büyütmek sığmayı kötüleştirir (sınırsız büyüme): kesit/eksenel koşullar sağlandıysa dur, yoksa onlar için büyüt
      if (sabit || (e.gecti && bd && et) || (sigmazEnAz && r.maddeler.every(x => x.gecti))) break;
      // Yanal ötelenmesi önlenmemiş çerçevede N_k kiriş rijitliğiyle sınırlı: kolon büyüdükçe α ve λ büyür, N_k pek artmaz (Denk. 7.15–7.16).
      // Yalnız narinliğe bağlı koşullar sağlanmıyor ve üç adımda iyileşmiyorsa en iyi kesitte durulur (sınırsız büyüme yok).
      const narM = e.maddeler.find(x => x.ad === 'Narinlik');
      if (!narM.gecti && e.maddeler.every(x => x.gecti || x.uyari || NARIN.has(x.ad))) {
        if (!narEn || narM.kullanim < narEn.kul - 1e-3) { narEn = { kul: narM.kullanim, e }; narBos = 0; }
        else if (++narBos >= 3) {
          e = narEn.e;
          e.iz.push(`Kesit büyütmek narinliği iyileştirmiyor (yanal ötelenmesi önlenmemiş çerçevede N_k kiriş rijitliğiyle sınırlı, TS 500 Denk. 7.15–7.16): ` +
            `büyütme durduruldu. ${kirissiz ? 'Perde eklenmeli ya da uzatılmalı (kirişsiz döşemede deprem yükünü perdeler taşır, TBDY 4.3.4.4)' : 'Kirişler büyütülmeli ya da perdelerle yanal ötelenme önlenmeli'} (TS 500 7.6.2.1)`);
          break;
        }
      } else { narEn = null; narBos = 0; }
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
    // 2–3. Kiriş, perde ve kolon: kolon/perde boyutu kiriş açıklığını ve güçlü kolonu, kiriş donatısı kolonu etkiler; birkaç turda oturur.
    // Narinlik rijitleştirmesi: yanal ötelenmesi önlenmemiş doğrultuda narinliği (TS 500 7.6) sağlanmayan kolonun o doğrultudaki aks
    // hattında kiriş yüksekliği tur başına 50 mm artar (KIRIS_H_MAX'a dek); kolonlar ve kirişler yalnız büyür → sınırlı turda oturur.
    const hEk = new Map(), TUR = 20, onb = new Map();
    const hatX = j => ag.hatlar.findIndex(t => t.yon === 'x' && t.no === j), hatY = i => ag.hatlar.findIndex(t => t.yon === 'y' && t.no === i);
    // Yalnız narinliğe bağlı koşulları sağlanmayan kolonlar için; hattın kolonlarında narinlik ölçüsü (λ/100, ΣN_d/0,45ΣN_k, 1,3·N_d/N_k)
    // üst üste iki adımda en iyi değerinden iyileşmiyorsa (kolon kirişe göre çok rijit: α ≫ 1; kat toplamı bir tur geriden gelir) o hat
    // bir daha büyütülmez.
    const narU = new Map(), bosHat = new Set(), vurus = new Map();
    const rijitlestir = (kl, tut) => {
      const hatlar = new Map(); // hat → bu adımda iyileşen kolon var mı
      for (const c of kl) {
        if (c.sigmazEnAz || c.maddeler.some(m => !m.gecti && !m.uyari && !NARIN.has(m.ad))) continue; // %1 bile sığmıyorsa kiriş çözmez
        c.narinlik.forEach((x, d) => {
          // sürekli ölçü (β sonsuzken de); ilk turun bireysel N_d/N_k kestirimi kat toplamıyla karşılaştırılmaz
          const yon = d ? 'y' : 'x', u = Math.max(x.lamMax / 100, x.durMax, x.burMax), u0 = narU.get(c.ad + yon);
          if (x.katToplam) narU.set(c.ad + yon, Math.min(u, u0 ?? Infinity));
          if (tut[yon] || (x.lamMax <= 100 + TOL && x.durMax <= 1 + TOL && Number.isFinite(x.beta))) return;
          const hi = yon === 'x' ? hatX(c.j) : hatY(c.i);
          hatlar.set(hi, hatlar.get(hi) || u0 == null || u < u0 - 0.005);
        });
      }
      let oldu = false;
      for (const [hi, iyi] of hatlar) {
        if (g.kirisOzel?.[ag.hatlar[hi].aks]?.h != null) continue; // elle verilen kiriş yüksekliği rijitleştirilmez
        vurus.set(hi, iyi || !hEk.has(hi) ? 0 : (vurus.get(hi) ?? 0) + 1);
        if (vurus.get(hi) >= 2) bosHat.add(hi);
        const h0 = Math.max(0, ...kr.kirisler.filter(e => e.hat === hi).map(e => e.h));
        if (!bosHat.has(hi) && h0 && h0 + 50 <= KIRIS_H_MAX) { hEk.set(hi, h0 + 50); oldu = true; }
      }
      return oldu;
    };
    for (let tur_ = 0; tur_ < TUR; tur_++) {
      kr = kirisBul(ag, gg, mz, dos, olcuF, { perde: pd.bay, hEk, ozel: g.kirisOzel, onb }); // onb: turlarda aynı girdiyle yeniden boyutlanan hatlar
      const kirisAtC = (c, yon) => kr.kolonKiris.get(c.ad)[yon]; // kolona birleşen kirişler (ızgarada kaldırılan/kaydırılan kolona göre)
      // Perde yükü (kat başına): açıklık boyunca kirişe gelecek döşeme payı ve duvar (aynı aktarım, çizgisel) + sahip düğümlerdeki
      // kiriş tepkileri (iki doğrultu; perdeye saplanan kiriş ucu dahil) + öz ağırlık (perde.js)
      const yukP = p => {
        let Ga = 0, Qa = 0, Gd = 0, Qd = 0;
        for (let k = p.k0; k <= p.k1; k++) { const y = kr.perdeYuk.get(`${p.hi}:${k}`); Ga += y.G; Qa += y.Q; }
        for (const ad of p.sahip) { const c = ag.kolonlar.find(x => x.ad === ad), tx = kr.tepki.get(hatX(c.j)), ty = kr.tepki.get(hatY(c.i));
          Gd += tx.G[c.i] + ty.G[c.j]; Qd += tx.Q[c.i] + ty.Q[c.j]; }
        return { G1: Ga + Gd, Q1: Qa + Qd, iz: [`Kat başına: açıklık boyunca döşeme payı ve duvar (kirişe gelecek yükün aynısı, çizgisel) G ${tr(Ga)}, Q ${tr(Qa)} kN; ` +
          `düğümlerde (${p.sahip.join(', ') || '—'}) kiriş tepkileri G ${tr(Gd)}, Q ${tr(Qd)} kN`] };
      };
      const pkal0 = new Map(pkal);
      perdeler = perdeTasarlaHepsi(yukP);
      const topla = a => a.reduce((x, y) => x + y, 0);
      const Wkat = topla([...kr.tepki.values()].map(r => topla(r.G) + topla(r.Q))) + topla([...kr.perdeYuk.values()].map(y => y.G + y.Q))
        + topla(kolonListe.map(c => ozKat(olcuF(c)))) + topla(perdeler.map(ozPerde));
      yanal = yanalBul(Wkat);
      // TS 500 7.6.2.2: kiriş çatlamış I = 0,5·b·h³/12 (tabla ihmal), açıklık eksen boyu
      // Kolon düzeni değişince bir doğrultuda kirişi birleşmeyen kolon (dik kiriş L/10'dan çok kaçık, kolonduzen.js): o doğrultuda döşemenin kolon şeridi
      // kiriş sayılır (TS 500 7.6.2.2 kirişsiz döşeme kuralı, yorum; tabla kalınlığıyla, güvenli yan)
      const seritK = (c, yon) => { const tf = dos.tabla ?? dos.h, p = kolonPay(ag, c), [l1a, l1b, l2a, l2b] = yon === 'x' ? p.acik : [...p.acik.slice(2), ...p.acik.slice(0, 2)];
        return [l1a, l1b].filter(Boolean).reduce((a, l1) => a + 0.5 * [l2a, l2b].filter(Boolean).reduce((w, t) => w + 0.25 * Math.min(l1, t) * 1000, 0) * tf ** 3 / 12 / (l1 * 1000), 0); };
      const cevre = { kirisAt: kirisAtC, rijit: (c, yon) => { const k = kirisAtC(c, yon).filter(Boolean); return k.length || !ag.duzen ? k.reduce((a, e) => a + 0.5 * e.b * e.h ** 3 / 12 / (e.L * 1000), 0) : seritK(c, yon); },
        tutulu: { x: yanal.x.tutulu, y: yanal.y.tutulu }, yazi: pd.perdeler.length || g.yanalTutulu ? { x: yanal.x.yazi, y: yanal.y.yazi } : null };
      const kirisMrF = (c, yon) => {
        const [sol, sag] = kirisAtC(c, yon);
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
      const hK = c => Math.max(...['x', 'y'].flatMap(y => kirisAtC(c, y)).filter(Boolean).map(e => e.h), 0);
      kolonlar = kolonTasarla(yukF, kirisMrF, c => g.H - hK(c), true, cevre);
      const katIlk = !katNar; katNarHesap(kolonlar);
      const yeni = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
      const ayni = [...yeni].every(([k, v]) => olcu.get(k).b === v.b && olcu.get(k).h === v.h) && [...pkal].every(([k, v]) => pkal0.get(k) === v);
      olcu = yeni;
      const sert = tur_ < TUR - 2 && rijitlestir(kolonlar, cevre.tutulu); // son iki tur oturmaya kalır
      if (ayni && !sert && !(katIlk && !(cevre.tutulu.x && cevre.tutulu.y))) break; // ötelenmeli çerçevede kat toplamı (Denk. 7.27–7.28) en az bir turda uygulansın
      if (tur_ === TUR - 1) { // oturmadı: önerinin büyüttüğü kesit eski (küçük) öz ağırlıkla denetlenmiş olabilir; son kesitleri kendi yükleriyle yeniden denetle
        kolonlar = kolonTasarla(yukF, kirisMrF, c => g.H - hK(c), false, cevre); katNarHesap(kolonlar);
        olcu = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
        notlar.push(`Kiriş–kolon boyutları ${TUR} turda oturmadı; kolonlar son kesitleriyle (öz ağırlık dahil) yeniden denetlendi, kirişler bir önceki kolon boyutlarıyla boyutlandı.`);
      }
    }
    if (hEk.size) {
      const kalan = kolonlar.filter(c => c.maddeler.find(m => m.ad === 'Narinlik')?.gecti === false).map(c => c.ad);
      notlar.push(`Yanal ötelenmesi önlenmemiş doğrultuda kolon narinliği için kirişler rijitleştirildi (TS 500 7.6.2.2, Denk. 7.15–7.16; tur başına 50 mm, en çok ${KIRIS_H_MAX} mm): ` +
        `${[...hEk].map(([hi, h]) => `${ag.hatlar[hi].aks} aksı h ≥ ${h} mm`).join(', ')}.` + (kalan.length ? ` ${kalan.join(', ')} yine sağlamıyor: perdeyle yanal ötelenme önlenmeli (TS 500 7.6.2.1) ya da kolon/kiriş kesiti artırılmalı.` : ''));
    }
  } else {
    // Kirişsiz: döşeme kalınlığı zımbalama ve sehimle bulunur; kolon boyutu döşeme yüküne bağlı
    const lnMax = Math.max(...g.ax, ...g.ay), hElle = g.dosemeOzel?.h;
    let h = hElle ?? yukari(Math.max(200, lnMax * 1000 / 30), 10);   // TS 500 11.4.2 Denk. 11.2 (11.4.4 yöntemleri kullanıldığından); elle verilirse yalnız denetlenir
    for (let adim = 0; adim < 90; adim++) {
      kirissizDuvar(h);
      const yk = panoYuk(gg, h, h);
      // TS 500 7.6.2.2: kirişsizde kolon şeridi kiriş sayılır; genişlik her yanda 0,25·min(ℓ1, ℓ2) (Şekil 11.2), çatlamış I/2
      const seritR = (c, yon) => {
        const [L, T, u, v] = yon === 'x' ? [g.ax, g.ay, c.i, c.j] : [g.ay, g.ax, c.j, c.i], l2 = [T[v - 1], T[v]].filter(Boolean);
        return [L[u - 1], L[u]].filter(Boolean).reduce((a, l1) => a + 0.5 * l2.reduce((w, t) => w + 0.25 * Math.min(l1, t) * 1000, 0) * h ** 3 / 12 / (l1 * 1000), 0);
      };
      const yukF = (c, b, hh) => {
        const { ax, ay, k, disBoy } = kolonPay(ag, c, katKx, katKy), A = ax * ay; // kolon düzeni değiştiyse gerçek yerlerle
        const oz = b / 1000 * hh / 1000 * g.H / 1000 * GAMMA_BA;
        const G1 = A * yk.g * k + disBoy * gg.duvarDis + oz, Q1 = A * yk.q * k;
        return { G1, Q1, iz: [`Kat başına: alan payı ${tr(A)} m² × süreklilik ${tr(k, 3)}; G = ${tr(A * yk.g * k)} + dış duvar ${tr(disBoy * gg.duvarDis)} + öz ağırlık ${tr(oz)} = ${tr(G1)} kN; Q ${tr(Q1)} kN`] };
      };
      // Perde: sahip düğümlerin alan payı (süreklilik katsayısıyla) ve kenar duvarı; kolon alan payları planı örttüğünden açıklık da içinde
      perdeler = perdeTasarlaHepsi(p => { let G1 = 0, Q1 = 0;
        for (const ad of p.sahip) { const y = yukF(ag.kolonlar.find(x => x.ad === ad), 0, 0); G1 += y.G1; Q1 += y.Q1; }
        return { G1, Q1, iz: [`Kat başına: düğümlerin (${p.sahip.join(', ') || '—'}) alan payı × süreklilik + dış duvar: G ${tr(G1)}, Q ${tr(Q1)} kN`] }; });
      yanal = yanalBul(plan * (yk.g + yk.q) + 2 * (W + Lp) * gg.duvarDis + kolonListe.reduce((t, c) => t + ozKat(olcuF(c)), 0) + perdeler.reduce((t, e) => t + ozPerde(e), 0));
      const tutulu = { x: yanal.x.tutulu, y: yanal.y.tutulu }, yazi = { x: yanal.x.yazi, y: yanal.y.yazi };
      for (let tur_ = 0; tur_ < 4; tur_++) {
        kolonlar = kolonTasarla(yukF, () => null, () => g.H - h, tur_ < 3, { rijit: seritR, tutulu, yazi }); // son tur: öneri yok, yükler o anki kesitle (eski öz ağırlıkla geçmesin)
        const katIlk = !katNar; katNarHesap(kolonlar);
        const yeni = new Map(kolonlar.map(c => [c.ad, { b: c.b, h: c.h }]));
        const ayni = [...yeni].every(([k_, v]) => olcu.get(k_).b === v.b && olcu.get(k_).h === v.h);
        olcu = yeni; if (ayni && !(katIlk && !(tutulu.x && tutulu.y))) break;
      }
      const sonuc = kirissizDoseme(ag, gg, h, mz, yk, olcuF, katKx, katKy, pd.dugum);
      seritler = sonuc.seritler; zimbD = sonuc.zimb; dosemeler = sonuc.panolar;
      if ([...seritler, ...zimbD, ...dosemeler].every(e => e.gecti)) break;
      if (seritler.some(s => !s.sd.minKod)) { notlar.push(`h = ${h} mm: en az donatı (0,00175·h) φ${CAP.doseme.at(-1)} ile TS 500 9.5.2 aralığına sığmıyor; kalınlaştırmak çözmez, daha büyük çap gerekir.`); break; }
      // Yalnız zımbalama yetmiyorsa önce o kolonları büyüt (en çok 800 mm), sonra döşemeyi kalınlaştır (TS 500 11.4.2)
      const zKotu = zimbD.filter(z => !z.gecti), digerKotu = [...seritler, ...dosemeler].some(e => !e.gecti);
      const buyur = zKotu.filter(z => !ozel[z.kolon] && Math.max(olcu.get(z.kolon).b, olcu.get(z.kolon).h) < 800);
      // elle h: öbür koşullar kalınlıkla düzelmez, zımbalama için kolonlar yine büyür
      if ((!digerKotu || hElle != null) && zKotu.length && buyur.length === zKotu.length) { for (const z of zKotu) olcu.set(z.kolon, buyut(olcu.get(z.kolon))); continue; }
      if (hElle != null) break; // elle kalınlık: kolonlar zımbalama için büyüdü, döşeme kalınlaşmaz
      if (adim === 89) { notlar.push(`Kirişsiz döşeme h = ${h} mm'ye dek kalınlaştırıldı (90 adım sınırı); koşullar sağlanamadı.`); break; } // h şeritlerinki kalsın
      h += 10;
    }
    dos = { h, gAlan: dosemeler[0].gAlan, qAlan: dosemeler[0].qAlan };
    if (Math.min(ag.nx, ag.ny) < 3) notlar.push('TS 500 11.4.4.2 moment katsayıları en az 3 açıklık ister; bu planda yaklaşık kabul edildi, çerçeve yöntemiyle (11.4.4.1) kesin hesap yapılmalı.');
    const yY = yanal.x.tutulu === yanal.y.tutulu ? (yanal.x.tutulu ? 'önlenmiş' : 'önlenmemiş') : ['x', 'y'].map(y => `${y.toUpperCase()} ${yanal[y].tutulu ? 'önlenmiş' : 'önlenmemiş'}`).join(', ');
    notlar.push('Kirişsiz döşemeli sistemde deprem etkilerinin tamamı perdelerle karşılanmalıdır (TBDY 4.3.4.4); ' +
      (pd.perdeler.length ? `${pd.perdeler.length} perde yerleştirildi (Perde sayfası; ${['x', 'y'].filter(y => !perdeler.some(e => !e.kismi && e.tur === 'perde' && e.yon === y)).map(y => `${y.toUpperCase()} doğrultusunda perde yok, eklenmeli`).join('; ') || 'iki doğrultuda da perde var'}). ` +
        'Perdelerin deprem kuvvetlerinin tamamını (birinci aşamada kolonlar iki ucu mafsallı) taşıdığı kesin hesapta gösterilmeli. '
        : 'plana perde yerleştirilmedi: Perdeler alanından ya da plandan ekle. ') +
      `Kolonlarda yanal ötelenme ${yY} sayıldı (TS 500 7.6.2.1); kolon kapasite kesmesi (TBDY 7.3.7) ve kiriş–kolon birleşimi (7.5) kirişsizde aranmadı, kolon kesmesi perdeli sistemin kesin hesabında denetlenmeli.`);
    if (pd.bay.size) notlar.push('Kirişsiz döşeme şeritleri ve sehimi perde açıklıklarında da kolon şeridi gibi hesaplandı (perde döşemeyi çizgi boyunca taşır: yaklaşık); perde düğümlerinde döşeme zımbalaması aranmadı.');
    if (g.duvarDisTur in DUVAR || g.duvarIcTur in DUVAR) notlar.push(`Duvar yükü (net yükseklik H − döşeme h): dış ${gg.duvarYazi[0]}, iç ${gg.duvarYazi[1]}.`);
  }

  // Elle verilen boyutlar: döşeme satırları işaretlenir (Excel hücresi turuncu), tek notta toplanır
  const dOz = g.dosemeOzel ?? {}, elle = [];
  if (dOz.h != null || (dOz.t != null && (tur === 'disli' || tur === 'kaset'))) {
    for (const e of dosemeler) e.ozel = { h: dOz.h != null, t: dOz.t != null && (tur === 'disli' || tur === 'kaset') };
    elle.push(`döşeme ${[dOz.h != null && `h = ${dOz.h}`, dosemeler[0].ozel.t && `t = ${dOz.t}`].filter(Boolean).join(', ')} mm`);
  }
  if (kirissiz && dOz.h != null) for (const e of seritler) e.iz.push(`Döşeme h = ${dOz.h} mm elle verildi: araç kalınlığı boyutlandırmadı, koşullar bu kalınlıkla denetlendi`);
  for (const [a, o] of Object.entries(g.kirisOzel ?? {})) if (kr.kirisler.some(e => ag.hatlar[e.hat].aks === a)) elle.push(`${a} aksı kirişleri ${[o.b != null && `b = ${o.b}`, o.h != null && `h = ${o.h}`].filter(Boolean).join(', ')} mm`);
  for (const e of perdeler) {
    perdeKismiDenetle(e, ag, c => kolonlar.find(k => k.ad === c.ad) ?? dugumOlcu(c.ad));
    if (e.ozel) elle.push(`${e.ad} (${perdeYaz([e])}) ${[e.ozel.bw && `b_w = ${e.bw}`, e.ozel.lw && `ℓw = ${e.lw}`].filter(Boolean).join(', ')} mm`);
  }

  // 4. Radye
  const rd = radyeBul(ag, g, mz, kolonlar.map(c => ({ ...ag.kolonlar.find(k => k.ad === c.ad), b: c.b, h: c.h, Nd: c.Nd })), perdeler);

  if (g.radyeOzel?.h != null) elle.push(`radye h = ${g.radyeOzel.h} mm`);
  if (g.radyeOzel?.a != null) elle.push(`radye taşması ${tr(g.radyeOzel.a)} m`);
  const kolonElle = kolonlar.filter(c => c.ozel).map(c => `${c.ad} ${c.b}×${c.h}`);
  if (kolonElle.length) elle.push(`kolon ${kolonElle.join(', ')} mm`);

  // Notlar
  if (rd.subasmanlar.length) notlar.push('Su basman perdelerinin öz ağırlığı radye ön hesabına eklendi. Toprak ve su basıncı, donatı ve temel bağlantısı ayrıca hesaplanmalı.');
  if (elle.length) notlar.push(`Elle verilen boyutlar (araç büyütmedi, bütün koşullar bu boyutlarla denetlendi): ${elle.join('; ')}.`);
  if (kr.kalkma.length && !kr.izgara) notlar.push(`${kr.kalkma.join(', ')}: kısa uç açıklığında sürekli kiriş ucu kalkıyor (negatif tepki); kolon yükü alan payıyla alındı.`);
  const dz = duzenSonuc(ag, kirissiz ? null : kr, kolonlar, { kirissiz }); notlar.unshift(...dz.notlar); // kolon düzeni (kolonduzen.js)
  if ((tur === 'disli' || tur === 'kaset') && !(g.dolgu > 0)) notlar.push('Dolgu (asmolen) ağırlığı 0 girildi: TS 500 ve TS 498 değer vermiyor (TS ISO 9194); kullanılacak bloğun ağırlığını girin.');
  if (tur === 'disli') notlar.push(perdeler.some(p => !p.kismi && p.tur === 'perde') ? 'Tek doğrultulu dişli döşemeli çerçeve süneklik düzeyi yüksek perdelerle birlikte (karma sistem) DTS 1–2\'de de kullanılabilir; perdeler deprem hesabında bu sistemi sağlamalı (TBDY 4.3.4.3, Tablo 4.1).'
    : 'Perde içermeyen tek doğrultulu dişli döşemeli çerçeve yalnız DTS 3–4\'te kullanılabilir (TBDY 4.3.4.3).');
  notlar.push(`Kiriş${perdeler.length ? ', kolon ve perde' : ' ve kolon'} detayları süneklik düzeyi yüksek kurallarıyla (DTS 1–2) seçildi; DTS 3–4 binada da güvenli yandadır.`);
  if (perdeler.length || g.yanalTutulu === true) notlar.push(`Yanal ötelenme (kolon narinliği, TS 500 7.6.2.1): ${['x', 'y'].map(y => `${y.toUpperCase()} ${yanal[y].tutulu ? 'önlenmiş' : 'önlenmemiş'} (${yanal[y].yazi})`).join('; ')}. ` +
    'φ perdeler tabanda ankastre konsol, çatlamamış kesit, TBDY Denk. 4.22–4.23 yük dağılımıyla; çerçeve katkısı ihmal (güvenli yan).' +
    ['x', 'y'].filter(y => yanal[y].phi > 0.05).map(y => ` ${y.toUpperCase()} doğrultusundaki perdeler yanal ötelenmeyi önlemeye yetmiyor: perde ekle ya da uzat (φ ∝ 1/ΣE·I).`).join(''));
  const tamPerdeler = perdeler.filter(p => !p.kismi), kisaPerdeler = perdeler.filter(p => p.kismi);
  if (kisaPerdeler.length) notlar.push(`Kısa perdeler (${kisaPerdeler.map(p => p.ad).join(', ')}): çerçeve korunarak yalnız perde öz ağırlığı radyeye eklendi. Perde ile kiriş ve döşeme arasındaki yük aktarımı ve yanal rijitlik ayrıca çözülmeli.`);
  if (tamPerdeler.length) notlar.push(`Tam açıklık perdeleri (${tamPerdeler.map(e => `${e.ad} ${e.aks.replace(' / ', '/')}`).join(', ')}) yalnız düşey yükle boyutlandı; uç kolonları uç bölgesi oldu, perde açıklığında kiriş yok. ` +
    'Deprem eğilme momenti ve kesmesi (TBDY 7.6.6), göreli kat ötelemesi (4.9.1) ve burulma düzensizliği (3.6.2.1; dış akslarda tek yanlı perde burulma doğurur) kesin hesapta denetlenmeli.');
  notlar.push('Deprem kuvvetleri (kolon ve birleşimde V_d, V_kol; TBDY 7.3.7.5, 7.5.2.1), ikinci mertebe göstergesi (TBDY 4.9.2) ve göreli kat ötelemesi kesin hesapta denetlenmeli; kolon kesmesi ve birleşim burada yalnız kapasite (kiriş/kolon donatısı) tarafından denetlendi.');
  const qMin = Q_MIN[g.kullanim];
  if (qMin != null && g.q < qMin) notlar.push(`q = ${tr(g.q)} kN/m², TS 498 Çizelge 7 değerinin (${tr(qMin)} kN/m²) altında.`);
  const duvarTop = kirissiz ? ag.hatlar.reduce((a, h) => a + hatBoy(h) * (h.dis ? gg.duvarDis : gg.duvarIc), 0)
    : kr.kirisler.reduce((a, e) => a + e.L * e.duvar, 0) + [...(kr.perdeYuk?.values() ?? [])].reduce((a, y) => a + y.duvar, 0); // kirişlide duvar kiriş yüksekliğine göre (kiris.js)
  const kirisAg = kr.kirisler.reduce((a, e) => a + e.L * e.b / 1000 * Math.max(0, e.h / 1000 * GAMMA_BA - oz(gg, dos.tabla ?? dos.h, dos.h)), 0); // kiris.js hatTasarla ile aynı
  const kolonAg = kolonlar.reduce((a, c) => a + ozKat(c), 0) + perdeler.reduce((a, e) => a + ozPerde(e), 0);
  const katYuk = plan * (dos.gAlan - (kirissiz ? gg.duvarEsdeger : 0) + dos.qAlan) + duvarTop + kirisAg + kolonAg;
  // Yalnız mevcut ortak kesit ve eşit kat yükü varsayımı altında yükler; kat başına boyut/donatı tasarımı değildir.
  const katKolonYukleri = Array.from({ length: n }, (_, i) => kolonlar.map(c => {
    const k = n - i, NG = c.NG / n * k, NQ = c.Q1Ham * k * beta(g.kullanim, k);
    return { kat: i + 1, ad: c.ad, aks: c.aks, NG, NQ, Nd: 1.4 * NG + 1.6 * NQ };
  })).flat();
  return { ag, tur, katSayisi: n, beta: bt, h: dos.h, tabla: dos.tabla, katYukAlan: katYuk / plan, duzen: dz.duzen,
    dosemeler, seritler, zimbD, kirisler: kr.kirisler, kolonlar, katKolonYukleri, perdeler, yanal, radye: rd.radye, radyeSerit: rd.seritler, radyeZimb: rd.zimb, radyePerde: rd.perde, subasmanlar: rd.subasmanlar, notlar };
}
