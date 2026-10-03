// Public ATS job-board APIs used directly by companies' own career sites.
import { http, mapLimit, htmlToText, toIso, relativePostedOn } from '../util.js';
import * as cfg from '../config.js';

export const greenhouse = {
  key: 'greenhouse',
  label: 'Greenhouse (company boards)',
  async list(ctx) {
    const out = [];
    await mapLimit(Object.entries(cfg.greenhouse), 6, async ([slug, name]) => {
      const d = await http(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
      for (const j of d.jobs || []) {
        out.push({
          externalId: `${slug}:${j.id}`,
          company: name,
          title: j.title,
          url: j.absolute_url,
          locations: [j.location?.name].filter(Boolean),
          postedAt: toIso(j.first_published || j.updated_at),
          ref: { slug, id: j.id },
        });
      }
    }, (e, [slug]) => ctx.warn(`greenhouse/${slug}: ${e.message}`));
    return out;
  },
  async detail(raw) {
    const d = await http(`https://boards-api.greenhouse.io/v1/boards/${raw.ref.slug}/jobs/${raw.ref.id}`);
    return {
      description: htmlToText(d.content),
      locations: [d.location?.name, ...(d.offices || []).map((o) => o.location || o.name)].filter(Boolean),
    };
  },
};

export const lever = {
  key: 'lever',
  label: 'Lever (company boards)',
  async list(ctx) {
    const out = [];
    await mapLimit(Object.entries(cfg.lever), 4, async ([slug, name]) => {
      const d = await http(`https://api.lever.co/v0/postings/${slug}?mode=json`);
      for (const j of d || []) {
        const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n');
        out.push({
          externalId: `${slug}:${j.id}`,
          company: name,
          title: j.text,
          url: j.hostedUrl,
          locations: [...new Set([j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean))],
          countries: [j.country].filter(Boolean),
          postedAt: toIso(j.createdAt),
          employmentType: j.categories?.commitment,
          description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n'),
        });
      }
    }, (e, [slug]) => ctx.warn(`lever/${slug}: ${e.message}`));
    return out;
  },
};

export const ashby = {
  key: 'ashby',
  label: 'Ashby (company boards)',
  async list(ctx) {
    const out = [];
    await mapLimit(Object.entries(cfg.ashby), 4, async ([slug, name]) => {
      const d = await http(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
      for (const j of d.jobs || []) {
        if (j.isListed === false) continue;
        out.push({
          externalId: `${slug}:${j.id}`,
          company: name,
          title: j.title,
          url: j.jobUrl,
          locations: [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean),
          countries: [j.address?.postalAddress?.addressCountry].filter(Boolean),
          postedAt: toIso(j.publishedAt),
          employmentType: j.employmentType,
          description: j.descriptionPlain || htmlToText(j.descriptionHtml),
        });
      }
    }, (e, [slug]) => ctx.warn(`ashby/${slug}: ${e.message}`));
    return out;
  },
};

const SR_QUERIES = ['intern', 'internship', 'praktikum', 'praktikant', 'werkstudent', 'working student', 'stage'];
export const smartrecruiters = {
  key: 'smartrecruiters',
  label: 'SmartRecruiters (Bosch, Continental, …)',
  async list(ctx) {
    const seen = new Map();
    const tasks = Object.entries(cfg.smartrecruiters).flatMap(([id, name]) => SR_QUERIES.map((q) => [id, name, q]));
    await mapLimit(tasks, 4, async ([id, name, q]) => {
      for (let offset = 0; offset < 400; offset += 100) {
        const d = await http(`https://api.smartrecruiters.com/v1/companies/${id}/postings?q=${encodeURIComponent(q)}&limit=100&offset=${offset}`);
        for (const j of d.content || []) {
          if (seen.has(j.id)) continue;
          seen.set(j.id, {
            externalId: `${id}:${j.id}`,
            company: name,
            title: j.name,
            url: `https://jobs.smartrecruiters.com/${id}/${j.id}`,
            locations: [j.location?.fullLocation || [j.location?.city, j.location?.country].filter(Boolean).join(', ')],
            countries: [j.location?.country].filter(Boolean),
            postedAt: toIso(j.releasedDate),
            employmentType: [j.typeOfEmployment?.label, j.experienceLevel?.label].filter(Boolean).join(' '),
            ref: { id, postingId: j.id },
          });
        }
        if (!d.content?.length || offset + 100 >= d.totalFound) break;
      }
    }, (e, [id, , q]) => ctx.warn(`smartrecruiters/${id} "${q}": ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const d = await http(`https://api.smartrecruiters.com/v1/companies/${raw.ref.id}/postings/${raw.ref.postingId}`);
    const s = d.jobAd?.sections || {};
    return {
      description: htmlToText([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join('\n')),
      url: d.postingUrl || raw.url,
    };
  },
};

const WD_QUERIES = ['intern', 'internship', 'working student', 'werkstudent', 'praktikum'];
export const workday = {
  key: 'workday',
  label: 'Workday (NVIDIA, Airbus, Intel, …)',
  detailConcurrency: 3,
  async list(ctx) {
    const seen = new Map();
    const tasks = cfg.workday.flatMap((t) => WD_QUERIES.map((q) => [t, q]));
    await mapLimit(tasks, 4, async ([t, q]) => {
      const api = `https://${t.host}/wday/cxs/${t.tenant}/${t.site}/jobs`;
      for (let offset = 0; offset < 200; offset += 20) {
        const d = await http(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
        });
        const posts = d.jobPostings || [];
        let relevant = 0;
        for (const j of posts) {
          if (!j.externalPath) continue;
          if (ctx.isCandidateTitle(j.title)) relevant++;
          const id = `${t.tenant}:${j.externalPath}`;
          if (seen.has(id)) continue;
          seen.set(id, {
            externalId: id,
            company: t.name,
            title: j.title,
            url: `https://${t.host}/en-US/${t.site}${j.externalPath}`,
            locations: [j.locationsText].filter((l) => l && !/^\d+\s+locations?$/i.test(l)),
            postedAt: relativePostedOn(j.postedOn),
            ref: { api: `https://${t.host}/wday/cxs/${t.tenant}/${t.site}${j.externalPath}` },
          });
        }
        // Results are relevance-ranked: stop once a page has no internship-like titles.
        if (posts.length < 20 || relevant === 0 || offset + 20 >= d.total) break;
      }
    }, (e, [t, q]) => ctx.warn(`workday/${t.tenant} "${q}": ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const d = await http(raw.ref.api);
    const i = d.jobPostingInfo || {};
    return {
      description: htmlToText(i.jobDescription),
      locations: [i.location, ...(i.additionalLocations || []), i.country?.descriptor].filter(Boolean),
      postedAt: toIso(i.startDate) || raw.postedAt,
      employmentType: i.timeType,
      url: i.externalUrl || raw.url,
    };
  },
};

const EF_QUERIES = ['intern', 'internship', 'working student', 'werkstudent', 'student'];
export const eightfold = {
  key: 'eightfold',
  label: 'Microsoft & Qualcomm careers',
  async list(ctx) {
    const seen = new Map();
    const tasks = cfg.eightfold.flatMap((c) => [
      ...EF_QUERIES.map((q) => [c, q, '']),
      ...['Egypt', 'Saudi Arabia'].flatMap((l) => ['intern', 'internship'].map((q) => [c, q, l])),
    ]);
    await mapLimit(tasks, 3, async ([c, q, l]) => {
      for (let start = 0; start < 400; start += 10) {
        const d = await http(`https://${c.host}/api/pcsx/search?domain=${c.domain}&query=${encodeURIComponent(q)}&location=${encodeURIComponent(l)}&start=${start}&sort_by=timestamp`);
        const ps = d.data?.positions || [];
        for (const p of ps) {
          const id = `${c.domain}:${p.id}`;
          if (seen.has(id)) continue;
          seen.set(id, {
            externalId: id,
            company: c.name,
            title: p.name,
            url: `https://${c.host}${p.positionUrl || `/careers/job/${p.id}`}`,
            locations: p.locations || [],
            countries: (p.standardizedLocations || []).map((s) => s.split(',').pop().trim()).filter((s) => /^[A-Z]{2}$/.test(s)),
            postedAt: toIso(p.postedTs),
            ref: { host: c.host, domain: c.domain, id: p.id },
          });
        }
        if (ps.length < 10 || start + 10 >= (d.data?.count ?? 0)) break;
      }
    }, (e, [c, q, l]) => ctx.warn(`eightfold/${c.domain} "${q}"${l ? ` ${l}` : ''}: ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const d = await http(`https://${raw.ref.host}/api/pcsx/position_details?position_id=${raw.ref.id}&domain=${raw.ref.domain}&hl=en`);
    const p = d.data || {};
    return { description: htmlToText(p.jobDescription), url: p.publicUrl || raw.url };
  },
};

export const personio = {
  key: 'personio',
  label: 'Personio (German startups)',
  async list(ctx) {
    const out = [];
    const tag = (xml, t) => {
      const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`));
      return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
    };
    await mapLimit(Object.entries(cfg.personio), 4, async ([slug, name]) => {
      const xml = await http(`https://${slug}.jobs.personio.de/xml?language=en`, { as: 'text' });
      for (const p of xml.match(/<position>[\s\S]*?<\/position>/g) || []) {
        const id = tag(p, 'id');
        const descs = (p.match(/<jobDescription>[\s\S]*?<\/jobDescription>/g) || []).map((d) => `${tag(d, 'name')}\n${htmlToText(tag(d, 'value'))}`);
        const offices = [tag(p, 'office'), ...[...p.matchAll(/<additionalOffices>[\s\S]*?<\/additionalOffices>/g)].flatMap((m) => [...m[0].matchAll(/<office>([\s\S]*?)<\/office>/g)].map((x) => x[1]))];
        out.push({
          externalId: `${slug}:${id}`,
          company: name,
          title: tag(p, 'name'),
          url: `https://${slug}.jobs.personio.de/job/${id}`,
          locations: offices.filter(Boolean),
          postedAt: toIso(tag(p, 'createdAt')),
          employmentType: `${tag(p, 'employmentType')} ${tag(p, 'seniority')}`.replace(/_/g, ' '),
          description: descs.join('\n'),
        });
      }
    }, (e, [slug]) => ctx.warn(`personio/${slug}: ${e.message}`));
    return out;
  },
};

export const workable = {
  key: 'workable',
  label: 'Workable (Hugging Face, …)',
  async list(ctx) {
    const out = [];
    await mapLimit(Object.entries(cfg.workable), 2, async ([acc, name]) => {
      let token;
      for (let page = 0; page < 10; page++) {
        const d = await http(`https://apply.workable.com/api/v3/accounts/${acc}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [], ...(token ? { token } : {}) }),
        });
        for (const j of d.results || []) {
          const locs = [j.location, ...(j.locations || [])].filter(Boolean);
          out.push({
            externalId: `${acc}:${j.shortcode}`,
            company: name,
            title: j.title,
            url: `https://apply.workable.com/${acc}/j/${j.shortcode}/`,
            locations: [...new Set(locs.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')))].concat(j.remote ? ['Remote'] : []),
            countries: locs.map((l) => l.countryCode).filter(Boolean),
            postedAt: toIso(j.published),
            employmentType: j.type,
            ref: { acc, shortcode: j.shortcode },
          });
        }
        token = d.nextPage;
        if (!token) break;
      }
    }, (e, [acc]) => ctx.warn(`workable/${acc}: ${e.message}`));
    return out;
  },
  async detail(raw) {
    const d = await http(`https://apply.workable.com/api/v2/accounts/${raw.ref.acc}/jobs/${raw.ref.shortcode}`);
    return { description: htmlToText([d.description, d.requirements].filter(Boolean).join('\n')) };
  },
};
