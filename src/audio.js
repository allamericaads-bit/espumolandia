// Tiny synthesized sound effects (WebAudio) – no audio files needed.
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('ce:muted') === '1'; } catch { /* ignore */ }
    this.last = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('ce:muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return true;
    this.last[key] = now;
    return false;
  }

  noise(dur, { type = 'lowpass', freq = 1000, to = null, q = 1, gain = 0.4, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, to = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  splat(k = 1) {
    if (this.throttle('splat', 45)) return;
    this.noise(0.12 + 0.25 * k, { type: 'lowpass', freq: 1400, to: 300, gain: 0.5 * k });
    this.tone(160, 0.16, { to: 55, gain: 0.35 * k });
  }
  throw() { this.noise(0.2, { type: 'bandpass', freq: 500, to: 2400, q: 2.5, gain: 0.22 }); }
  pop() {
    if (this.throttle('pop', 35)) return;
    this.tone(rnd(800, 1500), 0.05, { to: rnd(1800, 2800), gain: 0.08 });
  }
  drip() {
    if (this.throttle('drip', 70)) return;
    this.tone(rnd(1600, 2400), 0.04, { to: 700, gain: 0.035, type: 'triangle' });
  }
  fizz() { this.noise(0.7, { type: 'highpass', freq: 3500, gain: 0.16, attack: 0.02 }); }
  sparkle() {
    [1318, 1568, 1976, 2637].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', gain: 0.07, delay: i * 0.05 }));
  }
  boom() {
    this.tone(80, 0.8, { to: 32, gain: 0.8 });
    this.noise(0.9, { type: 'lowpass', freq: 700, to: 120, gain: 0.6 });
  }
  unlock() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.14, delay: i * 0.09 }));
  }
  click() { this.tone(900, 0.04, { type: 'triangle', gain: 0.06 }); }
  jump(foam) { this.tone(foam ? 260 : 320, 0.18, { to: foam ? 700 : 560, gain: 0.08, type: 'triangle' }); }
  land(k, foam) {
    if (foam) { this.squish(k); return; }
    this.noise(0.12, { type: 'lowpass', freq: 500, to: 150, gain: 0.25 * k });
  }
  squish(k = 0.6) {
    this.noise(0.22, { type: 'bandpass', freq: 900, to: 300, q: 1.5, gain: 0.3 * k });
    this.tone(220, 0.15, { to: 90, gain: 0.12 * k });
  }
  step(foam) {
    if (this.throttle('step', 120)) return;
    if (foam) this.noise(0.08, { type: 'bandpass', freq: rnd(700, 1000), q: 2, gain: 0.07 });
    else this.noise(0.05, { type: 'lowpass', freq: rnd(450, 650), gain: 0.06 });
  }
  slip() {
    this.tone(500, 0.35, { to: 1400, gain: 0.12, type: 'triangle' });
    this.tone(1300, 0.3, { to: 260, gain: 0.1, type: 'sine', delay: 0.3 });
  }
  hit() {
    if (this.throttle('hit', 90)) return;
    this.tone(1800, 0.03, { type: 'square', gain: 0.025 });
  }
  // continuous sounds (jetpack, sliding) that fade in and out
  loop(key, on, { type = 'bandpass', freq = 1000, q = 1, gain = 0.12 } = {}) {
    if (!this.ctx) return;
    this.loops ||= {};
    let L = this.loops[key];
    if (!L) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      L = this.loops[key] = { f, g, on: false };
    }
    const t = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(on ? gain : 0, t, 0.08);
    if (on) L.f.frequency.setTargetAtTime(freq, t, 0.1);
  }
  jet(on) {
    this.loop('jet', on, { type: 'bandpass', freq: 1500, q: 0.7, gain: 0.11 });
    if (on && Math.random() < 0.3) this.pop();
  }
  ride(on, v = 0) { this.loop('ride', on, { type: 'lowpass', freq: 300 + v * 110, q: 0.8, gain: 0.05 + Math.min(v, 15) * 0.012 }); }
  whee() { this.tone(500, 0.4, { to: 1100, gain: 0.09, type: 'triangle' }); }
  splash() {
    this.noise(0.9, { type: 'lowpass', freq: 2200, to: 300, gain: 0.55 });
    this.noise(0.5, { type: 'highpass', freq: 3000, gain: 0.18 });
    this.tone(120, 0.3, { to: 50, gain: 0.3 });
  }
  chirp() {
    const base = rnd(2600, 3600), n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.tone(base, 0.07, { to: base * rnd(1.15, 1.4), gain: 0.025, delay: i * 0.11 });
  }

  spray(on) {
    if (!this.ctx) return;
    if (!this.sprayNode) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.7;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      this.sprayNode = g;
    }
    const t = this.ctx.currentTime;
    this.sprayNode.gain.cancelScheduledValues(t);
    this.sprayNode.gain.setTargetAtTime(on ? 0.16 : 0, t, 0.05);
  }
}
