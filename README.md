# Kesit — kolon / perde ön kontrolü

Statik site, derleme adımı yok. `index.html` giriş sayfası, `hesap.html` tek kesit hesabı, `sira.html` döşemeden temele hesap zinciri (döşeme → kiriş → kolon/perde → radye; motor `zincir.js`, adımlar `doseme.js`, `kiris.js`, `kolon.js`, `perde.js`, `radye.js`), `tablo.html` aynı zincirin tam genişlik Excel tarzı kitabı ve kolon listesi. İki sayfanın ortak kitabı (proje durumu, Girdiler sayfası, elle boyut hücreleri, Excel'e aktarma) `calisma.js`/`calisma.css`, .xlsx yazıcı `xlsx.js`. Tema: `tema.css`/`tema.js`, sayfa geçişleri: `gecis.css`.

Yerelde: `python3 -m http.server 8000` → http://localhost:8000

Katlı ön hesap için kat yüksekliklerini tabandan yukarı mm cinsinden girin (ör. `3000 3200 3000`); sonuç ve Excel her katı ayrı gösterir. Alan boşsa ortak kesit hesabı yapılır. Kirişsiz ve perdeli sistemlerde deprem etkileri kesin hesapta denetlenmelidir.

Testler: `node kurallar.test.mjs`, `node donati.test.mjs`, `node zincir.test.mjs`, `node calisma.test.mjs`, `node katli.test.mjs`, `node katli-kirissiz.test.mjs`, `node perde-katli.test.mjs` ve `node xlsx.test.mjs`

Kaynaklar: TBDY 2018, TS 500 (2000), TS 498 (1997), 1 Mart kararnamesi (kolon uzun/kısa ≤ 1,5). Ön boyutlandırma aracıdır; kesin statik hesabın yerine geçmez.

Üçüncü taraf: three.js r169 (MIT, `vendor/`), Hanken Grotesk ve JetBrains Mono (SIL OFL 1.1, `fonts/`).
