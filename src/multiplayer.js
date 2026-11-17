// Real-time multiplayer: everyone on the street sees each other walking, throwing and foaming.
// Peer-to-peer over WebRTC (Trystero, Nostr relays for matchmaking): no game server needed, so it
// works on a static Vercel deploy. The shared house and rankings still go through /api/soap.
import * as THREE from 'three';
import { buildCharacter, poseCharacter, angleLerp } from './player.js';

const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr@0.26.0/+esm';
const APP_ID = 'espumolandia-casa-v1';
const ROOM_ID = 'rua-principal';
const SEND_INTERVAL = 1 / 12;   // position updates per second
const INTERP_DELAY = 130;       // ms behind real time, so movement is smooth
const MAX_REMOTES = 24;

// flags in the state packet
export const F_GROUND = 1, F_AIM = 2, F_SLIP = 4, F_JET = 8, F_RIDE = 16, F_CLIMB = 32;

function makeTag(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.font = '700 56px "Baloo 2", system-ui, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 56);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  const x = (512 - w) / 2;
  g.beginPath();
  if (g.roundRect) g.roundRect(x, 12, w, 84, 42); else g.rect(x, 12, w, 84);
  g.fill();
  g.fillStyle = '#1d3557';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 56, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.15, 0.25, 1);
  sp.position.y = 1.95;
  sp.renderOrder = 5;
  return sp;
}

class Remote {
  constructor(peerId, ctx) {
    this.peerId = peerId;
    this.ctx = ctx;
    this.name = 'Ensaboador';
    this.lookKey = '';
    this.char = null;
    this.snaps = [];
    this.pos = new THREE.Vector3(0, -100, 0);  // hidden until the first state arrives
    this.yaw = 0;
    this.pitch = 0;
    this.walk = 0;
    this.speed = 0;
    this.aim = 0;
    this.slipT = 0;
    this.throwT = 1;
    this.lastThrow = null;
    this.weapon = 0;
    this.soap = 0;
    this.hasState = false;
  }

  hello({ n, l }) {
    if (typeof n === 'string' && n.trim()) this.name = n.slice(0, 18);
    this.look = l || {};
    const key = JSON.stringify(l || {});
    if (!this.char || key !== this.lookKey) {
      this.lookKey = key;
      this.build(l || {});
    } else {
      this.setTag();
    }
  }

  build(look) {
    this.dispose();
    const safe = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
    this.char = buildCharacter({
      shirt: safe(look.shirt, '#3fa9f5'), pants: safe(look.pants, '#2f4a7a'),
      skin: safe(look.skin, '#f2c7a5'), hair: safe(look.hair, '#2b1d14'),
    });
    this.held = this.ctx.makeHeld(this.char.hand);
    this.setTag();
    this.ctx.scene.add(this.char.root);
  }

  setTag() {
    if (!this.char) return;
    if (this.tag) { this.char.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.tag = makeTag(this.name);
    this.char.root.add(this.tag);
  }

  push(a, now) {
    if (!Array.isArray(a) || a.length < 9 || a.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return;
    this.snaps.push({ t: now, x: a[0] / 100, y: a[1] / 100, z: a[2] / 100, yaw: a[3] / 1000, pitch: a[4] / 1000, w: a[5] | 0, s: a[6] | 0, f: a[7] | 0, th: a[8] | 0 });
    if (this.snaps.length > 30) this.snaps.shift();
    if (!this.hasState) { this.hasState = true; this.pos.set(a[0] / 100, a[1] / 100, a[2] / 100); }
  }

  update(now, dt) {
    if (!this.char || !this.snaps.length) return;
    const rt = now - INTERP_DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].t <= rt && this.snaps[i + 1].t >= rt) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
    const nx = a.x + (b.x - a.x) * k, ny = a.y + (b.y - a.y) * k, nz = a.z + (b.z - a.z) * k;
    const sp = dt > 0 ? Math.hypot(nx - this.pos.x, nz - this.pos.z) / dt : 0;
    this.prevY = this.pos.y;
    this.speed += (Math.min(8, sp) - this.speed) * Math.min(1, dt * 10);
    this.pos.set(nx, ny, nz);
    this.yaw = angleLerp(a.yaw, b.yaw, k);
    this.pitch = a.pitch + (b.pitch - a.pitch) * k;
    const st = k < 0.5 ? a : b;
    const onGround = !!(st.f & F_GROUND);
    const climbing = !!(st.f & F_CLIMB), riding = !!(st.f & F_RIDE);
    this.jet = !!(st.f & F_JET);
    const vy = dt > 0 ? Math.abs(ny - this.prevY) / dt : 0;
    if (onGround && this.speed > 0.3) this.walk += dt * (4 + this.speed * 1.6);
    else if (climbing && vy > 0.2) this.walk += dt * 7;
    this.aim += ((st.f & F_AIM ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    if (st.f & F_SLIP) { if (this.slipT <= 0) this.slipT = 1; }
    this.slipT = Math.max(0, this.slipT - dt);
    if (this.lastThrow !== null && st.th !== this.lastThrow) this.throwT = 0;
    this.lastThrow = st.th;
    if (this.throwT < 1) this.throwT = Math.min(1, this.throwT + dt / 0.28);
    // weapon in hand
    const names = ['soap', 'water', 'bubble', 'washer', 'bazuca', 'doze', 'ak'];
    names.forEach((n, i) => { this.held[n].g.visible = i === st.w; });
    if (st.w === 0) this.ctx.setSoapLook(this.held.soap.mesh, st.s);

    poseCharacter(this.char, { walk: this.walk, speed: this.speed, onGround, pitch: this.pitch, aim: this.aim, slipT: this.slipT, throwT: this.throwT, riding, climbing });
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw + Math.PI;
  }

  dispose() {
    if (!this.char) return;
    this.ctx.scene.remove(this.char.root);
    this.char.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.map && o.isSprite) o.material.map.dispose();
    });
    this.char = null;
    this.tag = null;
  }
}

export class Multiplayer {
  constructor({ scene, makeHeld, setSoapLook, handlers }) {
    this.ctx = { scene, makeHeld, setSoapLook };
    this.h = handlers;            // onShot, onHits, onBonk, onJoin, onLeave, onStatus
    this.remotes = new Map();
    this.status = 'off';          // 'off' | 'connecting' | 'on' | 'error'
    this.sendT = 0;
    this.hitQueue = [];
    this.hitT = 0;
    this.helloData = null;
  }

  get count() {
    let n = 0;
    this.remotes.forEach((r) => { if (r.hasState && r.char) n++; });
    return n;
  }

  async start(hello) {
    if (this.status !== 'off') return;
    this.helloData = hello;
    this.setStatus('connecting');
    try {
      const { joinRoom, selfId } = await import(TRYSTERO_URL);
      this.selfId = selfId;
      const room = joinRoom({ appId: APP_ID }, ROOM_ID);
      this.room = room;
      this.aHello = room.makeAction('hello');
      this.aState = room.makeAction('st');
      this.aShot = room.makeAction('shot');
      this.aHits = room.makeAction('hits');
      this.aBonk = room.makeAction('bonk');
      this.aPick = room.makeAction('pick');
      this.aPick.onMessage = (id) => { if (Number.isInteger(id)) this.h.onPick?.(id); };

      room.onPeerJoin = (peerId) => {
        if (this.remotes.size >= MAX_REMOTES) return;
        if (!this.remotes.has(peerId)) this.remotes.set(peerId, new Remote(peerId, this.ctx));
        this.aHello.send({ ...this.helloData, ...(this.h.helloExtra?.() || {}) }, { target: peerId });
      };
      room.onPeerLeave = (peerId) => {
        const r = this.remotes.get(peerId);
        if (!r) return;
        if (r.char) this.h.onLeave?.(r.name);
        r.dispose();
        this.remotes.delete(peerId);
      };
      this.aHello.onMessage = (data, meta) => {
        const peerId = meta?.peerId ?? meta;
        if (!data || typeof data !== 'object') return;
        let r = this.remotes.get(peerId);
        if (!r) {
          if (this.remotes.size >= MAX_REMOTES) return;
          r = new Remote(peerId, this.ctx);
          this.remotes.set(peerId, r);
        }
        const first = !r.char;
        r.hello(data);
        this.h.onHello?.(data, r);
        if (first) this.h.onJoin?.(r.name);
      };
      this.aState.onMessage = (data, meta) => {
        const r = this.remotes.get(meta?.peerId ?? meta);
        if (r) r.push(data, performance.now());
      };
      this.aShot.onMessage = (data, meta) => {
        const r = this.remotes.get(meta?.peerId ?? meta);
        if (r && data && typeof data === 'object') this.h.onShot?.(data, r);
      };
      this.aHits.onMessage = (data) => {
        if (Array.isArray(data)) this.h.onHits?.(data.filter((s) => typeof s === 'string').slice(0, 200));
      };
      this.aBonk.onMessage = (data, meta) => {
        const r = this.remotes.get(meta?.peerId ?? meta);
        if (r && data && typeof data === 'object') this.h.onBonk?.(data, r);
      };
      window.addEventListener('pagehide', () => { try { room.leave(); } catch { /* ignore */ } });
      this.setStatus('on');
    } catch (e) {
      console.warn('multiplayer indisponível', e);
      this.setStatus('error');
    }
  }

  setStatus(s) {
    this.status = s;
    this.h.onStatus?.(s);
  }

  setHello(hello) {
    this.helloData = hello;
    if (this.status === 'on') this.aHello.send(hello);
  }

  // called every frame
  update(dt, stateArray) {
    const now = performance.now();
    this.remotes.forEach((r) => r.update(now, dt));
    if (this.status !== 'on') return;
    this.sendT -= dt;
    if (stateArray && this.sendT <= 0 && this.remotes.size) {
      this.sendT = SEND_INTERVAL;
      this.aState.send(stateArray);
    }
    this.hitT -= dt;
    if (this.hitQueue.length && this.hitT <= 0) {
      this.hitT = 0.15;
      const batch = this.hitQueue.splice(0, 200);
      if (this.remotes.size) this.aHits.send(batch);
    }
  }

  sendShot(data) { if (this.status === 'on' && this.remotes.size) this.aShot.send(data); }
  queueHit(str) { if (this.status === 'on' && this.remotes.size) this.hitQueue.push(str); }
  sendBonk(peerId, data) { if (this.status === 'on') this.aBonk.send(data, { target: peerId }); }
  sendPick(id) { if (this.status === 'on' && this.remotes.size) this.aPick.send(id); }

  // visible remote players (for hit tests)
  forEachVisible(cb) {
    this.remotes.forEach((r) => { if (r.char && r.hasState) cb(r); });
  }
}
