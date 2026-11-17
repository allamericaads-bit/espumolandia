// Builds the street, the house (based on the reference photos) and the neighbourhood.
// Coordinates: metres. +z points to the street (where the player stands), facade at z = -6.
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

export function groundHeight(x, z) {
  if (z >= 0 && z < 2.6) return 0.12;       // sidewalk
  if (z >= 2.6 && z < 2.75) return 0.15;    // curb
  if (z < 0 && z > -6.05 && x > -9.1 && x < 13.5) return 0.02; // lot floor
  return 0;
}

export function buildWorld(scene, T) {
  const world = new THREE.Group();
  scene.add(world);
  const colliders = [];
  const foamSpots = [];
  const emitters = [];

  const std = (map, color, extra = {}) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: 0.92, metalness: 0, ...extra });

  const M = {
    wallL: std(T.stucco, '#ecd3b1'),
    wallR: std(T.stucco, '#ecdc9e'),
    column: std(T.stucco, '#a67d6b'),
    cap: std(T.stucco, '#f4e6cf'),
    frame: std(T.stucco, '#efe4d2'),
    shutter: new THREE.MeshStandardMaterial({ map: T.shutter, color: '#86593a', roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ map: T.door, color: '#6a4529', roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.9 }),
    wood: std(T.wood, '#9c7a55'),
    woodLight: std(T.wood, '#b89a74'),
    fiber: std(T.corrugated, '#b2b0a6', { roughness: 0.85 }),
    concrete: std(T.concrete, '#ffffff'),
    pavers: std(T.pavers, '#ffffff'),
    grass: std(T.grass, '#ffffff'),
    asphalt: std(T.asphalt, '#ffffff', { roughness: 0.95 }),
    white: std(T.stucco, '#f6f4ef'),
    post: std(T.stucco, '#c9a99a'),
    pipe: new THREE.MeshStandardMaterial({ color: '#b7a091', roughness: 0.6 }),
    neighborWall: std(T.stucco, '#a9b3bd'),
    neighborWall2: std(T.stucco, '#d8d2c4'),
    tiles: std(T.tiles, '#ffffff', { roughness: 0.7 }),
    wire: new THREE.MeshStandardMaterial({ map: T.wire, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f6d2c', roughness: 0.8, flatShading: true }),
    palm: new THREE.MeshStandardMaterial({ map: T.palm, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }),
    trunk: std(T.wood, '#8a7a62'),
    dish: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, side: THREE.DoubleSide }),
    pot: new THREE.MeshStandardMaterial({ color: '#2f2a26', roughness: 0.8 }),
    toyBlue: new THREE.MeshStandardMaterial({ color: '#2459d8', roughness: 0.5 }),
    toyPink: new THREE.MeshStandardMaterial({ color: '#ff6f96', roughness: 0.5 }),
  };

  function boxAt(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    if (o.uv !== 0) worldUV(geo, w, h, d, o.uv ?? 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = true;
    (o.parent || world).add(m);
    if (o.collide !== false) colliders.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
    return m;
  }

  const spot = (x, y, z, nx, ny, nz, r) => foamSpots.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, nz), r, thr: 0 });

  // ---------- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), M.grass);
  ground.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 60; });
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  boxAt(-60, 60, -0.01, 0.12, 0, 2.6, M.pavers, { collide: false, uv: 1.6, cast: false });     // sidewalk
  boxAt(-60, 60, -0.01, 0.15, 2.6, 2.75, M.concrete, { collide: false, uv: 2, cast: false });  // curb
  boxAt(-60, 60, -0.02, 0.01, 2.75, 14, M.asphalt, { collide: false, uv: 4, cast: false });    // street
  boxAt(-9.1, 13.5, -0.01, 0.02, -6.05, 0, M.concrete, { collide: false, uv: 2.5, cast: false });
  boxAt(-9.1, -4.2, -0.01, 0.02, -14, -6.05, M.concrete, { collide: false, uv: 2.5, cast: false });
  // the other sidewalk across the street
  boxAt(-60, 60, -0.01, 0.12, 14, 17, M.pavers, { collide: false, uv: 1.6, cast: false });

  // ---------- main house: left block (beige)
  boxAt(-4.2, 4.0, 0, 3.3, -14, -6, M.wallL);
  boxAt(-4.28, 4.0, 3.3, 3.4, -14.05, -5.94, M.cap);                 // parapet cap
  boxAt(-4.2, 4.0, 0, 0.18, -6.0, -5.95, M.column, { uv: 1 });         // dirty skirting
  // brown/rose column with downpipes
  boxAt(4.0, 5.3, 0, 4.3, -14, -5.75, M.column);
  boxAt(3.95, 5.35, 4.3, 4.38, -14.05, -5.7, M.cap);
  for (const x of [5.42, 5.6]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.1, 10), M.pipe);
    p.position.set(x, 2.05, -5.85); p.castShadow = true; world.add(p);
    colliders.push({ min: [x - 0.06, 0, -5.91], max: [x + 0.06, 4.1, -5.79] });
  }
  // right block (yellow)
  boxAt(5.3, 11.5, 0, 3.4, -14, -6.2, M.wallR);
  boxAt(5.3, 11.58, 3.4, 3.48, -14.05, -6.14, M.cap);
  boxAt(5.3, 11.5, 2.82, 2.92, -6.2, -5.65, M.frame);                 // small concrete eave
  boxAt(5.3, 11.5, 0, 0.18, -6.2, -6.15, M.column, { uv: 1 });

  function windowAt(cx, y0, w, h, z) {
    boxAt(cx - w / 2 - 0.09, cx + w / 2 + 0.09, y0 - 0.09, y0 + h + 0.09, z, z + 0.03, M.frame, { uv: 1 });
    boxAt(cx - w / 2, cx + w / 2, y0, y0 + h, z + 0.03, z + 0.08, M.shutter, { uv: 0 });
    boxAt(cx - w / 2 - 0.14, cx + w / 2 + 0.14, y0 - 0.12, y0 - 0.04, z, z + 0.16, M.cap, { uv: 1 });
    for (let i = 0; i < 4; i++) spot(cx + rnd(-w / 2, w / 2), y0 - 0.03, z + 0.09, 0, 1, 0, rnd(0.12, 0.2));
  }
  windowAt(-1.7, 1.05, 1.2, 1.3, -6);
  windowAt(1.35, 1.05, 1.2, 1.3, -6);
  boxAt(2.75, 3.75, 0, 2.15, -6, -5.94, M.door, { uv: 0 });
  boxAt(2.68, 3.82, 2.15, 2.24, -6, -5.92, M.frame, { uv: 1 });
  windowAt(7.0, 1.0, 1.3, 1.25, -6.2);
  windowAt(9.65, 1.0, 1.3, 1.25, -6.2);
  // little wall lamp + meter box
  boxAt(-3.3, -3.0, 1.9, 2.15, -6, -5.88, M.frame, { uv: 1 });

  // satellite dish on the right block
  {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), M.pipe);
    pole.position.y = 0.4; g.add(pole);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, 0.65), M.dish);
    dish.rotation.set(-1.1, 0, 0.5); dish.position.set(0, 0.85, 0.05); dish.castShadow = true; g.add(dish);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), M.pipe);
    arm.position.set(0.05, 0.85, 0.25); arm.rotation.x = 1.1; g.add(arm);
    g.position.set(6.1, 3.48, -7.0); world.add(g);
    colliders.push({ min: [5.7, 3.48, -7.4], max: [6.5, 4.3, -6.6] });
  }

  // ---------- pergola / carport with fibre-cement roof
  const yF = 2.5, yB = 2.86, zF = 0.0, zB = -5.95;
  for (const x of [-9.1, -4.3, 2.9]) boxAt(x - 0.09, x + 0.09, 0, yF, -0.09, 0.09, M.wood, { uv: 1 });
  boxAt(-9.19, -9.01, 0, yB, -5.94, -5.76, M.wood, { uv: 1 });
  boxAt(-9.3, 3.1, yF - 0.2, yF, -0.11, 0.11, M.wood, { uv: 1.2 });
  boxAt(-9.3, 3.1, yB - 0.2, yB, -5.95, -5.75, M.wood, { uv: 1.2, collide: false });
  const slope = Math.atan2(yB - yF, zF - zB);
  const len = Math.hypot(zF - zB + 0.5, yB - yF);
  for (let x = -9.1; x <= 3.0; x += 1.0) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, len), M.wood);
    r.position.set(x, (yF + yB) / 2 - 0.02, (zF + zB) / 2 + 0.1);
    r.rotation.x = slope; r.castShadow = true; r.receiveShadow = true; world.add(r);
  }
  {
    const w = 12.6, geo = new THREE.BoxGeometry(w, 0.035, len + 0.2);
    worldUV(geo, w, 0.035, len + 0.2, 0.9);
    const roof = new THREE.Mesh(geo, M.fiber);
    roof.position.set(-3.1, (yF + yB) / 2 + 0.08, (zF + zB) / 2 + 0.15);
    roof.rotation.x = slope; roof.castShadow = true; roof.receiveShadow = true; world.add(roof);
    // stepped colliders approximating the slope
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const za = 0.4 - (i / steps) * 6.4, zb = 0.4 - ((i + 1) / steps) * 6.4;
      const yTop = yF + 0.1 + (yB - yF) * ((0.4 - (za + zb) / 2) / 6.4);
      colliders.push({ min: [-9.4, yTop - 0.06, zb], max: [3.2, yTop, za] });
      for (let k = 0; k < 7; k++) spot(rnd(-9.2, 3.0), yTop, rnd(zb, za), 0, 1, 0, rnd(0.3, 0.55));
    }
    for (let k = 0; k < 20; k++) emitters.push({ p: new THREE.Vector3(rnd(-9, 3), yF + 0.25, rnd(-5, 0.2)), n: new THREE.Vector3(0, 1, 0) });
  }

  // ---------- fences
  // wooden board fence on the left (towards the neighbour)
  boxAt(-9.16, -9.04, 0, 1.9, -14, -0.12, M.woodLight, { uv: 1.5 });
  // front masonry posts
  for (const x of [5.95, 9.7, 13.4]) {
    boxAt(x - 0.16, x + 0.16, 0, 1.78, -0.16, 0.16, M.post, { uv: 1 });
    spot(x, 1.78, 0, 0, 1, 0, 0.25);
  }
  boxAt(3.05, 3.25, 0, 1.7, -0.1, 0.1, M.wood, { uv: 1 });
  const panels = [[-9.0, -4.4, false], [-4.2, 2.8, false], [3.25, 5.79, true], [6.11, 9.54, true], [9.86, 13.24, true]];
  for (const [a, b, grid] of panels) {
    const w = b - a;
    const geo = new THREE.PlaneGeometry(w, 1.5);
    geo.attributes.uv.array.forEach((v, i, arr) => { arr[i] = i % 2 === 0 ? v * w / 0.5 : v * 1.5 / 0.5; });
    const mesh = new THREE.Mesh(geo, M.wire);
    mesh.position.set((a + b) / 2, 0.85, 0);
    world.add(mesh);
    boxAt(a, b, 0.04, 0.12, -0.04, 0.04, M.wood, { uv: 1, collide: false });
    boxAt(a, b, 1.56, 1.64, -0.05, 0.05, M.wood, { uv: 1, collide: false });
    if (grid) {
      for (const y of [0.6, 1.1]) boxAt(a, b, y - 0.04, y + 0.04, 0.02, 0.09, M.wood, { uv: 1, collide: false });
      for (let x = a + 0.7; x < b - 0.3; x += 0.85) boxAt(x - 0.04, x + 0.04, 0.12, 1.56, 0.02, 0.09, M.wood, { uv: 1, collide: false });
    }
    for (let x = a + 0.2; x < b; x += 0.45) spot(x, 1.64, 0, 0, 1, 0, rnd(0.12, 0.2));
  }
  // side fence on the right
  boxAt(13.45, 13.55, 0, 1.6, -14, -0.2, M.woodLight, { uv: 1.5 });

  // white wall + plant pots in the right yard
  boxAt(6.2, 8.4, 0, 1.95, -2.35, -2.1, M.white, { uv: 1.5 });
  spot(7.3, 1.95, -2.2, 0, 1, 0, 0.3);
  for (const [x, z] of [[6.7, -1.85], [7.55, -1.8], [8.0, -1.95]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 14), M.pot);
    pot.position.set(x, 0.15, z); pot.castShadow = true; world.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), M.leaf);
    plant.position.set(x, 0.42, z); plant.scale.y = 0.8; plant.castShadow = true; world.add(plant);
    colliders.push({ min: [x - 0.25, 0, z - 0.25], max: [x + 0.25, 0.6, z + 0.25] });
  }

  // small wooden porch roof in front of the right block
  for (const x of [13.2]) boxAt(x - 0.08, x + 0.08, 0, 2.62, -3.6, -3.44, M.wood, { uv: 1 });
  boxAt(9.4, 13.4, 2.6, 2.74, -6.2, -3.4, M.wood, { uv: 1.2 });
  for (let k = 0; k < 6; k++) spot(rnd(9.5, 13.3), 2.74, rnd(-6, -3.5), 0, 1, 0, rnd(0.25, 0.4));

  // kid toys in the garage (from the photo)
  boxAt(-7.7, -7.25, 0, 0.85, -1.7, -1.25, M.toyBlue, { uv: 1 });
  {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 14), M.toyPink);
    cone.position.set(-6.6, 0.3, -1.5); cone.castShadow = true; world.add(cone);
    colliders.push({ min: [-6.8, 0, -1.7], max: [-6.4, 0.6, -1.3] });
  }

  // ---------- vegetation
  function bush(x, z, s) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.45, 0.7) * s, 1), M.leaf);
      m.position.set(x + rnd(-0.6, 0.6) * s, rnd(0.4, 1.3) * s, z + rnd(-0.4, 0.4) * s);
      m.castShadow = true; m.receiveShadow = true; world.add(m);
    }
    colliders.push({ min: [x - 0.9 * s, 0, z - 0.6 * s], max: [x + 0.9 * s, 1.7 * s, z + 0.6 * s] });
  }
  bush(-10.4, 0.9, 1.1);
  bush(-14, 1.0, 0.9);

  function palm(x, z, h) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.3, h * 0.4, z),
      new THREE.Vector3(x + 0.1, h * 0.75, z), new THREE.Vector3(x - 0.2, h, z),
    ]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.17, 10), M.trunk);
    trunk.castShadow = true; world.add(trunk);
    const top = curve.getPoint(1);
    for (let i = 0; i < 12; i++) {
      const L = rnd(2.4, 3.2);
      const geo = new THREE.PlaneGeometry(0.9, L, 1, 10);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k) + L / 2, f = y / L;
        pos.setXYZ(k, pos.getX(k) * (1 - f * 0.5), y * 0.9, -f * f * L * 0.7);
      }
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, M.palm);
      leaf.position.copy(top);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = (i / 12) * Math.PI * 2 + rnd(-0.2, 0.2);
      leaf.rotation.x = rnd(-1.25, -0.65);
      leaf.castShadow = true;
      world.add(leaf);
    }
    colliders.push({ min: [x - 0.25, 0, z - 0.25], max: [x + 0.4, h, z + 0.25] });
  }
  palm(14.6, -8.5, 7.2);
  palm(22, -12, 6.2);

  function tree(x, z, s) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2.4 * s, 8), M.trunk);
    t.position.set(x, 1.2 * s, z); t.castShadow = true; world.add(t);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.0, 1.5) * s, 1), M.leaf);
      m.position.set(x + rnd(-0.8, 0.8) * s, (2.6 + rnd(0, 1.2)) * s, z + rnd(-0.8, 0.8) * s);
      m.castShadow = true; world.add(m);
    }
  }
  tree(-4, -20, 1.4); tree(6, -22, 1.6); tree(17, -24, 1.3); tree(-18, -24, 1.5); tree(28, -10, 1.2);

  // ---------- neighbours
  // left neighbour: blue-grey house with dark tiled hip roof
  boxAt(-20, -10, 0, 2.75, -15, -3.5, M.neighborWall);
  {
    const geo = new THREE.ConeGeometry(1, 1, 4);
    geo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(geo, M.tiles);
    roof.scale.set(5.6 * Math.SQRT2, 1.9, 6.3 * Math.SQRT2);
    roof.position.set(-15, 2.75 + 0.95, -9.25);
    roof.castShadow = true; roof.receiveShadow = true; world.add(roof);
    colliders.push({ min: [-20.5, 2.75, -15.5], max: [-9.5, 3.4, -3.0] });
    colliders.push({ min: [-18.5, 3.4, -13.5], max: [-11.5, 4.2, -5.0] });
    // its little front porch roof
    boxAt(-20, -10, 2.4, 2.5, -3.5, -1.2, M.tiles, { uv: 2 });
    boxAt(-10.4, -10.2, 0, 2.4, -1.4, -1.2, M.wood, { uv: 1 });
  }
  // right neighbour
  boxAt(14.5, 25, 0, 3.0, -18, -7, M.neighborWall2);
  boxAt(14.4, 25.1, 3.0, 3.1, -18.1, -6.9, M.cap);
  // back wall of the lot
  boxAt(-9.1, 13.5, 0, 1.8, -16.2, -16, M.white, { uv: 2 });
  // distant houses
  const far = ['#e8c9a0', '#cfd8dc', '#f1e3b5', '#d7b8a8', '#e3e0d5', '#bcc7a8'];
  for (let i = 0; i < 9; i++) {
    const x0 = -40 + i * 9.5, w = rnd(6, 8.5), h = rnd(2.8, 4.5), z0 = rnd(-34, -28);
    boxAt(x0, x0 + w, 0, h, z0 - 8, z0, std(T.stucco, far[i % far.length]), { collide: false });
  }
  // houses across the street (behind the player, seen when rotating)
  for (let i = 0; i < 7; i++) {
    const x0 = -36 + i * 11, w = rnd(7, 9.5);
    boxAt(x0, x0 + w, 0, rnd(2.8, 3.6), 19, 27, std(T.stucco, far[(i + 3) % far.length]), { collide: false });
  }

  // ---------- foam spots for the progressive "soap level" (base, parapets, roof)
  for (let x = -4.1; x < 11.4; x += 0.32) {
    const z = x < 4 ? -5.88 : x < 5.3 ? -5.65 : -6.08;
    spot(x + rnd(-0.1, 0.1), 0.05, z + rnd(0, 0.25), 0, 1, 0, rnd(0.35, 0.6));
  }
  for (let x = -4.1; x < 4; x += 0.4) spot(x, 3.4, -6.0, 0, 1, 0, rnd(0.25, 0.42));
  for (let x = 5.4; x < 11.5; x += 0.4) spot(x, 3.48, -6.2, 0, 1, 0, rnd(0.25, 0.42));
  for (let x = 5.4; x < 11.5; x += 0.45) spot(x, 2.92, -5.75, 0, 1, 0, rnd(0.2, 0.32));
  for (let x = 4.1; x < 5.3; x += 0.35) spot(x, 4.38, -5.85, 0, 1, 0, 0.3);
  for (let i = 0; i < 60; i++) spot(rnd(-9, 13.3), 0.03, rnd(-5.8, -0.3), 0, 1, 0, rnd(0.35, 0.75));
  for (let i = 0; i < 40; i++) spot(rnd(-9, 13.3), 0.13, rnd(0.15, 0.9), 0, 1, 0, rnd(0.25, 0.5));
  for (let i = 0; i < 30; i++) spot(rnd(-4, 11.3), 3.3, rnd(-13.5, -7), 0, 1, 0, rnd(0.4, 0.8));
  // thresholds: the soap level at which each spot appears
  foamSpots.forEach((s) => { s.thr = Math.pow(Math.random(), 0.9) * 0.97; });

  // ---------- ambient bubble emitters on the facades and roofs
  for (let i = 0; i < 70; i++) emitters.push({ p: new THREE.Vector3(rnd(-4, 3.9), rnd(0.2, 3.2), -5.9), n: new THREE.Vector3(0, 0, 1) });
  for (let i = 0; i < 50; i++) emitters.push({ p: new THREE.Vector3(rnd(5.4, 11.4), rnd(0.2, 3.3), -6.1), n: new THREE.Vector3(0, 0, 1) });
  for (let i = 0; i < 40; i++) emitters.push({ p: new THREE.Vector3(rnd(-4, 11.4), 3.5, rnd(-13, -6.3)), n: new THREE.Vector3(0, 1, 0) });

  return { world, colliders, foamSpots, emitters };
}
