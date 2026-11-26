// Çalıştır: node calisma.test.mjs — ortak kitap (calisma.js): durum, elle değerler ve temizliği, Excel'e aktarma verisi
import assert from 'node:assert/strict';
import { yeniDurum, girdiYaz, girdiOku, ozelDegistir, hesap, excelSayfalar, durumYukle, durumKaydet, dosyaAdi, tabloHtml, katGorunumu, SAYFALAR, GIRDILER, ALANLAR, ANAHTAR } from './calisma.js';
import { xlsxYap } from './xlsx.js';
import { zincirHesap } from './zincir.js';

// Girdiler sayfası formun her alanını taşır
assert.deepEqual(new Set(GIRDILER.filter(x => typeof x !== 'string').map(x => x.k)), new Set([...ALANLAR, 'duvar', 'tutulu']));

// Kat yükseklikleri tabandan yukarı girilir; desteklenmeyen sistemler yanlış sonuç üretmez.
const kh = yeniDurum(); kh.form.kat = '2'; kh.form.katYukseklikleri = '3200 3200';
assert.deepEqual(girdiOku(kh).katYukseklikleri, [3200, 3200]); assert.equal(girdiOku(kh).H, 3200);
assert.ok(hesap(kh).sonuc);
kh.form.katYukseklikleri = '3200 3400';
assert.deepEqual(hesap(kh).sonuc.katlar.map(x => x.H), [3200, 3400]);
kh.form.dosemeTuru = 'kirissiz'; assert.deepEqual(hesap(kh).sonuc.katlar.map(x => x.H), [3200, 3400]);
kh.form.dosemeTuru = 'plak'; kh.form.perdeler = 'A/1–2'; assert.deepEqual(hesap(kh).sonuc.katlar.map(x => x.H), [3200, 3400]);
kh.form.perdeler = '';
assert.equal(excelSayfalar(kh)[0].satirlar.find(x => x[1] === 'Kat yükseklikleri')[2], '3200 3400');
kh.form.katYukseklikleri = '3200'; assert.match(hesap(kh).hata.katYukseklikleri, /Her kat için/);
kh.form.katYukseklikleri = '3200 9000'; assert.match(hesap(kh).hata.katYukseklikleri, /Her kat için/);
assert.throws(() => zincirHesap(girdiOku(kh)), /Her kat için/);

// Aks ağı değişince: yazarken hiçbir şey düşmez (yalnız kolon boyutları o an uygulanmaz); kesinleşince kolon boyutları (adlar kayar),
// planda kalmayan aksın kiriş boyutu, kırpılan perdenin kalınlığı düşer. Geçersiz girdi bir şey sildirmez.
const d = yeniDurum();
Object.assign(d, { ozel: { S1: { b: 400, h: 400 } }, kirisOzel: { A: { b: 300 }, D: { h: 500 }, 4: { b: 300 } }, perdeOzel: { 'A/1–2': 300, 'C/3–4': 250 }, dosemeOzel: { tur: 'plak', h: 150 } });
d.form.perdeler = 'A/1–2; C/3–4';
assert.deepEqual(girdiOku(d).kolonOzel, { S1: { b: 400, h: 400 } });
girdiYaz(d, 'ax', '4 5', false);
assert.ok(d.ozel.S1 && d.kirisOzel[4] && d.perdeOzel['C/3–4']); assert.deepEqual(girdiOku(d).kolonOzel, {});
const ek = girdiYaz(d, 'ax', '4 5', true);
assert.ok(ek.has('ozel') && ek.has('perdeler') && d.ozelNx === 2);
assert.deepEqual([d.ozel, Object.keys(d.kirisOzel), d.form.perdeler, d.perdeOzel], [{}, ['A'], 'A/1–2', { 'A/1–2': 300 }]); // D (ay 2 açıklık: A–C) ve 4 (ax 2 açıklık: 1–3) yok
girdiYaz(d, 'ay', '5 x', true); assert.ok(d.kirisOzel.A && d.perdeOzel['A/1–2']);                 // geçersiz Y girdisi: dokunulmaz
girdiYaz(d, 'ay', '5 4,5', true);
girdiYaz(d, 'perdeler', 'a/1-2, A/2-3', true);                                                       // birleşen perde yeni yazım: eski kalınlık düşer
assert.ok(d.form.perdeler === 'A/1–3' && !Object.keys(d.perdeOzel).length);
assert.ok(girdiOku(d).dosemeOzel.h === 150);
girdiYaz(d, 'dosemeTuru', 'disli', false); assert.ok(!girdiOku(d).dosemeOzel && d.dosemeOzel);     // başka türde uygulanmaz,
girdiYaz(d, 'dosemeTuru', 'disli', true); assert.equal(d.dosemeOzel, null);                         // kesinleşince düşer
assert.ok(girdiYaz(d, 'kullanim', 'sinif', true).has('q') && d.form.q === '3,5');                   // TS 498 Çizelge 7

// Hücreye yazılan elle değer: aralık dışı saklanmaz; kiriş aks boyunca, döşeme kat boyunca, kolon öbür kenarı o anki değerle
const d2 = yeniDurum(), r2 = hesap(d2).sonuc;
assert.match(ozelDegistir(d2, r2, 'kiris', 'K1', 'h', '50'), /200–5\.000 mm/);
assert.deepEqual(d2.kirisOzel, {});
for (const [t, a, k, v] of [['kiris', 'K1', 'h', '600'], ['doseme', 'D4', 'h', '150'], ['kolon', 'S5', 'b', '450'], ['radye', 'Radye', 'h', '700'], ['radye', 'Radye', 'a', '1,25']])
  assert.equal(ozelDegistir(d2, r2, t, a, k, v), null);
const S5h = r2.kolonlar.find(c => c.ad === 'S5').h;
assert.deepEqual([d2.kirisOzel, d2.dosemeOzel, d2.ozel, d2.radyeOzel], [{ A: { h: 600 } }, { tur: 'plak', h: 150 }, { S5: { b: 450, h: S5h } }, { h: 700, a: 1.25 }]);
const r3 = hesap(d2).sonuc;
assert.ok(r3.kirisler.filter(e => r3.ag.hatlar[e.hat].aks === 'A').every(e => e.h === 600 && e.ozel.h) && r3.dosemeler.every(e => e.h === 150 && e.ozel.h));
assert.ok(r3.kolonlar.find(c => c.ad === 'S5').b === 450 && r3.radye.h === 700 && r3.radye.a === 1.25);
assert.equal(ozelDegistir(d2, r3, 'kiris', 'K2', 'h', ''), null); assert.deepEqual(d2.kirisOzel, {}); // boş: otomatik
const dt = yeniDurum(); dt.form.dosemeTuru = 'kaset';
assert.equal(ozelDegistir(dt, hesap(dt).sonuc, 'doseme', 'D1', 't', '80'), null);
assert.match(ozelDegistir(dt, hesap(dt).sonuc, 'doseme', 'D1', 'h', '80'), /Tabla kalınlığı t/);   // t < h olmalı
assert.deepEqual(dt.dosemeOzel, { tur: 'kaset', t: 80 });

// Kayıt: aynı anahtar, gidiş-dönüş; eski (elle alanları olmayan) ve bozuk kayıt açılır, geçersiz değerler atılır
const depo = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); } };
const kh40 = yeniDurum(); kh40.form.kat = '40'; kh40.form.katYukseklikleri = Array.from({ length: 40 }, () => '3000').join(' ');
durumKaydet(kh40, depo); assert.equal(durumYukle(depo).form.katYukseklikleri, kh40.form.katYukseklikleri);
durumKaydet(d2, depo);
assert.deepEqual(durumYukle(depo), d2);
depo.setItem(ANAHTAR, JSON.stringify({ form: { ax: '4 5 4', kullanim: 'yok', q: '5' }, duvar: false, ozel: { S1: { b: 50 }, S2: { b: 500 } }, ozelNx: 3,
  kirisOzel: { A: { b: 'x', h: '450' }, '?': { b: 300 } }, perdeOzel: { 'A/1–2': 9000 }, dosemeOzel: { tur: 'plak', h: 100, t: 200 }, radyeOzel: { h: 20 } }));
const de = durumYukle(depo);
assert.deepEqual([de.form.kullanim, de.form.q, de.duvar, de.ozel, de.kirisOzel, de.perdeOzel, de.dosemeOzel, de.radyeOzel],
  ['konut', '5', false, { S2: { b: 500 } }, { A: { h: 450 } }, {}, null, {}]);
depo.setItem(ANAHTAR, '{bozuk'); assert.deepEqual(durumYukle(depo), yeniDurum());

// Excel'e aktarma verisi: sayfa adları, ham sayılar, düz başlıklar, Türkçe metin, bütün koşullar, kolon listesi
const liste = { veri: [['S1', '400', '500', '', '', '876', '1262'], ['', '', '', '', '', '', ''], ['P1', '250', '1800', '', 'C35', '2400', '']], ayar: { beton: 'C30', H: '3000', kirissiz: '' } };
const s = excelSayfalar(d2, r3, { liste });
assert.deepEqual(s.map(x => x.ad), ['Girdiler', 'Döşeme', 'Kiriş', 'Kolon', 'Kat kolon yükleri', 'Radye', 'Radye zımbalama', 'Koşullar', 'Notlar', 'Kolon listesi']);
const gi = s[0].satirlar, sat = ad => gi.find(x => x[1] === ad);
assert.deepEqual([sat('Kat yüksekliği')[2], sat('X aks aralıkları')[2], sat('Temel derinliği')[2], sat('Beton')[2], sat('Döşemelerde bölme duvar var')[2], sat('Döşeme türü')[2]],
  [3000, '4 5 4', 1.5, 'C30', true, 'Kirişli plak']);
assert.ok(sat('Kullanım (TS 498 Çizelge 7)')[2].startsWith('Konut') && sat('S<sub>DS</sub>')[3] === '–');
assert.deepEqual(gi.filter(x => x[0] === 'Elle verilen boyutlar').map(x => [x[1], x[2]]), [['Döşeme h', 150], ['S5 kolonu b', 450], ['S5 kolonu h', S5h], ['Radye h', 700], ['Radye taşması', 1.25]]);
for (const x of s.slice(1, 6)) assert.ok(x.sutunlar.every(c => c.baslik && !/[<>]/.test(c.baslik)) && x.satirlar.every(r => r.length === x.sutunlar.length), x.ad);
const ki = s[2], kc = b => ki.sutunlar.findIndex(c => c.baslik === b), K1 = ki.satirlar[0], e1 = r3.kirisler[0];
const detay = [['Sol üst ek', 'solUstEk'], ['Sol alt ek', 'solAltEk'], ['Montaj', 'montaj'], ['Düz', 'duz'], ['Pilye', 'pilye'], ['Sağ üst ek', 'sagUstEk'], ['Sağ alt ek', 'sagAltEk'], ['Gövde', 'govde']];
const ornek = Object.fromEntries(detay.map(([, alan], i) => [alan, i === 0 ? 0 : `${i}φ12`]));
const kd = excelSayfalar(d2, { ...r3, kirisler: [{ ...e1, ...ornek }] })[2];
assert.ok(detay.every(([ad, alan]) => kc(ad) >= 0 && kd.satirlar[0][kc(ad)] === ornek[alan] && K1[kc(ad)] === (e1[alan] ?? 'Hesaplanmadı')));
assert.deepEqual([K1[kc('Ad')], K1[kc('Aks')], K1[kc('ℓ (m)')], K1[kc('b (mm)')], K1[kc('h (mm)')], K1[kc('Md mesnet')], K1[kc('Ve (kN)')], K1[kc('Sehim (mm)')], K1[kc('Sehim sınırı (mm)')]],
  [e1.ad, e1.aks, e1.L, e1.b, 600, e1.MdMesnet, e1.Ve, e1.sehim.deger, e1.sehim.sinir]);                    // ham: yuvarlanmamış
assert.ok(!Number.isInteger(e1.MdMesnet * 10) && K1[kc('Kullanım')].bicim === '0%' && K1[kc('Kullanım')].v === e1.belirleyici.kullanim && ['Uygun', 'Uygun değil', 'Uygun · not'].includes(K1[kc('Sonuç')]));
assert.ok(ki.sutunlar[kc('Md mesnet')].sayi && !ki.sutunlar[kc('Aks')].sayi && ki.not.startsWith('Kiriş: 17 eleman'));
const ko = s.find(x => x.ad === 'Kolon'), kon = ad => ko.sutunlar.findIndex(x => x.baslik === ad);
assert.equal(ko.satirlar[0][kon('Majör / yüz')], r3.kolonlar[0].boyunaMajor);
assert.equal(ko.satirlar[0][kon('Minör / yüz')], r3.kolonlar[0].boyunaMinor);
// Aynı kolonun farklı katlardaki satırları seçilebilir, Excel'e ham sayıyla yazılır; yükler uygunluk sonucu değildir.
const katli = { ...r3, katKolonYukleri: [{ kat: 1, ad: 'S1', aks: '1A', NG: 100, NQ: 20, Nd: 172 }, { kat: 2, ad: 'S1', aks: '1A', NG: 60, NQ: 10, Nd: 100 }] };
const ky = excelSayfalar(d2, katli).find(x => x.ad === 'Kat kolon yükleri'), kys = SAYFALAR.find(x => x.ad === 'katKolonYukleri');
assert.deepEqual(ky.satirlar, [[1, 'S1', '1A', 100, 20, 172], [2, 'S1', '1A', 60, 10, 100]]);
assert.match(ky.not, /ayrı boyut ve donatı hesabı yapılmamıştır/);
assert.match(tabloHtml(kys, katli, d2), /data-ad="1-S1"[\s\S]*data-ad="2-S1"/);
assert.match(tabloHtml(kys, katli, d2, true), /<caption>.*ayrı boyut ve donatı hesabı yapılmamıştır/);
assert.deepEqual(excelSayfalar(d2, { ...r3, katKolonYukleri: undefined }).find(x => x.ad === 'Kat kolon yükleri').satirlar, []);
// Kat seçimi ve Excel: her katta gerçek sonuçlar, temel yalnız bir kez; katlarda ortak hücreyle yanlış düzenleme yapılmaz.
const kr1 = r3.kirisler[0], kr2 = { ...kr1, b: kr1.b + 50 }, story = { ...r3, katlar: [
  { kat: 1, H: 3000, dosemeler: r3.dosemeler, kirisler: [kr1], kolonlar: r3.kolonlar },
  { kat: 2, H: 3400, dosemeler: r3.dosemeler, kirisler: [kr2], kolonlar: r3.kolonlar },
] };
assert.equal(katGorunumu(story, 2).kirisler[0].b, kr2.b);
assert.equal(katGorunumu(story, 2).radye, r3.radye);
assert.throws(() => katGorunumu({ ...story, katlar: [{ kat: 1, dosemeler: [] }] }, 1), /eksik/);
const katKiris = SAYFALAR.find(x => x.ad === 'kiris'), katHTML = tabloHtml(katKiris, katGorunumu(story, 2), d2);
assert.doesNotMatch(katHTML, /data-tip="kiris"/);
const ks = excelSayfalar(d2, story), kk = ks.find(x => x.ad === 'Kiriş'), kb = kk.sutunlar.findIndex(x => x.baslik === 'b (mm)');
assert.deepEqual(kk.satirlar.map(row => [row[0], row[kb]]), [[1, kr1.b], [2, kr2.b]]);
assert.equal(ks.find(x => x.ad === 'Radye').satirlar.length, s.find(x => x.ad === 'Radye').satirlar.length);
const katKos = ks.find(x => x.ad === 'Koşullar');
assert.equal(katKos.sutunlar[0].baslik, 'Kat');
assert.ok([1, 2].every(kat => katKos.satirlar.some(row => row[0] === kat && row[1] === kr1.ad && row[3] === 'Kiriş')));
assert.ok(katKos.satirlar.some(row => row[0] === '' && row[3] === 'Radye'));
assert.ok(!ks.some(x => x.ad === 'Kat kolon yükleri'));
const ra = s[5], rc = b => ra.sutunlar.findIndex(c => c.baslik === b);
assert.deepEqual([ra.satirlar[0][rc('ℓ1 · h')], ra.satirlar[0][rc('ℓ2 · taşma')], ra.satirlar[1][rc('ℓ1 · h')]], [700, 1.25, r3.radyeSerit[0].l1]);
const tumu = [...r3.dosemeler, ...r3.kirisler, ...r3.kolonlar, r3.radye, ...r3.radyeSerit, ...r3.radyeZimb];
assert.equal(s[7].satirlar.length, tumu.reduce((t, e) => t + e.maddeler.length, 0));
const k0 = s[7].satirlar.find(x => x[0] === 'K1' && x[3] === 'Kiriş yüksekliği');
assert.deepEqual([k0[2], k0[4], k0[5], k0[9]], ['Kiriş', 600, 'mm', 'Sağlıyor']);
assert.ok(s[7].satirlar.every(x => x[9] === 'Sağlıyor' || x[9] === 'Sağlamıyor' || x[9] === 'Not') && s[7].satirlar.some(x => typeof x[4] === 'string'));
assert.deepEqual(s[8].satirlar.map(x => x[1]), r3.notlar); assert.ok(r3.notlar.some(n => n.startsWith('Elle verilen boyutlar')));
assert.deepEqual(s[9].satirlar.map(x => [x[0], x[1], x[3], x[4], x[7], x[13]]), [['S1', 400, 3000, 'C30', 'Kolon', 'Uygun'], ['P1', 250, 3000, 'C35', 'Perde', 'Uygun']]);
assert.ok(xlsxYap(s).length > 10000);
// Kirişsiz ve perdeli: Şeritler, Zımbalama, Perde sayfaları; girdi hatasında yalnız Girdiler ve Notlar (hata iletisiyle)
const dk = yeniDurum(); Object.assign(dk.form, { dosemeTuru: 'kirissiz', perdeler: 'A/2–3' });
assert.deepEqual(excelSayfalar(dk).map(x => x.ad), ['Girdiler', 'Döşeme', 'Şeritler', 'Zımbalama', 'Kolon', 'Kat kolon yükleri', 'Perde', 'Radye', 'Radye zımbalama', 'Koşullar', 'Notlar']);
const dh = yeniDurum(); dh.form.ax = '4 x';
const sh = excelSayfalar(dh);
assert.deepEqual(sh.map(x => x.ad), ['Girdiler', 'Notlar']); assert.ok(sh[1].satirlar[0][1].startsWith('Girdi hatası: X aks') && sh[0].satirlar.find(x => x[1] === 'X aks aralıkları')[4].startsWith('Hata:'));
assert.equal(dosyaAdi(new Date(2026, 10, 5)), 'kesit-2026-11-05.xlsx');

console.log('calisma: tüm kontroller geçti');
