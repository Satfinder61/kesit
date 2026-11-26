// Çalıştır: node xlsx.test.mjs   (çıktı klasörü XLSX_TEST_DIR; verilmezse geçici klasör)
// Denetimler: ZIP yapısı (JS), unzip -t, Python zipfile + XML iyi biçimlilik, openpyxl ile içerik, varsa LibreOffice → csv.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { xlsxYap, indir, MIME } from './xlsx.js';

const dir = process.env.XLSX_TEST_DIR || mkdtempSync(join(tmpdir(), 'kesit-xlsx-'));
mkdirSync(dir, { recursive: true });
const calistir = (komut, args) => spawnSync(komut, args, { encoding: 'utf8', timeout: 300000 });
const varMi = komut => calistir('sh', ['-c', `command -v ${komut}`]).status === 0;

// ---------- örnek çalışma kitabı: 3 sayfa ----------
const uzunMetin = 'Kiriş açıklığı ℓ = 6,0 m; sehim δ ≤ ℓ/300; boyuna donatı oranı ρ ≥ ρmin; kesme kuvveti Vd ≤ 0,22·fcd·bw·d'.repeat(2);
const sayfalar = [
  {
    ad: 'Döşeme',
    not: 'Ön boyutlandırma — TS 500 / TBDY 2018; ℓ ≤ 4 m, δ ≤ ℓ/300',
    sutunlar: [{ baslik: 'Döşeme' }, { baslik: 'h (mm)', sayi: true, genislik: 12 }, { baslik: 'ρ (%)', sayi: true },
      { baslik: 'σ<sub>c</sub> (MPa)', sayi: true }, { baslik: 'Uygun mu?' }, { baslik: 'Açıklama' }],
    satirlar: [
      ['D1 — iç açıklık', 120, { v: 0.0035, bicim: '0.00%' }, '1.234,5', true, 'φ8/160 alt, φ8/200 üst; As ≥ 314 mm²'],
      ['D2 kenar', 140, null, '—', false, 'ÇĞİÖŞÜ çğıöşü «a < b & c > d»'],
      ['D3', undefined, 0.25, -12.75, '', ''],
      ['Ön <b>kalın</b> &amp; x', Infinity, NaN, { v: 3.14159, bicim: '0.00' }, null, 'iki\nsatır'],
    ],
  },
  {
    ad: 'Kiriş/Kolon: [ön] boyutlandırma ve donatı özeti tablosu', // uzun ve yasak karakterli ad
    sutunlar: [{ baslik: 'Kiriş' }, { baslik: 'N<sub>d</sub> (kN)', sayi: true }, { baslik: 'M<sub>d</sub> (kNm)', sayi: true },
      { baslik: 'b×h (mm)' }, { baslik: 'ℓ<sub>n</sub> / δ' }, { baslik: 'Not' }],
    satirlar: Array.from({ length: 30 }, (_, i) =>
      [`K${i + 1}`, 100 + i * 12.5, i % 3 ? -(i * 7.25) : 0, '250×500', i % 5 ? null : 'ℓ/δ ≥ 300', i === 7 ? uzunMetin : undefined]),
  },
  {
    ad: 'döşeme', // 1. sayfayla büyük-küçük harf duyarsız aynı → 'döşeme (2)'
    sutunlar: [{ baslik: 'Kat' }, { baslik: 'q (kN/m²)', sayi: true }, { baslik: 'Not' }],
    satirlar: [[null, undefined, ''], ['Zemin', '5,5', 'İğne ılık; I ı İ i']],
  },
];
const baslik = 'Kesit — ön boyutlandırma çıktısı';
const veri = xlsxYap(sayfalar, { baslik });
assert.ok(veri instanceof Uint8Array && veri.length > 1000);
const dosya = join(dir, 'kesit-test.xlsx');
writeFileSync(dosya, veri);

// ---------- JS: ZIP merkez dizini (STORE, bit 11, parça listesi) ----------
const dv = new DataView(veri.buffer, veri.byteOffset, veri.byteLength), son = veri.length - 22;
assert.equal(dv.getUint32(son, true), 0x06054b50);
const girdiler = [];
for (let i = 0, p = dv.getUint32(son + 16, true); i < dv.getUint16(son + 10, true); i++) {
  assert.equal(dv.getUint32(p, true), 0x02014b50);
  assert.equal(dv.getUint16(p + 8, true) & 0x0800, 0x0800, 'UTF-8 bayrağı (bit 11)');
  assert.equal(dv.getUint16(p + 10, true), 0, 'STORE');
  const nl = dv.getUint16(p + 28, true);
  girdiler.push(new TextDecoder().decode(veri.subarray(p + 46, p + 46 + nl)));
  p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
}
assert.deepEqual(girdiler.slice(0, 8), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml',
  'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml']);
assert.deepEqual(girdiler.slice(8), [1, 2, 3].map(i => `xl/worksheets/sheet${i}.xml`));

// ---------- JS: sayfa adı kuralları (STORE olduğu için workbook.xml düz metin olarak okunabilir) ----------
const adGir = ['Ad', 'ad', 'AD', '', 'x'.repeat(40), 'x'.repeat(40), "'Tırnak'", 'a?b*c', 'Sayfa 4', 'İnce', 'ince', 'ınce', 'K<sub>1</sub>'];
const adCik = [...new TextDecoder().decode(xlsxYap(adGir.map(ad => ({ ad })))).matchAll(/<sheet name="([^"]*)"/g)].map(m => m[1]);
assert.deepEqual(adCik, ['Ad', 'ad (2)', 'AD (3)', 'Sayfa 4', 'x'.repeat(31), `${'x'.repeat(27)} (2)`, 'Tırnak', 'a b c', 'Sayfa 4 (2)',
  'İnce', 'ince (2)', 'ınce (3)', 'K1']);
assert.ok(adCik.every(a => a.length <= 31));
assert.ok(xlsxYap([]).length > 0); // boş liste → tek boş sayfa

// ---------- JS: indir (Node'da sessiz; sahte document ile tıklama) ----------
assert.equal(indir(veri, 'x'), undefined);
let tiklanan;
globalThis.document = { createElement: () => ({ click() { tiklanan = this; }, remove() {} }), body: { appendChild() {} } };
indir(veri, 'rapor');
delete globalThis.document;
assert.equal(tiklanan.download, 'rapor.xlsx');
assert.match(tiklanan.href, /^blob:/);
assert.equal(MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

// ---------- unzip -t ----------
if (varMi('unzip')) {
  const r = calistir('unzip', ['-t', dosya]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No errors detected/);
  console.log('unzip -t: hata yok');
} else console.log('not: unzip bulunamadı, atlandı');

// ---------- Python: zipfile + XML (stdlib), ardından openpyxl ----------
const bek = {
  adlar: ['Döşeme', 'Kiriş Kolon ön boyutlandırma ve', 'döşeme (2)'],
  baslik,
  sayfalar: [
    { ad: 'Döşeme', donma: 'A3', filtre: 'A2:F6', baslikSatiri: 2, genislik: { B: 12, F: 38 }, // F: en uzun metin 36 karakter + 2
      bicim: { C3: '0.00%', D6: '0.00' },
      hucre: { A1: sayfalar[0].not, A2: 'Döşeme', D2: 'σc (MPa)', B3: 120, C3: 0.0035, D3: 1234.5, E3: 'Evet',
        F3: 'φ8/160 alt, φ8/200 üst; As ≥ 314 mm²', C4: null, D4: '—', E4: 'Hayır', F4: 'ÇĞİÖŞÜ çğıöşü «a < b & c > d»',
        B5: null, C5: 0.25, D5: -12.75, E5: null, F5: null, A6: 'Ön kalın & x', B6: '∞', C6: null, D6: 3.14159, F6: 'iki\nsatır' } },
    { ad: 'Kiriş Kolon ön boyutlandırma ve', donma: 'A2', filtre: 'A1:F31', baslikSatiri: 1, genislik: { F: 60 },
      hucre: { B1: 'Nd (kN)', C1: 'Md (kNm)', D1: 'b×h (mm)', E1: 'ℓn / δ', A2: 'K1', B2: 100, C2: 0, B31: 462.5, C31: -210.25,
        D31: '250×500', E2: 'ℓ/δ ≥ 300', E3: null, F9: uzunMetin } },
    { ad: 'döşeme (2)', donma: 'A2', filtre: 'A1:C3', baslikSatiri: 1,
      hucre: { A1: 'Kat', B1: 'q (kN/m²)', A2: null, B2: null, C2: null, A3: 'Zemin', B3: 5.5, C3: 'İğne ılık; I ı İ i' } },
  ],
};
const PY = String.raw`
import sys, json, zipfile, xml.etree.ElementTree as ET
yol, bek = sys.argv[1], json.loads(sys.argv[2])
z = zipfile.ZipFile(yol)
assert z.testzip() is None
ct = z.read('[Content_Types].xml').decode('utf-8')
for i in z.infolist():
    assert i.compress_type == zipfile.ZIP_STORED and i.flag_bits & 0x800, i.filename
    ET.fromstring(z.read(i.filename))
    if i.filename.endswith('.xml') and i.filename != '[Content_Types].xml':
        assert 'PartName="/%s"' % i.filename in ct, i.filename
print('python zipfile + xml: %d parça, CRC ve iyi biçimlilik tamam' % len(z.infolist()))
try:
    import openpyxl
except ImportError:
    sys.exit(3)
wb = openpyxl.load_workbook(yol)
assert wb.sheetnames == bek['adlar'], wb.sheetnames
assert wb.properties.title == bek['baslik'] and wb.properties.creator == 'Kesit', (wb.properties.title, wb.properties.creator)
for s in bek['sayfalar']:
    ws = wb[s['ad']]
    assert ws.freeze_panes == s['donma'], (ws.title, ws.freeze_panes)
    assert ws.auto_filter.ref == s['filtre'], (ws.title, ws.auto_filter.ref)
    b = ws.cell(s['baslikSatiri'], 1)
    assert b.font.b and b.fill.fill_type == 'solid', (ws.title, b.font.b, b.fill.fill_type)
    for ref, v in s['hucre'].items():
        g = ws[ref].value
        if isinstance(v, (int, float)):
            assert type(g) in (int, float) and abs(g - v) < 1e-12, (ws.title, ref, g, v)
        else:
            assert g == v, (ws.title, ref, g, v)
    for ref, f in s.get('bicim', {}).items():
        assert ws[ref].number_format == f, (ws.title, ref, ws[ref].number_format)
    for col, w in s.get('genislik', {}).items():
        assert ws.column_dimensions[col].width == w, (ws.title, col, ws.column_dimensions[col].width)
print('openpyxl %s: sayfa adları, başlıklar, sayı türleri, Türkçe karakterler, dondurma, süzgeç, biçim, genişlik tamam' % openpyxl.__version__)
`;
const pyCalistir = py => calistir(py, ['-I', '-c', PY, dosya, JSON.stringify(bek)]);
if (!varMi('python3')) console.log('not: python3 bulunamadı, Python denetimleri atlandı');
else {
  // openpyxl yoksa çıktı klasöründe geçici bir venv kurmayı dene (çevrimdışıysa atla)
  const pyBul = () => {
    if (calistir('python3', ['-I', '-c', 'import openpyxl']).status === 0) return 'python3';
    const venv = join(dir, 'venv'), py = join(venv, 'bin', 'python');
    if (!existsSync(py) && calistir('python3', ['-m', 'venv', venv]).status !== 0) return null;
    if (calistir(py, ['-I', '-c', 'import openpyxl']).status === 0) return py;
    return calistir(py, ['-m', 'pip', 'install', '-q', 'openpyxl']).status === 0 ? py : null;
  };
  const py = pyBul() ?? 'python3', r = pyCalistir(py);
  process.stdout.write(r.stdout);
  if (r.status === 3) console.log('not: openpyxl kurulamadı (venv/pip çevrimdışı?), openpyxl denetimi atlandı');
  else assert.equal(r.status, 0, r.stderr || r.stdout);
}

// ---------- LibreOffice varsa: başsız csv dönüşümü (yalnızca ilk sayfa) ----------
const soffice = ['soffice', 'libreoffice'].find(varMi) ?? ['/Applications/LibreOffice.app/Contents/MacOS/soffice'].find(existsSync);
if (soffice) {
  const r = calistir(soffice, [`-env:UserInstallation=file://${join(dir, 'lo-profil')}`, '--headless',
    '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1', '--outdir', dir, dosya]);
  assert.equal(r.status, 0, r.stderr);
  const csv = readFileSync(join(dir, 'kesit-test.csv'), 'utf8');
  assert.match(csv, /σc \(MPa\)/);
  assert.match(csv, /ÇĞİÖŞÜ çğıöşü/);
  console.log('LibreOffice csv: Türkçe metin tamam');
} else console.log('not: LibreOffice (soffice) yok, csv denetimi atlandı');

console.log(`çıktı: ${dosya}`);
console.log('xlsx: tüm kontroller geçti');
