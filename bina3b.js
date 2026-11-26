// 3B bina çizimi (three.js r169, yerel kopya): binaModeli (bina.js) → sahne. Sürükle döndür, Shift/sağ tuş/iki parmak kaydır,
// tekerlek (gömülüde Ctrl/⌘ ya da iki parmak) yakınlaştır, çift tık sığdır; tıklanan eleman yarı saydam + temsili donatı + bilgi kartı;
// kat seçimi (seçilen parlak, diğerleri soluk ve tıklanmaz), döşemeleri gizle. Ekran yalnız değişince çizilir.
// sira.html (Plan | 3B) ve bina.html (sunum) kurar; yalnız 3B açılınca yüklenir. binaResmi: yazdırma için kâğıt renkli resim.
import * as THREE from './vendor/three.module.min.js';
import { binaModeli, donatiCubuklari, kartBilgi } from './bina.js';

const P = (x, y, z) => new THREE.Vector3(x, z, -y);       // plan (x doğu, y kuzey, z yukarı) → three (y yukarı)
const SIRA = { kolon: 1, radye: 1, perde: 2, subasman: 2, kirisx: 3, kirisy: 4, doseme: 5 }; // çakışan yüzlerde öne geçen (polygonOffset)
const TON = { kolon: .8, perde: .66, subasman: .5, kiris: .54, doseme: .32, radye: .22 };    // zemin → mürekkep karışımı
const BASKI = { arka: '#ffffff', kolon: '#7a7a7a', perde: '#8e8e8e', subasman: '#a6a6a6', kiris: '#a3a3a3', doseme: '#d6d6d6', radye: '#e4e4e4', kotu: '#5a5a5a', kenar: '#1a1a1a', aks: '#8a8a8a', yazi: '#111111', zemin: '#ffffff' };
const ADLAR = [['kolon', 'Kolon'], ['kiris', 'Kiriş'], ['perde', 'Perde'], ['doseme', 'Döşeme'], ['radye', 'Temel']];

// ── Geometri: elemanın kutuları tek tamponda; dokular metre ölçeğinde (tarama yoğunluğu kutu boyundan bağımsız)
const YUZ = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]]; // [normal, t1, t2] eksen no (U, V, Z); işaret aşağıda
const ISARET = [1, -1, 1, -1, 1, -1];
function kutuEksen(k) { return [[k.u[0], k.u[1], 0], [-k.u[1], k.u[0], 0], [0, 0, 1]]; }
function kutuGeo(kutular) {
  const n = kutular.length, pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), uv = new Float32Array(n * 48), idx = [];
  let v = 0;
  for (const k of kutular) {
    const E = kutuEksen(k), yari = [k.a, k.b, k.h];
    YUZ.forEach(([ni, a, b], f) => {
      const s = ISARET[f], N = E[ni].map(x => x * s);
      // t1 × t2 = N olsun: −yüzlerde t1 ile t2 yer değiştirir (YUZ tablosu öyle dizildi)
      const T1 = E[a], T2 = E[b], o = v;
      for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 1, 2].map(i => k.c[i] + N[i] * yari[ni] + T1[i] * s1 * yari[a] + T2[i] * s2 * yari[b]);
        pos.set([p[0], p[2], -p[1]], v * 3); nor.set([N[0], N[2], -N[1]], v * 3);
        uv.set([p[0] * T1[0] + p[1] * T1[1] + p[2] * T1[2], p[0] * T2[0] + p[1] * T2[1] + p[2] * T2[2]], v * 2);
        v++;
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function kenarlar(kutular, hedef) { // kutunun 12 kenarı (plan → three)
  for (const k of kutular) {
    const E = kutuEksen(k), yari = [k.a, k.b, k.h], kose = s => [0, 1, 2].map(i => k.c[i] + E[0][i] * s[0] * yari[0] + E[1][i] * s[1] * yari[1] + E[2][i] * s[2] * yari[2]);
    for (const ek of [0, 1, 2]) for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const s = [0, 0, 0], d = [0, 1, 2].filter(i => i !== ek); s[d[0]] = a; s[d[1]] = b;
      const p = kose(Object.assign([...s], { [ek]: -1 })), q = kose(Object.assign([...s], { [ek]: 1 }));
      hedef.push(p[0], p[2], -p[1], q[0], q[2], -q[1]);
    }
  }
  return hedef;
}

function taramaDokusu() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 32, 32);
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 7;
  for (const o of [-32, 0, 32]) { x.beginPath(); x.moveTo(o, 32); x.lineTo(o + 32, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Renk: tema belirteçlerinden (renk-karışımı dahil tarayıcı çözsün diye sınama öğesiyle)
function temaRengi() {
  const s = document.createElement('i'); s.style.display = 'none'; document.body.append(s);
  const oku = ad => { s.style.color = `var(${ad})`; return new THREE.Color().setStyle(getComputedStyle(s).color); };
  const zemin = oku('--levha'), murekkep = oku('--murekkep'), r = { zemin, kotu: oku('--kirmizi'), secim: oku('--turuncu'), yazi: murekkep };
  for (const [t, k] of Object.entries(TON)) r[t] = zemin.clone().lerp(murekkep, k);
  r.kenar = zemin.clone().lerp(murekkep, .95); r.aks = zemin.clone().lerp(murekkep, .4);
  s.remove();
  return r;
}
const baskiRengi = () => Object.fromEntries(Object.entries(BASKI).map(([a, v]) => [a, new THREE.Color(v)]));

// ── Sahne: model + renkler → grup, seçilebilir ağlar, kenar grupları, aks çizgileri
function sahneKur(model, renk, tarama) {
  const grup = new THREE.Group(), aglar = [], kenarGrup = new Map(), malzeme = new Map();
  const mal = (tur, hal) => { // hal: n (normal), k (uygun değil), s (soluk), ks, c (seçili, yarı saydam)
    const ad = `${tur}|${hal}`; if (malzeme.has(ad)) return malzeme.get(ad);
    const kotu = hal[0] === 'k', soluk = hal.endsWith('s'), sec = hal === 'c', renkAd = tur.startsWith('kiris') ? 'kiris' : tur;
    const m = new THREE.MeshLambertMaterial({ color: kotu ? renk.kotu : renk[renkAd], map: kotu ? tarama : null,
      transparent: soluk || sec, opacity: soluk ? .1 : sec ? .16 : 1, depthWrite: !(soluk || sec),
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: SIRA[tur] * 2 });
    malzeme.set(ad, m); return m;
  };
  for (const el of model.elemanlar) {
    const tur = el.tip === 'kiris' ? 'kiris' + el.yon : el.tip;
    const ag = new THREE.Mesh(kutuGeo(el.kutular), mal(tur, el.gecti ? 'n' : 'k'));
    ag.userData = { el, tur }; grup.add(ag); aglar.push(ag);
    const ka = `${el.kat}|${el.tip === 'doseme' ? 'd' : 'y'}`;
    if (!kenarGrup.has(ka)) kenarGrup.set(ka, { p: [], c: [] });
    const kg = kenarGrup.get(ka), once = kg.p.length;
    kenarlar(el.kutular, kg.p);
    const c = el.gecti ? renk.kenar : renk.kotu;
    for (let i = once; i < kg.p.length; i += 3) kg.c.push(c.r, c.g, c.b);
  }
  const kenarMal = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .6 });
  const kenarSoluk = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .07, depthWrite: false });
  for (const [ka, { p, c }] of kenarGrup) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const l = new THREE.LineSegments(g, kenarMal); l.userData = { kat: +ka.split('|')[0], doseme: ka.endsWith('d') };
    kenarGrup.set(ka, l); grup.add(l);
  }
  const ak = [];
  for (const a of model.aks) ak.push(...P(a.p[0], a.p[1], .004).toArray(), ...P(a.q[0], a.q[1], .004).toArray());
  const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(ak, 3));
  const aksCizgi = new THREE.LineSegments(ag, new THREE.LineDashedMaterial({ color: renk.aks, dashSize: .6, gapSize: .25, transparent: true, opacity: .8 }));
  aksCizgi.computeLineDistances(); grup.add(aksCizgi);
  return { grup, aglar, kenarGrup, kenarMal, kenarSoluk, mal, malzeme, at() { grup.traverse(o => o.geometry?.dispose()); for (const m of malzeme.values()) m.dispose(); kenarMal.dispose(); kenarSoluk.dispose(); aksCizgi.material.dispose(); } };
}

function isik(sahne) {
  sahne.add(new THREE.HemisphereLight(0xffffff, 0xb9b4ad, 2.1));
  const d = new THREE.DirectionalLight(0xffffff, 1.1); d.position.set(.6, 1, .35); sahne.add(d);
}

// Modeli kaplayan küre (three koordinatı)
function kure(model) {
  const s = model.sinir;
  return new THREE.Box3().setFromPoints([P(s.x0, s.y0, s.z0), P(s.x1, s.y1, s.z1)]).getBoundingSphere(new THREE.Sphere());
}

function silindir(cubuklar, renk) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1), m = new THREE.MeshLambertMaterial({ color: renk });
  const im = new THREE.InstancedMesh(geo, m, Math.max(1, cubuklar.length)), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), M = new THREE.Matrix4();
  cubuklar.forEach((c, i) => {
    const a = P(...c.a), b = P(...c.b), d = b.clone().sub(a), L = d.length() || 1e-6, r = Math.max(.005, c.r * 1.6);
    q.setFromUnitVectors(Y, d.normalize());
    M.compose(a.clone().add(b).multiplyScalar(.5), q, new THREE.Vector3(r, L, r)); im.setMatrixAt(i, M);
  });
  im.count = cubuklar.length; im.instanceMatrix.needsUpdate = true;
  return im;
}

const el_ = (ad, sinif, yazi) => { const e = document.createElement(ad); if (sinif) e.className = sinif; if (yazi != null) e.textContent = yazi; return e; };

// ── Etkileşimli görünüm. secenek: { secildi({ ad, kat }), tam: bina.html (tekerlek ve dokunuş tamamen 3B'nin), ekDugmeler: [öğe] }
export function kur(kap, { secildi = () => {}, tam = false, ekDugmeler = [] } = {}) {
  kap.classList.add('b3'); kap.toggleAttribute('data-tam', tam);
  const yok = el_('p', 'b3-yok', ''); yok.hidden = true; kap.append(yok);
  let cizici;
  try { cizici = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch { yok.textContent = 'Bu tarayıcı 3B göstermiyor (WebGL kapalı). Plan görünümü çalışmaya devam eder.'; yok.hidden = false; return { guncelle() {}, sec() {}, hata() {}, yok: true }; }
  cizici.setPixelRatio(Math.min(devicePixelRatio, 2));
  const tuval = cizici.domElement; tuval.className = 'b3-tuval'; tuval.tabIndex = 0;
  tuval.setAttribute('role', 'img'); tuval.setAttribute('aria-label', 'Binanın 3B görünümü. Sürükle: döndür; tıkla: elemanı seç.');
  kap.prepend(tuval);

  // Araç çubuğu, aks balonları, lejant ve sayaç, bilgi kartı
  const ust = el_('div', 'b3-ust'), katSec = el_('select', 'b3-kat'), katEt = el_('label', 'b3-alan', 'Kat ');
  katSec.setAttribute('aria-label', '3B görünümde öne çıkan kat'); katEt.append(katSec);
  const dosemeD = el_('button', 'b3-dugme', 'Döşemeleri gizle'); dosemeD.type = 'button'; dosemeD.setAttribute('aria-pressed', 'false');
  const sigD = el_('button', 'b3-dugme', 'Sığdır'); sigD.type = 'button'; sigD.title = 'Bütün binayı göster (çift tık)';
  ust.append(katEt, dosemeD, sigD);
  if (document.fullscreenEnabled) {
    const tamD = el_('button', 'b3-dugme', 'Tam ekran'); tamD.type = 'button';
    tamD.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : kap.requestFullscreen?.().catch(() => {}));
    document.addEventListener('fullscreenchange', () => { tamD.textContent = document.fullscreenElement === kap ? 'Tam ekrandan çık' : 'Tam ekran'; });
    ust.append(tamD);
  }
  ust.append(...ekDugmeler);
  const aksKat = el_('div', 'b3-akslar'); aksKat.setAttribute('aria-hidden', 'true');
  const alt = el_('div', 'b3-alt'), lejant = el_('div', 'b3-lejant'), sayac = el_('p', 'b3-sayac'), ipucu = el_('p', 'b3-ipucu');
  lejant.setAttribute('aria-hidden', 'true');
  ipucu.textContent = matchMedia('(pointer: coarse)').matches ? 'Bir parmak: döndür · İki parmak: yakınlaştır, kaydır · Dokun: seç'
    : `Sürükle: döndür · Shift ya da sağ tuş: kaydır · ${tam ? 'Tekerlek' : 'Ctrl/⌘ + tekerlek'}: yakınlaştır · Çift tık: sığdır`;
  sayac.setAttribute('role', 'status');
  alt.append(lejant, sayac, ipucu);
  const kart = el_('aside', 'b3-kart'); kart.hidden = true; kart.setAttribute('aria-live', 'polite');
  kap.append(ust, aksKat, alt, kart);

  const sahne = new THREE.Scene(); isik(sahne);
  const kamera = new THREE.PerspectiveCamera(35, 1, .1, 1000);
  const tarama = taramaDokusu();
  let model = null, S = null, renk = null, kureM = new THREE.Sphere(new THREE.Vector3(), 10), katli = false;
  let az = -.72, yuk = .5, uzak = 40; const hedef = new THREE.Vector3();
  let katGor = 'tum', dosemeGizli = false, secim = null, kartAcik = false, cubukAg = null, vurgu = null, ilk = true, olcekli = false;
  const balonlar = [];

  // Çizim isteği (bir sonraki kare)
  let istek = 0;
  const ciz = () => { if (!istek) istek = requestAnimationFrame(cerceve); };
  function cerceve() {
    istek = 0;
    const { clientWidth: w, clientHeight: h } = kap; if (!w || !h || !model) return;
    const cy = Math.cos(yuk);
    kamera.position.set(hedef.x + uzak * cy * Math.sin(az), hedef.y + uzak * Math.sin(yuk), hedef.z + uzak * cy * Math.cos(az));
    kamera.near = Math.max(.05, uzak / 300); kamera.far = uzak + kureM.radius * 6; kamera.updateProjectionMatrix();
    kamera.lookAt(hedef);
    cizici.render(sahne, kamera);
    const v = new THREE.Vector3();
    for (const b of balonlar) {
      v.copy(b.p).project(kamera);
      const gor = yuk > .12 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; // yandan/alttan bakışta balonlar binanın önüne düşer
      b.e.style.visibility = gor ? '' : 'hidden';
      if (gor) b.e.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = kap; if (!w || !h) return;
    cizici.setSize(w, h, false); kamera.aspect = w / h;
    if (!olcekli && model) sigdir();
    ciz();
  }).observe(kap);

  function sigdir(k = kureM) {
    const yf = THREE.MathUtils.degToRad(kamera.fov / 2), xf = Math.atan(Math.tan(yf) * kamera.aspect);
    hedef.copy(k.center); uzak = k.radius / Math.sin(Math.min(yf, xf)) * 1.08; ciz();
  }

  // Görünürlük: kat seçimi ve döşemeler; malzeme, seçilebilirlik
  function gorunurluk() {
    if (!S) return;
    const parlak = el => katGor === 'tum' || el.kat === katGor;
    for (const ag of S.aglar) {
      const { el, tur } = ag.userData, sec = vurgu?.has(ag);
      ag.visible = !(dosemeGizli && el.tip === 'doseme');
      ag.userData.secilebilir = parlak(el);
      ag.material = S.mal(tur, sec ? 'c' : (el.gecti ? '' : 'k') + (parlak(el) ? '' : 's') || 'n');
    }
    for (const l of S.kenarGrup.values()) {
      l.visible = !(dosemeGizli && l.userData.doseme);
      l.material = katGor === 'tum' || l.userData.kat === katGor ? S.kenarMal : S.kenarSoluk;
    }
    ciz();
  }

  // Seçim: aynı ad (katlıda aynı kat) bütün kopyalarda vurgulanır; donatı tıklanan kopyada
  function secimCiz() {
    if (cubukAg) { sahne.remove(cubukAg); cubukAg.geometry.dispose(); cubukAg.material.dispose(); cubukAg = null; }
    if (S?.secKenar) { S.grup.remove(S.secKenar); S.secKenar.geometry.dispose(); S.secKenar.material.dispose(); S.secKenar = null; }
    vurgu = null; kart.hidden = true;
    if (!S || !secim) { gorunurluk(); return; }
    const uyan = S.aglar.filter(a => a.userData.el.ad === secim.ad && (!katli || !secim.kat || a.userData.el.kat === secim.kat));
    if (!uyan.length) { secim = null; gorunurluk(); return; }
    vurgu = new Set(uyan);
    const aktif = uyan.find(a => a.userData.el.kat === secim.kat) ?? uyan[0], el = aktif.userData.el;
    const p = []; for (const a of uyan) kenarlar(a.userData.el.kutular, p);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    S.secKenar = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: renk.secim, depthTest: false, transparent: true, opacity: .9 }));
    S.secKenar.renderOrder = 2; S.grup.add(S.secKenar);
    const cb = donatiCubuklari(el);
    if (cb.length) { cubukAg = silindir(cb, renk.secim); sahne.add(cubukAg); }
    if (kartAcik) kartCiz(el); // kart yalnız 3B'de tıklanınca (tablodan gelen seçimde ayrıntı zaten sayfada)
    gorunurluk();
  }
  function kartCiz(el) {
    const b = kartBilgi(el, katli);
    kart.replaceChildren();
    const bas = el_('div', 'b3-kart-bas'), kapat = el_('button', 'b3-kapat', '×');
    kapat.type = 'button'; kapat.setAttribute('aria-label', 'Seçimi kaldır'); kapat.addEventListener('click', () => { secim = null; kartAcik = false; secimCiz(); secildi(null); });
    const h = el_('h3', null, b.baslik), durum = el_('span', `b3-durum ${b.gecti ? 'uygun' : 'degil'}`, b.gecti ? '✓ Uygun' : '✕ Uygun değil');
    bas.append(h, durum, kapat);
    const dl = el_('dl');
    for (const [a, v] of b.satirlar) dl.append(el_('dt', null, a), el_('dd', null, v));
    kart.append(bas, el_('p', 'b3-kart-alt', b.alt), dl);
    if (b.kosul) kart.append(el_('p', 'b3-kosul', b.kosul));
    kart.append(el_('p', 'b3-not', b.not));
    kart.hidden = false;
  }

  function katSecenek() {
    const l = [['tum', 'Bütün katlar'], [0, 'Temel'], ...Array.from({ length: model.katSayisi }, (_, i) => [i + 1, `${i + 1}. kat`])];
    katSec.replaceChildren(...l.map(([v, y]) => { const o = el_('option', null, y); o.value = String(v); return o; }));
    if (katGor !== 'tum' && katGor > model.katSayisi) katGor = 'tum';
    katSec.value = String(katGor);
  }
  function altCiz() {
    lejant.replaceChildren(...ADLAR.map(([t, y]) => { const s = el_('span', null, y), i = el_('i'); i.style.background = `#${renk[t].getHexString(THREE.SRGBColorSpace)}`; s.prepend(i); return s; }),
      (() => { const s = el_('span', null, 'Uygun değil'), i = el_('i', 'b3-tarali'); s.prepend(i); return s; })());
    const l = model.uygunDegil;
    sayac.textContent = l.length ? `Uygun değil: ${l.length} eleman (${l.slice(0, 4).join(', ')}${l.length > 4 ? ', …' : ''})` : 'Bütün elemanlar uygun';
    sayac.classList.toggle('degil', l.length > 0);
  }
  function balonKur() {
    aksKat.replaceChildren(); balonlar.length = 0;
    for (const a of model.aks) {
      const e = el_('span', 'b3-balon', a.yazi); aksKat.append(e);
      const dx = a.q[0] - a.p[0], dy = a.q[1] - a.p[1], L = Math.hypot(dx, dy);
      balonlar.push({ e, p: P(a.p[0] - dx / L * .5, a.p[1] - dy / L * .5, 0) });
    }
  }
  function kurSahne() {
    if (S) { sahne.remove(S.grup); S.secKenar?.material.dispose(); S.at(); }
    renk = temaRengi();
    S = sahneKur(model, renk, tarama); sahne.add(S.grup);
    altCiz(); secimCiz();
  }

  // Dışarıdan: yeni hesap sonucu
  function guncelle(sonuc, g) {
    yok.hidden = true; tuval.hidden = false; ust.hidden = alt.hidden = false;
    model = binaModeli(sonuc, g); katli = model.katli;
    const once = kureM; kureM = kure(model);
    katSecenek(); balonKur(); kurSahne();
    // ilk çizimde ve bina boyutu belirgin değişince (aks, kat sayısı) yeniden sığdır; küçük değişiklikte bakış korunur
    if (ilk || Math.abs(kureM.radius - once.radius) > .05 * once.radius || kureM.center.distanceTo(once.center) > .05 * once.radius) { ilk = false; olcekli = false; sigdir(); }
    ciz();
  }
  function hata(yazi) {
    yok.textContent = yazi; yok.hidden = false; tuval.hidden = true; ust.hidden = alt.hidden = kart.hidden = true; aksKat.replaceChildren(); balonlar.length = 0;
  }
  // Dışarıdan seçim (tablo satırı): ad yoksa ya da 3B'de karşılığı yoksa seçim kalkar
  function sec(ad, kat = null) {
    if (secim?.ad === ad && (!katli || !kat || secim.kat === kat)) return; // katlı değilse kopyalar aynı: tıklanan kopya kalır
    secim = ad ? { ad, kat } : null; kartAcik = false; if (model) secimCiz();
  }

  // ── Kontrol
  const isaret = new Map(); let surukle = null, iki = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function vur(x, y) {
    const r = tuval.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, kamera);
    return ray.intersectObjects(S?.aglar.filter(a => a.visible) ?? [], false).find(h => h.object.userData.secilebilir)?.object ?? null;
  }
  function kaydir(dx, dy) {
    const olc = 2 * uzak * Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)) / (kap.clientHeight || 1);
    const sag = new THREE.Vector3().setFromMatrixColumn(kamera.matrixWorld, 0), yukari = new THREE.Vector3().setFromMatrixColumn(kamera.matrixWorld, 1);
    hedef.addScaledVector(sag, -dx * olc).addScaledVector(yukari, dy * olc); olcekli = true; ciz();
  }
  const yakinlas = k => { uzak = THREE.MathUtils.clamp(uzak * k, kureM.radius * .04, kureM.radius * 8); olcekli = true; ciz(); };
  tuval.style.touchAction = tam ? 'none' : 'pan-y';
  tuval.addEventListener('contextmenu', e => e.preventDefault());
  tuval.addEventListener('pointerdown', e => {
    try { tuval.setPointerCapture(e.pointerId); } catch { /* yapay olay */ } isaret.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isaret.size === 1) surukle = { x: e.clientX, y: e.clientY, az, yuk, kip: e.shiftKey || e.button === 2 || e.ctrlKey ? 'kay' : 'don', hareket: false, sx: e.clientX, sy: e.clientY };
    else if (isaret.size === 2) { const [a, b] = [...isaret.values()]; iki = { d: Math.hypot(a.x - b.x, a.y - b.y), uzak, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; surukle = null; }
  });
  tuval.addEventListener('pointermove', e => {
    if (!isaret.has(e.pointerId)) return;
    isaret.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (iki && isaret.size === 2) {
      const [a, b] = [...isaret.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      uzak = THREE.MathUtils.clamp(iki.uzak * iki.d / Math.max(d, 1), kureM.radius * .04, kureM.radius * 8);
      kaydir(mx - iki.mx, my - iki.my); iki.mx = mx; iki.my = my; return;
    }
    if (!surukle) return;
    if (!surukle.hareket && Math.hypot(e.clientX - surukle.sx, e.clientY - surukle.sy) > 4) surukle.hareket = true;
    if (!surukle.hareket) return;
    if (surukle.kip === 'kay') { kaydir(e.clientX - surukle.x, e.clientY - surukle.y); surukle.x = e.clientX; surukle.y = e.clientY; return; }
    az = surukle.az - (e.clientX - surukle.sx) * .007;
    yuk = THREE.MathUtils.clamp(surukle.yuk + (e.clientY - surukle.sy) * .005, -.2, 1.5); olcekli = true; ciz();
  });
  const birak = e => {
    const tik = surukle && !surukle.hareket && isaret.size === 1 && e.type === 'pointerup';
    isaret.delete(e.pointerId); if (isaret.size < 2) iki = null;
    if (tik) {
      const a = vur(e.clientX, e.clientY);
      secim = a ? { ad: a.userData.el.ad, kat: a.userData.el.kat } : null; kartAcik = !!a; secimCiz();
      secildi(secim);
    }
    if (!isaret.size) surukle = null;
  };
  tuval.addEventListener('pointerup', birak); tuval.addEventListener('pointercancel', birak);
  tuval.addEventListener('dblclick', e => {
    const a = vur(e.clientX, e.clientY);
    if (!a) { olcekli = false; return sigdir(); }
    const b = new THREE.Box3().setFromObject(a); olcekli = true;
    sigdir(new THREE.Sphere(b.getCenter(new THREE.Vector3()), Math.max(1.2, b.getSize(new THREE.Vector3()).length() / 2 * 1.6)));
  });
  tuval.addEventListener('wheel', e => {
    if (!tam && !e.ctrlKey && !e.metaKey) return; // gömülüde sayfa kaysın; trackpad kıstırma ctrlKey ile gelir
    e.preventDefault(); yakinlas(Math.exp(e.deltaY * (e.deltaMode === 1 ? .05 : .0015)));
  }, { passive: false });
  tuval.addEventListener('keydown', e => {
    const adim = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, .06], ArrowDown: [0, -.06] }[e.key];
    if (adim) { e.preventDefault(); az += adim[0]; yuk = THREE.MathUtils.clamp(yuk + adim[1], -.2, 1.5); ciz(); }
    else if (e.key === '+' || e.key === '=') yakinlas(.85); else if (e.key === '-') yakinlas(1.18);
    else if (e.key === 'Escape' && secim) { secim = null; kartAcik = false; secimCiz(); secildi(null); }
  });
  katSec.addEventListener('change', () => { katGor = katSec.value === 'tum' ? 'tum' : +katSec.value; gorunurluk(); });
  dosemeD.addEventListener('click', () => { dosemeGizli = !dosemeGizli; dosemeD.setAttribute('aria-pressed', dosemeGizli); gorunurluk(); });
  sigD.addEventListener('click', () => { olcekli = false; sigdir(); });
  addEventListener('tema', () => { if (model) { kurSahne(); ciz(); } });
  new IntersectionObserver(([g]) => { if (g.isIntersecting) ciz(); }).observe(kap);

  return { guncelle, sec, hata, ciz };
}

// ── Yazdırma resmi: sabit eğik açı, seçimsiz, kâğıt renkleri, taralı = uygun değil; aks balonları resme yazılır. PNG data URL ya da null.
export function binaResmi(sonuc, g, { gen = 1500, yuk = 1000 } = {}) {
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { return null; }
  try {
    const model = binaModeli(sonuc, g), renk = baskiRengi(), sahne = new THREE.Scene(), tarama = taramaDokusu();
    r.setSize(gen, yuk, false); r.setClearColor(renk.arka, 1); isik(sahne);
    const S = sahneKur(model, renk, tarama); sahne.add(S.grup);
    const k = kure(model), kam = new THREE.PerspectiveCamera(30, gen / yuk, .1, 2000), yf = THREE.MathUtils.degToRad(15), xf = Math.atan(Math.tan(yf) * gen / yuk);
    const d = k.radius / Math.sin(Math.min(yf, xf)) * .98, az = -.72, el = .5;
    kam.position.set(k.center.x + d * Math.cos(el) * Math.sin(az), k.center.y + d * Math.sin(el), k.center.z + d * Math.cos(el) * Math.cos(az));
    kam.near = d / 300; kam.far = d + k.radius * 6; kam.updateProjectionMatrix(); kam.lookAt(k.center);
    r.render(sahne, kam);
    const c = document.createElement('canvas'); c.width = gen; c.height = yuk;
    const x = c.getContext('2d'); x.drawImage(r.domElement, 0, 0);
    x.font = '600 22px "Hanken Grotesk", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const v = new THREE.Vector3();
    for (const a of model.aks) {
      const dx = a.q[0] - a.p[0], dy = a.q[1] - a.p[1], L = Math.hypot(dx, dy);
      v.copy(P(a.p[0] - dx / L * .5, a.p[1] - dy / L * .5, 0)).project(kam);
      const px = (v.x + 1) / 2 * gen, py = (1 - v.y) / 2 * yuk;
      x.beginPath(); x.arc(px, py, 17, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#555'; x.stroke();
      x.fillStyle = '#111'; x.fillText(a.yazi, px, py + 1);
    }
    S.at(); tarama.dispose();
    return c.toDataURL('image/png');
  } catch (e) { console.error(e); return null; }
  finally { r.dispose(); r.forceContextLoss(); }
}
