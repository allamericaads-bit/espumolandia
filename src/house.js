// Builds the street, the house (modelled on the reference photos) and the neighbourhood.
// Coordinates in metres. +z points to the street; the main facade is at z = -6.
//
// Colliders are axis-aligned boxes: { min, max, proj, solid }
//   proj  – projectiles (soap, water, bubbles) hit it
//   solid – the player can't walk through it (and can stand on top)
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

// Scale a BoxGeometry's UVs so textures keep a constant size in metres.
function worldUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
    }
  }
}
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

export function groundHeight(x, z) {
  if (z >= 0 && z < 2.6) return 0.12;                       // sidewalk
  if (z >= 2.6 && z < 2.75) return 0.15;                    // curb
  if (z >= 14 && z < 17) return 0.12;                       // opposite sidewalk
  if (z < 0 && z > -6.05 && x > -9.1 && x < 13.5) return 0.02; // lot floor
  return 0;
}

export const SPAWN = { x: 4.4, z: 5.2, yaw: 0 };
export const BOUNDS = { minX: -32, maxX: 32, minZ: -15.8, maxZ: 16.5 };

export function buildWorld(scene, T) {
  const world = new THREE.Group();
  scene.add(world);
  const colliders = [];
  const foamSpots = [];
  const emitters = [];

  // ---------------------------------------------------------------- materials
  const stucco = (color, bumpScale = 1.4) => new THREE.MeshStandardMaterial({
    map: T.stucco.map, bumpMap: T.stucco.bump, bumpScale, color, roughness: 0.94,
  });
  const M = {
    wallL: stucco('#f0d4b2'),          // beige / peach (main block)
    wallR: stucco('#f1e0a2'),          // pale yellow (right block)
    column: stucco('#a97f6f'),         // mauve-brown column
    cap: stucco('#f5e9d6', 0.8),
    trim: stucco('#efe7dc', 0.8),
    white: stucco('#f6f4ef', 0.8),
    post: stucco('#cfaea0'),
    neighbor: stucco('#a7b3be'),
    neighbor2: stucco('#dcd5c6'),
    wood: new THREE.MeshStandardMaterial({ map: T.wood.map, bumpMap: T.wood.bump, bumpScale: 2, roughness: 0.9 }),
    woodDark: new THREE.MeshStandardMaterial({ map: T.wood.map, bumpMap: T.wood.bump, bumpScale: 2, color: '#8a7766', roughness: 0.9 }),
    slat: new THREE.MeshStandardMaterial({ map: T.slat.map, bumpMap: T.slat.bump, bumpScale: 1.5, roughness: 0.72 }),
    shutterBack: new THREE.MeshStandardMaterial({ color: '#2b1c12', roughness: 0.9 }),
    door: new THREE.MeshStandardMaterial({ map: T.door.map, bumpMap: T.door.bump, bumpScale: 2, roughness: 0.55 }),
    fiber: new THREE.MeshStandardMaterial({ map: T.fiber.map, bumpMap: T.fiber.bump, bumpScale: 1.2, roughness: 0.88, side: THREE.DoubleSide }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete.map, bumpMap: T.concrete.bump, bumpScale: 1, roughness: 0.95 }),
    pavers: new THREE.MeshStandardMaterial({ map: T.pavers.map, bumpMap: T.pavers.bump, bumpScale: 2.5, roughness: 0.92 }),
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt.map, bumpMap: T.asphalt.bump, bumpScale: 1.5, roughness: 0.97 }),
    grass: new THREE.MeshStandardMaterial({ map: T.grass.map, bumpMap: T.grass.bump, bumpScale: 2, roughness: 1 }),
    tiles: new THREE.MeshStandardMaterial({ map: T.tiles.map, bumpMap: T.tiles.bump, bumpScale: 3, roughness: 0.75, side: THREE.DoubleSide }),
    wire: new THREE.MeshStandardMaterial({ map: T.wire, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ map: T.metal.map, roughness: 0.35, metalness: 0.6 }),
    pvc: new THREE.MeshStandardMaterial({ color: '#c7c3bd', roughness: 0.45 }),
    dish: new THREE.MeshStandardMaterial({ color: '#efefef', roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#fff7dc', roughness: 0.15, emissive: '#fff1c8', emissiveIntensity: 0.15 }),
    pot: new THREE.MeshStandardMaterial({ color: '#2c2826', roughness: 0.8 }),
    leafCore: new THREE.MeshStandardMaterial({ color: '#2f5323', roughness: 0.95 }),
    leaves: new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    palm: new THREE.MeshStandardMaterial({ map: T.palm, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 }),
    trunk: new THREE.MeshStandardMaterial({ map: T.wood.map, bumpMap: T.wood.bump, bumpScale: 3, color: '#9b8f80', roughness: 1 }),
    toyBlue: new THREE.MeshStandardMaterial({ color: '#2459d8', roughness: 0.4 }),
    toyPink: new THREE.MeshStandardMaterial({ color: '#ff6f96', roughness: 0.4 }),
    pole: stucco('#bdbab4', 0.6),
    cable: new THREE.MeshBasicMaterial({ color: '#222222' }),
    grime: new THREE.MeshBasicMaterial({ map: T.grime, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    streaks: new THREE.MeshBasicMaterial({ map: T.streaks, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  };

  // ---------------------------------------------------------------- helpers
  function boxAt(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    if (o.uv !== 0) worldUV(geo, w, h, d, o.uv ?? 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = true;
    (o.parent || world).add(m);
    if (o.collide !== false) collider(x0, x1, y0, y1, z0, z1, o.proj ?? true, o.solid ?? true);
    return m;
  }
  function collider(x0, x1, y0, y1, z0, z1, proj = true, solid = true) {
    colliders.push({ min: [x0, y0, z0], max: [x1, y1, z1], proj, solid });
  }
  // decal strip on a facade facing +z
  function decal(x0, x1, y0, y1, z, mat, tile = 1.6) {
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    scaleUV(geo, (x1 - x0) / tile, 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z + 0.004);
    m.renderOrder = 1;
    world.add(m);
  }
  const spot = (x, y, z, nx, ny, nz, r) => foamSpots.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, nz), r, thr: 0 });
  function cyl(r0, r1, h, mat, x, y, z, seg = 12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    world.add(m);
    return m;
  }

  // ---------------------------------------------------------------- ground, sidewalk, street
  {
    const g = new THREE.PlaneGeometry(240, 240);
    scaleUV(g, 240 / 3, 240 / 3);
    const ground = new THREE.Mesh(g, M.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);
  }
  boxAt(-60, 3.1, -0.01, 0.12, 0, 2.6, M.concrete, { collide: false, uv: 2.4, cast: false });
  boxAt(3.1, 60, -0.01, 0.12, 0, 2.6, M.pavers, { collide: false, uv: 1.4, cast: false });
  boxAt(-60, 60, -0.01, 0.15, 2.6, 2.75, M.concrete, { collide: false, uv: 1.5, cast: false });
  boxAt(-60, 60, -0.03, 0.01, 2.75, 14, M.asphalt, { collide: false, uv: 5, cast: false });
  boxAt(-60, 60, -0.01, 0.12, 14, 17, M.pavers, { collide: false, uv: 1.4, cast: false });
  boxAt(-9.1, 13.5, -0.01, 0.02, -6.05, 0, M.concrete, { collide: false, uv: 3, cast: false });
  boxAt(-9.1, -4.2, -0.01, 0.02, -14, -6.05, M.concrete, { collide: false, uv: 3, cast: false });

  // ---------------------------------------------------------------- main house, left block (beige)
  const zL = -6;            // facade plane
  boxAt(-4.2, 4.0, 0, 3.3, -14, zL, M.wallL);
  boxAt(-4.3, 4.0, 3.3, 3.42, -14.05, zL + 0.07, M.cap, { uv: 1 });      // parapet cap
  boxAt(-4.2, 4.0, 0, 0.22, zL, zL + 0.03, M.column, { uv: 1 });          // painted plinth
  decal(-4.2, 4.0, 0.22, 1.1, zL + 0.0, M.grime);
  decal(-4.2, 4.0, 2.3, 3.3, zL + 0.0, M.streaks, 2.4);

  // column (taller, mauve) with two downpipes
  boxAt(4.0, 5.3, 0, 4.35, -14, -5.72, M.column);
  boxAt(3.94, 5.36, 4.35, 4.47, -14.06, -5.66, M.cap, { uv: 1 });
  decal(4.0, 5.3, 0, 1.0, -5.72, M.grime);
  for (const x of [5.46, 5.66]) {
    cyl(0.055, 0.055, 4.05, M.pvc, x, 2.02, -5.86);
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.055, 8, 12, Math.PI / 2), M.pvc);
    elbow.position.set(x, 4.05, -5.98); elbow.rotation.y = Math.PI / 2; world.add(elbow);
    for (const y of [0.9, 2.2, 3.5]) cyl(0.065, 0.065, 0.05, M.pvc, x, y, -5.86, 10);
    collider(x - 0.06, x + 0.06, 0, 4.1, -5.92, -5.8);
  }

  // right block (pale yellow), slightly set back
  const zR = -6.2;
  boxAt(5.3, 11.5, 0, 3.4, -14, zR, M.wallR);
  boxAt(5.3, 11.6, 3.4, 3.52, -14.05, zR + 0.07, M.cap, { uv: 1 });
  boxAt(5.3, 11.5, 2.86, 2.95, zR, zR + 0.62, M.trim, { uv: 1 });         // concrete marquise
  boxAt(5.3, 11.5, 0, 0.22, zR, zR + 0.03, M.column, { uv: 1 });
  decal(5.3, 11.5, 0.22, 1.1, zR, M.grime);
  decal(5.3, 11.5, 2.95, 3.4, zR, M.streaks, 2.4);

  // ---- windows with real wooden venezianas
  const slats = [];
  function windowAt(cx, y0, w, h, z) {
    const fr = 0.1;
    // concrete surround and sill
    boxAt(cx - w / 2 - fr, cx + w / 2 + fr, y0 + h, y0 + h + fr, z, z + 0.05, M.trim, { uv: 1 });
    boxAt(cx - w / 2 - fr, cx - w / 2, y0, y0 + h, z, z + 0.05, M.trim, { uv: 1 });
    boxAt(cx + w / 2, cx + w / 2 + fr, y0, y0 + h, z, z + 0.05, M.trim, { uv: 1 });
    boxAt(cx - w / 2 - 0.16, cx + w / 2 + 0.16, y0 - 0.09, y0, z, z + 0.17, M.trim, { uv: 1 });
    // dark backing so the slats read as shutters
    boxAt(cx - w / 2, cx + w / 2, y0, y0 + h, z, z + 0.015, M.shutterBack, { uv: 0, collide: false });
    // two leaves: stiles, rails and tilted slats
    const leafW = w / 2;
    for (let s = 0; s < 2; s++) {
      const lx0 = cx - w / 2 + s * leafW;
      boxAt(lx0, lx0 + 0.055, y0, y0 + h, z + 0.015, z + 0.07, M.slat, { uv: 0, collide: false });
      boxAt(lx0 + leafW - 0.055, lx0 + leafW, y0, y0 + h, z + 0.015, z + 0.07, M.slat, { uv: 0, collide: false });
      boxAt(lx0, lx0 + leafW, y0, y0 + 0.07, z + 0.015, z + 0.07, M.slat, { uv: 0, collide: false });
      boxAt(lx0, lx0 + leafW, y0 + h - 0.07, y0 + h, z + 0.015, z + 0.07, M.slat, { uv: 0, collide: false });
      for (let y = y0 + 0.1; y < y0 + h - 0.08; y += 0.062) {
        slats.push({ x: lx0 + leafW / 2, y, z: z + 0.042, w: leafW - 0.11 });
      }
    }
    collider(cx - w / 2 - fr, cx + w / 2 + fr, y0 - 0.09, y0 + h + fr, z, z + 0.07);
    for (let i = 0; i < 4; i++) spot(cx + rnd(-w / 2, w / 2), y0, z + 0.1, 0, 1, 0, rnd(0.12, 0.2));
  }
  windowAt(-1.75, 1.05, 1.2, 1.3, zL);
  windowAt(1.3, 1.05, 1.2, 1.3, zL);
  windowAt(7.0, 1.0, 1.3, 1.25, zR);
  windowAt(9.65, 1.0, 1.3, 1.25, zR);
  {
    const geo = new THREE.BoxGeometry(1, 0.075, 0.012);
    const inst = new THREE.InstancedMesh(geo, M.slat, slats.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0));
    slats.forEach((s, i) => inst.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.w, 1, 1))));
    inst.castShadow = true; inst.receiveShadow = true;
    world.add(inst);
  }

  // front door with frame, handle and step
  boxAt(2.78, 3.72, 0, 2.12, zL, zL + 0.05, M.door, { uv: 0 });
  boxAt(2.68, 2.78, 0, 2.22, zL, zL + 0.08, M.trim, { uv: 1 });
  boxAt(3.72, 3.82, 0, 2.22, zL, zL + 0.08, M.trim, { uv: 1 });
  boxAt(2.68, 3.82, 2.12, 2.22, zL, zL + 0.08, M.trim, { uv: 1 });
  boxAt(2.6, 3.9, 0, 0.08, zL, zL + 0.35, M.concrete, { uv: 1 });
  cyl(0.012, 0.012, 0.14, M.metal, 3.6, 1.05, zL + 0.08, 8).rotation.z = Math.PI / 2;
  // wall lamp next to the window + light switch box
  boxAt(-3.15, -2.95, 2.05, 2.3, zL, zL + 0.06, M.metal, { uv: 0 });
  boxAt(-3.13, -2.97, 2.08, 2.27, zL + 0.06, zL + 0.12, M.glass, { uv: 0, collide: false });

  // satellite dish on the right block
  {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), M.metal);
    pole.position.y = 0.4; g.add(pole);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 8, 0, Math.PI * 2, 0, 0.62), M.dish);
    dish.rotation.set(-1.15, 0, 0.45); dish.position.set(0, 0.86, 0.05); dish.castShadow = true; g.add(dish);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 6), M.metal);
    arm.position.set(0.06, 0.86, 0.28); arm.rotation.x = 1.15; g.add(arm);
    const lnb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), M.metal);
    lnb.position.set(0.1, 0.98, 0.5); g.add(lnb);
    g.position.set(6.1, 3.52, -7.0); world.add(g);
    collider(5.7, 6.5, 3.52, 4.35, -7.4, -6.6, true, false);
  }

  // ---------------------------------------------------------------- pergola / carport (wood + corrugated fibre-cement)
  const yF = 2.5, yB = 2.86, zF = 0.0, zB = -5.95;
  for (const x of [-9.1, -4.3, 2.9]) {
    boxAt(x - 0.09, x + 0.09, 0, yF, -0.09, 0.09, M.wood, { uv: 1.2 });
    spot(x, yF + 0.12, 0.15, 0, 1, 0, 0.2);
  }
  boxAt(-9.19, -9.01, 0, yB, -5.94, -5.76, M.wood, { uv: 1.2 });
  boxAt(-9.35, 3.15, yF - 0.22, yF, -0.12, 0.1, M.wood, { uv: 1.6 });      // front beam
  boxAt(-9.35, 3.15, yF - 0.04, yF + 0.02, 0.1, 0.16, M.woodDark, { uv: 1.6, collide: false }); // fascia
  boxAt(-9.3, 3.1, yB - 0.2, yB, -5.95, -5.76, M.wood, { uv: 1.6, collide: false });
  const slope = Math.atan2(yB - yF, zF - zB);
  const len = Math.hypot(zF - zB + 0.5, yB - yF);
  for (let x = -9.1; x <= 3.0; x += 0.92) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, len), M.wood);
    r.position.set(x, (yF + yB) / 2 - 0.02, (zF + zB) / 2 + 0.1);
    r.rotation.x = slope; r.castShadow = true; r.receiveShadow = true; world.add(r);
  }
  {
    // real corrugated sheet: sine waves across x
    const w = 12.7, L = len + 0.35, pitch = 0.177, amp = 0.028;
    const geo = new THREE.PlaneGeometry(w, L, Math.round((w / pitch) * 6), 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, Math.sin((pos.getX(i) / pitch) * Math.PI * 2) * amp);
    geo.computeVertexNormals();
    scaleUV(geo, w / 3, L / 3);
    const roof = new THREE.Mesh(geo, M.fiber);
    roof.position.set(-3.1, (yF + yB) / 2 + 0.1, (zF + zB) / 2 + 0.17);
    roof.rotation.x = slope;
    roof.castShadow = true; roof.receiveShadow = true;
    world.add(roof);
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const za = 0.45 - (i / steps) * 6.45, zb = 0.45 - ((i + 1) / steps) * 6.45;
      const yTop = yF + 0.13 + (yB - yF) * ((0.45 - (za + zb) / 2) / 6.45);
      collider(-9.45, 3.25, yTop - 0.07, yTop, zb, za);
      for (let k = 0; k < 7; k++) spot(rnd(-9.2, 3.0), yTop, rnd(zb, za), 0, 1, 0, rnd(0.3, 0.55));
    }
    for (let k = 0; k < 20; k++) emitters.push({ p: new THREE.Vector3(rnd(-9, 3), yF + 0.3, rnd(-5, 0.2)), n: new THREE.Vector3(0, 1, 0) });
  }

  // ---------------------------------------------------------------- fences and gates
  boxAt(-9.16, -9.04, 0, 1.9, -14, -0.12, M.wood, { uv: 1.5 });     // board fence to the neighbour
  boxAt(13.45, 13.55, 0, 1.6, -14, -0.2, M.wood, { uv: 1.5 });       // right side fence
  for (const x of [5.95, 9.7, 13.4]) {                                 // masonry posts
    boxAt(x - 0.16, x + 0.16, 0, 1.8, -0.16, 0.16, M.post, { uv: 1 });
    boxAt(x - 0.19, x + 0.19, 1.8, 1.86, -0.19, 0.19, M.cap, { uv: 1 });
    spot(x, 1.86, 0, 0, 1, 0, 0.25);
  }
  boxAt(3.05, 3.25, 0, 1.75, -0.1, 0.1, M.wood, { uv: 1.2 });
  // mailbox on the gate post
  boxAt(5.72, 6.18, 1.05, 1.35, 0.16, 0.36, M.metal, { uv: 0 });

  function fencePanel(a, b, grid, parent = world, local = false) {
    const w = b - a, h = 1.5;
    const g = new THREE.PlaneGeometry(w, h);
    scaleUV(g, w / 0.4, h / 0.4);
    const mesh = new THREE.Mesh(g, M.wire);
    const ox = local ? w / 2 : (a + b) / 2;
    mesh.position.set(ox, 0.86, 0);
    parent.add(mesh);
    const x0 = local ? 0 : a, x1 = local ? w : b;
    const o = { uv: 1.2, collide: false, parent };
    boxAt(x0, x1, 0.06, 0.13, -0.035, 0.035, M.wood, o);
    boxAt(x0, x1, 1.58, 1.66, -0.045, 0.045, M.wood, o);
    if (grid) {
      for (const y of [0.62, 1.1]) boxAt(x0, x1, y - 0.04, y + 0.04, 0.02, 0.09, M.wood, o);
      boxAt(x0, x0 + 0.08, 0.06, 1.66, 0.02, 0.09, M.wood, o);
      boxAt(x1 - 0.08, x1, 0.06, 1.66, 0.02, 0.09, M.wood, o);
      boxAt((x0 + x1) / 2 - 0.04, (x0 + x1) / 2 + 0.04, 0.06, 1.66, 0.02, 0.09, M.wood, o);
    }
  }
  const panels = [[-9.0, -4.4, false], [-4.2, 2.8, false], [6.11, 9.54, true], [9.86, 13.24, true]];
  for (const [a, b, grid] of panels) {
    fencePanel(a, b, grid);
    collider(a, b, 0, 1.66, -0.06, 0.06, false, true);               // blocks the player, not the soap
    for (let x = a + 0.2; x < b; x += 0.45) spot(x, 1.66, 0, 0, 1, 0, rnd(0.12, 0.2));
  }
  {
    // the gate in front of the door is open, so you can walk into the yard
    const gate = new THREE.Group();
    gate.position.set(3.27, 0, 0.0);
    gate.rotation.y = 1.75;
    fencePanel(3.27, 5.77, true, gate, true);
    world.add(gate);
    collider(3.1, 3.5, 0, 1.66, -2.6, -0.05, false, true);
  }

  // white wall + plant pots in the right yard
  boxAt(6.2, 8.4, 0, 1.95, -2.35, -2.1, M.white, { uv: 1.5 });
  boxAt(6.15, 8.45, 1.95, 2.01, -2.4, -2.05, M.cap, { uv: 1 });
  spot(7.3, 2.01, -2.22, 0, 1, 0, 0.3);
  for (const [x, z] of [[6.7, -1.85], [7.55, -1.8], [8.0, -1.95]]) {
    cyl(0.2, 0.15, 0.32, M.pot, x, 0.16, z, 16);
    bushBall(x, 0.48, z, 0.3);
    collider(x - 0.25, x + 0.25, 0, 0.6, z - 0.25, z + 0.25);
  }

  // small wooden porch roof in front of the right block
  boxAt(13.12, 13.28, 0, 2.62, -3.6, -3.44, M.wood, { uv: 1.2 });
  boxAt(9.4, 13.4, 2.6, 2.74, -6.2, -3.4, M.wood, { uv: 1.6 });
  for (let k = 0; k < 6; k++) spot(rnd(9.5, 13.3), 2.74, rnd(-6, -3.5), 0, 1, 0, rnd(0.25, 0.4));

  // kids' toys in the garage (from the photo)
  boxAt(-7.7, -7.25, 0, 0.85, -1.7, -1.25, M.toyBlue, { uv: 1 });
  {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 16), M.toyPink);
    cone.position.set(-6.6, 0.3, -1.5); cone.castShadow = true; world.add(cone);
    collider(-6.8, -6.4, 0, 0.6, -1.7, -1.3);
  }

  // ---------------------------------------------------------------- utility pole and cables
  {
    const px = 11.6, pz = 2.35;
    const pole = cyl(0.11, 0.17, 9, M.pole, px, 4.5, pz, 10);
    pole.castShadow = true;
    boxAt(px - 0.9, px + 0.9, 8.1, 8.22, pz - 0.06, pz + 0.06, M.pole, { uv: 1, collide: false });
    collider(px - 0.17, px + 0.17, 0, 9, pz - 0.17, pz + 0.17, true, true);
    for (const dx of [-0.75, 0, 0.75]) {
      for (const [x0, x1] of [[-60, px], [px, 60]]) {
        const L = x1 - x0;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, L, 4), M.cable);
        c.rotation.z = Math.PI / 2;
        c.position.set((x0 + x1) / 2, 8.25 - (dx === 0 ? 0.25 : 0), pz + dx * 0.15);
        world.add(c);
      }
    }
  }

  // ---------------------------------------------------------------- vegetation
  function bushBall(x, y, z, r) {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.85, 1), M.leafCore);
    core.position.set(x, y, z); core.castShadow = true; world.add(core);
    for (let i = 0; i < 6; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), M.leaves);
      card.position.set(x + rnd(-0.2, 0.2) * r, y + rnd(-0.2, 0.2) * r, z + rnd(-0.2, 0.2) * r);
      card.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), rnd(0, Math.PI));
      card.castShadow = true;
      world.add(card);
    }
  }
  function bush(x, z, s) {
    for (let i = 0; i < 6; i++) bushBall(x + rnd(-0.6, 0.6) * s, rnd(0.5, 1.4) * s, z + rnd(-0.4, 0.4) * s, rnd(0.45, 0.7) * s);
    collider(x - 0.8 * s, x + 0.8 * s, 0, 1.7 * s, z - 0.55 * s, z + 0.55 * s);
  }
  bush(-10.4, 0.9, 1.1);
  bush(-14, 1.0, 0.9);
  bush(12.6, -5.2, 0.6);

  function palm(x, z, h) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.3, h * 0.4, z),
      new THREE.Vector3(x + 0.1, h * 0.75, z), new THREE.Vector3(x - 0.2, h, z),
    ]);
    const tg = new THREE.TubeGeometry(curve, 30, 0.17, 12);
    scaleUV(tg, 6, 1);
    const trunk = new THREE.Mesh(tg, M.trunk);
    trunk.castShadow = true; world.add(trunk);
    const top = curve.getPoint(1);
    for (let i = 0; i < 14; i++) {
      const L = rnd(2.6, 3.4);
      const geo = new THREE.PlaneGeometry(1.1, L, 1, 12);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k) + L / 2, f = y / L;
        pos.setXYZ(k, pos.getX(k) * (1 - f * 0.55), y * 0.9, -f * f * L * 0.75 + Math.abs(pos.getX(k)) * 0.25);
      }
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, M.palm);
      leaf.position.copy(top);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = (i / 14) * Math.PI * 2 + rnd(-0.2, 0.2);
      leaf.rotation.x = rnd(-1.3, -0.55);
      leaf.castShadow = true;
      world.add(leaf);
    }
    collider(x - 0.25, x + 0.4, 0, h, z - 0.25, z + 0.25);
  }
  palm(14.6, -8.5, 7.2);
  palm(22, -12, 6.2);

  function tree(x, z, s) {
    cyl(0.12 * s, 0.18 * s, 2.4 * s, M.trunk, x, 1.2 * s, z, 8);
    for (let i = 0; i < 6; i++) bushBall(x + rnd(-0.9, 0.9) * s, (2.7 + rnd(0, 1.3)) * s, z + rnd(-0.9, 0.9) * s, rnd(0.9, 1.4) * s);
  }
  tree(-4, -20, 1.4); tree(6, -22, 1.6); tree(17, -24, 1.3); tree(-18, -24, 1.5); tree(28, -10, 1.2);

  // ---------------------------------------------------------------- neighbours
  function hipRoof(x0, x1, z0, z1, y0, h, mat) {
    const hz = (z1 - z0) / 2, zm = (z0 + z1) / 2;
    const r0 = x0 + hz, r1 = x1 - hz;
    const A = [x0, y0, z1], B = [x1, y0, z1], C = [x1, y0, z0], D = [x0, y0, z0];
    const R0 = [r0, y0 + h, zm], R1 = [r1, y0 + h, zm];
    const faces = [[A, B, R1, R0], [C, D, R0, R1], [B, C, R1], [D, A, R0]];
    const pos = [], uv = [];
    const slopeLen = Math.hypot(hz, h);
    for (const f of faces) {
      const e0 = new THREE.Vector3(...f[0]), e1 = new THREE.Vector3(...f[1]);
      const ax = e1.clone().sub(e0).normalize();
      const toUV = (p) => {
        const v = new THREE.Vector3(...p).sub(e0);
        return [v.dot(ax) / 1.5, ((p[1] - y0) / h) * slopeLen / 1.5];
      };
      const tris = f.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
      for (const t of tris) for (const k of t) { pos.push(...f[k]); uv.push(...toUV(f[k])); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    world.add(m);
    return m;
  }

  boxAt(-20, -10, 0, 2.75, -15, -3.5, M.neighbor);
  decal(-20, -10, 0, 0.9, -3.5, M.grime);
  hipRoof(-20.5, -9.5, -15.5, -3.0, 2.75, 1.7, M.tiles);
  collider(-20.5, -9.5, 2.75, 3.3, -15.5, -3.0);
  collider(-18.5, -11.5, 3.3, 4.0, -13.5, -5.0);
  boxAt(-20, -10, 2.4, 2.5, -3.5, -1.2, M.tiles, { uv: 2 });
  boxAt(-10.4, -10.2, 0, 2.4, -1.4, -1.2, M.wood, { uv: 1.2 });
  boxAt(-16.5, -15.2, 0.9, 2.1, -3.5, -3.45, M.shutterBack, { uv: 0, collide: false });
  boxAt(-13, -11.6, 0.9, 2.1, -3.5, -3.45, M.shutterBack, { uv: 0, collide: false });

  boxAt(14.5, 25, 0, 3.0, -18, -7, M.neighbor2);
  boxAt(14.4, 25.1, 3.0, 3.12, -18.1, -6.9, M.cap, { uv: 1 });
  decal(14.5, 25, 0, 0.9, -7, M.grime);
  for (const x of [16.5, 20, 23]) boxAt(x, x + 1.2, 1.0, 2.1, -7, -6.95, M.shutterBack, { uv: 0, collide: false });

  boxAt(-9.1, 13.5, 0, 1.8, -16.2, -16, M.white, { uv: 2 });           // back wall of the lot
  collider(BOUNDS.minX - 1, BOUNDS.maxX + 1, 0, 3, BOUNDS.minZ - 1, BOUNDS.minZ, false, true);

  const far = ['#e8c9a0', '#cfd8dc', '#f1e3b5', '#d7b8a8', '#e3e0d5', '#bcc7a8'];
  for (let i = 0; i < 9; i++) {
    const x0 = -40 + i * 9.5, w = rnd(6, 8.5), h = rnd(2.8, 4.2), z0 = rnd(-34, -28);
    boxAt(x0, x0 + w, 0, h, z0 - 8, z0, stucco(far[i % far.length]), { collide: false });
    if (i % 2) hipRoof(x0 - 0.3, x0 + w + 0.3, z0 - 8.3, z0 + 0.3, h, 1.5, M.tiles);
  }
  // houses across the street (behind the player)
  for (let i = 0; i < 7; i++) {
    const x0 = -36 + i * 11, w = rnd(7, 9.5), h = rnd(2.8, 3.4);
    boxAt(x0, x0 + w, 0, h, 19, 27, stucco(far[(i + 3) % far.length]), { collide: false });
    hipRoof(x0 - 0.3, x0 + w + 0.3, 18.7, 27.3, h, 1.4, M.tiles);
    boxAt(x0 + 1, x0 + 2.3, 1.0, 2.2, 18.95, 19, M.shutterBack, { uv: 0, collide: false });
    boxAt(x0 + w - 2.3, x0 + w - 1, 1.0, 2.2, 18.95, 19, M.shutterBack, { uv: 0, collide: false });
  }
  collider(BOUNDS.minX - 1, BOUNDS.maxX + 1, 0, 3, BOUNDS.maxZ, BOUNDS.maxZ + 1, false, true);
  collider(BOUNDS.minX - 1, BOUNDS.minX, 0, 3, BOUNDS.minZ, BOUNDS.maxZ, false, true);
  collider(BOUNDS.maxX, BOUNDS.maxX + 1, 0, 3, BOUNDS.minZ, BOUNDS.maxZ, false, true);

  // clouds
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloud, transparent: true, depthWrite: false, fog: false, opacity: rnd(0.7, 0.95) }));
    const a = rnd(-1.6, 1.6) + (i % 2 ? Math.PI : 0);
    s.position.set(Math.sin(a) * 140, rnd(38, 60), -Math.cos(a) * 140);
    s.scale.set(rnd(40, 70), rnd(14, 22), 1);
    world.add(s);
  }

  // ---------------------------------------------------------------- foam spots for the global soap level
  for (let x = -4.1; x < 11.4; x += 0.32) {
    const z = x < 4 ? -5.88 : x < 5.3 ? -5.62 : -6.08;
    spot(x + rnd(-0.1, 0.1), 0.05, z + rnd(0, 0.25), 0, 1, 0, rnd(0.35, 0.6));
  }
  for (let x = -4.1; x < 4; x += 0.4) spot(x, 3.42, -6.0, 0, 1, 0, rnd(0.25, 0.42));
  for (let x = 5.4; x < 11.5; x += 0.4) spot(x, 3.52, -6.2, 0, 1, 0, rnd(0.25, 0.42));
  for (let x = 5.4; x < 11.5; x += 0.45) spot(x, 2.95, -5.7, 0, 1, 0, rnd(0.2, 0.32));
  for (let x = 4.1; x < 5.3; x += 0.35) spot(x, 4.47, -5.85, 0, 1, 0, 0.3);
  for (let i = 0; i < 60; i++) spot(rnd(-9, 13.3), 0.03, rnd(-5.8, -0.3), 0, 1, 0, rnd(0.35, 0.75));
  for (let i = 0; i < 40; i++) spot(rnd(-9, 13.3), 0.13, rnd(0.15, 0.9), 0, 1, 0, rnd(0.25, 0.5));
  for (let i = 0; i < 30; i++) spot(rnd(-4, 11.3), 3.3, rnd(-13.5, -7), 0, 1, 0, rnd(0.4, 0.8));
  foamSpots.forEach((s) => { s.thr = Math.pow(Math.random(), 0.9) * 0.97; });

  for (let i = 0; i < 70; i++) emitters.push({ p: new THREE.Vector3(rnd(-4, 3.9), rnd(0.2, 3.2), -5.9), n: new THREE.Vector3(0, 0, 1) });
  for (let i = 0; i < 50; i++) emitters.push({ p: new THREE.Vector3(rnd(5.4, 11.4), rnd(0.2, 3.3), -6.1), n: new THREE.Vector3(0, 0, 1) });
  for (let i = 0; i < 40; i++) emitters.push({ p: new THREE.Vector3(rnd(-4, 11.4), 3.55, rnd(-13, -6.3)), n: new THREE.Vector3(0, 1, 0) });

  return { world, colliders, foamSpots, emitters };
}
