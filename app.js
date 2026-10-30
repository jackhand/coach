(function () {
'use strict';
try {
const P_ = window.CoachParse;
const $ = id => document.getElementById(id);
// Single source for the version label. Bump with the ?v= asset queries in index.html and the coach-shell cache name in sw.js.
const APP_VERSION = 119; // Bump with every release, together with sw.js CACHE and every ?v= in sw.js and index.html.
// v106: no pinch-to-zoom (Jack, Oct 22). iOS Safari ignores user-scalable=no, so block its gesture events and two-finger moves too.
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
try { const av = document.getElementById('appver'); if (av) av.textContent = String(APP_VERSION); } catch (e) {}
const LS = localStorage;
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const FT = ['technical','true','drop set','myo-reps','not to failure','warm-up'];
const FT_LABEL = {'technical':'Technical failure','true':'True failure','drop set':'Drop set','myo-reps':'Myo-reps','not to failure':'Not to failure','warm-up':'Warm-up'};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const parseHold = v => { // '5:00' or '300' -> seconds; null if empty/invalid
  const t = String(v == null ? '' : v).trim(); if (!t) return null;
  if (/^\d+:\d{1,2}$/.test(t)) { const [m, sec] = t.split(':').map(Number); return m * 60 + sec; }
  const n = parseFloat(t); return /^\d*\.?\d+$/.test(t) && n >= 0 && isFinite(n) ? Math.round(n * 60) : null; // typed number = minutes (5 -> 5:00, 5.5 -> 5:30)
};
const fmtHold = v => { const sec = typeof v === 'number' ? v : parseHold(v); return sec == null ? '' : fmt(sec); };
const angs = load => { const p = String(load == null ? '' : load).replace(/°/g, '').split('/').map(x => x.trim()); return { L: p[0] || '', R: (p.length > 1 ? p[1] : p[0]) || '' }; };
const isStretch = ex => !!(ex && (ex.stretch || (ex.types || []).includes('stretch')));
const jget = (k, d) => { try { const v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const jset = (k, v) => LS.setItem(k, JSON.stringify(v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function toast(m, ms) { const t = $('toast'); t.innerHTML = '<span></span><button type="button" class="tx" aria-label="Close">&times;</button>'; t.firstChild.textContent = m; t.style.transform = ''; t.style.opacity = ''; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(hideToast, ms || 10000); }
function hideToast() { const t = $('toast'); clearTimeout(t._h); t.style.display = 'none'; t.style.transform = ''; t.style.opacity = ''; }
(function () { // swipe (any direction) or tap to dismiss
  const t = $('toast'); let x0 = null, y0 = null;
  t.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; try { t.setPointerCapture(e.pointerId); } catch (x) {} });
  t.addEventListener('pointermove', e => { if (x0 == null) return; const dx = e.clientX - x0, dy = Math.min(0, e.clientY - y0); t.style.transform = 'translate(calc(-50% + ' + dx + 'px),' + dy + 'px)'; t.style.opacity = String(Math.max(0.2, 1 - Math.hypot(dx, dy) / 160)); });
  const end = e => { if (x0 == null) return; const d = Math.hypot(e.clientX - x0, Math.min(0, e.clientY - y0)); x0 = null; if (d > 50 || d < 8) hideToast(); else { t.style.transform = ''; t.style.opacity = ''; } };
  t.addEventListener('pointerup', end); t.addEventListener('pointercancel', () => { x0 = null; t.style.transform = ''; t.style.opacity = ''; });
})();

// ---------- Back button: every open layer (settings, sheets, menus) owns one history entry ----------
const layers = []; let ignorePop = 0;
try { history.scrollRestoration = 'manual'; } catch (e) {} // closing a sheet (history.back) must not restore an old scroll position
function pushLayer(name, close) {
  if (layers.some(l => l.name === name)) return;
  layers.push({ name, close }); history.pushState({ coach: name }, '');
}
// v86: in-app replacement for prompt/confirm (no browser dialogs). askBox({title, body, ok, cancel, input, value, danger}) -> Promise: true/false, or the text/null with input.
function askBox(o) {
  return new Promise(res0 => { let tries = 0; const go = () => { if (ignorePop && tries++ < 20) return setTimeout(go, 30); askOpen(o, res0); }; go(); });
}
function askOpen(o, res) {
  {
    const w = $('askw'), inp = $('aski'); let done = false;
    $('askh').textContent = o.title || ''; $('askt').textContent = o.body || ''; $('askt').hidden = !o.body;
    inp.hidden = o.input == null && o.value == null; inp.value = o.value || ''; inp.placeholder = o.input || '';
    $('asky').textContent = o.ok || 'OK'; $('askn').textContent = o.cancel || 'Cancel'; $('asky').classList.toggle('dng', !!o.danger);
    const fin = v => { if (done) return; done = true; w.classList.remove('open'); popLayer('ask'); res(v); };
    $('asky').onclick = () => fin(inp.hidden ? true : inp.value); $('askn').onclick = $('askx').onclick = () => fin(inp.hidden ? false : null);
    w.classList.add('open'); pushLayer('ask', () => { if (!done) { done = true; w.classList.remove('open'); res(inp.hidden ? false : null); } });
    if (!inp.hidden) setTimeout(() => inp.focus({ preventScroll: true }), 50);
  }
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
let S = null, days = {}, RAWDAYS = {}, dayKey = null, viewId = null, sig = '', formEx = null, firstRender = true;

let swReg = null;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(r => { swReg = r; }).catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => {}); });
// v84: a PWA resumed from the background kept running old code after an update. Reload once the new version takes over, but only while no sheet or pop-up is open.
let swNew = false; const swHad = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
const swReload = () => { if (swNew && document.visibilityState === 'visible' && !layers.length) location.reload(); };
if (swHad) navigator.serviceWorker.addEventListener('controllerchange', () => { swNew = true; swReload(); });
document.addEventListener('visibilitychange', swReload);

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
function enqueue(item) { if (item.action === 'log' && item.set && S) gymTag(item.set); if (item.action === 'edit' && item.fields && S) keepTag(item.set_id, item.fields); if (item.action === 'finish' && item.session && S) { const tc = tripView() && tripCfg(); const g = tc ? 'trip:' + tc.id + ' (' + tc.name + ')' : homeGym(); if (g) item.session.gym = g; } const t = testOn(), q = getQ(); q.push(Object.assign({ id: uid(), profile: P }, item, t ? { test: true } : {})); setQ(q); if (!t) flush(); }
// v79: every logged set carries its gym's display name in notes, e.g. '[gym Hotel gym | trip:hotel1 | did Dumbbell bench press]'
// or '[gym Lifetime | home]'. The deployed backend keeps notes, so no backend change is needed. The app strips the tag for display.
function gymTag(set) {
  const c = tripView() && tripCfg(), ex = exFor(set.exercise), sub = c && ex ? tripSwapOf(ex) : '';
  const name = c ? c.name : homeGym(); if (!name) return; if (getSetting('profile', 'gym_last') !== (c ? c.id : 'home')) putSetting('profile', 'gym_last', c ? c.id : 'home');
  set.gym = c ? 'trip:' + c.id + ' (' + c.name + ')' : name; set.sub = sub;
  set.notes = ((set.notes || '') + ' ' + gymTagTxt(name, c ? 'trip:' + c.id : 'home', sub)).trim();
}
const gymTagTxt = (name, id, sub) => '[gym ' + String(name).replace(/[\[\]|]/g, '') + ' | ' + id + (sub ? ' | did ' + String(sub).replace(/[\[\]|]/g, '') : '') + ']';
function keepTag(sid, f) { // an edit rewrites notes: put the set's gym tag back
  if (!Object.prototype.hasOwnProperty.call(f, 'notes')) return;
  const r = viewRows(true, true).find(x => x.set_id === sid);
  if (r && r._gtag && !GYM_RE.test(String(f.notes || '')) && !String(f.notes || '').includes(r._gtag)) f.notes = ((f.notes || '') + ' ' + r._gtag).trim();
}
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
      if (it.test) { setRQ(getRQ().filter(x => x.id !== it.id)); continue; } // test data never reaches the backend
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
      if (res.ok && !it.test) recentPut(it, res.row);
      if (res.ok && S && it.profile === P && it.action === 'setting') { const ss = S.settings = S.settings || {}; if (it.value === '' || it.value == null) { if (ss[it.scope]) delete ss[it.scope][it.key]; } else (ss[it.scope] = ss[it.scope] || {})[it.key] = it.value; }
      if (res.ok && res.row && S && it.profile === P && (it.action === 'log' || it.action === 'edit')) { S.rows = S.rows.filter(r => r.set_id !== res.row.set_id).concat([res.row]); }
    }
  } finally { flushing = false; }
  if (changed) load();
}
setInterval(flush, 15000);
window.addEventListener('online', flush);

// ---------- Rows view (server rows + pending) ----------
const tsOf = r => Date.parse(r.logged_at) || 0;
// Warm-up sets (failure type 'warm-up') are logged but left out of suggestions, settled weight, e1RM, trends and weekly sets. viewRows(true) includes them.
const isWarm = r => !!r && r.failure_type === 'warm-up';
// v106: a synced item stays in coach_recent for 3 min, so an older server read that lands after the sync cannot hide a just-saved set
// (the check mark and reps used to vanish until the next refresh). Server rows win once they include the change.
const RECENT_MS = 180000;
function recentPut(it, row) {
  if (!['log', 'edit', 'undo'].includes(it.action)) return;
  const l = jget('coach_recent', []).filter(x => Date.now() - x.t < RECENT_MS);
  l.push(it.action === 'log' && row ? Object.assign({}, it, { set: Object.assign({}, it.set, row) }, { t: Date.now() }) : Object.assign({}, it, { t: Date.now() }));
  jset('coach_recent', l);
}
function viewRows(all, incTrip) {
  if (!S) return [];
  const rq = testOn() ? [] : jget('coach_recent', []).filter(x => Date.now() - x.t < RECENT_MS && x.profile === P);
  const q = rq.concat((testOn() ? getRQ().concat(getQ()) : getQ()).filter(x => x.profile === P));
  const undone = new Set(q.filter(x => x.action === 'undo').map(x => x.set_id));
  const have = new Set(S.rows.map(r => r.set_id));
  const pend = q.filter(x => x.action === 'log' && !have.has(x.set.set_id)).map(x => Object.assign({}, x.set, { date: x.date, rest_time: x.set.rest_time || '', logged_at: x.set.logged_at || new Date(x.set.client_ts).toISOString(), pending: !x.t }));
  const edits = {}, synced = {};
  q.filter(x => x.action === 'edit').forEach(x => { edits[x.set_id] = Object.assign(edits[x.set_id] || {}, x.fields); if (!x.t) synced[x.set_id] = false; else if (synced[x.set_id] == null) synced[x.set_id] = true; });
  return S.rows.concat(pend).filter(r => !undone.has(r.set_id))
    .map(r => edits[r.set_id] ? Object.assign({}, r, edits[r.set_id], { pending: r.pending || !synced[r.set_id] }) : r).map(gymParse)
    .sort((a, b) => tsOf(a) - tsOf(b)).filter(r => (all || !isWarm(r)) && (!isTrip(r) || incTrip || r.workout === viewId));
}
function keysOf(ex) { return new Set(ex.match_keys.concat([P_.norm(ex.canonical), P_.norm(ex.name)])); }
function exFor(name) { const n = P_.norm(name); for (const ex of cardsFor()) if (keysOf(ex).has(n)) return ex; for (const ex of (days[dayKey] ? days[dayKey].exercises : [])) if (keysOf(ex).has(n)) return ex; for (const d of Object.values(days)) for (const ex of d.exercises) if (keysOf(ex).has(n)) return ex; return null; }
let todayCut = null; // v106: trend() sets this so the estimate for set i only sees the sets logged before it
function rowsFor(ex, today) {
  if (today && todayCut != null) { const c = todayCut; todayCut = null; try { return rowsFor(ex, true).slice(0, c); } finally { todayCut = c; } }
  const keys = keysOf(ex);
  if (today) return viewRows().filter(r => keys.has(P_.norm(r.exercise)) && widOf(r) === viewId);
  // v113: free weights and bodyweight moves keep one history across every gym; machines and cables stay per gym.
  const port = portableEx(ex), gid = curGymId();
  return viewRows(false, true).filter(r => keys.has(P_.norm(r.exercise)) && wIndex(widOf(r)) < wIndex(viewId) && (port || tripGymOf(r) === gid));
}
const loadOf = r => r.total_load || r.load;
function warmRowsToday(ex) { const keys = keysOf(ex); return viewRows(true).filter(r => isWarm(r) && keys.has(P_.norm(r.exercise)) && widOf(r) === viewId); }
function sideE(r) { const s = sideReps(r); if (s.L == null || s.R == null || s.L === s.R) return ''; const a = P_.e1rm(loadOf(r), s.L), b = P_.e1rm(loadOf(r), s.R); return a && b ? 'e1RM L ' + a.ep + ' / R ' + b.ep + ' Epley' : ''; }
function setTxt(r) {
  const ex = r && r.exercise ? exFor(r.exercise) : null;
  if (isStretch(ex)) {
    const a = String(r.load || '-').replace(/°$/, ''), g = angs(r.load);
    if (r.left_reps || r.right_reps) return (g.L || '-') + '° ' + (fmtHold(r.left_reps) || '-') + ' L / ' + (g.R || '-') + '° ' + (fmtHold(r.right_reps) || '-') + ' R';
    return a + '° x ' + (fmtHold(r.reps) || r.reps || '-');
  }
  if (r.left_reps || r.right_reps) return (r.load || '-') + ' x L' + (r.left_reps || '?') + ' / R' + (r.right_reps || '?');
  return (r.load || '-') + ' x ' + r.reps;
}
function lastTime(ex) {
  const ls = lastSession(ex); if (!ls) return '';
  return 'Last time (' + wLabel(ls.date, true) + ', ' + ls.rows[0].date + '): ' + ls.rows.map(setTxt).join(', ');
}
// ---------- Warm-up ramp + plate calculator (barbell and dumbbell only, never logged) ----------
const PLATES = [45, 35, 25, 10, 5, 2.5], BAR = 45;
// ONE equipment type for every equipment-specific feature (see CoachEquipType in exlist.js).
// Explicit equip field (library / built-in list) first, then the built-in catalog entry, name fallback last.
function equipType(ex) {
  if (!ex) return 'other';
  const nm = ex.canonical || ex.name || '', c = ex.equip ? null : catFind(nm);
  return window.CoachEquipType({ name: nm, equip: ex.equip || (c && c.equip) || '', bodyweight: ex.bodyweight });
}
const PLATE_T = { barbell: 1, hexbar: 1, ez: 1, smith: 1 }, BAR_DEF = { barbell: 45, hexbar: 45, ez: 45, smith: 45 }; // v85: Smith gets plate math too; set its real bar weight per exercise
const BAR_NAME = { barbell: 'bar', hexbar: 'hex bar', ez: 'EZ bar', smith: 'Smith bar' };
const plateT = ex => !!ex && !isStretch(ex) && (!!PLATE_T[equipType(ex)] || barSaved(ex) > 0); // a saved or seeded bar weight turns on plate math (e.g. Smith shrug 10 lb)
// Bar weight: per-exercise equipment setup can say e.g. "55 lb bar" or "bar weight 55"; else the type default.
// Rule (Jack, Oct 20, 2026; v85): every bar exercise has its own bar weight, edited only in the plate builder (not on the card). Default 45; once changed it is saved per exercise
// in settings (scope = exercise, key 'bar') so it syncs. Hex bar shrug uses Jack's open hex bar, 55 lb, until a saved value says otherwise.
const BAR_SEED = { 'hex bar shrug': 55, 'smith machine shrug': 10 }; // Smith bar per Jack (Oct 20, 2026)
function barSaved(ex) { if (!ex) return NaN; const v = parseFloat(getSetting(ex.canonical, 'bar')); return v > 0 && v < 200 ? v : (BAR_SEED[String(ex.canonical || '').toLowerCase()] || NaN); }
function barWeight(ex) {
  const bs = barSaved(ex); if (bs > 0) return bs;
  const t = equipType(ex), s = String((ex && setupFor(ex)) || '');
  const m = s.match(/\b(\d+(?:\.\d+)?)\s*(?:lb|lbs)\s*(?:hex |trap |ez |smith )?bar\b/i) || s.match(/\bbar\s*(?:weight|wt)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const v = m ? parseFloat(m[1]) : NaN; return v > 0 && v < 200 ? v : (BAR_DEF[t] || BAR);
}
// v86 (Jack, Oct 21): one shared formatter groups repeated plates: [45,45,5] -> '45x2 + 5'. Every plate text goes through platesFor/platesShort.
function plateGroup(list) { const g = []; list.forEach(p => { const l = g[g.length - 1]; if (l && l.p === p) l.n++; else g.push({ p, n: 1 }); }); return g.map(x => x.p + (x.n > 1 ? 'x' + x.n : '')).join(' + '); }
function platesFor(w, bar) { bar = bar || BAR; let side = (w - bar) / 2; if (!(side > 0)) return w > 0 && w <= bar ? 'Empty bar' : ''; const out = []; for (const p of PLATES) while (side >= p - 1e-9) { out.push(p); side -= p; } return plateGroup(out) + ' per side' + (side > 0.01 ? ' (+' + (Math.round(side * 2 * 10) / 10) + ' lb left over)' : ''); }
const platesShort = (w, bar) => { const p = platesFor(+w, bar); return p ? p.replace(' per side', ' /side') : ''; };
const plateLine = (ex, w) => plateT(ex) && +w > 0 ? platesShort(w, barWeight(ex)) : '';
// Warm-up kind: 'plate' (bar types), 'dumbbell', or '' (no ramp).
const eqKind = ex => plateT(ex) ? 'plate' : equipType(ex) === 'dumbbell' ? 'dumbbell' : '';
function warmFor(ex, list) {
  if (isStretch(ex) || ex.bodyweight || coachWarm(ex).length) return null;
  const k = eqKind(ex); if (!k) return null;
  const firstFree = list.find(x => !isStretch(x) && !x.bodyweight && eqKind(x));
  if (k !== 'plate' && firstFree !== ex) return null;
  const sg = suggest(ex, 0), ks = keysOf(ex); let w = num(sg && sg.load) || settled(rowsFor(ex, false)) || settled(viewRows().filter(r => ks.has(P_.norm(r.exercise)) && widOf(r) !== viewId)) || settled(rowsFor(ex, true)); if (!w) return null;
  const r5 = v => Math.round(v / 5) * 5, steps = [];
  if (k === 'dumbbell') { [[0.5, 8], [0.75, 4]].forEach(([p, n]) => { const x = r5(w * p); if (x > 0 && x < w && !steps.some(s => s.w === x)) steps.push({ w: x, n }); }); }
  else {
    const bar = barWeight(ex); if (bar < w) steps.push({ w: bar, n: 10 });
    [[0.5, 5], [0.7, 3], [0.85, 1]].forEach(([p, n]) => { const x = r5(w * p); if (x > bar && x < w && !steps.some(s => s.w === x)) steps.push({ w: x, n }); });
  }
  return { k, w, steps, bar: k === 'plate' ? barWeight(ex) : 0, bn: BAR_NAME[equipType(ex)] || 'bar' };
}
function warmHTML(ex, i, list) {
  const wu = warmFor(ex, list); if (!wu) return '';
  const pl = wu.k === 'plate', unit = wu.k === 'dumbbell' ? ' lb each' : ' lb';
  const row = (w, n, work) => '<li><button type="button" class="wuw"' + (pl ? ' data-pl="' + w + '"' : '') + '>' + w + unit + '</button> x ' + n + (work ? ' <span class="s2">working weight</span>' : '') + (pl ? '<div class="s2 wup" hidden>' + esc(platesFor(w, wu.bar)) + '</div>' : '') + '</li>';
  return '<details class="wu"><summary>Warm-up (not logged)</summary><ul>' + wu.steps.map(s => row(s.w, s.n)).join('') + row(wu.w, 'sets', true) + '</ul>' +
    '<div class="s2">' + (pl ? 'Tap a weight to see plates (' + wu.bar + ' lb ' + wu.bn + '). ' : '') + 'Rest about 1 min between ramp sets.</div></details>';
}
// Coach warm-ups ('Warm-ups: bar x 10, 135 x 5' in the program): listed before the working sets, logged with failure type 'warm-up'.
function coachWarm(ex) { const b = ex && ex.note && ex.note.warmups; if (!b || !b.length || isStretch(ex)) return []; const bar = barWeight(ex); return b.map(x => ({ w: x.w === 'bar' ? bar : x.w, n: x.n })); }
// All warm-ups for the exercise sit in one gold 'Warm-up' group above the numbered working sets.
function warmRowsHTML(ex, worked) {
  const done = warmRowsToday(ex), plan = coachWarm(ex), name = esc(ex.canonical);
  const pl = w => plateLine(ex, w) ? '<div class="s2 plt">' + esc(plateLine(ex, w)) + '</div>' : '';
  let h = done.map(r => '<li data-sid="' + esc(r.set_id) + '" class="logged wrm' + (r.pending ? ' pend' : '') + '"><div class="srow"><span class="sn"></span><span class="val">' + esc(r.load || '-') + '</span><span class="val">' + esc(r.reps) + '</span><span></span><span class="lg on">&#10003;</span></div>' + pl(r.load) +
    (r.pending || noteTxt(r) ? '<div class="s2">' + [r.pending ? 'pending sync' : '', esc(noteTxt(r))].filter(Boolean).join(' · ') + '</div>' : '') + '</li>').join('');
  if (!worked) for (let k = done.length; k < plan.length; k++) {
    const w = plan[k];
    h += '<li class="plan wrm"><div class="srow"><span class="sn"></span><span class="val">' + esc(w.w) + '</span><span class="val">' + esc(w.n) + '</span><span></span>' +
      '<button class="lg" data-wu="' + k + '" data-ex="' + name + '" aria-label="Log warm-up ' + (k + 1) + ' of ' + plan.length + '"' + ((k === done.length || testOn()) && isToday() ? '' : ' disabled') + '></button></div>' + pl(w.w) + '</li>';
  }
  return h ? '<li class="wgrp"><div class="wgh"><b>WARM-UP</b> <span>Coach plan. Not counted in suggestions or weekly sets.</span></div><ul class="wl">' + h + '</ul></li>' : '';
}
function setsHTML(ex) {
  const rs = rowsFor(ex, true), n = Math.max(plannedCount(ex), rs.length);
  if (!n) return '<li class="s2 none">Skipped today.</li>';
  const name = esc(ex.canonical), t = getT();
  const st = isStretch(ex);
  let h = '<li class="shead' + (st ? ' stretch' : '') + '"><span>SET</span><span>' + (st ? 'ANGLE' : 'WEIGHT') + '</span><span>' + (st ? 'HOLD' : 'REPS') + '</span><span></span><span>LOG</span></li>';
  h += warmRowsHTML(ex, rs.length);
  h += rs.map((r, i) => {
    const e = st ? null : P_.e1rm(loadOf(r), repN(r));
    const bits = [st ? '' : (FT_LABEL[r.failure_type] || r.failure_type), +r.drops ? (r.drops + (+r.drops === 1 ? ' drop' : ' drops')) : '', miniOf(r) ? '+' + miniOf(r) + ' mini' : '',
      r.total_load ? ('total ' + r.total_load + ' lb') : '',
      r.pending ? 'pending sync' : (r.rest_time ? 'rest ' + r.rest_time : ''), e ? (sideE(r) || ('e1RM ' + e.ep + ' Epley / ' + e.br + ' Brzycki')) : ''].filter(Boolean).join(' · ');
    const g = angs(r.load), ang = st ? ((r.left_reps || r.right_reps) && g.L !== g.R ? 'L' + g.L + '° R' + g.R + '°' : (g.L || '-') + '°') : (r.load || '-');
    const hold = (r.left_reps || r.right_reps)
      ? ((st ? fmtHold(r.left_reps) : r.left_reps || '?') || '-') + ' L / ' + ((st ? fmtHold(r.right_reps) : r.right_reps || '?') || '-') + ' R'
      : (st ? (fmtHold(r.reps) || r.reps) : r.reps);
    return '<li data-sid="' + esc(r.set_id) + '" class="logged' + (r.pending ? ' pend' : '') + '"><div class="srow"><span class="sn">' + (i + 1) + '</span><span class="val">' + esc(ang) + (r.load && ex.bodyweight && !st ? '<small> +</small>' : '') + '</span><span class="val">' + esc(hold) + ' ' + (st ? '' : trend(ex, r, i)) + '</span><span></span><span class="lg on">&#10003;</span></div>' + (plateLine(ex, r.load) ? '<div class="s2 plt">' + esc(plateLine(ex, r.load)) + '</div>' : '') + '<div class="s2">' + esc(bits) + (noteTxt(r) ? '<br>' + esc(noteTxt(r)) : '') + '</div></li>';
  }).join('');
  const tq = techFor(ex);
  for (let i = rs.length; i < n; i++) {
    const tb = tq ? tqShow(tq, i, n).map(k => '<button class="tq" data-tq="' + k + '" aria-label="' + esc(TECH[k].name) + ' info">' + TECH[k].tag + '</button>').join('') : '';
    let sg = suggest(ex, i);
    { const d = jget('coach_draft', null); if (d && d.k === viewId + '|' + ex.canonical + '|' + i && d.load) sg = Object.assign({}, sg || {}, { load: d.load, reps: d.reps || '', repsL: d.reps || '', repsR: d.reps || '', est: true, coach: false, why: d.why || 'your edited weight' }); } // v86: a backed-out weight edit stays on the row with its estimate
    if (sg && sg.repsL && !ex.single) { delete sg.repsL; delete sg.repsR; }
    const w = (sg && sg.load) || '', r = (sg && (sg.repsL ? 'L' + sg.repsL + '/R' + sg.repsR : sg.reps)) || '';
    const isNext = i === rs.length;
    const gw = angs(w), wShow = st && w ? (gw.L !== gw.R ? 'L' + gw.L + '° R' + gw.R + '°' : gw.L + '°') : w;
    const rShow = st && r ? (fmtHold(r) || r) : r;
    h += '<li class="plan"><div class="srow"><span class="sn">' + (i + 1) + (tb ? '<span class="tqs">' + tb + '</span>' : '') + '</span>' +
      '<span class="val sug" data-f="w">' + esc(wShow) + '</span><span class="val sug" data-f="' + (ex.single ? 'L' : 'r') + '">' +
        (ex.single ? (sg && sg.repsL && !st ? '<span data-f="L">L' + esc(sg.repsL) + '</span>/<span data-f="R">R' + esc(sg.repsR) + '</span>' : '<span data-f="L">' + esc(rShow) + '</span>') : esc(rShow)) + '</span>' +
      '<button class="rm" data-rm="' + name + '" aria-label="Remove this set">&#10005;</button>' +
      '<button class="lg" data-log="' + i + '" data-ex="' + name + '" aria-label="Log this set"' + ((isNext || testOn()) && isToday() ? '' : ' disabled') + '></button></div>' +
      (plateLine(ex, w) ? '<div class="s2 plt">' + esc(plateLine(ex, w)) + '</div>' : '') +
      (sg ? '<div class="s2">' + (sg.coach ? '<b class="cplan">Coach plan</b> ' : '') + (sg.est ? '<b class="est">estimate</b> ' : '') + esc(sg.coach ? sg.why.replace(/^Coach plan: /, '') : sg.why) + (ex.single ? (st ? ' · per side' : ' · reps per side') : '') + '</div>' : '') + '</li>';
  }
  return h;
}

// ---------- Intensity techniques read from the program text ----------
const TECH = {
  drop: { tag: 'DROP', name: 'Drop set', re: /\bdrop(?:\s*-?\s*sets?)?\b|\brun(?:ning)? the rack\b/i,
    info: 'Go to failure, then cut the weight about 20-30% (or go down the rack one step) and go to failure again right away, no rest. Repeat for each drop.',
    log: 'Log the first (heavy) set\'s weight and reps, then set the Drop sets counter to how many drops you did (up to 9).' },
  myo: { tag: 'MR', name: 'Myo-reps (standard)', re: /\bmyo[- ]?reps?\b/i, url: 'https://www.youtube.com/watch?v=sPNcufaKd3s', urlTitle: 'Myoreps - The Most Efficient Training Technique (Renaissance Periodization)',
    info: 'Activation set near failure (usually 12-20 reps), then short rests of about 3-5 deep breaths and mini-sets of 3-5 reps with the same weight. Stop when you can\'t hit 3.',
    log: 'Pick Myo-reps as the failure type. Log the activation set\'s weight and reps, and put the mini-sets in the note, like "myo 4+4+3".' },
  match: { tag: 'MRM', name: 'Myo-rep match', re: /\bmyo[- ]?rep match\b/i, url: 'https://www.youtube.com/watch?v=KIJ77QTsvlo', urlTitle: 'Need More Growth? Myorep Match Is The Solution! (Renaissance Periodization)',
    info: 'Myo-rep match: set 1 is a normal set; its reps are your target. Each later set, after normal rest, do as many reps as you can, then 5-15 s pauses and mini-sets of a few reps until your total matches set 1. Log the total.',
    log: 'Log each set\'s weight and TOTAL reps (all mini-sets added up) and set the Mini-sets counter. No drop sets or standard myo-reps on an MRM exercise.' }
};
// Set method per exercise: settings scope = slot name, key 'method:<wid>' (this workout) or 'bmethod:B<n>' = {v, from} (rest of block). Default standard.
function methodOf(ex) {
  const sl = ex.base ? ex.base.canonical : ex.canonical, w = getSetting(sl, 'method:' + viewId); if (w) return w;
  let v = sJSON(sl, 'bmethod:B' + blockOf(viewWeek()), null);
  return v && v.v && (!v.from || wIndex(viewId) >= wIndex(v.from)) ? v.v : (/\bmyo[- ]?rep match\b/i.test(String(ex.details || '')) ? 'match' : 'standard');
}
const methodable = ex => !isStretch(ex) && (/\bmyo[- ]?reps?\b/i.test(String(ex.details || '')) || (ex.types || []).includes('isolation'));
function techFor(ex) {
  const t = String(ex.details || '').replace(/\bno\s+(?:bench\s+)?(?:drop(?:\s*-?\s*sets?)?|myo[- ]?reps?|run(?:ning)? the rack)\b[^.;]*/gi, '').replace(/\bdrop\s+\d+(?:\.\d+)?\s*(?:lbs?|pounds?)\b/gi, ''); // 'no drop set' and 'drop 10 lb' are not drop sets
  let keys = Object.keys(TECH).filter(k => k !== 'match' && TECH[k].re.test(t));
  if (methodOf(ex) === 'match') { keys = ['match']; /* MRM excludes drop sets and standard myo-reps */ return { keys, all: !/\blast set\b/i.test(t), mrm: true }; }
  if (!keys.length) return null;
  // Rule: a set carries a drop set OR myo-reps, never both. 'drop or myo-reps' picks drop; myo wins only when the text says 'last set: myo-reps' with no drop tied to the last set.
  const prefer = keys.includes('drop') && keys.includes('myo') && /\blast set\b[^.;]*\bmyo[- ]?reps?\b/i.test(t) && !/\blast set\b[^.;]*\b(?:drop|run(?:ning)? the rack)\b/i.test(t) && !/\b(?:drop|rack)\b[^.;]*\bor\b[^.;]*\bmyo|\bmyo[^.;]*\bor\b[^.;]*\b(?:drop|rack)\b/i.test(t) ? 'myo' : 'drop';
  return { keys, all: !/\blast set\b/i.test(t), prefer };
}
// One set method at a time: MRM on every set after the opener; MR and DROP only on the last set (never both).
function tqShow(tq, i, n) {
  let ks = tq.keys.filter(k => k === 'match' ? i >= 1 : i === n - 1); // v80: drop sets and standard myo-reps only on the last set
  if (ks.includes('drop') && ks.includes('myo')) ks = ks.filter(k => k !== (tq.prefer === 'myo' ? 'drop' : 'myo')); // never DROP + MR on one set
  return ks;
}
function openTech(keys) {
  const ks = keys.split(',').filter(k => TECH[k]);
  $('tqh').textContent = ks.length > 1 ? ks.map(k => TECH[k].name).join(' or ') + ' (pick one)' : TECH[ks[0]].name;
  $('tqb').innerHTML = ks.map(k => '<div class="hd"><b>' + esc(TECH[k].name) + '</b><br>' + esc(TECH[k].info) + '<br><i>How to log:</i> ' + esc(TECH[k].log) + (TECH[k].url ? '<br><a href="' + esc(TECH[k].url) + '" target="_blank" rel="noopener noreferrer">Video: ' + esc(TECH[k].urlTitle || 'demo') + '</a>' : '') + '</div>').join('');
  $('tech').classList.add('open'); pushLayer('tech', () => $('tech').classList.remove('open'));
}
const closeTech = () => { $('tech').classList.remove('open'); popLayer('tech'); };
$('tqclose').onclick = closeTech;
$('tech').addEventListener('click', e => { if (e.target.id === 'tech') closeTech(); });

// ---------- Per-exercise settings (equipment setup), body weight ----------
// Real settings: unsynced writes in the queue win, else the server copy (so server-side cleanups show up).
// Test mode: a separate local-only layer on top; it is never sent and is wiped when test mode goes off.
const SK = () => 'coach_settings_test_' + P;
const localSet = () => testOn() ? jget(SK(), {}) : {};
LS.removeItem('coach_settings_jack'); LS.removeItem('coach_settings_jacky'); // v16 and older local copies (could hide server cleanups)
function pendingSet() { const m = {}; getRQ().forEach(x => { if (x.action === 'setting' && x.profile === P && !x.test) (m[x.scope] = m[x.scope] || {})[x.key] = x.value; }); return m; }
// v119: JSON settings are read tolerantly (a value cut off by the backend still yields its complete entries) and written only after a damage and size check.
function jsonRecover(s) { // -> { v, ok }. ok false = the stored text is damaged; v holds whatever complete list entries could be recovered
  if (s == null || s === '') return { v: null, ok: true };
  try { return { v: JSON.parse(s), ok: true }; } catch (e) {}
  s = String(s).trim(); if (s[0] !== '[') return { v: null, ok: false };
  const out = []; let d = 0, q = false, bs = false, st = -1;
  const take = i => { if (st >= 0) { try { out.push(JSON.parse(s.slice(st, i + 1))); } catch (e) {} } st = -1; };
  for (let i = 1; i < s.length; i++) { const c = s[i];
    if (q) { if (bs) bs = false; else if (c === '\\') bs = true; else if (c === '"') { q = false; if (d === 0) take(i); } continue; }
    if (c === '"') { q = true; if (d === 0) st = i; continue; }
    if (c === '{' || c === '[') { if (d === 0) st = i; d++; continue; }
    if (c === '}' || c === ']') { d--; if (d === 0) take(i); if (d < 0) break; continue; }
    if (d === 0 && /[-\d.tfn]/.test(c) && st < 0) { const m = /^(-?[\d.eE+]+|true|false|null)/.exec(s.slice(i)); if (m && /[,\]]/.test(s[i + m[0].length] || '')) { out.push(JSON.parse(m[0])); i += m[0].length - 1; } }
  }
  return { v: out, ok: false };
}
function sJSON(scope, key, fb) { const r = jsonRecover(getSetting(scope, key)); if (r.v == null) return fb; if (Array.isArray(fb) !== Array.isArray(r.v) || typeof r.v !== 'object') return fb; return r.v; }
const setMax = () => (S && +S.max_setting) || 500; // the live backend keeps 500 characters until change A is deployed; it then reports max_setting
const sameEnt = (a, b) => a && b && typeof a === 'object' && typeof b === 'object' && (a.name || a.id) ? P_.norm(String(a.name || a.id)) === P_.norm(String(b.name || b.id)) && (a.only || '') === (b.only || '') : JSON.stringify(a) === JSON.stringify(b);
function putJSON(scope, key, val, o) { // o.shrink: an explicit removal may write a shorter list. Returns true when queued.
  o = o || {}; const cur = jsonRecover(getSetting(scope, key)), what = o.what || (scope === 'profile' ? key : scope);
  if (!cur.ok) { toast('Not saved: your stored ' + what + ' is damaged, so I left it alone. Coach can repair it.', 7000); return false; }
  if (!o.shrink && Array.isArray(val) && Array.isArray(cur.v)) { const miss = cur.v.filter(x => !val.some(y => sameEnt(x, y))); if (miss.length) val = val.concat(miss); }
  const txt = JSON.stringify(val);
  if (txt.length > setMax()) { toast('Not saved: ' + what + ' is too long for the sheet (' + txt.length + ' of ' + setMax() + ' characters). Nothing was changed.', 7000); return false; }
  putSetting(scope, key, txt); return true;
}
function settingKeys(scope) { const ks = new Set(), add = o => { if (o && o[scope]) Object.keys(o[scope]).forEach(k => ks.add(k)); }; add(S && S.settings); add(pendingSet()); add(localSet()); return [...ks]; }
function getSetting(scope, key) {
  const l = localSet(); if (l[scope] && l[scope][key] != null) return l[scope][key];
  const pq = pendingSet(); if (pq[scope] && pq[scope][key] != null) return pq[scope][key];
  const s = S && S.settings; return s && s[scope] && s[scope][key] != null ? s[scope][key] : null;
}
function putSetting(scope, key, value) {
  if (testOn()) { const l = localSet(); (l[scope] = l[scope] || {})[key] = value; jset(SK(), l); return; }
  enqueue({ action: 'setting', scope, key, value });
}
// ---------- Gyms (v80) ----------
// profile.gyms = [{"id","name","icon"}]; id 'home' is the home gym (Lifetime for Jack). Other gyms work like the v78 trip gym:
// their sets carry '[gym <name> | trip:<id> ...]', stay out of home suggestions and history, and get a Trip swap per exercise.
// No dates: the day's gym is profile.gym_day:<workout id>, else the last used gym (profile.gym_last), else home.
// Delete gym removes it from the list only (names kept in profile.gym_names); logged sets are never deleted. No auto-expiry.
const TRIP_DEFAULT = { jack: { id: 'hotel1', name: 'Hotel gym' } };
const HOME_DEFAULT = { jack: 'Lifetime' };
const GYM_ICONS = ['🏋️', '🏠', '🏨', '💪', '🏢', '🏫', '🌴', '✈️'];
function gymList() {
  let v = sJSON('profile', 'gyms', []);
  if (Array.isArray(v) && v.length) return v.filter(g => g && g.id && g.name);
  const out = [], hn = (S && getSetting('profile', 'home_gym')) || HOME_DEFAULT[P];
  if (hn) out.push({ id: 'home', name: hn, icon: '🏋️' });
  const t = S && getSetting('profile', 'trip_gym'); let tg = null;
  if (t && t !== 'none') { try { tg = JSON.parse(t); } catch (e) {} } else if (!t) tg = TRIP_DEFAULT[P] || null;
  if (tg && tg.id) out.push({ id: tg.id, name: tg.name, icon: '🏨' });
  return out;
}
function saveGyms(list, shrink) { if (!putJSON('profile', 'gyms', list, { shrink: true, what: 'gym list' })) return false; const h = list.find(g => g.id === 'home'); if (h) putSetting('profile', 'home_gym', h.name); const nm = gymNames(); list.forEach(g => nm[g.id] = g.name); putJSON('profile', 'gym_names', nm, { what: 'gym names' }); }
const gymById = id => gymList().find(g => g.id === id) || null;
const homeGym = () => { const h = gymById('home'); return h ? h.name : ((S && getSetting('profile', 'home_gym')) || HOME_DEFAULT[P] || ''); };
function gymPick() {
  if (!S) return 'home';
  const w = getSetting('profile', 'gym_day:' + viewId); if (viewId && w && gymById(w)) return w;
  const v = getSetting('profile', 'gym_day:' + todayWid()); if (v && gymById(v)) return v;
  const l = getSetting('profile', 'gym_last'); if (l && gymById(l)) return l;
  return 'home';
}
function tripCfg() { const g = gymById(gymPick()); return g && g.id !== 'home' ? g : null; } // the non-home gym picked for today, if any
function tripToday() { return !!tripCfg(); }
const TRIP_RE = /\s*\[trip ([^\]\s]+)(?: did ([^\]]+))?\]/; // v78 tag (id only)
const GYM_RE = /\s*\[gym ([^|\]]+?) \| (home|trip:[^|\]\s]+)(?: \| did ([^\]]+))?\]/;
// Gym names by id, kept even after a gym is deleted (profile.gym_names), so old tags still resolve to a name.
function gymNames() { let m = Object.assign({}, sJSON('profile', 'gym_names', {})); let gl = sJSON('profile', 'gyms', []); gl.forEach(g => { if (g && g.id) m[g.id] = g.name; }); const d = TRIP_DEFAULT[P]; if (d && !m[d.id]) m[d.id] = d.name; return m; }
function gymParse(r) { // adds gym_id ('home' or trip id), gym_name, sub, _gtag; strips the tag from notes for display
  if (!r || r._gp) return r;
  const n = String(r.notes || ''); let m = n.match(GYM_RE), o = null;
  if (m) o = { gym_name: m[1].trim(), gym_id: m[2] === 'home' ? 'home' : m[2].slice(5), sub: r.sub || (m[3] || '').trim() };
  else if ((m = n.match(TRIP_RE))) o = { gym_id: m[1], gym_name: gymNames()[m[1]] || 'Trip gym', sub: r.sub || (m[2] || '').trim() };
  else { const g = String(r.gym || ''), t = g.match(/^trip:(\S+)(?: \((.+)\))?/); o = t ? { gym_id: t[1], gym_name: t[2] || gymNames()[t[1]] || 'Trip gym', sub: r.sub || '' } : { gym_id: 'home', gym_name: g || homeGym() || 'Home gym', sub: r.sub || '' }; }
  return Object.assign({}, r, o, { _gp: 1, _gtag: m ? m[0].trim() : '', notes: m ? n.replace(m[0], '').trim() : n });
}
const isTrip = r => !!r && gymParse(r).gym_id !== 'home';
const tripGymOf = r => gymParse(r).gym_id;
const subOf = r => gymParse(r).sub || '';
const todayWid = () => S ? 'W' + weekOf(S.today) + '-' + weekdayOf(S.today) : '';
function tripView() { // the viewed workout is a trip gym session (today in trip range, or already logged at the trip gym)
  if (!S) return false;
  if (viewId === todayWid()) return tripToday();
  const vr = viewRows(true, true).filter(r => r.workout === viewId);
  return vr.length ? vr.some(r => isTrip(r)) : tripToday(); // v108: an unstarted past workout uses its picked gym
}
function tripSwapOf(ex) { return ''; } // v113: Trip swap removed
const PORTABLE_T = new Set(['barbell', 'ez', 'hexbar', 'dumbbell', 'bodyweight', 'bodyweight_loadable']);
function portableEx(ex) { return !!ex && PORTABLE_T.has(equipType(ex)); } // same gear at any gym, so history carries across gyms
function curGymId() { const c = tripCfg(); return tripView() && c ? c.id : 'home'; }
// Sensible stand-ins by movement pattern (names match the built-in list so Weekly sets can map muscles).
const TRIP_ALTS = [
  [/incline.*(press|bench)|(press|bench).*incline/, ['Incline dumbbell press', 'Smith machine incline press', 'Push-up']],
  [/fly|pec deck/, ['Dumbbell fly', 'Cable fly', 'Push-up']],
  [/shoulder press|overhead press|military/, ['Seated dumbbell overhead press', 'Smith machine shoulder press', 'Machine shoulder press']],
  [/bench|chest press|(machine|hammer).*press|decline/, ['Dumbbell bench press', 'Smith machine bench press', 'Machine chest press', 'Push-up']],
  [/lateral/, ['Dumbbell lateral raise', 'Cable lateral raise']],
  [/front raise/, ['Seated dumbbell front raise', 'Cable front raise']],
  [/reverse fly|rear delt|face pull/, ['Bent-over dumbbell reverse fly', 'Rope face pull']],
  [/shrug/, ['Dumbbell shrug', 'Cable shrug']],
  [/pushdown|skull|triceps|tricep/, ['Rope triceps pushdown', 'Dumbbell overhead triceps extension', 'Close-grip bench press']],
  [/dip/, ['Push-up', 'Close-grip bench press', 'Assisted dip machine']],
  [/curl/, ['Dumbbell curl', 'Hammer curl', 'Cable curl']],
  [/leg curl/, ['Dumbbell Romanian deadlift', 'Seated leg curl']],
  [/pulldown|pull-up|pullup|chin/, ['Lat pulldown', 'Pull-up', 'Rope straight-arm pulldown']],
  [/row/, ['Single-arm dumbbell row', 'Chest-supported dumbbell row', 'Seated cable row']],
  [/deadlift|rdl/, ['Dumbbell Romanian deadlift', 'Goblet squat']],
  [/squat|leg press|hack|pendulum/, ['Goblet squat', 'Dumbbell Romanian deadlift', 'Leg press', 'Smith machine squat']],
  [/leg extension/, ['Leg extension', 'Goblet squat']],
  [/hip thrust|glute/, ['Hip thrust', 'Dumbbell Romanian deadlift']],
  [/calf/, ['Standing calf raise', 'Seated calf raise']],
  [/crunch|ab |abs|leg raise|plank|dragon/, ['Plank', 'Hanging leg raise', 'Cable crunch']]
];
function tripAlts(ex) {
  const n = String(ex.canonical || '').toLowerCase();
  let out = [];
  for (const [re, l] of TRIP_ALTS) if (re.test(n)) { out = l; break; }
  if (/leg curl/.test(n)) out = TRIP_ALTS.find(x => String(x[0]) === String(/leg curl/))[1];
  return out.filter(x => P_.norm(x) !== P_.norm(ex.canonical));
}
function tripBanner() { // v80: gym (and the day's goal) at the top of today's workout; editable before and during the workout
  const gl = gymList(); if (!gl.length || !S) return '';
  const cur = gymById(gymPick()) || gl[0], today = viewId === todayWid() || testOn();
  const r0 = !today && viewRows(true, true).find(x => x.workout === viewId); // v108: any unstarted workout gets the dropdown; started past ones keep the label
  if (r0) return '<div class="gymb">Gym: ' + esc(r0.gym_name) + '</div>';
  const goal = getSetting('profile', 'goal:' + viewId) || '';
  return '<div class="gymrow"><label>Gym <select id="gymsel">' + gl.map(g => '<option value="' + esc(g.id) + '"' + (g.id === cur.id ? ' selected' : '') + '>' + esc((g.icon ? g.icon + ' ' : '') + g.name) + '</option>').join('') + '</select></label>' +
    '<label>Goal <input id="goalin" maxlength="80" placeholder="e.g. 250 x 3 on bench" value="' + esc(goal) + '"></label></div>';
}
const fmtD = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
function bodyweight() { const v = parseFloat(getSetting('profile', 'bodyweight')); return v > 0 ? v : null; }
// Where the body weight came from: profile bodyweight_src ('mfp' from the MyFitnessPal export sync on the Coach computer, 'manual') and bodyweight_date.
function bwSrcText() {
  const v = bodyweight(); if (!v) return 'Not set yet.';
  const src = getSetting('profile', 'bodyweight_src'), dt = getSetting('profile', 'bodyweight_date');
  const d = dt && /^\d{4}-\d{2}-\d{2}/.test(dt) ? new Date(dt.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return src === 'mfp' ? 'From MyFitnessPal' + (d ? ', ' + d : '') : src === 'manual' ? 'Edited by you' + (d ? ', ' + d : '') : 'Entered by you';
}
function setupFor(ex) { const v = getSetting(ex.canonical, 'equipment'); return v != null ? v : (ex.setup || ''); }

// ---------- Session order, per-day exercise state, suggestions, trends, meso ----------
// ---------- Workouts (RP style): W<week>-<day>, done in order regardless of calendar date ----------
// Training days: setting profile.train_days ("monday,tuesday,..."), else Mon-Fri plus any written weekend day.
// Days without a written session still count (shown as unplanned, can be skipped), so the meso runs in order.
function trainDays() {
  let td = String(getSetting('profile', 'train_days') || '').toLowerCase().split(/[ ,]+/).filter(d => DAYS.includes(d));
  if (!td.length) td = DAYS.slice(0, 5);
  return DAYS.filter(d => td.includes(d) || days[d]);
}
const PREVIEW_AHEAD = 5; // next ~5 training days after the next workout, planned days only
function isPreview(id) {
  const nx = loggableId(), p = wParse(id); if (!nx || !p || testOn() || wIndex(id) <= wIndex(nx) || !days[p.day]) return false;
  const L = workouts(), i = L.findIndex(x => x.id === nx), j = L.findIndex(x => x.id === id);
  return i >= 0 && j > i && j - i <= PREVIEW_AHEAD;
}
const canOpen = id => { const nx = loggableId(); return testOn() || !nx || wIndex(id) <= wIndex(nx) || isPreview(id); };
function openWorkout(id) {
  if (!canOpen(id)) return toast('Finish or skip ' + wLabel(loggableId()) + ' first. Workouts go in order.', 4000);
  const changed = id !== viewId;
  setView(id); sig = ''; applyState(S, true);
  if (changed) { const top = () => window.scrollTo(0, 0); top(); requestAnimationFrame(top); setTimeout(top, 60); setTimeout(top, 250); jset('coach_scroll', { p: P, day: viewId, y: 0 }); }
  return true;
}
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
    const dm = /duration_min=(\d+)/.exec(sx.notes || '');
    st[id] = { state: /skip/i.test(sx.notes || '') ? 'skipped' : 'done', at: pending ? 'pending' : sx.finished_at, ts: pending ? +sx.client_ts : Date.parse(sx.finished_at), dur: dm ? +dm[1] : null };
  };
  (S.sessions || []).forEach(x => add(x, false));
  const q = testOn() ? getRQ().concat(getQ()) : getQ();
  q.filter(x => x.profile === P && x.action === 'finish').forEach(x => add(x.session, true));
  return st;
}
// Training blocks: weeks are numbered globally (W1, W2, ...); every block is BL weeks, deload on block week DL.
const BL = () => Math.max(1, +mesoCfg().weeks || 5);
const blockOf = w => Math.floor((w - 1) / BL()) + 1;
const wib = w => (w - 1) % BL() + 1;
const isDeload = w => { const dl = +mesoCfg().deload || 0; return !!dl && wib(w) === dl; };
const viewWeek = () => { const p = wParse(viewId); return p ? p.w : 1; };
const wShort = w => 'B' + blockOf(w) + ' ' + (isDeload(w) ? 'DL' : 'W' + wib(w));
function workouts() {
  const td = trainDays(), st = wStatus(); let weeks = BL();
  const list = n => { const a = []; for (let w = 1; w <= n; w++) for (const d of td) a.push({ id: 'W' + w + '-' + d, w, day: d, st: st['W' + w + '-' + d] }); return a; };
  let L = list(weeks);
  while (L.length && L.every(x => x.st) && weeks < 104) { weeks += BL(); L = list(weeks); } // next block opens when this one is done
  return L;
}
function loggableId() { const x = workouts().find(w => !w.st); return x ? x.id : null; }
const canLog = () => !!S && (testOn() || viewId === loggableId());
const isToday = canLog;
function setView(id) { viewId = id; const p = wParse(id); dayKey = p ? p.day : dayKey; }
// Full day name ('Week 2 Monday'); short=true gives 'Week 2 Mon' for tight spots (the Last time line on cards).
const wLabel = (id, short) => { const p = wParse(id); return p ? (isDeload(p.w) ? 'Deload' : 'Week ' + wib(p.w)) + ' ' + p.day[0].toUpperCase() + (short ? p.day.slice(1, 3) : p.day.slice(1)) : id; };
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
// ---------- Replace exercise: per workout (swap:<wid>) or rest of block (bswap:B<n> = {to, from}) ----------
let LIB = [], swapMemo = {};
function swapInfo(base) {
  const w = getSetting(base.canonical, 'swap:' + viewId);
  if (w) return w === base.canonical ? null : { to: w, scope: 'workout' };
  let v = sJSON(base.canonical, 'bswap:B' + blockOf(viewWeek()), null);
  if (v && v.to && v.to !== base.canonical && wIndex(viewId) >= wIndex(v.from)) return { to: v.to, scope: 'block', from: v.from };
  return null;
}
// v115: exercises Jack creates in the app, classified by equipment and body part. Settings scope 'custom_ex', key = normalized name -> JSON {name, equip, muscles, rest_muscle, types}.
function customDefs() { const s = (S && S.settings && S.settings.custom_ex) || {}, pq = pendingSet().custom_ex || {}, l = localSet().custom_ex || {}; return Object.values(Object.assign({}, s, pq, l)).map(v => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(c => c && c.name); }
function catalog() { // his library first, then the built-in list, then his own created exercises
  const out = [], seen = new Set();
  LIB.forEach(e => { seen.add(P_.norm(e.name)); out.push({ name: e.name, aliases: e.aliases, muscles: e.muscles, rest_muscle: e.rest_muscle, equip: e.equip || '', types: e.types, video: e.video, mine: true }); });
  (window.CoachExList || []).forEach(e => { if (!seen.has(P_.norm(e.name)) && !P_.lookup(LIB, e.name)) { seen.add(P_.norm(e.name)); out.push(Object.assign({ video: '' }, e)); } });
  customDefs().forEach(e => { if (!seen.has(P_.norm(e.name)) && !P_.lookup(LIB, e.name)) { seen.add(P_.norm(e.name)); out.push({ name: e.name, aliases: [], muscles: e.muscles || '', rest_muscle: e.rest_muscle || '', equip: e.equip || '', types: e.types || [], video: '', mine: true, created: true }); } });
  return out;
}
function catFind(name) { const n = P_.norm(name); return catalog().find(c => P_.norm(c.name) === n || (c.aliases || []).some(a => P_.norm(a) === n)) || null; }
function swappedEx(base, si) {
  const k = viewId + '|' + base.canonical + '|' + si.to;
  if (swapMemo[k]) return swapMemo[k];
  // v113: the replacement keeps only the slot's set count, effort and rest. Per-arm wording, weights, cues and tips belong to the old exercise.
  const SIDE_RE = /\s*\b(per (arm|leg|side|hand)|each (arm|leg|side)|(single|one)[ -](arm|leg|hand)(ed)?)\b/gi;
  const bn = base.note || {}, sets = String(bn.sets || '').replace(SIDE_RE, '').replace(/\s+at\s+[\d.]+\s*(lbs?|pounds?)?\b.*$/i, '').trim();
  const det = [sets, bn.failure || '', bn.rest || ''].filter(Boolean).join('. ').replace(SIDE_RE, '');
  const d = P_.enrich({ x: { exercises: [{ n: base.n, name: si.to, full_name: si.to, details: det, note: P_.parseNote(det) }] } }, LIB), ex = d.x.exercises[0];
  const c = catFind(si.to);
  if (c && !ex.muscles) { ex.canonical = c.name; ex.muscles = c.muscles; ex.rest_muscle = c.rest_muscle; ex.types = c.types; ex.equip = c.equip; ex.match_keys = [P_.norm(c.name)].concat((c.aliases || []).map(P_.norm)); ex.video = c.video || ''; }
  ex.swappedFrom = base.canonical; ex.swapScope = si.scope; ex.base = base;
  return (swapMemo[k] = ex);
}
// Added exercises: settings scope 'adds', key 'w:<wid>' (this workout) or 'b:B<n>:<day>' (rest of block from 'from') -> JSON [{name, at, from}]
function readAdds(k) { return sJSON('adds', k, []).filter(a => a && a.name); }
const addKey = scope => scope === 'block' ? 'b:B' + blockOf(viewWeek()) + ':' + dayKey : 'w:' + viewId;
function addsFor() {
  if (!days[dayKey]) return [];
  const have = new Set(baseCards().map(b => P_.norm(b.canonical))), out = [];
  readAdds(addKey('block')).filter(a => !a.from || wIndex(viewId) >= wIndex(a.from)).concat(readAdds(addKey('workout'))).forEach(a => { const n = P_.norm(a.name); if (!have.has(n)) { have.add(n); out.push(a); } });
  return out;
}
function addedEx(name, i, det) {
  const k = 'add|' + viewId + '|' + name + '|' + (det || ''); if (swapMemo[k]) return swapMemo[k];
  const c = catFind(name), nm = c ? c.name : name;
  const p = P_.enrich(P_.parseProgram('## W\n### Addday: added\n' + (90 + i) + '. ' + nm + ': ' + String(det || '3 x 10-15. Rest 1.5 min.').replace(/[\r\n]+/g, ' ') + '\n'), LIB), ex = p.addday.exercises[0];
  if (c && !ex.muscles) { ex.canonical = c.name; ex.muscles = c.muscles; ex.rest_muscle = c.rest_muscle; ex.types = c.types; ex.equip = c.equip; ex.match_keys = [P_.norm(c.name)].concat((c.aliases || []).map(P_.norm)); ex.video = c.video || ''; }
  ex.added = true;
  return (swapMemo[k] = ex);
}
// Deleted exercises: settings scope 'deletes', key 'B<n>:<day>' -> JSON [{name: slot name, from: wid, at}].
// Hidden from 'from' onward in the block (done workouts included). A card with sets logged in that workout stays.
const slotOf = ex => ex.base ? ex.base.canonical : ex.canonical;
// v119 (B): one row per removal, key 'B<n>:<day>|<slot>' (rest of block) or 'B<n>:<day>|<slot>|<wid>' (this workout only), merged with the legacy list cell.
// A row {name, off: true} cancels a legacy entry. Removals are never rewritten as a list again.
const delPrefix = () => 'B' + blockOf(viewWeek()) + ':' + dayKey;
const h36 = t => { let h = 2166136261; for (const c of String(t)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const delKey = (slot, only) => delPrefix() + '|' + h36(P_.norm(slot)) + (only ? '|' + only : ''); // the backend keeps keys to 40 characters, so the slot is hashed; the name lives in the value
function readDeletes() {
  const p = delPrefix(), m = new Map(), id = a => P_.norm(a.name) + '|' + (a.only || '');
  sJSON('deletes', p, []).filter(a => a && a.name).forEach(a => m.set(id(a), a));
  settingKeys('deletes').filter(k => k.indexOf(p + '|') === 0).sort().forEach(k => { const r = jsonRecover(getSetting('deletes', k)); const a = r.v; if (!a || !a.name) return; if (a.off) m.delete(id(a)); else m.set(id(a), a); });
  return [...m.values()];
}
function unDelete(slot, only) { // explicit un-remove: clears just that one row (or cancels a legacy entry with an off row)
  const k = delKey(slot, only), inLegacy = sJSON('deletes', delPrefix(), []).some(a => a && P_.norm(a.name) === P_.norm(slot) && (a.only || '') === (only || ''));
  if (inLegacy) return putJSON('deletes', k, { name: slot, off: true, only: only || undefined, at: new Date().toISOString() }, { what: 'removals' });
  putSetting('deletes', k, ''); return true;
}
function applyDeletes(list) {
  const del = new Set(readDeletes().filter(a => a.only ? a.only === viewId : (!a.from || wIndex(viewId) >= wIndex(a.from))).map(a => P_.norm(a.name)));
  if (!del.size) return list;
  return list.filter(ex => !del.has(P_.norm(slotOf(ex))) || rowsFor(ex, true).length);
}
function cardsFor() {
  let added = []; try { added = addsFor().map((a, i) => { const b = addedEx(a.name, i, a.details), si = swapInfo(b); return si ? swappedEx(b, si) : b; }); } catch (e) { console.warn('adds', e); }
  let base = baseCards().map(b => { const si = swapInfo(b); return si ? swappedEx(b, si) : b; }).concat(added); let ord = null;
  try { base = applyDeletes(base); } catch (e) { console.warn('deletes', e); }
  ord = sJSON('order', dayKeyOf(), null);
  if (!Array.isArray(ord)) return base;
  const pos = ex => { let i = ord.indexOf(ex.canonical); if (i < 0 && ex.swappedFrom) i = ord.indexOf(ex.swappedFrom); return i < 0 ? 999 + base.indexOf(ex) : i; };
  return base.slice().sort((a, b) => pos(a) - pos(b));
}
const dayVal = (ex, k) => getSetting(ex.canonical, k + ':' + viewId);
function setDayVal(ex, k, v) { putSetting(ex.canonical, k + ':' + viewId, v); sig = ''; applyState(S, false); }
function plannedCount(ex) { const b = ex.planned_sets || 3; return Math.max(0, (isDeload(viewWeek()) ? Math.ceil(b / 2) : b) + (+dayVal(ex, 'extra') || 0) - (+dayVal(ex, 'skip') || 0)); }
function repRange(ex) { const m = (ex.note.sets || '').match(/x\s*(\d+)(?:\s*-\s*(\d+))?/i); if (m) return [+m[1], +(m[2] || m[1])]; const p1 = ex.note.plan && ex.note.plan[1]; return p1 && p1.lo ? [p1.lo, p1.hi] : [8, 12]; }
const LOWER = /quad|hamstring|glute|leg|calf|calves|adductor|abductor/i;
const FAIL = ['technical', 'true', 'drop set', 'myo-reps'];
function lastSession(ex) {
  let rs = rowsFor(ex, false);
  // v106: setting <exercise> nobasis = comma list of workout ids whose sets are not used as the basis for later estimates (e.g. order swapped that day).
  const nb = String(getSetting(ex.canonical, 'nobasis') || '').split(',').map(x => x.trim()).filter(Boolean);
  if (nb.length) { const k = rs.filter(r => !nb.includes(widOf(r))); if (k.length) rs = k; }
  if (!rs.length) return null;
  if (!isDeload(viewWeek())) { const nd = rs.filter(r => { const p = wParse(widOf(r)); return !p || !isDeload(p.w); }); if (nd.length) rs = nd; }
  const d = rs.reduce((m, r) => wIndex(widOf(r)) > wIndex(m) ? widOf(r) : m, widOf(rs[0]));
  return { date: d, rows: rs.filter(r => widOf(r) === d) };
}
const r5 = (w, step) => Math.max(step, Math.round(w / step) * step);
const EQ_F = { barbell: 1, hexbar: 1, ez: 1, smith: 1, dumbbell: 0.38, machine: 0.9, machine_plate: 0.9, machine_assisted: 0.9, cable: 0.45 };
const eqFactor = ex => EQ_F[equipType(ex)] || 0.8;
// Overload step sized to the equipment. Barbell steps are plate pairs (2 x 2.5 = 5, 2 x 5 = 10).
function stepFor(ex) {
  const e = equipType(ex), lower = LOWER.test(ex.rest_muscle + ' ' + ex.muscles), iso = (ex.types || []).includes('isolation');
  if (e === 'bodyweight' || e === 'bodyweight_loadable' || ex.bodyweight) return { step: 0, unit: 1, txt: '' };
  if (e === 'dumbbell') return { step: 5, unit: 5, txt: ' (next dumbbell)' };
  if (PLATE_T[e]) return lower || e === 'hexbar' ? { step: 10, unit: 5, txt: ' (2 x 5 plates)' } : { step: 5, unit: 5, txt: ' (2 x 2.5 plates)' };
  if (e === 'cable') return { step: 5, unit: 2.5, txt: '' };
  return iso ? { step: 5, unit: 5, txt: '' } : lower ? { step: 15, unit: 5, txt: '' } : { step: 10, unit: 5, txt: '' };
}
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
// Test-mode only hook for the headless equipment tests (no data, no writes).
if (testOn()) window.__coachT = { get days() { return days; }, get viewId() { return viewId; }, open: id => openWorkout(id), equipType, plateT, plateLine, barWeight, warmFor: (ex, l) => warmFor(ex, l || [ex]), stepFor, eqFactor, eqOf: c => eqOf(c), platesFor, techFor: d => techFor({ canonical: 'zz test', details: d }), tqShow };
// Per-side reps stay per side. Main reps is 'L/R' when sides differ; math uses the weaker side.
const sideReps = r => { const L = parseInt(r.left_reps, 10), Rr = parseInt(r.right_reps, 10); return { L: isFinite(L) ? L : null, R: isFinite(Rr) ? Rr : null }; };
function repN(r) { const s = sideReps(r), v = [s.L, s.R].filter(x => x != null); return v.length ? Math.min.apply(null, v) : (parseInt(r.reps, 10) || 0); }
const plus1 = (n, hi) => n == null ? null : String(Math.min(hi, n + 1));
// Settled weight: the load used most, ties go to the heavier one (ramp 20, 30, 30 -> 30; 165, 165, 155 -> 165).
function settled(rows) {
  const c = {}; rows.forEach(r => { const w = num(r.load); if (w != null) c[w] = (c[w] || 0) + 1; });
  const ks = Object.keys(c).map(Number); if (!ks.length) return null;
  return ks.sort((a, b) => c[b] - c[a] || b - a)[0];
}
// program.md "Keep the settled weight": no auto weight increase next week (settled weight on every set, aim +1 rep).
const holdW = ex => /keep the settled weight/i.test((ex.details || '') + ' ' + (ex.full_name || ''));
// Coach plan per working set (program.md 'Top set: 245 x 3-5', 'Back-offs: 2 x 6-8 at 88% of the top set', 'Set 2: ...').
// A set with a coach weight gets that weight (relative ones from the ACTUAL logged reference set), never 'follow your last set'.
// Week-specific notes ('## Week N notes' in program.md) for this card in the open week: [{text, plan}]. Day-level ones have no exercise name.
function weekNotesFor(ex) {
  const all = (RAWDAYS && RAWDAYS._weekNotes) || [], w = viewWeek(); if (!ex) return all.filter(n => n.w === w && !n.name && (!n.day || n.day === dayKey));
  const keys = keysOf(ex); // v113: a replaced exercise gets only its own week notes, not the old exercise's
  return all.filter(n => n.w === w && n.name && (!n.day || n.day === dayKey) && (keys.has(n.key) || keys.has(n.key2)));
}
// The coach's per-set plan for this week: program plan, with week-note plans ('Start at 160') filling or overriding sets.
function planFor(ex) {
  let plan = ex.note && ex.note.plan ? Object.assign({}, ex.note.plan) : null;
  weekNotesFor(ex).forEach(n => { if (n.plan) plan = Object.assign(plan || {}, n.plan); });
  return plan;
}
function coachPlan(ex, idx) {
  if (isStretch(ex) || isDeload(viewWeek())) return null;
  const plan = planFor(ex), p = plan && plan[idx + 1]; if (!p) return null;
  const today = rowsFor(ex, true), rr = p.lo && p.hi && p.lo !== p.hi ? p.lo + '-' + p.hi : p.hi ? String(p.hi) : '';
  let reps = p.hi ? String(p.hi) : '';
  if (p.load != null) {
    if (!reps) { const b = suggestNext(ex, idx); reps = b && num(b.load) === p.load && b.reps ? String(b.reps) : String(repRange(ex)[0]); }
    const what = p.label === 'drop' ? 'Use ' + p.load + ' lbs and get ' + (p.hi || reps) + '. This week\'s plan.' : (p.label === 'start' || p.label === 'use') ? 'Use ' + p.load + ' lbs. This week\'s plan.' : 'Use ' + p.load + ' lbs for ' + (rr || reps) + '. This is your ' + p.label + '.';
    return { load: String(p.load), reps, coach: true, why: what + (idx === 0 && !today.length && p.label === 'top set' ? ' Adjust if warm-ups feel off.' : '') };
  }
  if (p.pct) {
    const unit = Math.max(2.5, stepFor(ex).unit || 5), rnd = v => Math.round(v / unit) * unit, ref = today[p.ref - 1], rp = plan[p.ref];
    const refName = p.ref === 1 ? 'top set' : 'set ' + p.ref;
    if (ref && num(ref.load) > 0) return { load: String(rnd(num(ref.load) * p.pct / 100)), reps, coach: true, why: 'Use ' + rnd(num(ref.load) * p.pct / 100) + ' lbs. That is ' + p.pct + '% of your ' + refName + '.' };
    const base = rp && rp.load != null ? rp.load : null;
    if (base) return { load: String(rnd(base * p.pct / 100)), reps, coach: true, est: true, why: 'Use ' + rnd(base * p.pct / 100) + ' lbs. That is ' + p.pct + '% of your ' + refName + '.' };
  }
  return null;
}
// v106 fatigue rule (Jack, Oct 22, 2026): within a workout, a later set at the weight just used expects the last set's reps minus the usual
// set-to-set drop-off when that set went to failure (about 10% of the reps, at least 1), never more than the planned target.
// Not to failure = no drop. RP documents same load across sets, logged reps per set and no fixed formula; the 10% is the typical drop-off at 0-1 RIR with 2-3 min rest.
const fatDrop = (n, ft) => !n || ft === 'not to failure' || ft === 'warm-up' ? 0 : Math.max(1, Math.round(n * 0.1));
function suggest(ex, idx) {
  const r = suggest0(ex, idx), today = rowsFor(ex, true);
  if (!r || isStretch(ex) || !today.length || idx < today.length) return r;
  const last = today[today.length - 1], lr = repN(last);
  if (num(r.load) == null || num(r.load) !== num(last.load) || !lr) return r;
  const ft = last.failure_type, cap = (v, plan) => { const e = Math.max(1, v - fatDrop(v, ft)); const p = num(plan); return String(p != null && p > 0 && p < e ? p : e); };
  const sl = sideReps(last), o = Object.assign({}, r, { reps: cap(lr, r.reps) });
  if (ex.single && sl.L != null && sl.R != null) { o.repsL = cap(sl.L, r.repsL != null ? r.repsL : r.reps); o.repsR = cap(sl.R, r.repsR != null ? r.repsR : r.reps); } else { delete o.repsL; delete o.repsR; }
  o.why = 'Use ' + r.load + ' lbs and get ' + o.reps + '. ' + (fatDrop(lr, ft) ? 'You are a bit tired after the last set.' : 'Match your last set.');
  return o;
}
function suggest0(ex, idx) {
  const cp = coachPlan(ex, idx); if (cp) return cp;
  const today = rowsFor(ex, true);
  const base = suggestNext(ex, idx);
  if (idx >= today.length && today.length) { // follow the weight just logged this workout
    const last = today[today.length - 1], lw = num(last.load);
    if (lw != null) {
      if (base && num(base.load) === lw) return base;
      const sl = sideReps(last); return Object.assign({ load: String(lw), reps: String(repN(last) || (base && base.reps) || ''), why: 'Use ' + lw + ' lbs. Same as your last set.' }, ex.single && sl.L != null && sl.R != null && sl.L !== sl.R ? { repsL: String(sl.L), repsR: String(sl.R) } : {});
    }
  }
  return base;
}
// Standing rule (intended): a later set never targets more reps than an earlier set at the same weight.
// Each set aims at the highest per-set target among it and the later planned sets, so last week 8, 10 gives 11, 11, not 9, 11.
function suggestNext(ex, idx) {
  const b = suggestRaw(ex, idx); if (!b || isStretch(ex) || b.est) return b;
  const n = Math.max(idx + 1, plannedCount(ex)), up = (x, y) => (num(y) != null && num(x) != null && num(y) > num(x) ? y : x);
  let o = b;
  for (let j = idx + 1; j < n; j++) {
    const l = suggestRaw(ex, j); if (!l || num(l.load) !== num(b.load) || num(l.load) == null) continue;
    if (num(l.reps) > num(o.reps) || (o.repsL != null && l.repsL != null) ) {
      o = Object.assign({}, o, { reps: up(o.reps, l.reps) }, o.repsL != null && l.repsL != null ? { repsL: up(o.repsL, l.repsL), repsR: up(o.repsR, l.repsR) } : {});
      if (num(l.reps) > num(b.reps)) o.why = 'Use ' + o.load + ' lbs and get ' + o.reps + '. Same goal on every set.';
    }
  }
  return o;
}
function suggestRaw(ex, idx) {
  if (isStretch(ex)) {
    const ls = lastSession(ex), defA = '40', defT = '5:00';
    if (ls) {
      const r = ls.rows[Math.min(idx, ls.rows.length - 1)];
      const g = angs(r.load || defA), tl = fmtHold(r.left_reps || r.reps) || defT, tr = fmtHold(r.right_reps || r.reps) || defT;
      return { load: g.L === g.R ? g.L : g.L + '/' + g.R, reps: tl, repsL: tl, repsR: tr, angL: g.L, angR: g.R, why: 'last time ' + setTxt(r) };
    }
    return { load: defA, reps: defT, repsL: defT, repsR: defT, angL: defA, angR: defA, why: 'start about 40° for 5 min per side', est: true };
  }
  const [lo, hi] = repRange(ex), dl = isDeload(viewWeek()), st = stepFor(ex), iso = (ex.types || []).includes('isolation');
  const ls = lastSession(ex);
  if (ls) {
    const rows = ls.rows, sw = settled(rows);
    if (sw == null) { const r = rows[Math.min(idx, rows.length - 1)], reps = repN(r) || 0; return { load: r.load, reps: String(dl ? lo : Math.min(hi, reps + 1)), why: 'Use ' + r.load + ' lbs. ' + (dl ? 'Easy deload week.' : 'Beat last time.') }; }
    const at = rows.filter(r => num(r.load) === sw), ref = at[Math.min(idx, at.length - 1)], reps = repN(ref), sr = sideReps(ref);
    const top = Math.max(0, ...at.map(r => repN(r) || 0));
    const failed = at.some(r => (repN(r) || 0) === top && r.failure_type !== 'not to failure');
    const ramp = num(rows[0].load) != null && num(rows[0].load) < sw ? ' · settled on ' + sw : '';
    if (dl) return { load: String(Math.max(0, Math.round(sw * 0.85 / st.unit) * st.unit || sw)), reps: String(lo), why: 'Use ' + Math.max(0, Math.round(sw * 0.85 / st.unit) * st.unit || sw) + ' lbs. Deload week, so stop 2 to 3 reps short.' };
    if (!st.step) return { load: String(sw), reps: String(reps + 1), why: 'Get ' + (reps + 1) + ' reps. One more than last time.' };
    if (holdW(ex)) return { load: String(sw), reps: String(Math.min(hi, reps + 1)), why: 'Use ' + sw + ' lbs. Hold the weight and add a rep.' };
    if (top > 0 && top < lo && lo - top < 3 && sw > 0) // v87 (Jack, Oct 21): heavier is preferred. 1-2 reps under the range: keep the weight, aim for the bottom, finish with a drop set
      return { load: String(sw), reps: String(lo), firm: true, why: 'Use ' + sw + ' lbs. Reps were a bit low, so stay and drop set at the end.' };
    if (top > 0 && top < lo && sw > 0) { // v86: 3 or more reps under the range = one firm call to a lighter weight. Pick the weight whose estimated reps land mid-range (Epley and Brzycki average), rounded to the machine's increments.
      const best = at.reduce((m, r) => (repN(r) || 0) > (repN(m) || 0) ? r : m, at[0]), br = Math.min(repN(best) || top, 30), e = (sw * (1 + br / 30) + sw * 36 / (37 - br)) / 2;
      const mid = Math.round((lo + hi) / 2), u = st.unit || 5, raw = (e / (1 + mid / 30) + e * (37 - mid) / 36) / 2, nl = Math.max(u, Math.round(raw / u) * u);
      if (nl < sw) return { load: String(nl), reps: String(mid), firm: true, why: 'Use ' + nl + ' lbs. Reps were too low, so go lighter.' };
    }
    const small = iso && sw > 0 && st.step / sw > 0.12;
    if (top >= hi + (small ? 2 : 0) && failed) return { load: String(sw + st.step), reps: String(lo), why: 'Use ' + (sw + st.step) + ' lbs. Top of range hit, so step up.' };
    if (small && top >= hi) return { load: String(sw), reps: String(Math.min(hi + 2, reps + 1)), why: 'Use ' + sw + ' lbs. The next weight is a big jump, so add a rep first.' };
    return Object.assign({ load: String(sw), reps: String(Math.min(hi, reps + 1)), why: 'Use ' + sw + ' lbs. Same weight, so add a rep.' }, ex.single && sr.L != null && sr.R != null && sr.L !== sr.R ? { repsL: plus1(sr.L, hi), repsR: plus1(sr.R, hi) } : {});
  }
  return firstGuess(ex, lo, hi, dl, st);
}
// v119 first-time estimate (Jack, Oct 29: Cable lateral raise got 60 from the cable OHP). Order: own history (handled above by lastSession),
// the same movement on other equipment, the coach tip weight, the lowest ratio from the most similar logged lift, then a bodyweight default.
// Everything is compared per arm, set 1 aims for 2-3 reps in reserve, isolation is capped at 25% of the related compound per arm and at 1.5x the tip weight.
const EQ_WORDS = /\b(cable|dumbbell|db|barbell|bb|machine|smith|plate[- ]loaded|seated|standing|kneeling|incline|single[- ]arm|one[- ]arm|ez[- ]bar|ez)\b/gi;
const moveKey = n => P_.norm(String(n || '').replace(EQ_WORDS, ' '));
const perArm = (o, w) => o.single ? w : (equipType(o) === 'dumbbell' ? w : w / 2); // dumbbell loads are already per hand
const fromPerArm = (ex, w) => ex.single || equipType(ex) === 'dumbbell' ? w : w * 2;
const isIso = o => (o.types || []).includes('isolation');
function bestE1(o) { // best estimated 1RM and best working load from this exercise's logged sets (any gym)
  let e1 = 0, top = 0; const rs = viewRows(false, true);
  if (bestE1.n !== rs.length || bestE1.s !== S || bestE1.v !== viewId) { bestE1.v = viewId; bestE1.n = rs.length; bestE1.s = S; bestE1.ix = {}; rs.filter(r => wIndex(widOf(r)) < wIndex(viewId)).forEach(r => { const k = P_.norm(r.exercise); (bestE1.ix[k] = bestE1.ix[k] || []).push(r); }); }
  const ks = keysOf(o);
  for (const r of [...ks].reduce((a, k) => a.concat(bestE1.ix[k] || []), [])) {
    const w = num(loadOf(r)), n = repN(r); if (!(w > 0) || !(n >= 1 && n <= 30)) continue;
    const e = (w * (1 + n / 30) + (n < 37 ? w * 36 / (37 - n) : w * 2)) / 2; if (e > e1) e1 = e; if (w > top) top = w;
  }
  return e1 ? { e1, top } : null;
}
function tipWeight(ex) {
  const txt = [].concat(tipsFor(ex) || [], ex.note && ex.note.sets || '', ex.details || '').join(' ');
  const m = /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds)\b/i.exec(txt); return m ? +m[1] : null;
}
function firstGuess(ex, lo, hi, dl, st) {
  if (ex.bodyweight) return null;
  const reps = Math.round((lo + hi) / 2), aim = reps + 2.5, u = st.unit || 5, iso = isIso(ex);
  const fromE1 = e1 => (e1 / (1 + aim / 30) + e1 * (37 - aim) / 36) / 2; // per-arm working load for the target reps at 2-3 RIR
  const others = []; const seen = new Set();
  Object.values(days).reduce((a, d) => a.concat(d.exercises), []).concat(ex.base ? [ex.base] : []).concat(catalog().map(c => ({ canonical: c.name, muscles: c.muscles, rest_muscle: c.rest_muscle, types: c.types, equip: c.equip, name: c.name, single: (c.types || []).includes('single'), match_keys: [P_.norm(c.name)].concat((c.aliases || []).map(P_.norm)) })))
    .forEach(o => { const k = P_.norm(o.canonical); if (o === ex || k === P_.norm(ex.canonical) || seen.has(k) || o.bodyweight) return; seen.add(k); others.push(o); });
  const hist = others.map(o => { let b = null; try { b = bestE1(o); } catch (e) {} return b ? { o, b } : null; }).filter(Boolean);
  let pa = null, why = '';
  const own = bestE1(ex); if (own) { pa = fromE1(perArm(ex, own.e1)); why = 'from your own sets at another gym'; }
  const same = hist.filter(h => moveKey(h.o.canonical) === moveKey(ex.canonical));
  if (pa == null && same.length) { const h = same.reduce((m, x) => x.b.e1 > m.b.e1 ? x : m); pa = fromE1(perArm(h.o, h.b.e1)) * Math.min(1, eqFactor(ex) / eqFactor(h.o)); why = 'converted from your ' + h.o.canonical; }
  const tw = tipWeight(ex);
  if (pa == null && tw) { pa = ex.single || equipType(ex) === 'dumbbell' ? tw : tw / 2; why = 'from the coach tip'; }
  const rel = hist.filter(h => h.o.rest_muscle === ex.rest_muscle);
  if (pa == null && rel.length) { // most similar: same rest muscle and same type first; lowest ratio wins
    const sim = rel.filter(h => isIso(h.o) === iso), pool = sim.length ? sim : rel;
    const cands = pool.map(h => fromE1(perArm(h.o, h.b.e1)) * eqFactor(ex) / eqFactor(h.o) * (iso && !isIso(h.o) ? 0.2 : 0.8));
    pa = Math.min.apply(null, cands); why = 'a cautious ratio from your ' + pool[cands.indexOf(pa)].o.canonical;
  }
  if (pa == null) { pa = iso ? 10 : 25; why = 'a light default'; }
  const comp = rel.filter(h => !isIso(h.o));
  if (!own && iso && comp.length) { const cap = Math.max.apply(null, comp.map(h => perArm(h.o, h.b.top))) * 0.25; if (pa > cap) pa = cap; }
  if (!own && iso && tw) { const cap = (ex.single || equipType(ex) === 'dumbbell' ? tw : tw / 2) * 1.5; if (pa > cap) pa = cap; }
  let load = fromPerArm(ex, pa); if (dl) load *= 0.85;
  load = Math.max(u, Math.floor(load / u + 0.25) * u); // round to a real increment, leaning lighter
  return { load: String(load), reps: String(dl ? lo : reps), why: 'Use ' + load + ' lbs. First time, ' + why + '. Stop 2 to 3 reps short.', est: true };
}
// Arrows next to logged reps (Jack, Oct 20, 2026): compare to Coach's target for that set (coach plan, else suggestNext after the set rule), not last week.
// Same weight: reps vs target reps (each side on one-arm sets, any side short = down). Different weight: estimated 1RM vs the target's. No target = no arrow.
function trend(ex, r, i) {
  // v106: compare to the set's re-estimated target, as it stood when the set was logged (earlier sets today included), not the original plan.
  let t = null; todayCut = i; try { t = suggest(ex, i); } catch (e) {} finally { todayCut = null; }
  if (!t || !t.reps || num(t.reps) == null) return '';
  const UP = '<span class="tr up">&#9650;</span>', DN = '<span class="tr dn">&#9660;</span>', EQ = '<span class="tr eq">&#9654;</span>';
  const lw = parseFloat(loadOf(r)), tw = parseFloat(t.load), s = sideReps(r);
  if (isNaN(tw) || isNaN(lw) || lw === tw || !(t.load)) {
    const pairs = s.L != null || s.R != null
      ? [[s.L, num(t.repsL != null ? t.repsL : t.reps)], [s.R, num(t.repsR != null ? t.repsR : t.reps)]].filter(p => p[0] != null)
      : [[repN(r), num(t.reps)]];
    if (pairs.some(p => p[0] < p[1])) return DN;
    return pairs.some(p => p[0] > p[1]) ? UP : EQ;
  }
  // v107 (Jack, Oct 24): re-estimate the target at the weight actually logged. Last session's reps at that weight win; else an Epley/Brzycki estimate.
  const tr = repsAtLoad(ex, lw, i, tw, num(t.reps));
  if (tr == null) return '';
  const n = repN(r);
  return n < tr ? DN : n > tr ? UP : EQ;
}
// Target reps at a weight other than the planned one: last session at that weight (same set index, else its last set), else the planned set's estimate moved to that weight.
function repsAtLoad(ex, lw, i, tw, treps) {
  let ls = null; try { ls = lastSession(ex); } catch (e) {}
  const at = ls ? ls.rows.filter(x => num(x.load) === lw && x.failure_type !== 'warm-up') : [];
  if (at.length) return repN(at[Math.min(i, at.length - 1)]) || null;
  if (!(lw > 0) || !(tw > 0) || !(treps > 0)) return null;
  const e = (tw * (1 + treps / 30) + tw * 36 / (37 - Math.min(treps, 30))) / 2;
  return Math.max(1, Math.round(((e / lw - 1) * 30 + 37 - 36 * lw / e) / 2));
}
// Mesocycle grid: settings profile.meso = {"start":"YYYY-MM-DD","weeks":N,"deload":N} (written by Coach), else Week 1 only.
function mesoCfg() {
  let m = null; try { m = JSON.parse(getSetting('profile', 'meso') || 'null'); } catch (e) {}
  if (!m || !m.start) {
    const first = (S.rows || []).map(r => r.date).filter(Boolean).sort()[0] || S.today;
    m = { start: mondayOf(first), weeks: 5, deload: 5 };
  }
  return m;
}
function mesoHTML() {
  const tb = testOn() ? '<div class="testbar">TEST MODE · nothing is saved to your log</div>' : '';
  const ws = wStatus()[viewId], f = ws && ws.state === 'done' ? ws.at : null;
  const bar = ws && ws.state === 'skipped' ? '<div class="skipbar">Workout skipped</div>' : f ? '<div class="donebar">&#10003; Workout done' + (f === 'pending' ? ' (syncing)' : ' · ' + new Date(f).toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' })) + '<div class="donedt">' + esc(doneText()) + '</div><small>Sets stay editable: tap any set.</small></div>' : '';
  const ro = !ws && !canLog() ? '<div class="robar">' + (isPreview(viewId) ? 'Preview only. To log this workout, finish or skip the earlier days first (next up: ' + esc(wLabel(loggableId())) + ').' : 'View only. Next up: ' + esc(wLabel(loggableId()))) + '</div>' : '';
  return tb + bar + ro;
}
function mesoGrid() {
  const td = trainDays(); if (!td.length) return '';
  const L = workouts(), nx = loggableId(), b = blockOf(viewWeek()), w0 = (b - 1) * BL() + 1;
  let h = '<div class="blk">Block ' + b + ' · ' + (isDeload(viewWeek()) ? 'Deload week: lighter, half the sets' : 'Week ' + wib(viewWeek()) + ' of ' + BL()) + '</div><table class="meso"><tr><th></th>' + td.map(d => '<th>' + d[0].toUpperCase() + d.slice(1, 3) + '</th>').join('') + '</tr>';
  for (let w = w0; w < w0 + BL(); w++) {
    h += '<tr><th>' + (isDeload(w) ? 'DL' : 'W' + wib(w)) + '</th>' + td.map(d => {
      const id = 'W' + w + '-' + d, x = L.find(y => y.id === id) || { id, st: null };
      const cls = [x.st ? (x.st.state === 'skipped' ? 'skip' : 'ok') : '', id === nx ? 'cur' : '', id === viewId ? 'view' : '', canOpen(id) ? '' : 'lock', days[d] ? '' : 'unpl'].filter(Boolean).join(' ');
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
  putJSON('order', dayKeyOf(), names, { shrink: true, what: 'exercise order' });
  setTimeout(() => {
    sig = ''; render();
    const c = [...$('main').querySelectorAll('.card')].find(x => x.dataset.name === moved);
    if (c) { const r = c.getBoundingClientRect(); if (r.top < 80 || r.top > innerHeight - 260) window.scrollBy(0, r.top - 90); }
    toast('Order saved for today');
  }, DRAG_ANIM + 40);
}
function startDrag(main, card, y, pointerId, h) {
  if (drag) return;
  // Rule (Jack, Oct 20, 2026): on hold everything collapses, then the page scrolls so the held card's collapsed row sits under the finger.
  // The card keeps its slot (hold #4 without moving = stays #4). Nothing reorders or auto-scrolls until the finger has moved on purpose.
  drag = { main, card, lastY: y, y0: y, moved: false, auto: null, order0: [...main.querySelectorAll('.card')].map(c => c.dataset.name).join('|') };
  card.classList.add('dragging'); document.body.classList.add('dragmode');
  if (h && pointerId != null) { try { h.setPointerCapture(pointerId); } catch (x) {} }
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (x) {} }
  drag.grab = Math.min(30, Math.max(8, y - card.getBoundingClientRect().top));
  main.classList.add('collapsed');
  anchor(card, drag.grab, () => drag ? drag.y0 : y); // root-cause fix: scroll the collapsed slot under the finger instead of leaving the finger over other cards
  dragFollow();
  drag.auto = setInterval(() => {
    if (!drag) return;
    if (!drag.moved) { dragFollow(); return; }
    const dy = drag.lastY < 110 ? -14 : drag.lastY > innerHeight - 230 ? 14 : 0;
    if (dy) { window.scrollBy(0, dy); dragSwap(); }
    dragFollow(); // keeps the card under the finger while the other cards collapse
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
const DRAG_SLOP = 12; // px the finger must travel before a hold becomes a move
function dragMove(y, e) { if (!drag) return; if (e && e.cancelable) e.preventDefault(); if (!drag.moved && Math.abs(y - drag.y0) < DRAG_SLOP) return; drag.moved = true; drag.lastY = y; dragSwap(); dragFollow(); }
function dragFollow() { // v80: the lifted card sits under the finger; slots change underneath it
  if (!drag) return; const c = drag.card; c.style.transform = 'none'; const top = c.getBoundingClientRect().top;
  c.style.transform = 'translateY(' + Math.round(drag.lastY - drag.grab - top) + 'px) scale(1.03)';
}
function endDrag() {
  if (!drag) return;
  const { main, card, auto, order0 } = drag; clearInterval(auto);
  const changed = [...main.querySelectorAll('.card')].map(c => c.dataset.name).join('|') !== order0; // v85: save and toast only when the order really changed
  card.style.transform = ''; card.classList.remove('dragging'); document.body.classList.remove('dragmode');
  const top = Math.max(90, card.getBoundingClientRect().top);
  drag = null;
  anchor(card, 0, () => top); main.classList.remove('collapsed');
  if (changed) saveOrder(main, card.dataset.name); // same order (no move, or dragged back to the same slot): nothing saved, no toast
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
}
// Exercise menu (v113): RP-style compact list anchored at the three dots. Closes on an option tap or an outside tap.
let menuEx = null, menuBtn = null;
function choose(o) { // small choice window: o = { title, body, options: [{ v, label, cls }], keep } -> chosen v or null. v119: X or an outside tap closes; keep(v) saves a pick and stays open
  return new Promise(res => { let tries = 0; const go = () => { if (ignorePop && tries++ < 20) return setTimeout(go, 30); chooseOpen(o, res); }; go(); });
}
function chooseOpen(o, res) {
  $('chh').textContent = o.title || ''; $('cht').textContent = o.body || ''; $('cht').style.display = o.body ? '' : 'none';
  $('chl').innerHTML = o.options.map(x => '<button type="button" class="btn ' + (x.cls || 'sec') + '" data-ch="' + esc(x.v) + '">' + esc(x.label) + '</button>').join('');
  let done = false; const fin = v => { if (done) return; done = true; $('chw').classList.remove('open'); $('chw').onclick = null; res(v || null); };
  $('chw').onclick = e => {
    if (e.target.id === 'chw' || e.target.closest('#chx')) { popLayer('ch'); fin(null); return; }
    const b = e.target.closest('[data-ch]'); if (!b) return; const v = b.dataset.ch;
    if (o.keep) { o.keep(v); $('chl').querySelectorAll('[data-ch]').forEach(x => x.className = 'btn' + (x === b ? '' : ' sec')); return; }
    popLayer('ch'); fin(v);
  };
  $('chw').classList.add('open'); pushLayer('ch', () => fin(null));
}
function openMenu(i, btn) {
  menuEx = cardsFor()[i]; menuBtn = btn || null;
  const logged = rowsFor(menuEx, true).length, p = dayVal(menuEx, 'pain') || '';
  $('mskip').textContent = +dayVal(menuEx, 'skip') > 0 ? 'Undo skip sets' : 'Skip sets';
  $('mrepl').style.display = canLog() || !wStatus()[viewId] ? 'block' : 'none';
  $('mpainb').disabled = !logged; $('mpainb').innerHTML = 'Joint pain' + (p ? ' <span class="on">' + esc(p) + '</span>' : '');
  $('mdel').disabled = !days[dayKey];
  const mm = methodable(menuEx); $('mmatch').style.display = mm ? 'block' : 'none';
  if (mm) $('mmatch').innerHTML = 'Myo-rep match' + (methodOf(menuEx) === 'match' ? ' <span class="on">on</span>' : '');
  $('menu').classList.add('open'); pushLayer('menu', () => $('menu').classList.remove('open'));
  const box = $('menu').querySelector('.in'), r = btn ? btn.getBoundingClientRect() : { right: innerWidth - 8, bottom: 60, top: 60 };
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  box.style.top = (r.bottom + h + 8 <= innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
}
function closeMenu(keepHistory) { $('menu').classList.remove('open'); if (!keepHistory) popLayer('menu'); }
$('menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });
$('madd').onclick = () => { const ex = menuEx; closeMenu(); setDayVal(ex, 'extra', String((+dayVal(ex, 'extra') || 0) + 1)); toast('Set added'); };
$('mskip').onclick = () => {
  if (+dayVal(menuEx, 'skip') > 0) { const ex = menuEx; closeMenu(); setDayVal(ex, 'skip', ''); toast('Skipped sets restored'); return; }
  const ex = menuEx, left = plannedCount(ex) - rowsFor(ex, true).length; closeMenu();
  if (left <= 0) return toast('No sets left to skip');
  setDayVal(ex, 'skip', String((+dayVal(ex, 'skip') || 0) + left));
};
$('mdset').onclick = () => { // removes one unlogged planned set; logged sets are deleted from the set itself
  const ex = menuEx, left = plannedCount(ex) - rowsFor(ex, true).length; closeMenu();
  if (left <= 0) return msgPop('No unlogged sets left. To delete a logged set, tap it and use Delete.');
  removePlanned(ex.canonical);
};
$('mnote').onclick = async () => { const ex = menuEx; closeMenu(); const v = await askBox({ title: 'Note for today', body: ex.canonical, input: 'How it went, machine taken, etc.', value: dayVal(ex, 'note') || '', ok: 'Save' }); if (v != null) { setDayVal(ex, 'note', v.trim()); toast('Note saved'); } };
$('mpainb').onclick = async () => {
  const ex = menuEx; closeMenu(); const cur = dayVal(ex, 'pain') || 'none';
  // v119: a tap highlights and saves the level; the window stays open until the X or an outside tap
  await choose({ title: 'Joint pain', body: ex.canonical, keep: v => setDayVal(ex, 'pain', v === 'none' ? '' : v), options: ['none', 'mild', 'moderate', 'severe'].map(k => ({ v: k, label: k[0].toUpperCase() + k.slice(1), cls: k === cur ? '' : 'sec' })) });
};
$('mmatch').onclick = async () => {
  const ex = menuEx; closeMenu();
  try {
    const sl = ex.base ? ex.base.canonical : ex.canonical, v = methodOf(ex) === 'match' ? 'standard' : 'match', blk = blockOf(viewWeek());
    const sc = await choose({ title: v === 'match' ? 'Myo-rep match on' : 'Myo-rep match off', body: ex.canonical, options: [{ v: 'workout', label: 'This workout' }, { v: 'block', label: 'Rest of Block ' + blk }] });
    if (!sc) return;
    if (sc === 'block') { putSetting(sl, 'bmethod:B' + blk, JSON.stringify({ v, from: viewId })); if (getSetting(sl, 'method:' + viewId)) putSetting(sl, 'method:' + viewId, ''); }
    else putSetting(sl, 'method:' + viewId, v);
    sig = ''; applyState(S, false);
    toast((v === 'match' ? 'Myo-rep match on' : 'Myo-rep match off, normal sets') + (sc === 'block' ? ' for the rest of Block ' + blk : ' for this workout'));
  } catch (e) { toast('Could not set the method: ' + (e && e.message || e)); }
};
$('mdel').onclick = () => { const ex = menuEx; closeMenu(); if (ex) removeEx(ex); };
async function removeEx(ex) {
  const sc = await choose({ title: 'Remove ' + ex.canonical + '?', body: rowsFor(ex, true).length ? 'Sets you already logged today stay in your log.' : '', options: [{ v: 'workout', label: 'This workout', cls: 'sec' }, { v: 'block', label: 'Rest of Block ' + blockOf(viewWeek()), cls: 'sec' }] });
  if (sc) doDelete(ex, sc);
}
function pickGym(id, sure) {
  if (gymPick() === id) return;
  const started = workoutRows().length || manualStart();
  if (started && !sure) { gymAsk = id; $('gchw').classList.add('open'); pushLayer('gch', () => { $('gchw').classList.remove('open'); render(); }); return; }
  putSetting('profile', 'gym_day:' + (viewId || todayWid()), id); putSetting('profile', 'gym_last', id);
  if (started) retagDay(id);
  sig = ''; applyState(S, false); const g = gymById(id); toast((viewId && viewId !== todayWid() ? 'Gym for this workout: ' : 'Gym today: ') + (g ? g.name : 'home gym'), 4000);
}
let gymAsk = null;
function retagDay(id) { // the whole day moves to the new gym: rewrite the gym tag on today's logged sets
  const g = gymById(id); if (!g) return;
  workoutRows().forEach(r => { const base = String(r.notes || '').replace(GYM_RE, '').replace(TRIP_RE, '').trim(); const nt = (base + ' ' + gymTagTxt(g.name, id === 'home' ? 'home' : 'trip:' + id, id === 'home' ? '' : r.sub)).trim(); const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === r.set_id); if (pi >= 0) { q[pi].set.notes = nt; q[pi].set.gym = id === 'home' ? g.name : 'trip:' + id + ' (' + g.name + ')'; setQ(q); } else enqueue({ action: 'edit', set_id: r.set_id, fields: { notes: nt } }); });
}
$('gchy').onclick = () => { const id = gymAsk; gymAsk = null; $('gchw').classList.remove('open'); popLayer('gch'); if (id) pickGym(id, true); };
$('gchx').onclick = () => $('gchn').onclick();
$('gchn').onclick = () => { gymAsk = null; $('gchw').classList.remove('open'); popLayer('gch'); render(); };
$('mrepl').onclick = () => { const ex = menuEx; closeMenu(true); openReplace(ex); };
// ---------- Replace sheet ----------
let rEx = null, rScope = 'workout', rReason = '', rMode = 'replace';
const PRIM = m => String(m || '').toLowerCase().split(/[,(]/)[0].replace(/\b(and|front|side|rear|upper|lower|mid|long head)\b/g, ' ').split(/\s+/).filter(Boolean);
function related(a, b) {
  if (!a || !b) return false;
  if (a.rest_muscle && a.rest_muscle === b.rest_muscle) return true;
  const x = PRIM(a.muscles), y = new Set(PRIM(b.muscles)); return x.some(w => y.has(w));
}
const baseOf = ex => ex.base || ex;
function swapLog() { const s = (S && S.settings && S.settings.swaps) || {}, pq = pendingSet().swaps || {}, l = localSet().swaps || {}; return Object.values(Object.assign({}, s, pq, l)).map(v => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => (b.at || '').localeCompare(a.at || '')); }
const ICO_V = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>';
const ICO_H = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
function demoLink(c) { const u = c.video || 'https://www.youtube.com/results?search_query=' + encodeURIComponent(c.name + ' exercise demo'); return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + (c.video ? 'Demo' : 'Find a demo') + '</a>'; }
// RP style picker: rows with muscle tag + equipment + last done, filter sheet, multi-select then Add.
let rSel = [], rF = { mg: [], eq: [], done: false }, rDraft = null;
const grpOf = c => (window.CoachGroupOf ? window.CoachGroupOf(c) : '');
const eqOf = c => (window.CoachEquipOf ? window.CoachEquipOf(c) : '');
function lastDone(c) {
  if (!S || !S.rows) return '';
  const ks = new Set([P_.norm(c.name)].concat((c.aliases || []).map(P_.norm)));
  const ds = viewRows().filter(r => ks.has(P_.norm(r.exercise))).map(r => r.date).filter(Boolean).sort();
  return ds.length ? ds[ds.length - 1] : '';
}
function resItem(c, cur, custom) {
  const ok = rMode === 'add' || custom || related(c, cur), g = grpOf(c), e = eqOf(c), ld = custom ? '' : lastDone(c);
  const col = (window.CoachMGColor || {})[g] || '#9e9e9e', sel = rSel.some(x => P_.norm(x.name) === P_.norm(c.name));
  const ldTxt = ld ? new Date(ld + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: ld.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }) : '';
  return '<div class="ri' + (sel ? ' sel' : '') + '" data-pick="' + esc(c.name) + '"' + (custom ? ' data-custom="1"' : '') + '><span class="ck"></span><div class="rt"><b>' + esc(custom ? 'Use "' + c.name + '"' : c.name) + '</b>' + '' + '<br>' +
    (custom ? '<span class="s2">Custom exercise. Coach looks it up later and adds a demo.</span>' :
      (g ? '<span class="mg" style="background:' + col + '">' + esc(g) + '</span>' : '<span class="s2">muscles unknown</span>') + (e ? ' <span class="s2">&bull; ' + esc(e) + '</span>' : '') + (ldTxt ? '<br><span class="rlast">Last done ' + esc(ldTxt) + '</span>' : '') + ' <span class="s2">&middot;</span> ' + demoLink(c)) +
    (ok ? '' : '<div class="warn">&#9888; Does not work the same muscles as ' + esc(cur.canonical) + '</div>') + '</div></div>';
}
function rFilt(c) {
  if (rF.mg.length && !rF.mg.includes(grpOf(c))) return false;
  if (rF.eq.length && !rF.eq.includes(eqOf(c))) return false;
  if (rF.done && !lastDone(c)) return false;
  return true;
}
function rPills() {
  const p = [];
  if (rF.mg.length) p.push(['mg', rF.mg.length === 1 ? rF.mg[0] : '+' + rF.mg.length + ' Muscle groups']);
  if (rF.eq.length) p.push(['eq', rF.eq.length === 1 ? rF.eq[0] : '+' + rF.eq.length + ' Equipment']);
  if (rF.done) p.push(['done', 'Only done']);
  $('rpills').innerHTML = p.map(x => '<button type="button" class="pill" data-clr="' + x[0] + '">' + esc(x[1]) + '<b aria-label="Clear">&times;</b></button>').join('');
  $('rfb').textContent = p.length ? 'Filter (' + p.length + ')' : 'Filter';
}
function rRender() {
  rPills();
  const q = $('rq').value.trim(), cur = curInfo(rEx);
  const excl = rMode === 'replace' ? new Set([P_.norm(rEx.canonical)]) : new Set(cardsFor().map(c => P_.norm(c.canonical)));
  let list = (q ? searchCat(q, true) : catalog().slice().sort((a, b) => a.name.localeCompare(b.name))).filter(c => !excl.has(P_.norm(c.name)) && rFilt(c));
  const n = list.length; list = list.slice(0, 100);
  $('rres').innerHTML = (list.length ? list.map(c => resItem(c, cur)).join('') + (n > 100 ? '<div class="s2">Showing 100 of ' + n + '. Search or filter to narrow it.</div>' : '') : '<div class="s2">No match' + (rF.mg.length || rF.eq.length || rF.done ? ' with these filters' : '') + '.</div>') +
    (q ? resItem({ name: q }, cur, true) : '');
  rGo();
}
function rGo() { const n = rSel.length; $('rgo').classList.toggle('on', n > 0 || rMode !== 'add'); $('rgob').classList.toggle('dim', !n); $('rgob').textContent = rMode === 'add' ? 'Add' + (n > 1 ? ' ' + n + ' exercises' : '') : rSel[0] ? 'Replace with ' + rSel[0].name : 'Replace'; }
function rToggle(name, custom) {
  const i = rSel.findIndex(x => P_.norm(x.name) === P_.norm(name));
  if (i >= 0) rSel.splice(i, 1); else if (rMode === 'add') rSel.push({ name, custom }); else rSel = [{ name, custom }];
  document.querySelectorAll('#repl .ri').forEach(el => el.classList.toggle('sel', rSel.some(x => P_.norm(x.name) === P_.norm(el.dataset.pick))));
  rGo();
}
function chipRow(id, all, on) { $(id).innerHTML = all.map(v => '<button type="button" data-v="' + esc(v) + '" class="' + (on.includes(v) ? 'on' : '') + '">' + esc(v) + '</button>').join(''); }
function openFilter() {
  rDraft = { mg: rF.mg.slice(), eq: rF.eq.slice(), done: rF.done };
  chipRow('rfmg', window.CoachMG || [], rDraft.mg); chipRow('rfeq', window.CoachEQ || [], rDraft.eq); $('rfdone').checked = rDraft.done;
  $('rfil').classList.add('open'); pushLayer('rfil', () => $('rfil').classList.remove('open'));
}
const closeFilter = () => { if (!$('rfil').classList.contains('open')) return; $('rfil').classList.remove('open'); popLayer('rfil'); };
$('rfb').onclick = openFilter; $('rfc').onclick = closeFilter; $('rfx').onclick = closeFilter;
$('rfil').addEventListener('click', e => {
  if (e.target.id === 'rfil') return closeFilter();
  const b = e.target.closest('.chips2 button'); if (!b) return;
  const arr = b.parentElement.id === 'rfmg' ? rDraft.mg : rDraft.eq, v = b.dataset.v, i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v); b.classList.toggle('on', i < 0);
});
$('rfa').onclick = () => { rDraft.done = $('rfdone').checked; rF = rDraft; closeFilter(); rRender(); };
$('rpills').addEventListener('click', e => { const b = e.target.closest('[data-clr]'); if (!b) return; const k = b.dataset.clr; if (k === 'done') rF.done = false; else rF[k] = []; rRender(); });
// v115 (Jack, Oct 29): creating a new exercise asks for its equipment and body part first.
const CEX_EQ = [['machine', 'Machine'], ['cable', 'Cable'], ['smith', 'Smith machine'], ['barbell', 'Barbell'], ['ez', 'EZ bar'], ['hexbar', 'Hex bar'], ['dumbbell', 'Dumbbell'], ['bodyweight', 'Bodyweight'], ['bodyweight_loadable', 'Weighted bodyweight'], ['band', 'Band'], ['other', 'Other']];
let cexDone = null, cexName = '', cexEq = '', cexMg = [];
function cexRender() {
  $('cexeq').innerHTML = CEX_EQ.map(x => '<button type="button" data-v="' + x[0] + '" class="' + (cexEq === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>').join('');
  $('cexmg').innerHTML = (window.CoachMG || []).map(v => '<button type="button" data-v="' + esc(v) + '" class="' + (cexMg.includes(v) ? 'on' : '') + '">' + esc(v) + (cexMg[0] === v && cexMg.length > 1 ? ' (primary)' : '') + '</button>').join('');
}
function classifyNew(name, done) {
  cexName = name.replace(/^./, x => x.toUpperCase()); cexDone = done; cexMg = []; cexEq = '';
  try { const t = window.CoachEquipType({ name: cexName }); if (t && t !== 'other') cexEq = t === 'machine_plate' ? 'machine' : t === 'machine_assisted' ? 'machine' : t; } catch (e) {}
  $('cexh').textContent = 'New exercise: ' + cexName; cexRender();
  $('cexw').classList.add('open'); pushLayer('cex', () => $('cexw').classList.remove('open'));
}
const cexClose = () => { $('cexw').classList.remove('open'); popLayer('cex'); };
$('cexeq').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; cexEq = b.dataset.v; cexRender(); };
$('cexmg').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v, i = cexMg.indexOf(v); if (i >= 0) cexMg.splice(i, 1); else if (cexMg.length < 3) cexMg.push(v); cexRender(); };
$('cexx').onclick = $('cexc').onclick = () => { cexDone = null; cexClose(); };
$('cexs').onclick = () => {
  if (!cexEq) return msgPop('Pick the equipment first.');
  if (!cexMg.length) return msgPop('Pick at least one body part.');
  const muscles = cexMg.join(', '), rm = cexMg[0].toLowerCase(), def = { name: cexName, equip: cexEq, muscles, rest_muscle: rm, types: ['isolation'], at: new Date().toISOString() };
  if (!putJSON('custom_ex', P_.norm(cexName), def, { what: 'custom exercise' })) return;
  putSetting('pending_exercises', P_.norm(cexName), JSON.stringify({ name: cexName, at: def.at, wid: viewId, equip: cexEq, muscles, created: true }));
  const d = cexDone; cexDone = null; cexClose(); if (d) d(cexName);
};
$('rgob').onclick = () => {
  const nc = rSel.find(x => x.custom && !catFind(x.name));
  if (nc) return classifyNew(nc.name, nm => { nc.name = nm; $('rgob').onclick(); });
  if (!rSel.length) return msgPop(rMode === 'add' ? 'Pick an exercise first. Tap one in the list, then tap Add.' : 'Pick an exercise first. Tap one in the list, then tap Replace.'); if (rMode === 'add') addMany(rSel.slice()); else pickReplace(rSel[0].name, !!rSel[0].custom); };
function curInfo(ex) { return { canonical: ex.canonical, name: ex.canonical, muscles: ex.muscles, rest_muscle: ex.rest_muscle, types: ex.types }; }
function replMode(add) {
  rMode = add ? 'add' : 'replace';
  $('rscope').previousElementSibling.textContent = add ? 'Add for' : 'Replace for';
  $('rreason').style.display = $('rreason').previousElementSibling.style.display = add ? 'none' : '';
}
function openAdd() {
  replMode(true); rEx = { canonical: 'this workout', note: {}, muscles: '', types: [] }; rScope = 'workout'; rReason = 'added';
  $('rh').textContent = 'Add exercise to ' + wLabel(viewId); setSeg('rscope', 's', rScope);
  $('rq').value = ''; $('rlist').innerHTML = ''; $('rundo').style.display = 'none'; rSel = []; rF = { mg: [], eq: [], done: false }; rRender();
  $('repl').classList.add('open'); pushLayer('repl', () => $('repl').classList.remove('open'));
  requestAnimationFrame(() => { $('repl').querySelector('.in').scrollTop = 0; });
}
function addMany(items) {
  try {
    const k = addKey(rScope); let list = readAdds(k); const added = [], unknown = [];
    items.forEach(it => {
      const c = catFind(it.name), to = c ? c.name : it.name.replace(/^./, x => x.toUpperCase());
      if (cardsFor().some(x => P_.norm(x.canonical) === P_.norm(to)) || list.some(a => P_.norm(a.name) === P_.norm(to))) return;
      list = list.concat([Object.assign({ name: to, at: new Date().toISOString() }, rScope === 'block' ? { from: viewId } : {})]); added.push(to);
      if (!c) { unknown.push(to); putSetting('pending_exercises', P_.norm(to), JSON.stringify({ name: to, at: new Date().toISOString(), wid: viewId, added: true, scope: rScope })); }
    });
    if (!added.length) return toast('Already in this workout.');
    if (!putJSON('adds', k, list, { what: 'added exercises' })) return;
    closeRepl(); swapMemo = {}; sig = ''; applyState(S, true);
    toast(unknown.length ? "Added it for now. I'll look it up and add the info, like a demo, later." : 'Added ' + (added.length === 1 ? added[0] : added.length + ' exercises') + (rScope === 'block' ? ' for the rest of Block ' + blockOf(viewWeek()) : ' to this workout'), unknown.length ? 7000 : 5000);
  } catch (e) { closeRepl(); toast('Could not add: ' + (e && e.message || e), 6000); }
}
function pickAdd(name, custom) {
  try {
    const c = catFind(name), to = c ? c.name : name.replace(/^./, x => x.toUpperCase());
    if (cardsFor().some(x => P_.norm(x.canonical) === P_.norm(to))) return toast(to + ' is already in this workout.');
    const k = addKey(rScope), list = readAdds(k).concat([Object.assign({ name: to, at: new Date().toISOString() }, rScope === 'block' ? { from: viewId } : {})]);
    if (!putJSON('adds', k, list, { what: 'added exercises' })) return;
    if (!c) putSetting('pending_exercises', P_.norm(to), JSON.stringify({ name: to, at: new Date().toISOString(), wid: viewId, added: true, scope: rScope }));
    closeRepl(); swapMemo = {}; sig = ''; applyState(S, true);
    toast(!c ? "Added it for now. I'll look it up and add the info, like a demo, later." : 'Added ' + to + (rScope === 'block' ? ' for the rest of Block ' + blockOf(viewWeek()) : ' to this workout'), !c ? 7000 : 5000);
  } catch (e) { closeRepl(); toast('Could not add: ' + (e && e.message || e), 6000); }
}
function openReplace(ex) {
  replMode(false); rEx = ex; rScope = 'workout'; rReason = '';
  $('rh').textContent = 'Replace ' + ex.canonical;
  setSeg('rscope', 's', rScope); setSeg('rreason', 'r', '');
  $('rq').value = ''; rSel = [];
  { const g = grpOf(catFind(ex.canonical) || { name: ex.canonical, muscles: ex.muscles, rest_muscle: ex.rest_muscle, equip: ex.equip }); rF = { mg: g ? [g] : [], eq: [], done: false }; }
  $('rundo').style.display = ex.swappedFrom ? 'block' : 'none';
  if (ex.swappedFrom) $('rundo').textContent = 'Go back to ' + ex.swappedFrom;
  const b = baseOf(ex), cur = curInfo(ex), cat = catalog(), excl = new Set([P_.norm(ex.canonical)].concat(cardsFor().map(c => P_.norm(c.canonical))));
  const used = []; swapLog().forEach(x => { if (x.from === b.canonical && x.to && !excl.has(P_.norm(x.to)) && !used.some(u => P_.norm(u.name) === P_.norm(x.to)) && x.reason !== 'undo') used.push(catFind(x.to) || { name: x.to, muscles: '' }); });
  if (ex.swappedFrom && !excl.has(P_.norm(b.canonical))) excl.add(P_.norm(b.canonical));
  used.forEach(u => excl.add(P_.norm(u.name)));
  const iso = (ex.types || []).includes('isolation');
  const same = cat.filter(c => !excl.has(P_.norm(c.name)) && related(c, cur))
    .map(c => ({ c, sc: (c.rest_muscle === ex.rest_muscle ? 4 : 0) + (((c.types || []).includes('isolation')) === iso ? 2 : 0) + (c.mine ? 1 : 0) }))
    .sort((a, b) => b.sc - a.sc).slice(0, 4).map(x => x.c);
  $('rlist').innerHTML = (used.length ? '<label>You used before</label>' + used.slice(0, 4).map(c => resItem(c, cur)).join('') : '') +
    '';
  rRender();
  $('repl').classList.add('open'); swapLayer('menu', 'repl', () => $('repl').classList.remove('open'));
  requestAnimationFrame(() => { $('repl').querySelector('.in').scrollTop = 0; });
}
function setSeg(id, attr, v) { document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset[attr] === v)); }
document.querySelectorAll('#rscope button').forEach(b => b.onclick = () => { rScope = b.dataset.s; setSeg('rscope', 's', rScope); });
document.querySelectorAll('#rreason button').forEach(b => b.onclick = () => { rReason = b.dataset.r; setSeg('rreason', 'r', rReason); });
const SYN = { db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', hs: 'hammer', 'plate-loaded': 'hammer', pec: 'chest', pecs: 'chest', delt: 'delts', shoulder: 'delts', shoulders: 'delts', lat: 'lats', tri: 'triceps', tris: 'triceps', bi: 'biceps', bis: 'biceps', quad: 'quads', ham: 'hamstrings', hams: 'hamstrings', glute: 'glutes', trap: 'traps', ab: 'abs' };
function searchCat(q, all) {
  const toks = q.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean).map(t => SYN[t] || t).map(t => t.length > 3 ? t.replace(/s$/, '') : t);
  if (!toks.length) return [];
  const cur = curInfo(rEx);
  return catalog().filter(c => { const h = (c.name + ' ' + (c.aliases || []).join(' ') + ' ' + c.muscles + ' ' + c.equip + ' ' + c.rest_muscle).toLowerCase().replace(/shoulders?/g, 'delts shoulder'); return toks.every(t => h.includes(t)); })
    .sort((a, b) => (related(b, cur) - related(a, cur)) || a.name.localeCompare(b.name)).slice(0, all ? 1000 : 15);
}
$('rq').oninput = rRender;
$('repl').addEventListener('click', e => {
  if (e.target.id === 'repl') return closeRepl();
  if (e.target.closest('a')) return;
  const it = e.target.closest('[data-pick]'); if (it) rToggle(it.dataset.pick, !!it.dataset.custom);
});
const closeRepl = () => { $('repl').classList.remove('open'); popLayer('repl'); };
$('rclose').onclick = closeRepl;
async function pickReplace(name, custom) {
  if (!rReason) { $('rreason').scrollIntoView({ block: 'center' }); msgPop('Pick a reason first: Equipment busy, Pain or Preference. Then tap Replace again.'); return; }
  const ex = rEx, b = baseOf(ex), c = catFind(name) || { name: custom ? name.replace(/^./, x => x.toUpperCase()) : name, muscles: '' }, to = c.name;
  if (P_.norm(to) === P_.norm(ex.canonical)) return toast('That is the current exercise.');
  if (!related(c, curInfo(ex)) && !(await askBox({ title: 'Replace anyway?', body: to + (c.muscles ? ' works ' + c.muscles.toLowerCase() : ' has no muscle info') + ', not the same muscles as ' + ex.canonical + '.', ok: 'Replace' }))) return;
  const blk = blockOf(viewWeek());
  if (rScope === 'block' && !(b.types || []).includes('isolation') && !(await askBox({ title: 'Replace a main lift?', body: b.canonical + ' is a main lift, fixed for the block. Replace it with ' + to + ' for the rest of Block ' + blk + '?', ok: 'Replace' }))) return;
  if (rowsFor(ex, true).length && !(await askBox({ title: 'Replace anyway?', body: 'You already logged ' + ex.canonical + ' sets in this workout. They stay in your log.', ok: 'Replace' }))) return;
  const unknown = !catFind(to);
  try {
    applySwap(b, to, rScope, rReason, ex.canonical, unknown);
    // Unknown names wait in settings scope 'pending_exercises' (Settings sheet) for Coach to add to the library.
    if (unknown) putSetting('pending_exercises', P_.norm(to), JSON.stringify({ name: to, at: new Date().toISOString(), wid: viewId, replaced: b.canonical, scope: rScope, reason: rReason }));
  } catch (e) { closeRepl(); toast('Could not replace: ' + (e && e.message || e), 6000); return; }
  closeRepl();
  toast(unknown ? "Replaced it for now. I'll look it up and add the info, like a demo, later." : 'Replaced with ' + to + (rScope === 'block' ? ' for the rest of Block ' + blk : ' for this workout'), unknown ? 7000 : 5000);
}
function applySwap(b, to, scope, reason, was, custom) {
  const blk = blockOf(viewWeek()), back = P_.norm(to) === P_.norm(b.canonical);
  if (scope === 'block') { if (back) putSetting(b.canonical, 'bswap:B' + blk, ''); else if (!putJSON(b.canonical, 'bswap:B' + blk, { to, from: viewId }, { what: 'swap' })) return; if (getSetting(b.canonical, 'swap:' + viewId)) putSetting(b.canonical, 'swap:' + viewId, ''); }
  else putSetting(b.canonical, 'swap:' + viewId, back && !swapInfo(b) ? '' : to);
  putJSON('swaps', 's' + Date.now().toString(36), (Object.assign({ at: new Date().toISOString(), wid: viewId, block: blk, from: b.canonical, was, to, scope, reason }, custom ? { custom: true, pending: 'pending_exercises' } : {})));
  swapMemo = {}; sig = ''; applyState(S, true);
}
$('rundo').onclick = async () => {
  const ex = rEx, b = baseOf(ex); if (!ex.swappedFrom) return;
  if (ex.swapScope === 'workout') { putSetting(b.canonical, 'swap:' + viewId, ''); if (swapInfo(b)) putSetting(b.canonical, 'swap:' + viewId, b.canonical); }
  else { if (!(await askBox({ title: 'Go back?', body: 'Go back to ' + b.canonical + ' for the rest of Block ' + blockOf(viewWeek()) + '?', ok: 'Go back' }))) return; const v = sJSON(b.canonical, 'bswap:B' + blockOf(viewWeek()), {}); putSetting(b.canonical, 'bswap:B' + blockOf(viewWeek()), v.from === viewId ? '' : JSON.stringify({ to: b.canonical, from: viewId })); }
  putJSON('swaps', 's' + Date.now().toString(36), ({ at: new Date().toISOString(), wid: viewId, block: blockOf(viewWeek()), from: b.canonical, was: ex.canonical, to: b.canonical, scope: ex.swapScope, reason: 'undo' }));
  closeRepl(); swapMemo = {}; sig = ''; applyState(S, true); toast('Back to ' + b.canonical);
};
function histLine(rs) { // RP style: '160 lbs x 12, 12, 7' or '190 x 11, 180 x 8, 8 +1D'
  const ld = r => String(r.total_load || r.load || ''), rp = r => (r.left_reps || r.right_reps) ? (r.left_reps || '-') + '/' + (r.right_reps || '-') : String(r.reps || '');
  const tag = r => (+r.drops ? ' +' + r.drops + 'D' : '') + (miniOf(r) ? ' +' + miniOf(r) + 'M' : '');
  const same = rs.every(r => ld(r) === ld(rs[0])), u = isStretch(exFor(rs[0].exercise)) ? '°' : ' lbs';
  if (same) return (ld(rs[0]) ? ld(rs[0]) + u + ' x ' : '') + rs.map(r => rp(r) + tag(r)).join(', ');
  let prev = null; return rs.map(r => { const w = ld(r), t = (w !== prev ? (w || 'BW') + ' x ' : '') + rp(r) + tag(r); prev = w; return t; }).join(', ');
}
let histEx = null, histMonths = 2;
const HIST_CHUNK = 2; // months per load; the first load stops 2 months back, Load older goes further
function openHistory(ex, fromMenu, keep) {
  if (!keep) histMonths = HIST_CHUNK; histEx = ex;
  const c = tripCfg(), gid = curGymId(), port = portableEx(ex), gname = port ? 'All gyms' : gid === 'home' ? (homeGym() || 'Home gym') : c.name;
  const all = viewRows(false, true).filter(r => (port || tripGymOf(r) === gid) && keysOf(ex).has(P_.norm(r.exercise))).sort((a, b) => tsOf(a) - tsOf(b));
  const cut = new Date(S.today + 'T12:00:00'); cut.setMonth(cut.getMonth() - histMonths); const cutIso = cut.toISOString().slice(0, 10);
  const rs = all.filter(r => (r.date || '') >= cutIso), older = all.length - rs.length;
  $('hgym').textContent = 'Gym: ' + gname + ' · newest first · ' + (older ? 'since ' + cut.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'all sets');
  $('hmore').style.display = older ? 'block' : 'none'; $('hmore').textContent = 'Load older (' + older + (older === 1 ? ' set' : ' sets') + ')';
  const by = {}; rs.forEach(r => { const k = (r.workout && wParse(r.workout) ? r.workout : r.date) || widOf(r); (by[k] = by[k] || []).push(r); });
  const ks = Object.keys(by).sort((a, b) => (tsOf(by[b][0]) - tsOf(by[a][0])) || (by[b][0].date || '').localeCompare(by[a][0].date || ''));
  const td = trainDays(); let lastB = null;
  $('hh').textContent = ex.canonical;
  $('hb').innerHTML = ks.length ? ks.map(k => {
    const g = by[k], p = wParse(widOf(g[0])), w = p ? p.w : weekOf(g[0].date), dl = isDeload(w), bl = blockOf(w);
    const dn = p ? td.indexOf(p.day) + 1 : 0, dt = g[0].date ? new Date(g[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const head = bl !== lastB ? '<div class="hm">Block ' + bl + '</div>' : ''; lastB = bl;
    const tr = g.find(isTrip), trTxt = tr ? '<div class="s2 trip">' + esc(tr.gym_name) + (subOf(tr) ? ': did ' + esc(subOf(tr)) : '') + '</div>' : '';
    const wid = widOf(g[0]), pain = getSetting(ex.canonical, 'pain:' + wid), note = getSetting(ex.canonical, 'note:' + wid);
    return head + '<div class="hr' + (dl ? ' dl' : '') + '"><div class="hl">' + esc(histLine(g)) + trTxt + (pain ? '<div class="s2">pain ' + esc(pain) + '</div>' : '') + (note ? '<div class="s2"><i>' + esc(note) + '</i></div>' : '') + '</div><div class="hx">' + (dl ? 'DELOAD' : 'WEEK ' + wib(w)) + (dn > 0 ? ' - DAY ' + dn : '') + '<br>' + esc(dt) + '</div></div>';
  }).join('') : '<div class="s2">' + (older ? 'Nothing in the last ' + histMonths + ' months. Tap Load older.' : 'No history at ' + esc(gname) + ' yet.') + '</div>';
  if (keep) return;
  $('hist').classList.add('open');
  const close = () => $('hist').classList.remove('open');
  if (fromMenu) swapLayer('menu', 'hist', close); else pushLayer('hist', close);
}
const closeHist = () => { $('hist').classList.remove('open'); popLayer('hist'); };
$('hclose').onclick = closeHist;
$('hmore').onclick = () => { histMonths += HIST_CHUNK; if (histEx) openHistory(histEx, false, true); };
$('hist').addEventListener('click', e => { if (e.target.id === 'hist') closeHist(); });

// ---------- Render ----------
function btnLabel(ex) {
  const t = getT();
  if (ex.single && t && t.firstSide && P_.norm(t.exercise) === P_.norm(ex.canonical)) return isStretch(ex) ? 'Second side done: log hold' : 'Second side done: log set';
  return ex.single ? (isStretch(ex) ? 'First side done' : 'First side done') : (isStretch(ex) ? 'Hold done' : 'Set done');
}
const cnClosed = () => jget('coach_cn_closed', []);
function gymBind(main) {
  const sel = main.querySelector('#gymsel'); if (sel) sel.onchange = () => pickGym(sel.value);
  const gi = main.querySelector('#goalin'); if (gi) gi.onchange = () => { putSetting('profile', 'goal:' + viewId, gi.value.trim()); toast('Goal saved', 2500); };
}
// Message-only pop-up (tap anywhere to close).
function msgPop(m) { $('msgt').textContent = m; $('msgw').classList.add('open'); pushLayer('msg', () => $('msgw').classList.remove('open')); }
$('msgw').onclick = () => { $('msgw').classList.remove('open'); popLayer('msg'); };
// Coach tips pop up only right after Start workout and right after the last planned set of an exercise, for the next unlogged exercise. Once per exercise per workout.
const sentence = t => { t = String(t || '').trim(); if (!t) return ''; t = t[0].toUpperCase() + t.slice(1); return /[.!?]$/.test(t) ? t : t + '.'; };
// Rule (Jack, Oct 20, 2026): the tip pop-up shows only day-specific custom tips, never the default library tip or other card text.
// Custom = the program line's 'Note:' for that day plus this week's notes for this exercise on this day. None = no pop-up (the card still shows the default tips).
function tipsFor(ex) { const n = ex.note || {}; let w = []; try { w = weekNotesFor(ex).map(x => x.text); } catch (e) {} return (n.custom ? [n.custom] : []).concat(w).map(sentence).filter(Boolean); }
// v86 (Jack, Oct 21): daily quote, preloaded with the program (the '## Daily quotes' block that build-quotes.py writes into program.md from the Coach Quotes sheet). No fetch at workout start.
function quoteToday() {
  const s = (S && S.program) || '', d = (S && S.today) || ''; if (!d) return null;
  const m = s.match(new RegExp('^- ' + d + ' \\| (.+?) \\| ?(.*)$', 'm')); return m ? { q: m[1].trim(), a: m[2].trim() } : null;
}
function tipShow(ex, force, withQuote) { // force: ignore the seen list. Both triggers (Rule 1 Start, Rule 2 last set) pass force; the seen list no longer suppresses either
  if (!canLog()) return false;
  const qt = withQuote ? quoteToday() : null; if (!ex && !qt) return false;
  const k = 'coach_tips_' + P + '_' + viewId, seen = jget(k, []); if (!qt && !force && seen.includes(ex.canonical)) return false;
  const tips = ex ? tipsFor(ex) : []; if (!tips.length && !qt) return false;
  if (ex && tips.length && !seen.includes(ex.canonical)) { seen.push(ex.canonical); jset(k, seen); }
  const qh = qt ? '<figure class="qt"><blockquote>' + esc(qt.q) + '</blockquote>' + (qt.a ? '<figcaption>' + esc(qt.a) + '</figcaption>' : '') + '</figure>' : '';
  const th = tips.length ? (qt ? '<h4 class="tiph2">Coach tip: ' + esc(ex.canonical) + '</h4>' : '') + tips.map(t => '<p>' + esc(t) + '</p>').join('') : '';
  $('tiph').textContent = qt ? '' : 'Coach tip: ' + ex.canonical; $('tiph').hidden = !!qt; $('tipb').innerHTML = qh + th;
  $('tipw').classList.add('open'); pushLayer('tip', () => $('tipw').classList.remove('open')); return true;
}
function quoteEnd() { // v108 (Jack, Oct 27): a different quote from the same Daily quotes block when the workout ends
  const st = quoteToday(), all = [...((S && S.program) || '').matchAll(/^- \d{4}-\d{2}-\d{2} \| (.+?) \| ?(.*)$/gm)].map(m => ({ q: m[1].trim(), a: m[2].trim() })).filter(x => !st || x.q !== st.q);
  if (!all.length) return null; const d = String((S && S.today) || '').replace(/\D/g, ''); return all[(+d || 0) % all.length];
}
function endQuoteShow() { const qt = quoteEnd(); $('tiph').textContent = ''; $('tiph').hidden = true; $('tipb').innerHTML = '<p class="fin">Workout finished. Nice work.</p>' + (!qt ? '' : '<figure class="qt"><blockquote>' + esc(qt.q) + '</blockquote>' + (qt.a ? '<figcaption>' + esc(qt.a) + '</figcaption>' : '') + '</figure>'); $('tipw').classList.add('open'); pushLayer('tip', () => $('tipw').classList.remove('open')); }
const tipClose = () => { $('tipw').classList.remove('open'); popLayer('tip'); };
$('tipok').onclick = tipClose; $('tipx').onclick = tipClose; $('tipw').addEventListener('click', e => { if (e.target.id === 'tipw') tipClose(); });
// v119: the next exercise = the first one after the current card (wrapping to the top) with no logged and no skipped sets; else the first with sets left.
function nextUp(cur) {
  const list = cardsFor(), cn = cur ? cur.canonical : null, i = list.findIndex(x => x.canonical === cn), ring = list.slice(i + 1).concat(list.slice(0, i + 1)).filter(x => x.canonical !== cn);
  const left = x => rowsFor(x, true).length < plannedCount(x);
  return ring.find(x => left(x) && !rowsFor(x, true).length && !(+dayVal(x, 'skip') > 0)) || ring.find(left) || null;
}
const barH = () => { const t = $('timer'); return t && getComputedStyle(t).position === 'fixed' ? t.getBoundingClientRect().bottom : 0; };
function tipUpcoming(force, withQuote, cur) { // after Start workout or after the last planned set: scroll to the next unlogged exercise; pop up only if it has a custom tip
  const list = cardsFor(), nx = nextUp(cur), i = nx ? list.findIndex(x => x.canonical === nx.canonical) : -1; if (i < 0) { if (withQuote) tipShow(null, force, true); return; }
  const c = $('c' + i); if (c) { const off = Math.max(barH(), 0); scrollTo({ top: Math.max(0, scrollY + c.getBoundingClientRect().top - off - 8), behavior: 'smooth' }); }
  setTimeout(() => tipShow(list[i], force, withQuote), 500);
}
// Rule 2 (intended): after the last planned set of an exercise, the next unlogged exercise's tip pops up even if it was seen before.
function tipNext(ex) { if (rowsFor(ex, true).length >= plannedCount(ex)) tipUpcoming(true, false, ex); }
function render() {
  const main = $('main'), d = days[dayKey];
  const nx = loggableId();
  $('prof').value = P;
  if (!d) {
    $('sub').textContent = subWeek() + ' - Unplanned (' + dayKey[0].toUpperCase() + dayKey.slice(1) + ')';
    const ws = wStatus()[viewId];
    main.innerHTML = '<div id="meso">' + mesoHTML() + '</div><div class="empty"><b>Unplanned</b><br>' + (S.program ? 'No session written for ' + esc(dayKey[0].toUpperCase() + dayKey.slice(1)) + ' yet. Ask Coach to write it.' : 'No program file found for this profile yet. Ask Coach to write one.') + '</div>' +
      (!ws && canLog() ? '<button class="btn sec" id="uskip">Skip this workout</button>' : '');
    gymBind(main); main.onclick = e => { if (e.target.closest('#uskip')) skipWorkout(); };
    return;
  }
  $('sub').textContent = subWeek() + ' - ' + titleGym(titleCase(d.title));
  main.innerHTML = '<div id="meso">' + mesoHTML() + '</div><div id="wstart">' + wstartHTML() + '</div>' + weekBoxHTML(weekNotesFor(null), true) + cardsFor().map((ex, i) => {
    const n = ex.note, chips = [n.sets].concat(n.plan_txt || []).concat([n.failure, n.rest]).filter(Boolean).map(c => '<span class="chip">' + esc(c) + '</span>').join('');
    const tips = (ex.cue ? [ex.cue] : []).concat(n.extra).concat(methodOf(ex) === 'match' ? [TECH.match.info] : []);
    const extra = tips.length ? '<ul>' + tips.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    return '<div class="card" id="c' + i + '" data-name="' + esc(ex.canonical) + '"><h2><span class="grip" aria-label="Drag to reorder">&#8801;</span><span class="ttl">' + (i + 1) + '. ' + esc(ex.canonical) + '</span>' + (ex.video ? '<a class="ico" href="' + esc(ex.video) + '" target="_blank" rel="noopener noreferrer" aria-label="Demo video">' + ICO_V + '</a>' : '<span class="ico off" aria-label="No demo video">' + ICO_V + '</span>') + '<button type="button" class="ico" data-hi="' + i + '" aria-label="History">' + ICO_H + '</button>' + '<button class="menu-btn" data-m="' + i + '" aria-label="Exercise menu">&#8943;</button></h2><div class="cbody">' +
      (ex.swappedFrom ? '<div class="swp">Replaces ' + esc(ex.swappedFrom) + (ex.swapScope === 'block' ? ' for the rest of this block' : ' in this workout') + '</div>' : '') +
      (dayVal(ex, 'pain') ? '<div class="pain">Joint pain today: ' + esc(dayVal(ex, 'pain')) + '</div>' : '') +
      (dayVal(ex, 'note') ? '<div class="dnote">Note: ' + esc(dayVal(ex, 'note')) + '</div>' : '') +
      '<div class="meta">' + esc(ex.muscles || '') + '</div>' +
      '<details class="note cn" data-cn="' + esc(ex.canonical) + '"' + (cnClosed().includes(ex.canonical) ? '' : ' open') + '><summary><b>Coach (default)</b><span class="cnbtn" role="img" aria-label="' + (cnClosed().includes(ex.canonical) ? 'Expand coach notes' : 'Collapse coach notes') + '"><span class="circ"><span class="chev"></span></span></span></summary><div class="chips">' + chips + '</div>' + extra + '</details>' + weekBoxHTML(weekNotesFor(ex)) +
      '<div class="setup" data-su="' + i + '"><b>Setup:</b> <span id="su' + i + '">' + esc(setupFor(ex) || (plateT(ex) ? 'tap to add (bar weight, e.g. 45 lb ' + (BAR_NAME[equipType(ex)] || 'bar') + ')' : 'tap to add (seat, pins, angle)')) + '</span> <span class="ed">edit</span></div>' +
      warmHTML(ex, i, cardsFor()) +
      '<div class="last" id="l' + i + '">' + esc(lastTime(ex)) + '</div>' +
      '<ul class="sets" id="s' + i + '">' + setsHTML(ex) + '</ul>' +
      '</div></div>';
  }).join('') + (d.footer && d.footer.length ? '<div class="note">' + d.footer.map(esc).join('<br>') + '</div>' : '') +
    '<div id="finwrap"></div>';
  main.querySelectorAll('[data-su]').forEach(el => el.onclick = () => editSetup(+el.dataset.su));
  main.querySelectorAll('[data-hi]').forEach(b => b.onclick = e => { e.stopPropagation(); const ex = cardsFor()[+b.dataset.hi]; if (ex) openHistory(ex); });
  main.querySelectorAll('.card h2 .ico.off').forEach(b => b.onclick = e => { e.stopPropagation(); toast('No demo video for this exercise yet'); });
  main.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); openMenu(+b.dataset.m, b); });
  enableDrag(main);
  main.querySelectorAll('details.cn').forEach(d => d.addEventListener('toggle', () => { const cb = d.querySelector('.cnbtn'); if (cb) cb.setAttribute('aria-label', d.open ? 'Collapse coach notes' : 'Expand coach notes'); const l = cnClosed().filter(x => x !== d.dataset.cn); if (!d.open) l.push(d.dataset.cn); jset('coach_cn_closed', l); }));
  gymBind(main);
  main.onclick = e => {
    const plb = e.target.closest('[data-pl]'); if (plb) { const d = plb.parentElement.querySelector('.wup'); if (d) d.hidden = !d.hidden; return; }
    if (e.target.closest('details.wu') || e.target.closest('details.cn > summary') || e.target.closest('.gymrow')) return;
    const tqb = e.target.closest('[data-tq]'); if (tqb) { openTech(tqb.dataset.tq); return; }
    if (e.target.closest('#wstartb')) { askNotifyOnTap(); startWorkout(false); return; }
    if (e.target.closest('#wreset')) { openReset(); return; }
    const tf = e.target.closest('li.plan:not(.wrm) [data-f]');
    if (tf) { const lb = tf.closest('li').querySelector('[data-log]'); if (lb && !lb.disabled) tapValue(lb.dataset.ex, +lb.dataset.log, tf.dataset.f); return; }
    // v115: tapping anywhere else in a planned row (even with no estimate) opens the log window.
    const pr = !e.target.closest('button') && e.target.closest('li.plan:not(.wrm)');
    if (pr) { const lb = pr.querySelector('[data-log]'); if (lb && !lb.disabled) tapValue(lb.dataset.ex, +lb.dataset.log, 'w'); return; }
    const wb = e.target.closest('[data-wu]'); if (wb) { if (!wb.disabled) { warmNext = +wb.dataset.wu; logRow(wb.dataset.ex, 0, wb.closest('li')); } return; }
    const lg = e.target.closest('[data-log]'); if (lg) { logRow(lg.dataset.ex, +lg.dataset.log, lg.closest('li')); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { removePlanned(rm.dataset.rm); return; } const li = e.target.closest('li[data-sid]'); if (li) openEdit(li.dataset.sid); };
  renderFinish(); markActive();
}
function update() {
  cardsFor().forEach((ex, i) => { const s = $('s' + i), l = $('l' + i), b = $('b' + i); if (s) { const h = setsHTML(ex); if (s.innerHTML !== h && !(s.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) s.innerHTML = h; } if (l) l.textContent = lastTime(ex); if (b) b.textContent = btnLabel(ex); });
  const mz = $('meso'); if (mz) { const mh = mesoHTML(); if (mz.innerHTML !== mh) mz.innerHTML = mh; }
  updWstart(); renderFinish(); markActive();
}
function finishedToday() { const x = wStatus()[viewId]; return x ? x.at : null; }
function renderFinish() {
  const w = $('finwrap'); if (!w || !S) return;
  const ws = wStatus()[viewId], f = ws && ws.state === 'done' ? ws.at : null;
  const h = ws && ws.state === 'skipped' ? '' : !f && !canLog() ? '' : f ? '<div class="done">Workout finished' + (f === 'pending' ? ' (syncing)' : ' at ' + new Date(f).toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' })) + '. Coach will send your recap.</div>'
    : !(workoutRows().length || manualStart()) ? '' : '<button class="btn fin" id="finish">Finish workout</button>';
  const full = '<div id="wdur" class="wdur"></div>' + h;
  if (w.innerHTML.replace(/<div id="wdur"[^>]*>[^<]*<\/div>/, '<div id="wdur" class="wdur"></div>') !== full) { w.innerHTML = full; const b = $('finish'); if (b) b.onclick = finishWorkout; }
  tickDur();
}
const fmtDur = min => min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min' : min + ' min';
const fmtHMS = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec % 60).padStart(2, '0'); };
const WSK = () => 'coach_wstart_' + (testOn() ? 'test_' : '') + P;
function manualStart() { const m = jget(WSK(), null); return m && m.wid === viewId ? m.ts : null; }
function workoutStart() { const rs = workoutRows().map(tsOf).filter(Boolean), m = manualStart(); if (m) rs.push(m); return rs.length ? Math.min.apply(null, rs) : null; }
function wstartHTML() {
  const ws = wStatus()[viewId]; if (ws || !canLog() || !days[dayKey]) return '';
  const n = workoutRows().length, m = manualStart();
  if (n || m) return '<div class="wst"><span>' + (n ? 'Workout time' : 'Workout started') + '</span> <b id="wstt"></b><button class="wsr" id="wreset">Reset</button></div>';
  return '<button class="btn fin wsb" id="wstartb">Start workout (warm-ups count)</button>';
}
// Rule 1 (intended): Start workout always pops up the first unlogged exercise's tip, even if it was seen before. Tapping Log never shows a tip.
function startWorkout(re) { audio(); jset(WSK(), { wid: viewId, ts: Date.now() }); updWstart(); toast(re ? 'Workout timer restarted' : 'Workout started. Warm-ups count.', 3000); if (!re) tipUpcoming(true, true); }
// Reset: stop the workout and clear only this workout's logged sets (after a warning).
function openReset() { const n = workoutRows().length; $('rstt').textContent = 'This will stop the workout' + (n ? ' and clear the ' + n + (n === 1 ? ' set' : ' sets') + ' you logged in it' : '') + '. Nothing else changes.'; $('rstw').classList.add('open'); pushLayer('rst', () => $('rstw').classList.remove('open')); }
const closeReset = () => { if (!$('rstw').classList.contains('open')) return; $('rstw').classList.remove('open'); popLayer('rst'); };
$('rstx').onclick = closeReset; $('rstn').onclick = closeReset;
$('rstw').addEventListener('click', e => { if (e.target.id === 'rstw') closeReset(); });
$('rsty').onclick = () => { closeReset(); doReset(); };
function doReset() {
  const ids = new Set(workoutRows().map(r => r.set_id)); let q = getQ();
  const pend = new Set(q.filter(x => x.action === 'log' && ids.has(x.set.set_id)).map(x => x.set.set_id));
  q = q.filter(x => !((x.action === 'log' && ids.has(x.set.set_id)) || (x.action === 'edit' && ids.has(x.set_id)))); setQ(q);
  ids.forEach(id => { if (!pend.has(id)) enqueue({ action: 'undo', set_id: id }); });
  LS.removeItem(WSK()); setT(null); sig = ''; applyState(S, true);
  toast('Workout reset' + (ids.size ? '. Cleared ' + ids.size + (ids.size === 1 ? ' set.' : ' sets.') : '.'), 4000);
}
function updWstart() { const z = $('wstart'); if (!z) return; const h = wstartHTML(); if (z.innerHTML.replace(/<b id="wstt">[^<]*<\/b>/, '<b id="wstt"></b>') !== h) z.innerHTML = h; tickDur(); }
const NY = 'America/New_York';
function doneText() { // 'Done Tue, Oct 13 · 49 min' from the finish time in New York
  const ws = wStatus()[viewId]; if (!ws || ws.state !== 'done') return '';
  const st = workoutStart(), min = ws.dur != null ? ws.dur : st && ws.ts ? Math.max(0, Math.round((ws.ts - st) / 60000)) : null;
  const day = ws.ts ? new Date(ws.ts).toLocaleDateString('en-US', { timeZone: NY, weekday: 'short', month: 'short', day: 'numeric' }) : '';
  return ['Done' + (day ? ' ' + day : ''), min == null ? '' : fmtDur(min)].filter(Boolean).join(' · ');
}
function durText() { // workout timer: first logged set -> Finish
  const ws = wStatus()[viewId], st = workoutStart();
  if (ws && ws.state === 'skipped') return '';
  if (ws && ws.state === 'done') {
    const min = ws.dur != null ? ws.dur : st && ws.ts ? Math.max(0, Math.round((ws.ts - st) / 60000)) : null;
    return doneText();
  }
  return st && canLog() ? 'Workout time: ' + fmtHMS((Date.now() - st) / 1000) : '';
}
function tickDur() { const d = $('wdur'); if (d && S) { const t = durText(); if (d.textContent !== t) d.textContent = t; } const e = $('wstt'); if (e && S) { const st = workoutStart(), t = st ? fmtHMS((Date.now() - st) / 1000) : ''; if (e.textContent !== t) e.textContent = t; } }
setInterval(tickDur, 1000);
function workoutRows() { return viewRows(true).filter(r => widOf(r) === viewId); }
async function finishPrompt() { // v86: after the final set of the final exercise
  if (!canLog() || finishedToday()) return;
  if (await askBox({ title: 'That was your last set', body: 'Finish ' + wLabel(viewId) + ' now? ' + workoutRows().length + ' sets logged.', ok: 'Finish workout', cancel: 'Not yet' })) finishWorkout(true);
}
async function finishWorkout(asked) {
  const rs = workoutRows();
  if (asked !== true && !(await askBox({ title: 'Finish ' + wLabel(viewId) + '?', body: rs.length + ' sets logged.', ok: 'Finish workout' }))) return;
  const ex = new Set(rs.map(r => P_.norm(r.exercise)));
  const now = Date.now(), st = workoutStart(), dur = st ? Math.max(0, Math.round((now - st) / 60000)) : null;
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: now, date: S.today, day: viewId, sets: String(rs.length), exercises: String(ex.size), notes: dur != null ? 'duration_min=' + dur : '' } });
  const t = getT(); if (t) { t.hidden = true; setT(t); }
  try { // show this workout in the order it was actually done (first logged set of each exercise); this workout only
    const cs = cardsFor(), first = ex => { const t = rowsFor(ex, true).map(tsOf).filter(Boolean); return t.length ? Math.min.apply(null, t) : Infinity; };
    const ord = cs.map((c, i) => ({ n: c.canonical, f: first(c), i })).sort((a, b) => a.f - b.f || a.i - b.i).map(x => x.n);
    if (ord.join('|') !== cs.map(c => c.canonical).join('|')) putJSON('order', dayKeyOf(), ord, { shrink: true, what: 'exercise order' });
  } catch (e) { console.warn('reorder', e); }
  LS.removeItem(WSK());
  sig = ''; applyState(S, true); endQuoteShow();
}
async function skipWorkout() {
  if (!canLog()) return toast('Only the next workout (' + wLabel(loggableId()) + ') can be skipped.');
  if (wStatus()[viewId]) return toast(wLabel(viewId) + ' is already ' + wStatus()[viewId].state + '.');
  const rs = workoutRows(), n = rs.length;
  if (!(await askBox({ title: 'Skip ' + wLabel(viewId) + '?', body: n ? 'The ' + n + (n === 1 ? ' set' : ' sets') + ' you logged stay in your log, and the workout is marked skipped (not finished). The next workout becomes available.' : 'The next workout becomes available.', ok: 'Skip workout' }))) return;
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: Date.now(), date: S.today, day: viewId, sets: String(n), exercises: String(new Set(rs.map(r => P_.norm(r.exercise))).size), notes: n ? 'skipped (partial, ' + n + ' sets kept)' : 'skipped' } });
  LS.removeItem(WSK()); const t = getT(); if (t && n) { t.hidden = true; setT(t); }
  setView(loggableId() || viewId); sig = ''; applyState(S, true); window.scrollTo(0, 0); toast('Workout skipped');
}
function weekBoxHTML(ns, day) {
  if (!ns || !ns.length) return '';
  return '<div class="wkbox' + (day ? ' wkday' : '') + '"><b>This week (Week ' + viewWeek() + ')' + (day ? ', every exercise' : '') + ':</b><ul>' + ns.map(n => '<li>' + esc(n.text) + '</li>').join('') + '</ul></div>';
}
async function editSetup(i) {
  const ex = cardsFor()[i]; const cur = setupFor(ex);
  const v = await askBox({ title: 'Equipment setup', ok: 'Save', value: cur || '', input: 'Seat, pins, angle', body: ex.canonical + (plateT(ex) ? ' (seat, pins, angle; bar weight like "45 lb ' + (BAR_NAME[equipType(ex)] || 'bar') + '" sets plate math, now ' + barWeight(ex) + ' lb):' : ' (seat, pins, bench angle):') });
  if (v == null) return;
  putSetting(ex.canonical, 'equipment', v.trim()); $('su' + i).textContent = v.trim() || 'tap to add (seat, pins, angle)'; toast('Setup saved'); if (plateT(ex)) render();
}
function applyState(st, initial) {
  S = st; S.rows = S.rows || []; LIB = P_.parseLibrary(st.library); RAWDAYS = P_.enrich(P_.parseProgram(st.program), LIB); days = P_.resolveDays(RAWDAYS, viewId ? viewWeek() : 1); swapMemo = {};
  if (!layerOpen('settings')) { $('settings').style.display = 'none'; $('app').style.display = 'block'; }
  const ls = localSet(); if (migrateKeys(ls)) jset(SK(), ls);
  if (S.settings) migrateKeys(S.settings);
  if (!viewId || !wParse(viewId)) setView(loggableId() || ('W1-' + (trainDays()[0] || S.weekday)));
  days = P_.resolveDays(RAWDAYS, viewWeek());
  const nsig = P + '|' + viewId + '|' + JSON.stringify(wStatus()) + '|' + JSON.stringify(days[dayKey] || null) + '|' + JSON.stringify(((RAWDAYS && RAWDAYS._weekNotes) || []).filter(n => n.w === viewWeek())) + '|' + JSON.stringify(S.settings || {});
  if (nsig !== sig) { if (!formEx || initial) { const y = window.scrollY; render(); sig = nsig; if (!firstRender) window.scrollTo(0, y); } }
  else update();
  syncTimer();
  if (firstRender) { restoreScreen();
    firstRender = false; const s = jget('coach_scroll', null); if (s && s.p === P && s.day === viewId) requestAnimationFrame(() => window.scrollTo(0, s.y)); }
}
// v93: a reload (pull-to-refresh, swReload, location.reload) reopens the top-level screen Jack was on: Settings or Progress (weekly volume). Transient sheets are not restored.
function saveScreen() { try { const v = $('settings').style.display === 'block' && S ? 'settings' : $('prog').classList.contains('open') ? 'prog:' + progOff : ''; if (v) sessionStorage.setItem('coach_screen', v); else sessionStorage.removeItem('coach_screen'); } catch (e) {} }
window.addEventListener('pagehide', saveScreen); window.addEventListener('beforeunload', saveScreen);
let screenRestored = false;
function restoreScreen() { if (screenRestored) return; screenRestored = true; let v = ''; try { v = sessionStorage.getItem('coach_screen') || ''; sessionStorage.removeItem('coach_screen'); } catch (e) {}
  if (v === 'settings') setTimeout(() => showSettings(), 0); else if (v.startsWith('prog:')) setTimeout(() => openProg(parseInt(v.slice(5), 10) || 0), 0); }
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
// Meso calendar sheet (header calendar icon), back button closes it
const subWeek = () => { const w = viewWeek(); return isDeload(w) ? 'Deload Week' : 'Week ' + wib(w); };
const SMALLW = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'with', 'in', 'on', 'at', 'by']);
function viewGymName() { // v110: the gym set for the viewed workout (its logged sets, else gym_day:<viewId>)
  const r = S && viewRows(true, true).find(x => x.workout === viewId); if (r) return r.gym_name;
  const g = gymById(gymPick()); return g ? g.name : homeGym();
}
function titleGym(t) { // 'Shoulders and Back at the Hotel (about 35-45 mins)' -> '... at Hotel gym (about 35-45 mins)'
  const g = viewGymName(); if (!g) return t;
  const m = /^([^(]*?)\s*(\(.*\))?\s*$/.exec(String(t)), head = (m[1] || '').replace(/\s+at\s+.*$/i, '').trim();
  return head + ' at ' + g + (m[2] ? ' ' + m[2] : '');
}
function titleCase(t) { // 'legs and abs (about 60 min)' -> 'Legs and Abs (about 60 mins)'
  const m = /^([^(]*)(\(.*\))?\s*$/.exec(String(t)), head = (m[1] || '').trim(), par = (m[2] || '').replace(/\bmin\b/g, 'mins');
  const h = head.split(/(\s+)/).map((w, i) => /^\s+$/.test(w) || (i && SMALLW.has(w.toLowerCase())) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return h + (par ? ' ' + par : '');
}
const wShortId = id => { const p = wParse(id); return p ? wShort(p.w) + ' ' + p.day[0].toUpperCase() + p.day.slice(1, 3) : ''; };
function openCal() { if (!S) return;
  const nx = loggableId(), ws = wStatus()[viewId];
  $('calnow').innerHTML = 'Viewing ' + esc(wLabel(viewId)) + (ws ? ' (' + ws.state + ')' : '') + (nx && nx !== viewId ? '<small>Next up: ' + esc(wLabel(nx)) + '</small>' : '');
  $('calb').innerHTML = mesoGrid() + '<div class="s2" style="text-align:center;margin-top:8px">Tap a workout to open it. Future workouts open once every earlier day is finished or skipped.</div>'; $('calw').classList.add('open'); pushLayer('cal', () => $('calw').classList.remove('open')); }
const closeCal = () => { $('calw').classList.remove('open'); popLayer('cal'); };
$('cal').onclick = openCal;
// Header ⋮ workout menu (RP style). Items: [id, label, enabled?, action]. Add future items here.
function wmItems() {
  const ws = wStatus()[viewId], next = viewId === loggableId() || (testOn() && !ws);
  return [
    { id: 'skip', label: 'Skip workout', on: !!S && next && !ws, why: ws ? 'Already ' + ws.state : 'Only the next workout (' + wLabel(loggableId()) + ') can be skipped', run: skipWorkout },
    { id: 'gym', label: 'Modify gym (current: ' + (S ? viewGymName() : '') + ')', on: !!S, why: '', run: openGymPick },
    { id: 'prog', label: 'Progress: weekly sets', on: !!S, why: '', run: openProg },
    { id: 'add', label: 'Add exercise', on: !!S && !!days[dayKey] && !ws, why: !days[dayKey] ? 'No session planned' : 'Already ' + (ws && ws.state), run: openAdd }
  ];
}
function openWm() {
  if (!S) return;
  $('wmh').textContent = wLabel(viewId);
  $('wml').innerHTML = wmItems().map((it, i) => '<button class="btn sec wmi" data-wi="' + i + '"' + (it.on ? '' : ' disabled') + '>' + esc(it.label) + (it.on ? '' : '<small>' + esc(it.why) + '</small>') + '</button>').join('');
  $('wmw').classList.add('open'); pushLayer('wm', () => $('wmw').classList.remove('open'));
}
// ---------- Progress: weekly sets body map (volume only) ----------
// Hard sets this week (Mon-Sun): every logged set except 'not to failure' and stretches. Primary muscle 1 set, each secondary 0.5.
function weekSets(off) {
  const m0 = new Date(mondayOf(S.today) + 'T12:00:00'); m0.setDate(m0.getDate() + 7 * (off || 0)); const mon = m0.toISOString().slice(0, 10);
  const end = new Date(mon + 'T12:00:00'); end.setDate(end.getDate() + 6); const sun = end.toISOString().slice(0, 10);
  const m = {}; (window.CoachMG || []).forEach(g => m[g] = { n: 0, ex: {} }); (window.CoachRegions || []).forEach(([k]) => m['r_' + k] = { n: 0, ex: {} });
  viewRows(false, true).forEach(r => {
    if (!r.date || r.date < mon || r.date > sun || r.failure_type === 'not to failure') return;
    const ex = exFor(r.exercise), c = (subOf(r) && catFind(subOf(r))) || catFind(r.exercise) || (ex ? { name: ex.canonical, muscles: ex.muscles, rest_muscle: ex.rest_muscle } : { name: r.exercise });
    if (!c || isStretch(ex) || (ex && /stretch/i.test(String(ex.types || '')))) return;
    const gs = window.CoachGroupsOf ? window.CoachGroupsOf(c) : [];
    const nm = c.name || r.exercise, bump = (k, v) => { if (!m[k]) return; m[k].n += v; m[k].ex[nm] = (m[k].ex[nm] || 0) + v; };
    gs.forEach((g, i) => bump(g, i === 0 ? 1 : 0.5));
    (window.CoachRegionsOf ? window.CoachRegionsOf(c) : []).forEach(([k, v]) => bump('r_' + k, v));
  });
  return { mon, sun, m };
}
// v93: training phase per profile (settings profile.phase = lean | bulk | cut; default lean). Synced to the backend like other profile settings.
const PHASES = { lean: { name: 'Lean bulk', rng: '10-19', lo: 10, hi: 19, band: [3, 4], ideal: 'ideal 10-19' }, bulk: { name: 'Bulk', rng: '10-20', lo: 10, hi: 20, band: [3, 4], ideal: 'ideal 10-20' }, cut: { name: 'Cut', rng: '8-15', lo: 8, hi: 15, band: [2, 3], ideal: 'ideal 8-15' } };
function phase() { const v = S && getSetting('profile', 'phase'); return PHASES[v] ? v : 'lean'; }
function phaseLegend() {
  const ph = PHASES[phase()], it = i => '<span><i style="background:' + PCOL[i] + '"></i>' + PLEG[i] + '</span>';
  let leg = '';
  for (let i = 0; i < PLEG.length; i++) { if (i === ph.band[0]) { leg += '<span class="pideal"><span class="pir">' + ph.band.map(it).join('') + '</span><em>' + ph.ideal + '</em></span>'; i = ph.band[ph.band.length - 1]; } else leg += it(i); }
  const cur = phase(), part = (k, extra) => '<span class="' + (k === cur ? 'on' : 'off') + '"><b>' + PHASES[k].name + '</b> ' + PHASES[k].rng + (extra || '') + (k === cur ? ' <em class="pcur">current</em>' : '') + '</span>';
  return '<div class="pleg">' + leg + '</div><div class="pphase"><div class="pph">Ideal sets per muscle</div>' + part('cut') + ' <span>·</span> ' + part('lean') + ' <span>·</span> ' + part('bulk') + '</div>';
}
const PCOL = ['#3b4049', '#3b82f6', '#22c55e', '#facc15', '#f59e0b', '#ff2d2d']; // v92: rainbow scale (Jack, Oct 21)
const pBand = n => n <= 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 15 ? 3 : n < 20 ? 4 : 5;
const PLEG = ['0', '1-4', '5-9', '10-14', '15-19', '20+'];
// Stylized front/back figures. Each muscle is a <g data-g> with the left shape plus its mirror (viewBox 120 x 240).
// MacroFactor-style figure (viewBox 160 x 304): broad V-taper silhouette with hands and feet, rounded muscle pieces with dark gaps.
// Each entry is [region, path]; the left half is drawn and mirrored. Extra heads (quads, hamstrings, forearms, triceps, calves) share one region.
// Proportions: ~8-head figure (chin 1/8, crotch 4/8, knees 6/8; elbows at navel, wrists at crotch).
// Traced from Jack's anatomy chart (ref_jack_chart.jpg), left half, mirrored.
// Traced from Jack's anatomy chart (ref_jack_chart.jpg), left half, mirrored. Back view arms hang a little wider, like the chart.
// Body map traced from the reference chart (v72). Silhouettes are full outlines; muscle paths are the left half, mirrored.
const BODY_SIL = "M77 8.7 C75.2 8.9 74.7 9.1 73.4 9.7 C72.1 10.4 71 11.1 69.8 12.2 C68.7 13.2 67.9 14.4 67.1 15.6 C66.3 16.8 65.9 18 65.6 19 C65.3 20 65.4 20.1 65.5 21.2 C65.5 22.4 66.1 23.9 66 25.3 C65.8 26.7 65 27.8 64.7 28.8 C64.5 29.7 64.6 29.8 64.8 30.6 C64.9 31.3 65.2 31.9 65.8 32.9 C66.5 33.9 67.7 34.7 68.5 36 C69.3 37.4 70.2 39 70.3 40.4 C70.4 41.8 69.5 42.6 69.3 43.7 C69.1 44.9 69.3 46 69.2 46.8 C69 47.6 69.4 47.4 68.6 48.2 C67.9 48.9 67 49.8 65 51 C63 52.2 59.9 53.2 57.4 54.7 C55 56.1 53.6 58.1 51.4 59.1 C49.1 60 47 59.4 45.1 59.8 C43.1 60.2 42.1 60.6 40.7 61.3 C39.3 62.1 38.2 63 37.3 64 C36.4 65 36.1 65.1 35.6 66.8 C35.1 68.5 34.6 70.7 34.4 73.6 C34.2 76.5 35 80.4 34.6 82.9 C34.2 85.4 32.9 85.7 32.1 87.5 C31.3 89.3 30.6 91.3 30.1 92.8 C29.7 94.3 29.7 94.2 29.5 96.1 C29.3 97.9 29.4 100.8 29.1 102.9 C28.8 105.1 28.8 105.9 27.8 108.1 C26.8 110.3 24.3 112.8 23.6 115.3 C22.8 117.8 23.7 120.1 23.5 122.2 C23.2 124.2 22.2 125.2 22 126.9 C21.9 128.5 22.5 129 22.5 131.4 C22.6 133.8 22 137.6 22.3 140.3 C22.6 142.9 24 143.2 24.3 146.2 C24.6 149.3 24.2 154.7 24 157.4 C23.8 160.1 23.4 160.2 23.4 161.2 C23.4 162.1 23.1 161.3 24 162.6 C24.8 164 27.1 167.2 28.2 168.6 C29.2 169.9 29.4 169.8 30 170.2 C30.6 170.5 30.9 170.4 31.7 170.3 C32.5 170.1 33.6 169.7 34.4 169.3 C35.1 169 35.3 168.8 35.8 168.3 C36.2 167.9 36.5 167.6 36.8 166.8 C37.2 166 37.7 165.8 37.7 164 C37.7 162.2 37.4 158.4 37.1 156.6 C36.7 154.8 36.7 155.2 36 154.1 C35.2 153.1 33.6 151.6 33 150.7 C32.3 149.8 32.3 150.8 32.3 149.3 C32.4 147.7 32.8 143.9 33.2 142 C33.6 140 33.3 140.2 34.5 138.6 C35.7 137.1 38.3 135.1 39.8 133.4 C41.2 131.7 41.9 130.4 42.5 129 C43.1 127.6 43.2 126.9 43.2 125.5 C43.2 124.1 42.6 122.7 42.4 121.3 C42.3 119.8 42.1 119.2 42.5 117.3 C42.9 115.5 43.9 112.6 44.7 111 C45.4 109.5 46 109.4 46.7 108.6 C47.4 107.9 48.1 107.3 48.7 106.9 C49.3 106.5 49.7 106.5 50.2 106.5 C50.8 106.6 51.1 106.6 51.9 107.1 C52.8 107.5 54 108.3 54.8 109.3 C55.7 110.3 56.2 110.1 56.6 112.6 C56.9 115.1 56.2 120 56.5 123.1 C56.9 126.1 58.2 128.1 58.5 129.6 C58.7 131 58.6 130.2 57.9 131.1 C57.3 132 55.6 133.3 54.9 134.3 C54.2 135.3 54.4 132.9 53.9 136.7 C53.3 140.5 52.8 149.2 51.8 155.5 C50.8 161.7 49.2 166.6 48.4 171.3 C47.7 176 47.6 178.6 47.5 181.7 C47.3 184.7 47.3 185.6 47.5 188.2 C47.6 190.7 48 193.6 48.4 195.8 C48.7 198.1 49.1 199.1 49.6 200.5 C50 201.8 50.2 202.3 50.9 203.4 C51.6 204.5 52.4 204.6 53.4 206.6 C54.5 208.5 56.1 212.2 56.7 214.2 C57.2 216.1 57.1 214.7 56.6 217.3 C56.1 220 54.2 224.9 53.8 228.8 C53.4 232.7 53.7 235.8 54.3 239 C54.8 242.2 55.7 243.8 57 246.6 C58.2 249.3 60.2 251.1 61.1 254.3 C62.1 257.6 61.7 260 62.4 264.5 C63.1 269 64.4 276.4 64.9 279.4 C65.3 282.5 65 280.9 64.9 281.6 C64.8 282.2 65.4 281.6 64.5 283.1 C63.5 284.7 60.6 288.5 59.6 290.1 C58.6 291.7 58.9 291.5 58.7 292.1 C58.5 292.7 58.5 293 58.6 293.4 C58.7 293.8 58.9 294.1 59.2 294.4 C59.5 294.7 59.2 294.8 60.3 294.9 C61.4 295 63.1 295.1 65.3 294.9 C67.6 294.8 71.2 294.5 72.8 294.2 C74.4 294 73.9 293.9 74.2 293.5 C74.6 293.2 74.8 293 74.9 292.4 C75 291.9 75.1 291.8 74.7 290.7 C74.4 289.6 73.5 288 73.1 286.2 C72.8 284.4 73.1 282.4 72.9 280.8 C72.6 279.2 71.9 278.3 71.6 277.4 C71.3 276.5 71.3 277.9 71.5 275.8 C71.7 273.7 72 269.1 72.7 265.7 C73.4 262.3 74.8 259.4 75.3 257 C75.9 254.7 75.1 254.8 75.6 252.9 C76.1 250.9 77.6 248.2 78.1 246.2 C78.7 244.3 78.6 244 78.7 242.1 C78.8 240.2 78.7 237.1 78.6 235.8 C78.5 234.5 78.5 235.3 78 234.7 C77.5 234.1 76.4 233.3 76 232.6 C75.5 232 75.6 232.3 75.3 231.1 C75.1 229.8 74.9 227.9 74.8 225.7 C74.7 223.4 74.6 221.5 74.8 218.6 C75 215.7 75.3 212.8 75.8 209.6 C76.2 206.3 76.9 202.4 77.4 200.5 C77.8 198.5 77.8 199.2 78.3 198.9 C78.8 198.5 79.5 198.4 80.2 198.4 C80.8 198.4 81.4 198.5 81.8 198.9 C82.2 199.3 82.2 198.7 82.6 200.6 C83.1 202.5 83.8 206.3 84.2 209.6 C84.7 212.8 85 215.8 85.2 218.7 C85.4 221.6 85.3 223.4 85.2 225.7 C85.1 227.9 84.9 229.8 84.7 231.1 C84.4 232.3 84.5 232 84 232.6 C83.6 233.3 82.5 234.1 82 234.7 C81.5 235.3 81.5 234.5 81.4 235.8 C81.3 237.1 81.2 240.1 81.3 242 C81.4 243.8 81.3 244.3 81.9 246.2 C82.4 248.2 83.9 250.9 84.4 252.9 C84.9 254.8 84.1 254.7 84.7 257 C85.2 259.4 86.6 262.3 87.3 265.7 C88 269.1 88.4 273.8 88.5 275.9 C88.7 278 88.7 276.5 88.4 277.4 C88.1 278.3 87.4 279.2 87.1 280.8 C86.9 282.4 87.2 284.5 86.8 286.3 C86.5 288.1 85.6 289.6 85.3 290.7 C84.9 291.8 85 291.8 85.1 292.3 C85.2 292.9 85.4 293.3 85.9 293.6 C86.3 294 85.1 294.1 87.5 294.3 C89.9 294.5 96.9 295 99.3 295 C101.7 295 100.6 294.6 101 294.2 C101.4 293.7 101.5 293.3 101.4 292.5 C101.2 291.7 101.2 291.4 100.1 289.7 C99.1 287.9 96.3 284.4 95.4 282.7 C94.4 281 95 281.6 95.1 280.3 C95.1 279.1 95.1 278.7 95.6 275.8 C96 273 97 268.3 97.6 264.5 C98.2 260.6 97.9 257.6 98.9 254.3 C99.8 251.1 101.8 249.3 103 246.6 C104.3 243.8 105.2 242.2 105.7 239 C106.3 235.8 106.6 232.7 106.2 228.8 C105.8 224.9 103.9 220 103.4 217.3 C102.9 214.7 102.8 216.1 103.3 214.2 C103.9 212.2 105.5 208.6 106.6 206.6 C107.6 204.6 108.4 204.4 109.1 203.3 C109.8 202.1 110 201.7 110.5 200.3 C110.9 198.9 111.3 197.8 111.7 195.5 C112.1 193.3 112.4 190.4 112.6 187.9 C112.7 185.3 112.7 184.5 112.5 181.6 C112.3 178.6 112.3 176 111.6 171.3 C110.8 166.6 109.2 161.7 108.2 155.5 C107.2 149.2 106.7 140.5 106.1 136.7 C105.6 132.9 105.8 135.3 105.1 134.3 C104.4 133.3 102.7 131.9 102.1 131.1 C101.4 130.3 101.6 130.2 101.5 129.7 C101.5 129.2 101.4 129.4 101.7 128.2 C102 127.1 103.2 125.7 103.5 123.2 C103.7 120.6 103.1 116.1 103.2 113.9 C103.3 111.8 103.6 112.2 103.9 111.4 C104.2 110.6 104.6 110.1 105 109.5 C105.4 108.9 105.7 108.7 106.3 108.2 C106.9 107.7 107.7 107.2 108.4 106.9 C109.1 106.6 109.3 106.4 110 106.5 C110.7 106.7 111.3 106.8 112.3 107.6 C113.3 108.5 114.6 109.7 115.5 111.5 C116.5 113.2 117.2 115.7 117.6 117.4 C117.9 119.2 117.7 119.8 117.6 121.3 C117.4 122.7 116.8 124.1 116.8 125.5 C116.8 126.9 116.9 127.6 117.5 129 C118.1 130.4 118.8 131.7 120.2 133.4 C121.7 135.1 124.3 137 125.5 138.6 C126.7 140.2 126.5 140.3 126.9 142.3 C127.3 144.2 127.6 147.9 127.6 149.5 C127.6 151 127.6 150 127 150.8 C126.4 151.6 124.9 152.9 124.3 153.8 C123.6 154.7 123.5 155 123.2 155.8 C122.9 156.6 122.8 156.7 122.7 158.2 C122.5 159.7 122.3 162.7 122.3 164.1 C122.3 165.6 122.5 165.4 122.9 166.1 C123.2 166.9 123.7 167.8 124.2 168.3 C124.8 168.9 125 169 125.7 169.4 C126.5 169.7 127.5 170.1 128.2 170.2 C129 170.4 129.3 170.4 129.9 170.2 C130.4 170 130.1 170.8 131.3 169.2 C132.5 167.6 135.7 163.7 136.5 161.5 C137.4 159.4 136.2 160 136 157.3 C135.8 154.5 135.4 149.3 135.7 146.2 C136 143.2 137.3 143.1 137.7 140.4 C138 137.7 137.4 133.8 137.5 131.4 C137.5 129 138.2 128.8 138 127.1 C137.8 125.4 136.8 124.3 136.5 122.2 C136.2 120 137.2 117.8 136.4 115.3 C135.7 112.8 133.2 110.3 132.2 108.1 C131.2 105.9 131.2 105.1 130.9 102.9 C130.6 100.8 130.7 97.9 130.5 96.1 C130.3 94.2 130.3 94.3 129.9 92.8 C129.4 91.3 128.7 89.3 127.9 87.5 C127.1 85.7 125.8 85.5 125.4 82.9 C125 80.3 125.6 75.8 125.5 73.2 C125.5 70.6 125.2 70 124.9 68.6 C124.6 67.2 124.4 66.6 123.9 65.7 C123.4 64.7 122.9 64.2 122.1 63.4 C121.3 62.6 120.5 61.9 119.2 61.3 C117.9 60.6 116.7 60.2 114.8 59.8 C112.9 59.4 110.8 60 108.6 59.1 C106.5 58.2 105.1 56.2 102.9 54.9 C100.7 53.6 98.4 53 96.4 51.8 C94.3 50.6 92.5 49.2 91.5 48.3 C90.6 47.5 91 47.9 90.9 47.1 C90.8 46.3 91 45 90.8 43.9 C90.5 42.7 89.6 41.9 89.7 40.5 C89.8 39.1 90.7 37.4 91.5 36 C92.3 34.7 93.6 33.8 94.2 32.8 C94.9 31.8 95.1 31.2 95.3 30.5 C95.4 29.7 95.4 29.6 95.2 28.7 C95 27.7 94.2 26.7 94 25.3 C93.9 23.9 94.5 22 94.5 20.7 C94.5 19.3 94.6 19.2 94 17.9 C93.4 16.5 92.4 14.6 91.2 13.2 C89.9 11.8 88.6 10.8 87.1 10 C85.7 9.2 85.1 9 83.3 8.7 C81.5 8.5 78.8 8.5 77 8.7 Z";
const BODY_SIL_B = "M77.6 6.6 C76.1 6.7 75.7 6.9 74.7 7.4 C73.6 7.8 72.7 8.5 71.9 9.2 C71 9.9 70.7 10.4 70.1 11.3 C69.5 12.3 68.9 13.8 68.6 14.6 C68.3 15.5 68.4 15.2 68.5 16.1 C68.7 17 69.2 17.5 69.4 19.6 C69.6 21.6 69.4 25.2 69.5 27.3 C69.6 29.4 70.1 29.7 70.1 31.3 C70.1 32.8 69.5 34.3 69.5 36 C69.5 37.7 70.2 39.6 70.1 40.8 C70.1 42.1 69.6 42.4 69.2 43 C68.9 43.6 69.1 43.5 68 44.2 C66.8 44.9 65.1 46 62.8 47 C60.5 48.1 56.7 49.4 55.1 50.2 C53.5 51 54.4 50.7 53.9 51.4 C53.3 52.1 52.8 53.4 52.2 54.1 C51.7 54.8 51.5 54.8 50.9 55.1 C50.3 55.4 50 55.6 48.8 55.7 C47.6 55.7 45.8 55.3 44.4 55.5 C42.9 55.8 42.2 56 40.7 57.1 C39.2 58.1 37.4 59.7 35.9 61.4 C34.5 63.1 33.6 64.8 32.8 66.5 C32 68.2 31.8 68.9 31.4 70.9 C31.1 72.8 31.7 75.4 30.9 77.4 C30 79.3 27.9 80.5 26.8 81.9 C25.8 83.3 25.7 82.1 25.2 85.3 C24.7 88.4 24.6 96.1 24.2 99.2 C23.8 102.3 23.3 101.4 23 102.7 C22.7 104 22.8 105.4 22.6 106.4 C22.3 107.4 22.2 107.5 21.5 108.2 C20.9 108.9 19.6 109.8 18.9 110.5 C18.2 111.2 18.6 110.1 17.9 111.9 C17.1 113.8 15.4 118.4 14.8 120.8 C14.3 123.3 15.1 123.8 15 125.5 C14.9 127.2 14 127.6 14.3 130.3 C14.6 132.9 16.3 137.7 16.5 140.3 C16.8 142.9 15.6 142.9 15.6 144.7 C15.5 146.5 16.4 148 16.3 150.3 C16.1 152.6 14.9 155.8 14.7 157.4 C14.6 159 15 158.7 15.4 159.3 C15.9 159.8 16.4 160.1 17.2 160.3 C18 160.5 19 160.5 19.7 160.3 C20.5 160 20.8 160.4 21.2 159.1 C21.6 157.7 21.4 154.3 22 152.6 C22.6 150.8 24.2 150.6 24.7 149.4 C25.2 148.2 24.5 147.3 24.9 145.8 C25.4 144.2 26.5 143.1 27.4 140.8 C28.3 138.6 29 135.8 30.1 133.4 C31.3 131 32.7 129.8 33.8 127.7 C35 125.5 36 123.7 36.5 121.4 C37 119 36.4 116.8 36.6 114.5 C36.8 112.2 37.2 109.8 37.5 108.5 C37.9 107.2 37.7 107.9 38.4 107.2 C39.1 106.6 40.6 105.6 41.4 104.9 C42.2 104.1 42.3 103.9 42.7 103.1 C43.2 102.4 43.6 101.7 43.8 100.8 C44 99.8 43.9 98.6 44.1 97.9 C44.2 97.2 44.2 97.1 44.5 96.8 C44.8 96.4 45.3 96.1 45.8 95.9 C46.2 95.8 46.7 96 47.1 96.1 C47.5 96.3 47.4 96.2 48 96.9 C48.6 97.7 48.7 98.7 50.3 100.5 C51.9 102.4 55.8 105.6 57.1 107.1 C58.5 108.6 57.9 107.4 57.9 109.1 C57.9 110.9 57.2 114.4 57 116.9 C56.8 119.3 57.2 119.9 56.8 122.7 C56.4 125.5 55.1 129.4 54.7 132.3 C54.3 135.2 54.8 135.3 54.6 138.7 C54.4 142.1 54.3 146.5 53.6 151 C52.9 155.4 51.5 159.1 50.6 163.2 C49.8 167.3 49.1 170.6 48.8 173.8 C48.5 177 48.6 177.5 48.8 180.8 C49.1 184 49.6 188.5 50.1 191.8 C50.7 195.1 50.9 195.6 52 199 C53.1 202.4 55.4 208 56.3 210.5 C57.1 213 56.8 212 56.8 212.9 C56.7 213.9 57.4 212.6 56.1 215.6 C54.9 218.7 51 226.5 49.7 230 C48.4 233.6 49 233.9 48.9 235.6 C48.7 237.2 48.4 237 48.9 239.4 C49.4 241.8 50.8 246.3 51.6 248.7 C52.4 251.1 52.8 250.4 53.5 252.8 C54.1 255.1 54 257.3 55.1 261.7 C56.2 266 58.8 273.8 59.6 277 C60.5 280.1 60 278.1 60 279.3 C60.1 280.6 60.1 282.6 59.9 283.9 C59.8 285.2 59.6 285.7 59.1 286.6 C58.7 287.5 58.5 287.9 57.5 288.8 C56.5 289.8 54.5 290.9 53.8 291.8 C53 292.6 53.2 292.9 53.2 293.5 C53.3 294 53.6 294.3 54 294.6 C54.4 294.9 53.4 295 55.5 295.3 C57.6 295.6 63.5 296.3 65.7 296.4 C67.8 296.6 67 296.4 67.6 296 C68.1 295.7 68.4 297 68.7 294.6 C69 292.1 69.3 287.4 69.3 282.5 C69.3 277.5 68.7 270.4 68.7 267.1 C68.7 263.7 68.8 265.2 69.2 264 C69.6 262.9 70.1 262.6 70.8 260.6 C71.6 258.7 72.7 255.5 73.2 253.3 C73.7 251.1 73.3 250.5 73.6 248.4 C73.8 246.3 74.5 243.9 74.7 241.5 C74.9 239.1 74.9 238 74.7 235.1 C74.4 232.2 72.9 228.9 73.3 225.4 C73.7 222 75.9 218.9 76.9 216.1 C77.8 213.3 78.1 211 78.6 209.7 C79 208.3 78.9 209 79.2 208.8 C79.5 208.6 79.8 208.5 80.1 208.5 C80.4 208.5 80.7 208.6 80.9 208.8 C81.1 209 81 208.3 81.4 209.7 C81.9 211 82.2 213.4 83.2 216.2 C84.1 219 86.3 221.9 86.7 225.3 C87.1 228.7 85.5 232.2 85.3 235.2 C85.1 238.2 85.2 240.1 85.3 242 C85.4 243.9 85.8 243.7 86.1 245.8 C86.4 247.8 86.2 250.7 86.8 253.3 C87.3 256 88.4 258.7 89.2 260.6 C89.9 262.6 90.4 262.8 90.8 264 C91.2 265.2 91.4 263.8 91.3 267.2 C91.3 270.5 90.7 277.6 90.7 282.5 C90.7 287.3 90.9 291.6 91.2 294 C91.4 296.5 91.6 295.4 92.2 295.8 C92.7 296.3 92 296.5 94.2 296.4 C96.4 296.3 102.4 295.6 104.5 295.3 C106.6 295 105.5 295 105.9 294.7 C106.3 294.3 106.7 294.1 106.7 293.6 C106.8 293 107 292.6 106.2 291.8 C105.5 290.9 103.4 289.7 102.4 288.7 C101.4 287.8 101.2 287.3 100.8 286.4 C100.3 285.5 100.2 285.1 100 283.7 C99.9 282.3 99.2 282.7 100 278.8 C100.9 274.8 103.7 266.4 104.8 261.8 C106 257.1 105.9 255.1 106.5 252.8 C107.2 250.4 107.7 250.7 108.4 248.6 C109.2 246.5 110.3 242.8 110.8 241 C111.3 239.2 111.1 239.6 111.2 238.6 C111.2 237.6 111.3 236.8 111.1 235.2 C110.9 233.6 111.5 233.3 110.2 229.8 C108.9 226.3 105.2 218.7 103.9 215.8 C102.7 212.8 103.3 214.2 103.2 213.3 C103.2 212.4 102.8 213.3 103.6 210.8 C104.4 208.3 106.7 202.8 107.9 199.4 C109 196 109.3 194.2 109.9 191.9 C110.4 189.6 110.5 189.8 110.7 186.6 C111 183.5 111.2 177.2 111.2 174.5 C111.3 171.8 111.3 173.5 111 171.5 C110.7 169.6 110.3 167.5 109.5 163.8 C108.6 160.1 107.1 155.4 106.4 150.8 C105.7 146.3 105.6 142.1 105.4 138.7 C105.2 135.3 105.7 135.4 105.3 132.2 C104.8 128.9 103.4 123.4 103 120.7 C102.5 117.9 103.1 118.9 103 116.9 C102.8 114.9 102.2 111.3 102.1 109.7 C102 108 101 109.5 102.4 107.8 C103.8 106.1 108 102.5 109.8 100.4 C111.6 98.4 111.7 97.3 112.4 96.4 C113.2 95.6 113.4 95.9 113.9 95.9 C114.4 95.9 115 96.3 115.4 96.7 C115.8 97 115.8 97.1 115.9 97.9 C116.1 98.6 116 99.9 116.2 100.9 C116.5 101.8 116.8 102.4 117.3 103.1 C117.7 103.9 117.8 104.1 118.6 104.9 C119.4 105.6 120.9 106.6 121.6 107.2 C122.3 107.9 122.1 107.2 122.5 108.5 C122.8 109.8 123.3 112.4 123.4 114.5 C123.6 116.6 123.2 118.7 123.2 120 C123.3 121.3 123 120.2 123.6 121.6 C124.1 123 125.1 125.7 126.2 127.8 C127.4 129.9 128.7 131.1 129.9 133.4 C131 135.8 131.7 138.6 132.6 140.8 C133.5 143.1 134.6 144.2 135.1 145.8 C135.5 147.3 134.8 148.2 135.3 149.4 C135.8 150.6 137.4 150.9 138 152.6 C138.6 154.3 138.4 157.6 138.7 158.9 C138.9 160.2 139.1 159.6 139.5 159.9 C139.9 160.1 140.3 160.3 140.8 160.4 C141.4 160.5 142 160.5 142.5 160.4 C143 160.3 143.4 160.2 143.8 159.9 C144.2 159.7 144.5 159.4 144.8 159 C145 158.6 145.2 158.2 145.2 157.7 C145.3 157.2 145.4 157.4 145.2 156 C144.9 154.7 143.8 152.3 143.7 150.3 C143.6 148.2 144.5 146.5 144.4 144.7 C144.4 142.8 143.2 142.9 143.5 140.2 C143.7 137.4 145.5 132.1 145.7 129.5 C146 126.8 145.1 127.1 145 125.5 C144.9 124 145.5 123 145.2 121 C144.9 119.1 143.9 116.6 143.3 114.8 C142.7 113.1 142.6 112.5 141.8 111.3 C140.9 110.1 139.2 109.1 138.4 108.1 C137.6 107.2 137.6 106.9 137.3 106 C137.1 105 137.3 103.9 137 102.7 C136.7 101.5 136.2 102.4 135.8 99.2 C135.4 96 135.2 88.1 134.7 84.9 C134.2 81.8 134.1 83.1 133.1 81.8 C132.1 80.4 130 79.4 129.1 77.4 C128.3 75.3 128.9 72.6 128.5 70.4 C128 68.2 127.3 66.6 126.5 64.9 C125.6 63.2 124.9 62.3 123.6 60.9 C122.3 59.5 120.6 57.9 119.2 57 C117.8 56 117 55.8 115.6 55.5 C114.2 55.3 112.4 55.7 111.2 55.7 C110 55.6 109.7 55.4 109.1 55.1 C108.5 54.8 108.3 54.8 107.8 54.1 C107.2 53.4 106.7 52.1 106.1 51.4 C105.6 50.7 106.5 51 104.9 50.2 C103.3 49.4 99.6 48.2 97.3 47.1 C95 46 93.3 45 92.1 44.3 C91 43.6 91.3 43.8 90.9 43.2 C90.5 42.6 89.9 42.1 89.9 40.8 C89.8 39.5 90.5 37.7 90.5 36 C90.5 34.3 89.9 32.8 89.9 31.3 C89.9 29.7 90.4 29.4 90.5 27.3 C90.6 25.2 90.4 21.5 90.6 19.4 C90.8 17.4 91.4 16.7 91.5 15.7 C91.6 14.7 91.6 14.9 91.2 13.9 C90.8 12.9 90.1 11.4 89.1 10.2 C88.2 9.1 87 8.3 85.9 7.6 C84.8 7 84.4 6.8 82.9 6.6 C81.4 6.4 79.1 6.4 77.6 6.6 Z";
// v77: back head uses the front head outline (same shape, size and ears, seen from behind), drawn 5 units higher so it sits level once the back figure is shifted down 5.
const BODY_SIL_B2 = "M77 3.7 C75.2 3.9 74.7 4.1 73.4 4.7 C72.1 5.4 71 6.1 69.8 7.2 C68.7 8.2 67.9 9.4 67.1 10.6 C66.3 11.8 65.9 13 65.6 14 C65.3 15 65.4 15.1 65.5 16.2 C65.5 17.4 66.1 18.9 66 20.3 C65.8 21.7 65 22.8 64.7 23.8 C64.5 24.7 64.6 24.8 64.8 25.6 C64.9 26.3 65.2 26.9 65.8 27.9 C66.5 28.9 67.7 29.7 68.5 31 C69.3 32.4 70 34.6 69.5 36 C69.5 37.7 70.2 39.6 70.1 40.8 C70.1 42.1 69.6 42.4 69.2 43 C68.9 43.6 69.1 43.5 68 44.2 C66.8 44.9 65.1 46 62.8 47 C60.5 48.1 56.7 49.4 55.1 50.2 C53.5 51 54.4 50.7 53.9 51.4 C53.3 52.1 52.8 53.4 52.2 54.1 C51.7 54.8 51.5 54.8 50.9 55.1 C50.3 55.4 50 55.6 48.8 55.7 C47.6 55.7 45.8 55.3 44.4 55.5 C42.9 55.8 42.2 56 40.7 57.1 C39.2 58.1 37.4 59.7 35.9 61.4 C34.5 63.1 33.6 64.8 32.8 66.5 C32 68.2 31.8 68.9 31.4 70.9 C31.1 72.8 31.7 75.4 30.9 77.4 C30 79.3 27.9 80.5 26.8 81.9 C25.8 83.3 25.7 82.1 25.2 85.3 C24.7 88.4 24.6 96.1 24.2 99.2 C23.8 102.3 23.3 101.4 23 102.7 C22.7 104 22.8 105.4 22.6 106.4 C22.3 107.4 22.2 107.5 21.5 108.2 C20.9 108.9 19.6 109.8 18.9 110.5 C18.2 111.2 18.6 110.1 17.9 111.9 C17.1 113.8 15.4 118.4 14.8 120.8 C14.3 123.3 15.1 123.8 15 125.5 C14.9 127.2 14 127.6 14.3 130.3 C14.6 132.9 16.3 137.7 16.5 140.3 C16.8 142.9 15.6 142.9 15.6 144.7 C15.5 146.5 16.4 148 16.3 150.3 C16.1 152.6 14.9 155.8 14.7 157.4 C14.6 159 15 158.7 15.4 159.3 C15.9 159.8 16.4 160.1 17.2 160.3 C18 160.5 19 160.5 19.7 160.3 C20.5 160 20.8 160.4 21.2 159.1 C21.6 157.7 21.4 154.3 22 152.6 C22.6 150.8 24.2 150.6 24.7 149.4 C25.2 148.2 24.5 147.3 24.9 145.8 C25.4 144.2 26.5 143.1 27.4 140.8 C28.3 138.6 29 135.8 30.1 133.4 C31.3 131 32.7 129.8 33.8 127.7 C35 125.5 36 123.7 36.5 121.4 C37 119 36.4 116.8 36.6 114.5 C36.8 112.2 37.2 109.8 37.5 108.5 C37.9 107.2 37.7 107.9 38.4 107.2 C39.1 106.6 40.6 105.6 41.4 104.9 C42.2 104.1 42.3 103.9 42.7 103.1 C43.2 102.4 43.6 101.7 43.8 100.8 C44 99.8 43.9 98.6 44.1 97.9 C44.2 97.2 44.2 97.1 44.5 96.8 C44.8 96.4 45.3 96.1 45.8 95.9 C46.2 95.8 46.7 96 47.1 96.1 C47.5 96.3 47.4 96.2 48 96.9 C48.6 97.7 48.7 98.7 50.3 100.5 C51.9 102.4 55.8 105.6 57.1 107.1 C58.5 108.6 57.9 107.4 57.9 109.1 C57.9 110.9 57.2 114.4 57 116.9 C56.8 119.3 57.2 119.9 56.8 122.7 C56.4 125.5 55.1 129.4 54.7 132.3 C54.3 135.2 54.8 135.3 54.6 138.7 C54.4 142.1 54.3 146.5 53.6 151 C52.9 155.4 51.5 159.1 50.6 163.2 C49.8 167.3 49.1 170.6 48.8 173.8 C48.5 177 48.6 177.5 48.8 180.8 C49.1 184 49.6 188.5 50.1 191.8 C50.7 195.1 50.9 195.6 52 199 C53.1 202.4 55.4 208 56.3 210.5 C57.1 213 56.8 212 56.8 212.9 C56.7 213.9 57.4 212.6 56.1 215.6 C54.9 218.7 51 226.5 49.7 230 C48.4 233.6 49 233.9 48.9 235.6 C48.7 237.2 48.4 237 48.9 239.4 C49.4 241.8 50.8 246.3 51.6 248.7 C52.4 251.1 52.8 250.4 53.5 252.8 C54.1 255.1 54 257.3 55.1 261.7 C56.2 266 58.8 273.8 59.6 277 C60.5 280.1 60 278.1 60 279.3 C60.1 280.6 60.1 282.6 59.9 283.9 C59.8 285.2 59.6 285.7 59.1 286.6 C58.7 287.5 58.5 287.9 57.5 288.8 C56.5 289.8 54.5 290.9 53.8 291.8 C53 292.6 53.2 292.9 53.2 293.5 C53.3 294 53.6 294.3 54 294.6 C54.4 294.9 53.4 295 55.5 295.3 C57.6 295.6 63.5 296.3 65.7 296.4 C67.8 296.6 67 296.4 67.6 296 C68.1 295.7 68.4 297 68.7 294.6 C69 292.1 69.3 287.4 69.3 282.5 C69.3 277.5 68.7 270.4 68.7 267.1 C68.7 263.7 68.8 265.2 69.2 264 C69.6 262.9 70.1 262.6 70.8 260.6 C71.6 258.7 72.7 255.5 73.2 253.3 C73.7 251.1 73.3 250.5 73.6 248.4 C73.8 246.3 74.5 243.9 74.7 241.5 C74.9 239.1 74.9 238 74.7 235.1 C74.4 232.2 72.9 228.9 73.3 225.4 C73.7 222 75.9 218.9 76.9 216.1 C77.8 213.3 78.1 211 78.6 209.7 C79 208.3 78.9 209 79.2 208.8 C79.5 208.6 79.8 208.5 80.1 208.5 C80.4 208.5 80.7 208.6 80.9 208.8 C81.1 209 81 208.3 81.4 209.7 C81.9 211 82.2 213.4 83.2 216.2 C84.1 219 86.3 221.9 86.7 225.3 C87.1 228.7 85.5 232.2 85.3 235.2 C85.1 238.2 85.2 240.1 85.3 242 C85.4 243.9 85.8 243.7 86.1 245.8 C86.4 247.8 86.2 250.7 86.8 253.3 C87.3 256 88.4 258.7 89.2 260.6 C89.9 262.6 90.4 262.8 90.8 264 C91.2 265.2 91.4 263.8 91.3 267.2 C91.3 270.5 90.7 277.6 90.7 282.5 C90.7 287.3 90.9 291.6 91.2 294 C91.4 296.5 91.6 295.4 92.2 295.8 C92.7 296.3 92 296.5 94.2 296.4 C96.4 296.3 102.4 295.6 104.5 295.3 C106.6 295 105.5 295 105.9 294.7 C106.3 294.3 106.7 294.1 106.7 293.6 C106.8 293 107 292.6 106.2 291.8 C105.5 290.9 103.4 289.7 102.4 288.7 C101.4 287.8 101.2 287.3 100.8 286.4 C100.3 285.5 100.2 285.1 100 283.7 C99.9 282.3 99.2 282.7 100 278.8 C100.9 274.8 103.7 266.4 104.8 261.8 C106 257.1 105.9 255.1 106.5 252.8 C107.2 250.4 107.7 250.7 108.4 248.6 C109.2 246.5 110.3 242.8 110.8 241 C111.3 239.2 111.1 239.6 111.2 238.6 C111.2 237.6 111.3 236.8 111.1 235.2 C110.9 233.6 111.5 233.3 110.2 229.8 C108.9 226.3 105.2 218.7 103.9 215.8 C102.7 212.8 103.3 214.2 103.2 213.3 C103.2 212.4 102.8 213.3 103.6 210.8 C104.4 208.3 106.7 202.8 107.9 199.4 C109 196 109.3 194.2 109.9 191.9 C110.4 189.6 110.5 189.8 110.7 186.6 C111 183.5 111.2 177.2 111.2 174.5 C111.3 171.8 111.3 173.5 111 171.5 C110.7 169.6 110.3 167.5 109.5 163.8 C108.6 160.1 107.1 155.4 106.4 150.8 C105.7 146.3 105.6 142.1 105.4 138.7 C105.2 135.3 105.7 135.4 105.3 132.2 C104.8 128.9 103.4 123.4 103 120.7 C102.5 117.9 103.1 118.9 103 116.9 C102.8 114.9 102.2 111.3 102.1 109.7 C102 108 101 109.5 102.4 107.8 C103.8 106.1 108 102.5 109.8 100.4 C111.6 98.4 111.7 97.3 112.4 96.4 C113.2 95.6 113.4 95.9 113.9 95.9 C114.4 95.9 115 96.3 115.4 96.7 C115.8 97 115.8 97.1 115.9 97.9 C116.1 98.6 116 99.9 116.2 100.9 C116.5 101.8 116.8 102.4 117.3 103.1 C117.7 103.9 117.8 104.1 118.6 104.9 C119.4 105.6 120.9 106.6 121.6 107.2 C122.3 107.9 122.1 107.2 122.5 108.5 C122.8 109.8 123.3 112.4 123.4 114.5 C123.6 116.6 123.2 118.7 123.2 120 C123.3 121.3 123 120.2 123.6 121.6 C124.1 123 125.1 125.7 126.2 127.8 C127.4 129.9 128.7 131.1 129.9 133.4 C131 135.8 131.7 138.6 132.6 140.8 C133.5 143.1 134.6 144.2 135.1 145.8 C135.5 147.3 134.8 148.2 135.3 149.4 C135.8 150.6 137.4 150.9 138 152.6 C138.6 154.3 138.4 157.6 138.7 158.9 C138.9 160.2 139.1 159.6 139.5 159.9 C139.9 160.1 140.3 160.3 140.8 160.4 C141.4 160.5 142 160.5 142.5 160.4 C143 160.3 143.4 160.2 143.8 159.9 C144.2 159.7 144.5 159.4 144.8 159 C145 158.6 145.2 158.2 145.2 157.7 C145.3 157.2 145.4 157.4 145.2 156 C144.9 154.7 143.8 152.3 143.7 150.3 C143.6 148.2 144.5 146.5 144.4 144.7 C144.4 142.8 143.2 142.9 143.5 140.2 C143.7 137.4 145.5 132.1 145.7 129.5 C146 126.8 145.1 127.1 145 125.5 C144.9 124 145.5 123 145.2 121 C144.9 119.1 143.9 116.6 143.3 114.8 C142.7 113.1 142.6 112.5 141.8 111.3 C140.9 110.1 139.2 109.1 138.4 108.1 C137.6 107.2 137.6 106.9 137.3 106 C137.1 105 137.3 103.9 137 102.7 C136.7 101.5 136.2 102.4 135.8 99.2 C135.4 96 135.2 88.1 134.7 84.9 C134.2 81.8 134.1 83.1 133.1 81.8 C132.1 80.4 130 79.4 129.1 77.4 C128.3 75.3 128.9 72.6 128.5 70.4 C128 68.2 127.3 66.6 126.5 64.9 C125.6 63.2 124.9 62.3 123.6 60.9 C122.3 59.5 120.6 57.9 119.2 57 C117.8 56 117 55.8 115.6 55.5 C114.2 55.3 112.4 55.7 111.2 55.7 C110 55.6 109.7 55.4 109.1 55.1 C108.5 54.8 108.3 54.8 107.8 54.1 C107.2 53.4 106.7 52.1 106.1 51.4 C105.6 50.7 106.5 51 104.9 50.2 C103.3 49.4 99.6 48.2 97.3 47.1 C95 46 93.3 45 92.1 44.3 C91 43.6 91.3 43.8 90.9 43.2 C90.5 42.6 89.9 42.1 89.9 40.8 C89.8 39.5 90.5 37.7 90.5 36 C89.8 34.1 90.7 32.4 91.5 31 C92.3 29.7 93.6 28.8 94.2 27.8 C94.9 26.8 95.1 26.2 95.3 25.5 C95.4 24.7 95.4 24.6 95.2 23.7 C95 22.7 94.2 21.7 94 20.3 C93.9 18.9 94.5 17 94.5 15.7 C94.5 14.3 94.6 14.2 94 12.9 C93.4 11.5 92.4 9.6 91.2 8.2 C89.9 6.8 88.6 5.8 87.1 5 C85.7 4.2 85.1 4 83.3 3.7 C81.5 3.5 78.8 3.5 77 3.7 Z";
// v77: front lower legs lengthened (everything below the knees at y 210 stretched x 1.08) so the front legs match the back view.
const LEG_Y = 210, LEG_K = 1.08;
const legStretch = d => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, a, b) => +b <= LEG_Y ? m : a + ' ' + (Math.round((LEG_Y + (+b - LEG_Y) * LEG_K) * 10) / 10));
// v77: both figures drawn 7 units higher (front at -7, back at +5 - 7) to clear the Front/Back labels.
const FIG_UP = 7;
const BODY = {
  front: [
    ["_n", "M63.9 262.6 C63.3 262.6 63.3 262.9 63.1 263.1 C62.9 263.4 62.4 261.1 62.8 264 C63.2 266.9 64.9 275.6 65.4 279.1 C65.9 282.6 65.5 282.2 65.4 283.6 C65.3 285 64.5 285.8 64.6 286.6 C64.7 287.5 65.3 288 65.9 288.4 C66.4 288.8 67.1 289 67.7 289 C68.3 289 68.6 288.6 69.1 288.2 C69.6 287.8 70 287.3 70.4 286.7 C70.7 286.2 70.9 285.7 71.1 285.1 C71.2 284.4 71.4 284.2 71.1 283 C70.8 281.8 69.9 280.4 69.5 278.4 C69.1 276.4 69.2 274.5 68.8 272 C68.5 269.5 67.9 266.2 67.4 264.7 C67 263.2 67 263.9 66.3 263.5 C65.7 263.1 64.5 262.7 63.9 262.6 Z M61.5 133.1 C61.1 133.1 60.9 133.3 60.7 133.7 C60.4 134.1 60.3 134.3 60.2 135.2 C60.1 136.1 60.5 137.4 60.3 138.6 C60 139.7 59 140.4 58.8 141.6 C58.5 142.8 58.7 144.5 58.8 145.3 C58.9 146.1 58.8 145.8 59.4 146.1 C60 146.3 60.9 145.3 62.1 146.7 C63.2 148.1 64.6 151.2 65.7 153.9 C66.7 156.6 67.3 158.2 68 161.5 C68.7 164.9 69.1 169.9 69.6 172.4 C70 175 70.1 174.6 70.6 175.6 C71 176.6 71.3 177.3 71.9 177.8 C72.5 178.3 73.5 178.5 73.9 178.5 C74.4 178.5 74.5 178.2 74.6 177.9 C74.7 177.6 75.6 180.7 74.5 176.7 C73.4 172.8 69.6 160 68.6 155.9 C67.5 151.8 68.4 154.7 68.5 153.9 C68.7 153.1 69.3 152.5 69.3 151.4 C69.3 150.3 69.2 149.5 68.8 147.7 C68.4 145.9 67.5 143.1 66.9 141.6 C66.3 140.1 65.9 140.4 65.5 139.4 C65.1 138.3 65 136.7 64.6 135.7 C64.1 134.6 63.7 134.1 63.1 133.6 C62.6 133.2 62 133 61.5 133.1 Z"],
    ["Neck", "M70.6 42.7 C70.2 43 69.7 43.5 69.6 44.2 C69.4 44.9 69.9 45.8 69.9 46.7 C69.9 47.6 69.5 48.2 69.6 49.3 C69.7 50.3 70.3 51 70.4 52.7 C70.4 54.5 69.4 57.4 69.7 58.8 C70 60.1 70.7 59.8 71.8 60.1 C73 60.3 74.5 59.7 76 60.1 C77.5 60.6 79.3 62 80 62.4 L80 62.7 L80 61.4 L80 47.7 L80 47.3 C79.5 47.3 78.2 48.3 77.2 47.6 C76.1 46.9 75.1 44.4 74.2 43.4 C73.3 42.5 72.8 42.6 72.2 42.5 C71.5 42.3 71.1 42.3 70.6 42.7 Z"],
    ["Traps", "M69.8 50.6 C69.5 50 69.3 50 69 49.9 C68.7 49.7 69 49.4 67.9 49.9 C66.8 50.4 64.8 52 63.1 52.9 C61.4 53.7 60.7 53.4 58.5 54.8 C56.2 56.1 52.2 59.1 50.8 60.3 C49.4 61.4 50.4 60.9 50.5 61.2 C50.7 61.5 50.7 61.8 51.7 61.8 C52.7 61.9 54.7 61.5 56.2 61.5 C57.7 61.6 58.3 62 59.9 62 C61.5 61.9 63.8 61.7 65.2 61.4 C66.6 61.2 66.7 61.2 67.5 60.6 C68.2 60.1 68.8 59.7 69.3 58.4 C69.8 57 70.2 54.6 70.2 53.2 C70.3 51.8 70 51.2 69.8 50.6 Z"],
    ["Serratus", "M52.5 92.6 C52 92.9 52.1 93.1 52 93.7 C51.9 94.3 52.5 95 52.2 96 C51.9 97 50.2 97.7 50.4 99.2 C50.5 100.7 52 103.2 52.9 104.4 C53.9 105.5 54 105.4 55.9 105.6 C57.7 105.8 61.6 105.7 63.2 105.6 C64.8 105.5 64.5 105.3 64.8 105 C65.2 104.7 65.2 104.6 65.3 103.9 C65.3 103.3 64.8 102.3 65 101.3 C65.3 100.4 66.4 99.3 66.6 98.4 C66.8 97.5 66.5 96.9 66.2 96.4 C65.8 95.9 65.9 95.9 64.6 95.6 C63.4 95.2 61.2 95 59.4 94.4 C57.6 93.7 56 92.3 54.7 92 C53.5 91.7 53 92.3 52.5 92.6 Z"],
    ["Obliques", "M53.6 105.8 C51.7 106 52.9 106.2 53.2 106.8 C53.6 107.4 54.8 107.9 55.5 108.9 C56.2 109.9 57 110.2 57.2 112.6 C57.5 115 56.8 119.8 56.9 122.2 C57 124.5 57.2 124.2 57.7 125.4 C58.2 126.6 58.4 127.6 59.6 128.9 C60.7 130.3 63 132 64.1 132.9 C65.2 133.7 65.2 133.7 65.8 133.8 C66.3 133.9 66.9 133.8 67.3 133.6 C67.8 133.4 68 133.3 68.3 132.5 C68.6 131.7 68.9 130.7 68.9 129.4 C68.8 128 68.1 127.3 68.1 125 C68.1 122.6 68.9 118.3 68.9 116.4 C68.9 114.5 68.7 115.4 68.3 114.5 C67.8 113.7 66.7 113.1 66.3 111.7 C65.9 110.3 66.3 108 65.9 106.9 C65.5 105.8 66.1 106 63.9 105.8 C61.6 105.6 55.5 105.6 53.6 105.8 Z"],
    ["Chest", "M80 71.6 L80 71.3 C75 72.1 57.5 75.1 52.2 76.2 C46.8 77.3 50.9 76.7 50.1 77.3 C49.4 77.8 48.5 78.7 48 79.3 C47.5 79.8 47.3 80.1 47.2 80.5 C47 81 46.7 81 47.1 81.8 C47.6 82.5 48.7 83.1 49.8 84.7 C51 86.4 51.8 89.2 53.5 90.9 C55.2 92.6 57.1 93.2 59.4 94.1 C61.6 94.9 63.7 95.6 66 95.7 C68.3 95.7 70.6 94.6 72.2 94.1 C73.8 93.6 73.8 93.7 74.9 92.9 C76 92.2 77.3 90.8 78.3 90 C79.2 89.2 79.7 91.8 80 88.5 L80 71.6 Z"],
    ["UpperChest", "M80 65.3 C79.4 63.9 78 63.1 76.6 62.3 C75.2 61.5 73.7 61.1 72.2 60.8 C70.6 60.5 70.5 60.5 68 60.8 C65.5 61.1 60.2 62 58.3 62.5 C56.3 63 58.5 61.1 57.3 63.3 C56.2 65.6 52.7 72.7 51.8 75 C50.9 77.2 52.1 75.5 52.4 75.6 C52.7 75.8 48.7 76.6 53.6 75.8 C58.6 75 75.3 72.1 80 71.1 L80 70.1 L80 65.3 Z"],
    ["UpperAbs", "M66.2 109.4 C65.9 110.1 66.2 111.4 66.7 112.4 C67.3 113.3 67 114 69.4 114.5 C71.8 114.9 78.1 114.7 80 114.6 L80 114.1 L80 109.5 L80 108.5 C77.8 108.4 70.5 108.3 68 108.5 C65.5 108.6 66.4 108.7 66.2 109.4 Z M65.2 101.1 C65.2 102.2 65.6 104.7 66 105.8 C66.3 106.9 64.8 106.9 67.3 107.2 C69.9 107.5 77.7 107.5 80 107.4 L80 106.9 L80 100.5 L80 99.5 C77.8 99.4 70.3 99.4 67.8 99.5 C65.3 99.6 66.7 99.7 66.2 100 C65.8 100.3 65.3 100.1 65.2 101.1 Z M80 89.5 L80 89.3 C79.8 89.3 79.8 89.1 78.7 89.9 C77.6 90.7 75.7 92.7 73.8 93.6 C71.8 94.6 69 94.9 67.8 95.4 C66.6 95.8 67.1 95.9 67 96.3 C66.8 96.7 66.7 97.2 67.1 97.6 C67.4 97.9 66.6 98.3 68.9 98.4 C71.2 98.5 78 98.5 80 98.2 L80 97.1 L80 89.5 Z"],
    ["LowerAbs", "M71.1 114.8 C69.2 115 70 115.1 69.5 115.9 C69.1 116.7 68.9 117.5 68.6 119.1 C68.4 120.8 68.2 123.5 68.2 125.1 C68.3 126.7 68.9 126.8 69 127.9 C69.1 129 68.7 130.3 68.8 131.3 C68.9 132.2 69.5 132 69.7 133.2 C69.9 134.4 69.5 135.5 70.1 137.8 C70.8 140 72.3 143.7 73.3 145.7 C74.3 147.6 75 148.1 75.7 148.7 C76.4 149.4 76.5 149.7 77.2 149.4 C78 149.2 79.5 147.9 80 147.3 L80 146.5 L80 115.5 L80 114.8 C78.4 114.6 72.9 114.6 71.1 114.8 Z"],
    ["SideDelts", "M49 60.1 C48.5 59.9 48.4 59.7 47 59.9 C45.6 60.2 43 60.8 41.4 61.5 C39.7 62.3 39 63.2 38.1 64 C37.2 64.9 36.9 64.7 36.3 66.4 C35.8 68 35.2 71.1 34.9 73.2 C34.6 75.4 34.7 76.4 34.9 78.4 C35 80.3 35.2 82.7 35.5 84 C35.8 85.4 36.1 85.3 36.5 85.8 C36.9 86.3 37.2 86.6 37.8 86.8 C38.3 86.9 38.6 87.1 39.4 86.5 C40.3 85.9 42 84.5 42.5 83.3 C43 82.2 41.9 81.6 42 80.1 C42.1 78.6 42.5 76.5 43 75.1 C43.4 73.8 44.3 73.4 44.4 72.4 C44.6 71.5 43.4 70.8 43.7 69.7 C43.9 68.6 44.7 67.8 45.7 66.4 C46.8 65 48.9 62.8 49.7 61.8 C50.4 60.8 49.9 61.1 49.8 60.8 C49.6 60.5 49.5 60.2 49 60.1 Z"],
    ["FrontDelts", "M55.7 62.7 C55.2 62.4 54.6 61.8 53.5 61.8 C52.4 61.8 50.9 62 49.8 62.5 C48.7 63.1 48.2 63.7 47.2 64.8 C46.2 65.9 45 67.6 44.4 68.5 C43.8 69.4 43.9 69.2 44 69.8 C44.1 70.4 45.2 70.9 45 71.9 C44.9 72.8 43.7 73.5 43.1 75 C42.6 76.6 42.3 79.2 42.1 80.4 C42 81.6 42.1 81.2 42.3 81.5 C42.5 81.9 42.8 82.2 43.2 82.4 C43.5 82.6 43.8 82.8 44.4 82.7 C44.9 82.5 45.1 83 46.2 81.8 C47.4 80.6 48.8 79 50.6 75.9 C52.5 72.9 55.5 67 56.5 64.8 C57.6 62.6 56.7 64 56.6 63.6 C56.4 63.2 56.3 63 55.7 62.7 Z"],
    ["Triceps", "M35.4 85.5 C34.7 85.2 34.6 85.5 34.2 85.7 C33.8 85.9 33.7 85.5 33.1 86.8 C32.4 88.2 31.1 90.8 30.5 93.2 C29.9 95.7 29.6 98.8 29.6 100.3 C29.7 101.9 30.3 101.6 30.9 101.8 C31.5 101.9 32 101.8 32.8 101.3 C33.5 100.8 34.4 100.4 35.1 98.7 C35.8 97 36.1 93.6 36.7 91.8 C37.2 90 37.9 89.5 38.1 88.6 C38.3 87.8 38.2 87.7 37.8 87.2 C37.3 86.6 36 85.8 35.4 85.5 Z"],
    ["Biceps", "M46.6 82.6 C45.5 82.3 44.7 82.8 43.6 83.3 C42.5 83.9 41.5 84.4 40.5 85.6 C39.4 86.8 38.4 88.3 37.6 90 C36.8 91.7 36.2 93.6 35.9 94.9 C35.5 96.3 35.8 96.7 35.6 97.6 C35.4 98.6 34.7 99 34.6 100.1 C34.6 101.2 34.8 102.2 35.4 103.6 C35.9 105 37.1 106.6 37.6 107.8 C38.1 108.9 38 109.6 38.3 110.2 C38.7 110.8 38.7 111.2 39.6 111.2 C40.4 111.3 42.1 110.7 43 110.4 C44 110.1 43.6 110.4 44.8 109.4 C46.1 108.4 48.8 106.1 49.8 105 C50.9 103.9 50.6 104 50.8 103.4 C51 102.7 51 102.1 50.9 101.3 C50.8 100.6 50 99.9 50.3 99 C50.5 98 51.8 97 52.1 96 C52.4 95 51.8 94.3 51.9 93.4 C52.1 92.4 53.3 92.2 52.9 90.6 C52.5 89.1 50.9 86.4 49.8 85 C48.7 83.5 47.8 82.9 46.6 82.6 Z"],
    ["Forearms", "M34.2 101.2 C33.6 101.3 31.9 101.9 31.1 102.2 C30.4 102.6 30.5 102.4 30 103.1 C29.6 103.7 29.1 104.8 28.8 105.8 C28.4 106.9 29 107.2 28.2 109 C27.3 110.8 24.8 112.9 24.1 115.6 C23.4 118.3 23.7 122 24.1 124.1 C24.6 126.1 26.1 125.6 26.6 127.2 C27 128.8 26.2 131.8 26.5 133 C26.8 134.3 27.4 134.1 28.3 134.3 C29.2 134.6 30.6 134.6 31.5 134.5 C32.3 134.3 32.5 134.3 32.8 133.6 C33.1 132.9 32.7 132.1 33.4 130.4 C34.1 128.7 35.9 126 36.7 124.2 C37.5 122.3 37.1 121.4 37.7 120.1 C38.3 118.8 39.8 118.4 40 117 C40.3 115.5 39.5 113.7 39.1 112.1 C38.7 110.5 38.3 109.5 37.6 108.1 C37 106.7 35.9 105.3 35.5 104.2 C35 103 35.2 102.3 34.9 101.8 C34.7 101.2 34.9 101.1 34.2 101.2 Z M24 125.4 C23.6 125.5 23.3 125.7 23.1 126.1 C22.9 126.4 22.7 126.2 22.7 127.2 C22.7 128.2 23.1 129.3 23.1 131.7 C23.1 134.1 22.4 138.1 22.8 140.7 C23.3 143.4 24.7 145.1 25.6 146.5 C26.6 148 27.3 148.4 28.1 148.9 C28.8 149.4 29.3 149.4 29.8 149.4 C30.2 149.4 30.4 149.1 30.6 148.8 C30.8 148.6 31.3 149 30.9 148 C30.4 147 29 144.8 28.4 143.3 C27.7 141.8 27.4 141.3 27.2 139.8 C26.9 138.3 27.2 136.3 27 135 C26.8 133.7 26.2 133.9 26.1 132.5 C26 131.1 26.6 128.4 26.4 127.2 C26.3 126 25.9 126.1 25.4 125.7 C25 125.4 24.5 125.4 24 125.4 Z M40.1 118.7 C39.7 118.6 39.3 118.6 38.9 118.9 C38.5 119.1 38.3 118.9 38 119.8 C37.6 120.8 37.6 122.3 36.8 124.2 C36 126 34.4 128 33.7 130 C32.9 132.1 32.8 134.2 32.6 135.4 C32.4 136.6 32.6 136.3 32.8 136.6 C33 136.9 33 137.2 33.5 137.2 C34 137.2 34.6 137.2 35.4 136.8 C36.2 136.3 36.8 135.8 37.7 134.8 C38.7 133.8 40 132.3 40.8 131.2 C41.6 130 41.8 129.6 42.2 128.5 C42.5 127.3 43 126.4 42.7 124.7 C42.5 123.1 41.3 120.5 40.8 119.4 C40.4 118.3 40.4 118.8 40.1 118.7 Z M28.6 134.6 C28 134.8 27.5 134.9 27.3 135.8 C27 136.7 26.9 138.1 27.3 139.8 C27.7 141.6 28.8 144.2 29.5 145.4 C30.2 146.6 30.7 146.5 31.1 146.6 C31.5 146.7 31.6 147 31.8 146 C32.1 144.9 32.7 142 32.7 140.7 C32.8 139.4 32.3 139.5 32.2 138.8 C32.2 138.1 32.6 137.3 32.4 136.7 C32.2 136 31.8 135.6 31.1 135.2 C30.4 134.8 29.3 134.5 28.6 134.6 Z"],
    ["Abductors", "M59 132.3 C58.4 132.3 57.4 132.3 56.5 133.1 C55.7 133.9 54.9 133.2 54.3 136.7 C53.6 140.2 53.3 148.3 52.8 152.5 C52.3 156.7 51.7 158.3 51.5 160 C51.3 161.6 51.5 161.3 51.7 161.7 C51.8 162.2 52.1 162.4 52.5 162.4 C52.9 162.5 53.3 162.5 53.7 162.2 C54.1 161.9 53.7 163.5 54.7 161 C55.7 158.4 58.6 151 59.3 148.1 C60 145.3 58.7 146.2 58.6 145.1 C58.5 144 58.3 143.2 58.6 142.1 C58.9 140.9 59.8 140.3 60.1 138.8 C60.4 137.3 60.3 134.9 60.3 133.9 C60.3 132.8 60.2 133.1 60 132.8 C59.7 132.5 59.6 132.2 59 132.3 Z"],
    ["Adductors", "M72.5 150.8 C71.7 151 71.4 151.2 70.7 151.9 C70.1 152.6 69.3 153.9 69 154.7 C68.6 155.4 67.5 151.5 68.7 156 C69.9 160.6 74.2 175.4 75.6 179.9 C76.9 184.4 75.9 180.7 76.2 180.9 C76.4 181.2 76.7 181.4 77 181.2 C77.3 181 77.7 181.8 77.9 180 C78.1 178.2 78.2 176.3 77.9 171.3 C77.7 166.3 77 156 76.5 152.3 C76.1 148.6 76.1 151.2 75.4 150.9 C74.7 150.7 73.4 150.6 72.5 150.8 Z"],
    ["Quads", "M60.8 146.5 C60.4 146.5 60.7 145.1 59.8 147.2 C58.9 149.2 56.7 154.9 55.7 157.9 C54.7 161 54.2 161.5 54.2 164.1 C54.2 166.7 55.2 169.5 55.5 172.3 C55.8 175.2 55.8 177.6 56 179.9 C56.3 182.1 56.6 182.9 57.1 184.8 C57.6 186.7 58.3 188.7 59 190.4 C59.8 192.2 60.9 193.4 61.3 194.5 C61.7 195.7 61 196.2 61.2 196.8 C61.4 197.4 62.1 197.8 62.5 197.9 C62.9 197.9 63.3 197.7 63.3 197.2 C63.3 196.6 62.5 196.2 62.6 194.6 C62.8 193 63.4 190.5 64.1 188.2 C64.8 185.9 65.5 183.8 66.5 181.9 C67.4 180 68.7 179.8 69.3 177.8 C69.8 175.9 69.5 173.1 69.4 171.1 C69.2 169.1 68.6 168.7 68.3 166.9 C68.1 165.2 68.4 163.8 67.9 161.5 C67.4 159.2 66.6 156.7 65.6 154.1 C64.6 151.6 63.2 148.9 62.3 147.5 C61.5 146.1 61.3 146.6 60.8 146.5 Z M51.7 162.7 C51.2 162.9 51.1 162.4 50.5 164 C50 165.7 49.3 168.6 48.8 171.9 C48.4 175.1 48 178.2 47.9 182 C47.8 185.8 48.1 190.2 48.4 193.1 C48.7 196.1 48.9 196.6 49.5 198.4 C50.1 200.3 50.7 201.9 51.8 203.6 C52.8 205.2 54.1 206.7 55.3 207.6 C56.5 208.5 57.3 208.7 58.3 208.6 C59.4 208.5 60.6 207.7 61.3 206.9 C62.1 206.2 62.5 205.5 62.5 204.5 C62.5 203.6 61.7 203.5 61.4 201.7 C61 199.9 61.5 197.4 60.7 194.3 C59.8 191.1 58 189.4 56.8 184 C55.6 178.6 54.7 168.1 54 164.4 C53.4 160.6 53.7 163.5 53.2 163.2 C52.8 162.9 52.2 162.6 51.7 162.7 Z M71.6 178.5 C70.8 178.4 69.5 178.8 68.8 179.1 C68.1 179.4 68.6 178.3 67.8 179.9 C66.9 181.5 65 185.8 64.2 188.2 C63.4 190.6 63.3 191.5 63.2 193.1 C63.1 194.8 63.5 195.4 63.5 197.3 C63.4 199.2 62.9 202.2 62.9 203.6 C62.9 205 62.9 204.2 63.5 205.1 C64.1 205.9 65 207 66.2 208.3 C67.5 209.5 69.3 211.1 70.5 211.9 C71.7 212.8 72.4 213 73.1 213.1 C73.8 213.2 74 212.8 74.4 212.5 C74.8 212.1 74.6 213.5 75.1 211 C75.6 208.6 76.5 201.5 77.1 198.9 C77.7 196.3 78.1 198.1 78.3 196.5 C78.5 195 78.4 191.7 78.4 190.3 C78.3 188.9 78.6 189.8 78 188.8 C77.4 187.7 76.1 186.1 75.2 184.4 C74.4 182.7 73.8 180.4 73.1 179.4 C72.5 178.3 72.4 178.5 71.6 178.5 Z"],
    ["Calves", "M57.9 215.6 C57.3 215.8 56.8 215.6 56.2 217.1 C55.5 218.5 54.5 220.6 54.3 223.7 C54 226.8 54.3 231.8 54.7 234.2 C55 236.5 55.6 235.6 56.2 237.0 C56.8 238.4 56.9 240.1 57.8 242.0 C58.7 244.0 60.6 246.4 61.3 247.9 C62.1 249.3 61.8 249.6 62.1 250.0 C62.4 250.5 62.7 250.5 63 250.5 C63.4 250.4 63.7 250.3 63.9 249.5 C64 248.8 64.3 248.5 63.9 246.5 C63.5 244.5 62.3 242.4 61.8 238.4 C61.2 234.5 61.2 227.6 60.7 224.5 C60.3 221.4 59.1 222.5 59.1 221.2 C59.1 220.0 60.6 218.4 60.7 217.5 C60.8 216.6 60.2 216.5 59.7 216.1 C59.2 215.8 58.5 215.4 57.9 215.6 Z M72.5 218.8 C71.9 219.1 70.7 219.8 70.3 220.5 C69.8 221.3 70.4 222.2 70.1 223.1 C69.8 224.1 69 223.9 68.7 225.7 C68.5 227.5 68.6 231.6 68.6 233.1 C68.7 234.7 68.6 233.7 69.1 234.2 C69.6 234.6 70.5 234.2 71.4 235.6 C72.4 237.1 73.7 240.7 74.5 242.0 C75.4 243.3 75.6 242.8 76.1 242.8 C76.6 242.8 76.8 242.5 77.2 242.1 C77.5 241.7 77.6 242.6 77.8 240.7 C78 238.7 78.3 233.3 78.3 231.3 C78.3 229.4 78.3 230.7 77.7 230.1 C77.2 229.4 75.8 229.8 75.2 227.9 C74.5 226.1 74.5 221.5 74.2 219.9 C73.9 218.3 73.9 219.2 73.6 219.0 C73.3 218.9 73.1 218.6 72.5 218.8 Z M69.9 235.1 C69.5 235.0 69.3 235.2 69.1 235.5 C68.8 235.7 68.9 232.8 68.6 236.4 C68.3 240.1 67.5 251.2 67.3 255.8 C67.1 260.3 67.4 259.5 67.7 261.8 C68.1 264.1 68.7 267.1 69.1 268.4 C69.5 269.8 69.8 269.3 70.1 269.4 C70.5 269.5 70.7 269.3 70.9 268.9 C71.1 268.6 71.2 269.0 71.4 267.5 C71.7 265.9 71.5 263.0 72.2 260.1 C72.8 257.3 74.5 253.9 75 251.7 C75.5 249.5 74.6 249.5 74.9 248.1 C75.1 246.8 76.4 245.3 76.3 244.2 C76.2 243.0 75.1 243.1 74.2 241.7 C73.4 240.2 72.4 237.4 71.6 236.2 C70.8 235.0 70.4 235.3 69.9 235.1 Z"],
    ["Calves", "M62.1 218.8 C61.5 218.8 60.9 219.1 60.5 219.5 C60.2 219.9 59.9 219.1 60 221.0 C60.2 222.8 61.2 227.2 61.5 229.8 C61.7 232.3 61.2 232.7 61.4 235.2 C61.7 237.6 62.4 241.3 62.9 243.4 C63.3 245.4 63.9 245.0 64 246.6 C64.1 248.3 63.4 251.3 63.4 252.7 C63.4 254.2 63.8 254.3 64.3 254.8 C64.7 255.3 65.5 255.5 66 255.6 C66.5 255.6 66.8 255.3 67 254.9 C67.3 254.6 67.3 256.7 67.5 253.6 C67.8 250.6 68.6 242.6 68.4 237.9 C68.2 233.1 67.2 229.7 66.5 227.1 C65.8 224.4 65 224.3 64.6 223.0 C64.2 221.8 64.5 220.8 64.3 220.1 C64.1 219.4 63.9 219.4 63.5 219.1 C63.1 218.9 62.6 218.7 62.1 218.8 Z"], // v104: old shin (tibialis) slot, now part of the calf so the lower leg has no hole
  ],
  back: [
    ["_n", "M58.8 264.9 C57.7 264.6 57.9 265.3 57.7 265.7 C57.4 266 56.9 264.9 57.4 267.1 C57.9 269.2 59.9 274.5 60.4 277.6 C61 280.7 60.6 282.6 60.5 284.4 C60.4 286.1 59.5 286.4 59.8 287.4 C60.2 288.4 61.6 289.3 62.4 289.9 C63.2 290.4 63.6 290.4 64.2 290.3 C64.8 290.2 65.1 290.1 65.6 289.3 C66 288.5 66.5 287.4 66.6 285.7 C66.8 284 66.4 281.3 66.1 279.8 C65.9 278.2 65.2 278.8 65.1 277.3 C64.9 275.8 65.4 273 65.2 271.2 C65 269.4 65 268.3 63.9 267.2 C62.7 266 59.9 265.2 58.8 264.9 Z"],
    ["Neck", "M73.1 31.1 C72.5 31.1 71.7 31.2 71.1 31.8 C70.6 32.4 70.2 33.6 70 34.6 C69.8 35.6 69.8 36.1 70 37.3 C70.2 38.5 70.6 40.4 70.9 41.2 C71.2 42.1 71.5 42.1 71.9 42.2 C72.3 42.3 72.7 42 73.1 41.7 C73.5 41.4 73.9 41.1 74 40.5 C74.2 39.9 73.8 39.6 74 38.2 C74.2 36.9 74.9 34.1 75 32.9 C75.1 31.8 74.9 32.1 74.6 31.7 C74.2 31.4 73.7 31.1 73.1 31.1 Z"],
    ["Traps", "M80 29 C79.6 26.3 78.9 28.2 78 28.5 C77.2 28.7 75.9 28.1 75.2 30.3 C74.5 32.4 74.6 38.2 74.2 40.4 C73.7 42.5 73.8 41.5 72.7 42.3 C71.7 43.1 69.6 44.3 68.3 44.9 C67.1 45.5 66.5 45.4 65.6 45.9 C64.7 46.4 64.9 46.9 63.4 47.6 C61.9 48.3 58.7 49.1 57.1 49.8 C55.5 50.5 55 50.7 54.3 51.5 C53.6 52.4 53.2 53.5 53.4 54.8 C53.7 56.1 54.6 57.8 55.6 58.8 C56.6 59.7 57.8 60 59 60.1 C60.2 60.1 58.5 59.1 62.3 58.8 C66.1 58.6 76.8 59.9 80 58.5 L80 51.1 C79.9 49.5 79.5 49.9 79.3 49.4 C79.1 49 78.8 49.1 78.9 48.4 C79.1 47.6 79.8 46.3 80 45.5 L80 43.5 L80 29 Z"],
    ["MidTraps", "M62 59.2 C58.6 59.5 61 59.8 61.2 60.5 C61.3 61.1 62.6 61.7 63 62.7 C63.4 63.7 62.6 63.7 63.3 66 C64 68.3 66.2 73.1 66.9 75.4 C67.7 77.6 67 77.5 67.5 78.6 C68 79.7 68.9 79.8 69.7 81.4 C70.4 83.1 70.7 85.4 71.6 87.7 C72.5 90.1 73.9 92.9 74.7 94.5 C75.5 96 75.5 95.9 76 96.3 C76.4 96.6 76.6 97 77.2 96.6 C77.7 96.1 78.5 94.3 79 93.6 C79.5 92.9 79.8 93.1 80 92.8 L80 92.1 L80 59.4 L80 58.9 C76.8 58.9 65.4 58.9 62 59.2 Z"],
    ["Lats", "M66.2 79 C65.1 79.2 63.5 80.3 61.9 80.8 C60.4 81.3 58.9 81.1 57.6 81.6 C56.2 82.1 55.6 83 54.5 83.6 C53.4 84.1 52.5 84.5 51.4 84.8 C50.2 85.1 48.8 84.9 48 85.3 C47.2 85.6 46.9 85.6 46.8 86.6 C46.7 87.6 46.6 89.3 47.5 90.7 C48.4 92 51.1 93.2 51.8 94 C52.6 94.7 52 94.4 51.6 94.9 C51.2 95.4 50 96 49.6 96.7 C49.3 97.5 48.2 97.2 49.7 99 C51.2 100.7 56 104.7 57.8 106.6 C59.6 108.5 58.5 108.4 59.5 109.5 C60.5 110.6 62.3 111.6 63.3 112.9 C64.4 114.1 64.7 115.6 65.3 116.3 C65.9 117.1 66.1 116.9 66.6 116.9 C67 116.9 67.3 116.7 67.6 116.4 C67.9 116.1 68.2 116.2 68.3 115.3 C68.3 114.4 68 112.6 68 111.6 C68.1 110.6 67.3 111.3 68.5 109.8 C69.8 108.3 73.3 105.1 74.9 103.1 C76.5 101.1 77.8 101.1 77.4 98.8 C76.9 96.4 73.9 93.4 72.5 90.2 C71 87 70.2 83 69.4 81.1 C68.6 79.2 68.6 80 68 79.7 C67.4 79.3 67.3 78.8 66.2 79 Z"],
    ["LowerBack", "M80 93.3 C79.9 93.3 79.6 93.4 79.3 93.7 C79 94 78.7 93.9 78.4 94.9 C78 95.9 78.1 97.8 77.4 99.3 C76.8 100.8 76.3 101.6 74.8 103.4 C73.2 105.3 70 107.9 68.8 109.5 C67.7 111 68.2 110.7 68.1 112 C68.1 113.3 67.8 115.4 68.5 116.7 C69.3 118 71.3 118.2 72.4 119.5 C73.5 120.7 74 122.2 74.6 123.6 C75.2 125.1 75.6 126.4 75.6 127.5 C75.7 128.7 74.2 128.8 74.8 130.2 C75.4 131.7 77.8 134.5 78.7 135.6 C79.7 136.7 79.8 136.4 80 136.5 L80 136 L80 94.6 L80 93.6 L80 93.3 Z"],
    ["UpperBack", "M57.3 63.7 C56.4 63.7 56.9 63.6 56.2 64.2 C55.5 64.9 54.7 66.6 53.4 67.3 C52.1 67.9 49.9 67.7 48.9 68 C47.9 68.2 48.1 68.3 47.8 68.6 C47.6 68.9 47.5 69.2 47.5 69.5 C47.6 69.9 47.5 70.1 48 70.6 C48.5 71.2 49.4 71.5 50.4 72.5 C51.4 73.5 52.5 74.7 53.4 76 C54.4 77.4 54.9 79.2 55.8 80.1 C56.6 81 57.4 81 58 81.1 C58.6 81.2 58.7 81 59 80.7 C59.3 80.4 59.1 81.2 59.7 79.5 C60.2 77.8 61.5 73.6 62 71.1 C62.6 68.6 62.9 66.7 62.8 65.5 C62.7 64.2 62.5 64.4 61.5 64.1 C60.5 63.8 58.3 63.7 57.3 63.7 Z M63.5 68.4 C63.2 68.4 63 67.3 62.4 69.2 C61.8 71.1 60.6 77 60.2 79 C59.8 80.9 60.2 79.8 60.4 80.1 C60.6 80.4 60.3 80.9 61.3 80.7 C62.3 80.4 64.8 79.4 65.9 78.8 C66.9 78.2 66.9 78 67 77.3 C67.2 76.6 67.2 76.4 66.7 74.9 C66.2 73.4 64.9 70.3 64.3 69.1 C63.7 67.9 63.8 68.4 63.5 68.4 Z M45 70.1 C44.6 70.7 44.2 71.6 44 72.8 C43.8 73.9 43.7 74.6 43.9 76.5 C44.2 78.4 44.9 81.9 45.5 83.4 C46.1 84.9 46.7 84.4 47.4 84.7 C48.2 84.9 48.5 85.2 49.8 84.9 C51.1 84.6 53.6 83.9 54.7 83.2 C55.8 82.5 56.2 82.2 56 81 C55.8 79.7 54.5 77.8 53.5 76.3 C52.5 74.7 51.4 73.6 50.3 72.5 C49.2 71.4 47.9 70.6 47.1 70.1 C46.4 69.6 46.6 69.7 46.2 69.7 C45.8 69.7 45.4 69.6 45 70.1 Z"],
    ["Obliques", "M60.3 110.6 C59.5 110.1 59.6 110.5 59.3 110.7 C59 110.9 59 110.5 58.6 111.6 C58.3 112.7 57.7 115.1 57.5 116.9 C57.3 118.7 57.4 120.6 57.6 121.6 C57.7 122.5 57.2 122.7 58.3 122.3 C59.4 121.8 62.4 120 63.6 119.2 C64.9 118.3 65.2 118.5 65.2 117.4 C65.2 116.4 64.5 114.6 63.6 113.4 C62.8 112.2 61 111 60.3 110.6 Z"],
    ["RearDelts", "M60.4 62.2 C60.2 61.8 59.8 61.1 58.9 60.5 C58 60 56.8 59.9 55.7 59 C54.6 58.1 54 56.2 52.8 55.7 C51.7 55.2 50.6 56.2 49.2 56.2 C47.9 56.2 46.4 55.9 45.4 55.8 C44.5 55.8 44.9 55.8 43.9 56.2 C43 56.6 41.7 56.9 40.3 58 C38.8 59.1 36.9 61.2 36 62.3 C35.1 63.4 35.2 63.3 35.1 64.1 C34.9 64.9 35.6 65.2 35 66.9 C34.5 68.6 32.3 72 32 73.4 C31.8 74.9 33 74.6 33.5 74.9 C34 75.2 33.9 75.8 34.8 75.1 C35.7 74.4 37.5 71.9 38.5 71 C39.6 70.2 39.5 70.5 40.7 70.2 C41.9 69.9 43.7 69.9 45.3 69.4 C46.9 69 48.4 68 49.8 67.6 C51.2 67.1 51.8 67.8 53 67.1 C54.3 66.4 55.3 64.4 56.5 63.7 C57.7 63.1 59 63.7 59.7 63.6 C60.4 63.4 60.3 63.2 60.4 63 C60.6 62.7 60.7 62.6 60.4 62.2 Z"],
    ["Triceps", "M31.2 79.5 C30.7 79.3 30.4 79.4 29.9 79.7 C29.3 80 28.9 80.1 28.1 81.2 C27.3 82.2 26.2 82.8 25.6 85.6 C24.9 88.4 24.7 94.3 24.6 96.7 C24.5 99.2 24.8 98.5 25.1 99.1 C25.3 99.6 25.5 99.6 25.8 99.7 C26.1 99.8 26.4 99.8 26.7 99.6 C27 99.4 27 99.8 27.4 98.8 C27.7 97.9 28.2 95.8 28.7 94.4 C29.3 92.9 30.1 92 30.5 90.9 C30.8 89.8 30.2 89.5 30.6 88.4 C31 87.3 32.4 85.9 32.8 84.6 C33.2 83.2 33.1 81.8 32.8 80.9 C32.5 80 31.8 79.8 31.2 79.5 Z M43.3 70.1 C42.7 70 41.5 70 40.5 70.4 C39.4 70.7 38.7 70.4 37.5 72 C36.2 73.5 34.2 76.8 33.3 79.1 C32.5 81.3 33.3 82.8 32.9 84.6 C32.4 86.3 31.2 87.2 30.8 88.7 C30.5 90.3 31.2 91.6 31.1 93.1 C30.9 94.7 30 96.4 29.9 97.5 C29.9 98.6 30.2 98.7 30.9 99.1 C31.7 99.5 32.8 99.7 34 99.8 C35.3 99.8 36.8 99.6 37.9 99.3 C39 99 39.2 99 40.2 98 C41.2 97 42.5 94.8 43.3 93.9 C44.1 93.1 44.1 93.2 44.5 93.1 C44.9 93 44.9 93 45.4 93.3 C45.8 93.6 46.3 94.5 46.9 94.9 C47.5 95.3 48.1 95.5 48.7 95.6 C49.3 95.6 49.7 95.6 50.2 95.4 C50.7 95.2 51.3 94.8 51.5 94.4 C51.6 94.1 51.9 94.1 51.2 93.4 C50.4 92.6 48 91.8 47.2 90.3 C46.3 88.8 47.1 86.6 46.6 85.1 C46.2 83.5 45.2 83.2 44.7 81.7 C44.2 80.1 43.9 78.4 43.8 76.5 C43.7 74.6 44.2 72.4 44.1 71.2 C44 70.1 44 70.3 43.3 70.1 Z"],
    ["Forearms", "M43 96.7 C42.7 96.2 42.3 96.1 41.8 96.4 C41.2 96.7 40.7 97.7 39.9 98.4 C39 99 38.6 99.5 37.1 99.7 C35.6 99.9 32.8 99.5 31.6 99.5 C30.4 99.6 31.5 98.8 30.4 100 C29.3 101.1 26.4 104.5 25.5 105.8 C24.5 107.2 25 106.9 25 107.4 C24.9 108 24.9 108.5 25.3 108.9 C25.6 109.3 26.1 109.6 26.7 109.9 C27.4 110.1 27.9 110.4 28.9 110.4 C29.8 110.4 30.7 110.3 31.9 109.9 C33.1 109.5 33.8 109.7 35.7 108.2 C37.6 106.7 41.3 102.9 42.6 101.3 C44 99.8 43.2 100.4 43.2 99.5 C43.3 98.7 43.3 97.3 43 96.7 Z M21 110.9 C20.5 110.8 20 110.9 19.5 111.2 C19.1 111.5 18.8 111.6 18.4 112.4 C17.9 113.2 17.4 114.4 17.1 115.5 C16.8 116.6 17 117.3 16.6 118.3 C16.3 119.3 15.4 119.8 15.2 121.1 C15 122.5 15.5 124.2 15.5 125.9 C15.5 127.5 15.1 129.3 15.1 130.4 C15.1 131.4 15.3 131.2 15.7 131.5 C16 131.9 16.6 132.2 16.9 132.3 C17.3 132.4 17.5 132.3 17.8 132.2 C18 132 18.2 133.1 18.4 131.5 C18.6 129.8 18.2 126.1 19 122.8 C19.8 119.5 22.2 115 22.8 113 C23.5 111 22.9 112.1 22.5 111.7 C22.2 111.3 21.5 111 21 110.9 Z M35.7 108.9 C35.1 108.7 34 109.1 33.3 109.4 C32.5 109.8 31.9 109 31.4 110.9 C30.8 112.9 30.6 117.8 30.2 120.2 C29.8 122.6 29.8 122.6 29.1 124.3 C28.4 126 27.1 127.9 26.5 129.8 C25.9 131.8 26.4 132.8 25.8 135.1 C25.3 137.4 23.8 141.2 23.3 142.7 C22.9 144.3 23.2 143.4 23.3 143.7 C23.4 144 23.7 144.2 24 144.3 C24.2 144.4 24.6 144.3 24.9 144.2 C25.2 144 24.9 144.9 25.7 143.3 C26.4 141.7 28.3 137.4 29 135.4 C29.7 133.5 28.9 134 29.6 132.6 C30.4 131.3 31.9 130 33 127.9 C34.2 125.7 35.7 123.2 36.2 120.7 C36.8 118.1 36 115.5 36.1 113.7 C36.2 111.9 36.9 111.5 36.8 110.7 C36.7 109.8 36.3 109.1 35.7 108.9 Z M30.1 110.6 C29.2 110.3 26.9 109.9 25.8 110 C24.7 110.1 25 108.9 23.9 111.2 C22.7 113.4 20.2 118.8 19.3 122.4 C18.4 126 19.1 128.4 18.8 131.2 C18.5 134 18 135.3 17.8 137.9 C17.6 140.5 17.7 143.9 17.7 145.6 C17.8 147.3 17.8 146.8 18.1 147.3 C18.4 147.9 19 148.3 19.5 148.5 C20 148.6 20.5 148.5 20.9 148.2 C21.4 147.8 21.2 149 22 146.7 C22.8 144.3 24.8 138.2 25.6 135.2 C26.4 132.2 25.7 131.9 26.4 129.8 C27 127.7 28.3 126.7 29.2 123.7 C30 120.8 30.8 115.7 31.1 113.5 C31.4 111.3 31.2 111.9 31 111.4 C30.8 110.9 31 110.8 30.1 110.6 Z"],
    ["Glutes", "M75.1 131 C73.7 130.1 72.5 130.8 71.2 131 C69.9 131.2 69.1 131.4 67.9 131.9 C66.7 132.5 65.4 133.2 64.3 134.2 C63.3 135.1 62.9 136.1 62.3 137.2 C61.7 138.4 61.2 139 61 140.6 C60.7 142.2 61 144.5 60.9 146 C60.7 147.5 60.2 147.8 60.1 148.8 C60 149.8 60.8 149.5 60.4 151.5 C59.9 153.5 58.2 158 57.8 160 C57.4 161.9 57.8 161.5 58.3 162.2 C58.7 162.8 59.7 163.3 60.4 163.6 C61 163.9 61.2 164.1 61.9 163.9 C62.7 163.7 63.2 162.8 64.3 162.7 C65.4 162.6 66.8 163.6 68 163.5 C69.3 163.3 69.8 162.3 71.3 162 C72.7 161.7 74.5 162.4 76.1 161.7 C77.7 161.1 79.3 162.6 80 158.3 L80 137.5 C79.8 133.5 79.6 137 78.7 135.9 C77.8 134.7 76.4 131.9 75.1 131 Z"],
    ["Abductors", "M71.4 118.7 C70.6 118.1 69.7 117.7 69 117.5 C68.4 117.3 69.2 116.9 67.7 117.5 C66.2 118.1 62.5 119.8 60.7 120.9 C58.9 122 58.3 122.6 57.6 123.5 C56.8 124.5 57 124 56.6 126 C56.1 128 55.3 132.5 55.1 134.5 C54.9 136.6 55 136.3 55.3 137.2 C55.6 138.2 56.3 139.2 56.8 139.7 C57.4 140.2 57.6 140.2 58.3 140.2 C59.1 140.1 59.8 140.6 60.9 139.5 C62 138.3 63 135.2 64.4 133.8 C65.8 132.4 67 132.1 68.6 131.5 C70.2 130.9 72.2 131.1 73.4 130.5 C74.6 130 74.8 129.1 75.2 128.5 C75.6 127.9 75.7 128.2 75.5 127.3 C75.4 126.4 74.8 124.7 74.4 123.5 C74 122.3 73.8 121.7 73.2 120.8 C72.7 119.9 72.1 119.3 71.4 118.7 Z"],
    ["Adductors", "M77.3 164.7 C77 164.8 76.6 164.2 76.3 165.7 C75.9 167.2 75.6 169.6 75.4 172.9 C75.1 176.2 75.3 180.2 74.8 184 C74.3 187.8 73.1 189.5 72.7 194 C72.2 198.5 72.2 206.1 72.2 209 C72.2 211.9 72.3 209.8 72.5 210.1 C72.7 210.4 73 210.7 73.4 210.6 C73.8 210.5 74.3 210.7 74.9 209.7 C75.4 208.7 75.7 207.9 76.3 205.1 C77 202.3 78 201.1 78.3 194.2 C78.7 187.2 78.4 171.5 78.4 166.3 C78.3 161 78.3 165.4 78.1 165.1 C77.9 164.8 77.7 164.6 77.3 164.7 Z"],
    ["Hamstrings", "M75.2 162 C74.2 162 71.7 162 70.6 162.4 C69.5 162.7 69.4 163.2 68.9 163.8 C68.5 164.4 68.3 163.5 68.2 165.6 C68 167.7 68.4 171 68.1 175.5 C67.7 179.9 65.7 186.7 66 190.2 C66.3 193.7 68.7 193.9 69.6 194.9 C70.4 195.9 70.4 195.5 70.8 195.6 C71.2 195.7 71.5 195.6 71.8 195.4 C72.1 195.2 71.9 196.6 72.4 194.6 C72.9 192.5 74.2 188 74.7 184 C75.2 180.1 74.9 176.5 75.3 172.8 C75.6 169 76.6 165.1 76.8 163.2 C77 161.4 76.6 162.7 76.4 162.4 C76.1 162.2 76.3 162 75.2 162 Z M65.7 163.3 C64.6 163.3 62.8 164 61.6 164.1 C60.4 164.1 59.7 163.4 58.9 163.5 C58.1 163.5 58.2 163.4 57.2 164.2 C56.3 165 54.8 166 53.5 168.1 C52.3 170.1 50.9 172.2 50.2 175.5 C49.5 178.7 49.6 183.1 49.7 186.1 C49.8 189.1 50.2 189.8 50.7 192.1 C51.2 194.5 51.9 197.4 52.6 199.1 C53.3 200.8 54 200.4 54.5 201.7 C55 203 55 205.3 55.4 206.5 C55.7 207.8 56 208.2 56.5 208.7 C56.9 209.3 56.9 209.8 57.9 209.7 C58.9 209.6 60.8 208.8 61.8 208.1 C62.8 207.4 62.4 211.9 63.5 206 C64.6 200.1 67.1 182.7 68 175.4 C68.8 168 68.1 167.2 68 165.1 C67.8 163.1 67.7 164.3 67.3 164 C66.9 163.6 66.7 163.3 65.7 163.3 Z M66.8 192.1 C66.4 192.3 66.1 191.6 65.5 193.6 C65 195.6 64 201 63.7 203.2 C63.4 205.3 63.6 204.7 63.7 205.4 C63.9 206.1 64.1 206.4 64.4 206.9 C64.8 207.3 64.7 207.6 65.8 208.1 C66.8 208.6 69.3 209.4 70.3 209.6 C71.2 209.7 70.8 209.3 71.1 209 C71.3 208.7 71.4 208.8 71.6 207.9 C71.7 206.9 72 205.6 72.1 203.7 C72.1 201.9 72.4 199.1 72 197.5 C71.6 196 70.4 196.2 69.7 195.4 C69 194.5 68.5 193.2 68 192.7 C67.5 192.1 67.2 192 66.8 192.1 Z"],
    ["Calves", "M61.2 209.7 C60.8 209.7 60.2 209.8 59.6 210.4 C59 210.9 58.3 211.6 57.7 212.7 C57.1 213.9 57.6 213.8 56.4 216.7 C55.1 219.5 52 225.8 50.8 228.6 C49.6 231.4 50 230.7 49.7 232.1 C49.5 233.4 49.3 234.8 49.2 236.2 C49.2 237.7 48.9 237.8 49.4 240.1 C50 242.3 51.4 246.8 52.2 248.9 C53 251 53.4 251.1 54 251.7 C54.6 252.3 54.3 252.5 55.3 252.5 C56.4 252.4 58.4 252 59.8 251.4 C61.2 250.9 62.3 250.1 63 249.5 C63.8 248.9 63.5 251.1 63.9 248.3 C64.2 245.4 64.8 237.9 64.9 233.6 C65 229.4 64.9 229 64.4 224.8 C63.9 220.6 62.6 213 62 210.3 C61.4 207.6 61.7 209.7 61.2 209.7 Z M66.9 208.8 C65.7 208.8 63.9 209.7 63.1 210.1 C62.3 210.5 62.3 209.3 62.4 211.2 C62.6 213 63.6 216.6 64 220.4 C64.5 224.1 64.9 227.4 65 232.1 C65 236.7 64.1 243.4 64.1 246.2 C64.1 249 64.3 247.1 64.9 247.6 C65.5 248 66.5 248.9 67.5 249 C68.4 249 69.4 248.7 70.1 247.9 C70.8 247 70.4 245.4 71.1 244.1 C71.8 242.9 73.5 242.3 74 240.8 C74.6 239.4 74.7 239.7 74.3 236.1 C73.9 232.5 72.2 225.1 71.7 220.9 C71.2 216.8 71.8 214.9 71.4 212.9 C71.1 211 70.6 210.9 69.8 210.2 C69 209.4 68.1 208.9 66.9 208.8 Z M55.3 253 C54.6 253.3 54.7 253.4 54.5 253.7 C54.3 254 54 253.3 54.3 254.7 C54.5 256.1 55.1 259.7 55.8 261.4 C56.5 263.1 57.2 263.2 58.3 264 C59.3 264.8 60.7 265.5 61.5 265.8 C62.3 266.1 62.5 266.1 62.8 265.8 C63.1 265.5 63.8 266.5 63.3 264.2 C62.9 261.9 61.1 255.2 60.3 253 C59.4 250.8 59.3 252.1 58.5 252 C57.6 252 56 252.7 55.3 253 Z M72.6 243.5 C72.2 243.5 71.6 243.5 71.2 244.1 C70.9 244.8 70.9 246.4 70.6 247.1 C70.4 247.9 70.3 247.9 69.8 248.3 C69.2 248.6 68.5 249 67.7 249.1 C66.9 249.2 65.8 248.6 65.2 248.7 C64.6 248.7 64.5 249 64.4 249.3 C64.3 249.7 64.3 249.9 64.8 250.5 C65.4 251.1 67 251 67.4 252.9 C67.9 254.8 67.1 259.2 67.3 260.9 C67.4 262.5 67.7 262 68.1 262.2 C68.4 262.4 68.8 262.2 69.2 261.9 C69.6 261.7 69.6 262.4 70.3 260.8 C70.9 259.1 72.3 255.8 72.9 253 C73.4 250.2 73.4 246.7 73.4 245.1 C73.5 243.5 73.3 244.3 73.2 244 C73 243.7 72.9 243.4 72.6 243.5 Z"]
  ]
};
function bodySvg(side, m) {
  const mir = d0 => { const d = side === 'front' ? legStretch(d0) : d0; return '<path d="' + d + '"/><path d="' + d + '" transform="translate(160 0) scale(-1 1)"/>'; };
  return '<svg viewBox="0 0 160 314" class="bsvg" role="img" aria-label="' + side + ' view">' +
    '<g transform="translate(0 ' + ((side === 'back' ? 5 : 0) - FIG_UP) + ')">' + '<path d="' + (side === 'back' ? BODY_SIL_B2 : legStretch(BODY_SIL)) + '" fill="#262a30" stroke="#6f7680" stroke-width="0.9" stroke-linejoin="round"/>' +
    BODY[side].map(([r, d]) => r[0] === '_' ? '<g fill="#2b2f36" stroke="#5c636d" stroke-width="0.6" stroke-linejoin="round">' + mir(d) + '</g>' : '<g data-g="r_' + r + '" fill="' + PCOL[pBand(m['r_' + r] ? m['r_' + r].n : 0)] + '" stroke="#9aa1ab" stroke-width="0.7" stroke-opacity="0.85" stroke-linejoin="round">' + mir(d) + '</g>').join('') + '</g>' +
    '<text x="80" y="311" text-anchor="middle" font-size="9" fill="#9aa0a6">' + (side === 'front' ? 'Front' : 'Back') + '</text></svg>';
}
const fmtSets = n => (Math.round(n * 2) / 2).toString();
let progOff = 0;
// Oldest week with a logged set (week arrows stop there).
function progMinOff() {
  const ds = viewRows().map(r => r.date).filter(Boolean).sort(); if (!ds.length) return 0;
  const a = new Date(mondayOf(ds[0]) + 'T12:00:00'), b = new Date(mondayOf(S.today) + 'T12:00:00');
  return Math.min(0, Math.round((a - b) / (7 * 864e5)));
}
function openProg(off) {
  if (!S) return;
  const nav = typeof off === 'number', reopen = nav && $('prog').classList.contains('open');
  progOff = Math.max(progMinOff(), Math.min(0, nav ? off : 0));
  const w = weekSets(progOff), d = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  $('pgh').innerHTML = '<span class="pgnav"><button type="button" id="pgprev" aria-label="Previous week"' + (progOff <= progMinOff() ? ' disabled' : '') + '>&#8249;</button>' +
    '<span>Weekly sets: ' + esc(d(w.mon) + ' to ' + d(w.sun)) + (progOff ? '' : ' (this week)') + '</span>' +
    '<button type="button" id="pgnext" aria-label="Next week"' + (progOff >= 0 ? ' disabled' : '') + '>&#8250;</button></span>';
  $('pgprev').onclick = e => { e.stopPropagation(); openProg(progOff - 1); };
  $('pgnext').onclick = e => { e.stopPropagation(); openProg(progOff + 1); };
  $('pgb').innerHTML = '<div class="bmap">' + bodySvg('front', w.m) + bodySvg('back', w.m) + '</div>' +
    phaseLegend() + // v89: bracket marks 10-19 as the target band

    '<div class="s2">Hard sets logged ' + (progOff ? 'that week' : 'this week') + ' (Mon to Sun). Main muscle counts 1 set, each other listed muscle 0.5. Regions use the same rule. Tap a muscle.</div><div id="pgd"></div>' +
    '<div class="plist">' + (() => { const card = g => { const subs = (window.CoachRegions || []).filter(r => r[2] === g && !(r[0] === g && (window.CoachRegions || []).filter(x => x[2] === g).length === 1)).slice().sort((a, b) => String(a[1]).localeCompare(String(b[1]))); // v98: alphabetical
      return '<div class="pgrp"><button type="button" class="prow" data-g="' + g + '"><span>' + g + '</span><b>' + fmtSets(w.m[g].n) + '</b></button>' + subs.map(r => '<button type="button" class="prow psub" data-g="r_' + r[0] + '"><span>' + esc(r[1]) + '</span><b>' + fmtSets(w.m['r_' + r[0]].n) + '</b></button>').join('') + '</div>'; }; // v91: grouped under section headings, layout only
    const H = (t, c) => '<div class="phd' + (c ? ' ' + c : '') + '">' + t + '</div>', has = g => (window.CoachMG || []).includes(g), cs = gs => gs.filter(has).map(card).join('');
    const sec = (t, gs) => '<div class="pcol">' + H(t) + cs(gs) + '</div>', row = (a, b) => '<div class="pcols">' + a + (b || '<div class="pcol"></div>') + '</div>'; // v98: sections A to Z, two per row
    return H('Upper body', 'phd1') + row(sec('Arms', ['Biceps', 'Forearms', 'Triceps']), sec('Back', ['Back'])) + row(sec('Chest', ['Chest']), sec('Shoulders', ['Shoulders'])) + row(sec('Traps', ['Traps'])) + // v99: Upper body / Lower body headings restored
      H('Legs', 'phd1') + (() => { const gl = has('Glutes') ? card('Glutes').replace(/ \((adductors|abductors)\)</g, '<') : '', k = gl.split('<button').length > 4 ? gl.lastIndexOf('<button') : gl.length; /* v105: balance Legs by height, the tall Glutes card flows from the bottom of the left column to the top of the right */
        return row('<div class="pcol">' + cs(['Calves']) + gl.slice(0, k) + (k < gl.length ? '</div>' : '') + '</div>', '<div class="pcol">' + (k < gl.length ? '<div class="pgrp">' + gl.slice(k) : '') + cs(['Hamstrings', 'Quads']) + '</div>').replace('class="pcols"', 'class="pcols plegs"'); })() + H('Core', 'phd1') + (has('Abs') ? ['<button type="button" class="prow" data-g="Abs"><span>Abs</span><b>' + fmtSets(w.m.Abs.n) + '</b></button>'].concat((window.CoachRegions || []).filter(r => r[2] === 'Abs' && w.m['r_' + r[0]]).sort((a, b) => a[1].localeCompare(b[1])).map(r => '<button type="button" class="prow psub" data-g="r_' + r[0] + '"><span>' + esc(r[1]) + '</span><b>' + fmtSets(w.m['r_' + r[0]].n) + '</b></button>')).map(b => '<div class="pgrp">' + b + '</div>').join('') : '') + // v103: core rows spread over both columns
      // v102: Legs then Core as main headings, cards fill both columns
      // v101: Legs is its own main heading
      // v100: Traps moved to Upper body
     
      cs((window.CoachMG || []).filter(g => !['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Abs','Traps'].includes(g))); })() + '</div>';
  progW = w; if (reopen) return; $('prog').classList.add('open');
  const close = () => $('prog').classList.remove('open');
  if (layerOpen('wm')) swapLayer('wm', 'prog', close); else pushLayer('prog', close);
}
let progW = null;
function progDetail(g) {
  const e = progW && progW.m[g]; if (!e) return;
  const ex = Object.entries(e.ex).sort((a, b) => b[1] - a[1]);
  const rg = (window.CoachRegions || []).find(r => 'r_' + r[0] === g), lbl = rg ? rg[1] + ' (' + rg[2] + ')' : g;
  $('pgd').innerHTML = '<div class="pdet"><b>' + esc(lbl) + ': ' + fmtSets(e.n) + (e.n === 1 ? ' set' : ' sets') + '</b>' + (ex.length ? '<br>' + ex.map(([n, v]) => esc(n) + ' ' + fmtSets(v)).join('<br>') : '<br><span class="s2">Nothing logged ' + (progOff ? 'that week' : 'this week') + '.</span>') + '</div>';
  document.querySelectorAll('#prog [data-g]').forEach(el => el.classList.toggle('psel', el.dataset.g === g));
}
const closeProg = () => { if (!$('prog').classList.contains('open')) return; $('prog').classList.remove('open'); popLayer('prog'); };
$('pgclose').onclick = closeProg;
$('prog').addEventListener('click', e => { if (e.target.id === 'prog') return closeProg(); const g = e.target.closest('[data-g]'); if (g) progDetail(g.dataset.g); });

function openDel() {
  $('wmh').textContent = 'Delete exercise';
  $('wml').innerHTML = cardsFor().map((ex, i) => '<button class="btn sec wmi" data-del="' + i + '">' + esc(ex.canonical) + '</button>').join('');
  $('wmw').classList.add('open'); pushLayer('wm', () => $('wmw').classList.remove('open'));
}
function delExercise(ex) {
  $('delh').textContent = 'Delete ' + ex.canonical + '?'; delPending = ex;
  $('delw').classList.add('open'); swapLayer('menu', 'del', () => { $('delw').classList.remove('open'); delPending = null; });
}
let delPending = null;
const closeDel = () => { if (!$('delw').classList.contains('open')) return; $('delw').classList.remove('open'); delPending = null; popLayer('del'); };
$('delx').onclick = closeDel; $('deln').onclick = closeDel;
$('delw').addEventListener('click', e => { if (e.target.id === 'delw') closeDel(); });
$('dely').onclick = () => { const ex = delPending; closeDel(); if (ex) doDelete(ex); };
function doDelete(ex, scope) {
  try {
    const only = scope === 'workout' ? viewId : '', ent = Object.assign({ name: slotOf(ex), shown: ex.canonical, from: viewId, at: new Date().toISOString() }, only ? { only } : {});
    if (!putJSON('deletes', delKey(slotOf(ex), only), ent, { what: 'removal' })) return; // the row is new or replaces the same removal; the legacy list cell is never overwritten
    if (!jsonRecover(getSetting('deletes', delPrefix())).ok) console.warn('legacy removals cell is damaged; complete entries recovered');
    swapMemo = {}; sig = ''; applyState(S, true);
    toast('Removed ' + ex.canonical + (scope === 'workout' ? ' from this workout' : ' for the rest of Block ' + blockOf(viewWeek())) + (rowsFor(ex, true).length ? '. Its logged sets today stay on the card.' : ''), 6000);
  } catch (e) { toast('Could not delete: ' + (e && e.message || e), 6000); }
}
const closeWm = () => { $('wmw').classList.remove('open'); popLayer('wm'); };
$('wmenu').onclick = openWm; $('wmclose').onclick = closeWm;
$('wmw').addEventListener('click', e => {
  if (e.target.id === 'wmw') return closeWm();
  const d = e.target.closest('[data-del]'); if (d) { const ex = cardsFor()[+d.dataset.del]; closeWm(); if (ex) setTimeout(() => removeEx(ex), 60); return; }
  const b = e.target.closest('[data-wi]'); if (!b || b.disabled) return;
  const it = wmItems()[+b.dataset.wi]; closeWm(); if (it && it.on) setTimeout(it.run, 60);
});
function calDay() { const d = String(new Date().getDate()), e = $('calday'); if (e && e.textContent !== d) e.textContent = d; }
calDay(); setInterval(calDay, 30000); document.addEventListener('visibilitychange', calDay); window.addEventListener('focus', calDay); $('calclose').onclick = closeCal;
$('calw').addEventListener('click', e => {
  if (e.target.id === 'calw') return closeCal();
  const wc = e.target.closest('td[data-w]'); if (!wc) return;
  if (!canOpen(wc.dataset.w)) return toast('Finish or skip ' + wLabel(loggableId()) + ' first. Workouts go in order.', 4000);
  closeCal(); openWorkout(wc.dataset.w);
});
$('prof').onchange = e => { P = e.target.value; LS.setItem('coach_p', P); dayKey = null; viewId = null; sig = ''; S = null; firstRender = true; load(true); };

// ---------- Settings ----------
function hideSettings(fromPop) { if (S) { $('settings').style.display = 'none'; $('app').style.display = 'block'; tick(); } if (!fromPop) popLayer('settings'); }
function showSettings(msg) {
  if (S) pushLayer('settings', () => hideSettings(true));
  $('app').style.display = 'none'; $('settings').style.display = 'block'; $('timer').style.display = 'none';
  $('su').value = U; $('sk').value = K; $('stest').checked = testOn(); $('smsg').textContent = msg || '';
  $('stripbox').style.display = S ? 'block' : 'none'; if (S) gymsRender(); $('sphasebox').style.display = S ? 'block' : 'none'; if (S) phaseRender();
  $('sbw').value = S ? (bodyweight() || '') : ''; $('sbws').textContent = S ? bwSrcText() + '. A newer MyFitnessPal weigh-in replaces an edit only if it is dated after the edit.' : '';
}
$('gear').onclick = () => showSettings();
function phaseRender() { const c = phase(); $('sphase').querySelectorAll('[data-ph]').forEach(b => { b.classList.toggle('on', b.dataset.ph === c); b.setAttribute('aria-pressed', b.dataset.ph === c ? 'true' : 'false'); }); }
$('sphase').onclick = e => { const b = e.target.closest('[data-ph]'); if (!b || !S || b.dataset.ph === phase()) return; putSetting('profile', 'phase', b.dataset.ph); phaseRender(); flush(); toast('Training phase: ' + PHASES[b.dataset.ph].name); };
$('stest').onchange = async e => {
  if (e.target.checked) { LS.setItem('coach_test', '1'); toast('Test mode on'); }
  else {
    if (!(await askBox({ title: 'Turn off test mode?', body: 'All test sets are discarded.', ok: 'Turn off', danger: true }))) { e.target.checked = true; return; }
    LS.removeItem('coach_test'); LS.removeItem('coach_testq'); LS.removeItem('coach_settings_test_' + P); LS.removeItem('coach_wstart_test_' + P); LS.removeItem(TKEY()); setRQ(getRQ().filter(x => !x.test)); toast('Test mode off, test data discarded');
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
    if (bw > 0 && bw !== bodyweight()) { putSetting('profile', 'bodyweight', String(bw)); putSetting('profile', 'bodyweight_src', 'manual'); putSetting('profile', 'bodyweight_date', S.today || new Date().toISOString().slice(0, 10)); }
    sig = ''; applyState(S, false); toast('Connected'); flush();
  }
  catch (e) { $('smsg').textContent = 'Could not reach it: ' + e.message; }
};
$('scancel').onclick = () => hideSettings();
// Gyms list (Settings): tap a gym to edit its name and icon or delete it; Create adds one.
let gEdit = null, gIcon = '';
function gymsRender() {
  const gl = gymList(), pk = gymPick();
  $('glist').innerHTML = gl.map(g => '<button type="button" class="gitem" data-gid="' + esc(g.id) + '"><span class="gic">' + esc(g.icon || '🏋️') + '</span><span class="gnm">' + esc(g.name) + '</span>' + (g.id === 'home' ? '<span class="gtag">Home</span>' : '') + (g.id === pk ? '<span class="gtag on">Today</span>' : '') + '<span class="ed">edit</span></button>').join('') || '<div class="sub">No gyms yet.</div>';
}
$('glist').onclick = e => { const b = e.target.closest('[data-gid]'); if (b) openGym(b.dataset.gid); };
$('gnew').onclick = () => openGym(null);
function openGym(id) {
  const g = id ? gymById(id) : null; gEdit = id; gIcon = g ? (g.icon || GYM_ICONS[0]) : GYM_ICONS[0];
  $('gedh').textContent = g ? 'Edit gym' : 'Create gym'; $('gedn').value = g ? g.name : '';
  $('gedi').innerHTML = GYM_ICONS.map(ic => '<button type="button" data-ic="' + ic + '" class="' + (ic === gIcon ? 'on' : '') + '">' + ic + '</button>').join('');
  $('gedd').style.display = g && id !== 'home' ? 'block' : 'none';
  $('gedhint').textContent = id === 'home' ? 'This is your home gym. It can be renamed but not deleted.' : g ? 'Deleting a gym only removes it from this list. Sets logged there are kept.' : '';
  $('gedw').classList.add('open'); pushLayer('ged', () => $('gedw').classList.remove('open'));
}
// v110: Modify gym from the workout menu. Changeable while the viewed workout has no logged sets (gym_day:<viewId>); locked after.
let gPickFor = null;
function openGymPick() {
  const locked = workoutRows().length > 0, cur = viewGymName(), pk = gymPick();
  $('gpkt').textContent = locked ? 'Current gym: ' + cur + '. Locked because this workout already has logged sets.' : 'Current gym: ' + cur + '. Pick the gym for ' + wLabel(viewId) + '.';
  // v112: every row has an edit link that opens the same Settings gym editor (openGym); switching stays locked once sets are logged
  $('gpkl').innerHTML = gymList().map(g => '<div class="gitem"' + (locked ? '' : ' data-pg="' + esc(g.id) + '"') + '><span class="gic">' + esc(g.icon || '🏋️') + '</span><span class="gnm">' + esc(g.name) + '</span>' + (g.id === pk ? '<span class="gtag on">Current</span>' : '') + '<span class="ed" data-pe="' + esc(g.id) + '" role="button">edit</span></div>').join('');
  $('gpkn').style.display = locked ? 'none' : '';
  $('gpkw').classList.add('open'); pushLayer('gpk', () => $('gpkw').classList.remove('open'));
}
const gpkClose = () => { $('gpkw').classList.remove('open'); popLayer('gpk'); };
function setWorkoutGym(id) {
  if (workoutRows().length || !gymById(id)) return;
  putSetting('profile', 'gym_day:' + (viewId || todayWid()), id); putSetting('profile', 'gym_last', id);
  sig = ''; applyState(S, false); const g = gymById(id); toast('Gym for this workout: ' + (g ? g.name : 'home gym'), 3000);
}
$('gpkx').onclick = gpkClose;
let gBackPick = false; // v112: reopen the Modify gym picker after the shared editor closes
$('gpkl').onclick = e => {
  const ed = e.target.closest('[data-pe]'); if (ed) { gpkClose(); gBackPick = true; openGym(ed.dataset.pe); return; }
  const b = e.target.closest('[data-pg]'); if (!b) return; gpkClose();
  if (b.dataset.pg === gymPick()) return; // same gym: close silently, no toast
  setWorkoutGym(b.dataset.pg);
};
$('gpkn').onclick = () => { gpkClose(); gPickFor = viewId; gBackPick = false; openGym(null); };
function gedBack() { if (gBackPick) { gBackPick = false; if (S) openGymPick(); } }
const gedClose = () => { $('gedw').classList.remove('open'); popLayer('ged'); setTimeout(gedBack, 0); };
$('gedi').onclick = e => { const b = e.target.closest('[data-ic]'); if (!b) return; gIcon = b.dataset.ic; $('gedi').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
$('gedx').onclick = () => { gPickFor = null; gedClose(); }; $('gedc').onclick = () => { gPickFor = null; gedClose(); };
$('geds').onclick = () => {
  const n = $('gedn').value.trim().replace(/[\[\]|]/g, '').slice(0, 40); if (!n) { $('gedn').focus(); return; }
  const gl = gymList(), nid = gl.some(g => g.id === 'home') ? 'g' + Date.now().toString(36) : 'home'; if (gEdit) { const g = gl.find(x => x.id === gEdit); if (g) { g.name = n; g.icon = gIcon; } } else gl.push({ id: nid, name: n, icon: gIcon });
  saveGyms(gl); gedClose(); gymsRender(); sig = ''; if (!gEdit && gPickFor && gPickFor === viewId) setWorkoutGym(nid); gPickFor = null; toast(gEdit ? 'Gym saved' : n + ' created', 3000);
};
$('gedd').onclick = () => { const g = gymById(gEdit); if (!g) return; $('gdelh').textContent = 'Delete ' + g.name + '?'; $('gdelw').classList.add('open'); pushLayer('gdel', () => $('gdelw').classList.remove('open')); };
const gdelClose = () => { $('gdelw').classList.remove('open'); popLayer('gdel'); };
$('gdeln').onclick = gdelClose; $('gdelx').onclick = gdelClose;
$('gdely').onclick = () => { const g = gymById(gEdit); gdelClose(); if (!g || g.id === 'home') return; const nm = gymNames(); nm[g.id] = g.name; putJSON('profile', 'gym_names', nm, { what: 'gym names' }); saveGyms(gymList().filter(x => x.id !== g.id)); if (getSetting('profile', 'gym_last') === g.id) putSetting('profile', 'gym_last', 'home'); gedClose(); gymsRender(); sig = ''; toast(g.name + ' deleted. Its logged sets are kept.'); };

// ---------- Rest timer ----------
// Target depends on what comes next: same muscle = that exercise's normal rest, different muscle = 75 s.
const SWITCH_REST = 75;
const TKEY = () => 'coach_timer_' + P;
const getT = () => jget(TKEY(), null);
function setT(t) { if (t) jset(TKEY(), t); else LS.removeItem(TKEY()); tick(); markActive(); restNotify(t); }
// Rest notification: 'Rest ends at h:mm' when a rest starts (or its target changes); best-effort 'Rest is over' at the end.
let notifKey = '', notifTimer = null;
const swPost = m => { try { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage(m); } catch (e) {} };
// v86: ask for notification permission on a real tap (Start workout), which Android Chrome needs to show the prompt.
function askNotifyOnTap() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (e) {} }
function restNotify(t) {
  try {
    if (!t || t.hidden || t.firstSide) { swPost({ type: 'restCancel' }); notifKey = ''; }
    if (!t || t.hidden || t.firstSide || !('Notification' in window) || !navigator.serviceWorker) return;
    const end = t.start + (t.target || 0) * 1000, key = t.start + '|' + t.target;
    if (key === notifKey || end <= Date.now()) return; notifKey = key;
    const go = () => {
      if (Notification.permission !== 'granted') return;
      const at = new Date(end).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(t.exercise || 'Rest', { tag: 'coach-rest', body: 'Rest ends ' + at + (t.next ? ' · ' + t.next : ''), silent: true, renotify: false, icon: 'icon-192.png' }).catch(() => {});
        clearTimeout(notifTimer);
        const over = { tag: 'coach-rest', body: 'Rest is over. ' + (t.next || ''), renotify: true, vibrate: [200, 100, 200], icon: 'icon-192.png' };
        const warn = { tag: 'coach-rest', body: '10 seconds left. ' + (t.next || ''), renotify: true, vibrate: [300, 150, 300, 150, 300], icon: 'icon-192.png', requireInteraction: false };
        // v86: the service worker holds both alerts (10 s warning with vibration, then rest over), so they still fire when the page is in the background or the screen is off. Page timer only as a fallback.
        if (navigator.serviceWorker.controller) { swPost({ type: 'rest', key, warnAt: end - 10000, endAt: end, warnTitle: 'Rest: 10 seconds', warn, overTitle: 'Rest is over', over }); return; }
        notifTimer = setTimeout(() => { const c = getT(); if (c && c.start === t.start && !c.hidden) reg.showNotification('Rest is over', over).catch(() => {}); }, end - Date.now());
      }).catch(() => {});
    };
    if (Notification.permission === 'default') Notification.requestPermission().then(go, () => {}); else go();
  } catch (e) {}
}
function nextTarget(name) {
  const ex = exFor(name); if (!ex) return { target: 120, next: '' };
  const normal = ex.note.rest_target_sec || 120;
  const list = cardsFor(), idx = list.indexOf(ex);
  const done = idx >= 0 ? rowsFor(ex, true).length : 0;
  if (idx < 0 || done < plannedCount(ex)) return { target: normal, next: idx < 0 ? '' : 'next: ' + ex.canonical + ' set ' + (done + 1) };
  const nx = nextUp(ex);
  if (!nx) return { target: normal, next: 'last exercise done', last: true }; // v86: no rest timer after the final set; Finish workout is offered instead
  if (nx.rest_muscle && nx.rest_muscle === ex.rest_muscle) return { target: nx.note.rest_target_sec || normal, next: 'next: ' + nx.canonical + ' (same muscle)' };
  return { target: SWITCH_REST, next: 'next: ' + nx.canonical + ' (new muscle)' };
}
const TIMER_MAX = 3600 * 1000; // older than 60 min: no rest timer
function recentLast() {
  const rs = viewRows(true).filter(r => r.logged_at && Date.now() - tsOf(r) < TIMER_MAX);
  return rs.length ? rs[rs.length - 1] : null;
}
function syncTimer() {
  const last = recentLast();
  if (!last) { const t = getT(); if (t && !t.firstSide && Date.now() - t.start > TIMER_MAX) setT(null); return; }
  const ts = tsOf(last), t = getT();
  if (!t || (ts > t.start + 5000 && !t.firstSide && !formEx)) { const nt = nextTarget(last.exercise); setT({ start: ts, exercise: last.exercise, target: nt.target, next: nt.next, hidden: !!finishedToday() || !!nt.last }); }
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
function muteLbl() { const off = LS.getItem('coach_mute') === '1', b = $('tmute'), l = off ? 'Sound is off' : 'Sound is on'; b.classList.toggle('off', off); b.setAttribute('aria-label', l); b.title = l; }
$('tmute').onclick = () => { LS.setItem('coach_mute', LS.getItem('coach_mute') === '1' ? '0' : '1'); muteLbl(); audio(); };
muteLbl();
let thPx = -1;
function timerBar(on) { // reserve space so the fixed top timer never covers the header or the log popup
  const h = on ? $('timer').offsetHeight : 0;
  if (h !== thPx) { thPx = h; document.documentElement.style.setProperty('--th', h + 'px'); document.body.classList.toggle('timer-on', !!h); }
}
// v116: 'next: X set 3' -> 'Next: X, set 3'; '(new muscle)' kept short.
function nextLine(n) { n = String(n || ''); if (!n) return ''; return n.replace(/^next: /, 'Next: ').replace(/ set (\d+)$/, ', set $1').replace(/^last exercise done$/, 'Last exercise done'); }
// v117: one always-pinned top bar. No timer: workout name and week, plus workout menu and settings. Timer: the same bar shows the rest timer.
function placeBtns() { const d = $('tslot'); if ($('wmenu').parentNode !== d) { d.appendChild($('wmenu')); d.appendChild($('gear')); } }
function idleBar() {
  const s = $('sub').textContent || '', m = s.match(/^(Week \d+)\s*-\s*(.*)$/), rest = m ? m[2] : s;
  $('tname').textContent = rest.replace(/\s*\(about[^)]*\)\s*$/, '').replace(/\s+at\s+.*$/, '') || 'Coach';
  $('twk').textContent = m ? m[1] + (/\sat\s(.+?)(\s*\(|$)/.test(rest) ? ' at ' + rest.match(/\sat\s(.+?)(\s*\(|$)/)[1] : '') : '';
}
function tick() {
  const t = getT(), el = $('timer');
  if ($('app').style.display === 'none') { el.style.display = 'none'; timerBar(false); return; }
  el.style.display = 'block'; placeBtns();
  const sec = t ? (Date.now() - t.start) / 1000 : 0;
  if (t && sec * 1000 > TIMER_MAX) LS.removeItem(TKEY());
  if (!t || t.hidden || sec * 1000 > TIMER_MAX) { idleBar(); el.className = 'idle'; timerBar(true); return; }
  timerBar(true); $('tt').textContent = fmt(sec); $('ttg').textContent = fmt(t.target);
  $('tex').textContent = t.firstSide ? 'Since first side of ' + t.exercise : nextLine(t.next);
  const left = t.target - sec, whole = Math.floor(sec), fl = left > 0 && left <= 10 ? ' flash' : '';
  el.className = (sec <= t.target ? 'under' : 'over') + fl;
  const fs = $('ftimer'); if (fs) { fs.textContent = 'Rest ' + fmt(sec) + ' / ' + fmt(t.target); fs.className = (sec <= t.target ? 'under' : 'over') + fl; }
  if (left > 0 && left <= 10 && whole !== lastBeep && document.visibilityState === 'visible') { lastBeep = whole; beep(left <= 1); if (navigator.vibrate) { try { navigator.vibrate(left <= 1 ? 400 : 80); } catch (e) {} } }
}
setInterval(tick, 250);
function markActive() { const t = getT(); cardsFor().forEach((ex, i) => { const c = $('c' + i); if (c) c.classList.toggle('active', !!t && !t.hidden && P_.norm(ex.canonical) === P_.norm(t.exercise)); }); }
$('tclear').onclick = () => { const t = getT(); if (t) { t.hidden = true; setT(t); } };
$('tundo').onclick = () => {
  const today = viewRows().filter(r => r.date === S.today);
  if (!today.length) return toast('Nothing logged today');
  deleteSet(today[today.length - 1].set_id, true);
};
async function deleteSet(sid, ask) {
  const r = viewRows(true).find(x => x.set_id === sid); if (!r) return;
  if (ask && !(await askBox({ title: 'Remove this set?', body: r.exercise + ' ' + setTxt(r), ok: 'Remove', danger: true }))) return;
  const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === sid);
  if (pi >= 0) { q.splice(pi, 1); setQ(q.filter(x => !(x.action === 'edit' && x.set_id === sid))); }
  else { setQ(q.filter(x => !(x.action === 'edit' && x.set_id === sid))); enqueue({ action: 'undo', set_id: sid }); }
  const t = getT();
  if (t && !t.firstSide) {
    const l = recentLast();
    if (l) { const nt = nextTarget(l.exercise); setT({ start: tsOf(l), exercise: l.exercise, target: nt.target, next: nt.next, hidden: !!nt.last }); } else setT(null);
  }
  update();
}

// ---------- Set done / log form ----------
const ffSel = $('ff');
const FT_OPTS = FT.filter(v => v !== 'drop set');
const ftOptions = (extra, noMyo) => { ffSel.innerHTML = FT_OPTS.filter(v => !(noMyo && v === 'myo-reps')).concat(extra ? [extra] : []).map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v] || v) + '</option>').join(''); };
ffSel.innerHTML = FT.map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v]) + '</option>').join('');
let editId = null, doneTs = 0, drops = 0, prevRest = null;
// Mini-sets after the opener (myo-reps / myo-rep match): stored as a '[mini N]' token at the end of notes (no new column, works with Code.gs v4).
const MINI_RE = /\s*\[mini (\d+)\]\s*$/i;
const miniOf = r => { const m = MINI_RE.exec((r && r.notes) || ''); return m ? +m[1] : 0; };
const noteTxt = r => String((r && r.notes) || '').replace(MINI_RE, '');
let minis = 0, formSetIdx = 0;
function setMini(n, keep) { minis = Math.max(0, Math.min(9, n | 0)); $('fmv').textContent = String(minis); if (minis && !keep && drops) setDrops(0, true); exclUI(); }
// Last set: myo-reps (mini-sets) or a drop set, never both. Picking one clears the other.
function exclUI() { const both = $('fmini').style.display !== 'none' && $('fdwrap').style.display !== 'none'; $('fxhint').style.display = both ? 'block' : 'none'; $('fdwrap').classList.toggle('dim', both && minis > 0); $('fmini').classList.toggle('dim', both && drops > 0); $('fxhint').textContent = !both ? '' : minis > 0 ? 'Myo-reps on. Tap + on drop sets to switch to a drop set.' : drops > 0 ? 'Drop set on. Tap + on mini-sets to switch to myo-reps.' : 'Pick one: drop sets or myo-rep mini-sets.'; }
function setKeys(ex, i, n) { const tq = ex ? techFor(ex) : null; return tq ? tqShow(tq, i, n) : []; }
function formLast() { const ex = formEx; if (!ex) return false; const n = Math.max(plannedCount(ex), rowsFor(ex, true).length + (editId ? 0 : 1)); return formSetIdx >= n - 1; }
function miniUI() { const ex = formEx, last = formLast(), mrm = !!ex && methodOf(ex) === 'match'; const on = !!ex && !isStretch(ex) && (minis > 0 || (mrm ? formSetIdx >= 1 : last)); $('fmini').style.display = on ? '' : 'none'; const dOn = !!ex && !isStretch(ex) && !mrm && (last || drops > 0); $('fdwrap').style.display = dOn ? '' : 'none'; if (!dOn && drops) setDrops(0, true); exclUI(); mrmUI(); }
// v80: myo-rep match offers. Programmed exercise: 'Make this a myo-rep match' on set 1 only while nothing is logged for it today.
// Added (non-programmed) exercise: 'Set as myo-rep match' on set 1, then how many matching sets followed; they are filled in on save.
let mrmAdd = false, mrmN = 2;
$('fmrmb').onclick = () => { const ex = formEx; if (!ex) return; const sl = ex.base ? ex.base.canonical : ex.canonical; putSetting(sl, 'method:' + viewId, 'match'); sig = ''; toast('Myo-rep match on. Set 1 is a normal set; later sets match its reps.', 5000); miniUI(); };
$('fmrmc').onchange = e => { mrmAdd = e.target.checked; mrmUI(); };
$('fmrmm').onclick = () => { mrmN = Math.max(1, mrmN - 1); mrmUI(); }; $('fmrmp').onclick = () => { mrmN = Math.min(6, mrmN + 1); mrmUI(); };
function mrmUI() {
  const ex = formEx, w = $('fmrmw'); if (!w) return;
  const can = !!ex && !editId && !isStretch(ex) && warmNext == null && ffSel.value !== 'warm-up' && formSetIdx === 0 && !rowsFor(ex, true).length && methodOf(ex) !== 'match' && canLog();
  w.style.display = can ? '' : 'none'; if (!can) { mrmAdd = false; return; }
  $('fmrmb').style.display = ex.added ? 'none' : ''; $('fmrma').style.display = ex.added ? '' : 'none';
  $('fmrmc').checked = mrmAdd; $('fmrmn').style.display = mrmAdd ? '' : 'none'; $('fmrmv').textContent = String(mrmN);
}
function setDrops(n, keep) { n = Math.max(0, Math.min(9, n | 0)); drops = n; $('fdv').textContent = String(n); if (n && !keep && minis) setMini(0, true); if (n && ffSel.value === 'myo-reps' && !keep) ffSel.value = FT_OPTS.includes('true') ? 'true' : ffSel.value; exclUI(); }
$('fdm').onclick = () => setDrops(drops - 1); $('fdp').onclick = () => setDrops(drops + 1);
$('fmm').onclick = () => setMini(minis - 1); $('fmp').onclick = () => setMini(minis + 1);
ffSel.addEventListener('change', miniUI);
let rowPrefill = null, warmNext = null;
// Tap a suggested weight/reps value: same as the LOG check, then focus that field (synchronously, so the phone keyboard opens).
function tapValue(name, idx, f) {
  try {
    const list = cardsFor(), i = list.findIndex(x => x.canonical === name); if (i < 0) return;
    const ex = list[i], st = isStretch(ex); let t;
    logRow(name, idx);
    if (!$('sheet').classList.contains('open')) return;
    const id = f === 'w' ? (st ? (ex.single ? 'fangl' : 'fang') : 'fl') : f === 'R' ? 'frr' : f === 'L' ? 'frl' : 'fr';
    const el = $(id); if (el) { el.focus({ preventScroll: true }); try { el.select(); } catch (e) {} }
  } catch (e) { console.warn('tapValue', e); }
}
function logRow(name, idx, li) {
  const list = cardsFor(), i = list.findIndex(x => x.canonical === name); if (i < 0) return;
  rowPrefill = null;
  setDone(i);
}
function setDone(i) {
  if (!canLog()) return msgPop('Skip the previous workout first.');
  audio(); // unlock audio on a user tap (needed on iPhone and Chrome)
  const ex = cardsFor()[i], now = Date.now(), t = getT();
  const same = t && P_.norm(t.exercise) === P_.norm(ex.canonical);
  restSnap = t && !t.hidden && !t.firstSide ? Object.assign({}, t) : null; // kept so Cancel can put the running rest back untouched
  if (isStretch(ex)) { prevRest = t && !t.hidden ? (now - t.start) / 1000 : null; if (t && !t.hidden) { t.hidden = true; setT(t); } openForm(i, now); return; }
  // Single-arm lifts log like any set: one tap opens the form with both sides' reps (no half-step or between-sides timer).
  let ts = now;
  if (same && t.firstSide) { ts = t.start; prevRest = t.prevRest; } // a side timer left over from v75 or older
  else {
    prevRest = t && !t.hidden ? (now - t.start) / 1000 : null;
    if (t && !t.hidden) { t.hidden = true; t.firstSide = false; setT(t); } // a new set's log window ends the running rest; the next rest starts when this set is saved
  }
  openForm(i, ts);
}
function bwLine() {
  if (!formEx || !formEx.bodyweight) return;
  const bw = bodyweight(), add = parseFloat($('fl').value) || 0;
  $('fbw').textContent = bw ? 'Total load: ' + bw + ' body weight + ' + add + ' added = ' + (bw + add) + ' lb' : 'Set your body weight in settings (gear) to get total load.';
}
function plUpd() { const t = plateLine(formEx, $('fl').value.trim()); $('fpl').textContent = t ? 'Plates: ' + t : ''; const bb = plateT(formEx); $('pbt').style.display = bb ? '' : 'none'; $('fl').inputMode = bb ? 'text' : 'decimal'; $('fl').placeholder = bb ? 'e.g. 185 or 4x45 2x25' : ''; if (!bb) $('pbx').hidden = true; }
// Plate-first: tap plates (one per side each), chips remove, total = bar weight (barWeight) + 2 x plates.
let pbList = []; // one entry per pair (one plate each side)
function pbRender() { const tot = barWeight(formEx) + 2 * pbList.reduce((a, b) => a + b, 0), cnt = {}; pbList.forEach(p => cnt[p] = (cnt[p] || 0) + 2); $('pbc').innerHTML = Object.keys(cnt).map(Number).sort((a, b) => b - a).map(p => '<button type="button" class="pchip" data-pr="' + p + '" aria-label="Remove a pair of ' + p + 's">' + cnt[p] + ' x ' + p + '</button>').join('') || '<span class="s2">Empty ' + (BAR_NAME[equipType(formEx)] || 'bar') + ' (' + barWeight(formEx) + ' lb). Each tap adds a pair (one plate per side).</span>'; $('pbtot').textContent = 'Total ' + (Math.round(tot * 10) / 10) + ' lb'; }
// v85 (Jack, Oct 20, 2026): the plate builder has a Bar weight field at the top. It edits the same per-exercise bar setting as the card row and recalculates live.
function pbBarSet(v) { const n = parseFloat(v); if (!formEx || !(n > 0 && n < 200)) { $('pbbw').value = String(barWeight(formEx)); return; } if (n !== barWeight(formEx)) putSetting(formEx.canonical, 'bar', String(n)); $('pbbw').value = String(n); pbRender(); plUpd(); bwLine(); }
$('pbbw').addEventListener('change', () => pbBarSet($('pbbw').value));
$('pbbw').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pbBarSet($('pbbw').value); } });
$('pbbm').onclick = () => pbBarSet(Math.max(5, barWeight(formEx) - 5)); $('pbbp').onclick = () => pbBarSet(barWeight(formEx) + 5);
$('pbt').onclick = () => { const x = $('pbx'); x.hidden = !x.hidden; if (!x.hidden) { pbList = []; $('pbbw').value = String(barWeight(formEx)); pbRender(); } $('pbtl').textContent = x.hidden ? 'Build from plates' : 'Hide plate builder'; $('pbt').classList.toggle('on', !x.hidden); };
$('pbp').addEventListener('click', e => { const b = e.target.closest('[data-pp]'); if (!b) return; pbList.push(+b.dataset.pp); pbList.sort((a, c) => c - a); pbRender(); });
$('pbc').addEventListener('click', e => { const b = e.target.closest('[data-pr]'); if (!b) return; const i = pbList.indexOf(+b.dataset.pr); if (i >= 0) pbList.splice(i, 1); pbRender(); });
$('pbclr').onclick = () => { pbList = []; pbRender(); };
$('pbuse').onclick = () => { $('fl').value = String(barWeight(formEx) + 2 * pbList.reduce((a, b) => a + b, 0)); bwLine(); plUpd(); };
const isBB = () => plateT(formEx);
function flPlates() { const pl = isBB() ? P_.platesToLoad($('fl').value, barWeight(formEx)) : null; if (pl && !pl.rest) { $('fl').value = String(pl.load); bwLine(); plUpd(); return true; } return false; }
$('fl').oninput = () => { bwLine(); const pl = isBB() ? P_.platesToLoad($('fl').value, barWeight(formEx)) : null; if (pl && !pl.rest) $('fpl').textContent = '= ' + pl.load + ' lb (tap away to use)'; else plUpd(); };
$('fl').addEventListener('blur', flPlates);
// Rule (Jack, Oct 20, 2026): changing the weight on a new set clears the reps and fills a fresh estimate for the new weight
// (own history at that weight, else Epley/Brzycki average from the coach target). Backing out keeps that weight as a draft for this set, so reopening shows it with the same re-estimate.
let formBase = null;
const draftKey = () => formEx ? viewId + '|' + formEx.canonical + '|' + formSetIdx : '';
function reEstimate() {
  const b = formBase, ex = formEx; if (!b || !ex || editId || isStretch(ex) || ex.bodyweight || warmNow) return;
  const nl = parseFloat($('fl').value), bl = parseFloat(b.load), br = parseInt(String(b.reps).split(/[^\d]+/).filter(Boolean).pop(), 10);
  if (!(nl > 0) || !(bl > 0) || !(br > 0)) return;
  // v113 (Jack, Oct 28): on the first set, the estimate starts from last session's first set plus the reps left in the tank by its effort:
  // Not to failure = about 2 more, Technical failure = about 1 more, True failure (or a drop set / myo-reps) = none.
  const lastS = formSetIdx === 0 && !rowsFor(ex, true).length ? lastFirstSet(ex) : null;
  let fsDone = false;
  if (lastS && nl !== bl) {
    const ll = parseFloat(loadOf(lastS)), lr = repN(lastS), ft = lastS.failure_type || '', adj = ft === 'not to failure' ? 2 : ft === 'technical' ? 1 : 0;
    if (ll > 0 && lr > 0) {
      const r0 = Math.min(lr + adj, 30), eE = ll * (1 + r0 / 30), eB = ll * 36 / (37 - Math.min(r0, 36)), rE = 30 * (eE / nl - 1), rB = 37 - 36 * nl / eB;
      const n = Math.max(1, Math.min(30, Math.round((rE + rB) / 2)));
      const ftw = ft === 'not to failure' ? 'not to failure, so you had more in the tank' : ft === 'technical' ? 'to technical failure' : 'to failure';
      formSug = { load: String(nl), reps: String(n), est: true, why: 'Get ' + n + '. Last time ' + ll + ' x ' + lr + ' was ' + ftw + '.' }; fsDone = true;
    }
  }
  if (fsDone) { /* first-set estimate set above */ }
  else if (nl === bl) { formSug = b; } else {
    // 1) Jack's own history at this exact weight (most recent day, best set). 2) Else the average of Epley and Brzycki reps, 1 to 30.
    const hist = rowsFor(ex, false).filter(r => !isWarm(r) && parseFloat(loadOf(r)) === nl && repN(r) > 0); // v113: same gym rules as history
    if (hist.length) {
      const day = hist.map(r => r.date || '').sort().pop(), best = Math.max(...hist.filter(r => (r.date || '') === day).map(r => repN(r)));
      formSug = { load: String(nl), reps: String(best), est: true, why: 'Get ' + best + '. That is what you did last time at ' + nl + ' lbs.' };
    } else {
      const r0 = Math.min(br, 30), eE = bl * (1 + r0 / 30), eB = bl * 36 / (37 - r0);
      const rE = 30 * (eE / nl - 1), rB = 37 - 36 * nl / eB;
      const n = Math.max(1, Math.min(30, Math.round((rE + rB) / 2)));
      formSug = { load: String(nl), reps: String(n), est: true, why: 'Get ' + n + '. A guess for ' + nl + ' lbs.' };
    }
  }
  if (repsTyped) { $('fsug').textContent = 'Target ' + formSug.load + ' x ' + formSug.reps + '. ' + formSug.why + ' Kept the reps you typed.'; return; }
  const r = formSug.reps; if (ex.single) { $('frl').value = String(formSug.repsL || r); $('frr').value = String(formSug.repsR || r); } else $('fr').value = r;
  $('fsug').textContent = 'Target ' + formSug.load + ' x ' + r + '. ' + formSug.why;
}
$('fl').addEventListener('change', () => { flPlates(); reEstimate(); });
function lastFirstSet(ex) { // set 1 of the most recent earlier session of this exercise (gym rules from rowsFor)
  const past = rowsFor(ex, false).filter(r => !isWarm(r) && repN(r) > 0); if (!past.length) return null;
  const w = widOf(past[past.length - 1]); return past.find(r => widOf(r) === w) || null;
}
// v113 (Jack): Load and Reps take digits and at most one period; anything else (commas, letters, a second period) is dropped as it is typed.
function numOnly(el) { const v = el.value, c = v.replace(/[^\d.]/g, ''), i = c.indexOf('.'), o = i < 0 ? c : c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, ''); if (o !== v) { const p = Math.max(0, (el.selectionStart || o.length) - (v.length - o.length)); el.value = o; try { el.setSelectionRange(p, p); } catch (e) {} } }
['fl', 'fr', 'frl', 'frr'].forEach(id => $(id).addEventListener('input', e => { if (formEx && isStretch(formEx) && id !== 'fl') return; numOnly(e.target); }, true));
let repsTyped = false; // v108: once Jack types reps in this logging session, weight changes never overwrite them
['fr', 'frl', 'frr'].forEach(id => $(id).addEventListener('input', () => { repsTyped = true; }));
function showSides(on) { $('sides').style.display = on ? 'block' : 'none'; $('repsbox').style.display = on ? 'none' : 'block'; }
// ---------- Hold timer (stretch mode) ----------
let hold = null; // { start, side: 'L'|'R'|'' }
function holdTarget() { if (!formEx || !isStretch(formEx)) return null; if (!formEx.single) return $('fr'); return hold && hold.side === 'R' ? $('frr') : (hold && hold.side === 'L' ? $('frl') : (!$('frl').value ? $('frl') : $('frr'))); }
function holdSideLbl() { if (!formEx || !formEx.single) return ''; const t = holdTarget(); return t === $('frr') ? 'Right' : 'Left'; }
function holdTick() {
  if (!hold) return;
  const sec = (Date.now() - hold.start) / 1000; $('htime').textContent = fmt(sec);
  const el = hold.el; if (el) el.value = fmt(sec);
}
setInterval(holdTick, 250);
function holdUI() {
  const on = !!hold, single = !!(formEx && formEx.single);
  $('hstop').style.display = on ? 'block' : 'none';
  if (!single) { $('redol').hidden = $('redor').hidden = true; $('hstart').classList.remove('prim'); $('hstartr').style.display = 'none'; $('hstart').style.display = on ? 'none' : 'block'; $('hstart').textContent = 'Start hold'; $('hstart').dataset.side = ''; $('hside').textContent = on ? 'Timing hold' : 'Timer fills hold time'; return; }
  // Fixed labels: Start Left / Start Right. After one side stops, prompt the other.
  const lDone = !!$('frl').value, rDone = !!$('frr').value, one = lDone !== rDone;
  $('hstart').style.display = on || lDone ? 'none' : 'block'; $('hstartr').style.display = on || rDone ? 'none' : 'block';
  $('hstart').classList.toggle('prim', one); $('hstartr').classList.toggle('prim', one);
  $('hstart').textContent = 'Start Left'; $('hstart').dataset.side = 'L';
  $('hstartr').textContent = 'Start Right'; $('hstartr').dataset.side = 'R';
  const st = isStretch(formEx); $('redol').hidden = !st || on || !lDone; $('redor').hidden = !st || on || !rDone;
  $('hside').textContent = on ? 'Timing ' + (hold.el === $('frr') ? 'right' : 'left') + ' side' : (lDone && rDone ? 'Both sides done' : lDone && !rDone ? 'Next: right side' : rDone && !lDone ? 'Next: left side' : 'Pick a side');
}
const startHold = side => { audio(); const single = formEx && formEx.single; const el = !single ? $('fr') : side === 'R' ? $('frr') : $('frl'); hold = { start: Date.now(), el }; holdTick(); holdUI(); };
let redoSide = null;
const redoAsk = sd => { redoSide = sd; const nm = sd === 'L' ? 'left' : 'right'; $('redoh').textContent = 'Redo ' + nm + ' side?'; $('redot').textContent = 'This clears ' + ($(sd === 'L' ? 'frl' : 'frr').value || 'the time') + '.'; $('redow').classList.add('open'); };
const redoClose = () => { $('redow').classList.remove('open'); redoSide = null; };
$('redol').onclick = () => redoAsk('L'); $('redor').onclick = () => redoAsk('R');
$('redon').onclick = redoClose; $('redox').onclick = redoClose;
$('redoy').onclick = () => { if (redoSide) $(redoSide === 'L' ? 'frl' : 'frr').value = ''; redoClose(); holdUI(); };
$('hstart').onclick = () => startHold($('hstart').dataset.side || 'L');
$('hstartr').onclick = () => startHold($('hstartr').dataset.side || 'R');
$('hstop').onclick = () => { if (!hold) return; holdTick(); hold = null; holdUI(); };
function stopHold() { if (hold) { holdTick(); hold = null; } }
function setStretchMode(on, ex) {
  $('holdbox').style.display = on ? 'block' : 'none';
  $('liftgrid').style.display = on ? 'none' : 'grid';
  $('liftxtra').style.display = on ? 'none' : 'block';
  $('frll').textContent = on ? 'Left hold (m:ss)' : 'Left reps'; $('frrl').textContent = on ? 'Right hold (m:ss)' : 'Right reps';
  ['frl', 'frr'].forEach(id => { $(id).inputMode = on ? 'text' : 'numeric'; });
  if (on && !(ex && ex.single)) { $('sides').style.display = 'none'; $('repsbox').style.display = 'block'; }
  const per = on && ex && ex.single; $('sangs').style.display = per ? 'grid' : 'none'; $('angbox').style.display = on && !per ? 'block' : 'none';
}
function openForm(i, ts, row) {
  const ex = row ? (exFor(row.exercise) || { canonical: row.exercise, note: {}, single: !!row.left_reps, bodyweight: !!row.added_load }) : cardsFor()[i];
  formEx = ex; repsTyped = false; editId = row ? row.set_id : null; doneTs = ts || Date.now();
  const today = row ? [] : rowsFor(ex, true), prev = today.length ? today[today.length - 1] : null;
  $('sh').textContent = (row ? 'Edit: ' : '') + ex.canonical;
  $('fll').textContent = ex.bodyweight ? 'Added lb (0 if none)' : 'Load (lb)';
  stopHold(); const stx = isStretch(ex);
  const sg = row ? null : suggest(ex, today.length); formSug = sg;
  $('fl').value = row ? (row.load || '') : sg && sg.load ? sg.load : prev ? prev.load : (ex.bodyweight ? '0' : '');
  $('fr').value = row ? row.reps : (sg && !ex.single ? sg.reps : '');
  if (!row && ex.single && sg) { $('frl').placeholder = sg.repsL || sg.reps; $('frr').placeholder = sg.repsR || sg.reps; }
  $('fsug').textContent = sg ? 'Target ' + (sg.load || '-') + ' x ' + sg.reps + '. ' + sg.why : ''; $('fn').value = row ? noteTxt(row) : ''; $('ferr').textContent = '';
  $('frl').value = row ? (row.left_reps || '') : (ex.single && sg ? String(sg.repsL || sg.reps || '') : ''); $('frr').value = row ? (row.right_reps || '') : (ex.single && sg ? String(sg.repsR || sg.reps || '') : ''); // single-arm: both sides prefilled, one save logs the set
  showSides(!!ex.single); setDrops(row ? (+row.drops || 0) : 0); setMini(row ? miniOf(row) : 0);
  formSetIdx = row ? Math.max(0, rowsFor(ex, true).findIndex(x => x.set_id === row.set_id)) : today.length;
  setStretchMode(stx, ex);
  if (stx) {
    $('fang').value = row ? String(row.load || '').replace(/°$/, '') : (sg && sg.load ? String(sg.load).replace(/°$/, '') : '');
    const t = sg && sg.reps ? sg.reps : '';
    if (ex.single) {
      const g = row ? angs(row.load) : { L: sg ? sg.angL : '', R: sg ? sg.angR : '' };
      $('fangl').value = g.L; $('fangr').value = g.R;
      $('frl').value = row ? fmtHold(row.left_reps) : ''; $('frr').value = row ? fmtHold(row.right_reps) : '';
      $('frl').placeholder = sg ? sg.repsL || t : t; $('frr').placeholder = sg ? sg.repsR || t : t;
    }
    else $('fr').value = row ? fmtHold(row.reps) : '';
    $('htime').textContent = '0:00'; holdUI();
    $('fsug').textContent = sg ? 'Suggested: ' + (ex.single ? sg.angL + '° ' + sg.repsL + ' L / ' + sg.angR + '° ' + sg.repsR + ' R' : String(sg.load) + '° for ' + sg.reps) + ' (' + sg.why + ').' : '';
  }
  $('fbw').textContent = ''; $('pbx').hidden = true; $('pbtl').textContent = 'Build from plates'; $('pbt').classList.remove('on'); pbList = []; bwLine(); plUpd();
  $('fdel').style.display = row ? 'block' : 'none'; $('ftimer').style.display = 'none';
  $('fsave').textContent = row ? 'Save changes' : 'Save set';
  if (SR) $('heard').textContent = '';
  const f = (ex.note.failure || '').toLowerCase();
  const isMrm = !isStretch(ex) && methodOf(ex) === 'match';
  if (isMrm && !(row && +row.drops)) setDrops(0); mrmAdd = false; mrmN = 2;
  ftOptions(row && row.failure_type === 'drop set' ? 'drop set' : null, isMrm && !(row && row.failure_type === 'myo-reps'));
  ffSel.value = row ? (FT.includes(row.failure_type) ? row.failure_type : 'not to failure') : prev && FT_OPTS.includes(prev.failure_type) && !(isMrm && prev.failure_type === 'myo-reps') ? prev.failure_type : (f.includes('true') ? 'true' : f.includes('technical') ? 'technical' : 'not to failure');
  miniUI();
  if (rowPrefill && !row) {
    if (rowPrefill.load) $('fl').value = rowPrefill.load;
    if (rowPrefill.reps) { if (ex.single) { $('frl').value = rowPrefill.reps; $('frr').value = rowPrefill.reps; } else $('fr').value = rowPrefill.reps; }
    bwLine();
  }
  if (!row && warmNext != null) { // logging a coach warm-up set
    const w = coachWarm(ex)[warmNext];
    if (w) { $('fl').value = String(w.w); $('fr').value = String(w.n); ftOptions(); ffSel.value = 'warm-up'; $('fsug').textContent = 'Warm-up ' + (warmNext + 1) + ' of ' + coachWarm(ex).length + ': ' + w.w + ' x ' + w.n + ' (Coach plan). Logged as a warm-up, so it does not change the working set suggestions.'; setDrops(0); setMini(0); $('fmini').style.display = 'none'; bwLine(); plUpd(); }
  }
  warmNow = !row && warmNext != null && !!coachWarm(ex)[warmNext]; warmNext = null;
  formBase = row || warmNow || rowPrefill ? null : formSug;
  if (formBase) { const d = jget('coach_draft', null); if (d && d.k === draftKey() && d.load) { $('fl').value = d.load; reEstimate(); } }
  formKey = !row && rowPrefill ? rowPrefill.key : null; rowPrefill = null;
  setPain(row ? (dayVal(ex, 'pain') || 'none') : 'none');
  $('sheet').classList.add('open'); sheetTop(); pushLayer('sheet', () => closeForm(true)); tick();
}
let formKey = null, formPain = 'none', formSug = null;
function setPain(p) { formPain = p; document.querySelectorAll('#fp button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); }
document.querySelectorAll('#fp button').forEach(b => b.onclick = async () => { // v86: Severe needs a confirm so a stray tap cannot set it
  if (b.dataset.p === 'severe' && formPain !== 'severe' && !(await askBox({ title: 'Severe joint pain?', body: 'Mark this set as severe joint pain.', ok: 'Yes, severe', danger: true }))) return;
  setPain(b.dataset.p); });
function openEdit(sid) { const r = viewRows(true).find(x => x.set_id === sid); if (r) openForm(-1, tsOf(r), r); }
['fr', 'frl', 'frr'].forEach(id => {
  const el = $(id);
  el.addEventListener('input', () => { if (!formEx || !isStretch(formEx)) return; const v = parseHold(el.value); $('hprev').textContent = el.value.trim() ? (v == null ? 'Use minutes (5, 5.5) or m:ss' : '= ' + fmt(v)) : ''; });
  el.addEventListener('blur', () => { if (!formEx || !isStretch(formEx)) return; const v = parseHold(el.value); if (v != null) el.value = fmt(v); $('hprev').textContent = ''; holdUI(); });
});
// Same both sides: copy from the side focused last (buttons steal focus, so record on focus/pointerdown). Default Left.
let lastSide = 'L';
[['frl', 'L'], ['frr', 'R'], ['fangl', 'L'], ['fangr', 'R']].forEach(([id, sd]) => { const el = $(id); if (!el) return; const f = () => { lastSide = sd; }; el.addEventListener('focus', f); el.addEventListener('pointerdown', f); });
$('fsame').onclick = () => {
  const src = lastSide === 'R' ? 'R' : 'L', dst = src === 'L' ? 'R' : 'L';
  const pairs = [['frl', 'frr']].concat(formEx && isStretch(formEx) ? [['fangl', 'fangr']] : []);
  pairs.forEach(([l, r]) => { const a = $(src === 'L' ? l : r), b = $(src === 'L' ? r : l), v = a.value.trim() || a.placeholder || ''; if (v) { a.value = v; b.value = v; } });
  if (formEx && isStretch(formEx)) holdUI();
};
function sheetTop() { // after open, layout, and keyboard: put the popup at its top
  const inn = $('sheet').querySelector('.in');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const go = () => { inn.scrollTop = 0; $('sheet').scrollTop = 0; inn.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); };
  go(); requestAnimationFrame(() => { go(); requestAnimationFrame(go); }); setTimeout(go, 80); setTimeout(go, 250);
}
// Rule (Jack, Oct 20, 2026): backing out of a new set without logging leaves the previous rest timer running as if the form was never opened
// (same start, so elapsed time keeps counting; target unchanged). Only a saved set ends that rest.
let restSnap = null, warmNow = false;
function closeForm(fromPop) { if (formEx && !editId && formBase) { flPlates(); const l = $('fl').value.trim(); if (l && l !== String(formBase.load)) { if (!formSug || String(formSug.load) !== l) reEstimate(); const s = formSug && String(formSug.load) === l ? formSug : null; jset('coach_draft', { k: draftKey(), load: l, reps: s ? String(s.reps) : '', why: s ? s.why : '' }); } else LS.removeItem('coach_draft'); }
  if (formEx && !editId) { const t = getT(); if (t && t.firstSide) { t.hidden = true; t.firstSide = false; setT(t); } else if (restSnap && (!t || (t.hidden && t.start === restSnap.start))) setT(restSnap); } restSnap = null; $('sheet').classList.remove('open'); stopHold(); formEx = null; editId = null; stopRec(); if (fromPop !== true) popLayer('sheet'); if (S) applyState(S, false); }
$('fcancel').onclick = closeForm; $('fxc').onclick = closeForm;
$('fdel').onclick = async () => { const id = editId; if (!(await askBox({ title: 'Delete this set?', ok: 'Delete', danger: true }))) return; closeForm(); deleteSet(id, false); };
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeForm(); });
$('fsave').onclick = () => {
  const ex = formEx;
  if (ex && isStretch(ex)) return saveStretch(ex);
  if (ex && ex.canonical && (dayVal(ex, 'pain') || 'none') !== formPain && (editId || formPain !== 'none')) putSetting(ex.canonical, 'pain:' + viewId, formPain === 'none' ? '' : formPain);
  let reps = $('fr').value.trim(), L = '', R = '';
  if (ex.single) {
    L = $('frl').value.trim(); R = $('frr').value.trim();
    if (!L && !R) { $('ferr').textContent = 'Enter reps for at least one side.'; return; }
    reps = L && R && Number(L) !== Number(R) ? L + '/' + R : (L || R);
  }
  if (!reps) { $('ferr').textContent = 'Reps are required.'; return; }
  flPlates(); const load = $('fl').value.trim();
  let bw = '', total = '';
  if (ex.bodyweight) { const b = bodyweight(); if (b) { bw = String(b); total = String(Math.round((b + (parseFloat(load) || 0)) * 10) / 10); } }
  const mtok = minis > 0 && $('fmini').style.display !== 'none' ? '[mini ' + minis + ']' : '';
  const fields = { load, reps, failure_type: ffSel.value, notes: [$('fn').value.trim().replace(MINI_RE, ''), mtok].filter(Boolean).join(' '), drops: drops ? String(drops) : '', left_reps: L, right_reps: R, added_load: ex.bodyweight ? (load || '0') : '', bodyweight: bw, total_load: total };
  if (S && !(S.version >= 2)) { // old backend ignores the new columns: keep them readable in notes
    const x = [drops ? drops + (drops === 1 ? ' drop' : ' drops') : '', ex.single ? 'L ' + (L || '-') + ' R ' + (R || '-') : '', total ? 'total ' + total + ' (BW ' + bw + ' + ' + (load || 0) + ')' : ''].filter(Boolean).join('; ');
    if (x) fields.notes = (fields.notes ? fields.notes + ' | ' : '') + x;
  }
  if (editId) {
    const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === editId);
    if (pi >= 0) { const tg = (String(q[pi].set.notes || '').match(GYM_RE) || [])[0]; Object.assign(q[pi].set, fields); if (tg && !String(q[pi].set.notes).includes(tg.trim())) q[pi].set.notes = ((q[pi].set.notes || '') + ' ' + tg.trim()).trim(); setQ(q); if (!testOn()) flush(); }
    else enqueue({ action: 'edit', set_id: editId, fields });
    closeForm(); return;
  }
  const set = Object.assign({ set_id: uid(), client_ts: doneTs, exercise: ex.canonical, workout: viewId }, fields);
  const before = viewRows();
  if (!workoutRows().length && !manualStart()) jset(WSK(), { wid: viewId, ts: doneTs });
  enqueue({ action: 'log', date: S.today, set });
  const nt = nextTarget(ex.canonical); let t = getT();
  if (t && !t.hidden) { t.target = nt.target; t.next = nt.next; t.firstSide = false; t.hidden = !!nt.last; t.exercise = ex.canonical; setT(t); }
  else { t = { start: doneTs, exercise: ex.canonical, target: nt.target, next: nt.next, hidden: !!nt.last }; setT(t); }
  $('sheet').classList.remove('open'); formEx = null; restSnap = null; LS.removeItem('coach_draft'); stopRec(); popLayer('sheet');
  if (mrmAdd && ex.added && formSetIdx === 0) mrmFill(ex, set);
  mrmAdd = false;
  update(); feedback(ex, set, before, prevRest, t ? t.target : 120, formSug); if (nt.last) finishPrompt(); else tipNext(ex);
};
function mrmFill(ex, set) { // set 1 is logged; add the matching sets as myo-rep match sets, then fix the planned count
  const sl = ex.base ? ex.base.canonical : ex.canonical; putSetting(sl, 'method:' + viewId, 'match');
  for (let k = 1; k <= mrmN; k++) enqueue({ action: 'log', date: S.today, set: Object.assign({}, set, { set_id: uid(), client_ts: set.client_ts + k * 1000, failure_type: 'myo-reps', drops: '', notes: ('myo-rep match set ' + (k + 1) + ' (target ' + repN(set) + ' reps, filled in)').trim() }) });
  const want = 1 + mrmN, planned = plannedCount(ex);
  if (planned > want) setDayVal(ex, 'skip', String((+dayVal(ex, 'skip') || 0) + planned - want)); // extra planned rows go away
  else if (want > planned) setDayVal(ex, 'extra', String((+dayVal(ex, 'extra') || 0) + want - planned));
  toast('Myo-rep match: set 1 plus ' + mrmN + ' matching ' + (mrmN === 1 ? 'set' : 'sets') + ' saved. Edit any of them if the reps differ.');
}

function saveStretch(ex) {
  stopHold(); holdUI();
  if (ex && ex.canonical && (dayVal(ex, 'pain') || 'none') !== formPain && (editId || formPain !== 'none')) putSetting(ex.canonical, 'pain:' + viewId, formPain === 'none' ? '' : formPain);
  let ang = $('fang').value.trim().replace(/°$/, '');
  if (ex.single) { const al = $('fangl').value.trim().replace(/°$/, ''), ar = $('fangr').value.trim().replace(/°$/, ''); ang = al === ar || !ar ? al : (al || '-') + '/' + ar; }
  let L = '', Rr = '', reps = '';
  if (ex.single) {
    const l = parseHold($('frl').value || $('frl').placeholder), r = parseHold($('frr').value || $('frr').placeholder);
    // empty side stays empty; placeholder only fills when at least one side typed/timed
    const lv = parseHold($('frl').value), rv = parseHold($('frr').value);
    if (lv == null && rv == null) { $('ferr').textContent = 'Time at least one side (or type m:ss).'; return; }
    L = lv == null ? '' : fmt(lv); Rr = rv == null ? '' : fmt(rv);
    reps = fmt(Math.min.apply(null, [lv, rv].filter(v => v != null)));
  } else {
    const v = parseHold($('fr').value); if (v == null) { $('ferr').textContent = 'Enter hold time (m:ss or seconds).'; return; }
    reps = fmt(v);
  }
  const fields = { load: ang, reps, failure_type: 'not to failure', notes: $('fn').value.trim(), drops: '', left_reps: L, right_reps: Rr, added_load: '', bodyweight: '', total_load: '' };
  if (editId) {
    const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === editId);
    if (pi >= 0) { const tg = (String(q[pi].set.notes || '').match(GYM_RE) || [])[0]; Object.assign(q[pi].set, fields); if (tg && !String(q[pi].set.notes).includes(tg.trim())) q[pi].set.notes = ((q[pi].set.notes || '') + ' ' + tg.trim()).trim(); setQ(q); if (!testOn()) flush(); }
    else enqueue({ action: 'edit', set_id: editId, fields });
    closeForm(); return;
  }
  const set = Object.assign({ set_id: uid(), client_ts: doneTs, exercise: ex.canonical, workout: viewId }, fields);
  if (!workoutRows().length && !manualStart()) jset(WSK(), { wid: viewId, ts: doneTs });
  enqueue({ action: 'log', date: S.today, set });
  const nt = nextTarget(ex.canonical);
  setT({ start: Date.now(), exercise: ex.canonical, target: nt.target || 60, next: nt.next, hidden: !!nt.last });
  $('sheet').classList.remove('open'); formEx = null; restSnap = null; LS.removeItem('coach_draft'); stopRec(); popLayer('sheet');
  update(); if (nt.last) finishPrompt();
}
// ---------- Feedback toasts ----------
const JOKES = [
  'Your rest timer called. It misses you.', 'That bench is not going to press itself.', 'Plates do not rerack themselves. Neither do excuses.',
  'Somewhere a protein shake is proud of you.', 'Chest day: the most important meeting of the week.', 'Good set. The mirror noticed.',
  'Hydrate. Your muscles are 75% water and 25% stubbornness.', 'Remember: the dumbbells were here before you, and they will be here after.',
  'Every rep is a deposit. Compound interest starts now.', 'Form check: excellent. Ego check: also passing.'];
const PR_CHEERS = ['Nice work, that is a new best.', 'Strong set. You are getting better every week.', 'That is progress you can feel. Keep it up.', 'Great job. That one goes in the books.'];
const BEAT_CHEERS = ['You beat the estimate. Great set.', 'More reps than planned. Your body is ready for more.', 'Above the target. Nice push.'];
const REST_NUDGES = ['That was a long rest. The weights started to miss you.', 'Long break there. Try starting the next set when the timer turns red.', 'Rest ran long. No problem, just keep the next one a bit shorter.', 'Your rest timer says hello. It has been waiting.'];
const pick = a => a[Math.floor(Math.random() * a.length)];
// Fun or encouraging extras show sparingly: at most one every 6 minutes, and only half the time.
function funOk() { const t = +LS.getItem('coach_fun_ts') || 0; if (Date.now() - t < 6 * 60000 || Math.random() >= 0.5) return false; LS.setItem('coach_fun_ts', String(Date.now())); return true; }
function feedback(ex, set, before, rest, target, sg) {
  if (isWarm(set)) return; // warm-ups: no PR or rep feedback
  const keys = keysOf(ex), prior = before.filter(r => keys.has(P_.norm(r.exercise)));
  const w = parseFloat(set.total_load || set.load), reps = repN(set);
  const msgs = []; let pr = false;
  if (w > 0 && reps > 0 && prior.length) {
    const e = P_.e1rm(w, reps), best = Math.max(0, ...prior.map(r => { const x = P_.e1rm(loadOf(r), repN(r)); return x ? x.ep : 0; }));
    const maxW = Math.max(0, ...prior.map(r => parseFloat(loadOf(r)) || 0));
    const repsAt = Math.max(0, ...prior.filter(r => (parseFloat(loadOf(r)) || 0) >= w).map(r => repN(r) || 0));
    if (e && best && e.ep > best) { msgs.push('New best estimated 1RM: ' + e.ep + ' lb (Epley), ' + e.br + ' (Brzycki).'); pr = true; }
    else if (w > maxW) { msgs.push('Heaviest ' + ex.canonical.toLowerCase() + ' logged yet: ' + w + ' lb.'); pr = true; }
    else if (repsAt && reps > repsAt) { msgs.push('Rep PR: ' + reps + ' reps at ' + w + ' lb.'); pr = true; }
  }
  const est = sg ? Math.max(...String(sg.reps || '').split(/[^\d]+/).map(Number).filter(n => n > 0), 0) : 0;
  const beat = est > 0 && reps > est && (!sg.load || !(w < parseFloat(sg.load)));
  const beatTxt = 'Beat estimate: ' + (w > 0 ? w + ' x ' : '') + reps + ' vs ' + est + ' estimated.';
  if (pr) { if (beat) msgs[0] += ' ' + beatTxt; if (funOk()) msgs[0] += ' ' + pick(PR_CHEERS); }
  else if (beat) msgs.push(beatTxt + (funOk() ? ' ' + pick(BEAT_CHEERS) : '')); // v84: always show the numbers
  else if (rest != null && target && rest > target * 1.25 && rest > target + 30 && funOk()) msgs.push(pick(REST_NUDGES) + ' (' + fmt(rest) + ' vs ' + fmt(target) + ')');
  // v115: no toast after logging a set (Jack, Oct 29).
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
function fill(txt) { const p = P_.parseSpeech(txt, { barbell: isBB(), bar: isBB() ? barWeight(formEx) : BAR });
  if (p.load != null) $('fl').value = p.load; if (p.reps != null) $('fr').value = p.reps; if (p.ft === 'drop set') { ffSel.value = 'true'; setDrops(Math.max(1, drops)); } else if (p.ft) ffSel.value = p.ft; miniUI(); if (p.notes) $('fn').value = p.notes;
  $('heard').textContent = 'Heard: "' + txt + '". Check and edit, then Save.'; }

// ---------- Boot ----------
badge();
if (!U || !K) showSettings(); else { load(true); flush(); }
setInterval(() => { if (U && K && document.visibilityState === 'visible' && !flushing) load(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && U && K) { load(); flush(); tick(); } });
if (testOn()) window.CoachT = { viewRows, rowsFor, cardsFor, tripView, tripToday, tripSwapOf, weekSets, openForm, tripAlts, openWorkout, addMany, gymList, tipShow, openMenu, msgPop, plannedCount, techFor, tqShow, openProg, phase, getSetting, get viewId() { return viewId; } }; // test mode only
window.coachReady = true;
} catch (err) { if (window.coachFatal) window.coachFatal((err && err.message) || err); throw err; }
})();
// v113: lock background scrolling while any window or menu is open.
(function scrollLock() {
  const isOpen = () => !!document.querySelector('body > div.open, #sheet.open, #menu.open, #chw.open');
  // v115: no overflow:hidden (it made the page jump). Keep the scroll offset fixed while a window is open and after it closes.
  let lockY = null;
  const sync = () => {
    const o = isOpen(), h = document.documentElement;
    if (o && lockY == null) lockY = window.scrollY;
    h.classList.toggle('modal', o);
    if (lockY != null && Math.abs(window.scrollY - lockY) > 1) window.scrollTo(0, lockY);
    if (!o && lockY != null) { const y = lockY; lockY = null; requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y); }); }
  };
  window.addEventListener('scroll', () => { if (lockY != null && document.documentElement.classList.contains('modal') && Math.abs(window.scrollY - lockY) > 1) window.scrollTo(0, lockY); }, { passive: true });
  document.addEventListener('wheel', e => { if (!document.documentElement.classList.contains('modal')) return; let n = e.target; while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return; n = n.parentElement; } e.preventDefault(); }, { passive: false });
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('touchmove', e => {
    if (!document.documentElement.classList.contains('modal')) return;
    let n = e.target;
    while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return; n = n.parentElement; }
    e.preventDefault();
  }, { passive: false });
  sync();
})();

// v118: continuous dim backdrop when one window opens another (no flash between windows).
(function () {
  const ids = ['menu', 'hist', 'tech', 'repl', 'calw', 'wmw', 'delw', 'tswapw', 'gdelw', 'tipw', 'gchw', 'gedw', 'msgw', 'sheet', 'rstw', 'rfil', 'prog', 'redow', 'askw', 'gpkw', 'chw', 'cexw'];
  const els = ids.map(i => document.getElementById(i)).filter(Boolean);
  const br = document.createElement('div'); br.id = 'bdrop'; document.body.appendChild(br);
  const anyOpen = () => els.some(e => e.classList.contains('open'));
  let was = anyOpen(), h1, h2;
  const set = c => { if (br.className !== c) br.className = c; };
  new MutationObserver(recs => {
    if (recs.every(r => r.target === br)) return;
    const now = anyOpen();
    if (now) { clearTimeout(h1); clearTimeout(h2); set(''); }
    else if (was) { clearTimeout(h1); clearTimeout(h2); set('on'); h1 = setTimeout(() => { set('on out'); h2 = setTimeout(() => { set(''); }, 160); }, 220); }
    was = now;
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
