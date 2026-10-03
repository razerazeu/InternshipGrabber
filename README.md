# Internship Grabber

A self-hosted dashboard that continuously scans company career sites and job boards for **internships** and
**working-student** roles in **Machine Learning, AI, Cyber Security and Software Engineering**. It checks every
posting against your criteria and pushes new matches to the browser in real time.

```bash
npm start            # http://localhost:3077 — polls every 20 min, live updates via Server-Sent Events
npm run once         # single scan, prints a summary and exits
npm test             # classifier, logo and scheduler tests
PORT=8080 POLL_MINUTES=10 npm start
```

Requires Node.js 20 or newer and has no dependencies. Data is stored in `data/jobs.json`, and your saved / applied / hidden
marks are stored in `data/user.json`.

## Criteria (edit in `src/config.js`)

| | Working student | Internship |
|---|---|---|
| Start | Oct 2026 – Jan 2027 (ASAP / flexible OK) | Jan / Feb 2027 (flexible OK; Dec/Mar shown as "close") |
| Degree | Bachelor's students accepted | Bachelor's students accepted |
| Duration | – | At least 5 months (5 preferred, "5–6 months" etc. accepted) |
| Location | Germany or Zurich area | Germany / Switzerland preferred, rest of Europe accepted |

Each criterion is checked separately. Select a posting in the list to see the results in the detail pane on the right, together with the text each result was based on and the full description. Each criterion is labelled:
- **Met** or **Likely:** meets the criterion
- **Partial:** borderline
- **Unknown:** not stated in the posting
- **Not met:** fails the criterion

Every posting gets a score from 0 to 100, which the list shows as a five-segment meter:
- **Strong:** no criterion fails, the score is high, and the role's field is named in the title.
- **Possible:** no criterion fails, but some information is missing.
- **Excluded:** at least one criterion fails. Choose "Include excluded" to see these postings and the reasons.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `J` / `K` or arrow keys | Next / previous posting |
| `O` or `Enter` | Open the posting in a new tab (double-clicking a row does the same) |
| `S` / `A` / `X` | Save, mark as applied, hide (press again to undo) |
| `/` | Search |
| `Esc` | Close the sources drawer, leave search, or close the detail sheet on small screens |

The interface is based on the Figma file [Internship Grabber - UI](https://www.figma.com/design/x6ZoeTGXTz01ySFzYIgWba). The file contains the row, chip, tab and button components with hover and selected variants, and a clickable prototype.

## Sources

| Source | Covers |
|---|---|
| Google Careers | Google internships in Europe |
| Apple Jobs | Apple internships in 15 European countries, plus Werkstudent roles in Germany |
| Amazon Jobs | Amazon / AWS in Germany, Switzerland and 15 other European countries |
| Microsoft & Qualcomm (Eightfold) | Microsoft and Qualcomm careers sites |
| Workday | NVIDIA, Intel, Salesforce, Adobe, CrowdStrike, Mastercard, HP, Novartis, PayPal, Red Hat, Broadcom, BlackRock, Airbus, Thales, Philips, Roche, Sanofi, Visa, Autodesk, Workday |
| Greenhouse / Lever / Ashby / Personio | ~94 tech companies, e.g. Stripe, Datadog, Databricks, Celonis, N26, Cohere, Perplexity, Anthropic… |
| SmartRecruiters | Bosch, Continental, Delivery Hero, ServiceNow, SIXT, NielsenIQ |
| Workable | Hugging Face |
| Bundesagentur für Arbeit | Germany's official job board. It covers nearly every German employer, including SAP, Siemens, BMW, Mercedes, Allianz, Telekom and Infineon. |
| Arbeitnow | German tech job board |
| jobs.ch | Zurich and Switzerland |

To add a company, add its board slug to the matching list in `src/config.js`, for example `greenhouse: { slug: 'Name' }`
or a Workday `{name, tenant, site, host}` entry. You can find the slug in the company's careers URL.

## How it works

1. **Collect.** Every 20 minutes, each source lists its postings.
2. **Filter.** Postings that aren't internships or working-student roles are dropped, as are postings located only outside Europe.
3. **Fetch details.** Full descriptions are fetched only for remaining candidates, and each description is downloaded once and cached.
4. **Classify.** `src/classify.js` reads English and German text: start dates ("ab 01.02.2027", "starting January 2027", "Q1 2027"), durations ("5–6 Monate"), degree level and location.
5. **Deduplicate.** The same posting found on several sources (e.g. on Bosch's ATS and on the Bundesagentur board) is merged into one entry.
6. **Notify.** New matches trigger a toast and an optional desktop notification. The first scan of each source counts as a baseline and doesn't notify.
7. **Detect closed postings.** A posting that disappears from its source is marked "possibly closed" and hidden by default.

## Company logos

Each posting shows the company's logo, served from `/api/logo/:id` and cached in `data/logos/`. The logo is found in this order:

1. The logo supplied by the job board (jobs.ch).
2. The company's own domain, taken from the posting URL or the employer homepage on the Bundesagentur listing. ATS and job-board domains are ignored.
3. A Clearbit company-name lookup. A result is accepted only when the domain clearly matches the company name and uses a European, company or tech top-level domain.

The icon itself comes from Google's favicon service, with DuckDuckGo as a fallback. If no logo is found, the company's initials are shown instead, and the lookup is retried after 7 days. Delete `data/logos/` to reset the cache.

## Limitations

- **SAP, Siemens and Meta** don't offer a public jobs API, so their postings come in through the Bundesagentur board (SAP and Siemens) or aren't covered (Meta).
- **LinkedIn and Indeed** are deliberately not scraped because their terms of service don't allow it.
- **Rule-based classification:** the classifier uses rules, not a language model. When a posting doesn't state something, it is marked "?" instead of guessed.
- **Google internships:** Google's European internships are 12–14 week summer roles, so they are correctly excluded under these criteria.
