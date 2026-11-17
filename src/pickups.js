// Special soap weapons that appear at random spots and can be used a limited number of times.
// The spawn schedule is derived from the clock, so every player sees the same weapon in the same
// place at the same time without a server; whoever grabs it first tells the others (multiplayer).
import * as THREE from 'three';

export const SPECIALS = {
  bazuca: { name: 'Bazuca de Sabão', short: 'Bazuca', icon: '🚀', ammo: 3, cd: 1.1, color: '#ff4fa3' },
  doze: { name: '12 de Sabão', short: '12', icon: '💥', ammo: 6, cd: 0.75, color: '#ffb02e' },
  ak: { name: 'AK de Sabão', short: 'AK', icon: '🔫', ammo: 40, cd: 0.1, color: '#2ec27e' },
};
const TYPES = Object.keys(SPECIALS);

const SLOT_MS = 15000;     // a new weapon every 15 s
const LIFE_MS = 75000;     // stays for 75 s if nobody takes it

// spots on the street, sidewalk, yard, garage and even on the roofs (jetpack!)
const SPOTS = [
  [0, 8, 'na rua'], [6.5, 9.2, 'na rua'], [-6, 9.4, 'na rua'], [12.5, 6.5, 'na rua'], [-14.5, 5.2, 'perto da piscina'],
  [1.8, 1.4, 'na calçada'], [-11.5, 1.6, 'na calçada'], [-7, -2.6, 'na garagem'], [-6.6, -11.8, 'no fundo da garagem'],
  [10.8, -2.8, 'no quintal'], [7.3, -1.1, 'no quintal'], [0.2, -3.6, 'no quintal da frente'],
  [-1, null, 'em cima da casa', -10], [8.4, null, 'no telhado amarelo', -10.5], [4.6, null, 'no topo da coluna', -9],
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.font = '800 54px "Baloo 2", system-ui, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = color;
  g.beginPath();
  if (g.roundRect) g.roundRect((512 - w) / 2, 14, w, 84, 42); else g.rect((512 - w) / 2, 14, w, 84);
  g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 58, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.5, 0.33, 1);
  return sp;
}

export function createPickups({ scene, colliders, groundHeight, makeModel, onSpawn }) {
  const live = new Map();   // id -> pickup
  const taken = new Set();  // ids picked by anyone
  let lastSlot = null;

  const heightAt = (x, z) => {
    let g = groundHeight(x, z);
    for (const c of colliders) {
      if (!c.solid || x < c.min[0] || x > c.max[0] || z < c.min[2] || z > c.max[2]) continue;
      if (c.max[1] > g && c.max[1] < 6) g = c.max[1];
    }
    return g;
  };

  function make(id) {
    const rng = mulberry32(id * 2654435761);
    const type = TYPES[Math.floor(rng() * TYPES.length)];
    // 7 and the number of spots share no factor, so weapons alive at the same time never share a spot
    const spot = SPOTS[(id * 7) % SPOTS.length];
    const x = spot[0], z = spot[1] ?? spot[3];
    const y = spot[1] === null ? heightAt(x, z) : groundHeight(x, z); // roofs vs. ground (not on top of the carport)
    const def = SPECIALS[type];
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // glowing pad, beam of light and the floating weapon
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 28), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.5, roughness: 0.4 }));
    pad.position.y = 0.04;
    g.add(pad);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3;
    g.add(beam);
    const model = makeModel(type);
    model.scale.setScalar(1.6);
    model.position.y = 0.95;
    g.add(model);
    const tag = label(`${def.icon} ${def.short}`, def.color);
    tag.position.y = 1.75;
    g.add(tag);
    scene.add(g);
    return { id, type, g, model, x, y, z, where: spot[2], born: id * SLOT_MS };
  }

  function remove(id) {
    const p = live.get(id);
    if (!p) return;
    scene.remove(p.g);
    p.g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
    });
    live.delete(id);
  }

  // returns the type picked up this frame (or null)
  function update(dt, player, canPick) {
    const now = Date.now();
    const slot = Math.floor(now / SLOT_MS);
    for (let id = slot - Math.ceil(LIFE_MS / SLOT_MS) + 1; id <= slot; id++) {
      if (!live.has(id) && !taken.has(id)) {
        const p = make(id);
        live.set(id, p);
        if (lastSlot !== null && id > lastSlot) onSpawn?.(p);
      }
    }
    lastSlot = slot;
    let picked = null;
    for (const [id, p] of live) {
      if (now - p.born > LIFE_MS || taken.has(id)) { remove(id); continue; }
      const t = now / 1000 + id;
      p.model.rotation.y = t * 1.6;
      p.model.position.y = 0.95 + Math.sin(t * 2.2) * 0.12;
      if (!picked && canPick) {
        const dx = player.pos.x - p.x, dz = player.pos.z - p.z, dy = player.pos.y - p.y;
        if (dx * dx + dz * dz < 1.1 * 1.1 && dy > -0.5 && dy < 1.6) {
          taken.add(id);
          remove(id);
          picked = { id, type: p.type };
        }
      }
    }
    return picked;
  }

  function markTaken(id) {
    if (!Number.isInteger(id)) return;
    taken.add(id);
    remove(id);
  }

  return { update, markTaken, recentTaken: () => [...taken].slice(-20), live };
}
