// Proje listesi ve hesapla eşitleme (sira.html, tablo.html, bina.html). Açık projenin durumu yine kesit.sira.v3'te durur
// (sayfalar bilmeden çalışır), öbür projeler kesit.proje.<id>'de, liste kesit.projeler.v1'de. Girişliyse projeler sunucuya da gider
// (sözleşme README'de): sürüm (surum) tutan iyimser yazım; çakışmada yerel olan kopya olarak kalır, hiçbir şey sessizce ezilmez.
import { ANAHTAR, yeniDurum, durumYukle, durumMetni } from './calisma.js';

export const DIZIN = 'kesit.projeler.v1';
const SLOT = id => `kesit.proje.${id}`, ID = /^[a-z0-9-]{8,40}$/;
export const adTemiz = a => String(a ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Adsız proje';
const yeniId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); // randomUUID güvensiz kökte (http://192.168…) yok
const kayit = ad => ({ id: yeniId(), ad: adTemiz(ad), degisti: Date.now(), surum: 0, kirli: 0 });
const bul = (dz, id) => dz.liste.find(p => p.id === id);
// Durum metni sayfanın yazacağı biçimde (durumYukle + durumMetni): sunucudan gelen JSONB anahtar sırası ya da eksik alan
// sayfa açılınca "değişti" sayılıp geri gönderilmesin. Çakışma karşılaştırması da bu biçimle.
export const normal = v => durumMetni(durumYukle({ getItem: () => typeof v === 'string' ? v : JSON.stringify(v ?? null) }));
const VARSAYILAN = () => durumMetni(yeniDurum());

// Dizin: { aktif, liste: [{ id, ad, degisti, surum, kirli }], silinecek: [id], hesap: { ad } | null, hesapId }
// surum: sunucudaki sürüm (0 = hiç gönderilmedi); kirli: gönderilmemiş yerel değişiklik sayacı (0 = temiz).
// hesapId: bu tarayıcıda en son girilen hesap; çıkışta da kalır (başka hesaba geçişi tanımak için).
export function dizinOku(depo = globalThis.localStorage) {
  let k = null; try { k = JSON.parse(depo.getItem(DIZIN)); } catch {}
  const gor = new Set(), say = x => Math.max(0, Math.floor(+x) || 0);
  const liste = (Array.isArray(k?.liste) ? k.liste : []).filter(p => ID.test(p?.id) && !gor.has(p.id) && gor.add(p.id))
    .map(p => ({ id: p.id, ad: adTemiz(p.ad), degisti: say(p.degisti), surum: say(p.surum), kirli: say(p.kirli) }));
  if (!liste.length) liste.push(kayit('Proje 1')); // ilk açılış: bugüne dek çalışılan proje (kesit.sira.v3) bu olur
  return { aktif: liste.some(p => p.id === k?.aktif) ? k.aktif : liste[0].id, liste,
    silinecek: (Array.isArray(k?.silinecek) ? k.silinecek : []).filter(x => ID.test(x)),
    hesap: typeof k?.hesap?.ad === 'string' ? { ad: k.hesap.ad.slice(0, 80) } : null,
    hesapId: typeof k?.hesapId === 'string' ? k.hesapId.slice(0, 80) : null };
}
const dizinYaz = (depo, dz) => depo.setItem(DIZIN, JSON.stringify(dz));
// Oku → değiştir → yaz, arada bekleme yok (başka sekme ve süren eşitleme aynı dizine yazar)
export function degistir(depo, f) { const dz = dizinOku(depo), r = f(dz); dizinYaz(depo, dz); return r; }
export const durumOku = (depo, dz, id) => depo.getItem(id === dz.aktif ? ANAHTAR : SLOT(id)) ?? VARSAYILAN();
const durumYaz = (depo, dz, id, metin) => depo.setItem(id === dz.aktif ? ANAHTAR : SLOT(id), metin);
const aktifYap = (depo, dz, id) => { // aktif → kendi yuvası, seçilen → kesit.sira.v3
  if (id === dz.aktif) return;
  if (bul(dz, dz.aktif)) depo.setItem(SLOT(dz.aktif), depo.getItem(ANAHTAR) ?? VARSAYILAN());
  depo.setItem(ANAHTAR, depo.getItem(SLOT(id)) ?? VARSAYILAN()); depo.removeItem(SLOT(id)); dz.aktif = id;
};

// ── Yerel işlemler (dönüş true: aktif proje değişti, sayfa yeniden yüklenmeli)
export const projeAc = (depo, id) => degistir(depo, dz => { if (!bul(dz, id) || id === dz.aktif) return false; aktifYap(depo, dz, id); return true; });
export function yeniProje(depo, ad, metin = VARSAYILAN()) {
  return degistir(depo, dz => { const p = kayit(ad); dz.liste.push(p); depo.setItem(SLOT(p.id), metin); return p.id; });
}
export const cogalt = (depo, id) => degistir(depo, dz => { const p = bul(dz, id); if (!p) return null;
  const q = { ...kayit(`${p.ad} (kopya)`), kirli: 1 }; depo.setItem(SLOT(q.id), durumOku(depo, dz, id)); dz.liste.splice(dz.liste.indexOf(p) + 1, 0, q); return q.id; });
export const yenidenAdlandir = (depo, id, ad) => degistir(depo, dz => { const p = bul(dz, id); if (!p || p.ad === adTemiz(ad)) return;
  p.ad = adTemiz(ad); p.kirli++; p.degisti = Date.now(); });
export const yerelDegisti = depo => degistir(depo, dz => { const p = bul(dz, dz.aktif); p.kirli++; p.degisti = Date.now(); });
// Sil: sunucuda olan silinecek listesine girer (bağlantı yokken de); aktif silinirse en son değişen açılır, hiç kalmazsa yeni proje
function kaldir(depo, dz, id) {
  const p = bul(dz, id); if (!p) return false;
  dz.liste.splice(dz.liste.indexOf(p), 1); depo.removeItem(SLOT(id));
  if (id !== dz.aktif) return false;
  if (!dz.liste.length) { const q = kayit('Proje 1'); dz.liste.push(q); depo.setItem(SLOT(q.id), VARSAYILAN()); }
  const q = dz.liste.reduce((a, b) => b.degisti > a.degisti ? b : a);
  depo.setItem(ANAHTAR, depo.getItem(SLOT(q.id)) ?? VARSAYILAN()); depo.removeItem(SLOT(q.id)); dz.aktif = q.id;
  return true;
}
export const projeSil = (depo, id) => degistir(depo, dz => { const p = bul(dz, id); if (p?.surum && !dz.silinecek.includes(id)) dz.silinecek.push(id); return kaldir(depo, dz, id); });

// ── Eşitleme. api: { liste() → [{ id, ad, surum, degisti, durum }], yaz(id, { ad, durum, surum }) → { surum, degisti } | { cakisma: kayit },
// sil(id) }. Dönüş { aktif: 'yeni' (aktif projenin içeriği sunucudan geldi) | 'gitti' (aktif başka cihazda silindi) | null }.
function al(depo, id, k, zorla = false) { // sunucudaki kaydı yerele yazar; yerelde gönderilmemiş değişiklik varsa (zorla değilse) dokunmaz
  return degistir(depo, dz => {
    let p = bul(dz, id);
    if (p?.kirli && !zorla) return false;
    if (!p) dz.liste.push(p = { id, kirli: 0 });
    Object.assign(p, { ad: adTemiz(k.ad), surum: Math.max(1, +k.surum || 0), degisti: +k.degisti || Date.now(), kirli: 0 });
    durumYaz(depo, dz, id, normal(k.durum));
    return id === dz.aktif;
  });
}
async function gonder(depo, api, id) {
  const dz = dizinOku(depo), p = bul(dz, id); if (!p) return null;
  const metin = durumOku(depo, dz, id), r0 = p.kirli;
  const r = await api.yaz(id, { ad: p.ad, durum: JSON.parse(metin), surum: p.surum });
  if (r?.cakisma) {
    const k = r.cakisma;
    if (adTemiz(k.ad) === p.ad && normal(k.durum) === normal(metin)) { // içerik aynı (yanıtı kaybolmuş yazım ya da keepalive): sürümü al
      degistir(depo, dz => { const q = bul(dz, id); if (q) { q.surum = +k.surum; q.degisti = +k.degisti || q.degisti; if (q.kirli === r0) q.kirli = 0; } });
      return null;
    }
    // Gerçek çakışma: bu cihazdaki hâl ayrı proje olur (sonra gönderilir), asıl proje sunucudakini alır
    degistir(depo, dz => { const q = { ...kayit(`${p.ad} (bu cihazdaki)`), kirli: 1 }; depo.setItem(SLOT(q.id), metin); dz.liste.push(q); });
    return al(depo, id, k, true) ? 'yeni' : null;
  }
  degistir(depo, dz => { const q = bul(dz, id); if (q) { q.surum = +r.surum; q.degisti = +r.degisti || q.degisti; if (q.kirli === r0) q.kirli = 0; } });
  return null;
}
// Başka hesaba geçildi: bu tarayıcıdaki projeler yeni kimlikle yeni hesaba gönderilir, öncekinin sunucudaki kopyaları orada kalır.
// (Kimlik değişmezse yeni hesap onları "başka cihazda silinmiş" sanıp buradan silerdi, ya da sunucu başkasının diye reddederdi.)
// Kimliksiz eski dizin hâlâ girişliyse aynı hesap sayılır.
export const hesabaGec = (depo, hid) => degistir(depo, dz => {
  const once = dz.hesapId ?? (dz.hesap ? hid : null); dz.hesapId = hid;
  if (once === hid) return false;
  dz.silinecek = [];
  for (const p of dz.liste) {
    const y = yeniId();
    if (p.id === dz.aktif) dz.aktif = y; else { depo.setItem(SLOT(y), depo.getItem(SLOT(p.id)) ?? VARSAYILAN()); depo.removeItem(SLOT(p.id)); }
    Object.assign(p, { id: y, surum: 0, kirli: 1 });
  }
  return true;
});

// Kendiliğinden açılmış, dokunulmamış örnek proje ("Proje N", varsayılan içerik): hesapta proje varsa yüklenmez, yerine hesaptakiler gelir
const bos = (depo, dz, p) => !p.surum && /^Proje \d+$/.test(p.ad) && normal(durumOku(depo, dz, p.id)) === normal(VARSAYILAN());
export async function esitle(depo, api) {
  let aktif = null;
  const yeni = sonuc => { if (sonuc && aktif !== 'gitti') aktif = sonuc; };
  for (const id of dizinOku(depo).silinecek) { await api.sil(id); degistir(depo, dz => { dz.silinecek = dz.silinecek.filter(x => x !== id); }); }
  const uzak = new Map((await api.liste()).filter(k => ID.test(k?.id)).map(k => [k.id, k]));
  const yerel = dizinOku(depo).liste.map(p => p.id), bakilan = new Set(yerel);
  for (const k of uzak.values()) if (!bakilan.has(k.id)) al(depo, k.id, k); // başka cihazda açılmış projeler (önce: aşağıda silinen aktifin yerine geçebilsin)
  for (const id of yerel) {
    const dz = dizinOku(depo), p = bul(dz, id), k = uzak.get(id);
    if (!p || dz.silinecek.includes(id)) continue; // bu arada silindi
    if (!k && (p.surum && !p.kirli || uzak.size && bos(depo, dz, p))) { if (degistir(depo, d => kaldir(depo, d, id))) aktif = 'gitti'; } // başka cihazda silinmiş ya da boş örnek
    else if (!k || p.kirli || !p.surum) yeni(await gonder(depo, api, id)); // yeni, değişmiş ya da başka cihazda silinmişken burada değişmiş
    else if (+k.surum !== p.surum) yeni(al(depo, id, k) && 'yeni');
  }
  for (const p of dizinOku(depo).liste) if (!bakilan.has(p.id) && (p.kirli || !p.surum)) yeni(await gonder(depo, api, p.id)); // çakışma kopyası, bu arada açılan
  return { aktif };
}

// ── Sunucu (aynı kök, oturum çerezi). /api/ben girişsizken 200 { id: null }; sunucu yoksa (yerel geliştirme) 404: giriş gösterilmez.
const istek = async (yol, ek = {}) => {
  const r = await fetch(`/api/${yol}`, { credentials: 'same-origin', cache: 'no-store', ...ek, headers: { 'X-Kesit': '1', ...ek.headers } });
  if (r.status === 401) throw Object.assign(new Error('giriş gerekli'), { giris: true });
  return r;
};
const api = {
  liste: async () => { const r = await istek('projeler'); if (!r.ok) throw new Error(`projeler ${r.status}`); return r.json(); },
  yaz: async (id, govde) => {
    const r = await istek(`projeler/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
    if (r.status === 409) return { cakisma: (await r.json()).kayit };
    if (!r.ok) throw new Error(`yaz ${r.status}`); return r.json();
  },
  sil: async id => { const r = await istek(`projeler/${id}`, { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw new Error(`sil ${r.status}`); },
};

export const projeAdi = (depo = globalThis.localStorage) => { try { const dz = dizinOku(depo); return bul(dz, dz.aktif).ad; } catch { return ''; } };

// ── Panel: [data-proje] yerine düğme + açılır pencere (tema.js ile aynı popover dili)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zaman = t => t ? new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const SIMGE = {
  klasor: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.75 4.25V12.5h12.5V5.75H7.5L6 4.25z"/></svg>',
  ok: '<svg class="proje-ok" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>',
  ad: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>',
  kopya: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 3V2.5h-8v8H3"/></svg>',
  sil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.75 9h6.5l.75-9"/></svg>',
};

function kur(yer, depo = localStorage) {
  dizinYaz(depo, dizinOku(depo)); // ilk açılışta kimlik sabitlensin
  yer.className = 'proje';
  yer.innerHTML = `<button type="button" class="proje-dugme" popovertarget="proje-panel" aria-haspopup="dialog">${SIMGE.klasor}<span class="proje-ad"></span><i class="proje-isaret" aria-hidden="true"></i>${SIMGE.ok}</button>
    <div class="proje-panel" id="proje-panel" popover role="dialog" aria-labelledby="proje-baslik">
      <div class="proje-bas"><h2 id="proje-baslik">Projeler</h2><button type="button" class="proje-k proje-yeni-ac">Yeni proje</button></div>
      <form class="proje-yeni" hidden><input name="ad" maxlength="80" placeholder="Proje adı" aria-label="Yeni projenin adı" autocomplete="off" required><button class="proje-k ana">Oluştur</button></form>
      <ul class="proje-liste"></ul>
      <div class="proje-hesap"><p role="status"></p><button type="button" class="proje-k proje-giris" hidden></button></div>
    </div>`;
  const $ = s => yer.querySelector(s), dugme = $('.proje-dugme'), panel = $('.proje-panel'), listeEl = $('.proje-liste'), yeniForm = $('.proje-yeni');
  let hesap = 'bekle', ad = '', zaman0 = 0, gonderZaman = 0, duzenlenen = null;
  const girisli = () => hesap === 'giris' || (hesap === 'baglanti' && !!dizinOku(depo).hesap);
  const durumYazi = p => !girisli() ? '' : p.kirli || !p.surum ? (hesap === 'giris' && !p.surum ? 'yalnız bu cihazda' : 'gönderilmeyi bekliyor') : 'eşitlendi';

  function ciz() {
    const dz = dizinOku(depo), a = bul(dz, dz.aktif), d = durumYazi(a);
    $('.proje-ad').textContent = a.ad;
    dugme.title = `Proje: ${a.ad}${d ? ` · ${d}` : ''}`; dugme.setAttribute('aria-label', `Proje: ${a.ad}${d ? `, ${d}` : ''}. Projeler`);
    $('.proje-isaret').dataset.durum = !d ? '' : d === 'eşitlendi' ? 'esit' : 'bekliyor';
    if (!panel.matches(':popover-open')) return;
    if (duzenlenen && !bul(dz, duzenlenen)) duzenlenen = null; // düzenlenirken başka yerde silindi
    const yaziliyor = duzenlenen && listeEl.querySelector('.proje-adform'); // ad yazılırken liste yeniden çizilmez (yazılan kaybolmasın)
    if (!yaziliyor) listeEl.innerHTML = [...dz.liste].sort((x, y) => (y.id === dz.aktif) - (x.id === dz.aktif) || y.degisti - x.degisti).map(p => {
      const ust = p.id === dz.aktif, alt = [ust ? 'açık' : '', zaman(p.degisti), durumYazi(p)].filter(Boolean).join(' · ');
      return `<li data-id="${p.id}"${ust ? ' aria-current="true"' : ''}>${duzenlenen === p.id
        ? `<form class="proje-adform"><input name="ad" maxlength="80" value="${esc(p.ad)}" aria-label="Yeni ad" autocomplete="off" required><button class="proje-k">Kaydet</button></form>`
        : `<button type="button" class="proje-sec"${ust ? ' aria-disabled="true"' : ''}><b>${esc(p.ad)}</b><small>${esc(alt)}</small></button>
        <button type="button" class="proje-islem" data-islem="ad" aria-label="Yeniden adlandır: ${esc(p.ad)}" title="Yeniden adlandır">${SIMGE.ad}</button>
        <button type="button" class="proje-islem" data-islem="kopya" aria-label="Çoğalt: ${esc(p.ad)}" title="Çoğalt">${SIMGE.kopya}</button>
        <button type="button" class="proje-islem" data-islem="sil" aria-label="Sil: ${esc(p.ad)}" title="Sil">${SIMGE.sil}</button>`}</li>`;
    }).join('');
    const g = $('.proje-giris'), y = $('.proje-hesap p');
    y.innerHTML = hesap === 'giris' ? `<b>${esc(ad)}</b> · projeler hesabında, her cihazda aynı.`
      : hesap === 'cikis' ? 'Projeler yalnız bu tarayıcıda. Giriş yaparsan hesabında saklanır, her cihazda görünür.'
      : hesap === 'baglanti' ? (girisli() ? 'Bağlantı yok. Çalışmaya devam et, değişiklikler bağlanınca gönderilir.' : 'Sunucuya ulaşılamadı. Projeler bu tarayıcıda saklanıyor.')
      : hesap === 'bekle' ? 'Hesap denetleniyor…' : 'Projeler bu tarayıcıda saklanır.';
    g.hidden = hesap !== 'giris' && hesap !== 'cikis'; g.textContent = hesap === 'giris' ? 'Çıkış' : 'Giriş yap';
    if (duzenlenen && !yaziliyor) { const i = listeEl.querySelector('.proje-adform input'); i.focus(); i.select(); }
  }
  const yenidenYukle = () => { clearTimeout(gonderZaman); gonderZaman = 0; location.reload(); }; // proje değişince sayfa temiz açılsın (seçim, geri al, 3B); bekleyen gönderim yeni açılışta

  // Eşitleme: sekmeler arasında tek seferde bir (navigator.locks); 401 → çıkış, ağ hatası → bağlantı yok
  const kilit = f => navigator.locks?.request ? navigator.locks.request('kesit-esitle', f) : f();
  async function esitleSimdi() {
    clearTimeout(gonderZaman); gonderZaman = 0;
    if (hesap !== 'giris' && hesap !== 'baglanti') return;
    try {
      const { aktif } = await kilit(() => esitle(depo, api));
      if (hesap === 'baglanti') { hesap = 'giris'; }
      zaman0 = Date.now();
      if (aktif === 'gitti') return yenidenYukle();
      if (aktif === 'yeni') dispatchEvent(new StorageEvent('storage', { key: ANAHTAR })); // sayfalar başka sekmedeki değişiklik gibi okur
    } catch (e) {
      if (e.giris) { hesap = 'cikis'; degistir(depo, dz => { dz.hesap = null; }); } else { hesap = 'baglanti'; console.warn('Eşitlenemedi:', e); }
    }
    ciz();
  }
  async function hesapBak() {
    try {
      const r = await fetch('/api/ben', { credentials: 'same-origin', cache: 'no-store' });
      const j = r.ok && /json/.test(r.headers.get('content-type') ?? '') ? await r.json() : null;
      if (j?.id) { hesap = 'giris'; ad = adTemiz(j.ad || j.id); hesabaGec(depo, String(j.id)); degistir(depo, dz => { dz.hesap = { ad }; }); return esitleSimdi(); }
      hesap = j && 'id' in j || r.status === 401 ? 'cikis' : 'yok'; // girişsiz: 200 { id: null }
      if (hesap === 'cikis') degistir(depo, dz => { dz.hesap = null; });
    } catch { hesap = 'baglanti'; ad = dizinOku(depo).hesap?.ad ?? ''; }
    ciz();
  }

  // Sayfa değişikliği (durumKaydet) → aktif kirli, 2 sn durunca gönder
  addEventListener('kesit-kayit', () => {
    yerelDegisti(depo); ciz();
    if (hesap === 'giris') { clearTimeout(gonderZaman); gonderZaman = setTimeout(esitleSimdi, 2000); }
  });
  addEventListener('online', () => { if (hesap === 'baglanti') hesapBak(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && hesap === 'giris' && Date.now() - zaman0 > 5000) esitleSimdi(); });
  // Sayfadan çıkarken bekleyen gönderim: yanıt okunamaz; sonraki eşitleme sürümü aynı içerikten tanır (409 → aynı)
  addEventListener('pagehide', () => {
    if (!gonderZaman || hesap !== 'giris') return;
    const dz = dizinOku(depo), p = bul(dz, dz.aktif);
    fetch(`/api/projeler/${p.id}`, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Kesit': '1' },
      body: JSON.stringify({ ad: p.ad, durum: JSON.parse(durumOku(depo, dz, p.id)), surum: p.surum }) }).catch(() => {});
  });
  addEventListener('storage', e => { if (e.key === DIZIN) ciz(); });

  // Açılır pencere düğmenin altında, sol kenarı hizalı; ekrandan taşmaz
  function yerlestir() {
    const r = dugme.getBoundingClientRect(), w = Math.min(24 * parseFloat(getComputedStyle(document.documentElement).fontSize), innerWidth - 16); // proje.css: min(24rem, 100vw - 16px)
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  }
  panel.addEventListener('beforetoggle', e => { if (e.newState === 'open') { duzenlenen = null; yeniForm.hidden = true; requestAnimationFrame(() => { ciz(); yerlestir(); }); } });
  panel.addEventListener('toggle', e => { if (e.newState === 'open') { ciz(); yerlestir(); $('.proje-yeni-ac').focus(); if (hesap === 'giris' && Date.now() - zaman0 > 5000) esitleSimdi(); } });
  addEventListener('resize', () => { if (panel.matches(':popover-open')) yerlestir(); });

  $('.proje-yeni-ac').addEventListener('click', () => { yeniForm.hidden = !yeniForm.hidden; if (!yeniForm.hidden) { yeniForm.ad.value = ''; yeniForm.ad.focus(); } });
  yeniForm.addEventListener('submit', e => { e.preventDefault(); const id = yeniProje(depo, yeniForm.ad.value); projeAc(depo, id); yenidenYukle(); });
  yeniForm.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); yeniForm.hidden = true; $('.proje-yeni-ac').focus(); } });
  listeEl.addEventListener('submit', e => { e.preventDefault(); const id = e.target.closest('li').dataset.id; yenidenAdlandir(depo, id, e.target.ad.value); duzenlenen = null; ciz(); esitleGecikmeli();
    listeEl.querySelector(`[data-id="${id}"] [data-islem=ad]`)?.focus(); });
  listeEl.addEventListener('keydown', e => { if (e.key === 'Escape' && duzenlenen) { const id = duzenlenen; e.preventDefault(); e.stopPropagation(); duzenlenen = null; ciz();
    listeEl.querySelector(`[data-id="${id}"] [data-islem=ad]`)?.focus(); } });
  listeEl.addEventListener('click', e => {
    const b = e.target.closest('button:not([type=submit]):not(.proje-k)'), id = b?.closest('li')?.dataset.id; if (!id) return;
    const dz = dizinOku(depo), p = bul(dz, id);
    if (b.classList.contains('proje-sec')) { if (projeAc(depo, id)) yenidenYukle(); return; }
    const islem = b.dataset.islem;
    if (islem === 'ad') { duzenlenen = id; ciz(); }
    else if (islem === 'kopya') { cogalt(depo, id); ciz(); esitleGecikmeli(); }
    else if (islem === 'sil' && confirm(`«${p.ad}» silinsin mi?${girisli() && p.surum ? ' Hesabından da silinir.' : ''} Bu geri alınamaz.`)) {
      if (projeSil(depo, id)) return yenidenYukle();
      ciz(); esitleGecikmeli();
    }
  });
  const esitleGecikmeli = () => { if (hesap === 'giris') { clearTimeout(gonderZaman); gonderZaman = setTimeout(esitleSimdi, 800); } };
  $('.proje-giris').addEventListener('click', () => {
    const donus = encodeURIComponent(location.pathname + location.search + location.hash);
    if (hesap === 'giris') { degistir(depo, dz => { dz.hesap = null; }); location.href = `/api/cikis?donus=${donus}`; }
    else location.href = `/giris.html?donus=${donus}`;
  });
  ciz(); hesapBak();
}
const yer = globalThis.document?.querySelector('[data-proje]');
if (yer && 'popover' in HTMLElement.prototype) kur(yer);
