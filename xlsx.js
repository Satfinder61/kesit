// Bağımlılıksız küçük .xlsx yazıcı: en az OOXML parçası + sıkıştırmasız (STORE) ZIP.
// Tarayıcıda ve Node ≥ 20'de çalışır. Sayılar ham saklanır; görünümünü Excel verir (yerel ayardan bağımsız).
//
// xlsxYap([{ ad, sutunlar: [{ baslik, genislik?, sayi? }], satirlar: [[hücre, …]], not? }], { baslik? }) → Uint8Array
//   hücre: sayı → sayı; metin → metin (HTML etiketi atılır: 'N<sub>d</sub>' → 'Nd'); null/undefined/'' → boş;
//          true/false → 'Evet'/'Hayır'; { v, bicim: '0.00' } → biçimli hücre. NaN boş kalır, ±Infinity '∞'/'−∞' yazılır.
//   sayi: true → o sütundaki tr-TR biçimli metinler ('1.234,5', '−12', '0,25') sayıya çevrilir, kalan metin sağa yaslanır.
//   not → başlığın üstünde tek satır. Başlık kalın ve dolgulu, dondurulmuş, süzgeçli; genişlik verilmezse içerikten (en çok 60).
// indir(veri, dosyaAdi) → tarayıcıda .xlsx indirir; document yoksa hiçbir şey yapmaz.

export const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PK = 'http://schemas.openxmlformats.org/package/2006';
const CT = 'application/vnd.openxmlformats-officedocument.';

// ---------- metin yardımcıları ----------
const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const kodNokta = k => {
  const n = /^#x/i.test(k) ? parseInt(k.slice(2), 16) : Number(k.slice(1));
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
};
// HTML → düz metin: etiketler atılır, <br> boşluk olur, &amp; &#8804; gibi varlıklar çözülür. 'a < b' dokunulmaz.
const duz = s => String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, k) => (k[0] === '#' ? kodNokta(k) : VARLIK[k.toLowerCase()] ?? m));
// XML kaçışı; XML 1.0'da yasak denetim karakterleri atılır.
const xe = s => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const harf = i => (i >= 26 ? harf(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
// tr-TR sayı metni → sayı; değilse null. Noktalı ondalık ('12.5') bilerek çevrilmez: tr-TR'de nokta binlik ayırıcıdır.
const trSayi = s => {
  const t = s.trim().replace(/^[−–]/, '-');
  return /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : null;
};
// Biçimli/biçimsiz sayının ekranda kaplayacağı yaklaşık karakter sayısı (Genel biçim en çok ~11 karakter gösterir).
const sayiUz = (x, b) => (b
  ? x.toFixed(Math.min(20, (b.split('.')[1] ?? '').replace(/[^0#]/g, '').length)).length + (/[,%]/.test(b) ? 2 : 0)
  : Math.min(11, String(x).length));

// Sayfa adları: en çok 31 karakter, []:*?/\ yok, başta/sonda ' yok, büyük-küçük harf duyarsız benzersiz ("Ad (2)").
function sayfaAdlari(sayfalar) {
  const anahtar = a => a.toUpperCase().replace(/İ/g, 'I');
  const kes = (a, n) => a.slice(0, n).replace(/[\ud800-\udbff]$/, '').trim().replace(/^'+|'+$/g, '').trim();
  const gorulen = new Set();
  return sayfalar.map((s, i) => {
    const kok = kes(duz(s.ad ?? '').replace(/[[\]:*?/\\\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, ''), 31)
      || `Sayfa ${i + 1}`;
    let ad = kok;
    for (let k = 2; gorulen.has(anahtar(ad)); k++) ad = `${kes(kok, 31 - ` (${k})`.length)} (${k})`;
    gorulen.add(anahtar(ad));
    return ad;
  });
}

// ---------- ZIP (STORE, CRC-32, UTF-8 adlar: genel amaçlı bit 11) ----------
const CRC = new Uint32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
// [[değer, bayt], …] → küçük-uçlu (little-endian) baytlar
const le = alanlar => {
  const b = new Uint8Array(alanlar.reduce((t, [, n]) => t + n, 0));
  let i = 0;
  for (const [v, n] of alanlar) for (let k = 0; k < n; k++) b[i++] = (v >>> (8 * k)) & 255;
  return b;
};
function zip(dosyalar) {
  const enc = new TextEncoder(), d = new Date(), parca = [], merkez = [];
  const saat = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const gun = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let ofs = 0;
  for (const [ad, veri] of dosyalar) {
    const a = enc.encode(ad), crc = crc32(veri);
    const ortak = [[0x0800, 2], [0, 2], [saat, 2], [gun, 2], [crc, 4], [veri.length, 4], [veri.length, 4], [a.length, 2], [0, 2]];
    parca.push(le([[0x04034b50, 4], [20, 2], ...ortak]), a, veri);
    merkez.push(le([[0x02014b50, 4], [20, 2], [20, 2], ...ortak, [0, 2], [0, 2], [0, 2], [0, 4], [ofs, 4]]), a);
    ofs += 30 + a.length + veri.length;
  }
  const mBoy = merkez.reduce((t, b) => t + b.length, 0);
  const hepsi = [...parca, ...merkez, le([[0x06054b50, 4], [0, 2], [0, 2], [dosyalar.length, 2], [dosyalar.length, 2], [mBoy, 4], [ofs, 4], [0, 2]])];
  const out = new Uint8Array(hepsi.reduce((t, b) => t + b.length, 0));
  hepsi.reduce((p, b) => (out.set(b, p), p + b.length), 0);
  return out;
}

// ---------- çalışma kitabı ----------
export function xlsxYap(sayfalar, { baslik } = {}) {
  if (!sayfalar?.length) sayfalar = [{ ad: 'Sayfa 1' }];
  const sst = new Map(), bicimler = new Map(); // paylaşılan metinler; biçim kodu → sıra (numFmtId 164+)
  let sstSay = 0;
  const si = t => { t = t.slice(0, 32767); sstSay++; if (!sst.has(t)) sst.set(t, sst.size); return sst.get(t); }; // Excel hücre sınırı
  const bicimXf = b => { if (!bicimler.has(b)) bicimler.set(b, bicimler.size); return 5 + bicimler.get(b); };
  const adlar = sayfaAdlari(sayfalar), filtreAdlari = [];

  const sayfaXml = sayfalar.map((s, no) => {
    const sut = s.sutunlar ?? [], satirlar = s.satirlar ?? [], not = s.not == null ? '' : duz(s.not);
    const H = (not ? 1 : 0) + (sut.length ? 1 : 0); // dondurulan satır sayısı; başlık H. satırda
    const n = satirlar.reduce((m, r) => Math.max(m, r?.length ?? 0), sut.length);
    const uz = sut.map(c => duz(c.baslik ?? '').length + 3); // kalın başlık + süzgeç oku payı
    const hucre = (x, k, r) => {
      const sayiSut = sut[k]?.sayi;
      let bicim;
      if (x && typeof x === 'object' && 'v' in x) ({ v: x, bicim } = x);
      if (typeof x === 'boolean') x = x ? 'Evet' : 'Hayır';
      if (typeof x === 'number' && !Number.isFinite(x)) x = Number.isNaN(x) ? null : x > 0 ? '∞' : '−∞';
      if (x != null && typeof x !== 'number') { x = duz(x); if (sayiSut) x = trSayi(x) ?? x; }
      if (x == null || x === '') return '';
      if (typeof x === 'number') {
        uz[k] = Math.max(uz[k] ?? 0, sayiUz(x, bicim));
        return `<c r="${harf(k)}${r}"${bicim ? ` s="${bicimXf(String(bicim))}"` : ''}><v>${x}</v></c>`;
      }
      uz[k] = Math.max(uz[k] ?? 0, ...x.split('\n').map(l => l.length));
      return `<c r="${harf(k)}${r}" t="s"${sayiSut ? ' s="4"' : ''}><v>${si(x)}</v></c>`;
    };
    const satirXml = [];
    if (not) satirXml.push(`<row r="1"><c r="A1" t="s" s="3"><v>${si(not)}</v></c></row>`);
    if (sut.length) satirXml.push(`<row r="${H}">${sut.map((c, k) =>
      `<c r="${harf(k)}${H}" t="s" s="${c.sayi ? 2 : 1}"><v>${si(duz(c.baslik ?? ''))}</v></c>`).join('')}</row>`);
    satirlar.forEach((satir, j) => satirXml.push(`<row r="${H + 1 + j}">${(satir ?? []).map((x, k) => hucre(x, k, H + 1 + j)).join('')}</row>`));

    const gen = Array.from({ length: n }, (_, k) => Math.min(255, sut[k]?.genislik ?? Math.min(60, Math.max(6, (uz[k] ?? 0) + 2))));
    const sonSatir = Math.max(1, H + satirlar.length);
    const bolme = H ? `<pane ySplit="${H}" topLeftCell="A${H + 1}" activePane="bottomLeft" state="frozen"/>`
      + `<selection pane="bottomLeft" activeCell="A${H + 1}" sqref="A${H + 1}"/>` : '';
    let filtre = '';
    if (sut.length) {
      const sonSut = harf(sut.length - 1);
      filtre = `<autoFilter ref="A${H}:${sonSut}${sonSatir}"/>`;
      filtreAdlari.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${no}" hidden="1">`
        + `${xe(`'${adlar[no].replace(/'/g, "''")}'`)}!$A$${H}:$${sonSut}$${sonSatir}</definedName>`);
    }
    return XML + `<worksheet xmlns="${SS}"><dimension ref="A1:${harf(Math.max(n, 1) - 1)}${sonSatir}"/>`
      + `<sheetViews><sheetView workbookViewId="0"${no ? '' : ' tabSelected="1"'}>${bolme}</sheetView></sheetViews>`
      + (n ? `<cols>${gen.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
      + `<sheetData>${satirXml.join('')}</sheetData>${filtre}</worksheet>`;
  });

  // Stiller: 0 düz, 1 başlık, 2 sayı sütunu başlığı (sağa), 3 not (italik gri), 4 sayı sütununda metin (sağa), 5+ sayı biçimleri
  const font = (ek, renk = '') => `<font>${ek}<sz val="11"/>${renk}<name val="Calibri"/><family val="2"/></font>`;
  const xf = ({ f = 0, yazi = 0, dolgu = 0, kenar = 0, sag = false }) =>
    `<xf numFmtId="${f}" fontId="${yazi}" fillId="${dolgu}" borderId="${kenar}" xfId="0"${f ? ' applyNumberFormat="1"' : ''}`
    + `${yazi ? ' applyFont="1"' : ''}${dolgu ? ' applyFill="1"' : ''}${kenar ? ' applyBorder="1"' : ''}`
    + (sag ? ' applyAlignment="1"><alignment horizontal="right"/></xf>' : '/>');
  const xfler = [xf({}), xf({ yazi: 1, dolgu: 2, kenar: 1 }), xf({ yazi: 1, dolgu: 2, kenar: 1, sag: true }), xf({ yazi: 2 }), xf({ sag: true }),
    ...[...bicimler.values()].map(i => xf({ f: 164 + i }))];
  const stiller = XML + `<styleSheet xmlns="${SS}">`
    + (bicimler.size ? `<numFmts count="${bicimler.size}">${[...bicimler].map(([b, i]) => `<numFmt numFmtId="${164 + i}" formatCode="${xe(b)}"/>`).join('')}</numFmts>` : '')
    + `<fonts count="3">${font('')}${font('<b/>')}${font('<i/>', '<color rgb="FF5A6470"/>')}</fonts>`
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF2"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA5B1"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfler.length}">${xfler.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const iliski = r => XML + `<Relationships xmlns="${PK}/relationships">${r.map(([id, tur, hedef]) =>
    `<Relationship Id="${id}" Type="${tur.includes('/') ? tur : `${OD}/${tur}`}" Target="${hedef}"/>`).join('')}</Relationships>`;
  const N = adlar.length, simdi = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const parcalar = {
    '[Content_Types].xml': XML + `<Types xmlns="${PK}/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + `<Override PartName="/xl/workbook.xml" ContentType="${CT}spreadsheetml.sheet.main+xml"/>`
      + adlar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}spreadsheetml.worksheet+xml"/>`).join('')
      + `<Override PartName="/xl/styles.xml" ContentType="${CT}spreadsheetml.styles+xml"/>`
      + `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}spreadsheetml.sharedStrings+xml"/>`
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + `<Override PartName="/docProps/app.xml" ContentType="${CT}extended-properties+xml"/></Types>`,
    '_rels/.rels': iliski([['rId1', 'officeDocument', 'xl/workbook.xml'],
      ['rId2', `${PK}/relationships/metadata/core-properties`, 'docProps/core.xml'], ['rId3', 'extended-properties', 'docProps/app.xml']]),
    'docProps/core.xml': XML + `<cp:coreProperties xmlns:cp="${PK}/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"`
      + ' xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + (baslik ? `<dc:title>${xe(duz(baslik))}</dc:title>` : '') + '<dc:creator>Kesit</dc:creator><cp:lastModifiedBy>Kesit</cp:lastModifiedBy>'
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${simdi}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${simdi}</dcterms:modified></cp:coreProperties>`,
    'docProps/app.xml': XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kesit</Application></Properties>',
    'xl/workbook.xml': XML + `<workbook xmlns="${SS}" xmlns:r="${OD}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>`
      + adlar.map((a, i) => `<sheet name="${xe(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
      + (filtreAdlari.length ? `<definedNames>${filtreAdlari.join('')}</definedNames>` : '') + '</workbook>',
    'xl/_rels/workbook.xml.rels': iliski([...adlar.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]),
      [`rId${N + 1}`, 'styles', 'styles.xml'], [`rId${N + 2}`, 'sharedStrings', 'sharedStrings.xml']]),
    'xl/styles.xml': stiller,
    'xl/sharedStrings.xml': XML + `<sst xmlns="${SS}" count="${sstSay}" uniqueCount="${sst.size}">`
      + [...sst.keys()].map(t => `<si><t xml:space="preserve">${xe(t)}</t></si>`).join('') + '</sst>',
    ...Object.fromEntries(sayfaXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x])),
  };
  const enc = new TextEncoder();
  return zip(Object.entries(parcalar).map(([ad, x]) => [ad, enc.encode(x)]));
}

// Tarayıcıda indirme: geçici <a download> ile. Node'da (document yok) hiçbir şey yapmaz.
export function indir(veri, dosyaAdi = 'kesit.xlsx') {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([veri], { type: MIME }));
  const a = Object.assign(document.createElement('a'), { href: url, download: /\.xlsx$/i.test(dosyaAdi) ? dosyaAdi : `${dosyaAdi}.xlsx` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
