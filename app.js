(function () {
'use strict';
const P_ = window.CoachParse;
const $ = id => document.getElementById(id);
const LS = localStorage;
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const FT = ['technical','true','drop set','myo-reps','not to failure'];
const FT_LABEL = {'technical':'Technical failure','true':'True failure','drop set':'Drop set','myo-reps':'Myo-reps','not to failure':'Not to failure'};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const jget = (k, d) => { try { const v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const jset = (k, v) => LS.setItem(k, JSON.stringify(v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function toast(m, ms) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', ms || 2400); }

// ---------- Back button: every open layer (settings, sheets, menus) owns one history entry ----------
const layers = []; let ignorePop = 0;
function pushLayer(name, close) {
  if (layers.some(l => l.name === name)) return;
  layers.push({ name, close }); history.pushState({ coach: name }, '');
}
function popLayer(name) { // closed from the UI: drop the matching history entry
  const i = layers.findIndex(l => l.name === name); if (i < 0) return;
  layers.splice(i, 1); ignorePop++; history.back();
}
function swapLayer(from, name, close) { // menu -> history: reuse the entry so states don't pile up
  const i = layers.findIndex(l => l.name === from);
  if (i < 0) return pushLayer(name, close);
  layers[i] = { name, close }; history.replaceState({ coach: name }, '');
}
const layerOpen = name => layers.some(l => l.name === name);
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  const l = layers.pop(); if (l) l.close();
});

// ---------- Config (hash setup link: #u=...&k=...) ----------
if (location.hash.length > 1) {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('u')) LS.setItem('coach_u', h.get('u').trim());
  if (h.get('k')) LS.setItem('coach_k', h.get('k').trim());
  if (h.get('p')) LS.setItem('coach_p', h.get('p'));
  history.replaceState(null, '', location.pathname + location.search);
}
window.addEventListener('hashchange', () => { if (/[#&](u|k)=/.test(location.hash)) location.reload(); });
let U = LS.getItem('coach_u') || '', K = LS.getItem('coach_k') || '';
let P = LS.getItem('coach_p') || 'jack';
let S = null, days = {}, dayKey = null, viewId = null, sig = '', formEx = null, firstRender = true;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// ---------- Backend ----------
async function apiGet() {
  const r = await fetch(U + (U.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(K) + '&profile=' + encodeURIComponent(P) + '&t=' + Date.now(), { cache: 'no-store', redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function apiPost(body) {
  const r = await fetch(U, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: K }, body)) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ---------- Offline queue ----------
// Items: {id, profile, action: 'log'|'undo'|'edit'|'finish'|'setting', ...}
// Test mode: everything goes to a local-only queue that is never sent; turning test mode off discards it.
const testOn = () => LS.getItem('coach_test') === '1';
const QK = () => testOn() ? 'coach_testq' : 'coach_queue';
const getQ = () => jget(QK(), []);
const setQ = q => { jset(QK(), q); badge(); };
const getRQ = () => jget('coach_queue', []);
const setRQ = q => { jset('coach_queue', q); badge(); };
function badge() { const n = getRQ().length, b = $('pending'); b.textContent = n + ' pending'; b.style.display = n ? 'inline-block' : 'none'; }
function enqueue(item) { const q = getQ(); q.push(Object.assign({ id: uid(), profile: P }, item)); setQ(q); if (!testOn()) flush(); }
const NEW_ACTIONS = ['edit', 'finish', 'setting'];
let flushing = false, warnedOld = false;
function bodyFor(it) {
  if (it.action === 'log') return { action: 'log', profile: it.profile, set: it.set };
  if (it.action === 'undo') return { action: 'undo', profile: it.profile, set_id: it.set_id };
  if (it.action === 'edit') return { action: 'edit', profile: it.profile, set_id: it.set_id, fields: it.fields };
  if (it.action === 'finish') return { action: 'finish', profile: it.profile, session: it.session };
  return { action: 'setting', profile: it.profile, scope: it.scope, key: it.key, value: it.value };
}
async function flush() {
  if (flushing || !U || !K) return;
  flushing = true; let changed = false;
  try {
    let skip = 0;
    while (true) {
      const q = getRQ(); if (q.length <= skip) break;
      const it = q[skip];
      let res;
      try { res = await apiPost(bodyFor(it)); }
      catch (e) { break; } // network: keep, retry later
      if (!res.ok && res.error === 'unauthorized') { showSettings('Key rejected by the backend. Check the key.'); break; }
      if (!res.ok && res.error === 'unknown action' && NEW_ACTIONS.includes(it.action)) {
        // Backend not redeployed yet: keep the item queued so it syncs after the update.
        if (!warnedOld) { warnedOld = true; toast('Saved on this phone. The backend needs its update before edits sync.', 4000); }
        skip++; continue;
      }
      if (!res.ok && !(it.action === 'edit' && res.error === 'not found')) toast('Dropped a queued item: ' + res.error);
      setRQ(getRQ().filter(x => x.id !== it.id)); changed = true;
      if (res.ok && res.row && S && it.profile === P && (it.action === 'log' || it.action === 'edit')) { S.rows = S.rows.filter(r => r.set_id !== res.row.set_id).concat([res.row]); }
    }
  } finally { flushing = false; }
  if (changed) load();
}
setInterval(flush, 15000);
window.addEventListener('online', flush);

// ---------- Rows view (server rows + pending) ----------
const tsOf = r => Date.parse(r.logged_at) || 0;
function viewRows() {
  if (!S) return [];
  const q = (testOn() ? getRQ().concat(getQ()) : getQ()).filter(x => x.profile === P);
  const undone = new Set(q.filter(x => x.action === 'undo').map(x => x.set_id));
  const have = new Set(S.rows.map(r => r.set_id));
  const pend = q.filter(x => x.action === 'log' && !have.has(x.set.set_id)).map(x => Object.assign({}, x.set, { date: x.date, rest_time: '', logged_at: new Date(x.set.client_ts).toISOString(), pending: true }));
  const edits = {};
  q.filter(x => x.action === 'edit').forEach(x => { edits[x.set_id] = Object.assign(edits[x.set_id] || {}, x.fields); });
  return S.rows.concat(pend).filter(r => !undone.has(r.set_id))
    .map(r => edits[r.set_id] ? Object.assign({}, r, edits[r.set_id], { pending: true }) : r)
    .sort((a, b) => tsOf(a) - tsOf(b));
}
function keysOf(ex) { return new Set(ex.match_keys.concat([P_.norm(ex.canonical), P_.norm(ex.name)])); }
function exFor(name) { const n = P_.norm(name); for (const ex of (days[dayKey] ? days[dayKey].exercises : [])) if (keysOf(ex).has(n)) return ex; for (const d of Object.values(days)) for (const ex of d.exercises) if (keysOf(ex).has(n)) return ex; return null; }
function rowsFor(ex, today) {
  const keys = keysOf(ex);
  return viewRows().filter(r => keys.has(P_.norm(r.exercise)) && (today ? widOf(r) === viewId : wIndex(widOf(r)) < wIndex(viewId)));
}
const loadOf = r => r.total_load || r.load;
function setTxt(r) {
  if (r.left_reps || r.right_reps) return (r.load || '-') + ' x L' + (r.left_reps || '?') + ' / R' + (r.right_reps || '?');
  return (r.load || '-') + ' x ' + r.reps;
}
function lastTime(ex) {
  const ls = lastSession(ex); if (!ls) return '';
  return 'Last time (' + wLabel(ls.date) + ', ' + ls.rows[0].date + '): ' + ls.rows.map(setTxt).join(', ');
}
function setsHTML(ex) {
  const rs = rowsFor(ex, true), n = Math.max(plannedCount(ex), rs.length);
  if (!n) return '<li class="s2 none">Skipped today.</li>';
  const name = esc(ex.canonical), t = getT();
  const half = ex.single && t && t.firstSide && P_.norm(t.exercise) === P_.norm(ex.canonical);
  let h = '<li class="shead"><span>SET</span><span>WEIGHT</span><span>REPS</span><span></span><span>LOG</span></li>';
  h += rs.map((r, i) => {
    const e = P_.e1rm(loadOf(r), r.reps);
    const bits = [FT_LABEL[r.failure_type] || r.failure_type, +r.drops ? (r.drops + (+r.drops === 1 ? ' drop' : ' drops')) : '',
      r.total_load ? ('total ' + r.total_load + ' lb') : '',
      r.pending ? 'pending sync' : (r.rest_time ? 'rest ' + r.rest_time : ''), e ? ('e1RM ' + e.ep + ' Epley / ' + e.br + ' Brzycki') : ''].filter(Boolean).join(' · ');
    const reps = (r.left_reps || r.right_reps) ? 'L' + (r.left_reps || '?') + ' R' + (r.right_reps || '?') : r.reps;
    return '<li data-sid="' + esc(r.set_id) + '" class="logged' + (r.pending ? ' pend' : '') + '"><div class="srow"><span class="sn">' + (i + 1) + '</span><span class="val">' + esc(r.load || '-') + (r.load && ex.bodyweight ? '<small> +</small>' : '') + '</span><span class="val">' + esc(reps) + ' ' + trend(ex, r, i) + '</span><span></span><span class="lg on">&#10003;</span></div><div class="s2">' + esc(bits) + (r.notes ? '<br>' + esc(r.notes) : '') + '</div></li>';
  }).join('');
  for (let i = rs.length; i < n; i++) {
    const sg = suggest(ex, i), w = (sg && sg.load) || '', r = (sg && sg.reps) || '';
    const isNext = i === rs.length;
    h += '<li class="plan"><div class="srow"><span class="sn">' + (i + 1) + '</span>' +
      '<span class="val sug">' + esc(w) + '</span><span class="val sug">' + esc(r) + '</span>' +
      '<button class="rm" data-rm="' + name + '" aria-label="Remove this set">&#10005;</button>' +
      '<button class="lg' + (half && isNext ? ' half' : '') + '" data-log="' + i + '" data-ex="' + name + '" aria-label="Log this set"' + ((isNext || testOn()) && isToday() ? '' : ' disabled') + '>' + (half && isNext ? '&#189;' : '') + '</button></div>' +
      (sg ? '<div class="s2">' + (sg.est ? '<b class="est">estimate</b> ' : '') + esc(sg.why) + (ex.single ? ' · reps per side' : '') + '</div>' : '') + '</li>';
  }
  return h;
}

// ---------- Per-exercise settings (equipment setup), body weight ----------
const SK = () => 'coach_settings_' + (testOn() ? 'test_' : '') + P;
const localSet = () => jget(SK(), {});
function getSetting(scope, key) {
  const l = localSet(); if (l[scope] && l[scope][key] != null) return l[scope][key];
  if (testOn()) { const r = jget('coach_settings_' + P, {}); if (r[scope] && r[scope][key] != null) return r[scope][key]; }
  const s = S && S.settings; return s && s[scope] && s[scope][key] != null ? s[scope][key] : null;
}
function putSetting(scope, key, value) {
  const l = localSet(); (l[scope] = l[scope] || {})[key] = value; jset(SK(), l);
  enqueue({ action: 'setting', scope, key, value });
}
function bodyweight() { const v = parseFloat(getSetting('profile', 'bodyweight')); return v > 0 ? v : null; }
function setupFor(ex) { const v = getSetting(ex.canonical, 'equipment'); return v != null ? v : (ex.setup || ''); }

// ---------- Session order, per-day exercise state, suggestions, trends, meso ----------
// ---------- Workouts (RP style): W<week>-<day>, done in order regardless of calendar date ----------
const trainDays = () => DAYS.filter(d => days[d]);
const wParse = id => { const m = /^W(\d+)-([a-z]+)$/.exec(id || ''); return m ? { w: +m[1], day: m[2] } : null; };
const wIndex = id => { const p = wParse(id); return p ? (p.w - 1) * 10 + DAYS.indexOf(p.day) : -1; };
const mondayOf = iso => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
const weekdayOf = iso => DAYS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];
function weekOf(iso) { const st = new Date(mesoCfg().start + 'T12:00:00'), d = new Date(iso + 'T12:00:00'); return Math.max(1, Math.floor((d - st) / 604800000) + 1); }
// Workout of a logged set: stored id, else inferred (older rows): week from date, day from the program day containing the exercise.
function widOf(r) {
  if (r.workout && wParse(r.workout)) return r.workout;
  if (!r.date) return '';
  const n = P_.norm(r.exercise), wd = weekdayOf(r.date), td = trainDays();
  const has = d => days[d] && days[d].exercises.some(ex => keysOf(ex).has(n));
  const day = has(wd) ? wd : (td.find(has) || wd);
  return 'W' + weekOf(r.date) + '-' + day;
}
function wStatus() {
  const st = {};
  const add = (sx, pending) => {
    let id = sx.day; if (!wParse(id) && sx.date && DAYS.includes(sx.day)) id = 'W' + weekOf(sx.date) + '-' + sx.day;
    if (!wParse(id)) return;
    st[id] = { state: /skip/i.test(sx.notes || '') ? 'skipped' : 'done', at: pending ? 'pending' : sx.finished_at };
  };
  (S.sessions || []).forEach(x => add(x, false));
  const q = testOn() ? getRQ().concat(getQ()) : getQ();
  q.filter(x => x.profile === P && x.action === 'finish').forEach(x => add(x.session, true));
  return st;
}
function workouts() {
  const m = mesoCfg(), td = trainDays(), st = wStatus(); let weeks = Math.max(1, +m.weeks || 1);
  const list = n => { const a = []; for (let w = 1; w <= n; w++) for (const d of td) a.push({ id: 'W' + w + '-' + d, w, day: d, st: st['W' + w + '-' + d] }); return a; };
  let L = list(weeks);
  while (L.length && L.every(x => x.st) && weeks < 52) L = list(++weeks); // always keep one open week ahead
  return L;
}
function loggableId() { const x = workouts().find(w => !w.st); return x ? x.id : null; }
const canLog = () => !!S && (testOn() || viewId === loggableId());
const isToday = canLog;
function setView(id) { viewId = id; const p = wParse(id); dayKey = p ? p.day : dayKey; }
const wLabel = id => { const p = wParse(id); return p ? 'Week ' + p.w + ' ' + p.day[0].toUpperCase() + p.day.slice(1, 3) : id; };
// One-time move of old date-based keys (v7-v10) to workout ids.
function migrateKeys(obj) {
  let ch = false;
  Object.keys(obj).forEach(scope => Object.keys(obj[scope] || {}).forEach(k => {
    let m = /^(.*):(\d{4}-\d{2}-\d{2})$/.exec(k), nk = null;
    if (m) nk = m[1] + ':W' + weekOf(m[2]) + '-' + weekdayOf(m[2]);
    else if ((m = /^(\d{4}-\d{2}-\d{2})\|([a-z]+)$/.exec(k))) nk = 'W' + weekOf(m[1]) + '-' + m[2];
    if (nk) { if (obj[scope][nk] == null) obj[scope][nk] = obj[scope][k]; delete obj[scope][k]; ch = true; }
  }));
  return ch;
}
const dayKeyOf = () => viewId;
function baseCards() { const d = days[dayKey]; return d ? d.exercises : []; }
function cardsFor() {
  const base = baseCards(); let ord = null;
  try { ord = JSON.parse(getSetting('order', dayKeyOf()) || 'null'); } catch (e) {}
  if (!Array.isArray(ord)) return base;
  const pos = n => { const i = ord.indexOf(n); return i < 0 ? 999 + base.findIndex(x => x.canonical === n) : i; };
  return base.slice().sort((a, b) => pos(a.canonical) - pos(b.canonical));
}
const dayVal = (ex, k) => getSetting(ex.canonical, k + ':' + viewId);
function setDayVal(ex, k, v) { putSetting(ex.canonical, k + ':' + viewId, v); sig = ''; applyState(S, false); }
function plannedCount(ex) { return Math.max(0, (ex.planned_sets || 3) + (+dayVal(ex, 'extra') || 0) - (+dayVal(ex, 'skip') || 0)); }
function repRange(ex) { const m = (ex.note.sets || '').match(/x\s*(\d+)(?:\s*-\s*(\d+))?/i); return m ? [+m[1], +(m[2] || m[1])] : [8, 12]; }
const LOWER = /quad|hamstring|glute|leg|calf|calves|adductor|abductor/i;
const FAIL = ['technical', 'true', 'drop set', 'myo-reps'];
function lastSession(ex) {
  const rs = rowsFor(ex, false); if (!rs.length) return null;
  const d = rs.reduce((m, r) => wIndex(widOf(r)) > wIndex(m) ? widOf(r) : m, widOf(rs[0]));
  return { date: d, rows: rs.filter(r => widOf(r) === d) };
}
const r5 = (w, step) => Math.max(step, Math.round(w / step) * step);
const EQUIP = [[/barbell|\bbb\b|smith/i, 1], [/dumbbell|\bdb\b/i, 0.38], [/machine|pec deck|hack|leg press/i, 0.9], [/cable|rope/i, 0.45]];
const eqFactor = n => { for (const [re, f] of EQUIP) if (re.test(n)) return f; return 0.8; };
function suggest(ex, idx) {
  const [lo, hi] = repRange(ex), inc = LOWER.test(ex.rest_muscle + ' ' + ex.muscles) ? 10 : 5;
  const ls = lastSession(ex);
  if (ls) {
    const r = ls.rows[Math.min(idx, ls.rows.length - 1)], w = parseFloat(r.load), reps = parseInt(r.reps, 10) || 0;
    if (!(w >= 0)) return { load: r.load, reps: String(Math.min(hi, reps + 1)), why: 'last time ' + setTxt(r) };
    if (reps >= hi && FAIL.includes(r.failure_type)) return { load: String(w + (ex.bodyweight && !w ? 0 : inc)), reps: String(lo), why: 'top of range hit: +' + inc + ' lb' };
    return { load: String(w), reps: String(Math.min(hi, reps + 1)), why: 'same weight, aim +1 rep (last ' + setTxt(r) + ')' };
  }
  if (ex.bodyweight) return null;
  // Never done: estimate from the best e1RM on a similar exercise (same rest muscle), scaled by equipment.
  let best = null;
  for (const d of Object.values(days)) for (const o of d.exercises) {
    if (o === ex || o.canonical === ex.canonical || o.rest_muscle !== ex.rest_muscle || o.bodyweight) continue;
    for (const r of viewRows().filter(x => keysOf(o).has(P_.norm(x.exercise)))) {
      const e = P_.e1rm(loadOf(r), r.reps); if (!e) continue;
      const v = (e.ep + e.br) / 2 * eqFactor(ex.canonical) / eqFactor(o.canonical)
        * ((ex.types || []).includes('isolation') && !(o.types || []).includes('isolation') ? 0.6 : 1);
      if (!best || v > best.v) best = { v, from: o.canonical };
    }
  }
  if (!best) return null;
  const reps = Math.round((lo + hi) / 2);
  return { load: String(r5(best.v / (1 + reps / 30), 5)), reps: String(reps), why: 'from ' + best.from, est: true };
}
function trend(ex, r, i) {
  const ls = lastSession(ex); if (!ls || !ls.rows[i]) return '';
  const p = ls.rows[i], a = P_.e1rm(loadOf(r), r.reps), b = P_.e1rm(loadOf(p), p.reps);
  let d;
  if (a && b) d = a.ep - b.ep; else d = (parseFloat(loadOf(r)) || 0) - (parseFloat(loadOf(p)) || 0) || (parseInt(r.reps, 10) - parseInt(p.reps, 10));
  return d > 0 ? '<span class="tr up">&#9650;</span>' : d < 0 ? '<span class="tr dn">&#9660;</span>' : '<span class="tr eq">&#9654;</span>';
}
// Mesocycle grid: settings profile.meso = {"start":"YYYY-MM-DD","weeks":N,"deload":N} (written by Coach), else Week 1 only.
function mesoCfg() {
  let m = null; try { m = JSON.parse(getSetting('profile', 'meso') || 'null'); } catch (e) {}
  if (!m || !m.start) {
    const first = (S.rows || []).map(r => r.date).filter(Boolean).sort()[0] || S.today;
    m = { start: mondayOf(first), weeks: 1, deload: 0 };
  }
  return m;
}
function mesoHTML() {
  const tb = testOn() ? '<div class="testbar">TEST MODE · nothing is saved to your log</div>' : '';
  const ws = wStatus()[viewId], f = ws && ws.state === 'done' ? ws.at : null;
  const bar = ws && ws.state === 'skipped' ? '<div class="skipbar">Workout skipped</div>' : f ? '<div class="donebar">&#10003; Workout done' + (f === 'pending' ? ' (syncing)' : ' · ' + new Date(f).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '<small>Sets stay editable: tap any set.</small></div>' : '';
  const ro = !ws && !canLog() ? '<div class="robar">View only. Next up: ' + esc(wLabel(loggableId())) + '</div>' : '';
  return tb + bar + ro + mesoGrid();
}
function mesoGrid() {
  const m = mesoCfg(), td = trainDays(); if (!td.length) return '';
  const L = workouts(), nx = loggableId(), weeks = L.length / td.length;
  let h = '<table class="meso"><tr><th></th>' + td.map(d => '<th>' + d[0].toUpperCase() + d.slice(1, 3) + '</th>').join('') + '</tr>';
  for (let w = 1; w <= weeks; w++) {
    h += '<tr><th>' + (m.deload && w === +m.deload ? 'DL' : 'W' + w) + '</th>' + td.map(d => {
      const id = 'W' + w + '-' + d, x = L.find(y => y.id === id);
      const cls = [x.st ? (x.st.state === 'skipped' ? 'skip' : 'ok') : '', id === nx ? 'cur' : '', id === viewId ? 'view' : ''].filter(Boolean).join(' ');
      return '<td class="' + cls + '" data-w="' + id + '">' + (x.st ? (x.st.state === 'skipped' ? '&#8211;' : '&#10003;') : '') + '</td>';
    }).join('') + '</tr>';
  }
  return h + '</table>';
}
// Drag to reorder: long-press the green heading, then drag up/down.
const DRAG_ANIM = 280;
// Keep an element's top at a target screen position while cards collapse or expand.
function anchor(el, offset, targetY) {
  const until = performance.now() + DRAG_ANIM + 60;
  const step = () => { const d = el.getBoundingClientRect().top - (targetY() - offset); if (Math.abs(d) > 0.5) window.scrollBy(0, d); if (performance.now() < until) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
let dragCleanup = [];
const winOn = (t, f, o) => { window.addEventListener(t, f, o); dragCleanup.push(() => window.removeEventListener(t, f, o)); };
// One drag at a time. Started by a long-press on the heading, or immediately from the ≡ handle.
let drag = null;
function saveOrder(main, moved) {
  const names = [...main.querySelectorAll('.card')].map(c => c.dataset.name);
  putSetting('order', dayKeyOf(), JSON.stringify(names));
  setTimeout(() => {
    sig = ''; render();
    const c = [...$('main').querySelectorAll('.card')].find(x => x.dataset.name === moved);
    if (c) { const r = c.getBoundingClientRect(); if (r.top < 80 || r.top > innerHeight - 260) window.scrollBy(0, r.top - 90); }
    toast('Order saved for today');
  }, DRAG_ANIM + 40);
}
function startDrag(main, card, y, pointerId, h) {
  if (drag) return;
  drag = { main, card, lastY: y, auto: null };
  card.classList.add('dragging'); document.body.classList.add('dragmode');
  if (h && pointerId != null) { try { h.setPointerCapture(pointerId); } catch (x) {} }
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (x) {} }
  anchor(card, y - card.getBoundingClientRect().top, () => drag ? drag.lastY : y);
  main.classList.add('collapsed');
  drag.auto = setInterval(() => {
    if (!drag) return;
    const dy = drag.lastY < 110 ? -14 : drag.lastY > innerHeight - 230 ? 14 : 0;
    if (dy) { window.scrollBy(0, dy); dragSwap(); }
  }, 30);
}
function dragSwap() {
  const { main, card, lastY } = drag, cards = [...main.querySelectorAll('.card')];
  for (const c of cards) {
    if (c === card) continue; const r = c.getBoundingClientRect(), mid = r.top + r.height / 2;
    if (lastY < mid && cards.indexOf(c) < cards.indexOf(card)) { c.before(card); return; }
    if (lastY > mid && cards.indexOf(c) > cards.indexOf(card)) { c.after(card); return; }
  }
}
function dragMove(y, e) { if (!drag) return; if (e && e.cancelable) e.preventDefault(); drag.lastY = y; dragSwap(); }
function endDrag() {
  if (!drag) return;
  const { main, card, auto } = drag; clearInterval(auto);
  card.classList.remove('dragging'); document.body.classList.remove('dragmode');
  const top = Math.max(90, card.getBoundingClientRect().top);
  drag = null;
  anchor(card, 0, () => top); main.classList.remove('collapsed');
  saveOrder(main, card.dataset.name);
}
function enableDrag(main) {
  dragCleanup.forEach(f => f()); dragCleanup = [];
  let timer = null, pend = null;
  const cancelPress = () => { clearTimeout(timer); timer = null; pend = null; };
  main.querySelectorAll('.card h2').forEach(h => {
    const card = h.closest('.card');
    h.addEventListener('pointerdown', e => {
      if (e.target.closest('.menu-btn') || drag) return;
      if (e.target.closest('.grip')) { e.preventDefault(); startDrag(main, card, e.clientY, e.pointerId, h); return; }
      cancelPress(); pend = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => { timer = null; if (pend) startDrag(main, card, pend.y, e.pointerId, h); }, 450);
    });
    h.addEventListener('contextmenu', e => e.preventDefault());
    h.addEventListener('selectstart', e => e.preventDefault());
  });
  winOn('pointermove', e => {
    if (drag) return dragMove(e.clientY, e);
    if (pend) { pend.y = e.clientY; if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 40) cancelPress(); }
  }, { passive: false });
  // Touch fallback: some Android builds deliver touch events but drop pointer moves after a long-press.
  winOn('touchmove', e => { if (drag && e.touches[0]) dragMove(e.touches[0].clientY, e); }, { passive: false });
  const up = () => { cancelPress(); endDrag(); };
  winOn('pointerup', up); winOn('pointercancel', () => { cancelPress(); if (drag) endDrag(); });
  winOn('touchend', up); winOn('touchcancel', up);
  winOn('contextmenu', e => { if (drag || pend) e.preventDefault(); });
}
function removePlanned(name) {
  const ex = cardsFor().find(x => x.canonical === name); if (!ex) return;
  const extra = +dayVal(ex, 'extra') || 0;
  if (extra > 0) setDayVal(ex, 'extra', extra > 1 ? String(extra - 1) : '');
  else setDayVal(ex, 'skip', String((+dayVal(ex, 'skip') || 0) + 1));
  toast('Set removed');
}
// Exercise menu
let menuEx = null;
function openMenu(i) {
  menuEx = cardsFor()[i]; $('mh').textContent = menuEx.canonical;
  const p = dayVal(menuEx, 'pain') || 'none';
  $('mskip').textContent = +dayVal(menuEx, 'skip') > 0 ? 'Undo skip sets' : 'Skip remaining sets';
  document.querySelectorAll('#mpain button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  $('menu').classList.add('open'); pushLayer('menu', () => $('menu').classList.remove('open'));
}
function closeMenu(keepHistory) { $('menu').classList.remove('open'); if (!keepHistory) popLayer('menu'); }
$('menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });
$('mclose').onclick = () => closeMenu();
$('madd').onclick = () => { const ex = menuEx; closeMenu(); setDayVal(ex, 'extra', String((+dayVal(ex, 'extra') || 0) + 1)); toast('Set added'); };
$('mskip').onclick = () => {
  if (+dayVal(menuEx, 'skip') > 0) { const ex = menuEx; closeMenu(); setDayVal(ex, 'skip', ''); toast('Skipped sets restored'); return; }
  const ex = menuEx, left = plannedCount(ex) - rowsFor(ex, true).length; closeMenu();
  if (left <= 0) return toast('No sets left to skip');
  setDayVal(ex, 'skip', String((+dayVal(ex, 'skip') || 0) + left)); toast('Skipped ' + left + (left === 1 ? ' set' : ' sets'));
};
$('mnote').onclick = () => { const ex = menuEx; closeMenu(); const v = prompt('Note for ' + ex.canonical + ' today:', dayVal(ex, 'note') || ''); if (v != null) { setDayVal(ex, 'note', v.trim()); toast('Note saved'); } };
$('mhist').onclick = () => { const ex = menuEx; closeMenu(true); openHistory(ex, true); };
document.querySelectorAll('#mpain button').forEach(b => b.onclick = () => { const ex = menuEx; closeMenu(); setDayVal(ex, 'pain', b.dataset.p === 'none' ? '' : b.dataset.p); toast('Joint pain: ' + b.dataset.p); });
function openHistory(ex, fromMenu) {
  const rs = viewRows().filter(r => keysOf(ex).has(P_.norm(r.exercise)));
  const by = {}; rs.forEach(r => (by[r.date] = by[r.date] || []).push(r));
  const ds = Object.keys(by).sort().reverse();
  $('hh').textContent = ex.canonical + ' history';
  $('hb').innerHTML = ds.length ? ds.map(d => {
    const best = by[d].map(r => P_.e1rm(loadOf(r), r.reps)).filter(Boolean).reduce((m, e) => Math.max(m, e.ep), 0);
    const pain = getSetting(ex.canonical, 'pain:' + d), note = getSetting(ex.canonical, 'note:' + d);
    return '<div class="hd"><b>' + esc(d) + '</b>' + (best ? ' · best e1RM ' + best : '') + (pain ? ' · pain ' + esc(pain) : '') + '<br>' + by[d].map(r => esc(setTxt(r)) + (+r.drops ? ' +' + r.drops + 'D' : '')).join(', ') + (note ? '<br><i>' + esc(note) + '</i>' : '') + '</div>';
  }).join('') : '<div class="s2">No history yet.</div>';
  $('hist').classList.add('open');
  const close = () => $('hist').classList.remove('open');
  if (fromMenu) swapLayer('menu', 'hist', close); else pushLayer('hist', close);
}
const closeHist = () => { $('hist').classList.remove('open'); popLayer('hist'); };
$('hclose').onclick = closeHist;
$('hist').addEventListener('click', e => { if (e.target.id === 'hist') closeHist(); });

// ---------- Render ----------
function btnLabel(ex) {
  const t = getT();
  if (ex.single && t && t.firstSide && P_.norm(t.exercise) === P_.norm(ex.canonical)) return 'Second side done: log set';
  return ex.single ? 'First side done' : 'Set done';
}
function render() {
  const main = $('main'), d = days[dayKey];
  const nx = loggableId();
  $('day').innerHTML = workouts().map(x => '<option value="' + x.id + '"' + (x.id === viewId ? ' selected' : '') + '>' + 'W' + x.w + ' ' + x.day[0].toUpperCase() + x.day.slice(1, 3) + (x.st ? (x.st.state === 'skipped' ? ' skipped' : ' done') : x.id === nx ? ' (next)' : '') + '</option>').join('');
  $('prof').value = P;
  if (!d) { $('sub').textContent = ''; main.innerHTML = '<div class="empty">' + (S.program ? 'No session written for ' + esc(dayKey[0].toUpperCase() + dayKey.slice(1)) + ' yet.<br>Ask Coach to write it, or pick another day.' : 'No program file found for this profile yet.<br>Ask Coach to write one.') + '</div>'; return; }
  $('sub').textContent = d.title + (d.week ? ' · ' + d.week.split('.')[0] : '');
  main.innerHTML = '<div id="meso">' + mesoHTML() + '</div>' + cardsFor().map((ex, i) => {
    const n = ex.note, chips = [n.sets, n.failure, n.rest].filter(Boolean).map(c => '<span class="chip">' + esc(c) + '</span>').join('');
    const tips = (ex.cue ? [ex.cue] : []).concat(n.extra);
    const extra = tips.length ? '<ul>' + tips.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    return '<div class="card" id="c' + i + '" data-name="' + esc(ex.canonical) + '"><h2><span class="grip" aria-label="Drag to reorder">&#8801;</span>' + (i + 1) + '. ' + esc(ex.canonical) + '<button class="menu-btn" data-m="' + i + '" aria-label="Exercise menu">&#8943;</button></h2><div class="cbody">' +
      (dayVal(ex, 'pain') ? '<div class="pain">Joint pain today: ' + esc(dayVal(ex, 'pain')) + '</div>' : '') +
      (dayVal(ex, 'note') ? '<div class="dnote">Note: ' + esc(dayVal(ex, 'note')) + '</div>' : '') +
      '<div class="meta">' + esc(ex.muscles || '') + (ex.video ? (ex.muscles ? ' · ' : '') + '<a href="' + esc(ex.video) + '" target="_blank" rel="noopener noreferrer">Demo video</a>' : '') + '</div>' +
      '<div class="note"><b>Coach:</b><div class="chips">' + chips + '</div>' + extra + '</div>' +
      '<div class="setup" data-su="' + i + '"><b>Setup:</b> <span id="su' + i + '">' + esc(setupFor(ex) || 'tap to add (seat, pins, angle)') + '</span> <span class="ed">edit</span></div>' +
      '<div class="last" id="l' + i + '">' + esc(lastTime(ex)) + '</div>' +
      '<ul class="sets" id="s' + i + '">' + setsHTML(ex) + '</ul>' +
      '</div></div>';
  }).join('') + (d.footer && d.footer.length ? '<div class="note">' + d.footer.map(esc).join('<br>') + '</div>' : '') +
    '<div id="finwrap"></div>';
  main.querySelectorAll('[data-su]').forEach(el => el.onclick = () => editSetup(+el.dataset.su));
  main.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); openMenu(+b.dataset.m); });
  enableDrag(main);
  main.onclick = e => {
    const wc = e.target.closest('td[data-w]'); if (wc) { setView(wc.dataset.w); sig = ''; applyState(S, true); window.scrollTo(0, 0); return; }
    const lg = e.target.closest('[data-log]'); if (lg) { logRow(lg.dataset.ex, +lg.dataset.log, lg.closest('li')); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { removePlanned(rm.dataset.rm); return; } const li = e.target.closest('li[data-sid]'); if (li) openEdit(li.dataset.sid); };
  renderFinish(); markActive();
}
function update() {
  cardsFor().forEach((ex, i) => { const s = $('s' + i), l = $('l' + i), b = $('b' + i); if (s) { const h = setsHTML(ex); if (s.innerHTML !== h && !(s.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) s.innerHTML = h; } if (l) l.textContent = lastTime(ex); if (b) b.textContent = btnLabel(ex); });
  const mz = $('meso'); if (mz) { const mh = mesoHTML(); if (mz.innerHTML !== mh) mz.innerHTML = mh; }
  renderFinish(); markActive();
}
function finishedToday() { const x = wStatus()[viewId]; return x ? x.at : null; }
function renderFinish() {
  const w = $('finwrap'); if (!w || !S) return;
  const ws = wStatus()[viewId], f = ws && ws.state === 'done' ? ws.at : null;
  const h = ws && ws.state === 'skipped' ? '' : !f && !canLog() ? '' : f ? '<div class="done">Workout finished' + (f === 'pending' ? ' (syncing)' : ' at ' + new Date(f).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '. Coach will send your recap.</div>'
    : '<button class="btn fin" id="finish">Finish workout</button>';
  if (w.innerHTML !== h) { w.innerHTML = h; const b = $('finish'); if (b) b.onclick = finishWorkout; }
}
function workoutRows() { return viewRows().filter(r => widOf(r) === viewId); }
function finishWorkout() {
  const rs = workoutRows();
  if (!confirm('Finish ' + wLabel(viewId) + '? ' + rs.length + ' sets logged.')) return;
  const ex = new Set(rs.map(r => P_.norm(r.exercise)));
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: Date.now(), date: S.today, day: viewId, sets: String(rs.length), exercises: String(ex.size) } });
  const t = getT(); if (t) { t.hidden = true; setT(t); }
  sig = ''; applyState(S, true); toast('Workout finished. Nice work.', 3000);
}
function skipWorkout() {
  if (!canLog()) return toast('Only the next workout (' + wLabel(loggableId()) + ') can be skipped.');
  if (workoutRows().length) return toast('This workout has logged sets. Use Finish workout instead.');
  if (!confirm('Skip ' + wLabel(viewId) + '? The next workout becomes available.')) return;
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: Date.now(), date: S.today, day: viewId, sets: '0', exercises: '0', notes: 'skipped' } });
  setView(loggableId() || viewId); sig = ''; applyState(S, true); window.scrollTo(0, 0); toast('Workout skipped');
}
$('dmenu').onclick = skipWorkout;
function editSetup(i) {
  const ex = cardsFor()[i]; const cur = setupFor(ex);
  const v = prompt('Equipment setup for ' + ex.canonical + ' (seat, pins, bench angle):', cur);
  if (v == null) return;
  putSetting(ex.canonical, 'equipment', v.trim()); $('su' + i).textContent = v.trim() || 'tap to add (seat, pins, angle)'; toast('Setup saved');
}
function applyState(st, initial) {
  S = st; S.rows = S.rows || []; days = P_.enrich(P_.parseProgram(st.program), P_.parseLibrary(st.library));
  if (!layerOpen('settings')) { $('settings').style.display = 'none'; $('app').style.display = 'block'; }
  const ls = localSet(); if (migrateKeys(ls)) jset(SK(), ls);
  if (S.settings) migrateKeys(S.settings);
  if (!viewId || !wParse(viewId)) setView(loggableId() || ('W1-' + (trainDays()[0] || S.weekday)));
  const nsig = P + '|' + viewId + '|' + JSON.stringify(wStatus()) + '|' + JSON.stringify(days[dayKey] || null) + '|' + JSON.stringify(S.settings || {});
  if (nsig !== sig) { if (!formEx || initial) { const y = window.scrollY; render(); sig = nsig; if (!firstRender) window.scrollTo(0, y); } }
  else update();
  syncTimer();
  if (firstRender) { firstRender = false; const s = jget('coach_scroll', null); if (s && s.p === P && s.day === viewId) requestAnimationFrame(() => window.scrollTo(0, s.y)); }
}
async function load(initial) {
  if (!U || !K) return showSettings();
  if (initial && !S) { const c = jget('coach_cache_' + P, null); if (c) applyState(c, true); } // instant start, works offline
  try {
    const st = await apiGet();
    if (!st.ok) { if (st.error === 'unauthorized') return showSettings('Key rejected by the backend.'); throw new Error(st.error); }
    jset('coach_cache_' + P, st);
    $('offline').style.display = 'none';
    applyState(st, initial);
  } catch (e) {
    $('offline').style.display = 'inline-block';
    if (!S) { $('app').style.display = 'block'; $('main').innerHTML = '<div class="empty">Cannot reach the backend and nothing cached yet.<br>' + esc(e.message) + '</div>'; }
  }
}
let scrollT; window.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => jset('coach_scroll', { p: P, day: viewId, y: window.scrollY }), 150); }, { passive: true });
$('day').onchange = e => { setView(e.target.value); sig = ''; applyState(S, true); window.scrollTo(0, 0); };
$('prof').onchange = e => { P = e.target.value; LS.setItem('coach_p', P); dayKey = null; viewId = null; sig = ''; S = null; firstRender = true; load(true); };

// ---------- Settings ----------
function hideSettings(fromPop) { if (S) { $('settings').style.display = 'none'; $('app').style.display = 'block'; tick(); } if (!fromPop) popLayer('settings'); }
function showSettings(msg) {
  if (S) pushLayer('settings', () => hideSettings(true));
  $('app').style.display = 'none'; $('settings').style.display = 'block'; $('timer').style.display = 'none';
  $('su').value = U; $('sk').value = K; $('stest').checked = testOn(); $('smsg').textContent = msg || '';
  $('sbw').value = S ? (bodyweight() || '') : '';
}
$('gear').onclick = () => showSettings();
$('stest').onchange = e => {
  if (e.target.checked) { LS.setItem('coach_test', '1'); toast('Test mode on'); }
  else {
    if (!confirm('Turn off test mode and discard all test sets?')) { e.target.checked = true; return; }
    LS.removeItem('coach_test'); LS.removeItem('coach_testq'); LS.removeItem('coach_settings_test_' + P); LS.removeItem(TKEY()); toast('Test mode off, test data discarded');
  }
  sig = ''; if (S) { hideSettings(); applyState(S, true); }
};
$('ssave').onclick = async () => {
  U = $('su').value.trim(); K = $('sk').value.trim();
  if (!/^https:\/\//.test(U) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(U)) { $('smsg').textContent = 'The URL should start with https://'; return; }
  LS.setItem('coach_u', U); LS.setItem('coach_k', K); $('smsg').textContent = 'Testing...';
  const bw = parseFloat($('sbw').value);
  try {
    const st = await apiGet(); if (!st.ok) { $('smsg').textContent = 'Backend said: ' + st.error; return; }
    jset('coach_cache_' + P, st); sig = ''; S = null; firstRender = true; popLayer('settings'); applyState(st, true);
    if (bw > 0 && bw !== bodyweight()) putSetting('profile', 'bodyweight', String(bw));
    toast('Connected'); flush();
  }
  catch (e) { $('smsg').textContent = 'Could not reach it: ' + e.message; }
};
$('scancel').onclick = () => hideSettings();

// ---------- Rest timer ----------
// Target depends on what comes next: same muscle = that exercise's normal rest, different muscle = 75 s.
const SWITCH_REST = 75;
const TKEY = () => 'coach_timer_' + P;
const getT = () => jget(TKEY(), null);
function setT(t) { if (t) jset(TKEY(), t); else LS.removeItem(TKEY()); tick(); markActive(); }
function nextTarget(name) {
  const ex = exFor(name); if (!ex) return { target: 120, next: '' };
  const normal = ex.note.rest_target_sec || 120;
  const list = cardsFor(), idx = list.indexOf(ex);
  const done = idx >= 0 ? rowsFor(ex, true).length : 0;
  if (idx < 0 || done < plannedCount(ex)) return { target: normal, next: idx < 0 ? '' : 'next: ' + ex.canonical + ' set ' + (done + 1) };
  const nx = list.slice(idx + 1).concat(list.slice(0, idx)).find(x => rowsFor(x, true).length < plannedCount(x));
  if (!nx) return { target: normal, next: 'last exercise done' };
  if (nx.rest_muscle && nx.rest_muscle === ex.rest_muscle) return { target: nx.note.rest_target_sec || normal, next: 'next: ' + nx.canonical + ' (same muscle)' };
  return { target: SWITCH_REST, next: 'next: ' + nx.canonical + ' (new muscle)' };
}
const TIMER_MAX = 3600 * 1000; // older than 60 min: no rest timer
function recentLast() {
  const rs = viewRows().filter(r => r.logged_at && Date.now() - tsOf(r) < TIMER_MAX);
  return rs.length ? rs[rs.length - 1] : null;
}
function syncTimer() {
  const last = recentLast();
  if (!last) { const t = getT(); if (t && !t.firstSide && Date.now() - t.start > TIMER_MAX) setT(null); return; }
  const ts = tsOf(last), t = getT();
  if (!t || (ts > t.start + 5000 && !t.firstSide && !formEx)) { const nt = nextTarget(last.exercise); setT({ start: ts, exercise: last.exercise, target: nt.target, next: nt.next, hidden: !!finishedToday() }); }
}
// Soft beeps in the last 10 s of green. Web Audio oscillators mix with music on Android instead of pausing it.
let actx = null, lastBeep = -1;
function audio() {
  if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; try { actx = new AC(); } catch (e) { return null; } }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
function beep(final) {
  if (LS.getItem('coach_mute') === '1') return;
  const a = audio(); if (!a || a.state !== 'running') return;
  const o = a.createOscillator(), g = a.createGain(), now = a.currentTime;
  o.type = 'sine'; o.frequency.value = final ? 1175 : 880;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(final ? 0.09 : 0.05, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + (final ? 0.25 : 0.09));
  o.connect(g).connect(a.destination); o.start(now); o.stop(now + 0.3);
}
function muteLbl() { $('tmute').textContent = LS.getItem('coach_mute') === '1' ? 'Sound is off' : 'Sound is on'; }
$('tmute').onclick = () => { LS.setItem('coach_mute', LS.getItem('coach_mute') === '1' ? '0' : '1'); muteLbl(); audio(); };
muteLbl();
function tick() {
  const t = getT(), el = $('timer');
  if (!t || t.hidden || $('app').style.display === 'none') { el.style.display = 'none'; return; }
  const sec = (Date.now() - t.start) / 1000;
  if (sec * 1000 > TIMER_MAX) { LS.removeItem(TKEY()); el.style.display = 'none'; return; }
  el.style.display = 'block'; $('tt').textContent = fmt(sec); $('ttg').textContent = fmt(t.target);
  $('tex').textContent = (t.firstSide ? 'since first side of ' : 'after ') + t.exercise + (t.next ? ' · ' + t.next : '');
  el.className = sec <= t.target ? 'under' : 'over';
  const fs = $('ftimer'); if (fs) { fs.textContent = 'Rest ' + fmt(sec) + ' / ' + fmt(t.target); fs.className = sec <= t.target ? 'under' : 'over'; }
  const left = t.target - sec, whole = Math.floor(sec);
  if (left > 0 && left <= 10 && whole !== lastBeep && document.visibilityState === 'visible') { lastBeep = whole; beep(left <= 1); }
}
setInterval(tick, 250);
function markActive() { const t = getT(); cardsFor().forEach((ex, i) => { const c = $('c' + i); if (c) c.classList.toggle('active', !!t && !t.hidden && P_.norm(ex.canonical) === P_.norm(t.exercise)); }); }
$('tclear').onclick = () => { const t = getT(); if (t) { t.hidden = true; setT(t); } };
$('tundo').onclick = () => {
  const today = viewRows().filter(r => r.date === S.today);
  if (!today.length) return toast('Nothing logged today');
  deleteSet(today[today.length - 1].set_id, true);
};
function deleteSet(sid, ask) {
  const r = viewRows().find(x => x.set_id === sid); if (!r) return;
  if (ask && !confirm('Remove ' + r.exercise + ' ' + setTxt(r) + '?')) return;
  const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === sid);
  if (pi >= 0) { q.splice(pi, 1); setQ(q.filter(x => !(x.action === 'edit' && x.set_id === sid))); }
  else { setQ(q.filter(x => !(x.action === 'edit' && x.set_id === sid))); enqueue({ action: 'undo', set_id: sid }); }
  const t = getT();
  if (t && !t.firstSide) {
    const l = recentLast();
    if (l) { const nt = nextTarget(l.exercise); setT({ start: tsOf(l), exercise: l.exercise, target: nt.target, next: nt.next }); } else setT(null);
  }
  update(); toast('Removed');
}

// ---------- Set done / log form ----------
const ffSel = $('ff');
const FT_OPTS = FT.filter(v => v !== 'drop set');
const ftOptions = extra => { ffSel.innerHTML = FT_OPTS.concat(extra ? [extra] : []).map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v] || v) + '</option>').join(''); };
ffSel.innerHTML = FT.map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v]) + '</option>').join('');
let editId = null, doneTs = 0, drops = 0, prevRest = null;
function setDrops(n) { drops = n; document.querySelectorAll('#fd button').forEach(b => b.classList.toggle('on', +b.dataset.d === n)); }
document.querySelectorAll('#fd button').forEach(b => b.onclick = () => setDrops(+b.dataset.d));
let rowPrefill = null;
function logRow(name, idx, li) {
  const list = cardsFor(), i = list.findIndex(x => x.canonical === name); if (i < 0) return;
  rowPrefill = null;
  setDone(i);
}
function setDone(i) {
  if (!canLog()) return toast('Next up is ' + wLabel(loggableId()) + '. Finish or skip it first.');
  audio(); // unlock audio on a user tap (needed on iPhone and Chrome)
  const ex = cardsFor()[i], now = Date.now(), t = getT();
  const same = t && P_.norm(t.exercise) === P_.norm(ex.canonical);
  if (ex.single && !(same && t.firstSide)) {
    prevRest = t && !t.hidden ? (now - t.start) / 1000 : null;
    const nt = nextTarget(ex.canonical);
    setT({ start: now, exercise: ex.canonical, target: nt.target, next: 'other side counts as rest', firstSide: true, prevRest });
    rowPrefill = null; update(); toast('Timer running. Do the other side.'); return;
  }
  let ts = now;
  if (same && t.firstSide) { ts = t.start; prevRest = t.prevRest; }
  else {
    prevRest = t && !t.hidden ? (now - t.start) / 1000 : null;
    setT({ start: now, exercise: ex.canonical, target: (ex.note.rest_target_sec || 120), next: '' });
  }
  openForm(i, ts);
}
function bwLine() {
  if (!formEx || !formEx.bodyweight) return;
  const bw = bodyweight(), add = parseFloat($('fl').value) || 0;
  $('fbw').textContent = bw ? 'Total load: ' + bw + ' body weight + ' + add + ' added = ' + (bw + add) + ' lb' : 'Set your body weight in settings (gear) to get total load.';
}
$('fl').oninput = bwLine;
function showSides(on) { $('sides').style.display = on ? 'block' : 'none'; $('repsbox').style.display = on ? 'none' : 'block'; }
function openForm(i, ts, row) {
  const ex = row ? (exFor(row.exercise) || { canonical: row.exercise, note: {}, single: !!row.left_reps, bodyweight: !!row.added_load }) : cardsFor()[i];
  formEx = ex; editId = row ? row.set_id : null; doneTs = ts || Date.now();
  const today = row ? [] : rowsFor(ex, true), prev = today.length ? today[today.length - 1] : null;
  $('sh').textContent = (row ? 'Edit: ' : '') + ex.canonical;
  $('fll').textContent = ex.bodyweight ? 'Added weight (vest/belt, 0 if none)' : 'Load (lb)';
  const sg = row ? null : suggest(ex, today.length);
  $('fl').value = row ? (row.load || '') : sg && sg.load ? sg.load : prev ? prev.load : (ex.bodyweight ? '0' : '');
  $('fr').value = row ? row.reps : (sg && !ex.single ? sg.reps : '');
  if (!row && ex.single && sg) { $('frl').placeholder = sg.reps; $('frr').placeholder = sg.reps; }
  $('fsug').textContent = sg ? (sg.est ? 'Estimate: ' : 'Suggested: ') + (sg.load || '-') + ' x ' + sg.reps + ' (' + sg.why + '). Change it if you did something else.' : ''; $('fn').value = row ? (row.notes || '') : ''; $('ferr').textContent = '';
  $('frl').value = row ? (row.left_reps || '') : ''; $('frr').value = row ? (row.right_reps || '') : '';
  showSides(!!ex.single); setDrops(row ? (+row.drops || 0) : 0);
  $('fbw').textContent = ''; bwLine();
  $('fdel').style.display = row ? 'block' : 'none'; $('ftimer').style.display = row ? 'none' : 'block';
  $('fsave').textContent = row ? 'Save changes' : 'Save set';
  if (SR) $('heard').textContent = '';
  const f = (ex.note.failure || '').toLowerCase();
  ftOptions(row && row.failure_type === 'drop set' ? 'drop set' : null);
  ffSel.value = row ? (FT.includes(row.failure_type) ? row.failure_type : 'not to failure') : prev && FT_OPTS.includes(prev.failure_type) ? prev.failure_type : (f.includes('true') ? 'true' : f.includes('technical') ? 'technical' : 'not to failure');
  if (rowPrefill && !row) {
    if (rowPrefill.load) $('fl').value = rowPrefill.load;
    if (rowPrefill.reps) { if (ex.single) { $('frl').value = rowPrefill.reps; $('frr').value = rowPrefill.reps; } else $('fr').value = rowPrefill.reps; }
    bwLine();
  }
  formKey = !row && rowPrefill ? rowPrefill.key : null; rowPrefill = null;
  setPain(row ? (dayVal(ex, 'pain') || 'none') : 'none');
  $('sheet').querySelector('.in').scrollTop = 0;
  $('sheet').classList.add('open'); pushLayer('sheet', () => closeForm(true)); tick();
}
let formKey = null, formPain = 'none';
function setPain(p) { formPain = p; document.querySelectorAll('#fp button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); }
document.querySelectorAll('#fp button').forEach(b => b.onclick = () => setPain(b.dataset.p));
function openEdit(sid) { const r = viewRows().find(x => x.set_id === sid); if (r) openForm(-1, tsOf(r), r); }
$('fsame').onclick = () => { $('frr').value = $('frl').value; };
function closeForm(fromPop) { $('sheet').classList.remove('open'); formEx = null; editId = null; stopRec(); if (fromPop !== true) popLayer('sheet'); if (S) applyState(S, false); }
$('fcancel').onclick = closeForm;
$('fdel').onclick = () => { const id = editId; if (!confirm('Delete this set?')) return; closeForm(); deleteSet(id, false); };
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeForm(); });
$('fsave').onclick = () => {
  const ex = formEx;
  if (ex && ex.canonical && (dayVal(ex, 'pain') || 'none') !== formPain && (editId || formPain !== 'none')) putSetting(ex.canonical, 'pain:' + viewId, formPain === 'none' ? '' : formPain);
  let reps = $('fr').value.trim(), L = '', R = '';
  if (ex.single) {
    L = $('frl').value.trim(); R = $('frr').value.trim();
    if (!L && !R) { $('ferr').textContent = 'Enter reps for at least one side.'; return; }
    reps = String(Math.min.apply(null, [L, R].filter(Boolean).map(Number)));
  }
  if (!reps) { $('ferr').textContent = 'Reps are required.'; return; }
  const load = $('fl').value.trim();
  let bw = '', total = '';
  if (ex.bodyweight) { const b = bodyweight(); if (b) { bw = String(b); total = String(Math.round((b + (parseFloat(load) || 0)) * 10) / 10); } }
  const fields = { load, reps, failure_type: ffSel.value, notes: $('fn').value.trim(), drops: drops ? String(drops) : '', left_reps: L, right_reps: R, added_load: ex.bodyweight ? (load || '0') : '', bodyweight: bw, total_load: total };
  if (S && !(S.version >= 2)) { // old backend ignores the new columns: keep them readable in notes
    const x = [drops ? drops + (drops === 1 ? ' drop' : ' drops') : '', ex.single ? 'L ' + (L || '-') + ' R ' + (R || '-') : '', total ? 'total ' + total + ' (BW ' + bw + ' + ' + (load || 0) + ')' : ''].filter(Boolean).join('; ');
    if (x) fields.notes = (fields.notes ? fields.notes + ' | ' : '') + x;
  }
  if (editId) {
    const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === editId);
    if (pi >= 0) { Object.assign(q[pi].set, fields); setQ(q); if (!testOn()) flush(); }
    else enqueue({ action: 'edit', set_id: editId, fields });
    closeForm(); toast('Set updated'); return;
  }
  const set = Object.assign({ set_id: uid(), client_ts: doneTs, exercise: ex.canonical, workout: viewId }, fields);
  const before = viewRows();
  enqueue({ action: 'log', date: S.today, set });
  const nt = nextTarget(ex.canonical), t = getT();
  if (t) { t.target = nt.target; t.next = nt.next; t.firstSide = false; t.hidden = false; t.exercise = ex.canonical; setT(t); }
  $('sheet').classList.remove('open'); formEx = null; stopRec(); popLayer('sheet');
  update(); feedback(ex, set, before, prevRest, t ? t.target : 120);
};

// ---------- Feedback toasts ----------
const JOKES = [
  'Your rest timer called. It misses you.', 'That bench is not going to press itself.', 'Plates do not rerack themselves. Neither do excuses.',
  'Somewhere a protein shake is proud of you.', 'Chest day: the most important meeting of the week.', 'Good set. The mirror noticed.',
  'Hydrate. Your muscles are 75% water and 25% stubbornness.', 'Remember: the dumbbells were here before you, and they will be here after.',
  'Every rep is a deposit. Compound interest starts now.', 'Form check: excellent. Ego check: also passing.'];
function feedback(ex, set, before, rest, target) {
  const keys = keysOf(ex), prior = before.filter(r => keys.has(P_.norm(r.exercise)));
  const w = parseFloat(set.total_load || set.load), reps = parseInt(set.reps, 10);
  const msgs = [];
  if (w > 0 && reps > 0 && prior.length) {
    const e = P_.e1rm(w, reps), best = Math.max(0, ...prior.map(r => { const x = P_.e1rm(loadOf(r), r.reps); return x ? x.ep : 0; }));
    const maxW = Math.max(0, ...prior.map(r => parseFloat(loadOf(r)) || 0));
    const repsAt = Math.max(0, ...prior.filter(r => (parseFloat(loadOf(r)) || 0) >= w).map(r => parseInt(r.reps, 10) || 0));
    if (e && best && e.ep > best) msgs.push('New best estimated 1RM: ' + e.ep + ' lb (Epley), ' + e.br + ' (Brzycki).');
    else if (w > maxW) msgs.push('Heaviest ' + ex.canonical.toLowerCase() + ' logged yet: ' + w + ' lb.');
    else if (repsAt && reps > repsAt) msgs.push('Rep PR: ' + reps + ' reps at ' + w + ' lb.');
  }
  if (!msgs.length && rest != null && rest > target + 90) msgs.push(['Rest ran ' + fmt(rest) + ' vs ' + fmt(target) + ' target. Tap Set done as you rack it, log while you rest.', 'Long rest (' + fmt(rest) + '). Your muscles were ready a while ago.'][Math.floor(Math.random() * 2)]);
  if (!msgs.length && Math.random() < 0.33) msgs.push(JOKES[Math.floor(Math.random() * JOKES.length)]);
  toast(msgs.length ? msgs[0] : 'Saved', msgs.length ? 4500 : 2000);
}

// ---------- Voice (hidden when unsupported, e.g. iOS) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recOn = false;
if (!SR) { $('mic').style.display = 'none'; $('heard').textContent = 'Voice input is not available in this browser. Type below.'; }
function stopRec() { if (rec && recOn) { try { rec.stop(); } catch (e) {} } }
$('mic').onclick = () => {
  if (!SR) return; if (recOn) { stopRec(); return; }
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
  rec.onstart = () => { recOn = true; $('mic').classList.add('rec'); $('mic').textContent = 'Listening... tap to stop'; };
  rec.onend = () => { recOn = false; $('mic').classList.remove('rec'); $('mic').textContent = 'Tap and speak'; };
  rec.onerror = e => { $('heard').textContent = e.error === 'not-allowed' ? 'Microphone blocked. Allow mic access for this site, or type.' : 'Voice error: ' + e.error + '. You can type instead.'; };
  rec.onresult = e => { let txt = '', fin = false; for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
    $('heard').textContent = 'Heard: "' + txt + '"'; if (fin) fill(txt); };
  try { rec.start(); } catch (err) { $('heard').textContent = 'Could not start voice: ' + err.message; }
};
function fill(txt) { const p = P_.parseSpeech(txt);
  if (p.load != null) $('fl').value = p.load; if (p.reps != null) $('fr').value = p.reps; if (p.ft === 'drop set') { ffSel.value = 'true'; setDrops(Math.max(1, drops)); } else if (p.ft) ffSel.value = p.ft; if (p.notes) $('fn').value = p.notes;
  $('heard').textContent = 'Heard: "' + txt + '". Check and edit, then Save.'; }

// ---------- Boot ----------
badge();
if (!U || !K) showSettings(); else { load(true); flush(); }
setInterval(() => { if (U && K && document.visibilityState === 'visible' && !flushing) load(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && U && K) { load(); flush(); tick(); } });
})();
