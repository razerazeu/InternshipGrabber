// Company logos: resolve a company's own web domain, fetch its icon once, cache it on disk.
import fs from 'node:fs';
import path from 'node:path';
import { hashId, UA, http } from './util.js';

const LEGAL =
  /\b(gmbh|ag|se|kg|kgaa|mbh|ug|e\s?v|co|ltd|limited|inc|llc|plc|sa|sarl|bv|nv|ab|oy|spa|srl|holding|group|gruppe|niederlassung|zentrale|deutschland|germany|schweiz|switzerland|europe)\b/g;
const LEADING = /^(die|der|das|the)\s+/;
// Words too generic to identify a company by themselves.
const GENERIC = new Set([
  'und', 'and', 'des', 'der', 'für', 'for', 'von', 'the', 'software', 'systems', 'system', 'solutions', 'services', 'service', 'technologies',
  'technology', 'digital', 'consulting', 'international', 'development', 'center', 'centre', 'data', 'it', 'tech', 'global', 'research',
  'engineering', 'automotive', 'personal', 'personalservice', 'gesellschaft', 'bundes', 'berlin', 'munich', 'münchen', 'hamburg', 'zürich', 'zurich',
]);
const NOT_A_NAME = new Set(['www', 'jobs', 'job', 'karriere', 'career', 'careers', 'apply', 'stellen', 'recruiting', 'bewerbung', 'join', 'work']);
const RETRY_MISS_MS = 7 * 86400000;

const fold = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
export function companyKey(name = '') {
  return fold(name.toLowerCase())
    .split(/\s+[-–|]\s+|,|\(/)[0]
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING, '');
}
const compact = (s) => s.replace(/[^a-z0-9]/g, '');
const distinctive = (key) => key.split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));

function registrable(host) {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const n = parts.length >= 3 && /^(co|com|ac|org|gov|net)$/.test(parts.at(-2)) ? 3 : 2;
  return parts.slice(-n).join('.');
}
const mainLabel = (domain) => compact(domain.split('.')[0]);

/** True when the host's registrable domain is clearly the company's own (not an ATS tenant or job board). */
export function domainBelongsTo(host, name) {
  const label = mainLabel(registrable(host));
  if (label.length < 3 || NOT_A_NAME.has(label)) return false;
  const key = companyKey(name);
  if (label === compact(key)) return true;
  return distinctive(key).some((t) => (t.length >= 4 && label.includes(t)) || (label.length >= 4 && compact(key).includes(label) && label.startsWith(t)));
}

function hostOf(u) {
  if (!u) return null;
  try {
    return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname;
  } catch {
    return null;
  }
}

/** Accept a Clearbit suggestion only when its name/domain really is the company we searched for. */
// Rank how plausible a Clearbit suggestion is for the company we searched (0 = reject).
const TLD_RANK = { de: 3, ch: 3, com: 3, eu: 3, ai: 2, io: 2, tech: 2, at: 2, group: 2, net: 1, org: 1, co: 1, dev: 1, app: 1, cloud: 1, nl: 1, fr: 1, it: 1, es: 1, pl: 1, se: 1, dk: 1, fi: 1, no: 1, ie: 1, be: 1, lu: 1, cz: 1, pt: 1, 'co.uk': 1 };
export function suggestionScore(s, query) {
  if (!s?.domain) return 0;
  const reg = registrable(s.domain);
  const tld = TLD_RANK[reg.slice(reg.indexOf('.') + 1)];
  if (!tld) return 0;
  const label = mainLabel(reg);
  const q = compact(query);
  const sn = companyKey(s.name || '');
  const words = distinctive(query);
  let m = 0;
  const nameAgrees = sn === query || compact(sn) === q;
  if (label === q || label === `${q}group`) m = (q.length >= 4 && tld >= 2) || nameAgrees ? 3 : 0;
  else if (sn === query && tld >= 2 && label.length >= 3 && q.startsWith(label) && words[0]?.startsWith(label)) m = 2;
  else if (sn === query && tld === 3 && words.some((t) => t.length >= 4 && label === t)) m = 1;
  return m && m * 10 + tld;
}

export class Logos {
  constructor(dataDir, sourcesByKey = {}) {
    this.dir = path.join(dataDir, 'logos');
    fs.mkdirSync(this.dir, { recursive: true });
    this.indexFile = path.join(this.dir, 'index.json');
    try {
      this.index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
    } catch {
      this.index = {};
    }
    this.sources = sourcesByKey;
    this.inflight = new Map();
    this.active = 0;
    this.waiting = [];
  }

  /** Returns { file, type } for the job's company logo, or null. */
  async get(job) {
    const key = companyKey(job.company) || job.company;
    const hit = this.index[key];
    if (hit?.file && fs.existsSync(path.join(this.dir, hit.file))) return { file: path.join(this.dir, hit.file), type: hit.type };
    if (hit && !hit.file && Date.now() - hit.at < RETRY_MISS_MS) return null;
    if (!this.inflight.has(key)) {
      this.inflight.set(
        key,
        this.limit(() => this.resolve(job, key))
          .catch(() => null)
          .finally(() => this.inflight.delete(key)),
      );
    }
    const r = await this.inflight.get(key);
    return r?.file ? { file: path.join(this.dir, r.file), type: r.type } : null;
  }

  async limit(fn) {
    if (this.active >= 6) await new Promise((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  async resolve(job, key) {
    let img = null;
    let domain = null;
    if (job.logoUrl) img = await fetchImage(job.logoUrl);
    if (!img) {
      for await (const d of this.domains(job, key)) {
        img = await iconFor(d);
        if (img) {
          domain = d;
          break;
        }
      }
    }
    const entry = { domain, at: Date.now(), file: null, type: null };
    if (img) {
      entry.file = `${hashId(key)}.${img.ext}`;
      entry.type = img.type;
      fs.writeFileSync(path.join(this.dir, entry.file), img.buf);
    }
    this.index[key] = entry;
    this.persist();
    return entry;
  }

  // Candidate company domains, most trustworthy first: the posting's own links, the employer homepage, then Clearbit.
  async *domains(job, key) {
    const seen = new Set();
    const own = (u) => {
      const h = hostOf(u);
      const d = h && domainBelongsTo(h, job.company) && registrable(h);
      return d && !seen.has(d) && seen.add(d) ? d : null;
    };
    for (const u of [job.companyUrl, job.url]) {
      const d = own(u);
      if (d) yield d;
    }
    const src = this.sources[job.source];
    if (src?.homepage) {
      const d = own(await src.homepage(job).catch(() => null));
      if (d) yield d;
    }
    const words = distinctive(key);
    const queries = [key, ...(words.length === 2 && words.join(' ') === key ? words.filter((t) => t.length >= 4) : [])];
    for (const q of queries) {
      const strict = q !== key;
      const list = await http(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`, { retries: 1, timeout: 8000 }).catch(() => []);
      const best = (Array.isArray(list) ? list : [])
        .map((s) => ({ d: registrable(s.domain || 'x'), score: suggestionScore(s, q) }))
        .filter((x) => (strict ? x.score >= 33 : x.score) && !seen.has(x.d))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      for (const { d } of best) {
        seen.add(d);
        yield d;
      }
      if (best.length) return;
    }
  }

  persist() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const tmp = `${this.indexFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.index));
      fs.renameSync(tmp, this.indexFile);
    }, 1000);
  }
}

async function fetchImage(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return null;
    const ext = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type] || 'ico';
    return { buf, type, ext, width: pngWidth(buf) };
  } catch {
    return null;
  }
}

const pngWidth = (b) => (b.length > 24 && b[1] === 0x50 && b[2] === 0x4e ? b.readUInt32BE(16) : null);

// Google's favicon service returns 404 when it has no icon; DuckDuckGo is the fallback (and sometimes sharper).
async function iconFor(domain) {
  const g = await fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  if (g && (g.width == null || g.width >= 32)) return g;
  const d = await fetchImage(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
  return d || g;
}
