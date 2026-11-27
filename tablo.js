// Tablo sayfası: döşemeden temele zinciri tam genişlik çalışma kitabında (Girdiler + zincir sayfaları; proje sira.html ile aynı,
// kesit.sira.v3) ve kolon listesi sekmesi (tablo.html'deki satır içi betik). Kitap, düzenleme ve Excel'e aktarma calisma.js'te.
import { kitapKur, sekmeOk, simge, ANAHTAR, durumYukle, excelIndir, girdiOzet, tabloHtml } from './calisma.js';
import { projeAdi } from './projeler.js';

const $ = s => document.querySelector(s);
const LISTE = { ad: 'liste', baslik: 'Kolon listesi', kontrol: 'sayfa' }, SEKME = 'kesit.tablo.sekme';
const bar = [...document.querySelectorAll('.sekmeler-alt')], zs = $('#z-sayfa');
const K = kitapKur({ sayfa: zs, kap: $('#zincir-kitap .kap'), sekmeler: bar, ad: $('#z-ad'), formul: $('#z-formul'), durumSol: $('#z-durum-sol'), durumSag: $('#z-durum-sag'),
  ayrinti: $('#z-ayrinti'), ayrintiBaslik: $('#z-ayrinti-baslik'), ayrintiNot: $('#z-ayrinti-not'), iz: $('#z-iz') }, { yenile: () => hesapla(), katDegisti: () => ciz() });
let gorunum = 'zincir';

function hesapla() {
  K.hesap();
  const h = Object.values(K.hata), y = h.length ? `<b>Girdi hatası.</b> ${h.map(simge).join(' · ')} <span class="soluk">(Girdiler sayfası)</span>` : '';
  $('#z-hata').hidden = !h.length || gorunum !== 'zincir';
  if ($('#z-hata').innerHTML !== y) $('#z-hata').innerHTML = y; // role=alert: her tuşta yeniden okunmasın
  if (!K.gorunur().some(s => s.ad === K.sayfaAd)) K.sayfaAd = 'doseme'; // ör. kirişsiz seçilince Kiriş sekmesi kalkar
  $('#z-notlar').innerHTML = (K.sonuc?.notlar ?? []).map(n => `<li>${simge(n)}</li>`).join('');
  ciz();
}
const ciz = () => { K.sekmeCiz([LISTE], gorunum === 'liste' ? 'liste' : K.sayfaAd); if (gorunum === 'zincir') { K.sayfaCiz(); K.durumCiz(); K.secimCiz(); } };

// Sekme: zincir sayfası ya da kolon listesi (iki kitap aynı sekme çubuğunu gösterir; seçim bu tarayıcıda hatırlanır)
function sec(ad) {
  if (zs.contains(document.activeElement)) document.activeElement.blur(); // düzenlenen hücre kaydedilsin
  gorunum = ad === 'liste' ? 'liste' : 'zincir';
  if (gorunum === 'zincir') { K.sayfaAd = K.gorunur().some(s => s.ad === ad) ? ad : 'girdi'; K.secili = null; }
  try { localStorage.setItem(SEKME, ad); } catch {}
  $('#zincir-kitap').hidden = $('#zincir-ayrinti').hidden = gorunum !== 'zincir';
  $('#liste-kitap').hidden = $('#liste-ayrinti').hidden = gorunum !== 'liste';
  $('#z-hata').hidden = gorunum !== 'zincir' || !Object.keys(K.hata).length;
  document.body.dataset.gorunum = gorunum;
  ciz();
}
const simdiki = () => gorunum === 'liste' ? 'liste' : K.sayfaAd;
for (const x of bar) {
  x.addEventListener('click', e => {
    const b = e.target.closest('[data-sayfa]'); if (!b) return;
    const odak = x.contains(document.activeElement);
    sec(b.dataset.sayfa);
    if (odak) document.querySelector('.kitap:not([hidden]) .sekmeler-alt [aria-selected="true"]')?.focus(); // sekmeler yeniden çizildi
  });
  sekmeOk(x, '[data-sayfa]', b => b.dataset.sayfa, sec, simdiki);
}

// Excel'e aktar: düzenlenen hücre ve bekleyen hesap önce işlenir; kolon listesi kaydından (kesit.tablo.v1) ayrı sayfa
$('#excel').addEventListener('click', async () => {
  if (zs.contains(document.activeElement)) document.activeElement.blur();
  await K.hazir(); // işçideki hesap beklenir
  let liste;
  try { const k = JSON.parse(localStorage.getItem('kesit.tablo.v1')); if (Array.isArray(k?.veri)) liste = { veri: k.veri, ayar: k.ayar ?? {} }; } catch {}
  excelIndir(K.d, K.tumSonuc, { liste, ad: projeAdi() });
});
// Yazdır düğmesi (tablo.html satır içi betiği print() çağırır): zincir hesabı sürüyorsa önce sonuç beklenir
$('#yazdir').addEventListener('click', e => {
  if (gorunum !== 'zincir' || K.guncel()) return;
  e.stopImmediatePropagation(); K.hazir().then(() => print());
}, true);
// Yazdır: zincir görünümündeyse bütün sayfalar (Girdiler özeti paragrafta), kolon listesinde satır içi betiğin raporu
addEventListener('beforeprint', () => {
  if (gorunum !== 'zincir') return;
  if (zs.contains(document.activeElement)) document.activeElement.blur();
  K.kesinlestir(); // sonuç güncel değilse eşzamanlı hesap (tarayıcı menüsünden yazdırma)
  $('#z-tarih').textContent = `${projeAdi()} · ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  $('#z-girdi-ozet').innerHTML = girdiOzet(K.d, K.sonuc);
  $('#baski-zincir').innerHTML = K.sonuc ? K.gorunur().filter(s => !s.girdi).map((s, i) => `<section class="baski-sayfa"><h2>${i + 1}. ${s.baslik}${K.sonuc.aktifKat && s.adim !== 'temel' ? ` · ${K.sonuc.aktifKat}. kat` : ''}</h2>${tabloHtml(s, K.sonuc, K.d, true)}</section>`).join('') : '';
  $('#z-baski-notlar').innerHTML = (K.sonuc?.notlar ?? Object.values(K.hata)).map(n => `<li>${simge(n)}</li>`).join('');
});
// Döşemeden temele sayfası başka sekmede aynı projeyi değiştirince
addEventListener('storage', e => { if (e.key === ANAHTAR) { K.d = durumYukle(undefined, false); K.simdi(); } });

K.sayfaAd = 'girdi';
hesapla();
let ilk = 'girdi'; try { ilk = localStorage.getItem(SEKME) ?? ilk; } catch {}
sec(ilk);
