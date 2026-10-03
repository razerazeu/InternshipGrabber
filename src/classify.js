// Rule-based analysis of a posting against the user's criteria (English + German + some FR/IT/ES).
import { resolveLocation, COUNTRY_NAMES_EN } from './geo.js';
import { snippet } from './util.js';
import { criteria as defaultCriteria } from './config.js';

// ---------------------------------------------------------------- type
const WS_RE =
  /\b(werkstudent\w*|working[\s-]?students?|student(?:ische[rn]?)?\s+(?:assistant|worker|employee|mitarbeiter\w*|hilfskraft|aushilfe|researcher)|studentische[rn]?\s+(?:mitarbeiter\w*|hilfskraft|aushilfe)|student\s+job|studentenjob|studentjob|hiwi|part[\s-]?time\s+student|student\s+part[\s-]?time)\b/i;
const INTERN_RE =
  /\b(intern|interns|internship|internships|praktikum|praktika|praktikant\w*|pflichtpraktikum|stagiaire|stagiair|stagista|tirocinio|tirocinante|pr[aá]cticas|becario|industrial\s+placement|placement\s+(?:year|student)|co-?op)\b/i;
const FRENCH_STAGE_RE = /\bstage\b(?=.*(\(h\/f\)|\(f\/h\)|\(m\/f\)|ing[ée]nieur|d[ée]veloppe|donn[ée]es|logiciel|s[ée]curit[ée]|fin d'[ée]tudes))/i;
const EXCLUDE_TYPE_RE =
  /\b(ph\.?\s?d\.?|doctoral|doktorand\w*|post-?doc\w*|mba|ausbildung\w*|azubi|auszubildende\w*|apprentice\w*|apprenticeship|dual\w*\s+stud\w*|duales?\s+studium|studium\s+dual|recruiter|recruiting\s+(?:coordinator|partner)|coordinator|university\s+relations|campus\s+recruit\w*)\b/i;
const THESIS_RE = /\b(thesis|abschlussarbeit|masterarbeit|bachelorarbeit|master'?s?\s+thesis|diplomarbeit)\b/i;

export function detectTypes(title = '', employmentType = '') {
  const t = title;
  const types = [];
  const excluded = t.match(EXCLUDE_TYPE_RE);
  if (excluded) return { types, excludedReason: `Title indicates "${excluded[0]}"` };
  if (WS_RE.test(t)) types.push('working_student');
  if (INTERN_RE.test(t) || FRENCH_STAGE_RE.test(t)) types.push('internship');
  if (!types.length && employmentType) {
    if (/working.?student|werkstudent|student/i.test(employmentType)) types.push('working_student');
    else if (/intern|praktik/i.test(employmentType)) types.push('internship');
  }
  if (!types.length && THESIS_RE.test(t)) return { types, excludedReason: 'Thesis position' };
  return { types, excludedReason: null };
}

// ---------------------------------------------------------------- category
export const CATEGORY_LABELS = { ml: 'Machine Learning', ai: 'Artificial Intelligence', security: 'Cyber Security', swe: 'Software Engineering' };

const CAT = {
  ml: [
    /\b(machine[\s-]?learning|deep[\s-]?learning|data[\s-]?scien(?:ce|tist)s?|computer[\s-]?vision|natural[\s-]language[\s-]processing|reinforcement[\s-]learning|maschinelle[sn]?\s+lernen|neural\s+networks?|mlops|recommend(?:er|ation)\s+systems?|predictive\s+model\w*|perception|applied\s+scien(?:ce|tist)s?|statistical\s+learning)\b/gi,
    /\b(ML|NLP)\b/g,
  ],
  ai: [
    /\b(artificial[\s-]intelligence|künstliche[rn]?\s+intelligenz|large[\s-]language[\s-]models?|gen(?:erative)?[\s-]ai|agentic|ai[\s-](?:agents?|engineer\w*|research\w*|scien\w*|platform|safety|solutions?|products?|models?|systems?)|foundation[\s-]models?|multimodal|research\s+scientist|prompt\s+engineering)\b/gi,
    /\b(AI|KI|LLMs?|GenAI|RAG)\b/g,
  ],
  security: [
    /\b(cyber[\s-]?security|cyber\w*|security|infosec|information[\s-]security|it[\s-]sicherheit|informationssicherheit|cybersicherheit|pen(?:etration)?[\s-]?test\w*|red[\s-]team\w*|blue[\s-]team\w*|threat\w*|vulnerabilit\w*|malware|forensic\w*|cryptograph\w*|kryptograph\w*|appsec|devsecops|incident[\s-]response|zero[\s-]trust|identity\s*(?:&|and)\s*access)\b/gi,
    /\b(SOC[\s-]Analyst|SIEM|CSIRT|CERT|IAM|ISMS)\b/g,
  ],
  swe: [
    /\b(software\w*|softwareentwickl\w*|developer|entwickler\w*|anwendungsentwickl\w*|webentwickl\w*|app[\s-]?entwickl\w*|backend|back[\s-]end|frontend|front[\s-]end|full[\s-]?stack|web[\s-]?(?:development|developer|engineer\w*)|mobile[\s-](?:development|developer|engineer\w*)|ios|android|devops|site[\s-]reliability|cloud[\s-](?:engineer\w*|native|computing|infrastructure|development)|platform[\s-]engineer\w*|infrastructure[\s-]engineer\w*|data[\s-]engineer\w*|computer[\s-]science|informatik\w*|informatiker\w*|programmier\w*|programming|firmware|test[\s-]automation|qa[\s-]engineer\w*|kubernetes|research[\s-]engineer\w*|microservices?|rest[\s-]?(?:apis?|schnittstellen)|web[\s-]?(?:anwendung\w*|applikation\w*|applications?)|code[\s-]reviews?|ci\/cd|unit[\s-]?tests?)\b/gi,
    /\b(SWE|SRE|SDE|C\+\+|Java|Python|TypeScript|Golang|Rust)\b/g,
  ],
};

const NEGATIVE_TITLE =
  /\b(marketing|sales|vertrieb\w*|finance|finanz\w*|accounting|buchhaltung|controlling|human\s+resources|HR|personalwesen|personalabteilung|recruit\w*|talent|legal|jurist\w*|tax|steuer\w*|procurement|einkauf|purchasing|logisti\w*|supply\s+chain|communications?|kommunikation|public\s+relations|PR|brand\w*|events?|office|assisten\w*|customer|kunden\w*|business\s+development|consult\w*|beratung|mechanical|maschinenbau|elektrotechnik|electrical|hardware|analog|asic|physical\s+design|chemi\w*|biolog\w*|pharma\w*|medizin\w*|clinical|real\s+estate|immobilien|facility|facilities|produktion|production|manufacturing|fertigung|quality|qualität\w*|graphic|grafik\w*|social\s+media|journalis\w*|redaktion|content|retail|store|einzelhandel|design|designer|operations|business|product\s+manag\w*|product\s+owner|produktmanag\w*|project\s+manag\w*|projektmanag\w*|program\s+manag\w*|innovation\w*|strateg\w*|verification|validation|batter\w*|technician|techniker\w*|personalentwickl\w*|personalmanag\w*|people|seo)\b/i;
// A title that mixes a non-technical function with a buzzword ("Marketing & AI") must also name a technical discipline.
const HARD_NEGATIVE_TITLE =
  /\b(marketing|sales|vertrieb\w*|human\s+resources|HR|recruit\w*|talent|personal\w*|people|communications?|kommunikation|events?|social\s+media|grafik\w*|graphic|content|legal|tax|steuer\w*|accounting|buchhaltung|finance|finanz\w*|business\s+development|seo)\b/i;
const STRONG_TECH_TITLE =
  /\b(engineer\w*|ingenieur\w*|developer|entwickl\w*|software(?:entwickl\w*|[\s-](?:engineer\w*|develop\w*|entwickl\w*))|programm\w*|informatik\w*|computer[\s-]science|scien(?:ce|tist)s?|machine[\s-]learning|deep[\s-]learning|security\s+(?:operations|engineer\w*|analyst\w*|architect\w*|research\w*|testing)|penetration|pen[\s-]?test\w*|SOC|it[\s-]sicherheit|informationssicherheit|backend|frontend|full[\s-]?stack|devops|ML|NLP|research\w*|forschung)\b/i;
const NON_CYBER_SECURITY =
  /\(?physical\)?\s+security|security\s+(?:guard|officer|services?\s+officer)|security,?\s+health\s*(?:&|and)?\s*safety|loss\s+prevention|arbeitssicherheit|food\s+safety|business\s+develop\w*|sales\s+engineer\w*/gi;

function scanCategories(text, phrasesOnly = false) {
  const hits = {};
  for (const [cat, regs] of Object.entries(CAT)) {
    const terms = new Set();
    let first = null;
    for (const re of phrasesOnly ? regs.slice(0, 1) : regs) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        terms.add(m[0].toLowerCase());
        if (!first || m.index < first.index) first = { index: m.index, text: m[0] };
        if (terms.size > 12) break;
      }
    }
    if (terms.size) hits[cat] = { terms: [...terms], first };
  }
  return hits;
}

export function detectCategories(title = '', description = '') {
  // Strip German gender suffixes like (m/w/d) so "d" etc. don't leak into matches.
  const genderless = title.replace(/\((?:[mwfdx]\s*\/\s*)+[mwfdx]\)|\(all genders?\)/gi, ' ');
  const cleanTitle = genderless.replace(NON_CYBER_SECURITY, ' ');
  const negative = NEGATIVE_TITLE.test(genderless);
  const titleHits = scanCategories(cleanTitle);
  const strongTech = STRONG_TECH_TITLE.test(cleanTitle);
  if (Object.keys(titleHits).length && (!negative || strongTech)) {
    return { categories: Object.keys(titleHits), source: 'title', evidence: Object.values(titleHits)[0].first.text };
  }
  // Mixed titles ("Innovation – KI", "Prozessentwicklung mit agentischer KI") may still be technical: let the description decide, with a higher bar.
  // Customer-facing / people functions are never rescued by the description.
  const mixed = negative && !HARD_NEGATIVE_TITLE.test(genderless) && (Object.keys(titleHits).length > 0 || strongTech);
  const mixedBar = Object.keys(titleHits).length ? 4 : 5;
  if (negative && !mixed) return { categories: [], source: null, negativeTitle: true };
  if (!description) return { categories: [], source: null };
  // Description-only: count only domain phrases (not ubiquitous tokens like "Python" or "AI").
  const descHits = scanCategories(description, true);
  // Variants of the same buzzword ("cyber security", "cybersecurity", "security") count once, so company boilerplate can't reach the bar alone.
  const concept = (t) =>
    t.replace(/[\s-]/g, '')
      .replace(/^(cyber\w*|security|cybersicherheit|itsicherheit|informationssicherheit|informationsecurity|infosec)$/, 'security')
      .replace(/^(software\w*|developer|entwickler\w*)$/, 'software')
      .replace(/^(informatik\w*|computerscience)$/, 'cs');
  const strong = (h) => [...new Set(h.terms.map(concept))];
  const total = new Set(Object.values(descHits).flatMap(strong)).size;
  const cats = Object.entries(descHits)
    .filter(([, h]) => (mixed ? total >= mixedBar && strong(h).length >= 2 : strong(h).length >= 3))
    .sort((a, b) => b[1].terms.length - a[1].terms.length)
    .map(([c]) => c);
  if (mixed && !cats.length) return { categories: [], source: null, negativeTitle: true };
  return {
    categories: cats,
    source: cats.length ? 'description' : null,
    evidence: cats.length ? descHits[cats[0]].terms.slice(0, 4).join(', ') : null,
  };
}

// ---------------------------------------------------------------- dates
const MONTHS = {
  january: 1, jan: 1, januar: 1, jänner: 1, janvier: 1, gennaio: 1, enero: 1,
  february: 2, feb: 2, februar: 2, février: 2, fevrier: 2, febbraio: 2, febrero: 2,
  march: 3, mar: 3, märz: 3, maerz: 3, mars: 3, marzo: 3,
  april: 4, apr: 4, avril: 4, aprile: 4, abril: 4,
  may: 5, mai: 5, maggio: 5, mayo: 5,
  june: 6, jun: 6, juni: 6, juin: 6, giugno: 6, junio: 6,
  july: 7, jul: 7, juli: 7, juillet: 7, luglio: 7, julio: 7,
  august: 8, aug: 8, août: 8, aout: 8, agosto: 8,
  september: 9, sep: 9, sept: 9, septembre: 9, settembre: 9, septiembre: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, octobre: 10, ottobre: 10, octubre: 10,
  november: 11, nov: 11, novembre: 11, noviembre: 11,
  december: 12, dec: 12, dezember: 12, dez: 12, décembre: 12, decembre: 12, dicembre: 12, diciembre: 12,
};
const M_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const FULL_MONTH_ALT = Object.keys(MONTHS).filter((k) => k.length > 4 || k === 'juni' || k === 'juli' || k === 'june' || k === 'july').sort((a, b) => b.length - a.length).join('|');
const YEAR = `(20\\d{2}|'\\d{2})`;
const RANGE_SEP = `\\s*(?:-|–|—|to|until|till|bis(?:\\s+(?:zum|ende))?|through|thru|au|al|a)\\s*`;

const monthIdx = (s) => MONTHS[s.toLowerCase().replace(/\.$/, '')];
const yearNum = (s) => (s.startsWith("'") ? 2000 + Number(s.slice(1)) : Number(s));
const ym = (y, m) => y * 12 + (m - 1);
const fmt = (y, m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
const parseYm = (s) => {
  const [y, m] = s.split('-').map(Number);
  return ym(y, m);
};

const START_CTX = /(start|begin|commenc|beginn|eintritt|einstieg|termin|frühestens|fruehestens|earliest|available|verfügbar|zeitraum|period|\bab\b|\bfrom\b|as of|à partir|dès|a partire|desde|\bin\b|\bim\b|\bzum\b|\bfor\b|\bfür\b|intern|praktik|werkstudent|position|stelle)/i;
const NEG_CTX = /(deadline|apply\s+by|application|bewerbung|befristet|limited\s+(?:until|to)|fixed[\s-]term|bis\s+zum|bis\s+spätestens|spätestens|until|\btill\b|before|\bby\b|posted|veröffentlich|graduat|abschluss|expected|erwartet|closing|close|\bends?\b|\bende\b|end\s+date|enddatum|updated|aktualisiert|open(?:s|ing)?\s+on|will\s+open|valid|gültig|born|geboren|founded|gegründet|since|seit|copyright|©)/i;

const ASAP_RE = /\b(asap|as soon as possible|immediate(?:ly)?(?:\s+start)?|ab\s+sofort|sofort|zum\s+nächstmöglichen\s+(?:zeitpunkt|termin)|nächstmöglich\w*|dès que possible|al più presto|lo antes posible)\b/i;
const FLEX_RE = /\b(flexible\s+start(?:ing)?(?:\s+date)?|start(?:ing)?\s+dates?\s+(?:is\s+|are\s+)?flexible|flexible[rn]?\s+(?:start|eintritt|einstieg|beginn|starttermin|eintrittstermin)|start(?:termin)?\s+(?:ist\s+)?flexibel|eintritt\w*\s+(?:ist\s+)?flexibel|nach\s+vereinbarung|nach\s+absprache|by\s+(?:mutual\s+)?arrangement|rolling\s+start|year[\s-]round|ganzjährig)\b/i;

const SEASON_RE = new RegExp(
  `\\b(spring|frühjahr|frühling|fruehjahr|summer|sommer|fall|autumn|herbst|winter|wintersemester|sommersemester|early|anfang|beginning\\s+of|start\\s+of|q[1-4]|first\\s+quarter|1st\\s+quarter|h1|first\\s+half\\s+of|erste[ns]?\\s+(?:quartal|halbjahr)|mid|mitte)\\s*(?:of\\s+)?(?:semester\\s+)?${YEAR}(?:\\s*\\/\\s*(\\d{2,4}))?`,
  'gi',
);

function seasonMonths(word, y, y2) {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  const m = (list, yy = y) => list.map((mm) => (Array.isArray(mm) ? { y: mm[0], m: mm[1] } : { y: yy, m: mm }));
  if (/^(spring|frühjahr|frühling|fruehjahr)$/.test(w)) return m([3, 4, 5]);
  if (/^(summer|sommer)$/.test(w)) return m([6, 7, 8]);
  if (/^(fall|autumn|herbst)$/.test(w)) return m([9, 10, 11]);
  if (w === 'sommersemester') return m([4]);
  if (w === 'wintersemester') return m([10]);
  if (w === 'winter') return y2 ? m([[y, 12], [y + 1, 1], [y + 1, 2]]) : m([1, 2, 12]);
  if (/^(early|anfang|beginning of|start of|q1|first quarter|1st quarter)$/.test(w)) return m([1, 2, 3]);
  if (w === 'q2') return m([4, 5, 6]);
  if (w === 'q3') return m([7, 8, 9]);
  if (w === 'q4') return m([10, 11, 12]);
  if (/^(h1|first half of)$/.test(w) || /halbjahr/.test(w)) return m([1, 2, 3, 4, 5, 6]);
  if (/quartal/.test(w)) return m([1, 2, 3]);
  if (/^(mid|mitte)$/.test(w)) return m([5, 6, 7]);
  return [];
}

function clauseBefore(text, idx, len = 80) {
  const before = text.slice(Math.max(0, idx - len), idx);
  const cut = Math.max(before.lastIndexOf('.\n'), before.lastIndexOf('\n'), before.lastIndexOf('. '), before.lastIndexOf('!'), before.lastIndexOf('?'));
  return cut >= 0 ? before.slice(cut + 1) : before;
}

export function extractStart(text = '', title = '', refDate = new Date()) {
  const result = { mentions: [], seasons: [], asap: null, flexible: null, yearOnly: null, ranges: [] };
  const full = `${title}\n${text}`;
  const masked = full.split('');
  const mask = (i, l) => {
    for (let k = i; k < i + l; k++) masked[k] = ' ';
  };
  const isMasked = (i) => masked[i] === ' ' && full[i] !== ' ';

  // 1) Ranges: "January – June 2027", "Jan 2027 to Jun 2027"
  const rangeRe = new RegExp(`\\b(${M_ALT})\\.?\\s*${YEAR}?${RANGE_SEP}(${M_ALT})\\.?\\s*${YEAR}`, 'gi');
  let m;
  while ((m = rangeRe.exec(full))) {
    const m1 = monthIdx(m[1]);
    const m2 = monthIdx(m[3]);
    if (!m1 || !m2) continue;
    const y2 = yearNum(m[4]);
    const y1 = m[2] ? yearNum(m[2]) : m1 <= m2 ? y2 : y2 - 1;
    const months = ym(y2, m2) - ym(y1, m1) + 1;
    if (months < 1 || months > 24) continue;
    const ctx = clauseBefore(full, m.index);
    if (/(application|bewerbung|apply)/i.test(ctx)) continue;
    result.mentions.push({ y: y1, m: m1, ctx: 'start', raw: m[0], index: m.index });
    result.ranges.push({ months, raw: m[0], index: m.index });
    mask(m.index, m[0].length);
  }
  // numeric ranges "01.01.2027 - 30.06.2027"
  const numRange = /\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\s*(?:-|–|bis|to)\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})/g;
  while ((m = numRange.exec(full))) {
    const [y1, m1, y2, m2] = [Number(m[3]), Number(m[2]), Number(m[6]), Number(m[5])];
    if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) continue;
    const months = Math.round(ym(y2, m2) - ym(y1, m1) + (Number(m[4]) - Number(m[1])) / 30);
    result.mentions.push({ y: y1, m: m1, ctx: 'start', raw: m[0], index: m.index });
    if (months >= 1 && months <= 24) result.ranges.push({ months, raw: m[0], index: m.index });
    mask(m.index, m[0].length);
  }
  // Month lists: "starting in either May, June or July 2027"
  const listRe = new RegExp(`\\b((?:${M_ALT})(?:\\s*,\\s*(?:${M_ALT}))*\\s*,?\\s+(?:or|oder|and|und)\\s+(?:${M_ALT}))\\s+${YEAR}\\b`, 'gi');
  while ((m = listRe.exec(full))) {
    if (isMasked(m.index)) continue;
    const y = yearNum(m[2]);
    const months = m[1].split(/\s*,\s*|\s+(?:or|oder|and|und)\s+/i).map((w) => monthIdx(w.trim())).filter(Boolean);
    if (months.length < 2 || y < 2025 || y > 2030 || NEG_CTX.test(clauseBefore(full, m.index))) continue;
    result.seasons.push({ months: months.map((mo) => ({ y, m: mo })), raw: m[0], index: m.index });
    mask(m.index, m[0].length);
  }

  // 2) Single dates
  const addMention = (y, mo, idx, raw) => {
    if (!mo || mo < 1 || mo > 12 || y < 2024 || y > 2030 || isMasked(idx)) return;
    const clause = clauseBefore(full, idx);
    if (NEG_CTX.test(clause)) return;
    const ctx = START_CTX.test(clause) || idx < title.length ? 'start' : 'loose';
    result.mentions.push({ y, m: mo, ctx, raw, index: idx });
  };
  const patterns = [
    [/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2})\b/g, (x) => [Number(x[3]), Number(x[2])]],
    [/\b(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?\b/g, (x) => [Number(x[1]), Number(x[2])]],
    [new RegExp(`\\b(${M_ALT})\\.?\\s*,?\\s*(?:of\\s+)?${YEAR}\\b`, 'gi'), (x) => [yearNum(x[2]), monthIdx(x[1])]],
    [/\b(0?[1-9]|1[0-2])\s?[./]\s?(20\d{2})\b/g, (x) => [Number(x[2]), Number(x[1])]],
  ];
  for (const [re, conv] of patterns) {
    re.lastIndex = 0;
    while ((m = re.exec(full))) {
      if (isMasked(m.index)) continue;
      const [y, mo] = conv(m);
      addMention(y, mo, m.index, m[0]);
      mask(m.index, m[0].length);
    }
  }
  // Month without a year right after a start keyword: "starting in January" → next occurrence.
  const noYear = new RegExp(`\\b(?:start\\w*|begin\\w*|beginn\\w*|ab|from|eintritt\\w*)\\s+(?:in\\s+|im\\s+|on\\s+|early\\s+|anfang\\s+|zum\\s+|1\\.\\s*)?(${FULL_MONTH_ALT})\\b(?!\\s*\\.?\\s*(?:20\\d{2}|'\\d{2}))`, 'gi');
  while ((m = noYear.exec(full))) {
    const word = m[1];
    if (word[0] !== word[0].toUpperCase()) continue;
    const mo = monthIdx(word);
    const refY = refDate.getUTCFullYear();
    const refM = refDate.getUTCMonth() + 1;
    const y = mo < refM - 1 ? refY + 1 : refY;
    if (!isMasked(m.index)) result.mentions.push({ y, m: mo, ctx: 'start', raw: m[0], index: m.index, inferredYear: true });
  }

  // 3) Seasons
  SEASON_RE.lastIndex = 0;
  while ((m = SEASON_RE.exec(full))) {
    const clause = clauseBefore(full, m.index);
    if (/(application|bewerbung|graduat|abschluss)/i.test(clause)) continue;
    const y = yearNum(m[2]);
    const y2 = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    const months = seasonMonths(m[1], y, y2);
    if (months.length && y >= 2025 && y <= 2030) result.seasons.push({ months, raw: m[0], index: m.index });
  }

  const a = full.match(ASAP_RE);
  if (a) result.asap = { raw: a[0], index: a.index };
  const f = full.match(FLEX_RE);
  if (f) result.flexible = { raw: f[0], index: f.index };
  const yo = title.match(/\b(202[6-8])\b/);
  if (yo) result.yearOnly = Number(yo[1]);
  return result;
}

// ---------------------------------------------------------------- duration
const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, cinq: 5, six_fr: 6, cinque: 5, sei: 6, seis: 6, cinco: 5,
};
const NUM = `(\\d{1,2}|${Object.keys(NUM_WORDS).filter((k) => !k.includes('_')).sort((a, b) => b.length - a.length).join('|')})`;
const toNum = (s) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s.toLowerCase()]);
const MONTH_UNIT = `(?:months?|monate?n?|monats?|mois|mesi|meses|mo\\.)`;
const WEEK_UNIT = `(?:weeks?|wochen|semaines|settimane|semanas)`;
const DUR_SKIP_AFTER = /^\W{0,3}(?:of\s+|an\s+)?(?:\w+\s+){0,2}(experience|erfahrung|berufserfahrung|old|ago|notice|kündigung|probation|probezeit|after|nach\s+(?:start|beginn)|onboarding|einarbeitung|training|elternzeit|parental)/i;
const DUR_SKIP_BEFORE = /(within|innerhalb|after|nach|every|alle|\blast\b(?!\s+(?:for|about|around|approximately|approx\.?)\b)|letzten|first|ersten|ago|experience|erfahrung|vor|older|probation|probezeit|notice|kündigungsfrist|parental|elternzeit|onboarding|einarbeitung)\W*(?:\w+\W+){0,2}$/i;
const DUR_CONTEXT = /(intern|praktik|duration|dauer|lasts?|lasting|runs?\s+for|spans?|laufzeit|zeitraum|period|length|länge|for\s+(?:a|at\s+least|a\s+minimum|min)|für|of|von|mindestens|minimum|at\s+least|min\.|stage|tirocinio|werkstudent|commit)/i;

export function extractDuration(text = '', title = '') {
  const full = `${title}\n${text}`;
  const found = [];
  const push = (min, max, raw, index, unit) => {
    const before = full.slice(Math.max(0, index - 40), index);
    const after = full.slice(index + raw.length, index + raw.length + 45);
    if (DUR_SKIP_BEFORE.test(before) && !/(mindestens|minimum|at least|min\.)\W*$/i.test(before)) return;
    if (DUR_SKIP_AFTER.test(after)) return;
    const factor = unit === 'w' ? 1 / 4.345 : 1;
    const lo = min != null ? Math.round(min * factor * 2) / 2 : null;
    const hi = max != null ? Math.round(max * factor * 2) / 2 : null;
    if ((lo ?? hi) > 24 || (hi ?? lo) < 0.5) return;
    const contextual = DUR_CONTEXT.test(clauseBefore(full, index, 60)) || index < title.length;
    found.push({ min: lo, max: hi, raw, index, contextual });
  };
  const sources = [
    [MONTH_UNIT, 'm'],
    [WEEK_UNIT, 'w'],
  ];
  for (const [unit, u] of sources) {
    let m;
    const minRe = new RegExp(`\\b(?:at\\s+least|a\\s+minimum\\s+of|minimum(?:\\s+of)?|min\\.?|mindestens|minimal|wenigstens|au\\s+moins|almeno|mínimo\\s+de)\\s+${NUM}\\s*[-‑]?\\s*${unit}`, 'gi');
    while ((m = minRe.exec(full))) push(toNum(m[1]), null, m[0], m.index, u);
    const upRe = new RegExp(`\\b(?:up\\s+to|bis\\s+zu|maximal|max\\.?|maximum(?:\\s+of)?|jusqu'à)\\s+${NUM}\\s*[-‑]?\\s*${unit}`, 'gi');
    while ((m = upRe.exec(full))) push(null, toNum(m[1]), m[0], m.index, u);
    const rangeRe = new RegExp(`\\b${NUM}\\s*(?:-|–|—|to|bis|or|oder|à|a)\\s*${NUM}\\s*[-‑]?\\s*${unit}`, 'gi');
    while ((m = rangeRe.exec(full))) {
      const a = toNum(m[1]);
      const b = toNum(m[2]);
      if (a && b && b >= a) push(a, b, m[0], m.index, u);
    }
    const plusRe = new RegExp(`\\b${NUM}\\s*\\+\\s*${unit}`, 'gi');
    while ((m = plusRe.exec(full))) push(toNum(m[1]), null, m[0], m.index, u);
    const singleRe = new RegExp(`\\b${NUM}\\s*[-‑]?\\s*${unit}`, 'gi');
    while ((m = singleRe.exec(full))) {
      if (found.some((f) => m.index >= f.index && m.index < f.index + f.raw.length)) continue;
      const before = full.slice(Math.max(0, m.index - 4), m.index);
      if (/[-–—+]\s*$|\b(?:to|bis|or|oder)\s$/i.test(before)) continue;
      const n = toNum(m[1]);
      push(n, n, m[0], m.index, u);
    }
  }
  const hy = full.match(/\b(half\s+a\s+year|six[\s-]month|halbes\s+jahr|halbjährig\w*)\b/i);
  if (hy) push(6, 6, hy[0], hy.index, 'm');
  const oy = full.match(/\b(one[\s-]year|1[\s-]year|ein\s+jahr|einjährig\w*|12[\s-]month)\s+(?:intern|praktik|placement|programme|program)/i);
  if (oy) push(12, 12, oy[0], oy.index, 'm');

  if (!found.length) return null;
  found.sort((a, b) => Number(b.contextual) - Number(a.contextual) || a.index - b.index);
  return found[0];
}

// ---------------------------------------------------------------- degree
const BACHELOR_RE =
  /\b(bachelor(?:'s|s|’s)?|bachelorstud\w*|bachelorand\w*|b\.\s?sc\.?|bsc|b\.\s?eng\.?|beng|b\.\s?tech|btech|undergrad(?:uate)?s?|vordiplom|all\s+(?:degree\s+)?levels|any\s+(?:degree\s+)?level|any\s+year\s+of\s+study|alle\s+semester|bachelor-?\s*(?:oder|or|\/)\s*master)\b/i;
const BACHELOR_CS = /\b(BS\/MS|BA\/BS|BS\/BA|BS\s+(?:or|\/)\s+MS|B\.S\.|BS\s+(?:degree|student|candidate)s?|BS\s+in\s+[A-Z]\w*)\b/;
const MASTER_RE =
  /\b(master(?:'s|s|’s)?\s*(?:student|degree|program\w*|studies|studium|studiengang|level|candidate|of\s+science)s?|masterstud\w*|im\s+master|enrolled\s+in\s+(?:a|an|your)\s+master\w*|m\.\s?sc\.?|msc)\b/i;
const MASTER_CS = /\b(MS\s+(?:students?|degree|program|Intern)|MS\/PhD|MSc)\b/;
const PHD_RE = /\b(ph\.?\s?d\.?|doctoral|doctorate|doktorand\w*)\b/i;
const COMPLETED_BACHELOR =
  /\b(?:completed|finished|hold(?:ing)?|obtained|already\s+(?:have|hold)|abgeschlossene[nrs]?|erfolgreich\s+abgeschlossen\w*)\s+(?:a\s+|an\s+|your\s+|the\s+|ein(?:en)?\s+|dein(?:en)?\s+|ihr(?:en)?\s+)?(?:first\s+)?(?:university\s+)?(?:bachelor|b\.?\s?sc|undergraduate)/i;
const STUDENT_GENERIC =
  /\b(enrolled|immatrikuliert|eingeschrieben|current(?:ly)?\s+(?:a\s+)?student|studierende\w*|student(?:in)?\s+(?:der|des|im|in|of)|studium\s+(?:der|des|im|in)|laufendes\s+studium|university\s+student|hochschulstud\w*|pursuing\s+(?:a|an|your)\s+(?:degree|studies)|degree\s+program\w*|studying|you\s+study|du\s+studierst|sie\s+studieren)\b/i;

export function evaluateDegree(title = '', text = '', type = 'internship') {
  const full = `${title}\n${text}`;
  if (PHD_RE.test(title) && !BACHELOR_RE.test(title) && !BACHELOR_CS.test(title))
    return { status: 'fail', label: 'PhD-level position', evidence: title };
  if ((/\b(masters?|MS|MSc)\s+(intern|internship|student)/i.test(title) || /\bmasters\s+internships?\b/i.test(title)) && !BACHELOR_RE.test(title) && !BACHELOR_CS.test(title) && !/undergrad/i.test(title))
    return { status: 'fail', label: "Master's students only", evidence: title };
  const b = full.match(BACHELOR_RE) || full.match(BACHELOR_CS);
  const completed = full.match(COMPLETED_BACHELOR);
  const ms = full.match(MASTER_RE) || full.match(MASTER_CS);
  const phd = full.match(PHD_RE);
  if (completed && ms) {
    return { status: 'fail', label: "Requires a completed Bachelor's (Master's level)", evidence: snippet(full, completed.index, completed[0].length) };
  }
  if (b) return { status: 'pass', label: "Bachelor's students accepted", evidence: snippet(full, b.index, b[0].length) };
  const higher = ms || phd;
  if (higher) {
    const before = full.slice(Math.max(0, higher.index - 80), higher.index);
    if (/(ideal|prefer|bevorzugt|vorzugsweise|wünschenswert|plus|von vorteil)/i.test(before))
      return { status: 'warn', label: "Master's preferred (Bachelor not mentioned)", evidence: snippet(full, higher.index, higher[0].length) };
    return { status: 'fail', label: phd && !ms ? 'PhD students only' : "Master's/PhD students only", evidence: snippet(full, higher.index, higher[0].length) };
  }
  const g = full.match(STUDENT_GENERIC);
  if (g) return { status: 'likely', label: 'Open to enrolled students (level not specified)', evidence: snippet(full, g.index, g[0].length) };
  if (type === 'working_student') return { status: 'likely', label: 'Working-student roles accept enrolled students', evidence: '' };
  return { status: 'unknown', label: 'Degree level not stated', evidence: '' };
}

// ---------------------------------------------------------------- evaluation
function evaluateLocation(loc, type, raw) {
  const label = loc.countries.length ? loc.countries.map((c) => COUNTRY_NAMES_EN[c] || c).join(', ') : raw.join('; ') || 'Unknown';
  if (type === 'working_student') {
    if (loc.germany) return { status: 'pass', label: loc.zurich ? 'Germany / Zurich' : 'Germany', evidence: raw.join('; ') };
    if (loc.zurich) return { status: 'pass', label: 'Zurich', evidence: raw.join('; ') };
    if (loc.switzerland) return { status: 'fail', label: 'Switzerland, but not Zurich', evidence: raw.join('; ') };
    if (!loc.countries.length) {
      if (loc.remote || loc.europeHint) return { status: 'warn', label: 'Remote / Europe – country unclear', evidence: raw.join('; ') };
      return { status: 'unknown', label: 'Location not stated', evidence: '' };
    }
    return { status: 'fail', label: `${label} (not Germany/Zurich)`, evidence: raw.join('; ') };
  }
  if (loc.germany || loc.switzerland) return { status: 'pass', label: [loc.germany && 'Germany', loc.switzerland && (loc.zurich ? 'Zurich' : 'Switzerland')].filter(Boolean).join(' / '), evidence: raw.join('; ') };
  if (loc.europe) return { status: 'warn', label: `${label} (Europe)`, evidence: raw.join('; ') };
  if (!loc.countries.length) {
    if (loc.europeHint) return { status: 'warn', label: 'Europe / EMEA', evidence: raw.join('; ') };
    return { status: 'unknown', label: 'Location not stated', evidence: '' };
  }
  return { status: 'fail', label: `${label} (outside Europe)`, evidence: raw.join('; ') };
}

function evaluateStart(start, type, crit, full, structuredStart) {
  const mentions = [...start.mentions];
  if (structuredStart) {
    const d = new Date(structuredStart);
    if (!Number.isNaN(d.getTime())) mentions.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, ctx: 'start', raw: `Start date field: ${structuredStart.slice(0, 10)}`, structured: true });
  }
  const startMentions = mentions.filter((x) => x.ctx === 'start');
  const loose = mentions.filter((x) => x.ctx === 'loose');
  const ev = (x) => (x.index != null ? snippet(full, x.index, x.raw.length) : x.raw);

  if (type === 'working_student') {
    const from = parseYm(crit.workingStudent.startFrom);
    const to = parseYm(crit.workingStudent.startTo);
    const minSane = from - 4;
    const relevant = startMentions.filter((x) => ym(x.y, x.m) >= minSane);
    const ok = relevant.find((x) => ym(x.y, x.m) <= to);
    if (ok) return { status: 'pass', label: ym(ok.y, ok.m) < from ? `From ${fmt(ok.y, ok.m)} (ongoing)` : `Starts ${fmt(ok.y, ok.m)}`, evidence: ev(ok) };
    if (start.asap) return { status: 'pass', label: 'ASAP start', evidence: snippet(full, start.asap.index, start.asap.raw.length) };
    if (start.flexible) return { status: 'pass', label: 'Flexible start', evidence: snippet(full, start.flexible.index, start.flexible.raw.length) };
    const seasonOk = start.seasons.find((s) => s.months.some((mm) => ym(mm.y, mm.m) >= from && ym(mm.y, mm.m) <= to));
    if (seasonOk) return { status: 'pass', label: seasonOk.raw, evidence: snippet(full, seasonOk.index, seasonOk.raw.length) };
    if (relevant.length) {
      const first = relevant.sort((a, b) => ym(a.y, a.m) - ym(b.y, b.m))[0];
      return { status: 'fail', label: `Starts ${fmt(first.y, first.m)} (after window)`, evidence: ev(first) };
    }
    const seasonLate = start.seasons.find((s) => s.months.every((mm) => ym(mm.y, mm.m) > to));
    if (seasonLate) return { status: 'fail', label: `${seasonLate.raw} (after window)`, evidence: snippet(full, seasonLate.index, seasonLate.raw.length) };
    return { status: 'unknown', label: 'Start not stated (usually ASAP)', evidence: '' };
  }

  const targets = crit.internship.targetStartMonths.map(parseYm);
  const tMin = Math.min(...targets);
  const tMax = Math.max(...targets);
  const inTarget = (x) => targets.includes(ym(x.y, x.m));
  const hit = startMentions.find(inTarget);
  if (hit) return { status: 'pass', label: `Starts ${fmt(hit.y, hit.m)}`, evidence: ev(hit) };
  const seasonHit = start.seasons.find((s) => s.months.some((mm) => targets.includes(ym(mm.y, mm.m))));
  if (seasonHit) return { status: 'pass', label: `Starts ${seasonHit.raw}`, evidence: snippet(full, seasonHit.index, seasonHit.raw.length) };
  if (start.flexible) return { status: 'pass', label: 'Flexible start date', evidence: snippet(full, start.flexible.index, start.flexible.raw.length) };
  const relevant = startMentions.filter((x) => ym(x.y, x.m) >= tMin - 6);
  if (relevant.length) {
    const close = relevant.find((x) => ym(x.y, x.m) >= tMin - 1 && ym(x.y, x.m) <= tMax + 1);
    if (close) return { status: 'warn', label: `Starts ${fmt(close.y, close.m)} (close to Jan/Feb)`, evidence: ev(close) };
    const first = relevant.sort((a, b) => Math.abs(ym(a.y, a.m) - tMin) - Math.abs(ym(b.y, b.m) - tMin))[0];
    return { status: 'fail', label: `Starts ${fmt(first.y, first.m)}`, evidence: ev(first) };
  }
  const seasonOther = start.seasons.find((s) => s.months.every((mm) => ym(mm.y, mm.m) >= tMin - 6));
  if (seasonOther) {
    const near = seasonOther.months.some((mm) => Math.abs(ym(mm.y, mm.m) - tMin) <= 2);
    return { status: near ? 'warn' : 'fail', label: `Starts ${seasonOther.raw}`, evidence: snippet(full, seasonOther.index, seasonOther.raw.length) };
  }
  if (start.asap) return { status: 'warn', label: 'ASAP start – ask about Jan/Feb', evidence: snippet(full, start.asap.index, start.asap.raw.length) };
  const looseHit = loose.find(inTarget);
  if (looseHit) return { status: 'warn', label: `Mentions ${fmt(looseHit.y, looseHit.m)}`, evidence: ev(looseHit) };
  if (start.yearOnly) return { status: 'unknown', label: `${start.yearOnly} intake – month not stated`, evidence: '' };
  return { status: 'unknown', label: 'Start date not stated', evidence: '' };
}

function evaluateDuration(dur, start, crit, full) {
  let d = dur;
  if (!d && start.ranges.length) d = { min: start.ranges[0].months, max: start.ranges[0].months, raw: start.ranges[0].raw, index: start.ranges[0].index };
  if (!d) return { status: 'unknown', label: 'Duration not stated', evidence: '', months: null };
  const lo = d.min ?? d.max;
  const hi = d.max ?? Infinity;
  const want = crit.internship.minMonths;
  const pref = crit.internship.preferredMonths;
  const text = d.min != null && d.max != null && d.min !== d.max ? `${d.min}–${d.max} months` : d.max == null ? `${lo}+ months` : d.min == null ? `up to ${hi} months` : `${lo} months`;
  const evidence = snippet(full, d.index, d.raw.length);
  if (hi < want) return { status: 'fail', label: `${text} (< ${want})`, evidence, months: d };
  if (lo <= pref && hi >= pref) return { status: 'pass', label: `${text} (${pref} possible)`, evidence, months: d, ideal: true };
  if (lo >= want) return { status: 'pass', label: text, evidence, months: d };
  return { status: 'pass', label: text, evidence, months: d };
}

const W = {
  location: { pass: 30, warn: 15, unknown: 8, fail: 0 },
  start: { pass: 25, warn: 12, unknown: 9, fail: 0 },
  duration: { pass: 16, warn: 8, unknown: 6, fail: 0 },
  degree: { pass: 15, likely: 11, warn: 6, unknown: 6, fail: 0 },
  category: { title: 10, description: 6 },
};

function scoreFor(type, c, categorySource, durationIdeal) {
  let s = W.location[c.location.status] + W.start[c.start.status] + W.degree[c.degree.status] + (W.category[categorySource] || 0);
  let max = 30 + 25 + 15 + 10;
  if (type === 'internship') {
    s += W.duration[c.duration.status] + (durationIdeal ? 4 : 0);
    max += 20;
  }
  return Math.round((100 * s) / max);
}

/**
 * job: { title, description, locations[], countries[], employmentType, startHint, postedAt }
 */
export function analyze(job, crit = defaultCriteria) {
  const title = job.title || '';
  const desc = job.description || '';
  const full = `${title}\n${desc}`;
  const { types, excludedReason } = detectTypes(title, job.employmentType);
  const cat = detectCategories(title, desc);
  const loc = resolveLocation(job.locations || [], job.countries || []);
  const refDate = job.postedAt ? new Date(job.postedAt) : new Date();
  const start = extractStart(desc, title, refDate);
  const dur = extractDuration(desc, title);

  const base = {
    types,
    categories: cat.categories,
    categorySource: cat.source,
    categoryEvidence: cat.evidence || null,
    countries: loc.countries,
    zurich: loc.zurich,
    remote: loc.remote,
  };
  if (!types.length) return { ...base, type: null, verdict: 'excluded', score: 0, reasons: [excludedReason || 'Not an internship / working-student role'], criteria: {} };

  const evals = types.map((type) => {
    const c = {
      location: evaluateLocation(loc, type, job.locations || []),
      start: evaluateStart(start, type, crit, full, job.startHint),
      degree: evaluateDegree(title, desc, type),
    };
    if (type === 'internship') c.duration = evaluateDuration(dur, start, crit, full);
    else if (dur) c.duration = { status: 'info', label: dur.min === dur.max ? `${dur.min} months` : `${dur.min ?? '?'}–${dur.max ?? '…'} months`, evidence: snippet(full, dur.index, dur.raw.length) };
    const relaxed = type === 'internship' && (crit.internship.relaxTimingSources || []).includes(job.source);
    if (relaxed) for (const k of ['start', 'duration']) if (c[k]?.status === 'fail') c[k] = { ...c[k], status: 'warn' };
    const reasons = [];
    if (!cat.categories.length) reasons.push(cat.negativeTitle ? 'Non-technical role' : 'Not ML / AI / Security / SWE');
    for (const [k, v] of Object.entries(c)) if (v.status === 'fail') reasons.push(`${k[0].toUpperCase()}${k.slice(1)}: ${v.label}`);
    const score = reasons.length ? 0 : scoreFor(type, c, cat.source, c.duration?.ideal);
    // The title must name the field for a "strong" match; description-only hits stay "possible".
    const timingOff = relaxed && ['start', 'duration'].some((k) => c[k]?.status === 'warn');
    const verdict = reasons.length ? 'excluded' : score >= crit.strongScore && cat.source === 'title' && !timingOff ? 'strong' : 'possible';
    return { type, criteria: c, reasons, score, verdict };
  });
  const order = { strong: 2, possible: 1, excluded: 0 };
  evals.sort((a, b) => order[b.verdict] - order[a.verdict] || b.score - a.score);
  const best = evals[0];
  return { ...base, ...best };
}
