import { BETON, kontrol, kolonOner, yukHesap, Q_MIN, KOLON_ORAN_MAX, PERDE_ORAN_MIN } from './kurallar.js';
import { kontur } from './kontur.js';

const $ = s => document.querySelector(s);
const f = $('#f');
const azHareket = matchMedia('(prefers-reduced-motion: reduce)');
const tr = (x, d = 2) => x.toLocaleString('tr-TR', { maximumFractionDigits: d });
const n = k => f[k].valueAsNumber;                  // boş alan NaN olur, 0 değil
const nd = () => f.Nd.value === '' ? null : n('Nd');
const kirissiz = () => f.kirissiz.value === '' ? null : n('kirissiz');
const ADLAR = { b: 'kısa kenar', h: 'uzun kenar', H: 'kat yüksekliği', kirissiz: 'kirişsiz döşeme açıklığı', Ndm: 'N_dm', Nd: 'N_d' };
const TUR = { kolon: 'Kolon', perde: 'Perde', gecersiz: 'Geçersiz' };
const KULLANIM = { konut: 'konut, büro', atolye: 'atölye, mağaza', depo: 'azaltma yok' };
const TARIH = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const IKON = {
  uygun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  degil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
};
const kacis = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

f.beton.innerHTML = Object.keys(BETON).map(k => `<option${k === 'C30' ? ' selected' : ''}>${k}</option>`).join('');
$('#tarih').textContent = TARIH;

// ── Ara değerleme: 60fps.design ölçümü (ffmpeg): ibre ~0,25 s'de yavaşlayarak oturuyor, sayı ~0,5 s'de.
const yavasla = t => 1 - Math.pow(1 - t, 4);
let yazdiriliyor = false; // yazdırırken ara kare değil son değer çizilsin
const kare = {};
function canlandir(ad, from, to, ms, ciz) {
  cancelAnimationFrame(kare[ad]);
  if (azHareket.matches || document.documentElement.dataset.hareket === 'az' || yazdiriliyor) return ciz(to);
  const t0 = performance.now();
  const adim = now => {
    const p = Math.min(1, (now - t0) / ms), e = yavasla(p);
    ciz(typeof to === 'number' ? from + (to - from) * e
      : Object.fromEntries(Object.keys(to).map(k => [k, from[k] + (to[k] - from[k]) * e])));
    if (p < 1) kare[ad] = requestAnimationFrame(adim);
  };
  kare[ad] = requestAnimationFrame(adim);
}

// Dar ekranda SVG yazıları okunur kalsın: viewBox ölçeğini telafi et (en çok 2,4 kat).
// Baskıya da geçer; yazdırma öncesi ve sonrası yeniden ölçülür (tema.js o arada yazı boyutunu %100'e çeker).
const ykAyarla = () => document.documentElement.style.setProperty('--yk', Math.min(2.4, Math.max(1, 760 / $('.levha').getBoundingClientRect().width)).toFixed(3));
new ResizeObserver(ykAyarla).observe($('.levha'));

// ── Kesit paftası (SVG): beton taraması (TS/ISO 128 nokta-çakıl), eksenler, ölçü zincirleri,
//    1,5 ve 6 sınırları kesikli hayalet + üstte kendi ölçü zincirleriyle.
const W = 760, H = 300, UST = 72, ALT = 52, KENAR = 52;
let kesitDurum = null;

const tikler = (x1, y1, x2, y2) => `<path d="M${x1 - 4} ${y1 + 4}l8 -8M${x2 - 4} ${y2 + 4}l8 -8" stroke-width="1.4"/>`;
function olcuYatay(x1, x2, y, ref, yazi, sinif = '', ust = false) {
  const ty = ust ? y - 8 : y + 18;
  return `<g class="${sinif}"><g stroke="currentColor" fill="none" stroke-width="1">
    <path d="M${x1} ${ref + (ust ? -4 : 4)}V${y + (ust ? -6 : 6)}M${x2} ${ref + (ust ? -4 : 4)}V${y + (ust ? -6 : 6)}M${x1 - 6} ${y}H${x2 + 6}" opacity=".55"/>
    ${tikler(x1, y, x2, y)}</g>
    <text x="${(x1 + x2) / 2}" y="${ty}" text-anchor="middle">${yazi}</text></g>`;
}
function olcuDikey(x, y1, y2, ref, yazi) {
  return `<g stroke="currentColor" fill="none" stroke-width="1">
    <path d="M${ref - 4} ${y1}H${x - 6}M${ref - 4} ${y2}H${x - 6}M${x} ${y1 - 6}V${y2 + 6}" opacity=".55"/>
    ${tikler(x, y1, x, y2)}</g>
    <text transform="translate(${x - 10} ${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${yazi}</text>`;
}

function kesitCiz(g) {
  const s = Math.min((W - 2 * KENAR) / g.ext, (H - UST - ALT) / g.kisa);
  const w = g.uzun * s, h = g.kisa * s;
  const x0 = (W - g.ext * s) / 2 + 12, y0 = UST + (H - UST - ALT - h) / 2;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const sinirlar = [[KOLON_ORAN_MAX, g.o15, '1,5'], [PERDE_ORAN_MIN, g.o6, '6']].filter(([, op]) => op > .02);
  const hayalet = sinirlar.map(([oran, op, ad], i) => {
    const hw = g.kisa * oran * s;
    return `<g class="sinir" opacity="${op}" style="color:var(--turuncu)">
      <rect x="${x0}" y="${y0}" width="${hw}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="6 5"/>
      ${olcuYatay(x0, x0 + hw, y0 - 22 - i * 24, y0, `${ad} · ${tr(g.kisa, 0)} = ${tr(g.kisa * oran, 0)}`, '', true)}
    </g>`;
  }).join('');
  $('#kesit').innerHTML = `
    <desc id="kesit-aciklama">${tr(g.uzun, 0)} × ${tr(g.kisa, 0)} mm kesit</desc>
    <defs><pattern id="beton-tarama" width="26" height="26" patternUnits="userSpaceOnUse">
      <g fill="currentColor" opacity=".42"><circle cx="3" cy="4" r=".9"/><circle cx="14" cy="9" r=".7"/><circle cx="21" cy="3" r=".8"/><circle cx="8" cy="17" r=".8"/><circle cx="19" cy="20" r=".7"/><circle cx="24" cy="13" r=".6"/><circle cx="11" cy="24" r=".6"/><circle cx="2" cy="21" r=".5"/></g>
      <g fill="none" stroke="currentColor" stroke-width=".8" opacity=".38"><path d="M16 14l4-1-1.5 3.5z"/><path d="M4 9l3.5 1-3 2.5z"/><path d="M13 19.5l3 2.5-4 .5z"/><path d="M22 6l2.5 2-3 1z"/></g>
    </pattern></defs>
    ${hayalet}
    <rect class="kesit-cizgi" x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#beton-tarama)" stroke="currentColor" stroke-width="1.6"/>
    <path d="M${x0 - 14} ${cy}H${x0 + w + 14}M${cx} ${y0 - 10}V${y0 + h + 14}" stroke="currentColor" stroke-width=".8" stroke-dasharray="14 4 2 4" opacity=".5"/>
    ${olcuYatay(x0, x0 + w, y0 + h + 26, y0 + h, tr(g.uzun, 0))}
    ${olcuDikey(x0 - 28, y0, y0 + h, x0, tr(g.kisa, 0))}`;
}

function kesitGuncelle(r) {
  const k = r.kisa, u = r.uzun;
  const o15 = r.tur === 'perde' ? 0 : 1, o6 = r.tur === 'kolon' ? 0 : 1;
  const ext = Math.max(u, o15 ? k * KOLON_ORAN_MAX : 0, o6 ? k * PERDE_ORAN_MIN : 0);
  const hedef = { uzun: u, kisa: k, ext, o15, o6 };
  $('#kesit').dataset.durum = r.gecti ? 'uygun' : 'degil';
  canlandir('kesit', kesitDurum ?? hedef, hedef, 260, g => kesitCiz(kesitDurum = g));
}

// ── Oran cetveli: log ölçek 1 → 8; bölgeler KOLON / GEÇERSİZ / PERDE.
const C0 = 28, C1 = 732, cx = r => C0 + Math.log(Math.min(Math.max(r, 1), 8)) / Math.log(8) * (C1 - C0);
let cetvelOran = 1;
function cetvelCiz(oran) {
  const x = cx(oran), y = 32;
  const tik = [1, 1.5, 2, 3, 4, 6, 8].map(t =>
    `<path d="M${cx(t)} ${y + 12}v6" stroke="currentColor" opacity=".5"/><text x="${cx(t)}" y="${y + 32}" text-anchor="middle">${tr(t)}</text>`).join('');
  $('#cetvel').innerHTML = `
    <defs><pattern id="yasak" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0V6" stroke="var(--kirmizi)" stroke-width="1.4" opacity=".55"/></pattern></defs>
    <text class="bolge" x="${(cx(1) + cx(1.5)) / 2}" y="16" text-anchor="middle">KOLON</text>
    <text class="bolge" x="${(cx(1.5) + cx(6)) / 2}" y="16" text-anchor="middle">GEÇERSİZ</text>
    <text class="bolge" x="${(cx(6) + cx(8)) / 2}" y="16" text-anchor="middle">PERDE</text>
    <rect x="${cx(1)}" y="${y}" width="${cx(1.5) - cx(1)}" height="10" style="fill:var(--nane)" opacity=".75"/>
    <rect x="${cx(1.5)}" y="${y}" width="${cx(6) - cx(1.5)}" height="10" fill="url(#yasak)" style="stroke:var(--kirmizi)" stroke-opacity=".35"/>
    <rect x="${cx(6)}" y="${y}" width="${cx(8) - cx(6)}" height="10" style="fill:var(--turuncu)" opacity=".85"/>
    ${tik}
    <g transform="translate(${x} 0)" style="color:var(--murekkep)">
      <path d="M0 ${y - 5}V${y + 16}" stroke="currentColor" stroke-width="2"/>
      <path d="M-6 ${y - 13}h12l-6 8z" fill="currentColor"/>
    </g>`;
}

// ── Kullanım göstergesi: 0–%120 yarım daire, %100 sınır çizgisi.
const GX = 110, GY = 112, GR = 92, AZAMI = 1.2;
const aci = v => Math.PI - Math.min(Math.max(v, 0), AZAMI) / AZAMI * Math.PI;
const nokta = (a, r) => [GX + r * Math.cos(a), GY - r * Math.sin(a)];
let saatDeger = 0;
function saatCiz(v, bos) {
  const renk = bos ? 'var(--soluk)' : v > 1 + 1e-9 ? 'var(--kirmizi)' : 'var(--nane)';
  const [ax, ay] = nokta(aci(v), GR), [ix, iy] = nokta(aci(v), GR - 16);
  const tik = Array.from({ length: 13 }, (_, i) => {
    const a = aci(i / 10), buyuk = i % 2 === 0, sinir = i === 10;
    const [x1, y1] = nokta(a, GR + 2), [x2, y2] = nokta(a, GR + (sinir ? 14 : buyuk ? 9 : 5));
    const [tx, ty] = nokta(a, GR + (sinir ? 28 : 22));
    return `<path d="M${x1} ${y1}L${x2} ${y2}" style="stroke:${sinir ? 'var(--kirmizi)' : 'currentColor'}" stroke-width="${sinir ? 2 : 1}" opacity="${sinir ? 1 : .5}"/>` +
      (buyuk ? `<text x="${tx}" y="${ty + 4}" text-anchor="middle" style="font:400 13px var(--olcu);fill:var(--soluk)">${i * 10}</text>` : '');
  }).join('');
  $('#saat').innerHTML = `
    <path d="M${GX - GR} ${GY}A${GR} ${GR} 0 0 1 ${GX + GR} ${GY}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="10"/>
    ${bos ? '' : `<path d="M${GX} ${GY}L${GX - GR} ${GY}A${GR} ${GR} 0 0 1 ${ax} ${ay}Z" style="fill:${renk}" fill-opacity=".16"/>
    <path d="M${GX - GR} ${GY}A${GR} ${GR} 0 0 1 ${ax} ${ay}" fill="none" style="stroke:${renk}" stroke-width="10"/>`}
    ${tik}
    <path d="M${GX} ${GY}L${ix} ${iy}" style="stroke:var(--murekkep)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${GX}" cy="${GY}" r="5" style="fill:var(--murekkep)"/>`;
  $('#saat').style.color = 'var(--murekkep)';
}
function saatGuncelle(b, neden = 'Kullanım oranı hesaplanamıyor') {
  const hedef = b ? b.kullanim : 0;
  // Ad ve kaynak ayrı satırda: ayırıcı satır başına düşmesin.
  $('#saat-etiket').innerHTML = b ? `Belirleyici: ${b.ad.toLocaleLowerCase('tr-TR')}<br>${b.kaynak}` : neden;
  canlandir('saat', saatDeger, hedef, 280, v => saatCiz(saatDeger = v, !b));
  canlandir('sayi', +($('#saat-deger').dataset.v || 0), hedef, 480, v => {
    $('#saat-deger').dataset.v = v;
    $('#saat-deger').textContent = b ? `%${Math.round(v * 100)}` : '—';
  });
}

// ── Antet (künye) ve rapor özeti
const kunyeCiz = (satirlar, el) => {
  el.innerHTML = satirlar.map(([dt, dd, tam]) => `<div${tam ? ' class="tam"' : ''}><dt>${dt}</dt><dd>${dd}</dd></div>`).join('');
};
let yukIzi = null; // TS 498 yardımcısından aktarılan değerler (rapora türetimi yazılır)

function antetVeRapor(r) {
  const eleman = kacis(f.eleman.value.trim());
  const ndv = nd();
  $('#levha-baslik').textContent = eleman ? `${f.eleman.value.trim()} · Kesit A–A` : 'Kesit A–A';
  $('#rapor-eleman').textContent = f.eleman.value.trim();
  kunyeCiz([
    ...(eleman ? [['Eleman', eleman, true]] : []),
    ['Oran', r ? `<span class="olcu">${tr(r.oran, 3)}</span>` : '—'],
    ['Beton', f.beton.value],
    ['N<sub>dm</sub>', Number.isFinite(n('Ndm')) ? `<span class="olcu">${tr(n('Ndm'))}</span> kN` : '—'],
    ['N<sub>d</sub>', ndv == null || !Number.isFinite(ndv) ? '—' : `<span class="olcu">${tr(ndv)}</span> kN`],
    ['Birim · ölçek', 'mm · uydurmalı'],
    ['Tarih', TARIH],
  ], $('#kunye'));
  const olc = (v, b) => `<span class="olcu">${tr(v)}</span> ${b}`;
  const mm = k => Number.isFinite(n(k)) ? olc(n(k), 'mm') : '—';
  kunyeCiz([
    ['Kısa kenar', mm('b')], ['Uzun kenar', mm('h')], ['Kat yüksekliği', mm('H')],
    ['İki ucu perdeyle tutulu', f.tutulu.checked ? 'Evet' : 'Hayır'],
    ['Yüksek bina (BYS = 1)', f.yuksek.checked ? 'Evet' : 'Hayır'],
    ['Yalnız perdeli, Denk. 7.14', f.yalniz.checked ? 'Evet (mühendis beyanı)' : 'Hayır'],
    ['Kirişsiz döşeme açıklığı', kirissiz() ? olc(kirissiz(), 'mm') : 'kirişli'],
    ['Beton', f.beton.value],
    ['N<sub>dm</sub> (G+Q+E)', Number.isFinite(n('Ndm')) ? olc(n('Ndm'), 'kN') : '—'],
    ['N<sub>d</sub> (1,4G+1,6Q)', ndv == null ? 'girilmedi, TS 500 Denk. 7.7 atlandı' : olc(ndv, 'kN')],
    ['Durum', r ? `${TUR[r.tur]}, ${r.gecti ? 'uygun' : 'uygun değil'}` : 'giriş eksik'],
  ], $('#girdi-ozet'));
  const aktarildi = yukIzi && f.Ndm.value === String(yukIzi.Ndm) && f.Nd.value === String(yukIzi.Nd);
  $('#yuk-izi').innerHTML = aktarildi
    ? `N<sub>dm</sub> ve N<sub>d</sub> TS 498 yardımcısından: ${yukIzi.yazi}`
    : 'N<sub>dm</sub> ve N<sub>d</sub> kullanıcı tarafından girildi.';
}

// ── Koşullar tablosu ve öneri
const simge = s => s.replace(/N_dm/g, 'N<sub>dm</sub>').replace(/N_d\b/g, 'N<sub>d</sub>').replace(/fck/g, 'f<sub>ck</sub>').replace(/fcd/g, 'f<sub>cd</sub>');
const birim = sinir => sinir.endsWith('mm²') ? ' mm²' : sinir.endsWith('mm') ? ' mm' : '';
function maddelerCiz(r) {
  $('#maddeler').innerHTML = `<table class="tablo">
    <thead><tr><th scope="col">Koşul</th><th scope="col">Değer</th><th scope="col">Sınır</th><th scope="col">Kaynak</th><th scope="col">Kullanım</th><th scope="col"><span class="gizli">Sonuç</span></th></tr></thead>
    <tbody>${r.maddeler.map(x => {
      const k = x.kullanim;
      return `<tr>
        <td>${x.ad}</td>
        <td class="olcu">${typeof x.deger === 'string' ? x.deger : tr(x.deger) + birim(x.sinir)}</td>
        <td class="olcu">${simge(x.sinir)}</td>
        <td class="kaynak">${x.kaynak}</td>
        <td>${k == null ? '' : `<span class="kul${k > 1 + 1e-9 ? ' asim' : ''}"><i><b style="width:${Math.min(k, AZAMI) / AZAMI * 100}%"></b></i>%${Math.round(k * 100)}</span>`}</td>
        <td><span class="sonuc-hucre ${x.gecti ? 'uygun' : 'degil'}">${IKON[x.gecti ? 'uygun' : 'degil']}${x.gecti ? 'Sağlıyor' : 'Sağlamıyor'}</span></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function oneriCiz(fck) {
  const o = kolonOner({ fck, Ndm: n('Ndm'), Nd: nd(), kirissizAciklik: kirissiz() });
  if (!o) { $('#oneri').innerHTML = '<p>Bu yük için oranı 1,5\'i aşmayan bir kolon yetmiyor; perde düşünün.</p>'; return; }
  const ayni = Math.min(n('b'), n('h')) === o.b && Math.max(n('b'), n('h')) === o.h;
  $('#oneri').innerHTML = `<p>Bu yük için en küçük kolon: <b class="olcu">${o.b} × ${o.h} mm</b> · gerekli alan <span class="olcu">${tr(Math.ceil(o.Agerek))} mm²</span></p>` +
    (ayni ? '' : `<button class="dugme" type="button" id="uygula">Bu kesiti uygula</button>`);
  $('#uygula')?.addEventListener('click', () => { f.b.value = o.b; f.h.value = o.h; ciz(); });
}

// ── 3B görünüm (three.js yalnızca sekme açılınca yüklenir)
let uc = null, sonGeometri = null;
const sekmeler = [$('#sekme-cizim'), $('#sekme-uc')];
async function sekmeSec(i) {
  sekmeler.forEach((s, j) => { s.setAttribute('aria-selected', i === j); s.tabIndex = i === j ? 0 : -1; });
  $('#kesit').style.display = i === 0 ? '' : 'none'; // SVG öğesinde .hidden özelliği yok
  $('#uc').hidden = i !== 1;
  if (i === 1 && !uc) uc = (await import('./uc.js')).kur($('#uc'));
  if (i === 1 && sonGeometri) uc.guncelle(sonGeometri);
}
sekmeler.forEach((s, i) => {
  s.addEventListener('click', () => sekmeSec(i));
  s.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const j = (i + 1) % 2; sekmeler[j].focus(); sekmeSec(j);
  });
});

// ── Ana çizim
function ciz() {
  const hatali = ['b', 'h', 'H', 'kirissiz', 'Ndm', 'Nd'].filter(k => !f[k].checkValidity());
  if (hatali.length) {
    $('#tur').textContent = 'Giriş eksik';
    $('#durum').className = 'durum degil';
    $('#durum').innerHTML = `${IKON.degil}Hesaplanamadı`;
    $('#maddeler').innerHTML = `<p class="hata">Düzeltin: ${hatali.map(k => ADLAR[k]).join(', ')}. Tüm zorunlu alanlar dolu ve sıfırdan büyük olmalı.</p>`;
    $('#oneri').innerHTML = '';
    saatGuncelle(null);
    antetVeRapor(null);
    return;
  }
  const fck = BETON[f.beton.value];
  const r = kontrol({ b: n('b'), h: n('h'), fck, Ndm: n('Ndm'), Nd: nd(), katYuksekligi: n('H'), ikiUcTutulu: f.tutulu.checked,
    yuksekBina: f.yuksek.checked, yalnizPerde: f.yalniz.checked, kirissizAciklik: kirissiz() });
  $('#tur').textContent = TUR[r.tur];
  $('#durum').className = `durum ${r.gecti ? 'uygun' : 'degil'}`;
  $('#durum').innerHTML = `${IKON[r.gecti ? 'uygun' : 'degil']}${r.gecti ? 'Uygun' : 'Uygun değil'}`;
  maddelerCiz(r);
  saatGuncelle(r.belirleyici, 'Oran kolon ve perde aralığının dışında; önce kesiti düzeltin');
  kesitGuncelle(r);
  const eski = cetvelOran; cetvelOran = r.oran;
  canlandir('cetvel', eski, r.oran, 260, cetvelCiz);
  oneriCiz(fck);
  antetVeRapor(r);
  sonGeometri = { kisa: r.kisa, uzun: r.uzun, H: n('H'), gecti: r.gecti };
  if (uc && !$('#uc').hidden) uc.guncelle(sonGeometri);
}

// ── Yük yardımcısı yalnızca gösterir; aktarım düğmeyle (elle girilen değer ezilmez).
function yukten() {
  try {
    const y = yukHesap({ alan: n('alan'), katSayisi: n('kat'), g: n('g'), q: n('q'), kullanim: f.kullanim.value, kDeprem: n('kDeprem'), sds: n('sds') });
    $('#yuk').innerHTML = `β = <b>${tr(y.beta)}</b> · G = <b>${tr(y.G)}</b> kN · βQ = <b>${tr(y.Q)}</b> kN · 0,2·S<sub>DS</sub>·G = <b>${tr(y.Ez)}</b> kN<br>N<sub>dm</sub> ≈ <b>${tr(Math.ceil(y.Ndm))}</b> kN · N<sub>d</sub> ≈ <b>${tr(Math.ceil(y.Nd))}</b> kN` +
      (y.qAz ? `<br><b>Uyarı:</b> q, TS 498 Çizelge 7 değerinin (${tr(y.qMin)} kN/m²) altında.` : '');
    return y;
  } catch (e) {
    $('#yuk').textContent = e.message;
    return null;
  }
}
$('#aktar').addEventListener('click', () => {
  const y = yukten();
  if (!y) return;
  const Ndm = Math.ceil(y.Ndm), Nd = Math.ceil(y.Nd);
  f.Ndm.value = Ndm; f.Nd.value = Nd;
  yukIzi = { Ndm, Nd, yazi: `etki alanı ${tr(n('alan'))} m², ${n('kat')} kat, g ${tr(n('g'))} kN/m², q ${tr(n('q'))} kN/m², ${KULLANIM[f.kullanim.value]} (β ${tr(y.beta)}), S<sub>DS</sub> ${tr(n('sds'))}, yatay deprem katsayısı ${tr(n('kDeprem'))}; G ${tr(y.G)} kN, βQ ${tr(y.Q)} kN, 0,2·S<sub>DS</sub>·G ${tr(y.Ez)} kN.` };
  ciz();
});

// Kullanım değişince q, Çizelge 7 en küçük değerinin altındaysa ona çıkarılır (elle girilen büyük q korunur).
f.kullanim.addEventListener('change', () => { const m = Q_MIN[f.kullanim.value]; if (m && !(n('q') >= m)) f.q.value = m; });
const tepki = e => e.target.closest('details') ? yukten() : ciz();
f.addEventListener('input', tepki);
f.addEventListener('change', tepki);
f.addEventListener('submit', e => e.preventDefault());
$('#yazdir').addEventListener('click', () => window.print());
addEventListener('beforeprint', () => { yazdiriliyor = true; ykAyarla(); ciz(); });
addEventListener('afterprint', () => { yazdiriliyor = false; ykAyarla(); });

cetvelCiz(1);
yukten();
ciz();
kontur($('#kontur'));
