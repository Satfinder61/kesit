# Kesit — kolon / perde ön kontrolü

Statik site, derleme adımı yok. `index.html` giriş sayfası, `hesap.html` tek kesit hesabı, `sira.html` döşemeden temele hesap zinciri (döşeme → kiriş → kolon/perde → radye; motor `zincir.js`, adımlar `doseme.js`, `kiris.js`, `kolon.js`, `perde.js`, `radye.js`), `tablo.html` aynı zincirin tam genişlik Excel tarzı kitabı ve kolon listesi. İki sayfanın ortak kitabı (proje durumu, Girdiler sayfası, elle boyut hücreleri, Excel'e aktarma) `calisma.js`/`calisma.css`; motor sayfayı dondurmasın diye `hesap-isci.js` modül işçisinde çalışır (işçi yoksa eşzamanlı), .xlsx yazıcı `xlsx.js`. Tema: `tema.css`/`tema.js`, sayfa geçişleri: `gecis.css`.

3B bina: Döşemeden temele sayfasında plan başlığındaki «Plan | 3B» seçicisi ya da üst menüde «3B Bina» (`bina.html`, kayıtlı projeyi gösterir, düzenlemez). Model `bina.js` (saf, three.js'siz: hesap sonucundan eleman kutuları, temsili donatı, bilgi kartı), çizim `bina3b.js` (yerel three.js; yalnız 3B açılınca yüklenir), görünüm `bina3b.css`. Sürükle: döndür · Shift/sağ tuş: kaydır · Ctrl/⌘ + tekerlek (sunum sayfasında tekerlek): yakınlaştır · çift tık: sığdır ya da elemana yaklaş. Tıklanan elemanın betonu yarı saydam olur, demirleri (adet, çap ve aralık hesaptan; bindirme ve kanca yok) ve bilgi kartı görünür; seçim tabloyla bağlıdır. Yazdır/PDF çıktısında planın yanına 3B resim girer.

Yerelde: `python3 -m http.server 8000` → http://localhost:8000

Tek kolon kaldırma ya da kendi kiriş aksı boyunca kaydırma (bütün katlarda): planda «Yerleşimi düzenle» → kolonu seç, ya da Girdiler sayfasında `2B kaldırıldı; 3A X +0,40 m`. Kolon düzeni değişince kirişler ızgara kiriş sistemi olarak birlikte çözülür (`kiris.js`, `kolonduzen.js`); kirişsiz döşemede kaldırma yok, kaçıklık açıklığın 1/10'u ile sınırlı (TS 500 11.4.4.2).

Katlı ön hesap için kat yüksekliklerini tabandan yukarı mm cinsinden girin (ör. `3000 3200 3000`); sonuç ve Excel her katı ayrı gösterir. Alan boşsa ortak kesit hesabı yapılır. Kirişsiz ve perdeli sistemlerde deprem etkileri kesin hesapta denetlenmelidir.

Testler: `node kurallar.test.mjs`, `node donati.test.mjs`, `node zincir.test.mjs`, `node calisma.test.mjs`, `node katli.test.mjs`, `node katli-kirissiz.test.mjs`, `node perde-katli.test.mjs`, `node kolon-duzen.test.mjs`, `node hesap-isci.test.mjs`, `node bina.test.mjs` ve `node xlsx.test.mjs`

Kaynaklar: TBDY 2018, TS 500 (2000), TS 498 (1997), 1 Mart kararnamesi (kolon uzun/kısa ≤ 1,5). Ön boyutlandırma aracıdır; kesin statik hesabın yerine geçmez.

Üçüncü taraf: three.js r169 (MIT, `vendor/`), Hanken Grotesk ve JetBrains Mono (SIL OFL 1.1, `fonts/`).
