// Big-tech career sites with their own (public, unauthenticated) endpoints.
import { http, mapLimit, htmlToText, toIso, extractJsonLiteral } from '../util.js';

const AMAZON_EU = ['DEU', 'CHE', 'GBR', 'FRA', 'ITA', 'ESP', 'NLD', 'IRL', 'POL', 'LUX', 'SWE', 'AUT', 'BEL', 'DNK', 'FIN', 'CZE', 'ROU'];
export const amazon = {
  key: 'amazon',
  label: 'Amazon Jobs',
  async list(ctx) {
    const seen = new Map();
    const tasks = AMAZON_EU.flatMap((c) =>
      (c === 'DEU' || c === 'CHE' ? ['intern', 'internship', 'working student', 'werkstudent', 'praktikum'] : ['intern']).map((q) => [c, q]),
    );
    await mapLimit(tasks, 4, async ([country, q]) => {
      for (let offset = 0; offset < 500; offset += 100) {
        const d = await http(
          `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&normalized_country_code[]=${country}&result_limit=100&offset=${offset}&sort=recent`,
        );
        const jobs = d.jobs || [];
        for (const j of jobs) {
          const id = j.id_icims || j.id;
          if (seen.has(id)) continue;
          seen.set(id, {
            externalId: String(id),
            company: j.company_name || 'Amazon',
            title: j.title,
            url: `https://www.amazon.jobs${j.job_path}`,
            locations: [j.normalized_location || j.location].filter(Boolean),
            countries: [j.country_code].filter(Boolean),
            postedAt: toIso(j.posted_date),
            employmentType: j.is_intern ? 'Intern' : j.job_schedule_type,
            description: htmlToText(
              [j.description, 'Basic qualifications:', j.basic_qualifications, 'Preferred qualifications:', j.preferred_qualifications].join('\n'),
            ),
          });
        }
        if (jobs.length < 100 || offset + 100 >= (d.hits ?? 0)) break;
      }
    }, (e, [c, q]) => ctx.warn(`amazon ${c} "${q}": ${e.message}`));
    return [...seen.values()];
  },
};

function parseGoogle(html) {
  const at = html.indexOf("AF_initDataCallback({key: 'ds:1'");
  if (at < 0) return null;
  const dataAt = html.indexOf('data:', at);
  const lit = extractJsonLiteral(html, dataAt + 5);
  return lit ? JSON.parse(lit) : null;
}
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

export const google = {
  key: 'google',
  label: 'Google Careers',
  async list(ctx) {
    const seen = new Map();
    for (const loc of ['Europe', 'Germany', 'Switzerland']) {
      for (let page = 1; page <= 10; page++) {
        const html = await http(
          `https://www.google.com/about/careers/applications/jobs/results/?employment_type=INTERN&location=${encodeURIComponent(loc)}&page=${page}`,
          { as: 'text' },
        );
        const d = parseGoogle(html);
        const jobs = d?.[0] || [];
        for (const j of jobs) {
          if (seen.has(j[0])) continue;
          const locs = (j[9] || []).map((l) => l[0]).filter(Boolean);
          seen.set(j[0], {
            externalId: String(j[0]),
            company: j[7] || 'Google',
            title: j[1],
            url: `https://www.google.com/about/careers/applications/jobs/results/${j[0]}-${slugify(j[1])}`,
            locations: locs,
            countries: (j[9] || []).map((l) => l[5]).filter(Boolean),
            postedAt: toIso(j[12]?.[0]),
            employmentType: 'Intern',
            description: htmlToText(
              [j[10]?.[1], j[3]?.[1], 'Minimum qualifications:', j[19]?.[1], 'Preferred qualifications:', j[4]?.[1], j[15]?.[1]].filter(Boolean).join('\n'),
            ),
          });
        }
        if (jobs.length < 20) break;
      }
    }
    if (!seen.size) ctx.warn('google: no jobs parsed (page format may have changed)');
    return [...seen.values()];
  },
};

const APPLE_LOCS = [
  'germany-DEU', 'switzerland-CHE', 'united-kingdom-GBR', 'ireland-IRL', 'france-FRA', 'italy-ITA', 'spain-ESP',
  'netherlands-NLD', 'sweden-SWE', 'denmark-DNK', 'austria-AUT', 'czechia-CZE', 'poland-POL', 'belgium-BEL', 'finland-FIN',
];
function parseApple(html) {
  const m = html.match(/window\.__staticRouterHydrationData\s*=\s*JSON\.parse\((".*?")\);?\s*<\/script>/s);
  if (!m) return null;
  return JSON.parse(JSON.parse(m[1]));
}

export const apple = {
  key: 'apple',
  label: 'Apple Jobs',
  detailConcurrency: 2,
  async list(ctx) {
    const seen = new Map();
    const tasks = [
      ...APPLE_LOCS.map((l) => [l, 'team=internships-STDNT-INTRN']),
      ['germany-DEU', 'search=werkstudent'],
      ['germany-DEU', 'search=working%20student'],
      ['switzerland-CHE', 'search=intern'],
    ];
    await mapLimit(tasks, 3, async ([loc, filter]) => {
      for (let page = 1; page <= 10; page++) {
        const html = await http(`https://jobs.apple.com/en-us/search?location=${loc}&${filter}&page=${page}`, { as: 'text' });
        const s = parseApple(html)?.loaderData?.search;
        const res = s?.searchResults || [];
        for (const j of res) {
          if (seen.has(j.positionId)) continue;
          seen.set(j.positionId, {
            externalId: String(j.positionId),
            company: 'Apple',
            title: j.postingTitle,
            url: `https://jobs.apple.com/en-us/details/${j.positionId}/${j.transformedPostingTitle || ''}`,
            locations: (j.locations || []).map((l) => [l.city, l.name, l.countryName].filter(Boolean).join(', ')),
            countries: (j.locations || []).map((l) => (l.countryID || '').replace(/^iso-country-/, '') || l.countryName).filter(Boolean),
            postedAt: toIso(j.postDateInGMT || j.postingDate),
            employmentType: j.team?.teamCode === 'STDNT-INTRN' ? 'Intern' : '',
            description: j.jobSummary || '',
          });
        }
        if (!res.length || page * 20 >= (s?.totalRecords ?? 0)) break;
      }
    }, (e, [l, f]) => ctx.warn(`apple ${l} ${f}: ${e.message}`));
    return [...seen.values()];
  },
  async detail(raw) {
    const html = await http(raw.url, { as: 'text' });
    const d = parseApple(html)?.loaderData;
    const j = d?.jobDetails?.jobsData || d?.jobDetails || Object.values(d || {}).find((v) => v?.jobsData)?.jobsData;
    if (!j) return {};
    const parts = [j.jobSummary, j.description, j.responsibilities, j.minimumQualifications, j.preferredQualifications, j.educationAndExperience, j.additionalRequirements];
    const text = htmlToText(parts.filter((p) => typeof p === 'string').join('\n'));
    return text.length > 50 ? { description: text } : {};
  },
};
