// Procedural textures (drawn on <canvas>) so the game needs no image assets.
// Most surfaces get a colour map plus a bump map drawn from the same canvas.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { clamp = false, color = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}
// colour map + bump map that share one canvas
function pair(w, h, draw, opts) {
  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  return { map: tex(c, opts), bump: tex(c, { ...opts, color: false }) };
}
function single(w, h, draw, opts) {
  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  return tex(c, opts);
}

// wrap-around drawing helper so tiles have no seams
function wrapDraw(w, h, x, y, r, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
    fn(x + dx, y + dy);
  }
}
function speckle(g, w, h, n, dark, light, s0, s1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * dark})` : `rgba(255,255,255,${Math.random() * light})`;
    const s = rnd(s0, s1);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
function blotches(g, w, h, n, rgb, r0, r1, a) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rnd(r0, r1), al = Math.random() * a;
    wrapDraw(w, h, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(${rgb},${al})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}
function foamBlob(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.65, 'rgba(246,249,255,0.96)');
  gr.addColorStop(1, 'rgba(215,225,240,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function bubbleRing(g, x, y, r) {
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = Math.max(1, r * 0.12);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); g.fill();
}

export function createTextures() {
  const T = {};

  // Painted render ("reboco com textura") – light, tinted per material
  T.stucco = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#ece6dc'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, '120,100,80', 30, 110, 0.07);
    blotches(g, w, h, 30, '255,255,255', 20, 80, 0.12);
    // trowel strokes
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * w, y = Math.random() * h, len = rnd(20, 70);
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${rnd(0.02, 0.06)})`;
      g.lineWidth = rnd(3, 9);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y + rnd(-8, 8), x + len, y + rnd(-5, 5)); g.stroke();
    }
    // fine grain (chapisco)
    speckle(g, w, h, 60000, 0.16, 0.14, 0.6, 1.8);
    speckle(g, w, h, 4000, 0.25, 0.2, 1.5, 3);
  });

  // dark grime at the bottom of walls (used on a transparent decal strip)
  T.grime = single(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(70,55,40,0)');
    gr.addColorStop(0.55, 'rgba(70,55,40,0.12)');
    gr.addColorStop(0.85, 'rgba(60,48,35,0.35)');
    gr.addColorStop(1, 'rgba(50,40,30,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, top = rnd(0.3, 0.8) * h;
      const sg = g.createLinearGradient(0, top, 0, h);
      sg.addColorStop(0, 'rgba(60,45,30,0)'); sg.addColorStop(1, `rgba(60,45,30,${rnd(0.05, 0.2)})`);
      g.fillStyle = sg; g.fillRect(x, top, rnd(2, 8), h - top);
    }
  }, { clamp: false });
  T.grime.wrapT = THREE.ClampToEdgeWrapping;

  // rain streaks under parapets
  T.streaks = single(256, 128, (g, w, h) => {
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, len = rnd(0.2, 1) * h, lw = rnd(1, 6);
      const sg = g.createLinearGradient(0, 0, 0, len);
      sg.addColorStop(0, `rgba(70,60,50,${rnd(0.08, 0.28)})`); sg.addColorStop(1, 'rgba(70,60,50,0)');
      g.fillStyle = sg; g.fillRect(x, 0, lw, len);
    }
  });
  T.streaks.wrapT = THREE.ClampToEdgeWrapping;

  // Weathered wood (eucalyptus-like beams and posts)
  T.wood = pair(256, 512, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#8a7259'); base.addColorStop(0.5, '#9a8166'); base.addColorStop(1, '#836b53');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x0 = Math.random() * w;
      g.strokeStyle = Math.random() < 0.7 ? `rgba(55,38,22,${rnd(0.08, 0.3)})` : `rgba(210,195,170,${rnd(0.08, 0.25)})`;
      g.lineWidth = rnd(0.6, 2.4);
      g.beginPath();
      for (let y = 0; y <= h; y += 16) g.lineTo(x0 + Math.sin(y * 0.02 + i) * 3 + Math.sin(y * 0.11 + i * 3) * 1.2, y);
      g.stroke();
    }
    // cracks and knots
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * w, y = Math.random() * h, len = rnd(30, 140);
      g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = rnd(1, 2.2);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-3, 3), y + len); g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.fillStyle = 'rgba(60,40,22,0.6)';
      g.beginPath(); g.ellipse(x, y, rnd(3, 6), rnd(6, 12), 0, 0, Math.PI * 2); g.fill();
    }
    blotches(g, w, h, 20, '170,170,160', 15, 50, 0.18); // grey weathering
    speckle(g, w, h, 8000, 0.15, 0.08, 0.5, 1.5);
  });

  // Dark varnished planks for the door
  T.door = pair(256, 512, (g, w, h) => {
    g.fillStyle = '#5a3a24'; g.fillRect(0, 0, w, h);
    const pw = w / 6;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(${pick(['30,18,8', '90,60,35'])},${rnd(0.1, 0.3)})`;
      g.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 14; k++) {
        const x0 = i * pw + Math.random() * pw;
        g.strokeStyle = `rgba(25,14,6,${rnd(0.1, 0.35)})`; g.lineWidth = rnd(0.5, 1.8);
        g.beginPath();
        for (let y = 0; y <= h; y += 16) g.lineTo(x0 + Math.sin(y * 0.02 + k) * 2, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(10,5,0,0.85)'; g.fillRect(i * pw, 0, 2.5, h);
      g.fillStyle = 'rgba(160,120,80,0.25)'; g.fillRect(i * pw + 2.5, 0, 1.5, h);
    }
    speckle(g, w, h, 3000, 0.12, 0.05, 0.5, 1.4);
  }, { clamp: true });

  // wood slat for venezianas (window shutters)
  T.slat = pair(256, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9c6e48'); gr.addColorStop(0.5, '#7d5435'); gr.addColorStop(1, '#4e321e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(40,22,10,${rnd(0.1, 0.35)})`; g.lineWidth = rnd(0.5, 1.4);
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd(-3, 3), w * 0.6, y + rnd(-3, 3), w, y); g.stroke();
    }
    blotches(g, w, h, 6, '190,180,160', 6, 20, 0.15);
  });

  // fibre-cement sheet (waves come from the geometry)
  T.fiber = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#b4b2aa'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, '80,80,70', 20, 80, 0.12);
    blotches(g, w, h, 30, '95,110,70', 6, 22, 0.25); // lichen
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const sg = g.createLinearGradient(0, 0, 0, h);
      sg.addColorStop(0, 'rgba(60,60,50,0)'); sg.addColorStop(1, `rgba(60,60,50,${rnd(0.05, 0.18)})`);
      g.fillStyle = sg; g.fillRect(x, 0, rnd(4, 14), h);
    }
    speckle(g, w, h, 30000, 0.15, 0.12, 0.6, 1.6);
  });

  // Interlocking concrete pavers (sidewalk)
  T.pavers = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#6f6c66'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 32;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
        const v = Math.round(rnd(150, 192)), tint = rnd(-6, 6);
        g.fillStyle = `rgb(${v + tint},${v - 2},${v - 8 - tint})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 2, y + 2, bw - 4, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 2, y + bh - 4, bw - 4, 2);
      }
    }
    blotches(g, w, h, 25, '50,45,40', 15, 60, 0.15);
    speckle(g, w, h, 30000, 0.18, 0.12, 0.6, 1.8);
  });

  T.concrete = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#c6c2ba'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '90,85,75', 30, 120, 0.1);
    blotches(g, w, h, 20, '255,255,255', 20, 90, 0.1);
    speckle(g, w, h, 40000, 0.14, 0.1, 0.6, 2);
    g.strokeStyle = 'rgba(60,55,50,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(w, 1); g.moveTo(1, 0); g.lineTo(1, h); g.stroke();
    for (let i = 0; i < 3; i++) { // hairline cracks
      let x = Math.random() * w, y = Math.random() * h;
      g.strokeStyle = 'rgba(50,45,40,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += rnd(-12, 12); y += rnd(4, 14); g.lineTo(x, y); }
      g.stroke();
    }
  });

  T.asphalt = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#4f5054'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 20, '30,30,32', 40, 140, 0.18);
    blotches(g, w, h, 12, '120,120,118', 30, 90, 0.08);
    speckle(g, w, h, 70000, 0.3, 0.2, 0.6, 2.2);
  });

  T.grass = pair(512, 512, (g, w, h) => {
    g.fillStyle = '#5f8a37'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '120,140,60', 30, 90, 0.25);
    blotches(g, w, h, 20, '40,70,25', 30, 90, 0.25);
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.strokeStyle = `hsla(${rnd(65, 110)},${rnd(35, 60)}%,${rnd(22, 52)}%,0.85)`;
      g.lineWidth = rnd(0.8, 1.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2.5, 2.5), y - rnd(3, 8)); g.stroke();
    }
  });

  // Dark concrete roof tiles (neighbour)
  T.tiles = pair(256, 256, (g, w, h) => {
    g.fillStyle = '#3e434a'; g.fillRect(0, 0, w, h);
    const rowH = 32, tw = 32;
    for (let r = 0; r < h / rowH; r++) {
      for (let c = 0; c < w / tw; c++) {
        const x = c * tw, y = r * rowH;
        const gr = g.createLinearGradient(x, 0, x + tw, 0);
        const v = rnd(55, 80);
        gr.addColorStop(0, `rgb(${v - 20},${v - 16},${v - 10})`);
        gr.addColorStop(0.5, `rgb(${v + 10},${v + 14},${v + 20})`);
        gr.addColorStop(1, `rgb(${v - 25},${v - 21},${v - 15})`);
        g.fillStyle = gr; g.fillRect(x, y, tw, rowH - 5);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + rowH - 5, tw, 5);
      }
    }
    blotches(g, w, h, 14, '120,120,100', 10, 40, 0.15);
    speckle(g, w, h, 6000, 0.2, 0.12, 0.5, 1.5);
  });

  // Welded wire mesh, rectangular 5 x 10 cm cells (one tile = 0.4 x 0.4 m)
  T.wire = single(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(95,98,100,1)';
    g.lineWidth = 2.2;
    for (let x = 1; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 1; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });

  T.metal = pair(128, 128, (g, w, h) => {
    g.fillStyle = '#d9dcdf'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, 0.08, 0.1, 0.5, 1.4);
  });

  // Foam textures
  T.foam = single(256, 256, (g, w) => {
    const cx = w / 2, cy = w / 2;
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.75) * w * 0.34;
      const r = rnd(10, 34) * (1 - d / (w * 0.52));
      if (r > 3) foamBlob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r);
    }
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.6) * w * 0.4;
      bubbleRing(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(3, 13));
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(0.36, 0.48) * w;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(1, 4), 0, 7); g.fill();
    }
  }, { clamp: true });

  T.drip = single(128, 256, (g, w) => {
    for (let i = 0; i < 9; i++) {
      const x = rnd(18, w - 18), len = rnd(50, 170), lw = rnd(4, 11);
      const gr = g.createLinearGradient(0, 60, 0, 60 + len);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(1, 'rgba(240,246,255,0.7)');
      g.fillStyle = gr;
      g.beginPath();
      if (g.roundRect) g.roundRect(x - lw / 2, 50, lw, len, lw / 2); else g.rect(x - lw / 2, 50, lw, len);
      g.fill();
      g.beginPath(); g.arc(x, 50 + len, lw * 0.75, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.6) * 54;
      const x = 64 + Math.cos(a) * d * 1.05, y = 60 + Math.sin(a) * d * 0.9;
      const r = rnd(10, 26) * (1 - d / 66);
      if (r > 3) foamBlob(g, x, y, r);
    }
    for (let i = 0; i < 30; i++) bubbleRing(g, rnd(14, w - 14), rnd(10, 110), rnd(2.5, 9));
  }, { clamp: true });

  // Bubbly surface for the 3D foam balls (colour + bump)
  T.suds = pair(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f7fb'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.pow(Math.random(), 2) * 16 + 2;
      wrapDraw(w, h, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.75, 'rgba(236,241,248,1)');
        gr.addColorStop(0.92, 'rgba(190,200,215,1)');
        gr.addColorStop(1, 'rgba(190,200,215,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      });
    }
  });

  T.sky = single(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a73d6');
    gr.addColorStop(0.3, '#5ea6ec');
    gr.addColorStop(0.47, '#b9dcf8');
    gr.addColorStop(0.5, '#dcecf8');
    gr.addColorStop(1, '#e8f1f7');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });

  T.cloud = single(256, 128, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = rnd(0.2, 0.8) * w, y = rnd(0.45, 0.7) * h, r = rnd(18, 42);
      const gr = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.6, 'rgba(250,252,255,0.55)');
      gr.addColorStop(1, 'rgba(240,246,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, { clamp: true });

  T.rainbow = single(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) { g.fillStyle = `hsl(${(x / w) * 360},90%,68%)`; g.fillRect(x, 0, 1, h); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, w, h * 0.3);
  });

  // Palm frond (base at the bottom)
  T.palm = single(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#6d7a36'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = h - 14; y > 6; y -= 7) {
      const f = 1 - y / h;
      const len = (w / 2 - 3) * Math.min(1, Math.sin(Math.min(1, (1 - f) * 1.1) * Math.PI * 0.55 + 0.35));
      for (const s of [-1, 1]) {
        g.strokeStyle = `hsl(${rnd(78, 100)},${rnd(38, 55)}%,${rnd(24, 40)}%)`;
        g.lineWidth = 4;
        g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * len * 0.5, y - 10, w / 2 + s * len, y - rnd(18, 28)); g.stroke();
      }
    }
  }, { clamp: true });

  // Leafy card for bushes
  T.leaves = single(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * w * 0.46;
      const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
      g.fillStyle = `hsl(${rnd(85, 120)},${rnd(35, 55)}%,${rnd(18, 42)}%)`;
      g.save(); g.translate(x, y); g.rotate(Math.random() * Math.PI * 2);
      g.beginPath(); g.ellipse(0, 0, rnd(3, 6), rnd(7, 13), 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }, { clamp: true });

  // grass tuft card (blades, base at the bottom)
  T.tuft = single(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x0 = rnd(0.15, 0.85) * w, top = rnd(0.05, 0.6) * h, bend = rnd(-22, 22);
      g.strokeStyle = `hsl(${rnd(70, 110)},${rnd(35, 60)}%,${rnd(22, 48)}%)`;
      g.lineWidth = rnd(2, 4.5);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + bend * 0.3, (h + top) / 2, x0 + bend, top); g.stroke();
    }
    for (let i = 0; i < 3; i++) { // a few tiny flowers
      if (Math.random() < 0.5) continue;
      g.fillStyle = pick(['#fff8e1', '#ffe066', '#ffb3d1', '#d6c8ff']);
      g.beginPath(); g.arc(rnd(0.2, 0.8) * w, rnd(0.15, 0.5) * h, rnd(3, 5), 0, Math.PI * 2); g.fill();
    }
  }, { clamp: true });

  return T;
}
