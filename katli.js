// Kat bazında düşey yük ön boyutlandırması. Birimler: mm, m, kN, kNm.
import { agKur } from './mekanik.js';
import { dosemeBul, GAMMA_BA } from './doseme.js';
import { kirisBul } from './kiris.js';
import { kontrol, kolonOner, beta } from './kurallar.js';
import { boyunaDonati, etriye, kirisMr, katNarinlik } from './kolon.js';
import { alan, kolonYuzMax } from './donati.js';
import { radyeBul } from './radye.js';
import { perdeOku, perdeDisari, perdeAg, perdeDugumOlcu, perdeKismiDenetle, perdeTasarla, perdeYaz, duraylilikKatli } from './perde.js';
import { katKirissiz, katSeritRijitligi } from './katli-kirissiz.js';
import { EC } from './sehim.js';

const fmt = (n, d = 1) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(n);
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari: false });
const sonla = e => {
  e.belirleyici = e.maddeler.filter(m => !m.uyari).reduce((a, m) => (m.kullanim ?? -1) > (a?.kullanim ?? -1) ? m : a, null);
  e.gecti = e.maddeler.every(m => m.gecti || m.uyari);
  return e;
};
const buyut = ({ b, h }) => b <= h ? { b: b + 50, h } : { b, h: h + 50 };

// Katların yalnız doğrulanmış düşey yükleri kullanılır. Deprem etkileri kesin hesapta denetlenir.
export function katliHesap(g, mz) {
  if (!Array.isArray(g.katYukseklikleri) || g.katYukseklikleri.length !== g.katSayisi || !g.katYukseklikleri.every(h => Number.isFinite(h) && h >= 2000 && h <= 8000))
    throw new RangeError('Her kat için 2.000–8.000 mm arası bir yükseklik girilmeli');
  const perde = perdeOku(g.perdeler);
  if (!['plak', 'disli', 'kaset', 'kirissiz'].includes(g.dosemeTuru) || perde.hata.length)
    throw new RangeError('Katlı hesap için geçerli perde ve döşeme türü girilmeli');
  const ag = agKur(g.ax, g.ay), n = g.katSayisi, H = g.katYukseklikleri, katlar = H.map((h, i) => ({ kat: i + 1, H: h }));
  if (perdeDisari(perde.liste, ag.nx, ag.ny).length) throw new RangeError('Perde açıklığı aks ağının dışında');
  const kirissiz = g.dosemeTuru === 'kirissiz';
  const plan = ag.xs.at(-1) * ag.ys.at(-1), ozel = g.kolonOzel ?? {}, fck = mz.fck;
  const pd = perdeAg(ag, perde.liste, g.perdeBoyOzel), kolonListe = ag.kolonlar.filter(c => !pd.dugum.has(c.ad));
  const pElle = p => g.perdeOzel?.[perdeYaz([p])], pkal = new Map(pd.perdeler.map(p => [p.ad, pElle(p) ?? g.perdeKal ?? 250]));
  const duvarOlcu = ad => perdeDugumOlcu(pd.perdeler, ad, p => pkal.get(p.ad));
  const boyut = H.map(() => new Map(kolonListe.map(c => [c.ad, { b: ozel[c.ad]?.b ?? 300, h: ozel[c.ad]?.h ?? 300 }])));
  const olcu = (k, c) => boyut[k].get(c.ad) ?? duvarOlcu(c.ad);
  const hEk = H.map(() => new Map());
  let yanal = { x: { tutulu: g.yanalTutulu === true }, y: { tutulu: g.yanalTutulu === true } };
  const hatX = j => ag.hatlar.findIndex(t => t.yon === 'x' && t.no === j), hatY = i => ag.hatlar.findIndex(t => t.yon === 'y' && t.no === i);
  const kirisAt = (k, c, yon) => {
    if (k < 0 || k >= n) return [];
    const hi = yon === 'x' ? hatX(c.j) : hatY(c.i), u = yon === 'x' ? c.i : c.j;
    return [u - 1, u].map(p => katlar[k].kirisler.find(e => e.hat === hi && e.k === p) ?? null);
  };
  const moment = (k, c, yon) => {
    const [a, b] = kirisAt(k, c, yon), mr = (e, t) => e ? kirisMr(t === 'u' ? e.AsUst : e.AsAlt, e.b, e.h - 50, mz) : 0;
    return Math.max(mr(a, 'u') + mr(b, 'a'), mr(a, 'a') + mr(b, 'u'));
  };
  const rijit = (k, c, yon) => kirissiz ? katSeritRijitligi(ag, katlar[k].h, c, yon)
    : kirisAt(k, c, yon).filter(Boolean).reduce((a, e) => a + 0.5 * e.b * e.h ** 3 / 12 / (e.L * 1000), 0);
  const atalet = (o, yon) => yon === 'x' ? o.h * o.b ** 3 / 12 : o.b * o.h ** 3 / 12;
  const alfa = (k, c, yon, alt) => {
    const node = alt ? k - 1 : k;
    if (node < 0) return 0; // temel ankastre
    const R = rijit(node, c, yon);
    if (!R) return 1e6;
    const own = atalet(boyut[k].get(c.ad), yon) / H[k], komsu = alt ? k - 1 : k + 1;
    return Math.min(1e6, (own + (komsu >= 0 && komsu < n ? atalet(boyut[komsu].get(c.ad), yon) / H[komsu] : 0)) / R);
  };
  // Her iki düğümde, komşu kolonların ortak kesitini esas al; deprem çözümlemesi olmadığından V_kol = 0.
  const birlesim = (k, c, b, h, ortak = true) => [k - 1, k].filter(node => node >= 0).flatMap(node => {
    const diger = node === k ? k + 1 : k - 1, o = ortak && diger < n ? boyut[diger].get(c.ad) : { b, h };
    const cb = Math.min(b, o.b), ch = Math.min(h, o.h), x = kirisAt(node, c, 'x'), y = kirisAt(node, c, 'y');
    const kus = [...x, ...y].every(Boolean) && x.every(e => e.b >= 0.75 * ch) && y.every(e => e.b >= 0.75 * cb);
    return [['x', x], ['y', y]].filter(([, ks]) => ks.some(Boolean)).map(([yon, [sol, sag]]) => {
      const ab = (sol?.AsUst ?? 0) + (sag?.AsAlt ?? 0), ba = (sol?.AsAlt ?? 0) + (sag?.AsUst ?? 0);
      const hj = yon === 'x' ? cb : ch, bj = Math.min(yon === 'x' ? ch : cb, Math.min(...[sol, sag].filter(Boolean).map(e => e.b)) + hj);
      return { kat: node + 1, yon, kus, Ve: 1.25 * mz.fyk * Math.max(ab, ba) / 1000,
        Vmax: (kus ? 1.7 : 1) * bj * hj * Math.sqrt(fck) / 1000 };
    });
  });
  const hesapKirisler = () => katlar.forEach((kat, k) => {
    if (kirissiz) {
      const d = katKirissiz(ag, g, mz, H[k], c => {
        const alt = olcu(k, c), ust = k + 1 < n ? olcu(k + 1, c) : alt;
        return { b: Math.min(alt.b, ust.b), h: Math.min(alt.h, ust.h) };
      }, pd.dugum);
      Object.assign(kat, { h: d.h, tabla: undefined, dosemeler: d.dosemeler, seritler: d.seritler, zimbD: d.zimbD,
        kirisler: [], kalkma: [], flatYukler: d.yukler, perdeYuk: new Map() });
      return;
    }
    const kg = { ...g, H: H[k] }, d = dosemeBul(ag, kg, mz, 250);
    kat.h = d.h; kat.tabla = d.panolar[0].t; kat.dosemeler = d.panolar;
    if (g.dosemeOzel?.h != null || g.dosemeOzel?.t != null) for (const e of kat.dosemeler) e.ozel = { h: g.dosemeOzel.h != null, t: g.dosemeOzel.t != null };
    const dos = { h: d.h, tabla: kat.tabla, gAlan: d.panolar[0].gAlan, qAlan: d.panolar[0].qAlan };
    // Üst düğümde hem alt hem üst kolon vardır; dar olan yüz kirişe mesnet sayılır.
    const kr = kirisBul(ag, kg, mz, dos, c => {
      const alt = olcu(k, c), ust = k + 1 < n ? olcu(k + 1, c) : alt;
      return { b: Math.min(alt.b, ust.b), h: Math.min(alt.h, ust.h) };
    }, { perde: pd.bay, ozel: g.kirisOzel, hEk: hEk[k] });
    kat.kirisler = kr.kirisler; kat.tepki = kr.tepki; kat.kalkma = kr.kalkma; kat.perdeYuk = kr.perdeYuk;
  });
  const yuk = () => {
    for (let k = n - 1; k >= 0; k--) {
      const kat = katlar[k]; kat.yukler = new Map();
      for (const c of kolonListe) {
        const o = boyut[k].get(c.ad), tx = kirissiz ? null : kat.tepki.get(hatX(c.j)), ty = kirissiz ? null : kat.tepki.get(hatY(c.i));
        const y = kirissiz ? kat.flatYukler.get(c.ad) : { G1: tx.G[c.i] + ty.G[c.j], Q1: tx.Q[c.i] + ty.Q[c.j] };
        const G1 = y.G1 + o.b * o.h * H[k] / 1e9 * GAMMA_BA, Q1 = y.Q1;
        const ust = k + 1 < n ? katlar[k + 1].yukler.get(c.ad) : { G: 0, Q: 0 };
        kat.yukler.set(c.ad, { G: G1 + ust.G, Q: Q1 + ust.Q, G1, Q1 });
      }
      kat.perdeHamQ = new Map();
      kat.perdeler = pd.perdeler.map(p => {
        let G1 = 0, Q1 = 0;
        if (!kirissiz && !p.kismi) for (let i = p.k0; i <= p.k1; i++) { const t = kat.perdeYuk.get(`${p.hi}:${i}`); G1 += t.G; Q1 += t.Q; }
        for (const ad of p.sahip) {
          if (kirissiz) { const y = kat.flatYukler.get(ad); G1 += y.G1; Q1 += y.Q1; }
          else { const c = ag.kolonlar.find(x => x.ad === ad), tx = kat.tepki.get(hatX(c.j)), ty = kat.tepki.get(hatY(c.i));
            G1 += tx.G[c.i] + ty.G[c.j]; Q1 += tx.Q[c.i] + ty.Q[c.j]; }
        }
        const ust = k + 1 < n ? katlar[k + 1].perdeler.find(e => e.ad === p.ad) : null;
        const Qham = Q1 + (k + 1 < n ? katlar[k + 1].perdeHamQ.get(p.ad) : 0);
        kat.perdeHamQ.set(p.ad, Qham);
        const e = perdeTasarla({ p, bw: pkal.get(p.ad), bwGirdi: pElle(p) ?? g.perdeKal ?? 250, n: n - k, H: H[k], G1, Q1,
          bt: beta(g.kullanim, n - k), mz, sds: g.sds, kDeprem: g.kDeprem, sabit: pElle(p) != null,
          katYuk: { Gdiger: G1 + (ust?.NG ?? 0), Qham, Hw: H.reduce((a, b) => a + b, 0) },
          iz: p.kismi ? [] : [`${k + 1}. kat perdeye aktarılan düşey yük: G ${fmt(G1)} kN, Q ${fmt(Q1)} kN; üst kat yükleri ayrıca biriktirildi.`] });
        pkal.set(p.ad, e.bw); return e;
      });
    }
  };
  const yanalBul = () => Object.fromEntries(['x', 'y'].map(yon => {
    if (g.yanalTutulu === true) return [yon, { tutulu: true, yazi: 'elle işaretlendi' }];
    if (!pd.perdeler.some(p => !p.kismi && p.yon === yon)) return [yon, { tutulu: false, yazi: `${yon.toUpperCase()} doğrultusunda perde yok` }];
    const veri = katlar.map((kat, k) => {
      const ust = katlar[k + 1], kolonW = [...kat.yukler.values()].reduce((s, y) => s + y.G1 + y.Q1, 0);
      const perdeW = kat.perdeler.reduce((s, p) => s + p.NG - (ust?.perdeler.find(x => x.ad === p.ad)?.NG ?? 0)
        + kat.perdeHamQ.get(p.ad) - (ust?.perdeHamQ.get(p.ad) ?? 0), 0);
      return { H: H[k], W: kolonW + perdeW, perdeler: kat.perdeler.filter(p => !p.kismi && p.yon === yon && p.tur === 'perde') };
    });
    const r = duraylilikKatli({ katlar: veri, Ec: EC[fck] }), tutulu = r.phi <= 0.05 + 1e-9;
    return [yon, { tutulu, phi: r.phi, kat: r.kat, yazi: `φ = ${fmt(r.phi, 3)} (${r.kat}. kat; TS 500 Denk. 7.13)` }];
  }));
  // Kat başına gerçek uç rijitlikleri ve düşey yüklerle tek kolon seçimi. Komşu kolonların ikisi de
  // aynı düğüm için ≥ 0,6·ΣMr,kiriş sağlayacak şekilde seçilir; toplamları 1,2·ΣMr'yi sağlar.
  const tasarla = (k, c, katOran) => {
    const kat = katlar[k], eski = boyut[k].get(c.ad), sabit = ozel[c.ad] != null, y = kat.yukler.get(c.ad);
    const bt = beta(g.kullanim, n - k), Q = y.Q * bt;
    const beamH = Math.max(0, ...['x', 'y'].flatMap(yon => kirisAt(k, c, yon)).filter(Boolean).map(e => e.h));
    const kirissizL = kirissiz ? Math.max(...[g.ax[c.i - 1], g.ax[c.i], g.ay[c.j - 1], g.ay[c.j]].filter(Boolean)) * 1000 : null;
    const ln = H[k]; // ponytail: tam kat yüksekliği kullanılır; kiriş altında azaltılmamış boy narinlik için güvenli yandadır.
    let b = eski.b, h = eski.h, e, narEn = null, narBos = 0;
    for (let step = 0; step < 30; step++) {
      const G = y.G + (b * h - eski.b * eski.h) * H[k] / 1e9 * GAMMA_BA;
      const Nd = 1.4 * G + 1.6 * Q, Ndm = (G + Q + 0.2 * g.sds * G) * g.kDeprem;
      if (!sabit && step === 0) { const a = kolonOner({ fck, Ndm, Nd, kirissizAciklik: kirissizL }); if (a) { b = Math.max(b, a.b); h = Math.max(h, a.h); } }
      const G2 = y.G + (b * h - eski.b * eski.h) * H[k] / 1e9 * GAMMA_BA, Nd2 = 1.4 * G2 + 1.6 * Q, Ndm2 = (G2 + Q + 0.2 * g.sds * G2) * g.kDeprem;
      const r = kontrol({ b, h, fck, Ndm: Ndm2, Nd: Nd2, katYuksekligi: H[k], kirissizAciklik: kirissizL });
      const nar = ['x', 'y'].map((yon, q) => katNarinlik({ bw: q ? b : h, hd: q ? h : b, ln, H: H[k], Nd: Nd2, Ngd: 1.4 * G2, fck,
        tutulu: yanal[yon].tutulu, alphaAlt: alfa(k, c, yon, true), alphaUst: alfa(k, c, yon, false), katOran: katOran?.[q] }));
      const M = ['x', 'y'].map(yon => Math.max(k < n - 1 ? moment(k, c, yon) : 0, k > 0 ? moment(k - 1, c, yon) : 0));
      const Gust = Math.max(0, G2 - b * h * H[k] / 1e9 * GAMMA_BA);
      const strongest = m => m > 0 ? { Mr: m, dugum: [[0.9 * G2, 0.9 * G2], [0.9 * Gust, 0.9 * Gust]] } : null;
      const bd0 = boyunaDonati(b, h, Nd2, mz, strongest(M[0]), strongest(M[1]), nar[0].beta ?? Infinity, nar[1].beta ?? Infinity), bd = bd0?.cubuk ? bd0 : null;
      // ponytail: eksenel kuvvetten bağımsız moment üst sınırı kullanılır; daha az etriye için gerçek N-M zarfı gerekir.
      const kesme = () => {
        if (kirissiz || !bd || H[k] <= beamH) return null;
        const net = (H[k] - beamH) / 1000, Nmin = 0; // Depremli minimum eksenel kuvvet bilinmediğinden sarılmada V_c = 0.
        const V = yon => {
          const bw = yon === 'x' ? h : b, hd = yon === 'x' ? b : h;
          const Mp = 1.4 * (0.85 * mz.fcd * bw * hd ** 2 / 8 + bd.cubuk.As * mz.fyd * hd / 2) / 1e6;
          const dugum = j => { const m = j < 0 ? 0 : 1.4 * moment(j, c, yon); return m > 0 ? Math.min(Mp, m) : Mp; };
          return (dugum(k - 1) + dugum(k)) / net;
        };
        return { VeX: V('x'), VeY: V('y'), Nmin };
      };
      let kes = kesme(), et = bd && (kirissiz || kes) && etriye(b, h, bd.cubuk.phi, Nd2, ln, mz, bd.nb, bd.nh, kes);
      for (let t = 0; t < 3 && bd && et?.nGerek; t++) {
        const A = alan(bd.cubuk.phi), nt = et.nGerek;
        if (!(nt * A <= 0.04 * b * h && et.nb <= kolonYuzMax(b, bd.cubuk.phi) && et.nh <= kolonYuzMax(h, bd.cubuk.phi))) { et = null; break; }
        Object.assign(bd, { cubuk: { ...bd.cubuk, n: nt, As: nt * A }, nb: et.nb, nh: et.nh });
        kes = kesme(); et = etriye(b, h, bd.cubuk.phi, Nd2, ln, mz, bd.nb, bd.nh, kes);
      }
      e = { ad: c.ad, aks: c.aks, i: c.i, j: c.j, b, h, NG: G2, NQ: Q, Nd: Nd2, Ndm: Ndm2, Nk: G2 + Q, ozel: sabit, tur: r.tur,
        maddeler: [...r.maddeler], iz: [`${k + 1}. kat: G = ${fmt(G2)} kN, βQ = ${fmt(Q)} kN; üst kat yükleri ve gerçek kat öz ağırlıkları biriktirildi.`] };
      madde(e, 'Boyuna donatı', bd ? `${bd.cubuk.n}φ${bd.cubuk.phi}` : 'yetmez', 'e_min ve her komşu düğüm için güçlü kolon', !!bd, 'TBDY 7.3.2, 7.3.5');
      if (H[k] <= beamH) madde(e, 'Net kolon yüksekliği', H[k] - beamH, '> 0 mm', false, 'geometri');
      const narOk = nar.every(x => x.lamMax <= 100 && x.durMax <= 1 && Number.isFinite(x.beta));
      madde(e, 'Narinlik', `λ X ${fmt(nar[0].lamMax)} / Y ${fmt(nar[1].lamMax)}`, 'λ ≤ 100; kat duraylılığı sağlanmalı', narOk, 'TS 500 7.6', Math.max(...nar.map(x => Math.max(x.lamMax / 100, x.durMax, Number.isFinite(x.beta) ? 0 : 2))));
      madde(e, 'Etriye', et && !et.nGerek ? `φ${et.phi}/${et.sSar} · φ${et.phi}/${et.sOrta}` : 'yetmez', 'sarılma ve orta bölge', !!et && !et.nGerek && et.kesme, 'TBDY 7.3.4');
      const brl = birlesim(k, c, b, h, false), belirleyen = brl.reduce((a, x) => !a || x.Ve / x.Vmax > a.Ve / a.Vmax ? x : a, null);
      if (belirleyen) madde(e, 'Birleşim kesmesi', belirleyen.Ve,
        `≤ ${fmt(belirleyen.Vmax)} kN (${belirleyen.kat}. düğüm, ${belirleyen.yon.toUpperCase()}, ${belirleyen.kus ? 'kuşatılmış' : 'kuşatılmamış'})`,
        brl.every(x => x.Ve <= x.Vmax + 1e-9), 'TBDY 7.5.1–7.5.2, Denk. 7.11–7.13', belirleyen.Ve / belirleyen.Vmax);
      if (belirleyen && et && !et.nGerek) {
        const kus = brl.every(x => x.kus), oran = kus ? 0.4 : 0.6, limit = kus ? 150 : 100;
        e.etrBirlesim = `φ${et.phi}/${Math.floor(Math.min(limit, et.sSar / oran) / 10) * 10}`;
        madde(e, 'Birleşim etriyesi', e.etrBirlesim, `sarılma etriyesinin ≥ %${oran * 100}'ı, aynı kollarla; s ≤ ${limit} mm`, true, 'TBDY 7.5.2.3');
      }
      if (kes) {
        Object.assign(e, { VeX: kes.VeX, VeY: kes.VeY });
        const V = Math.max(kes.VeX, kes.VeY), Vmax = 0.85 * b * h * Math.sqrt(fck) / 1000;
        madde(e, 'Kesme üst sınırı', V, `≤ ${fmt(Vmax)} kN`, V <= Vmax + 1e-9, 'TBDY 7.3.7.5', V / Vmax);
        const dir = et ? [[kes.VeX, et.VrSarX], [kes.VeY, et.VrSarY], [kes.VeX, et.VrOrtaX], [kes.VeY, et.VrOrtaY]] : [];
        const kul = dir.length ? Math.max(...dir.map(([v, vr]) => v / vr)) : Infinity;
        madde(e, 'Kolon kapasite kesmesi', V, 'V_e ≤ V_r, her iki doğrultuda ve sarılma/orta bölgede', !!et && !et.nGerek && et.kesme && kul <= 1 + 1e-9, 'TBDY 7.3.7; TS 500 8.1', kul);
      } else if (kirissiz) e.maddeler.push({ ad: 'Deprem kesmesi', deger: 'kesin hesapta', sinir: 'Kirişsiz sistemin deprem çözümlemesiyle denetlenmeli', gecti: false, kaynak: 'TBDY 7.3.7', kullanim: null, uyari: true });
      else madde(e, 'Kolon kapasite kesmesi', 'hesaplanamadı', 'Geçerli donatı ve net kolon boyu gerekli', false, 'TBDY 7.3.7');
      if (bd && et && !et.nGerek) Object.assign(e, { boyuna: `${bd.cubuk.n}φ${bd.cubuk.phi}`, nb: bd.nb, nh: bd.nh,
        boyunaMajor: `${b <= h ? bd.nb : bd.nh}φ${bd.cubuk.phi}/yüz${b === h ? ' (b, kare)' : ' (kısa yüz)'}`,
        boyunaMinor: `${b <= h ? bd.nh : bd.nb}φ${bd.cubuk.phi}/yüz${b === h ? ' (h, kare)' : ' (uzun yüz)'}`,
        etrSar: `φ${et.phi}/${et.sSar}`, etrOrta: `φ${et.phi}/${et.sOrta}`, kol: `${et.kx}×${et.ky}` });
      if (kes) e.iz.push(`Kapasite kesmesi: N-M zarfının beton ve tüm boyuna çubuklar için moment üst sınırıyla X ${fmt(kes.VeX)} / Y ${fmt(kes.VeY)} kN; net boy ${fmt(H[k] - beamH)} mm. Depremli minimum eksenel kuvvet bilinmediğinden sarılmada V_c = 0.`);
      if (bd && et && !et.nGerek) e.iz.push('Majör/minör bir yüzdeki çubukları gösterir; köşe çubukları iki yüzün sayımında ortak, toplamda tektir.');
      e.narinlik = nar; sonla(e);
      const kontrolEdilen = e.maddeler.every(m => m.gecti || m.uyari);
      if (sabit || kontrolEdilen || bd0?.enAz || step === 29) break;
      const narM = e.maddeler.find(m => m.ad === 'Narinlik');
      if (!narM.gecti) {
        if (!narEn || narM.kullanim < narEn.kul - 1e-3) { narEn = { kul: narM.kullanim, e }; narBos = 0; }
        else if (++narBos >= 3) { e = narEn.e; e.iz.push('Kolon kesitini büyütmek narinliği iyileştirmiyor; kiriş rijitliği yeniden değerlendirilir.'); break; }
      } else { narEn = null; narBos = 0; }
      ({ b, h } = buyut({ b, h }));
    }
    return e;
  };
  let yakin = false;
  for (let tur = 0; tur < 20; tur++) {
    const once = new Map(pkal);
    hesapKirisler(); yuk(); yanal = yanalBul();
    const ilk = katlar.map((kat, k) => kolonListe.map(c => tasarla(k, c)));
    const oran = ilk.map(satir => [0, 1].map(q => {
      const Nk = satir.reduce((t, e) => t + (e.narinlik[q].NkS ?? 0), 0);
      return Nk > 0 ? satir.reduce((t, e) => t + e.Nd, 0) / Nk : 0;
    }));
    const yeni = katlar.map((kat, k) => kolonListe.map(c => tasarla(k, c, oran[k])));
    yakin = yeni.every((satir, k) => satir.every(e => { const o = boyut[k].get(e.ad); return e.b === o.b && e.h === o.h; })) &&
      [...pkal].every(([ad, bw]) => once.get(ad) === bw);
    yeni.forEach((satir, k) => { katlar[k].kolonlar = satir; boyut[k] = new Map(satir.map(e => [e.ad, { b: e.b, h: e.h }])); });
    let sert = false;
    for (const [k, satir] of yeni.entries()) for (const e of satir) for (const [q, nar] of e.narinlik.entries()) {
      if (yanal[q ? 'y' : 'x'].tutulu || (nar.lamMax <= 100 && nar.durMax <= 1 && Number.isFinite(nar.beta))) continue;
      const hi = q ? hatY(e.i) : hatX(e.j), hat = ag.hatlar[hi];
      if (g.kirisOzel?.[hat.aks]?.h != null) continue;
      const h0 = Math.max(0, ...katlar[k].kirisler.filter(x => x.hat === hi).map(x => x.h));
      if (h0 && h0 + 50 <= 1000 && (hEk[k].get(hi) ?? 0) < h0 + 50) { hEk[k].set(hi, h0 + 50); sert = true; }
    }
    if (sert) yakin = false;
    if (yakin) break;
  }
  // Son boyutlar için kiriş tepkilerini ve tüm üst kat yüklerini yeniden oluştur.
  const sonPerde = new Map(pkal);
  hesapKirisler(); yuk(); yanal = yanalBul();
  if ([...pkal].some(([ad, bw]) => sonPerde.get(ad) !== bw)) yakin = false;
  const ilk = katlar.map((kat, k) => kolonListe.map(c => tasarla(k, c)));
  const oran = ilk.map(satir => [0, 1].map(q => {
    const Nk = satir.reduce((t, e) => t + (e.narinlik[q].NkS ?? 0), 0);
    return Nk > 0 ? satir.reduce((t, e) => t + e.Nd, 0) / Nk : 0;
  }));
  const ort = ([...katlar[0].yukler.values()].reduce((t, y) => t + y.G + y.Q, 0) +
    katlar[0].perdeler.reduce((t, p) => t + p.NG + katlar[0].perdeHamQ.get(p.ad), 0)) / Math.max(1, n * plan);
  katlar.forEach((kat, k) => { kat.kolonlar = kolonListe.map(c => tasarla(k, c, oran[k])); });
  if (katlar.some((kat, k) => kat.kolonlar.some(e => { const o = boyut[k].get(e.ad); return e.b !== o.b || e.h !== o.h; }))) yakin = false;
  if (katlar.some((kat, k) => [0, 1].some(q => {
    const Nk = kat.kolonlar.reduce((t, e) => t + (e.narinlik[q].NkS ?? 0), 0);
    const son = Nk > 0 ? kat.kolonlar.reduce((t, e) => t + e.Nd, 0) / Nk : 0;
    return Math.abs(son - oran[k][q]) > 1e-6;
  }))) yakin = false;
  // Son durumda birleşim kesmesi her iki katın gerçek ortak kesitiyle yeniden doğrulanır.
  katlar.forEach((kat, k) => kat.kolonlar.forEach(e => {
    const c = ag.kolonlar.find(x => x.ad === e.ad), brl = birlesim(k, c, e.b, e.h);
    const belirleyen = brl.reduce((a, x) => !a || x.Ve / x.Vmax > a.Ve / a.Vmax ? x : a, null);
    const m = e.maddeler.find(x => x.ad === 'Birleşim kesmesi');
    if (m && belirleyen) Object.assign(m, { deger: belirleyen.Ve,
      sinir: `≤ ${fmt(belirleyen.Vmax)} kN (${belirleyen.kat}. düğüm, ${belirleyen.yon.toUpperCase()}, ${belirleyen.kus ? 'kuşatılmış' : 'kuşatılmamış'})`,
      gecti: brl.every(x => x.Ve <= x.Vmax + 1e-9), kullanim: belirleyen.Ve / belirleyen.Vmax });
    sonla(e);
  }));
  katlar.forEach(kat => {
    for (const p of kat.perdeler) perdeKismiDenetle(p, ag, c => kat.kolonlar.find(e => e.ad === c.ad) ?? duvarOlcu(c.ad));
    if (!yakin) for (const e of [...kat.kolonlar, ...kat.kirisler, ...kat.dosemeler, ...kat.perdeler, ...(kat.seritler ?? []), ...(kat.zimbD ?? [])]) { madde(e, 'Yakınsama', 'sağlanmadı', 'Kat boyutları ve yükleri yakınsamalı', false, 'hesap'); sonla(e); }
    kat.seritler ??= []; kat.zimbD ??= [];
    delete kat.tepki; delete kat.yukler; delete kat.perdeYuk; delete kat.perdeHamQ; delete kat.flatYukler;
  });
  const taban = katlar[0], rd = radyeBul(ag, g, mz, taban.kolonlar.map(c => ({ ...ag.kolonlar.find(a => a.ad === c.ad), b: c.b, h: c.h, Nd: c.Nd })), taban.perdeler);
  if (!yakin) for (const e of [rd.radye, ...rd.seritler, ...rd.zimb, ...rd.perde]) { madde(e, 'Yakınsama', 'sağlanmadı', 'Kat boyutları ve yükleri yakınsamalı', false, 'hesap'); sonla(e); }
  const notlar = ['Katlar ayrı yükseklik ve kesitlerle hesaplandı; kat yükleri üstten alta biriktirildi.',
    'Kolon kapasite kesmesinde eksenel kuvvetten bağımsız, güvenli yanda moment üst sınırı kullanıldı.',
    'Deprem etkileri, perde kesme dayanımı ve kesin taşıyıcı sistem analizi bu ön hesapta bulunmaz.'];
  if (rd.subasmanlar.length) notlar.push('Su basman perdelerinin öz ağırlığı radye ön hesabına eklendi. Toprak ve su basıncı, donatı ve temel bağlantısı ayrıca hesaplanmalı.');
  if (pd.bay.size && g.yanalTutulu !== true) notlar.push(`Perdeli katlı hesapta yanal ötelenme: X ${yanal.x.tutulu ? 'önlenmiş' : 'önlenmemiş'}, Y ${yanal.y.tutulu ? 'önlenmiş' : 'önlenmemiş'}; perde elastik konsol kabulü, deprem analiziyle ayrıca denetlenmeli.`);
  if (kirissiz) notlar.push('Kirişsiz döşemede deprem etkilerinin perdelerle karşılanması ve kolon deprem kesmesi kesin hesapta denetlenmeli.');
  if (kirissiz && Math.min(ag.nx, ag.ny) < 3) notlar.push('Kirişsiz döşemede moment katsayıları en az üç açıklık ister; daha az açıklıkta çerçeve yöntemiyle kesin hesap yapılmalı.');
  if (kirissiz && pd.bay.size) notlar.push('Perde açıklıklarında döşeme şerit ve sehim hesabı yaklaşık olarak kolon şeridi yöntemiyle yapıldı; perde çizgisel mesnet kabulü kesin hesapta denetlenmeli.');
  const kisaPerdeler = pd.perdeler.filter(p => p.kismi);
  if (kisaPerdeler.length) notlar.push(`Kısa perdeler (${kisaPerdeler.map(p => p.ad).join(', ')}): çerçeve korunarak yalnız perde öz ağırlığı radyeye eklendi. Perde ile kiriş ve döşeme arasındaki yük aktarımı ve yanal rijitlik ayrıca çözülmeli.`);
  for (const kat of katlar) if (kat.kalkma.length) notlar.push(`${kat.kat}. kat ${kat.kalkma.join(', ')}: kısa uç açıklığında mesnet kalkıyor; kolon yükü alan payıyla alındı.`);
  const katKolonYukleri = katlar.flatMap(kat => kat.kolonlar.map(c => ({ kat: kat.kat, ad: c.ad, aks: c.aks, NG: c.NG, NQ: c.NQ, Nd: c.Nd })));
  return { ag, tur: g.dosemeTuru, katSayisi: n, beta: beta(g.kullanim, n), h: taban.h, tabla: taban.tabla, katYukAlan: ort, katKolonYukleri,
    dosemeler: taban.dosemeler, seritler: taban.seritler, zimbD: taban.zimbD, kirisler: taban.kirisler, kolonlar: taban.kolonlar, perdeler: taban.perdeler,
    radye: rd.radye, radyeSerit: rd.seritler, radyeZimb: rd.zimb, radyePerde: rd.perde, subasmanlar: rd.subasmanlar, katlar, notlar,
    yanal };
}
