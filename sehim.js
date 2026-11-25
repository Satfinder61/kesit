// Sehim (TS 500 13.2). Birimler: mm, mm⁴, MPa, kNm.
// Ani sehim: etkili eylemsizlik momenti Ief (Denk. 13.1), çatlama momenti Mcr = 2,5·fctd·Ic/y (Denk. 13.2).
// Sürekli açıklıkta Ief = 0,5·Ief,açıklık + 0,25·(Ief,mesnet1 + Ief,mesnet2) (13.2.2).
// Zamana bağlı: δt = δi + λ·δig, λ = γt/(1 + 50ρ'), γt = 2,0 (≥ 5 yıl; Denk. 13.3–13.4, Çizelge 13.2).
// Sınır (Çizelge 13.3, normal kat): bölme duvarsız → hareketli yükten ani sehim ≤ ℓn/360;
// bölme duvarlı → sürekli yükten toplam + hareketlinin ani sehimi ≤ ℓn/480.
// ponytail: sürekli yük = G (TS 500/TS 498 hareketli yükün sürekli kalan payını vermiyor); açıklık sehimi
// δ = 5ℓ²/(48·Ec·I)·[Mm − 0,1·(|M1| + |M2|)] (düzgün yayılı yüklü sürekli açıklık; TS 500 'yapı mekaniği ilkeleri').

export const EC = { 25: 30000, 30: 32000, 35: 33000, 40: 34000, 45: 36000, 50: 37000 }; // TS 500 Çizelge 3.2
export const ES = 2e5;

// Kesit özellikleri. Dikdörtgen ya da T (bf tabla genişliği, hf tabla kalınlığı; tabla üstte).
// cekme: 'alt' (açıklık, pozitif moment) ya da 'ust' (mesnet, negatif moment). As çekme donatısı, d faydalı yükseklik.
export function kesit({ bw, h, bf = bw, hf = 0, As, d, cekme = 'alt' }, fck, fctd) {
  const Af = (bf - bw) * hf, Aw = bw * h, A = Aw + Af;
  const yUst = (Aw * h / 2 + Af * hf / 2) / A;                     // ağırlık merkezi, üstten
  const Ic = bw * h ** 3 / 12 + Aw * (h / 2 - yUst) ** 2 + (bf - bw) * hf ** 3 / 12 + Af * (hf / 2 - yUst) ** 2;
  const y = cekme === 'alt' ? h - yUst : yUst;                        // en dış çekme lifine uzaklık
  const Mcr = 2.5 * fctd * Ic / y / 1e6;                             // kNm
  const n = ES / EC[fck], nA = n * As;
  // Çatlamış kesit: basınç bölgesi açıklıkta tablada (bf), mesnette gövdede (bw).
  const b = cekme === 'alt' ? bf : bw;
  let x = (-nA + Math.sqrt(nA * nA + 2 * b * nA * d)) / b, Icr;
  if (cekme === 'alt' && bf > bw && x > hf) { // tarafsız eksen gövdede: T kesit
    const a = bw / 2, bq = (bf - bw) * hf + nA, c = -((bf - bw) * hf * hf / 2 + nA * d);
    x = (-bq + Math.sqrt(bq * bq - 4 * a * c)) / (2 * a);
    Icr = bw * x ** 3 / 3 + (bf - bw) * hf ** 3 / 12 + (bf - bw) * hf * (x - hf / 2) ** 2 + nA * (d - x) ** 2;
  } else Icr = b * x ** 3 / 3 + nA * (d - x) ** 2;
  return { Ic, Icr: Math.min(Icr, Ic), Mcr, y, x };
}
export const ief = (k, M) => {
  M = Math.abs(M);
  if (M <= k.Mcr) return k.Ic;
  const r = (k.Mcr / M) ** 3;
  return r * k.Ic + (1 - r) * k.Icr;
};
// Sürekli açıklık sehimi (mm). l (mm) hesap açıklığı, M (kNm) kullanım momentleri: Mm açıklık ortası, M1, M2 mesnetler.
export const sehimDeger = (l, Ec, I, Mm, M1, M2) => 5 * l * l / (48 * Ec * I) * (Mm - 0.1 * (Math.abs(M1) + Math.abs(M2))) * 1e6;

// Bir açıklığın sehim denetimi. kesitler: { m: açıklık, s1, s2: mesnetler } (kesit() çıktıları).
// G ve GQ: { Mm, M1, M2 } kullanım momentleri (yalnız G; G + Q). rhoP: açıklıkta basınç donatısı oranı.
export function aciklikSehim({ l, ln, kesitler, G, GQ, rhoP = 0, duvar, fck }) {
  const Ec = EC[fck];
  const I = M => 0.5 * ief(kesitler.m, M.Mm) + 0.25 * (ief(kesitler.s1, M.M1) + ief(kesitler.s2, M.M2));
  const dG = Math.max(0, sehimDeger(l, Ec, I(G), G.Mm, G.M1, G.M2));
  const dGQ = Math.max(dG, sehimDeger(l, Ec, I(GQ), GQ.Mm, GQ.M1, GQ.M2));
  const lam = 2 / (1 + 50 * rhoP);
  return duvar
    ? { deger: dGQ + lam * dG, sinir: ln / 480, yazi: 'δ_GQ + λ·δ_G ≤ ℓn/480 (bölme duvarlı)', dG, dGQ, lam }
    : { deger: dGQ - dG, sinir: ln / 360, yazi: 'δ_Q ≤ ℓn/360 (bölme duvarsız)', dG, dGQ, lam };
}
