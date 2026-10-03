import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Scheduler } from '../src/scheduler.js';

test('baseline run is silent, later runs emit only new matching jobs; details are cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
  const store = new Store(dir);
  let listing = [
    { externalId: '1', company: 'Acme', title: 'Werkstudent Softwareentwicklung (m/w/d)', url: 'https://x/1', locations: ['Berlin, Germany'] },
    { externalId: '2', company: 'Acme', title: 'Senior Backend Engineer', url: 'https://x/2', locations: ['Berlin'] },
  ];
  let detailCalls = 0;
  const src = {
    key: 'fake',
    label: 'Fake',
    list: async () => listing,
    detail: async () => {
      detailCalls++;
      return { description: 'Start: ab sofort. Du bist eingeschriebene/r Student/in im Bachelor Informatik.' };
    },
  };
  const sched = new Scheduler(store, [src]);
  const events = [];
  sched.on('new-jobs', (jobs) => events.push(jobs));

  await sched.runAll();
  assert.equal(events.length, 0, 'baseline should not notify');
  assert.equal(Object.keys(store.jobs).length, 1, 'non-student roles are not stored');
  assert.equal(detailCalls, 1);

  listing = [
    ...listing,
    { externalId: '3', company: 'Acme', title: 'Working Student Machine Learning', url: 'https://x/3', locations: ['Munich'] },
    { externalId: '4', company: 'Acme', title: 'Working Student Marketing', url: 'https://x/4', locations: ['Munich'] },
    { externalId: '5', company: 'Acme', title: 'Software Engineering Intern', url: 'https://x/5', locations: ['San Francisco, CA'] },
  ];
  await sched.runAll();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].map((j) => j.externalId), ['3']);
  assert.equal(detailCalls, 2, 'previously fetched details are cached; non-technical title skipped');
  assert.equal(store.get(events[0][0].id).analysis.verdict, 'strong');
  store.flush();
  fs.rmSync(dir, { recursive: true, force: true });
});
