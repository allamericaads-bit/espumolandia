// Water slide: starts on a tower in the backyard, runs over the roof of the house,
// curves over the yard and the street and drops you into an inflatable pool full of foam.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const R = 0.72;            // half-pipe radius
const G = 9.8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// slide floor (where you sit), from the top of the tower to the pool
const PATH = [
  [-5.5, 8.45, -14.9], [-3.0, 7.75, -12.3], [1.5, 6.85, -9.7], [6.0, 5.95, -8.2],
  [9.2, 4.95, -5.0], [10.6, 3.95, -0.6], [9.3, 3.05, 4.4], [4.0, 2.15, 7.6],
  [-3.0, 1.25, 8.6], [-9.6, 0.5, 8.3],
];
const TOWER = { x0: -7.4, x1: -5.8, z0: -15.8, z1: -14.2, top: 8.45 };

export function buildSlide({ scene, T, colliders, groundHeight }) {
  const group = new THREE.Group();
  scene.add(group);
  const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new V3(...p)), false, 'centripetal');
  const L = curve.getLength();

  // frames with a stable "up" so the half-pipe never twists
  const frameAt = (u) => {
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new V3().crossVectors(t, new V3(0, 1, 0)).normalize();
    const up = new V3().crossVectors(side, t).normalize();
    return { p, t, side, up };
  };

  // ---------------------------------------------------------------- track geometry
  const rings = Math.ceil(L / 0.22), segs = 18;
  const pos = [], col = [], uv = [], idx = [], wpos = [], wuv = [], widx = [];
  const yellow = new THREE.Color('#ffd23f'), blue = new THREE.Color('#2f8cff');
  const rimL = [], rimR = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, s = u * L;
    const { p, side, up } = frameAt(u);
    const c = p.clone().addScaledVector(up, R);
    const stripe = Math.floor(s / 1.6) % 2 ? yellow : blue;
    for (let k = 0; k <= segs; k++) {
      const th = (k / segs) * Math.PI;
      const v = c.clone().addScaledVector(side, Math.cos(th) * R).addScaledVector(up, -Math.sin(th) * R);
      pos.push(v.x, v.y, v.z);
      col.push(stripe.r, stripe.g, stripe.b);
      uv.push(k / segs, s / 2);
    }
    // water film on the bottom of the pipe
    for (let k = 0; k <= 6; k++) {
      const th = Math.PI * (0.32 + (k / 6) * 0.36);
      const v = c.clone().addScaledVector(side, Math.cos(th) * (R - 0.02)).addScaledVector(up, -Math.sin(th) * (R - 0.02));
      wpos.push(v.x, v.y, v.z);
      wuv.push(k / 6, s / 2.5);
    }
    rimL.push(c.clone().addScaledVector(side, R));
    rimR.push(c.clone().addScaledVector(side, -R));
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * (segs + 1) + k, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    for (let k = 0; k < 6; k++) {
      const a = i * 7 + k, b = a + 7;
      widx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const track = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide }));
  track.castShadow = true; track.receiveShadow = true;
  group.add(track);

  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setIndex(widx);
  wg.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    map: T.water, color: '#9be6ff', transparent: true, opacity: 0.75, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const water = new THREE.Mesh(wg, waterMat);
  water.renderOrder = 2;
  group.add(water);

  const rimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  for (const rim of [rimL, rimR]) {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), rings, 0.055, 8), rimMat);
    m.castShadow = true;
    group.add(m);
  }

  // ---------------------------------------------------------------- supports
  const metal = new THREE.MeshStandardMaterial({ color: '#d7dde3', roughness: 0.35, metalness: 0.6 });
  const baseAt = (x, z, maxY) => {
    let g = groundHeight(x, z);
    for (const c of colliders) {
      if (!c.solid || x < c.min[0] || x > c.max[0] || z < c.min[2] || z > c.max[2]) continue;
      if (c.max[1] < maxY && c.max[1] > g) g = c.max[1];
    }
    return g;
  };
  for (let s = 2.5; s < L - 1; s += 3.4) {
    const { p } = frameAt(s / L);
    const top = p.y - 0.06;
    const base = baseAt(p.x, p.z, top - 0.3);
    const h = top - base;
    if (h < 0.3) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 10), metal);
    m.position.set(p.x, base + h / 2, p.z);
    m.castShadow = true;
    group.add(m);
    if (base < 0.2) colliders.push({ min: [p.x - 0.1, 0, p.z - 0.1], max: [p.x + 0.1, top, p.z + 0.1], proj: true, solid: true });
  }

  // ---------------------------------------------------------------- tower + ladder in the backyard
  const woodMat = new THREE.MeshStandardMaterial({ map: T.wood.map, bumpMap: T.wood.bump, bumpScale: 2, roughness: 0.85 });
  const towerMat = new THREE.MeshStandardMaterial({ color: '#2f8cff', roughness: 0.4 });
  const box = (x0, x1, y0, y1, z0, z1, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ min: [x0, y0, z0], max: [x1, y1, z1], proj: true, solid: true });
  };
  const { x0, x1, z0, z1, top } = TOWER;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(x - 0.08, x + 0.08, 0, top, z - 0.08, z + 0.08, towerMat);
  box(x0 - 0.1, x1 + 0.1, top - 0.2, top, z0 - 0.1, z1 + 0.1, woodMat);
  // railings (open towards the slide and where the ladder arrives)
  box(x0 - 0.1, x0 - 0.02, top, top + 0.95, z0 - 0.1, z1 + 0.1, towerMat);
  box(x0 - 0.1, x1 + 0.1, top, top + 0.95, z0 - 0.1, z0 - 0.02, towerMat);
  box(x1 - 0.5, x1 + 0.1, top, top + 0.95, z1 + 0.02, z1 + 0.1, towerMat);
  box(x1 + 0.02, x1 + 0.1, top, top + 0.95, z0 - 0.1, z0 + 0.6, towerMat);
  for (let y = 1.6; y < top; y += 2.2) { // cross braces (visual)
    box(x0, x1, y, y + 0.08, z0 - 0.04, z0 + 0.04, towerMat, false);
    box(x0 - 0.04, x0 + 0.04, y, y + 0.08, z0, z1, towerMat, false);
  }
  // ladder on the side facing the garage
  const lx0 = -7.05, lx1 = -6.3, lz = z1 + 0.12;
  box(lx0 - 0.04, lx0 + 0.04, 0, top + 0.9, lz - 0.04, lz + 0.04, rimMat, false);
  box(lx1 - 0.04, lx1 + 0.04, 0, top + 0.9, lz - 0.04, lz + 0.04, rimMat, false);
  for (let y = 0.3; y < top + 0.1; y += 0.3) box(lx0, lx1, y - 0.025, y + 0.025, lz - 0.025, lz + 0.025, rimMat, false);
  const ladders = [{ x0: lx0 - 0.05, x1: lx1 + 0.05, z0: lz - 0.05, z1: lz + 0.65, top, exitZ: z1 - 0.45, yaw: 0 }];

  // ---------------------------------------------------------------- inflatable pool with foam on the street
  const end = frameAt(1);
  const poolC = end.p.clone().addScaledVector(new V3(end.t.x, 0, end.t.z).normalize(), 2.7);
  poolC.y = 0;
  const ringMat = new THREE.MeshStandardMaterial({ color: '#36b7ff', roughness: 0.35 });
  const ringMat2 = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 14, 40), i ? ringMat2 : ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(poolC.x, 0.22 + i * 0.4, poolC.z);
    ring.castShadow = true;
    group.add(ring);
  }
  const poolWater = new THREE.Mesh(new THREE.CircleGeometry(2.05, 40), new THREE.MeshStandardMaterial({
    map: T.water, color: '#7fd8ff', transparent: true, opacity: 0.85, roughness: 0.05,
  }));
  poolWater.rotation.x = -Math.PI / 2;
  poolWater.position.set(poolC.x, 0.5, poolC.z);
  group.add(poolWater);
  const suds = new THREE.MeshStandardMaterial({ map: T.suds.map, roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.08 });
  const poolFoam = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 1.8;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15 + Math.random() * 0.22, 12, 9), suds);
    m.position.set(poolC.x + Math.cos(a) * d, 0.52, poolC.z + Math.sin(a) * d);
    m.scale.y = 0.6;
    m.userData.ph = Math.random() * 6.28;
    group.add(m);
    poolFoam.push(m);
  }
  const pool = { x: poolC.x, z: poolC.z, r: 2.05 };

  // samples for "can I jump into the slide here?"
  const samples = [];
  for (let s = 0; s < L - 3; s += 0.25) samples.push({ s, p: curve.getPointAt(s / L) });

  // ---------------------------------------------------------------- riding
  const ride = { on: false, s: 0, v: 0, cool: 0 };
  const _t2 = new V3();

  function tryEnter(player) {
    if (ride.on || ride.cool > 0 || player.climbing) return false;
    const pp = player.pos;
    for (const sm of samples) {
      const dx = pp.x - sm.p.x, dz = pp.z - sm.p.z;
      if (dx * dx + dz * dz > 0.6 * 0.6) continue;
      const dy = pp.y - sm.p.y;
      if (dy < -0.3 || dy > 1.0) continue;
      const t = curve.getTangentAt(sm.s / L);
      ride.on = true;
      ride.s = sm.s;
      ride.v = Math.max(3, player.vel.x * t.x + player.vel.z * t.z);
      player.riding = true;
      player.events.push({ type: 'slideStart' });
      return true;
    }
    return false;
  }

  function updateRide(dt, player) {
    if (!ride.on) { ride.cool = Math.max(0, ride.cool - dt); return; }
    const u = ride.s / L;
    const { p, t, side, up } = frameAt(u);
    ride.v += (-G * t.y - 0.04 * ride.v - 0.25) * dt;
    ride.v = clamp(ride.v, 2.5, 22);
    ride.s += ride.v * dt;
    // bank up the outer wall in curves
    _t2.copy(curve.getTangentAt(Math.min(1, (ride.s + 0.6) / L))).sub(t).divideScalar(0.6);
    const lateral = _t2.dot(side) * ride.v * ride.v;
    const phi = clamp(-Math.atan2(lateral, G), -1.0, 1.0);
    const c = p.clone().addScaledVector(up, R);
    const feet = c.addScaledVector(up, -R * Math.cos(phi)).addScaledVector(side, R * Math.sin(phi));
    player.pos.copy(feet);
    player.vel.copy(t).multiplyScalar(ride.v);
    player.bodyYaw = Math.atan2(-t.x, -t.z);
    player.lean = -phi * 0.8;
    player.slideSpeed = ride.v;
    if (ride.s >= L - 0.05) {
      ride.on = false;
      ride.cool = 1.2;
      player.riding = false;
      player.lean = 0;
      player.vel.copy(t).multiplyScalar(ride.v).add(new V3(0, 2.2, 0));
      player.onGround = false;
      player.events.push({ type: 'slideEnd', v: ride.v });
    }
  }

  function inPool(p) {
    return (p.x - pool.x) ** 2 + (p.z - pool.z) ** 2 < pool.r * pool.r && p.y < 0.8;
  }

  function update(dt, time) {
    T.water.offset.y = (T.water.offset.y - dt * 1.8) % 1;
    for (const m of poolFoam) m.position.y = 0.52 + Math.sin(time * 1.5 + m.userData.ph) * 0.03;
  }

  return { group, ladders, curve, tryEnter, updateRide, update, inPool, get riding() { return ride.on; } };
}
