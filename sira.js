// Döşemeden temele sayfası: girdi → zincirHesap → kat planı, Excel tarzı sayfalar, ayrıntı.
import { BETON, sayiOku } from './kurallar.js';
import { zincirHesap, girdiDenetle, CELIK } from './zincir.js';

const $ = s => document.querySelector(s);
const f = $('#f');
const tr = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: d }) : '—';
const olc = x => x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Düz metindeki alt simgeleri (q_k, N_d, fck, ℓn …) HTML'e çevirir
const ALT = [[/δ_(G\+Q|GQ|G|Q)/g, 'δ<sub>$1</sub>'], [/([VMNAeuqpS])_([A-Za-zçğıöşü]+)/g, '$1<sub>$2</sub>'],
  [/fck/g, 'f<sub>ck</sub>'], [/fcd/g, 'f<sub>cd</sub>'], [/fctd/g, 'f<sub>ctd</sub>'], [/fyd/g, 'f<sub>yd</sub>'],
  [/ℓsn/g, 'ℓ<sub>sn</sub>'], [/ℓn/g, 'ℓ<sub>n</sub>'], [/ℓℓ/g, 'ℓ<sub>ℓ</sub>'], [/αs/g, 'α<sub>s</sub>']];
const simge = s => ALT.reduce((a, [r, y]) => a.replace(r, y), String(s));
const birim = sinir => (String(sinir).match(/(kN\/m²|kNm\/m|kNm|kN\/m|kN|mm²|mm|m²|m)\s*(\([^)]*\))?\s*$/) ?? ['', ''])[1]; // sondaki (…) açıklaması atlanır
const deger = x => typeof x.deger === 'string' ? x.deger : `${tr(x.deger)}${birim(x.sinir) ? '\u00a0' + birim(x.sinir) : ''}`;
const IKON = {
  uygun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  degil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  uyari: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5l6 11H2zM8 7v3M8 12v.01"/></svg>',
};
const sonucYaz = (ok, yazi, tip = ok ? 'uygun' : 'degil') => `<span class="sonuc-hucre ${tip}">${IKON[tip]}${yazi}</span>`;
const uyariVar = e => e.maddeler.some(x => x.uyari && !x.gecti);
const AZAMI = 1.2, HARF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TUR_AD = { plak: 'Kirişli plak', kirissiz: 'Kirişsiz', disli: 'Dişli', kaset: 'Kaset' };
const PLAN_BASLIK = { doseme: 'Kat planı · döşeme', kiris: 'Kat planı · kirişler', kolon: 'Kat planı · kolonlar', temel: 'Temel planı · radye' };
const FORM = { katSayisi: 'kat', gKaplama: 'g' };
const ALANLAR = ['ax', 'ay', 'kat', 'H', 'beton', 'celik', 'dosemeTuru', 'disAralik', 'disGen', 'dolgu', 'g', 'q', 'kullanim', 'duvarDis', 'duvarIc', 'sds', 'kDeprem', 'zemin', 'Df', 'tasma'];
const ANAHTAR = 'kesit.sira.v3'; // v3: döşeme türü; kalınlık ve kesitler araçta bulunur

f.beton.innerHTML = Object.keys(BETON).map(k => `<option${k === 'C30' ? ' selected' : ''}>${k}</option>`).join('');
f.celik.innerHTML = Object.keys(CELIK).map(k => `<option${k === 'B420C' ? ' selected' : ''}>${k}</option>`).join('');

let adim = 'doseme', sayfaAd = 'doseme', secili = null, sonuc = null, ozel = {}, agNx = 0;

const belirleyen = e => e.belirleyici ?? e.maddeler.find(x => !x.gecti && !x.uyari) ?? e.maddeler[0];
const kul = e => e.belirleyici?.kullanim;
const sehimYaz = e => e.sehim ? `${tr(e.sehim.deger, 1)} / ${tr(e.sehim.sinir, 1)}` : '—';
const ORTAK = [
  ['Belirleyici koşul', 188, 0, e => belirleyen(e)?.ad ?? '—', 'ayrac'],
  ['Kullanım', 100, 0, null, 'dolgu'],
  ['Sonuç', 132, 0, e => sonucYaz(e.gecti, e.gecti ? 'Uygun' + (uyariVar(e) ? ' <span class="soluk">· not</span>' : '') : 'Uygun değil')],
];
const ADAKS = [['Ad', 56, 0, e => e.ad], ['Aks', 112, 0, e => e.aks]];
const LXY = [['ℓ<sub>x</sub> <small>m</small>', 64, 1, e => tr(e.lx)], ['ℓ<sub>y</sub> <small>m</small>', 64, 1, e => tr(e.ly)]];
const SEHIM = ['Sehim / sınır <small>mm</small>', 132, 1, sehimYaz];
// Sütun: [başlık, genişlik px, sayı mı, değer, sınıf]
const SPEC = {
  doseme: tur => tur === 'kirissiz' ? [...ADAKS, ...LXY,
    ['h <small>mm</small>', 64, 1, e => tr(e.h, 0)], ['g <small>kN/m²</small>', 80, 1, e => tr(e.gAlan)], ['q <small>kN/m²</small>', 80, 1, e => tr(e.qAlan)], SEHIM, ...ORTAK]
  : tur === 'plak' ? [...ADAKS, ...LXY,
    ['Durum', 184, 0, e => e.durum], ['h <small>mm</small>', 64, 1, e => tr(e.h, 0)], ['g <small>kN/m²</small>', 80, 1, e => tr(e.gAlan)],
    ['Kısa alt', 88, 1, e => e.kisaAlt], ['Kısa üst', 88, 1, e => e.kisaUst], ['Uzun alt', 128, 1, e => e.uzunAlt], ['Uzun üst', 88, 1, e => e.uzunUst], SEHIM, ...ORTAK]
  : [...ADAKS, ...LXY,
    ['Diş', 148, 0, e => e.durum], ['h / t <small>mm</small>', 100, 1, e => `${tr(e.h, 0)} / ${tr(e.t, 0)}`], ['g <small>kN/m²</small>', 80, 1, e => tr(e.gAlan)],
    ['Diş alt', 100, 1, e => e.disAlt], ['Diş üst', 100, 1, e => e.disUst], ['Diş etriye', 112, 1, e => e.disEtriye],
    tur === 'kaset' ? ['Dik diş alt', 100, 1, e => e.uzunAlt] : ['Enine diş', 76, 1, e => tr(e.enineDis, 0)],
    ['Tabla', 84, 1, e => e.tabla], SEHIM, ...ORTAK],
  serit: () => [['Ad', 72, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], ['ℓ<sub>1</sub> <small>m</small>', 60, 1, e => tr(e.l1)], ['ℓ<sub>2</sub> <small>m</small>', 60, 1, e => tr(e.l2)],
    ['M<sub>o</sub> <small>kNm</small>', 84, 1, e => tr(e.Mo, 1)], ['Kolon ş. üst', 104, 1, e => e.csUst], ['Kolon ş. alt', 104, 1, e => e.csAlt],
    ['Orta ş. üst', 104, 1, e => e.msUst], ['Orta ş. alt', 104, 1, e => e.msAlt], ...ORTAK],
  zimb: () => [['Ad', 56, 0, e => e.ad], ['Kolon', 96, 0, e => `${e.kolon} · ${e.aks}`], ['V <small>kN</small>', 76, 1, e => tr(e.Nd, 0)], ['d <small>mm</small>', 64, 1, e => tr(e.d, 0)],
    ['u<sub>p</sub> <small>m</small>', 72, 1, e => tr(e.up, 3)], ['γ', 72, 1, e => tr(e.gam, 3)], ['V<sub>pd</sub> <small>kN</small>', 84, 1, e => tr(e.Vpd, 0)],
    ['V<sub>pr</sub> <small>kN</small>', 84, 1, e => tr(e.Vpr, 0)], ...ORTAK],
  kiris: () => [['Ad', 56, 0, e => e.ad], ['Aks', 96, 0, e => e.aks], ['ℓ <small>m</small>', 56, 1, e => tr(e.L)], ['b × h <small>mm</small>', 96, 1, e => `${tr(e.b, 0)} × ${tr(e.h, 0)}`],
    ['M<sub>d</sub> mesnet', 88, 1, e => tr(e.MdMesnet, 1)], ['M<sub>d</sub> açıklık', 88, 1, e => tr(e.MdAcik, 1)], ['V<sub>e</sub> <small>kN</small>', 72, 1, e => tr(e.Ve, 1)],
    ['Üst (mesnet)', 128, 1, e => e.ust], ['Alt (açıklık)', 128, 1, e => e.alt], ['Etriye sarılma', 104, 1, e => e.etrSar], ['Etriye orta', 96, 1, e => e.etrOrta],
    ['Sehim / sınır <small>mm</small>', 120, 1, sehimYaz], ...ORTAK],
  kolon: () => [['Ad', 56, 0, e => e.ad], ['Aks', 56, 0, e => e.aks],
    ['b <small>mm</small>', 72, 1, e => tr(e.b, 0), 'giris b'], ['h <small>mm</small>', 72, 1, e => tr(e.h, 0), 'giris h'],
    ['N<sub>G</sub> <small>kN</small>', 80, 1, e => tr(e.NG, 0)], ['β·N<sub>Q</sub> <small>kN</small>', 84, 1, e => tr(e.NQ, 0)], ['N<sub>d</sub> <small>kN</small>', 80, 1, e => tr(e.Nd, 0)],
    ['Boyuna', 96, 1, e => e.boyuna ?? '—'], ['Etriye sarılma', 104, 1, e => e.etrSar ?? '—'], ['Etriye orta', 96, 1, e => e.etrOrta ?? '—'], ['Kol', 56, 1, e => e.kol ?? '—'], ...ORTAK],
  // İlk satır radyenin kendisi (h, taşma, zemin basıncı), sonrakiler şeritler
  radye: () => [['Ad', 80, 0, e => e.ad], ['Aks', 112, 0, e => e.aks],
    ['ℓ<sub>1</sub> · h', 80, 1, e => e.ad === 'Radye' ? `${tr(e.h, 0)} mm` : tr(e.l1)], ['ℓ<sub>2</sub> · taşma', 88, 1, e => e.ad === 'Radye' ? `${tr(e.a)} m` : tr(e.l2)],
    ['M<sub>o</sub> · q<sub>o</sub>', 100, 1, e => e.ad === 'Radye' ? `${tr(e.qo, 0)} kN/m²` : tr(e.Mo, 1)],
    ['Kolon ş. alt', 104, 1, e => e.csAlt ?? '—'], ['Kolon ş. üst', 104, 1, e => e.csUst ?? '—'], ['Orta ş. alt', 104, 1, e => e.msAlt ?? '—'], ['Orta ş. üst', 104, 1, e => e.msUst ?? '—'], ...ORTAK],
};
// Excel sekmeleri; her biri bir hesap adımına bağlı
const SAYFALAR = [
  { ad: 'doseme', baslik: 'Döşeme', adim: 'doseme', dizi: r => r.dosemeler, spec: r => SPEC.doseme(r.tur) },
  { ad: 'serit', baslik: 'Şeritler', adim: 'doseme', dizi: r => r.seritler, spec: SPEC.serit, goster: r => r.tur === 'kirissiz' },
  { ad: 'zimbD', baslik: 'Zımbalama', adim: 'doseme', dizi: r => r.zimbD, spec: SPEC.zimb, goster: r => r.tur === 'kirissiz' },
  { ad: 'kiris', baslik: 'Kiriş', adim: 'kiris', dizi: r => r.kirisler, spec: SPEC.kiris, goster: r => r.tur !== 'kirissiz' },
  { ad: 'kolon', baslik: 'Kolon', adim: 'kolon', dizi: r => r.kolonlar, spec: SPEC.kolon },
  { ad: 'radye', baslik: 'Radye', adim: 'temel', dizi: r => [r.radye, ...r.radyeSerit], spec: SPEC.radye },
  { ad: 'radyeZ', baslik: 'Radye zımbalama', adim: 'temel', dizi: r => r.radyeZimb, spec: SPEC.zimb },
];
const gorunur = () => SAYFALAR.filter(s => !s.goster || s.goster({ tur: f.dosemeTuru.value })); // girdi hatasında da sekmeler yerinde kalsın
const aktif = () => SAYFALAR.find(s => s.ad === sayfaAd);
const ONEK = { D: 'doseme', K: 'kiris', S: 'kolon', Z: 'zimbD', T: 'radyeZ' }; // plan öğesi ön eki → sayfa

const liste = v => v.trim() ? v.trim().split(/[\s;/]+/).map(sayiOku) : [];
function oku() {
  const n = k => sayiOku(f[k].value);
  return { ax: liste(f.ax.value), ay: liste(f.ay.value), katSayisi: n('kat'), H: n('H'), beton: f.beton.value, celik: f.celik.value,
    dosemeTuru: f.dosemeTuru.value, disAralik: n('disAralik'), disGen: n('disGen'), dolgu: n('dolgu'), dosemeDuvar: f.dosemeDuvar.checked,
    gKaplama: n('g'), q: n('q'), kullanim: f.kullanim.value, duvarDis: n('duvarDis'), duvarIc: n('duvarIc'), sds: n('sds'), kDeprem: n('kDeprem'),
    zemin: n('zemin'), Df: n('Df'), tasma: n('tasma') };
}

function hesapla() {
  const g = oku(), hata = girdiDenetle(g);
  $('#dis-alanlari').hidden = !(g.dosemeTuru === 'disli' || g.dosemeTuru === 'kaset');
  for (const k of ALANLAR) f[k].removeAttribute('aria-invalid');
  for (const k of Object.keys(hata)) f[FORM[k] ?? k]?.setAttribute('aria-invalid', 'true');
  const var_ = Object.keys(hata).length > 0, hataYazi = var_ ? `<b>Girdi hatası.</b> ${Object.values(hata).map(simge).join(' · ')}` : '';
  $('#hata').hidden = !var_;
  if ($('#hata').innerHTML !== hataYazi) $('#hata').innerHTML = hataYazi; // role=alert: her tuşta yeniden okunmasın
  sonuc = var_ ? null : zincirHesap({ ...g, kolonOzel: g.ax.length === agNx ? ozel : {} }); // X aks sayısı yazılırken eski adlar kaymasın
  $('.adimlar [data-adim="kiris"]').disabled = g.dosemeTuru === 'kirissiz';
  $('.lejant span').hidden = g.dosemeTuru === 'kirissiz'; // kirişsizde plan lejantında kiriş yok
  if (!gorunur().some(s => s.ad === sayfaAd)) { // ör. Kiriş adımındayken kirişsiz seçildi: aynı adımın başka sayfası, yoksa döşeme
    sayfaAd = gorunur().find(s => s.adim === adim)?.ad ?? 'doseme'; adim = aktif().adim; adimCiz();
  }
  ozetCiz(); ciz(); kaydet();
}
let bekle = 0; // yazarken her tuşta değil, 150 ms durunca hesapla (büyük ağda hesap 0,1–0,5 s)
const hesaplaGeciktir = () => { clearTimeout(bekle); bekle = setTimeout(() => { bekle = 0; hesapla(); }, 150); };
const hesaplaSimdi = () => { if (bekle) { clearTimeout(bekle); bekle = 0; hesapla(); } };
function adimCiz() {
  for (const b of document.querySelectorAll('.adimlar [data-adim]')) {
    const on = b.dataset.adim === adim;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
  }
  $('#plan-baslik').textContent = PLAN_BASLIK[adim];
}
const ciz = () => { sekmeCiz(); planCiz(); sayfaCiz(); durumCiz(); secimCiz(); };

function ozetCiz() {
  for (const a of ['doseme', 'kiris', 'kolon', 'temel']) {
    const el = $('#ozet-' + a);
    if (!sonuc) { el.textContent = '—'; el.classList.remove('degil'); continue; }
    const bad = gorunur().filter(s => s.adim === a).flatMap(s => s.dizi(sonuc)).filter(e => !e.gecti).length;
    const yok = a === 'kiris' && sonuc.tur === 'kirissiz';
    el.textContent = (a === 'doseme' ? `${TUR_AD[sonuc.tur]} h = ${sonuc.h} mm` : yok ? 'kirişsiz döşeme: kiriş yok'
      : a === 'kiris' ? `${sonuc.kirisler.length} kiriş` : a === 'kolon' ? `${sonuc.kolonlar.length} kolon` : `radye h = ${sonuc.radye.h} mm`)
      + (yok ? '' : ` · ${bad ? bad + ' uygun değil' : 'tümü uygun'}`);
    el.classList.toggle('degil', bad > 0);
  }
  $('#notlar').innerHTML = (sonuc?.notlar ?? []).map(n => `<li>${simge(n)}</li>`).join('');
}

function sekmeCiz() {
  $('.sekmeler-alt').innerHTML = gorunur().map(s => `<button type="button" role="tab" aria-controls="sayfa" data-sayfa="${s.ad}" aria-selected="${s.ad === sayfaAd}" tabindex="${s.ad === sayfaAd ? 0 : -1}">${s.baslik}</button>`).join('');
}

// ── Kat planı (SVG, Y aksı yukarı). Temel adımında radye taşması kadar dış pay bırakılır.
function planCiz() {
  const svg = $('#plan');
  svg.dataset.adim = adim;
  if (!sonuc) { svg.innerHTML = ''; svg.removeAttribute('viewBox'); return; }
  const { ag } = sonuc, W = ag.xs.at(-1), Hh = ag.ys.at(-1), a = adim === 'temel' ? sonuc.radye.a : 0;
  const gen = Math.max(320, svg.clientWidth || 760);
  const s = Math.min((gen - 178) / (W + 2 * a), Math.max(260, gen * .55) / (Hh + 2 * a)), as = a * s;
  const ox = 72 + as, oy = 50 + as;
  svg.setAttribute('viewBox', `0 0 ${((W + 2 * a) * s + 178).toFixed(1)} ${((Hh + 2 * a) * s + 116).toFixed(1)}`);
  const X = x => ox + x * s, Y = y => oy + (Hh - y) * s, mm = (v, en = 3) => Math.max(en, v / 1000 * s);
  const r = (cx, cy, w, h) => `x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"`;
  const durum = (e, sayfalar) => e && sayfalar.includes(sayfaAd) && !e.gecti ? ' degil' : '';
  let h = '';
  ag.xs.forEach((x, i) => { h += `<line class="aks" x1="${X(x)}" y1="${oy - 20 - as}" x2="${X(x)}" y2="${Y(0) + 16 + as}"/><g class="balon"><circle cx="${X(x)}" cy="${oy - 32 - as}" r="11"/><text x="${X(x)}" y="${oy - 32 - as}">${i + 1}</text></g>`; });
  ag.ys.forEach((y, j) => { h += `<line class="aks" x1="${ox - 20 - as}" y1="${Y(y)}" x2="${X(W) + 16 + as}" y2="${Y(y)}"/><g class="balon"><circle cx="${ox - 32 - as}" cy="${Y(y)}" r="11"/><text x="${ox - 32 - as}" y="${Y(y)}">${HARF[j]}</text></g>`; });
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
  svg.innerHTML = h;
}

// ── Excel tarzı sayfa
function hucre([, , sayi, dg, sinif = ''], e, baski) {
  const [tip, k] = sinif.split(' ');
  const cls = [sayi && 'sayi', tip === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ');
  if (tip === 'giris' && baski) return `<td class="sayi">${tr(e[k], 0)}${e.ozel ? ' (elle)' : ''}</td>`;
  if (tip === 'giris') {
    const v = ozel[e.ad]?.[k]; // hücre her zaman hesaba giren değeri gösterir; özel değer uygulandıysa turuncu
    return `<td class="hucre-gir"><input size="1" data-ad="${e.ad}" data-k="${k}" value="${e[k]}"${v != null && v === e[k] ? ' class="ozel"' : ''} inputmode="decimal" spellcheck="false" aria-label="${e.ad} ${k}, mm"></td>`;
  }
  if (tip === 'dolgu') {
    const v = kul(e);
    if (v == null) return '<td></td>';
    if (!Number.isFinite(v)) return '<td class="dolgu">—</td>';
    return `<td class="dolgu${v > 1 + 1e-9 ? ' asim' : ''}">${baski ? '' : `<i style="width:${Math.min(v, AZAMI) / AZAMI * 100}%"></i>`}<span>%${Math.round(v * 100)}</span></td>`;
  }
  return `<td${cls ? ` class="${cls}"` : ''}>${dg(e)}</td>`;
}
function tabloHtml(sf, baski = false) {
  const spec = sf.spec(sonuc), l = sf.dizi(sonuc);
  const ad = s => `<th scope="col"${s[2] || s[4] === 'ayrac' ? ` class="${[s[2] && 'sayi', s[4] === 'ayrac' && 'sinir-sol'].filter(Boolean).join(' ')}"` : ''}>${s[0]}</th>`;
  if (baski) return `<table><thead><tr>${spec.map(ad).join('')}</tr></thead><tbody>${l.map(e => `<tr>${spec.map(s => hucre(s, e, true)).join('')}</tr>`).join('')}</tbody></table>`;
  return `<colgroup><col style="width:2.75rem">${spec.map(s => `<col style="width:${s[1] / 16}rem">`).join('')}</colgroup>` + // rem: tema yazı boyutuyla büyür
    `<thead><tr class="harfler"><th class="no"></th>${spec.map((s, j) => `<th aria-hidden="true"${s[4] === 'ayrac' ? ' class="sinir-sol"' : ''}>${HARF[j]}</th>`).join('')}</tr>` +
    `<tr class="adlar"><th class="no" aria-hidden="true">1</th>${spec.map(ad).join('')}</tr></thead>` +
    `<tbody>${l.map((e, i) => `<tr data-ad="${e.ad}" tabindex="-1"><th scope="row" class="no">${i + 2}</th>${spec.map(s => hucre(s, e)).join('')}</tr>`).join('')}</tbody>`;
}
function sayfaCiz() {
  const t = $('#sayfa');
  if (!sonuc) { t.innerHTML = ''; return; }
  t.style.width = `max(100%, ${(44 + aktif().spec(sonuc).reduce((a, s) => a + s[1], 0)) / 16}rem)`;
  t.setAttribute('role', 'grid'); t.setAttribute('aria-label', `${aktif().baslik} sayfası`); // satırlarda aria-selected var
  t.innerHTML = tabloHtml(aktif());
}

function durumCiz() {
  if (!sonuc) { $('#durum-sol').textContent = 'Girdi hatası'; $('#durum-sag').textContent = ''; return; }
  const l = aktif().dizi(sonuc), bad = l.filter(e => !e.gecti).length;
  $('#durum-sol').innerHTML = `${aktif().baslik} <b>${l.length}</b> · Uygun değil <b>${bad}</b>${sayfaAd === 'kolon' ? ' · b, h hücresine yaz: elle boyut, sil: otomatik' : ''}`;
  $('#durum-sag').innerHTML = `Kat yükü ortalaması (G + Q) <b>${tr(sonuc.katYukAlan, 1)}</b> kN/m² · β = <b>${tr(sonuc.beta)}</b>`;
}

function maddeTablosu(e) {
  return `<table class="tablo"><thead><tr><th scope="col">Koşul</th><th scope="col">Değer</th><th scope="col">Sınır</th><th scope="col">Kaynak</th><th scope="col">Kullanım</th><th scope="col"><span class="gizli">Sonuç</span></th></tr></thead><tbody>` +
    e.maddeler.map(x => `<tr><td>${x.ad}</td><td class="olcu">${simge(deger(x))}</td><td class="olcu">${simge(x.sinir)}</td><td class="kaynak">${x.kaynak}</td>` +
      `<td>${x.kullanim == null ? '' : !Number.isFinite(x.kullanim) ? '—' : `<span class="kul${x.kullanim > 1 + 1e-9 ? ' asim' : ''}"><i><b style="width:${Math.min(x.kullanim, AZAMI) / AZAMI * 100}%"></b></i>%${Math.round(x.kullanim * 100)}</span>`}</td>` +
      `<td>${x.gecti ? sonucYaz(true, 'Sağlıyor') : x.uyari ? sonucYaz(false, 'Not', 'uyari') : sonucYaz(false, 'Sağlamıyor')}</td></tr>`).join('') + '</tbody></table>';
}

function secimCiz() {
  const l = sonuc ? aktif().dizi(sonuc) : [];
  let e = l.find(x => x.ad === secili);
  if (!e && sonuc) { e = l.find(x => !x.gecti) ?? l[0]; secili = e?.ad ?? null; } // girdi hatasında seçim korunur
  for (const tr_ of document.querySelectorAll('#sayfa tbody tr')) {
    const on = tr_.dataset.ad === secili;
    tr_.setAttribute('aria-selected', on); tr_.tabIndex = on ? 0 : -1; tr_.cells[0].classList.toggle('aktif', on);
  }
  document.querySelectorAll('#plan .secili').forEach(x => x.classList.remove('secili'));
  document.querySelectorAll(`#plan [data-ad="${secili}"]`).forEach(x => x.classList.add('secili'));
  $('#ad-kutusu').value = secili ?? '';
  const b = e && belirleyen(e);
  $('#formul').innerHTML = b ? `${b.ad}: ${simge(deger(b))}, ${simge(b.sinir)} <span class="soluk">· ${b.kaynak}</span>` : '';
  $('#ayrinti-baslik').textContent = e ? `${aktif().baslik} ${e.ad} · ${e.aks} · koşullar` : 'Koşullar';
  $('#ayrinti-not').textContent = e ? (e.gecti ? 'Uygun' : 'Uygun değil') : '';
  $('#ayrinti').innerHTML = e ? maddeTablosu(e) : `<p>${sonuc ? 'Bu sayfada satır yok.' : 'Girdi hatasını düzelt.'}</p>`;
  $('#iz').innerHTML = (e?.iz ?? []).map(x => `<li>${simge(x)}</li>`).join('');
}

// Sayfa seç; başka adıma aitse adımı da değiştir. Düzenlenen hücre yeniden çizimden önce kaydedilsin diye odak bırakılır.
// Destek varsa ve hareket azaltılmadıysa View Transitions ile (gecis.css); DOM güncellenince çözülen söz döner.
const azHareket = matchMedia('(prefers-reduced-motion: reduce)');
let gecis = null;
function sayfaSec(ad, sec = null) {
  if (sayfa.contains(document.activeElement)) document.activeElement.blur();
  const sf = SAYFALAR.find(s => s.ad === ad), sira = s => SAYFALAR.findIndex(x => x.ad === s);
  const tur = ad === sayfaAd ? null : sf.adim === adim ? 'sekme' : 'adim', yon = sira(ad) > sira(sayfaAd) ? 'ileri' : 'geri';
  sayfaAd = ad; secili = sec; adim = sf.adim; // durum hemen; çizim geçiş içinde (bekleyen geçiş de son durumu çizer)
  const guncelle = () => { adimCiz(); ciz(); satiraKaydir(); };
  gecis?.skipTransition();
  if (!tur || !document.startViewTransition || azHareket.matches || document.documentElement.dataset.hareket === 'az') { guncelle(); return Promise.resolve(); }
  const h = document.documentElement.dataset;
  h.vt = tur; h.vtYon = yon;
  const vt = gecis = document.startViewTransition(guncelle);
  vt.ready.catch(() => {}); // atlanan geçiş (hızlı ardışık tıklama, gizli sekme) ready'yi reddeder; güncelleme yine çalışır
  vt.finished.finally(() => { if (gecis === vt) { gecis = null; delete h.vt; delete h.vtYon; } });
  return vt.updateCallbackDone;
}
const adimSec = a => sayfaSec(gorunur().find(s => s.adim === a)?.ad ?? 'doseme');
// Seçili satırı yalnız sayfa kabı içinde görünür yap; pencere kaymasın. 58: yapışkan iki başlık satırı.
function satiraKaydir() {
  const kap = $('.kap'), tr_ = $(`#sayfa tr[data-ad="${secili}"]`); if (!tr_) return;
  const k = kap.getBoundingClientRect(), r = tr_.getBoundingClientRect(), ust = k.top + kap.clientTop + 58, alt = k.top + kap.clientTop + kap.clientHeight;
  if (r.top < ust) kap.scrollTop += r.top - ust;
  else if (r.bottom > alt) kap.scrollTop += r.bottom - alt;
}

// Olaylar
// Sıra durumdan okunur: geçişte aria-selected sonradan güncellenir, aynı karede iki basış da ilerlesin
const sekmeOk = (liste_, sec, al, git, simdi) => liste_.addEventListener('keydown', async e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const b = [...liste_.querySelectorAll(sec + ':not(:disabled)')], i = b.findIndex(x => al(x) === simdi());
  const n = al(b[(i + (e.key === 'ArrowRight' ? 1 : b.length - 1)) % b.length]);
  await git(n); liste_.querySelector(`[aria-selected="true"]`)?.focus(); // geçişte DOM sonradan güncellenir
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
sekmeOk(sekmeListe, '[data-sayfa]', b => b.dataset.sayfa, sayfaSec, () => sayfaAd);
// Seçim pointerdown'da: bir kolon hücresinin change olayı yeniden çizmeden önce tıklanan eleman seçilmiş olur.
$('#plan').addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-ad]'); if (!el) return;
  const ad = el.dataset.ad, sf = ad === 'Radye' ? 'radye' : ONEK[ad[0]];
  if (!sf) return;
  if (sf !== sayfaAd) return sayfaSec(sf, ad);
  secili = ad; secimCiz(); satiraKaydir();
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
const sayfa = $('#sayfa');
sayfa.addEventListener('pointerdown', e => {
  const tr_ = e.target.closest('tbody tr'); if (!tr_) return;
  secili = tr_.dataset.ad; secimCiz();
});
sayfa.addEventListener('mouseup', e => { if (e.target.tagName === 'INPUT') { e.preventDefault(); e.target.select(); } }); // Excel gibi: tıklanan hücre tümüyle seçilir, yazınca üzerine yazar
sayfa.addEventListener('focusin', e => {
  if (e.target.tagName === 'INPUT') e.target.select();
  const tr_ = e.target.closest('tbody tr');
  if (tr_ && tr_.dataset.ad !== secili) { secili = tr_.dataset.ad; secimCiz(); }
});
sayfa.addEventListener('change', e => {
  const el = e.target; if (!el.dataset.k) return;
  const { ad, k } = el.dataset, v = sayiOku(el.value);
  if (!el.value.trim()) delete ozel[ad]; // boş bırakılan hücre kolonu yeniden otomatik boyutlandırır
  else if (v >= 100 && v <= 5000) {
    // Bir kenar girilince öbürü o anki değerle sabitlenir: elle boyutlanan kolon araçça büyütülmez
    const c = sonuc.kolonlar.find(x => x.ad === ad);
    ozel[ad] = { b: c.b, h: c.h, ...ozel[ad], [k]: v };
  } else {
    el.setAttribute('aria-invalid', 'true');
    $('#durum-sol').textContent = `${ad} ${k}: 100–5.000 mm arası bir değer gir`;
    return;
  }
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
f.addEventListener('input', hesaplaGeciktir);
// Kolon adları X aks sayısına bağlı (S = j·(nx+1) + i + 1): X aks sayısı kesinleşip değişirse kolona özel boyutlar silinir.
f.ax.addEventListener('change', () => {
  const nx = liste(f.ax.value).length;
  if (!girdiDenetle(oku()).ax && nx !== agNx) { ozel = {}; agNx = nx; clearTimeout(bekle); bekle = 0; hesapla(); } // geçersiz giriş elle boyutları silmesin
});

function kaydet() {
  try { localStorage.setItem(ANAHTAR, JSON.stringify({ form: Object.fromEntries(ALANLAR.map(k => [k, f[k].value])), duvar: f.dosemeDuvar.checked, ozel, ozelNx: agNx })); } catch {}
}
function yukle() {
  try {
    const k = JSON.parse(localStorage.getItem(ANAHTAR));
    for (const a of ALANLAR) if (typeof k?.form?.[a] === 'string') {
      if (f[a].tagName === 'SELECT' && ![...f[a].options].some(o => o.value === k.form[a])) continue;
      f[a].value = k.form[a].slice(0, 120);
    }
    if (typeof k?.duvar === 'boolean') f.dosemeDuvar.checked = k.duvar;
    if (k?.ozel && typeof k.ozel === 'object' && k.ozelNx === liste(f.ax.value).length) for (const [ad, o] of Object.entries(k.ozel)) {
      const temiz = Object.fromEntries(['b', 'h'].filter(x => o?.[x] >= 100 && o?.[x] <= 5000).map(x => [x, +o[x]]));
      if (/^S\d+$/.test(ad) && Object.keys(temiz).length) ozel[ad] = temiz;
    }
  } catch {}
}

$('#yazdir').addEventListener('click', () => print());
addEventListener('beforeprint', () => {
  if (sayfa.contains(document.activeElement)) { document.activeElement.blur(); hesapla(); } // düzenlenen hücre çıktıya girsin
  hesaplaSimdi(); planOlc(); // tema.js yazı boyutunu baskı için %100'e çekti: plan o genişlikle
  document.querySelectorAll('#plan .secili').forEach(x => x.classList.remove('secili')); // raporda seçim vurgusu olmasın (afterprint → planOlc geri koyar)
  $('#tarih').textContent = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const g = oku();
  $('#girdi-ozet').innerHTML = `Aks aralıkları X: ${g.ax.map(v => tr(v)).join(' · ')} m; Y: ${g.ay.map(v => tr(v)).join(' · ')} m · ${tr(g.katSayisi, 0)} kat, H ${tr(g.H, 0)} mm · ${g.beton}, ${g.celik} · ${TUR_AD[g.dosemeTuru].toLowerCase()} döşeme${sonuc ? `, h ${sonuc.h} mm` : ''}${g.dosemeTuru === 'disli' || g.dosemeTuru === 'kaset' ? ` (diş aralığı ${tr(g.disAralik, 0)} mm, diş genişliği ${tr(g.disGen, 0)} mm, dolgu ${tr(g.dolgu)} kN/m²)` : ''}, bölme duvar ${g.dosemeDuvar ? 'var (sehim ℓ<sub>n</sub>/480)' : 'yok (ℓ<sub>n</sub>/360)'} · kullanım: ${f.kullanim.selectedOptions[0].text}${sonuc ? ` (β ${tr(sonuc.beta)})` : ''} · g ${tr(g.gKaplama)} kN/m², q ${tr(g.q)} kN/m² · duvar dış ${tr(g.duvarDis)}, iç ${tr(g.duvarIc)} kN/m · S<sub>DS</sub> ${tr(g.sds)}, deprem katsayısı ${tr(g.kDeprem)} · zemin q<sub>k</sub> ${tr(g.zemin, 0)} kN/m² (q<sub>t</sub> = q<sub>k</sub>/1,4), temel derinliği ${tr(g.Df)} m, radye taşması ≥ ${tr(g.tasma)} m.`;
  $('#baski').innerHTML = sonuc ? gorunur().map((s, i) => `<section class="baski-sayfa"><h2>${i + 1}. ${s.baslik}</h2>${tabloHtml(s, true)}</section>`).join('') : '';
});

const planOlc = () => { planCiz(); secimCiz(); }; // plan ekrandaki genişliğe göre çizilir
addEventListener('afterprint', planOlc);
new ResizeObserver(planOlc).observe($('.plan-alan'));
yukle();
agNx = liste(f.ax.value).length;
hesapla();
adimSec('doseme');
