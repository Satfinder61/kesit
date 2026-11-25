// Görünüm paneli: tema (koyu, açık, krem, sistem), vurgu rengi, yazı boyutu, hareketi azalt.
// Seçim kesit.tema.v1'de durur. Sayfa açılırken <head>'deki tek satırlık betik uygular (yanıp sönme olmaz);
// bu dosya paneli kurar, değişikliği uygular ve kaydeder. Renk ve yüzey değerleri tema.css'te.
const ANAHTAR = 'kesit.tema.v1';
const VARSAYILAN = { mod: 'koyu', renk: 'turuncu', olcek: 100, hareket: '' };
const MODLAR = { koyu: 'Koyu', acik: 'Açık', krem: 'Krem', sistem: 'Sistem' };
const OLCEKLER = [90, 100, 110, 120];
// Yeşil ve kırmızı tonlar yok: onlar "uygun / uygun değil" demek (DESIGN.md, One Accent Rule).
const RENKLER = {
  turuncu: ['Kontur turuncusu', '#ff6a2b'],
  kehribar: ['Kehribar', '#e7b008'],
  mavi: ['Kurumsal mavi', '#2463eb'],
  civit: ['Koyu çivit', '#5048e5'],
  mor: ['Asil mor', '#6b26d9'],
  arduvaz: ['Arduvaz', '#344256'],
};
// tema.css ile aynı tutun: zemin, panel, levha, alan
const ZEMINLER = {
  koyu: ['#121110', '#191816', '#151412', '#0d0c0b'],
  acik: ['#f1f5f9', '#f8fafc', '#ffffff', '#ffffff'],
  krem: ['#efece7', '#f8f6f2', '#fcfcfa', '#fcfcfa'],
};

// ── Renk hesabı (WCAG 2.x göreli parlaklık ve kontrast)
const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const isik = c => {
  const [r, g, b] = rgb(c).map(v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const kontrast = (a, b) => { const x = isik(a), y = isik(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const karistir = (a, p, b) => { const B = rgb(b); return hex(rgb(a).map((v, i) => v * p + B[i] * (1 - p))); }; // color-mix(in srgb, a p, b)
function hsl(c) {
  const [r, g, b] = rgb(c).map(v => v / 255), M = Math.max(r, g, b), m = Math.min(r, g, b), f = M - m, l = (M + m) / 2;
  const h = !f ? 0 : M === r ? (g - b) / f % 6 : M === g ? (b - r) / f + 2 : (r - g) / f + 4;
  return [(h * 60 + 360) % 360, f ? f / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l), k = n => (n + h / 30) % 12;
  return hex([0, 8, 4].map(n => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}
// Vurgu yazı olarak da kullanılır (sınır ölçüleri, etkin sütun, uyarı): moddaki her zeminde ve kendi %17'lik
// etkin hücre zemininde en az 4,5:1 olana dek koyu modda açılır, açık modlarda koyulaşır. Ton ve doygunluk kalır.
function uyarla(c, mod) {
  const z = ZEMINLER[mod], [h, s, l0] = hsl(c), adim = mod === 'koyu' ? .01 : -.01;
  for (let l = l0; l >= 0 && l <= 1; l += adim) {
    const v = hslHex(h, s, l);
    if ([...z, karistir(v, .17, z[0])].every(x => kontrast(v, x) >= 4.5)) return v;
  }
  return adim > 0 ? '#ffffff' : '#000000';
}
// Vurgu üstündeki yazı (ana düğme, seçili adım numarası): iki adaydan kontrastı yüksek olan.
const ustu = c => kontrast(c, '#140c08') >= kontrast(c, '#ffffff') ? '#140c08' : '#ffffff';
const yakin = c => { const [h, s] = hsl(c); return s > .25 && (Math.abs(h - 147) < 30 || h < 14 || h > 350); };
const renkHex = r => RENKLER[r]?.[1] ?? r;
const cssSatir = (r, mod) => { const v = uyarla(renkHex(r), mod); return `--turuncu:${v}!important;--turuncu-ustu:${ustu(v)}!important`; };

// ── Durum
const d = document.documentElement;
const acikMi = matchMedia('(prefers-color-scheme: light)');
const azMi = matchMedia('(prefers-reduced-motion: reduce)');
const cozul = m => m === 'sistem' ? (acikMi.matches ? 'acik' : 'koyu') : m;
const varsayilanMi = s => Object.keys(VARSAYILAN).every(k => s[k] === VARSAYILAN[k]);
function oku() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(ANAHTAR)) || {}; } catch {}
  return {
    mod: Object.hasOwn(MODLAR, s.mod) ? s.mod : VARSAYILAN.mod,
    renk: Object.hasOwn(RENKLER, s.renk) || /^#[0-9a-f]{6}$/i.test(s.renk) ? s.renk : VARSAYILAN.renk,
    olcek: OLCEKLER.includes(s.olcek) ? s.olcek : VARSAYILAN.olcek,
    hareket: s.hareket === 'az' ? 'az' : '',
  };
}
function yaz() {
  try {
    if (varsayilanMi(durum)) return localStorage.removeItem(ANAHTAR);
    const v = { ...durum };
    if (v.renk !== 'turuncu') v.css = { koyu: cssSatir(v.renk, 'koyu'), acik: cssSatir(v.renk, 'acik'), krem: cssSatir(v.renk, 'krem') };
    localStorage.setItem(ANAHTAR, JSON.stringify(v));
  } catch {}
}
function uygula() {
  const m = cozul(durum.mod);
  d.classList.add('tema-aninda'); // renkler tek karede değişsin, geçişli öğeler geride kalmasın
  d.dataset.tema = m;
  document.querySelector('meta[name="color-scheme"]').content = m === 'koyu' ? 'dark' : 'light';
  if (durum.olcek === 100) delete d.dataset.olcek; else d.dataset.olcek = durum.olcek;
  if (durum.hareket) d.dataset.hareket = 'az'; else delete d.dataset.hareket;
  let s = document.getElementById('tema-renk');
  if (durum.renk === 'turuncu') s?.remove();
  else {
    if (!s) { s = document.createElement('style'); s.id = 'tema-renk'; document.head.append(s); }
    s.textContent = `@media screen{:root{${cssSatir(durum.renk, m)}}}`;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove('tema-aninda')));
  dispatchEvent(new Event('tema')); // kontur.js ve uc.js tuval renklerini yeniden okur
}
let durum = oku();
uygula(); yaz(); // baştaki satır betiği ile aynı sonucu verir; eski ya da bozuk kaydı da onarır

// ── Panel: üst çubukta ana düğmenin soluna
const ust = document.querySelector('.ust'), ana = ust?.querySelector(':scope > .dugme.ana');
if (ana && 'popover' in HTMLElement.prototype) {
  const secenek = (ad, deger, yazi) => `<label><input type="radio" name="${ad}" value="${deger}"><span>${yazi}</span></label>`;
  const kap = document.createElement('div');
  kap.className = 'tema';
  kap.innerHTML = `
    <button type="button" class="tema-dugme" popovertarget="tema-panel" aria-label="Görünüm ayarları" title="Görünüm ayarları">
      <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="yari" d="M9 2.4a6.6 6.6 0 0 1 0 13.2z"/></svg>
    </button>
    <div class="tema-panel" id="tema-panel" popover role="dialog" aria-labelledby="tema-baslik">
      <h2 id="tema-baslik">Görünüm</h2>
      <fieldset><legend>Tema</legend><div class="tema-bolum">${Object.entries(MODLAR).map(([k, v]) => secenek('tema-mod', k, v)).join('')}</div></fieldset>
      <fieldset><legend>Vurgu rengi</legend>
        <div class="tema-renkler">${Object.entries(RENKLER).map(([k, [ad]]) =>
          `<label class="tema-renk" title="${ad}"><input type="radio" name="tema-renk" value="${k}" aria-label="${ad}"><span></span></label>`).join('')}
          <label class="tema-renk tema-ozel" title="Özel renk"><input type="color" name="tema-ozel" aria-label="Özel renk" aria-describedby="tema-not"><span></span></label>
        </div>
        <p class="tema-not" id="tema-not"></p>
      </fieldset>
      <fieldset><legend>Yazı boyutu</legend><div class="tema-bolum">${OLCEKLER.map(o => secenek('tema-olcek', o, `%${o}`)).join('')}</div></fieldset>
      <label class="tema-secim"><input type="checkbox" name="tema-hareket"><span>Hareketi azalt</span></label>
      <div class="tema-alt"><p class="tema-durum" role="status"></p><button type="button" class="tema-sifirla">Sıfırla</button></div>
    </div>`;
  ust.insertBefore(kap, ana);
  const $ = s => kap.querySelector(s);
  const dugme = $('.tema-dugme'), panel = $('.tema-panel'), ozel = $('[name=tema-ozel]'), hareket = $('[name=tema-hareket]');
  const sifirla = $('.tema-sifirla'), durumYazi = $('.tema-durum'), not = $('.tema-not');

  function panelGuncelle() {
    const m = cozul(durum.mod), ozelMi = !Object.hasOwn(RENKLER, durum.renk), c = renkHex(durum.renk), v = uyarla(c, m);
    for (const i of kap.querySelectorAll('input[type=radio]')) i.checked = String(durum[i.name.slice(5)]) === i.value;
    for (const [k, [, r]] of Object.entries(RENKLER)) $(`[value=${k}] + span`).style.background = uyarla(r, m);
    ozel.value = c;
    ozel.parentElement.classList.toggle('secili', ozelMi);
    ozel.nextElementSibling.style.background = ozelMi ? v : '';
    not.textContent = !ozelMi ? `Seçili: ${RENKLER[durum.renk][0]}`
      : `Seçili: özel renk ${c.toUpperCase()}` + (v !== c ? `. Okunurluk için ${v.toUpperCase()} kullanılıyor` : '')
        + (yakin(c) ? '. Uygun / uygun değil renklerine yakın; sınır çizgileriyle karışabilir.' : '.');
    hareket.checked = azMi.matches || !!durum.hareket;
    hareket.disabled = azMi.matches;
    hareket.nextElementSibling.textContent = azMi.matches ? 'Hareketi azalt (sistemde açık)' : 'Hareketi azalt';
  }

  // Sıfırla geri alınabilir: 6 sn boyunca düğme "Geri al" olur.
  let onceki = null, zaman = 0;
  const geriAlBitir = () => { clearTimeout(zaman); onceki = null; sifirla.textContent = 'Sıfırla'; };
  const degisti = () => { uygula(); yaz(); panelGuncelle(); if (panel.matches(':popover-open')) yerlestir(); }; // yazı boyutu düğmenin yerini değiştirebilir
  kap.addEventListener('change', e => {
    const { name, value, checked } = e.target;
    if (name === 'tema-mod') durum.mod = value;
    else if (name === 'tema-renk') durum.renk = value;
    else if (name === 'tema-olcek') durum.olcek = +value;
    else if (name === 'tema-hareket') durum.hareket = checked ? 'az' : '';
    else return;
    geriAlBitir(); durumYazi.textContent = ''; degisti();
  });
  ozel.addEventListener('input', () => { durum.renk = ozel.value; geriAlBitir(); durumYazi.textContent = ''; degisti(); });
  sifirla.addEventListener('click', () => {
    if (onceki) { durum = onceki; geriAlBitir(); durumYazi.textContent = 'Önceki görünüm geri getirildi.'; }
    else {
      onceki = durum; durum = { ...VARSAYILAN };
      sifirla.textContent = 'Geri al'; durumYazi.textContent = 'Varsayılan görünüme dönüldü.';
      zaman = setTimeout(() => { geriAlBitir(); durumYazi.textContent = ''; }, 6000);
    }
    degisti();
  });

  // Açılır pencere düğmenin altında, sağ kenarı hizalı; ekrandan taşmaz. Esc ve dışarı tıklama tarayıcıdan.
  function yerlestir() {
    const r = dugme.getBoundingClientRect(), w = Math.min(18 * parseFloat(getComputedStyle(d).fontSize), innerWidth - 16); // genişlik tema.css: min(18rem, 100vw - 16px)
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  }
  panel.addEventListener('beforetoggle', e => { if (e.newState === 'open') { panelGuncelle(); yerlestir(); } });
  panel.addEventListener('toggle', e => { if (e.newState === 'open') $('[name=tema-mod]:checked').focus(); });
  panel.addEventListener('focusout', e => {
    if (e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== dugme) panel.hidePopover();
  });
  addEventListener('resize', () => { if (panel.matches(':popover-open')) yerlestir(); });
  azMi.addEventListener('change', panelGuncelle);
  addEventListener('tema-dis', panelGuncelle);
}

// Sistem modu canlı izler; başka sekmedeki değişiklik ve geri tuşuyla dönülen sayfa da güncellenir.
const disaridan = () => { durum = oku(); uygula(); dispatchEvent(new Event('tema-dis')); };
acikMi.addEventListener('change', () => { if (durum.mod === 'sistem') disaridan(); });
addEventListener('storage', e => { if (e.key === ANAHTAR) disaridan(); });
addEventListener('pageshow', e => { if (e.persisted) disaridan(); });
// "Hareketi azalt": sayfalar arası geçiş hiç başlamasın (gecis.css'teki izin yalnız sistem ayarına bakar).
addEventListener('pageswap', ({ viewTransition: v }) => { if (v && d.dataset.hareket === 'az') { v.ready.catch(() => {}); v.skipTransition(); } });
// Tarayıcı sayfa geçişini kendi iptal ederse (ör. arka plandaki sekme: 'Page already revealed') konsola yakalanmamış hata düşmesin
addEventListener('pageswap', ({ viewTransition: v }) => { v?.ready.catch(() => {}); v?.finished.catch(() => {}); }); // yeni sayfanın pagereveal karşılığı <head> içindeki satır betikte
// Baskı yazı boyutundan bağımsız: sıra planı ve kesit yazıları ekrandaki genişlikle çizilir. Yazdırırken %100
// düzene dönülür; sayfaların beforeprint/afterprint'i bu dosyadan sonra kaydolur, iki düzende de yeniden ölçer.
addEventListener('beforeprint', () => delete d.dataset.olcek);
addEventListener('afterprint', () => { if (durum.olcek !== 100) d.dataset.olcek = durum.olcek; });
