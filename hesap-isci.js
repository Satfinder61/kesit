// Hesap işçisi (sira.html, tablo.html): motoru (zincirHesap; kat yükseklikleri farklıysa katliHesap) ana iş parçacığı dışında çalıştırır,
// ağır projede (kat bazlı, geniş ağ) sayfa donmaz. calisma.js kurar: new Worker(new URL('./hesap-isci.js', import.meta.url), { type: 'module' }).
// İleti: { id, g } (girdiOku çıktısı, girdiDenetle'den geçmiş). Yanıt: { id, sonuc } ya da motor hata verirse { id, hata }.
import { zincirHesap } from './zincir.js';

// Yapılandırılmış kopyaya sığmayan değerleri (işlev, simge) ayıklar; ortak başvurular ve döngüler korunur. Saf: Node'da sınanır.
export function aktarilabilir(x, gorulen = new Map()) {
  if (typeof x === 'function' || typeof x === 'symbol') return undefined;
  if (x === null || typeof x !== 'object') return x;
  if (gorulen.has(x)) return gorulen.get(x);
  if (x instanceof Date || x instanceof RegExp || x instanceof ArrayBuffer || ArrayBuffer.isView(x)) { gorulen.set(x, x); return x; }
  const at = v => typeof v === 'function' || typeof v === 'symbol';
  if (x instanceof Map) { const m = new Map(); gorulen.set(x, m); for (const [a, v] of x) if (!at(a) && !at(v)) m.set(aktarilabilir(a, gorulen), aktarilabilir(v, gorulen)); return m; }
  if (x instanceof Set) { const s = new Set(); gorulen.set(x, s); for (const v of x) if (!at(v)) s.add(aktarilabilir(v, gorulen)); return s; }
  const y = Array.isArray(x) ? new Array(x.length) : {};
  gorulen.set(x, y);
  for (const a of Object.keys(x)) if (!at(x[a])) y[a] = aktarilabilir(x[a], gorulen);
  return y;
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) globalThis.onmessage = ({ data: { id, g } }) => {
  let sonuc;
  try { sonuc = zincirHesap(g); } catch (e) { postMessage({ id, hata: String(e?.stack ?? e) }); return; }
  try { postMessage({ id, sonuc }); } catch { postMessage({ id, sonuc: aktarilabilir(sonuc) }); } // DataCloneError: işlevler ayıklanır
};
