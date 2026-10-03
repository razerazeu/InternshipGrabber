import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, detectTypes, detectCategories, extractDuration, extractStart, evaluateDegree } from '../src/classify.js';
import { resolveLocation } from '../src/geo.js';

const ref = new Date('2026-10-03');

test('type detection', () => {
  assert.deepEqual(detectTypes('Werkstudent Softwareentwicklung (m/w/d)').types, ['working_student']);
  assert.deepEqual(detectTypes('Working Student AI Engineering').types, ['working_student']);
  assert.deepEqual(detectTypes('Praktikum Machine Learning ab Januar 2027').types, ['internship']);
  assert.deepEqual(detectTypes('Software Engineering Intern, 2027').types, ['internship']);
  assert.deepEqual(detectTypes('Praktikant / Werkstudent IT-Security').types.sort(), ['internship', 'working_student']);
  assert.equal(detectTypes('Research Scientist PhD Intern, 2027').types.length, 0);
  assert.equal(detectTypes('Masterarbeit Computer Vision').types.length, 0);
  assert.equal(detectTypes('Internal Audit Specialist').types.length, 0);
  assert.equal(detectTypes('International Sales Manager').types.length, 0);
  assert.equal(detectTypes('Duales Studium Informatik').types.length, 0);
  assert.equal(detectTypes('Internship Program Coordinator').types.length, 0);
  assert.deepEqual(detectTypes('Data Team', 'Intern').types, ['internship']);
});

test('category detection', () => {
  assert.ok(detectCategories('Werkstudent KI-Entwicklung (m/w/d)').categories.includes('ai'));
  assert.ok(detectCategories('Intern – Penetration Testing').categories.includes('security'));
  assert.ok(detectCategories('Praktikum Softwareentwicklung').categories.includes('swe'));
  assert.ok(detectCategories('ML Engineer Intern').categories.includes('ml'));
  assert.deepEqual(detectCategories('Custom SOC Intern - 2027').categories, []);
  assert.deepEqual(detectCategories('Marketing Intern', 'We use AI, machine learning and python everywhere').categories, []);
  const d = detectCategories('Werkstudent (m/w/d)', 'Du entwickelst Machine Learning Modelle, trainierst Deep Learning Netze und arbeitest an Computer Vision.');
  assert.deepEqual(d.categories, ['ml']);
  assert.equal(d.source, 'description');
  // non-technical functions that merely mention AI, physical security, hardware/ops
  assert.deepEqual(detectCategories('Werkstudent Digital Marketing (PR & AI Search)').categories, []);
  assert.deepEqual(detectCategories('Working Student Designer (Design System) – Heartbeat AI (m/f/d)').categories, []);
  assert.deepEqual(detectCategories('(Physical) Security Specialist Intern -  2027 Internship').categories, []);
  assert.deepEqual(detectCategories('Operations Engineer Intern (Field)', 'software development, machine learning, computer vision, deep learning').categories, []);
  assert.ok(detectCategories('Werkstudent Marketing Technology – AI Engineer').categories.includes('ai'));
  assert.ok(detectCategories('Security Operations Center Intern').categories.includes('security'));
  assert.deepEqual(detectCategories('Werkstudent (m/w/d)', 'Python, Java, SQL, AI, KI, LLM').categories, []);
  assert.deepEqual(detectCategories('Operations Engineering Intern - start date Q1 2027').categories, []);
  assert.deepEqual(detectCategories('Business Developer Intern - 2027 - 12 Months').categories, []);
  assert.deepEqual(detectCategories('Werkstudent (m/w/d) Marketing / Produktmanagement Cyber Security', 'Kampagnen, Messen, Content').categories, []);
  assert.deepEqual(detectCategories('Business Development Manager – Internal Security', 'Security, cyber, threat, security').categories, []);
  assert.deepEqual(detectCategories('Werkstudent m/w/d IT', 'Softwareprojekte: Du arbeitest an Web-Anwendungen, Microservices und REST-Schnittstellen und nutzt Git.').categories, ['swe']);
  assert.deepEqual(detectCategories('Werkstudent Projektmanagement Software (w|m|d)').categories, []);
  assert.deepEqual(detectCategories('Internship- Sales or Solution Engineering Paths', 'agentic, ai agents, artificial intelligence, large language models, generative ai').categories, []);
  assert.deepEqual(detectCategories('Werkstudent*in Ladekommunikation & Softwareentwicklung').categories, ['swe']);
  assert.deepEqual(detectCategories('Security, Health & Safety Intern').categories, []);
  const agentic = 'Entwicklung von Agenten auf Basis von Large Language Models, Machine Learning Pipelines, Natural Language Processing und Deep Learning Modellen.';
  assert.ok(detectCategories('Pflichtpraktikum Prozessentwicklung mit agentischer KI - Innovation', agentic).categories.includes('ml'));
  assert.deepEqual(detectCategories('Werkstudent Marketing & KI', 'Social Media, Content, ChatGPT, Canva').categories, []);
  assert.deepEqual(
    detectCategories('Werkstudent within Radar Systems Engineering', 'leading group in defence and security, cyber security and cybersecurity. Student in Computer Science').categories,
    [],
  );
});

test('duration extraction', () => {
  assert.deepEqual(pick(extractDuration('Duration: 5-6 months, starting January 2027')), [5, 6]);
  assert.deepEqual(pick(extractDuration('Das Praktikum dauert sechs Monate.')), [6, 6]);
  assert.deepEqual(pick(extractDuration('für mindestens 5 Monate')), [5, null]);
  assert.deepEqual(pick(extractDuration('a 12-week summer internship')), [3, 3]);
  assert.equal(extractDuration('You have 6 months of experience with Python'), null);
  assert.equal(extractDuration('We reply within 2 weeks'), null);
});

test('start extraction', () => {
  const s = extractStart('Start: January 2027. Apply by November 15, 2026.', '', ref);
  assert.deepEqual(s.mentions.filter((m) => m.ctx === 'start').map((m) => [m.y, m.m]), [[2027, 1]]);
  const s2 = extractStart('Zeitraum: 01.02.2027 - 31.07.2027', '', ref);
  assert.deepEqual([s2.mentions[0].y, s2.mentions[0].m], [2027, 2]);
  assert.equal(s2.ranges[0].months, 6);
  const s3 = extractStart('Wir suchen dich ab sofort', '', ref);
  assert.ok(s3.asap);
  const s6 = extractStart('', 'Werkstudentin Data Scientist (a) 40-70% - befristet bis August 2028', ref);
  assert.ok(!s6.mentions.some((m) => m.ctx === 'start' && m.y === 2028));
  const s4 = extractStart('Internship from January to June 2027', '', ref);
  assert.deepEqual([s4.mentions[0].y, s4.mentions[0].m], [2027, 1]);
  const s5 = extractStart('starting in February for 5 months', '', ref);
  assert.deepEqual([s5.mentions[0].y, s5.mentions[0].m], [2027, 2]);
  assert.ok(extractStart('Summer 2027 Internship', '', ref).seasons.length);
});

test('degree evaluation', () => {
  assert.equal(evaluateDegree('SWE BS/MS Intern, 2027', '').status, 'pass');
  assert.equal(evaluateDegree('Data Scientist Product MS Intern, 2027', '').status, 'fail');
  assert.equal(evaluateDegree('Intern', 'You are enrolled in a Bachelor or Master program in CS').status, 'pass');
  assert.equal(evaluateDegree('Intern', 'You have completed your Bachelor and are enrolled in a Master’s program').status, 'fail');
  assert.equal(evaluateDegree('Intern', 'Currently enrolled in a Master’s degree program in Computer Science').status, 'fail');
  assert.equal(evaluateDegree('Werkstudent', 'Du bist immatrikuliert').status, 'likely');
});

test('geo', () => {
  assert.ok(resolveLocation(['Munich, Bavaria, Germany']).germany);
  const z = resolveLocation(['Rüschlikon']);
  assert.ok(z.switzerland && z.zurich);
  assert.ok(resolveLocation(['Mountain View, CA']).nonEuropeOnly);
  assert.ok(resolveLocation(['Remote - EMEA']).europeHint);
  assert.ok(resolveLocation(['Stuttgart, Baden-Württemberg']).germany);
  assert.ok(!resolveLocation(['Stuttgart, Baden-Württemberg']).switzerland);
  assert.deepEqual(resolveLocation(['Sydney, New South Wales']).countries, ['AU']);
  assert.ok(resolveLocation([], ['DEU']).germany);
});

test('end-to-end: strong internship', () => {
  const a = analyze({
    title: 'Software Engineering Intern (m/f/d)',
    description: 'Start: January 2027. Duration: 5–6 months. You are enrolled in a Bachelor’s or Master’s program in Computer Science.',
    locations: ['Berlin, Germany'],
    postedAt: '2026-10-01',
  });
  assert.equal(a.type, 'internship');
  assert.equal(a.verdict, 'strong');
  assert.equal(a.criteria.start.status, 'pass');
  assert.equal(a.criteria.duration.status, 'pass');
});

test('end-to-end: summer internship excluded', () => {
  const a = analyze({
    title: 'Machine Learning Intern – Summer 2027',
    description: '12-week internship. Bachelor students welcome.',
    locations: ['Zurich, Switzerland'],
  });
  assert.equal(a.verdict, 'excluded');
});

test('end-to-end: working student Zurich vs Basel', () => {
  const ok = analyze({ title: 'Working Student Software Engineering', description: 'Start ASAP. Bachelor students welcome.', locations: ['Zürich'] });
  assert.notEqual(ok.verdict, 'excluded');
  const no = analyze({ title: 'Working Student Software Engineering', description: 'Start ASAP.', locations: ['Basel, Switzerland'] });
  assert.equal(no.verdict, 'excluded');
  const late = analyze({ title: 'Werkstudent Cyber Security', description: 'Eintritt ab 01.04.2027', locations: ['München'] });
  assert.equal(late.verdict, 'excluded');
});

function pick(d) {
  return d ? [d.min, d.max] : null;
}

test('Google careers wording', () => {
  const g = extractDuration('Ability to complete a 13-17 week full-time internship in Germany starting in either May, June or July 2027.');
  assert.equal(g.min, 3);
  assert.equal(g.max, 4);
  assert.equal(extractDuration('Ability to complete a minimum 26 week internship starting in early 2027.').min, 6);
  assert.equal(extractDuration('The internship lasts 5 months and starts in February 2027.').min, 5);
  assert.equal(extractDuration('The internship will last for 6 months.').min, 6);
  assert.equal(extractDuration('Internship for 5 months in Munich.').min, 5);
  assert.equal(extractDuration('Projects shipped in the last 3 months'), null);
  assert.equal(evaluateDegree('Student Researcher', 'Currently pursuing a BS in Computer Science or related field.').status, 'pass');
});

test('Google internships are listed with their own dates', () => {
  const job = {
    source: 'google',
    title: 'Software Engineering, Site Reliability Engineering BS/MS Intern, 2027',
    description: 'Currently pursuing a BS/MS degree in Computer Science. Ability to complete a 13-17 week full-time internship in the internship location starting in either May, June or July 2027.',
    locations: ['Munich, Germany'],
    countries: ['DE'],
  };
  const a = analyze(job);
  assert.equal(a.verdict, 'possible');
  assert.equal(a.criteria.start.label, 'Starts May, June or July 2027');
  assert.equal(a.criteria.start.status, 'warn');
  assert.equal(a.criteria.duration.status, 'warn');
  assert.equal(analyze({ ...job, source: 'greenhouse' }).verdict, 'excluded');
});
