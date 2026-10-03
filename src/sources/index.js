import { greenhouse, lever, ashby, smartrecruiters, workday, eightfold, personio, workable } from './ats.js';
import { amazon, google, apple } from './bigtech.js';
import { bundesagentur, arbeitnow, jobsch, wuzzuf } from './boards.js';

/**
 * Each source: { key, label, list(ctx) -> raw[], detail?(raw, ctx) -> partial, detailConcurrency? }
 * raw: { externalId, company, title, url, locations[], countries?[], postedAt?, description?, employmentType?, startHint?, ref? }
 */
export const sources = [
  google, apple, amazon, eightfold, workday, greenhouse, lever, ashby, smartrecruiters,
  personio, workable, bundesagentur, arbeitnow, jobsch, wuzzuf,
];
