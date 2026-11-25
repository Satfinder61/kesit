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
export function surekliKiris(L, yukler) {
  const n = L.length;
  const F = yukler.map((p, k) => p.reduce((t, y) => t + parcaAnkastre(y, L[k]), 0));
  const W = yukler.map((p, k) => p.reduce((t, y) => t + parcaToplam(y, L[k]), 0));
  const M = Array(n + 1).fill(0);
  if (n > 1) { // Thomas algoritması, bilinmeyen M[1..n−1]
    const a = [], b = [], c = [], d = [];
    for (let k = 1; k < n; k++) {
      a.push(L[k - 1]); b.push(2 * (L[k - 1] + L[k])); c.push(L[k]);
      d.push(-3 * (F[k - 1] * L[k - 1] + F[k] * L[k]));
    }
    for (let i = 1; i < n - 1; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    M[n - 1] = d[n - 2] / b[n - 2];
    for (let i = n - 3; i >= 0; i--) M[i + 1] = (d[i] - c[i] * M[i + 2]) / b[i];
  }
  const acikliklar = L.map((Lk, k) => {
    const VL = W[k] / 2 + (M[k + 1] - M[k]) / Lk, VR = W[k] - VL;
    // en büyük açıklık momenti: V ve M'nin sayısal integrali (yamuk kuralı, 400 adım).
    // Yalnız istenince hesaplanır: tepki için çağrılan çözümlerde integral gereksiz ve hesabın çoğunu yiyordu.
    let enb;
    const macik = () => {
      if (enb !== undefined) return enb;
      const N = 400, h = Lk / N, q = x => yukler[k].reduce((t, y) => t + parcaSiddet(y, Lk, x), 0);
      let V = VL, Mx = M[k], qo = q(0);
      enb = Math.max(M[k], M[k + 1]);
      for (let i = 1; i <= N; i++) {
        const qx = q(i * h), Vy = V - (qo + qx) / 2 * h;
        Mx += (V + Vy) / 2 * h; V = Vy; qo = qx;
        if (Mx > enb) enb = Mx;
      }
      return enb;
    };
    return { L: Lk, W: W[k], VL, VR, Msol: M[k], Msag: M[k + 1], get Macik() { return macik(); } };
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
// 1,4G (her açıklıkta) + 1,6Q (desene göre) zarfı: açıklık başına en büyük mesnet ve açıklık momenti, uç kesmesi.
export function zarf(L, G, Q) {
  const z = L.map(() => ({ MdMesnet: 0, MdAcik: 0, Vd: 0 }));
  for (const d of desenler(L.length)) {
    const r = surekliKiris(L, G.map((p, k) => [...p.map(y => ({ w: 1.4 * y.w, a: y.a })), ...(d[k] ? Q[k].map(y => ({ w: 1.6 * y.w, a: y.a })) : [])]));
    r.acikliklar.forEach((s, k) => {
      z[k].MdMesnet = Math.max(z[k].MdMesnet, -Math.min(s.Msol, s.Msag, 0));
      z[k].MdAcik = Math.max(z[k].MdAcik, s.Macik);
      z[k].Vd = Math.max(z[k].Vd, Math.abs(s.VL), Math.abs(s.VR));
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
export function ortaMomentler(L, yukler) {
  const r = surekliKiris(L, yukler);
  return L.map((Lk, k) => ({ Mm: yukler[k].reduce((t, y) => t + parcaOrta(y, Lk), 0) + (r.M[k] + r.M[k + 1]) / 2, M1: r.M[k], M2: r.M[k + 1] }));
}
