import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './src/store.js';
import { Scheduler } from './src/scheduler.js';
import { sources } from './src/sources/index.js';
import { criteria, settings } from './src/config.js';
import { CATEGORY_LABELS } from './src/classify.js';
import { Logos } from './src/logos.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || settings.port;
const POLL_MIN = Number(process.env.POLL_MINUTES) || settings.pollMinutes;

const store = new Store(path.join(ROOT, 'data'));
const scheduler = new Scheduler(store, sources);
const logos = new Logos(path.join(ROOT, 'data'), Object.fromEntries(sources.map((s) => [s.key, s])));
scheduler.reclassifyAll();

if (process.argv.includes('--once')) {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const t = Date.now();
  await (only ? Promise.all(sources.filter((s) => only.includes(s.key)).map((s) => scheduler.runSource(s))) : scheduler.runAll());
  store.flush();
  for (const s of sources) {
    const m = store.sourceMeta(s.key);
    if (only && !only.includes(s.key)) continue;
    console.log(`${s.key.padEnd(16)} raw=${m.rawCount ?? '-'} candidates=${m.candidateCount ?? '-'} ${m.lastError ? `ERROR ${m.lastError}` : ''} ${m.warnings?.length ? `(${m.warnings.length} warnings)` : ''}`);
  }
  const all = Object.values(store.jobs);
  const by = (v) => all.filter((j) => j.analysis.verdict === v).length;
  console.log(`\n${all.length} stored · strong ${by('strong')} · possible ${by('possible')} · excluded ${by('excluded')} · ${((Date.now() - t) / 1000).toFixed(0)}s`);
  process.exit(0);
}

// ------------------------------------------------------------------ views
// Same posting is often listed on the company ATS and on job boards; merge them by title + city + company token overlap.
const CO_STOP = new Set(['gmbh', 'group', 'holding', 'deutschland', 'germany', 'niederlassung', 'services', 'international', 'the', 'und', 'and', 'for', 'sarl', 'ltd', 'inc', 'branch', 'werk']);
const companyTokens = (c = '') => new Set(c.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').split(' ').filter((w) => w.length > 2 && !CO_STOP.has(w)));
const normTitle = (t = '') =>
  t.toLowerCase().replace(/\([^)]{0,20}\/[^)]{0,20}\)|\(all genders?\)|\*in\b|:in\b/gi, '').replace(/[^a-z0-9äöüß]+/g, ' ').trim();
const cityKey = (j) => (j.locations[0] || '').toLowerCase().split(/[,(]/)[0].trim();
const BOARD = new Set(['bundesagentur', 'arbeitnow', 'jobsch']);

function slim(job) {
  const { description, ...rest } = job;
  return { ...rest, status: store.status(job.id), stale: scheduler.isStale(job), hasDescription: !!description };
}

function listJobs(includeExcluded) {
  const byKey = new Map();
  for (const j of Object.values(store.jobs)) {
    if (!includeExcluded && j.analysis?.verdict === 'excluded') continue;
    const key = `${normTitle(j.title)}|${cityKey(j)}`;
    const clusters = byKey.get(key) || byKey.set(key, []).get(key);
    const toks = companyTokens(j.company);
    const hit = clusters.find((c) => [...toks].some((t) => c.tokens.has(t)));
    if (hit) {
      hit.jobs.push(j);
      toks.forEach((t) => hit.tokens.add(t));
    } else clusters.push({ tokens: toks, jobs: [j] });
  }
  const out = [];
  for (const g of [...byKey.values()].flat().map((c) => c.jobs)) {
    const rank = { strong: 2, possible: 1, excluded: 0 };
    g.sort((a, b) => rank[b.analysis?.verdict] - rank[a.analysis?.verdict] || BOARD.has(a.source) - BOARD.has(b.source) || (b.analysis?.score ?? 0) - (a.analysis?.score ?? 0));
    const [best, ...rest] = g;
    const s = slim(best);
    if (rest.length) s.alsoOn = rest.map((r) => ({ id: r.id, source: r.sourceLabel, url: r.url, locations: r.locations }));
    s.firstSeenAt = g.map((x) => x.firstSeenAt).sort()[0];
    out.push(s);
  }
  return out;
}

function statusPayload() {
  return {
    running: scheduler.running.size > 0,
    lastRunAt: scheduler.lastRunAt,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    pollMinutes: POLL_MIN,
    sources: sources.map((s) => {
      const { warnings = [], ...m } = store.sourceMeta(s.key);
      return { key: s.key, label: s.label, ...m, warnings: warnings.slice(0, 8), warningCount: warnings.length };
    }),
  };
}

// ------------------------------------------------------------------ SSE
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
let statusTimer;
scheduler.on('status', () => {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => broadcast('status', statusPayload()), 300);
});
scheduler.on('new-jobs', (jobs) => {
  broadcast('new-jobs', jobs.map(slim));
  for (const j of jobs) console.log(`[new] ${j.analysis.verdict.padEnd(8)} ${j.company} — ${j.title}`);
});
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000);

// ------------------------------------------------------------------ http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > 1e5) break;
  }
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, { jobs: listJobs(url.searchParams.get('excluded') === '1'), now: new Date().toISOString() });
    let m;
    if ((m = p.match(/^\/api\/jobs\/([a-f0-9]{16})$/)) && req.method === 'GET') {
      const j = store.get(m[1]);
      return j ? send(res, 200, { ...j, status: store.status(j.id), stale: scheduler.isStale(j) }) : send(res, 404, { error: 'not found' });
    }
    if ((m = p.match(/^\/api\/jobs\/([a-f0-9]{16})\/status$/)) && req.method === 'POST') {
      const { status } = await readBody(req);
      if (status && !['saved', 'applied', 'hidden'].includes(status)) return send(res, 400, { error: 'bad status' });
      store.setStatus(m[1], status || null);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/status') return send(res, 200, statusPayload());
    if ((m = p.match(/^\/api\/logo\/([a-f0-9]{16})$/))) {
      const j = store.get(m[1]);
      const logo = j && (await logos.get(j));
      if (!logo) {
        res.writeHead(404, { 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': logo.type, 'Cache-Control': 'public, max-age=604800' });
      return fs.createReadStream(logo.file).pipe(res);
    }
    if (p === '/api/criteria') return send(res, 200, { criteria, categories: CATEGORY_LABELS });
    if (p === '/api/refresh' && req.method === 'POST') {
      const started = !scheduler.running.size;
      if (started) poll();
      return send(res, 202, { started });
    }
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    // static
    const file = path.join(ROOT, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^([/\\])+/, ''));
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

let nextRunAt = null;
async function poll() {
  nextRunAt = null;
  const t = Date.now();
  console.log(`[poll] starting (${sources.length} sources)`);
  await scheduler.runAll();
  nextRunAt = new Date(Date.now() + POLL_MIN * 60000);
  console.log(`[poll] done in ${((Date.now() - t) / 1000).toFixed(0)}s — next at ${nextRunAt.toLocaleTimeString()}`);
  broadcast('status', statusPayload());
}

server.listen(PORT, () => {
  console.log(`Internship Grabber running at http://localhost:${PORT} (polling every ${POLL_MIN} min)`);
  poll();
  setInterval(() => {
    if (!scheduler.running.size) poll();
  }, POLL_MIN * 60000);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}
