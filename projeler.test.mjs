// Çalıştır: node projeler.test.mjs — proje listesi ve eşitleme (projeler.js): yerel işlemler, ilk giriş, ikinci cihaz, çakışma, silme
import assert from 'node:assert/strict';
import { dizinOku, projeAc, yeniProje, cogalt, yenidenAdlandir, yerelDegisti, projeSil, esitle, normal, projeAdi, DIZIN } from './projeler.js';
import { ANAHTAR, yeniDurum, durumYukle, durumMetni, durumKaydet, dosyaAdi } from './calisma.js';

const depoYap = () => { const m = new Map(); return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
// Sözleşmedeki sunucu; durum JSONB gibi anahtar sırası değişmiş saklanır
function sunucu() {
  const db = new Map(); let saat = 1e12;
  const sirala = v => Array.isArray(v) ? v.map(sirala) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => [k, sirala(v[k])])) : v;
  const api = {
    liste: async () => [...db.values()].map(k => structuredClone(k)),
    yaz: async (id, { ad, durum, surum }) => {
      const k = db.get(id); saat += 1000;
      if (!k) { db.set(id, { id, ad, durum: sirala(durum), surum: 1, degisti: saat }); return { surum: 1, degisti: saat }; }
      if (k.surum !== surum) return { cakisma: structuredClone(k) };
      Object.assign(k, { ad, durum: sirala(durum), surum: k.surum + 1, degisti: saat }); return { surum: k.surum, degisti: saat };
    },
    sil: async id => { db.delete(id); },
  };
  return { db, api };
}
const durumla = (ax, ad) => { const d = yeniDurum(); d.form.ax = ax; if (ad) d.form.ay = ad; return durumMetni(d); };
const sayfaKaydi = depo => { durumKaydet(durumYukle(depo), depo); }; // sayfa açılışı: oku, temizle, değiştiyse yaz
const aktif = depo => { const dz = dizinOku(depo); return dz.liste.find(p => p.id === dz.aktif); };
const ax = (depo, id) => { const dz = dizinOku(depo); return JSON.parse(id === dz.aktif ? depo.getItem(ANAHTAR) : depo.getItem(`kesit.proje.${id}`)).form.ax; };

// Dosya adı proje adıyla
assert.equal(dosyaAdi(new Date(2026, 10, 5)), 'kesit-2026-11-05.xlsx');
assert.equal(dosyaAdi(new Date(2026, 10, 5), 'Ali/Bey: Konut'), 'Ali Bey Konut-2026-11-05.xlsx');

// durumKaydet yalnız içerik değişince yazar
{
  const depo = depoYap(); let yazim = 0; const s = depo.setItem; depo.setItem = (k, v) => { yazim++; s(k, v); };
  const d = durumYukle(depo); durumKaydet(d, depo); durumKaydet(d, depo); assert.equal(yazim, 1);
}

// İlk açılış: var olan çalışma "Proje 1" olur; yeni proje, geçiş, çoğaltma, ad, silme
{
  const depo = depoYap(); depo.setItem(ANAHTAR, durumla('6 6'));
  const dz = dizinOku(depo); assert.equal(dz.liste.length, 1); assert.equal(dz.liste[0].ad, 'Proje 1');
  depo.setItem(DIZIN, JSON.stringify(dz)); const p1 = dz.aktif;
  assert.equal(projeAdi(depo), 'Proje 1');
  const p2 = yeniProje(depo, '  Ali   Bey  ', durumla('3 3'));
  assert.equal(projeAc(depo, p2), true); assert.equal(projeAc(depo, p2), false);
  assert.equal(projeAdi(depo), 'Ali Bey'); assert.equal(JSON.parse(depo.getItem(ANAHTAR)).form.ax, '3 3');
  assert.equal(ax(depo, p1), '6 6');
  projeAc(depo, p1); assert.equal(JSON.parse(depo.getItem(ANAHTAR)).form.ax, '6 6'); assert.equal(depo.getItem(`kesit.proje.${p1}`), null);
  const p3 = cogalt(depo, p1); assert.equal(ax(depo, p3), '6 6'); assert.equal(dizinOku(depo).liste.find(p => p.id === p3).ad, 'Proje 1 (kopya)');
  yenidenAdlandir(depo, p1, ''); assert.equal(aktif(depo).ad, 'Adsız proje'); assert.equal(aktif(depo).kirli, 1);
  yerelDegisti(depo); assert.equal(aktif(depo).kirli, 2);
  assert.equal(projeSil(depo, p3), false); assert.equal(projeSil(depo, p1), true); // aktif silinince öbürü açılır
  assert.equal(dizinOku(depo).aktif, p2); assert.equal(JSON.parse(depo.getItem(ANAHTAR)).form.ax, '3 3');
  assert.equal(projeSil(depo, p2), true); assert.equal(dizinOku(depo).liste.length, 1); assert.equal(aktif(depo).ad, 'Proje 1'); // hiç kalmazsa yeni
  assert.deepEqual(dizinOku(depo).silinecek, []); // hiç gönderilmemişler sunucuya silme yollamaz
  // Bozuk dizin okunur, yinelenen ve geçersiz kimlik atılır
  depo.setItem(DIZIN, '{"aktif":"x","liste":[{"id":"../a"},{"id":"abcdefgh","ad":"<b>"},{"id":"abcdefgh"}],"silinecek":["zz","abcdefgh1"]}');
  const b = dizinOku(depo); assert.deepEqual(b.liste.map(p => p.id), ['abcdefgh']); assert.equal(b.aktif, 'abcdefgh'); assert.deepEqual(b.silinecek, ['abcdefgh1']);
}

// İlk giriş: yerel projeler hesaba gider; ikinci cihaz hepsini alır, kendi boş örneğini yüklemez
const S = sunucu(), A = depoYap(), B = depoYap();
A.setItem(ANAHTAR, durumla('6 6')); A.setItem(DIZIN, JSON.stringify(dizinOku(A)));
const x = dizinOku(A).aktif, y = yeniProje(A, 'Ali Bey', durumla('3 3'));
assert.deepEqual(await esitle(A, S.api), { aktif: null });
assert.equal(S.db.size, 2); assert.ok(dizinOku(A).liste.every(p => p.surum === 1 && !p.kirli));
B.setItem(DIZIN, JSON.stringify(dizinOku(B))); sayfaKaydi(B); // yeni cihaz: kendiliğinden "Proje 1", varsayılan içerik
assert.equal((await esitle(B, S.api)).aktif, 'gitti'); // boş örnek gitti, hesaptaki en son değişen açıldı
assert.equal(S.db.size, 2); assert.deepEqual(dizinOku(B).liste.map(p => p.id).sort(), [x, y].sort());
assert.equal(dizinOku(B).aktif, y); assert.equal(JSON.parse(B.getItem(ANAHTAR)).form.ax, '3 3');
// JSONB sırası: sayfa açılınca yeniden yazılmaz (değişti sayılmaz)
{ const once = B.getItem(ANAHTAR); sayfaKaydi(B); assert.equal(B.getItem(ANAHTAR), once); assert.equal(normal(S.db.get(y).durum), once); }

// A değiştirir → gönderir; B temiz → alır (aktifse 'yeni')
projeAc(A, y); A.setItem(ANAHTAR, durumla('4 4')); yerelDegisti(A);
await esitle(A, S.api); assert.equal(S.db.get(y).surum, 2); assert.equal(aktif(A).kirli, 0);
assert.equal((await esitle(B, S.api)).aktif, 'yeni'); assert.equal(JSON.parse(B.getItem(ANAHTAR)).form.ax, '4 4');
// Yeniden adlandırma da gider
yenidenAdlandir(A, x, 'Ofis'); await esitle(A, S.api); await esitle(B, S.api);
assert.equal(dizinOku(B).liste.find(p => p.id === x).ad, 'Ofis');

// Çakışma: ikisi de bağlantısızken y'yi değiştirir; önce A gönderir, B'nin hâli "(bu cihazdaki)" kopyası olur, kaybolmaz
A.setItem(ANAHTAR, durumla('5 5')); yerelDegisti(A);
B.setItem(ANAHTAR, durumla('7 7')); yerelDegisti(B);
await esitle(A, S.api);
assert.equal((await esitle(B, S.api)).aktif, 'yeni');
assert.equal(JSON.parse(B.getItem(ANAHTAR)).form.ax, '5 5');
const kopya = dizinOku(B).liste.find(p => p.ad === 'Ali Bey (bu cihazdaki)');
assert.ok(kopya); assert.equal(ax(B, kopya.id), '7 7'); assert.equal(kopya.surum, 1); assert.equal(S.db.get(kopya.id).ad, 'Ali Bey (bu cihazdaki)');
await esitle(A, S.api); assert.equal(dizinOku(A).liste.length, 3);

// Yanıtı kaybolmuş yazım (sunucu ileride, içerik aynı): kopya açılmaz, sürüm alınır
{
  const p = dizinOku(A).liste.find(p => p.id === x);
  await S.api.yaz(x, { ad: p.ad, durum: JSON.parse(A.getItem(`kesit.proje.${x}`)), surum: p.surum }); // keepalive gibi
  yerelDegisti(A); degistirAktifOlmayan(A, x);
  await esitle(A, S.api);
  assert.equal(dizinOku(A).liste.length, 3); assert.equal(dizinOku(A).liste.find(q => q.id === x).surum, S.db.get(x).surum);
}
function degistirAktifOlmayan(depo, id) { const dz = JSON.parse(depo.getItem(DIZIN)); dz.liste.find(p => p.id === id).kirli = 1; depo.setItem(DIZIN, JSON.stringify(dz)); }

// Silme: A siler → sunucudan gider; B temizse yerelden de gider (aktifse 'gitti')
projeSil(A, kopya.id); assert.deepEqual(dizinOku(A).silinecek, [kopya.id]);
await esitle(A, S.api); assert.ok(!S.db.has(kopya.id)); assert.deepEqual(dizinOku(A).silinecek, []);
projeAc(B, kopya.id);
assert.equal((await esitle(B, S.api)).aktif, 'gitti'); assert.ok(!dizinOku(B).liste.some(p => p.id === kopya.id));
// Başka cihazda silinmişken burada değişmişse geri yüklenir (veri kaybolmaz)
projeSil(A, x); await esitle(A, S.api); assert.ok(!S.db.has(x));
degistirAktifOlmayan(B, x); await esitle(B, S.api);
assert.ok(S.db.has(x)); assert.ok(dizinOku(B).liste.some(p => p.id === x));
// Çalışırken sunucu hatası (ör. bağlantı) yerel veriyi bozmaz
{
  const once = JSON.stringify([...A.m]);
  await assert.rejects(esitle(A, { ...S.api, liste: async () => { throw new Error('ağ'); } }));
  assert.equal(JSON.stringify([...A.m]), once);
}
console.log('projeler.test.mjs: tamam');
