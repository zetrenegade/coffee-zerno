// ZERNO — 3D-зерно на первом экране (three.js с CDN) + окружение «Атмосфера»:
// зёрна на трёх глубинах, листья, пар и пылинки в тёплом свете.
// Обычный (не module) скрипт с динамическим import — так сайт открывается и двойным кликом с диска.
(async () => {
const hero = document.querySelector('.hero');
if (!hero) return;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let THREE, RoomEnvironment;
try {
  THREE = await import('three');
  ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
} catch (e) { hero.classList.add('no-3d'); return; }   // без сети/WebGL экран остаётся с текстом и свечением

const FOV = 28, CAMZ = 6.4, TAN = Math.tan(FOV * Math.PI / 360);

/* слой = отдельный canvas: задний и передний размыты CSS-фильтром (глубина резкости) */
function makeLayer(sel, dprMax, keyI, rimI, rimC = 0xff9d5e) {
  const canvas = hero.querySelector(sel);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprMax));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffe0bd, keyI); key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(rimC, rimI); rim.position.set(-4, 2.5, -3);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.z = CAMZ;
  return { renderer, scene, camera, items: [] };
}
// передний слой светим мягче: крупные размытые объекты у камеры иначе вспыхивают белым
const L = {
  back: makeLayer('.layer--back', 1, 2.4, 3.8),
  mid: makeLayer('.layer--mid', 1.5, 2.4, 3.8),
  // нейтральный контровой свет: оранжевый на сильно размытом зерне давал «красное пятно»
  front: makeLayer('.layer--front', 1, 1.1, 1.0, 0xffe2c8),
};

/* ---------- геометрия ---------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = v => v * v * (3 - 2 * v), u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const M = (a, b, t) => a + (b - a) * t;
  return M(M(M(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), M(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
           M(M(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), M(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
// зерно: сплюснутая сфера, плоская грань (+z) с S-образной бороздкой, темнее к краям
function beanGeometry(ws, hs) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color(0x4a2716), dark = new THREE.Color(0x120804), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y;
    x *= 0.68 * (1 - 0.14 * t * t);
    const front = z > 0;
    z = front ? 0.34 * (0.45 * z + 0.55 * Math.sqrt(z)) : 0.52 * z;
    const sx = x - 0.06 * Math.sin(t * 3.1);
    const ends = Math.pow(Math.max(0, 1 - t * t), 0.6);
    const g1 = Math.exp(-(sx * sx) / (2 * 0.032 * 0.032));
    const g2 = Math.exp(-(sx * sx) / (2 * 0.11 * 0.11));
    z -= (0.15 * g1 + 0.03 * g2) * ends * (front ? smooth(0, 0.2, p.getZ(i)) : 0);
    const n = 1 + 0.012 * (vnoise(x * 5, y * 5, z * 5) - 0.5) + 0.004 * (vnoise(x * 18, y * 18, z * 18) - 0.5);
    p.setXYZ(i, x * n, y * n, z * n);
    const shade = Math.min(1, (g1 * 1.6 + g2 * 0.4) * ends * (front ? 1 : 0) + 0.3 * t * t + 0.25 * vnoise(x * 6, y * 6, z * 6));
    c.copy(base).lerp(dark, shade);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
// лист кофейного дерева: сложен по центральной жилке и изогнут по длине
function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 28, 80);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color(0x2b4223), vein = new THREE.Color(0x56643a), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2, v = p.getY(i) * 2;
    const w = Math.pow(Math.max(0, 1 - v * v), 0.8) * (1 - 0.2 * v);
    const x = u * 0.42 * w, y = v * 1.25;
    const mid = Math.exp(-(u * u) / 0.004);
    const side = Math.pow(Math.abs(Math.sin((v * 5 + Math.abs(u) * 2.2) * Math.PI)), 40) * (1 - Math.abs(u)) * 0.6;
    const z = 0.2 * Math.abs(u) * w + 0.3 * v * v - 0.02 * mid + 0.04 * Math.sin(u * 3 + v * 7) * Math.abs(u) - side * 0.008;
    p.setXYZ(i, x, y, z);
    c.copy(base).lerp(vein, Math.min(1, mid * 0.8 + side * 0.5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const MAT = {
  bean: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, envMapIntensity: 0.85,
    clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(0x7a4a2c), sheenRoughness: 0.7 }),
  // для переднего слоя: матовее и без лака — чтобы не было белых вспышек
  beanSoft: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.7, envMapIntensity: 0.45,
    clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0.25, sheenColor: new THREE.Color(0x6a3e22), sheenRoughness: 0.8 }),
  leafSoft: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, envMapIntensity: 0.5,
    clearcoat: 0.15, clearcoatRoughness: 0.6, side: THREE.DoubleSide }),
};
const GEO = { main: beanGeometry(260, 160), bean: beanGeometry(140, 90), leaf: leafGeometry() };

const bean = new THREE.Mesh(GEO.main, MAT.bean);
const pivot = new THREE.Group();
pivot.add(bean);
pivot.rotation.z = -0.3;              // почти вертикально — зерно читается как буква O
L.mid.scene.add(pivot);

/* ---------- окружение «Атмосфера» ----------
   [слой, что, fx, fy, z, размер, толькоПК]; fx/fy — доля половины экрана (+y вверх).
   Зоны без объектов: полоса с названием ZERNO (|fy| < 0.32) и нижний ряд текста. */
const ITEMS = [
  ['back', 'bean', -0.62, 0.7, -3, 0.36],
  ['back', 'bean', 0.38, 0.74, -4, 0.32, 1],      // левее — не пересекается с зерном-O
  ['back', 'bean', -0.88, -0.42, -3.4, 0.34, 1],   // левый край, ниже названия
  ['back', 'bean', -0.12, -0.64, -2.6, 0.3, 1],   // ниже названия, между текстом и кнопкой, размыто
  ['back', 'leaf', -0.96, -0.9, -2, 0.75, 1],
  ['mid', 'bean', 0.02, 0.76, 0.8, 0.15, 1],     // над названием
  ['front', 'bean', 0.95, 0.88, 3.2, 0.42, 1],
  ['front', 'leaf', -1.04, 0.18, 2.6, 0.48, 1],    // левый край на высоте названия, частично за кадром
  ['front', 'leaf', 0.92, -0.86, 2.4, 0.45, 1],    // правее и ниже — не налезает на зерно-O
];
let rnd = 7;
const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
for (const [layer, kind, fx, fy, z, s, desk] of ITEMS) {
  const mat = kind === 'leaf' ? MAT.leafSoft : (layer === 'front' ? MAT.beanSoft : MAT.bean);
  const m = new THREE.Mesh(GEO[kind], mat);
  if (kind === 'leaf') m.rotation.set(-0.5 + rand() * 0.6, -0.4 + rand() * 0.8, rand() * 6.3);
  else m.rotation.set(rand() * 6.3, rand() * 6.3, rand() * 6.3);
  L[layer].scene.add(m);
  L[layer].items.push({ m, fx, fy, z, s, desk, kind,
    spin: [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.7, (rand() - 0.5) * 0.4].map((v, j) => kind === 'leaf' ? (j === 2 ? v * 0.3 : 0) : v),
    ph: rand() * 6.3, sp: 0.5 + rand() * 0.6 });
}

/* ---------- 2D: пар и пылинки ---------- */
const fx = hero.querySelector('.fx');
const ctx = fx.getContext('2d');
const puffs = [], motes = [];

/* ---------- размеры: зерно встаёт в пустое место под букву O ---------- */
let W = 1, H = 1, aspect = 1, narrow = false, mainS = 0.5, mainX = 0, mainY = 0, bx = 0, by = 0, br = 100, sk = 1;
const narrowMQ = matchMedia('(max-width:760px),(max-aspect-ratio:4/5)');   // как в CSS
const slot = hero.querySelector('.name__o');
function offsetIn(el) {            // offset'ы не учитывают transform появления — позиция сразу финальная
  let x = 0, y = 0;
  for (let n = el; n && n !== hero; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y };
}
function resize() {
  W = hero.clientWidth; H = hero.clientHeight; aspect = W / H; narrow = narrowMQ.matches;
  for (const k in L) {
    L[k].renderer.setSize(W, H, false);
    L[k].camera.aspect = aspect; L[k].camera.updateProjectionMatrix();
  }
  fx.width = W; fx.height = H;
  const unit = 2 * CAMZ * TAN / H;                       // мировых единиц на пиксель (глубина 0)
  const o = offsetIn(slot), sw = slot.offsetWidth, sh = slot.offsetHeight;
  bx = o.x + sw / 2; by = o.y + sh / 2;
  const beanPx = sh * (narrow ? 2.0 : 1.3);              // зерно чуть выше заглавных, на телефоне крупнее
  mainS = beanPx * unit / 2.0;
  mainX = (bx - W / 2) * unit; mainY = (H / 2 - by) * unit;
  br = beanPx / 2;
  sk = narrow ? 0.6 : 1;
  hero.style.setProperty('--bx', bx + 'px');
  hero.style.setProperty('--by', by + 'px');
  hero.style.setProperty('--br', br + 'px');
}
new ResizeObserver(resize).observe(hero);
if (document.fonts) document.fonts.ready.then(resize);
resize();

/* ---------- движение ---------- */
const mouse = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
const PARALLAX = { back: -0.025, mid: 0.02, front: 0.07 };
const shadow = hero.querySelector('.shadow');
const clock = new THREE.Clock();
let spin = 0, visible = true, raf = 0;

// за пределами экрана не рисуем — бережём батарею
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  if (visible && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
}).observe(hero);

function frame() {
  raf = 0;
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const k = reduce ? 0.2 : 1;
  tilt.x += (mouse.y - tilt.x) * 0.05;
  tilt.y += (mouse.x - tilt.y) * 0.05;

  spin += dt * 0.42 * k;
  bean.rotation.y = spin + tilt.y * 0.5;
  bean.rotation.x = 0.25 + tilt.x * 0.35;
  const float = Math.sin(t * 0.9) * 0.08 * k;
  pivot.scale.setScalar(mainS);
  pivot.position.set(mainX, mainY + float * mainS, 0);
  shadow.style.setProperty('--sh', (1 - float * 1.4).toFixed(3));
  shadow.style.setProperty('--sho', (0.9 - float * 2).toFixed(3));

  for (const name in L) {
    const layer = L[name], par = PARALLAX[name];
    for (const it of layer.items) {
      it.m.visible = !(narrow && it.desk);
      const visH = 2 * (CAMZ - it.z) * TAN, visW = visH * aspect;
      it.m.position.set((it.fx + tilt.y * par) * visW / 2,
                        (it.fy - tilt.x * par) * visH / 2 + Math.sin(t * it.sp + it.ph) * 0.06 * k, it.z);
      it.m.scale.setScalar(it.s * sk);
      if (it.kind === 'leaf') it.m.rotation.x += Math.sin(t * 0.6 + it.ph) * 0.0015 * k;
      it.m.rotation.x += it.spin[0] * dt * k;
      it.m.rotation.y += it.spin[1] * dt * k;
      it.m.rotation.z += it.spin[2] * dt * k;
    }
    layer.renderer.render(layer.scene, layer.camera);
  }

  // пар — мягкая дымка поднимается из-за зерна
  ctx.clearRect(0, 0, W, H);
  if (puffs.length < 34 && Math.random() < dt * 6) puffs.push({
    x: bx + (Math.random() - 0.5) * br * 0.9, y: by - br * 0.2, r: br * (0.1 + Math.random() * 0.08),
    life: 0, max: 5 + Math.random() * 4, seed: Math.random() * 10, vy: br * (0.32 + Math.random() * 0.2) });
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life += dt * k; if (p.life > p.max) { puffs.splice(i, 1); continue; }
    p.y -= p.vy * dt * k;
    p.x += Math.sin(p.life * 1.1 + p.seed) * br * 0.32 * dt * k;
    p.r += br * 0.07 * dt * k;
    const a = Math.sin(Math.PI * p.life / p.max) * 0.07;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(236,222,204,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(236,222,204,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
  }
  // пылинки в тёплом свете
  if (motes.length < (narrow ? 45 : 95) && Math.random() < dt * 30) {
    const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * br * 2.6;
    motes.push({ x: bx + Math.cos(a) * d, y: by + Math.sin(a) * d, s: 0.8 + Math.random() * 1.8,
      life: 0, max: 4 + Math.random() * 5, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 8, tw: Math.random() * 6 });
  }
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.life += dt * k; if (m.life > m.max) { motes.splice(i, 1); continue; }
    m.x += m.vx * dt * k; m.y += m.vy * dt * k;
    const a = Math.sin(Math.PI * m.life / m.max) * (0.5 + 0.35 * Math.sin(t * 3 + m.tw));
    ctx.fillStyle = `rgba(232,198,140,${Math.max(0, a).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.s, 0, 6.283); ctx.fill();
  }
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
})();
