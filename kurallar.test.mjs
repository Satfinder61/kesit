// Çalıştır: node hesap/kurallar.test.mjs
import assert from 'node:assert/strict';
import { sinifla, kontrol, kolonOner, beta, yukHesap, sayiOku, tabloSatiri } from './kurallar.js';

// Sınıflandırma: ≤1,5 kolon, ≥6 perde, arası geçersiz; kenar sırası önemsiz.
assert.equal(sinifla(300, 450).tur, 'kolon');
assert.equal(sinifla(450, 300).tur, 'kolon');
assert.equal(sinifla(300, 460).tur, 'gecersiz');
assert.equal(sinifla(250, 1490).tur, 'gecersiz');
assert.equal(sinifla(250, 1500).tur, 'perde');
assert.equal(sinifla(300.4, 450.6).tur, 'kolon');                                // kayan nokta sınırı
assert.equal(sinifla(250.3, 1501.8).tur, 'perde');

// Kolon: kısa kenar 300, N_dm/(0,40·fck).
assert.equal(kontrol({ b: 250, h: 300, fck: 30, Ndm: 100 }).gecti, false);       // 250 < 300 (TS 500'ün 250'si geçmez)
assert.equal(kontrol({ b: 400, h: 400, fck: 30, Ndm: 1920 }).gecti, true);       // 160000 = 1920e3/12
assert.equal(kontrol({ b: 400, h: 400, fck: 30, Ndm: 1921 }).gecti, false);

// Arada kalan oran her zaman başarısız.
const g = kontrol({ b: 300, h: 900, fck: 30, Ndm: 10 });
assert.equal(g.tur, 'gecersiz'); assert.equal(g.gecti, false);

// Perde: t ≥ max(250, H/16, lw/30); A ≥ N_dm/(0,35·fck).
assert.equal(kontrol({ b: 250, h: 1500, fck: 30, Ndm: 100, katYuksekligi: 4000 }).gecti, true);  // 4000/16 = 250
assert.equal(kontrol({ b: 250, h: 1500, fck: 30, Ndm: 100, katYuksekligi: 4100 }).gecti, false); // 256 > 250
assert.equal(kontrol({ b: 250, h: 7600, fck: 30, Ndm: 100 }).gecti, false);                      // 7600/30 = 253
assert.equal(kontrol({ b: 250, h: 7600, fck: 30, Ndm: 100, ikiUcTutulu: true }).gecti, false);   // (b) tutulu iken de geçerli
assert.equal(kontrol({ b: 250, h: 7500, fck: 30, Ndm: 100, ikiUcTutulu: true }).gecti, true);    // (b),(c): max(250, 150, 250)
assert.equal(kontrol({ b: 250, h: 1500, fck: 30, Ndm: 100, katYuksekligi: 5000, ikiUcTutulu: true }).gecti, true);  // (c): 5000/20 = 250
assert.equal(kontrol({ b: 250, h: 1600, fck: 45, Ndm: 6300 }).gecti, true);                     // tam sınır: 400000 ≥ 6300e3/15,75 = 400000
assert.equal(kontrol({ b: 250, h: 1500, fck: 25, Ndm: 3281 }).gecti, true);                      // 375000 ≥ 3281e3/8.75 = 374971
assert.equal(kontrol({ b: 250, h: 1500, fck: 25, Ndm: 3282 }).gecti, false);

// Öneri: en küçük alan, oran ≤ 1,5, 50 mm adım.
assert.deepEqual((({ b, h }) => ({ b, h }))(kolonOner({ fck: 30, Ndm: 0 })), { b: 300, h: 300 });
const o = kolonOner({ fck: 30, Ndm: 2000 });                                       // gerek 166667 mm²
assert.ok(o.Ac >= o.Agerek && o.h / o.b <= 1.5 && o.b >= 300);
assert.deepEqual([o.b, o.h], [350, 500]);                                          // 175000: en küçük uygun alan
assert.equal(kontrol({ b: o.b, h: o.h, fck: 30, Ndm: 2000 }).gecti, true);
assert.equal(kolonOner({ fck: 30, Ndm: NaN }), null);
assert.throws(() => kolonOner({ fck: 30, Ndm: 0, adim: 0 }), RangeError);

// TS 500 Denk. 7.7: N_d ≤ 0,9·fcd·Ac, fcd = fck/1,5 → Ac ≥ N_d/(0,6·fck). Çakışmadığı için TBDY ile birlikte uygulanır.
assert.equal(kontrol({ b: 300, h: 450, fck: 30, Ndm: 1600, Nd: 2430 }).gecti, true);   // 135000 ≥ 2430e3/18 = 135000
assert.equal(kontrol({ b: 300, h: 450, fck: 30, Ndm: 1600, Nd: 2431 }).gecti, false);
const o2 = kolonOner({ fck: 30, Ndm: 1600, Nd: 2440 });                             // TS 500 belirleyici: 135556 mm²
assert.ok(o2.Ac >= 2440e3 / 18 && kontrol({ b: o2.b, h: o2.h, fck: 30, Ndm: 1600, Nd: 2440 }).gecti);

// Eksik/geçersiz giriş asla 'uygun' çıkmaz.
for (const bozuk of [{ katYuksekligi: 0 }, { Ndm: NaN }, { Ndm: -1 }, { b: 0 }, { fck: NaN }, { Nd: NaN }])
  assert.equal(kontrol({ b: 250, h: 1500, fck: 30, Ndm: 100, ...bozuk }).gecti, false, JSON.stringify(bozuk));

// TS 498 Çizelge 8 ve yük.
assert.equal(beta('konut', 3), 1);
assert.equal(beta('konut', 5), 0.88);
assert.equal(beta('konut', 20), 0.6);
assert.equal(beta('atolye', 7), 0.86);
assert.equal(beta('depo', 10), 1);
const y = yukHesap({ alan: 20, katSayisi: 5, g: 7, q: 2 });                        // 700 + 176
assert.equal(y.G, 700); assert.ok(Math.abs(y.Q - 176) < 1e-9); assert.ok(Math.abs(y.Ndm - 876) < 1e-9);
assert.ok(Math.abs(y.Nd - (1.4 * 700 + 1.6 * 176)) < 1e-9);
assert.throws(() => beta('konut', 4.5), RangeError);
assert.throws(() => yukHesap({ alan: 20, katSayisi: 0, g: 7, q: 2 }), RangeError);
assert.throws(() => yukHesap({ alan: NaN, katSayisi: 5, g: 7, q: 2 }), RangeError);

// Kullanım oranı: gerekli/mevcut; belirleyici en büyüğü, ≤ 1 iken geçer.
const k = kontrol({ b: 400, h: 400, fck: 30, Ndm: 960 });                          // A1 = 80000, Ac = 160000
assert.equal(k.belirleyici.ad, 'Kısa kenar'); assert.equal(k.belirleyici.kullanim, 0.75);
const k2 = kontrol({ b: 400, h: 400, fck: 30, Ndm: 1920 });
assert.equal(k2.belirleyici.kullanim, 1); assert.equal(k2.gecti, true);
for (const x of kontrol({ b: 250, h: 7600, fck: 30, Ndm: 100 }).maddeler) assert.equal(x.gecti, x.kullanim <= 1 + 1e-12, x.ad);
assert.equal(kontrol({ b: 300, h: 900, fck: 30, Ndm: 10 }).belirleyici, null);

// PDF taraması sonrası: yüksek bina 300 mm (TBDY 13.1.6), yalnız perdeli sistem 200 mm (7.6.1.3).
assert.equal(kontrol({ b: 250, h: 2000, fck: 30, Ndm: 100, yuksekBina: true }).gecti, false);
assert.equal(kontrol({ b: 300, h: 2000, fck: 30, Ndm: 100, yuksekBina: true }).gecti, true);
assert.equal(kontrol({ b: 200, h: 1500, fck: 30, Ndm: 100 }).gecti, false);
assert.equal(kontrol({ b: 200, h: 1500, fck: 30, Ndm: 100, yalnizPerde: true }).gecti, true);             // max(200, 150, 50)
assert.equal(kontrol({ b: 200, h: 1500, fck: 30, Ndm: 100, yalnizPerde: true, katYuksekligi: 4100 }).gecti, false); // 205
assert.equal(kontrol({ b: 200, h: 6100, fck: 30, Ndm: 100, yalnizPerde: true }).gecti, false);            // l/30 = 204 hâlâ geçerli
assert.equal(kontrol({ b: 250, h: 2000, fck: 30, Ndm: 100, yalnizPerde: true, yuksekBina: true }).gecti, false); // yüksek bina üstün

// Kirişsiz döşeme kolonu: kısa kenar ≥ max(300, l/20) (TS 500 11.4.2).
assert.equal(kontrol({ b: 300, h: 400, fck: 30, Ndm: 100, Nd: 100, kirissizAciklik: 8000 }).gecti, false);
assert.equal(kontrol({ b: 400, h: 500, fck: 30, Ndm: 100, Nd: 100, kirissizAciklik: 8000 }).gecti, true);
assert.deepEqual((({ b, h }) => [b, h])(kolonOner({ fck: 30, Ndm: 0, kirissizAciklik: 8100 })), [450, 450]); // 405 → 450

// Düşey deprem payı ve Çizelge 7 en küçük q.
const yz = yukHesap({ alan: 20, katSayisi: 5, g: 7, q: 2, sds: 1 });
assert.ok(Math.abs(yz.Ndm - (700 + 176 + 140)) < 1e-9 && Math.abs(yz.Nd - y.Nd) < 1e-9);
assert.equal(yukHesap({ alan: 20, katSayisi: 5, g: 7, q: 2, kullanim: 'atolye' }).qAz, true);
assert.equal(yukHesap({ alan: 20, katSayisi: 5, g: 7, q: 5, kullanim: 'atolye' }).qAz, false);
assert.equal(yukHesap({ alan: 20, katSayisi: 5, g: 7, q: 1, kullanim: 'depo' }).qAz, false);


// Tablo: Türkçe Excel sayıları, varsayılanlar, eksik girişte sonuç yok.
assert.deepEqual(['1.262,5', '1262,5', '1,262.5', '1.262', '250.000', '0.4', '12', ' 3 000 ', '', '-5', 'abc', '1,2,3'].map(sayiOku),
  [1262.5, 1262.5, 1262.5, 1262, 250000, 0.4, 12, 3000, NaN, NaN, NaN, NaN]);
const AYAR = { beton: 'C30', H: 3000, kirissiz: null, tutulu: false, yuksek: false, yalniz: false };
assert.equal(tabloSatiri(['', ' ', '', '', '', '', ''], AYAR), null);
assert.equal(tabloSatiri(['S1', '400', '500', '', '', '876', ''], AYAR).hata.Nd, 'Kolonda N_d gerekli (TS 500 Denk. 7.7)');
assert.equal(tabloSatiri(['S1', '400', '500', '', 'C20', '876', '1262'], AYAR).hata.beton !== undefined, true);
const t1 = tabloSatiri(['S1', '400', '500', '', '30', '876', '1.262'], AYAR);      // "30" = C30, boş H = 3000
assert.deepEqual([t1.sinif, t1.H, t1.r.gecti, t1.r.tur], ['C30', 3000, true, 'kolon']);
assert.equal(tabloSatiri(['P1', '250', '1500', '4100', '', '100', ''], AYAR).r.gecti, false);   // N_d perdede gerekmez; 4100/16 > 250
assert.equal(tabloSatiri(['X', '300', '900', '', '', '10', ''], AYAR).oneri, null);             // geçersiz, N_d yok: öneri yok

console.log('kurallar: tüm kontroller geçti');
