// Tiny JSON-file persistence (atomic writes, debounced).
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'jobs.json');
    this.userFile = path.join(dir, 'user.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = { version: 1, meta: { sources: {} }, jobs: {} };
    this.user = { statuses: {} };
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {}
    try {
      this.user = { ...this.user, ...JSON.parse(fs.readFileSync(this.userFile, 'utf8')) };
    } catch {}
    this._timer = null;
  }

  get jobs() {
    return this.data.jobs;
  }
  get(id) {
    return this.data.jobs[id];
  }
  put(job) {
    this.data.jobs[job.id] = job;
    this.save();
  }
  sourceMeta(key) {
    return (this.data.meta.sources[key] ||= {});
  }
  setStatus(id, status) {
    if (!status) delete this.user.statuses[id];
    else this.user.statuses[id] = { status, at: new Date().toISOString() };
    this._write(this.userFile, this.user);
  }
  status(id) {
    return this.user.statuses[id]?.status || null;
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 1500);
  }
  flush() {
    clearTimeout(this._timer);
    this._write(this.file, this.data);
  }
  _write(file, obj) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, file);
  }
}
