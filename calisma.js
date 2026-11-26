// Ortak çalışma kitabı (sira.html ve tablo.html): proje durumu (localStorage), Girdiler sayfası, zincir sayfaları, düzenlenebilir
// sonuç hücreleri (elle boyut), Excel'e aktarma. Yüklenirken DOM'a dokunmaz; saf işlevleri Node testleri de kullanır.
import { BETON, sayiOku, KULLANIM, DUVAR, tabloSatiri } from './kurallar.js';
import { zincirHesap, girdiDenetle, CELIK, AKS_MIN, AKS_MAX } from './zincir.js'; // tarayıcıda zincirHesap işçide (hesap-isci.js); burada yedek yol
import { perdeOku, perdeYaz, perdeKirp, perdeBoyHatasi, PERDE_BOY_SINIR } from './perde.js';
import { xlsxYap, indir } from './xlsx.js';
import { kolonDuzenOku, kolonDuzenYaz, kolonDuzenKirp } from './kolonduzen.js';

export const tr = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: d }) : '—';
const kacis = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Düz metindeki alt simgeleri (q_k, N_d, fck, ℓn …) HTML'e çevirir
const ALT = [[/δ_(G\+Q|GQ|G|Q)/g, 'δ<sub>$1</sub>'], [/([VMNAeuqpSHb])_([A-Za-zçğıöşü]+)/g, '$1<sub>$2</sub>'], [/ℓ([wu])(?![a-zçğıöşü])/g, 'ℓ<sub>$1</sub>'], [/ρsh/g, 'ρ<sub>sh</sub>'],
  [/fck/g, 'f<sub>ck</sub>'], [/fcd/g, 'f<sub>cd</sub>'], [/fctd/g, 'f<sub>ctd</sub>'], [/fyd/g, 'f<sub>yd</sub>'],
  [/ℓsn/g, 'ℓ<sub>sn</sub>'], [/ℓn/g, 'ℓ<sub>n</sub>'], [/ℓℓ/g, 'ℓ<sub>ℓ</sub>'], [/αs/g, 'α<sub>s</sub>']];
export const simge = s => ALT.reduce((a, [r, y]) => a.replace(r, y), kacis(String(s))); // önce kaçış: kullanıcı metni (ör. Perdeler) HTML olarak çalışmasın
export const birim = sinir => (String(sinir).match(/(kN\/m²|kNm\/m|kNm|kN\/m|kN|mm²|mm|m²|m)\s*(\([^)]*\))?\s*$/) ?? ['', ''])[1]; // sondaki (…) açıklaması atlanır
const deger = x => typeof x.deger === 'string' ? x.deger : `${tr(x.deger)}${birim(x.sinir) ? ' ' + birim(x.sinir) : ''}`;
const IKON = {
  uygun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  degil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  uyari: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5l6 11H2zM8 7v3M8 12v.01"/></svg>',
};
const sonucYaz = (ok, yazi, tip = ok ? 'uygun' : 'degil') => `<span class="sonuc-hucre ${tip}">${IKON[tip]}${yazi}</span>`;
const uyariVar = e => e.maddeler.some(x => x.uyari && !x.gecti);
export const AZAMI = 1.2, HARF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const TUR_AD = { plak: 'Kirişli plak', kirissiz: 'Kirişsiz', disli: 'Dişli', kaset: 'Kaset' };
export const belirleyen = e => e.belirleyici ?? e.maddeler.find(x => !x.gecti && !x.uyari) ?? e.maddeler[0];
const kul = e => e.belirleyici?.kullanim;
const sonucDuz = e => e.gecti ? 'Uygun' + (uyariVar(e) ? ' · not' : '') : 'Uygun değil';

// ── Proje durumu: formun metin alanları + işaretler + elle verilen boyutlar. Anahtar ve biçim sira.js'in eski kaydıyla aynı.
export const ANAHTAR = 'kesit.sira.v3'; // v3: döşeme türü; kalınlık ve kesitler araçta bulunur (elle verilebilir)
export const VARSAYILAN = { ax: '4 5 4', ay: '5 4,5', kat: '5', H: '3000', katYukseklikleri: '', beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: '500', disGen: '120',
  dolgu: '0', g: '2', q: '2', kullanim: 'konut', duvarDisTur: 'elle', duvarDis: '6', duvarIcTur: 'elle', duvarIc: '3', sds: '1', kDeprem: '1', zemin: '400',
  Df: '1,5', tasma: '0,75', perdeler: '', perdeKal: '250', subasman: '', subasmanH: '900', subasmanBw: '200', kolonDuzen: '' };
export const ALANLAR = Object.keys(VARSAYILAN);
export const liste = v => v.trim() ? v.trim().split(/[\s;/]+/).map(sayiOku) : [];
export const yeniDurum = () => ({ form: { ...VARSAYILAN }, duvar: true, tutulu: false, ozel: {}, ozelNx: liste(VARSAYILAN.ax).length,
  kirisOzel: {}, perdeOzel: {}, perdeBoyOzel: {}, dosemeOzel: null, radyeOzel: {} });
// Seçim alanları [değer, yazı]; eski kayıtlar (konut, atolye, depo) aynı anahtarla açılır
const BGRUP = { konut: 'β a) konut, büro', atolye: 'β b) atölye, mağaza' };
const DUVAR_SEC = [['elle', 'Elle (kN/m)'], ...Object.entries(DUVAR).map(([a, d]) => [a, `${d.ad} · ${tr(d.q)} kN/m²`])];
export const SECENEK = {
  beton: Object.keys(BETON).map(k => [k, k]), celik: Object.keys(CELIK).map(k => [k, k]),
  dosemeTuru: [['plak', 'Kirişli plak'], ['kirissiz', 'Kirişsiz (kolona oturan plak)'], ['disli', 'Dişli (tek doğrultu, asmolen)'], ['kaset', 'Kaset (iki doğrultulu dişli)']],
  kullanim: Object.entries(KULLANIM).map(([a, k]) => [a, `${k.ad} · ${k.q == null ? 'q elle' : `${tr(k.q)} kN/m²`} · ${BGRUP[k.beta] ?? 'azaltma yok'}`]),
  duvarDisTur: DUVAR_SEC, duvarIcTur: DUVAR_SEC,
};
export const secimYazi = (k, v) => SECENEK[k]?.find(([x]) => x === v)?.[1] ?? v;
export const kullanimNot = F => { const k = KULLANIM[F.kullanim]; if (!k) return '';
  return k.q == null ? 'Çizelge 7\'de değer yok: q\'yu TS ISO 9194\'e göre gir; hareketli yük azaltması yapılmaz (TS 498 Bölüm 13).'
    : `Çizelge 7 satır ${k.satir}: q = ${tr(k.q)} kN/m²; ${k.beta ? `azaltma Çizelge 8 ${BGRUP[k.beta]}` : 'hareketli yük azaltması yok (TS 498 Bölüm 13)'}.`; };

// Elle değer sınırları (girdiDenetle ile aynı); hücreye yazılan değer aralık dışındaysa saklanmaz
const SINIR = { kolon: { b: [100, 10000], h: [100, 10000] }, kiris: { b: [150, 3000], h: [200, 5000] }, doseme: { h: [60, 1500], t: [40, 300] },
  perde: { bw: [150, 1500], lw: PERDE_BOY_SINIR }, radye: { h: [200, 3000], a: [0, 10] } };
const sec = (o, s) => { const t = Object.fromEntries(Object.entries(s).filter(([x, [a, b]]) => o?.[x] != null && +o[x] >= a && +o[x] <= b).map(([x]) => [x, +o[x]]));
  return Object.keys(t).length ? t : null; };
const nesne = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};

export function durumYukle(depo = globalThis.localStorage, temizle = true) {
  const d = yeniDurum();
  let k = null;
  try { k = JSON.parse(depo?.getItem(ANAHTAR) ?? 'null'); } catch {}
  for (const a of ALANLAR) { const v = k?.form?.[a];
    if (typeof v === 'string' && (!SECENEK[a] || SECENEK[a].some(([x]) => x === v))) d.form[a] = v.slice(0, a === 'subasman' || a === 'kolonDuzen' ? 4000 : a === 'perdeler' ? 600 : a === 'katYukseklikleri' ? 400 : a === 'ax' || a === 'ay' ? 240 : 120); }
  if (typeof k?.duvar === 'boolean') d.duvar = k.duvar;
  if (typeof k?.tutulu === 'boolean') d.tutulu = k.tutulu;
  d.ozelNx = liste(d.form.ax).length;
  if (k?.ozelNx === d.ozelNx) for (const [ad, o] of Object.entries(nesne(k.ozel))) { const t = sec(o, SINIR.kolon); if (/^S\d+$/.test(ad) && t) d.ozel[ad] = t; }
  for (const [a, o] of Object.entries(nesne(k?.kirisOzel))) { const t = sec(o, SINIR.kiris); if (/^([A-Z]|\d{1,2})$/.test(a) && t) d.kirisOzel[a] = t; }
  for (const [a, v] of Object.entries(nesne(k?.perdeOzel))) { const t = sec({ bw: v }, SINIR.perde); if (a.length <= 20 && t) d.perdeOzel[a] = t.bw; }
  for (const [a, v] of Object.entries(nesne(k?.perdeBoyOzel))) { const t = sec({ lw: v }, SINIR.perde); if (a.length <= 20 && t) d.perdeBoyOzel[a] = t.lw; }
  const dz = k?.dosemeOzel, dt = sec(dz, SINIR.doseme);
  if (dt && TUR_AD[dz.tur] && !(dt.h != null && dt.t != null && dt.t >= dt.h)) d.dosemeOzel = { tur: dz.tur, ...dt };
  d.radyeOzel = sec(k?.radyeOzel, SINIR.radye) ?? {};
  if (temizle) ozelTemizle(d); // başka sekmeden gelen yarım yazılmış girdi elle değerleri sildirmesin
  return d;
}
export function durumKaydet(d, depo = globalThis.localStorage) {
  try { depo.setItem(ANAHTAR, JSON.stringify({ form: d.form, duvar: d.duvar, tutulu: d.tutulu, ozel: d.ozel, ozelNx: d.ozelNx,
    kirisOzel: d.kirisOzel, perdeOzel: d.perdeOzel, perdeBoyOzel: d.perdeBoyOzel, dosemeOzel: d.dosemeOzel, radyeOzel: d.radyeOzel })); } catch {}
}

// Durum → motor girdisi. Kolon adları X aks sayısına bağlı (S = j·(nx+1) + i + 1): X aks sayısı yazılırken eski adlar kaymasın diye
// kolon boyutları yalnız kaydedildikleri aks sayısında uygulanır. Döşeme kalınlığı yalnız kaydedildiği döşeme türünde.
export function girdiOku(d) {
  const F = d.form, n = k => sayiOku(F[k]), katYukseklikleri = liste(F.katYukseklikleri), g = { ax: liste(F.ax), ay: liste(F.ay), katSayisi: n('kat'),
    H: katYukseklikleri.length ? katYukseklikleri[0] : n('H'), katYukseklikleri: katYukseklikleri.length ? katYukseklikleri : undefined, beton: F.beton, celik: F.celik,
    dosemeTuru: F.dosemeTuru, disAralik: n('disAralik'), disGen: n('disGen'), dolgu: n('dolgu'), dosemeDuvar: d.duvar,
    gKaplama: n('g'), q: n('q'), kullanim: F.kullanim, duvarDisTur: F.duvarDisTur, duvarDis: n('duvarDis'), duvarIcTur: F.duvarIcTur, duvarIc: n('duvarIc'),
    sds: n('sds'), kDeprem: n('kDeprem'), zemin: n('zemin'), Df: n('Df'), tasma: n('tasma'), yanalTutulu: d.tutulu || undefined,
    perdeler: F.perdeler, perdeKal: F.perdeKal.trim() ? n('perdeKal') : undefined,
    subasman: F.subasman, subasmanH: n('subasmanH'), subasmanBw: n('subasmanBw'), kolonDuzen: F.kolonDuzen };
  g.kolonOzel = g.ax.length === d.ozelNx ? d.ozel : {};
  if (d.dosemeOzel?.tur === F.dosemeTuru) { const { tur, ...o } = d.dosemeOzel; g.dosemeOzel = o; }
  return Object.assign(g, { kirisOzel: d.kirisOzel, perdeOzel: d.perdeOzel, perdeBoyOzel: d.perdeBoyOzel, radyeOzel: d.radyeOzel });
}
export function hesap(d) {
  const g = girdiOku(d), hata = girdiDenetle(g);
  return { g, hata, sonuc: Object.keys(hata).length ? null : zincirHesap(g) };
}

// Aks ağı, perde ya da döşeme türü kesinleşince eşleşmeyen elle değerler düşer (geçersiz girdi bir şey sildirmez):
// kolon: X aks sayısı değişince hepsi (adlar kayar); kiriş: planda kalmayan aks; perde: listede kalmayan perde yazımı; döşeme: başka tür.
export function ozelTemizle(d) {
  const g = girdiOku(d), h = girdiDenetle(g);
  let deg = false;
  if (!h.ax && g.ax.length !== d.ozelNx) { d.ozel = {}; d.ozelNx = g.ax.length; deg = true; }
  if (!h.ax && !h.ay) {
    const adlar = new Set([...Array.from({ length: g.ay.length + 1 }, (_, j) => HARF[j]), ...Array.from({ length: g.ax.length + 1 }, (_, i) => String(i + 1))]);
    for (const a of Object.keys(d.kirisOzel)) if (!adlar.has(a)) { delete d.kirisOzel[a]; deg = true; }
    if (!h.perdeler) {
      const var_ = new Set(perdeOku(d.form.perdeler).liste.map(p => perdeYaz([p])));
      for (const ozel of [d.perdeOzel, d.perdeBoyOzel]) for (const a of Object.keys(ozel)) {
        if (!var_.has(a)) { delete ozel[a]; deg = true; }
      }
    }
  }
  if (d.dosemeOzel && d.dosemeOzel.tur !== d.form.dosemeTuru) { d.dosemeOzel = null; deg = true; }
  return deg;
}
// Perdeler aks adıyla yazıldığından aks eklenince kaymaz; aks sayısı azalınca planda kalmayan açıklıklar silinir (geçerli aks girdisinde)
function perdeKirpD(d, alan) {
  const r = perdeOku(d.form[alan]), g = girdiOku(d), h = girdiDenetle(g);
  if (r.hata.length || !r.liste.length || h.ax || h.ay) return false;
  const k = perdeYaz(perdeKirp(r.liste, g.ax.length, g.ay.length));
  if (k === perdeYaz(r.liste)) return false;
  d.form[alan] = k; return true;
}
// Kolon düzeni aks adıyla yazılır: aks sayısı azalınca planda kalmayan kolonlar düşer (geçerli aks girdisinde)
function kolonDuzenKirpD(d) {
  const r = kolonDuzenOku(d.form.kolonDuzen), g = girdiOku(d), h = girdiDenetle(g);
  if (r.hata.length || !Object.keys(r.duzen).length || h.ax || h.ay) return false;
  const t = kolonDuzenYaz(kolonDuzenKirp(r.duzen, g.ax.length, g.ay.length));
  if (t === kolonDuzenYaz(r.duzen)) return false;
  d.form.kolonDuzen = t; return true;
}
// Yerleşim panelinden tek kolon: deger { sil: true } | { dx } | { dy } | null (geri al). Deneme durumunda denetlenir; hata varsa uygulanmaz.
export function kolonDuzenDegistir(d, aks, deger) {
  const r = kolonDuzenOku(d.form.kolonDuzen);
  if (r.hata.length) return { hata: 'Önce Girdiler sayfasındaki kolon düzeni yazım hatasını düzelt.' };
  const yeni = { ...r.duzen }; delete yeni[aks];
  if (deger && (deger.sil || deger.dx || deger.dy)) yeni[aks] = deger;
  const metin = kolonDuzenYaz(yeni), h = girdiDenetle(girdiOku({ ...d, form: { ...d.form, kolonDuzen: metin } }));
  if (h.kolonDuzen) return { hata: h.kolonDuzen.replace(/^Kolon düzeni: /, '') };
  if (metin === d.form.kolonDuzen) return { degisen: new Set() };
  d.form.kolonDuzen = metin; return { degisen: new Set(['kolonDuzen']) };
}
// Bir girdiyi yaz (form alanı ya da Girdiler hücresi). kesin: değişiklik bitti (change); aks/perde/tür temizliği o zaman yapılır.
// Dönüş: kendisi dışında değişen alanlar ('ozel': elle değerler düştü) — sayfa onları da yeniden yazar, hemen hesaplar.
export function girdiYaz(d, k, v, kesin = true) {
  const ek = new Set();
  if (k === 'duvar' || k === 'tutulu') d[k] = !!v; else d.form[k] = String(v);
  if (k === 'kullanim') { const q = KULLANIM[v]?.q; if (q != null && d.form.q !== tr(q)) { d.form.q = tr(q); ek.add('q'); } } // q Çizelge 7 değeriyle dolar, elle değiştirilebilir
  if (kesin) {
    if (k === 'perdeler' || k === 'subasman') {
      const r = perdeOku(d.form[k]), t = perdeYaz(r.liste);
      if (!r.hata.length && t !== d.form[k]) { d.form[k] = t; ek.add(k); }
    }
    if (k === 'kolonDuzen') { const r = kolonDuzenOku(d.form.kolonDuzen), t = kolonDuzenYaz(r.duzen); if (!r.hata.length && t !== d.form.kolonDuzen) { d.form.kolonDuzen = t; ek.add(k); } }
    if (k === 'ax' || k === 'ay') {
      for (const alan of ['perdeler', 'subasman']) if (perdeKirpD(d, alan)) ek.add(alan);
      if (kolonDuzenKirpD(d)) ek.add('kolonDuzen');
    }
    if (ozelTemizle(d)) ek.add('ozel');
  }
  return ek;
}
// Kaydırma: aksın bir yanındaki aralık uzar, öbürü kısalır. Sınır aksında tek aralık değişir.
export function aksKaymaSiniri(araliklar, i) {
  const a = araliklar[i - 1], b = araliklar[i];
  return [Math.max(a == null ? -Infinity : AKS_MIN - a, b == null ? -Infinity : b - AKS_MAX),
    Math.min(a == null ? Infinity : AKS_MAX - a, b == null ? Infinity : b - AKS_MIN)];
}
export function yerlesimKaydir(d, kaymalar) {
  const g = girdiOku(d), denetim = girdiDenetle(g), yeni = {};
  if (denetim.ax || denetim.ay) return { hata: denetim.ax ?? denetim.ay };
  for (const [alan, { indeks, metin }] of Object.entries(kaymalar)) {
    const araliklar = alan === 'ax' || alan === 'ay' ? g[alan] : [];
    if (!araliklar.length || !Number.isInteger(indeks) || indeks < 0 || indeks > araliklar.length)
      return { hata: 'Taşınacak aksı yeniden seç.' };
    const v = metin.trim() || '0', ad = alan === 'ax' ? 'X' : 'Y';
    // Kaydırma işaretli ve gruplanmamış metre değeridir. Virgül ya da nokta ondalık ayracı olabilir.
    if (!/^[+-]?(?:\d+(?:[.,]\d{1,3})?|[.,]\d{1,3})$/.test(v))
      return { alan, hata: `${ad} kaydırmasını metre cinsinden, en çok üç ondalık basamakla gir.` };
    const fark = Number(v.replace(',', '.')), [alt, ust] = aksKaymaSiniri(araliklar, indeks);
    if (fark < alt - 1e-9 || fark > ust + 1e-9)
      return { alan, hata: `${ad} yönünde izin verilen kaydırma ${tr(alt, 6)} ile ${tr(ust, 6)} m arasıdır.` };
    if (fark === 0) continue;
    yeni[alan] = araliklar.map((L, i) => {
      const delta = i === indeks - 1 ? fark : i === indeks ? -fark : 0;
      const boy = delta ? Math.min(AKS_MAX, Math.max(AKS_MIN, Number((L + delta).toFixed(9)))) : L;
      return boy.toString().replace('.', ',');
    }).join(' ');
  }
  if ((Object.keys(d.perdeBoyOzel).length || d.form.kolonDuzen.trim()) && Object.keys(yeni).length) {
    const h = girdiDenetle(girdiOku({ ...d, form: { ...d.form, ...yeni } })), hata = h.perdeBoyOzel ?? h.kolonDuzen;
    if (hata) return { hata };
  }
  // İki yöndeki kaydırma birlikte doğrulanır. Aks kimlikleri ve sırası korunur.
  const degisen = new Set();
  for (const [alan, v] of Object.entries(yeni)) {
    degisen.add(alan);
    for (const k of girdiYaz(d, alan, v)) degisen.add(k);
  }
  return { degisen };
}
// Sonuç hücresine yazılan elle değer. Boş: otomatik. Dönüş: hata iletisi ya da null.
// kolon: bir kenar girilince öbürü o anki değerle sabitlenir (elle boyutlanan kolon araçça büyütülmez); kiriş: aks hattı boyunca,
// yalnız yazılan boyut; döşeme: kat döşemesinin tamamı; perde: perdenin yazımı ("A/1–2"); radye: tek.
export function ozelDegistir(d, r, tip, ad, k, metin) {
  const bos = !String(metin).trim(), v = sayiOku(metin), [a, b] = SINIR[tip][k];
  if (!bos && !(v >= a && v <= b)) return `${ad} ${{ bw: 'b_w', lw: 'uzunluğu', a: 'taşma' }[k] ?? k}: ${tr(a)}–${tr(b)} ${k === 'a' ? 'm' : 'mm'} arası bir değer gir`;
  const yaz = (o, x) => { if (bos) delete o[x]; else o[x] = v; return o; };
  if (tip === 'kolon') {
    if (bos) delete d.ozel[ad];
    else { const c = r.kolonlar.find(x => x.ad === ad); d.ozel[ad] = { b: c.b, h: c.h, ...d.ozel[ad], [k]: v }; }
  } else if (tip === 'kiris') {
    const e = r.kirisler.find(x => x.ad === ad), aks = r.ag.hatlar[e.hat].aks, o = yaz({ ...d.kirisOzel[aks] }, k);
    if (Object.keys(o).length) d.kirisOzel[aks] = o; else delete d.kirisOzel[aks];
  } else if (tip === 'doseme') {
    const tur = d.form.dosemeTuru, o = yaz(d.dosemeOzel?.tur === tur ? { ...d.dosemeOzel } : { tur }, k);
    if (o.t != null && o.h != null && !(o.t < o.h)) return `Tabla kalınlığı t (${tr(o.t)} mm) döşeme h'den (${tr(o.h)} mm) küçük olmalı`;
    d.dosemeOzel = o.h != null || o.t != null ? o : null;
  } else if (tip === 'perde') {
    const p = r.perdeler.find(x => x.ad === ad);
    if (!p) return 'Perdeyi yeniden seç.';
    const aks = perdeYaz([p]);
    if (k === 'lw' && !bos) {
      const hata = perdeBoyHatasi(r.ag, p, v);
      if (hata) return `${ad}: ${hata}`;
    }
    yaz(k === 'lw' ? d.perdeBoyOzel : d.perdeOzel, aks);
  } else yaz(d.radyeOzel, k);
  return null;
}

// ── Girdiler sayfası: soldaki formun her alanı bir satır (Parametre | Değer | Birim | Not); gruplar başlık satırı
const disMi = F => F.dosemeTuru === 'disli' || F.dosemeTuru === 'kaset';
export const GIRDILER = [
  'Aks ağı',
  { k: 'ax', ad: 'X aks aralıkları', birim: 'm', metin: 1, not: 'Boşlukla ayır, ondalık virgülle: 4,5 5 3,8. X aksları 1, 2, 3…' },
  { k: 'ay', ad: 'Y aks aralıkları', birim: 'm', metin: 1, not: 'Y aksları A, B, C…' },
  { k: 'kat', ad: 'Kat sayısı', birim: 'kat', hata: 'katSayisi' },
  { k: 'H', ad: 'Kat yüksekliği', birim: 'mm', not: 'Kat yükseklikleri boş bırakılırsa tüm katlarda kullanılır' },
  { k: 'katYukseklikleri', ad: 'Kat yükseklikleri', birim: 'mm', metin: 1, not: 'Katları ayrı hesaplamak için tabandan başlayarak her kat için bir değer gir: 3000 3200 3000. Boşsa ortak kesit hesabı yapılır.' },
  { k: 'kolonDuzen', ad: 'Kolon düzeni', birim: 'm', metin: 1, not: 'Tek kolon, bütün katlarda: 2B kaldırıldı; 3A X +0,40 m (aks kesişiminden; X sağa, Y yukarı, kendi kiriş aksı boyunca). Planda: Yerleşimi düzenle → kolonu seç. Kirişler ızgara olarak çözülür.' },
  'Perdeler',
  { k: 'perdeler', ad: 'Perdeli açıklıklar', birim: '', metin: 1, not: 'A/1–2: A aksında 1–2 arası; 3/A–B: 3 aksında A–B arası; noktalı virgülle ayır' },
  { k: 'perdeKal', ad: 'Perde kalınlığı b_w', birim: 'mm', not: 'Başlangıç değeri; TBDY 7.6.1 sağlanana dek büyür. Perde sayfasında kalınlık ve toplam uzunluk ayrı ayrı girilebilir' },
  { k: 'tutulu', tip: 'onay', ad: 'Yanal ötelenme önlenmiş say', not: 'Plana çizilmeyen perdeler var: iki doğrultuda önlenmiş sayılır (TS 500 7.6.2.1)' },
  'Su basman perdeleri',
  { k: 'subasman', ad: 'Su basman açıklıkları', birim: '', metin: 1, not: 'Örnek: A/1–2 ya da 3/A–B. Mevcut kolon ve kirişler korunur.' },
  { k: 'subasmanH', ad: 'Su basman perde yüksekliği', birim: 'mm', not: 'Radye üstündeki perde yüksekliği' },
  { k: 'subasmanBw', ad: 'Su basman perde kalınlığı', birim: 'mm', not: 'Perde öz ağırlığı radye ön hesabına eklenir' },
  'Malzeme',
  { k: 'beton', tip: 'secim', ad: 'Beton', not: 'TBDY 7.2.5.1: C25 … C50' },
  { k: 'celik', tip: 'secim', ad: 'Donatı çeliği', not: 'TBDY 7.2.5.3' },
  'Döşeme',
  { k: 'dosemeTuru', tip: 'secim', ad: 'Döşeme türü', not: 'Kalınlığı araç bulur; Döşeme sayfasında h hücresine yazılırsa denetlenir' },
  { k: 'disAralik', ad: 'Diş aralığı e', birim: 'mm', goster: disMi, not: 'TS 500 11.3.1: ≤ 700 mm' },
  { k: 'disGen', ad: 'Diş genişliği', birim: 'mm', goster: disMi, not: '2φ12 + φ8 etriye + 20 mm örtü sığmalı (≥ 105 mm)' },
  { k: 'dolgu', ad: 'Dolgu (asmolen) ağırlığı', birim: 'kN/m²', goster: disMi, not: 'TS 500 ve TS 498 değer vermiyor; kullanılacak bloğa göre gir' },
  { k: 'duvar', tip: 'onay', ad: 'Döşemelerde bölme duvar var', not: 'Sehim sınırı ℓn/480 (yoksa ℓn/360)' },
  'Yükler',
  { k: 'g', ad: 'Kaplama, sıva g', birim: 'kN/m²', hata: 'gKaplama', not: 'Öz ağırlıklar 25 kN/m³ ile kendiliğinden eklenir' },
  { k: 'q', ad: 'Hareketli q', birim: 'kN/m²', not: 'Kullanım seçilince Çizelge 7 değeriyle dolar; elle değiştirilebilir' },
  { k: 'kullanim', tip: 'secim', ad: 'Kullanım (TS 498 Çizelge 7)', not: kullanimNot },
  { k: 'duvarDisTur', tip: 'secim', ad: 'Dış duvar', not: 'Dış akslardaki kirişlere; tür seçilirse kN/m² × net yükseklik' },
  { k: 'duvarDis', ad: 'Dış duvar yükü', birim: 'kN/m', goster: F => F.duvarDisTur === 'elle' },
  { k: 'duvarIcTur', tip: 'secim', ad: 'İç duvar', not: 'İç akslardaki kirişlere; kirişsizde alan yüküne çevrilir' },
  { k: 'duvarIc', ad: 'İç duvar yükü', birim: 'kN/m', goster: F => F.duvarIcTur === 'elle' },
  'Deprem ve zemin',
  { k: 'sds', ad: 'S_DS', birim: '–', not: 'Kolonda düşey deprem 0,2·S_DS·G' },
  { k: 'kDeprem', ad: 'Yatay deprem katsayısı', birim: '×', not: '≥ 1' },
  { k: 'zemin', ad: 'Zemin taşıma gücü q_k', birim: 'kN/m²', not: 'Temel q_t = q_k/1,4 ile boyutlanır (TBDY 16.8.3.1)' },
  { k: 'Df', ad: 'Temel derinliği', birim: 'm' },
  { k: 'tasma', ad: 'Radye taşması (aks dışına, en az)', birim: 'm', not: 'Radye sayfasında taşma elle verilebilir' },
];
const girdiGorunur = d => GIRDILER.filter(x => typeof x === 'string' || !x.goster || x.goster(d.form));
const girdiBul = k => GIRDILER.find(x => x.k === k);
const girdiDeger = (d, x) => x.tip === 'onay' ? d[x.k] : d.form[x.k];
const girdiHata = (hata, x) => hata[x.hata ?? x.k] ?? (x.k === 'perdeler' ? hata.perdeBoyOzel : undefined);
const notYazi = (d, x) => typeof x.not === 'function' ? x.not(d.form) : x.not ?? '';
const GSUT = [['Parametre', 240], ['Değer', 232], ['Birim', 72], ['Not', 460]];
function girdiHucre(d, x, h) {
  const v = girdiDeger(d, x), ozn = `data-ad="${x.k}" data-k="v" aria-label="${kacis(x.ad.replace(/_/g, ' '))}"${h ? ' aria-invalid="true"' : ''}`;
  if (x.tip === 'secim') return `<select ${ozn}>${SECENEK[x.k].map(([a, y]) => `<option value="${a}"${a === v ? ' selected' : ''}>${kacis(y)}</option>`).join('')}</select>`;
  if (x.tip === 'onay') return `<label class="onay"><input type="checkbox" ${ozn}${v ? ' checked' : ''}><span>${v ? 'Evet' : 'Hayır'}</span></label>`;
  return `<input size="1" ${ozn} value="${kacis(v)}"${x.metin ? ' class="metin"' : ' inputmode="decimal"'} spellcheck="false" autocomplete="off">`;
}
function girdiHtml(d, hata) {
  let no = 1;
  const satir = x => typeof x === 'string' ? `<tr class="ara-baslik"><th scope="row" class="no">${++no}</th><td colspan="4">${x}</td></tr>`
    : `<tr data-ad="${x.k}" tabindex="-1"><th scope="row" class="no">${++no}</th><td>${simge(x.ad)}</td><td class="hucre-gir">${girdiHucre(d, x, girdiHata(hata, x))}</td>` +
      `<td class="soluk">${x.birim ?? ''}</td><td class="not">${girdiHata(hata, x) ? `<span class="hata-yazi">${simge(girdiHata(hata, x))}</span>` : simge(notYazi(d, x))}</td></tr>`;
  return `<colgroup><col style="width:2.75rem">${GSUT.map(s => `<col style="width:${s[1] / 16}rem">`).join('')}</colgroup>` +
    `<thead><tr class="harfler"><th class="no"></th>${GSUT.map((_, j) => `<th aria-hidden="true">${HARF[j]}</th>`).join('')}</tr>` +
    `<tr class="adlar"><th class="no" aria-hidden="true">1</th>${GSUT.map(s => `<th scope="col">${s[0]}</th>`).join('')}</tr></thead>` +
    `<tbody>${girdiGorunur(d).map(satir).join('')}</tbody>`;
}

// ── Zincir sayfaları. Sütun: [başlık, genişlik px, sayı mı, değer (ekran), sınıf, ham değer (Excel)]; sınıf 'giris <tür> <alan>' düzenlenebilir hücre
const S = (b, w, f, d = 2, sinif) => [b, w, 1, e => tr(f(e), d), sinif, f]; // sayı sütunu: ekranda biçimli, Excel'e ham
const ORTAK = [
  ['Belirleyici koşul', 188, 0, e => belirleyen(e)?.ad ?? '—', 'ayrac'],
  ['Kullanım', 100, 0, null, 'dolgu'],
  ['Sonuç', 132, 0, e => sonucYaz(e.gecti, e.gecti ? 'Uygun' + (uyariVar(e) ? ' <span class="soluk">· not</span>' : '') : 'Uygun değil'), '', sonucDuz],
];
const ADAKS = [['Ad', 56, 0, e => e.ad], ['Aks', 112, 0, e => e.aks]];
const LXY = [S('ℓ<sub>x</sub> <small>m</small>', 64, e => e.lx), S('ℓ<sub>y</sub> <small>m</small>', 64, e => e.ly)];
// Sehim ekranda "değer / sınır", Excel'de iki sayı sütunu
const sehimYaz = e => e.sehim ? `${tr(e.sehim.deger, 1)} / ${tr(e.sehim.sinir, 1)}` : '—';
const SEHIM = (w = 132) => Object.assign(['Sehim / sınır <small>mm</small>', w, 1, sehimYaz], { excel: [['Sehim (mm)', e => e.sehim?.deger, 1], ['Sehim sınırı (mm)', e => e.sehim?.sinir, 1]] });
const GK = (b, w, f, k, d = 0) => S(b, w, f, d, `giris ${k}`);
const RADYE = e => e.ad === 'Radye';
export const SPEC = {
  doseme: tur => tur === 'kirissiz' ? [...ADAKS, ...LXY,
    GK('h <small>mm</small>', 64, e => e.h, 'doseme h'), S('g <small>kN/m²</small>', 80, e => e.gAlan), S('q <small>kN/m²</small>', 80, e => e.qAlan), SEHIM(), ...ORTAK]
  : tur === 'plak' ? [...ADAKS, ...LXY,
    ['Durum', 184, 0, e => e.durum], GK('h <small>mm</small>', 64, e => e.h, 'doseme h'), S('g <small>kN/m²</small>', 80, e => e.gAlan),
    ['Kısa alt', 88, 1, e => e.kisaAlt], ['Kısa üst', 88, 1, e => e.kisaUst], ['Uzun alt', 128, 1, e => e.uzunAlt], ['Uzun üst', 88, 1, e => e.uzunUst], SEHIM(), ...ORTAK]
  : [...ADAKS, ...LXY,
    ['Diş', 148, 0, e => e.durum], GK('h <small>mm</small>', 64, e => e.h, 'doseme h'), GK('t <small>mm</small>', 64, e => e.t, 'doseme t'), S('g <small>kN/m²</small>', 80, e => e.gAlan),
    ['Diş alt', 100, 1, e => e.disAlt], ['Diş üst', 100, 1, e => e.disUst], ['Diş etriye', 112, 1, e => e.disEtriye],
    tur === 'kaset' ? ['Dik diş alt', 100, 1, e => e.uzunAlt] : S('Enine diş', 76, e => e.enineDis, 0),
    ['Tabla', 84, 1, e => e.tabla], SEHIM(), ...ORTAK],
  serit: () => [['Ad', 72, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], S('ℓ<sub>1</sub> <small>m</small>', 60, e => e.l1), S('ℓ<sub>2</sub> <small>m</small>', 60, e => e.l2),
    S('M<sub>o</sub> <small>kNm</small>', 84, e => e.Mo, 1), ['Kolon ş. üst', 104, 1, e => e.csUst], ['Kolon ş. alt', 104, 1, e => e.csAlt],
    ['Orta ş. üst', 104, 1, e => e.msUst], ['Orta ş. alt', 104, 1, e => e.msAlt], ...ORTAK],
  zimb: () => [['Ad', 56, 0, e => e.ad], ['Kolon', 96, 0, e => `${e.kolon} · ${e.aks}`], S('V <small>kN</small>', 76, e => e.Nd, 0), S('d <small>mm</small>', 64, e => e.d, 0),
    S('u<sub>p</sub> <small>m</small>', 72, e => e.up, 3), S('γ', 72, e => e.gam, 3), S('V<sub>pd</sub> <small>kN</small>', 84, e => e.Vpd, 0),
    S('V<sub>pr</sub> <small>kN</small>', 84, e => e.Vpr, 0), ...ORTAK],
  kiris: () => [['Ad', 56, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], S('ℓ <small>m</small>', 56, e => e.L),
    GK('b <small>mm</small>', 64, e => e.b, 'kiris b'), GK('h <small>mm</small>', 64, e => e.h, 'kiris h'),
    S('M<sub>d</sub> mesnet', 88, e => e.MdMesnet, 1), S('M<sub>d</sub> açıklık', 88, e => e.MdAcik, 1), S('V<sub>e</sub> <small>kN</small>', 72, e => e.Ve, 1),
    ['Üst (mesnet hesabı)', 160, 1, e => e.ust], ['Alt (açıklık hesabı)', 160, 1, e => e.alt],
    ...[['Orta (üst / alt)', 'orta', 144], ['Sol üst ek', 'solUstEk'], ['Sol alt ek', 'solAltEk'],
      ['Montaj (üst sürekli)', 'montaj', 156], ['Düz (alt sürekli)', 'duz', 136], ['Pilye', 'pilye'],
      ['Sağ üst ek', 'sagUstEk'], ['Sağ alt ek', 'sagAltEk'], ['Gövde', 'govde']].map(([ad, alan, w = 120]) => [ad, w, 0, e => e[alan] ?? 'Hesaplanmadı']),
    ['Etriye sarılma', 104, 1, e => e.etrSar], ['Etriye orta', 96, 1, e => e.etrOrta],
    SEHIM(120), ...ORTAK],
  perde: () => [['Ad', 48, 0, e => e.ad], ['Aks', 88, 0, e => e.aks], GK('b<sub>w</sub> <small>mm</small>', 64, e => e.bw, 'perde bw'), GK('ℓ<sub>w</sub> <small>mm</small>', 92, e => e.lw, 'perde lw'),
    S('ℓ<sub>u</sub> <small>mm</small>', 68, e => e.lu, 0), S('N<sub>G</sub> <small>kN</small>', 80, e => e.NG, 0), S('β·N<sub>Q</sub> <small>kN</small>', 84, e => e.NQ, 0),
    S('N<sub>d</sub> <small>kN</small>', 80, e => e.Nd, 0), ['Uç boyuna', 92, 1, e => e.ucBoyuna ?? '—'], ['Uç etriye', 92, 1, e => e.ucEtriye ?? '—'],
    ['Gövde düşey', 96, 1, e => e.govdeDusey ?? '—'], ['Gövde yatay', 96, 1, e => e.govdeYatay ?? '—'], ...ORTAK],
  kolon: () => [['Ad', 56, 0, e => e.ad], ['Aks', 56, 0, e => e.aks],
    GK('b <small>mm</small>', 72, e => e.b, 'kolon b'), GK('h <small>mm</small>', 72, e => e.h, 'kolon h'),
    S('N<sub>G</sub> <small>kN</small>', 80, e => e.NG, 0), S('β·N<sub>Q</sub> <small>kN</small>', 84, e => e.NQ, 0), S('N<sub>d</sub> <small>kN</small>', 80, e => e.Nd, 0),
    ['Boyuna toplam', 104, 1, e => e.boyuna ?? '—'], ['Majör / yüz', 144, 1, e => e.boyunaMajor ?? '—'], ['Minör / yüz', 144, 1, e => e.boyunaMinor ?? '—'],
    ['Etriye sarılma', 104, 1, e => e.etrSar ?? '—'], ['Etriye orta', 96, 1, e => e.etrOrta ?? '—'], ['Kol', 200, 1, e => e.kol ?? '—'], ...ORTAK],
  katKolonYukleri: () => [S('Kat', 64, e => e.kat, 0), ['Ad', 64, 0, e => e.kolonAd], ['Aks', 64, 0, e => e.aks],
    S('N<sub>G</sub> <small>kN</small>', 112, e => e.NG, 1), S('β·N<sub>Q</sub> <small>kN</small>', 112, e => e.NQ, 1), S('N<sub>d</sub> <small>kN</small>', 112, e => e.Nd, 1)],
  subasman: () => [['Ad', 64, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], S('Net boy <small>m</small>', 88, e => e.L, 3),
    S('Kalınlık <small>mm</small>', 88, e => e.bw, 0), S('Yükseklik <small>mm</small>', 96, e => e.h, 0),
    S('Hacim <small>m³</small>', 88, e => e.hacim, 3), S('N<sub>G</sub> <small>kN</small>', 80, e => e.NG, 2),
    S('1,4·N<sub>G</sub> <small>kN</small>', 112, e => e.Nd, 2), ...ORTAK],
  // İlk satır radyenin kendisi (h, taşma, zemin basıncı; h ve taşma düzenlenebilir), sonrakiler şeritler
  radye: () => [['Ad', 80, 0, e => e.ad], ['Aks', 112, 0, e => e.aks],
    ['ℓ<sub>1</sub> · h', 80, 1, e => RADYE(e) ? `${tr(e.h, 0)} mm` : tr(e.l1), 'giris radye h', e => RADYE(e) ? e.h : e.l1],
    ['ℓ<sub>2</sub> · taşma', 88, 1, e => RADYE(e) ? `${tr(e.a)} m` : tr(e.l2), 'giris radye a', e => RADYE(e) ? e.a : e.l2],
    ['M<sub>o</sub> · q<sub>o</sub>', 132, 1, e => RADYE(e) ? `${tr(e.qo, 0)} kN/m²` : e.perde ? `q<sub>w</sub> ${tr(e.qw, 0)} kN/m` : tr(e.Mo, 1), '', e => RADYE(e) ? e.qo : e.perde ? e.qw : e.Mo],
    ['Kolon ş. alt', 104, 1, e => e.csAlt ?? '—'], ['Kolon ş. üst', 104, 1, e => e.csUst ?? '—'], ['Orta ş. alt', 104, 1, e => e.msAlt ?? '—'], ['Orta ş. üst', 104, 1, e => e.msUst ?? '—'], ...ORTAK],
};
// Excel sekmeleri; her biri bir hesap adımına bağlı (Girdiler her adımda: adım değiştirmez)
export const SAYFALAR = [
  { ad: 'girdi', baslik: 'Girdiler', adim: null, girdi: true },
  { ad: 'doseme', baslik: 'Döşeme', adim: 'doseme', dizi: r => r.dosemeler, spec: r => SPEC.doseme(r.tur) },
  { ad: 'serit', baslik: 'Şeritler', adim: 'doseme', dizi: r => r.seritler, spec: SPEC.serit, goster: r => r.tur === 'kirissiz' },
  { ad: 'zimbD', baslik: 'Zımbalama', adim: 'doseme', dizi: r => r.zimbD, spec: SPEC.zimb, goster: r => r.tur === 'kirissiz' },
  { ad: 'kiris', baslik: 'Kiriş', adim: 'kiris', dizi: r => r.kirisler, spec: SPEC.kiris, goster: r => r.tur !== 'kirissiz' },
  { ad: 'kolon', baslik: 'Kolon', adim: 'kolon', dizi: r => r.kolonlar, spec: SPEC.kolon },
  { ad: 'katKolonYukleri', baslik: 'Kat kolon yükleri', adim: 'kolon', yuk: true,
    dizi: r => (r.katKolonYukleri ?? []).map(e => ({ ...e, kolonAd: e.ad, ad: `${e.kat}-${e.ad}` })), spec: SPEC.katKolonYukleri },
  { ad: 'perde', baslik: 'Perde', adim: 'kolon', dizi: r => r.perdeler, spec: SPEC.perde, goster: r => r.perde },
  { ad: 'radye', baslik: 'Radye', adim: 'temel', dizi: r => [r.radye, ...r.radyeSerit, ...r.radyePerde], spec: SPEC.radye },
  { ad: 'subasman', baslik: 'Su basman', adim: 'temel', dizi: r => r.subasmanlar ?? [], spec: SPEC.subasman, goster: r => r.subasman },
  { ad: 'radyeZ', baslik: 'Radye zımbalama', adim: 'temel', dizi: r => r.radyeZimb, spec: SPEC.zimb },
];
// Görünen sekmeler girdiden (girdi hatasında da sekmeler yerinde kalsın)
export const gorunur = (d, r) => SAYFALAR.filter(s => !(s.yuk && r?.katlar?.length) && (!s.goster || s.goster({ tur: d.form.dosemeTuru, perde: perdeOku(d.form.perdeler).liste.length > 0, subasman: !!d.form.subasman.trim() })));
const KIRIS_NOT = 'Kiriş donatısı düşey yük ön hesabıdır. Orta sütunu açıklık ortasındaki sürekli üst ve alt çubukları gösterir. İlave çubuk boyları, kenetlenme ve deprem etkileri kesin hesapta belirlenir.';
const KAT_YUK_NOT = 'Zemin kat 1, çatı en büyük kattır. Yükler eşit kat yükü ve ortak kesit varsayımıyladır; katlara ayrı boyut ve donatı hesabı yapılmamıştır.';

// Katların her biri hesaplanmış sonuçlar olmalı; eksik katı ortak sonuçla doldurma.
export function katGorunumu(r, secili) {
  if (!r?.katlar?.length) return r;
  const kat = r.katlar.find(k => k.kat === secili) ?? r.katlar[0];
  if (!['dosemeler', 'kirisler', 'kolonlar'].every(k => Array.isArray(kat[k]))) throw new Error('Kat sonuçları eksik');
  return { ...r, ...kat, katlar: r.katlar, aktifKat: kat.kat, ag: r.ag, radye: r.radye, radyeSerit: r.radyeSerit,
    radyeZimb: r.radyeZimb, radyePerde: r.radyePerde, notlar: r.notlar, yanal: r.yanal,
    perdeler: kat.perdeler ?? [], seritler: kat.seritler ?? [], zimbD: kat.zimbD ?? [], h: kat.h ?? kat.dosemeler[0]?.h };
}

// Düzenlenebilir hücre: hesaba giren değeri gösterir; elle değer uygulandıysa turuncu (kolonda durumla karşılaştırılır: aks sayısı yazılırken uygulanmaz)
const girisDeger = (tip, k, e) => tip === 'radye' && !RADYE(e) ? undefined : e[k];
const elleMi = (tip, k, e, d) => tip === 'kolon' ? d.ozel[e.ad]?.[k] != null && d.ozel[e.ad][k] === e[k] : !!e.ozel?.[k];
function hucre([, , sayi, dg, sinif = ''], e, d, baski, salt = false) {
  const [tip, t2, k] = sinif.split(' ');
  const cls = [sayi && 'sayi', tip === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ');
  const v = tip === 'giris' ? girisDeger(t2, k, e) : undefined;
  if (v != null && (!salt || (t2 === 'perde' && k === 'lw'))) {
    const elle = elleMi(t2, k, e, d), yaz = k === 'a' ? tr(v) : String(v);
    if (baski) return `<td class="sayi">${tr(v, k === 'lw' ? 3 : k === 'a' ? 2 : 0)}${elle ? ' (elle)' : ''}</td>`;
    return `<td class="hucre-gir"><input size="1" data-tip="${t2}" data-ad="${e.ad}" data-k="${k}" value="${yaz}"${elle ? ' class="ozel"' : ''} inputmode="decimal" spellcheck="false" aria-label="${e.ad} ${k === 'bw' ? 'b w' : k === 'lw' ? 'uzunluğu' : k === 'a' ? 'taşma' : k}, ${k === 'a' ? 'm' : 'mm'}"></td>`;
  }
  if (tip === 'dolgu') {
    const u = kul(e);
    if (u == null) return '<td></td>';
    if (!Number.isFinite(u)) return '<td class="dolgu">—</td>';
    return `<td class="dolgu${u > 1 + 1e-9 ? ' asim' : ''}">${baski ? '' : `<i style="width:${Math.min(u, AZAMI) / AZAMI * 100}%"></i>`}<span>%${Math.round(u * 100)}</span></td>`;
  }
  return `<td${cls ? ` class="${cls}"` : ''}>${dg(e)}</td>`;
}
// Sayfa tablosu (HTML). baski: süslemesiz tablo (yazdırma)
export function tabloHtml(sf, r, d, baski = false) {
  const spec = sf.spec(r), l = sf.dizi(r);
  const salt = !!r.aktifKat && sf.adim !== 'temel';
  const ad = s => `<th scope="col"${s[2] || s[4] === 'ayrac' ? ` class="${[s[2] && 'sayi', s[4] === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ')}"` : ''}>${s[0]}</th>`;
  const not = sf.yuk ? KAT_YUK_NOT : sf.ad === 'kiris' ? KIRIS_NOT : '';
  if (baski) return `<table>${not ? `<caption>${not}</caption>` : ''}<thead><tr>${spec.map(ad).join('')}</tr></thead><tbody>${l.map(e => `<tr>${spec.map(s => hucre(s, e, d, true, salt)).join('')}</tr>`).join('')}</tbody></table>`;
  return `<colgroup><col style="width:2.75rem">${spec.map(s => `<col style="width:${s[1] / 16}rem">`).join('')}</colgroup>` + // rem: tema yazı boyutuyla büyür
    `<thead><tr class="harfler"><th class="no"></th>${spec.map((s, j) => `<th aria-hidden="true"${s[4] === 'ayrac' ? ' class="sinir-sol"' : ''}>${HARF[j]}</th>`).join('')}</tr>` +
    `<tr class="adlar"><th class="no" aria-hidden="true">1</th>${spec.map(ad).join('')}</tr></thead>` +
    `<tbody>${l.map((e, i) => `<tr data-ad="${e.ad}" tabindex="-1"><th scope="row" class="no">${i + 2}</th>${spec.map(s => hucre(s, e, d, false, salt)).join('')}</tr>`).join('')}</tbody>`;
}
export function maddeTablosu(e) {
  return `<table class="tablo"><thead><tr><th scope="col">Koşul</th><th scope="col">Değer</th><th scope="col">Sınır</th><th scope="col">Kaynak</th><th scope="col">Kullanım</th><th scope="col"><span class="gizli">Sonuç</span></th></tr></thead><tbody>` +
    e.maddeler.map(x => `<tr><td>${x.ad}</td><td class="olcu">${simge(deger(x))}</td><td class="olcu">${simge(x.sinir)}</td><td class="kaynak">${x.kaynak}</td>` +
      `<td>${x.kullanim == null ? '' : !Number.isFinite(x.kullanim) ? '—' : `<span class="kul${x.kullanim > 1 + 1e-9 ? ' asim' : ''}"><i><b style="width:${Math.min(x.kullanim, AZAMI) / AZAMI * 100}%"></b></i>%${Math.round(x.kullanim * 100)}</span>`}</td>` +
      `<td>${x.gecti ? sonucYaz(true, 'Sağlıyor') : x.uyari ? sonucYaz(false, 'Not', 'uyari') : sonucYaz(false, 'Sağlamıyor')}</td></tr>`).join('') + '</tbody></table>';
}
// Durum çubuğu: düzenlenebilir hücrelerin kullanımı
const IPUCU = {
  girdi: ' · Değer hücresine yaz, Enter ya da ↓ sonraki satır; hesap kendiliğinden yenilenir',
  doseme: r => ` · h${r.tur === 'disli' || r.tur === 'kaset' ? ', t' : ''} hücresine yaz: kat döşemesi elle (turuncu, denetlenir), sil: otomatik`,
  kiris: ' · Düşey yük ön hesabı · b, h hücresine yaz: aks boyunca elle (turuncu, denetlenir), sil: otomatik',
  kolon: ' · b, h hücresine yaz: elle boyut, sil: otomatik',
  perde: ' · ℓ<sub>w</sub> tüm katlar için toplam perde uzunluğu, sil: otomatik',
  subasman: ' · Net uzunluk mevcut mesnet yüzleri arasındadır. Radyeye perde öz ağırlığı eklenir.',
  radye: ' · Radye satırında h, taşma hücresine yaz: elle (turuncu, denetlenir), sil: otomatik',
};

// Yazdırma ve Excel için girdi özeti (tek paragraf)
const duvarYaz = (tur, w) => DUVAR[tur] ? `${DUVAR[tur].ad.toLowerCase()} ${tr(DUVAR[tur].q)} kN/m² (net yükseklikle)` : `${tr(w)} kN/m`;
export function girdiOzet(d, r) {
  const g = girdiOku(d), y = yon => `${yon.toUpperCase()} ${r.yanal[yon].tutulu ? 'önlenmiş' : 'önlenmemiş'}${r.yanal[yon].phi != null ? ` (φ ${tr(r.yanal[yon].phi, 3)})` : ''}`;
  return `Aks aralıkları X: ${g.ax.map(v => tr(v)).join(' · ')} m; Y: ${g.ay.map(v => tr(v)).join(' · ')} m · ${tr(g.katSayisi, 0)} kat, H ${g.katYukseklikleri ? g.katYukseklikleri.map(v => tr(v, 0)).join(' · ') : tr(g.H, 0)} mm · ${g.beton}, ${g.celik} · ${(TUR_AD[g.dosemeTuru] ?? '').toLowerCase()} döşeme${r ? `, h ${r.h} mm` : ''}${disMi(d.form) ? ` (diş aralığı ${tr(g.disAralik, 0)} mm, diş genişliği ${tr(g.disGen, 0)} mm, dolgu ${tr(g.dolgu)} kN/m²)` : ''}, bölme duvar ${g.dosemeDuvar ? 'var (sehim ℓ<sub>n</sub>/480)' : 'yok (ℓ<sub>n</sub>/360)'} · kullanım: ${secimYazi('kullanim', g.kullanim)}${r ? ` (β ${tr(r.beta)})` : ''} · g ${tr(g.gKaplama)} kN/m², q ${tr(g.q)} kN/m² · duvar dış ${duvarYaz(g.duvarDisTur, g.duvarDis)}, iç ${duvarYaz(g.duvarIcTur, g.duvarIc)} · S<sub>DS</sub> ${tr(g.sds)}, deprem katsayısı ${tr(g.kDeprem)}${g.yanalTutulu ? ', yanal ötelenme elle önlenmiş sayıldı' : ''}${g.kolonDuzen?.trim() ? ` · kolon düzeni: ${kacis(g.kolonDuzen)}` : ''}${r?.perdeler.length ? ` · perdeler: ${r.perdeler.map(p => `${p.ad} ${p.aks.replace(' / ', '/')} (b<sub>w</sub> ${p.bw} mm, ℓ<sub>w</sub> ${tr(p.lw, 3)} mm)`).join(', ')}; yanal ötelenme ${['x', 'y'].map(y).join(', ')}` : ''} · zemin q<sub>k</sub> ${tr(g.zemin, 0)} kN/m² (q<sub>t</sub> = q<sub>k</sub>/1,4), temel derinliği ${tr(g.Df)} m, radye taşması ≥ ${tr(g.tasma)} m.`;
}

// ── Hesap işçisi (hesap-isci.js): motor ana iş parçacığını kilitlemesin. Aynı anda tek istek; başka girdi istenince süren hesap durdurulur
// (işçi yeniden kurulur), yalnız son istenen girdinin yanıtı (sıra no) kabul edilir. İşçi kurulamaz ya da yüklenemezse hesap eşzamanlı.
function isciKur(bitti) {
  let isci = null, yok = typeof Worker === 'undefined', ucusta = null, sira = 0;
  const kapat = () => { isci?.terminate(); isci = null; };
  const kur = () => {
    try { isci = new Worker(new URL('./hesap-isci.js', import.meta.url), { type: 'module' }); } catch { yok = true; return null; }
    const w = isci;
    w.onmessage = ({ data }) => { if (w !== isci || data.id !== ucusta?.id) return; const u = ucusta; ucusta = null; bitti(u, data); };
    w.onerror = w.onmessageerror = e => { // modül işçisi yok (eski tarayıcı) ya da yüklenemedi: bekleyen istek burada, sonrakiler eşzamanlı
      e.preventDefault?.(); if (w !== isci) return;
      yok = true; kapat(); const u = ucusta; ucusta = null; if (u) bitti(u, { sonuc: zincirHesap(u.g) });
    };
    return w;
  };
  return {
    get anahtar() { return ucusta?.anahtar; },
    iste(g, anahtar) { // false: işçi yok, eşzamanlı hesapla
      if (ucusta?.anahtar === anahtar) return true;
      if (yok) return false;
      if (ucusta) { ucusta = null; kapat(); } // eski girdinin hesabı boşa sürmesin
      const w = isci ?? kur(); if (!w) return false;
      ucusta = { id: ++sira, g, anahtar }; w.postMessage({ id: ucusta.id, g }); return true;
    },
    birak() { if (ucusta) { ucusta = null; kapat(); } },
  };
}

// ── Kitap denetçisi: sayfa tablosu, sekmeler, formül çubuğu, durum çubuğu, ayrıntı. Her iki sayfa kendi öğeleriyle kurar.
// el: { sayfa, kap, sekmeler: [kap…], ad, formul, durumSol, durumSag, ayrinti, ayrintiBaslik, ayrintiNot, iz }
// yenile(): sayfanın tam hesap + çizimi; secildi(): seçim değişti (plan vurgusu); girdiYazildi(k, ek): Girdiler hücresi formu güncellesin
// Hesap işçide sürerken (k.hesapta) önceki sonuç görünür, durum çubuğunda «Hesaplanıyor…»; yanıt gelince yenile() yeniden çağrılır.
// Taze sonuç gerekenler: k.hazir() (söz; Excel, Yazdır düğmesi, panel iletileri), k.kesinlestir() (eşzamanlı; beforeprint).
export function kitapKur(el, { yenile, secildi = () => {}, katDegisti = () => {}, girdiYazildi = () => {} }) {
  const $s = s => el.sayfa.querySelector(s);
  const k = { d: durumYukle(), g: null, hata: {}, sonuc: null, tumSonuc: null, kat: 1, sayfaAd: 'girdi', secili: null, bekle: 0, anahtar: null, hesapta: false };
  let zorla = false, gZaman = 0;
  const bekleyenler = [], yazilan = new Map(); // yazilan: sonucu henüz gelmemiş elle hücre değerleri (seçici → metin)
  const isci = isciKur((u, { sonuc, hata }) => {
    if (hata) console.error(hata); // motor hatası (eşzamanlı yolda da sayfada istisna olurdu)
    k.tumSonuc = sonuc ?? null; k.anahtar = u.anahtar; yenile();
  });
  const gosterge = document.createElement('span');
  gosterge.className = 'hesap-gosterge'; gosterge.setAttribute('role', 'status'); el.durumSol.after(gosterge);
  const gostergeCiz = () => { // kısa hesapta görünmesin: 150 ms sonra (gZaman −1: göründü). html[data-hesap]: önceki sonuç soluk (calisma.css)
    if (!k.hesapta) { clearTimeout(gZaman); gZaman = 0; }
    else if (!gZaman) gZaman = setTimeout(() => { gZaman = -1; gostergeCiz(); }, 150);
    const goster = gZaman === -1, yazi = goster ? 'Hesaplanıyor…' : '';
    if (gosterge.textContent !== yazi) gosterge.textContent = yazi;
    if (goster) document.documentElement.dataset.hesap = ''; else delete document.documentElement.dataset.hesap;
  };
  const boySifirla = document.createElement('button');
  boySifirla.type = 'button'; boySifirla.className = 'dugme perde-boy-sifirla'; boySifirla.hidden = true;
  boySifirla.textContent = 'Geçersiz perde uzunluklarını otomatiğe al';
  boySifirla.addEventListener('click', () => {
    const g = girdiOku(k.d);
    const perdeler = new Map(perdeOku(g.perdeler).liste.map(p => [perdeYaz([p]), p]));
    for (const [ad, lw] of Object.entries(k.d.perdeBoyOzel)) {
      const p = perdeler.get(ad);
      if (!p || perdeBoyHatasi(g, p, lw)) delete k.d.perdeBoyOzel[ad];
    }
    k.simdi();
  });
  el.kap.before(boySifirla);
  const katAlan = document.createElement('label');
  katAlan.hidden = true; katAlan.className = 'alan'; katAlan.textContent = 'Kat ';
  const katSecici = document.createElement('select'); katSecici.setAttribute('aria-label', 'Gösterilen kat'); katAlan.append(katSecici); el.kap.before(katAlan);
  katSecici.addEventListener('change', () => { k.kat = Number(katSecici.value); k.sonuc = katGorunumu(k.tumSonuc, k.kat); k.secili = null; katDegisti(); });
  k.gorunur = () => gorunur(k.d, k.tumSonuc);
  k.aktif = () => SAYFALAR.find(s => s.ad === k.sayfaAd);
  // Girdi denetimi eşzamanlı (ucuz); motor işçide. Sonuç girdi anahtarıyla (JSON) saklanır: yanıt gelince yenile() aynı anahtarı bulur.
  k.hesap = () => { const g = girdiOku(k.d), hata = girdiDenetle(g), anahtar = JSON.stringify(g); k.g = g; k.hata = hata;
    if (Object.keys(hata).length) { isci.birak(); k.tumSonuc = null; k.anahtar = anahtar; }
    else if (anahtar === k.anahtar) isci.birak(); // geri alınan girdi: süren hesap gereksiz
    else if (zorla || !isci.iste(g, anahtar)) { isci.birak(); k.tumSonuc = zincirHesap(g); k.anahtar = anahtar; }
    k.hesapta = anahtar !== k.anahtar; // işçi hesaplıyor: önceki sonuç görünür
    if (!k.hesapta) yazilan.clear();
    const katlar = k.tumSonuc?.katlar ?? []; if (katlar.length && !katlar.some(x => x.kat === k.kat)) k.kat = katlar[0].kat;
    k.sonuc = katGorunumu(k.tumSonuc, k.kat); katAlan.hidden = !katlar.length;
    boySifirla.hidden = !k.hata.perdeBoyOzel;
    katSecici.innerHTML = katlar.map(x => `<option value="${x.kat}">${x.kat}. kat${x.H != null ? ` · ${tr(x.H, 0)} mm` : ''}</option>`).join('');
    katSecici.value = String(k.kat); durumKaydet(k.d); gostergeCiz();
    if (!k.hesapta) for (const f of bekleyenler.splice(0)) f(); // bekleyenler sayfa çizimi bittikten sonra sürer (söz)
  };
  // yazarken her tuşta değil, 150 ms durunca hesapla (hesap işçide; yalnız son girdi hesaplanır)
  k.geciktir = () => { clearTimeout(k.bekle); k.bekle = setTimeout(() => { k.bekle = 0; yenile(); }, 150); };
  k.simdi = () => { clearTimeout(k.bekle); k.bekle = 0; yenile(); };
  k.bekleyeni = () => { if (k.bekle) k.simdi(); };
  k.guncel = () => !k.bekle && !k.hesapta && JSON.stringify(girdiOku(k.d)) === k.anahtar; // gösterilen sonuç şimdiki girdinin
  // Şimdiki girdinin sonucu hazır olunca çözülen söz (bekleyen gecikme hemen işlenir). Girdi hatasında sonuç null ile hemen çözülür.
  k.hazir = () => {
    if (k.bekle || JSON.stringify(girdiOku(k.d)) !== (isci.anahtar ?? k.anahtar)) k.simdi();
    return k.hesapta ? new Promise(r => bekleyenler.push(r)) : Promise.resolve();
  };
  // Eşzamanlı: sonuç şimdiki girdiye ait değilse burada hesaplanır (işçi durur), sayfa yeniden çizilir. beforeprint söz bekleyemez.
  k.kesinlestir = () => { clearTimeout(k.bekle); k.bekle = 0; zorla = true; try { yenile(); } finally { zorla = false; } };
  // Ctrl/⌘+P hesap sürerken: sonucu bekle, sonra yazdır (beforeprint'te eşzamanlı hesap gerekmesin)
  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'p' || k.guncel()) return;
    e.preventDefault(); k.hazir().then(() => print());
  });
  k.sekmeCiz = (ek = [], sec = k.sayfaAd) => { // ek: sayfanın kendi sekmeleri (tablo.html: kolon listesi)
    const h = [...k.gorunur(), ...ek].map(s => `<button type="button" role="tab" aria-controls="${s.kontrol ?? el.sayfa.id}" data-sayfa="${s.ad}" aria-selected="${s.ad === sec}" tabindex="${s.ad === sec ? 0 : -1}">${s.baslik}</button>`).join('');
    for (const x of el.sekmeler) x.innerHTML = h;
  };
  // Yeniden çizimde odak ve imleç korunur (Girdiler'e yazarken hesap araya girer; Enter'la geçilen hücre yerinde kalır).
  // Hesap sürerken: yazılıp sonucu gelmemiş hücre o değeri gösterir; yazılmakta olan (henüz change olmamış) hücrenin metni korunur.
  k.sayfaCiz = () => {
    const t = el.sayfa, a = document.activeElement, icinde = t.contains(a);
    const odak = icinde && a.dataset.k ? { ad: a.dataset.ad, k: a.dataset.k, s: a.selectionStart, e: a.selectionEnd, v: a.dataset.tip && a.value !== a.defaultValue ? a.value : null } : null;
    const sf = k.aktif();
    if (sf.girdi) { t.style.width = `max(100%, ${(44 + GSUT.reduce((x, s) => x + s[1], 0)) / 16}rem)`; t.innerHTML = girdiHtml(k.d, k.hata); }
    else if (!k.sonuc) t.innerHTML = '';
    else { t.style.width = `max(100%, ${(44 + sf.spec(k.sonuc).reduce((x, s) => x + s[1], 0)) / 16}rem)`; t.innerHTML = tabloHtml(sf, k.sonuc, k.d);
      if (k.hesapta) for (const [s, v] of yazilan) { const x = $s(s); if (x) { x.defaultValue = v; x.classList.toggle('ozel', !!v.trim()); } } }
    t.setAttribute('role', 'grid'); t.setAttribute('aria-label', `${sf.baslik} sayfası`); t.classList.toggle('girdi', !!sf.girdi); // satırlarda aria-selected var
    const el2 = odak && $s(`[data-ad="${odak.ad}"][data-k="${odak.k}"]`);
    if (el2) { if (odak.v != null) el2.value = odak.v; el2.focus({ preventScroll: true }); if (odak.s != null) try { el2.setSelectionRange(odak.s, odak.e); } catch {} }
    else if (icinde && document.activeElement === document.body) $s(`tr[data-ad="${k.secili}"]`)?.focus({ preventScroll: true });
  };
  k.durumCiz = () => {
    const sf = k.aktif(), r = k.sonuc;
    if (sf.girdi) {
      const n = girdiGorunur(k.d).filter(x => typeof x !== 'string'), bad = n.filter(x => girdiHata(k.hata, x)).length;
      el.durumSol.innerHTML = `Girdiler <b>${n.length}</b> · Hatalı <b>${bad}</b>${IPUCU.girdi}`;
    } else if (!r) { el.durumSol.textContent = k.hesapta ? '' : 'Girdi hatası'; el.durumSag.textContent = ''; return; } // ilk hesap: gösterge
    else {
      const l = sf.dizi(r), bad = l.filter(e => !e.gecti).length, ip = IPUCU[sf.ad];
      const yanal = sf.ad === 'perde' && r.yanal ? ' · yanal ötelenme ' + ['x', 'y'].map(y => `${y.toUpperCase()} <b>${r.yanal[y].tutulu ? 'önlenmiş' : 'önlenmemiş'}</b>${r.yanal[y].phi != null ? ` (φ ${tr(r.yanal[y].phi, 3)})` : ''}`).join(', ') : '';
      el.durumSol.innerHTML = sf.yuk ? `${sf.baslik} <b>${l.length}</b> · ${KAT_YUK_NOT}` : `${r.aktifKat && sf.adim !== 'temel' ? `${r.aktifKat}. kat · ` : ''}${sf.baslik} <b>${l.length}</b> · Uygun değil <b>${bad}</b>${r.aktifKat && sf.adim !== 'temel' && sf.ad !== 'perde' ? '' : typeof ip === 'function' ? ip(r) : ip ?? ''}${yanal}`;
    }
    el.durumSag.innerHTML = r ? `Kat yükü ortalaması (G + Q) <b>${tr(r.katYukAlan, 1)}</b> kN/m² · β = <b>${tr(r.beta)}</b>` : '';
  };
  k.secimCiz = () => {
    const sf = k.aktif();
    if (sf.girdi) girdiSecim(); else {
      const l = k.sonuc ? sf.dizi(k.sonuc) : [];
      let e = l.find(x => x.ad === k.secili);
      if (!e && k.sonuc) { e = l.find(x => !x.gecti) ?? l[0]; k.secili = e?.ad ?? null; } // girdi hatasında seçim korunur
      satirSec();
      el.ad.value = k.secili ?? '';
      if (sf.yuk) {
        el.formul.textContent = e ? `${e.kat}. kat · ${e.kolonAd} · ${e.aks}` : '';
        el.ayrintiBaslik.textContent = 'Kat kolon yükleri';
        el.ayrintiNot.textContent = '';
        el.ayrinti.innerHTML = `<p>${KAT_YUK_NOT}</p>`;
        el.iz.innerHTML = '';
        secildi();
        return;
      }
      const b = e && belirleyen(e);
      el.formul.innerHTML = b ? `${b.ad}: ${simge(deger(b))}, ${simge(b.sinir)} <span class="soluk">· ${b.kaynak}</span>` : '';
      el.ayrintiBaslik.textContent = e ? `${sf.baslik} ${e.ad} · ${e.aks} · koşullar` : 'Koşullar';
      el.ayrintiNot.textContent = e ? (e.gecti ? 'Uygun' : 'Uygun değil') : '';
      el.ayrinti.innerHTML = e ? maddeTablosu(e) : `<p>${k.sonuc ? 'Bu sayfada satır yok.' : k.hesapta ? '' : 'Girdi hatasını düzelt (Girdiler sayfası).'}</p>`;
      el.iz.innerHTML = (e?.iz ?? []).map(x => `<li>${simge(x)}</li>`).join('');
    }
    secildi();
  };
  const satirSec = () => { for (const tr_ of el.sayfa.querySelectorAll('tbody tr[data-ad]')) {
    const on = tr_.dataset.ad === k.secili;
    tr_.setAttribute('aria-selected', on); tr_.tabIndex = on ? 0 : -1; tr_.cells[0].classList.toggle('aktif', on);
  } };
  function girdiSecim() {
    const n = girdiGorunur(k.d).filter(x => typeof x !== 'string');
    let x = n.find(y => y.k === k.secili);
    if (!x) { x = n.find(y => girdiHata(k.hata, y)) ?? n[0]; k.secili = x.k; }
    satirSec();
    const h = girdiHata(k.hata, x), v = girdiDeger(k.d, x), sat = $s(`tr[data-ad="${x.k}"]`);
    el.ad.value = sat ? `B${sat.cells[0].textContent}` : '';
    const yazi = x.tip === 'onay' ? (v ? 'Evet' : 'Hayır') : x.tip === 'secim' ? secimYazi(x.k, v) : v;
    el.formul.innerHTML = `${simge(x.ad)} = ${kacis(yazi)}${x.birim ? ' ' + x.birim : ''}${h ? ` <span class="hata-yazi">· ${simge(h)}</span>` : ''}`;
    el.ayrintiBaslik.textContent = `Girdiler · ${x.ad.replace(/_/g, ' ')}`;
    el.ayrintiNot.textContent = h ? 'Girdi hatası' : '';
    el.ayrinti.innerHTML = `<p>${h ? `<span class="hata-yazi">${simge(h)}</span><br>` : ''}${simge(notYazi(k.d, x)) || 'Bu girdi her iki sayfada (Döşemeden temele ve Tablo) aynı projeye yazılır.'}</p>`;
    el.iz.innerHTML = '';
  }
  // Seçili satırı yalnız sayfa kabı içinde görünür yap; pencere kaymasın. 58: yapışkan iki başlık satırı.
  k.satiraKaydir = () => {
    const kap = el.kap, tr_ = $s(`tr[data-ad="${k.secili}"]`); if (!tr_) return;
    const a = kap.getBoundingClientRect(), r = tr_.getBoundingClientRect(), ust = a.top + kap.clientTop + 58, alt = a.top + kap.clientTop + kap.clientHeight;
    if (r.top < ust) kap.scrollTop += r.top - ust;
    else if (r.bottom > alt) kap.scrollTop += r.bottom - alt;
  };
  k.girdiYaz = (key, v, kesin) => {
    const ek = girdiYaz(k.d, key, v, kesin);
    girdiYazildi(key, ek);
    if (kesin) setTimeout(k.simdi); else k.geciktir(); // kesin: odak yeni hücreye geçtikten sonra (Enter) çiz
  };

  // Olaylar. Seçim pointerdown'da: bir hücrenin change olayı yeniden çizmeden önce tıklanan satır seçilmiş olur.
  const t = el.sayfa, metinMi = x => x.tagName === 'INPUT' && x.type !== 'checkbox';
  t.addEventListener('pointerdown', e => { const tr_ = e.target.closest('tbody tr[data-ad]'); if (!tr_) return; k.secili = tr_.dataset.ad; k.secimCiz(); });
  t.addEventListener('mouseup', e => { if (metinMi(e.target)) { e.preventDefault(); e.target.select(); } }); // Excel gibi: tıklanan hücre tümüyle seçilir, yazınca üzerine yazar
  t.addEventListener('focusin', e => {
    if (metinMi(e.target)) e.target.select();
    const tr_ = e.target.closest('tbody tr[data-ad]');
    if (tr_ && tr_.dataset.ad !== k.secili) { k.secili = tr_.dataset.ad; k.secimCiz(); }
  });
  t.addEventListener('input', e => { const x = e.target; if (x.dataset.k === 'v' && metinMi(x)) k.girdiYaz(x.dataset.ad, x.value, false); });
  t.addEventListener('change', e => {
    const x = e.target;
    if (x.dataset.k === 'v') return k.girdiYaz(x.dataset.ad, x.type === 'checkbox' ? x.checked : x.value, true);
    if (!x.dataset.tip || !k.sonuc) return;
    const h = ozelDegistir(k.d, k.sonuc, x.dataset.tip, x.dataset.ad, x.dataset.k, x.value);
    if (h) { x.value = x.defaultValue; x.select(); el.durumSol.innerHTML = simge(h); return; } // reddedilen değer hücrede kalmasın; hesaptaki değer geri gelir
    yazilan.set(`[data-tip="${x.dataset.tip}"][data-ad="${x.dataset.ad}"][data-k="${x.dataset.k}"]`, x.value); // sonuç gelene dek bu değer görünür
    setTimeout(k.simdi); // odak yeni hücreye geçtikten sonra yeniden çiz (sayfaCiz odağı aynı hücreye geri koyar)
  });
  t.addEventListener('keydown', e => {
    if (e.key === 'Escape' && metinMi(e.target) && e.target.dataset.tip) { e.target.value = e.target.defaultValue; e.target.select(); return; } // Esc: düzenlemeyi geri al
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key) || e.isComposing) return;
    const x = e.target, tr_ = x.closest('tbody tr'); if (!tr_) return;
    if (x.tagName === 'SELECT' && e.key !== 'Enter') return; // seçimde oklar seçeneği değiştirir
    const yon = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1, hucreMi = !!x.dataset.k, rows = t.tBodies[0].rows;
    let hedef = tr_;
    do hedef = rows[hedef.sectionRowIndex + yon]; while (hedef && !(hucreMi ? hedef.querySelector(`[data-k="${x.dataset.k}"]`) : hedef.dataset.ad));
    if (!hedef) {
      if (e.key === 'Enter' && x.dataset.tip === 'perde' && x.dataset.k === 'lw') { e.preventDefault(); x.blur(); }
      return;
    }
    e.preventDefault();
    if (hucreMi) { const el2 = hedef.querySelector(`[data-k="${x.dataset.k}"]`); el2.focus(); if (metinMi(el2)) el2.select(); } // önceki hücrenin change olayı yeniden çizimi sonraya bırakır
    else { k.secili = hedef.dataset.ad; k.secimCiz(); hedef.focus(); }
  });
  return k;
}
// Sekme listesinde ←/→. Sıra durumdan okunur: geçişte aria-selected sonradan güncellenir, aynı karede iki basış da ilerlesin
export const sekmeOk = (liste_, sec, al, git, simdi) => liste_.addEventListener('keydown', async e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const b = [...liste_.querySelectorAll(sec + ':not(:disabled)')], i = b.findIndex(x => al(x) === simdi());
  const n = al(b[(i + (e.key === 'ArrowRight' ? 1 : b.length - 1)) % b.length]);
  await git(n); liste_.querySelector('[aria-selected="true"]')?.focus(); // geçişte DOM sonradan güncellenir
});

// ── Excel'e aktarma (xlsx.js). Sayılar ham (ekrandaki yuvarlama yok), başlıklar düz metin. Saf: Node'da sınanır.
const duzBaslik = b => b.replace(/<small>(.*?)<\/small>/g, '($1)').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const yuzde = u => u == null ? null : { v: u, bicim: '0%' };
const exSutun = c => c.excel ?? [[duzBaslik(c[0]), c[4] === 'dolgu' ? e => yuzde(kul(e)) : c[5] ?? c[3], c[2]]];
const sayiMi = x => typeof x === 'number' && Number.isFinite(x);
// Girdiler satırı: sayı alanı sayı, seçim yazısı, işaret Evet/Hayır
const girdiHam = (d, x) => { const v = girdiDeger(d, x); if (x.tip === 'onay') return v; if (x.tip === 'secim') return secimYazi(x.k, v);
  const n = sayiOku(v); return !x.metin && Number.isFinite(n) ? n : v; };
// liste: { veri, ayar } (tablo.html kolon listesi, kesit.tablo.v1 biçimi) → ayrı sayfa
export function excelSayfalar(d, r = hesap(d).sonuc, { liste: kl } = {}) {
  const hata = girdiDenetle(girdiOku(d)), sayfalar = [];
  let grup = '';
  const gs = [];
  for (const x of girdiGorunur(d)) { if (typeof x === 'string') { grup = x; continue; }
    const h = girdiHata(hata, x); gs.push([grup, simge(x.ad), girdiHam(d, x), x.birim ?? '', simge(h ? `Hata: ${h}` : notYazi(d, x))]); }
  // Elle verilen boyutlar (hücrelerdeki turuncu değerler)
  const E = (ad, v, b, not) => gs.push(['Elle verilen boyutlar', ad, v, b, not]), dz = d.dosemeOzel?.tur === d.form.dosemeTuru ? d.dosemeOzel : null;
  if (dz?.h != null) E('Döşeme h', dz.h, 'mm', 'Döşeme sayfası; kat döşemesinin tamamı');
  if (dz?.t != null && disMi(d.form)) E('Döşeme tabla t', dz.t, 'mm', 'Döşeme sayfası');
  for (const [a, o] of Object.entries(d.kirisOzel)) for (const x of ['b', 'h']) if (o[x] != null) E(`${a} aksı kirişleri ${x}`, o[x], 'mm', 'Kiriş sayfası; aks boyunca');
  for (const [a, o] of Object.entries(girdiOku(d).kolonOzel)) for (const x of ['b', 'h']) if (o[x] != null) E(`${a} kolonu ${x}`, o[x], 'mm', 'Kolon sayfası');
  for (const [a, v] of Object.entries(d.perdeOzel)) E(`${a} perdesi b_w`, v, 'mm', 'Perde sayfası');
  for (const [a, v] of Object.entries(d.perdeBoyOzel)) E(`${a} perdesi ℓw`, v, 'mm', 'Perde sayfası; tüm katlar');
  if (d.radyeOzel.h != null) E('Radye h', d.radyeOzel.h, 'mm', 'Radye sayfası');
  if (d.radyeOzel.a != null) E('Radye taşması', d.radyeOzel.a, 'm', 'Radye sayfası');
  sayfalar.push({ ad: 'Girdiler', not: 'Kesit — döşemeden temele ön boyutlandırma: proje girdileri',
    sutunlar: ['Grup', 'Parametre', 'Değer', 'Birim', 'Not'].map(baslik => ({ baslik })), satirlar: gs });
  const kos = [], katli = !!r?.katlar?.length;
  if (r) for (const s of gorunur(d, r).filter(s => !s.girdi)) {
    const cols = s.spec(r).flatMap(exSutun), katSatirlari = katli && s.adim !== 'temel' && !s.yuk;
    const satirlar = katSatirlari ? r.katlar.flatMap(k => s.dizi(katGorunumu(r, k.kat)).map(e => ({ e, kat: k.kat }))) : s.dizi(r).map(e => ({ e, kat: '' }));
    const bad = satirlar.filter(({ e }) => !e.gecti).length;
    sayfalar.push({ ad: s.baslik, not: s.yuk ? KAT_YUK_NOT : `${s.baslik}: ${satirlar.length} eleman, ${bad ? `${bad} uygun değil` : 'tümü uygun'}${s.ad === 'doseme' && !katSatirlari ? ` · ${TUR_AD[r.tur]}, h = ${r.h} mm` : ''}${s.ad === 'kiris' ? ` · ${KIRIS_NOT}` : ''}`,
      sutunlar: [...(katSatirlari ? [{ baslik: 'Kat', sayi: true }] : []), ...cols.map(([b, , n]) => ({ baslik: b, sayi: !!n }))],
      satirlar: satirlar.map(({ e, kat }) => [...(katSatirlari ? [kat] : []), ...cols.map(([, f]) => f(e) ?? null)]) });
    if (!s.yuk) for (const { e, kat } of satirlar) for (const x of e.maddeler) kos.push([...(katli ? [kat] : []), e.ad, e.aks ?? '', s.baslik, x.ad, sayiMi(x.deger) ? x.deger : String(x.deger), sayiMi(x.deger) ? birim(x.sinir) : '',
      x.sinir, x.kaynak, yuzde(x.kullanim), x.gecti ? 'Sağlıyor' : x.uyari ? 'Not' : 'Sağlamıyor']);
  }
  if (r) sayfalar.push({ ad: 'Koşullar', not: 'Her elemanın bütün koşulları (Kullanım: değer / sınır)',
    sutunlar: [...(katli ? ['Kat'] : []), 'Eleman', 'Aks', 'Sayfa', 'Koşul', 'Değer', 'Birim', 'Sınır', 'Kaynak', 'Kullanım %', 'Sonuç'].map(b => ({ baslik: b, sayi: b === 'Kat' || b === 'Kullanım %' })) /* Değer karışık: sayılar sayı, metin sola */, satirlar: kos });
  const notlar = r ? r.notlar : Object.values(hata).map(h => `Girdi hatası: ${h}`);
  sayfalar.push({ ad: 'Notlar', sutunlar: [{ baslik: 'No', sayi: true }, { baslik: 'Not' }], satirlar: notlar.map((n, i) => [i + 1, n]) });
  if (kl) sayfalar.push(listeSayfasi(kl.veri, kl.ayar));
  return sayfalar;
}
// Kolon listesi (tablo.html): her dolu satır kurallar.js tabloSatiri ile; ayar kesit.tablo.v1'deki metinlerden
const TUR_L = { kolon: 'Kolon', perde: 'Perde', gecersiz: 'Geçersiz' };
export function listeSayfasi(veri = [], a = {}) {
  const ayar = { beton: a.beton in BETON ? a.beton : 'C30', H: sayiOku(a.H ?? '3000'), kirissiz: String(a.kirissiz ?? '').trim() ? sayiOku(a.kirissiz) : null,
    tutulu: a.tutulu === true, yuksek: a.yuksek === true, yalniz: a.yalniz === true };
  const n = x => { const v = sayiOku(x); return Number.isFinite(v) ? v : String(x ?? '').trim(); };
  const satirlar = veri.flatMap(v => {
    const s = tabloSatiri(v, ayar); if (!s) return [];
    const r = s.r, m = r && belirleyen(r);
    return [[String(v[0] ?? '').trim(), n(v[1]), n(v[2]), String(v[3] ?? '').trim() ? n(v[3]) : s.H > 0 ? s.H : '', s.sinif, n(v[5]), n(v[6]),
      r ? TUR_L[r.tur] : 'Giriş hatası', r ? r.oran : '', r ? r.Ac : '', m ? m.ad : Object.values(s.hata).join(' / '), m ? m.kaynak : '',
      yuzde(m?.kullanim), r ? (r.gecti ? 'Uygun' : 'Uygun değil') : 'Giriş hatası', s.oneri ? `${s.oneri.b} × ${s.oneri.h}` : '']];
  });
  const b = ['Eleman', 'b (mm)', 'h (mm)', 'H (mm)', 'Beton', 'N_dm (kN)', 'N_d (kN)', 'Tür', 'Oran', 'A_c (mm²)', 'Belirleyici koşul', 'Kaynak', 'Kullanım %', 'Sonuç', 'En küçük kolon (mm)'];
  return { ad: 'Kolon listesi', not: `Kolon / perde ön kontrol listesi · varsayılan ${ayar.beton}, H ${tr(ayar.H)} mm${ayar.kirissiz > 0 ? `, kirişsiz ℓ = ${tr(ayar.kirissiz)} mm` : ''}`,
    sutunlar: b.map((x, i) => ({ baslik: x, sayi: [1, 2, 3, 5, 6, 8, 9, 12].includes(i) })), satirlar };
}
export const dosyaAdi = (t = new Date()) => `kesit-${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}.xlsx`;
export const excelIndir = (d, r, ek) => indir(xlsxYap(excelSayfalar(d, r, ek), { baslik: 'Kesit — döşemeden temele ön boyutlandırma' }), dosyaAdi());
