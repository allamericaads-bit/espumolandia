// Procedural textures (drawn on <canvas>) so the game needs no image assets.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

function make(w, h, draw, { clamp = false, color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  const wrap = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapS = t.wrapT = wrap;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, dark = 0.08, light = 0.06, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5
      ? `rgba(0,0,0,${Math.random() * dark})`
      : `rgba(255,255,255,${Math.random() * light})`;
    const s = Math.random() * size + 0.5;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function blotches(g, w, h, n, rgb, rmax, a) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rnd(rmax * 0.3, rmax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
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

  // Light stucco, tinted per material via material.color
  T.stucco = make(256, 256, (g, w, h) => {
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 14, '120,100,80', 60, 0.05);
    speckle(g, w, h, 14000, 0.09, 0.08, 1.6);
  });

  T.wood = make(256, 256, (g, w, h) => {
    g.fillStyle = '#e2cfb4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y0 = Math.random() * h;
      g.strokeStyle = `rgba(90,60,30,${rnd(0.05, 0.22)})`;
      g.lineWidth = rnd(0.5, 2.2);
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
    speckle(g, w, h, 3000, 0.08, 0.04, 1.5);
  });

  // Wooden window shutters (venezianas) – horizontal slats with frame
  T.shutter = make(128, 128, (g, w, h) => {
    g.fillStyle = '#d8c2a6'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 7) {
      const gr = g.createLinearGradient(0, y, 0, y + 7);
      gr.addColorStop(0, '#f1e3cf'); gr.addColorStop(0.75, '#b89d7d'); gr.addColorStop(1, '#5e4630');
      g.fillStyle = gr; g.fillRect(8, y, w - 16, 7);
    }
    g.strokeStyle = '#4a3423'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    speckle(g, w, h, 1200, 0.1, 0.05, 1.2);
  });

  T.door = make(128, 256, (g, w, h) => {
    g.fillStyle = '#cdb08f'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = `rgba(60,35,15,${rnd(0.05, 0.2)})`; g.fillRect(x, 0, 16, h);
      g.fillStyle = 'rgba(40,25,10,0.6)'; g.fillRect(x, 0, 1.5, h);
    }
    g.strokeStyle = '#3c2a1b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#d9d2c4'; g.fillRect(w - 26, h * 0.5, 10, 4);
  });

  // Fibre-cement corrugated sheet
  T.corrugated = make(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const s = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * 4);
      const v = Math.round(150 + s * 80);
      g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(x, 0, 1, h);
    }
    blotches(g, w, h, 6, '60,60,50', 24, 0.12);
    speckle(g, w, h, 1500, 0.1, 0.05, 1.2);
  });

  // Concrete paver sidewalk (basket weave)
  T.pavers = make(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8b84'; g.fillRect(0, 0, w, h);
    const c = 32;
    for (let cy = 0; cy < h; cy += c) for (let cx = 0; cx < w; cx += c) {
      const horiz = ((cx + cy) / c) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const v = Math.round(rnd(150, 190));
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        if (horiz) g.fillRect(cx + 1, cy + 1 + k * 16, c - 2, 14);
        else g.fillRect(cx + 1 + k * 16, cy + 1, 14, c - 2);
      }
    }
    speckle(g, w, h, 5000, 0.12, 0.06, 1.5);
  });

  T.concrete = make(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c6bf'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 18, '90,90,80', 50, 0.06);
    speckle(g, w, h, 9000, 0.1, 0.06, 1.5);
    g.strokeStyle = 'rgba(70,70,60,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0.5); g.lineTo(w, 0.5); g.moveTo(0.5, 0); g.lineTo(0.5, h); g.stroke();
  });

  T.grass = make(256, 256, (g, w, h) => {
    g.fillStyle = '#6a8e3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.strokeStyle = `hsla(${rnd(70, 105)},${rnd(35, 55)}%,${rnd(25, 48)}%,0.8)`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - rnd(2, 6)); g.stroke();
    }
  });

  T.asphalt = make(256, 256, (g, w, h) => {
    g.fillStyle = '#5b5c60'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 16000, 0.2, 0.12, 1.4);
    blotches(g, w, h, 8, '30,30,30', 60, 0.08);
  });

  T.tiles = make(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 13, w, 3);
      for (let x = (y / 16) % 2 ? 0 : 12; x < w; x += 24) {
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y, 1.5, 14);
      }
    }
    speckle(g, w, h, 3000, 0.12, 0.08, 1.4);
  });

  // Galvanised wire mesh for the fence (transparent)
  T.wire = make(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(55,58,60,0.9)'; g.lineWidth = 1.4;
    for (let i = 0; i <= w; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
  });

  // Round foam splat (ground / horizontal surfaces)
  T.foam = make(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
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

  // Foam that drips down walls (texture is 1:2, top = foam, bottom = drips)
  T.drip = make(128, 256, (g, w, h) => {
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

  T.sky = make(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2c78dc');
    gr.addColorStop(0.35, '#6fb2ef');
    gr.addColorStop(0.5, '#cfe7fb');
    gr.addColorStop(1, '#e9f3fb');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });

  T.rainbow = make(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      g.fillStyle = `hsl(${(x / w) * 360},90%,68%)`; g.fillRect(x, 0, 1, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, w, h * 0.3);
  });

  // Palm frond with leaflets (base at the bottom of the canvas)
  T.palm = make(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#6f7f3a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = h - 10; y > 4; y -= 5) {
      const f = 1 - y / h, len = (w / 2 - 2) * Math.sin(Math.min(1, (1 - f) * 1.15) * Math.PI * 0.55 + 0.3);
      g.strokeStyle = `hsl(${rnd(80, 100)},${rnd(40, 55)}%,${rnd(26, 38)}%)`;
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - len, y - 14); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + len, y - 14); g.stroke();
    }
  }, { clamp: true });

  return T;
}
