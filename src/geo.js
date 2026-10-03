// Resolves free-text locations (+ structured country codes) to ISO-2 countries and Zurich/remote flags.

export const EUROPE = new Set([
  'DE', 'CH', 'AT', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES', 'PT', 'IE', 'GB', 'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ',
  'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'GR', 'EE', 'LV', 'LT', 'MT', 'CY', 'RS', 'BA', 'ME', 'MK', 'AL', 'UA', 'MD',
  'LI', 'MC', 'XK',
]);

export const COUNTRY_NAMES_EN = {
  DE: 'Germany', CH: 'Switzerland', AT: 'Austria', NL: 'Netherlands', BE: 'Belgium', LU: 'Luxembourg', FR: 'France',
  IT: 'Italy', ES: 'Spain', PT: 'Portugal', IE: 'Ireland', GB: 'United Kingdom', DK: 'Denmark', SE: 'Sweden',
  NO: 'Norway', FI: 'Finland', IS: 'Iceland', PL: 'Poland', CZ: 'Czechia', SK: 'Slovakia', HU: 'Hungary',
  SI: 'Slovenia', HR: 'Croatia', RO: 'Romania', BG: 'Bulgaria', GR: 'Greece', EE: 'Estonia', LV: 'Latvia',
  LT: 'Lithuania', MT: 'Malta', CY: 'Cyprus', RS: 'Serbia', UA: 'Ukraine', US: 'United States', CA: 'Canada',
  IN: 'India', CN: 'China', JP: 'Japan', SG: 'Singapore', AU: 'Australia', IL: 'Israel',
};

const ISO3 = {
  DEU: 'DE', CHE: 'CH', AUT: 'AT', NLD: 'NL', BEL: 'BE', LUX: 'LU', FRA: 'FR', ITA: 'IT', ESP: 'ES', PRT: 'PT',
  IRL: 'IE', GBR: 'GB', DNK: 'DK', SWE: 'SE', NOR: 'NO', FIN: 'FI', ISL: 'IS', POL: 'PL', CZE: 'CZ', SVK: 'SK',
  HUN: 'HU', SVN: 'SI', HRV: 'HR', ROU: 'RO', BGR: 'BG', GRC: 'GR', EST: 'EE', LVA: 'LV', LTU: 'LT', MLT: 'MT',
  CYP: 'CY', SRB: 'RS', UKR: 'UA', USA: 'US', CAN: 'CA', IND: 'IN', CHN: 'CN', JPN: 'JP', SGP: 'SG', AUS: 'AU',
  BRA: 'BR', MEX: 'MX', ISR: 'IL', KOR: 'KR', TWN: 'TW', ARE: 'AE', ZAF: 'ZA', TUR: 'TR', ARG: 'AR', CHL: 'CL',
  COL: 'CO', NZL: 'NZ', HKG: 'HK', MYS: 'MY', PHL: 'PH', VNM: 'VN', IDN: 'ID', THA: 'TH', SAU: 'SA', EGY: 'EG',
  CRI: 'CR', PER: 'PE',
};

const COUNTRY_PATTERNS = [
  [/\b(germany|deutschland|allemagne|germania|alemania)\b/i, 'DE'],
  [/\b(switzerland|schweiz|suisse|svizzera|swiss)\b/i, 'CH'],
  [/\b(austria|österreich|oesterreich)\b/i, 'AT'],
  [/\b(netherlands|niederlande|nederland|holland)\b/i, 'NL'],
  [/\b(belgium|belgien|belgique)\b/i, 'BE'],
  [/\b(luxembourg|luxemburg)\b/i, 'LU'],
  [/\b(france|frankreich)\b/i, 'FR'],
  [/\b(italy|italien|italia)\b/i, 'IT'],
  [/\b(spain|spanien|españa|espana)\b/i, 'ES'],
  [/\bportugal\b/i, 'PT'],
  [/\b(ireland|irland)\b/i, 'IE'],
  [/\b(united kingdom|great britain|england|scotland|wales|northern ireland|großbritannien|vereinigtes königreich)\b/i, 'GB'],
  [/\bUK\b/, 'GB'],
  [/\b(denmark|dänemark|danmark)\b/i, 'DK'],
  [/\b(sweden|schweden|sverige)\b/i, 'SE'],
  [/\b(norway|norwegen|norge)\b/i, 'NO'],
  [/\b(finland|finnland|suomi)\b/i, 'FI'],
  [/\b(poland|polen|polska)\b/i, 'PL'],
  [/\b(czech republic|czechia|tschechien|česko)\b/i, 'CZ'],
  [/\b(slovakia|slowakei)\b/i, 'SK'],
  [/\b(hungary|ungarn)\b/i, 'HU'],
  [/\b(slovenia|slowenien)\b/i, 'SI'],
  [/\b(croatia|kroatien)\b/i, 'HR'],
  [/\b(romania|rumänien)\b/i, 'RO'],
  [/\b(bulgaria|bulgarien)\b/i, 'BG'],
  [/\b(greece|griechenland)\b/i, 'GR'],
  [/\b(estonia|estland)\b/i, 'EE'],
  [/\b(latvia|lettland)\b/i, 'LV'],
  [/\b(lithuania|litauen)\b/i, 'LT'],
  [/\bmalta\b/i, 'MT'],
  [/\b(cyprus|zypern)\b/i, 'CY'],
  [/\b(serbia|serbien)\b/i, 'RS'],
  [/\bukraine\b/i, 'UA'],
  [/\b(iceland|island)\b/i, 'IS'],
  [/\b(united states|usa|u\.s\.a?\.?)\b/i, 'US'],
  [/\bUS\b/, 'US'],
  [/\bcanada\b/i, 'CA'],
  [/\bindia\b/i, 'IN'],
  [/\b(china|prc)\b/i, 'CN'],
  [/\bjapan\b/i, 'JP'],
  [/\bsingapore\b/i, 'SG'],
  [/\baustralia\b/i, 'AU'],
  [/\b(brazil|brasil)\b/i, 'BR'],
  [/\bmexico\b/i, 'MX'],
  [/\bisrael\b/i, 'IL'],
  [/\bkorea\b/i, 'KR'],
  [/\btaiwan\b/i, 'TW'],
  [/\b(united arab emirates|uae)\b/i, 'AE'],
  [/\bsouth africa\b/i, 'ZA'],
  [/\b(turkey|türkiye)\b/i, 'TR'],
  [/\bargentina\b/i, 'AR'],
  [/\bhong kong\b/i, 'HK'],
  [/\bphilippines\b/i, 'PH'],
  [/\bmalaysia\b/i, 'MY'],
  [/\bvietnam\b/i, 'VN'],
  [/\bindonesia\b/i, 'ID'],
  [/\bnew zealand\b/i, 'NZ'],
  [/\bcosta rica\b/i, 'CR'],
  [/\bcolombia\b/i, 'CO'],
  [/\bchile\b/i, 'CL'],
  [/\bsaudi arabia\b/i, 'SA'],
  [/\begypt\b/i, 'EG'],
  [/\bthailand\b/i, 'TH'],
];

const CITIES = {
  DE: `berlin munich münchen muenchen munchen hamburg frankfurt stuttgart cologne köln koeln düsseldorf duesseldorf dusseldorf
    karlsruhe darmstadt heidelberg leipzig dresden nuremberg nürnberg nuernberg hannover hanover bonn aachen walldorf erlangen
    ingolstadt wolfsburg bremen essen dortmund mannheim potsdam jena freiburg ulm regensburg augsburg münster muenster kiel
    ludwigsburg böblingen boeblingen sindelfingen garching ottobrunn unterföhring unterschleißheim bielefeld paderborn
    kaiserslautern saarbrücken saarbruecken tübingen tuebingen wiesbaden mainz braunschweig göttingen goettingen würzburg
    wuerzburg gerlingen renningen abstatt leonberg hildesheim schweinfurt friedrichshafen immenstaad taufkirchen
    oberpfaffenhofen bochum duisburg wuppertal chemnitz magdeburg rostock lübeck luebeck oldenburg osnabrück heilbronn
    reutlingen konstanz kassel erfurt neckarsulm herzogenaurach ismaning oberkochen eschborn feldkirchen planegg martinsried
    neubiberg unterhaching manching ludwigshafen leverkusen gütersloh guetersloh homburg siegen trier koblenz offenburg
    weinheim bamberg bayreuth passau landshut rosenheim kempten wetzlar giessen gießen marburg fulda halle cottbus
    schwerin zwickau ilmenau stade lüneburg flensburg emden wilhelmshaven hürth huerth ratingen neuss krefeld mönchengladbach
    gelsenkirchen hagen hamm lippstadt minden herford detmold lemgo villingen-schwenningen sankt augustin`,
  CH: `zurich zürich zuerich geneva genève geneve genf basel bern berne lausanne lugano zug winterthur rüschlikon
    rueschlikon schlieren kloten opfikon glattbrugg wallisellen dübendorf duebendorf st. gallen luzern lucerne
    neuchâtel neuchatel fribourg sion chur aarau dietikon uster thalwil adliswil horgen baar rotkreuz allschwil villigen
    yverdon regensdorf wädenswil waedenswil schaffhausen olten solothurn bienne`,
  AT: 'vienna wien graz linz salzburg innsbruck klagenfurt villach',
  NL: `amsterdam rotterdam eindhoven utrecht the hague den haag delft leiden veldhoven groningen nijmegen enschede`,
  BE: 'brussels bruxelles brussel antwerp antwerpen ghent gent leuven liège liege mechelen',
  LU: 'luxembourg',
  FR: `paris lyon toulouse marseille nice sophia antipolis grenoble bordeaux nantes lille rennes montpellier strasbourg
    massy saclay palaiseau élancourt elancourt vélizy velizy`,
  IT: 'milan milano rome roma turin torino bologna naples napoli florence firenze pisa genoa genova padova',
  ES: 'madrid barcelona valencia seville sevilla malaga málaga bilbao getafe',
  PT: 'lisbon lisboa porto braga coimbra',
  IE: 'dublin cork galway limerick',
  GB: `london cambridge oxford manchester edinburgh glasgow bristol birmingham leeds belfast reading slough sheffield
    newcastle`,
  DK: 'copenhagen københavn kobenhavn aarhus odense lyngby',
  SE: 'stockholm gothenburg göteborg goteborg malmö malmo lund uppsala linköping linkoping',
  NO: 'oslo bergen trondheim',
  FI: 'helsinki espoo tampere oulu',
  PL: 'warsaw warszawa krakow kraków cracow wroclaw wrocław gdansk gdańsk poznan poznań lodz łódź katowice',
  CZ: 'prague praha brno ostrava',
  SK: 'bratislava košice kosice',
  HU: 'budapest debrecen',
  RO: 'bucharest bucurești bucuresti cluj-napoca iasi iași timisoara timișoara',
  BG: 'sofia',
  GR: 'athens thessaloniki',
  HR: 'zagreb',
  SI: 'ljubljana',
  RS: 'belgrade novi sad',
  EE: 'tallinn tartu',
  LV: 'riga',
  LT: 'vilnius kaunas',
  UA: 'kyiv kiev lviv',
  CY: 'limassol nicosia',
  MT: 'valletta msida',
  IS: 'reykjavik',
  US: `seattle redmond mountain view san francisco new york sunnyvale santa clara austin boston cupertino palo alto
    menlo park chicago los angeles san jose san diego bellevue atlanta denver pittsburgh washington kirkland
    san mateo foster city irvine raleigh durham portland phoenix dallas houston`,
  CA: 'toronto vancouver montreal montréal waterloo ottawa calgary',
  IN: 'bangalore bengaluru hyderabad pune mumbai chennai gurgaon gurugram noida delhi',
  CN: 'shanghai beijing shenzhen hangzhou',
  JP: 'tokyo osaka',
  IL: 'tel aviv haifa yokneam jerusalem herzliya',
  KR: 'seoul',
  TW: 'taipei hsinchu',
  AU: 'sydney melbourne brisbane',
  BR: 'são paulo sao paulo',
  SG: 'singapore',
  AE: 'dubai abu dhabi',
};

const ZURICH_AREA = new Set(
  `zurich zürich zuerich winterthur rüschlikon rueschlikon schlieren kloten opfikon glattbrugg wallisellen dübendorf
  duebendorf dietikon uster thalwil adliswil horgen regensdorf wädenswil waedenswil`.split(/\s+/).filter(Boolean),
);

// Multi-word cities first so "san francisco" wins over "francisco" etc.
const CITY_LIST = [];
for (const [cc, list] of Object.entries(CITIES)) {
  const tokens = list.split(/\s+/).filter(Boolean);
  const multi = [
    'sophia antipolis', 'the hague', 'den haag', 'mountain view', 'san francisco', 'new york', 'santa clara',
    'palo alto', 'menlo park', 'los angeles', 'san jose', 'san diego', 'tel aviv', 'são paulo', 'sao paulo', 'novi sad',
    'abu dhabi', 'st. gallen', 'foster city', 'san mateo', 'sankt augustin',
  ];
  const joined = ` ${tokens.join(' ')} `;
  for (const m of multi) if (joined.includes(` ${m} `)) CITY_LIST.push([m, cc]);
  for (const t of tokens) {
    if (multi.some((m) => m.split(' ').includes(t))) continue;
    CITY_LIST.push([t, cc]);
  }
}
CITY_LIST.sort((a, b) => b[0].length - a[0].length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CITY_RES = CITY_LIST.map(([name, cc]) => [
  new RegExp(`(^|[^\\p{L}])${escapeRe(name)}(?=$|[^\\p{L}])`, 'iu'),
  cc,
  name,
]);

const US_STATE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

export function normalizeCountryCode(c) {
  if (!c) return null;
  const s = String(c).trim().toUpperCase();
  if (s.length === 2) return s === 'UK' ? 'GB' : s;
  if (s.length === 3) return ISO3[s] || null;
  for (const [re, cc] of COUNTRY_PATTERNS) if (re.test(c)) return cc;
  return null;
}

export function resolveLocation(locations = [], countryHints = []) {
  const countries = new Set();
  const cities = new Set();
  let zurich = false;
  let remote = false;
  let europeHint = false;

  for (const c of countryHints) {
    const cc = normalizeCountryCode(c);
    if (cc) countries.add(cc);
  }

  for (const raw of locations) {
    if (!raw) continue;
    let s = String(raw)
      .replace(/new south wales/gi, 'Australia')
      .replace(/new mexico/gi, 'USA')
      .replace(/new england/gi, 'USA')
      .replace(/baden[\s-]w(ü|ue|u)rttemberg/gi, 'Germany')
      .replace(/cambridge,\s*(ma|massachusetts)\b/gi, 'Boston, USA');
    if (/\b(remote|home[\s-]?office|hybrid|mobile work|anywhere)\b/i.test(s)) remote = true;
    if (/\b(europe|emea|eu|europa|dach)\b/i.test(s)) europeHint = true;
    let found = false;
    for (const [re, cc] of COUNTRY_PATTERNS) {
      if (re.test(s)) {
        countries.add(cc);
        found = true;
      }
    }
    for (const [re, cc, name] of CITY_RES) {
      if (re.test(s)) {
        countries.add(cc);
        cities.add(name);
        if (cc === 'CH' && ZURICH_AREA.has(name)) zurich = true;
        found = true;
        s = s.replace(re, '$1 ');
      }
    }
    if (!found && US_STATE.test(String(raw))) countries.add('US');
  }
  if (/\b(zurich|zürich|zuerich)\b/i.test(locations.join(' '))) zurich = true;

  const list = [...countries];
  return {
    countries: list,
    cities: [...cities],
    zurich,
    remote,
    europeHint,
    germany: countries.has('DE'),
    switzerland: countries.has('CH'),
    europe: list.some((c) => EUROPE.has(c)),
    nonEuropeOnly: list.length > 0 && !list.some((c) => EUROPE.has(c)) && !europeHint,
  };
}
