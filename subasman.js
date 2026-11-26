// Su basman perdesi temel kotunda ayrı çizgisel yük. Üst yapı akslarının mesnet türünü değiştirmez.
import { GAMMA_BA } from './doseme.js';
import { perdeAciklik, perdeDisari, perdeOku, perdeYaz } from './perde.js';

const TOL = 1e-9;
const tr = v => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const anahtar = p => `${p.yon}:${p.no}:${p.k}`;
const aksYaz = ({ yon, no, k }) => perdeYaz([{ yon, no, k0: k, k1: k }]);

// Aks liste biçimi deprem perdeleriyle ortak. Su basman her açıklıkta ayrı parça olarak ele alınır.
export function subasmanGirdi(g, normalPerdeler = perdeOku(g.perdeler).liste) {
  const hata = {};
  if (g.subasman != null && typeof g.subasman !== 'string')
    return { acikliklar: [], hata: { subasman: 'Su basman perdelerini aks/açıklık biçiminde yaz.' } };
  const okunan = perdeOku(g.subasman), acikliklar = perdeAciklik(okunan.liste);
  if (okunan.hata.length) hata.subasman = `Su basman perdeleri: ${okunan.hata.join(' · ')}`;
  if (!acikliklar.length) return { acikliklar, hata };

  const disarida = perdeDisari(okunan.liste, g.ax.length, g.ay.length);
  const dolu = new Set(perdeAciklik(normalPerdeler).map(anahtar));
  const cakis = acikliklar.filter(p => dolu.has(anahtar(p)));
  if (!hata.subasman && disarida.length) hata.subasman = `Su basman perdeleri: ${perdeYaz(disarida)} aks ağının dışında.`;
  if (!hata.subasman && cakis.length) hata.subasman = `Su basman ve taşıyıcı perde aynı açıklıkta olamaz: ${cakis.map(aksYaz).join(', ')}.`;
  const { subasmanH: h = 900, subasmanBw: bw = 200 } = g;
  if (!Number.isFinite(h) || h < 100 || h > 3000) hata.subasmanH = 'Su basman perdesi yüksekliği 100–3.000 mm olmalı.';
  if (!Number.isFinite(bw) || bw < 150 || bw > 1500) hata.subasmanBw = 'Su basman perdesi kalınlığı 150–1.500 mm olmalı.';
  return { acikliklar, hata, h, bw };
}

export function subasmanBul(ag, g, olcu, normalPerdeler) {
  const { acikliklar, hata, h, bw } = subasmanGirdi(g, normalPerdeler);
  if (Object.keys(hata).length) throw new RangeError(Object.values(hata).join(' · '));
  return acikliklar.map((p, i) => {
    const { yon, no, k } = p, x = yon === 'x', koordinatlar = x ? ag.xs : ag.ys;
    const uc = u => ag.kolonlar[x ? no * (ag.nx + 1) + u : u * (ag.nx + 1) + no];
    const yonOlcusu = x ? 'b' : 'h';
    const bas = koordinatlar[k] + olcu(uc(k))[yonOlcusu] / 2000;
    const son = koordinatlar[k + 1] - olcu(uc(k + 1))[yonOlcusu] / 2000;
    const net = son - bas, gecerli = net > TOL, L = gecerli ? net : 0;
    const hacim = L * (bw / 1000) * (h / 1000), NG = hacim * GAMMA_BA, Nd = 1.4 * NG;
    const geometri = { ad: 'Net açıklık', deger: `${tr(net)} m`, sinir: 'Uçların yüzleri arasında açıklık > 0 m', kaynak: 'geometri', gecti: gecerli, kullanim: gecerli ? null : 2 };
    const kapsam = { ad: 'Su basman analizi', deger: 'Model dışında', sinir: 'Toprak ve su basıncı, çerçeve ile etkileşim, donatı ve bağlantılar ayrıca çözülmeli', kaynak: 'hesap kapsamı', gecti: false, kullanim: 2 };
    return { ad: `SB${i + 1}`, aks: aksYaz(p).replace('/', ' / '), yon, no, k, bas, son, L, h, bw, hacim, NG, Nd,
      maddeler: [geometri, kapsam], gecti: false, belirleyici: gecerli ? kapsam : geometri,
      iz: [gecerli ? `Uç yüzleri: ${tr(bas)} m → ${tr(son)} m. Net uzunluk ${tr(L)} m.` : 'Uç yüzleri arasında net açıklık yok. Bu parçanın öz ağırlığı hesaba katılmadı.',
        `Beton hacmi ${tr(hacim)} m³, öz ağırlık G = ${tr(NG)} kN. Radyeye eklenen katsayılı yük 1,4G = ${tr(Nd)} kN.`,
        'Yük temelde bir kez eklenir. Kolonlar, kirişler ve kat hesabı su basman perdesi eklenmeden önceki modelle sürdürülür.'] };
  });
}
