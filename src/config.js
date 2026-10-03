// Central configuration: your search criteria and the companies / boards that are polled.
// Edit freely — the server re-reads analysis rules for stored jobs on every start.

export const criteria = {
  workingStudent: {
    // Start window (inclusive, YYYY-MM). Earlier "from" dates / ASAP count as fine because the job is open now.
    startFrom: '2026-10',
    startTo: '2027-01',
    // Germany anywhere, or the Zurich area in Switzerland.
    locations: { germany: true, zurichOnlyInSwitzerland: true },
  },
  internship: {
    targetStartMonths: ['2027-01', '2027-02'],
    minMonths: 5,
    preferredMonths: 5,
    // Germany / Switzerland preferred, rest of Europe accepted.
    preferredCountries: ['DE', 'CH'],
    // Internships only (never working-student roles): Cairo area in Egypt, and Saudi Arabia with Jeddah preferred.
    // Saudi postings restricted to Saudi nationals (e.g. Tamheer-only) are excluded. See evaluateLocation in classify.js.
    extraCountries: ['EG', 'SA'],
    // Sources whose internships are listed even when start / duration miss the target
    // (shown as "Possible" with the posting's own dates). Google's 2027 roles are 13–17 week summer internships.
    relaxTimingSources: ['google'],
  },
  // Score threshold (0–100) for a "Strong match".
  strongScore: 72,
};

export const settings = {
  port: Number(process.env.PORT) || 3077,
  pollMinutes: Number(process.env.POLL_MINUTES) || 20,
  // A job counts as closed once its source has succeeded but not listed it for this long.
  staleAfterHours: 36,
  sourceConcurrency: 4,
};

export const greenhouse = {
  n26: 'N26', getyourguide: 'GetYourGuide', contentful: 'Contentful', grafanalabs: 'Grafana Labs', twilio: 'Twilio',
  dropbox: 'Dropbox', gitlab: 'GitLab', hellofresh: 'HelloFresh', traderepublic: 'Trade Republic', celonis: 'Celonis',
  cloudflare: 'Cloudflare', scaleai: 'Scale AI', raisin: 'Raisin', staffbase: 'Staffbase', commercetools: 'commercetools',
  stripe: 'Stripe', elastic: 'Elastic', airbnb: 'Airbnb', flix: 'Flix', bitpanda: 'Bitpanda', scandit: 'Scandit',
  adyen: 'Adyen', figma: 'Figma', pinterest: 'Pinterest', isaraerospace: 'Isar Aerospace', anthropic: 'Anthropic',
  okta: 'Okta', datadog: 'Datadog', mongodb: 'MongoDB', databricks: 'Databricks', discord: 'Discord', reddit: 'Reddit',
  samsara: 'Samsara', wise: 'Wise', solarisbank: 'Solaris', neuralink: 'Neuralink', trivago: 'trivago', xai: 'xAI',
  jetbrains: 'JetBrains', helsing: 'Helsing', sumup: 'SumUp', coinbase: 'Coinbase', gocardless: 'GoCardless',
  monzo: 'Monzo', asana: 'Asana', waymo: 'Waymo', onrunning: 'On', robinhood: 'Robinhood', affirm: 'Affirm',
  tamara: 'Tamara',
};

export const lever = {
  palantir: 'Palantir', spotify: 'Spotify', qonto: 'Qonto', pigment: 'Pigment', veepee: 'Veepee', zoox: 'Zoox',
  shieldai: 'Shield AI', mistral: 'Mistral AI',
};

export const ashby = {
  deepl: 'DeepL', linear: 'Linear', posthog: 'PostHog', modal: 'Modal', poolside: 'poolside',
  'black-forest-labs': 'Black Forest Labs', tacto: 'Tacto', rasa: 'Rasa', taktile: 'Taktile', n8n: 'n8n',
  synthesia: 'Synthesia', runway: 'Runway', character: 'Character.AI', supabase: 'Supabase', writer: 'Writer',
  replit: 'Replit', cognition: 'Cognition', cohere: 'Cohere', elevenlabs: 'ElevenLabs', lovable: 'Lovable',
  clickhouse: 'ClickHouse', notion: 'Notion', ramp: 'Ramp', perplexity: 'Perplexity', 'neko-health': 'Neko Health',
  harvey: 'Harvey', openai: 'OpenAI', thndr: 'Thndr',
};

export const smartrecruiters = {
  BoschGroup: 'Bosch', DeliveryHero: 'Delivery Hero', ServiceNow: 'ServiceNow', Continental: 'Continental',
  Sixt: 'SIXT', NielsenIQ: 'NielsenIQ',
};

export const workday = [
  ['NVIDIA', 'nvidia', 5, 'NVIDIAExternalCareerSite'],
  ['Salesforce', 'salesforce', 12, 'External_Career_Site'],
  ['Intel', 'intel', 1, 'External'],
  ['Adobe', 'adobe', 5, 'external_experienced'],
  ['CrowdStrike', 'crowdstrike', 5, 'crowdstrikecareers'],
  ['Mastercard', 'mastercard', 1, 'CorporateCareers'],
  ['HP', 'hp', 5, 'ExternalCareerSite'],
  ['Novartis', 'novartis', 3, 'Novartis_Careers'],
  ['Workday', 'workday', 5, 'Workday'],
  ['PayPal', 'paypal', 1, 'jobs'],
  ['Red Hat', 'redhat', 5, 'jobs'],
  ['Broadcom', 'broadcom', 1, 'External_Career'],
  ['BlackRock', 'blackrock', 1, 'BlackRock_Professional'],
  ['Airbus', 'ag', 3, 'Airbus'],
  ['Thales', 'thales', 3, 'Careers'],
  ['Philips', 'philips', 3, 'jobs-and-careers'],
  ['Roche', 'roche', 3, 'roche-ext'],
  ['Sanofi', 'sanofi', 3, 'SanofiCareers'],
  ['Visa', 'visa', 5, 'Visa'],
  ['Autodesk', 'autodesk', 1, 'Ext'],
].map(([name, tenant, wd, site]) => ({ name, tenant, site, host: `${tenant}.wd${wd}.myworkdayjobs.com` }));

export const eightfold = [
  { name: 'Microsoft', host: 'apply.careers.microsoft.com', domain: 'microsoft.com' },
  { name: 'Qualcomm', host: 'careers.qualcomm.com', domain: 'qualcomm.com' },
];

export const personio = {
  proglove: 'ProGlove', 'neura-robotics': 'NEURA Robotics', merantix: 'Merantix', twaice: 'TWAICE', ecosia: 'Ecosia',
  instagrid: 'instagrid', ottonova: 'ottonova', personio: 'Personio', '1komma5grad': '1KOMMA5°', thermondo: 'thermondo',
};

// Hugging Face, plus Cairo / Saudi tech companies (Foodics, Salla, Lucidya, Robusta).
export const workable = {
  huggingface: 'Hugging Face', foodics: 'Foodics', salla: 'Salla', lucidya: 'Lucidya', robusta: 'Robusta',
};

// Germany-wide public job board of the Federal Employment Agency — mirrors postings of SAP, Siemens,
// BMW, Mercedes, Allianz, Telekom, Infineon etc. that don't expose their own APIs.
export const bundesagenturQueries = [
  'Werkstudent Softwareentwicklung', 'Werkstudent Software', 'Werkstudent Informatik', 'Werkstudent Machine Learning',
  'Werkstudent Künstliche Intelligenz', 'Werkstudent KI', 'Werkstudent AI', 'Werkstudent Data Science',
  'Werkstudent IT-Sicherheit', 'Werkstudent Cyber Security', 'Werkstudent Informationssicherheit',
  'Working Student Software', 'Working Student Machine Learning', 'Working Student AI', 'Working Student Security',
  'Praktikum Softwareentwicklung', 'Praktikum Software', 'Praktikum Informatik', 'Praktikum Machine Learning',
  'Praktikum Künstliche Intelligenz', 'Praktikum KI', 'Praktikum Data Science', 'Praktikum IT-Sicherheit',
  'Praktikum Cyber Security', 'Internship Software', 'Internship Machine Learning', 'Internship AI',
  'Internship Security',
];

export const jobsChQueries = [
  'werkstudent informatik', 'werkstudent software', 'working student software', 'working student machine learning',
  'working student data science', 'praktikum informatik', 'praktikum software', 'praktikum machine learning',
  'internship software', 'internship machine learning', 'internship ai', 'internship security',
  'praktikum cyber security', 'praktikum ki',
];

// Wuzzuf (Egypt + Saudi Arabia). Full-text search; the classifier filters by field and city afterwards.
export const wuzzufQueries = ['intern', 'internship', 'trainee'];
