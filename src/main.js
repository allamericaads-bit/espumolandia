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
import { Multiplayer, F_GROUND, F_AIM, F_SLIP, F_JET, F_RIDE, F_CLIMB } from './multiplayer.js';
import { buildSlide } from './slide.js';
import { createPickups, SPECIALS } from './pickups.js';
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
  { id: 'washer', name: 'Lava-jato', icon: '🚿' },
];
// every player foams in their own colour
const COLORS = [
  { name: 'Rosa', hex: '#ff5d8f' }, { name: 'Azul', hex: '#3fa9f5' }, { name: 'Amarelo', hex: '#ffc23c' },
  { name: 'Verde', hex: '#2ec27e' }, { name: 'Roxo', hex: '#9b6bff' }, { name: 'Laranja', hex: '#ff7a3d' },
  { name: 'Ciano', hex: '#1fc4c4' }, { name: 'Vermelho', hex: '#f03e3e' }, { name: 'Lima', hex: '#94d82d' },
  { name: 'Magenta', hex: '#d63bdb' }, { name: 'Anil', hex: '#4c6ef5' }, { name: 'Caramelo', hex: '#c98a3c' },
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
  let id = null, name = '', lifetime = 0, color = -1;
  try {
    id = localStorage.getItem('ce:id');
    name = localStorage.getItem('ce:name') || '';
    lifetime = Number(localStorage.getItem('ce:lifetimeSoap')) || 0;
    const c = localStorage.getItem('ce:color');
    if (c !== null && /^\d{1,2}$/.test(c)) color = Number(c);
  } catch { /* storage blocked */ }
  if (!id || !/^[a-z0-9]{8,32}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 18);
    try { localStorage.setItem('ce:id', id); } catch { /* ignore */ }
  }
  return { id, name, lifetime, color };
}
function saveProfile() {
  try {
    localStorage.setItem('ce:name', profile.name);
    localStorage.setItem('ce:lifetimeSoap', String(profile.lifetime));
    localStorage.setItem('ce:color', String(profile.color));
  } catch { /* ignore */ }
}
const profile = loadProfile();
const hashPick = (arr, salt) => {
  let h = 0;
  for (const ch of profile.id + salt) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return arr[Math.abs(h) % arr.length];
};
if (profile.color < 0 || profile.color >= COLORS.length) profile.color = COLORS.indexOf(hashPick(COLORS, 'c'));

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
const slide = buildSlide({ scene, T, colliders, groundHeight });
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

// how much of the house each colour covers (index = colour + 1; 0 = foam from before colours existed)
const colorShare = new Float32Array(COLORS.length + 1);
const POOL_WEIGHT = new Map();

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
    this.pos = new Float32Array(max * 3);
    this.owner = new Int8Array(max).fill(-2);   // -2 empty, -1 no colour (old hits), 0..11 player colour
    this.weight = POOL_WEIGHT.get(mat) ?? 1;
    scene.add(this.mesh);
  }
  alloc() {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.used < this.max) { this.used++; this.mesh.count = this.used; }
    this.free(i);
    return i;
  }
  free(i) {
    if (this.meta[i]) { foamRemove(this.meta[i]); this.meta[i] = null; }
    if (this.owner[i] > -2) colorShare[this.owner[i] + 1] -= this.weight;
    this.owner[i] = -2;
  }
  tag(i, m, owner) {
    this.pos[i * 3] = m.elements[12]; this.pos[i * 3 + 1] = m.elements[13]; this.pos[i * 3 + 2] = m.elements[14];
    this.owner[i] = owner;
    colorShare[owner + 1] += this.weight;
  }
  set(i, m, c) {
    this.mesh.setMatrixAt(i, m);
    if (c) this.mesh.setColorAt(i, c);
    this.dirty = true;
  }
  clear() {
    this.next = 0; this.used = 0; this.mesh.count = 0;
    this.meta.fill(null);
    this.owner.fill(-2);
    colorShare.fill(0);
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

POOL_WEIGHT.set(foamMat, 3); POOL_WEIGHT.set(dripMat, 3); POOL_WEIGHT.set(blobMat, 1); POOL_WEIGHT.set(bubbleMat, 0.5);
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
const CLEAN_DROP = new THREE.Color('#e9fbff'), SOAP_DROP = new THREE.Color('#ffffff');
dropMesh.setColorAt(0, SOAP_DROP);
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
// foam stays light and bubbly but clearly shows whose it is
const FOAM_TINT = COLORS.map((c) => new THREE.Color(c.hex).lerp(new THREE.Color(1, 1, 1), 0.3));
const BUBBLE_TINT = COLORS.map((c) => new THREE.Color(c.hex).lerp(new THREE.Color(1, 1, 1), 0.55));
const rainbowColor = (rng, l = 0.75) => new THREE.Color().setHSL(rng(), 0.9, l);

const HIT_RE = /^[swbfx][0-9](,-?\d{1,5}){6},\d{1,3}(,\d{1,2})?$/;
const seen = new Set();
const seenOrder = [];
// returns true the first time a hit string is seen (hits can arrive from you, peers and the server poll)
function markSeen(str) {
  if (seen.has(str)) return false;
  seen.add(str);
  seenOrder.push(str);
  if (seenOrder.length > 8000) seen.delete(seenOrder.shift());
  return true;
}

function encodeHit(h) { return `${h.t}${h.c},${h.x},${h.y},${h.z},${h.nx},${h.ny},${h.nz},${h.s}${h.k >= 0 ? `,${h.k}` : ''}`; }
function decodeHit(str) {
  const a = str.slice(3).split(',').map(Number);
  const k = a.length > 7 && a[7] < COLORS.length ? a[7] : -1;
  return { t: str[0], c: Number(str[1]), x: a[0], y: a[1], z: a[2], nx: a[3], ny: a[4], nz: a[5], s: a[6], k };
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

let placeOwner = -1; // colour of the hit being placed right now
function emitInstance(pool, m, color, animate, sphere = null) {
  const i = pool.alloc();
  if (sphere) { foamAdd(sphere); pool.meta[i] = sphere; }
  pool.tag(i, m, placeOwner);
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
    if (a.pool.owner[a.i] === -2) continue; // washed away while growing
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
  const k = h.k ?? -1;
  if (h.t === 'x') { washAt(p, size, k); return; }
  placeOwner = k;
  const rng = seedOf(h);
  if (h.t === 'b') {
    const col = h.c === 4 ? rainbowColor(rng, 0.8) : k >= 0 ? BUBBLE_TINT[k] : h.c === 2 ? LAVENDER : WHITE;
    addStuck(p, n, size, col, animate);
    return;
  }
  const colorFor = () => (h.c === 4 && h.t !== 'w' ? rainbowColor(rng, 0.8) : k >= 0 ? FOAM_TINT[k] : h.t === 'w' ? WATER_FOAM : FOAM_COLORS[h.c] || WHITE);
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

// Lava-jato: removes foam of every colour except the washer's own
const WASH_POOLS = () => [foamPool, dripPool, blobPool, stuckPool];
function washAt(p, r, keepColor) {
  const r2 = r * r;
  let n = 0;
  for (const pool of WASH_POOLS()) {
    const P = pool.pos, O = pool.owner;
    for (let i = 0; i < pool.used; i++) {
      const o = O[i];
      if (o === -2 || (o === keepColor && keepColor >= 0)) continue;
      const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      pool.free(i);
      pool.set(i, _zero);
      n++;
    }
  }
  return n;
}

function growDir(n, out = new V3()) {
  out.copy(n);
  if (n.y > -0.5) out.y += 0.8;
  return out.normalize();
}

function weightOf(t, size) {
  if (t === 'x') return 0;
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
    k: profile.color,
  };
  const str = encodeHit(h);
  markSeen(str);
  placeHit(h, true);
  net.queueHit(str, weightOf(t, size));
  mp.queueHit(str);
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

function spawnBar(idx, p, v, mini = false, remote = false) {
  const mesh = new THREE.Mesh(barGeo, barMats[idx]);
  const scale = (SOAPS[idx].scale || 1) * (mini ? 0.5 : 1);
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.position.copy(p);
  mesh.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
  scene.add(mesh);
  const b = { mesh, idx, p: p.clone(), v: v.clone(), w: new V3(rnd(-12, 12), rnd(-8, 8), rnd(-12, 12)), age: 0, state: 'fly', bounces: 0, mini, split: false, scale, dis: 0, remote };
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
    spawnBar(3, b.p, v, true, b.remote);
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
  const R = !b.remote; // only the thrower records hits; everyone else just sees the effect
  const type = SOAPS[b.idx];
  b.p.copy(pt).addScaledVector(n, 0.06 * b.scale);
  if (b.state === 'fly') {
    const eff = b.mini ? 'mini' : type.effect;
    switch (eff) {
      case 'classic':
        if (R) soapImpact(0, pt, n, onFoam, rnd(0.95, 1.25), rnd(0.32, 0.42));
        burst(pt, n, 8, { color: FOAM_COLORS[0] });
        sound.splat(1);
        b.state = 'spent';
        break;
      case 'bounce':
        if (R) soapImpact(1, pt, n, onFoam, rnd(0.65, 0.85), rnd(0.24, 0.3));
        burst(pt, n, 4, { color: FOAM_COLORS[1] });
        sound.splat(0.7);
        if (++b.bounces >= 3) b.state = 'spent';
        break;
      case 'burst':
        if (R) soapImpact(2, pt, n, onFoam, rnd(0.8, 1.0), rnd(0.3, 0.38));
        if (R && !ground) stickAround(pt, n, 16, 1.3, 2, 0.06, 0.2);
        burst(pt, n, 40, { color: LAVENDER, speed: 3.2, life: [1.5, 3.5], r: [0.05, 0.18] });
        sound.splat(0.8); sound.fizz();
        dissolve(b);
        return;
      case 'cluster':
        if (R) soapImpact(3, pt, n, onFoam, 0.8, 0.3);
        sound.splat(0.8);
        splitBar(b, n);
        return;
      case 'mini':
        if (R) soapImpact(3, pt, n, onFoam, rnd(0.45, 0.6), rnd(0.18, 0.24));
        burst(pt, n, 3, { color: FOAM_COLORS[3] });
        sound.splat(0.45);
        dissolve(b);
        return;
      case 'rainbow':
        if (R) soapImpact(4, pt, n, onFoam, rnd(1.1, 1.35), rnd(0.36, 0.44));
        if (R && !ground) stickAround(pt, n, 6, 1.0, 4, 0.06, 0.16);
        burst(pt, n, 34, { colorFn: () => new THREE.Color().setHSL(Math.random(), 0.9, 0.7), speed: 3.5, life: [1, 2.6] });
        sound.splat(1); sound.sparkle();
        b.state = 'spent';
        break;
      case 'mega':
        if (R) soapImpact(5, pt, n, onFoam, rnd(2.5, 2.9), rnd(0.7, 0.85));
        if (R && onFoam) for (let i = 0; i < 4; i++) recordHit('f', 5, pt, new V3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize(), rnd(0.35, 0.5));
        if (R && !ground) stickAround(pt, n, 12, 2.2, 0, 0.1, 0.3);
        burst(pt, n, 70, { speed: 5, life: [1.5, 4], r: [0.06, 0.25] });
        sound.boom();
        if (R || pt.distanceTo(player.pos) < 12) shake();
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
    if (!b.remote && b.state === 'fly') {
      const target = remoteHit(b.p, _p1);
      if (target) { bonkRemote(b, target); continue; }
    }
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

// segment vs other players (a sphere around the torso)
const _c = new V3(), _ab = new V3(), _ac = new V3();
function remoteHit(a, b) {
  let found = null;
  mp.forEachVisible((r) => {
    if (found) return;
    _c.set(r.pos.x, r.pos.y + 0.85, r.pos.z);
    _ab.subVectors(b, a); _ac.subVectors(_c, a);
    const t = clamp(_ac.dot(_ab) / Math.max(1e-6, _ab.lengthSq()), 0, 1);
    if (_ac.addScaledVector(_ab, -t).lengthSq() < 0.5 * 0.5) found = r;
  });
  return found;
}
let bonkToastT = 0;
const lastBonk = new Map();
function bonkPeer(r, v) {
  const now = performance.now();
  const c = new V3(r.pos.x, r.pos.y + 0.9, r.pos.z);
  const dir = new V3(v.x, 0, v.z).normalize();
  burst(c, dir.clone().negate(), 14, { color: FOAM_TINT[profile.color], speed: 2.5 });
  hitMarker(true);
  if (now - (lastBonk.get(r.peerId) || 0) < 900) return;
  lastBonk.set(r.peerId, now);
  mp.sendBonk(r.peerId, { d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100] });
  sound.splat(0.9);
  if (now > bonkToastT) { bonkToastT = now + 2500; toast(`Você ensaboou <b>${esc(r.name)}</b>! 🧼`, 'info'); }
}
function bonkRemote(b, r) {
  bonkPeer(r, b.v);
  b.state = 'spent';
  b.v.set(-b.v.x * 0.25, 2, -b.v.z * 0.25);
}

// ---------------------------------------------------------------- bazooka rockets
const rockets = [];
function spawnRocket(p, v, remote, k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14), new THREE.MeshStandardMaterial({ color: COLORS[k].hex, roughness: 0.3, emissive: COLORS[k].hex, emissiveIntensity: 0.2 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }));
  nose.position.z = 0.21; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: '#ffd400' }));
    fin.position.z = -0.17; fin.rotation.z = (i * Math.PI) / 2; fin.position.x = Math.sin((i * Math.PI) / 2) * 0.07; fin.position.y = Math.cos((i * Math.PI) / 2) * 0.07;
    g.add(fin);
  }
  g.position.copy(p);
  g.castShadow = true;
  scene.add(g);
  rockets.push({ p: p.clone(), v: v.clone(), g, remote, k, age: 0 });
}
function explode(pt, n, onFoam, ground, remote) {
  burst(pt, n, 90, { speed: 6, life: [1, 3], r: [0.06, 0.24], color: FOAM_TINT[profile.color] });
  sound.boom();
  const dist = pt.distanceTo(player.pos);
  if (dist < 15) shake();
  if (remote) return;
  recordHit(onFoam ? 'f' : 's', 5, pt, n, onFoam ? 0.85 : 2.8);
  for (let i = 0; i < 7; i++) recordHit('f', 0, pt, new V3(rnd(-1, 1), rnd(0.15, 1), rnd(-1, 1)).normalize(), rnd(0.35, 0.55));
  if (!ground) stickAround(pt, n, 14, 2.4, 0, 0.1, 0.3);
  hitMarker(true);
  mp.forEachVisible((r) => {
    const away = new V3(r.pos.x - pt.x, 0, r.pos.z - pt.z);
    if (away.length() < 3.5 && Math.abs(r.pos.y - pt.y) < 3) bonkPeer(r, away.lengthSq() > 0.01 ? away : new V3(1, 0, 0));
  });
  if (dist < 3) player.slip(new V3(player.pos.x - pt.x, 0, player.pos.z - pt.z).normalize());
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.age += dt;
    r.v.y -= 2.5 * dt;
    _p1.copy(r.p).addScaledVector(r.v, dt);
    let boom = false;
    if (!r.remote) {
      const target = remoteHit(r.p, _p1);
      if (target) { explode(new V3(target.pos.x, target.pos.y + 0.9, target.pos.z), r.v.clone().negate().normalize(), false, false, false); boom = true; }
    }
    if (!boom) {
      const h = segHit(r.p, _p1);
      if (h) { explode(h.point.clone(), h.n.clone(), !!h.foam, h.ground, r.remote); boom = true; }
    }
    if (boom || r.age > 6) { scene.remove(r.g); rockets.splice(i, 1); continue; }
    r.p.copy(_p1);
    r.g.position.copy(r.p);
    r.g.lookAt(_p1.copy(r.p).add(r.v));
    if (Math.random() < 0.9) spawnBubble({ p: r.p, v: new V3(rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-0.4, 0.4)), r: rnd(0.05, 0.12), life: rnd(0.5, 1.1), buoy: 0.5, drag: 1.5 });
  }
}

// pellets (12) and bullets (AK): small soap blobs
let pelletMarkT = 0;
function kindHit(d, h) {
  const pt = h.point.clone(), n = h.n.clone();
  if (d.kind === 'pellet') {
    if (h.foam) recordHit('f', 0, pt, n, rnd(0.16, 0.22)); else recordHit('s', 0, pt, n, rnd(0.42, 0.6));
    if (Math.random() < 0.3) sound.splat(0.35);
  } else if (Math.random() < 0.75) {
    if (h.foam) recordHit('f', 0, pt, n, rnd(0.11, 0.15)); else recordHit('s', 0, pt, n, rnd(0.28, 0.38));
  }
  if (performance.now() > pelletMarkT) { pelletMarkT = performance.now() + 120; hitMarker(!!h.foam); }
}

function updateDrops(dt) {
  let w = 0;
  const dir = new V3();
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    d.life -= dt;
    d.v.y -= G * dt * (d.kind === 'bullet' ? 0.12 : d.kind === 'pellet' ? 0.5 : 1);
    _p1.copy(d.p).addScaledVector(d.v, dt);
    if (d.kind && !d.remote) {
      const target = remoteHit(d.p, _p1);
      if (target) { bonkPeer(target, d.v); continue; }
    }
    const h = segHit(d.p, _p1);
    if (h) {
      if (d.kind && !d.remote) { kindHit(d, h); continue; }
      if (d.remote) continue;
      if (d.clean) { washHit(h.point.clone(), h.n.clone()); continue; }
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
    if (d.kind === 'pellet') _sv.set(0.055, 0.065, 0.055);
    else if (d.kind === 'bullet') _sv.set(0.035, 0.11, 0.035);
    else _sv.set(0.028, 0.085, 0.028);
    _m.compose(d.p, _q, _sv);
    dropMesh.setMatrixAt(w, _m);
    dropMesh.setColorAt(w, d.kind ? FOAM_TINT[d.k] || WHITE : d.clean ? CLEAN_DROP : SOAP_DROP);
    drops[w++] = d;
  }
  drops.length = w;
  dropMesh.count = w;
  dropMesh.instanceMatrix.needsUpdate = true;
  if (dropMesh.instanceColor) dropMesh.instanceColor.needsUpdate = true;
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
const input = { moveX: 0, moveY: 0, run: false, jump: false, jumpHeld: false, lookDX: 0, lookDY: 0, zoom: 0, aiming: false };

const sound = new Sound();
const net = new Net(profile);

const LOOK = { shirt: COLORS[profile.color].hex, pants: hashPick(LOOKS.pants, 'p'), skin: hashPick(LOOKS.skin, 'k'), hair: hashPick(LOOKS.hair, 'h') };
const player = new Player({ scene, camera, colliders, groundHeight, foamQuery, spawn: SPAWN, look: LOOK, ladders: slide.ladders });

// ---------------------------------------------------------------- weapons held in the hand
// Special soap weapons (toy-like, barrel along +z)
function makeSpecialModel(type) {
  const mk = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.05, ...extra });
  const g = new THREE.Group();
  const add = (mesh, x, y, z, rx = 0) => { mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.castShadow = true; g.add(mesh); return mesh; };
  const cyl = (r0, r1, h, c, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), typeof c === 'string' ? mk(c) : c);
  const muzzle = new THREE.Object3D();
  if (type === 'bazuca') {
    add(cyl(0.075, 0.075, 0.95, '#ff4fa3', 18), 0, 0.13, 0.22, Math.PI / 2);
    add(cyl(0.1, 0.08, 0.12, '#ffd400', 18), 0, 0.13, 0.72, Math.PI / 2);
    add(cyl(0.085, 0.11, 0.12, '#ffd400', 18), 0, 0.13, -0.28, Math.PI / 2);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), mk('#bff3ff', { roughness: 0.1 })), 0, 0.13, 0.76);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.14, 0.07, 2, 0.015), mk('#2b2b30')), 0, 0.02, 0.05);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.06, 0.16, 2, 0.01), mk('#2b2b30')), 0.085, 0.2, 0.25);
    muzzle.position.set(0, 0.13, 0.8);
  } else if (type === 'doze') {
    for (const x of [-0.024, 0.024]) add(cyl(0.022, 0.022, 0.62, '#4a4f57', 12), x, 0.07, 0.36, Math.PI / 2);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.07, 0.2, 2, 0.015), mk('#ffb02e')), 0, 0.06, 0.03);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.11, 0.24, 2, 0.02), mk('#9b5a2c')), 0, 0.02, -0.18);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.04, 0.18, 2, 0.01), mk('#ffb02e')), 0, 0.02, 0.32);
    muzzle.position.set(0, 0.07, 0.68);
  } else {
    add(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.09, 0.36, 2, 0.015), mk('#2ec27e')), 0, 0.06, 0.08);
    add(cyl(0.016, 0.016, 0.36, '#3b3f45', 10), 0, 0.08, 0.42, Math.PI / 2);
    add(cyl(0.024, 0.024, 0.18, '#9b5a2c', 10), 0, 0.075, 0.32, Math.PI / 2);
    const mag = add(new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.17, 0.07, 2, 0.01), mk('#ffd400')), 0, -0.05, 0.16);
    mag.rotation.x = -0.35;
    add(new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.08, 0.2, 2, 0.015), mk('#9b5a2c')), 0, 0.04, -0.18);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mk('#bff3ff', { roughness: 0.1 })), 0, 0.08, 0.61);
    muzzle.position.set(0, 0.08, 0.63);
  }
  g.add(muzzle);
  return { g, muzzle };
}

function makeHeld(hand) {
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

  // Lava-jato: yellow pressure-washer gun with a long lance
  const washer = new THREE.Group();
  add(washer, new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.2, 2, 0.02), mk('#ffd400')), 0, 0.04, 0.02);
  add(washer, new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.1, 2, 0.01), mk('#2b2b30')), 0, 0.1, -0.04);
  const lance = add(washer, new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 10), mk('#2b2b30', { metalness: 0.5 })), 0, 0.06, 0.38);
  lance.rotation.x = Math.PI / 2;
  const tip = add(washer, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.06, 10), mk('#ffd400')), 0, 0.06, 0.66);
  tip.rotation.x = Math.PI / 2;
  const xMuzzle = new THREE.Object3D(); xMuzzle.position.set(0, 0.06, 0.7); washer.add(xMuzzle);

  hand.add(water, bubble, soap, washer);
  const out = {
    soap: { g: soap, muzzle: sMuzzle, mesh: soapMesh },
    water: { g: water, muzzle: wMuzzle },
    bubble: { g: bubble, muzzle: bMuzzle },
    washer: { g: washer, muzzle: xMuzzle },
  };
  for (const t of Object.keys(SPECIALS)) {
    const m = makeSpecialModel(t);
    m.g.visible = false;
    hand.add(m.g);
    out[t] = m;
  }
  return out;
}
const HELD = makeHeld(player.hand);

// ---------------------------------------------------------------- multiplayer
const vec3 = (a) => (Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 500) ? new V3(a[0], a[1], a[2]) : null);
const round2 = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
const mp = new Multiplayer({
  scene,
  makeHeld,
  setSoapLook: (mesh, idx) => { mesh.material = barMats[clamp(idx | 0, 0, SOAPS.length - 1)]; },
  handlers: {
    onStatus: () => renderOnline(),
    onJoin: (name) => { toast(`<b>${esc(name)}</b> chegou na rua! 👋`, 'info'); sound.click(); },
    onLeave: (name) => toast(`${esc(name)} saiu da rua`),
    onHits: (list) => {
      for (const str of list) if (HIT_RE.test(str) && markSeen(str)) S.incoming.push(str);
    },
    onShot: (d) => {
      const p = vec3(d.p), v = vec3(d.v);
      if (!p || !v) return;
      if (d.k === 0) spawnBar(clamp(d.i | 0, 0, SOAPS.length - 1), p, v, false, true);
      else if (d.k === 1) {
        const n = clamp(d.n | 0, 1, 12);
        for (let i = 0; i < n && drops.length < MAX_DROPS; i++) {
          drops.push({ p: p.clone(), v: v.clone().add(new V3(rnd(-0.4, 0.4), rnd(-0.3, 0.3), rnd(-0.4, 0.4))), life: 3, remote: true });
        }
      } else if (d.k === 4) {
        spawnRocket(p, v, true, clamp(d.c | 0, 0, COLORS.length - 1));
        sound.launcher();
      } else if (d.k === 5 || d.k === 6) {
        const n = clamp(d.n | 0, 1, d.k === 5 ? 10 : 12);
        const dir = v.clone().normalize(), speed = v.length(), spread = d.k === 5 ? 0.075 : 0.015;
        for (let i = 0; i < n && drops.length < MAX_DROPS; i++) {
          const vv = dir.clone().add(new V3(rnd(-spread, spread), rnd(-spread, spread), rnd(-spread, spread))).normalize().multiplyScalar(speed);
          drops.push({ p: p.clone(), v: vv, life: 1.5, remote: true, kind: d.k === 5 ? 'pellet' : 'bullet', k: clamp(d.c | 0, 0, COLORS.length - 1) });
        }
        if (d.k === 5) sound.shotgun(); else sound.rifle();
      } else if (d.k === 3) {
        const n = clamp(d.n | 0, 1, 12);
        for (let i = 0; i < n && drops.length < MAX_DROPS; i++) {
          drops.push({ p: p.clone(), v: v.clone().add(new V3(rnd(-0.18, 0.18), rnd(-0.12, 0.12), rnd(-0.18, 0.18))), life: 2, remote: true, clean: true });
        }
      } else if (d.k === 2) {
        const n = clamp(d.n | 0, 1, 4);
        for (let i = 0; i < n; i++) {
          spawnBubble({ p, v: v.clone().add(new V3(rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(-0.6, 0.6))), r: rnd(0.07, 0.22), life: 9, buoy: rnd(-0.1, 0.3), drag: 0.12 });
        }
      }
    },
    onPick: (id) => pickups.markTaken(id),
    onHello: (d) => { if (Array.isArray(d.pk)) d.pk.slice(0, 40).forEach((id) => pickups.markTaken(id | 0)); },
    helloExtra: () => ({ pk: pickups.recentTaken() }),
    onBonk: (d, r) => {
      const dir = Array.isArray(d.d) ? new V3(Number(d.d[0]) || 0, 0, Number(d.d[1]) || 0) : new V3();
      if (dir.lengthSq() > 1) dir.normalize();
      if (!player.slip(dir)) return;
      toast(`<b>${esc(r.name)}</b> te ensaboou! 🧼`, 'info');
      sound.splat(1);
      soapPlayer();
    },
  },
});
// a few foam lumps stuck on you for a while after being hit
function soapPlayer() {
  const lumps = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.scale.setScalar(rnd(0.07, 0.13));
    m.position.set(rnd(-0.2, 0.2), rnd(0.75, 1.5), rnd(-0.18, 0.2));
    player.body.add(m);
    lumps.push(m);
  }
  burst(player.pos.clone().add(new V3(0, 1, 0)), AXIS_Y, 18, { speed: 2 });
  setTimeout(() => lumps.forEach((m) => player.body.remove(m)), 5000);
}
const NET_SHOT = { k: -1, p: null, v: null, n: 0, t: 0 };
function queueStreamShot(k, p, v) {
  if (NET_SHOT.n && NET_SHOT.k !== k) flushStreamShot(1); // switching weapon: send what we have
  NET_SHOT.k = k; NET_SHOT.p = p; NET_SHOT.v = v; NET_SHOT.n++;
}
function flushStreamShot(dt) {
  NET_SHOT.t -= dt;
  if (NET_SHOT.n && NET_SHOT.t <= 0) {
    NET_SHOT.t = 0.1;
    mp.sendShot({ k: NET_SHOT.k, p: round2(NET_SHOT.p), v: round2(NET_SHOT.v), n: NET_SHOT.n, c: profile.color });
    NET_SHOT.n = 0;
  }
}
const pickups = createPickups({
  scene, colliders, groundHeight,
  makeModel: (type) => makeSpecialModel(type).g,
  onSpawn: (p) => { if (S.started) toast(`${SPECIALS[p.type].icon} Uma <b>${SPECIALS[p.type].name}</b> apareceu ${p.where}!`, 'info'); },
});
let throwCount = 0;
const WEAPON_IDX = { soap: 0, water: 1, bubble: 2, washer: 3, bazuca: 4, doze: 5, ak: 6 };
function netState() {
  if (!S.started) return null;
  const p = player.pos;
  const flags = (player.onGround ? F_GROUND : 0) | (input.aiming ? F_AIM : 0) | (player.slipT > 0 ? F_SLIP : 0)
    | (player.jetting ? F_JET : 0) | (player.riding ? F_RIDE : 0) | (player.climbing ? F_CLIMB : 0);
  return [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), Math.round(player.bodyYaw * 1000) % 6284,
    Math.round(player.pitch * 1000), WEAPON_IDX[S.weapon], S.soapIdx, flags, throwCount];
}

function updateHeld(dt) {
  // out of ammo: back to the weapon you had before
  if (SPECIALS[S.weapon] && !S.special && S.cool <= 0) { S.weapon = S.prevWeapon || 'soap'; renderWeapons(); }
  for (const k of Object.keys(HELD)) HELD[k].g.visible = k === S.weapon;
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
  // other players count as targets too
  let best = player.pivot.distanceTo(S.aim), onPlayer = false;
  mp.forEachVisible((r) => {
    _c.set(r.pos.x, r.pos.y + 0.85, r.pos.z).sub(player.pivot);
    const t = _c.dot(d);
    if (t <= 0 || t >= best) return;
    if (_c.lengthSq() - t * t < 0.45 * 0.45) { best = t; onPlayer = true; S.aim.copy(player.pivot).addScaledVector(d, t); }
  });
  document.getElementById('crosshair').classList.toggle('player', onPlayer);
  // preview where new foam will grow when aiming at foam (within ~18 m)
  const show = !onPlayer && !!(h && h.foam) && S.started && S.weapon !== 'bubble' && S.aim.distanceTo(player.pivot) < 18;
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

function giveSpecial(type) {
  const def = SPECIALS[type];
  if (!SPECIALS[S.weapon]) S.prevWeapon = S.weapon;
  S.special = { type, ammo: def.ammo };
  S.weapon = type;
  S.cool = 0.25;
  sound.pickup();
  toast(`${def.icon} Você pegou a <b>${def.name}</b>! ${def.ammo} tiros`, 'gold');
  renderWeapons();
}
function fireSpecial() {
  const sp = S.special;
  if (!sp || sp.type !== S.weapon) { S.weapon = S.prevWeapon || 'soap'; renderWeapons(); return; }
  const def = SPECIALS[sp.type];
  S.cool = def.cd;
  const from = muzzlePos(sp.type);
  const dir = S.aim.clone().sub(from).normalize();
  if (sp.type === 'bazuca') {
    const v = dir.clone().multiplyScalar(28);
    spawnRocket(from, v, false, profile.color);
    mp.sendShot({ k: 4, p: round2(from), v: round2(v), c: profile.color });
    sound.launcher();
    player.throwAnim();
  } else if (sp.type === 'doze') {
    for (let i = 0; i < 8; i++) {
      const v = dir.clone().add(new V3(rnd(-0.075, 0.075), rnd(-0.075, 0.075), rnd(-0.075, 0.075))).normalize().multiplyScalar(30);
      drops.push({ p: from.clone(), v, life: 1.2, kind: 'pellet', k: profile.color });
    }
    mp.sendShot({ k: 5, p: round2(from), v: round2(dir.clone().multiplyScalar(30)), n: 8, c: profile.color });
    sound.shotgun();
  } else {
    const v = dir.clone().add(new V3(rnd(-0.015, 0.015), rnd(-0.015, 0.015), rnd(-0.015, 0.015))).normalize().multiplyScalar(45);
    drops.push({ p: from.clone(), v, life: 1.5, kind: 'bullet', k: profile.color });
    queueStreamShot(6, from, v);
    sound.rifle();
  }
  sp.ammo--;
  if (sp.ammo <= 0) {
    S.special = null;
    toast(`${def.icon} ${def.short} sem munição!`);
  }
  renderWeapons();
}

function throwSoap() {
  const idx = S.soapIdx;
  const type = SOAPS[idx];
  const from = player.pivot.clone().add(new V3(0, 0.15, 0));
  const speed = type.effect === 'mega' ? 22 : 26;
  const v = ballistic(from, S.aim, speed) || S.aimDir.clone().multiplyScalar(speed);
  spawnBar(idx, from, v);
  mp.sendShot({ k: 0, i: idx, p: round2(from), v: round2(v) });
  throwCount++;
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
  queueStreamShot(1, from, v);
  v.add(new V3(rnd(-0.4, 0.4), rnd(-0.3, 0.3), rnd(-0.4, 0.4)));
  drops.push({ p: from, v, life: 3 });
}

function blowBubble() {
  const from = muzzlePos('bubble');
  const dir = S.aim.clone().sub(from).normalize();
  const v = dir.multiplyScalar(rnd(5.5, 8)).add(new V3(rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(-0.6, 0.6)));
  queueStreamShot(2, from, v);
  spawnBubble({ p: from, v, r: rnd(0.07, 0.22), life: 9, stick: 0.75, ci: 0, buoy: rnd(-0.1, 0.3), drag: 0.12, loud: true });
}

// clean water: washes away foam of other colours where it hits
function sprayWasher() {
  if (drops.length >= MAX_DROPS) return;
  const from = muzzlePos('washer');
  const v = ballistic(from, S.aim, 32) || S.aimDir.clone().multiplyScalar(32);
  queueStreamShot(3, from, v);
  v.add(new V3(rnd(-0.18, 0.18), rnd(-0.12, 0.12), rnd(-0.18, 0.18)));
  drops.push({ p: from, v, life: 2, clean: true });
}
const lastWash = { p: new V3(1e9, 0, 0), t: 0 };
function washHit(pt, n) {
  const now = performance.now();
  if (now - lastWash.t < 110 && pt.distanceTo(lastWash.p) < 0.35) return;
  lastWash.t = now; lastWash.p.copy(pt);
  recordHit('x', 0, pt, n, 0.5);
  if (Math.random() < 0.5) burst(pt, n, 2, { color: WATER_FOAM, speed: 1.2, life: [0.2, 0.5], r: [0.02, 0.05] });
}

function fire(dt) {
  S.cool -= dt;
  if (S.tap > 0) S.tap -= dt;
  const active = (S.firing || S.tap > 0) && S.started;
  sound.spray(active && (S.weapon === 'water' || S.weapon === 'washer'));
  S.aimHold = active ? 0.6 : Math.max(0, S.aimHold - dt);
  if (!active) { S.waterAcc = 0; S.bubbleAcc = 0; return; }
  if (SPECIALS[S.weapon]) {
    if (S.cool <= 0) fireSpecial();
  } else if (S.weapon === 'soap') {
    if (S.cool <= 0) throwSoap();
  } else if (S.weapon === 'water') {
    S.waterAcc += dt * 45;
    while (S.waterAcc >= 1) { sprayWater(); S.waterAcc -= 1; }
  } else if (S.weapon === 'washer') {
    S.waterAcc += dt * 50;
    while (S.waterAcc >= 1) { sprayWasher(); S.waterAcc -= 1; }
  } else {
    S.bubbleAcc += dt * 11;
    while (S.bubbleAcc >= 1) { blowBubble(); S.bubbleAcc -= 1; }
  }
}

// ---------------------------------------------------------------- player feel
function checkSlip() {
  if (!player.onGround || player.slipT > 0 || player.riding) return;
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
    else if (e.type === 'slideStart') {
      sound.whee();
      if (!S.slideToast) { S.slideToast = true; toast('Toboágua! 🌊 Segure-se!', 'info'); }
    } else if (e.type === 'slideEnd') {
      sound.splash();
      burst(player.pos.clone().add(new V3(0, 0.4, 0)), AXIS_Y, 40, { speed: 4, life: [0.8, 2], r: [0.05, 0.16] });
      for (let i = 0; i < 30 && drops.length < MAX_DROPS; i++) {
        drops.push({ p: player.pos.clone().add(new V3(0, 0.3, 0)), v: new V3(rnd(-3, 3), rnd(3, 6), rnd(-3, 3)), life: 1.2, remote: true });
      }
    }
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
  if (!S.started || !player.onGround || !player.onFoam) return;
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

// ---------------------------------------------------------------- jetpack bubbles, slide spray, fuel bar
const _nz = new V3();
function jetBubbles(nozzles, count, vel) {
  for (const nz of nozzles) {
    nz.getWorldPosition(_nz);
    for (let i = 0; i < count; i++) {
      spawnBubble({
        p: _nz, v: new V3(rnd(-0.5, 0.5), rnd(-3.2, -1.8), rnd(-0.5, 0.5)).addScaledVector(vel, 0.3),
        r: rnd(0.035, 0.09), life: rnd(0.5, 1.3), buoy: 0.8, drag: 1.6,
      });
    }
  }
}
let fuelShown = -1;
function jetAndSlideEffects(dt) {
  if (player.jetting) jetBubbles(player.nozzles, Math.random() < 0.6 ? 2 : 1, player.vel);
  sound.jet(player.jetting);
  sound.ride(player.riding, player.slideSpeed || 0);
  if (player.riding && Math.random() < dt * 25 && drops.length < MAX_DROPS) {
    drops.push({ p: player.pos.clone().add(new V3(0, 0.2, 0)), v: player.vel.clone().multiplyScalar(0.5).add(new V3(rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5))), life: 1, remote: true });
  }
  mp.forEachVisible((r) => { if (r.jet && r.char) jetBubbles(r.char.nozzles, 1, AXIS_Y.clone().multiplyScalar(0)); });
  // fuel bar under the crosshair
  const f = Math.round(player.fuel * 100);
  if (f !== fuelShown) {
    fuelShown = f;
    const el = document.getElementById('jet-fuel');
    el.classList.toggle('hidden', f >= 100);
    el.firstElementChild.style.width = `${f}%`;
    el.classList.toggle('low', f < 25);
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
    seen.clear(); seenOrder.length = 0;
    for (const str of hits) { markSeen(str); placeHit(decodeHit(str), false); }
  } else {
    for (const str of hits) if (markSeen(str)) S.incoming.push(str);
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
  let html = WEAPONS.map((w, i) => `
    <button class="wpn ${S.weapon === w.id ? 'on' : ''}" data-w="${w.id}">
      <span class="key">${i + 1}</span><span class="ico">${w.icon}</span><span class="lbl">${w.name}</span>
    </button>`).join('');
  if (S.special) {
    const def = SPECIALS[S.special.type];
    html += `<button class="wpn special ${S.weapon === S.special.type ? 'on' : ''}" data-w="${S.special.type}" style="--sp:${def.color}">
      <span class="key">5</span><span class="ico">${def.icon}</span><span class="lbl">${def.short}</span><b class="ammo">×${S.special.ammo}</b></button>`;
  }
  $('weapons').innerHTML = html;
  $('soap-picker').classList.toggle('hidden', S.weapon !== 'soap');
  const ammo = $('ammo');
  const sp = S.special && S.weapon === S.special.type ? S.special : null;
  ammo.classList.toggle('hidden', !sp);
  if (sp) ammo.textContent = `${SPECIALS[sp.type].icon} ${sp.ammo}`;
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
  if (SPECIALS[id] && (!S.special || S.special.type !== id)) return;
  S.weapon = id;
  if (id === 'washer' && !S.washToast) { S.washToast = true; toast('🚿 Lava-jato: lava a espuma das <b>outras cores</b>. A sua fica!', 'info'); }
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

function renderColorPick() {
  $('color-pick').innerHTML = COLORS.map((c, i) => `<button class="${i === profile.color ? 'on' : ''}" data-c="${i}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`).join('');
}
function setColor(i) {
  if (i < 0 || i >= COLORS.length) return;
  profile.color = i;
  saveProfile();
  LOOK.shirt = COLORS[i].hex;
  player.shirtMat.color.set(LOOK.shirt);
  renderColorPick();
  if (mp.status === 'on') mp.setHello({ n: profile.name, l: LOOK });
}
$('color-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { sound.init(); sound.click(); setColor(Number(b.dataset.c)); } });

// who owns how much of the foam on the house right now
function colorLabel(i) {
  if (i === profile.color) return { text: `Você (${COLORS[i].name})`, me: true };
  let who = null;
  mp.forEachVisible((r) => { if (!who && r.look && r.look.shirt === COLORS[i].hex) who = r.name; });
  return { text: who || COLORS[i].name, me: false };
}
let colorsHtml = '';
function renderColors() {
  let total = 0;
  for (let i = 0; i < colorShare.length; i++) total += Math.max(0, colorShare[i]);
  const rows = [];
  for (let i = 0; i < COLORS.length; i++) if (colorShare[i + 1] > 0.5) rows.push([i, colorShare[i + 1]]);
  rows.sort((a, b) => b[1] - a[1]);
  const el = $('colors');
  el.classList.toggle('hidden', !rows.length || !S.started);
  const html = rows.slice(0, 5).map(([i, v]) => {
    const pct = total ? (v / total) * 100 : 0;
    const l = colorLabel(i);
    return `<li><span class="dot" style="background:${COLORS[i].hex}"></span><span class="nm ${l.me ? 'me' : ''}">${esc(l.text)}</span><b>${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</b>
      <span class="bar"><i style="width:${pct.toFixed(1)}%;background:${COLORS[i].hex}"></i></span></li>`;
  }).join('');
  if (html !== colorsHtml) { colorsHtml = html; $('color-list').innerHTML = html; }
}

function renderOnline(mode = net.mode) {
  const el = $('online');
  if (mode === 'connecting') { el.className = 'pill'; el.textContent = 'conectando…'; return; }
  if (mode === 'retrying') { el.className = 'pill warn'; el.textContent = 'reconectando…'; return; }
  const here = mp.status === 'on' ? mp.count : 0;
  const people = Math.max(mode === 'online' ? net.online || 1 : 1, here + 1);
  el.className = mode === 'local' && here === 0 ? 'pill local' : 'pill on';
  let txt = `${people} ${people === 1 ? 'pessoa' : 'pessoas'} na rua`;
  if (mp.status === 'connecting') txt += ' · procurando amigos…';
  else if (mp.status === 'error') txt += ' · sem multiplayer';
  else if (mode === 'local' && here === 0) txt = 'modo local (sem servidor)';
  el.textContent = txt;
  el.title = here ? `${here} ${here === 1 ? 'pessoa jogando' : 'pessoas jogando'} com você em tempo real` : '';
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
  const hello = { n: profile.name, l: LOOK };
  if (mp.status === 'off') mp.start(hello); else mp.setHello(hello);
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
window.addEventListener('blur', () => { S.firing = false; S.keys = {}; input.jumpHeld = false; });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  S.keys[k] = true;
  if (k === '1') selectWeapon('soap');
  if (k === '2') selectWeapon('water');
  if (k === '3') selectWeapon('bubble');
  if (k === '4') selectWeapon('washer');
  if (k === '5' && S.special) selectWeapon(S.special.type);
  if (k === 'q') cycleSoap(-1);
  if (k === 'e') cycleSoap(1);
  if (k === ' ') { if (!e.repeat) input.jump = true; input.jumpHeld = true; e.preventDefault(); }
  if (k === 'f') { S.firing = true; S.tap = 0.12; }
  if (k === 'm') $('mute').click();
  if (k.startsWith('arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  S.keys[k] = false;
  if (k === 'f') S.firing = false;
  if (k === ' ') input.jumpHeld = false;
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
const jumpBtn = $('btn-jump');
jumpBtn.addEventListener('pointerdown', (e) => { input.jump = true; input.jumpHeld = true; jumpBtn.setPointerCapture(e.pointerId); });
jumpBtn.addEventListener('pointerup', () => { input.jumpHeld = false; });
jumpBtn.addEventListener('pointercancel', () => { input.jumpHeld = false; });

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
  slide.updateRide(dt, player);
  if (!player.riding && S.started) slide.tryEnter(player);
  slide.update(dt, worldTime);
  player.update(dt, input);
  jetAndSlideEffects(dt);
  mp.update(dt, netState());
  flushStreamShot(dt);
  updateWorld(worldTime, dt, player.pos, camera.position.y);
  camera.updateMatrixWorld();
  updateAim();
  player.root.updateMatrixWorld(true);
  updateHeld(dt);
  fire(dt);
  updateBars(dt);
  updateRockets(dt);
  const got = pickups.update(dt, player, S.started);
  if (got) { giveSpecial(got.type); mp.sendPick(got.id); }
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
    renderColors();
    if (S.started) renderMe();
    renderOnline();
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
renderColorPick();
renderRanking();
$('name-input').value = profile.name;
net.start().then(() => { renderRanking(); renderMeter(); });
setInterval(() => { if (S.started) renderRanking(); }, 2000);
requestAnimationFrame(frame);

// small debug handle (handy for testing in the console: __casa.step(60) advances 1 s)
window.__casa = {
  S, net, mp, slide, pickups, give: (t) => giveSpecial(t), scene, camera, renderer, player, input,
  foamCount: () => { let n = 0; foamCells.forEach((a) => { n += a.length; }); return n; },
  foamBall: (x, y, z, r) => addBall(new V3(x, y, z), r, WHITE, false, Math.random),
  step(n = 60) { for (let i = 0; i < n; i++) tick(1 / 60); render(); },
  Q,
};
