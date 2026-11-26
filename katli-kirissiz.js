// Tek kat kirişsiz döşeme ön hesabı: gerçek kat yüksekliği, duvar yükü ve destek kesitleriyle.
import { kirissizDoseme, panoYuk, sonla, kolonPay } from './doseme.js';
import { surekliKiris } from './mekanik.js';
import { duvarYuku } from './kurallar.js';

// Kirişsiz döşemede kolon şeridinin çatlamış rijitliği (TS 500 7.6.2.2).
export function katSeritRijitligi(ag, h, c, yon) {
  const [L, T, u, v] = yon === 'x' ? [ag.ax, ag.ay, c.i, c.j] : [ag.ay, ag.ax, c.j, c.i];
  const l2 = [T[v - 1], T[v]].filter(Boolean);
  return [L[u - 1], L[u]].filter(Boolean).reduce((a, l1) => a + 0.5 * l2.reduce((w, t) => w + 0.25 * Math.min(l1, t) * 1000, 0) * h ** 3 / 12 / (l1 * 1000), 0);
}

// Kirişsiz pano ve düğüm kat yükleri. Öz ağırlık kolon/perde kat hesabında eklenir.
// onb: çağıranın hesap boyunca tuttuğu önbellek (Map): aynı kat girdisi ve destek ölçüleriyle turlarda yeniden boyutlanır; bulunan
// kalınlıkta bir kez çözülür.
export function katKirissiz(ag, g, mz, H, olcuF, perdeDugum = new Map(), onb = new Map()) {
  const key = JSON.stringify([g, mz, H, [...perdeDugum.keys()], ag.kolonlar.filter(c => !c.sil).map(c => { const o = olcuF(c); return [o.b, o.h]; })]);
  const bilinen = onb.get(key);
  let sinir = false; // 90 adım sınırına ulaşıldı
  const plan = ag.xs.at(-1) * ag.ys.at(-1), icBoy = ag.hatlar.filter(t => !t.dis).reduce((a, t) => a + t.L.reduce((x, y) => x + y, 0), 0);
  const katsayi = L => surekliKiris(L, L.map(() => [{ w: 1, a: 0 }])).R.map((R, u) => Math.max(1, R / (((L[u - 1] ?? 0) + (L[u] ?? 0)) / 2)));
  const kx = ag.hatlar.filter(t => t.yon === 'x').map(t => katsayi(t.L)), ky = ag.hatlar.filter(t => t.yon === 'y').map(t => katsayi(t.L));
  const hElle = g.dosemeOzel?.h;
  let h = bilinen?.h ?? hElle ?? Math.ceil(Math.max(200, Math.max(...g.ax, ...g.ay) * 1000 / 30) / 10 - 1e-9) * 10;
  let gg, yk, sonuc;
  for (let adim = 0; adim < 90; adim++) {
    const dis = duvarYuku(g.duvarDisTur, g.duvarDis, H - h), ic = duvarYuku(g.duvarIcTur, g.duvarIc, H - h);
    gg = { ...g, H, dosemeTuru: 'kirissiz', duvarDisTur: 'elle', duvarIcTur: 'elle', duvarDis: dis.w, duvarIc: ic.w,
      duvarEsdeger: icBoy * ic.w / plan, duvarYazi: [dis.yazi, ic.yazi] };
    yk = panoYuk(gg, h, h);
    sonuc = kirissizDoseme(ag, gg, h, mz, yk, olcuF, kx, ky, perdeDugum);
    if (h >= H) {
      for (const e of sonuc.panolar) { e.maddeler.push({ ad: 'Net kat yüksekliği', deger: H - h, sinir: '> 0 mm', gecti: false, kaynak: 'geometri', kullanim: null, uyari: false }); sonla(e); }
      break;
    }
    if (bilinen) sinir = bilinen.sinir;
    else if ([...sonuc.panolar, ...sonuc.seritler, ...sonuc.zimb].every(e => e.gecti) || hElle != null || sonuc.seritler.some(s => !s.sd.minKod)) break;
    else if (adim === 89) sinir = true;
    if (bilinen || sinir) { if (sinir) for (const e of sonuc.panolar) e.iz.push('Döşeme boyutlandırması 90 adım sınırına ulaştı; sağlanmayan koşullar denetlenmeli.'); break; }
    h += 10; // ponytail: sabit desteklerle kalınlaştır; daha ekonomik kesit için kolonla ortak optimizasyon gerekir.
  }
  if (!bilinen) onb.set(key, { h, sinir });
  if (hElle != null) for (const e of sonuc.panolar) e.ozel = { h: true };
  const yukler = new Map(ag.kolonlar.filter(c => !c.sil).map(c => {
    const { ax, ay, k, disBoy } = kolonPay(ag, c, kx, ky), alan = ax * ay; // kolon düzeni değiştiyse gerçek yerlerle
    return [c.ad, { G1: alan * yk.g * k + disBoy * gg.duvarDis, Q1: alan * yk.q * k }];
  }));
  return { h, dosemeler: sonuc.panolar, seritler: sonuc.seritler, zimbD: sonuc.zimb, yukler, gg, yk };
}
