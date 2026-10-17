(function () {
'use strict';
try {
const P_ = window.CoachParse;
const $ = id => document.getElementById(id);
// Single source for the version label. Bump with the ?v= asset queries in index.html and the coach-shell cache name in sw.js.
const APP_VERSION = 65;
try { const av = document.getElementById('appver'); if (av) av.textContent = String(APP_VERSION); } catch (e) {}
const LS = localStorage;
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const FT = ['technical','true','drop set','myo-reps','not to failure'];
const FT_LABEL = {'technical':'Technical failure','true':'True failure','drop set':'Drop set','myo-reps':'Myo-reps','not to failure':'Not to failure'};
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
function toast(m, ms) { const t = $('toast'); t.textContent = m; t.style.transform = ''; t.style.opacity = ''; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(hideToast, ms || 6000); }
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
function enqueue(item) { const t = testOn(), q = getQ(); q.push(Object.assign({ id: uid(), profile: P }, item, t ? { test: true } : {})); setQ(q); if (!t) flush(); }
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
function exFor(name) { const n = P_.norm(name); for (const ex of cardsFor()) if (keysOf(ex).has(n)) return ex; for (const ex of (days[dayKey] ? days[dayKey].exercises : [])) if (keysOf(ex).has(n)) return ex; for (const d of Object.values(days)) for (const ex of d.exercises) if (keysOf(ex).has(n)) return ex; return null; }
function rowsFor(ex, today) {
  const keys = keysOf(ex);
  return viewRows().filter(r => keys.has(P_.norm(r.exercise)) && (today ? widOf(r) === viewId : wIndex(widOf(r)) < wIndex(viewId)));
}
const loadOf = r => r.total_load || r.load;
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
  return 'Last time (' + wLabel(ls.date) + ', ' + ls.rows[0].date + '): ' + ls.rows.map(setTxt).join(', ');
}
// ---------- Warm-up ramp + plate calculator (barbell and dumbbell only, never logged) ----------
const PLATES = [45, 35, 25, 10, 5, 2.5], BAR = 45;
function platesFor(w) { let side = (w - BAR) / 2; if (!(side > 0)) return w > 0 && w <= BAR ? 'Empty bar' : ''; const out = []; for (const p of PLATES) while (side >= p - 1e-9) { out.push(p); side -= p; } return out.join(' + ') + ' per side' + (side > 0.01 ? ' (+' + (Math.round(side * 2 * 10) / 10) + ' lb left over)' : ''); }
const platesShort = w => { const p = platesFor(+w); return p ? p.replace(' per side', ' /side') : ''; };
const plateLine = (ex, w) => ex && !isStretch(ex) && eqKind(ex) === 'barbell' && +w > 0 ? platesShort(w) : '';
const eqKind = ex => { const e = String(ex.equip || P_.equipOf(ex.canonical, ex.bodyweight) || '').toLowerCase(); return /hex|trap/.test(e) ? 'hexbar' : /barbell/.test(e) ? 'barbell' : /dumbbell/.test(e) ? 'dumbbell' : ''; };
function warmFor(ex, list) {
  if (isStretch(ex) || ex.bodyweight) return null;
  const k = eqKind(ex); if (!k) return null;
  const firstFree = list.find(x => !isStretch(x) && !x.bodyweight && eqKind(x));
  if (k !== 'barbell' && firstFree !== ex) return null;
  const sg = suggest(ex, 0), ks = keysOf(ex); let w = num(sg && sg.load) || settled(rowsFor(ex, false)) || settled(viewRows().filter(r => ks.has(P_.norm(r.exercise)) && widOf(r) !== viewId)) || settled(rowsFor(ex, true)); if (!w) return null;
  const r5 = v => Math.round(v / 5) * 5, steps = [];
  if (k === 'dumbbell') { [[0.5, 8], [0.75, 4]].forEach(([p, n]) => { const x = r5(w * p); if (x > 0 && x < w && !steps.some(s => s.w === x)) steps.push({ w: x, n }); }); }
  else {
    if (k === 'barbell') steps.push({ w: BAR, n: 10 });
    [[0.5, 5], [0.7, 3], [0.85, 1]].forEach(([p, n]) => { const x = r5(w * p); if (x > (k === 'barbell' ? BAR : 0) && x < w && !steps.some(s => s.w === x)) steps.push({ w: x, n }); });
  }
  return { k, w, steps };
}
function warmHTML(ex, i, list) {
  const wu = warmFor(ex, list); if (!wu) return '';
  const pl = wu.k === 'barbell', unit = wu.k === 'dumbbell' ? ' lb each' : ' lb';
  const row = (w, n, work) => '<li><button type="button" class="wuw"' + (pl ? ' data-pl="' + w + '"' : '') + '>' + w + unit + '</button> x ' + n + (work ? ' <span class="s2">working weight</span>' : '') + (pl ? '<div class="s2 wup" hidden>' + esc(platesFor(w)) + '</div>' : '') + '</li>';
  return '<details class="wu"><summary>Warm-up (not logged)</summary><ul>' + wu.steps.map(s => row(s.w, s.n)).join('') + row(wu.w, 'sets', true) + '</ul>' +
    '<div class="s2">' + (pl ? 'Tap a weight to see plates (45 lb bar). ' : '') + (wu.k === 'hexbar' ? 'Hex bars vary in weight, so no plate math. ' : '') + 'Rest about 1 min between ramp sets.</div></details>';
}
function setsHTML(ex) {
  const rs = rowsFor(ex, true), n = Math.max(plannedCount(ex), rs.length);
  if (!n) return '<li class="s2 none">Skipped today.</li>';
  const name = esc(ex.canonical), t = getT();
  const half = ex.single && t && t.firstSide && P_.norm(t.exercise) === P_.norm(ex.canonical);
  const st = isStretch(ex);
  let h = '<li class="shead' + (st ? ' stretch' : '') + '"><span>SET</span><span>' + (st ? 'ANGLE' : 'WEIGHT') + '</span><span>' + (st ? 'HOLD' : 'REPS') + '</span><span></span><span>LOG</span></li>';
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
    const sg = suggest(ex, i), w = (sg && sg.load) || '', r = (sg && (sg.repsL ? 'L' + sg.repsL + '/R' + sg.repsR : sg.reps)) || '';
    const isNext = i === rs.length;
    const gw = angs(w), wShow = st && w ? (gw.L !== gw.R ? 'L' + gw.L + '° R' + gw.R + '°' : gw.L + '°') : w;
    const rShow = st && r ? (fmtHold(r) || r) : r;
    h += '<li class="plan"><div class="srow"><span class="sn">' + (i + 1) + tb + '</span>' +
      '<span class="val sug" data-f="w">' + esc(wShow) + '</span><span class="val sug"' + (ex.single ? '' : ' data-f="r"') + '>' +
        (ex.single ? (sg && sg.repsL && !st ? '<span data-f="L">L' + esc(sg.repsL) + '</span>/<span data-f="R">R' + esc(sg.repsR) + '</span>' : '<span data-f="L">' + esc(rShow) + '</span>') : esc(rShow)) + '</span>' +
      '<button class="rm" data-rm="' + name + '" aria-label="Remove this set">&#10005;</button>' +
      '<button class="lg' + (half && isNext ? ' half' : '') + '" data-log="' + i + '" data-ex="' + name + '" aria-label="Log this set"' + ((isNext || testOn()) && isToday() ? '' : ' disabled') + '>' + (half && isNext ? '&#189;' : '') + '</button></div>' +
      (plateLine(ex, w) ? '<div class="s2 plt">' + esc(plateLine(ex, w)) + '</div>' : '') +
      (sg ? '<div class="s2">' + (sg.est ? '<b class="est">estimate</b> ' : '') + esc(sg.why) + (ex.single ? (st ? ' · per side' : ' · reps per side') : '') + '</div>' : '') + '</li>';
  }
  return h;
}

// ---------- Intensity techniques read from the program text ----------
const TECH = {
  drop: { tag: 'DROP', name: 'Drop set', re: /\bdrop(?:\s*-?\s*sets?)?\b|\brun(?:ning)? the rack\b/i,
    info: 'Go to failure, then cut the weight about 20-30% (or go down the rack one step) and go to failure again right away, no rest. Repeat for each drop.',
    log: 'Log the first (heavy) set\'s weight and reps, then set the Drop sets counter to how many drops you did (1, 2 or 3).' },
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
  let v = null; try { v = JSON.parse(getSetting(sl, 'bmethod:B' + blockOf(viewWeek())) || 'null'); } catch (e) {}
  return v && v.v && (!v.from || wIndex(viewId) >= wIndex(v.from)) ? v.v : (/\bmyo[- ]?rep match\b/i.test(String(ex.details || '')) ? 'match' : 'standard');
}
const methodable = ex => !isStretch(ex) && (/\bmyo[- ]?reps?\b/i.test(String(ex.details || '')) || (ex.types || []).includes('isolation'));
function techFor(ex) {
  const t = String(ex.details || ''); let keys = Object.keys(TECH).filter(k => k !== 'match' && TECH[k].re.test(t));
  if (methodOf(ex) === 'match') { keys = ['match']; /* MRM excludes drop sets and standard myo-reps */ return { keys, all: !/\blast set\b/i.test(t), mrm: true }; }
  if (!keys.length) return null;
  return { keys, all: !/\blast set\b/i.test(t) };
}
// One set method at a time: MRM on every set after the opener; MR only on the last set (like a finisher); DROP per program text.
function tqShow(tq, i, n) { return tq.keys.filter(k => k === 'match' ? i >= 1 : k === 'myo' ? i === n - 1 : (tq.all || i === n - 1)); }
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
function getSetting(scope, key) {
  const l = localSet(); if (l[scope] && l[scope][key] != null) return l[scope][key];
  const pq = pendingSet(); if (pq[scope] && pq[scope][key] != null) return pq[scope][key];
  const s = S && S.settings; return s && s[scope] && s[scope][key] != null ? s[scope][key] : null;
}
function putSetting(scope, key, value) {
  if (testOn()) { const l = localSet(); (l[scope] = l[scope] || {})[key] = value; jset(SK(), l); return; }
  enqueue({ action: 'setting', scope, key, value });
}
function bodyweight() { const v = parseFloat(getSetting('profile', 'bodyweight')); return v > 0 ? v : null; }
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
const wLabel = id => { const p = wParse(id); return p ? (isDeload(p.w) ? 'Deload' : 'Week ' + wib(p.w)) + ' ' + p.day[0].toUpperCase() + p.day.slice(1, 3) : id; };
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
  let v = null; try { v = JSON.parse(getSetting(base.canonical, 'bswap:B' + blockOf(viewWeek())) || 'null'); } catch (e) {}
  if (v && v.to && v.to !== base.canonical && wIndex(viewId) >= wIndex(v.from)) return { to: v.to, scope: 'block', from: v.from };
  return null;
}
function catalog() { // his library first, then the built-in list
  const out = [], seen = new Set();
  LIB.forEach(e => { seen.add(P_.norm(e.name)); out.push({ name: e.name, aliases: e.aliases, muscles: e.muscles, rest_muscle: e.rest_muscle, equip: e.equip || P_.equipOf(e.name, e.bodyweight), types: e.types, video: e.video, mine: true }); });
  (window.CoachExList || []).forEach(e => { if (!seen.has(P_.norm(e.name)) && !P_.lookup(LIB, e.name)) out.push(Object.assign({ video: '' }, e)); });
  return out;
}
function catFind(name) { const n = P_.norm(name); return catalog().find(c => P_.norm(c.name) === n || (c.aliases || []).some(a => P_.norm(a) === n)) || null; }
function swappedEx(base, si) {
  const k = viewId + '|' + base.canonical + '|' + si.to;
  if (swapMemo[k]) return swapMemo[k];
  const d = P_.enrich({ x: { exercises: [{ n: base.n, name: si.to, full_name: si.to, details: base.details, note: base.note }] } }, LIB), ex = d.x.exercises[0];
  const c = catFind(si.to);
  if (c && !ex.muscles) { ex.canonical = c.name; ex.muscles = c.muscles; ex.rest_muscle = c.rest_muscle; ex.types = c.types; ex.equip = c.equip; ex.match_keys = [P_.norm(c.name)].concat((c.aliases || []).map(P_.norm)); ex.video = c.video || ''; }
  ex.swappedFrom = base.canonical; ex.swapScope = si.scope; ex.base = base;
  return (swapMemo[k] = ex);
}
// Added exercises: settings scope 'adds', key 'w:<wid>' (this workout) or 'b:B<n>:<day>' (rest of block from 'from') -> JSON [{name, at, from}]
function readAdds(k) { try { const v = JSON.parse(getSetting('adds', k) || '[]'); return Array.isArray(v) ? v.filter(a => a && a.name) : []; } catch (e) { return []; } }
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
function readDeletes() { try { const v = JSON.parse(getSetting('deletes', 'B' + blockOf(viewWeek()) + ':' + dayKey) || '[]'); return Array.isArray(v) ? v.filter(a => a && a.name) : []; } catch (e) { return []; } }
function applyDeletes(list) {
  const del = new Set(readDeletes().filter(a => !a.from || wIndex(viewId) >= wIndex(a.from)).map(a => P_.norm(a.name)));
  if (!del.size) return list;
  return list.filter(ex => !del.has(P_.norm(slotOf(ex))) || rowsFor(ex, true).length);
}
function cardsFor() {
  let added = []; try { added = addsFor().map((a, i) => { const b = addedEx(a.name, i, a.details), si = swapInfo(b); return si ? swappedEx(b, si) : b; }); } catch (e) { console.warn('adds', e); }
  let base = baseCards().map(b => { const si = swapInfo(b); return si ? swappedEx(b, si) : b; }).concat(added); let ord = null;
  try { base = applyDeletes(base); } catch (e) { console.warn('deletes', e); }
  try { ord = JSON.parse(getSetting('order', dayKeyOf()) || 'null'); } catch (e) {}
  if (!Array.isArray(ord)) return base;
  const pos = ex => { let i = ord.indexOf(ex.canonical); if (i < 0 && ex.swappedFrom) i = ord.indexOf(ex.swappedFrom); return i < 0 ? 999 + base.indexOf(ex) : i; };
  return base.slice().sort((a, b) => pos(a) - pos(b));
}
const dayVal = (ex, k) => getSetting(ex.canonical, k + ':' + viewId);
function setDayVal(ex, k, v) { putSetting(ex.canonical, k + ':' + viewId, v); sig = ''; applyState(S, false); }
function plannedCount(ex) { const b = ex.planned_sets || 3; return Math.max(0, (isDeload(viewWeek()) ? Math.ceil(b / 2) : b) + (+dayVal(ex, 'extra') || 0) - (+dayVal(ex, 'skip') || 0)); }
function repRange(ex) { const m = (ex.note.sets || '').match(/x\s*(\d+)(?:\s*-\s*(\d+))?/i); return m ? [+m[1], +(m[2] || m[1])] : [8, 12]; }
const LOWER = /quad|hamstring|glute|leg|calf|calves|adductor|abductor/i;
const FAIL = ['technical', 'true', 'drop set', 'myo-reps'];
function lastSession(ex) {
  let rs = rowsFor(ex, false); if (!rs.length) return null;
  if (!isDeload(viewWeek())) { const nd = rs.filter(r => { const p = wParse(widOf(r)); return !p || !isDeload(p.w); }); if (nd.length) rs = nd; }
  const d = rs.reduce((m, r) => wIndex(widOf(r)) > wIndex(m) ? widOf(r) : m, widOf(rs[0]));
  return { date: d, rows: rs.filter(r => widOf(r) === d) };
}
const r5 = (w, step) => Math.max(step, Math.round(w / step) * step);
const EQUIP = [[/hex|trap bar/i, 1], [/barbell|\bbb\b|smith/i, 1], [/dumbbell|\bdb\b/i, 0.38], [/machine|pec deck|hack|leg press/i, 0.9], [/cable|rope/i, 0.45]];
const eqFactor = n => { for (const [re, f] of EQUIP) if (re.test(n)) return f; return 0.8; };
// Overload step sized to the equipment. Barbell steps are plate pairs (2 x 2.5 = 5, 2 x 5 = 10).
function stepFor(ex) {
  const e = ex.equip || P_.equipOf(ex.canonical, ex.bodyweight), lower = LOWER.test(ex.rest_muscle + ' ' + ex.muscles), iso = (ex.types || []).includes('isolation');
  if (e === 'bodyweight' || ex.bodyweight) return { step: 0, unit: 1, txt: '' };
  if (e === 'dumbbell') return { step: 5, unit: 5, txt: ' (next dumbbell)' };
  if (e === 'barbell' || e === 'hexbar') return lower || e === 'hexbar' ? { step: 10, unit: 5, txt: ' (2 x 5 plates)' } : { step: 5, unit: 5, txt: ' (2 x 2.5 plates)' };
  if (e === 'cable') return { step: 5, unit: 2.5, txt: '' };
  return iso ? { step: 5, unit: 5, txt: '' } : lower ? { step: 15, unit: 5, txt: '' } : { step: 10, unit: 5, txt: '' };
}
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
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
function suggest(ex, idx) {
  const today = rowsFor(ex, true);
  const base = suggestNext(ex, idx);
  if (idx >= today.length && today.length) { // follow the weight just logged this workout
    const last = today[today.length - 1], lw = num(last.load);
    if (lw != null) {
      if (base && num(base.load) === lw) return base;
      const sl = sideReps(last); return Object.assign({ load: String(lw), reps: String(repN(last) || (base && base.reps) || ''), why: 'matches your last set (' + setTxt(last) + ')' }, ex.single && sl.L != null && sl.R != null && sl.L !== sl.R ? { repsL: String(sl.L), repsR: String(sl.R) } : {});
    }
  }
  return base;
}
function suggestNext(ex, idx) {
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
    if (sw == null) { const r = rows[Math.min(idx, rows.length - 1)], reps = repN(r) || 0; return { load: r.load, reps: String(dl ? lo : Math.min(hi, reps + 1)), why: (dl ? 'deload, ' : '') + 'last time ' + setTxt(r) }; }
    const at = rows.filter(r => num(r.load) === sw), ref = at[Math.min(idx, at.length - 1)], reps = repN(ref), sr = sideReps(ref);
    const top = Math.max(0, ...at.map(r => repN(r) || 0));
    const failed = at.some(r => (repN(r) || 0) === top && r.failure_type !== 'not to failure');
    const ramp = num(rows[0].load) != null && num(rows[0].load) < sw ? ' · settled on ' + sw : '';
    if (dl) return { load: String(Math.max(0, Math.round(sw * 0.85 / st.unit) * st.unit || sw)), reps: String(lo), why: 'deload: about 85% load, half the sets, stop 2-3 reps short of failure' };
    if (!st.step) return { load: String(sw), reps: String(reps + 1), why: 'aim +1 rep (last ' + setTxt(ref) + ')' };
    if (holdW(ex)) return { load: String(sw), reps: String(Math.min(hi, reps + 1)), why: 'keep the settled weight ' + sw + ', aim +1 rep (last ' + setTxt(ref) + ')' + ramp };
    const small = iso && sw > 0 && st.step / sw > 0.12;
    if (top >= hi + (small ? 2 : 0) && failed) return { load: String(sw + st.step), reps: String(lo), why: 'top of range hit: +' + st.step + ' lb' + st.txt };
    if (small && top >= hi) return { load: String(sw), reps: String(Math.min(hi + 2, reps + 1)), why: '+' + st.step + ' lb is a big jump here: add a rep first, go up at ' + (hi + 2) };
    return Object.assign({ load: String(sw), reps: String(Math.min(hi, reps + 1)), why: 'same weight, aim +1 rep (last ' + setTxt(ref) + ')' + ramp }, ex.single && sr.L != null && sr.R != null && sr.L !== sr.R ? { repsL: plus1(sr.L, hi), repsR: plus1(sr.R, hi) } : {});
  }
  if (ex.bodyweight) return null;
  // Never done: estimate from the best e1RM on a similar exercise (same rest muscle), scaled by equipment.
  let best = null;
  const others = Object.values(days).reduce((a, d) => a.concat(d.exercises), []).concat(ex.base ? [ex.base] : []);
  for (const o of others) {
    if (o === ex || o.canonical === ex.canonical || o.rest_muscle !== ex.rest_muscle || o.bodyweight) continue;
    if (!(ex.types || []).includes('isolation') && (o.types || []).includes('isolation')) continue; // presses are not estimated from flyes
    for (const r of viewRows().filter(x => keysOf(o).has(P_.norm(x.exercise)))) {
      const w = num(loadOf(r)), n = repN(r); if (!(w > 0) || !(n >= 1 && n <= 20)) continue;
      const e = n <= 10 ? P_.e1rm(w, n) : { ep: Math.round(w * (1 + n / 30)), br: Math.round(w * (1 + n / 30)) };
      const v = (e.ep + e.br) / 2 * eqFactor(ex.canonical) / eqFactor(o.canonical)
        * ((ex.types || []).includes('isolation') && !(o.types || []).includes('isolation') ? 0.6 : 1);
      if (!best || v > best.v) best = { v, from: o.canonical };
    }
  }
  if (!best) return null;
  const reps = Math.round((lo + hi) / 2), u = Math.max(5, st.step || 5);
  let load = r5(best.v / (1 + reps / 30), u); if (dl) load = r5(load * 0.85, u);
  return { load: String(load), reps: String(dl ? lo : reps), why: (dl ? 'deload, ' : '') + 'from ' + best.from, est: true };
}
function trend(ex, r, i) {
  const ls = lastSession(ex); if (!ls || !ls.rows[i]) return '';
  const p = ls.rows[i], a = P_.e1rm(loadOf(r), repN(r)), b = P_.e1rm(loadOf(p), repN(p));
  let d;
  if (a && b) d = a.ep - b.ep; else d = (parseFloat(loadOf(r)) || 0) - (parseFloat(loadOf(p)) || 0) || (repN(r) - repN(p));
  return d > 0 ? '<span class="tr up">&#9650;</span>' : d < 0 ? '<span class="tr dn">&#9660;</span>' : '<span class="tr eq">&#9654;</span>';
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
  $('mrepl').style.display = canLog() || !wStatus()[viewId] ? 'block' : 'none';
  $('mdel').disabled = !days[dayKey];
  const mm = methodable(menuEx); $('mmbox').style.display = mm ? 'block' : 'none';
  if (mm) { mmScope = 'workout'; setSeg('mmscope', 'ms', mmScope); setSeg('mmeth', 'mm', methodOf(menuEx)); } // done days too: applies to the remaining weeks (done workouts never change)
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
let mmScope = 'workout';
document.querySelectorAll('#mmscope button').forEach(b => b.onclick = () => { mmScope = b.dataset.ms; setSeg('mmscope', 'ms', mmScope); });
document.querySelectorAll('#mmeth button').forEach(b => b.onclick = () => {
  try {
    const ex = menuEx, sl = ex.base ? ex.base.canonical : ex.canonical, v = b.dataset.mm, blk = blockOf(viewWeek());
    if (mmScope === 'block') { putSetting(sl, 'bmethod:B' + blk, JSON.stringify({ v, from: viewId })); if (getSetting(sl, 'method:' + viewId)) putSetting(sl, 'method:' + viewId, ''); }
    else putSetting(sl, 'method:' + viewId, v);
    setSeg('mmeth', 'mm', v); sig = ''; applyState(S, false);
    toast((v === 'match' ? 'Myo-rep match' : 'Standard myo-reps') + (mmScope === 'block' ? ' for the rest of Block ' + blk : ' for this workout'));
  } catch (e) { toast('Could not set the method: ' + (e && e.message || e)); }
});
$('mdel').onclick = () => { const ex = menuEx; closeMenu(true); if (ex) delExercise(ex); };
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
function rGo() { const n = rSel.length; $('rgo').classList.toggle('on', n > 0); $('rgob').textContent = rMode === 'add' ? 'Add' + (n > 1 ? ' ' + n + ' exercises' : '') : 'Replace with ' + (rSel[0] ? rSel[0].name : ''); }
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
$('rfb').onclick = openFilter; $('rfc').onclick = closeFilter;
$('rfil').addEventListener('click', e => {
  if (e.target.id === 'rfil') return closeFilter();
  const b = e.target.closest('.chips2 button'); if (!b) return;
  const arr = b.parentElement.id === 'rfmg' ? rDraft.mg : rDraft.eq, v = b.dataset.v, i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v); b.classList.toggle('on', i < 0);
});
$('rfa').onclick = () => { rDraft.done = $('rfdone').checked; rF = rDraft; closeFilter(); rRender(); };
$('rpills').addEventListener('click', e => { const b = e.target.closest('[data-clr]'); if (!b) return; const k = b.dataset.clr; if (k === 'done') rF.done = false; else rF[k] = []; rRender(); });
$('rgob').onclick = () => { if (!rSel.length) return; if (rMode === 'add') addMany(rSel.slice()); else pickReplace(rSel[0].name, !!rSel[0].custom); };
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
    putSetting('adds', k, JSON.stringify(list));
    closeRepl(); swapMemo = {}; sig = ''; applyState(S, true);
    toast(unknown.length ? "Added it for now. I'll look it up and add the info, like a demo, later." : 'Added ' + (added.length === 1 ? added[0] : added.length + ' exercises') + (rScope === 'block' ? ' for the rest of Block ' + blockOf(viewWeek()) : ' to this workout'), unknown.length ? 7000 : 5000);
  } catch (e) { closeRepl(); toast('Could not add: ' + (e && e.message || e), 6000); }
}
function pickAdd(name, custom) {
  try {
    const c = catFind(name), to = c ? c.name : name.replace(/^./, x => x.toUpperCase());
    if (cardsFor().some(x => P_.norm(x.canonical) === P_.norm(to))) return toast(to + ' is already in this workout.');
    const k = addKey(rScope), list = readAdds(k).concat([Object.assign({ name: to, at: new Date().toISOString() }, rScope === 'block' ? { from: viewId } : {})]);
    putSetting('adds', k, JSON.stringify(list));
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
function pickReplace(name, custom) {
  if (!rReason) { toast('Pick a reason first: equipment busy, pain or preference.', 4000); $('rreason').scrollIntoView({ block: 'center' }); return; }
  const ex = rEx, b = baseOf(ex), c = catFind(name) || { name: custom ? name.replace(/^./, x => x.toUpperCase()) : name, muscles: '' }, to = c.name;
  if (P_.norm(to) === P_.norm(ex.canonical)) return toast('That is the current exercise.');
  if (!related(c, curInfo(ex)) && !confirm(to + (c.muscles ? ' works ' + c.muscles.toLowerCase() : ' has no muscle info') + ', not the same muscles as ' + ex.canonical + '. Replace anyway?')) return;
  const blk = blockOf(viewWeek());
  if (rScope === 'block' && !(b.types || []).includes('isolation') && !confirm(b.canonical + ' is a main lift, fixed for the block. Replace it with ' + to + ' for the rest of Block ' + blk + '?')) return;
  if (rowsFor(ex, true).length && !confirm('You already logged ' + ex.canonical + ' sets in this workout. They stay in your log. Replace anyway?')) return;
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
  if (scope === 'block') { putSetting(b.canonical, 'bswap:B' + blk, back ? '' : JSON.stringify({ to, from: viewId })); if (getSetting(b.canonical, 'swap:' + viewId)) putSetting(b.canonical, 'swap:' + viewId, ''); }
  else putSetting(b.canonical, 'swap:' + viewId, back && !swapInfo(b) ? '' : to);
  putSetting('swaps', 's' + Date.now().toString(36), JSON.stringify(Object.assign({ at: new Date().toISOString(), wid: viewId, block: blk, from: b.canonical, was, to, scope, reason }, custom ? { custom: true, pending: 'pending_exercises' } : {})));
  swapMemo = {}; sig = ''; applyState(S, true);
}
$('rundo').onclick = () => {
  const ex = rEx, b = baseOf(ex); if (!ex.swappedFrom) return;
  if (ex.swapScope === 'workout') { putSetting(b.canonical, 'swap:' + viewId, ''); if (swapInfo(b)) putSetting(b.canonical, 'swap:' + viewId, b.canonical); }
  else { if (!confirm('Go back to ' + b.canonical + ' for the rest of Block ' + blockOf(viewWeek()) + '?')) return; const v = JSON.parse(getSetting(b.canonical, 'bswap:B' + blockOf(viewWeek())) || '{}'); putSetting(b.canonical, 'bswap:B' + blockOf(viewWeek()), v.from === viewId ? '' : JSON.stringify({ to: b.canonical, from: viewId })); }
  putSetting('swaps', 's' + Date.now().toString(36), JSON.stringify({ at: new Date().toISOString(), wid: viewId, block: blockOf(viewWeek()), from: b.canonical, was: ex.canonical, to: b.canonical, scope: ex.swapScope, reason: 'undo' }));
  closeRepl(); swapMemo = {}; sig = ''; applyState(S, true); toast('Back to ' + b.canonical);
};
document.querySelectorAll('#mpain button').forEach(b => b.onclick = () => { const ex = menuEx; closeMenu(); setDayVal(ex, 'pain', b.dataset.p === 'none' ? '' : b.dataset.p); toast('Joint pain: ' + b.dataset.p); });
function histLine(rs) { // RP style: '160 lbs x 12, 12, 7' or '190 x 11, 180 x 8, 8 +1D'
  const ld = r => String(r.total_load || r.load || ''), rp = r => (r.left_reps || r.right_reps) ? (r.left_reps || '-') + '/' + (r.right_reps || '-') : String(r.reps || '');
  const tag = r => (+r.drops ? ' +' + r.drops + 'D' : '') + (miniOf(r) ? ' +' + miniOf(r) + 'M' : '');
  const same = rs.every(r => ld(r) === ld(rs[0])), u = isStretch(exFor(rs[0].exercise)) ? '°' : ' lbs';
  if (same) return (ld(rs[0]) ? ld(rs[0]) + u + ' x ' : '') + rs.map(r => rp(r) + tag(r)).join(', ');
  let prev = null; return rs.map(r => { const w = ld(r), t = (w !== prev ? (w || 'BW') + ' x ' : '') + rp(r) + tag(r); prev = w; return t; }).join(', ');
}
function openHistory(ex, fromMenu) {
  const rs = viewRows().filter(r => keysOf(ex).has(P_.norm(r.exercise))).sort((a, b) => tsOf(a) - tsOf(b));
  const by = {}; rs.forEach(r => { const k = widOf(r) || r.date; (by[k] = by[k] || []).push(r); });
  const ks = Object.keys(by).sort((a, b) => (tsOf(by[b][0]) - tsOf(by[a][0])) || (by[b][0].date || '').localeCompare(by[a][0].date || ''));
  const td = trainDays(); let lastB = null;
  $('hh').textContent = ex.canonical;
  $('hb').innerHTML = ks.length ? ks.map(k => {
    const g = by[k], p = wParse(widOf(g[0])), w = p ? p.w : weekOf(g[0].date), dl = isDeload(w), bl = blockOf(w);
    const dn = p ? td.indexOf(p.day) + 1 : 0, dt = g[0].date ? new Date(g[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const head = bl !== lastB ? '<div class="hm">Block ' + bl + '</div>' : ''; lastB = bl;
    const wid = widOf(g[0]), pain = getSetting(ex.canonical, 'pain:' + wid), note = getSetting(ex.canonical, 'note:' + wid);
    return head + '<div class="hr' + (dl ? ' dl' : '') + '"><div class="hl">' + esc(histLine(g)) + (pain ? '<div class="s2">pain ' + esc(pain) + '</div>' : '') + (note ? '<div class="s2"><i>' + esc(note) + '</i></div>' : '') + '</div><div class="hx">' + (dl ? 'DELOAD' : 'WEEK ' + wib(w)) + (dn > 0 ? ' - DAY ' + dn : '') + '<br>' + esc(dt) + '</div></div>';
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
  if (ex.single && t && t.firstSide && P_.norm(t.exercise) === P_.norm(ex.canonical)) return isStretch(ex) ? 'Second side done: log hold' : 'Second side done: log set';
  return ex.single ? (isStretch(ex) ? 'First side done' : 'First side done') : (isStretch(ex) ? 'Hold done' : 'Set done');
}
function render() {
  const main = $('main'), d = days[dayKey];
  const nx = loggableId();
  $('prof').value = P;
  if (!d) {
    $('sub').textContent = subWeek() + ' - Unplanned (' + dayKey[0].toUpperCase() + dayKey.slice(1) + ')';
    const ws = wStatus()[viewId];
    main.innerHTML = '<div id="meso">' + mesoHTML() + '</div><div class="empty"><b>Unplanned</b><br>' + (S.program ? 'No session written for ' + esc(dayKey[0].toUpperCase() + dayKey.slice(1)) + ' yet. Ask Coach to write it.' : 'No program file found for this profile yet. Ask Coach to write one.') + '</div>' +
      (!ws && canLog() ? '<button class="btn sec" id="uskip">Skip this workout</button>' : '');
    main.onclick = e => { if (e.target.closest('#uskip')) skipWorkout(); };
    return;
  }
  $('sub').textContent = subWeek() + ' - ' + titleCase(d.title);
  main.innerHTML = '<div id="meso">' + mesoHTML() + '</div><div id="wstart">' + wstartHTML() + '</div>' + cardsFor().map((ex, i) => {
    const n = ex.note, chips = [n.sets, n.failure, n.rest].filter(Boolean).map(c => '<span class="chip">' + esc(c) + '</span>').join('');
    const tips = (ex.cue ? [ex.cue] : []).concat(n.extra).concat(methodOf(ex) === 'match' ? [TECH.match.info] : []);
    const extra = tips.length ? '<ul>' + tips.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    return '<div class="card" id="c' + i + '" data-name="' + esc(ex.canonical) + '"><h2><span class="grip" aria-label="Drag to reorder">&#8801;</span>' + (i + 1) + '. ' + esc(ex.canonical) + '<button class="menu-btn" data-m="' + i + '" aria-label="Exercise menu">&#8943;</button></h2><div class="cbody">' +
      (ex.swappedFrom ? '<div class="swp">Replaces ' + esc(ex.swappedFrom) + (ex.swapScope === 'block' ? ' for the rest of this block' : ' in this workout') + '</div>' : '') +
      (dayVal(ex, 'pain') ? '<div class="pain">Joint pain today: ' + esc(dayVal(ex, 'pain')) + '</div>' : '') +
      (dayVal(ex, 'note') ? '<div class="dnote">Note: ' + esc(dayVal(ex, 'note')) + '</div>' : '') +
      '<div class="meta">' + esc(ex.muscles || '') + (ex.video ? (ex.muscles ? ' · ' : '') + '<a href="' + esc(ex.video) + '" target="_blank" rel="noopener noreferrer">Demo video</a>' : '') + '</div>' +
      '<div class="note"><b>Coach:</b><div class="chips">' + chips + '</div>' + extra + '</div>' +
      '<div class="setup" data-su="' + i + '"><b>Setup:</b> <span id="su' + i + '">' + esc(setupFor(ex) || 'tap to add (seat, pins, angle)') + '</span> <span class="ed">edit</span></div>' +
      warmHTML(ex, i, cardsFor()) +
      '<div class="last" id="l' + i + '">' + esc(lastTime(ex)) + '</div>' +
      '<ul class="sets" id="s' + i + '">' + setsHTML(ex) + '</ul>' +
      '</div></div>';
  }).join('') + (d.footer && d.footer.length ? '<div class="note">' + d.footer.map(esc).join('<br>') + '</div>' : '') +
    '<div id="finwrap"></div>';
  main.querySelectorAll('[data-su]').forEach(el => el.onclick = () => editSetup(+el.dataset.su));
  main.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); openMenu(+b.dataset.m); });
  enableDrag(main);
  main.onclick = e => {
    const plb = e.target.closest('[data-pl]'); if (plb) { const d = plb.parentElement.querySelector('.wup'); if (d) d.hidden = !d.hidden; return; }
    if (e.target.closest('details.wu')) return;
    const tqb = e.target.closest('[data-tq]'); if (tqb) { openTech(tqb.dataset.tq); return; }
    if (e.target.closest('#wstartb')) { startWorkout(false); return; }
    if (e.target.closest('#wreset')) { openReset(); return; }
    const tf = e.target.closest('li.plan [data-f]');
    if (tf) { const lb = tf.closest('li').querySelector('[data-log]'); if (lb && !lb.disabled) tapValue(lb.dataset.ex, +lb.dataset.log, tf.dataset.f); return; }
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
    : '<button class="btn fin" id="finish">Finish workout</button>';
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
  return '<button class="btn sec wsb" id="wstartb">Start workout (warm-ups count)</button>';
}
function startWorkout(re) { audio(); jset(WSK(), { wid: viewId, ts: Date.now() }); updWstart(); toast(re ? 'Workout timer restarted' : 'Workout started. Warm-ups count.', 3000); }
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
function workoutRows() { return viewRows().filter(r => widOf(r) === viewId); }
function finishWorkout() {
  const rs = workoutRows();
  if (!confirm('Finish ' + wLabel(viewId) + '? ' + rs.length + ' sets logged.')) return;
  const ex = new Set(rs.map(r => P_.norm(r.exercise)));
  const now = Date.now(), st = workoutStart(), dur = st ? Math.max(0, Math.round((now - st) / 60000)) : null;
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: now, date: S.today, day: viewId, sets: String(rs.length), exercises: String(ex.size), notes: dur != null ? 'duration_min=' + dur : '' } });
  const t = getT(); if (t) { t.hidden = true; setT(t); }
  try { // show this workout in the order it was actually done (first logged set of each exercise); this workout only
    const cs = cardsFor(), first = ex => { const t = rowsFor(ex, true).map(tsOf).filter(Boolean); return t.length ? Math.min.apply(null, t) : Infinity; };
    const ord = cs.map((c, i) => ({ n: c.canonical, f: first(c), i })).sort((a, b) => a.f - b.f || a.i - b.i).map(x => x.n);
    if (ord.join('|') !== cs.map(c => c.canonical).join('|')) putSetting('order', dayKeyOf(), JSON.stringify(ord));
  } catch (e) { console.warn('reorder', e); }
  LS.removeItem(WSK());
  sig = ''; applyState(S, true); toast('Workout finished. Nice work.', 6000);
}
function skipWorkout() {
  if (!canLog()) return toast('Only the next workout (' + wLabel(loggableId()) + ') can be skipped.');
  if (wStatus()[viewId]) return toast(wLabel(viewId) + ' is already ' + wStatus()[viewId].state + '.');
  const rs = workoutRows(), n = rs.length;
  if (!confirm(n ? 'Skip ' + wLabel(viewId) + '? The ' + n + (n === 1 ? ' set' : ' sets') + ' you logged stay in your log, and the workout is marked skipped (not finished). The next workout becomes available.' : 'Skip ' + wLabel(viewId) + '? The next workout becomes available.')) return;
  enqueue({ action: 'finish', session: { session_id: uid(), client_ts: Date.now(), date: S.today, day: viewId, sets: String(n), exercises: String(new Set(rs.map(r => P_.norm(r.exercise))).size), notes: n ? 'skipped (partial, ' + n + ' sets kept)' : 'skipped' } });
  LS.removeItem(WSK()); const t = getT(); if (t && n) { t.hidden = true; setT(t); }
  setView(loggableId() || viewId); sig = ''; applyState(S, true); window.scrollTo(0, 0); toast('Workout skipped');
}
function editSetup(i) {
  const ex = cardsFor()[i]; const cur = setupFor(ex);
  const v = prompt('Equipment setup for ' + ex.canonical + ' (seat, pins, bench angle):', cur);
  if (v == null) return;
  putSetting(ex.canonical, 'equipment', v.trim()); $('su' + i).textContent = v.trim() || 'tap to add (seat, pins, angle)'; toast('Setup saved');
}
function applyState(st, initial) {
  S = st; S.rows = S.rows || []; LIB = P_.parseLibrary(st.library); RAWDAYS = P_.enrich(P_.parseProgram(st.program), LIB); days = P_.resolveDays(RAWDAYS, viewId ? viewWeek() : 1); swapMemo = {};
  if (!layerOpen('settings')) { $('settings').style.display = 'none'; $('app').style.display = 'block'; }
  const ls = localSet(); if (migrateKeys(ls)) jset(SK(), ls);
  if (S.settings) migrateKeys(S.settings);
  if (!viewId || !wParse(viewId)) setView(loggableId() || ('W1-' + (trainDays()[0] || S.weekday)));
  days = P_.resolveDays(RAWDAYS, viewWeek());
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
// Meso calendar sheet (header calendar icon), back button closes it
const subWeek = () => { const w = viewWeek(); return isDeload(w) ? 'Deload Week' : 'Week ' + wib(w); };
const SMALLW = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'with', 'in', 'on', 'at', 'by']);
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
function weekSets() {
  const mon = mondayOf(S.today), end = new Date(mon + 'T12:00:00'); end.setDate(end.getDate() + 6); const sun = end.toISOString().slice(0, 10);
  const m = {}; (window.CoachMG || []).forEach(g => m[g] = { n: 0, ex: {} }); (window.CoachRegions || []).forEach(([k]) => m['r_' + k] = { n: 0, ex: {} });
  viewRows().forEach(r => {
    if (!r.date || r.date < mon || r.date > sun || r.failure_type === 'not to failure') return;
    const ex = exFor(r.exercise), c = catFind(r.exercise) || (ex ? { name: ex.canonical, muscles: ex.muscles, rest_muscle: ex.rest_muscle } : { name: r.exercise });
    if (!c || isStretch(ex) || (ex && /stretch/i.test(String(ex.types || '')))) return;
    const gs = window.CoachGroupsOf ? window.CoachGroupsOf(c) : [];
    const nm = c.name || r.exercise, bump = (k, v) => { if (!m[k]) return; m[k].n += v; m[k].ex[nm] = (m[k].ex[nm] || 0) + v; };
    gs.forEach((g, i) => bump(g, i === 0 ? 1 : 0.5));
    (window.CoachRegionsOf ? window.CoachRegionsOf(c) : []).forEach(([k, v]) => bump('r_' + k, v));
  });
  return { mon, sun, m };
}
const PCOL = ['#3b4049', '#2e5d3a', '#3f8f4f', '#f2c14e', '#f28c38', '#e04f4f'];
const pBand = n => n <= 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 15 ? 3 : n < 20 ? 4 : 5;
const PLEG = ['0', '1-4', '5-9', '10-14', '15-19', '20+'];
// Stylized front/back figures. Each muscle is a <g data-g> with the left shape plus its mirror (viewBox 120 x 240).
// MacroFactor-style figure (viewBox 160 x 304): broad V-taper silhouette with hands and feet, rounded muscle pieces with dark gaps.
// Each entry is [region, path]; the left half is drawn and mirrored. Extra heads (quads, hamstrings, forearms, triceps, calves) share one region.
// Proportions: ~8-head figure (chin 1/8, crotch 4/8, knees 6/8; elbows at navel, wrists at crotch).
// Traced from Jack's anatomy chart (ref_jack_chart.jpg), left half, mirrored.
// Traced from Jack's anatomy chart (ref_jack_chart.jpg), left half, mirrored. Back view arms hang a little wider, like the chart.
const BODY_SIL = "M80.0 39.2 C76.8 39.2 74.0 39.2 72.6 39.2 C72.6 43.8 72.2 48.4 71.7 51.6 C64.4 56.2 52.9 59.9 44.6 64.0 C36.8 66.8 30.8 72.3 29.4 80.6 C28.5 87.0 28.9 91.6 29.9 96.2 C28.0 102.7 26.6 110.0 25.7 117.4 C23.4 122.9 20.7 131.2 20.7 139.0 C20.7 143.6 21.6 148.2 23.0 151.4 C21.1 157.9 20.2 165.2 23.0 171.7 C24.8 175.4 26.6 177.7 28.0 177.7 C28.9 176.3 29.9 176.3 30.3 178.1 C32.2 178.6 33.5 177.2 34.0 175.4 C35.8 172.6 36.8 169.8 37.2 167.1 C39.1 166.6 41.4 164.8 41.8 162.0 C41.8 159.3 40.0 157.4 38.1 156.0 C37.2 154.2 37.2 151.4 37.7 148.7 C39.1 141.3 40.9 132.1 41.8 125.2 C44.6 118.3 47.3 109.1 49.6 97.6 C51.9 105.4 52.9 116.0 53.8 122.9 C55.2 129.8 55.6 136.7 53.8 143.6 C51.0 152.8 48.7 166.6 48.3 180.4 C47.8 194.2 49.6 205.7 54.2 214.9 C56.1 220.4 56.1 226.4 55.2 231.0 C52.9 240.2 53.8 254.0 57.5 267.8 C59.3 277.0 60.7 286.2 61.1 293.1 C60.2 296.8 55.2 299.6 51.9 301.4 C51.0 303.2 54.7 304.2 64.4 303.7 C71.3 303.7 75.9 303.2 75.4 300.5 C74.5 295.9 72.6 292.2 72.2 286.2 C73.1 274.7 76.8 260.9 76.8 247.1 C76.8 237.9 74.9 231.0 74.9 226.4 C75.9 221.8 75.4 217.2 74.5 212.6 C75.9 201.1 77.2 182.7 77.7 168.9 C78.6 164.3 79.5 162.0 80.0 161.1 Z";
const BODY_SIL_B = "M80.0 39.2 C76.8 39.2 74.0 39.2 72.6 39.2 C72.6 43.8 72.2 48.4 71.7 51.6 C64.4 56.2 52.9 59.9 44.6 64.0 C36.8 66.8 30.8 72.3 29.4 80.6 C28.5 87.0 28.9 91.6 29.8 96.2 C27.4 102.7 25.5 110.0 24.0 117.4 C21.2 122.9 17.8 131.2 17.2 139.0 C16.8 143.6 17.3 148.2 18.5 151.4 C16.1 157.9 14.6 165.2 16.9 171.7 C18.4 175.4 20.1 177.7 21.4 177.7 C22.5 176.3 23.4 176.3 23.7 178.1 C25.5 178.6 27.0 177.2 27.6 175.4 C29.7 172.6 30.8 169.8 31.5 167.1 C33.4 166.6 35.8 164.8 36.5 162.0 C36.7 159.3 35.0 157.4 33.3 156.0 C32.5 154.2 32.7 151.4 33.4 148.7 C35.4 141.3 38.0 132.1 39.4 125.2 C42.7 118.3 46.2 109.1 49.5 97.6 C51.9 105.4 52.9 116.0 53.8 122.9 C55.2 129.8 55.6 136.7 53.8 143.6 C51.0 152.8 48.7 166.6 48.3 180.4 C47.8 194.2 49.6 205.7 54.2 214.9 C56.1 220.4 56.1 226.4 55.2 231.0 C52.9 240.2 53.8 254.0 57.5 267.8 C59.3 277.0 60.7 286.2 61.1 293.1 C60.2 296.8 55.2 299.6 51.9 301.4 C51.0 303.2 54.7 304.2 64.4 303.7 C71.3 303.7 75.9 303.2 75.4 300.5 C74.5 295.9 72.6 292.2 72.2 286.2 C73.1 274.7 76.8 260.9 76.8 247.1 C76.8 237.9 74.9 231.0 74.9 226.4 C75.9 221.8 75.4 217.2 74.5 212.6 C75.9 201.1 77.2 182.7 77.7 168.9 C78.6 164.3 79.5 162.0 80.0 161.1 Z";
const FARMS = "M27.1 121.1 C24.3 125.7 22.5 132.1 22.0 140.4 C23.9 140.4 25.3 135.8 26.6 131.2 C28.0 127.1 28.9 123.4 27.1 121.1 Z M34.5 122.9 C29.9 127.5 26.2 134.9 25.3 146.8 C28.0 147.8 30.8 142.2 33.1 136.7 C35.4 131.2 37.2 126.6 37.2 122.9 Z M39.5 123.8 C37.7 131.2 35.4 139.5 34.0 148.7 C36.8 149.6 38.6 144.1 40.0 138.6 C41.4 133.0 41.8 127.5 40.9 123.8 Z";
const BODY = {
  front: [
    ["Neck", "M74.0 42.9 C75.9 48.4 77.7 53.9 79.1 59.4 C80.0 59.9 80.0 58.5 80.0 56.7 C79.5 52.1 78.2 47.5 76.8 42.9 Z"],
    ["Traps", "M72.2 48.4 C66.7 53.9 58.4 57.6 51.0 61.3 C56.5 63.1 63.0 62.2 69.4 59.4 C72.6 57.6 74.0 53.9 73.1 49.3 Z"],
    ["SideDelts", "M44.6 64.0 C36.8 65.9 30.8 72.3 29.4 80.6 C28.5 87.0 29.9 93.5 33.5 96.2 C34.9 89.8 36.8 81.5 40.0 75.5 C42.7 70.9 46.4 67.7 51.0 65.0 Z"],
    ["FrontDelts", "M54.7 67.3 C49.2 66.8 43.7 70.5 40.4 76.0 C37.7 80.6 36.3 86.1 36.8 91.6 C40.4 89.8 44.1 85.2 47.3 79.7 C50.1 75.1 52.9 71.4 54.7 67.3 Z"],
    ["UpperChest", "M56.5 65.9 C63.9 62.7 72.2 61.7 80.0 62.2 C80.0 65.9 80.0 70.5 80.0 74.2 C72.2 74.2 63.9 75.1 56.1 78.3 C52.9 75.1 52.9 70.5 56.5 65.9 Z"],
    ["Chest", "M55.6 80.6 C63.4 77.4 72.2 76.0 80.0 76.0 C80.0 82.4 80.0 88.9 79.1 95.3 C73.6 99.0 65.7 99.9 59.3 98.1 C53.8 95.3 51.0 90.7 51.0 87.0 C51.9 83.8 53.3 82.0 55.6 80.6 Z"],
    ["Serratus", "M51.0 98.1 C53.3 99.0 55.2 100.4 56.1 102.7 C53.8 103.6 51.9 102.7 50.6 100.8 Z M51.0 104.5 C53.3 105.4 55.2 106.8 56.1 109.1 C53.8 110.0 51.9 109.1 51.0 107.3 Z M51.5 111.0 C53.8 111.9 55.6 113.3 56.1 115.6 C54.2 116.5 52.4 115.6 51.9 113.7 Z"],
    ["Obliques", "M60.2 99.9 C64.8 102.7 67.6 109.1 68.5 118.3 C69.4 127.5 69.4 134.4 68.5 140.4 C64.8 137.6 60.2 133.0 57.5 127.5 C55.6 122.0 56.5 114.6 57.0 108.2 C57.5 103.6 58.4 100.8 60.2 99.9 Z"],
    ["UpperAbs", "M69.9 98.5 C73.6 97.6 77.2 97.6 80.0 98.1 C80.0 102.2 80.0 105.9 80.0 110.0 C76.8 110.5 73.1 110.5 69.4 110.0 C68.5 105.9 68.5 101.8 69.9 98.5 Z M69.4 111.9 C73.1 111.4 76.8 111.4 80.0 111.9 C80.0 115.6 80.0 119.2 80.0 123.4 C76.8 123.8 73.1 123.8 69.4 123.4 C69.0 119.2 69.0 115.6 69.4 111.9 Z"],
    ["LowerAbs", "M69.9 125.2 C73.1 124.8 76.8 124.8 80.0 125.2 C80.0 128.9 80.0 132.6 80.0 136.3 C76.8 136.7 73.6 136.7 70.3 136.3 C69.9 132.6 69.4 128.9 69.9 125.2 Z M70.8 138.1 C74.0 137.6 77.2 137.6 80.0 138.1 C80.0 145.9 80.0 153.3 79.5 160.6 C76.3 158.3 73.6 153.3 72.2 147.8 C71.3 144.1 70.8 140.9 70.8 138.1 Z"],
    ["Biceps", "M40.9 93.5 C35.4 98.1 32.6 106.4 33.5 115.6 C34.5 121.1 38.1 123.8 41.8 122.0 C46.4 119.2 49.2 111.0 49.6 103.6 C49.6 98.1 46.4 93.5 40.9 93.5 Z"],
    ["Triceps", "M30.8 98.1 C28.5 104.5 27.6 111.9 28.0 119.2 C29.9 118.3 31.7 113.7 32.6 107.3 C33.1 102.7 32.6 99.5 30.8 98.1 Z"],
    ["Forearms", FARMS],
    ["Abductors", "M54.7 142.2 C51.9 147.8 50.1 154.2 50.1 160.6 C52.9 158.8 55.6 154.2 57.5 147.8 C57.5 145.0 56.5 142.7 54.7 142.2 Z"],
    ["Quads", "M52.4 151.4 C48.7 163.4 47.3 178.1 48.7 194.2 C49.6 204.8 52.4 211.2 56.1 214.9 C58.8 212.2 59.8 205.7 59.8 197.4 C59.8 182.7 57.9 168.9 55.2 156.0 C54.7 153.3 53.8 151.4 52.4 151.4 Z M61.1 146.8 C56.5 156.0 55.2 168.9 56.1 181.8 C57.0 192.8 59.8 201.1 63.0 206.6 C66.7 201.1 69.0 191.9 69.9 180.0 C70.3 168.0 69.0 157.0 65.7 149.6 C64.4 146.8 62.5 145.9 61.1 146.8 Z M72.2 185.5 C66.7 190.1 63.0 198.4 63.0 206.6 C63.4 213.1 67.6 217.7 73.1 217.7 C76.8 216.8 77.7 211.2 76.8 203.9 C76.3 196.5 74.9 190.1 72.2 185.5 Z M66.2 145.9 C68.5 145.0 70.3 146.8 71.3 149.6 C73.1 164.3 74.9 178.1 76.8 192.8 C76.8 195.6 75.4 197.4 74.0 195.6 C71.3 181.8 69.0 167.1 66.2 151.4 C65.3 148.7 65.3 146.8 66.2 145.9 Z"],
    ["Adductors", "M73.1 151.4 C75.9 152.4 78.6 155.1 80.0 158.8 C80.0 165.2 79.1 173.5 77.7 181.8 C75.9 174.4 74.0 164.3 73.1 151.4 Z"],
    ["Tibialis", "M62.1 228.7 C58.8 242.5 58.8 261.8 62.5 283.0 C65.3 284.8 68.5 280.2 69.4 273.8 C71.3 259.1 71.3 243.4 68.5 230.6 C66.7 227.3 63.9 227.3 62.1 228.7 Z"],
    ["Calves", "M56.1 227.3 C51.9 237.0 51.9 249.9 55.6 263.7 C58.4 266.0 60.7 260.0 61.1 253.6 C61.1 243.4 59.8 234.7 57.9 228.3 Z M73.6 227.8 C77.7 237.0 78.6 247.1 76.8 262.8 C74.5 265.1 71.7 260.0 71.3 253.6 C70.8 243.4 71.7 234.7 73.6 227.8 Z M73.6 265.5 C75.9 272.9 75.9 282.1 73.6 290.4 C71.7 290.4 70.8 284.8 70.8 279.3 C70.8 273.8 71.7 269.2 73.6 265.5 Z"]
  ],
  back: [
    ["Neck", "M72.6 29.1 C74.5 32.8 76.3 36.4 77.7 41.0 C79.1 41.5 80.0 41.5 80.0 40.1 C80.0 35.5 80.0 31.4 80.0 28.2 C77.2 27.2 74.5 27.7 72.6 29.1 Z"],
    ["Traps", "M72.2 36.4 C69.9 43.8 60.7 51.2 49.6 56.7 C57.0 63.1 66.2 65.9 80.0 66.8 C80.0 58.5 80.0 50.2 80.0 42.9 C78.2 42.0 76.3 40.1 74.9 36.4 C74.0 35.1 72.6 35.1 72.2 36.4 Z"],
    ["MidTraps", "M51.5 59.4 C59.8 66.8 69.0 68.6 80.0 68.6 C80.0 86.1 80.0 102.2 80.0 117.4 C74.5 106.4 66.7 92.6 59.3 79.7 C55.6 72.8 52.9 66.3 51.5 59.4 Z"],
    ["RearDelts", "M48.7 57.6 C40.4 57.6 33.1 63.1 31.2 72.3 C30.3 79.2 31.2 86.1 34.0 91.6 C37.7 87.0 42.3 81.5 46.9 76.9 C51.5 73.2 54.2 68.6 55.2 64.0 C54.2 60.4 51.5 57.6 48.7 57.6 Z"],
    ["SideDelts", "M30.3 68.6 C25.7 75.1 23.4 84.3 23.9 94.4 C26.6 93.5 29.4 88.9 31.2 83.4 C32.6 78.8 32.6 73.2 30.3 68.6 Z"],
    ["UpperBack", "M46.0 72.3 C49.6 70.5 55.2 71.4 57.9 76.0 C57.9 81.5 55.2 86.1 50.6 87.0 C46.9 86.1 44.1 82.4 44.1 77.8 C44.1 75.1 44.6 73.2 46.0 72.3 Z M56.1 69.6 C59.8 68.6 63.4 71.4 65.3 75.1 C63.4 78.8 60.7 81.5 57.9 82.4 C58.8 78.8 58.8 74.2 56.1 69.6 Z M65.7 76.9 C67.6 78.8 68.5 81.5 67.6 84.3 C64.8 84.3 62.1 83.4 60.2 82.4 C63.0 80.6 64.8 78.8 65.7 76.9 Z"],
    ["Lats", "M50.6 87.0 C58.8 86.1 67.1 88.0 72.6 93.5 C76.3 99.9 77.2 107.3 76.3 114.6 C71.7 119.2 66.2 121.1 61.6 122.9 C56.1 115.6 52.4 105.4 49.6 96.2 C48.7 91.6 48.7 88.9 50.6 87.0 Z"],
    ["LowerBack", "M75.4 109.1 C77.7 110.0 79.1 111.9 80.0 113.7 C80.0 122.9 80.0 131.2 80.0 138.6 C77.2 136.7 74.9 132.1 73.6 126.6 C72.6 120.2 73.6 113.7 75.4 109.1 Z"],
    ["Obliques", "M54.2 116.5 C57.9 115.6 60.7 118.3 61.6 122.0 C60.7 126.6 58.8 130.3 56.1 131.2 C54.2 126.6 53.3 121.1 54.2 116.5 Z"],
    ["Abductors", "M61.6 122.9 C68.0 120.2 74.5 122.0 78.6 126.6 C78.6 131.2 76.3 135.8 71.7 138.6 C67.1 138.6 63.0 135.8 60.7 132.1 C59.8 128.4 60.2 125.2 61.6 122.9 Z"],
    ["Glutes", "M60.7 138.6 C68.0 135.8 75.4 136.7 80.0 139.5 C80.0 149.6 80.0 159.7 79.5 168.9 C73.6 171.7 66.2 171.7 61.6 168.0 C57.9 160.6 57.9 148.7 60.7 138.6 Z"],
    ["Triceps", "M33.1 95.3 C38.6 94.8 44.5 96.5 45.1 99.9 C42.8 105.6 37.2 112.4 32.9 121.0 C30.8 124.4 27.5 124.4 26.8 121.5 C26.7 112.4 28.3 102.7 33.1 95.3 Z M27.3 98.2 C22.7 103.9 19.8 112.4 19.0 122.1 C20.6 125.0 23.9 124.4 25.0 122.1 C24.7 113.6 25.4 105.6 27.3 98.2 Z"],
    ["Forearms", "M25.0 121.1 C21.9 125.7 19.6 132.1 18.4 140.4 C20.3 140.4 22.0 135.8 23.8 131.2 C25.5 127.1 26.7 123.4 25.0 121.1 Z M32.3 122.9 C27.3 127.5 23.0 134.9 21.1 146.8 C23.8 147.8 27.0 142.2 29.8 136.7 C32.5 131.2 34.7 126.6 35.0 122.9 Z M37.2 123.8 C34.8 131.2 31.8 139.5 29.7 148.7 C32.4 149.6 34.7 144.1 36.5 138.6 C38.3 133.0 39.2 127.5 38.6 123.8 Z"],
    ["Hamstrings", "M56.1 169.8 C51.5 179.0 50.6 192.8 52.4 206.6 C54.2 213.1 58.8 215.8 62.5 214.0 C65.3 204.8 66.2 191.0 65.3 179.0 C64.4 172.6 60.7 168.9 56.1 169.8 Z M68.5 168.0 C65.7 178.1 65.7 191.0 67.6 203.0 C69.4 205.7 72.6 203.9 74.5 199.3 C76.3 189.2 76.3 177.2 74.9 169.8 C73.1 167.1 70.3 166.2 68.5 168.0 Z M66.7 203.0 C64.8 207.6 64.8 212.2 66.7 215.8 C69.4 216.8 72.2 214.9 73.1 211.2 C73.1 206.6 71.3 203.9 66.7 203.0 Z"],
    ["Adductors", "M77.2 170.8 C79.1 171.7 80.0 173.5 80.0 175.4 C80.0 184.6 80.0 193.8 79.1 203.0 C77.2 193.8 76.3 182.7 77.2 170.8 Z M74.5 180.0 C76.3 192.8 77.2 210.3 75.9 227.8 C74.5 228.7 74.0 226.9 74.0 225.0 C74.9 210.3 74.0 195.6 73.1 181.8 Z"],
    ["Calves", "M57.9 215.8 C52.4 222.7 49.6 234.2 50.6 245.7 C52.4 252.6 57.0 257.2 61.6 256.3 C64.4 248.0 65.3 234.2 64.4 222.7 C63.4 217.7 60.7 214.9 57.9 215.8 Z M67.6 214.9 C72.2 218.6 75.9 227.3 76.8 238.8 C76.8 248.0 74.0 255.4 69.4 257.2 C66.7 249.0 65.7 234.2 65.7 222.7 C65.7 218.6 66.7 215.8 67.6 214.9 Z M54.2 257.2 C57.9 256.3 62.5 257.2 66.2 260.0 C66.2 269.2 63.4 277.5 60.7 283.9 C57.0 278.4 54.2 268.3 54.2 257.2 Z"]
  ]
};
function bodySvg(side, m) {
  const mir = d => '<path d="' + d + '"/><path d="' + d + '" transform="translate(160 0) scale(-1 1)"/>';
  return '<svg viewBox="0 0 160 312" class="bsvg" role="img" aria-label="' + side + ' view">' +
    '<g fill="#262a30" stroke="#6f7680" stroke-width="0.9" stroke-linejoin="round">' + mir(side === 'back' ? BODY_SIL_B : BODY_SIL) + '<ellipse cx="80" cy="25.4" rx="14.3" ry="18.4"/></g>' +
    BODY[side].map(([r, d]) => '<g data-g="r_' + r + '" fill="' + PCOL[pBand(m['r_' + r] ? m['r_' + r].n : 0)] + '" stroke="#9aa1ab" stroke-width="0.7" stroke-opacity="0.85" stroke-linejoin="round">' + mir(d) + '</g>').join('') +
    '<text x="80" y="310" text-anchor="middle" font-size="9" fill="#9aa0a6">' + (side === 'front' ? 'Front' : 'Back') + '</text></svg>';
}
const fmtSets = n => (Math.round(n * 2) / 2).toString();
function openProg() {
  if (!S) return;
  const w = weekSets(), d = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  $('pgh').textContent = 'Weekly sets: ' + d(w.mon) + ' to ' + d(w.sun);
  $('pgb').innerHTML = '<div class="bmap">' + bodySvg('front', w.m) + bodySvg('back', w.m) + '</div>' +
    '<div class="pleg">' + PLEG.map((l, i) => '<span><i style="background:' + PCOL[i] + '"></i>' + l + '</span>') .join('') + '</div>' +
    '<div class="s2">Hard sets logged this week (Mon to Sun). Main muscle counts 1 set, each other listed muscle 0.5. Regions use the same rule. Tap a muscle.</div><div id="pgd"></div>' +
    '<div class="plist">' + (window.CoachMG || []).map(g => { const subs = (window.CoachRegions || []).filter(r => r[2] === g && !(r[0] === g && (window.CoachRegions || []).filter(x => x[2] === g).length === 1));
      return '<div class="pgrp"><button type="button" class="prow" data-g="' + g + '"><span>' + g + '</span><b>' + fmtSets(w.m[g].n) + '</b></button>' + subs.map(r => '<button type="button" class="prow psub" data-g="r_' + r[0] + '"><span>' + esc(r[1]) + '</span><b>' + fmtSets(w.m['r_' + r[0]].n) + '</b></button>').join('') + '</div>'; }).join('') + '</div>';
  progW = w; $('prog').classList.add('open');
  const close = () => $('prog').classList.remove('open');
  if (layerOpen('wm')) swapLayer('wm', 'prog', close); else pushLayer('prog', close);
}
let progW = null;
function progDetail(g) {
  const e = progW && progW.m[g]; if (!e) return;
  const ex = Object.entries(e.ex).sort((a, b) => b[1] - a[1]);
  const rg = (window.CoachRegions || []).find(r => 'r_' + r[0] === g), lbl = rg ? rg[1] + ' (' + rg[2] + ')' : g;
  $('pgd').innerHTML = '<div class="pdet"><b>' + esc(lbl) + ': ' + fmtSets(e.n) + (e.n === 1 ? ' set' : ' sets') + '</b>' + (ex.length ? '<br>' + ex.map(([n, v]) => esc(n) + ' ' + fmtSets(v)).join('<br>') : '<br><span class="s2">Nothing logged this week.</span>') + '</div>';
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
function doDelete(ex) {
  try {
    const k = 'B' + blockOf(viewWeek()) + ':' + dayKey, list = readDeletes().filter(a => P_.norm(a.name) !== P_.norm(slotOf(ex)));
    list.push({ name: slotOf(ex), shown: ex.canonical, from: viewId, at: new Date().toISOString() });
    putSetting('deletes', k, JSON.stringify(list));
    swapMemo = {}; sig = ''; applyState(S, true);
    toast('Deleted ' + ex.canonical + ' for the rest of Block ' + blockOf(viewWeek()) + (rowsFor(ex, true).length ? '. Its logged sets today stay on the card.' : ''), 6000);
  } catch (e) { toast('Could not delete: ' + (e && e.message || e), 6000); }
}
const closeWm = () => { $('wmw').classList.remove('open'); popLayer('wm'); };
$('wmenu').onclick = openWm; $('wmclose').onclick = closeWm;
$('wmw').addEventListener('click', e => {
  if (e.target.id === 'wmw') return closeWm();
  const d = e.target.closest('[data-del]'); if (d) { const ex = cardsFor()[+d.dataset.del]; closeWm(); if (ex) setTimeout(() => delExercise(ex), 60); return; }
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
  $('sbw').value = S ? (bodyweight() || '') : '';
}
$('gear').onclick = () => showSettings();
$('stest').onchange = e => {
  if (e.target.checked) { LS.setItem('coach_test', '1'); toast('Test mode on'); }
  else {
    if (!confirm('Turn off test mode and discard all test sets?')) { e.target.checked = true; return; }
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
function setT(t) { if (t) jset(TKEY(), t); else LS.removeItem(TKEY()); tick(); markActive(); restNotify(t); }
// Rest notification: 'Rest ends at h:mm' when a rest starts (or its target changes); best-effort 'Rest is over' at the end.
let notifKey = '', notifTimer = null;
function restNotify(t) {
  try {
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
        if ('TimestampTrigger' in window) { try { reg.showNotification('Rest is over', Object.assign({ showTrigger: new window.TimestampTrigger(end) }, over)).catch(() => {}); return; } catch (e) {} }
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
let thPx = -1;
function timerBar(on) { // reserve space so the fixed top timer never covers the header or the log popup
  const h = on ? $('timer').offsetHeight : 0;
  if (h !== thPx) { thPx = h; document.documentElement.style.setProperty('--th', h + 'px'); document.body.classList.toggle('timer-on', !!h); }
}
function tick() {
  const t = getT(), el = $('timer');
  if (!t || t.hidden || $('app').style.display === 'none') { el.style.display = 'none'; timerBar(false); return; }
  const sec = (Date.now() - t.start) / 1000;
  if (sec * 1000 > TIMER_MAX) { LS.removeItem(TKEY()); el.style.display = 'none'; timerBar(false); return; }
  el.style.display = 'block'; timerBar(true); $('tt').textContent = fmt(sec); $('ttg').textContent = fmt(t.target);
  $('tex').textContent = (t.firstSide ? 'since first side of ' : 'after ') + t.exercise + (t.next ? ' · ' + t.next : '');
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
const ftOptions = (extra, noMyo) => { ffSel.innerHTML = FT_OPTS.filter(v => !(noMyo && v === 'myo-reps')).concat(extra ? [extra] : []).map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v] || v) + '</option>').join(''); };
ffSel.innerHTML = FT.map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v]) + '</option>').join('');
let editId = null, doneTs = 0, drops = 0, prevRest = null;
// Mini-sets after the opener (myo-reps / myo-rep match): stored as a '[mini N]' token at the end of notes (no new column, works with Code.gs v4).
const MINI_RE = /\s*\[mini (\d+)\]\s*$/i;
const miniOf = r => { const m = MINI_RE.exec((r && r.notes) || ''); return m ? +m[1] : 0; };
const noteTxt = r => String((r && r.notes) || '').replace(MINI_RE, '');
let minis = 0, formSetIdx = 0;
function setMini(n, keep) { minis = Math.max(0, Math.min(20, n | 0)); $('fmv').textContent = String(minis); if (minis && !keep && drops) setDrops(0, true); exclUI(); }
// Last set: myo-reps (mini-sets) or a drop set, never both. Picking one clears the other.
function exclUI() { const both = $('fmini').style.display !== 'none' && $('fdwrap').style.display !== 'none'; $('fxhint').style.display = both ? 'block' : 'none'; $('fdwrap').classList.toggle('dim', both && minis > 0); $('fmini').classList.toggle('dim', both && drops > 0); $('fxhint').textContent = !both ? '' : minis > 0 ? 'Myo-reps on. Tap a drop count to switch to a drop set.' : drops > 0 ? 'Drop set on. Tap + to switch to myo-reps.' : 'Pick one: drop sets or myo-rep mini-sets.'; }
function setKeys(ex, i, n) { const tq = ex ? techFor(ex) : null; return tq ? tqShow(tq, i, n) : []; }
function miniUI() { const ex = formEx, n = ex ? Math.max(plannedCount(ex), rowsFor(ex, true).length + (editId ? 0 : 1)) : 0; const last = formSetIdx >= n - 1; const on = !!ex && !isStretch(ex) && (ffSel.value === 'myo-reps' || minis > 0 || (last && methodOf(ex) !== 'match') || setKeys(ex, formSetIdx, plannedCount(ex)).some(k => k === 'myo' || k === 'match')); $('fmini').style.display = on ? '' : 'none'; exclUI(); }
function setDrops(n, keep) { drops = n; document.querySelectorAll('#fd button').forEach(b => b.classList.toggle('on', +b.dataset.d === n)); if (n && !keep && minis) setMini(0, true); if (n && ffSel.value === 'myo-reps' && !keep) ffSel.value = FT_OPTS.includes('true') ? 'true' : ffSel.value; exclUI(); }
document.querySelectorAll('#fd button').forEach(b => b.onclick = () => setDrops(+b.dataset.d));
$('fmm').onclick = () => setMini(minis - 1); $('fmp').onclick = () => setMini(minis + 1);
ffSel.addEventListener('change', miniUI);
let rowPrefill = null;
// Tap a suggested weight/reps value: same as the LOG check, then focus that field (synchronously, so the phone keyboard opens).
function tapValue(name, idx, f) {
  try {
    const list = cardsFor(), i = list.findIndex(x => x.canonical === name); if (i < 0) return;
    const ex = list[i], st = isStretch(ex); let t;
    logRow(name, idx);
    // single-limb lift: the first check only starts the side timer; a value tap goes straight to the form
    if (ex.single && !st && !$('sheet').classList.contains('open') && (t = getT()) && t.firstSide) logRow(name, idx);
    if (!$('sheet').classList.contains('open')) return;
    const id = f === 'w' ? (st ? (ex.single ? 'fangl' : 'fang') : 'fl') : f === 'R' ? 'frr' : f === 'L' ? 'frl' : 'fr';
    const el = $(id); if (el) { el.focus(); try { el.select(); } catch (e) {} }
  } catch (e) { console.warn('tapValue', e); }
}
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
  if (isStretch(ex)) { prevRest = t && !t.hidden ? (now - t.start) / 1000 : null; if (t && !t.hidden) { t.hidden = true; setT(t); } openForm(i, now); return; }
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
    if (t && !t.hidden) { t.hidden = true; t.firstSide = false; setT(t); } // a new set's log window ends the running rest; the next rest starts when this set is saved
  }
  openForm(i, ts);
}
function bwLine() {
  if (!formEx || !formEx.bodyweight) return;
  const bw = bodyweight(), add = parseFloat($('fl').value) || 0;
  $('fbw').textContent = bw ? 'Total load: ' + bw + ' body weight + ' + add + ' added = ' + (bw + add) + ' lb' : 'Set your body weight in settings (gear) to get total load.';
}
function plUpd() { const t = plateLine(formEx, $('fl').value.trim()); $('fpl').textContent = t ? 'Plates: ' + t : ''; const bb = !!formEx && !isStretch(formEx) && eqKind(formEx) === 'barbell'; $('pbt').style.display = bb ? '' : 'none'; $('fl').inputMode = bb ? 'text' : 'decimal'; $('fl').placeholder = bb ? 'e.g. 185 or 4x45 2x25' : ''; if (!bb) $('pbx').hidden = true; }
// Plate-first: tap plates (one per side each), chips remove, total = 45 bar + 2 x plates.
let pbList = []; // one entry per pair (one plate each side)
function pbRender() { const tot = BAR + 2 * pbList.reduce((a, b) => a + b, 0), cnt = {}; pbList.forEach(p => cnt[p] = (cnt[p] || 0) + 2); $('pbc').innerHTML = Object.keys(cnt).map(Number).sort((a, b) => b - a).map(p => '<button type="button" class="pchip" data-pr="' + p + '" aria-label="Remove a pair of ' + p + 's">' + cnt[p] + ' x ' + p + ' &times;</button>').join('') || '<span class="s2">Empty bar. Each tap adds a pair (one plate per side).</span>'; $('pbtot').textContent = 'Total ' + (Math.round(tot * 10) / 10) + ' lb'; }
$('pbt').onclick = () => { const x = $('pbx'); x.hidden = !x.hidden; if (!x.hidden) { pbList = []; pbRender(); } $('pbtl').textContent = x.hidden ? 'Build from plates' : 'Hide plate builder'; $('pbt').classList.toggle('on', !x.hidden); };
$('pbp').addEventListener('click', e => { const b = e.target.closest('[data-pp]'); if (!b) return; pbList.push(+b.dataset.pp); pbList.sort((a, c) => c - a); pbRender(); });
$('pbc').addEventListener('click', e => { const b = e.target.closest('[data-pr]'); if (!b) return; const i = pbList.indexOf(+b.dataset.pr); if (i >= 0) pbList.splice(i, 1); pbRender(); });
$('pbclr').onclick = () => { pbList = []; pbRender(); };
$('pbuse').onclick = () => { $('fl').value = String(BAR + 2 * pbList.reduce((a, b) => a + b, 0)); bwLine(); plUpd(); };
const isBB = () => !!formEx && !isStretch(formEx) && eqKind(formEx) === 'barbell';
function flPlates() { const pl = isBB() ? P_.platesToLoad($('fl').value, BAR) : null; if (pl && !pl.rest) { $('fl').value = String(pl.load); bwLine(); plUpd(); return true; } return false; }
$('fl').oninput = () => { bwLine(); const pl = isBB() ? P_.platesToLoad($('fl').value, BAR) : null; if (pl && !pl.rest) $('fpl').textContent = '= ' + pl.load + ' lb (tap away to use)'; else plUpd(); };
$('fl').addEventListener('blur', flPlates);
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
  if (!single) { $('hstartr').style.display = 'none'; $('hstart').style.display = on ? 'none' : 'block'; $('hstart').textContent = 'Start hold'; $('hstart').dataset.side = ''; $('hside').textContent = on ? 'Timing hold' : 'Timer fills hold time'; return; }
  // Fixed labels: Start Left / Start Right. After one side stops, prompt the other.
  $('hstart').style.display = on ? 'none' : 'block'; $('hstartr').style.display = on ? 'none' : 'block';
  $('hstart').textContent = 'Start Left'; $('hstart').dataset.side = 'L';
  $('hstartr').textContent = 'Start Right'; $('hstartr').dataset.side = 'R';
  const lDone = !!$('frl').value, rDone = !!$('frr').value;
  $('hside').textContent = on ? 'Timing ' + (hold.el === $('frr') ? 'right' : 'left') + ' side' : (lDone && !rDone ? 'Next: right side' : rDone && !lDone ? 'Next: left side' : 'Pick a side');
}
const startHold = side => { audio(); const single = formEx && formEx.single; const el = !single ? $('fr') : side === 'R' ? $('frr') : $('frl'); hold = { start: Date.now(), el }; holdTick(); holdUI(); };
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
  formEx = ex; editId = row ? row.set_id : null; doneTs = ts || Date.now();
  const today = row ? [] : rowsFor(ex, true), prev = today.length ? today[today.length - 1] : null;
  $('sh').textContent = (row ? 'Edit: ' : '') + ex.canonical;
  $('fll').textContent = ex.bodyweight ? 'Added weight (vest/belt, 0 if none)' : 'Load (lb)';
  stopHold(); const stx = isStretch(ex);
  const sg = row ? null : suggest(ex, today.length);
  $('fl').value = row ? (row.load || '') : sg && sg.load ? sg.load : prev ? prev.load : (ex.bodyweight ? '0' : '');
  $('fr').value = row ? row.reps : (sg && !ex.single ? sg.reps : '');
  if (!row && ex.single && sg) { $('frl').placeholder = sg.repsL || sg.reps; $('frr').placeholder = sg.repsR || sg.reps; }
  $('fsug').textContent = sg ? (sg.est ? 'Estimate: ' : 'Suggested: ') + (sg.load || '-') + ' x ' + sg.reps + ' (' + sg.why + '). Change it if you did something else.' : ''; $('fn').value = row ? noteTxt(row) : ''; $('ferr').textContent = '';
  $('frl').value = row ? (row.left_reps || '') : ''; $('frr').value = row ? (row.right_reps || '') : '';
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
  $('fdwrap').style.display = isMrm ? 'none' : ''; if (isMrm && !(row && +row.drops)) setDrops(0);
  ftOptions(row && row.failure_type === 'drop set' ? 'drop set' : null, isMrm && !(row && row.failure_type === 'myo-reps'));
  ffSel.value = row ? (FT.includes(row.failure_type) ? row.failure_type : 'not to failure') : prev && FT_OPTS.includes(prev.failure_type) && !(isMrm && prev.failure_type === 'myo-reps') ? prev.failure_type : (f.includes('true') ? 'true' : f.includes('technical') ? 'technical' : 'not to failure');
  miniUI();
  if (rowPrefill && !row) {
    if (rowPrefill.load) $('fl').value = rowPrefill.load;
    if (rowPrefill.reps) { if (ex.single) { $('frl').value = rowPrefill.reps; $('frr').value = rowPrefill.reps; } else $('fr').value = rowPrefill.reps; }
    bwLine();
  }
  formKey = !row && rowPrefill ? rowPrefill.key : null; rowPrefill = null;
  setPain(row ? (dayVal(ex, 'pain') || 'none') : 'none');
  $('sheet').classList.add('open'); sheetTop(); pushLayer('sheet', () => closeForm(true)); tick();
}
let formKey = null, formPain = 'none';
function setPain(p) { formPain = p; document.querySelectorAll('#fp button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); }
document.querySelectorAll('#fp button').forEach(b => b.onclick = () => setPain(b.dataset.p));
function openEdit(sid) { const r = viewRows().find(x => x.set_id === sid); if (r) openForm(-1, tsOf(r), r); }
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
function closeForm(fromPop) { if (formEx && !editId) { const t = getT(); if (t && t.firstSide) { t.hidden = true; t.firstSide = false; setT(t); } } $('sheet').classList.remove('open'); stopHold(); formEx = null; editId = null; stopRec(); if (fromPop !== true) popLayer('sheet'); if (S) applyState(S, false); }
$('fcancel').onclick = closeForm;
$('fdel').onclick = () => { const id = editId; if (!confirm('Delete this set?')) return; closeForm(); deleteSet(id, false); };
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
    if (pi >= 0) { Object.assign(q[pi].set, fields); setQ(q); if (!testOn()) flush(); }
    else enqueue({ action: 'edit', set_id: editId, fields });
    closeForm(); toast('Set updated'); return;
  }
  const set = Object.assign({ set_id: uid(), client_ts: doneTs, exercise: ex.canonical, workout: viewId }, fields);
  const before = viewRows();
  if (!workoutRows().length && !manualStart()) jset(WSK(), { wid: viewId, ts: doneTs });
  enqueue({ action: 'log', date: S.today, set });
  const nt = nextTarget(ex.canonical); let t = getT();
  if (t && !t.hidden) { t.target = nt.target; t.next = nt.next; t.firstSide = false; t.hidden = false; t.exercise = ex.canonical; setT(t); }
  else { t = { start: doneTs, exercise: ex.canonical, target: nt.target, next: nt.next }; setT(t); }
  $('sheet').classList.remove('open'); formEx = null; stopRec(); popLayer('sheet');
  update(); feedback(ex, set, before, prevRest, t ? t.target : 120);
};

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
    if (pi >= 0) { Object.assign(q[pi].set, fields); setQ(q); if (!testOn()) flush(); }
    else enqueue({ action: 'edit', set_id: editId, fields });
    closeForm(); toast('Hold updated'); return;
  }
  const set = Object.assign({ set_id: uid(), client_ts: doneTs, exercise: ex.canonical, workout: viewId }, fields);
  if (!workoutRows().length && !manualStart()) jset(WSK(), { wid: viewId, ts: doneTs });
  enqueue({ action: 'log', date: S.today, set });
  const nt = nextTarget(ex.canonical);
  setT({ start: Date.now(), exercise: ex.canonical, target: nt.target || 60, next: nt.next, hidden: false });
  $('sheet').classList.remove('open'); formEx = null; stopRec(); popLayer('sheet');
  update(); toast('Hold saved: ' + setTxt(set), 4000);
}
// ---------- Feedback toasts ----------
const JOKES = [
  'Your rest timer called. It misses you.', 'That bench is not going to press itself.', 'Plates do not rerack themselves. Neither do excuses.',
  'Somewhere a protein shake is proud of you.', 'Chest day: the most important meeting of the week.', 'Good set. The mirror noticed.',
  'Hydrate. Your muscles are 75% water and 25% stubbornness.', 'Remember: the dumbbells were here before you, and they will be here after.',
  'Every rep is a deposit. Compound interest starts now.', 'Form check: excellent. Ego check: also passing.'];
function feedback(ex, set, before, rest, target) {
  const keys = keysOf(ex), prior = before.filter(r => keys.has(P_.norm(r.exercise)));
  const w = parseFloat(set.total_load || set.load), reps = repN(set);
  const msgs = [];
  if (w > 0 && reps > 0 && prior.length) {
    const e = P_.e1rm(w, reps), best = Math.max(0, ...prior.map(r => { const x = P_.e1rm(loadOf(r), repN(r)); return x ? x.ep : 0; }));
    const maxW = Math.max(0, ...prior.map(r => parseFloat(loadOf(r)) || 0));
    const repsAt = Math.max(0, ...prior.filter(r => (parseFloat(loadOf(r)) || 0) >= w).map(r => repN(r) || 0));
    if (e && best && e.ep > best) msgs.push('New best estimated 1RM: ' + e.ep + ' lb (Epley), ' + e.br + ' (Brzycki).');
    else if (w > maxW) msgs.push('Heaviest ' + ex.canonical.toLowerCase() + ' logged yet: ' + w + ' lb.');
    else if (repsAt && reps > repsAt) msgs.push('Rep PR: ' + reps + ' reps at ' + w + ' lb.');
  }
  if (!msgs.length && rest != null && rest > target + 90) msgs.push(['Rest ran ' + fmt(rest) + ' vs ' + fmt(target) + ' target. Tap Set done as you rack it, log while you rest.', 'Long rest (' + fmt(rest) + '). Your muscles were ready a while ago.'][Math.floor(Math.random() * 2)]);
  if (!msgs.length && Math.random() < 0.33) msgs.push(JOKES[Math.floor(Math.random() * JOKES.length)]);
  toast(msgs.length ? msgs[0] : 'Saved', msgs.length ? 7500 : 3000);
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
function fill(txt) { const p = P_.parseSpeech(txt, { barbell: isBB(), bar: BAR });
  if (p.load != null) $('fl').value = p.load; if (p.reps != null) $('fr').value = p.reps; if (p.ft === 'drop set') { ffSel.value = 'true'; setDrops(Math.max(1, drops)); } else if (p.ft) ffSel.value = p.ft; miniUI(); if (p.notes) $('fn').value = p.notes;
  $('heard').textContent = 'Heard: "' + txt + '". Check and edit, then Save.'; }

// ---------- Boot ----------
badge();
if (!U || !K) showSettings(); else { load(true); flush(); }
setInterval(() => { if (U && K && document.visibilityState === 'visible' && !flushing) load(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && U && K) { load(); flush(); tick(); } });
window.coachReady = true;
} catch (err) { if (window.coachFatal) window.coachFatal((err && err.message) || err); throw err; }
})();
