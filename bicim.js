// Türkçe sayı yazımı (iz ve koşul metinleri). Intl biçimleyici her çağrıda kurulursa hesabın çoğunu yer; aynı sayılar turlarda ve
// katlarda defalarca yazıldığından ondalık sayısına göre biçimleyici ve sonuç önbellekte (−0 ayrı yazılır: önbellek anahtarında 0 ile aynı).
const NF = {}, ONB = {};
export function bicim(x, d) {
  const nf = NF[d] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d });
  if (Object.is(x, -0) || typeof x !== 'number') return nf.format(x);
  const m = ONB[d] ??= new Map();
  let s = m.get(x);
  if (s === undefined) { if (m.size >= 20000) m.clear(); m.set(x, s = nf.format(x)); }
  return s;
}
