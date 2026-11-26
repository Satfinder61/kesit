// Döşemeden temele sayfası: girdi → zincirHesap → kat planı, Excel tarzı sayfalar, ayrıntı.
// Proje durumu, sayfalar (Girdiler dahil), hücre düzenleme ve Excel'e aktarma calisma.js'te (tablo.html de kullanır).
import { perdeOku, perdeAciklik, perdeBirlestir, perdeYaz } from './perde.js';
import { tr, simge, HARF, TUR_AD, ALANLAR, ANAHTAR, SECENEK, SAYFALAR, kitapKur, sekmeOk, girdiYaz, kullanimNot, tabloHtml, girdiOzet, durumYukle, excelIndir, aksKaymaSiniri, yerlesimKaydir } from './calisma.js';

const $ = s => document.querySelector(s);
const f = $('#f');
const olc = x => x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAN_BASLIK = { doseme: 'Kat planı · döşeme', kiris: 'Kat planı · kirişler', kolon: 'Kat planı · kolonlar ve perdeler', temel: 'Temel planı · radye' };
const FORM = { katSayisi: 'kat', gKaplama: 'g', perdeBoyOzel: 'perdeler' };
const ISARET = { dosemeDuvar: 'duvar', yanalTutulu: 'tutulu' }; // onay kutusu → durum alanı

// Seçenekler (TS 498 Çizelge 7 kullanımları, duvar türleri) calisma.js'ten; değerleri durumdan formaYaz koyar
for (const a of ['beton', 'celik', 'kullanim', 'duvarDisTur', 'duvarIcTur']) f[a].innerHTML = SECENEK[a].map(([v, y]) => `<option value="${v}">${y}</option>`).join('');
const duvarGoster = () => { $('#duvarDis-alan').hidden = f.duvarDisTur.value !== 'elle'; $('#duvarIc-alan').hidden = f.duvarIcTur.value !== 'elle'; };
// Durum → form (Girdiler sayfasından yazılınca ya da başka sekmede değişince); keys verilmezse hepsi
const formaYaz = (keys = [...ALANLAR, 'duvar', 'tutulu']) => { for (const k of keys) {
  if (k === 'duvar') f.dosemeDuvar.checked = K.d.duvar; else if (k === 'tutulu') f.yanalTutulu.checked = K.d.tutulu;
  else if (f[k] && f[k].value !== K.d.form[k]) f[k].value = K.d.form[k]; } };

let adim = 'doseme', perdeMod = false, yerlesimMod = false, subasmanMod = false;
const yerlesim = $('#yerlesim'), yerlesimDugme = $('#yerlesim-dugme'), yerlesimEleman = $('#yerlesim-eleman');
const kaydirma = { ax: $('#yerlesim-x'), ay: $('#yerlesim-y') };
let yerlesimImza = '';
const sayfa = $('#sayfa');
const K = kitapKur({ sayfa, kap: $('.kap'), sekmeler: [$('.sekmeler-alt')], ad: $('#ad-kutusu'), formul: $('#formul'), durumSol: $('#durum-sol'), durumSag: $('#durum-sag'),
  ayrinti: $('#ayrinti'), ayrintiBaslik: $('#ayrinti-baslik'), ayrintiNot: $('#ayrinti-not'), iz: $('#iz') },
  { yenile: () => hesapla(), secildi: () => planSecim(), katDegisti: () => { ozetCiz(); ciz(); }, girdiYazildi: (k, ek) => formaYaz([k, ...ek]) });
K.sayfaAd = 'doseme';

const aciklikAnahtar = a => `${a.yon}:${a.no}:${a.k}`;
const acikliklar = alan => perdeAciklik(perdeOku(K.d.form[alan]).liste);
const ONEK = { D: 'doseme', K: 'kiris', S: 'kolon', P: 'perde', Z: 'zimbD', T: 'radyeZ' }; // plan öğesi ön eki → sayfa (RP…: radye perde satırı)

// Hesap ve kayıt kitapta (K.hesap: X aks sayısı yazılırken eski kolon adları kaymaz); burada form, adımlar ve çizim
function hesapla() {
  K.hesap();
  const F = K.d.form, hata = K.hata;
  $('#dis-alanlari').hidden = !(F.dosemeTuru === 'disli' || F.dosemeTuru === 'kaset');
  duvarGoster(); $('#kullanim-not').textContent = kullanimNot(F);
  for (const k of ALANLAR) f[k].removeAttribute('aria-invalid');
  for (const k of Object.keys(hata)) f[FORM[k] ?? k]?.setAttribute('aria-invalid', 'true');
  const var_ = Object.keys(hata).length > 0, hataYazi = var_ ? `<b>Girdi hatası.</b> ${Object.values(hata).map(simge).join(' · ')}` : '';
  $('#hata').hidden = !var_;
  if ($('#hata').innerHTML !== hataYazi) $('#hata').innerHTML = hataYazi; // role=alert: her tuşta yeniden okunmasın
  $('.adimlar [data-adim="kiris"]').disabled = F.dosemeTuru === 'kirissiz';
  $('.lejant span').hidden = F.dosemeTuru === 'kirissiz'; // kirişsizde plan lejantında kiriş yok
  $('#lejant-perde').hidden = !K.sonuc?.perdeler.length;
  $('#subasman-dugme').disabled = !K.sonuc && !subasmanMod;
  if (!K.gorunur().some(s => s.ad === K.sayfaAd)) { // ör. Kiriş adımındayken kirişsiz seçildi: aynı adımın başka sayfası, yoksa döşeme
    K.sayfaAd = K.gorunur().find(s => s.adim === adim)?.ad ?? 'doseme'; adim = K.aktif().adim ?? adim; adimCiz();
  }
  ozetCiz(); ciz();
}
function adimCiz() {
  for (const b of document.querySelectorAll('.adimlar [data-adim]')) {
    const on = b.dataset.adim === adim;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
  }
  $('#plan-baslik').textContent = PLAN_BASLIK[adim];
  const pd = $('#perde-dugme'); pd.hidden = !['kiris', 'kolon'].includes(adim);
  if (pd.hidden) { perdeMod = false; yerlesimMod = false; }
  yerlesimDugme.hidden = pd.hidden;
  yerlesimDugme.setAttribute('aria-expanded', yerlesimMod);
  pd.setAttribute('aria-pressed', perdeMod);
  const sb = $('#subasman-dugme');
  sb.hidden = adim !== 'temel';
  if (sb.hidden) subasmanMod = false;
  sb.disabled = !K.sonuc && !subasmanMod;
  sb.setAttribute('aria-pressed', subasmanMod);
  const ipucu = $('#perde-mod-ipucu');
  ipucu.hidden = !perdeMod && !subasmanMod;
  ipucu.textContent = 'Açıklığa tıkla · Esc bitir';
}
const ciz = () => { $('#plan-baslik').textContent = `${K.sonuc?.aktifKat && adim !== 'temel' ? `${K.sonuc.aktifKat}. kat · ` : ''}${PLAN_BASLIK[adim]}`; K.sekmeCiz(); yerlesimCiz(); planCiz(); K.sayfaCiz(); K.durumCiz(); K.secimCiz(); };

function ozetCiz() {
  const sonuc = K.sonuc;
  for (const a of ['doseme', 'kiris', 'kolon', 'temel']) {
    const el = $('#ozet-' + a);
    if (!sonuc) { el.textContent = '—'; el.classList.remove('degil'); continue; }
    const bad = K.gorunur().filter(s => s.adim === a && !s.yuk).flatMap(s => s.dizi(sonuc)).filter(e => !e.gecti).length;
    const yok = a === 'kiris' && sonuc.tur === 'kirissiz';
    const elle = x => x ? ' (elle)' : ''; // hücreye yazılan değer
    el.textContent = (a === 'doseme' ? `${TUR_AD[sonuc.tur]} h = ${sonuc.h} mm${elle(sonuc.dosemeler[0]?.ozel?.h)}` : yok ? 'kirişsiz döşeme: kiriş yok'
      : a === 'kiris' ? `${sonuc.kirisler.length} kiriş` : a === 'kolon' ? `${sonuc.kolonlar.length} kolon${sonuc.perdeler.length ? `, ${sonuc.perdeler.length} perde` : ''}` : `radye h = ${sonuc.radye.h} mm${elle(sonuc.radye.ozel?.h)}`)
      + (yok ? '' : ` · ${bad ? bad + ' uygun değil' : 'tümü uygun'}`);
    el.classList.toggle('degil', bad > 0);
  }
  $('#notlar').innerHTML = (sonuc?.notlar ?? []).map(n => `<li>${simge(n)}</li>`).join('');
}

// ── Kat planı (SVG, Y aksı yukarı). Temel adımında radye taşması kadar dış pay bırakılır.
function planCiz() {
  const svg = $('#plan'), sonuc = K.sonuc;
  svg.dataset.adim = adim;
  svg.toggleAttribute('data-perde', perdeMod || subasmanMod);
  $('#lejant-subasman').hidden = adim !== 'temel' || !sonuc?.subasmanlar?.length;
  svg.toggleAttribute('data-yerlesim', yerlesimMod);
  if (!sonuc) { svg.innerHTML = ''; svg.removeAttribute('viewBox'); return; }
  const { ag } = sonuc, W = ag.xs.at(-1), Hh = ag.ys.at(-1), a = adim === 'temel' ? sonuc.radye.a : 0;
  const pay = Math.max(a, ...sonuc.perdeler.map(p => Math.max(p.bw / 2000, (p.lw / 1000 - p.L) / 2)));
  const gen = Math.max(320, svg.clientWidth || 760);
  const s = Math.min((gen - 178) / (W + 2 * pay), Math.max(260, gen * .55) / (Hh + 2 * pay)), as = pay * s;
  const ox = 72 + as, oy = 50 + as;
  svg.setAttribute('viewBox', `0 0 ${((W + 2 * pay) * s + 178).toFixed(1)} ${((Hh + 2 * pay) * s + 116).toFixed(1)}`);
  const X = x => ox + x * s, Y = y => oy + (Hh - y) * s, mm = (v, en = 3) => Math.max(en, v / 1000 * s);
  const r = (cx, cy, w, h) => `x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"`;
  const durum = (e, sayfalar) => e && sayfalar.includes(K.sayfaAd) && !e.gecti ? ' degil' : '';
  let h = '';
  ag.xs.forEach((x, i) => { h += `<line class="aks" data-aks="ax:${i}" x1="${X(x)}" y1="${oy - 20 - as}" x2="${X(x)}" y2="${Y(0) + 16 + as}"/><g class="balon"><circle cx="${X(x)}" cy="${oy - 32 - as}" r="11"/><text x="${X(x)}" y="${oy - 32 - as}">${i + 1}</text></g>`; });
  ag.ys.forEach((y, j) => { h += `<line class="aks" data-aks="ay:${j}" x1="${ox - 20 - as}" y1="${Y(y)}" x2="${X(W) + 16 + as}" y2="${Y(y)}"/><g class="balon"><circle cx="${ox - 32 - as}" cy="${Y(y)}" r="11"/><text x="${ox - 32 - as}" y="${Y(y)}">${HARF[j]}</text></g>`; });
  const zx = Y(0) + 40 + as, zy = X(W) + 56 + as;
  h += `<line class="olcu-cizgi" x1="${X(0)}" y1="${zx}" x2="${X(W)}" y2="${zx}"/>` + ag.xs.map(x => `<path class="olcu-cizgi" d="M${X(x) - 4} ${zx + 4}l8 -8"/>`).join('') +
    ag.ax.map((v, i) => `<text x="${(X(ag.xs[i]) + X(ag.xs[i + 1])) / 2}" y="${zx - 6}" text-anchor="middle">${olc(v)}</text>`).join('');
  h += `<line class="olcu-cizgi" x1="${zy}" y1="${Y(0)}" x2="${zy}" y2="${Y(Hh)}"/>` + ag.ys.map(y => `<path class="olcu-cizgi" d="M${zy - 4} ${Y(y) + 4}l8 -8"/>`).join('') +
    ag.ay.map((v, j) => `<text x="${zy + 8}" y="${(Y(ag.ys[j]) + Y(ag.ys[j + 1])) / 2}" dominant-baseline="central">${olc(v)}</text>`).join('');
  if (adim === 'temel') {
    const rd = sonuc.radye;
    h += `<rect class="temel${durum(rd, ['radye'])}" data-ad="Radye" x="${X(-a)}" y="${Y(Hh + a)}" width="${(W + 2 * a) * s}" height="${(Hh + 2 * a) * s}"/>`;
    h += `<text class="etiket" x="${X(-a)}" y="${Y(-a) + 16}">Radye h = ${rd.h} mm · ${tr(rd.Bx)} × ${tr(rd.By)} m</text>`;
  }
  // Döşemeler: dişli = diş çizgileri, kaset = ızgara, plak = 45° yük çizgileri ya da tek doğrultu oku
  const ic = mm(sonuc.kirisler[0]?.b ?? 0, 0) / 2 + 1;
  for (const d of sonuc.dosemeler) {
    const x0 = X(ag.xs[d.i]), x1 = X(ag.xs[d.i + 1]), y0 = Y(ag.ys[d.j]), y1 = Y(ag.ys[d.j + 1]), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    h += `<rect class="pano${durum(d, ['doseme'])}" data-ad="${d.ad}" x="${x0 + ic}" y="${y1 + ic}" width="${Math.max(0, x1 - x0 - 2 * ic)}" height="${Math.max(0, y0 - y1 - 2 * ic)}"/>`;
    if (adim !== 'doseme') continue;
    const aa = Math.min(x1 - x0, y0 - y1) / 2, yatay = k => `<line class="kirk5" x1="${x0 + ic}" y1="${y1 + (y0 - y1) * k}" x2="${x1 - ic}" y2="${y1 + (y0 - y1) * k}"/>`,
      dusey = k => `<line class="kirk5" x1="${x0 + (x1 - x0) * k}" y1="${y1 + ic}" x2="${x0 + (x1 - x0) * k}" y2="${y0 - ic}"/>`;
    if (sonuc.tur === 'disli') for (let k = 1; k < 7; k++) h += d.durum.includes('X') ? yatay(k / 7) : dusey(k / 7);
    else if (sonuc.tur === 'kaset') for (let k = 1; k < 6; k++) h += yatay(k / 6) + dusey(k / 6);
    else if (sonuc.tur === 'plak' && d.bir) {
      const L = aa * .9;
      h += d.lx < d.ly ? `<path class="yon" d="M${cx - L} ${cy + 16}h${2 * L}M${cx - L + 6} ${cy + 12}l-6 4 6 4M${cx + L - 6} ${cy + 12}l6 4 -6 4"/>`
        : `<path class="yon" d="M${cx + 20} ${cy - L}v${2 * L}M${cx + 16} ${cy - L + 6}l4 -6 4 6M${cx + 16} ${cy + L - 6}l4 6 4 -6"/>`;
    } else if (sonuc.tur === 'plak') {
      h += x1 - x0 >= y0 - y1 ? `<path class="kirk5" d="M${x0} ${y0}L${x0 + aa} ${cy}L${x0} ${y1}M${x0 + aa} ${cy}H${x1 - aa}M${x1} ${y0}L${x1 - aa} ${cy}L${x1} ${y1}"/>`
        : `<path class="kirk5" d="M${x0} ${y0}L${cx} ${y0 - aa}L${x1} ${y0}M${cx} ${y0 - aa}V${y1 + aa}M${x0} ${y1}L${cx} ${y1 + aa}L${x1} ${y1}"/>`;
    }
    h += `<text class="etiket" x="${cx}" y="${cy - 4}" text-anchor="middle">${d.ad}</text><text class="alt-etiket" x="${cx}" y="${cy + 9}" text-anchor="middle">h ${tr(d.h, 0)}</text>`;
  }
  for (const k of sonuc.kirisler) {
    const hat = ag.hatlar[k.hat], bw = mm(k.b);
    const [cx, cy, w, hh] = hat.yon === 'x'
      ? [(X(ag.xs[k.k]) + X(ag.xs[k.k + 1])) / 2, Y(ag.ys[hat.no]), k.L * s, bw]
      : [X(ag.xs[hat.no]), (Y(ag.ys[k.k]) + Y(ag.ys[k.k + 1])) / 2, bw, k.L * s];
    h += `<rect class="kiris${durum(k, ['kiris'])}" data-ad="${k.ad}" ${r(cx, cy, w, hh)}/>`;
    if (adim === 'kiris') h += hat.yon === 'x' ? `<text class="alt-etiket" x="${cx}" y="${cy - bw / 2 - 4}" text-anchor="middle">${k.ad} ${k.b}×${k.h}</text>`
      : `<text class="alt-etiket" x="${cx + bw / 2 + 10}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${cx + bw / 2 + 10} ${cy})">${k.ad} ${k.b}×${k.h}</text>`;
  }
  // Perdeler: aks boyunca gerçek toplam uzunlukta taralı dikdörtgen; Perde satırına (P), temelde radye perde satırına (RP) bağlanır
  h += '<defs>' + ['tarama', 'tarama-k'].map(id => `<pattern id="${id}" class="tarama${id.endsWith('k') ? ' k' : ''}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5"/><line x1="0" y1="0" x2="0" y2="5"/></pattern>`).join('') + '</defs>';
  for (const p of sonuc.perdeler) {
    const hat = ag.hatlar[p.hi], t = mm(p.bw, 6), boy = p.lw / 1000 * s, ad = adim === 'temel' ? 'R' + p.ad : p.ad;
    const [cx, cy, w, hh] = hat.yon === 'x' ? [(X(ag.xs[p.k0]) + X(ag.xs[p.k1 + 1])) / 2, Y(ag.ys[hat.no]), boy, t] : [X(ag.xs[hat.no]), (Y(ag.ys[p.k0]) + Y(ag.ys[p.k1 + 1])) / 2, t, boy];
    const kotu = adim === 'temel' ? durum(sonuc.radyePerde.find(x => x.perde === p.ad), ['radye']) : durum(p, ['perde', 'kolon']);
    h += `<rect class="perde${kotu}" data-ad="${ad}" ${r(cx, cy, w, hh)}><title>${ad} · uzunluk ${tr(p.lw, 3)} mm${p.kismi ? ' · kısmi perde' : ''}</title></rect>`;
    if (adim === 'doseme') continue;
    const yazi = `${ad}${adim === 'kolon' ? ` · ${p.bw}` : ''}`;
    h += hat.yon === 'x' ? `<text class="etiket" x="${cx}" y="${cy - t / 2 - 5}" text-anchor="middle">${yazi}</text>`
      : `<text class="etiket" x="${cx + t / 2 + 12}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${cx + t / 2 + 12} ${cy})">${yazi}</text>`;
  }
  if (adim === 'temel') for (const p of sonuc.subasmanlar ?? []) {
    if (!(p.L > 0)) continue;
    const t = mm(p.bw, 6), boy = p.L * s, orta = (p.bas + p.son) / 2;
    const [cx, cy, w, hh] = p.yon === 'x' ? [X(orta), Y(ag.ys[p.no]), boy, t] : [X(ag.xs[p.no]), Y(orta), t, boy];
    h += `<rect class="subasman${durum(p, ['subasman'])}" data-ad="${p.ad}" ${r(cx, cy, w, hh)}><title>${p.ad} · su basman · net boy ${tr(p.L, 3)} m</title></rect>`;
    h += `<text class="etiket" x="${p.yon === 'x' ? cx : cx + t / 2 + 7}" y="${p.yon === 'x' ? cy - t / 2 - 5 : cy}" text-anchor="${p.yon === 'x' ? 'middle' : 'start'}">${p.ad}</text>`;
  }
  // Kolonlar: temelde radye zımbalama satırına (T), kirişsiz döşemede döşeme zımbalama satırına (Z) bağlanır
  const zimbOnek = adim === 'temel' ? 'T' : adim === 'doseme' && sonuc.tur === 'kirissiz' ? 'Z' : null;
  for (const c of sonuc.kolonlar) {
    const k = ag.kolonlar.find(x => x.ad === c.ad), w = mm(c.b, 6), hh = mm(c.h, 6);
    const ad = zimbOnek ? c.ad.replace('S', zimbOnek) : c.ad;
    const z = zimbOnek === 'T' ? sonuc.radyeZimb.find(t => t.ad === ad) : zimbOnek === 'Z' ? sonuc.zimbD.find(t => t.ad === ad) : c;
    h += `<rect class="kolon${durum(z, ['kolon', 'radyeZ', 'zimbD'])}" data-ad="${ad}" ${r(X(k.x), Y(k.y), w, hh)}/>`;
    if (adim === 'kolon' || adim === 'temel') h += `<text class="etiket" x="${X(k.x) + w / 2 + 4}" y="${Y(k.y) - hh / 2 - 4}">${ad}</text>`;
    if (adim === 'kolon') h += `<text class="alt-etiket" x="${X(k.x) + w / 2 + 4}" y="${Y(k.y) + hh / 2 + 12}">${c.b}×${c.h}</text>`;
  }
  // Perde ekle/kaldır kipi: her açıklıkta tıklanır hedef (kirişsizde de); perdeli açıklık tıklanınca kaldırılır
  if (perdeMod || subasmanMod) {
    const alan = subasmanMod ? 'subasman' : 'perdeler';
    const var_ = new Set(acikliklar(alan).map(aciklikAnahtar));
    const diger = new Set(acikliklar(subasmanMod ? 'perdeler' : 'subasman').map(aciklikAnahtar));
    const ad = subasmanMod ? 'su basmanı' : 'perdeyi';
    for (const hat of ag.hatlar) hat.L.forEach((L, k) => {
      const key = `${hat.yon}:${hat.no}:${k}`, [cx, cy, w, hh] = hat.yon === 'x' ? [(X(ag.xs[k]) + X(ag.xs[k + 1])) / 2, Y(ag.ys[hat.no]), Math.max(4, L * s - 14), 16]
        : [X(ag.xs[hat.no]), (Y(ag.ys[k]) + Y(ag.ys[k + 1])) / 2, 16, Math.max(4, L * s - 14)];
      const aks = hat.yon === 'x' ? `${hat.aks}/${k + 1}–${k + 2}` : `${hat.aks}/${HARF[k]}–${HARF[k + 1]}`;
      const engelli = diger.has(key) && !var_.has(key);
      const islem = engelli ? 'bu açıklıkta başka perde var' : var_.has(key) ? `${ad} kaldır` : `${ad} ekle`;
      h += `<rect class="aciklik${var_.has(key) ? ' var' : ''}${engelli ? ' engelli' : ''}" data-bay="${key}" ${r(cx, cy, w, hh)}><title>${aks}: ${islem}</title></rect>`;
    });
  }
  svg.innerHTML = h;
}

// Plan vurgusu: kitapta seçilen satır (Girdiler satırlarının planda karşılığı yok)
function planSecim() {
  document.querySelectorAll('#plan .secili, #plan .aks-secili').forEach(x => x.classList.remove('secili', 'aks-secili'));
  const secili = yerlesimMod ? yerlesimEleman.value : K.secili;
  document.querySelectorAll(`#plan [data-ad="${secili}"]`).forEach(x => x.classList.add('secili'));
  if (yerlesimMod) for (const [alan, i] of Object.entries(yerlesimAkslari()))
    $(`#plan [data-aks="${alan}:${i}"]`)?.classList.add('aks-secili');
}

// Sayfa seç; başka adıma aitse adımı da değiştir (Girdiler adımı değiştirmez). Düzenlenen hücre yeniden çizimden önce kaydedilsin diye odak bırakılır.
// Destek varsa ve hareket azaltılmadıysa View Transitions ile (gecis.css); DOM güncellenince çözülen söz döner.
const azHareket = matchMedia('(prefers-reduced-motion: reduce)');
let gecis = null;
function sayfaSec(ad, sec = null) {
  if (sayfa.contains(document.activeElement)) document.activeElement.blur();
  const sf = SAYFALAR.find(s => s.ad === ad), sira = s => SAYFALAR.findIndex(x => x.ad === s), yeni = sf.adim ?? adim;
  const tur = ad === K.sayfaAd ? null : yeni === adim ? 'sekme' : 'adim', yon = sira(ad) > sira(K.sayfaAd) ? 'ileri' : 'geri';
  K.sayfaAd = ad; K.secili = sec; adim = yeni; // durum hemen; çizim geçiş içinde (bekleyen geçiş de son durumu çizer)
  const guncelle = () => { adimCiz(); ciz(); K.satiraKaydir(); };
  gecis?.skipTransition();
  if (!tur || !document.startViewTransition || azHareket.matches || document.documentElement.dataset.hareket === 'az') { guncelle(); return Promise.resolve(); }
  const h = document.documentElement.dataset;
  h.vt = tur; h.vtYon = yon;
  const vt = gecis = document.startViewTransition(guncelle);
  vt.ready.catch(() => {}); // atlanan geçiş (hızlı ardışık tıklama, gizli sekme) ready'yi reddeder; güncelleme yine çalışır
  vt.finished.finally(() => { if (gecis === vt) { gecis = null; delete h.vt; delete h.vtYon; } });
  return vt.updateCallbackDone;
}
const adimSec = a => sayfaSec(K.gorunur().find(s => s.adim === a)?.ad ?? 'doseme');

// Seçili kolon iki kesişim aksını, kiriş kendi eksenine dik yöndeki konumunu değiştirir.
function yerlesimAkslari() {
  const r = K.sonuc, ad = yerlesimEleman.value;
  if (!r) return {};
  const c = r.kolonlar.find(e => e.ad === ad);
  if (c) return { ax: c.i, ay: c.j };
  const k = r.kirisler.find(e => e.ad === ad);
  if (!k) return {};
  const hat = r.ag.hatlar[k.hat];
  return hat.yon === 'x' ? { ay: hat.no } : { ax: hat.no };
}
function yerlesimHata(yazi = '', alan) {
  const el = $('#yerlesim-hata');
  el.hidden = !yazi; el.textContent = yazi;
  for (const [k, input] of Object.entries(kaydirma)) {
    if (k === alan) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}
function yerlesimCiz() {
  const r = K.sonuc;
  yerlesimDugme.disabled = !r || !(r.kolonlar.length || r.kirisler.length);
  yerlesim.hidden = !yerlesimMod;
  if (!yerlesimMod) return;
  const grup = (ad, elemanlar) => elemanlar?.length ? `<optgroup label="${ad}">${elemanlar.map(e => `<option value="${e.ad}">${e.ad} · ${e.aks}</option>`).join('')}</optgroup>` : '';
  const secili = yerlesimEleman.value || K.secili;
  const secenekler = adim === 'kiris'
    ? grup('Kirişler', r?.kirisler) + grup('Kolonlar', r?.kolonlar)
    : grup('Kolonlar', r?.kolonlar) + grup('Kirişler', r?.kirisler);
  if (yerlesimEleman.innerHTML !== secenekler) {
    yerlesimEleman.innerHTML = secenekler;
    if ([...yerlesimEleman.options].some(o => o.value === secili)) yerlesimEleman.value = secili;
  }
  const akslar = Object.entries(yerlesimAkslari());
  const imza = JSON.stringify([yerlesimEleman.value, ...akslar.map(([alan, i]) => [alan, i, r.ag[alan]])]);
  if (yerlesimImza !== imza) {
    for (const input of Object.values(kaydirma)) input.value = '0';
    yerlesimHata();
    yerlesimImza = imza;
  }
  for (const [alan, input] of Object.entries(kaydirma)) {
    input.disabled = !akslar.some(([k]) => k === alan);
    input.closest('label').hidden = input.disabled;
  }
  $('#yerlesim-uygula').disabled = !akslar.length;
  const bilgi = akslar.map(([alan, i]) => {
    const [alt, ust] = aksKaymaSiniri(r.ag[alan], i), x = alan === 'ax';
    return `${x ? 'X' : 'Y'} (${x ? i + 1 : HARF[i]} aksı) ${tr(alt, 6)} … ${tr(ust, 6)} m`;
  }).join(' · ');
  const yazi = bilgi ? `${bilgi}. Pozitif X sağa, pozitif Y yukarı.` : 'Yerleşimi düzenlemek için geçerli bir aks ağı gir.';
  const el = $('#yerlesim-bilgi');
  if (el.textContent !== yazi) el.textContent = yazi;
}
function yerlesimKipi(on) {
  yerlesimMod = on;
  if (on) { perdeMod = false; yerlesimImza = ''; }
  adimCiz(); yerlesimCiz(); planCiz(); planSecim();
  (on ? yerlesimEleman : yerlesimDugme).focus({ preventScroll: true });
}
yerlesimDugme.addEventListener('click', () => yerlesimKipi(!yerlesimMod));
yerlesimEleman.addEventListener('change', () => { yerlesimCiz(); planSecim(); });
yerlesim.addEventListener('input', () => yerlesimHata());
yerlesim.addEventListener('submit', e => {
  e.preventDefault();
  K.bekleyeni();
  const kaymalar = Object.fromEntries(Object.entries(yerlesimAkslari()).map(([alan, indeks]) =>
    [alan, { indeks, metin: kaydirma[alan].value }]));
  if (!Object.keys(kaymalar).length) return;
  const { degisen, hata, alan } = yerlesimKaydir(K.d, kaymalar);
  if (hata) { yerlesimHata(hata, alan); kaydirma[alan]?.focus(); return; }
  yerlesimHata();
  if (!degisen.size) return;
  formaYaz(degisen);
  K.simdi();
  $('#yerlesim-bilgi').prepend('Akslar kaydırıldı ve hesap güncellendi. ');
});

// Olaylar (sayfa hücreleri kitapta: calisma.js)
// Perde girdisi açıklık listesi olarak değişir; metin her zaman düzgün biçimde yeniden yazılır (A/1–2; 3/A–B)
const aciklikAd = ad => { const sonuc = K.sonuc, k = sonuc.kirisler.find(e => e.ad === ad), p = sonuc.perdeler.find(e => e.ad === ad);
  if (k) return [{ yon: sonuc.ag.hatlar[k.hat].yon, no: sonuc.ag.hatlar[k.hat].no, k: k.k }];
  return p ? Array.from({ length: p.k1 - p.k0 + 1 }, (_, i) => ({ yon: p.yon, no: p.no, k: p.k0 + i })) : []; };
function perdeDegistir(liste_, alan = 'perdeler') {
  if (!liste_.length) return;
  const digerAlan = alan === 'subasman' ? 'perdeler' : 'subasman';
  const r = perdeOku(K.d.form[alan]);
  if (r.hata.length) { $('#durum-sol').textContent = 'Açıklık alanındaki yazım hatasını düzelt, sonra planda değiştir'; return; }
  const var_ = perdeAciklik(r.liste), secilen = new Set(liste_.map(aciklikAnahtar));
  const ks = new Set(var_.map(aciklikAnahtar)), hepsi = [...secilen].every(key => ks.has(key));
  if (!hepsi && acikliklar(digerAlan).some(a => secilen.has(aciklikAnahtar(a)))) {
    const mesaj = 'Aynı açıklığa taşıyıcı perde ve su basman perdesi eklenemez.';
    $('#perde-mod-ipucu').textContent = mesaj;
    $('#durum-sol').textContent = mesaj;
    return;
  }
  const yeni = hepsi ? var_.filter(a => !secilen.has(aciklikAnahtar(a))) : [...var_, ...liste_];
  girdiYaz(K.d, alan, perdeYaz(perdeBirlestir(yeni)), true);
  formaYaz([alan]); K.simdi(); adimCiz();
  if (alan === 'subasman' && !hepsi && K.sonuc) {
    const ek = K.sonuc.subasmanlar.find(x => secilen.has(aciklikAnahtar(x)));
    if (ek) sayfaSec('subasman', ek.ad);
  }
}
const perdeKipi = on => { perdeMod = on; if (on) yerlesimMod = false; adimCiz(); yerlesimCiz(); planCiz(); K.secimCiz(); };
const subasmanKipi = on => { subasmanMod = on; adimCiz(); planCiz(); K.secimCiz(); };
$('#perde-dugme').addEventListener('click', () => perdeKipi(!perdeMod));
$('#subasman-dugme').addEventListener('click', () => subasmanKipi(!subasmanMod));
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (yerlesimMod) yerlesimKipi(false);
  else if (perdeMod) perdeKipi(false);
  else if (subasmanMod) subasmanKipi(false);
});
const adimListe = $('.adimlar'), sekmeListe = $('.sekmeler-alt');
adimListe.addEventListener('click', e => { const b = e.target.closest('[data-adim]'); if (b) adimSec(b.dataset.adim); });
sekmeOk(adimListe, '[data-adim]', b => b.dataset.adim, adimSec, () => adim);
sekmeListe.addEventListener('click', async e => {
  const b = e.target.closest('[data-sayfa]'); if (!b) return;
  const odak = sekmeListe.contains(document.activeElement);
  await sayfaSec(b.dataset.sayfa);
  if (odak) sekmeListe.querySelector('[aria-selected="true"]')?.focus(); // sekmeler yeniden çizildi, odak body'ye düşmesin
});
sekmeOk(sekmeListe, '[data-sayfa]', b => b.dataset.sayfa, sayfaSec, () => K.sayfaAd);
// Seçim pointerdown'da: bir kolon hücresinin change olayı yeniden çizmeden önce tıklanan eleman seçilmiş olur.
$('#plan').addEventListener('pointerdown', e => {
  const bay = e.target.closest('[data-bay]');
  if (bay) { e.preventDefault(); const [yon, no, k] = bay.dataset.bay.split(':'); return perdeDegistir([{ yon, no: +no, k: +k }], subasmanMod ? 'subasman' : 'perdeler'); }
  const el = e.target.closest('[data-ad]'); if (!el) return;
  const ad = el.dataset.ad;
  if (yerlesimMod) {
    if (el.matches('.kolon, .kiris')) {
      e.preventDefault();
      yerlesimEleman.value = ad;
      yerlesimCiz(); planSecim();
      Object.values(kaydirma).find(input => !input.disabled)?.focus({ preventScroll: true });
    }
    return;
  }
  if ((e.altKey || e.shiftKey) && K.sonuc && /^[KP]\d/.test(ad)) { e.preventDefault(); return perdeDegistir(aciklikAd(ad)); } // kiriş → perde, perde → kaldır
  const sf = /^SB\d/.test(ad) ? 'subasman' : ad === 'Radye' || /^RP\d/.test(ad) ? 'radye' : ONEK[ad[0]];
  if (!sf) return;
  if (sf !== K.sayfaAd) return sayfaSec(sf, ad);
  K.secili = ad; K.secimCiz(); K.satiraKaydir();
});
// Geçiş sürerken plan ve sayfa (adlı bölgeler) vurulamaz, tıklama kaba düşer: geçişi bitir, olayı alttaki öğeye yeniden gönder.
// Geçiş başlarken (ilk kare çizilene dek) her tıklama <html>'e düşer; ardından gelen click de aynı öğeye taşınır.
let yonlu = null;
document.addEventListener('pointerdown', e => {
  if (!e.isTrusted) return;
  yonlu = null;
  if (!gecis || !['.kap', '.plan-alan'].some(s => e.target.contains($(s)))) return;
  gecis.skipTransition();
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el || el === e.target) return;
  e.stopImmediatePropagation(); e.preventDefault(); // kabın odak varsayılanı çalışmasın
  el.dispatchEvent(new PointerEvent('pointerdown', e));
  el.closest('input, [tabindex]')?.focus({ preventScroll: true }); // tıklamanın odaklayacağı öğe
  yonlu = el;
}, true);
document.addEventListener('click', e => {
  const y = yonlu; yonlu = null;
  if (!y || !e.isTrusted) return;
  const el = y.isConnected ? y : document.elementFromPoint(e.clientX, e.clientY); // sekme düğmesi yeniden çizildiyse yenisi
  if (!el || el === e.target || !e.target.contains(el)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  el.dispatchEvent(new PointerEvent('click', e));
}, true);
f.addEventListener('submit', e => e.preventDefault());
// Form → durum (Girdiler sayfası aynı durumu gösterir). Yazarken 150 ms gecikmeyle; change: aks/perde/tür temizliği, ek değişiklik varsa hemen.
// Kullanım seçilince q Çizelge 7 değeriyle dolar (elle değiştirilebilir); X aks sayısı kesinleşip değişirse kolona özel boyutlar silinir.
const alanAd = el => ISARET[el.name] ?? el.name, alanDeger = el => el.type === 'checkbox' ? el.checked : el.value;
f.addEventListener('input', e => { if (!e.target.name) return; formaYaz([...girdiYaz(K.d, alanAd(e.target), alanDeger(e.target), false)]); K.geciktir(); });
f.addEventListener('change', e => { if (!e.target.name) return; const ek = girdiYaz(K.d, alanAd(e.target), alanDeger(e.target), true); formaYaz([...ek]); if (ek.size) K.simdi(); });
// Başka sekmede (Tablo sayfası) aynı proje değişince
addEventListener('storage', e => { if (e.key === ANAHTAR) { K.d = durumYukle(undefined, false); formaYaz(); K.simdi(); } });

$('#yazdir').addEventListener('click', () => print());
// Excel'e aktar: düzenlenen hücre ve bekleyen hesap önce işlenir
$('#excel').addEventListener('click', () => { if (sayfa.contains(document.activeElement) || f.contains(document.activeElement)) document.activeElement.blur(); K.simdi(); excelIndir(K.d, K.tumSonuc); });
addEventListener('beforeprint', () => {
  if (sayfa.contains(document.activeElement)) { document.activeElement.blur(); hesapla(); } // düzenlenen hücre çıktıya girsin
  K.bekleyeni(); planOlc(); // tema.js yazı boyutunu baskı için %100'e çekti: plan o genişlikle
  document.querySelectorAll('#plan .secili, #plan .aks-secili').forEach(x => x.classList.remove('secili', 'aks-secili')); // raporda seçim vurgusu olmasın (afterprint → planOlc geri koyar)
  $('#tarih').textContent = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#girdi-ozet').innerHTML = girdiOzet(K.d, K.sonuc);
  $('#baski').innerHTML = K.sonuc ? K.gorunur().filter(s => !s.girdi).map((s, i) => `<section class="baski-sayfa"><h2>${i + 1}. ${s.baslik}${K.sonuc.aktifKat && s.adim !== 'temel' ? ` · ${K.sonuc.aktifKat}. kat` : ''}</h2>${tabloHtml(s, K.sonuc, K.d, true)}</section>`).join('') : '';
});

const planOlc = () => { planCiz(); K.secimCiz(); }; // plan ekrandaki genişliğe göre çizilir
addEventListener('afterprint', planOlc);
new ResizeObserver(planOlc).observe($('.plan-alan'));
formaYaz();
hesapla();
adimSec('doseme');
