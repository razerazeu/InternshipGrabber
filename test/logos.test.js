import test from 'node:test';
import assert from 'node:assert/strict';
import { companyKey, domainBelongsTo, suggestionScore } from '../src/logos.js';

test('companyKey strips legal forms, branches and articles', () => {
  assert.equal(companyKey('Robert Bosch GmbH'), 'robert bosch');
  assert.equal(companyKey('Rohde & Schwarz GmbH & Co. KG'), 'rohde schwarz');
  assert.equal(companyKey('Die Autobahn GmbH des Bundes'), 'autobahn des bundes');
  assert.equal(companyKey('Amazon EU SARL (Spain Branch) - C16'), 'amazon eu');
  assert.equal(companyKey('IPG Automotive - Personio'), 'ipg automotive');
});

test('domainBelongsTo accepts company domains but not ATS or job-board hosts', () => {
  assert.ok(domainBelongsTo('www.bosch.de', 'Robert Bosch GmbH'));
  assert.ok(domainBelongsTo('careers.withwaymo.com', 'Waymo'));
  assert.ok(!domainBelongsTo('nvidia.wd5.myworkdayjobs.com', 'NVIDIA'));
  assert.ok(!domainBelongsTo('stark.jobs.personio.de', 'Stark'));
  assert.ok(!domainBelongsTo('boards.greenhouse.io', 'Celonis'));
});

test('suggestionScore rejects look-alike companies and foreign domains', () => {
  const s = (name, domain) => ({ name, domain });
  assert.ok(suggestionScore(s('Siemens', 'siemens.com'), 'siemens'));
  assert.ok(suggestionScore(s('BMW Group', 'bmwgroup.com'), 'bmw'));
  assert.ok(suggestionScore(s('MTU Aero Engines', 'mtu.de'), 'mtu aero engines'));
  assert.ok(!suggestionScore(s('Robert Bosch', 'boschaftermarket.com'), 'robert bosch'));
  assert.ok(!suggestionScore(s('PPI', 'portfoliopersonal.com'), 'ppi'));
  assert.ok(!suggestionScore(s('GFN.RU', 'gfn.ru'), 'gfn'));
  assert.ok(!suggestionScore(s('Perplexity Escape Games', 'perplexity.ca'), 'perplexity'));
  const best = [s('Perplexity Escape Games', 'perplexity.ca'), s('Perplexity AI', 'perplexity.ai')].sort((a, b) => suggestionScore(b, 'perplexity') - suggestionScore(a, 'perplexity'))[0];
  assert.equal(best.domain, 'perplexity.ai');
});
