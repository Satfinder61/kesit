// 3B görünüm: kesit kat yüksekliği boyunca uzatılır. three.js r169 (yerel kopya), yalnızca sekme açılınca yüklenir.
import * as THREE from './vendor/three.module.min.js';

export function kur(kap) {
  const cizici = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  cizici.setPixelRatio(Math.min(devicePixelRatio, 2));
  kap.prepend(cizici.domElement);
  cizici.domElement.setAttribute('aria-label', 'Elemanın 3B görünümü');
  cizici.domElement.setAttribute('role', 'img');

  const sahne = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(32, 1, 0.01, 500);
  const izgara = new THREE.GridHelper(1, 20, 0x5a554e, 0x2a2825);
  sahne.add(izgara);
  const govde = new THREE.MeshBasicMaterial({ transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
  const kenar = new THREE.LineBasicMaterial({ color: 0xece6da });
  let kutu = null, cerceve = null, merkezY = 1, mesafe = 8;
  let az = -.75, yuk = .42, surukle = null;
  const sabit = matchMedia('(prefers-reduced-motion: reduce)');

  function guncelle({ kisa, uzun, H, gecti }) {
    const w = uzun / 1000, d = kisa / 1000, h = H / 1000;
    if (kutu) { sahne.remove(kutu, cerceve); kutu.geometry.dispose(); cerceve.geometry.dispose(); }
    const geo = new THREE.BoxGeometry(w, h, d);
    kutu = new THREE.Mesh(geo, govde);
    cerceve = new THREE.LineSegments(new THREE.EdgesGeometry(geo), kenar);
    kutu.position.y = cerceve.position.y = h / 2;
    sahne.add(kutu, cerceve);
    govde.color.set(gecti ? 0x8fd9b0 : 0xff5c57);
    const olcek = Math.max(w, h, d);
    izgara.scale.setScalar(olcek * 2.2);
    merkezY = h / 2;
    mesafe = olcek * 2.6;
  }

  const kameraKur = () => {
    kamera.position.set(mesafe * Math.cos(yuk) * Math.sin(az), merkezY + mesafe * Math.sin(yuk), mesafe * Math.cos(yuk) * Math.cos(az));
    kamera.lookAt(0, merkezY, 0);
  };

  const tuval = cizici.domElement;
  tuval.addEventListener('pointerdown', e => { surukle = { x: e.clientX, y: e.clientY, az, yuk }; tuval.setPointerCapture(e.pointerId); });
  tuval.addEventListener('pointermove', e => {
    if (!surukle) return;
    az = surukle.az - (e.clientX - surukle.x) * .008;
    yuk = Math.min(1.35, Math.max(.05, surukle.yuk + (e.clientY - surukle.y) * .006));
  });
  tuval.addEventListener('pointerup', () => { surukle = null; });

  let id = 0;
  const dongu = () => {
    if (!surukle && !sabit.matches) az += .0025;
    kameraKur();
    cizici.render(sahne, kamera);
    id = requestAnimationFrame(dongu);
  };
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = kap;
    if (!w || !h) return;
    cizici.setSize(w, h, false);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
  }).observe(kap);
  new IntersectionObserver(([g]) => {
    cancelAnimationFrame(id);
    if (g.isIntersecting && !kap.hidden) dongu();
  }).observe(kap);

  return { guncelle };
}
