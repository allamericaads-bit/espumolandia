// Soap helicopter: parked on a helipad in the street. Walk up to it and press G (or the 🚁 button
// on the phone) to fly over the whole neighbourhood and throw soap from the sky.
// Only the pilot simulates it; the others see it through the pilot's state packets (F_HELI flag).
import * as THREE from 'three';
import { BOUNDS } from './house.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const HELI_PAD = { x: 20, z: 8.5, yaw: Math.PI / 2 };
export const SEAT = new V3(0, 0.28, -0.25);   // pilot feet, in helicopter space (nose = -z)
const CEILING = 42;                            // max height (m)
const SPEED = 13, CLIMB = 7;
const BODY_R = 1.25, BODY_H = 2.5;             // for bumping into the house

// ---------------------------------------------------------------- model
export function buildHeliModel() {
  const g = new THREE.Group();
  const tilt = new THREE.Group();     // leans with speed
  g.add(tilt);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, ...o });
  const pink = mat('#ff7eb6'), blue = mat('#5cc8ff'), white = mat('#ffffff'), dark = mat('#2a3550', { roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#bfe9ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });

  const add = (geo, m, x, y, z, parent = tilt) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

  // body: a fat soap bar shape
  const body = add(new THREE.SphereGeometry(1, 28, 20), pink, 0, 1.05, 0.35);
  body.scale.set(1.05, 0.78, 1.45);
  const belly = add(new THREE.SphereGeometry(1, 24, 16), white, 0, 0.82, 0.3);
  belly.scale.set(0.95, 0.42, 1.35);
  // cockpit bubble
  const bubble = add(new THREE.SphereGeometry(1, 28, 20), glass, 0, 1.45, -0.55);
  bubble.scale.set(0.95, 0.85, 1.05);
  bubble.castShadow = false;
  bubble.renderOrder = 2;
  // tail boom + fins
  const boom = add(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 14), blue, 0, 1.25, 2.9);
  boom.rotation.x = Math.PI / 2;
  const fin = add(new THREE.BoxGeometry(0.08, 0.9, 0.6), pink, 0, 1.7, 4.35);
  fin.rotation.x = -0.25;
  add(new THREE.BoxGeometry(1.1, 0.07, 0.38), pink, 0, 1.27, 4.2);
  // tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.14, 1.75, 4.45);
  tilt.add(tailRotor);
  for (let i = 0; i < 2; i++) {
    const b = add(new THREE.BoxGeometry(0.04, 0.95, 0.12), white, 0, 0, 0, tailRotor);
    b.rotation.x = i * Math.PI / 2;
  }
  // skids
  for (const s of [-1, 1]) {
    const skid = add(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 10), dark, s * 0.85, 0.06, 0.2);
    skid.rotation.x = Math.PI / 2;
    for (const z of [-0.6, 0.9]) {
      const strut = add(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), dark, s * 0.7, 0.32, z);
      strut.rotation.z = s * 0.45;
    }
  }
  // soap cannon under the nose
  const gun = add(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 12), blue, 0, 0.42, -1.25);
  gun.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.16, 12, 10), white, 0, 0.42, -1.6);
  // bubbles painted on the side
  for (const [x, y, z, r] of [[1.0, 1.15, 0.6, 0.22], [1.02, 0.95, 1.05, 0.14], [-1.0, 1.15, 0.6, 0.22], [-1.02, 0.95, 1.05, 0.14]]) {
    add(new THREE.SphereGeometry(r, 14, 10), white, x, y, z);
  }
  // main rotor
  add(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 10), dark, 0, 2.05, 0.35);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.38, 0.35);
  tilt.add(rotor);
  add(new THREE.SphereGeometry(0.17, 12, 10), blue, 0, 0, 0, rotor);
  for (let i = 0; i < 4; i++) {
    const blade = add(new THREE.BoxGeometry(0.26, 0.04, 3.3), white, 0, 0, 1.65, new THREE.Group());
    const arm = blade.parent;
    arm.rotation.y = (i * Math.PI) / 2;
    rotor.add(arm);
    blade.castShadow = false;
  }
  return { g, tilt, rotor, tailRotor };
}

// spin the rotors and lean the body (shared by the local and remote helicopters)
export function animateHeli(m, dt, spin, pitch = 0, roll = 0) {
  m.rotor.rotation.y += spin * dt;
  m.tailRotor.rotation.x += spin * 1.6 * dt;
  m.tilt.rotation.x += (pitch - m.tilt.rotation.x) * Math.min(1, dt * 4);
  m.tilt.rotation.z += (roll - m.tilt.rotation.z) * Math.min(1, dt * 4);
}

// helicopter-space point -> world (helicopter at pos, turned by yaw)
export function heliToWorld(local, pos, yaw, out = new V3()) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return out.set(pos.x + local.x * c + local.z * s, pos.y + local.y, pos.z - local.x * s + local.z * c);
}

function padMesh() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f7fb'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.lineWidth = 14; g.strokeStyle = '#ff7eb6'; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#5cc8ff'; g.font = '900 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('H', 128, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.font = '800 52px "Baloo 2", system-ui, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  if (g.roundRect) g.roundRect((512 - w) / 2, 10, w, 88, 44); else g.rect((512 - w) / 2, 10, w, 88);
  g.fill();
  g.fillStyle = '#1d3557'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 56, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(2.6, 0.57, 1);
  sp.renderOrder = 5;
  return sp;
}

// ---------------------------------------------------------------- the helicopter
export function createHeli({ scene, colliders, groundHeight }) {
  const pad = padMesh();
  pad.position.set(HELI_PAD.x, groundHeight(HELI_PAD.x, HELI_PAD.z) + 0.02, HELI_PAD.z);
  scene.add(pad);

  const model = buildHeliModel();
  scene.add(model.g);
  const label = labelSprite('🚁 Helicóptero');
  label.position.set(0, 3.4, 0);
  model.g.add(label);

  const st = {
    flying: false,
    pos: new V3(HELI_PAD.x, pad.position.y, HELI_PAD.z),
    vel: new V3(),
    yaw: HELI_PAD.yaw,
    spin: 0,            // rotor speed (rad/s)
    hidden: false,      // someone else is flying it
  };

  // highest surface under (x, z) that is below maxY
  function floorAt(x, z, maxY) {
    let g = groundHeight(x, z);
    for (const c of colliders) {
      if (!c.solid) continue;
      if (x < c.min[0] - 0.6 || x > c.max[0] + 0.6 || z < c.min[2] - 0.6 || z > c.max[2] + 0.6) continue;
      if (c.max[1] <= maxY && c.max[1] > g) g = c.max[1];
    }
    return g;
  }

  function park() {
    st.flying = false;
    st.vel.set(0, 0, 0);
    st.pos.set(HELI_PAD.x, pad.position.y, HELI_PAD.z);
    st.yaw = HELI_PAD.yaw;
    label.visible = true;
  }

  function enter() {
    st.flying = true;
    label.visible = false;
  }

  // pilot input: move relative to the camera, jumpHeld climbs, down descends
  function fly(dt, input, camYaw) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let ix = input.moveX, iy = input.moveY;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const wx = (fx * iy + rx * ix) * SPEED, wz = (fz * iy + rz * ix) * SPEED;
    const k = 1 - Math.exp(-1.8 * dt);
    st.vel.x += (wx - st.vel.x) * k;
    st.vel.z += (wz - st.vel.z) * k;
    const vy = input.jumpHeld ? CLIMB : input.down ? -CLIMB : 0;
    st.vel.y += (vy - st.vel.y) * (1 - Math.exp(-3 * dt));
    input.jump = false;

    const p = st.pos;
    p.addScaledVector(st.vel, dt);
    // bump into walls and roofs (horizontal push out of boxes we are inside of)
    for (const c of colliders) {
      if (!c.solid) continue;
      if (p.y + BODY_H <= c.min[1] || p.y >= c.max[1] - 0.35) continue;
      const x0 = c.min[0] - BODY_R, x1 = c.max[0] + BODY_R, z0 = c.min[2] - BODY_R, z1 = c.max[2] + BODY_R;
      if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
      const dl = p.x - x0, dr = x1 - p.x, db = p.z - z0, df = z1 - p.z;
      const m = Math.min(dl, dr, db, df);
      if (m === dl) { p.x = x0; st.vel.x = Math.min(0, st.vel.x); } else if (m === dr) { p.x = x1; st.vel.x = Math.max(0, st.vel.x); } else if (m === db) { p.z = z0; st.vel.z = Math.min(0, st.vel.z); } else { p.z = z1; st.vel.z = Math.max(0, st.vel.z); }
    }
    p.x = clamp(p.x, BOUNDS.minX + 2, BOUNDS.maxX - 2);
    p.z = clamp(p.z, BOUNDS.minZ + 2, BOUNDS.maxZ - 2);
    const floor = floorAt(p.x, p.z, p.y + 0.4);
    if (p.y < floor) { p.y = floor; st.vel.y = Math.max(0, st.vel.y); }
    if (p.y > CEILING) { p.y = CEILING; st.vel.y = Math.min(0, st.vel.y); }
    // nose follows the camera
    let d = ((camYaw - st.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    st.yaw += d * (1 - Math.exp(-2.5 * dt));
    return p.y - floor < 0.05;   // on the ground
  }

  function update(dt) {
    const want = st.flying ? 34 : 0;
    st.spin += (want - st.spin) * Math.min(1, dt * (st.flying ? 1.5 : 0.6));
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const vf = -(st.vel.x * -s + st.vel.z * -c) * 0.028;   // forward speed -> nose down
    const vs = (st.vel.x * c - st.vel.z * s) * -0.028;     // sideways -> roll
    animateHeli(model, dt, st.spin, clamp(vf, -0.35, 0.35), clamp(vs, -0.35, 0.35));
    model.g.position.copy(st.pos);
    model.g.rotation.y = st.yaw;
    model.g.visible = !st.hidden || st.flying;
    label.visible = !st.flying && !st.hidden;
  }

  // where the pilot sits
  function seat(out = new V3()) { return heliToWorld(SEAT, st.pos, st.yaw, out); }
  // a spot beside the helicopter to step out to
  function exitSpot(out = new V3()) { return heliToWorld(new V3(-2.1, 0, 0), st.pos, st.yaw, out); }
  function near(p) { return !st.flying && !st.hidden && Math.hypot(p.x - st.pos.x, p.z - st.pos.z) < 3.4 && Math.abs(p.y - st.pos.y) < 2.5; }

  return { st, model, enter, park, fly, update, seat, exitSpot, near, get flying() { return st.flying; } };
}
