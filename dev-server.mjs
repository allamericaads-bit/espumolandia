// Local development server: serves the static game AND runs api/soap.js against an
// in-memory fake of the Upstash REST API, so the online mode + rankings work offline.
//   npm run dev   ->  http://localhost:5173
// If real Upstash env vars are set (KV_REST_API_URL / KV_REST_API_TOKEN), they are used instead.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5173;
const ROOT = fileURLToPath(new URL('.', import.meta.url));

const usingFake = !(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
if (usingFake) {
  process.env.KV_REST_API_URL = `http://127.0.0.1:${PORT}/__redis`;
  process.env.KV_REST_API_TOKEN = 'dev';
}
const { default: handler } = await import('./api/soap.js');

// ---------------------------------------------------------------- tiny Redis fake
const db = new Map(); // key -> { v, exp }
const get = (k) => {
  const e = db.get(k);
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) { db.delete(k); return undefined; }
  return e.v;
};
const put = (k, v, exp) => db.set(k, { v, exp });
const idx = (i, len) => (i < 0 ? len + i : i);
const zsorted = (z) => [...z.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));

function run([cmd, ...a]) {
  switch (cmd.toUpperCase()) {
    case 'GET': { const v = get(a[0]); return v === undefined ? null : String(v); }
    case 'SET': {
      const opts = a.slice(2).map(String);
      if (opts.includes('NX') && get(a[0]) !== undefined) return null;
      const px = opts.indexOf('PX');
      put(a[0], String(a[1]), px >= 0 ? Date.now() + Number(opts[px + 1]) : 0);
      return 'OK';
    }
    case 'INCRBY': { const v = (Number(get(a[0])) || 0) + Number(a[1]); put(a[0], String(v)); return v; }
    case 'DEL': { let n = 0; for (const k of a) n += db.delete(k) ? 1 : 0; return n; }
    case 'EXPIRE': { const e = db.get(a[0]); if (!e) return 0; e.exp = Date.now() + Number(a[1]) * 1000; return 1; }
    case 'LLEN': return (get(a[0]) || []).length;
    case 'RPUSH': { const l = get(a[0]) || []; l.push(...a.slice(1).map(String)); put(a[0], l); return l.length; }
    case 'LRANGE': {
      const l = get(a[0]) || [];
      const s = Math.max(0, idx(Number(a[1]), l.length)), e = idx(Number(a[2]), l.length);
      return l.slice(s, e + 1);
    }
    case 'LTRIM': {
      const l = get(a[0]) || [];
      const s = Math.max(0, idx(Number(a[1]), l.length)), e = idx(Number(a[2]), l.length);
      put(a[0], l.slice(s, e + 1));
      return 'OK';
    }
    case 'HSET': { const h = get(a[0]) || new Map(); for (let i = 1; i < a.length; i += 2) h.set(String(a[i]), String(a[i + 1])); put(a[0], h); return 1; }
    case 'HMGET': { const h = get(a[0]) || new Map(); return a.slice(1).map((f) => h.get(String(f)) ?? null); }
    case 'ZADD': { const z = get(a[0]) || new Map(); z.set(String(a[2]), Number(a[1])); put(a[0], z, db.get(a[0])?.exp); return 1; }
    case 'ZINCRBY': {
      const z = get(a[0]) || new Map();
      const v = (z.get(String(a[2])) || 0) + Number(a[1]);
      z.set(String(a[2]), v); put(a[0], z, db.get(a[0])?.exp);
      return String(v);
    }
    case 'ZSCORE': { const z = get(a[0]); const v = z?.get(String(a[1])); return v === undefined ? null : String(v); }
    case 'ZREVRANK': { const z = get(a[0]); if (!z?.has(String(a[1]))) return null; return zsorted(z).findIndex(([m]) => m === String(a[1])); }
    case 'ZREVRANGE': {
      const z = get(a[0]); if (!z) return [];
      const list = zsorted(z);
      const s = idx(Number(a[1]), list.length), e = idx(Number(a[2]), list.length);
      const out = [];
      for (const [m, sc] of list.slice(s, e + 1)) { out.push(m); if (String(a[3]).toUpperCase() === 'WITHSCORES') out.push(String(sc)); }
      return out;
    }
    case 'ZREMRANGEBYSCORE': {
      const z = get(a[0]); if (!z) return 0;
      const lo = a[1] === '-inf' ? -Infinity : Number(a[1]), hi = a[2] === '+inf' ? Infinity : Number(a[2]);
      let n = 0;
      for (const [m, sc] of z) if (sc >= lo && sc <= hi) { z.delete(m); n++; }
      return n;
    }
    case 'ZCARD': return get(a[0])?.size || 0;
    default: throw new Error(`fake redis: unsupported ${cmd}`);
  }
}

// ---------------------------------------------------------------- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const readBody = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => { s += c; });
  req.on('end', () => resolve(s));
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/__redis/')) {
      const cmds = JSON.parse(await readBody(req));
      const out = cmds.map((c) => { try { return { result: run(c) }; } catch (e) { return { error: e.message }; } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (url.pathname === '/api/soap') {
      const raw = await readBody(req);
      req.query = Object.fromEntries(url.searchParams);
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      return await handler(req, res);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!path || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') { res.writeHead(404); return res.end('not found'); }
    console.error(e);
    res.writeHead(500); res.end('error');
  }
}).listen(PORT, () => {
  console.log(`Casa Ensaboada em http://localhost:${PORT}  (${usingFake ? 'Redis falso em memória' : 'Upstash real'})`);
});
