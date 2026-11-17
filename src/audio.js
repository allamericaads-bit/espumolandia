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
