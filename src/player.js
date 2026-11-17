// The little character you walk around with + the third-person camera that follows it.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = 0.27;          // body radius
const H = 1.5;           // body height
const STEP = 0.42;       // max step-up height (curbs, foam lumps)
const GRAVITY = 18;
const JUMP = 6.4;

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  constructor({ scene, camera, colliders, groundHeight, foamQuery, spawn, look }) {
    this.camera = camera;
    this.colliders = colliders.filter((c) => c.solid);
    this.camBlockers = colliders.filter((c) => c.proj && c.solid);
    this.groundHeight = groundHeight;
    this.foamQuery = foamQuery;
    this.pos = new V3(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
    this.vel = new V3();
    this.yaw = spawn.yaw;           // camera yaw
    this.pitch = -0.04;
    this.bodyYaw = spawn.yaw;
    this.dist = 3.8;
    this.onGround = true;
    this.coyote = 0;
    this.walk = 0;
    this.aimBlend = 0;
    this.throwT = 1;
    this.visualY = this.pos.y;
    this.buildModel(scene, look);
  }

  // ---------------------------------------------------------------- model
  buildModel(scene, look) {
    const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = mat(look.skin, 0.55), shirt = mat(look.shirt, 0.75), pants = mat(look.pants, 0.8), shoe = mat('#2a2a2e', 0.5), hair = mat(look.hair, 0.7);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const add = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // legs
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.09 * s, 0.6, 0);
      add(pivot, new THREE.CapsuleGeometry(0.075, 0.38, 4, 10), pants, 0, -0.27, 0);
      add(pivot, new THREE.BoxGeometry(0.13, 0.08, 0.22), shoe, 0, -0.56, 0.035);
      body.add(pivot);
      return pivot;
    });
    // torso + belt
    add(body, new THREE.CapsuleGeometry(0.175, 0.26, 6, 14), shirt, 0, 0.88, 0).scale.set(1, 1, 0.78);
    add(body, new THREE.CylinderGeometry(0.168, 0.168, 0.07, 14), pants, 0, 0.66, 0).scale.set(1, 1, 0.78);
    // head
    const head = new THREE.Group();
    head.position.set(0, 1.3, 0);
    body.add(head);
    add(head, new THREE.SphereGeometry(0.2, 24, 18), skin, 0, 0, 0);
    const cap = add(head, new THREE.SphereGeometry(0.212, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), hair, 0, 0.015, -0.01);
    cap.rotation.x = -0.25;
    const eyeM = mat('#1b1b1f', 0.3);
    for (const s of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.028, 10, 8), eyeM, 0.07 * s, 0.01, 0.178);
      add(head, new THREE.SphereGeometry(0.03, 10, 8), mat('#ff9fa8', 0.8), 0.12 * s, -0.06, 0.15).scale.set(1, 0.6, 0.4);
    }
    const smile = add(head, new THREE.TorusGeometry(0.045, 0.009, 6, 12, Math.PI), eyeM, 0, -0.06, 0.185);
    smile.rotation.z = Math.PI;
    this.head = head;
    // arms
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.225 * s, 1.07, 0);
      add(pivot, new THREE.CapsuleGeometry(0.055, 0.3, 4, 10), shirt, 0, -0.18, 0);
      add(pivot, new THREE.SphereGeometry(0.06, 12, 10), skin, 0, -0.39, 0);
      body.add(pivot);
      return pivot;
    });
    this.hand = new THREE.Group();          // weapons get attached here
    this.hand.position.set(0, -0.42, 0.02);
    this.hand.rotation.x = Math.PI / 2;
    this.arms[1].add(this.hand);
    // soft blob shadow helps reading height when jumping on foam
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    scene.add(blob);
    this.blobShadow = blob;
    this.body = body;
    this.root = root;
    scene.add(root);
  }

  // ---------------------------------------------------------------- physics helpers
  supportAt(x, z, maxY) {
    let g = this.groundHeight(x, z);
    for (const c of this.colliders) {
      if (x < c.min[0] - 0.05 || x > c.max[0] + 0.05 || z < c.min[2] - 0.05 || z > c.max[2] + 0.05) continue;
      const top = c.max[1];
      if (top <= maxY && top > g) g = top;
    }
    this.foamQuery(x - 1, x + 1, z - 1, z + 1, (s) => {
      const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
      if (d2 >= s.r * s.r) return;
      const h = s.y + Math.sqrt(s.r * s.r - d2) * 0.92;
      if (h <= maxY && h > g) g = h;
    });
    return g;
  }

  pushOut() {
    const p = this.pos;
    for (const c of this.colliders) {
      if (c.max[1] <= p.y + STEP || c.min[1] >= p.y + H) continue;
      const cx = clamp(p.x, c.min[0], c.max[0]), cz = clamp(p.z, c.min[2], c.max[2]);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * R; p.z = cz + (dz / d) * R;
      } else {
        const pl = p.x - c.min[0], pr = c.max[0] - p.x, pb = p.z - c.min[2], pf = c.max[2] - p.z;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) p.x = c.min[0] - R; else if (m === pr) p.x = c.max[0] + R;
        else if (m === pb) p.z = c.min[2] - R; else p.z = c.max[2] + R;
      }
    }
    this.foamQuery(p.x - 1.2, p.x + 1.2, p.z - 1.2, p.z + 1.2, (s) => {
      if (s.y + s.r * 0.92 <= p.y + STEP || s.y - s.r >= p.y + H) return;
      const yc = clamp(s.y, p.y + STEP, p.y + H);
      const re2 = s.r * s.r - (yc - s.y) ** 2;
      if (re2 <= 0) return;
      const need = Math.sqrt(re2) * 0.9 + R * 0.6;
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
      if (d >= need) return;
      if (d < 1e-4) { p.x += need; return; }
      p.x = s.x + (dx / d) * need; p.z = s.z + (dz / d) * need;
    });
  }

  ceiling() {
    const p = this.pos;
    for (const c of this.colliders) {
      if (p.x < c.min[0] || p.x > c.max[0] || p.z < c.min[2] || p.z > c.max[2]) continue;
      if (c.min[1] > p.y + 0.5 && c.min[1] < p.y + H) { p.y = c.min[1] - H; this.vel.y = Math.min(0, this.vel.y); }
    }
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    // look
    this.yaw -= input.lookDX;
    this.pitch = clamp(this.pitch - input.lookDY, -0.75, 0.9);
    input.lookDX = 0; input.lookDY = 0;
    this.dist = clamp(this.dist + input.zoom, 2.4, 5.2);
    input.zoom = 0;

    // movement wish in camera space
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let ix = input.moveX, iy = input.moveY;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const speed = input.run ? 6.4 : 4.1;
    const wx = (fx * iy + rx * ix) * speed, wz = (fz * iy + rz * ix) * speed;
    const acc = this.onGround ? 14 : 4;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    // jump
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    if (input.jump && this.coyote > 0) {
      this.vel.y = JUMP;
      this.coyote = 0;
      this.onGround = false;
      this.jumped = true;
    }
    input.jump = false;

    // integrate horizontal, then resolve
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pushOut();

    // vertical
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    this.ceiling();
    const g = this.supportAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y) + STEP);
    if (this.pos.y <= g) {
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = this.pos.y - g < 0.04 && this.vel.y <= 0;
    }
    if (this.pos.y < -5) { this.pos.set(4.4, 0.2, 5); this.vel.set(0, 0, 0); }

    // facing: towards the camera when shooting, else towards movement
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.3;
    this.aimBlend += ((input.aiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-12 * dt));
    if (input.aiming) this.bodyYaw = angleLerp(this.bodyYaw, this.yaw, 1 - Math.exp(-20 * dt));
    else if (moving) this.bodyYaw = angleLerp(this.bodyYaw, Math.atan2(-this.vel.x, -this.vel.z), 1 - Math.exp(-10 * dt));

    this.animate(dt, moving);
    this.updateCamera(dt);
  }

  animate(dt, moving) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moving) this.walk += dt * (4 + sp * 1.6);
    const swing = this.onGround ? Math.sin(this.walk) * Math.min(1, sp / 4) * 0.75 : 0.35;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = this.onGround ? -swing : -0.5;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[0].rotation.z = -0.12;
    // right arm: relaxed swing, raised to aim, or throwing
    const aimAngle = -Math.PI / 2 - this.pitch;
    const relaxed = swing * 0.8;
    let right = relaxed + (aimAngle - relaxed) * this.aimBlend;
    if (this.throwT < 1) {
      this.throwT = Math.min(1, this.throwT + dt / 0.28);
      const e = 1 - Math.pow(1 - this.throwT, 3);
      right = -3.6 + (aimAngle + 3.6) * e;
    }
    this.arms[1].rotation.x = right;
    this.arms[1].rotation.z = 0.12;
    const bob = this.onGround ? Math.abs(Math.sin(this.walk)) * 0.04 * Math.min(1, sp / 4) : 0;
    this.visualY += (this.pos.y - this.visualY) * (1 - Math.exp(-25 * dt));
    this.root.position.set(this.pos.x, this.visualY + bob, this.pos.z);
    this.root.rotation.y = this.bodyYaw + Math.PI;
    this.head.rotation.x = -this.pitch * 0.4;
    this.body.rotation.x = this.onGround ? 0 : -0.08;
    // blob shadow on whatever is below
    const g = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 0.05);
    this.blobShadow.position.set(this.pos.x, g + 0.025, this.pos.z);
    const h = this.pos.y - g;
    this.blobShadow.material.opacity = 0.24 / (1 + h * 1.5);
  }

  throwAnim() { this.throwT = 0; }

  // ---------------------------------------------------------------- camera
  lookDir(out = new V3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  updateCamera() {
    const d = this.lookDir();
    const right = new V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = new V3(this.root.position.x, this.root.position.y + 1.85, this.root.position.z).addScaledVector(right, 0.62);
    const want = pivot.clone().addScaledVector(d, -this.dist);
    // keep the camera out of walls
    const t = this.segBoxes(pivot, want);
    if (t < 1) want.lerpVectors(pivot, want, Math.max(0.15, t - 0.08));
    want.y = Math.max(want.y, this.groundHeight(want.x, want.z) + 0.25);
    this.camera.position.copy(want);
    this.camera.lookAt(pivot.clone().addScaledVector(d, 20));
    this.pivot = pivot;
  }

  segBoxes(a, b) {
    let best = 1;
    const d = [b.x - a.x, b.y - a.y, b.z - a.z], o = [a.x, a.y, a.z];
    for (const c of this.camBlockers) {
      let tmin = 0, tmax = best, ok = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < c.min[k] || o[k] > c.max[k]) { ok = false; break; } continue; }
        let t1 = (c.min[k] - o[k]) / d[k], t2 = (c.max[k] - o[k]) / d[k];
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < best) best = tmin;
    }
    return best;
  }
}
