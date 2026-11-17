// Vercel serverless function: shared soap state + daily / all-time rankings.
// Storage: Upstash Redis over its REST API (Vercel Marketplace → "Upstash for Redis").
// Env vars (any of the pairs): KV_REST_API_URL + KV_REST_API_TOKEN
//                              UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// Optional: ADMIN_KEY (allows DELETE /api/soap with header x-admin-key to wash the house).

const MAX_HITS = 5000;            // how many splats the house keeps (oldest are dropped)
const MAX_RETURN_DELTA = 800;     // max hits returned on an incremental poll
const HIT_RE = /^[swb][0-9](,-?\d{1,5}){6},\d{1,3}$/;
const ID_RE = /^[a-z0-9]{8,32}$/;
const CATS = ['soap', 'water', 'foam'];
// Upper bound per request (client sends every ~1.2 s) – keeps rankings sane.
const LIMITS = { soap: 20, water: 250, foam: 2000 };

const env = (a, b) => process.env[a] || process.env[b];

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const boardKey = (cat, period, day) => (period === 'all' ? `soap:lb:${cat}:all` : `soap:lb:${cat}:day:${day}`);

function cleanName(n) {
  const s = String(n || '').normalize('NFC').replace(/[^\p{L}\p{N} _.\-!?]/gu, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 18) || null;
}

async function redis(path, cmds) {
  const url = env('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
  const r = await fetch(`${url.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.map((x) => {
    if (x && x.error) throw new Error(x.error);
    return x.result;
  });
}

function parseBoard(flat) {
  const out = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) out.push({ id: flat[i], score: Math.round(Number(flat[i + 1])) });
  return out;
}

async function handleGet(req, res) {
  const q = req.query || {};
  const id = ID_RE.test(String(q.id || '')) ? String(q.id) : null;
  const sinceRaw = q.since !== undefined ? Number(q.since) : NaN;
  const day = today();
  const now = Date.now();

  const cmds = [['GET', 'soap:total'], ['GET', 'soap:score'], ['LLEN', 'soap:hits']];
  const boardIdx = {};
  for (const period of ['day', 'all']) {
    for (const cat of CATS) {
      boardIdx[`${period}:${cat}`] = cmds.length;
      cmds.push(['ZREVRANGE', boardKey(cat, period, day), 0, 9, 'WITHSCORES']);
    }
  }
  const meIdx = {};
  if (id) {
    cmds.push(['ZADD', 'soap:online', now, id]);
    for (const period of ['day', 'all']) {
      for (const cat of CATS) {
        meIdx[`${period}:${cat}`] = cmds.length;
        cmds.push(['ZSCORE', boardKey(cat, period, day), id], ['ZREVRANK', boardKey(cat, period, day), id]);
      }
    }
  }
  cmds.push(['ZREMRANGEBYSCORE', 'soap:online', '-inf', now - 25000]);
  const onlineIdx = cmds.length;
  cmds.push(['ZCARD', 'soap:online']);

  const r = await redis('pipeline', cmds);
  const total = Number(r[0]) || 0;
  const score = Number(r[1]) || 0;
  const len = Number(r[2]) || 0;

  const full = !(Number.isFinite(sinceRaw) && sinceRaw >= 0 && sinceRaw <= total);
  let start = 0;
  if (!full) start = Math.max(0, len - (total - sinceRaw), len - MAX_RETURN_DELTA);

  const boardsRaw = {};
  const ids = new Set();
  for (const key of Object.keys(boardIdx)) {
    boardsRaw[key] = parseBoard(r[boardIdx[key]]);
    boardsRaw[key].forEach((e) => ids.add(e.id));
  }
  const idList = [...ids];

  const second = [];
  if (start < len) second.push(['LRANGE', 'soap:hits', start, -1]);
  if (idList.length) second.push(['HMGET', 'soap:names', ...idList]);
  const r2 = second.length ? await redis('pipeline', second) : [];
  const hits = start < len ? r2.shift() || [] : [];
  const namesArr = idList.length ? r2.shift() || [] : [];
  const names = Object.fromEntries(idList.map((k, i) => [k, namesArr[i] || 'Anônimo']));

  const boards = { day: {}, all: {} };
  for (const key of Object.keys(boardsRaw)) {
    const [period, cat] = key.split(':');
    boards[period][cat] = boardsRaw[key].map((e) => ({ name: names[e.id], score: e.score, me: e.id === id }));
  }

  let me = null;
  if (id) {
    me = { day: {}, all: {} };
    for (const key of Object.keys(meIdx)) {
      const [period, cat] = key.split(':');
      const i = meIdx[key];
      const sc = r[i];
      const rank = r[i + 1];
      me[period][cat] = { score: sc === null ? 0 : Math.round(Number(sc)), rank: rank === null ? null : Number(rank) + 1 };
    }
  }

  res.status(200).json({ total, score, full, hits, boards, me, online: Number(r[onlineIdx]) || 0, day });
}

async function handlePost(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const id = String(body.id || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad id' });

  const hits = Array.isArray(body.hits)
    ? body.hits.filter((h) => typeof h === 'string' && HIT_RE.test(h)).slice(0, 200)
    : [];
  const stats = {};
  for (const c of CATS) {
    const v = Math.floor(Number(body.stats && body.stats[c]) || 0);
    stats[c] = Math.max(0, Math.min(LIMITS[c], v));
  }
  const name = cleanName(body.name);

  // light rate limit: one write per ~0.9 s per player
  const [rl] = await redis('pipeline', [['SET', `soap:rl:${id}`, '1', 'PX', '900', 'NX']]);
  if (rl === null) return res.status(429).json({ error: 'slow down' });

  const day = today();
  const tx = [];
  if (hits.length) {
    tx.push(['RPUSH', 'soap:hits', ...hits]);
    tx.push(['LTRIM', 'soap:hits', -MAX_HITS, -1]);
    tx.push(['INCRBY', 'soap:total', hits.length]);
  }
  if (stats.foam) tx.push(['INCRBY', 'soap:score', stats.foam]);
  if (name) tx.push(['HSET', 'soap:names', id, name]);
  for (const c of CATS) {
    if (!stats[c]) continue;
    tx.push(['ZINCRBY', boardKey(c, 'all', day), stats[c], id]);
    tx.push(['ZINCRBY', boardKey(c, 'day', day), stats[c], id]);
    tx.push(['EXPIRE', boardKey(c, 'day', day), 60 * 60 * 24 * 10]);
  }
  tx.push(['GET', 'soap:total'], ['GET', 'soap:score']);
  const r = await redis('multi-exec', tx);
  res.status(200).json({ total: Number(r[r.length - 2]) || 0, score: Number(r[r.length - 1]) || 0, accepted: hits.length });
}

async function handleDelete(req, res) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers['x-admin-key'] !== key) return res.status(403).json({ error: 'forbidden' });
  await redis('pipeline', [['DEL', 'soap:hits', 'soap:total', 'soap:score']]);
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!env('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL') || !env('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')) {
    return res.status(503).json({ error: 'storage not configured' });
  }
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
