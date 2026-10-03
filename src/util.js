import crypto from 'node:crypto';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function http(url, { method = 'GET', headers = {}, body, timeout = 25000, retries = 2, as = 'json' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          Accept: as === 'json' ? 'application/json, */*;q=0.5' : 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        lastErr.status = res.status;
        if (attempt < retries) await sleep(2000 * (attempt + 1) ** 2);
        continue;
      }
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
      const text = await res.text();
      return as === 'json' ? JSON.parse(text) : text;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Runs fn over items with at most n in flight. Never rejects; failures are reported via onError. */
export async function mapLimit(items, n, fn, onError) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        if (onError) onError(e, items[idx]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', bull: '•',
  middot: '·', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedil: 'ç',
  ecirc: 'ê', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ocirc: 'ô', acirc: 'â', icirc: 'î', ucirc: 'û',
  Eacute: 'É', shy: '', zwnj: '', trade: '™', reg: '®', copy: '©',
};

export function decodeEntities(s = '') {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function snippet(text, index, length = 0, radius = 70) {
  if (index == null || index < 0) return '';
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

export const hashId = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

export function relativePostedOn(text, now = Date.now()) {
  if (!text) return null;
  const t = text.toLowerCase();
  const day = 86400000;
  if (t.includes('today')) return new Date(now).toISOString();
  if (t.includes('yesterday')) return new Date(now - day).toISOString();
  const m = t.match(/(\d+)\+?\s*days?/);
  if (m) return new Date(now - Number(m[1]) * day).toISOString();
  return null;
}

export function toIso(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Extracts a balanced JSON array/object literal starting at `from` in `src`. */
export function extractJsonLiteral(src, from) {
  const start = src.slice(from).search(/[[{]/);
  if (start < 0) return null;
  let i = from + start;
  const open = src[i];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === '\\') j++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}
