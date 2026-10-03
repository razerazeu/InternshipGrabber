const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PREFS_KEY = 'ig.prefs';
const prefs = Object.assign(
  { tab: 'working_student', verdict: 'possible', region: '', posted: '', sort: 'found', cats: [], showStale: false, showHidden: false },
  JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'),
);
const lastVisit = localStorage.getItem('ig.lastVisit') || new Date().toISOString();
localStorage.setItem('ig.lastVisit', new Date().toISOString());

const state = { jobs: [], withExcluded: false, categories: {}, limit: 60, live: new Set(), details: new Map(), status: null, logoIds: new Map(), noLogo: new Set(), sel: null, shown: [] };
const CRIT_NAMES = { location: 'Location', start: 'Start', degree: 'Degree', duration: 'Duration' };
const STATUS_LABEL = { pass: 'Met', likely: 'Likely', warn: 'Partial', unknown: 'Unknown', fail: 'Not met', info: 'Info' };
const VERDICT_LABEL = { strong: 'Strong match', possible: 'Possible match', excluded: 'Excluded' };
const TYPE_LABEL = { working_student: 'Working student', internship: 'Internship' };
const narrow = matchMedia('(max-width: 960px)');

// ------------------------------------------------------------ logos
// One logo request per company so the browser caches each image once.
const LEGAL = /\b(gmbh|ag|se|kg|kgaa|mbh|ug|e\.?\s?v\.?|co\.?|ltd\.?|inc\.?|llc|plc|sa|sarl|bv|holding|group|gruppe)\b/gi;
const coKey = (name) => String(name || '').toLowerCase().trim();
function indexLogos(jobs) {
  for (const j of jobs) if (!state.logoIds.has(coKey(j.company))) state.logoIds.set(coKey(j.company), j.id);
}
function initials(name) {
  const words = String(name || '?')
    .split(/\s+[-–|]\s+|,|\(/)[0]
    .replace(LEGAL, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
function hue(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function logo(j, cls = '') {
  const key = coKey(j.company);
  const id = state.logoIds.get(key) || j.id;
  const img = state.noLogo.has(key) ? '' : `<img src="/api/logo/${id}" alt="" loading="lazy" data-co="${esc(key)}">`;
  return `<div class="logo ${cls}" style="--h:${hue(key)}" title="${esc(j.company)}"><span>${esc(initials(j.company))}</span>${img}</div>`;
}
document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.dataset.co !== undefined) {
      state.noLogo.add(t.dataset.co);
      t.remove();
    }
  },
  true,
);

// ------------------------------------------------------------ data
async function loadJobs() {
  const ex = prefs.verdict === 'excluded';
  const r = await fetch(`/api/jobs${ex ? '?excluded=1' : ''}`).then((r) => r.json());
  state.jobs = r.jobs;
  state.withExcluded = ex;
  indexLogos(state.jobs);
  render();
}

async function init() {
  const c = await fetch('/api/criteria').then((r) => r.json());
  state.categories = c.categories;
  renderCriteria(c.criteria);
  for (const [k, v] of Object.entries(prefs)) {
    const el = document.getElementById(k);
    if (!el || el.tagName === 'BUTTON') continue;
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
  }
  $('#cats').innerHTML =
    `<button class="chip ${prefs.cats.length ? '' : 'on'}" data-cat="">All fields</button>` +
    Object.entries(state.categories)
      .map(([k, v]) => `<button class="chip ${prefs.cats.includes(k) ? 'on' : ''}" data-cat="${k}">${esc(v)}</button>`)
      .join('');
  setTab(prefs.tab);
  await loadJobs();
  connect();
  updateNotifyBtn();
}

function renderCriteria(c) {
  const ws = c.workingStudent;
  const it = c.internship;
  $('#criteria').innerHTML = `
    <div data-for="working_student"><b>Working student</b> starting ${ws.startFrom} to ${ws.startTo}, open to bachelor's students, in Germany or Zurich.</div>
    <div data-for="internship"><b>Internship</b> starting ${it.targetStartMonths.join(' or ')}, at least ${it.minMonths} months (${it.preferredMonths} preferred), open to bachelor's students. Germany or Switzerland first, rest of Europe accepted.</div>`;
}

// ------------------------------------------------------------ filtering
function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const now = Date.now();
  const rank = { strong: 2, possible: 1, excluded: 0 };
  const minRank = { strong: 2, possible: 1, excluded: 0 }[prefs.verdict];
  return state.jobs
    .filter((j) => {
      const a = j.analysis;
      if (prefs.tab === 'saved') {
        if (!['saved', 'applied'].includes(j.status)) return false;
      } else {
        if (prefs.tab !== 'all' && a.type !== prefs.tab) return false;
        if (rank[a.verdict] < minRank) return false;
        if (j.status === 'hidden' && !prefs.showHidden) return false;
        if (j.stale && !prefs.showStale) return false;
      }
      if (prefs.cats.length && !prefs.cats.some((c) => a.categories.includes(c))) return false;
      if (prefs.region) {
        const cs = a.countries || [];
        if (prefs.region === 'zurich' && !a.zurich) return false;
        if (prefs.region === 'dach' && !cs.some((c) => c === 'DE' || c === 'CH')) return false;
        if (prefs.region.length === 2 && !cs.includes(prefs.region)) return false;
      }
      if (prefs.posted) {
        const t = new Date(j.postedAt || j.firstSeenAt).getTime();
        if (now - t > Number(prefs.posted) * 86400000) return false;
      }
      if (q && !`${j.title} ${j.company} ${j.locations.join(' ')} ${j.sourceLabel}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (prefs.sort === 'score') return rank[b.analysis.verdict] - rank[a.analysis.verdict] || b.analysis.score - a.analysis.score;
      if (prefs.sort === 'posted') return (b.postedAt || b.firstSeenAt).localeCompare(a.postedAt || a.firstSeenAt);
      return b.firstSeenAt.localeCompare(a.firstSeenAt) || (b.postedAt || '').localeCompare(a.postedAt || '');
    });
}

// ------------------------------------------------------------ rendering
function ago(iso, short = false) {
  if (!iso) return 'unknown';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 60) return `${d} d ago`;
  if (short) return `${Math.round(d / 30)} mo ago`;
  return new Date(iso).toLocaleDateString();
}

const isNew = (j) => state.live.has(j.id) || j.firstSeenAt > lastVisit;
const jobById = (id) => state.jobs.find((j) => j.id === id);

function render() {
  const all = state.jobs;
  const visible = (j) => j.analysis.verdict !== 'excluded' && j.status !== 'hidden' && !j.stale;
  for (const t of ['working_student', 'internship']) $(`[data-count="${t}"]`).textContent = all.filter((j) => j.analysis.type === t && visible(j)).length;
  $('[data-count="saved"]').textContent = all.filter((j) => ['saved', 'applied'].includes(j.status)).length || '';
  $('[data-count="all"]').textContent = all.filter(visible).length;

  const list = filtered();
  const newCount = list.filter(isNew).length;
  $('#summary').innerHTML = `${list.length} match${list.length === 1 ? '' : 'es'}${newCount ? ` <span class="sep">/</span> <span class="new">${newCount} new since your last visit</span>` : ''}`;
  const prevIndex = state.shown.indexOf(state.sel);
  state.shown = list.slice(0, state.limit).map((j) => j.id);
  $('#list').innerHTML = list.slice(0, state.limit).map(row).join('') || `<div class="empty">No postings match these filters yet. New ones appear here automatically.</div>`;
  $('#more').hidden = list.length <= state.limit;

  if (!state.shown.includes(state.sel)) {
    state.sel = state.shown[Math.min(Math.max(prevIndex, 0), state.shown.length - 1)] ?? null;
    if (narrow.matches) document.body.classList.remove('pane-open');
  }
  markSelected();
  renderPane();
}

function shortLoc(j) {
  const first = j.locations[0];
  if (!first) return 'Location not stated';
  const city = first.split(/[,/]/)[0].trim();
  const cc = (j.analysis.countries || [])[0];
  const more = j.locations.length > 1 ? ` +${j.locations.length - 1}` : '';
  return `${city}${cc && !city.toUpperCase().includes(cc) ? `, ${cc}` : ''}${more}`;
}

function meter(a) {
  const n = a.verdict === 'excluded' ? 0 : Math.max(1, Math.round(a.score / 20));
  const segs = Array.from({ length: 5 }, (_, i) => `<s class="${i < n ? 'f' : ''}"></s>`).join('');
  return `<span class="meter ${a.verdict}" title="${VERDICT_LABEL[a.verdict] || ''}"><i>${segs}</i>${a.verdict === 'excluded' ? '--' : a.score}</span>`;
}

function row(j) {
  const a = j.analysis;
  const sep = '<span class="sep">/</span>';
  const meta = [
    isNew(j) && '<span class="new">New</span>',
    esc(shortLoc(j)),
    sep,
    TYPE_LABEL[a.type] || 'Other',
    a.categories.length && sep,
    a.categories.map((c) => esc(state.categories[c] || c)).join(', '),
    j.status === 'saved' && `${sep} <span class="flag">Saved</span>`,
    j.status === 'applied' && `${sep} <span class="flag">Applied</span>`,
    j.stale && `${sep} <span class="flag">Possibly closed</span>`,
  ]
    .filter(Boolean)
    .join(' ');
  return `<div class="row ${a.verdict} ${j.status === 'hidden' ? 'hidden-job' : ''} ${j.stale ? 'stale' : ''}" data-id="${j.id}" role="option" tabindex="-1">
    ${logo(j)}
    <div>
      <div class="r-co">${esc(j.company)}</div>
      <div class="r-title">${esc(j.title)}</div>
      <div class="r-meta mono">${meta}</div>
    </div>
    <div class="r-side">${meter(a)}<span class="mono muted">${ago(j.postedAt || j.firstSeenAt, true)}</span></div>
  </div>`;
}

function markSelected() {
  for (const el of $$('#list .row')) {
    const on = el.dataset.id === state.sel;
    el.classList.toggle('sel', on);
    el.setAttribute('aria-selected', on);
  }
}

function scoreLine(a) {
  const cs = Object.values(a.criteria || {});
  const met = cs.filter((c) => c.status === 'pass' || c.status === 'likely').length;
  const unknown = cs.filter((c) => c.status === 'unknown').length;
  return `${met} of ${cs.length} criteria met${unknown ? `, ${unknown} not stated in the posting` : ''}.`;
}

function renderPane() {
  const pane = $('#pane');
  const j = jobById(state.sel);
  if (!j) {
    pane.innerHTML = `<div class="p-empty"><div><p>Nothing selected</p><span>Pick a posting on the left to see how it fits.</span></div></div>`;
    return;
  }
  const a = j.analysis;
  const d = state.details.get(j.id);
  const crits = Object.entries(a.criteria || {})
    .map(
      ([k, c]) => `<div class="crit">
        <span class="mono">${CRIT_NAMES[k] || k}</span>
        <span class="val">${esc(c.label)}</span>
        <span class="st mono ${c.status}">${STATUS_LABEL[c.status] || c.status}</span>
        ${c.evidence ? `<span class="ev">"${esc(c.evidence)}"</span>` : ''}
      </div>`,
    )
    .join('');
  const catEv = a.categoryEvidence
    ? `<div class="crit"><span class="mono">Field</span><span class="val">${a.categories.map((c) => esc(state.categories[c] || c)).join(', ')}</span><span class="st mono info">Matched</span><span class="ev">"${esc(a.categoryEvidence)}"</span></div>`
    : '';
  const also = (j.alsoOn || []).map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.source.split(' (')[0])}</a>`).join(', ');
  const btn = (act, off, on) => `<button class="btn ${j.status === act ? 'on' : ''}" data-act="${act}">${j.status === act ? on : off}</button>`;
  pane.innerHTML = `
    <button class="btn close" data-act="close">Back to list</button>
    <div class="p-who">
      ${logo(j, 'lg')}
      <div><b>${esc(j.company)}</b><span class="mono">${TYPE_LABEL[a.type] || 'Other'} / ${esc(j.sourceLabel.split(' (')[0])}</span></div>
    </div>
    <h2 class="p-title"><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a></h2>
    <div class="p-loc">${esc(j.locations.join('  ·  ') || 'Location not stated')}</div>
    <div class="p-score ${a.verdict}">
      <span class="num">${a.verdict === 'excluded' ? '--' : a.score}</span>
      <div><span class="mono">${VERDICT_LABEL[a.verdict] || a.verdict}</span><p>${scoreLine(a)}</p></div>
    </div>
    <div class="crit-table">${crits}${catEv}</div>
    ${a.reasons?.length ? `<div class="p-reasons">Excluded: ${a.reasons.map(esc).join('; ')}</div>` : ''}
    <div class="p-actions">
      <a class="btn primary" href="${esc(j.url)}" target="_blank" rel="noopener" data-act="open">Open posting</a>
      ${btn('saved', 'Save', 'Saved')}
      ${btn('applied', 'Mark applied', 'Applied')}
      ${btn('hidden', 'Hide', 'Unhide')}
    </div>
    <div class="p-keys"><kbd>O</kbd><span>open</span><kbd>S</kbd><span>save</span><kbd>A</kbd><span>applied</span><kbd>X</kbd><span>hide</span></div>
    <div class="p-src">Posted ${ago(j.postedAt)}, found ${ago(j.firstSeenAt)} via ${esc(j.sourceLabel.split(' (')[0])}${also ? `. Also listed on ${also}` : ''}.</div>
    <div class="p-desc-h mono">Description</div>
    <div class="p-desc">${d === undefined || d === null ? '<span class="muted">Loading...</span>' : esc(d.description || 'No description available. Open the posting for details.')}</div>`;
  if (d === undefined) loadDetail(j.id);
}

async function loadDetail(id) {
  state.details.set(id, null);
  try {
    state.details.set(id, await fetch(`/api/jobs/${id}`).then((r) => r.json()));
  } catch {
    state.details.delete(id);
    return;
  }
  if (state.sel === id) renderPane();
}

function select(id, { open = false, scroll = true } = {}) {
  if (!id) return;
  const changed = id !== state.sel;
  state.sel = id;
  if (changed) {
    markSelected();
    renderPane();
    $('#pane').scrollTop = 0;
  }
  if (open && narrow.matches) document.body.classList.add('pane-open');
  if (scroll) $(`#list .row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function move(step) {
  if (!state.shown.length) return;
  const i = state.shown.indexOf(state.sel);
  const next = i < 0 ? 0 : Math.min(state.shown.length - 1, Math.max(0, i + step));
  if (next === state.shown.length - 1 && !$('#more').hidden && step > 0) {
    state.limit += 60;
    render();
  }
  select(state.shown[next]);
}

async function setStatus(id, act) {
  const job = jobById(id);
  if (!job) return;
  const status = job.status === act ? null : act;
  await fetch(`/api/jobs/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  job.status = status;
  render();
  if (status) toast(`${job.company}: ${{ saved: 'saved', applied: 'marked as applied', hidden: 'hidden' }[status]}`);
}

// ------------------------------------------------------------ events
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});
function setTab(tab) {
  prefs.tab = tab;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('#criteria [data-for]').forEach((d) => (d.hidden = !(tab === d.dataset.for || tab === 'all' || tab === 'saved')));
  state.limit = 60;
  save();
  render();
}

for (const id of ['verdict', 'region', 'posted', 'sort', 'showStale', 'showHidden']) {
  document.getElementById(id).addEventListener('change', (e) => {
    prefs[id] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    save();
    state.limit = 60;
    if (id === 'verdict' && (prefs.verdict === 'excluded') !== state.withExcluded) loadJobs();
    else render();
  });
}
let qTimer;
$('#q').addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(render, 150);
});
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const c = b.dataset.cat;
  if (!c) prefs.cats = [];
  else prefs.cats = prefs.cats.includes(c) ? prefs.cats.filter((x) => x !== c) : [...prefs.cats, c];
  $$('#cats .chip').forEach((el) => el.classList.toggle('on', el.dataset.cat ? prefs.cats.includes(el.dataset.cat) : !prefs.cats.length));
  save();
  render();
});
$('#more').addEventListener('click', () => {
  state.limit += 60;
  render();
});

$('#list').addEventListener('click', (e) => {
  const r = e.target.closest('.row');
  if (r) select(r.dataset.id, { open: true, scroll: false });
});
$('#list').addEventListener('dblclick', (e) => {
  const j = jobById(e.target.closest('.row')?.dataset.id);
  if (j) window.open(j.url, '_blank', 'noopener');
});

$('#pane').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') return document.body.classList.remove('pane-open');
  if (act === 'open') return;
  setStatus(state.sel, act);
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = e.target.closest?.('input, select, textarea');
  if (e.key === 'Escape') {
    if (typing) return e.target.blur();
    if (!$('#sources').hidden) return ($('#sources').hidden = true);
    return document.body.classList.remove('pane-open');
  }
  if (typing) {
    if (e.target.id === 'q' && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      e.target.blur();
      move(0);
    }
    return;
  }
  if (e.key === 'Enter' && e.target.closest?.('button, a')) return;
  const j = jobById(state.sel);
  switch (e.key.toLowerCase()) {
    case 'j':
    case 'arrowdown':
      e.preventDefault();
      return move(1);
    case 'k':
    case 'arrowup':
      e.preventDefault();
      return move(-1);
    case '/':
      e.preventDefault();
      return $('#q').focus();
    case 'o':
    case 'enter':
      if (j) window.open(j.url, '_blank', 'noopener');
      return;
    case 's':
      return j && setStatus(j.id, 'saved');
    case 'a':
      return j && setStatus(j.id, 'applied');
    case 'x':
      return j && setStatus(j.id, 'hidden');
  }
});

$('#refresh').addEventListener('click', async () => {
  const r = await fetch('/api/refresh', { method: 'POST' }).then((r) => r.json());
  toast(r.started ? 'Scanning all sources' : 'A scan is already running');
});
$('#sourcesBtn').addEventListener('click', () => ($('#sources').hidden = !$('#sources').hidden));
$('#closeSources').addEventListener('click', () => ($('#sources').hidden = true));

$('#notify').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('Notifications are not supported in this browser');
  if (Notification.permission === 'granted') {
    prefs.notify = !prefs.notify;
    save();
  } else {
    prefs.notify = (await Notification.requestPermission()) === 'granted';
    save();
  }
  updateNotifyBtn();
  toast(prefs.notify ? 'You will get a desktop notification for new matches' : 'Desktop notifications off');
});
function updateNotifyBtn() {
  const on = prefs.notify && 'Notification' in window && Notification.permission === 'granted';
  $('#notify').classList.toggle('on', !!on);
  $('#notify').textContent = on ? 'Notifying' : 'Notify me';
}

function save() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ------------------------------------------------------------ live updates
function connect() {
  const es = new EventSource('/api/events');
  const live = $('#live');
  es.onopen = () => {
    live.className = 'live on';
    live.lastChild.textContent = 'Live';
  };
  es.onerror = () => {
    live.className = 'live off';
    live.lastChild.textContent = 'Reconnecting';
  };
  es.addEventListener('status', (e) => renderStatus(JSON.parse(e.data)));
  es.addEventListener('new-jobs', (e) => {
    const jobs = JSON.parse(e.data);
    const known = new Set(state.jobs.map((j) => j.id));
    for (const j of jobs) {
      state.live.add(j.id);
      if (!known.has(j.id)) state.jobs.push(j);
    }
    indexLogos(jobs);
    render();
    const strong = jobs.filter((j) => j.analysis.verdict === 'strong');
    const msg = `${jobs.length} new match${jobs.length === 1 ? '' : 'es'}${strong.length ? ` (${strong.length} strong)` : ''}`;
    toast(`${msg}: ${jobs.slice(0, 3).map((j) => `${j.company}, ${j.title}`).join('; ')}`);
    if (prefs.notify && Notification.permission === 'granted') {
      const n = new Notification(`Internship Grabber: ${msg}`, { body: jobs.slice(0, 4).map((j) => `${j.company}: ${j.title}`).join('\n'), tag: 'ig-new', icon: '/favicon.svg' });
      n.onclick = () => window.focus();
    }
  });
}

let wasRunning = false;
function renderStatus(s) {
  state.status = s;
  const running = s.running;
  const ok = s.sources.filter((x) => x.lastSuccessAt).length;
  $('#runinfo').textContent = running ? 'Scanning sources' : `${ok} sources / scanned ${ago(s.lastRunAt)}`;
  $('#runinfo').title = s.nextRunAt ? `Next scan at ${new Date(s.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  $('#refresh').disabled = running;
  $('#refresh').textContent = running ? 'Scanning' : 'Scan now';
  if (wasRunning && !running) loadJobs();
  wasRunning = running;
  $('#sourceList').innerHTML = s.sources
    .map(
      (x) => `<div class="src ${x.lastError ? 'err' : x.running ? 'run' : x.lastSuccessAt ? 'ok' : ''}">
        <div><b>${esc(x.label)}</b><span class="muted">${x.running ? 'Running' : x.lastSuccessAt ? `OK ${ago(x.lastSuccessAt)}` : 'Pending'}</span></div>
        <div class="muted">${x.rawCount ?? 'n/a'} postings scanned, ${x.candidateCount ?? 'n/a'} relevant${x.lastDurationMs ? `, ${(x.lastDurationMs / 1000).toFixed(0)} s` : ''}</div>
        ${x.lastError ? `<div class="error">${esc(x.lastError)}</div>` : ''}
        ${x.warningCount ? `<details><summary>${x.warningCount} warnings</summary>${x.warnings.map((w) => `<div class="muted small">${esc(w)}</div>`).join('')}</details>` : ''}
      </div>`,
    )
    .join('');
}

const toastBox = $('#toasts');
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), 6000);
  setTimeout(() => t.remove(), 6600);
}

setInterval(() => state.status && renderStatus(state.status), 60000);
init();
