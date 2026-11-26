// Tek kolon düzeni: aks kesişimindeki bir kolonu kaldırma ya da yalnız onu kendi kiriş aksı boyunca kaydırma (bütün katlarda).
// Girdi g.kolonDuzen: { '2B': { sil: true }, '3A': { dx: 0.4 } } (m; X sağa, Y yukarı pozitif). Metin biçimi (Girdiler sayfası):
// "2B kaldırıldı; 3A X +0,40 m". Katlara göre farklı düzen (aktarma kirişi, TBDY 3.6.2.4 B3 düzensizliği) kapsam dışı.
import { agKur } from './mekanik.js';

const TOL = 1e-9, AKS_MIN = 1; // m, zincir.js AKS_MIN ile aynı (aks aralığı alt sınırı)
const harf = j => String.fromCharCode(65 + j);
const tr = (x, d = 3) => x.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d });
export const isaretli = v => Math.abs(v) < 5e-4 ? tr(0) : `${v > 0 ? '+' : '−'}${tr(Math.abs(v))}`; // sıfır işaretsiz (−0,00 değil)
// Kaydırma sınırları: komşu kolonlara eksenden eksene en az AKS_MIN (aks aralığı alt sınırıyla aynı: 1 m; kolon yüzleri arası net açıklık
// tasarımda 'Net açıklık' ve 'Yüksek kiriş' maddeleriyle ayrıca denetlenir). Dik kiriş: kolonun dik kiriş aksından kaçıklığı e ≤ L/10 ise
// (L: düğüme komşu dik kiriş açıklıklarının kısası; TS 500 11.4.4.2(d)'deki düzenlilik ölçüsü) dik kiriş kolona yönlendirilir (eksen hafif
// kırılır, kiriş kolona birleşir, eksenler kolonda kesişir); daha büyük kaçıklıkta kolona birleşmez, kesişimde öbür kirişe oturur. TBDY
// kiriş–kolon eksen kaçıklığına doğrudan sınır vermez. Kirişsiz: TS 500 11.4.4.2(d) %10, kaldırma yok.
export const YONLENDIR = 0.10, KIRISSIZ_KACIK = 0.10;
// Kaydırılan kolonun dik kiriş açıklığı L (m): X'te kayan kolonda Y kirişleri (ay), Y'de kayanda X kirişleri (ax); düğüme komşu açıklıkların kısası
export const dikAciklik = (ax, ay, c, yon = c.dx ? 'x' : 'y') => Math.min(...(yon === 'x' ? [ay[c.j - 1], ay[c.j]] : [ax[c.i - 1], ax[c.i]]).filter(Boolean));
export const yonlendirilir = (ax, ay, c) => Math.abs(c.dx || c.dy) <= YONLENDIR * dikAciklik(ax, ay, c) + TOL;

// ── Metin ↔ nesne
const AKS = /^(?:(\d{1,2})\s*\/?\s*([a-z])|([a-z])\s*\/?\s*(\d{1,2}))(?=\s|$|[xy:])/i;
export function kolonDuzenOku(metin) {
  if (metin && typeof metin === 'object') return { duzen: temiz(metin), hata: [] };
  const duzen = {}, hata = [];
  for (const ham of String(metin ?? '').split(/[;\n]+/)) {
    const s = ham.trim().replace(/[‐-―−]/g, '-'), yaz = `"${ham.trim().replace(/[<>&"]/g, '')}"`;
    if (!s) continue;
    const m = AKS.exec(s);
    if (!m) { hata.push(`${yaz}: kolonu aks adıyla yaz (2B kaldırıldı ya da 3A X +0,40 m)`); continue; }
    const aks = `${+(m[1] ?? m[4])}${(m[2] ?? m[3]).toLocaleUpperCase('en')}`, kalan = s.slice(m[0].length).trim();
    if (aks in duzen) { hata.push(`${yaz}: ${aks} iki kez yazıldı`); continue; }
    if (/^(kald[ıi]r[ıi]ld[ıi]|kald[ıi]r|sil|silindi|yok)$/i.test(kalan)) { duzen[aks] = { sil: true }; continue; }
    const o = {}, re = /([xy])\s*[:=]?\s*([+-]?\s*(?:\d+(?:[.,]\d{1,3})?|[.,]\d{1,3}))\s*(?:m\b)?\s*/giy;
    let son = 0, x;
    while ((x = re.exec(kalan))) { o[x[1].toLowerCase() === 'x' ? 'dx' : 'dy'] = Number(x[2].replace(/\s/g, '').replace(',', '.')); son = re.lastIndex; }
    if (!Object.keys(o).length || son !== kalan.length) { hata.push(`${yaz}: "kaldırıldı" ya da "X +0,40" / "Y −0,25" (m, en çok üç ondalık) yaz`); continue; }
    if (o.dx || o.dy) duzen[aks] = o;
  }
  if (hata.length > 3) hata.splice(3, Infinity, `… ve ${hata.length - 3} yazım hatası daha`); // dev hata metni olmasın
  return { duzen, hata };
}
const temiz = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v?.sil || v?.dx || v?.dy)
  .map(([k, v]) => [k, v.sil ? { sil: true } : Object.fromEntries(['dx', 'dy'].filter(a => v[a]).map(a => [a, v[a]]))]));
const sira = k => { const m = /^(\d+)([A-Z])$/.exec(k); return m ? [+m[1], m[2].charCodeAt(0)] : [999, 0]; };
export const kolonDuzenYaz = duzen => Object.entries(duzen).sort(([a], [b]) => { const [p, q] = [sira(a), sira(b)]; return p[0] - q[0] || p[1] - q[1]; })
  .map(([k, v]) => v.sil ? `${k} kaldırıldı` : ['dx', 'dy'].filter(a => v[a]).map(a => `${a === 'dx' ? 'X' : 'Y'} ${isaretli(v[a])} m`).reduce((t, x) => `${t} ${x}`, k)).join('; ');
// Aks sayısı değişince planda kalmayan kolonlar düşer
export const kolonDuzenKirp = (duzen, nx, ny) => Object.fromEntries(Object.entries(duzen).filter(([k]) => {
  const m = /^(\d+)([A-Z])$/.exec(k); return m && +m[1] >= 1 && +m[1] <= nx + 1 && m[2].charCodeAt(0) - 65 <= ny; }));

// ── Ağa uygula: c.sil, c.dx, c.dy; c.x, c.y gerçek yer, c.gx, c.gy aks kesişimi. ag.duzen: değişiklik varsa { sil, kay }.
export function kolonDuzenUygula(ag, duzen = {}) {
  const sil = [], kay = [];
  for (const c of ag.kolonlar) {
    const o = duzen[c.aks]; c.gx = c.x; c.gy = c.y;
    if (!o) continue;
    if (o.sil) { c.sil = true; sil.push(c); continue; }
    c.dx = o.dx ?? 0; c.dy = o.dy ?? 0; c.x += c.dx; c.y += c.dy; kay.push(c);
  }
  ag.duzen = sil.length || kay.length ? { sil, kay } : null;
  return ag;
}
// Hattaki kolonların kiriş/şerit ekseni boyunca yeri (m). dis: hattan kaçan (dik doğrultuda kaydırılan) kolon da aks yerinde sayılır.
export function hatDestek(ag, yon, no, { dis = false } = {}) {
  const l = [];
  for (const c of ag.kolonlar) {
    if ((yon === 'x' ? c.j : c.i) !== no || c.sil) continue;
    const kaydi = yon === 'x' ? c.dx : c.dy, kacti = yon === 'x' ? c.dy : c.dx;
    if (kacti && !dis) continue;
    l.push({ c, s: yon === 'x' ? (kaydi ? c.x : c.gx ?? c.x) : (kaydi ? c.y : c.gy ?? c.y), u: yon === 'x' ? c.i : c.j });
  }
  return l.sort((a, b) => a.s - b.s);
}

// Bir kolonun izin verilen kaydırması (m): kendi hattında komşu kolonlara (öbür kaydırmalar uygulanmış) eksenden eksene ≥ AKS_MIN, plan sınırı
// içinde; kirissiz: TS 500 11.4.4.2(d) kaçıklık sınırı (açıklıkların 1/10'u). Dönüş: { x: [alt, üst], y: [alt, üst], kirissiz } ya da null.
export function kolonKaymaSiniri(g, aks, duzen = {}) {
  const ag = agKur(g.ax, g.ay), d = { ...duzen }; delete d[aks];
  kolonDuzenUygula(ag, d);
  const c = ag.kolonlar.find(x => x.aks === aks); if (!c) return null;
  const aralik = yon => { const P = yon === 'x' ? ag.xs : ag.ys, u = yon === 'x' ? c.i : c.j, ds = hatDestek(ag, yon, yon === 'x' ? c.j : c.i, { dis: true }), k = ds.findIndex(x => x.c === c);
    return [Math.max(ds[k - 1] ? ds[k - 1].s + AKS_MIN : P[0], P[0]) - P[u], Math.min(ds[k + 1] ? ds[k + 1].s - AKS_MIN : P.at(-1), P.at(-1)) - P[u]]; };
  return { x: aralik('x'), y: aralik('y'), kirissiz: KIRISSIZ_KACIK * Math.min(...[g.ax[c.i - 1], g.ax[c.i], g.ay[c.j - 1], g.ay[c.j]].filter(Boolean)),
    yon: { x: YONLENDIR * dikAciklik(g.ax, g.ay, c, 'x'), y: YONLENDIR * dikAciklik(g.ax, g.ay, c, 'y') } }; // dik kirişin kolona yönlendirildiği kaçıklık
}

// ── Denetim (girdiDenetle): sözdizimi, planda var mı, perde düğümü, tek doğrultu, komşu kolonlara uzaklık, hat başına en az iki mesnet,
// kirişsiz sınırları. perdeDugum: perde düğümü kolon adları (Set), perdeBay: Set(`${yön}:${no}:${açıklık}`).
export function kolonDuzenHatalari(g, duzen, { perdeDugum = new Set(), perdeBay = new Set() } = {}) {
  const ag = agKur(g.ax, g.ay), h = [], kirissiz = g.dosemeTuru === 'kirissiz';
  for (const [aks, o] of Object.entries(duzen)) {
    const c = ag.kolonlar.find(x => x.aks === aks);
    if (!c) { h.push(`${aks}: planda böyle kolon yok (X aksları 1–${ag.nx + 1}, Y aksları A–${harf(ag.ny)})`); continue; }
    if (perdeDugum.has(c.ad)) { h.push(`${aks}: perde düğümü (${c.ad}); perdeye katılan kolon ${o.sil ? 'kaldırılamaz' : 'kaydırılamaz'}, önce perdeyi kaldır`); continue; }
    if (o.sil && kirissiz) h.push(`${aks}: kirişsiz döşemede kolon kaldırılamaz. TS 500 11.4.4 yaklaşık yöntemleri (çerçeve 11.4.4.1, katsayılar 11.4.4.2 a–d) düzenli kolon ağı ister; kesin hesapta sonlu elemanlar gerekir`);
    if (o.dx && o.dy) h.push(`${aks}: kolon tek doğrultuda kaydırılır (X ya da Y); ikisi birden olursa iki kiriş aksının da dışında kalır`);
  }
  if (h.length) return h;
  kolonDuzenUygula(ag, duzen);
  for (const c of ag.duzen?.kay ?? []) {
    const yon = c.dx ? 'x' : 'y', d = c.dx || c.dy, D = yon.toUpperCase(), sn = kolonKaymaSiniri(g, c.aks, duzen), [alt, ust] = sn[yon];
    if (d < alt - TOL || d > ust + TOL) {
      h.push(alt > ust + TOL ? `${c.aks}: komşu kolonlar ${D} doğrultusunda kaydırmaya yer bırakmıyor (eksenden eksene en az ${tr(AKS_MIN, 1)} m)`
        : `${c.aks}: ${D} kaydırması ${isaretli(alt)} … ${isaretli(ust)} m arasında olmalı (plan sınırı içinde, komşu kolonlara eksenden eksene en az ${tr(AKS_MIN, 1)} m)`);
      continue;
    }
    // TS 500 11.4.4.2(d): kolonun çerçeve ekseninden dışmerkezliği moment doğrultusundaki açıklığın 1/10'u; iki okuma da (kaçtığı
    // doğrultu ve dik çerçevenin moment doğrultusu) sağlanır, güvenli yan
    if (kirissiz && Math.abs(d) > sn.kirissiz + TOL) h.push(`${c.aks}: kirişsiz döşemede kolonun çerçeve ekseninden kaçıklığı komşu açıklıkların 1/10'unu (${tr(sn.kirissiz)} m) geçemez (TS 500 11.4.4.2(d)); daha büyük kaçıklıkta sonlu elemanlarla kesin hesap gerekir`);
  }
  if (h.length || kirissiz) return h;
  // Her kiriş dizisinde (perde açıklıkları arasında) en az iki mesnet: kaldırılmamış ve hatta kalan kolonlar + perde düğümleri. Dik
  // doğrultuda kaydırılan kolon, dik kiriş ona yönlendiriliyorsa (e ≤ L/10) bu hatta mesnettir, değilse sayılmaz.
  for (const hat of ag.hatlar) {
    const n = hat.L.length, col = u => ag.kolonlar.find(x => hat.yon === 'x' ? x.i === u && x.j === hat.no : x.i === hat.no && x.j === u);
    const bay = k => perdeBay.has(`${hat.yon}:${hat.no}:${k}`);
    for (let a = 0; a < n;) {
      if (bay(a)) { a++; continue; }
      let son = a; while (son < n && !bay(son)) son++;
      const dugum = Array.from({ length: son - a + 1 }, (_, t) => col(a + t));
      const kacik = c => (hat.yon === 'x' ? c.dy : c.dx) && !yonlendirilir(g.ax, g.ay, c);
      const mesnet = dugum.filter(c => perdeDugum.has(c.ad) || (!c.sil && !kacik(c)));
      if (mesnet.length < 2) {
        const neden = dugum.filter(c => c.sil || kacik(c)).map(c => c.aks);
        h.push(`${hat.aks} aksı (${hat.yon === 'x' ? `${a + 1}–${son + 1}` : `${harf(a)}–${harf(son)}`}): ${neden.join(', ')} sonrası kiriş dizisinde en az iki mesnet (kolon ya da perde) kalmalı; tek mesnetli dizi dayanaksız ya da tümüyle konsol olur`);
      }
      a = son;
    }
  }
  return h;
}

// ── Uzun açıklık uyarısı (bilgi; denetim sayılmaz): kolon kaldırınca oluşan birleşik açıklık UZUN_ACIKLIK m'den ya da aksın en uzun özgün
// açıklığının iki katından uzunsa, ya da konsol UZUN_KONSOL m'den uzunsa. Ön tasarım eşiği (yorum): kiriş kesiti büyür, komşu kolonlar ve
// radye yoğun yük alır. Dönüş: [{ kiris, sil: [aks], konsol, L, b, h, kom: [kolon adı], sinir, govde }]; kirişe 'Uzun açıklık'/'Uzun konsol' maddesi.
export const UZUN_ACIKLIK = 10, UZUN_KONSOL = 3;
const trK = x => x.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const ve = l => l.length > 1 ? `${l.slice(0, -1).join(', ')} ve ${l.at(-1)}` : l[0];
export function uzunAciklik(ag, kirisler) {
  const silinen = ag.duzen?.sil ?? [], l = [];
  if (!silinen.length) return l;
  for (const e of kirisler ?? []) {
    const hat = ag.hatlar[e.hat]; if (!hat || !(e.L > 0)) continue;
    const enUzun = Math.max(...hat.L), uzun = e.konsol ? e.L > UZUN_KONSOL + TOL : e.birlesik?.length > 1 && (e.L > UZUN_ACIKLIK + TOL || e.L > 2 * enUzun + TOL);
    if (!uzun) continue;
    const s = c => hat.yon === 'x' ? c.gx ?? c.x : c.gy ?? c.y, ici = x => x >= e.x0 - TOL && x <= e.x1 + TOL;
    const sil = silinen.filter(c => (hat.yon === 'x' ? c.j : c.i) === hat.no && ici(s(c))).map(c => c.aks);
    if (!sil.length) continue; // kaldırma değil (kaydırılan kolonun açtığı açıklık): bu uyarının konusu değil
    const kom = hatDestek(ag, hat.yon, hat.no, { dis: true }).filter(d => Math.abs(d.s - e.x0) < 1e-6 || Math.abs(d.s - e.x1) < 1e-6).map(d => d.c.ad);
    const aks = e.aks.replace(/ konsol$/, '').replace(' / ', ' aksı, '), kolonY = kom.length ? ` (${kom.join(', ')})` : '';
    const sinir = e.konsol ? `≤ ${trK(UZUN_KONSOL)} m` : `≤ ${trK(UZUN_ACIKLIK)} m ve ≤ 2 × ${trK(enUzun)} m (aksın en uzun özgün açıklığı)`;
    const govde = e.konsol
      ? `${trK(e.L)} m konsol kiriş oluşuyor (${aks}); kiriş yaklaşık ${e.b}×${e.h} mm çıkıyor, mesnetteki kolon${kolonY} ve radye zorlanır. Kaydırmayı ya da o aksa perde eklemeyi düşün.`
      : `${trK(e.L)} m açıklıklı kiriş oluşturuyor (${aks}); kiriş yaklaşık ${e.b}×${e.h} mm çıkıyor, ${kom.length === 1 ? 'komşu kolon' : 'komşu kolonlar'}${kolonY} ve radye zorlanır. Kaydırmayı ya da o aksa perde eklemeyi düşün.`;
    const ad = e.konsol ? 'Uzun konsol' : 'Uzun açıklık';
    if (!e.maddeler.some(m => m.ad === ad)) madde(e, ad, `${trK(e.L)} m (${ve(sil)} kaldırıldı)`, `${sinir} önerilir (bilgi, denetim değil): kesit büyür, komşu kolonlar ve radye zorlanır; kaydırma ya da perde düşün`, false, 'ön tasarım önerisi; yorum', true);
    l.push({ kiris: e.ad, sil, konsol: e.konsol ?? null, L: e.L, b: e.b, h: e.h, kom, sinir, govde });
  }
  return l;
}
// Uyarı metni: secili verilirse panel için "Bu kolonu …" (Yerleşimi düzenle), yoksa kaldırılan kolonların adıyla (notlar)
export function uzunAciklikYazi(u, secili) {
  const fiil = u.konsol ? 'kaldırınca' : 'kaldırmak', diger = u.sil.filter(a => a !== secili);
  const ozne = secili ? `Bu kolonu${diger.length ? ` (${ve(diger)} ile birlikte)` : ''}` : `${ve(u.sil)} ${u.sil.length > 1 ? 'kolonlarını' : 'kolonunu'}`;
  return `${ozne} ${fiil} ${u.govde}`;
}

// ── Sonuç: notlar, kaydırılan kolonların dik kiriş maddesi ve plan için düzen özeti (zincir.js, katli.js).
// kr: kirisBul çıktısı (ızgara yolu; kirişsizde null), kolonlar: tasarlanan kolonlar (madde eklenir).
const madde = (e, ad, deger, sinir, gecti, kaynak, uyari = false) => e.maddeler.push({ ad, deger, sinir, gecti, kaynak, kullanim: null, uyari });
const sonla = e => {
  e.belirleyici = e.maddeler.filter(x => !x.uyari).reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  e.gecti = e.maddeler.every(x => x.gecti || x.uyari);
};
export function duzenSonuc(ag, kr, kolonlar, { kirissiz = false } = {}) { // kolonlar null: kolon maddesi eklenmez (katlı hesap kat kat ekler)
  if (!ag.duzen) return { notlar: [], duzen: null };
  const { sil, kay } = ag.duzen, notlar = [], duzen = {};
  for (const c of sil) duzen[c.aks] = { sil: true };
  for (const c of kay) duzen[c.aks] = c.dx ? { dx: c.dx } : { dy: c.dy };
  const kesisim = kr?.izgara?.kesisim ?? [];
  notlar.push(`Kolon düzeni (bütün katlarda aynı): ${kolonDuzenYaz(duzen)}. Kat kat farklı düzen (kolonun bir katta kalkması, aktarma kirişi; TBDY 3.6.2.4 B3 düzensizliği) bu ön hesabın kapsamı dışında. ` +
    'TBDY 17.2.4: taşıyıcı sistem eksenlerinde süreksizlik ya da eksen dışına kayma bulunan bina Bölüm 17 basitleştirilmiş yöntemiyle tasarlanamaz.');
  const uzun = kirissiz ? [] : uzunAciklik(ag, kr?.kirisler); // bilgi: uzun birleşik açıklık / konsol (kirişte 'Not' maddesi)
  for (const u of uzun) notlar.push(uzunAciklikYazi(u));
  if (!kirissiz) notlar.push('Kirişler ızgara kiriş sistemi olarak birlikte çözüldü: kolonsuz kesişimde kirişler birbirine oturur (düşey yer değiştirme ortak, yük rijitlikle paylaşılır), ' +
    'kirişlerin burulma rijitliği ihmal edildi (X ve Y dönmeleri bağımsız; ön tasarımda yaygın kabul), EI = Ec·b·h³/12 (bütün kirişlere aynı çatlama katsayısı oranları değiştirmez), mesnetler eğilmede mafsallı, perdeye saplanan uç ankastre. ' +
    'Hareketli yük her döşeme panosu için ayrı yerleştirilip her büyüklükte en elverişsiz biçimde toplandı (TS 500 6.3.3). Kirişler mesnetten mesnede: kaldırılan iç kolonda komşu açıklıklar tek kiriş, uçtaki kolonda konsol ya da kirişe oturan uç. ' +
    `Kaydırılan kolon kendi kiriş aksında kalır. Dik kiriş, kaçıklık e ≤ L/10 ise (L: komşu dik kiriş açıklıklarının kısası; TS 500 11.4.4.2(d)'deki düzenlilik ölçüsü, TBDY kiriş–kolon eksen kaçıklığına doğrudan sınır vermez) kolona yönlendirilir: eksen hafifçe kırılır, kiriş kolona birleşir, ızgarada aks boyu kullanılır (boy farkı √(L² + e²) − L ≤ %0,5). Daha büyük kaçıklıkta kolona birleşmez, kesişimde öbür kirişe oturur.`);
  if (kesisim.length) notlar.push(`Kolonsuz kesişimler: ${kesisim.map(k => `${k.aks} (${k.kirisler.join(' – ')}, F_d = ${tr(k.Fd, 1)} kN, askı ≥ ${tr(k.As, 0)} mm²)`).join('; ')}. ` +
    'Kirişe oturan kirişte kesme mesnet yüzünde alınır ve yük askı donatısıyla taşıyıcı kirişin üst yüzüne taşınır (TS 500 8.1.2 dolaylı mesnet, Şekil 8.1; 8.1.6). Bu kesişimler TBDY 7.4.1.1(d) anlamında kolon–kiriş düğümü değildir.');
  const konsol = (kr?.kirisler ?? []).filter(e => e.konsol);
  if (konsol.length) notlar.push(`Konsol kirişler: ${konsol.map(e => `${e.ad} (${tr(e.L)} m)`).join(', ')}: mesnette üst donatı ve sarılma bölgesi, serbest uçta mafsal yok (V_e = V_dy), sehim mesnet kesitinin etkili eylemsizlik momentiyle (TS 500 13.2.2) ve konsolun serbest boyuyla (Çizelge 13.3). ` +
    (konsol.some(e => e.L >= 5 - TOL) ? 'Yatay izdüşümü 5 m ve üzeri konsol var: düşey deprem etkisi düşey ivme spektrumuyla ayrıca hesaplanmalı (TBDY 4.4.3.1(b)).' : 'Düşey deprem etkisi E_d(Z) ≈ (2/3)·S_DS·G (TBDY 4.4.3.2, Denk. 4.10) kesin hesapta konsola uygulanmalı.'));
  if (kr?.izgara && kr.kalkma.length) notlar.push(`${kr.kalkma.join(', ')}: en elverişsiz hareketli yük yerleşiminde ızgara tepkisi çekmeye dönüyor (kalkma); kolon yükü alan payıyla alttan sınırlandı, mesnet bağlantısı kesin hesapta denetlenmeli.`);
  if (!kirissiz && sil.length) notlar.push('Radye şerit momentleri yaklaşık: kaldırılan ya da kaydırılan kolon TS 500 11.4.4.2 koşullarını (düzenli kolon ağı) bozar; kaldırılan kolonda şerit açıklıkları birleştirildi, kaydırılan kolon gerçek yerinde. Kesin hesapta radye zemine oturan plak (sonlu elemanlar) olarak çözülmeli; zımbalama kolonların gerçek yerinde denetlendi.');
  else if (kay.length) notlar.push(`Kaydırılan kolonlar radye ve ${kirissiz ? 'döşeme ' : ''}şeritlerinde gerçek yerinde (kendi hattında yeni açıklıklar, dik çerçevede aks üzerinde: TS 500 11.4.4.2(d) yaklaşık); şerit momentleri yaklaşık, kesin hesapta ${kirissiz ? 'döşeme ve ' : ''}radye plak olarak (sonlu elemanlar) çözülmeli.`);
  const kayYaz = kolonlar ? duzenKolonMadde(ag, kr?.kolonKiris, kolonlar, kirissiz) : [];
  if (kayYaz.length) notlar.push(`Kaydırılan kolonlar: ${kayYaz.join('; ')}.`);
  if (kirissiz) for (const yon of ['x', 'y']) for (let no = 0; no <= (yon === 'x' ? ag.ny : ag.nx); no++) {
    const ds = hatDestek(ag, yon, no, { dis: true }); if (!ds.some(d => kay.includes(d.c) && (yon === 'x' ? d.c.dx : d.c.dy))) continue;
    const L = ds.slice(1).map((d, i) => d.s - ds[i].s), bozuk = L.slice(1).some((l, i) => Math.abs(l - L[i]) > Math.max(l, L[i]) / 3 + TOL);
    if (bozuk) notlar.push(`${yon === 'x' ? String.fromCharCode(65 + no) : no + 1} aksında kaydırılan kolondan sonra komşu açıklık farkı uzun açıklığın 1/3'ünü geçiyor (TS 500 11.4.4.2(c)): moment katsayıları yöntemi geçerli değil, çerçeve yöntemiyle (11.4.4.1) ya da sonlu elemanlarla kesin hesap yapılmalı.`);
  }
  return { notlar, duzen: { sil: sil.map(c => c.aks), kay: kay.map(c => ({ aks: c.aks, ad: c.ad, dx: c.dx, dy: c.dy })), kesisim, uzun } };
}

// Kaydırılan kolon: dik kiriş maddesi (kirişli: kolona yönlendirildi ya da birleşmiyor) ya da TS 500 11.4.4.2(d) kaçıklığı (kirişsiz).
// Dönüş: not satırları.
export function duzenKolonMadde(ag, kolonKiris, kolonlar, kirissiz = false) {
  const kayYaz = [];
  for (const c of ag.duzen?.kay ?? []) {
    const e = kolonlar.find(x => x.ad === c.ad), d = c.dx || c.dy, yon = c.dx ? 'X' : 'Y', dik = c.dx ? 'y' : 'x';
    if (!e) continue;
    e.iz.unshift(`Kolon ${yon} ${isaretli(d)} m kaydırıldı (aks kesişiminden; ${yon === 'X' ? `${String.fromCharCode(65 + c.j)} aksında` : `${c.i + 1} aksında`} kalır). Yükler gerçek yerindeki ${kirissiz ? 'alan payından' : 'ızgara tepkilerinden'}.`);
    if (kirissiz) {
      const L = [ag.ax[c.i - 1], ag.ax[c.i], ag.ay[c.j - 1], ag.ay[c.j]].filter(Boolean), lim = KIRISSIZ_KACIK * Math.min(...L);
      madde(e, 'Kolon kaçıklığı', `${tr(Math.abs(d) * 1000, 0)} mm`, `≤ açıklığın 1/10'u = ${tr(lim * 1000, 0)} mm (moment katsayıları yöntemi)`, Math.abs(d) <= lim + TOL, 'TS 500 11.4.4.2(d)');
    } else {
      const L = dikAciklik(ag.ax, ag.ay, c), yonl = yonlendirilir(ag.ax, ag.ay, c) && kolonKiris.get(c.ad)[dik].some(Boolean), D = dik.toUpperCase();
      const aci = Math.atan(Math.abs(d) / L) * 180 / Math.PI, ee = tr(Math.abs(d)), lim = tr(YONLENDIR * L);
      if (yonl) {
        madde(e, 'Dik kiriş', `${D} kirişi kolona yönlendirildi: e = ${ee} m, açı ${tr(aci, 1)}°`, `e ≤ L/10 = ${lim} m (L = ${tr(L)} m): eksenler kolonda kesişir; kesin hesapta eğik kiriş geometrisiyle`, true, 'TS 500 11.4.4.2(d) ölçüsü; yorum', true);
        e.iz.push(`Dik kiriş kolona yönlendirildi (eksen kırıklığı e = ${ee} m, açı ${tr(aci, 1)}°): ${D} kirişleri kolona birleşir; güçlü kolon, birleşim (b_j azaltılmaz) ve narinlik bu kirişlerle. Kesin hesapta eğik kiriş geometrisiyle.`);
      } else {
        madde(e, 'Dik kiriş', `${D} kirişi kolona birleşmiyor: e = ${ee} m`, `e > L/10 = ${lim} m: kesişimde öbür kirişe oturur; kaydırmayı küçült, perde ya da ikincil kirişle çöz`, false, 'TS 500 11.4.4.2(d) ölçüsü; yorum', true);
        e.iz.push(`${D} doğrultusunda kolona kiriş birleşmiyor (e > L/10): güçlü kolon, birleşim ve kapasite kesmesi bu doğrultuda aranmadı; narinlikte döşemenin kolon şeridi kiriş sayıldı (TS 500 7.6.2.2, kirişsiz döşeme kuralı, yorum). Kaydırmayı ${lim} m'ye düşürün (dik kiriş kolona yönlendirilir), perde ya da ikincil kiriş ekleyin.`);
      }
      kayYaz.push(`${c.aks} ${yonl ? `${D} kirişi kolona yönlendirildi (açı ${tr(aci, 1)}°)` : `${D} kirişi kolona birleşmez (e > L/10)`}`);
    }
    sonla(e);
  }
  return kayYaz;
}
