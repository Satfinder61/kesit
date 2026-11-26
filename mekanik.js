// Yapı mekaniği: simetrik yamuk yük parçaları, sürekli kiriş (üç moment), dama yüklemesi, aks ağı.
// Birimler: aks ve açıklık m, kesit boyutu mm, kuvvet kN, yayılı yük kN/m, alan yükü kN/m², moment kNm.

// ── Mekanik (yönetmelikten bağımsız)

// Simetrik yamuk yük parçası: tepe şiddeti w (kN/m), uçlardaki rampa boyu a (m). a = 0 düzgün, a = L/2 üçgen.
export const parcaToplam = ({ w, a }, L) => w * (L - a);
export const parcaAnkastre = ({ w, a }, L) => w * L * L / 12 * (1 - 2 * (a / L) ** 2 + (a / L) ** 3);
export const parcaSiddet = ({ w, a }, L, x) => a > 0 ? w * Math.min(1, x / a, (L - x) / a) : w;

// 45° kuralı. Pano kenarları s ≤ L, alan yükü p. İki doğrultuda (L/s ≤ 2) her kenar tepe p·s/2, rampa s/2 alır:
// kısa kenara üçgen (alan s²/4), uzun kenara yamuk (alan s(2L − s)/4). Bir doğrultuda yük kısa doğrultuda taşınır:
// uzun kenarlar düzgün p·s/2, kısa kenarlar yük almaz.
// Dönüş: kenar boyu Le olan kenarın yük parçası.
export function kenarParcasi(Le, lx, ly, p) {
  const s = Math.min(lx, ly), L = Math.max(lx, ly);
  if (L / s <= 2) return { w: p * s / 2, a: s / 2 };
  return Le === L ? { w: p * s / 2, a: 0 } : { w: 0, a: 0 };
}

// Rijit mesnetli sürekli kiriş, açıklıklar boyunca sabit EI, uç mesnetler mafsallı.
// L[k]: açıklıklar (m); yukler[k]: k. açıklığa etkiyen simetrik yük parçaları.
// Üç moment denklemi (simetrik yükte yük terimi 6Ax̄/L = 3·F·L, F ankastrelik momenti):
//   M[k−1]·L[k−1] + 2·M[k]·(L[k−1] + L[k]) + M[k+1]·L[k] = −3·(F[k−1]·L[k−1] + F[k]·L[k])
// Momentler alt lif çekme pozitif; mesnet momentleri negatif çıkar.
// uc = [sol, sağ]: true ise o uç ankastre (perdeye saplanan kiriş): sıfır boylu hayali açıklık, uçta dönme yok → M[0] ya da M[n] de bilinmeyen.
const UC0 = [false, false];
// Mesnet momentleri (F: açıklık ankastrelik momentleri)
function mesnetM(L, F, uc) {
  const n = L.length, M = Array(n + 1).fill(0);
  const i0 = uc[0] ? 0 : 1, i1 = uc[1] ? n : n - 1;
  if (i1 >= i0) { // Thomas algoritması, bilinmeyen M[i0..i1]
    const a = [], b = [], c = [], d = [];
    for (let k = i0; k <= i1; k++) {
      const Ls = L[k - 1] ?? 0, Lr = L[k] ?? 0;
      a.push(Ls); b.push(2 * (Ls + Lr)); c.push(Lr);
      d.push(-3 * ((F[k - 1] ?? 0) * Ls + (F[k] ?? 0) * Lr));
    }
    const m = d.length;
    for (let i = 1; i < m; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
    M[i0 + m - 1] = d[m - 1] / b[m - 1];
    for (let i = m - 2; i >= 0; i--) M[i0 + i] = (d[i] - c[i] * M[i0 + i + 1]) / b[i];
  }
  return M;
}
// En büyük açıklık momenti: V ve M'nin sayısal integrali (yamuk kuralı, N adım); q: örnek noktalarında yük şiddeti
const N_ACIK = 400;
const qOrnek = (yuk, Lk) => { const h = Lk / N_ACIK, q = new Float64Array(N_ACIK + 1);
  for (let i = 0; i <= N_ACIK; i++) q[i] = yuk.reduce((t, y) => t + parcaSiddet(y, Lk, i * h), 0); return q; };
function acikMax(q, Lk, VL, M1, M2) {
  const h = Lk / N_ACIK;
  let V = VL, Mx = M1, qo = q[0], enb = Math.max(M1, M2);
  for (let i = 1; i <= N_ACIK; i++) {
    const qx = q[i], Vy = V - (qo + qx) / 2 * h;
    Mx += (V + Vy) / 2 * h; V = Vy; qo = qx;
    if (Mx > enb) enb = Mx;
  }
  return enb;
}
export function surekliKiris(L, yukler, uc = UC0) {
  const n = L.length;
  const F = yukler.map((p, k) => p.reduce((t, y) => t + parcaAnkastre(y, L[k]), 0));
  const W = yukler.map((p, k) => p.reduce((t, y) => t + parcaToplam(y, L[k]), 0));
  const M = mesnetM(L, F, uc);
  const acikliklar = L.map((Lk, k) => {
    const VL = W[k] / 2 + (M[k + 1] - M[k]) / Lk, VR = W[k] - VL;
    // Yalnız istenince hesaplanır: tepki için çağrılan çözümlerde integral gereksiz ve hesabın çoğunu yiyordu.
    let enb;
    return { L: Lk, W: W[k], VL, VR, Msol: M[k], Msag: M[k + 1], get Macik() { return enb ??= acikMax(qOrnek(yukler[k], Lk), Lk, VL, M[k], M[k + 1]); } };
  });
  const R = Array(n + 1).fill(0);
  acikliklar.forEach((s, k) => { R[k] += s.VL; R[k + 1] += s.VR; });
  return { M, acikliklar, R };
}

// TS 500 6.3.3: depremsiz birleşimde hareketli yük açıklık açıklık en elverişsiz biçimde yerleştirilir.
// Desenler: hepsi, tek açıklıklar, çift açıklıklar ve her iç mesnet için iki komşu açıklık + birer atlayarak.
export function desenler(n) {
  const d = [Array(n).fill(true), [...Array(n)].map((_, i) => i % 2 === 0), [...Array(n)].map((_, i) => i % 2 === 1)];
  for (let k = 1; k < n; k++)
    d.push([...Array(n)].map((_, i) => i === k - 1 || i === k || (i < k - 1 && (k - 1 - i) % 2 === 0) || (i > k && (i - k) % 2 === 0)));
  return d;
}
// 1,4G (her açıklıkta) + 1,6Q (desene göre) zarfı: uçlarda üst/alt çekme momentleri, açıklık momentleri ve uç kesmesi.
// Açıklık başına iki yük durumu var (Q yok / var): ankastrelik, toplam, orta moment ve integral örnekleri bir kez hesaplanır.
// Aynı kiriş hattı ve döşeme şeridi katlarda ve boyutlandırma turlarında aynı yükle yeniden çözülür: girdi metnine göre önbellek.
const ZARF = new Map();
export function zarf(L, G, Q, uc = UC0) {
  const yaz = P => P.map(p => p.map(y => `${y.w} ${y.a}`).join()).join(';'), key = `${L.join()}|${uc}|${yaz(G)}|${yaz(Q)}`;
  let z = ZARF.get(key);
  if (!z) { if (ZARF.size >= 2000) ZARF.clear(); ZARF.set(key, z = zarfHesap(L, G, Q, uc)); }
  return z.map(o => ({ ...o }));
}
function zarfHesap(L, G, Q, uc) {
  const z = L.map(() => ({ MdMesnet: 0, MdSolUst: 0, MdSagUst: 0, MdSolAlt: 0, MdSagAlt: 0, MdAcik: 0, MdOrtaUst: 0, Vd: 0 }));
  const Y = G.map((p, k) => { const yg = p.map(y => ({ w: 1.4 * y.w, a: y.a })); return [yg, [...yg, ...Q[k].map(y => ({ w: 1.6 * y.w, a: y.a }))]]; });
  const top = (f, k) => Y[k].map(yk => yk.reduce((t, y) => t + f(y, L[k]), 0));
  const FY = Y.map((_, k) => top(parcaAnkastre, k)), WY = Y.map((_, k) => top(parcaToplam, k)), OY = Y.map((_, k) => top(parcaOrta, k)), QY = Y.map(() => []);
  for (const d of desenler(L.length)) {
    const v = L.map((_, k) => d[k] ? 1 : 0), M = mesnetM(L, FY.map((f, k) => f[v[k]]), uc);
    L.forEach((Lk, k) => {
      const W = WY[k][v[k]], Msol = M[k], Msag = M[k + 1], VL = W / 2 + (Msag - Msol) / Lk, VR = W - VL, zk = z[k];
      zk.MdMesnet = Math.max(zk.MdMesnet, -Math.min(Msol, Msag, 0));
      zk.MdSolUst = Math.max(zk.MdSolUst, -Msol);
      zk.MdSagUst = Math.max(zk.MdSagUst, -Msag);
      zk.MdSolAlt = Math.max(zk.MdSolAlt, Msol);
      zk.MdSagAlt = Math.max(zk.MdSagAlt, Msag);
      zk.MdAcik = Math.max(zk.MdAcik, acikMax(QY[k][v[k]] ??= qOrnek(Y[k][v[k]], Lk), Lk, VL, Msol, Msag));
      zk.MdOrtaUst = Math.max(zk.MdOrtaUst, -(OY[k][v[k]] + (Msol + Msag) / 2));
      zk.Vd = Math.max(zk.Vd, Math.abs(VL), Math.abs(VR));
    });
  }
  return z;
}

// Aks ağı. ax: X yönündeki aks aralıkları, ay: Y yönündeki (m). X aksları 1, 2, 3…; Y aksları A, B, C…
// Döşeme panoları, kiriş açıklıkları (her aks çizgisi bir sürekli kiriş) ve kolonlar (aks kesişimleri).
const harf = j => String.fromCharCode(65 + j);
export function agKur(ax, ay) {
  const xs = [0], ys = [0];
  ax.forEach(v => xs.push(xs.at(-1) + v));
  ay.forEach(v => ys.push(ys.at(-1) + v));
  const nx = ax.length, ny = ay.length;
  const dosemeler = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const kenar = { alt: j > 0, ust: j < ny - 1, sol: i > 0, sag: i < nx - 1 }; // komşu pano varsa kenar sürekli
    dosemeler.push({ ad: `D${dosemeler.length + 1}`, i, j, lx: ax[i], ly: ay[j], kenar,
      aks: `${i + 1}–${i + 2} / ${harf(j)}–${harf(j + 1)}` });
  }
  // Kiriş hatları: X yönünde her Y aksı (j = 0..ny), Y yönünde her X aksı (i = 0..nx).
  const hatlar = [];
  for (let j = 0; j <= ny; j++) hatlar.push({ yon: 'x', no: j, aks: harf(j), L: ax, dis: j === 0 || j === ny });
  for (let i = 0; i <= nx; i++) hatlar.push({ yon: 'y', no: i, aks: String(i + 1), L: ay, dis: i === 0 || i === nx });
  let kn = 0;
  hatlar.forEach(h => {
    h.kirisler = h.L.map((L, k) => ({ ad: `K${++kn}`, L,
      aks: h.yon === 'x' ? `${h.aks} / ${k + 1}–${k + 2}` : `${h.aks} / ${harf(k)}–${harf(k + 1)}` }));
  });
  const kolonlar = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
    kolonlar.push({ ad: `S${kolonlar.length + 1}`, i, j, aks: `${i + 1}${harf(j)}`, x: xs[i], y: ys[j] });
  return { ax, ay, xs, ys, nx, ny, dosemeler, hatlar, kolonlar };
}

// Basit açıklık ortası momenti (kNm): w(3L² − 4a²)/24
export const parcaOrta = ({ w, a }, L) => w * (3 * L * L - 4 * a * a) / 24;
// Kullanım (sehim) momentleri: her açıklıkta açıklık ortası Mm ve mesnet momentleri M1, M2 (kNm).
export function ortaMomentler(L, yukler, uc = UC0) {
  const r = surekliKiris(L, yukler, uc);
  return L.map((Lk, k) => ({ Mm: yukler[k].reduce((t, y) => t + parcaOrta(y, Lk), 0) + (r.M[k] + r.M[k + 1]) / 2, M1: r.M[k], M2: r.M[k + 1] }));
}

// ── Izgara kiriş sistemi (kolon kaldırılınca ya da kaydırılınca; kiris.js izgaraBul). Her hat bir kiriş dizisi; düğümde
// düşey yer değiştirme (w, aşağı pozitif) kesişen hatlarda ortak, dönme (θ = dw/ds) her hatta ayrı: kirişlerin burulma
// rijitliği ihmal (çatlamış kirişte küçük; ön tasarımda yaygın ve güvenli yan kabul).
// Bant Cholesky (simetrik, pozitif tanımlı): A satır i, sütun j ≤ i → A[i·(B+1) + i − j]. Dönüş: tekil (dayanaksız) satır ya da −1.
export function bantCholesky(A, n, B) {
  const w = B + 1;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - B), d0 = A[i * w];
    for (let j = j0; j <= i; j++) {
      let s = A[i * w + i - j];
      for (let k = Math.max(j0, j - B); k < j; k++) s -= A[i * w + i - k] * A[j * w + j - k];
      if (i === j) { if (!(s > 1e-10 * Math.abs(d0))) return i; A[i * w] = Math.sqrt(s); }
      else A[i * w + i - j] = s / A[j * w];
    }
  }
  return -1;
}
export function bantCoz(L, n, B, b) {
  const w = B + 1, x = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let s = x[i]; for (let k = Math.max(0, i - B); k < i; k++) s -= L[i * w + i - k] * x[k]; x[i] = s / L[i * w]; }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let k = i + 1; k <= Math.min(n - 1, i + B); k++) s -= L[k * w + k - i] * x[k]; x[i] = s / L[i * w]; }
  return x;
}
// Hermite kiriş elemanı rijitliği (w, θ, w, θ), EI (kN·m²), L (m)
export const elemanK = (EI, L) => { const a = EI / L ** 3, b = a * L, c = b * L;
  return [[12 * a, 6 * b, -12 * a, 6 * b], [6 * b, 4 * c, -6 * b, 2 * c], [-12 * a, -6 * b, 12 * a, -6 * b], [6 * b, 2 * c, -6 * b, 4 * c]]; };
// Açıklığın (boyu Lb) [ua, ub] parçasındaki simetrik yamuk yükler: eşdeğer düğüm yükleri f = ∫q·N (Gauss, parça parça doğrusal yükte tam)
// ve örnek noktalarda Q0(s) = ∫₀ˢ q, Q1(s) = ∫₀ˢ t·q (s eleman içinde; doğrusal parçada Simpson tam).
const GP = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];
export function parcaIntegral(parcalar, Lb, ua, ub, s) {
  const L = ub - ua, q = t => parcalar.reduce((x, p) => x + parcaSiddet(p, Lb, ua + t), 0);
  const kir = new Set([0, L, ...s]);
  for (const p of parcalar) for (const u of [p.a, Lb - p.a]) if (u > ua + 1e-12 && u < ub - 1e-12) kir.add(u - ua);
  const ev = [...kir].sort((a, b) => a - b), f = [0, 0, 0, 0], Q0 = [], Q1 = [];
  let A0 = 0, A1 = 0, si = 0;
  const kayit = t => { while (si < s.length && s[si] <= t + 1e-12) { Q0.push(A0); Q1.push(A1); si++; } };
  kayit(0);
  for (let e = 1; e < ev.length; e++) {
    const t0 = ev[e - 1], t1 = ev[e], h = t1 - t0; if (h <= 0) continue;
    const qa = q(t0), qb = q(t1), m = (t0 + t1) / 2, qm = (qa + qb) / 2;
    A0 += (qa + qb) / 2 * h; A1 += h / 6 * (t0 * qa + 4 * m * qm + t1 * qb);
    for (const [g, wg] of GP) {
      const t = m + g * h / 2, x = t / L, qt = qa + (qb - qa) * (t - t0) / h, k = qt * wg * h / 2;
      f[0] += k * (1 - 3 * x * x + 2 * x ** 3); f[1] += k * L * (x - 2 * x * x + x ** 3); f[2] += k * (3 * x * x - 2 * x ** 3); f[3] += k * L * (x ** 3 - x * x);
    }
    kayit(t1);
  }
  return { f, Q0, Q1, W: A0 };
}
