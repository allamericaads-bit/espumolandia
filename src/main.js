import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTextures } from './textures.js';
import { buildWorld, groundHeight, SPAWN } from './house.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { Net } from './net.js';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const G = 9.8;

// Score needed for the house to be 100% soaped (sum of everyone's foam points).
const TARGET_SCORE = 20000;

const SOAPS = [
  { name: 'Clássico', color: '#ff8fb3', foam: '#fff0f6', unlock: 0, desc: 'Espuma cremosa e rosinha', effect: 'classic', cd: 0.3 },
  { name: 'Glicerina', color: '#4fdc9e', foam: '#e6fff3', unlock: 0, desc: 'Quica 3 vezes, espumando a cada quique', effect: 'bounce', cd: 0.34 },
  { name: 'Lavanda', color: '#ad86ff', foam: '#f1e9ff', unlock: 5, desc: 'Estoura numa nuvem de bolhas que grudam', effect: 'burst', cd: 0.45 },
  { name: 'Efervescente', color: '#ff9f43', foam: '#fff1df', unlock: 15, desc: 'Se divide em 5 no meio do ar', effect: 'cluster', cd: 0.6 },
  { name: 'Arco-íris', color: '#ffffff', foam: '#ffffff', unlock: 30, desc: 'Espuma colorida e confete de bolhas', effect: 'rainbow', cd: 0.4, rainbow: true },
  { name: 'Mega Sabão', color: '#3f9dff', foam: '#e8f4ff', unlock: 50, desc: 'Gigante: explosão de espuma que treme tudo', effect: 'mega', cd: 2.2, scale: 2.3 },
];
const WEAPONS = [
  { id: 'soap', name: 'Sabonete', icon: '🧼' },
  { id: 'water', name: "Pistola d'água", icon: '💦' },
  { id: 'bubble', name: 'Bolhas', icon: '🫧' },
];
const STAGES = [
  [0, 'Limpinha'], [0.06, 'Respingada'], [0.2, 'Ensaboada'], [0.4, 'Espumando'],
  [0.65, 'Virando nuvem'], [0.9, 'Quase submersa'], [1, 'TOTALMENTE ENSABOADA!'],
];
const CAT_UNIT = { soap: 'sabonetes', water: 'jatos', foam: 'pts de espuma', height: 'de altura' };
const fmtCat = (cat, v) => (cat === 'height' ? `${(v / 100).toFixed(1).replace('.', ',')} m` : fmt(v));
const LOOKS = {
  shirt: ['#ff5d8f', '#3fa9f5', '#ffb627', '#36c47a', '#9b6bff', '#ff7a3d', '#1fc4c4'],
  pants: ['#2f4a7a', '#3b3b46', '#5a4636', '#2d5b4f'],
  skin: ['#f2c7a5', '#d9a07a', '#a8714f', '#7a4e33', '#f6d9c2'],
  hair: ['#2b1d14', '#5a3a1e', '#c99a4f', '#1a1a1a', '#8a3b22'],
};

// ---------------------------------------------------------------- profile
function loadProfile() {
  let id = null, name = '', lifetime = 0;
  try {
    id = localStorage.getItem('ce:id');
    name = localStorage.getItem('ce:name') || '';
    lifetime = Number(localStorage.getItem('ce:lifetimeSoap')) || 0;
  } catch { /* storage blocked */ }
  if (!id || !/^[a-z0-9]{8,32}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 18);
    try { localStorage.setItem('ce:id', id); } catch { /* ignore */ }
  }
  return { id, name, lifetime };
}
function saveProfile() {
  try {
    localStorage.setItem('ce:name', profile.name);
    localStorage.setItem('ce:lifetimeSoap', String(profile.lifetime));
  } catch { /* ignore */ }
}
const profile = loadProfile();
const hashPick = (arr, salt) => {
  let h = 0;
  for (const ch of profile.id + salt) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return arr[Math.abs(h) % arr.length];
};

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
const canvas = renderer.domElement;
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.38;
scene.fog = new THREE.Fog(0xd6eafa, 45, 150);

const T = createTextures();
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 32, 16),
    new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
  );
  sky.userData.noAO = true;
  scene.add(sky);
}

scene.add(new THREE.HemisphereLight(0xdcefff, 0x9c8c6c, 0.8));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
sun.position.set(-14, 22, 16);
sun.target.position.set(2, 0, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 20, bottom: -16, near: 1, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const { colliders, foamSpots, emitters, update: updateWorld } = buildWorld(scene, T);
const projColliders = colliders.filter((c) => c.proj);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(camera);

// ---------------------------------------------------------------- graphics quality (ambient occlusion on "alto")
const QUALITIES = ['alto', 'medio', 'leve'];
const QUALITY_LABEL = { alto: 'Gráficos: alto', medio: 'Gráficos: médio', leve: 'Gráficos: leve' };
const Q = { level: 'alto', manual: false, composer: null, gtao: null };
try {
  const saved = localStorage.getItem('ce:quality');
  if (QUALITIES.includes(saved)) { Q.level = saved; Q.manual = true; }
} catch { /* ignore */ }
if (!Q.manual && window.matchMedia('(pointer: coarse)').matches) Q.level = 'medio';
function buildComposer() {
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12 });
    gtao.blendIntensity = 0.85;
    // only solid geometry should cast AO: skip sprites, see-through and alpha-cut cards (leaves, grass, wire, bubbles)
    let noAO = [], age = 99;
    const saved = [];
    gtao.overrideVisibility = function () {
      if (++age > 30) { // the list only changes when things are added, so refresh it twice a second
        age = 0;
        noAO = [];
        this.scene.traverse((o) => {
          const m = o.material;
          if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && (m.transparent || m.alphaTest > 0))) noAO.push(o);
        });
      }
      saved.length = 0;
      for (const o of noAO) { saved.push(o.visible); o.visible = false; }
    };
    gtao.restoreVisibility = function () {
      noAO.forEach((o, i) => { o.visible = saved[i]; });
    };
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    Q.composer = composer; Q.gtao = gtao;
  } catch (e) {
    console.warn('AO indisponível', e);
    Q.composer = null;
  }
}
function applyQuality(level) {
  Q.level = level;
  const dpr = level === 'leve' ? 1 : Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const size = level === 'leve' ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (level === 'alto' && !Q.composer) buildComposer();
  if (Q.composer) { Q.composer.setPixelRatio(dpr); Q.composer.setSize(window.innerWidth, window.innerHeight); }
  const btn = document.getElementById('quality');
  if (btn) btn.textContent = QUALITY_LABEL[level];
}
function render() {
  if (Q.level === 'alto' && Q.composer) Q.composer.render();
  else renderer.render(scene, camera);
}

// ---------------------------------------------------------------- foam spheres (solid, buildable, walkable)
const foamCells = new Map();
const FOAM_PAD = 1.0;
const cellKey = (ix, iz) => ix * 73856 + iz;
function foamAdd(s) {
  s.ix = Math.floor(s.x); s.iz = Math.floor(s.z);
  const k = cellKey(s.ix, s.iz);
  let a = foamCells.get(k);
  if (!a) { a = []; foamCells.set(k, a); }
  a.push(s);
}
function foamRemove(s) {
  const a = foamCells.get(cellKey(s.ix, s.iz));
  if (!a) return;
  const i = a.indexOf(s);
  if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
}
function foamQuery(x0, x1, z0, z1, cb) {
  const ix0 = Math.floor(x0 - FOAM_PAD), ix1 = Math.floor(x1 + FOAM_PAD);
  const iz0 = Math.floor(z0 - FOAM_PAD), iz1 = Math.floor(z1 + FOAM_PAD);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const a = foamCells.get(cellKey(ix, iz));
      if (a) for (let i = 0; i < a.length; i++) cb(a[i]);
    }
  }
}

// ---------------------------------------------------------------- materials & instanced pools
function bubbleMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
    iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [120, 900],
    depthWrite: false, envMapIntensity: 2.4,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      float fres = pow(1.0 - abs(dot(normalize(-vViewPosition), normal)), 2.2);
      gl_FragColor.a = clamp(gl_FragColor.a + fres * 0.75, 0.0, 0.95);`,
    );
  };
  return m;
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
const blobGeo = new THREE.SphereGeometry(1, 14, 10);
blobGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 === 0 ? 3 : 1.5); });
const bubbleGeo = new THREE.SphereGeometry(1, 14, 10);
const dropGeo = new THREE.SphereGeometry(1, 6, 5);
const barGeo = new RoundedBoxGeometry(0.3, 0.1, 0.18, 3, 0.04);

const foamMat = new THREE.MeshStandardMaterial({
  map: T.foam, transparent: true, depthWrite: false, roughness: 0.5,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const dripMat = foamMat.clone();
dripMat.map = T.drip;
const blobMat = new THREE.MeshPhysicalMaterial({
  map: T.suds.map, bumpMap: T.suds.bump, bumpScale: 4,
  roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25,
  emissive: 0xffffff, emissiveIntensity: 0.07,
});
const bubbleMat = bubbleMaterial();
const waterMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.75, roughness: 0.05, envMapIntensity: 2 });

class Pool {
  constructor(geo, mat, max, { shadow = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.max = max; this.next = 0; this.used = 0; this.dirty = false;
    this.meta = new Array(max);   // collision sphere tied to each slot (foam balls)
    scene.add(this.mesh);
  }
  alloc() {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.used < this.max) { this.used++; this.mesh.count = this.used; }
    if (this.meta[i]) { foamRemove(this.meta[i]); this.meta[i] = null; }
    return i;
  }
  set(i, m, c) {
    this.mesh.setMatrixAt(i, m);
    if (c) this.mesh.setColorAt(i, c);
    this.dirty = true;
  }
  clear() {
    this.next = 0; this.used = 0; this.mesh.count = 0;
    this.meta.fill(null);
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

const foamPool = new Pool(planeGeo, foamMat, 3500);
const dripPool = new Pool(planeGeo, dripMat, 3500);
const blobPool = new Pool(blobGeo, blobMat, 9000, { shadow: true });
const stuckPool = new Pool(bubbleGeo, bubbleMat, 2500);
const pools = [foamPool, dripPool, blobPool, stuckPool];
stuckPool.mesh.renderOrder = 2;

const MAX_FLY = 800, MAX_DROPS = 1000;
const flyMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, MAX_FLY);
flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
flyMesh.frustumCulled = false; flyMesh.count = 0; flyMesh.renderOrder = 3;
flyMesh.setColorAt(0, new THREE.Color(1, 1, 1));
scene.add(flyMesh);
const dropMesh = new THREE.InstancedMesh(dropGeo, waterMat, MAX_DROPS);
dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
dropMesh.frustumCulled = false; dropMesh.count = 0;
scene.add(dropMesh);

// Progressive foam mounds (appear as the global soap level rises)
const moundMesh = new THREE.InstancedMesh(blobGeo, blobMat, foamSpots.length);
moundMesh.frustumCulled = false; moundMesh.castShadow = true; moundMesh.receiveShadow = true;
{
  const tints = SOAPS.map((s) => new THREE.Color(s.foam));
  foamSpots.forEach((s, i) => {
    moundMesh.setColorAt(i, Math.random() < 0.7 ? new THREE.Color(1, 1, 1) : tints[(Math.random() * tints.length) | 0]);
    s.squash = rnd(0.45, 0.7);
  });
}
scene.add(moundMesh);

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (h) => mulberry32((h.x * 73856093) ^ (h.y * 19349663) ^ (h.z * 83492791) ^ (h.s * 2654435761));

const AXIS_Y = new V3(0, 1, 0), AXIS_X = new V3(1, 0, 0);
function tangentBasis(n, angle, R, U) {
  R.crossVectors(Math.abs(n.y) < 0.9 ? AXIS_Y : AXIS_X, n).normalize();
  U.crossVectors(n, R);
  const c = Math.cos(angle), s = Math.sin(angle);
  const rx = R.x * c + U.x * s, ry = R.y * c + U.y * s, rz = R.z * c + U.z * s;
  R.set(rx, ry, rz);
  U.crossVectors(n, R);
}

const FOAM_COLORS = SOAPS.map((s) => new THREE.Color(s.foam));
const WATER_FOAM = new THREE.Color('#eef8ff');
const WHITE = new THREE.Color(1, 1, 1);
const LAVENDER = new THREE.Color('#d9c6ff');
const rainbowColor = (rng, l = 0.75) => new THREE.Color().setHSL(rng(), 0.9, l);

function encodeHit(h) { return `${h.t}${h.c},${h.x},${h.y},${h.z},${h.nx},${h.ny},${h.nz},${h.s}`; }
function decodeHit(str) {
  const a = str.slice(3).split(',').map(Number);
  return { t: str[0], c: Number(str[1]), x: a[0], y: a[1], z: a[2], nx: a[3], ny: a[4], nz: a[5], s: a[6] };
}

// ---------------------------------------------------------------- collision (segment vs boxes, foam balls, ground)
const HIT = { point: new V3(), n: new V3(), ground: false, foam: null, t: 0 };
let _best = 0, _sphere = null;
function segHit(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x);
  const miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
  const minz = Math.min(a.z, b.z), maxz = Math.max(a.z, b.z);
  const o = [a.x, a.y, a.z], d = [dx, dy, dz];
  let best = Infinity, bAxis = -1, bSign = 0;
  for (let ci = 0; ci < projColliders.length; ci++) {
    const c = projColliders[ci];
    if (c.max[0] < minx || c.min[0] > maxx || c.max[1] < miny || c.min[1] > maxy || c.max[2] < minz || c.min[2] > maxz) continue;
    let tmin = 0, tmax = 1, axis = -1, sign = 0, ok = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < c.min[k] || o[k] > c.max[k]) { ok = false; break; }
        continue;
      }
      let t1 = (c.min[k] - o[k]) / d[k], t2 = (c.max[k] - o[k]) / d[k], s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { ok = false; break; }
    }
    if (!ok || axis < 0) continue;
    if (tmin < best) { best = tmin; bAxis = axis; bSign = sign; }
  }
  // foam balls
  _best = best; _sphere = null;
  const A = dx * dx + dy * dy + dz * dz;
  if (A > 1e-12) {
    foamQuery(minx, maxx, minz, maxz, (s) => {
      if (s.y + s.r < miny || s.y - s.r > maxy) return;
      const ox = a.x - s.x, oy = a.y - s.y, oz = a.z - s.z;
      const C = ox * ox + oy * oy + oz * oz - s.r * s.r;
      if (C < 0) return; // started inside
      const B = 2 * (ox * dx + oy * dy + oz * dz);
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t >= 0 && t <= 1 && t < _best) { _best = t; _sphere = s; }
    });
  }
  const sphere = _sphere;
  if (sphere) best = _best;
  let ground = false;
  const gh = groundHeight(b.x, b.z);
  if (b.y < gh) {
    const t = a.y > gh ? (a.y - gh) / (a.y - b.y) : 0;
    if (t < best) { best = t; ground = true; }
  }
  if (best === Infinity) return null;
  HIT.t = best;
  HIT.ground = ground;
  HIT.foam = null;
  HIT.point.set(a.x + dx * best, a.y + dy * best, a.z + dz * best);
  if (ground) {
    HIT.n.set(0, 1, 0); HIT.point.y = Math.max(HIT.point.y, gh);
  } else if (sphere && best === _best) {
    HIT.foam = sphere;
    HIT.n.set(HIT.point.x - sphere.x, HIT.point.y - sphere.y, HIT.point.z - sphere.z).normalize();
  } else {
    HIT.n.set(0, 0, 0).setComponent(bAxis, bSign);
  }
  return HIT;
}

// long ray, tested in short chunks so the foam grid stays cheap
const _ra = new V3(), _rb = new V3();
function rayHit(origin, dir, maxDist) {
  for (let t = 0; t < maxDist; t += 2) {
    _ra.copy(origin).addScaledVector(dir, t);
    _rb.copy(origin).addScaledVector(dir, Math.min(maxDist, t + 2));
    const h = segHit(_ra, _rb);
    if (h) return h;
  }
  return null;
}

function ballistic(from, to, speed) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const x = Math.hypot(dx, dz);
  if (x < 0.05) return null;
  const v2 = speed * speed;
  const disc = v2 * v2 - G * (G * x * x + 2 * dy * v2);
  if (disc < 0) return null;
  const ang = Math.atan((v2 - Math.sqrt(disc)) / (G * x));
  const h = Math.cos(ang) * speed;
  return new V3((dx / x) * h, Math.sin(ang) * speed, (dz / x) * h);
}

// ---------------------------------------------------------------- foam placement
const anims = [];
const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

function emitInstance(pool, m, color, animate, sphere = null) {
  const i = pool.alloc();
  if (sphere) { foamAdd(sphere); pool.meta[i] = sphere; }
  if (animate) {
    const a = { pool, i, pos: new V3(), q: new THREE.Quaternion(), s: new V3(), t: 0, d: rnd(0.22, 0.4) };
    m.decompose(a.pos, a.q, a.s);
    anims.push(a);
    if (anims.length > 500) finishAnim(anims.shift());
    pool.set(i, _zero, color);
  } else {
    pool.set(i, m, color);
  }
}
function finishAnim(a) { _m.compose(a.pos, a.q, a.s); a.pool.set(a.i, _m); }
const _sv = new V3();
function updateAnims(dt) {
  let w = 0;
  for (let k = 0; k < anims.length; k++) {
    const a = anims[k];
    a.t += dt;
    const x = Math.min(1, a.t / a.d);
    const c1 = 1.70158, c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); // easeOutBack
    _sv.copy(a.s).multiplyScalar(Math.max(0.001, e));
    _m.compose(a.pos, a.q, _sv);
    a.pool.set(a.i, _m);
    if (x < 1) anims[w++] = a;
  }
  anims.length = w;
}

function addSplat(p, n, size, color, vertical, rng, animate) {
  const R = new V3(), U = new V3();
  if (vertical) { U.set(0, 1, 0).addScaledVector(n, -n.y).normalize(); R.crossVectors(U, n); } else tangentBasis(n, rng() * Math.PI * 2, R, U);
  const sx = size * (0.85 + rng() * 0.3);
  const sy = vertical ? size * 1.8 : sx * (0.85 + rng() * 0.3);
  const pos = p.clone().addScaledVector(n, 0.006 + rng() * 0.012);
  if (vertical) pos.addScaledVector(U, -sy * 0.27);
  const m = new THREE.Matrix4().makeBasis(R, U, n).scale(new V3(sx, sy, 1)).setPosition(pos);
  emitInstance(vertical ? dripPool : foamPool, m, color, animate);
}
// flattened foam lump stuck to a surface (also solid)
function addBlob(p, n, r, color, animate, rng) {
  const R = new V3(), U = new V3();
  tangentBasis(n, rng() * 6.28, R, U);
  const c = p.clone().addScaledVector(n, r * 0.12);
  const m = new THREE.Matrix4().makeBasis(R, U, n).scale(new V3(r, r, r * 0.6)).setPosition(c);
  const solid = r > 0.07 ? { x: c.x, y: c.y, z: c.z, r: r * 0.78 } : null;
  emitInstance(blobPool, m, color, animate, solid);
}
// round foam ball – the building block that piles up
function addBall(c, r, color, animate, rng) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28));
  const m = new THREE.Matrix4().compose(c, q, new V3(r, r * (0.9 + rng() * 0.15), r));
  emitInstance(blobPool, m, color, animate, { x: c.x, y: c.y, z: c.z, r: r * 0.95 });
}
function addStuck(p, n, r, color, animate) {
  const m = new THREE.Matrix4().makeScale(r, r, r).setPosition(p.clone().addScaledVector(n, r * 0.45));
  emitInstance(stuckPool, m, color, animate);
}

function placeHit(h, animate) {
  const p = new V3(h.x / 100, h.y / 100, h.z / 100);
  const n = new V3(h.nx / 100, h.ny / 100, h.nz / 100);
  if (n.lengthSq() < 0.01) n.set(0, 1, 0);
  n.normalize();
  const size = h.s / 100;
  const rng = seedOf(h);
  if (h.t === 'b') {
    const col = h.c === 4 ? rainbowColor(rng, 0.8) : h.c === 2 ? LAVENDER : WHITE;
    addStuck(p, n, size, col, animate);
    return;
  }
  const colorFor = () => (h.t === 'w' ? WATER_FOAM : h.c === 4 ? rainbowColor(rng, 0.8) : FOAM_COLORS[h.c] || WHITE);
  if (h.t === 'f') {
    // foam growing on foam: one ball + a few smaller ones around it, biased upward so it stacks
    const c = p.clone().addScaledVector(growDir(n), size * 0.55);
    addBall(c, size, colorFor(), animate, rng);
    const extra = size > 0.2 ? 2 + Math.floor(rng() * 3) : 0;
    const R = new V3(), U = new V3();
    for (let i = 0; i < extra; i++) {
      tangentBasis(n, rng() * 6.28, R, U);
      const cc = c.clone().addScaledVector(R, size * (0.5 + rng() * 0.4)).addScaledVector(n, -size * 0.2 * rng());
      addBall(cc, size * (0.45 + rng() * 0.25), colorFor(), animate, rng);
    }
    return;
  }
  const vertical = Math.abs(n.y) < 0.55;
  const color = colorFor();
  addSplat(p, n, size, color, vertical, rng, animate);
  const nb = h.t === 's' ? (h.c === 5 ? 22 : h.c === 4 ? 10 : 7) : rng() < 0.3 ? 1 : 0;
  const R = new V3(), U = new V3();
  for (let i = 0; i < nb; i++) {
    tangentBasis(n, rng() * Math.PI * 2, R, U);
    const d = Math.sqrt(rng()) * size * 0.42;
    const bp = p.clone().addScaledVector(R, d);
    const r = Math.min(0.38, h.t === 's' ? size * (0.08 + rng() * 0.14) : size * (0.06 + rng() * 0.06));
    addBlob(bp, n, r, h.t === 's' && h.c === 4 ? rainbowColor(rng, 0.82) : color, animate, rng);
  }
}

function growDir(n, out = new V3()) {
  out.copy(n);
  if (n.y > -0.5) out.y += 0.8;
  return out.normalize();
}

function weightOf(t, size) {
  if (t === 's') return Math.max(3, Math.round(size * 10));
  if (t === 'f') return Math.max(2, Math.round(size * 30));
  return t === 'w' ? 1 : 2;
}

function recordHit(t, c, point, n, size) {
  const h = {
    t, c,
    x: Math.round(point.x * 100), y: Math.round(point.y * 100), z: Math.round(point.z * 100),
    nx: Math.round(n.x * 100), ny: Math.round(n.y * 100), nz: Math.round(n.z * 100),
    s: clamp(Math.round(size * 100), 1, 999),
  };
  placeHit(h, true);
  net.queueHit(encodeHit(h), weightOf(t, size));
}

// soap hitting something: a flat splat on walls/ground, or a new foam ball on top of foam
function soapImpact(c, pt, n, foamHit, splatSize, ballSize) {
  if (foamHit) recordHit('f', c, pt, n, ballSize); else recordHit('s', c, pt, n, splatSize);
  hitMarker(foamHit);
}
let hitTimer = 0;
function hitMarker(big) {
  const ch = document.getElementById('crosshair');
  ch.classList.remove('hit', 'big');
  void ch.offsetWidth;
  ch.classList.add('hit');
  if (big) ch.classList.add('big');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => ch.classList.remove('hit', 'big'), 180);
  sound.hit();
}

// Sticks bubbles on the surface around an impact point (re-projects each one onto real geometry).
function stickAround(point, n, count, radius, ci, rMin, rMax) {
  const R = new V3(), U = new V3(), a = new V3(), b = new V3();
  for (let i = 0; i < count; i++) {
    tangentBasis(n, Math.random() * 6.28, R, U);
    const d = Math.sqrt(Math.random()) * radius;
    a.copy(point).addScaledVector(R, d).addScaledVector(n, 0.5);
    b.copy(a).addScaledVector(n, -1.2);
    const h = segHit(a, b);
    if (h) recordHit('b', ci, h.point.clone(), h.n.clone(), rnd(rMin, rMax));
  }
}

// ---------------------------------------------------------------- dynamic things
const bars = [];
const resting = [];
const flyers = [];
const drops = [];
const barMats = SOAPS.map((s, i) => new THREE.MeshPhysicalMaterial({
  color: s.color, map: s.rainbow ? T.rainbow : null, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12,
  transparent: i === 1, opacity: i === 1 ? 0.82 : 1, emissive: s.color, emissiveIntensity: s.rainbow ? 0.05 : 0.08,
}));

function spawnBar(idx, p, v, mini = false) {
  const mesh = new THREE.Mesh(barGeo, barMats[idx]);
  const scale = (SOAPS[idx].scale || 1) * (mini ? 0.5 : 1);
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.position.copy(p);
  mesh.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
  scene.add(mesh);
  const b = { mesh, idx, p: p.clone(), v: v.clone(), w: new V3(rnd(-12, 12), rnd(-8, 8), rnd(-12, 12)), age: 0, state: 'fly', bounces: 0, mini, split: false, scale, dis: 0 };
  bars.push(b);
  return b;
}

function spawnBubble(o) {
  if (flyers.length >= MAX_FLY) flyers.shift();
  flyers.push({
    p: o.p.clone(), v: o.v.clone(), r: o.r, age: 0, life: o.life ?? 6, stick: o.stick ?? 0, ci: o.ci ?? 0,
    color: o.color || WHITE, buoy: o.buoy ?? 0.2, drag: o.drag ?? 0.6, phase: Math.random() * 6.28, loud: !!o.loud,
  });
}

function burst(point, n, count, { speed = 2.5, colorFn = null, color = WHITE, life = [0.8, 2.2], r = [0.03, 0.12] } = {}) {
  const R = new V3(), U = new V3();
  for (let i = 0; i < count; i++) {
    tangentBasis(n, Math.random() * 6.28, R, U);
    const v = n.clone().multiplyScalar(rnd(0.6, 1.4) * speed).addScaledVector(R, rnd(-1, 1) * speed);
    spawnBubble({
      p: point.clone().addScaledVector(n, 0.12), v, r: rnd(r[0], r[1]), life: rnd(life[0], life[1]),
      color: colorFn ? colorFn() : color, buoy: rnd(0.1, 0.5), drag: 1.2,
    });
  }
}

function dissolve(b) { b.state = 'dissolve'; b.dis = 0; }

function splitBar(b, n = null) {
  for (let i = 0; i < 5; i++) {
    const v = n
      ? n.clone().multiplyScalar(rnd(2, 4)).add(new V3(rnd(-3, 3), rnd(1, 3), rnd(-3, 3)))
      : b.v.clone().multiplyScalar(0.85).add(new V3(rnd(-3.5, 3.5), rnd(-1, 2), rnd(-3.5, 3.5)));
    spawnBar(3, b.p, v, true);
  }
  burst(b.p, n || new V3(0, 1, 0), 10, { color: FOAM_COLORS[3], speed: 1.5 });
  sound.fizz();
  b.split = true;
  removeBar(b);
}

function removeBar(b) {
  scene.remove(b.mesh);
  b.state = 'dead';
}

function restBar(b, pt, n) {
  b.state = 'rest';
  b.p.copy(pt).addScaledVector(n, 0.05 * b.scale);
  b.mesh.position.copy(b.p);
  b.mesh.rotation.set(0, Math.random() * 6.28, 0);
  if (b.mini) { dissolve(b); return; }
  resting.push(b);
  if (resting.length > 35) { const old = resting.shift(); if (old.state === 'rest') dissolve(old); }
}

function onBarHit(b, h) {
  const pt = h.point.clone(), n = h.n.clone(), ground = h.ground, onFoam = !!h.foam;
  const type = SOAPS[b.idx];
  b.p.copy(pt).addScaledVector(n, 0.06 * b.scale);
  if (b.state === 'fly') {
    const eff = b.mini ? 'mini' : type.effect;
    switch (eff) {
      case 'classic':
        soapImpact(0, pt, n, onFoam, rnd(0.95, 1.25), rnd(0.32, 0.42));
        burst(pt, n, 8, { color: FOAM_COLORS[0] });
        sound.splat(1);
        b.state = 'spent';
        break;
      case 'bounce':
        soapImpact(1, pt, n, onFoam, rnd(0.65, 0.85), rnd(0.24, 0.3));
        burst(pt, n, 4, { color: FOAM_COLORS[1] });
        sound.splat(0.7);
        if (++b.bounces >= 3) b.state = 'spent';
        break;
      case 'burst':
        soapImpact(2, pt, n, onFoam, rnd(0.8, 1.0), rnd(0.3, 0.38));
        if (!ground) stickAround(pt, n, 16, 1.3, 2, 0.06, 0.2);
        burst(pt, n, 40, { color: LAVENDER, speed: 3.2, life: [1.5, 3.5], r: [0.05, 0.18] });
        sound.splat(0.8); sound.fizz();
        dissolve(b);
        return;
      case 'cluster':
        soapImpact(3, pt, n, onFoam, 0.8, 0.3);
        sound.splat(0.8);
        splitBar(b, n);
        return;
      case 'mini':
        soapImpact(3, pt, n, onFoam, rnd(0.45, 0.6), rnd(0.18, 0.24));
        burst(pt, n, 3, { color: FOAM_COLORS[3] });
        sound.splat(0.45);
        dissolve(b);
        return;
      case 'rainbow':
        soapImpact(4, pt, n, onFoam, rnd(1.1, 1.35), rnd(0.36, 0.44));
        if (!ground) stickAround(pt, n, 6, 1.0, 4, 0.06, 0.16);
        burst(pt, n, 34, { colorFn: () => new THREE.Color().setHSL(Math.random(), 0.9, 0.7), speed: 3.5, life: [1, 2.6] });
        sound.splat(1); sound.sparkle();
        b.state = 'spent';
        break;
      case 'mega':
        soapImpact(5, pt, n, onFoam, rnd(2.5, 2.9), rnd(0.7, 0.85));
        if (onFoam) for (let i = 0; i < 4; i++) recordHit('f', 5, pt, new V3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize(), rnd(0.35, 0.5));
        if (!ground) stickAround(pt, n, 12, 2.2, 0, 0.1, 0.3);
        burst(pt, n, 70, { speed: 5, life: [1.5, 4], r: [0.06, 0.25] });
        sound.boom();
        shake();
        dissolve(b);
        return;
      default: break;
    }
  }
  const rest = b.idx === 1 && b.state === 'fly' ? 0.62 : 0.28;
  const vn = b.v.dot(n);
  if (vn < 0) b.v.addScaledVector(n, -(1 + rest) * vn);
  b.v.multiplyScalar(0.72);
  if ((ground || n.y > 0.7) && b.v.length() < 1.6) restBar(b, pt, n);
}

const _p1 = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function updateBars(dt) {
  for (const b of bars) {
    if (b.state === 'dead') continue;
    b.age += dt;
    if (b.state === 'dissolve') {
      b.dis += dt;
      b.mesh.scale.setScalar(b.scale * Math.max(0, 1 - b.dis / 0.3));
      if (b.dis >= 0.3) removeBar(b);
      continue;
    }
    if (b.state === 'rest') continue;
    b.v.y -= G * dt;
    _p1.copy(b.p).addScaledVector(b.v, dt);
    const h = segHit(b.p, _p1);
    if (h) onBarHit(b, h); else b.p.copy(_p1);
    if (b.state === 'dead' || b.state === 'rest') continue;
    _q.setFromEuler(_e.set(b.w.x * dt, b.w.y * dt, b.w.z * dt));
    b.mesh.quaternion.multiply(_q);
    b.mesh.position.copy(b.p);
    if (b.idx === 3 && !b.mini && !b.split && b.state === 'fly' && b.age > 0.32) splitBar(b);
    if (b.p.y < -3 || b.age > 14) removeBar(b);
  }
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].state === 'dead') bars.splice(i, 1);
  for (let i = resting.length - 1; i >= 0; i--) if (resting[i].state === 'dead') resting.splice(i, 1);
}

function updateDrops(dt) {
  let w = 0;
  const dir = new V3();
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    d.life -= dt;
    d.v.y -= G * dt;
    _p1.copy(d.p).addScaledVector(d.v, dt);
    const h = segHit(d.p, _p1);
    if (h) {
      if (h.foam) {
        net.addStat('water', 1);
        if (Math.random() < 0.45) recordHit('f', 0, h.point.clone(), h.n.clone(), rnd(0.1, 0.17));
        sound.drip();
        if (Math.random() < 0.15) hitMarker(false);
      } else if (!h.ground) {
        net.addStat('water', 1);
        if (Math.random() < 0.4) recordHit('w', 0, h.point.clone(), h.n.clone(), rnd(0.22, 0.42));
        sound.drip();
      } else if (Math.random() < 0.12) {
        recordHit('w', 0, h.point.clone(), h.n.clone(), rnd(0.3, 0.5));
      }
      continue;
    }
    if (d.life <= 0) continue;
    d.p.copy(_p1);
    dir.copy(d.v).normalize();
    _q.setFromUnitVectors(AXIS_Y, dir);
    _m.compose(d.p, _q, _sv.set(0.028, 0.085, 0.028));
    dropMesh.setMatrixAt(w, _m);
    drops[w++] = d;
  }
  drops.length = w;
  dropMesh.count = w;
  dropMesh.instanceMatrix.needsUpdate = true;
}

const IDQ = new THREE.Quaternion();
function updateFlyers(dt) {
  let w = 0;
  for (let i = 0; i < flyers.length; i++) {
    const b = flyers[i];
    b.age += dt;
    b.v.y += b.buoy * dt;
    b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
    b.v.x += Math.sin(b.age * 3 + b.phase) * 0.35 * dt;
    b.v.z += Math.cos(b.age * 2.3 + b.phase) * 0.35 * dt;
    _p1.copy(b.p).addScaledVector(b.v, dt);
    const h = segHit(b.p, _p1);
    if (h) {
      if (!h.ground && Math.random() < b.stick) {
        recordHit('b', b.ci, h.point.clone(), h.n.clone(), b.r);
        sound.pop();
      } else if (b.loud) sound.pop();
      continue;
    }
    if (b.age > b.life) { if (b.loud) sound.pop(); continue; }
    b.p.copy(_p1);
    const grow = Math.min(1, b.age * 8);
    const wob = 1 + Math.sin(b.age * 9 + b.phase) * 0.06;
    _m.compose(b.p, IDQ, _sv.set(b.r * grow * wob, b.r * grow / wob, b.r * grow));
    flyMesh.setMatrixAt(w, _m);
    flyMesh.setColorAt(w, b.color);
    flyers[w++] = b;
  }
  flyers.length = w;
  flyMesh.count = w;
  flyMesh.instanceMatrix.needsUpdate = true;
  if (flyMesh.instanceColor) flyMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- state
const S = {
  started: false,
  weapon: 'soap',
  soapIdx: 0,
  firing: false,
  aim: new V3(2.5, 2, -6),
  aimDir: new V3(0, 0, -1),
  cool: 0,
  waterAcc: 0,
  bubbleAcc: 0,
  ambAcc: 0,
  level: 0,
  shownLevel: -1,
  stageIdx: -1,
  keys: {},
  rkPeriod: 'day',
  rkCat: 'soap',
  incoming: [],
  loaded: false,
  soapHidden: 0,
  tap: 0,
  aimHold: 0,
  locked: false,
  touch: false,
  dayBest: 0,
  allBest: 0,
  slipToast: false,
  birdT: 4,
};
const input = { moveX: 0, moveY: 0, run: false, jump: false, lookDX: 0, lookDY: 0, zoom: 0, aiming: false };

const sound = new Sound();
const net = new Net(profile);

const player = new Player({
  scene, camera, colliders, groundHeight, foamQuery, spawn: SPAWN,
  look: { shirt: hashPick(LOOKS.shirt, 's'), pants: hashPick(LOOKS.pants, 'p'), skin: hashPick(LOOKS.skin, 'k'), hair: hashPick(LOOKS.hair, 'h') },
});

// ---------------------------------------------------------------- weapons held in the hand
const HELD = (() => {
  const mk = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.05, ...extra });
  const add = (g, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  const water = new THREE.Group();
  add(water, new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.1, 0.3, 2, 0.02), mk('#ff7a2f')), 0, 0.05, 0.08);
  const tank = add(water, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.17, 16), mk('#4fb3ff', { transparent: true, opacity: 0.85, roughness: 0.1 })), 0, 0.135, 0.05);
  tank.rotation.x = Math.PI / 2;
  const barrel = add(water, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.16, 12), mk('#ffd23f')), 0, 0.065, 0.3);
  barrel.rotation.x = Math.PI / 2;
  const wMuzzle = new THREE.Object3D(); wMuzzle.position.set(0, 0.065, 0.39); water.add(wMuzzle);

  const bubble = new THREE.Group();
  add(bubble, new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.09, 0.24, 2, 0.02), mk('#ff6fc1')), 0, 0.05, 0.06);
  const ring = add(bubble, new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.013, 10, 28), mk('#5ee7ff')), 0, 0.08, 0.24);
  add(bubble, new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), bubbleMat), 0, 0.08, 0.24);
  add(bubble, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 14), mk('#c9f6ff', { transparent: true, opacity: 0.7, roughness: 0.1 })), 0, -0.04, 0.06);
  const bMuzzle = new THREE.Object3D(); bMuzzle.position.copy(ring.position); bubble.add(bMuzzle);

  const soap = new THREE.Group();
  const soapMesh = add(soap, new THREE.Mesh(barGeo, barMats[0]), 0, 0.02, 0.06);
  soapMesh.rotation.set(0.2, 0.3, 0);
  const sMuzzle = new THREE.Object3D(); sMuzzle.position.set(0, 0.05, 0.1); soap.add(sMuzzle);

  player.hand.add(water, bubble, soap);
  return {
    soap: { g: soap, muzzle: sMuzzle, mesh: soapMesh },
    water: { g: water, muzzle: wMuzzle },
    bubble: { g: bubble, muzzle: bMuzzle },
  };
})();

function updateHeld(dt) {
  for (const k of ['soap', 'water', 'bubble']) HELD[k].g.visible = k === S.weapon;
  if (S.weapon === 'soap') {
    S.soapHidden = Math.max(0, S.soapHidden - dt);
    const sc = S.soapHidden > 0.1 ? 0 : (1 - S.soapHidden / 0.1) * (SOAPS[S.soapIdx].scale ? 1.5 : 1);
    HELD.soap.mesh.scale.setScalar(Math.max(0.001, sc));
    HELD.soap.mesh.material = barMats[S.soapIdx];
  }
}

// ---------------------------------------------------------------- firing
const ghost = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }),
);
ghost.visible = false;
ghost.renderOrder = 4;
scene.add(ghost);
const _dir = new V3(), _g = new V3();
function updateAim() {
  const d = player.lookDir(_dir);
  const h = rayHit(player.pivot, d, 70);
  if (h) S.aim.copy(h.point); else S.aim.copy(player.pivot).addScaledVector(d, 40);
  S.aimDir.copy(d);
  // preview where new foam will grow when aiming at foam (within ~18 m)
  const show = !!(h && h.foam) && S.started && S.weapon !== 'bubble' && S.aim.distanceTo(player.pivot) < 18;
  ghost.visible = show;
  if (show) {
    const r = S.weapon === 'water' ? 0.14 : SOAPS[S.soapIdx].effect === 'mega' ? 0.78 : 0.37;
    const pulse = Math.sin(performance.now() / 160);
    growDir(h.n, _g);
    ghost.position.copy(h.point).addScaledVector(_g, r * 0.55);
    ghost.scale.setScalar(r * (1 + pulse * 0.05));
    ghost.material.opacity = 0.18 + pulse * 0.06;
  }
}

function muzzlePos(kind) {
  const p = new V3();
  HELD[kind].muzzle.getWorldPosition(p);
  return p;
}

function throwSoap() {
  const idx = S.soapIdx;
  const type = SOAPS[idx];
  const from = player.pivot.clone().add(new V3(0, 0.15, 0));
  const speed = type.effect === 'mega' ? 22 : 26;
  const v = ballistic(from, S.aim, speed) || S.aimDir.clone().multiplyScalar(speed);
  spawnBar(idx, from, v);
  S.cool = type.cd;
  S.soapHidden = Math.min(type.cd, 0.35);
  player.throwAnim();
  sound.throw();
  net.addStat('soap', 1);
  profile.lifetime++;
  saveProfile();
  const unlocked = SOAPS.find((s) => s.unlock === profile.lifetime && s.unlock > 0);
  if (unlocked) {
    toast(`Novo sabonete desbloqueado: <b>${unlocked.name}</b>!`, 'gold');
    sound.unlock();
    renderPicker();
  }
}

function sprayWater() {
  if (drops.length >= MAX_DROPS) return;
  const from = muzzlePos('water');
  const v = ballistic(from, S.aim, 24) || S.aimDir.clone().multiplyScalar(24);
  v.add(new V3(rnd(-0.4, 0.4), rnd(-0.3, 0.3), rnd(-0.4, 0.4)));
  drops.push({ p: from, v, life: 3 });
}

function blowBubble() {
  const from = muzzlePos('bubble');
  const dir = S.aim.clone().sub(from).normalize();
  const v = dir.multiplyScalar(rnd(5.5, 8)).add(new V3(rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(-0.6, 0.6)));
  spawnBubble({ p: from, v, r: rnd(0.07, 0.22), life: 9, stick: 0.75, ci: 0, buoy: rnd(-0.1, 0.3), drag: 0.12, loud: true });
}

function fire(dt) {
  S.cool -= dt;
  if (S.tap > 0) S.tap -= dt;
  const active = (S.firing || S.tap > 0) && S.started;
  sound.spray(active && S.weapon === 'water');
  S.aimHold = active ? 0.6 : Math.max(0, S.aimHold - dt);
  if (!active) { S.waterAcc = 0; S.bubbleAcc = 0; return; }
  if (S.weapon === 'soap') {
    if (S.cool <= 0) throwSoap();
  } else if (S.weapon === 'water') {
    S.waterAcc += dt * 45;
    while (S.waterAcc >= 1) { sprayWater(); S.waterAcc -= 1; }
  } else {
    S.bubbleAcc += dt * 11;
    while (S.bubbleAcc >= 1) { blowBubble(); S.bubbleAcc -= 1; }
  }
}

// ---------------------------------------------------------------- player feel
function checkSlip() {
  if (!player.onGround || player.slipT > 0) return;
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp < 2.2) return;
  for (let i = 0; i < resting.length; i++) {
    const b = resting[i];
    if (b.state !== 'rest') continue;
    const d = Math.hypot(b.p.x - player.pos.x, b.p.z - player.pos.z);
    if (d > 0.32 * b.scale + 0.12 || Math.abs(b.p.y - player.pos.y) > 0.35) continue;
    if (player.slip()) {
      resting.splice(i, 1);
      b.state = 'spent';
      b.v.set(player.vel.x * 0.9, 2.2, player.vel.z * 0.9);
      if (!S.slipToast) { S.slipToast = true; toast('Escorregou no sabonete! 😵', 'info'); }
    }
    return;
  }
}

function handlePlayerEvents() {
  for (const e of player.events) {
    if (e.type === 'jump') sound.jump(e.foam);
    else if (e.type === 'step') sound.step(e.foam);
    else if (e.type === 'slip') sound.slip();
    else if (e.type === 'land') {
      const k = Math.min(1, e.v / 12);
      sound.land(k, e.foam);
      if (e.foam || e.v > 8) burst(e.pos, AXIS_Y, Math.round(4 + k * 14), { speed: 1.6 + k * 2, life: [0.4, 1.2], r: [0.03, 0.09] });
    }
  }
  player.events.length = 0;
}

// best heights already known (server or local), so records aren't announced twice
function syncBest() {
  S.dayBest = Math.max(S.dayBest, net.myStats('day').height || 0);
  S.allBest = Math.max(S.allBest, net.myStats('all').height || 0);
}

// best height you've stood on (only counts once you climb above 1.2 m)
function trackHeight() {
  if (!S.started || !player.onGround) return;
  const cm = Math.round(player.pos.y * 100);
  syncBest();
  if (cm < 120 || cm <= S.dayBest + 5) return;
  S.dayBest = cm;
  net.addStat('height', cm);          // daily board counts even below your all-time record
  if (cm <= S.allBest + 5) return;
  const prevRecord = S.allBest;
  S.allBest = cm;
  if (cm >= prevRecord + 30 || prevRecord < 120) {
    toast(`🏔️ Novo recorde de altura: <b>${fmtCat('height', cm)}</b>`, 'gold');
    sound.unlock();
  }
}

// ---------------------------------------------------------------- soap level effects
const _mm = new THREE.Matrix4();
function updateMound(level) {
  if (Math.abs(level - S.shownLevel) < 0.0015) return;
  S.shownLevel = level;
  const R = new V3(), U = new V3();
  foamSpots.forEach((s, i) => {
    const k = clamp((level - s.thr) * 6, 0, 1);
    if (k <= 0) { moundMesh.setMatrixAt(i, _zero); return; }
    const r = s.r * (0.35 + 0.65 * k) * (level > 1 ? Math.min(1.5, 1 + (level - 1) * 0.5) : 1);
    tangentBasis(s.n, i * 1.7, R, U);
    _mm.makeBasis(R, U, s.n).scale(_sv.set(r, r, r * s.squash)).setPosition(s.p);
    moundMesh.setMatrixAt(i, _mm);
  });
  moundMesh.instanceMatrix.needsUpdate = true;
  if (moundMesh.instanceColor) moundMesh.instanceColor.needsUpdate = true;
}

function ambientBubbles(dt) {
  const rate = S.level > 0.02 ? 1 + Math.min(S.level, 1.5) * 18 : 0;
  S.ambAcc += dt * rate;
  while (S.ambAcc >= 1) {
    S.ambAcc -= 1;
    const e = emitters[(Math.random() * emitters.length) | 0];
    spawnBubble({
      p: e.p.clone().addScaledVector(e.n, 0.15),
      v: e.n.clone().multiplyScalar(rnd(0.2, 0.6)).add(new V3(rnd(-0.2, 0.2), rnd(0.2, 0.6), rnd(-0.1, 0.2))),
      r: rnd(0.05, 0.17), life: rnd(3, 7), buoy: rnd(0.05, 0.25), drag: 0.4,
    });
  }
}

// ---------------------------------------------------------------- network events
net.on('hits', ({ hits, full }) => {
  if (full) {
    pools.forEach((p) => p.clear());
    foamCells.clear();
    anims.length = 0;
    S.incoming.length = 0;
    for (const str of hits) placeHit(decodeHit(str), false);
  } else {
    for (const str of hits) S.incoming.push(str);
    if (S.incoming.length > 1500) S.incoming.splice(0, S.incoming.length - 1500);
  }
  S.loaded = true;
});
net.on('mode', (m) => renderOnline(m));
net.on('state', () => { syncBest(); renderRanking(); });

function processIncoming() {
  const n = Math.min(S.incoming.length, S.incoming.length > 200 ? 40 : 6);
  for (let i = 0; i < n; i++) placeHit(decodeHit(S.incoming.shift()), true);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3800);
}

function shake() {
  canvas.classList.remove('shake');
  void canvas.offsetWidth;
  canvas.classList.add('shake');
}

function renderWeapons() {
  $('weapons').innerHTML = WEAPONS.map((w, i) => `
    <button class="wpn ${S.weapon === w.id ? 'on' : ''}" data-w="${w.id}">
      <span class="key">${i + 1}</span><span class="ico">${w.icon}</span><span class="lbl">${w.name}</span>
    </button>`).join('');
  $('soap-picker').classList.toggle('hidden', S.weapon !== 'soap');
}

function renderPicker() {
  const html = SOAPS.map((s, i) => {
    const locked = profile.lifetime < s.unlock;
    const sw = s.rainbow ? 'linear-gradient(90deg,#ff7aa8,#ffd36e,#7dffb0,#6ec8ff,#c58cff)' : s.color;
    return `<button class="soap ${S.soapIdx === i ? 'on' : ''} ${locked ? 'locked' : ''}" data-s="${i}" ${locked ? 'disabled' : ''}
      title="${esc(s.name)} — ${esc(s.desc)}${locked ? ` (jogue ${s.unlock} sabonetes para liberar)` : ''}">
      <span class="sw" style="background:${sw}"></span>
      <span class="nm">${esc(s.name)}</span>
      ${locked ? `<span class="lock">🔒 ${s.unlock}</span>` : ''}
    </button>`;
  }).join('');
  $('soap-list').innerHTML = html;
  const s = SOAPS[S.soapIdx];
  $('soap-desc').textContent = `${s.name}: ${s.desc}`;
}

function selectWeapon(id) {
  if (S.weapon === id) return;
  S.weapon = id;
  sound.click();
  renderWeapons();
}
function selectSoap(i) {
  if (i < 0 || i >= SOAPS.length || profile.lifetime < SOAPS[i].unlock) return;
  S.soapIdx = i;
  S.weapon = 'soap';
  sound.click();
  renderWeapons();
  renderPicker();
}
function cycleSoap(dir) {
  for (let k = 1; k <= SOAPS.length; k++) {
    const i = (S.soapIdx + dir * k + SOAPS.length * 2) % SOAPS.length;
    if (profile.lifetime >= SOAPS[i].unlock) { selectSoap(i); return; }
  }
}

function renderOnline(mode) {
  const el = $('online');
  if (mode === 'online') {
    el.className = 'pill on';
    el.textContent = `${net.online || 1} ${net.online === 1 ? 'pessoa ensaboando' : 'pessoas ensaboando'} agora`;
  } else if (mode === 'retrying') {
    el.className = 'pill warn';
    el.textContent = 'reconectando…';
  } else if (mode === 'local') {
    el.className = 'pill local';
    el.textContent = 'modo local (sem servidor)';
  } else {
    el.className = 'pill';
    el.textContent = 'conectando…';
  }
}

function renderMeter() {
  const level = S.level;
  const pct = Math.min(level, 9.99) * 100;
  $('pct').textContent = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
  $('bar-fill').style.width = `${Math.min(100, pct)}%`;
  let idx = 0;
  STAGES.forEach(([t], i) => { if (level >= t) idx = i; });
  $('stage').textContent = STAGES[idx][1];
  $('meter').classList.toggle('full', level >= 1);
  if (S.stageIdx >= 0 && idx > S.stageIdx && S.loaded) {
    toast(`A casa está: <b>${STAGES[idx][1]}</b>`, idx === STAGES.length - 1 ? 'gold' : 'info');
    if (idx === STAGES.length - 1) { sound.sparkle(); shake(); }
  }
  S.stageIdx = idx;
  $('global-count').textContent = net.mode === 'online'
    ? `${fmt(net.score + net.unsentFoam())} pts de espuma de todo mundo`
    : `${fmt(net.score)} pts de espuma (só neste aparelho)`;
}

function renderMe() {
  const d = net.myStats('day'), a = net.myStats('all');
  const html = `
    <button id="me-name" title="Trocar apelido">${esc(profile.name || 'Você')} ✎</button>
    <div class="row"><span>Hoje</span><b>🧼 ${fmt(d.soap)}</b><b>💦 ${fmt(d.water)}</b><b>🫧 ${fmt(d.foam)}</b><b>🏔️ ${fmtCat('height', d.height || 0)}</b></div>
    <div class="row"><span>Sempre</span><b>🧼 ${fmt(a.soap)}</b><b>💦 ${fmt(a.water)}</b><b>🫧 ${fmt(a.foam)}</b><b>🏔️ ${fmtCat('height', a.height || 0)}</b></div>`;
  if (html === renderMe.last) return;
  renderMe.last = html;
  $('me-stats').innerHTML = html;
  $('me-name').onclick = openStart;
}

function renderRanking() {
  const period = S.rkPeriod, cat = S.rkCat;
  document.querySelectorAll('#ranking [data-period]').forEach((b) => b.classList.toggle('on', b.dataset.period === period));
  document.querySelectorAll('#ranking [data-cat]').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
  const mine = net.myStats(period)[cat] || 0;
  let list;
  if (net.mode === 'online') {
    list = (net.boards?.[period]?.[cat] || []).map((e) => (e.me ? { ...e, score: Math.max(e.score, mine) } : e));
  } else {
    list = mine > 0 ? [{ name: profile.name || 'Você', score: mine, me: true }] : [];
  }
  const medals = ['🥇', '🥈', '🥉'];
  const listHtml = list.length
    ? list.map((e, i) => `<li class="${e.me ? 'me' : ''}"><span class="pos">${medals[i] || i + 1}</span><span class="nm">${esc(e.name)}</span><b>${fmtCat(cat, e.score)}</b></li>`).join('')
    : `<li class="empty">Ninguém ainda ${period === 'day' ? 'hoje' : ''}. Seja o primeiro!</li>`;
  if (renderRanking.lastList !== listHtml) { renderRanking.lastList = listHtml; $('rk-list').innerHTML = listHtml; }
  let meLine = '';
  if (net.mode === 'online') {
    const rank = net.me.rank?.[period]?.[cat];
    const inTop = list.some((e) => e.me);
    if (!inTop) {
      if (mine > 0) meLine = `Você: ${rank ? `#${rank} · ` : ''}${fmtCat(cat, mine)} ${CAT_UNIT[cat]}`;
      else meLine = cat === 'height' ? 'Suba numa montanha de espuma (acima de 1,2 m) para entrar.' : 'Você ainda não pontuou aqui.';
    }
  } else {
    meLine = 'Publique na Vercel com Redis para o ranking global. <button id="wash" class="link">Lavar a casa (local)</button>';
  }
  if (renderRanking.lastMe === meLine) return;
  renderRanking.lastMe = meLine;
  $('rk-me').innerHTML = meLine;
  const wash = $('wash');
  if (wash) wash.onclick = () => { net.resetLocal(); pools.forEach((p) => p.clear()); foamCells.clear(); S.shownLevel = -1; toast('Casa lavada! (só neste aparelho)', 'info'); };
}

$('weapons').addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) selectWeapon(b.dataset.w); });
$('soap-list').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) selectSoap(Number(b.dataset.s)); });
$('ranking').addEventListener('click', (e) => {
  const p = e.target.closest('[data-period]'); if (p) { S.rkPeriod = p.dataset.period; renderRanking(); }
  const c = e.target.closest('[data-cat]'); if (c) { S.rkCat = c.dataset.cat; renderRanking(); }
});
$('rk-toggle').addEventListener('click', () => {
  const col = $('ranking').classList.toggle('collapsed');
  $('rk-toggle').textContent = col ? '+' : '–';
});
$('mute').addEventListener('click', () => {
  sound.init();
  sound.setMuted(!sound.muted);
  $('mute').textContent = sound.muted ? '🔇' : '🔊';
});
$('mute').textContent = sound.muted ? '🔇' : '🔊';

function openStart() {
  S.started = false;
  S.firing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('name-input').value = profile.name;
  $('start').classList.remove('hidden');
  $('lock-hint').classList.add('hidden');
  setTimeout(() => $('name-input').focus(), 50);
}
function startGame() {
  const raw = $('name-input').value.replace(/\s+/g, ' ').trim().slice(0, 18);
  profile.name = raw || profile.name || `Ensaboador ${100 + ((Math.random() * 900) | 0)}`;
  saveProfile();
  sound.init();
  $('start').classList.add('hidden');
  S.started = true;
  if (!S.touch) requestLock();
  renderMe();
  renderRanking();
}
$('start-btn').addEventListener('click', startGame);
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });

// ---------------------------------------------------------------- input: mouse + keyboard (pointer lock)
function requestLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* not available: right-drag still works */ }
}
document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === canvas;
  if (!S.locked) S.firing = false;
  $('lock-hint').classList.toggle('hidden', S.locked || !S.started || S.touch);
});
const LOOK_SENS = 0.0024;
canvas.addEventListener('pointerdown', (e) => {
  sound.init();
  if (e.pointerType === 'touch') return;
  if (!S.started) return;
  if (e.button === 0) {
    if (!S.locked) requestLock();
    S.firing = true;
    S.tap = 0.12; // a quick click still fires even if released within the same frame
  }
});
window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' && e.button === 0) S.firing = false; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  if (S.locked) {
    input.lookDX += e.movementX * LOOK_SENS;
    input.lookDY += e.movementY * LOOK_SENS;
  } else if (e.buttons & 2) {
    input.lookDX += e.movementX * LOOK_SENS * 1.4;
    input.lookDY += e.movementY * LOOK_SENS * 1.4;
  }
});
canvas.addEventListener('wheel', (e) => { input.zoom += Math.sign(e.deltaY) * 0.35; e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('lock-hint').addEventListener('click', () => { requestLock(); });
window.addEventListener('blur', () => { S.firing = false; S.keys = {}; });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  S.keys[k] = true;
  if (k === '1') selectWeapon('soap');
  if (k === '2') selectWeapon('water');
  if (k === '3') selectWeapon('bubble');
  if (k === 'q') cycleSoap(-1);
  if (k === 'e') cycleSoap(1);
  if (k === ' ') { input.jump = true; e.preventDefault(); }
  if (k === 'f') { S.firing = true; S.tap = 0.12; }
  if (k === 'm') $('mute').click();
  if (k.startsWith('arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  S.keys[k] = false;
  if (k === 'f') S.firing = false;
});

// ---------------------------------------------------------------- input: touch (joystick, look, buttons)
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { id: null, x: 0, y: 0 };
function enableTouchUI() {
  if (S.touch) return;
  S.touch = true;
  document.body.classList.add('touch');
  $('lock-hint').classList.add('hidden');
}
window.addEventListener('touchstart', enableTouchUI, { once: true, passive: true });
if (window.matchMedia('(pointer: coarse)').matches) enableTouchUI();

const joyZone = $('joy-zone'), knob = $('joy-knob'), base = $('joy-base');
joyZone.addEventListener('pointerdown', (e) => {
  enableTouchUI(); sound.init();
  joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0;
  base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  base.classList.add('on');
  joyZone.setPointerCapture(e.pointerId);
});
joyZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, max = 55, d = Math.hypot(dx, dy);
  const k = d > max ? max / d : 1;
  joy.x = (dx * k) / max; joy.y = (dy * k) / max;
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
});
const joyEnd = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.x = 0; joy.y = 0;
  knob.style.transform = '';
  base.classList.remove('on');
};
joyZone.addEventListener('pointerup', joyEnd);
joyZone.addEventListener('pointercancel', joyEnd);

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || look.id !== null) return;
  look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== look.id) return;
  input.lookDX += (e.clientX - look.x) * 0.0055;
  input.lookDY += (e.clientY - look.y) * 0.0055;
  look.x = e.clientX; look.y = e.clientY;
});
const lookEnd = (e) => { if (e.pointerId === look.id) look.id = null; };
canvas.addEventListener('pointerup', lookEnd);
canvas.addEventListener('pointercancel', lookEnd);

const fireBtn = $('btn-fire');
fireBtn.addEventListener('pointerdown', (e) => { sound.init(); S.firing = true; S.tap = 0.12; fireBtn.setPointerCapture(e.pointerId); });
fireBtn.addEventListener('pointerup', () => { S.firing = false; });
fireBtn.addEventListener('pointercancel', () => { S.firing = false; });
$('btn-jump').addEventListener('pointerdown', () => { input.jump = true; });

function readMoveInput() {
  const K = S.keys;
  let x = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0);
  let y = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0);
  if (joy.id !== null) { x += joy.x; y -= joy.y; }
  input.moveX = x; input.moveY = y;
  input.run = !!K.shift || Math.hypot(joy.x, joy.y) > 0.92;
  input.aiming = S.aimHold > 0 || (S.locked && S.weapon !== 'soap');
  if (!S.started) { input.moveX = 0; input.moveY = 0; input.jump = false; }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 0.8 ? 72 : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (Q.composer) Q.composer.setSize(window.innerWidth, window.innerHeight);
});
camera.fov = camera.aspect < 0.8 ? 72 : 60;
camera.updateProjectionMatrix();

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let uiTimer = 0;
let worldTime = 0;
function tick(dt) {
  worldTime += dt;
  readMoveInput();
  player.update(dt, input);
  updateWorld(worldTime, dt, player.pos, camera.position.y);
  camera.updateMatrixWorld();
  updateAim();
  player.root.updateMatrixWorld(true);
  updateHeld(dt);
  fire(dt);
  updateBars(dt);
  checkSlip();
  handlePlayerEvents();
  trackHeight();
  updateDrops(dt);
  updateFlyers(dt);
  ambientBubbles(dt);
  S.birdT -= dt;
  if (S.birdT <= 0) { S.birdT = rnd(3, 10); if (S.started) sound.chirp(); }
  processIncoming();
  updateAnims(dt);
  pools.forEach((p) => p.flush());

  S.level = (net.score + net.unsentFoam()) / TARGET_SCORE;
  updateMound(S.level);

  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.3;
    renderMeter();
    if (S.started) renderMe();
    if (net.mode === 'online') renderOnline('online');
  }
}
// automatic downgrade if the machine struggles (only when the player didn't choose)
const perf = { t: 0, frames: 0, checks: 0, warm: 0 };
function autoQuality(dt) {
  if (Q.manual || perf.checks >= 3 || !S.started || document.hidden) return;
  if (perf.warm < 3) { perf.warm += dt; return; }
  perf.t += dt; perf.frames++;
  if (perf.t < 4) return;
  const fps = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0; perf.checks++;
  if (fps < 40 && Q.level === 'alto') applyQuality('medio');
  else if (fps < 28 && Q.level === 'medio') applyQuality('leve');
}
function frame() {
  const raw = clock.getDelta();
  tick(Math.min(raw, 0.05));
  autoQuality(raw);
  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
applyQuality(Q.level);
$('quality').addEventListener('click', () => {
  const next = QUALITIES[(QUALITIES.indexOf(Q.level) + 1) % QUALITIES.length];
  Q.manual = true;
  try { localStorage.setItem('ce:quality', next); } catch { /* ignore */ }
  applyQuality(next);
  toast(QUALITY_LABEL[next], 'info');
});
if (window.innerWidth < 760) { $('ranking').classList.add('collapsed'); $('rk-toggle').textContent = '+'; }
renderWeapons();
renderPicker();
renderRanking();
$('name-input').value = profile.name;
net.start().then(() => { renderRanking(); renderMeter(); });
setInterval(() => { if (S.started) renderRanking(); }, 2000);
requestAnimationFrame(frame);

// small debug handle (handy for testing in the console: __casa.step(60) advances 1 s)
window.__casa = {
  S, net, scene, camera, renderer, player, input,
  foamCount: () => { let n = 0; foamCells.forEach((a) => { n += a.length; }); return n; },
  foamBall: (x, y, z, r) => addBall(new V3(x, y, z), r, WHITE, false, Math.random),
  step(n = 60) { for (let i = 0; i < n; i++) tick(1 / 60); render(); },
  Q,
};
