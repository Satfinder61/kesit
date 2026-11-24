// Döşemeden temele sayfası: girdi → zincirHesap → kat planı, Excel tarzı sayfalar, ayrıntı.
import { BETON, sayiOku } from './kurallar.js';
import { zincirHesap, girdiDenetle, CELIK } from './zincir.js';

const $ = s => document.querySelector(s);
const f = $('#f');
const tr = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: d }) : '—';
const simge = s => s.replace(/q_([tko])\b/g, 'q<sub>$1</sub>').replace(/([NAp])_([bsd])\b(?!m)/g, '$1<sub>$2</sub>').replace(/V_cr\b/g, 'V<sub>cr</sub>').replace(/N_dm/g, 'N<sub>dm</sub>').replace(/N_d\b/g, 'N<sub>d</sub>').replace(/N_k\b/g, 'N<sub>k</sub>')
  .replace(/fck/g, 'f<sub>ck</sub>').replace(/fcd/g, 'f<sub>cd</sub>').replace(/fctd/g, 'f<sub>ctd</sub>').replace(/fyd/g, 'f<sub>yd</sub>')
  .replace(/ℓsn/g, 'ℓ<sub>sn</sub>').replace(/ℓn/g, 'ℓ<sub>n</sub>').replace(/αs/g, 'α<sub>s</sub>').replace(/V_d\b/g, 'V<sub>d</sub>')
  .replace(/M_d\b/g, 'M<sub>d</sub>').replace(/u_p\b/g, 'u<sub>p</sub>').replace(/V_pd\b/g, 'V<sub>pd</sub>').replace(/S_DS/g, 'S<sub>DS</sub>');
const olc = x => x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const birim = sinir => (sinir.match(/(kN\/m²|kNm|kN|mm²|mm|m²|m)\s*$/) ?? ['', ''])[1];
const deger = x => typeof x.deger === 'string' ? x.deger : `${tr(x.deger)}${birim(x.sinir) ? ' ' + birim(x.sinir) : ''}`;
const TUR = { kolon: 'Kolon', perde: 'Perde', gecersiz: 'Geçersiz' };
const IKON = {
  uygun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  degil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  uyari: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5l6 11H2zM8 7v3M8 12v.01"/></svg>',
};
const sonucYaz = (ok, yazi, tip = ok ? 'uygun' : 'degil') => `<span class="sonuc-hucre ${tip}">${IKON[tip]}${yazi}</span>`;
const sehimVar = e => e.maddeler.some(x => x.uyari && !x.gecti);
const AZAMI = 1.2, HARF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIZI = { doseme: 'dosemeler', kiris: 'kirisler', kolon: 'kolonlar', temel: 'temeller' };
const AD = { doseme: ['döşeme', 'Döşeme'], kiris: ['kiriş', 'Kiriş'], kolon: ['kolon', 'Kolon'], temel: ['temel', 'Temel'] };
const PLAN_BASLIK = { doseme: 'Kat planı · döşeme yük alanları (45°)', kiris: 'Kat planı · kirişler', kolon: 'Kat planı · kolonlar', temel: 'Temel planı · tekil temeller' };
const ONEK = { D: 'doseme', K: 'kiris', S: 'kolon', T: 'temel' };
const FORM = { katSayisi: 'kat', gKaplama: 'g' };
const ALANLAR = ['ax', 'ay', 'kat', 'H', 'beton', 'celik', 't', 'kirisB', 'kirisH', 'kolonB', 'kolonH', 'g', 'q', 'kullanim', 'duvarDis', 'duvarIc', 'sds', 'kDeprem', 'zemin', 'Df'];
const ANAHTAR = 'kesit.sira.v2'; // v2: zemin alanı artık q_k (v1'de emniyet gerilmesiydi)

f.beton.innerHTML = Object.keys(BETON).map(k => `<option${k === 'C30' ? ' selected' : ''}>${k}</option>`).join('');
f.celik.innerHTML = Object.keys(CELIK).map(k => `<option${k === 'B420C' ? ' selected' : ''}>${k}</option>`).join('');

let adim = 'doseme', secili = null, sonuc = null, ozel = {}, agNx = 0;

const belirleyen = e => e.belirleyici ?? e.maddeler.find(x => !x.gecti) ?? e.maddeler[0];
const kul = e => e.belirleyici?.kullanim;
const ORTAK = [
  ['Belirleyici koşul', 196, 0, e => belirleyen(e)?.ad ?? '—', 'ayrac'],
  ['Kullanım', 104, 0, null, 'dolgu'],
  ['Sonuç', 132, 0, e => sonucYaz(e.gecti, e.gecti ? 'Uygun' + (sehimVar(e) ? ' <span class="soluk">· sehim</span>' : '') : 'Uygun değil')],
];
// [başlık, genişlik px, sayı mı, değer, sınıf]
const SPEC = {
  doseme: [
    ['Ad', 56, 0, e => e.ad], ['Aks', 112, 0, e => e.aks],
    ['ℓ<sub>x</sub> <small>m</small>', 64, 1, e => tr(e.lx)], ['ℓ<sub>y</sub> <small>m</small>', 64, 1, e => tr(e.ly)],
    ['m', 56, 1, e => tr(e.m)], ['Çalışma', 112, 0, e => e.bir ? 'Bir doğrultu' : 'İki doğrultu'],
    ['α<sub>s</sub>', 56, 1, e => tr(e.alfaS)], ['ℓ<sub>sn</sub> <small>m</small>', 72, 1, e => tr(e.lsn)],
    ['h gerekli <small>mm</small>', 96, 1, e => tr(e.hGerek, 0)], ['h <small>mm</small>', 64, 1, e => tr(e.t, 0)],
    ['g <small>kN/m²</small>', 80, 1, e => tr(e.gAlan)], ['q <small>kN/m²</small>', 80, 1, e => tr(e.qAlan)],
    ...ORTAK],
  kiris: [
    ['Ad', 56, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], ['ℓ <small>m</small>', 60, 1, e => tr(e.L)],
    ['b × h <small>mm</small>', 96, 1, e => `${tr(e.b, 0)} × ${tr(e.h, 0)}`],
    ['g <small>kN/m</small>', 72, 1, e => tr(e.gOrt)], ['q <small>kN/m</small>', 72, 1, e => tr(e.qOrt)],
    ['M<sub>d</sub> mesnet <small>kNm</small>', 112, 1, e => tr(e.MdMesnet, 1)], ['M<sub>d</sub> açıklık <small>kNm</small>', 120, 1, e => tr(e.MdAcik, 1)],
    ['V<sub>d</sub> <small>kN</small>', 76, 1, e => tr(e.Vd, 1)],
    ...ORTAK],
  kolon: [
    ['Ad', 56, 0, e => e.ad], ['Aks', 56, 0, e => e.aks],
    ['b <small>mm</small>', 72, 1, e => tr(e.b, 0), 'giris b'], ['h <small>mm</small>', 72, 1, e => tr(e.h, 0), 'giris h'],
    ['N<sub>G</sub> <small>kN</small>', 84, 1, e => tr(e.NG, 0)], ['β·N<sub>Q</sub> <small>kN</small>', 88, 1, e => tr(e.NQ, 0)],
    ['N<sub>dm</sub> <small>kN</small>', 84, 1, e => tr(e.Ndm, 0)], ['N<sub>d</sub> <small>kN</small>', 84, 1, e => tr(e.Nd, 0)],
    ['Tür', 76, 0, e => TUR[e.tur] ?? '—'],
    ...ORTAK,
    ['En küçük kolon', 116, 1, e => e.oneri ? `${e.oneri.b} × ${e.oneri.h}` : '<span class="soluk">perde düşün</span>']],
  temel: [
    ['Ad', 56, 0, e => e.ad], ['Kolon', 88, 0, e => `${e.kolon} · ${e.aks}`],
    ['N<sub>k</sub> <small>kN</small>', 80, 1, e => tr(e.Nk, 0)], ['N<sub>d</sub> <small>kN</small>', 80, 1, e => tr(e.Nd, 0)],
    ['A gerekli <small>m²</small>', 96, 1, e => tr(e.A)], ['B<sub>x</sub> × B<sub>y</sub> <small>m</small>', 116, 1, e => `${olc(e.Bx)} × ${olc(e.By)}`],
    ['h <small>mm</small>', 64, 1, e => tr(e.hT, 0)], ['q<sub>o</sub> <small>kN/m²</small>', 80, 1, e => tr(e.sigma, 0)],
    ...ORTAK],
};

const liste = v => v.trim() ? v.trim().split(/[\s;/]+/).map(sayiOku) : [];
function oku() {
  const n = k => sayiOku(f[k].value);
  return { ax: liste(f.ax.value), ay: liste(f.ay.value), katSayisi: n('kat'), H: n('H'), beton: f.beton.value, celik: f.celik.value,
    t: n('t'), kirisB: n('kirisB'), kirisH: n('kirisH'), kolonB: n('kolonB'), kolonH: n('kolonH'), gKaplama: n('g'), q: n('q'),
    kullanim: f.kullanim.value, duvarDis: n('duvarDis'), duvarIc: n('duvarIc'), sds: n('sds'), kDeprem: n('kDeprem'),
    zemin: n('zemin'), Df: n('Df'), kolonOzel: ozel };
}

function hesapla() {
  const g = oku(), hata = girdiDenetle(g);
  for (const k of ALANLAR) f[k].removeAttribute('aria-invalid');
  for (const k of Object.keys(hata)) f[FORM[k] ?? k]?.setAttribute('aria-invalid', 'true');
  const var_ = Object.keys(hata).length > 0;
  $('#hata').hidden = !var_;
  $('#hata').innerHTML = var_ ? `<b>Girdi hatası.</b> ${Object.values(hata).map(simge).join(' · ')}` : '';
  sonuc = var_ ? null : zincirHesap({ ...g, kolonOzel: g.ax.length === agNx ? ozel : {} }); // X aks sayısı yazılırken eski adlar kaymasın
  ozetCiz(); planCiz(); sayfaCiz(); durumCiz(); secimCiz(); kaydet();
}

function ozetCiz() {
  for (const a of Object.keys(DIZI)) {
    const el = $('#ozet-' + a), l = sonuc?.[DIZI[a]];
    if (!l) { el.textContent = '—'; el.classList.remove('degil'); continue; }
    const bad = l.filter(e => !e.gecti).length;
    el.textContent = `${l.length} ${AD[a][0]} · ${bad ? bad + ' uygun değil' : 'tümü uygun'}`;
    el.classList.toggle('degil', bad > 0);
  }
  $('#notlar').innerHTML = (sonuc?.notlar ?? []).map(n => `<li>${simge(n)}</li>`).join('');
}

// ── Kat planı (SVG, Y aksı yukarı)
function planCiz() {
  const svg = $('#plan');
  svg.dataset.adim = adim;
  if (!sonuc) { svg.innerHTML = ''; svg.removeAttribute('viewBox'); return; }
  const { ag } = sonuc, W = ag.xs.at(-1), Hh = ag.ys.at(-1);
  const gen = Math.max(320, svg.clientWidth || 760), s = Math.min((gen - 72 - 90) / W, Math.max(260, gen * .55) / Hh), ox = 72, oy = 50; // 1 birim = 1 px
  svg.setAttribute('viewBox', `0 0 ${(W * s + ox + 90).toFixed(1)} ${(Hh * s + oy + 66).toFixed(1)}`);
  const X = x => ox + x * s, Y = y => oy + (Hh - y) * s, mm = (v, en = 3) => Math.max(en, v / 1000 * s);
  const r = (cx, cy, w, h) => `x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"`;
  const durum = (e, a) => a === adim && !e.gecti ? ' degil' : '';
  let h = '';
  ag.xs.forEach((x, i) => { h += `<line class="aks" x1="${X(x)}" y1="${oy - 20}" x2="${X(x)}" y2="${Y(0) + 16}"/><g class="balon"><circle cx="${X(x)}" cy="${oy - 32}" r="11"/><text x="${X(x)}" y="${oy - 32}">${i + 1}</text></g>`; });
  ag.ys.forEach((y, j) => { h += `<line class="aks" x1="${ox - 20}" y1="${Y(y)}" x2="${X(W) + 16}" y2="${Y(y)}"/><g class="balon"><circle cx="${ox - 32}" cy="${Y(y)}" r="11"/><text x="${ox - 32}" y="${Y(y)}">${HARF[j]}</text></g>`; });
  // ölçü zincirleri
  const zx = Y(0) + 40, zy = X(W) + 40;
  h += `<line class="olcu-cizgi" x1="${X(0)}" y1="${zx}" x2="${X(W)}" y2="${zx}"/>` + ag.xs.map(x => `<path class="olcu-cizgi" d="M${X(x) - 4} ${zx + 4}l8 -8"/>`).join('') +
    ag.ax.map((v, i) => `<text x="${(X(ag.xs[i]) + X(ag.xs[i + 1])) / 2}" y="${zx - 6}" text-anchor="middle">${olc(v)}</text>`).join('');
  h += `<line class="olcu-cizgi" x1="${zy}" y1="${Y(0)}" x2="${zy}" y2="${Y(Hh)}"/>` + ag.ys.map(y => `<path class="olcu-cizgi" d="M${zy - 4} ${Y(y) + 4}l8 -8"/>`).join('') +
    ag.ay.map((v, j) => `<text x="${zy + 8}" y="${(Y(ag.ys[j]) + Y(ag.ys[j + 1])) / 2}" dominant-baseline="central">${olc(v)}</text>`).join('');
  // döşemeler
  for (const d of sonuc.dosemeler) {
    const x0 = X(ag.xs[d.i]), x1 = X(ag.xs[d.i + 1]), y0 = Y(ag.ys[d.j]), y1 = Y(ag.ys[d.j + 1]), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ic = mm(sonuc.kirisler[0].b) / 2 + 1; // pano kirişlerin arasında kalan net alan
    h += `<rect class="pano${durum(d, 'doseme')}" data-ad="${d.ad}" x="${x0 + ic}" y="${y1 + ic}" width="${x1 - x0 - 2 * ic}" height="${y0 - y1 - 2 * ic}"/>`;
    if (adim !== 'doseme') continue;
    const a = Math.min(x1 - x0, y0 - y1) / 2;
    if (d.bir) { // bir doğrultu: taşıma yönü oku
      const yatay = d.lx < d.ly, L = a * .9;
      h += yatay ? `<path class="yon" d="M${cx - L} ${cy + 16}h${2 * L}M${cx - L + 6} ${cy + 12}l-6 4 6 4M${cx + L - 6} ${cy + 12}l6 4 -6 4"/>`
        : `<path class="yon" d="M${cx + 20} ${cy - L}v${2 * L}M${cx + 16} ${cy - L + 6}l4 -6 4 6M${cx + 16} ${cy + L - 6}l4 6 4 -6"/>`;
    } else if (x1 - x0 >= y0 - y1) {
      h += `<path class="kirk5" d="M${x0} ${y0}L${x0 + a} ${cy}L${x0} ${y1}M${x0 + a} ${cy}H${x1 - a}M${x1} ${y0}L${x1 - a} ${cy}L${x1} ${y1}"/>`;
    } else {
      h += `<path class="kirk5" d="M${x0} ${y0}L${cx} ${y0 - a}L${x1} ${y0}M${cx} ${y0 - a}V${y1 + a}M${x0} ${y1}L${cx} ${y1 + a}L${x1} ${y1}"/>`;
    }
    h += `<text class="etiket" x="${cx}" y="${cy - 4}" text-anchor="middle">${d.ad}</text><text class="alt-etiket" x="${cx}" y="${cy + 9}" text-anchor="middle">h ≥ ${tr(d.hGerek, 0)}</text>`;
  }
  // temeller (kolonların altında)
  if (adim === 'temel') for (const t of sonuc.temeller) {
    const k = ag.kolonlar.find(c => c.ad === t.kolon);
    h += `<rect class="temel${durum(t, 'temel')}" data-ad="${t.ad}" ${r(X(k.x), Y(k.y), t.Bx * s, t.By * s)}/>`;
  }
  // kirişler
  for (const k of sonuc.kirisler) {
    const hat = ag.hatlar[k.hat], bw = mm(k.b);
    const [cx, cy, w, hh] = hat.yon === 'x'
      ? [(X(ag.xs[k.k]) + X(ag.xs[k.k + 1])) / 2, Y(ag.ys[hat.no]), k.L * s, bw]
      : [X(ag.xs[hat.no]), (Y(ag.ys[k.k]) + Y(ag.ys[k.k + 1])) / 2, bw, k.L * s];
    h += `<rect class="kiris${durum(k, 'kiris')}" data-ad="${k.ad}" ${r(cx, cy, w, hh)}/>`;
    if (adim === 'kiris') h += hat.yon === 'x' ? `<text class="alt-etiket" x="${cx}" y="${cy - bw / 2 - 4}" text-anchor="middle">${k.ad}</text>`
      : `<text class="alt-etiket" x="${cx + bw / 2 + 4}" y="${cy}" dominant-baseline="central">${k.ad}</text>`;
  }
  // kolonlar
  for (const c of sonuc.kolonlar) {
    const k = ag.kolonlar.find(x => x.ad === c.ad), w = mm(c.b, 6), hh = mm(c.h, 6);
    h += `<rect class="kolon${durum(c, 'kolon')}" data-ad="${c.ad}" ${r(X(k.x), Y(k.y), w, hh)}/>`;
    if (adim === 'kolon' || adim === 'temel') h += `<text class="etiket" x="${X(k.x) + w / 2 + 4}" y="${Y(k.y) - hh / 2 - 4}">${adim === 'temel' ? sonuc.temeller.find(t => t.kolon === c.ad).ad : c.ad}</text>`;
  }
  svg.innerHTML = h;
}

// ── Excel tarzı sayfa
function hucre([, , sayi, dg, sinif = ''], e, baski) {
  const [tip, k] = sinif.split(' ');
  const cls = [sayi && 'sayi', tip === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ');
  if (tip === 'giris' && !baski) {
    const v = ozel[e.ad]?.[k]; // hücre her zaman hesaba giren değeri gösterir; özel değer uygulandıysa turuncu
    return `<td class="hucre-gir"><input size="1" data-ad="${e.ad}" data-k="${k}" value="${e[k]}"${v != null && v === e[k] ? ' class="ozel"' : ''} inputmode="decimal" spellcheck="false" aria-label="${e.ad} ${k}, mm"></td>`;
  }
  if (tip === 'dolgu') {
    const v = kul(e);
    if (v == null) return '<td></td>';
    return `<td class="dolgu${v > 1 + 1e-9 ? ' asim' : ''}">${baski ? '' : `<i style="width:${Math.min(v, AZAMI) / AZAMI * 100}%"></i>`}<span>%${Math.round(v * 100)}</span></td>`;
  }
  return `<td${cls ? ` class="${cls}"` : ''}>${dg(e)}</td>`;
}
function tabloHtml(a, baski = false) {
  const spec = SPEC[a], l = sonuc?.[DIZI[a]] ?? [];
  const ad = (s, j) => `<th scope="col"${s[2] || s[4] === 'ayrac' ? ` class="${[s[2] && 'sayi', s[4] === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ')}"` : ''}>${s[0]}</th>`;
  if (baski) return `<table><thead><tr>${spec.map(ad).join('')}</tr></thead><tbody>${l.map(e => `<tr>${spec.map(s => hucre(s, e, true)).join('')}</tr>`).join('')}</tbody></table>`;
  return `<colgroup><col style="width:44px">${spec.map(s => `<col style="width:${s[1]}px">`).join('')}</colgroup>` +
    `<thead><tr class="harfler"><th class="no"></th>${spec.map((s, j) => `<th aria-hidden="true"${s[4] === 'ayrac' ? ' class="sinir-sol"' : ''}>${HARF[j]}</th>`).join('')}</tr>` +
    `<tr class="adlar"><th class="no" aria-hidden="true">1</th>${spec.map(ad).join('')}</tr></thead>` +
    `<tbody>${l.map((e, i) => `<tr data-ad="${e.ad}" tabindex="-1"><th scope="row" class="no">${i + 2}</th>${spec.map(s => hucre(s, e)).join('')}</tr>`).join('')}</tbody>`;
}
function sayfaCiz() {
  const t = $('#sayfa');
  t.style.width = `max(100%, ${44 + SPEC[adim].reduce((a, s) => a + s[1], 0)}px)`;
  t.innerHTML = tabloHtml(adim);
}

function durumCiz() {
  const l = sonuc?.[DIZI[adim]];
  if (!l) { $('#durum-sol').textContent = 'Girdi hatası'; $('#durum-sag').textContent = ''; return; }
  const bad = l.filter(e => !e.gecti).length;
  $('#durum-sol').innerHTML = `${AD[adim][1]} <b>${l.length}</b> · Uygun değil <b>${bad}</b>`;
  $('#durum-sag').innerHTML = `Kat yükü ortalaması (G + Q) <b>${tr(sonuc.katYukAlan, 1)}</b> kN/m²`;
}

function maddeTablosu(e) {
  return `<table class="tablo"><thead><tr><th scope="col">Koşul</th><th scope="col">Değer</th><th scope="col">Sınır</th><th scope="col">Kaynak</th><th scope="col">Kullanım</th><th scope="col"><span class="gizli">Sonuç</span></th></tr></thead><tbody>` +
    e.maddeler.map(x => `<tr><td>${x.ad}</td><td class="olcu">${simge(deger(x))}</td><td class="olcu">${simge(x.sinir)}</td><td class="kaynak">${x.kaynak}</td>` +
      `<td>${x.kullanim == null ? '' : `<span class="kul${x.kullanim > 1 + 1e-9 ? ' asim' : ''}"><i><b style="width:${Math.min(x.kullanim, AZAMI) / AZAMI * 100}%"></b></i>%${Math.round(x.kullanim * 100)}</span>`}</td>` +
      `<td>${x.gecti ? sonucYaz(true, 'Sağlıyor') : x.uyari ? sonucYaz(false, 'Sehim hesabı gerekir', 'uyari') : sonucYaz(false, 'Sağlamıyor')}</td></tr>`).join('') + '</tbody></table>';
}

function secimCiz() {
  const l = sonuc?.[DIZI[adim]] ?? [];
  let e = l.find(x => x.ad === secili);
  if (!e) { e = l.find(x => !x.gecti) ?? l[0]; secili = e?.ad ?? null; }
  for (const tr_ of document.querySelectorAll('#sayfa tbody tr')) {
    const on = tr_.dataset.ad === secili;
    tr_.setAttribute('aria-selected', on); tr_.tabIndex = on ? 0 : -1; tr_.cells[0].classList.toggle('aktif', on);
  }
  document.querySelectorAll('#plan .secili').forEach(x => x.classList.remove('secili'));
  document.querySelectorAll(`#plan [data-ad="${secili}"]`).forEach(x => x.classList.add('secili'));
  $('#ad-kutusu').value = secili ?? '';
  const b = e && belirleyen(e);
  $('#formul').innerHTML = b ? `${b.ad}: ${simge(deger(b))}, ${simge(b.sinir)} <span class="soluk">· ${b.kaynak}</span>` : '';
  $('#ayrinti-baslik').textContent = e ? `${AD[adim][1]} ${e.ad} · ${e.aks} · koşullar` : 'Koşullar';
  $('#ayrinti-not').textContent = e ? (e.gecti ? 'Uygun' : 'Uygun değil') : '';
  $('#ayrinti').innerHTML = e ? maddeTablosu(e) : '<p>Girdi hatasını düzelt.</p>';
  $('#iz').innerHTML = (e?.iz ?? []).map(x => `<li>${simge(x)}</li>`).join('');
}

function adimSec(a, ad = null) {
  if (sayfa.contains(document.activeElement)) document.activeElement.blur(); // düzenlenen hücre yeniden çizimden önce kaydedilsin
  adim = a; secili = ad;
  for (const b of document.querySelectorAll('[role=tab][data-adim]')) {
    const on = b.dataset.adim === a;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
  }
  $('#plan-baslik').textContent = PLAN_BASLIK[a];
  planCiz(); sayfaCiz(); durumCiz(); secimCiz(); satiraKaydir();
}
// Seçili satırı yalnız sayfa kabı içinde görünür yap; pencere kaymasın. 58: yapışkan iki başlık satırı.
function satiraKaydir() {
  const kap = $('.kap'), tr_ = $(`#sayfa tr[data-ad="${secili}"]`); if (!tr_) return;
  const k = kap.getBoundingClientRect(), r = tr_.getBoundingClientRect(), ust = k.top + kap.clientTop + 58, alt = k.top + kap.clientTop + kap.clientHeight;
  if (r.top < ust) kap.scrollTop += r.top - ust;
  else if (r.bottom > alt) kap.scrollTop += r.bottom - alt;
}

// Olaylar
for (const liste_ of document.querySelectorAll('[role=tablist]')) {
  liste_.addEventListener('click', e => { const b = e.target.closest('[data-adim]'); if (b) adimSec(b.dataset.adim); });
  liste_.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const b = [...liste_.querySelectorAll('[data-adim]')], i = b.indexOf(document.activeElement);
    const n = b[(i + (e.key === 'ArrowRight' ? 1 : b.length - 1)) % b.length];
    adimSec(n.dataset.adim); n.focus();
  });
}
// Seçim pointerdown'da: bir kolon hücresinin change olayı yeniden çizmeden önce tıklanan eleman seçilmiş olur.
$('#plan').addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-ad]'); if (!el) return;
  const a = ONEK[el.dataset.ad[0]];
  if (a !== adim) adimSec(a, el.dataset.ad); else { secili = el.dataset.ad; secimCiz(); satiraKaydir(); }
});
const sayfa = $('#sayfa');
sayfa.addEventListener('pointerdown', e => {
  const tr_ = e.target.closest('tbody tr'); if (!tr_) return;
  secili = tr_.dataset.ad; secimCiz();
});
sayfa.addEventListener('click', e => { if (e.target.tagName === 'INPUT') e.target.select(); }); // Excel gibi: yazınca üzerine yazar
sayfa.addEventListener('focusin', e => {
  if (e.target.tagName === 'INPUT') e.target.select();
  const tr_ = e.target.closest('tbody tr');
  if (tr_ && tr_.dataset.ad !== secili) { secili = tr_.dataset.ad; secimCiz(); }
});
sayfa.addEventListener('change', e => {
  const el = e.target; if (!el.dataset.k) return;
  const { ad, k } = el.dataset, v = sayiOku(el.value);
  if (!el.value.trim()) delete ozel[ad]?.[k];
  else if (v > 0 && v <= 5000) (ozel[ad] ??= {})[k] = v;
  else { el.setAttribute('aria-invalid', 'true'); return; }
  if (ozel[ad] && !Object.keys(ozel[ad]).length) delete ozel[ad];
  // Odak yeni hücreye geçtikten sonra yeniden çiz ve odağı aynı hücreye geri koy.
  setTimeout(() => {
    const { ad: a2, k: k2 } = document.activeElement?.dataset ?? {};
    hesapla();
    const el2 = a2 && k2 && $(`#sayfa input[data-ad="${a2}"][data-k="${k2}"]`);
    if (el2) { el2.focus(); el2.select(); }
    else if (document.activeElement === document.body) $(`#sayfa tr[data-ad="${secili}"]`)?.focus({ preventScroll: true });
  });
});
sayfa.addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
  const tr_ = e.target.closest('tbody tr'); if (!tr_) return;
  const yon = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1;
  const hedef = sayfa.tBodies[0].rows[tr_.sectionRowIndex + yon]; if (!hedef) return;
  e.preventDefault();
  if (e.target.tagName === 'INPUT') {
    const el2 = $(`#sayfa input[data-ad="${hedef.dataset.ad}"][data-k="${e.target.dataset.k}"]`);
    el2?.focus(); el2?.select(); // önceki hücrenin change olayı yeniden çizimi sonraya bırakır
  } else { secili = hedef.dataset.ad; secimCiz(); hedef.focus(); }
});
f.addEventListener('submit', e => e.preventDefault());
f.addEventListener('input', hesapla);
// Kolon adları X aks sayısına bağlı (S = j·(nx+1) + i + 1): X aks sayısı kesinleşip değişirse kolona özel boyutlar silinir.
f.ax.addEventListener('change', () => {
  const nx = liste(f.ax.value).length;
  if (nx >= 1 && nx !== agNx) { ozel = {}; agNx = nx; hesapla(); }
});

function kaydet() {
  try { localStorage.setItem(ANAHTAR, JSON.stringify({ form: Object.fromEntries(ALANLAR.map(k => [k, f[k].value])), ozel, ozelNx: agNx })); } catch {}
}
function yukle() {
  try {
    const k = JSON.parse(localStorage.getItem(ANAHTAR));
    for (const a of ALANLAR) if (typeof k?.form?.[a] === 'string') {
      if (f[a].tagName === 'SELECT' && ![...f[a].options].some(o => o.value === k.form[a])) continue;
      f[a].value = k.form[a].slice(0, 120);
    }
    if (k?.ozel && typeof k.ozel === 'object' && k.ozelNx === liste(f.ax.value).length) for (const [ad, o] of Object.entries(k.ozel)) {
      const temiz = Object.fromEntries(['b', 'h'].filter(x => o?.[x] > 0).map(x => [x, +o[x]]));
      if (/^S\d+$/.test(ad) && Object.keys(temiz).length) ozel[ad] = temiz;
    }
  } catch {}
}

$('#yazdir').addEventListener('click', () => print());
addEventListener('beforeprint', () => {
  $('#tarih').textContent = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const g = oku();
  $('#girdi-ozet').innerHTML = `Aks aralıkları X: ${g.ax.map(v => tr(v)).join(' · ')} m; Y: ${g.ay.map(v => tr(v)).join(' · ')} m · ${tr(g.katSayisi, 0)} kat, H ${tr(g.H, 0)} mm · ${g.beton}, ${g.celik} · döşeme ${tr(g.t, 0)} mm, kiriş ${tr(g.kirisB, 0)} × ${tr(g.kirisH, 0)} mm · g ${tr(g.gKaplama)} kN/m², q ${tr(g.q)} kN/m² · duvar dış ${tr(g.duvarDis)}, iç ${tr(g.duvarIc)} kN/m · S<sub>DS</sub> ${tr(g.sds)}, deprem katsayısı ${tr(g.kDeprem)} · zemin q<sub>k</sub> ${tr(g.zemin, 0)} kN/m² (q<sub>t</sub> = q<sub>k</sub>/1,4), temel derinliği ${tr(g.Df)} m.`;
  $('#baski').innerHTML = sonuc ? Object.keys(DIZI).map((a, i) => `<section class="baski-sayfa"><h2>${i + 1}. ${AD[a][1]}</h2>${tabloHtml(a, true)}</section>`).join('') : '';
});

new ResizeObserver(() => planCiz() || secimCiz()).observe($('.plan-alan'));
yukle();
agNx = liste(f.ax.value).length;
hesapla();
adimSec('doseme');
