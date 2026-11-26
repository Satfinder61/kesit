// Radye (kirişsiz plak) temel. Birimler: m (plan), mm (kalınlık), kN, kN/m², kNm.
// Kalınlık: h ≥ 300 mm (TS 500 10.4.2), zımbalama donatısız sağlanmalı (10.4.2, 8.3.1), kolon yüzünde kesme Vd ≤ 0,8·Vcr (8.1.4).
// Zemin: q_o ≤ q_t = q_k/1,4 katsayılı yükle (TBDY 16.8.3.1); radye ve üstündeki dolgu ağırlığı 1,4 ile.
// Momentler: ters kirişsiz döşeme, TS 500 11.4.4.2 katsayıları ve kolon/orta şeritleri (yorum: TS 500 radye için yöntem vermez,
// 10.4.2 doğrusal zemin basıncına izin verir). Kenar taşmasında konsol momenti p·l2·a²/2.
import { ddmCerceveler, seritDonati, zimbalama } from './doseme.js';

const TOL = 1e-9;
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);
const GAMMA_BA = 25, GAMMA_DOLGU = 20;
const madde = (e, ad, deger, sinir, gecti, kaynak, kullanim = null) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim, uyari: false });
const sonla = e => {
  e.belirleyici = e.maddeler.reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti);
  return e;
};
const cy = c => `φ${c.phi}/${c.s}`;

// kolonlar: [{ ad, aks, i, j, b, h, Nd }] (mm, kN; tüm katlar). Taşma a: aks dışına (m), g.tasma en küçük değer.
// perdeler: [{ ad, aks, yon, no, bw, lw, Nd, dugumler }] (perde.js): yükü radyeye çizgisel iner; perde ucunda zımbalama aranmaz
// (uç bölgesi tekil kolon gibi zımbalamaz), perde boyunca tek doğrultulu kesme denetlenir. Perde düğümleri şerit açıklığında b_w × b_w.
// g.radyeOzel = { h? (mm), a? (m) }: elle verilen kalınlık ve taşma boyutlandırılmaz, yalnız denetlenir.
export function radyeBul(ag, g, mz, kolonlar, perdeler = []) {
  const W = ag.xs.at(-1), L = ag.ys.at(-1), qt = g.zemin / 1.4, SNd = kolonlar.reduce((t, c) => t + c.Nd, 0) + perdeler.reduce((t, p) => t + p.Nd, 0);
  const dugum = new Map(), { h: hS, a: aS } = g.radyeOzel ?? {};
  for (const p of perdeler) for (const ad of p.dugumler) dugum.set(ad, Math.max(dugum.get(ad) ?? 0, p.bw));
  const olcu = c => kolonlar.find(k => k.ad === c.ad) ?? { b: dugum.get(c.ad), h: dugum.get(c.ad) };
  // Taşma en az kenar kolonun dış yüzüne kadar (yoksa kolon radye dışına taşar, zımbalama çevresi yanlış olur)
  const aYuz = Math.max(...kolonlar.map(c => Math.max(c.b, c.h)), ...perdeler.map(p => p.bw)) / 2000;
  let son;
  for (let h = hS ?? 300; h <= (hS ?? 3000); h += 50) {
    // Zemin: taşmayı 0,25 m adımla büyüt
    const yuk = 1.4 * (GAMMA_BA * h / 1000 + GAMMA_DOLGU * Math.max(0, g.Df - h / 1000)); // kN/m²
    let a = aS ?? Math.max(g.tasma, Math.ceil(aYuz * 1000 / 50) * 0.05), A, qo;
    for (;; a += 0.25) { A = (W + 2 * a) * (L + 2 * a); qo = SNd / A + yuk; if (aS != null || qo <= qt + TOL || a + 0.25 > 10 + TOL) break; } // en çok 10 m
    const p = SNd / A;                                                    // net katsayılı zemin tepkisi (öz ağırlık dengede)
    const d = h - 70;                                                     // iki doğrultu ortalaması: örtü 50 + φ
    const zimb = kolonlar.map(c => {
      const kx = c.i === 0 || c.i === ag.nx ? a - c.b / 2000 : Infinity, ky = c.j === 0 || c.j === ag.ny ? a - c.h / 2000 : Infinity;
      const z = zimbalama({ V: c.Nd, p, b: c.b, hk: c.h, d, kx: Math.max(kx, 0), ky: Math.max(ky, 0), fctd: mz.fctd });
      const e = { ad: c.ad.replace('S', 'T'), kolon: c.ad, aks: c.aks, i: c.i, j: c.j, Nd: c.Nd, d, ...z, maddeler: [] };
      madde(e, 'Zımbalama', z.Vpd, `≤ γ·fctd·u_p·d = ${tr(z.Vpr, 0)} kN`, z.Vpd <= z.Vpr + TOL, 'TS 500 8.3.1, 10.4.2 (donatısız)', z.Vpd / z.Vpr);
      e.iz = [`N_d = ${tr(c.Nd, 0)} kN, p = ΣN_d/A = ${tr(p, 1)} kN/m², d = ${d} mm`,
        `u_p = ${tr(z.up, 3)} m${z.acik ? ' (serbest kenara açık çevre, TS 500 Şekil 8.5)' : ''}, çevre içi ${tr(z.Ap, 3)} m²`,
        `V_pd = N_d − p·A_p = ${tr(z.Vpd, 0)} kN; γ = ${tr(z.gam, 3)} (kolon momenti yok sayıldı)`];
      return sonla(e);
    });
    const cerceve = ddmCerceveler(ag, p, h, mz, olcu, { radye: true, tasma: a });
    const seritler = cerceve.map(c => {
      const sd = seritDonati(c, h, mz, { radye: true });
      const vSinir = 0.8 * 0.65 * mz.fctd * sd.d, v = p * Math.max(c.ln / 2, a);   // kN/m: kolon yüzünde tek doğrultulu kesme
      const e = { ad: `R${c.yon.toUpperCase()}${c.hatNo + 1}-${c.k + 1}`, aks: c.yon === 'x' ? `${String.fromCharCode(65 + c.hatNo)} / ${c.k + 1}–${c.k + 2}` : `${c.hatNo + 1} / ${String.fromCharCode(65 + c.k)}–${String.fromCharCode(66 + c.k)}`,
        yon: c.yon, l1: c.l1, l2: c.l2, Mo: c.Mo, cs: c.cs, ms: c.ms, maddeler: [],
        csAlt: cy(sd.cCsN), csUst: cy(sd.cCsP), msAlt: cy(sd.cMsN), msUst: cy(sd.cMsP) };
      madde(e, 'Eğilme', sd.yetmez ? 'yetmez' : 'yeter', 'kesit momenti karşılamalı', !sd.yetmez, 'TS 500 7.1', sd.kul);
      madde(e, 'Donatı aralığı', `${cy(sd.cCsN)} / ${cy(sd.cCsP)} / ${cy(sd.cMsN)} / ${cy(sd.cMsP)}`, 'net aralık ≥ max(φ; 4/3·Dmax; 25 mm), Dmax 22 mm', sd.kod, 'TS 500 9.5.2', sd.kod ? null : 2);
      e.minKod = sd.minKod;
      madde(e, 'Kolon yüzünde kesme', v, `≤ 0,8·0,65·fctd·d = ${tr(vSinir, 1)} kN/m`, v <= vSinir, 'TS 500 10.4.2, 8.1.4', v / vSinir);
      e.iz = [`M_o = p·ℓ2·ℓn²/8 = ${tr(p, 1)}·${tr(c.l2)}·${tr(c.ln)}²/8 = ${tr(c.Mo, 1)} kNm (TS 500 Denk. 11.4, ters döşeme; yorum)`,
        `Katsayılar: dış/iç mesnet ${tr(c.cA)}/${tr(c.cB)}, açıklık ${tr(c.cP)}; kolon şeridi ${tr(c.cs)} m, orta şerit ${tr(c.ms)} m`,
        `Kolon altında alt yüz, açıklıkta üst yüz çekmede; her yüzde ≥ diğerinin 1/3'ü (TS 500 10.4.3), her doğrultuda ρ ≥ 0,00175`];
      return sonla(e);
    });
    // Perde boyunca tek doğrultulu kesme (yorum): perde yükü q_w = N_d/ℓw kendi etki genişliğinde zemine yayılır (iki yanda komşu açıklığın
    // yarısı, kenarda taşma: Σb), p_w = max(p; q_w/Σb); kesme perde yüzünden d uzakta (TS 500 8.1.2, doğrudan mesnet), Vc = 0,8·Vcr (8.1.4).
    const perde = perdeler.map(pr => {
      const qw = pr.Nd / (pr.lw / 1000), bw = pr.bw / 1000, dik = pr.yon === 'x' ? ag.ay : ag.ax;
      const yan = [dik[pr.no - 1], dik[pr.no]].map(l => l == null ? a : l / 2), pw = Math.max(p, qw / (yan[0] + yan[1]));
      const v = pw * Math.max(0, Math.max(...yan) - bw / 2 - d / 1000), vSinir = 0.8 * 0.65 * mz.fctd * d;
      const e = { ad: 'R' + pr.ad, perde: pr.ad, aks: `${pr.aks} (${pr.ad})`, yon: pr.yon, l1: pr.lw / 1000, qw, v, maddeler: [] };
      madde(e, 'Perde yüzünde kesme', v, `≤ 0,8·0,65·fctd·d = ${tr(vSinir, 1)} kN/m`, v <= vSinir + TOL, 'TS 500 10.4.2, 8.1.2, 8.1.4', v / vSinir);
      e.iz = [`Perde N_d = ${tr(pr.Nd, 0)} kN, ℓw = ${tr(pr.lw, 0)} mm → q_w = ${tr(qw, 1)} kN/m; p = ΣN_d/A = ${tr(p, 1)} kN/m², d = ${d} mm`,
        `Etki genişliği ${yan.map(x => tr(x)).join(' + ')} m (komşu açıklık yarısı${yan.includes(a) ? ', kenarda taşma' : ''}) → p_w = max(p; q_w/Σb) = ${tr(pw, 1)} kN/m²; ` +
          `v = p_w·(${tr(Math.max(...yan))} − b_w/2 − d) = ${tr(v, 1)} kN/m (yüzden d uzakta, TS 500 8.1.2)`,
        'Perde ucunda zımbalama aranmadı: perde yükü radyeye çizgisel aktarılır (uç bölgesi tekil kolon gibi zımbalamaz); kesme perde boyunca denetlendi'];
      return sonla(e);
    });
    son = { h, a, Bx: W + 2 * a, By: L + 2 * a, A, qo, qt, p, SNd, zimb, seritler, perde };
    if (qo <= qt + TOL && zimb.every(e => e.gecti) && seritler.every(e => e.gecti) && perde.every(e => e.gecti)) break;
    if (seritler.some(e => !e.minKod)) break; // en az donatı φ16 ile TS 500 9.5.2 aralığına sığmıyor: kalınlaştırmak çözmez
  }
  const r = son, e = { ad: 'Radye', aks: `${tr(r.Bx)} × ${tr(r.By)} m`, h: r.h, a: r.a, Bx: r.Bx, By: r.By, A: r.A, qo: r.qo, qt: r.qt, maddeler: [] };
  madde(e, 'Zemin taban basıncı', r.qo, `≤ q_t = q_k/1,4 = ${tr(r.qt, 0)} kN/m²`, r.qo <= r.qt + TOL, 'TBDY 16.8.3.1, Denk. 16.6–16.7', r.qo / r.qt);
  madde(e, 'Radye kalınlığı', r.h, '≥ 300 mm', r.h >= 300, 'TS 500 10.4.2', hS != null ? 300 / r.h : null);
  if (aS != null) { const aMin = Math.max(g.tasma, aYuz);
    madde(e, 'Radye taşması', r.a, `≥ max(girilen en az taşma; kenar kolon/perde yarısı) = ${tr(aMin)} m (elle verildi)`, r.a >= aMin - TOL, 'geometri', r.a > 0 ? aMin / r.a : 2); }
  e.iz = [`ΣN_d = ${tr(r.SNd, 0)} kN${perdeler.length ? ` (kolonlar + ${perdeler.length} perde)` : ''}; taşma a = ${tr(r.a)} m (aks dışına${aS != null ? ', elle verildi' : ''}) → ${tr(r.Bx)} × ${tr(r.By)} m = ${tr(r.A, 1)} m²`,
    `q_o = ΣN_d/A + 1,4·(${GAMMA_BA}·h + ${GAMMA_DOLGU}·(D_f − h)) = ${tr(r.qo, 0)} kN/m² ${r.qo <= r.qt + TOL ? '≤' : '>'} q_t = ${tr(r.qt, 0)} kN/m²`,
    hS != null ? `Kalınlık ${r.h} mm elle verildi: araç kalınlığı boyutlandırmadı, zımbalama ve kesme bu kalınlıkla denetlendi`
      : `Kalınlık ${r.h} mm: zımbalama donatısız ve kolon${perdeler.length ? '/perde' : ''} yüzü kesmesi sağlanana dek 50 mm adımla artırıldı`];
  if (hS != null || aS != null) e.ozel = { h: hS != null, a: aS != null };
  if (hS == null && r.h >= 3000 && !(r.qo <= r.qt + TOL && r.zimb.every(x => x.gecti) && r.seritler.every(x => x.gecti) && r.perde.every(x => x.gecti))) e.iz.push('h = 3.000 mm sınırına ulaşıldı; zımbalama, kesme ya da donatı koşulları sağlanamadı');
  if (r.seritler.some(s => !s.minKod)) e.iz.push(`h = ${r.h} mm'de durduruldu: en az donatı (0,00175·h) φ16 ile TS 500 9.5.2 aralığına sığmıyor; kalınlaştırmak çözmez, daha büyük çap ya da iki sıra donatı gerekir`);
  return { radye: sonla(e), zimb: r.zimb, seritler: r.seritler, perde: r.perde, p: r.p };
}
