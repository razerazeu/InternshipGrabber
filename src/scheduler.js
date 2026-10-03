// Polls all sources, enriches candidates with details, classifies and stores them.
import { EventEmitter } from 'node:events';
import { analyze, detectTypes } from './classify.js';
import { resolveLocation } from './geo.js';
import { mapLimit, hashId } from './util.js';
import { criteria, settings } from './config.js';

const MAX_DESC = 12000;
const DAY = 86400000;

export class Scheduler extends EventEmitter {
  constructor(store, sources) {
    super();
    this.store = store;
    this.sources = sources;
    this.running = new Set();
    this.lastRunAt = null;
  }

  reclassifyAll() {
    for (const job of Object.values(this.store.jobs)) job.analysis = analyze(job, criteria);
    this.store.save();
  }

  async runAll() {
    if (this.running.size) return false;
    this.lastRunAt = new Date().toISOString();
    await mapLimit(this.sources, settings.sourceConcurrency, (s) => this.runSource(s));
    this.prune();
    this.store.flush();
    this.emit('status');
    return true;
  }

  async runSource(src) {
    if (this.running.has(src.key)) return;
    this.running.add(src.key);
    const meta = this.store.sourceMeta(src.key);
    const firstRun = !meta.initialized;
    const warnings = [];
    const started = Date.now();
    meta.running = true;
    this.emit('status');
    const ctx = {
      firstRun,
      warn: (m) => warnings.length < 25 && warnings.push(m),
      isCandidateTitle: (t) => detectTypes(t).types.length > 0,
    };
    try {
      const raw = await src.list(ctx);
      const now = new Date().toISOString();
      const candidates = [];
      for (const r of raw) {
        if (!r.title || !detectTypes(r.title, r.employmentType).types.length) continue;
        if (resolveLocation(r.locations || [], r.countries || []).outOfScope) continue;
        candidates.push(r);
      }

      const fresh = [];
      await mapLimit(candidates, src.detailConcurrency || 4, async (r) => {
        const id = hashId(`${src.key}:${r.externalId}`);
        const prev = this.store.get(id);
        const job = {
          ...(prev || {}),
          id,
          source: src.key,
          sourceLabel: src.label,
          externalId: r.externalId,
          company: r.company,
          title: r.title,
          url: r.url,
          locations: r.locations || [],
          countries: r.countries || [],
          postedAt: r.postedAt || prev?.postedAt || null,
          employmentType: r.employmentType || prev?.employmentType || '',
          startHint: r.startHint || prev?.startHint || null,
          logoUrl: r.logoUrl || prev?.logoUrl || null,
          firstSeenAt: prev?.firstSeenAt || now,
          lastSeenAt: now,
        };
        if (r.description) job.description = r.description.slice(0, MAX_DESC);

        if (src.detail && !prev?.detailFetched && (prev?.detailAttempts || 0) < 3 && this.worthDetail(job)) {
          try {
            const d = await src.detail({ ...r, ...job, ref: r.ref }, ctx);
            for (const [k, v] of Object.entries(d || {})) {
              if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
              if (k === 'locations') job.locations = [...new Set([...job.locations, ...v])];
              else job[k] = k === 'description' ? v.slice(0, MAX_DESC) : v;
            }
            job.detailFetched = true;
          } catch (e) {
            job.detailAttempts = (prev?.detailAttempts || 0) + 1;
            ctx.warn(`detail ${r.title}: ${e.message}`);
          }
        } else if (prev?.detailFetched) {
          // Keep detail-derived fields from the first fetch.
          for (const k of ['description', 'locations', 'url', 'company', 'startHint', 'employmentType']) if (prev[k]) job[k] = prev[k];
          job.locations = [...new Set([...(prev.locations || []), ...(r.locations || [])])];
        }

        job.analysis = analyze(job, criteria);
        this.store.put(job);
        if (!prev && !firstRun && job.analysis.verdict !== 'excluded') fresh.push(job);
      });

      Object.assign(meta, {
        initialized: true,
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        rawCount: raw.length,
        candidateCount: candidates.length,
        newCount: fresh.length,
      });
      if (fresh.length) this.emit('new-jobs', fresh);
    } catch (e) {
      meta.lastError = e.message;
    } finally {
      Object.assign(meta, { running: false, lastRunAt: new Date(started).toISOString(), lastDurationMs: Date.now() - started, warnings });
      this.running.delete(src.key);
      this.store.save();
      this.emit('status');
    }
  }

  /** Skip expensive detail fetches when the list data alone already rules the posting out. */
  worthDetail(job) {
    const a = analyze(job, criteria);
    if (a.verdict !== 'excluded') return true;
    return !a.reasons.every((r) => /^(Location|Non-technical|Degree)/.test(r));
  }

  /** Drop excluded postings that disappeared from their source long ago, and stale matches after 60 days. */
  prune() {
    const now = Date.now();
    for (const [id, j] of Object.entries(this.store.jobs)) {
      const age = now - new Date(j.lastSeenAt).getTime();
      if ((j.analysis?.verdict === 'excluded' && age > 14 * DAY) || age > 60 * DAY) delete this.store.jobs[id];
    }
  }

  isStale(job) {
    const last = this.store.sourceMeta(job.source).lastSuccessAt;
    if (!last) return false;
    return new Date(last) - new Date(job.lastSeenAt) > settings.staleAfterHours * 3600000;
  }
}
