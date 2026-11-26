// 3B bina modeli (sira.html «3B», bina.html): hesap sonucundan (zincirHesap; katlıda katlar[]) eleman kutuları, aks çizgileri,
// temsili donatı ve bilgi kartı. three.js'siz ve saf (Node'da sınanır); çizim bina3b.js'te. Hesap motoruna dokunmaz.
// Plan koordinatı: x doğu, y kuzey, z yukarı, metre. Kutu: { c: [x, y, z] merkez, u: [ux, uy] plandaki boy doğrultusu (birim),
// a, b, h: boy (u), en (u'ya dik) ve yükseklik yarı ölçüleri }.
// ponytail: donatı temsili (adet, çap, aralık hesaptan; bindirme, kanca, ara etriye kolları, şerit farkları yok); kesin projede çizilir.
import { bicim } from './bicim.js';

const m = v => v / 1000;
const tr = (x, d = 2) => Number.isFinite(x) ? bicim(x, d) : '—';
const ORTU = 25, ORTU_D = 20; // kolon/kiriş/perde (kolon.js, kiris.js, perde.js) ve döşeme/radye paspayı, mm

export const kutu = (x0, x1, y0, y1, z0, z1) => ({ c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], u: [1, 0], a: Math.abs(x1 - x0) / 2, b: Math.abs(y1 - y0) / 2, h: Math.abs(z1 - z0) / 2 });
// p → q doğrultusunda, plan genişliği gen olan kutu (kiriş, perde; eğik kiriş dahil)
export const hatKutu = (p, q, gen, z0, z1) => {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1e-9;
  return { c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (z0 + z1) / 2], u: [dx / L, dy / L], a: L / 2, b: gen / 2, h: (z1 - z0) / 2 };
};

// "6φ14", "φ10/80", "tabla φ8/250", "2φ14 / 2φ14" (ilki), "3φ14/yüz (b, kare)" → { n, phi, s }; çubuk yoksa (0, '—') null
const CUBUK = /(\d+)?\s*φ\s*(\d+)(?:\s*\/\s*(\d+)(?!\s*φ))?/;
export function cubukOku(y) {
  const t = String(y ?? '').match(CUBUK);
  return t ? { n: t[1] ? +t[1] : 1, phi: +t[2], s: t[3] ? +t[3] : null } : null;
}

const gecmez = l => (l ?? []).filter(e => e && e.gecti === false);

// ── Model: elemanlar { ad, tip, kat (0 temel), gecti, neden[], kutular[], e (hesap satırı), geo (donatı için) }
export function binaModeli(r, g) {
  const ag = r.ag, n = r.katlar?.length || r.katSayisi || g.katSayisi;
  const H = (r.katlar?.length ? r.katlar.map((k, i) => k.H ?? g.katYukseklikleri?.[i] ?? g.H) : g.katYukseklikleri ?? Array(n).fill(g.H)).map(m);
  const z = [0]; for (const h of H) z.push(z.at(-1) + h);
  const yer = new Map(ag.kolonlar.map(c => [c.ad, c]));
  const W = ag.xs.at(-1), L = ag.ys.at(-1), katli = !!r.katlar?.length, kirissiz = r.tur === 'kirissiz';
  const elemanlar = [];
  const ekle = (el, kotu = []) => { el.neden = kotu.map(x => x.ad); el.gecti = el.e?.gecti !== false && !kotu.length; elemanlar.push(el); };

  // Temel: radye (şerit, zımbalama ve radye perde satırları radyenin durumuna katılır), su basman perdeleri
  const rd = r.radye, a = rd.a ?? 0, hr = m(rd.h);
  ekle({ ad: 'Radye', tip: 'radye', kat: 0, e: rd, kutular: [kutu(-a, W + a, -a, L + a, -hr, 0)], geo: { x0: -a, x1: W + a, y0: -a, y1: L + a, z0: -hr, z1: 0, seritler: r.radyeSerit ?? [] } },
    [...gecmez(r.radyeSerit), ...gecmez(r.radyeZimb), ...gecmez(r.radyePerde)]);
  for (const p of r.subasmanlar ?? []) {
    if (!(p.L > 0)) continue;
    const [u, v] = p.yon === 'x' ? [[p.bas, ag.ys[p.no]], [p.son, ag.ys[p.no]]] : [[ag.xs[p.no], p.bas], [ag.xs[p.no], p.son]];
    ekle({ ad: p.ad, tip: 'subasman', kat: 0, e: p, kutular: [hatKutu(u, v, m(p.bw), 0, m(p.h))], geo: {} });
  }

  for (let k = 1; k <= n; k++) {
    const f = katli ? r.katlar[k - 1] : r, z0 = z[k - 1], z1 = z[k];
    const kirisH = kirissiz ? m(f.dosemeler[0]?.h ?? 0) : m(Math.max(0, ...f.kirisler.map(e => e.h)));
    const ic = kirissiz ? 0 : m(Math.max(0, ...f.kirisler.map(e => e.b))) / 2; // döşeme kiriş yarı genişliği kadar içeride (üst yüzler çakışmasın)
    for (const c of f.kolonlar) {
      const p = yer.get(c.ad); if (!p || p.sil) continue;
      const zimb = kirissiz ? gecmez([f.zimbD?.find(t => t.ad === c.ad.replace('S', 'Z'))]) : [];
      ekle({ ad: c.ad, tip: 'kolon', kat: k, e: c, kutular: [kutu(p.x - m(c.b) / 2, p.x + m(c.b) / 2, p.y - m(c.h) / 2, p.y + m(c.h) / 2, z0, z1)], geo: { x: p.x, y: p.y, z0, z1, kirisH } }, zimb);
    }
    for (const e of f.kirisler) {
      const hat = ag.hatlar[e.hat], egik = e.p0 && (hat.yon === 'x' ? e.p0[1] !== e.p1[1] : e.p0[0] !== e.p1[0]);
      const [p, q] = egik ? [e.p0, e.p1] : hat.yon === 'x' ? [[e.x0, ag.ys[hat.no]], [e.x1, ag.ys[hat.no]]] : [[ag.xs[hat.no], e.x0], [ag.xs[hat.no], e.x1]];
      ekle({ ad: e.ad, tip: 'kiris', yon: hat.yon, kat: k, e, kutular: [hatKutu(p, q, m(e.b), z1 - m(e.h), z1)], geo: { p, q, z1 } });
    }
    const seritKotu = kirissiz ? gecmez(f.seritler) : [];
    for (const d of f.dosemeler) {
      const x0 = ag.xs[d.i] + ic, x1 = ag.xs[d.i + 1] - ic, y0 = ag.ys[d.j] + ic, y1 = ag.ys[d.j + 1] - ic, h = m(d.h);
      const kutular = [], disler = [];
      if (d.tur === 'disli' || d.tur === 'kaset') { // tabla + diş (diş aralığı, genişliği girdiden)
        const t = m(d.t ?? r.tabla ?? 70), s = m(g.disAralik ?? 500), w = m(g.disGen ?? 120);
        kutular.push(kutu(x0, x1, y0, y1, z1 - t, z1));
        const yonler = d.tur === 'kaset' ? ['x', 'y'] : [/Y/.test(d.durum) ? 'y' : 'x'];
        for (const yon of yonler) { // yon: dişin uzandığı doğrultu, diğer doğrultuda aralıkla dizilir
          const [a0, a1] = yon === 'x' ? [y0, y1] : [x0, x1], adet = Math.max(1, Math.round((a1 - a0) / s));
          for (let i = 0; i < adet; i++) {
            const o = a0 + (i + 0.5) * (a1 - a0) / adet;
            disler.push({ yon, o });
            kutular.push(yon === 'x' ? kutu(x0, x1, o - w / 2, o + w / 2, z1 - h, z1 - t) : kutu(o - w / 2, o + w / 2, y0, y1, z1 - h, z1 - t));
          }
        }
      } else kutular.push(kutu(x0, x1, y0, y1, z1 - h, z1));
      ekle({ ad: d.ad, tip: 'doseme', kat: k, e: d, kutular, geo: { x0, x1, y0, y1, z0: z1 - h, z1, disler, seritler: kirissiz ? f.seritler ?? [] : null } }, seritKotu);
    }
    for (const p of f.perdeler ?? []) {
      const hat = ag.hatlar[p.hi], x = hat.yon === 'x';
      const c = x ? [(ag.xs[p.k0] + ag.xs[p.k1 + 1]) / 2, ag.ys[hat.no]] : [ag.xs[hat.no], (ag.ys[p.k0] + ag.ys[p.k1 + 1]) / 2];
      const u = x ? [1, 0] : [0, 1], yarim = m(p.lw) / 2;
      ekle({ ad: p.ad, tip: 'perde', kat: k, e: p, kutular: [hatKutu([c[0] - u[0] * yarim, c[1] - u[1] * yarim], [c[0] + u[0] * yarim, c[1] + u[1] * yarim], m(p.bw), z0, z1)], geo: { c, u, z0, z1 } });
    }
  }

  // Aks çizgileri (radye üstünde) ve balonlar (radyenin dışında)
  const pay = a + 1.2, aksAd = (yon, no) => ag.hatlar.find(h => h.yon === yon && h.no === no)?.aks;
  const aks = [
    ...ag.xs.map((x, i) => ({ yazi: aksAd('y', i) ?? String(i + 1), p: [x, -pay], q: [x, L + pay] })),
    ...ag.ys.map((y, j) => ({ yazi: aksAd('x', j) ?? String.fromCharCode(65 + j), p: [-pay, y], q: [W + pay, y] })),
  ];
  const uygunDegil = [...new Set(elemanlar.filter(e => !e.gecti).map(e => katli && e.kat ? `${e.ad} (${e.kat}. kat)` : e.ad))];
  return { elemanlar, aks, z, katli, katSayisi: n, sinir: { x0: -pay, x1: W + pay, y0: -pay, y1: L + pay, z0: -hr, z1: z.at(-1) }, uygunDegil };
}

// ── Temsili donatı: [{ a: [x, y, z], b: [x, y, z], r, tur: 'boyuna' | 'etriye' }] (r: çubuk yarıçapı, m)
const sinirli = l => l.slice(0, 4000); // ponytail: çok büyük radyede çizim sınırı
const cubukEkle = (l, a, b, phi, tur = 'boyuna') => l.push({ a, b, r: m(phi) / 2, tur });
const dortgen = (l, k, phi) => { for (let i = 0; i < 4; i++) cubukEkle(l, k[i], k[(i + 1) % 4], phi, 'etriye'); };
const yay = (n, ua, ub) => Array.from({ length: n }, (_, i) => n > 1 ? ua + (ub - ua) * i / (n - 1) : (ua + ub) / 2);
// a…b arasında s aralıklı konumlar (ilk ve son a + ilk, b − ilk)
const dizi = (a, b, s, ilk = 0.05) => { const l = []; if (!(s > 0)) return l; for (let t = a + ilk; t <= b - ilk + 1e-9; t += s) l.push(t); return l; };

function kolonDonati({ e, geo: { x, y, z0, z1, kirisH } }) {
  const L = cubukOku(e.boyuna), es = cubukOku(e.etrSar), eo = cubukOku(e.etrOrta) ?? es, eb = cubukOku(e.etrBirlesim) ?? es, l = [];
  if (!L) return l;
  const phiE = es?.phi ?? 8, c = m(ORTU + phiE + L.phi / 2), bx = m(e.b) / 2 - c, by = m(e.h) / 2 - c;
  const nb = Math.max(2, e.nb ?? 2), nh = Math.max(2, e.nh ?? 2); // nb: b yüzlerinde (X boyunca), nh: h yüzlerinde (Y boyunca), köşeler ortak
  for (const t of yay(nb, -bx, bx)) for (const s of [-by, by]) cubukEkle(l, [x + t, y + s, z0], [x + t, y + s, z1], L.phi);
  for (const t of yay(nh, -by, by).slice(1, -1)) for (const s of [-bx, bx]) cubukEkle(l, [x + s, y + t, z0], [x + s, y + t, z1], L.phi);
  if (![es, eo, eb].every(x => x?.s > 0)) return l; // aralık yok ya da 0 (motor 'φ10/0' yazabilir): etriye çizilmez, döngü ilerlemezdi
  const ce = m(ORTU + phiE / 2), ex = m(e.b) / 2 - ce, ey = m(e.h) / 2 - ce, zt = z1 - kirisH, sar = m(e.sarBoy ?? 500);
  for (let t = z0 + 0.05; t <= z1 - 0.03; ) {
    dortgen(l, [[x - ex, y - ey, t], [x + ex, y - ey, t], [x + ex, y + ey, t], [x - ex, y + ey, t]], phiE);
    t += m(t >= zt ? eb.s : t < z0 + sar || t >= zt - sar ? es.s : eo.s);
  }
  return l;
}

function kirisDonati({ e, geo: { p, q, z1 } }) {
  const l = [], dx = q[0] - p[0], dy = q[1] - p[1], Lb = Math.hypot(dx, dy), u = [dx / Lb, dy / Lb], v = [-u[1], u[0]];
  const es = cubukOku(e.etrSar), eo = cubukOku(e.etrOrta) ?? es, phiE = es?.phi ?? 8;
  const nok = (s, w, zz) => [p[0] + u[0] * s + v[0] * w, p[1] + u[1] * s + v[1] * w, zz];
  const yb = m(e.b) / 2, zu = z1, za = z1 - m(e.h);
  // Boyuna: sürekli üst ve alt boyunca; mesnet ekleri 0,3·L (temsili), aynı sırada aralara ya da bir alt sıraya
  const sira = (cb, zz, s0, s1, ara = false) => {
    if (!cb) return;
    const c = m(ORTU + phiE + cb.phi / 2), w = yb - c, konum = ara ? yay(cb.n + 2, -w, w).slice(1, -1) : yay(cb.n, -w, w);
    for (const t of konum) cubukEkle(l, nok(s0, t, zz), nok(s1, t, zz), cb.phi);
  };
  const ust = cubukOku(e.surekliUst ?? e.montaj ?? e.ust), alt = cubukOku(e.alt), ek = 0.3 * Lb;
  const cu = m(ORTU + phiE + (ust?.phi ?? 14) / 2), ca = m(ORTU + phiE + (alt?.phi ?? 14) / 2);
  sira(ust, zu - cu, 0, Lb); sira(alt, za + ca, 0, Lb);
  const zEk = zu - cu - (ust?.n > 2 ? m(25 + (ust?.phi ?? 14)) : 0); // sürekli üst ikiden çoksa ekler ikinci sırada
  sira(cubukOku(e.solUstEk), zEk, 0, ek, true); sira(cubukOku(e.sagUstEk), zEk, Lb - ek, Lb, true);
  sira(cubukOku(e.solAltEk), za + ca, 0, ek, true); sira(cubukOku(e.sagAltEk), za + ca, Lb - ek, Lb, true);
  if (!(es?.s > 0 && eo?.s > 0)) return l; // aralık yok ya da 0 (kısa açıklıkta 'φ10/0'): etriye çizilmez
  // Etriye: mesnet yüzlerinden (ℓn ortada) kolon/perde ucunda sarılma boyunca sık, ortada seyrek; konsolun serbest ucunda sarılma yok
  const ce = m(ORTU + phiE / 2), w = yb - ce, ln = Math.min(Lb, e.ln ?? Lb), y0 = (Lb - ln) / 2, sar = m(e.sarilma ?? 2 * e.h);
  const sarUc = (e.uclar ?? []).map(x => x === 'kolon' || x === 'perde');
  for (let t = y0 + 0.05; t <= Lb - y0 - 0.05 + 1e-9; ) {
    dortgen(l, [nok(t, -w, zu - ce), nok(t, w, zu - ce), nok(t, w, za + ce), nok(t, -w, za + ce)], phiE);
    const sik = (sarUc[0] && t - y0 < sar) || (sarUc[1] && Lb - y0 - t < sar + m(eo.s));
    t += m(sik ? es.s : eo.s);
  }
  return l;
}

// Döşeme ve radye ızgarası: doğrultu başına çubuk (yon: çubuğun uzandığı doğrultu) ve aralık; [x0, x1] × [y0, y1] içinde, zz kotunda
function izgara(l, { x0, x1, y0, y1 }, yon, cb, zz, kenar = null) {
  if (!cb?.s) return;
  const [a0, a1] = yon === 'x' ? [y0, y1] : [x0, x1], [b0, b1] = yon === 'x' ? [x0, x1] : [y0, y1];
  for (const o of dizi(a0, a1, m(cb.s), m(cb.s) / 2)) {
    const parca = kenar ? [[b0, b0 + kenar * (b1 - b0)], [b1 - kenar * (b1 - b0), b1]] : [[b0, b1]];
    for (const [s0, s1] of parca) cubukEkle(l, yon === 'x' ? [s0, o, zz] : [o, s0, zz], yon === 'x' ? [s1, o, zz] : [o, s1, zz], cb.phi);
  }
}
// Şeritli (radye, kirişsiz): doğrultu ve katman başına en sık aralık (temsili; kolon/orta şerit farkı gösterilmez)
const enSik = (seritler, yon, katman) => seritler.filter(s => s.yon === yon).flatMap(s => [s[`cs${katman}`], s[`ms${katman}`]]).map(cubukOku).filter(x => x?.s).sort((a, b) => a.s - b.s)[0] ?? null;

function dosemeDonati({ e, geo }) {
  const l = [], { x0, x1, y0, y1, z0, z1 } = geo, kisa = (x1 - x0) <= (y1 - y0) ? 'x' : 'y', uzun = kisa === 'x' ? 'y' : 'x';
  if (geo.seritler) { // kirişsiz
    for (const yon of ['x', 'y']) {
      const alt = enSik(geo.seritler, yon, 'Alt'), ust = enSik(geo.seritler, yon, 'Ust'), k = yon === 'x' ? 0 : 1;
      izgara(l, geo, yon, alt, z0 + m(ORTU_D + (alt?.phi ?? 10) * (k + 0.5)));
      izgara(l, geo, yon, ust, z1 - m(ORTU_D + (ust?.phi ?? 10) * (k + 0.5)));
    }
    return l;
  }
  if (geo.disler.length) { // dişli / kaset: diş başına alt boyuna, mesnette üst; tabla hasırı
    const da = cubukOku(e.disAlt), du = cubukOku(e.disUst), tb = cubukOku(e.tabla), w = m(40);
    for (const { yon, o } of geo.disler) {
      const [b0, b1] = yon === 'x' ? [x0, x1] : [y0, y1], at = (s, t, zz) => yon === 'x' ? [s, o + t, zz] : [o + t, s, zz];
      if (da) for (const t of yay(da.n, -w, w)) cubukEkle(l, at(b0, t, z0 + m(ORTU_D + da.phi / 2)), at(b1, t, z0 + m(ORTU_D + da.phi / 2)), da.phi);
      if (du) for (const [s0, s1] of [[b0, b0 + 0.25 * (b1 - b0)], [b1 - 0.25 * (b1 - b0), b1]]) for (const t of yay(du.n, -w, w)) cubukEkle(l, at(s0, t, z1 - m(ORTU_D + du.phi / 2)), at(s1, t, z1 - m(ORTU_D + du.phi / 2)), du.phi);
    }
    const zt = z1 - m((e.t ?? 70) / 2);
    izgara(l, geo, 'x', tb, zt); izgara(l, geo, 'y', tb, zt + m(tb?.phi ?? 8));
    return l;
  }
  const ka = cubukOku(e.kisaAlt), ua = cubukOku(e.uzunAlt), ku = cubukOku(e.kisaUst), uu = cubukOku(e.uzunUst);
  izgara(l, geo, kisa, ka, z0 + m(ORTU_D + (ka?.phi ?? 8) / 2));
  izgara(l, geo, uzun, ua, z0 + m(ORTU_D + (ka?.phi ?? 8) + (ua?.phi ?? 8) / 2));
  izgara(l, geo, kisa, ku, z1 - m(ORTU_D + (ku?.phi ?? 8) / 2), 0.25);
  izgara(l, geo, uzun, uu, z1 - m(ORTU_D + (ku?.phi ?? 8) + (uu?.phi ?? 8) / 2), 0.25);
  return l;
}

function perdeDonati({ e, geo: { c, u, z0, z1 } }) {
  const l = [], v = [-u[1], u[0]], lw = m(e.lw), lu = Math.min(lw / 2, m(e.lu ?? 0));
  const nok = (s, w, zz) => [c[0] + u[0] * s + v[0] * w, c[1] + u[1] * s + v[1] * w, zz];
  const ub = cubukOku(e.ucBoyuna), ue = cubukOku(z0 < m(e.Hcr ?? 0) ? e.ucEtriye : e.ucEtriyeUst ?? e.ucEtriye), gd = cubukOku(e.govdeDusey), gy = cubukOku(e.govdeYatay);
  const phiE = ue?.phi ?? 8, w = m(e.bw) / 2 - m(ORTU + phiE + (ub?.phi ?? 14) / 2), ce = m(e.bw) / 2 - m(ORTU + phiE / 2);
  for (const sg of [-1, 1]) { // iki uç bölgesi: uç çubukları iki yüzde, etriye uç bölgesini sarar
    const s0 = sg * (lw / 2 - m(ORTU + phiE)), s1 = sg * (lw / 2 - lu + m(ORTU));
    if (ub && lu > 0) for (const t of yay(Math.ceil(ub.n / 2), s0, s1)) for (const ww of [-w, w]) cubukEkle(l, nok(t, ww, z0), nok(t, ww, z1), ub.phi);
    if (ue?.s && lu > 0) for (const zz of dizi(z0, z1, m(ue.s))) {
      const a0 = sg * (lw / 2 - m(ORTU)), a1 = sg * (lw / 2 - lu);
      dortgen(l, [nok(a0, -ce, zz), nok(a1, -ce, zz), nok(a1, ce, zz), nok(a0, ce, zz)], phiE);
    }
  }
  const gw = m(e.bw) / 2 - m(ORTU + (gy?.phi ?? 10) + (gd?.phi ?? 10) / 2);
  if (gd?.s) for (const t of dizi(-lw / 2 + lu, lw / 2 - lu, m(gd.s), m(gd.s) / 2)) for (const ww of [-gw, gw]) cubukEkle(l, nok(t, ww, z0), nok(t, ww, z1), gd.phi);
  const yw = m(e.bw) / 2 - m(ORTU + (gy?.phi ?? 10) / 2);
  if (gy?.s) for (const zz of dizi(z0, z1, m(gy.s))) for (const ww of [-yw, yw]) cubukEkle(l, nok(-lw / 2 + m(ORTU), ww, zz), nok(lw / 2 - m(ORTU), ww, zz), gy.phi);
  return l;
}

function radyeDonati({ geo }) {
  const l = [];
  for (const [k, yon] of [[0, 'x'], [1, 'y']]) {
    const alt = enSik(geo.seritler, yon, 'Alt'), ust = enSik(geo.seritler, yon, 'Ust');
    izgara(l, geo, yon, alt, geo.z0 + m(50 + (alt?.phi ?? 12) * (k + 0.5)));
    izgara(l, geo, yon, ust, geo.z1 - m(50 + (ust?.phi ?? 12) * (k + 0.5)));
  }
  return sinirli(l);
}

export function donatiCubuklari(el) {
  const f = { kolon: kolonDonati, kiris: kirisDonati, doseme: dosemeDonati, perde: perdeDonati, radye: radyeDonati }[el.tip];
  return f ? sinirli(f(el)) : [];
}

// ── Bilgi kartı: { baslik, alt, satirlar: [[ad, değer]], gecti, kosul, not }
const mm = v => `${tr(v, 0)} mm`;
const yazi = v => typeof v === 'number' ? tr(v) : v ?? '—';
const varsa = (...l) => l.filter(x => x && x !== '0' && x !== 0).join(' + ') || '—';
export function kartBilgi(el, katli = true) {
  const e = el.e, s = [];
  if (el.tip === 'kolon') s.push(['Kesit', `${tr(e.b, 0)} × ${mm(e.h)}`], ['Boyuna', e.boyuna ?? '—'], ['Etriye', `${e.etrSar ?? '—'} sarılma, ${e.etrOrta ?? '—'} orta${e.ciftEtriye ? ' (çift)' : ''}`], ['Birleşim', e.etrBirlesim ?? '—']);
  else if (el.tip === 'kiris') s.push(['Kesit', `${tr(e.b, 0)} × ${mm(e.h)}`], ['Açıklık', `${tr(e.L)} m${e.konsol ? ' · konsol' : ''}`], ['Üst', `${e.ust ?? '—'} (sürekli ${e.surekliUst ?? '—'})`], ['Alt', varsa(e.alt, e.solAltEk, e.sagAltEk)], ['Etriye', `${e.etrSar ?? '—'} sarılma, ${e.etrOrta ?? '—'} orta`]);
  else if (el.tip === 'doseme') {
    s.push(['Kalınlık', e.t ? `${mm(e.h)} (tabla ${mm(e.t)})` : mm(e.h)], ['Göz', `${tr(e.lx)} × ${tr(e.ly)} m · ${e.durum ?? ''}`]);
    if (e.disAlt) s.push(['Diş', `alt ${e.disAlt}, üst ${e.disUst ?? '—'}, etriye ${e.disEtriye ?? '—'}`], ['Tabla', e.tabla ?? '—']);
    else if (e.kisaAlt) s.push(['Alt', `kısa ${e.kisaAlt}, uzun ${e.uzunAlt}`], ['Üst', `kısa ${e.kisaUst}, uzun ${e.uzunUst}`]);
    else if (el.geo.seritler) s.push(['Donatı', 'kolon ve orta şerit satırlarında (Döşeme şeritleri)']);
  } else if (el.tip === 'perde') s.push(['Kesit', `${tr(e.bw, 0)} × ${mm(e.lw)}`], ['Uç bölgesi', `${e.ucBoyuna ?? '—'}, etriye ${e.ucEtriye ?? '—'} (H_cr üstü ${e.ucEtriyeUst ?? '—'})`], ['Gövde', `düşey ${e.govdeDusey ?? '—'}, yatay ${e.govdeYatay ?? '—'}`]);
  else if (el.tip === 'radye') s.push(['Kalınlık', mm(e.h)], ['Boyut', `${tr(e.Bx)} × ${tr(e.By)} m`], ['Donatı', 'şerit satırlarında (Radye şeritleri)']);
  else if (el.tip === 'subasman') s.push(['Kesit', `${tr(e.bw, 0)} × ${mm(e.h)}`], ['Net boy', `${tr(e.L)} m`]);
  const kotu = (e.maddeler ?? []).find(x => !x.gecti && !x.uyari), b = el.gecti ? e.belirleyici ?? e.maddeler?.[0] : kotu ?? e.belirleyici;
  const kosul = b ? `${b.ad}: ${yazi(b.deger)} ${b.sinir ?? ''}${b.kaynak ? ` · ${b.kaynak}` : ''}` : el.neden?.length ? '' : null;
  return {
    baslik: el.ad, alt: [e.aks, el.kat ? `${el.kat}. kat${katli ? '' : ' (bütün katlarda aynı)'}` : 'Temel'].filter(Boolean).join(' · '),
    satirlar: s.filter(([, v]) => v !== '—'), gecti: el.gecti, kosul: el.neden?.length ? `${kosul ? kosul + ' · ' : ''}Uygun olmayan: ${el.neden.join(', ')}` : kosul,
    not: el.tip === 'subasman' ? 'Su basman perdesinde donatı hesaplanmaz.' : 'Demirler temsilidir: adet, çap ve aralık hesaptan; bindirme, kanca ve ayrıntı kesin projede.',
  };
}
