// General job boards: Bundesagentur für Arbeit (all German employers), Arbeitnow, jobs.ch (Zurich).
import { http, mapLimit, htmlToText, toIso } from '../util.js';
import * as cfg from '../config.js';

const BA = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const BA_HEADERS = { 'X-API-Key': 'jobboerse-jobsuche' };

export const bundesagentur = {
  key: 'bundesagentur',
  label: 'Bundesagentur für Arbeit (SAP, Siemens, BMW, …)',
  detailConcurrency: 4,
  async list(ctx) {
    const seen = new Map();
    // Re-list everything recent each run so still-open postings don't look stale.
    const days = 90;
    await mapLimit(cfg.bundesagenturQueries, 3, async (q) => {
      for (let page = 1; page <= 5; page++) {
        const d = await http(`${BA}/pc/v6/jobs?was=${encodeURIComponent(q)}&size=100&page=${page}&veroeffentlichtseit=${days}`, { headers: BA_HEADERS });
        const items = d.stellenangebote || d.ergebnisliste || [];
        for (const j of items) {
          const ref = j.refnr || j.referenznummer;
          if (!ref || seen.has(ref)) continue;
          const locs = (j.stellenlokationen || [j.arbeitsort]).filter(Boolean).map((l) => l.adresse || l);
          seen.set(ref, {
            externalId: ref,
            company: j.arbeitgeber || j.firma || 'Unknown',
            title: j.titel || j.stellenangebotsTitel || j.beruf,
            url: j.externeUrl || j.externeURL || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${ref}`,
            locations: locs.map((a) => [a.ort, a.region, a.land].filter(Boolean).join(', ')),
            countries: locs.map((a) => (/deutschland/i.test(a.land || 'Deutschland') ? 'DE' : a.land)),
            postedAt: toIso(j.aktuelleVeroeffentlichungsdatum || j.datumErsteVeroeffentlichung),
            startHint: j.eintrittsdatum || j.eintrittszeitraum?.von || null,
            ref: { ref, baUrl: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${ref}` },
          });
        }
        const total = d.maxErgebnisse ?? 0;
        if (items.length < 100 || page * 100 >= total) break;
      }
    }, (e, q) => ctx.warn(`bundesagentur "${q}": ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const d = await baDetail(raw.externalId);
    const desc = d.stellenangebotsBeschreibung || d.stellenbeschreibung || d.stellenangebotsbeschreibung || longestString(d);
    const ext = d.externeUrl || d.externeURL;
    return {
      description: htmlToText(desc || ''),
      startHint: d.eintrittszeitraum?.von || d.eintrittsdatum || raw.startHint,
      company: d.firma || d.arbeitgeber || raw.company,
      employmentType: [d.angebotsart, ...(d.arbeitszeitmodelle || [])].filter(Boolean).join(' '),
      url: ext ? (/^https?:/.test(ext) ? ext : `https://${ext}`) : raw.url,
      companyUrl: d.allianzpartnerUrl || null,
    };
  },
  /** Company homepage for logo lookup (may be a partner job board; the logo resolver checks it against the name). */
  async homepage(job) {
    if (job.companyUrl) return job.companyUrl;
    return (await baDetail(job.externalId)).allianzpartnerUrl || null;
  },
};

const baDetail = (ref) => http(`${BA}/pc/v4/jobdetails/${Buffer.from(ref).toString('base64')}`, { headers: BA_HEADERS });

export const arbeitnow = {
  key: 'arbeitnow',
  label: 'Arbeitnow (German tech board)',
  async list() {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const d = await http(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of d.data || []) {
        out.push({
          externalId: j.slug,
          company: j.company_name,
          title: j.title,
          url: j.url,
          locations: [j.location, j.remote ? 'Remote' : null].filter(Boolean),
          countries: ['DE'],
          postedAt: toIso(j.created_at),
          employmentType: (j.job_types || []).join(' '),
          description: htmlToText(j.description),
        });
      }
      if (!d.links?.next || !d.data?.length) break;
    }
    return out;
  },
};

export const jobsch = {
  key: 'jobsch',
  label: 'jobs.ch (Zurich & Switzerland)',
  detailConcurrency: 3,
  async list(ctx) {
    const seen = new Map();
    const tasks = cfg.jobsChQueries.flatMap((q) => [[q, 'Zürich'], [q, '']]);
    await mapLimit(tasks, 3, async ([q, loc]) => {
      for (let page = 1; page <= 5; page++) {
        // API max is rows=20
        const d = await http(`https://www.jobs.ch/api/v1/public/search?query=${encodeURIComponent(q)}&location=${encodeURIComponent(loc)}&rows=20&page=${page}`);
        const docs = d.documents || [];
        for (const j of docs) {
          if (seen.has(j.job_id)) continue;
          seen.set(j.job_id, {
            externalId: j.job_id,
            company: j.company_name || 'Unknown',
            title: j.title,
            url: j._links?.detail_en?.href || `https://www.jobs.ch/en/vacancies/detail/${j.job_id}/`,
            locations: [j.place].filter(Boolean),
            countries: ['CH'],
            postedAt: toIso(j.publication_date),
            employmentType: (j.employment_grades || []).join(' '),
            description: j.preview || '',
            logoUrl: j.company_logo_file || null,
            ref: { id: j.job_id },
          });
        }
        if (docs.length < 20 || page >= (d.num_pages ?? 1)) break;
      }
    }, (e, [q]) => ctx.warn(`jobs.ch "${q}": ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const d = await http(`https://www.jobs.ch/api/v1/public/search/job/${raw.ref.id}`);
    const t = d.template || d.template_text || longestString(d);
    const text = htmlToText(t || '');
    return text.length > (raw.description || '').length ? { description: text } : {};
  },
};

function longestString(obj, depth = 0) {
  let best = '';
  if (depth > 5 || !obj || typeof obj !== 'object') return best;
  for (const v of Object.values(obj)) {
    const c = typeof v === 'string' ? v : longestString(v, depth + 1);
    if (c.length > best.length) best = c;
  }
  return best;
}
