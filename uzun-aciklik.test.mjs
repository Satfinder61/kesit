// Çalıştır: node uzun-aciklik.test.mjs — kolon kaldırınca uzun açıklık / uzun konsol uyarısı (kolonduzen.js uzunAciklik; bilgi, denetim değil)
import assert from 'node:assert/strict';
import { zincirHesap } from './zincir.js';
import { uzunAciklikYazi, UZUN_ACIKLIK, UZUN_KONSOL } from './kolonduzen.js';
import { yeniDurum, girdiYaz, kolonDuzenDegistir, hesap } from './calisma.js';

const G0 = { ax: [4, 5, 4], ay: [5, 4.5], katSayisi: 5, H: 3000, beton: 'C30', celik: 'B420C', dosemeTuru: 'plak', disAralik: 500, disGen: 120,
  dolgu: 0.5, gKaplama: 2, q: 2, kullanim: 'konut', duvarDis: 6, duvarIc: 3, dosemeDuvar: true, sds: 1, kDeprem: 1, zemin: 400, Df: 1.5, tasma: 0.75, kolonOzel: {} };
const cal = (ax, ay, kolonDuzen) => zincirHesap({ ...G0, ax, ay, kolonDuzen });
const uyariNot = r => r.notlar.filter(n => /kolonunu kaldır|kolonlarını kaldır/.test(n));
// Uyarı maddesi bilgi niteliğinde: kirişin sonucunu düşürmez (gecti = bütün maddeler gecti ya da uyari)
const bilgiMi = (r, u) => { const e = r.kirisler.find(x => x.ad === u.kiris), m = e.maddeler.find(x => /^Uzun (açıklık|konsol)$/.test(x.ad));
  assert.ok(m && m.uyari === true && m.kullanim == null, `${u.kiris} uyarı maddesi`);
  assert.equal(e.gecti, e.maddeler.every(x => x.gecti || x.uyari)); assert.notEqual(e.belirleyici, m); return e; };
assert.equal(UZUN_ACIKLIK, 10); assert.equal(UZUN_KONSOL, 3);

// 1 — 8 m ızgara, iç kolon 2B kaldırıldı: B aksında 1–3 ve 2 aksında A–C 16 m birleşik açıklık (> 10 m) → iki uyarı, gerçek kesit ve komşu kolonlarla
{ const r = cal([8, 8, 8], [8, 8], '2B kaldırıldı'), uz = r.duzen.uzun;
  assert.equal(uz.length, 2);
  const B = uz.find(u => u.kom.join() === 'S5,S7'), e = bilgiMi(r, B);
  assert.ok(B && B.sil.join() === '2B' && B.L === 16 && !B.konsol);
  const not = `2B kolonunu kaldırmak 16 m açıklıklı kiriş oluşturuyor (B aksı, 1–3); kiriş yaklaşık ${e.b}×${e.h} mm çıkıyor, komşu kolonlar (S5, S7) ve radye zorlanır. Kaydırmayı ya da o aksa perde eklemeyi düşün.`;
  assert.ok(uyariNot(r).includes(not), uyariNot(r).join('\n'));
  assert.ok(uyariNot(r).some(n => n.startsWith('2B kolonunu kaldırmak 16 m açıklıklı kiriş oluşturuyor (2 aksı, A–C)')));
  assert.equal(uzunAciklikYazi(B, '2B'), not.replace('2B kolonunu kaldırmak', 'Bu kolonu kaldırmak'));
  assert.ok(e.maddeler.find(x => x.ad === 'Uzun açıklık').deger === '16 m (2B kaldırıldı)'); }

// 2 — 4 m ızgara, 2B kaldırıldı: birleşik 8 m ≤ 10 m ve tam iki katı (geçmiyor) → uyarı yok
{ const r = cal([4, 4, 4], [4, 4], '2B kaldırıldı');
  assert.deepEqual(r.duzen.uzun, []); assert.deepEqual(uyariNot(r), []);
  assert.ok(r.kirisler.every(e => !e.maddeler.some(m => /^Uzun /.test(m.ad)))); }

// 3 — Köşe kolonu 1A kaldırıldı: 4 m ve 5 m konsol (> 3 m) → konsol uyarısı; 3 m konsol (sınırda) uyarı vermez
{ const r = cal([4, 5, 4], [5, 4.5], '1A kaldırıldı'), uz = r.duzen.uzun;
  assert.deepEqual(uz.map(u => [u.konsol, u.L, u.kom.join()]).sort(), [['sol', 4, 'S2'], ['sol', 5, 'S5']]);
  const u = uz.find(x => x.L === 4), e = bilgiMi(r, u);
  assert.ok(uyariNot(r).includes(`1A kolonunu kaldırınca 4 m konsol kiriş oluşuyor (A aksı, 1–2); kiriş yaklaşık ${e.b}×${e.h} mm çıkıyor, mesnetteki kolon (S2) ve radye zorlanır. Kaydırmayı ya da o aksa perde eklemeyi düşün.`));
  assert.ok(uzunAciklikYazi(u, '1A').startsWith('Bu kolonu kaldırınca 4 m konsol kiriş oluşuyor'));
  assert.equal(e.maddeler.find(x => x.ad === 'Uzun konsol').deger, '4 m (1A kaldırıldı)'); }
{ const r = cal([3, 3], [3, 3], '1A kaldırıldı'); assert.deepEqual(r.duzen.uzun, []); }

// 4 — İki katı kuralı: 3 m ızgarada 2B ve 3B kaldırıldı → B aksında 9 m (< 10 m ama > 2 × 3 m); Y akslarında 6 m (= 2 × 3 m) uyarısız
{ const r = cal([3, 3, 3, 3], [3, 3], '2B kaldırıldı; 3B kaldırıldı'), uz = r.duzen.uzun;
  assert.equal(uz.length, 1); assert.ok(uz[0].L === 9 && uz[0].sil.join() === '2B,3B');
  assert.ok(uyariNot(r)[0].startsWith('2B ve 3B kolonlarını kaldırmak 9 m açıklıklı kiriş oluşturuyor (B aksı, 1–4)'));
  assert.ok(uzunAciklikYazi(uz[0], '3B').startsWith('Bu kolonu (2B ile birlikte) kaldırmak 9 m')); bilgiMi(r, uz[0]); }

// 5 — Kaydırma uyarı vermez; uyarı kaldırma geri alınınca kalkar (panel akışı: kolonDuzenDegistir → hesap)
{ assert.deepEqual(cal([8, 8, 8], [8, 8], '2B X +0,5').duzen.uzun, []);
  const d = yeniDurum(); girdiYaz(d, 'ax', '8 8 8'); girdiYaz(d, 'ay', '8 8');
  assert.ok(!kolonDuzenDegistir(d, '2B', { sil: true }).hata);
  const s = hesap(d).sonuc; assert.ok(s.duzen.uzun.length === 2 && s.duzen.uzun.every(u => u.L === 16));
  assert.ok(!kolonDuzenDegistir(d, '2B', null).hata); assert.equal(hesap(d).sonuc.duzen, null); }

console.log('uzun-aciklik: tamam');
