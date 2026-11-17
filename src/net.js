// Talks to /api/soap (shared house + rankings). Falls back to a local-only mode
// (localStorage) when the API is not available, e.g. when opening the files directly.
const API = '/api/soap';
const LOCAL_KEY = 'ce:local:v1';
const CATS = ['soap', 'water', 'foam', 'height'];
const MAX_CATS = new Set(['height']); // best value, not a sum (height in cm)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function today() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}
const zeroStats = () => ({ soap: 0, water: 0, foam: 0, height: 0 });
const merge = (cat, a, b) => (MAX_CATS.has(cat) ? Math.max(a || 0, b || 0) : (a || 0) + (b || 0));

export class Net {
  constructor(profile) {
    this.profile = profile;        // { id, name }
    this.mode = 'connecting';      // 'online' | 'local'
    this.since = null;
    this.score = 0;
    this.total = 0;
    this.queue = [];               // encoded hits waiting to be sent
    this.pending = zeroStats();    // stats not yet sent
    this.inflight = zeroStats();   // stats being sent right now
    this.ownRanges = [];
    this.handlers = {};
    this.me = { day: zeroStats(), all: zeroStats(), rank: { day: {}, all: {} } };
    this.boards = null;
    this.online = 0;
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, data) { (this.handlers[ev] || []).forEach((fn) => fn(data)); }

  async start() {
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(this.profile.id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (typeof j.total !== 'number') throw new Error('bad payload');
      this.mode = 'online';
      this.applyState(j);
    } catch {
      this.mode = 'local';
      this.loadLocal();
    }
    this.emit('mode', this.mode);
    this.loop();
  }

  // ---- public API used by the game
  queueHit(str, weight) {
    this.queue.push(str);
    this.addStat('foam', weight);
    if (this.mode === 'local') {
      this.local.hits.push(str);
      if (this.local.hits.length > 3000) this.local.hits.splice(0, this.local.hits.length - 3000);
      this.local.score += weight;
      this.score = this.local.score;
      this.dirty = true;
    }
  }

  addStat(cat, n) {
    if (this.mode === 'local') {
      this.rollLocalDay();
      this.local.day[cat] = merge(cat, this.local.day[cat], n);
      this.local.all[cat] = merge(cat, this.local.all[cat], n);
      this.me.day = this.local.day; this.me.all = this.local.all;
      this.dirty = true;
    } else {
      this.pending[cat] = merge(cat, this.pending[cat], n);
    }
  }

  // foam that is not yet included in the server score (for instant feedback)
  unsentFoam() { return this.mode === 'online' ? this.pending.foam + this.inflight.foam : 0; }

  myStats(period) {
    const base = this.me[period] || zeroStats();
    if (this.mode !== 'online') return { ...base };
    const out = {};
    for (const c of CATS) out[c] = merge(c, merge(c, base[c], this.pending[c]), this.inflight[c]);
    return out;
  }

  // ---- loop
  async loop() {
    let lastPoll = Date.now();
    for (;;) {
      await sleep(1200);
      if (this.mode === 'local') {
        if (this.dirty) this.saveLocal();
        continue;
      }
      try {
        if (this.queue.length || CATS.some((c) => this.pending[c] > 0)) await this.flush();
        if (Date.now() - lastPoll > 5000) { await this.poll(); lastPoll = Date.now(); }
        if (this.failing) { this.failing = 0; this.emit('mode', 'online'); }
      } catch {
        this.failing = (this.failing || 0) + 1;
        if (this.failing === 3) this.emit('mode', 'retrying');
        await sleep(Math.min(15000, 1000 * this.failing));
      }
    }
  }

  async flush() {
    const hits = this.queue.splice(0, 180);
    const stats = this.pending;
    this.pending = zeroStats();
    this.inflight = stats;
    let ok = false;
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.profile.id, name: this.profile.name, hits, stats }),
      });
      if (r.status === 429) return; // try again next tick (finally re-queues)
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      ok = true;
      if (hits.length) this.ownRanges.push([j.total - hits.length, j.total]);
      if (this.ownRanges.length > 60) this.ownRanges.shift();
      this.score = j.score;
      for (const c of CATS) {
        this.me.day[c] = merge(c, this.me.day[c], stats[c]);
        this.me.all[c] = merge(c, this.me.all[c], stats[c]);
      }
    } finally {
      this.inflight = zeroStats();
      if (!ok) {
        this.queue.unshift(...hits);
        if (this.queue.length > 600) this.queue.splice(0, this.queue.length - 600);
        for (const c of CATS) this.pending[c] = merge(c, this.pending[c], stats[c]);
      }
    }
  }

  async poll() {
    const q = new URLSearchParams({ id: this.profile.id });
    if (this.since !== null) q.set('since', String(this.since));
    const r = await fetch(`${API}?${q}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    this.applyState(await r.json());
  }

  applyState(j) {
    const first = this.since === null;
    const n = j.hits.length;
    const startSeq = j.total - n;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const seq = startSeq + i;
      if (!j.full && this.ownRanges.some(([a, b]) => seq >= a && seq < b)) continue;
      hits.push(j.hits[i]);
    }
    this.total = j.total;
    this.since = j.total;
    this.score = j.score;
    this.online = j.online;
    this.boards = j.boards;
    if (j.me) {
      this.me = {
        day: Object.fromEntries(CATS.map((c) => [c, j.me.day[c]?.score || 0])),
        all: Object.fromEntries(CATS.map((c) => [c, j.me.all[c]?.score || 0])),
        rank: {
          day: Object.fromEntries(CATS.map((c) => [c, j.me.day[c]?.rank || null])),
          all: Object.fromEntries(CATS.map((c) => [c, j.me.all[c]?.rank || null])),
        },
      };
    }
    this.emit('hits', { hits, full: j.full || first, animate: !first && !j.full });
    this.emit('state', j);
  }

  // ---- local mode
  loadLocal() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { /* ignore */ }
    this.local = d && Array.isArray(d.hits) ? d : { hits: [], score: 0, date: today(), day: zeroStats(), all: zeroStats() };
    this.local.day = { ...zeroStats(), ...this.local.day };
    this.local.all = { ...zeroStats(), ...this.local.all };
    this.rollLocalDay();
    this.score = this.local.score;
    this.me = { day: this.local.day, all: this.local.all, rank: { day: {}, all: {} } };
    this.emit('hits', { hits: this.local.hits.slice(), full: true, animate: false });
  }

  rollLocalDay() {
    const t = today();
    if (this.local.date !== t) { this.local.date = t; this.local.day = zeroStats(); }
  }

  saveLocal() {
    this.dirty = false;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local)); } catch { /* storage full or blocked */ }
  }

  resetLocal() {
    this.local = { hits: [], score: 0, date: today(), day: zeroStats(), all: zeroStats() };
    this.score = 0;
    this.me = { day: this.local.day, all: this.local.all, rank: { day: {}, all: {} } };
    this.saveLocal();
  }
}
