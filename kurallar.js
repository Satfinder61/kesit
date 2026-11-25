// Kolon / perde ön boyutlandırma ve kontrol kuralları.
// Öncelik: 1 Mart kararnamesi > TBDY 2018 > TS 500. TS 500 ile TBDY çakışırsa TBDY esas;
// çakışmayan TS 500 koşulları (ör. Denk. 7.7) ayrıca uygulanır.
// Birimler: boyut mm, kuvvet kN, alan m², yük kN/m², fck MPa (N/mm²).

export const KOLON_ORAN_MAX = 1.5; // 1 Mart kararnamesi (TBDY Bölüm 7'de üst sınır yok; 17.4.1.1'deki ≤ 2 yalnız Bölüm 17 tasarımında)
export const PERDE_ORAN_MIN = 6;   // TBDY 7.6.1.2 (TS 500 12.2'deki 7 yerine)
export const KOLON_KISA_MIN = 300; // TBDY 7.3.1.1 (TS 500 7.4.1'deki 250 yerine)
export const PERDE_T_MIN = 250;    // TBDY 7.6.1.2(a),(c) (TS 500 12.2'deki 150 yerine)
export const PERDE_T_YUKSEK = 300; // TBDY 13.1.6: yüksek bina (BYS = 1)
export const PERDE_T_YALNIZ = 200; // TBDY 7.6.1.3: yalnız perdeli sistem, Denk. 7.14 sağlanıyorsa
const TOL = 1e-9;                  // kayan nokta: 450.6/300.4 gibi sınırdaki oranlar için

// TBDY 7.2.5.1: C25'ten düşük beton kullanılamaz.
export const BETON = { C25: 25, C30: 30, C35: 35, C40: 40, C45: 45, C50: 50 };

// TS 498 Çizelge 8: taşınan kat sayısına göre hareketli yük azaltma değeri β (1..12 kat; 12 üstü son değer).
// a) konut/büro/işhanı, b) hafif işyeri/atölye/imalathane/mağaza; ağır sanayi atölye/imalathanesi,
// depo ve Bölüm 13'te adı geçmeyen kullanımlarda (okul, hastane, toplanma, garaj…) azaltma yok (TS 498 Bölüm 13).
// Çizelge 8 yalnız taşınan her tam katta q aynıysa geçerlidir.
const BETA = {
  konut:  [1, 1, 1, 0.95, 0.88, 0.8, 0.71, 0.65, 0.6, 0.6, 0.6, 0.6],
  atolye: [1, 1, 1, 0.98, 0.94, 0.9, 0.86, 0.83, 0.8, 0.8, 0.8, 0.8],
};

// TS 498 Çizelge 7: kullanıma göre en küçük q (kN/m²); tabloda olmayan kullanımda denetim yok.
export const Q_MIN = { konut: 2, atolye: 5 };

const tamKat = n => { if (!Number.isInteger(n) || n < 1) throw new RangeError('Kat sayısı 1 veya daha büyük tam sayı olmalı'); };

export function beta(kullanim, katSayisi) {
  tamKat(katSayisi);
  const t = BETA[kullanim];
  return t ? t[Math.min(katSayisi, t.length) - 1] : 1; // tablo dışı: depo / ağır sanayi
}

// Ön boyutlandırma yükü: etki alanı × kat × (g + β·q).
// N_dm = (G + βQ + 0,2·S_DS·G)·kDeprem  (TBDY 7.3.1.2 / 7.6.1.1, G+Q+0,3·Ed(Z)+Ed(H); Denk. 4.10–4.11)
// N_d  = 1,4G + 1,6βQ                   (TS 500 Denk. 6.3, Denk. 7.7 için)
// ponytail: düşey deprem S_DS'ten yaklaşık; yatay deprem Ed(H) hesaplanmaz, kDeprem mühendisin ayar düğmesi
// (kenar/köşe kolonda > 1). Kirişe oturan/eğik kolonda Ed(Z) spektrumdan alınmalı (TBDY 4.4.3.1).
export function yukHesap({ alan, katSayisi, g, q, kullanim = 'konut', kDeprem = 1, sds = 0 }) {
  if (![alan, g, q, sds].every(x => Number.isFinite(x) && x >= 0) || !(kDeprem >= 1)) throw new RangeError('Alan, g, q, S_DS ≥ 0 ve deprem katsayısı ≥ 1 olmalı');
  const b = beta(kullanim, katSayisi);
  const G = alan * katSayisi * g;
  const Q = alan * katSayisi * q * b;
  const Ez = 0.2 * sds * G;
  const qMin = Q_MIN[kullanim] ?? null;
  return { beta: b, G, Q, Ez, qMin, qAz: qMin != null && q < qMin, Ndm: (G + Q + Ez) * kDeprem, Nd: 1.4 * G + 1.6 * Q };
}

// k yüzde olarak tam sayı tutulur (40, 35, 60): 0.35*45 gibi kayan nokta hatası sınırda yanlış sonuç veriyordu.
const gerekliAlan = (N, fck, kYuzde) => (N * 1000 * 100) / (kYuzde * fck); // mm²
const NF = {}; // Intl biçimleyici her çağrıda kurulursa hesap süresinin çoğunu yer: ondalık sayısına göre önbellek
const tr = (x, d = 2) => (NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d })).format(x);

export function sinifla(b, h) {
  const oran = Math.max(b, h) / Math.min(b, h);
  const tur = oran <= KOLON_ORAN_MAX + TOL ? 'kolon' : oran >= PERDE_ORAN_MIN - TOL ? 'perde' : 'gecersiz';
  return { tur, oran };
}

const pozitif = x => Number.isFinite(x) && x > 0;
const yok = x => x === undefined || x === null;

// Kesit kontrolü. katYuksekligi mm; ikiUcTutulu: perde iki ucundan yanal doğrultuda perdeyle tutuluysa.
// Nd (isteğe bağlı): TS 500 tasarım eksenel kuvveti 1,4G+1,6Q; verilirse Denk. 7.7 de denetlenir.
// yuksekBina: BYS = 1 (TBDY 13.1.2). yalnizPerde: taşıyıcı sistem yalnız perde ve Denk. 7.14 sağlanıyor
// (mühendis beyanı; katYuksekligi binanın en yüksek katı olmalı). kirissizAciklik: kirişsiz döşemede eksen açıklığı, mm.
export function kontrol({ b, h, fck, Ndm, Nd, katYuksekligi = 3000, ikiUcTutulu = false,
  yuksekBina = false, yalnizPerde = false, kirissizAciklik = null }) {
  if (![b, h, fck, katYuksekligi].every(pozitif) || !(Number.isFinite(Ndm) && Ndm >= 0) ||
      !(yok(Nd) || (Number.isFinite(Nd) && Nd >= 0))) {
    return { tur: 'gecersiz', oran: NaN, Ac: NaN, gecti: false,
      maddeler: [{ ad: 'Giriş', deger: '—', sinir: 'b, h, fck, kat yüksekliği > 0; N ≥ 0', gecti: false, kaynak: '—' }] };
  }
  const kisa = Math.min(b, h), uzun = Math.max(b, h), Ac = kisa * uzun;
  const { tur, oran } = sinifla(b, h);
  const oranYazi = `${tr(uzun)}/${tr(kisa)} = ${tr(oran, 4)}`;
  const m = [];
  // kullanim: gerekli/mevcut (≤ 1 sağlar); gösterge en büyüğünü (belirleyici koşulu) gösterir.
  const madde = (ad, deger, sinir, gecti, kaynak, kullanim = null) => m.push({ ad, deger, sinir, gecti, kaynak, kullanim });

  if (tur === 'kolon') {
    madde('Kısa kenar', kisa, `≥ ${KOLON_KISA_MIN} mm`, kisa >= KOLON_KISA_MIN, 'TBDY 7.3.1.1, 7.7.1', KOLON_KISA_MIN / kisa);
    if (kirissizAciklik > 0) {
      const cMin = Math.ceil(Math.max(KOLON_KISA_MIN, kirissizAciklik / 20) - TOL);
      madde('Kirişsiz döşeme kolon genişliği', kisa, `≥ max(300, l/20) = ${tr(cMin)} mm`, kisa >= cMin, 'TS 500 11.4.2', cMin / kisa);
    }
    madde('Uzun/kısa oranı', oranYazi, `≤ ${tr(KOLON_ORAN_MAX)}`, true, '1 Mart kararnamesi', oran / KOLON_ORAN_MAX);
    const A1 = gerekliAlan(Ndm, fck, 40);
    madde('Brüt kesit alanı', Ac, `≥ N_dm/(0,40·fck) = ${tr(Math.ceil(A1))} mm²`, Ac >= A1, 'TBDY 7.3.1.2, 7.7.1', A1 / Ac);
    if (!yok(Nd)) {
      const A2 = gerekliAlan(Nd, fck, 60); // 0,9·fcd = 0,9·fck/1,5 (TS 500 Denk. 6.2, γmc = 1,5)
      madde('Eksenel sınır (TS 500)', Ac, `≥ N_d/(0,9·fcd) = ${tr(Math.ceil(A2))} mm²`, Ac >= A2, 'TS 500 7.4.1 Denk. 7.7', A2 / Ac);
    }
  } else if (tur === 'perde') {
    madde('Uzun kenar/kalınlık', oranYazi, `≥ ${PERDE_ORAN_MIN}`, true, 'TBDY 7.6.1.2, 7.10', PERDE_ORAN_MIN / oran);
    // (a) veya (c) kat yüksekliği sınırı; (b) tutulmamış boy/30 her durumda geçerli.
    // Yüksek binada alt sınır 300 ve 7.6.1.3 uygulanmaz (13.1.6); yalnız perdeli sistemde 7.6.1.3 (a) ve (c)'nin yerine geçer.
    // ponytail: tutulmamış boy = uzun kenar (güvenli taraf); iki perde arasındaki net boy ayrı girdi olabilir.
    const yalniz = yalnizPerde && !yuksekBina;
    const tAlt = yuksekBina ? PERDE_T_YUKSEK : yalniz ? PERDE_T_YALNIZ : PERDE_T_MIN;
    const tMin = Math.ceil(Math.max(tAlt, katYuksekligi / (yalniz || ikiUcTutulu ? 20 : 16), uzun / 30) - TOL);
    const tKaynak = [yuksekBina && 'TBDY 13.1.6', yalniz ? 'TBDY 7.6.1.3, 7.6.1.2(b)' : ikiUcTutulu ? 'TBDY 7.6.1.2(b),(c)' : 'TBDY 7.6.1.2(a),(b)'].filter(Boolean).join(', ').replace(/, TBDY /g, ', ');
    madde('Perde kalınlığı', kisa, `≥ ${tr(tMin)} mm`, kisa >= tMin, tKaynak, tMin / kisa);
    const A1 = gerekliAlan(Ndm, fck, 35);
    madde('Net kesit alanı', Ac, `≥ N_dm/(0,35·fck) = ${tr(Math.ceil(A1))} mm²`, Ac >= A1, 'TBDY 7.6.1.1, 7.10', A1 / Ac);
  } else {
    madde('Uzun/kısa oranı', oranYazi,
      `kolon için ≤ ${tr(KOLON_ORAN_MAX)}, perde için ≥ ${PERDE_ORAN_MIN}`, false,
      '1 Mart kararnamesi / TBDY 7.6.1.2');
  }
  const belirleyici = m.reduce((a, x) => (x.kullanim ?? -1) > (a?.kullanim ?? -1) ? x : a, null);
  return { tur, oran, Ac, kisa, uzun, maddeler: m, belirleyici, gecti: m.every(x => x.gecti) };
}

// Gerekli kolon kesiti: kısa ≥ 300, oran ≤ 1,5, adım katı; en küçük alan, eşitlikte en kareye yakın.
// Nd verilirse TS 500 Denk. 7.7 de sağlanır; kirissizAciklik verilirse kısa kenar ≥ max(300, l/20) (TS 500 11.4.2).
export function kolonOner({ fck, Ndm, Nd, adim = 50, kirissizAciklik = null }) {
  if (!(adim > 0)) throw new RangeError('adim > 0 olmalı');
  const bMin = Math.ceil(Math.max(KOLON_KISA_MIN, kirissizAciklik > 0 ? kirissizAciklik / 20 : 0) / adim - TOL) * adim;
  const Agerek = Math.max(gerekliAlan(Ndm, fck, 40), yok(Nd) ? 0 : gerekliAlan(Nd, fck, 60));
  if (!Number.isFinite(Agerek)) return null;
  let en = null;
  for (let b = bMin; b <= 3000; b += adim) {
    if (en && b * b > en.b * en.h) break; // daha büyük kısa kenar daha küçük alan veremez
    for (let h = b; h <= b * KOLON_ORAN_MAX; h += adim) {
      if (b * h < Agerek) continue;
      if (!en || b * h <= en.b * en.h) en = { b, h }; // eşit alanda b büyük = daha kare
      break;
    }
  }
  return en && { ...en, Ac: en.b * en.h, Agerek };
}

// ── Tablo (Excel tarzı, satır başına bir eleman) girişi
// Türkçe Excel biçimi okunur: "1.262,5", "1262,5"; İngilizce "1,262.5" de. Yalnız noktalı "1.262" binlik sayılır
// (mm ve kN'de 1,262 gibi değer olmaz); "0.4" gibi sıfırla başlayan ondalıktır.
export function sayiOku(v) {
  v = String(v ?? '').replace(/\s/g, '');
  const virgul = v.lastIndexOf(','), nokta = v.lastIndexOf('.');
  if (virgul > nokta) v = v.replace(/\./g, '').replace(',', '.');
  else if (virgul >= 0) v = v.replace(/,/g, '');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  return /^\d+(\.\d+)?$/.test(v) ? +v : NaN;
}

export const SUTUNLAR = ['ad', 'b', 'h', 'H', 'beton', 'Ndm', 'Nd'];

// s: SUTUNLAR sırasıyla hücre metinleri. Boş H ve beton tablonun varsayılanını alır (ayar.H, ayar.beton).
// Dönüş: null (boş satır) | { hata: {sütun: ileti}, r?: kontrol sonucu, oneri?, sinif, H }.
// N_d yalnız kolonda zorunlu (TS 500 Denk. 7.7); geçersiz kesitte öneri için gerekir.
export function tabloSatiri(s, ayar) {
  const [, bS, hS, HS, betonS, ndmS, ndS] = s.map(v => String(v ?? '').trim());
  if (s.every(v => !String(v ?? '').trim())) return null;
  const b = sayiOku(bS), h = sayiOku(hS), H = HS ? sayiOku(HS) : ayar.H, Ndm = sayiOku(ndmS), Nd = ndS ? sayiOku(ndS) : null;
  const sinif = 'C' + (betonS || ayar.beton).toUpperCase().replace(/^C/, '');
  const fck = BETON[sinif];
  const hata = {};
  if (!pozitif(b)) hata.b = 'b sayı ve > 0 mm olmalı';
  if (!pozitif(h)) hata.h = 'h sayı ve > 0 mm olmalı';
  if (!pozitif(H)) hata.H = 'Kat yüksekliği > 0 mm olmalı';
  if (!fck) hata.beton = 'Beton C25 … C50 olmalı (TBDY 7.2.5.1)';
  if (!Number.isFinite(Ndm)) hata.Ndm = 'N_dm gerekli, ≥ 0 kN';
  if (Nd !== null && !Number.isFinite(Nd)) hata.Nd = 'N_d sayı ve ≥ 0 kN olmalı';
  if (Nd === null && !hata.b && !hata.h && sinifla(b, h).tur === 'kolon') hata.Nd = 'Kolonda N_d gerekli (TS 500 Denk. 7.7)';
  if (ayar.kirissiz !== null && !pozitif(ayar.kirissiz)) hata.kirissiz = 'Kirişsiz döşeme açıklığı > 0 mm olmalı';
  if (Object.keys(hata).length) return { hata, sinif, H };
  const r = kontrol({ b, h, fck, Ndm, Nd, katYuksekligi: H, ikiUcTutulu: ayar.tutulu, yuksekBina: ayar.yuksek,
    yalnizPerde: ayar.yalniz, kirissizAciklik: ayar.kirissiz });
  const oneri = r.tur === 'perde' || Nd === null ? null : kolonOner({ fck, Ndm, Nd, kirissizAciklik: ayar.kirissiz });
  return { hata, r, oneri, sinif, H };
}
