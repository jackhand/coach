(function () {
'use strict';
try {
const P_ = window.CoachParse;
const $ = id => document.getElementById(id);
// Single source for the version label. Bump with the ?v= asset queries in index.html and the coach-shell cache name in sw.js.
const APP_VERSION = 70;
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
// ONE equipment type for every equipment-specific feature (see CoachEquipType in exlist.js).
// Explicit equip field (library / built-in list) first, then the built-in catalog entry, name fallback last.
function equipType(ex) {
  if (!ex) return 'other';
  const nm = ex.canonical || ex.name || '', c = ex.equip ? null : catFind(nm);
  return window.CoachEquipType({ name: nm, equip: ex.equip || (c && c.equip) || '', bodyweight: ex.bodyweight });
}
const PLATE_T = { barbell: 1, hexbar: 1, ez: 1 }, BAR_DEF = { barbell: 45, hexbar: 45, ez: 45 }; // Smith bars vary and are often counterbalanced: no plate math
const BAR_NAME = { barbell: 'bar', hexbar: 'hex bar', ez: 'EZ bar' };
const plateT = ex => !!ex && !isStretch(ex) && !!PLATE_T[equipType(ex)];
// Bar weight: per-exercise equipment setup can say e.g. "55 lb bar" or "bar weight 55"; else the type default.
function barWeight(ex) {
  const t = equipType(ex), s = String((ex && setupFor(ex)) || '');
  const m = s.match(/\b(\d+(?:\.\d+)?)\s*(?:lb|lbs)\s*(?:hex |trap |ez |smith )?bar\b/i) || s.match(/\bbar\s*(?:weight|wt)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const v = m ? parseFloat(m[1]) : NaN; return v > 0 && v < 200 ? v : (BAR_DEF[t] || BAR);
}
function platesFor(w, bar) { bar = bar || BAR; let side = (w - bar) / 2; if (!(side > 0)) return w > 0 && w <= bar ? 'Empty bar' : ''; const out = []; for (const p of PLATES) while (side >= p - 1e-9) { out.push(p); side -= p; } return out.join(' + ') + ' per side' + (side > 0.01 ? ' (+' + (Math.round(side * 2 * 10) / 10) + ' lb left over)' : ''); }
const platesShort = (w, bar) => { const p = platesFor(+w, bar); return p ? p.replace(' per side', ' /side') : ''; };
const plateLine = (ex, w) => plateT(ex) && +w > 0 ? platesShort(w, barWeight(ex)) : '';
// Warm-up kind: 'plate' (bar types), 'dumbbell', or '' (no ramp).
const eqKind = ex => plateT(ex) ? 'plate' : equipType(ex) === 'dumbbell' ? 'dumbbell' : '';
function warmFor(ex, list) {
  if (isStretch(ex) || ex.bodyweight) return null;
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
  LIB.forEach(e => { seen.add(P_.norm(e.name)); out.push({ name: e.name, aliases: e.aliases, muscles: e.muscles, rest_muscle: e.rest_muscle, equip: e.equip || '', types: e.types, video: e.video, mine: true }); });
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
if (testOn()) window.__coachT = { get days() { return days; }, get viewId() { return viewId; }, open: id => openWorkout(id), equipType, plateT, plateLine, barWeight, warmFor: (ex, l) => warmFor(ex, l || [ex]), stepFor, eqFactor, eqOf: c => eqOf(c), platesFor };
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
      const v = (e.ep + e.br) / 2 * eqFactor(ex) / eqFactor(o)
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
      '<div class="setup" data-su="' + i + '"><b>Setup:</b> <span id="su' + i + '">' + esc(setupFor(ex) || (plateT(ex) ? 'tap to add (bar weight, e.g. 45 lb ' + (BAR_NAME[equipType(ex)] || 'bar') + ')' : 'tap to add (seat, pins, angle)')) + '</span> <span class="ed">edit</span></div>' +
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
  const v = prompt('Equipment setup for ' + ex.canonical + (plateT(ex) ? ' (seat, pins, angle; bar weight like "45 lb ' + (BAR_NAME[equipType(ex)] || 'bar') + '" sets plate math, now ' + barWeight(ex) + ' lb):' : ' (seat, pins, bench angle):'), cur);
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
// Body map traced from the reference chart (v70). Silhouettes are full outlines; muscle paths are the left half, mirrored.
const BODY_SIL = "M77.1 8.5 C76.1 8.6 75.3 8.8 74 9.4 C72.6 10.1 71 10.9 69.7 12.1 C68.4 13.4 67.3 15 66.6 16.3 C65.8 17.5 65.7 18.1 65.5 19.1 C65.3 20.1 65.3 20.8 65.4 21.9 C65.6 23.1 66.4 24.3 66.2 25.5 C66.1 26.7 64.9 27.5 64.6 28.4 C64.3 29.4 64.3 29.7 64.6 30.7 C64.9 31.6 65.5 32.8 66.2 33.7 C67 34.6 68.1 34.8 68.6 35.6 C69.1 36.5 68.8 37.4 69.2 38.2 C69.6 39.1 70.5 39.9 70.7 40.5 C70.9 41.1 70.7 41.1 70.4 41.6 C70.1 42.1 69.3 42.5 69.1 43.4 C68.9 44.4 69.4 46 69.4 46.9 C69.3 47.7 70.1 47.2 69 48.1 C67.8 49.1 65.1 51 63.1 52.2 C61 53.4 59.6 53.3 57.6 54.5 C55.5 55.8 52.9 58.3 51.6 59.2 C50.3 60.1 51.1 59.6 50.2 59.6 C49.4 59.6 48.6 59.1 46.9 59.4 C45.1 59.7 42.5 60.3 40.7 61.2 C38.9 62 37.7 63.4 36.9 64.3 C36 65.2 36.2 64.6 35.8 66.1 C35.3 67.7 34.6 69.9 34.4 73 C34.2 76.1 35.1 80.8 34.7 83.2 C34.4 85.7 33.3 84.8 32.4 86.6 C31.6 88.4 30.6 90.5 30 93 C29.4 95.5 29.1 98.5 29 100.3 C28.9 102.1 29.4 102.1 29.3 103 C29.2 104 28.5 104.7 28.2 105.6 C27.9 106.6 28.4 107 27.9 108.3 C27.3 109.6 26.2 111.6 25.4 112.8 C24.6 114.1 23.6 113.6 23.3 115.3 C22.9 117 23.8 120.3 23.6 122.4 C23.3 124.5 21.9 125.4 21.8 127 C21.6 128.6 22.6 130.3 22.7 131.5 C22.8 132.7 22.3 132.1 22.2 133.7 C22.2 135.4 21.9 138.6 22.3 140.8 C22.7 143 24.2 144.5 24.5 145.9 C24.8 147.3 24.1 147.4 24 148.6 C24 149.8 24.4 151 24.4 152.8 C24.4 154.5 24.2 156.7 24 158.3 C23.8 159.8 23.2 160.5 23.1 161.3 C23.1 162.1 23 161.7 23.6 162.5 C24.2 163.4 25.8 164.7 26.6 165.8 C27.4 166.9 27.4 167.9 28 168.7 C28.6 169.6 29.3 170.1 29.9 170.4 C30.4 170.8 30.3 170.8 31.1 170.6 C31.9 170.4 33.4 169.9 34.4 169.4 C35.3 168.9 35.7 168.8 36.3 167.9 C37 167.1 37.7 166.4 37.9 164.6 C38 162.7 37.7 159.6 37.4 157.8 C37.1 156 36.9 155.5 36.4 154.6 C35.9 153.6 35.4 153 34.7 152.3 C34.1 151.7 33.3 151.4 32.8 150.9 C32.4 150.5 32.1 151.5 32.2 149.9 C32.2 148.3 32.6 144.2 33 142.1 C33.4 140 33.8 139.3 34.4 138.4 C35.1 137.4 35.9 137.4 36.7 136.7 C37.6 135.9 38.5 135 39.3 134.1 C40.1 133.2 40.8 132.4 41.4 131.5 C41.9 130.6 42.2 130.2 42.6 129 C42.9 127.8 43.3 126.2 43.3 124.9 C43.2 123.6 42.5 123.2 42.4 121.8 C42.2 120.4 42.1 118.5 42.4 117 C42.7 115.4 43.7 114.4 44.1 113.3 C44.4 112.2 43.7 112.1 44.5 110.9 C45.3 109.7 47.4 107.6 48.4 106.8 C49.4 105.9 49.5 106.3 50 106.3 C50.6 106.3 50.7 106.2 51.6 106.7 C52.5 107.2 53.9 107.9 54.8 109 C55.7 110.1 56.4 110 56.7 112.6 C57 115.1 56.4 120.8 56.4 123.2 C56.5 125.5 56.7 124.6 57 125.5 C57.4 126.4 58.2 127.5 58.5 128.2 C58.7 129 58.7 129.2 58.7 129.8 C58.6 130.4 58.6 130.8 58.1 131.4 C57.6 131.9 56.8 131.9 55.9 132.7 C55 133.6 53.8 135.1 53.2 136.2 C52.6 137.3 52.6 137.7 52.4 138.9 C52.3 140.1 52.3 141.8 52.4 143 C52.5 144.2 53.3 144.3 53.2 145.6 C53 146.8 51.7 147.6 51.5 149.8 C51.3 152.1 51.9 155.8 51.9 157.9 C51.9 160 52.2 158.3 51.4 161.5 C50.6 164.8 48.1 170.2 47.4 175.9 C46.7 181.7 47.3 189.7 47.4 193.4 C47.6 197 47.8 195.2 48.1 196.1 C48.5 196.9 49 197.4 49.4 198.2 C49.7 199 50 199.8 50 200.3 C50.1 200.9 50 201 49.6 201.5 C49.3 202 48.5 202.5 48.1 203 C47.8 203.6 47.9 204.1 47.9 204.5 C47.9 204.9 48 205.1 48.2 205.4 C48.3 205.7 48.1 206 48.9 206 C49.7 206 51.8 205.5 52.6 205.5 C53.4 205.4 53 205.4 53.5 205.9 C54 206.3 54.6 207.6 55.4 207.9 C56.2 208.3 57.3 207.9 58 208 C58.7 208.1 58.9 208.2 59.4 208.4 C59.8 208.6 60.1 208.8 60.3 209.1 C60.6 209.5 60.7 209.2 60.9 210.4 C61.1 211.5 61.6 214.3 61.6 215.3 C61.6 216.3 61.6 215.8 61 216.2 C60.5 216.5 59.1 217 58.5 217.4 C57.8 217.9 58.2 216.9 57.5 218.5 C56.8 220.1 55.2 224.1 54.4 226.3 C53.6 228.6 53.3 229.4 53.3 231.1 C53.2 232.8 54 234.1 54.2 235.8 C54.4 237.4 54 239 54.3 240.2 C54.6 241.4 55.2 241.3 55.7 242.4 C56.2 243.6 55.9 244.4 56.9 246.6 C57.9 248.7 60.3 251.1 61.3 254.3 C62.3 257.6 61.8 261.3 62.3 264.6 C62.8 267.9 63.6 269.9 64.1 272.6 C64.5 275.3 64.8 277.9 65 279.7 C65.1 281.4 65.1 281.4 65 282.1 C64.8 282.9 65.2 282.4 64.3 283.7 C63.4 285 60.9 287.9 60 289.2 C59 290.6 59.7 290.5 58.9 291.2 C58.1 291.9 56 292.5 55.3 293.1 C54.6 293.6 54.7 293.9 54.8 294.3 C55 294.7 55.3 295.1 56.2 295.4 C57.1 295.6 58.6 295.6 59.8 295.5 C61 295.4 61.8 294.8 62.7 294.7 C63.7 294.7 64.3 295.1 65.1 295.1 C65.9 295 65.7 294.7 67.2 294.6 C68.8 294.5 72.2 294.6 73.5 294.5 C74.9 294.4 74.4 294.2 74.7 293.9 C74.9 293.7 75.1 293.6 75.1 293.2 C75.2 292.7 75.4 292.5 75 291.2 C74.6 290 73.4 288.3 73 286.2 C72.6 284.1 73.2 281.2 72.9 279.7 C72.6 278.1 71.8 278.2 71.5 277.6 C71.2 277 71.2 277.4 71.3 276.4 C71.4 275.4 71.8 274 72.1 272.1 C72.3 270.2 72.3 267.4 72.6 265.7 C72.9 264 73.5 263.8 73.7 262.8 C74 261.8 73.8 261.2 74.1 260.1 C74.4 258.9 75.4 257.7 75.6 256.5 C75.9 255.3 74.8 255.3 75.3 253.4 C75.8 251.6 77.7 248.2 78.3 246.1 C79 244 78.7 243.7 78.8 241.9 C78.9 240 79.1 237.9 78.8 235.8 C78.5 233.6 77.9 231.4 77.3 229.8 C76.8 228.3 76.3 228.4 75.7 227.2 C75.1 226 74.5 224 74 223.1 C73.4 222.1 73.2 222.3 72.9 222 C72.5 221.8 72.4 221.5 71.8 221.7 C71.3 221.9 70.3 222.9 69.6 223.1 C68.9 223.4 68.6 223.3 68.1 223.2 C67.7 223.1 67.3 222.8 67.1 222.4 C66.8 222 66.7 221.5 66.8 221 C66.9 220.5 66.9 219.9 67.7 219.6 C68.4 219.3 70.1 219.8 70.9 219.5 C71.8 219.3 71.8 219.4 72.3 218.2 C72.8 217.1 72.9 214.7 73.7 213.3 C74.5 211.8 76 211.3 76.7 210.2 C77.5 209.2 77.4 208.8 77.8 207.3 C78.2 205.9 78.6 203.4 79 202.3 C79.4 201.1 79.7 201 80.1 201 C80.4 201 80.5 200.8 81 202.3 C81.5 203.8 82.3 207.7 82.8 209.3 C83.4 210.9 83.3 210.5 83.9 211.1 C84.5 211.8 85.5 211.8 86.2 213.1 C86.9 214.3 87.2 217.1 87.7 218.2 C88.2 219.4 88.2 219.3 89.1 219.5 C89.9 219.8 91.6 219.3 92.3 219.6 C93.1 219.9 93.1 220.5 93.2 221 C93.3 221.5 93.2 222 92.9 222.4 C92.7 222.8 92.3 223.1 91.9 223.2 C91.4 223.3 91.1 223.4 90.4 223.1 C89.7 222.9 88.7 221.9 88.2 221.7 C87.6 221.5 87.5 221.8 87.1 222 C86.8 222.3 86.6 222.1 86 223.1 C85.5 224 84.9 226 84.3 227.2 C83.7 228.4 83.2 228.3 82.7 229.8 C82.1 231.4 81.5 233.6 81.2 235.8 C80.9 237.9 81.1 240 81.2 241.9 C81.3 243.7 81 244 81.7 246.1 C82.3 248.2 84.2 251.6 84.7 253.4 C85.2 255.3 84.1 255.3 84.4 256.5 C84.6 257.7 85.6 258.9 85.9 260.1 C86.2 261.2 86 261.8 86.3 262.8 C86.5 263.8 87.1 264 87.4 265.7 C87.7 267.4 87.7 270.2 87.9 272.1 C88.2 274 88.6 275.4 88.7 276.4 C88.8 277.4 88.8 277 88.5 277.6 C88.2 278.2 87.4 278.1 87.1 279.7 C86.8 281.2 87.4 284.1 87 286.2 C86.6 288.3 85.4 290 85 291.2 C84.6 292.5 84.8 292.7 84.9 293.2 C85 293.7 85.1 293.8 85.5 294 C85.8 294.2 85.3 294.4 86.6 294.5 C87.9 294.6 91.3 294.5 92.8 294.6 C94.3 294.7 94.1 295 94.9 295.1 C95.7 295.1 96.2 294.7 97.2 294.7 C98.1 294.8 98.9 295.4 100.1 295.5 C101.2 295.6 102.7 295.6 103.6 295.4 C104.5 295.2 104.7 295 105 294.6 C105.3 294.3 105.8 294.1 105.1 293.5 C104.4 292.9 101.9 291.9 101 291.1 C100.1 290.4 101 290.6 100 289.2 C99.1 287.9 96.5 284.9 95.6 283.6 C94.7 282.3 95 283.9 95 281.9 C95.1 279.9 95.5 275.7 95.9 272.6 C96.4 269.5 97.2 267.2 97.7 264.6 C98.2 261.9 98.4 259.7 98.6 257.8 C98.8 256 97.8 256.5 98.7 254.5 C99.5 252.4 102.1 248.6 103.1 246.5 C104.2 244.3 103.8 243.6 104.3 242.4 C104.7 241.3 105.4 241.4 105.7 240.2 C106 239 105.6 237.4 105.8 235.8 C106 234.1 106.8 232.8 106.7 231.1 C106.7 229.4 106.4 228.6 105.6 226.3 C104.8 224.1 103.2 220.1 102.5 218.5 C101.8 216.9 102.2 217.9 101.5 217.4 C100.9 217 99.5 216.6 98.9 216.1 C98.3 215.6 98.3 215.3 98.3 214.6 C98.3 214 98.9 213.3 99 212.5 C99.2 211.7 99 210.7 99.2 210 C99.4 209.3 99.6 209.1 100.1 208.7 C100.6 208.4 101.1 208.2 101.9 208 C102.7 207.9 103.6 208.4 104.6 207.9 C105.6 207.5 106.2 205.8 107.3 205.5 C108.4 205.1 109.8 206.1 110.7 206.1 C111.5 206 111.7 205.7 112 205.2 C112.2 204.7 112.2 203.9 112 203.3 C111.7 202.6 110.7 202 110.4 201.5 C110 200.9 109.9 200.9 110 200.3 C110 199.8 110.3 199 110.6 198.2 C111 197.4 111.5 196.9 111.9 196.1 C112.2 195.2 112.4 197 112.6 193.4 C112.7 189.8 112.8 180.1 112.6 176.2 C112.4 172.2 112.3 174 111.5 171.3 C110.8 168.6 109.2 163.7 108.6 161.3 C108 158.9 108.1 160 108.1 157.9 C108.1 155.9 108.7 152.1 108.5 149.8 C108.3 147.6 107 146.8 106.8 145.6 C106.7 144.3 107.5 144.2 107.6 143 C107.7 141.7 107.7 139.9 107.5 138.7 C107.4 137.5 107.4 137.3 106.8 136.2 C106.2 135.1 105 133.6 104.1 132.7 C103.2 131.9 102.4 131.9 101.9 131.4 C101.4 130.9 101.4 130.6 101.3 130 C101.3 129.5 101.2 129.2 101.5 128.3 C101.8 127.5 102.6 126.5 103 125.5 C103.3 124.6 103.4 124.8 103.6 123.2 C103.7 121.6 103.6 118.2 103.6 116.6 C103.5 115.1 103.2 115.2 103.1 114.4 C103.1 113.6 103 113.4 103.4 112.4 C103.8 111.4 104.5 109.8 105.4 108.8 C106.3 107.8 107.5 107.2 108.3 106.8 C109.1 106.3 109 106.3 109.6 106.3 C110.3 106.3 110.8 106.1 111.9 107 C113 107.8 114.8 109.9 115.6 111 C116.3 112.1 115.6 112.2 115.9 113.3 C116.3 114.3 117.3 115.4 117.6 117 C117.9 118.5 117.8 120.4 117.6 121.8 C117.5 123.2 116.8 123.6 116.7 124.9 C116.7 126.1 117 127.7 117.4 128.9 C117.7 130.1 118 130.6 118.6 131.5 C119.2 132.4 119.4 132.8 120.7 134.1 C122 135.4 124.7 137.2 125.8 138.7 C126.9 140.2 126.7 141 127 142.3 C127.3 143.6 127.4 144.4 127.5 145.8 C127.6 147.2 128.1 149 127.7 150.2 C127.3 151.4 126 151.4 125.2 152.4 C124.4 153.4 123.6 154.7 123.1 155.7 C122.6 156.7 122.8 156.3 122.6 157.9 C122.4 159.6 121.9 162.9 122.2 164.8 C122.5 166.7 123.1 167.7 124.3 168.7 C125.5 169.8 127.8 170.3 128.9 170.6 C130 170.9 129.7 170.7 130.2 170.4 C130.8 170.1 131.2 169.8 131.8 169 C132.4 168.1 132.6 166.8 133.5 165.7 C134.3 164.5 135.8 163.3 136.4 162.5 C137 161.8 136.9 162.3 136.8 161.5 C136.7 160.8 136.2 159.8 136 158.3 C135.8 156.7 135.6 154.5 135.6 152.8 C135.6 151 136 149.8 136 148.6 C135.9 147.4 135.2 147.3 135.5 145.9 C135.8 144.5 137.3 143 137.7 140.8 C138.1 138.6 137.8 135.4 137.8 133.7 C137.7 132.1 137.2 132.7 137.3 131.5 C137.4 130.3 138.4 128.5 138.2 126.9 C138.1 125.2 136.7 124.5 136.4 122.4 C136.2 120.3 137 116.8 136.7 115.1 C136.4 113.4 135.5 114.1 134.7 112.9 C133.9 111.7 132.7 109.6 132.1 108.3 C131.6 107 132.1 106.6 131.8 105.6 C131.5 104.7 130.8 104 130.7 103 C130.6 102.1 131.1 102.1 131 100.3 C130.9 98.5 130.6 95.5 130 93 C129.4 90.5 128.3 88.2 127.6 86.6 C126.8 85 126.2 84.9 125.7 84.2 C125.3 83.6 125.3 85.1 125.2 83 C125.2 81 125.6 75.3 125.6 72.9 C125.6 70.5 125.4 70.9 125.1 69.5 C124.8 68.1 124.5 66.5 123.9 65.3 C123.3 64.2 122.6 63.7 121.7 62.9 C120.8 62.1 120.3 61.5 118.8 60.9 C117.2 60.3 114.8 59.6 113.1 59.4 C111.5 59.2 110.6 59.6 109.8 59.6 C108.9 59.6 109.7 60.1 108.4 59.2 C107.1 58.3 104.5 55.8 102.4 54.5 C100.4 53.3 99 53.3 96.9 52.2 C94.9 51.1 92.4 49.3 91.2 48.4 C90.1 47.4 90.7 47.9 90.6 47 C90.6 46.1 91.1 44.4 90.9 43.4 C90.7 42.4 89.9 42.1 89.6 41.6 C89.3 41.1 89.1 41.1 89.3 40.5 C89.5 39.9 90.4 39.1 90.8 38.2 C91.2 37.4 90.9 36.5 91.4 35.6 C91.9 34.8 93 34.6 93.8 33.7 C94.5 32.8 95.1 31.6 95.4 30.7 C95.7 29.7 95.7 29.4 95.4 28.4 C95.1 27.5 93.9 26.7 93.8 25.5 C93.6 24.3 94.5 23.2 94.6 21.9 C94.7 20.6 94.5 19.4 94.3 18.4 C94.1 17.4 93.9 17.2 93.4 16.3 C92.9 15.4 92.5 14.4 91.5 13.4 C90.5 12.3 88.9 11.1 87.8 10.3 C86.7 9.6 86.4 9.5 85.6 9.2 C84.7 8.9 84 8.6 83 8.6 C82 8.5 81 9.1 79.9 9.1 C78.9 9.1 78.2 8.5 77.1 8.5 Z";
const BODY_SIL_B = "M77.7 6.4 C76.8 6.4 76.1 6.6 75.1 7 C74.1 7.5 72.8 8.3 72 9 C71.1 9.7 70.8 9.8 70.2 10.9 C69.5 12 68.6 14.1 68.3 15.1 C68 16 68.1 15.5 68.3 16.2 C68.5 16.9 69.3 16.7 69.5 18.9 C69.7 21 69.3 25.9 69.5 28.1 C69.6 30.3 70.3 30.2 70.3 31.3 C70.3 32.3 69.6 33 69.5 34.1 C69.4 35.2 69.3 36.2 69.5 37.4 C69.6 38.7 70.5 39.7 70.4 40.8 C70.3 41.9 69.4 43 69 43.6 C68.6 44.3 68.7 44.1 68 44.4 C67.3 44.8 66 44.9 65.1 45.4 C64.2 45.9 64 46.7 63.1 47.1 C62.1 47.6 61.5 47.3 59.9 48 C58.4 48.6 55.6 49.9 54.4 50.5 C53.3 51.1 53.9 50.7 53.5 51.4 C53.2 52 52.9 53.4 52.5 54.1 C52.1 54.8 52 54.8 51.4 55.1 C50.7 55.4 50.2 55.7 49 55.8 C47.8 55.8 46.1 55.2 44.6 55.4 C43.2 55.5 42.5 55.7 41 56.7 C39.5 57.7 37.6 59.4 36.2 61 C34.8 62.5 34.2 63.3 33.3 65.1 C32.4 67 31.7 69.1 31.3 71.3 C30.9 73.6 31.8 75.8 31 77.6 C30.3 79.4 28.1 80 27 81.4 C25.9 82.8 25.6 82.7 25.1 85.4 C24.5 88.1 24.2 93.9 24 96.4 C23.9 98.9 24.6 98.2 24.4 99.3 C24.1 100.5 23 101.8 22.7 102.8 C22.5 103.8 23 104.4 23 105.1 C23 105.7 22.9 105.9 22.6 106.5 C22.4 107.1 22.2 107.9 21.5 108.5 C20.9 109.2 19.7 109.6 19.1 110.1 C18.5 110.5 18.7 110 18.2 111.1 C17.6 112.2 16.6 114.8 16.1 116.2 C15.7 117.6 16 117.8 15.7 118.7 C15.4 119.5 14.7 119.6 14.6 120.9 C14.5 122.3 15.1 124.8 15 126.2 C15 127.6 14.3 128.2 14.2 128.9 C14 129.7 13.7 128.3 14.1 130.4 C14.6 132.5 16.5 138 16.7 140.5 C17 143 15.7 143.1 15.5 144.1 C15.3 145.1 15.4 145.1 15.5 145.9 C15.7 146.7 16.2 147.5 16.4 148.4 C16.5 149.2 16.7 149.4 16.4 150.7 C16.1 152.1 15 154.8 14.7 156 C14.4 157.3 14.5 157.1 14.6 157.7 C14.7 158.3 14.9 159 15.3 159.5 C15.7 160 16.1 160.3 16.9 160.4 C17.7 160.6 18.9 160.6 19.8 160.4 C20.6 160.3 21.1 160.9 21.5 159.4 C21.8 157.9 21.7 153.6 21.9 152.2 C22.1 150.7 22 151.7 22.5 151.3 C22.9 151 23.8 150.7 24.3 150.4 C24.7 150.1 24.9 150.4 25 149.6 C25.1 148.8 24.5 146.8 24.6 145.8 C24.8 144.8 25.1 145.9 26 144.1 C26.8 142.3 28.8 137.8 29.5 135.8 C30.3 133.8 29.7 133.8 30.1 133 C30.5 132.1 31.3 131.8 31.9 131 C32.5 130.3 32.5 130.4 33.4 128.6 C34.3 126.7 36.3 123.4 36.9 120.8 C37.5 118.2 36.4 115.8 36.5 114.1 C36.6 112.3 37.3 112.1 37.4 111.1 C37.5 110.1 37.1 109.1 37.2 108.4 C37.3 107.7 37.4 107.8 38 107.3 C38.6 106.8 39.7 106.4 40.6 105.8 C41.4 105.1 41.9 104.7 42.6 103.7 C43.2 102.7 43.9 101.5 44.1 100.4 C44.3 99.4 43.8 98.4 43.8 97.6 C43.9 96.9 44.1 96.8 44.4 96.4 C44.8 96 45.2 95.7 45.7 95.7 C46.3 95.6 46.9 95.7 47.3 95.9 C47.8 96.1 47.8 96.2 48.2 96.8 C48.6 97.5 48.1 98.1 49.4 99.7 C50.6 101.2 53.9 104.3 55.3 105.6 C56.7 106.9 56.8 106.4 57.3 107 C57.8 107.5 58 107.5 58.1 108.5 C58.2 109.6 58 111.4 57.8 112.9 C57.5 114.4 57 115.7 56.9 117 C56.8 118.2 57.2 118.7 57.2 119.8 C57.2 120.9 57.3 121.1 56.9 123.3 C56.4 125.4 55 129.3 54.6 131.8 C54.2 134.4 54.5 135.9 54.6 137.6 C54.8 139.2 55.5 139.8 55.5 140.9 C55.5 142.1 54.9 141.9 54.6 144 C54.4 146.1 54.4 150.5 54.1 152.6 C53.8 154.8 53.5 154.9 53 156.1 C52.5 157.4 51.7 158.4 51.3 159.7 C50.8 161.1 50.6 162.8 50.3 163.7 C50.1 164.5 50.2 164.1 49.8 164.4 C49.4 164.7 48.4 165 48 165.4 C47.6 165.7 47.3 165.6 47.6 166.3 C47.9 166.9 49.2 168.2 49.5 169 C49.9 169.7 49.6 169.6 49.5 170.2 C49.4 170.8 48.9 171.4 48.8 172.2 C48.7 173 48.5 173.4 48.8 174.5 C49.1 175.5 50.3 176.9 50.6 178.2 C50.9 179.4 50.7 180.3 50.5 181.3 C50.2 182.3 49.3 183.2 49 183.8 C48.7 184.4 48.7 184.1 48.9 184.8 C49.2 185.5 49.9 185.9 50.5 187.6 C51 189.3 51.6 192.5 51.9 194.3 C52.2 196 51.5 195.9 52 197.3 C52.5 198.7 54 200.9 54.6 202.1 C55.1 203.4 55 203.1 55.1 204.3 C55.2 205.4 54.8 207.4 55.2 208.6 C55.5 209.7 56.7 210.2 57.2 210.8 C57.6 211.4 57.7 211.4 57.7 212 C57.6 212.7 57.7 212.8 57 214.4 C56.3 216 54.6 219.3 53.8 220.8 C52.9 222.4 52.8 221.9 52.2 223 C51.7 224 51.2 225.1 50.7 226.7 C50.1 228.2 49.6 230 49.3 231.6 C48.9 233.2 48.9 234 48.8 235.4 C48.7 236.9 48.3 237.2 48.8 239.7 C49.3 242.2 50.7 246.8 51.6 249.2 C52.5 251.5 52.9 250.3 53.6 252.7 C54.2 255 54.7 260.2 55.2 262.3 C55.7 264.5 55.8 263.3 56.2 264.7 C56.6 266.1 56.7 267.6 57.4 269.9 C58.1 272.2 59.4 274.9 59.9 277.5 C60.4 280.1 60.3 282.3 60 284.2 C59.8 286.1 59.2 287 58.4 288.1 C57.7 289.2 57.3 289.4 56.1 290.1 C54.9 290.9 52.8 291.7 51.9 292.3 C51 293 51.2 293.3 51.2 293.7 C51.2 294.1 51.4 294.3 51.9 294.6 C52.4 294.9 52.6 295.3 54 295.5 C55.3 295.6 57.7 295.4 59.5 295.5 C61.2 295.6 62.4 295.8 63.6 296 C64.9 296.2 65.6 296.6 66.3 296.7 C67.1 296.8 67.3 296.8 67.8 296.5 C68.2 296.3 68.6 297.4 68.8 295.4 C69 293.4 68.8 287.8 68.9 285.4 C69 283 69.4 282.9 69.4 281.9 C69.4 280.9 69 281.7 68.9 279.7 C68.8 277.6 69 272.7 68.9 270.5 C68.8 268.4 68.4 269 68.5 267.7 C68.5 266.5 68.7 264.9 69.1 263.7 C69.6 262.5 70.5 261.9 70.9 261 C71.3 260 70.9 259.8 71.4 258.4 C71.8 257 73 255.1 73.4 253.3 C73.8 251.6 73.3 250.2 73.4 248.7 C73.5 247.2 73.7 246.1 73.9 245 C74.2 243.9 74.6 244.2 74.8 242.4 C74.9 240.6 75.1 238.2 74.8 235.1 C74.5 232 72.8 228.7 73.1 225.4 C73.4 222.2 75.6 219.9 76.5 217.2 C77.5 214.6 77.8 212.9 78.3 210.7 C78.8 208.4 79.1 207 79.3 204.7 C79.4 202.4 79.3 199.4 79.3 198 C79.2 196.6 79.2 197.5 78.9 197.1 C78.6 196.7 77.8 196.1 77.5 195.6 C77.2 195.1 77 195 77.1 194.4 C77.2 193.7 77.5 192.6 78.1 192 C78.6 191.4 79.4 191 80.1 191 C80.8 191 81.4 191.4 81.9 192 C82.4 192.6 82.8 193.7 82.9 194.4 C83 195 82.8 195.1 82.5 195.6 C82.2 196.1 81.4 196.7 81.1 197.1 C80.8 197.5 80.8 196.6 80.7 198 C80.7 199.4 80.6 202.4 80.7 204.7 C80.9 207 81.2 208.4 81.7 210.7 C82.2 213 82.6 214.7 83.5 217.3 C84.5 220 86.6 222.2 86.9 225.3 C87.2 228.5 85.5 231.8 85.2 234.9 C84.9 238 85.1 240.6 85.2 242.4 C85.4 244.3 85.9 243.1 86.1 245.1 C86.4 247.1 86.2 251.1 86.6 253.4 C87.1 255.8 88.2 257 88.6 258.4 C89.1 259.8 88.7 260.1 89.1 261 C89.5 261.9 90.2 262 90.7 263.2 C91.1 264.5 91.5 266.6 91.5 268 C91.6 269.3 91.2 268.4 91.1 270.5 C91 272.6 91.2 277.6 91.1 279.7 C91 281.7 90.6 280.9 90.6 281.9 C90.6 282.9 91 283 91.1 285.4 C91.2 287.8 90.9 293.1 91.1 295.1 C91.2 297 91.4 296 91.9 296.3 C92.3 296.6 92.7 296.8 93.6 296.8 C94.4 296.7 95.1 296.2 96.4 296 C97.6 295.8 98.8 295.6 100.5 295.5 C102.3 295.4 104.7 295.7 106 295.5 C107.4 295.3 107.7 294.9 108.2 294.5 C108.7 294.2 108.8 294 108.8 293.6 C108.8 293.2 109 292.9 108.1 292.3 C107.2 291.7 105.1 290.9 103.9 290.1 C102.7 289.4 102.3 289.2 101.6 288.1 C100.8 287 100.2 286.1 100 284.2 C99.7 282.3 99.6 280.1 100.1 277.5 C100.6 274.9 101.9 272.2 102.6 269.9 C103.3 267.6 103.4 266.1 103.8 264.7 C104.2 263.3 104.3 264.5 104.8 262.3 C105.3 260.2 105.8 255 106.4 252.7 C107.1 250.3 107.5 251.5 108.4 249.2 C109.3 246.8 110.7 242.2 111.2 239.7 C111.7 237.2 111.3 236.9 111.2 235.4 C111.1 234 111.1 233.2 110.7 231.6 C110.4 230 109.9 228.2 109.3 226.7 C108.8 225.1 108.3 224 107.8 223 C107.2 221.9 107.1 222.4 106.2 220.8 C105.4 219.3 103.7 216 103 214.4 C102.3 212.8 102.4 212.7 102.3 212 C102.3 211.4 102.4 211.4 102.8 210.8 C103.3 210.2 104.5 209.7 104.8 208.6 C105.2 207.4 104.8 205.4 104.9 204.3 C105 203.1 104.9 203.4 105.4 202.1 C106 200.9 107.5 198.7 108 197.3 C108.5 195.9 107.8 196 108.1 194.3 C108.4 192.5 109 189.3 109.5 187.6 C110.1 185.9 110.8 185.5 111.1 184.8 C111.3 184.1 111.3 184.4 111 183.8 C110.7 183.2 109.8 182.3 109.5 181.3 C109.3 180.3 109.1 179.4 109.4 178.2 C109.7 176.9 110.9 175.5 111.2 174.5 C111.5 173.4 111.3 173 111.2 172.2 C111.1 171.4 110.6 170.8 110.5 170.2 C110.4 169.6 110.1 169.7 110.5 169 C110.8 168.2 112.1 166.9 112.4 166.3 C112.7 165.6 112.4 165.7 112 165.4 C111.6 165 110.6 164.7 110.2 164.4 C109.8 164.1 109.9 164.5 109.7 163.7 C109.4 162.8 109.2 161.1 108.7 159.7 C108.3 158.4 107.5 157.4 107 156.1 C106.5 154.8 106.1 154.7 105.8 152.5 C105.5 150.3 105.6 146.1 105.4 144 C105.1 141.9 104.5 142.1 104.5 140.9 C104.5 139.8 105.2 139.2 105.4 137.6 C105.5 135.9 105.8 134.4 105.4 131.8 C105 129.3 103.6 125.4 103.1 123.3 C102.7 121.1 102.8 120.9 102.8 119.8 C102.8 118.7 103.2 118.3 103.1 117.1 C103 115.8 102.5 114.3 102.2 112.8 C102 111.3 101.9 109.6 101.9 108.7 C101.9 107.7 101.6 108.2 102.2 107.6 C102.7 107.1 103.3 106.9 104.8 105.5 C106.3 104.1 109.3 101.4 110.6 99.7 C112 98 111.7 96.8 112.4 96.1 C113 95.4 113.5 95.6 114 95.6 C114.6 95.7 115.2 96 115.6 96.4 C116 96.8 116.1 96.9 116.2 97.6 C116.2 98.4 115.7 99.4 115.9 100.4 C116.1 101.5 116.8 102.7 117.4 103.7 C118.1 104.7 118.6 105.1 119.4 105.8 C120.3 106.4 121.4 106.8 122 107.3 C122.6 107.8 122.7 107.7 122.8 108.4 C122.9 109.1 122.5 110.1 122.6 111.1 C122.7 112.1 123.4 112.2 123.5 113.9 C123.6 115.7 122.6 118.3 123.1 120.9 C123.7 123.6 125.7 126.7 126.6 128.6 C127.5 130.4 127.5 130.2 128.1 131 C128.7 131.9 129.5 132.2 130 133.1 C130.4 133.9 129.7 133.8 130.5 135.8 C131.2 137.8 133.1 142.3 134 144.1 C134.9 145.9 135.3 145 135.4 146 C135.6 147 134.9 148.7 134.9 149.5 C135 150.3 135.3 150.1 135.7 150.4 C136.2 150.8 137.2 151.1 137.6 151.4 C138.1 151.8 138 150.9 138.2 152.3 C138.3 153.7 138.3 157.8 138.4 159.2 C138.6 160.6 138.9 159.8 139.2 160.1 C139.6 160.3 139.6 160.5 140.5 160.5 C141.3 160.5 143 160.4 143.8 160.2 C144.6 160 144.6 159.7 144.9 159.3 C145.2 158.9 145.3 158.5 145.4 157.9 C145.5 157.4 145.7 157.6 145.3 156.2 C145 154.9 143.9 152 143.6 150.6 C143.3 149.2 143.5 149.2 143.6 148.4 C143.8 147.5 144.3 146.7 144.5 145.9 C144.6 145.1 144.7 145.1 144.5 144.1 C144.3 143.1 143.2 141.8 143.3 140.2 C143.4 138.5 144.4 136.7 144.9 134.8 C145.4 132.8 145.9 130.8 145.9 129.2 C145.9 127.7 145.1 127.7 145 126.2 C144.9 124.7 145.5 122.3 145.4 120.9 C145.3 119.5 144.5 119.4 144.3 118.6 C144 117.7 144.3 117.3 143.8 116 C143.3 114.6 142.7 112.3 141.7 110.9 C140.7 109.5 139.2 109.4 138.4 108.4 C137.5 107.4 137.2 106.4 137 105.4 C136.8 104.4 137.5 103.9 137.3 102.8 C137 101.7 135.9 100.5 135.6 99.3 C135.4 98.2 136.1 98.9 136 96.4 C135.8 93.8 135.4 87.8 134.9 85.1 C134.3 82.5 134.1 82.8 133 81.4 C131.9 80.1 129.7 79.4 129 77.6 C128.2 75.8 129.2 73.6 128.7 71.3 C128.3 69 127.4 66.7 126.5 64.8 C125.6 62.9 125.1 62.3 123.7 60.8 C122.3 59.4 120.5 57.7 119 56.7 C117.5 55.7 116.8 55.5 115.4 55.4 C113.9 55.2 112.2 55.8 111 55.8 C109.8 55.7 109.3 55.4 108.6 55.1 C108 54.8 107.9 54.8 107.5 54.1 C107.1 53.4 106.8 52 106.5 51.4 C106.1 50.7 106.7 51.1 105.6 50.5 C104.4 49.9 101.6 48.6 100.1 48 C98.5 47.3 97.9 47.6 96.9 47.1 C96 46.7 95.8 45.9 94.9 45.4 C94 44.9 92.7 44.7 92 44.4 C91.3 44.1 91.5 44.2 91.1 43.7 C90.7 43.3 90.2 42.5 89.9 41.9 C89.7 41.4 89.5 41.4 89.6 40.6 C89.7 39.8 90.4 38.7 90.5 37.6 C90.7 36.4 90.6 35.3 90.5 34.2 C90.4 33 89.7 32.2 89.7 31.1 C89.7 30.1 90.4 30.3 90.5 28.1 C90.7 25.9 90.3 21 90.5 18.8 C90.8 16.6 91.6 16.8 91.7 16 C91.9 15.1 91.7 14.9 91.3 13.9 C91 13 90.6 11.7 89.6 10.6 C88.6 9.4 87.3 8.4 86 7.6 C84.7 6.9 83.6 6.6 82.5 6.4 C81.4 6.3 80.8 6.8 79.9 6.8 C79.1 6.8 78.6 6.4 77.7 6.4 Z";
const BODY = {
  front: [
    ["_n", "M64 262.4 C63.1 262.1 63.1 262.7 62.8 263.1 C62.6 263.5 62.4 262.9 62.7 264.5 C63 266 64 269.3 64.5 271.9 C65 274.5 65.3 276.6 65.4 278.8 C65.6 280.9 65.6 282.6 65.4 284 C65.3 285.5 64.5 286.1 64.6 286.9 C64.6 287.7 65.4 288.1 65.9 288.5 C66.4 288.9 66.9 289.2 67.5 289.2 C68 289.2 68.4 288.9 68.9 288.5 C69.4 288.1 69.8 287.7 70.2 287.1 C70.6 286.5 71 285.8 71.1 285.1 C71.3 284.3 71.5 283.9 71.1 282.7 C70.8 281.5 69.7 279.7 69.4 278.3 C69.1 276.9 69.5 276.7 69.3 275 C69.2 273.4 68.7 270.5 68.4 269.1 C68.1 267.6 67.8 267.9 67.6 267.1 C67.4 266.2 68.1 265.3 67.5 264.5 C66.8 263.6 64.8 262.6 64 262.4 Z M62.6 256.3 C62.3 256.5 61.9 256.5 61.8 257.3 C61.8 258.1 62.1 259.9 62.5 260.8 C62.9 261.6 63.5 261.7 64.1 261.8 C64.7 262 65.4 261.7 65.8 261.3 C66.1 261 66.3 260.5 66.2 260.1 C66 259.7 65.4 259.5 65.1 259 C64.7 258.4 64.7 257.4 64.4 256.9 C64.1 256.4 63.7 256.3 63.4 256.2 C63.1 256.1 62.9 256.1 62.6 256.3 Z M61.3 221 C60.8 221 60.1 221.2 59.8 221.6 C59.4 222 59.7 222.6 59.3 223.1 C59 223.6 58.3 223.7 57.9 224.3 C57.6 224.9 57.4 225.8 57.4 226.4 C57.3 227 57.2 227.3 57.7 227.7 C58.1 228.1 59.2 228.7 59.8 228.8 C60.4 228.9 60.9 228.8 61.2 228.1 C61.4 227.4 61.1 225.9 61.3 225 C61.6 224.1 62.4 223.6 62.6 223 C62.8 222.4 62.7 222 62.4 221.6 C62.2 221.3 61.8 221 61.3 221 Z M61.5 132.9 C61.1 132.9 60.8 133.1 60.6 133.5 C60.3 134 60.1 134.5 60.1 135.4 C60.1 136.3 60.5 137.6 60.4 138.5 C60.4 139.3 60.2 139.5 59.9 140 C59.6 140.5 58.9 140.4 58.7 141.3 C58.5 142.1 58.1 143.9 58.7 144.8 C59.3 145.7 61 145 62 146.4 C63.1 147.7 63.8 151 64.4 152.3 C65.1 153.6 65.4 152.8 65.8 153.8 C66.1 154.7 65.9 155.7 66.4 157.5 C66.9 159.3 68.2 162.2 68.6 163.9 C68.9 165.6 68.4 165.9 68.6 167 C68.8 168.2 69.3 169.2 69.5 170.2 C69.6 171.2 69.3 172.1 69.6 172.8 C69.8 173.5 70 172.9 70.7 174 C71.4 175.2 72.3 176.9 73.3 179.2 C74.4 181.5 75.8 185.4 76.6 187 C77.4 188.5 77.6 187.6 78 187.7 C78.4 187.7 78.6 187.5 78.9 187.2 C79.3 186.9 79.8 186.2 80 185.9 L80 185.5 L80 159.4 L80 159.4 C79.6 159.6 77.9 159 77.6 160.6 C77.4 162.3 78.7 166.5 78.7 168.5 C78.6 170.5 77.9 170.9 77.5 171.5 C77.1 172.2 76.8 172.2 76.5 172.2 C76.1 172.1 75.8 171.8 75.4 171.2 C75 170.6 74.8 170.2 74.5 169 C74.2 167.7 74.2 165.5 73.8 164.1 C73.4 162.8 72.4 162.8 72.1 161.4 C71.8 160.1 72.6 158.7 72 156.6 C71.5 154.5 69.6 151.5 69 149.8 C68.4 148.2 69.2 148.6 68.8 147.5 C68.5 146.3 67.3 144.4 67 143.3 C66.6 142.3 67.3 142.3 67 141.6 C66.8 141 65.8 140.4 65.4 139.6 C65.1 138.8 65.5 138.1 65.2 137.1 C65 136.2 64.3 135 63.9 134.3 C63.4 133.6 63.3 133.5 62.8 133.3 C62.4 133 61.9 132.9 61.5 132.9 Z"],
    ["Neck", "M70.3 42.8 C69.8 43.1 69.5 43.3 69.5 44 C69.4 44.6 69.9 45.4 69.9 46.3 C69.9 47.3 69.4 48.1 69.5 49.1 C69.6 50.2 70.4 50.4 70.4 52.2 C70.4 53.9 69.3 57.5 69.6 58.9 C69.9 60.4 70.8 60 71.8 60.1 C72.9 60.3 74.3 59.8 75.3 59.8 C76.3 59.9 76.8 59.8 77.5 60.2 C78.1 60.6 78.5 61.7 78.9 62.2 C79.4 62.6 79.8 65.5 80 62.8 L80 47.4 L80 47.3 C79.7 47.3 79 47.4 78.6 47.8 C78.2 48.3 78.1 49.4 77.8 49.8 C77.5 50.2 77.4 50.4 77.1 50.2 C76.8 50.1 76.4 49.7 76.2 48.9 C76 48.1 76.3 46.7 76 45.8 C75.8 44.9 75.6 44.6 74.9 44 C74.2 43.3 72.9 42.5 72.1 42.3 C71.2 42.1 70.7 42.5 70.3 42.8 Z"],
    ["Traps", "M69.7 50.3 C69.3 49.8 69.2 49.3 68.1 49.7 C67 50.1 65.4 51.7 63.6 52.6 C61.8 53.5 60.2 53.7 58.1 54.9 C56.1 56.2 53.6 58.6 52.3 59.6 C50.9 60.5 50.8 60 50.5 60.3 C50.1 60.6 50.1 61 50.3 61.3 C50.5 61.6 50.5 61.9 51.7 62 C52.9 62 55.2 61.5 56.8 61.5 C58.3 61.5 59 62 60.5 62 C62 62 63.9 61.7 65.2 61.5 C66.5 61.2 67 61 67.7 60.6 C68.4 60.1 68.8 60.6 69.2 59 C69.7 57.5 70.2 53.8 70.3 52.2 C70.4 50.6 70.1 50.7 69.7 50.3 Z"],
    ["Serratus", "M52.3 92.6 C51.8 92.9 51.9 93.3 51.9 93.9 C51.9 94.6 52.6 95.2 52.3 96.2 C52 97.1 50.4 98.3 50.2 99.2 C50 100.1 50.8 100.8 51.2 101.3 C51.6 101.9 52.1 101.7 52.4 102.3 C52.7 102.8 52.2 103.8 52.7 104.4 C53.3 105 53.5 105.4 55.4 105.6 C57.4 105.8 61.9 105.7 63.6 105.6 C65.4 105.5 64.8 105.4 65.1 105 C65.4 104.6 65.3 104 65.3 103.4 C65.3 102.7 64.7 102.1 64.9 101.3 C65.1 100.6 66.3 99.9 66.6 99 C66.9 98.1 66.8 97.1 66.4 96.4 C66 95.8 65.8 95.8 64.5 95.5 C63.2 95.1 60.9 95.1 59.1 94.4 C57.3 93.8 55.9 92.2 54.6 91.9 C53.4 91.5 52.8 92.2 52.3 92.6 Z"],
    ["Obliques", "M53.1 105.6 C50.9 105.7 52.5 106 52.4 106.2 C52.4 106.4 52 106.3 52.6 106.9 C53.2 107.4 54.9 108.3 55.7 109.3 C56.6 110.3 57.1 110 57.3 112.5 C57.5 114.9 56.9 120.7 56.9 122.9 C56.9 125.2 57 124.2 57.5 125.2 C57.9 126.2 57.9 127.2 59.2 128.7 C60.6 130.2 63.6 132.5 64.9 133.5 C66.1 134.4 65.7 134 66.2 134 C66.7 134 67.3 133.7 67.7 133.5 C68.1 133.3 68.2 133.4 68.4 132.7 C68.6 132 68.8 130.6 68.9 129.7 C69 128.7 69.1 128.3 68.9 127.4 C68.7 126.6 68 127 68 125 C68 122.9 68.9 118 68.9 116 C68.9 113.9 68.3 114.3 67.8 113.6 C67.4 112.9 66.7 112.8 66.3 112 C65.9 111.3 65.8 110.3 65.8 109.3 C65.7 108.4 66.3 107.4 66 106.7 C65.7 106.1 66.5 105.9 64.2 105.7 C61.9 105.5 55.2 105.5 53.1 105.6 Z"],
    ["Chest", "M80 71.2 C75 68.9 57.6 75 52.3 76.1 C46.9 77.2 51 76.5 50.1 77.2 C49.2 77.9 47.9 79.1 47.3 80 C46.8 80.8 46.9 81.3 47.1 81.9 C47.2 82.5 47.6 82.9 48.1 83.4 C48.6 83.9 49.1 83.4 49.9 84.6 C50.7 85.7 51.9 88.6 52.6 89.9 C53.4 91.1 52.6 90.6 54.1 91.4 C55.5 92.3 58.5 93.9 60.6 94.7 C62.7 95.4 63.5 95.8 65.5 95.7 C67.5 95.6 70 94.8 71.7 94.3 C73.5 93.8 73.6 93.8 75.1 92.9 C76.6 91.9 79.1 89.9 80 89.2 L80 88.8 L80 71.2 Z"],
    ["UpperChest", "M80 64.9 C79.3 63.3 77.3 62.7 75.9 61.9 C74.5 61.2 73.8 61 72.4 60.8 C71 60.5 69.2 60.6 67.9 60.7 C66.6 60.9 66.3 61.4 65.2 61.6 C64.2 61.8 62.9 61.5 62.1 61.6 C61.2 61.7 61.2 61.8 60.3 62.2 C59.4 62.6 58.6 61.7 57.1 64 C55.5 66.3 52.2 72.9 51.5 75 C50.9 77.2 48.4 76.6 53.5 75.9 C58.6 75.2 75.2 72.9 80 70.9 L80 64.9 Z"],
    ["UpperAbs", "M65.9 109.3 C65.8 110 65.9 111.3 66.5 112.3 C67.1 113.2 66.8 114.1 69.3 114.5 C71.7 114.9 78.1 115.6 80 114.5 L80 108.5 C77.8 107.4 70.1 108.3 67.6 108.4 C65 108.6 66.1 108.6 65.9 109.3 Z M65.1 101.1 C65.1 102.2 65.5 105.1 66 106.2 C66.4 107.3 64.9 107.1 67.5 107.3 C70 107.5 77.7 108.7 80 107.3 L80 99.5 C77.7 98.1 70 99.3 67.5 99.4 C64.9 99.5 66.4 99.7 66 100 C65.6 100.4 65.1 100 65.1 101.1 Z M80 89.2 L80 89.2 C79.7 89.3 79.1 89.4 78.3 90.1 C77.4 90.7 76.1 92.2 75.2 92.9 C74.4 93.5 74.9 93.3 73.5 93.8 C72.1 94.2 68.7 95 67.5 95.5 C66.2 95.9 66.9 95.9 66.8 96.3 C66.7 96.7 66.6 97.2 66.9 97.6 C67.2 98 66 98.3 68.4 98.4 C70.7 98.6 77.9 100 80 98.4 L80 89.2 Z"],
    ["LowerAbs", "M70.8 114.8 C69 114.9 70 115 69.7 115.4 C69.3 115.8 69.4 115.3 69.1 117 C68.8 118.7 68.1 123.1 68.1 125 C68.1 126.9 68.9 126.4 69 127.6 C69.1 128.7 68.5 130.2 68.6 131.3 C68.8 132.3 69.9 132.6 70 133.3 C70.2 133.9 69.5 134.1 69.5 134.9 C69.5 135.6 69.3 135.6 70 137.6 C70.7 139.5 72.5 144 73.3 145.8 C74.2 147.6 74.3 146.9 74.5 147.6 C74.8 148.2 74.1 148.7 74.6 149.5 C75.1 150.2 76.5 151.2 77.5 151.7 C78.4 152.2 79.5 159 80 152.4 L80 115 C78.3 108.2 72.7 114.7 70.8 114.8 Z"],
    ["SideDelts", "M49 60 C48.1 59.9 46.2 60 44.8 60.3 C43.4 60.6 42.5 60.9 41.2 61.5 C40 62.2 39 63.1 38.1 63.9 C37.2 64.8 36.9 64.6 36.3 66.2 C35.7 67.9 35.1 70.8 34.8 73.1 C34.6 75.4 34.7 76.9 34.8 78.8 C34.9 80.8 35.2 82.7 35.4 83.9 C35.7 85.2 36 85.3 36.4 85.8 C36.9 86.4 37.4 86.8 38 87 C38.5 87.1 38.7 87.2 39.6 86.6 C40.4 85.9 42.3 84.5 42.7 83.3 C43.1 82.2 41.9 81.7 41.9 80.2 C42 78.7 42.4 76.4 42.9 75 C43.4 73.6 44.5 73.3 44.6 72.4 C44.7 71.6 43.3 71.4 43.4 70.3 C43.6 69.2 44.4 68 45.6 66.5 C46.7 64.9 49.1 62.9 49.8 61.9 C50.6 60.8 50.1 61 49.9 60.6 C49.8 60.3 49.9 60 49 60 Z"],
    ["FrontDelts", "M56.3 63 C55.7 62.6 54.6 61.8 53.5 61.7 C52.5 61.5 51.3 61.9 50.5 62.2 C49.7 62.4 50 62.1 49.1 62.9 C48.3 63.7 46.6 65.3 45.7 66.5 C44.7 67.6 44.2 68.6 43.9 69.3 C43.6 69.9 43.7 69.8 43.9 70.2 C44.2 70.6 45.4 70.8 45.2 71.6 C45.1 72.5 43.6 73.5 43 75 C42.4 76.6 42.2 79 42.1 80.2 C41.9 81.4 42 81.1 42.2 81.5 C42.3 82 42.7 82.3 43 82.5 C43.4 82.7 43.5 83 44.2 82.8 C44.8 82.7 46 82.2 46.5 81.7 C47.1 81.2 46.5 80.9 47.1 80.1 C47.7 79.3 48.1 79.9 49.9 77.2 C51.6 74.4 55.4 67.3 56.6 64.9 C57.9 62.4 56.8 63.9 56.7 63.5 C56.7 63.2 56.9 63.3 56.3 63 Z"],
    ["Triceps", "M35.2 85.3 C34.5 85 34.5 85.3 34.2 85.6 C33.8 85.8 33.8 85.2 33.1 86.6 C32.4 88 31 91.1 30.4 93.6 C29.7 96.1 29.6 99.2 29.5 100.6 C29.4 101.9 29.6 101.1 29.9 101.3 C30.2 101.6 30.7 102 31.2 102 C31.8 102 32.2 101.9 32.9 101.3 C33.6 100.8 34.4 100.7 35.1 99 C35.7 97.2 36 93.6 36.6 91.7 C37.2 89.8 38 89.3 38.3 88.5 C38.5 87.7 38.5 87.8 38 87.2 C37.4 86.6 35.9 85.6 35.2 85.3 Z"],
    ["Biceps", "M46.4 82.4 C45.1 82.2 43.9 83 42.6 83.8 C41.3 84.7 40.1 85.7 39.1 87.1 C38 88.5 37.3 90.2 36.7 91.7 C36.1 93.1 35.9 94 35.8 95 C35.6 96.1 35.9 96.8 35.7 97.6 C35.4 98.5 34.5 99.2 34.4 99.9 C34.4 100.6 35.1 100.9 35.2 101.7 C35.4 102.4 35 102.9 35.4 104 C35.9 105.2 37.2 106.7 37.7 107.9 C38.3 109 38 109.8 38.3 110.5 C38.7 111.1 38.5 111.5 39.6 111.3 C40.6 111.1 43.2 109.9 44 109.4 C44.8 108.9 44.2 108.9 44 108.5 C43.8 108.2 43.1 107.8 43 107.5 C42.9 107.2 42.7 106.9 43.4 106.8 C44.1 106.6 45.8 107 47 106.7 C48.1 106.4 49 105.9 49.7 105.3 C50.4 104.7 50.7 104.2 50.9 103.4 C51.1 102.6 51 101.7 50.9 100.9 C50.8 100.1 49.8 99.8 50.1 99 C50.3 98.1 51.9 97.2 52.2 96.2 C52.5 95.1 51.7 94.2 51.8 93.2 C52 92.3 53.5 92.4 53.1 90.9 C52.8 89.4 51.1 86.3 49.8 84.8 C48.6 83.3 47.7 82.6 46.4 82.4 Z"],
    ["Forearms", "M34.3 101.1 C33.4 101.3 31.1 101.9 30.1 102.8 C29 103.7 28.9 105 28.6 106.1 C28.3 107.2 28.8 107.6 28.2 109 C27.7 110.4 26.4 112.5 25.7 113.6 C24.9 114.7 24.3 113.3 24.1 115.3 C23.8 117.2 23.7 122.5 24.1 124.4 C24.4 126.3 25.5 125.4 25.9 125.9 C26.4 126.3 26.5 125.7 26.6 127 C26.6 128.3 26 131.7 26.3 133.1 C26.6 134.4 27.3 134.1 28.2 134.4 C29.1 134.7 30.6 134.7 31.5 134.6 C32.3 134.5 32.4 134.2 32.8 133.9 C33.1 133.5 33.3 133.1 33.3 132.6 C33.4 132.2 33 131.8 33 131.3 C33.1 130.8 32.8 131.2 33.5 129.9 C34.1 128.6 36 125.8 36.8 124.1 C37.5 122.3 37 121.4 37.6 120.1 C38.2 118.9 39.7 117.9 40.1 117.2 C40.5 116.5 40.2 116.5 40.1 116.1 C39.9 115.7 39.4 115.7 39.2 115 C39.1 114.2 39.4 112.8 39.1 111.9 C38.9 111 38.3 110.8 38 110 C37.7 109.3 38.1 108.8 37.6 107.8 C37.1 106.7 35.7 105 35.3 103.9 C34.8 102.8 35.2 102.1 35.1 101.6 C34.9 101.1 35.2 100.8 34.3 101.1 Z M40 118.5 C39.5 118.6 38.6 118.6 38 119.6 C37.4 120.6 37.7 122.2 36.9 124.1 C36.1 125.9 34.2 128.4 33.6 129.9 C32.9 131.4 33.6 131.6 33.5 132.5 C33.3 133.4 32.7 134 32.6 134.9 C32.4 135.8 32.5 136.9 32.6 137.5 C32.7 138 32.9 138 33.3 138.1 C33.6 138.2 33.7 138.4 34.5 137.9 C35.3 137.5 36.5 137.3 37.9 135.5 C39.3 133.8 41.4 130.3 42.3 128.3 C43.1 126.4 43 125.9 42.8 124.6 C42.6 123.3 41.5 122.1 41.1 121.1 C40.8 120.2 41.1 119.6 40.9 119.1 C40.7 118.6 40.5 118.4 40 118.5 Z M43.6 110.6 C43 110.6 41.3 111 40.6 111.2 C39.8 111.4 39.6 111.2 39.4 111.9 C39.2 112.6 39.2 114.3 39.4 115.1 C39.6 115.9 40.1 116.2 40.7 116.4 C41.2 116.6 41.8 116.7 42.4 116.2 C43 115.7 43.7 114.5 44 113.6 C44.3 112.7 44.2 111.9 44.2 111.4 C44.1 110.8 44.3 110.6 43.6 110.6 Z M24.3 125.2 C23.8 125.2 23.4 125.5 23.1 125.8 C22.9 126 22.7 125.7 22.7 126.7 C22.7 127.6 23.1 128.4 23.1 130.9 C23.1 133.5 22.4 138.3 22.7 140.7 C23 143.1 24.1 143.6 24.8 144.4 C25.5 145.3 26.1 145 26.6 145.5 C27.1 145.9 27.3 146.5 27.7 146.9 C28.1 147.2 28.5 147.3 28.9 147.2 C29.2 147.1 30 147.5 29.7 146.2 C29.4 144.9 27.6 142 27.1 139.9 C26.7 137.8 27.3 135.9 27 134.6 C26.8 133.4 26.1 134.2 26 132.8 C25.9 131.5 26.6 128.6 26.6 127.3 C26.5 126.1 26.2 126.3 25.8 125.9 C25.4 125.5 24.7 125.2 24.3 125.2 Z M25.1 146 C25 146.4 24.5 146.9 25.1 147.7 C25.7 148.5 27.3 149.8 28.2 150.5 C29.1 151.1 29.3 151.1 29.9 151.1 C30.5 151.1 31.1 150.7 31.4 150.4 C31.7 150 31.8 149.5 31.3 149.1 C30.9 148.7 29.8 148.8 29 148.2 C28.2 147.6 27.3 146.3 26.7 145.8 C26.2 145.4 26.2 145.6 25.9 145.6 C25.7 145.6 25.3 145.6 25.1 146 Z M28.5 134.6 C28 134.7 27.4 134.6 27.2 135.5 C27 136.5 26.8 137.9 27.2 139.8 C27.7 141.7 29.1 144.8 29.8 146 C30.5 147.3 30.7 146.7 31.1 146.7 C31.5 146.8 31.6 147.2 32 146.1 C32.3 145 32.9 141.9 32.9 140.6 C32.9 139.3 32.1 139.6 32.1 138.8 C32 138 32.8 137.1 32.4 136.3 C32.1 135.6 30.9 135.1 30.2 134.7 C29.5 134.4 29.1 134.4 28.5 134.6 Z"],
    ["Abductors", "M59 132.1 C58.3 132.2 57.2 132.4 56.2 133.2 C55.3 134 54.5 135.3 53.9 136.4 C53.3 137.6 53 138.5 52.9 139.6 C52.7 140.7 52.6 141.7 52.9 142.5 C53.1 143.4 54.4 143 54.2 144.3 C54 145.7 52.3 148.2 51.9 150.1 C51.6 151.9 52.4 152.7 52.4 154.8 C52.4 156.9 51.9 160.3 51.9 161.6 C52 163 52.4 162.4 52.8 162.5 C53.2 162.6 53.7 162.3 54.1 162.1 C54.4 161.8 54.5 161.7 54.8 161 C55 160.2 55.2 158.7 55.5 157.8 C55.8 156.9 55.9 157.7 56.6 155.9 C57.3 154.1 59.1 149.7 59.4 147.8 C59.8 145.9 58.8 146.7 58.6 145.6 C58.4 144.4 58.3 142.9 58.6 141.6 C58.9 140.3 60.1 139.5 60.3 138.5 C60.6 137.4 59.9 136.8 59.9 135.9 C59.9 135 60.4 134.2 60.4 133.6 C60.4 133 60.3 132.9 60 132.6 C59.8 132.4 59.7 132 59 132.1 Z"],
    ["Adductors", "M74.5 150.1 C74.2 150.1 74 149.9 73.6 150.6 C73.3 151.4 72.9 152.4 72.7 154.3 C72.4 156.2 72 159.4 72.2 161.2 C72.4 163 73.5 162.7 73.9 164.1 C74.3 165.5 74.3 167.7 74.6 169 C74.9 170.2 75.2 170.6 75.5 171.1 C75.8 171.5 76.1 171.5 76.5 171.5 C76.8 171.5 77.3 171.3 77.7 170.9 C78 170.4 78.4 170.7 78.4 168.8 C78.3 167 77.2 162.7 77.5 160.6 C77.8 158.5 79.6 158 80 157.3 L80 156.8 L80 152.9 C79.5 152 77.8 152.4 77 152 C76.2 151.6 76.1 150.9 75.7 150.5 C75.2 150.2 74.9 150.1 74.5 150.1 Z M69.5 173.5 C69.1 173.6 68.8 173.2 68.6 174.2 C68.4 175.3 67.8 178.1 68.2 179.3 C68.5 180.5 70 180.6 70.7 180.7 C71.4 180.9 71.6 180.5 71.9 180.1 C72.2 179.6 72.7 179.3 72.5 178.2 C72.2 177.1 71.1 174.8 70.5 173.9 C70 173.1 69.8 173.4 69.5 173.5 Z"],
    ["Quads", "M60.8 146.4 C60.4 146.3 60.4 145.3 59.7 147 C59 148.7 57.5 154 56.7 155.9 C56 157.8 56.1 156.6 55.6 157.8 C55.2 159 54.5 161.2 54.2 162.4 C54 163.7 54.1 163.8 54.2 164.7 C54.3 165.5 54.9 166.3 54.9 167.2 C55 168 54.5 168.4 54.6 169.3 C54.7 170.2 55.3 170 55.5 172 C55.7 173.9 55.8 178.3 56 180.1 C56.2 181.9 56.7 181 56.8 181.8 C57 182.6 56.6 182.8 56.9 184.4 C57.3 185.9 58.3 188.7 58.9 190.3 C59.6 192 60.1 192.8 60.6 193.6 C61.1 194.4 61.6 194.2 61.6 194.6 C61.7 195 61 195.3 61 195.8 C61 196.4 61.3 197.3 61.6 197.7 C61.9 198.1 62.2 198.2 62.5 198.1 C62.8 198 63.5 197.8 63.5 197.2 C63.5 196.6 62.4 195.3 62.3 194.7 C62.3 194.1 62.7 194.9 63 193.7 C63.4 192.5 63.1 190.8 64.1 188 C65 185.1 67.6 180.2 68.4 177.7 C69.2 175.3 68.3 175.2 68.5 174.2 C68.7 173.3 69.2 173.4 69.3 172.7 C69.5 172 69.6 171.5 69.4 170.4 C69.2 169.4 68.3 168.1 68.1 166.9 C68 165.8 68.5 165.1 68.5 164.1 C68.4 163.1 68.4 162.7 68 161.5 C67.6 160.3 66.7 158.9 66.3 157.5 C65.9 156.1 66 154.8 65.7 153.9 C65.4 153 65.1 153.7 64.4 152.5 C63.8 151.3 62.8 148.2 62.2 147.1 C61.5 146 61.3 146.4 60.8 146.4 Z M52.4 162.9 C51.8 162.9 51.9 161.4 51.1 163.8 C50.3 166.1 48.5 170.7 47.9 176 C47.3 181.3 47.2 188.2 47.9 193.3 C48.7 198.4 51 202.2 52.1 204.4 C53.2 206.6 53.3 204.8 53.9 205.3 C54.6 205.9 54.8 207.1 55.9 207.5 C56.9 207.9 58.7 207.9 59.8 207.7 C60.9 207.5 61.4 207 61.9 206.4 C62.4 205.8 62.7 205.2 62.6 204.4 C62.5 203.6 61.6 203.6 61.3 201.8 C61 200 61.5 197 60.7 194.3 C60 191.5 58.1 188.4 57.3 186.4 C56.6 184.4 56.7 184.2 56.6 183.4 C56.5 182.5 56.8 182.3 56.7 181.8 C56.6 181.2 56.2 182.1 55.9 180.3 C55.7 178.6 55.7 174.1 55.4 172.1 C55.2 170.1 54.8 170.9 54.5 169.4 C54.3 167.9 54.4 165.1 54 163.9 C53.7 162.7 52.9 163 52.4 162.9 Z M68.5 180.1 C67.9 180.1 67.8 180.2 67.5 180.6 C67.1 180.9 67.1 180.3 66.5 182 C65.8 183.7 64.3 187.9 63.7 189.9 C63.1 191.9 63.2 191.7 63.2 193 C63.2 194.3 63.6 196.2 63.6 197.2 C63.6 198.2 63.2 197.9 63.2 198.8 C63.1 199.7 63.4 201.3 63.4 202.1 C63.3 203 62.8 203.1 62.8 203.6 C62.8 204.1 62.7 204.1 63.3 205 C64 205.8 64.9 207 66.1 208.2 C67.3 209.4 68.9 210.8 70 211.7 C71.2 212.5 71.4 213.1 72.4 212.9 C73.5 212.7 75 211.5 75.9 210.5 C76.8 209.4 76.9 208.7 77.4 207 C77.9 205.2 78.6 203 78.8 200.8 C79 198.6 78.6 196.8 78.4 194.6 C78.1 192.5 78.1 191.1 77.4 188.9 C76.7 186.6 75.4 183.7 74.5 182.2 C73.7 180.7 73.4 180.8 72.7 180.5 C72 180.3 71.4 180.9 70.6 180.9 C69.8 180.8 69 180.2 68.5 180.1 Z"],
    ["Tibialis", "M62.8 223.9 C62.4 223.8 62.1 224.1 61.8 224.3 C61.6 224.6 61.5 222.3 61.4 225.2 C61.3 228.1 61.1 236.2 61.4 240.4 C61.6 244.5 62.3 246.3 62.8 248.3 C63.3 250.2 63.8 249.8 64.1 251.2 C64.3 252.6 63.9 254.5 64.1 255.9 C64.3 257.3 64.7 258.3 65.2 259 C65.6 259.6 66.1 259.7 66.6 259.7 C67 259.7 67.2 261.9 67.6 258.8 C67.9 255.8 68.4 246.4 68.5 242.8 C68.5 239.1 68.3 239.9 68 238.5 C67.7 237.1 66.9 236.3 66.7 235.1 C66.4 234 67 233.3 66.6 232.1 C66.2 230.8 64.9 229.4 64.5 228.1 C64.1 226.8 64.6 225.5 64.3 224.8 C64 224 63.3 224 62.8 223.9 Z"],
    ["Calves", "M56 225.7 C55.6 225.8 55.2 225.8 54.8 226.8 C54.4 227.7 53.8 229.4 53.8 230.9 C53.7 232.4 54.5 233.5 54.6 235.1 C54.8 236.7 54.3 238.5 54.7 239.7 C55.1 240.9 56.6 241.1 56.9 241.8 C57.2 242.4 56.4 242.7 56.4 243.4 C56.5 244.1 56.5 244.2 57.1 245.7 C57.8 247.2 59.4 250.4 60.2 251.8 C61 253.2 61.3 252.9 61.6 253.4 C62 254 61.7 254.5 62 254.8 C62.3 255.1 62.7 255.3 63.1 255.2 C63.4 255.1 63.8 255.2 63.9 254.5 C64.1 253.8 64.2 252.4 64 251.3 C63.7 250.2 62.9 249.3 62.7 248.4 C62.5 247.5 62.8 247.1 62.6 246.2 C62.4 245.4 62 245.8 61.7 243.7 C61.5 241.5 61.5 236.3 61.2 234.4 C61 232.5 60.6 233.7 60.5 233.1 C60.3 232.4 60.5 231.6 60.3 230.8 C60.1 230.1 60 229.6 59.5 229 C59 228.5 58 228.2 57.6 227.7 C57.1 227.1 57.3 226.4 57 226 C56.7 225.7 56.4 225.6 56 225.7 Z M62.2 217.6 C61.8 217.3 61.4 216.9 60.7 217 C60 217.2 59 217.5 58.2 218.5 C57.5 219.4 56.8 221.3 56.5 222.2 C56.2 223.1 56.5 223.1 56.7 223.4 C56.9 223.7 57.3 223.8 57.7 223.8 C58 223.9 58.3 223.9 58.7 223.5 C59.1 223 59.2 222 59.8 221.4 C60.5 220.8 61.9 220.8 62.4 220.2 C62.9 219.7 62.6 218.9 62.6 218.5 C62.6 218 62.5 217.8 62.2 217.6 Z M72.4 223.8 C71.7 223.9 70.5 224.7 70.1 225.5 C69.8 226.3 70.7 227.3 70.4 228.2 C70.2 229.2 69 228.9 68.6 230.8 C68.3 232.7 68.2 237 68.6 238.7 C69.1 240.4 70.1 238.5 71.1 240.1 C72.2 241.6 73.6 245.7 74.5 247.1 C75.4 248.6 75.5 248.2 76.1 248 C76.7 247.8 77.5 248.1 77.9 245.9 C78.3 243.7 78.5 238.7 78.3 235.9 C78.2 233.1 77.5 231.7 76.9 230.2 C76.3 228.6 75.6 228.4 75.1 227.5 C74.6 226.5 74.6 225.3 74.2 224.6 C73.7 224 73.1 223.6 72.4 223.8 Z M70 240.1 C69.6 240.1 69.4 239.8 69.1 240.7 C68.7 241.7 68.3 243.3 68.2 245.3 C68 247.4 68.3 249.2 68.1 252 C68 254.8 67.3 258.2 67.2 260.9 C67.2 263.6 67.5 265.6 67.7 267.1 C67.9 268.6 68.3 268 68.6 269.2 C68.8 270.4 68.9 272.9 69.1 273.9 C69.3 275 69.3 274.8 69.6 275 C69.9 275.3 70.3 275.5 70.6 275.5 C71 275.4 71.2 276.5 71.6 274.7 C71.9 272.9 72.1 267.7 72.5 265.6 C72.9 263.4 73.5 263.7 73.8 262.8 C74 261.9 73.7 261.7 73.9 260.5 C74.2 259.4 75 257.7 75.2 256.4 C75.3 255 74.7 253.9 74.8 253 C74.9 252.1 75.5 252.2 75.9 251.5 C76.2 250.8 76.8 250 76.6 249.2 C76.3 248.4 75.3 248.6 74.4 247.1 C73.5 245.6 72.2 242.1 71.5 240.8 C70.7 239.6 70.5 240.1 70 240.1 Z"]
  ],
  back: [
    ["_n", "M58.9 264.7 C57.7 264.4 57.8 265.1 57.5 265.6 C57.2 266.1 56.8 265.2 57.3 267.3 C57.9 269.4 59.9 274.2 60.5 277.4 C61 280.6 60.6 283.1 60.5 284.9 C60.3 286.7 59.3 286.5 59.6 287.4 C60 288.3 61.6 289.4 62.4 290 C63.2 290.5 63.4 290.6 64 290.5 C64.5 290.4 65.1 290.3 65.6 289.6 C66.1 288.8 66.6 288.1 66.7 286.3 C66.8 284.5 66.6 281 66.2 279.4 C65.8 277.9 64.6 278.3 64.4 277.7 C64.2 277.1 65.1 277.2 65.3 276.1 C65.5 274.9 65.5 273 65.3 271.4 C65.1 269.8 65.2 268.4 64.1 267.2 C62.9 266 60.1 265 58.9 264.7 Z M54.7 167.2 C54.3 167.2 54.1 166.8 53.5 167.9 C52.9 169.1 51.9 172.1 51.4 173.3 C50.8 174.6 50.3 174.2 50.2 174.9 C50.1 175.6 50.9 176.2 51 177.4 C51.2 178.5 51.3 180.1 51 181.3 C50.8 182.6 49.7 183.4 49.7 184.5 C49.7 185.5 50.7 186.3 51 187.2 C51.2 188.1 50.8 188.2 51.1 189.3 C51.3 190.5 52.1 192.2 52.4 193.6 C52.6 195 52.2 196.1 52.5 197.1 C52.7 198 53.2 198.5 53.6 198.9 C54.1 199.3 54.5 199.5 54.9 199.4 C55.3 199.3 55.8 202.5 55.9 198.4 C56 194.4 55.3 182.1 55.4 176.8 C55.5 171.6 56.2 170.8 56.3 169.2 C56.4 167.5 56.1 168.1 55.8 167.7 C55.5 167.4 55.2 167.2 54.7 167.2 Z"],
    ["Neck", "M73.3 31.1 C72.7 31.1 71.7 31 71.1 31.6 C70.5 32.2 70.2 33.2 70 34.3 C69.8 35.3 69.8 36.5 69.9 37.4 C70.1 38.4 70.6 38.8 70.8 39.6 C70.9 40.3 70.7 41.1 70.9 41.6 C71 42.1 71.4 42.3 71.8 42.4 C72.2 42.4 72.6 42.2 73.1 41.8 C73.5 41.4 74.1 40.9 74.3 40.3 C74.4 39.7 73.7 39.9 73.9 38.5 C74 37.1 75 33.7 75.2 32.5 C75.3 31.3 75 31.9 74.7 31.6 C74.3 31.4 73.9 31.1 73.3 31.1 Z"],
    ["Traps", "M80 28.9 C79.6 26 78.9 28.1 78 28.4 C77.1 28.6 75.6 29.5 75.1 30.2 C74.6 31 75.5 31.1 75.3 32.6 C75.1 34.1 74.2 37.1 74 38.5 C73.8 39.9 74.7 39.6 74.4 40.4 C74.1 41.2 73 42.2 72.2 42.8 C71.4 43.4 70.6 43.2 69.9 43.6 C69.3 44 69.5 44.4 68.7 44.9 C67.9 45.3 66.2 45.4 65.3 45.9 C64.4 46.4 64.6 47.1 63.7 47.6 C62.9 48 62.3 47.6 60.6 48.3 C58.9 49 55.4 50.5 54.1 51.6 C52.8 52.8 53.1 53.4 53.3 54.7 C53.5 55.9 54.4 57.8 55.4 58.8 C56.5 59.8 58 60.2 59.1 60.2 C60.3 60.2 58 59.1 61.7 58.8 C65.5 58.6 76.7 60.2 80 58.7 L80 50.6 L80 50.1 C79.8 49.8 78.6 49.6 78.6 48.7 C78.6 47.8 79.8 45.9 80 45.1 L80 44.2 L80 28.9 Z"],
    ["MidTraps", "M61.9 59.1 C58.5 59.3 60.8 59.7 61 60.2 C61.2 60.6 62.7 60.6 63.1 61.6 C63.5 62.7 62.5 63.4 63.2 66 C64 68.6 66.4 73.6 67.2 75.9 C67.9 78.2 66.9 77.8 67.3 78.7 C67.8 79.7 69.1 80.2 69.7 81.3 C70.2 82.5 69.5 82.6 70.5 85 C71.4 87.5 73.9 92.9 74.9 94.9 C75.9 97 75.7 96.2 76.1 96.6 C76.6 96.9 76.8 97.3 77.4 96.7 C77.9 96.1 78.6 94 79.1 93.3 C79.5 92.6 79.8 98.8 80 92.7 L80 59.1 C76.7 53 65.4 58.9 61.9 59.1 Z"],
    ["Lats", "M66.2 78.9 C65 79.1 63.4 80.4 61.8 80.9 C60.3 81.4 58.7 81.1 57.4 81.6 C56.2 82.1 56 82.9 54.9 83.5 C53.7 84.1 52.4 84.6 51.1 84.9 C49.9 85.2 48.8 85 48 85.2 C47.2 85.4 47.1 85.6 46.9 85.8 C46.6 86.1 46.5 86.1 46.6 86.6 C46.7 87.2 47.4 88.1 47.5 88.9 C47.6 89.6 46.4 89.6 47.2 90.5 C48 91.4 51.2 93.1 52 93.9 C52.8 94.7 52.1 94.7 51.7 95.1 C51.3 95.5 50.2 95.5 49.8 96.2 C49.4 96.8 48.3 97.1 49.4 98.8 C50.5 100.4 54.3 103.9 55.9 105.3 C57.4 106.7 57.2 105.7 57.9 106.5 C58.6 107.4 58.8 108.8 59.7 109.9 C60.7 111 62.1 111.3 63 112.5 C64 113.7 64.5 115.5 65.1 116.3 C65.8 117.1 66.1 117 66.6 117.1 C67 117.1 67.3 116.9 67.7 116.5 C68 116.2 68.4 116 68.4 115.1 C68.5 114.1 68 112.1 68 111.1 C68 110.1 68 110.3 68.6 109.6 C69.1 108.8 70.5 107.9 71.3 107.1 C72 106.3 72.1 105.6 72.8 105 C73.4 104.3 73.8 104.5 74.6 103.6 C75.4 102.6 76.8 100.6 77.3 99.7 C77.8 98.7 77.9 99.4 77.5 98.5 C77 97.7 75.8 96.6 74.9 95 C73.9 93.5 73.1 91.8 72.3 90 C71.5 88.2 70.9 86.7 70.4 85 C69.8 83.4 69.7 81.8 69.3 80.9 C69 79.9 68.9 80.2 68.4 79.8 C67.8 79.4 67.4 78.7 66.2 78.9 Z"],
    ["LowerBack", "M80 93.1 C79.9 93.1 79.6 93.3 79.3 93.6 C79 94 78.5 94 78.2 95 C77.9 96.1 78.1 98 77.5 99.5 C76.8 101.1 75.7 102.5 74.8 103.5 C74 104.5 73.5 104.3 72.9 105 C72.2 105.6 72.1 106.3 71.4 107.1 C70.6 107.9 69.3 108.5 68.7 109.6 C68.1 110.6 68.1 111.8 68.1 112.8 C68.2 113.8 68.9 114.4 68.9 115 C68.9 115.5 68.3 115.8 68.2 116.1 C68.1 116.4 67.6 116.2 68.3 116.8 C69 117.3 71.1 118.3 72 119 C73 119.8 73 120 73.5 120.9 C74 121.8 74.3 122.6 74.7 123.8 C75.1 125.1 75.8 126.8 75.8 127.8 C75.7 128.8 74.8 128.9 74.6 129.4 C74.3 129.8 73.8 129.1 74.6 130.3 C75.4 131.4 77.9 134.7 78.8 135.9 C79.8 137 79.8 136.6 80 136.7 L80 136.2 L80 93.6 L80 93.1 Z"],
    ["UpperBack", "M54.3 62 C54 62.4 54.1 63.1 54.3 63.5 C54.5 64 55.1 64.3 55.5 64.5 C56 64.6 56.2 64.7 56.7 64.5 C57.1 64.3 57.8 63.9 58 63.5 C58.2 63.2 58.2 63.1 57.9 62.7 C57.5 62.3 56.5 61.5 55.9 61.4 C55.2 61.3 54.6 61.6 54.3 62 Z M61.2 63.9 C60.4 63.7 59.6 63.7 58.6 64 C57.6 64.2 56.3 64.9 55.5 65.5 C54.8 66.1 54.6 66.4 54.3 67.1 C54.1 67.8 54.2 68.9 54.1 69.4 C53.9 69.9 53.6 70 53.3 70.1 C53 70.2 53 70.3 52.4 69.9 C51.8 69.5 50.8 68.1 50 67.8 C49.3 67.4 48.7 68 48.2 68.2 C47.8 68.4 47.6 68.5 47.5 68.9 C47.4 69.4 47.2 69.9 47.7 70.5 C48.2 71.1 49.4 71.5 50.4 72.5 C51.5 73.4 52.5 74.6 53.5 76 C54.4 77.4 54.9 79.2 55.7 80.2 C56.4 81.1 57.1 81.2 57.8 81.3 C58.5 81.3 58.6 82.3 59.4 80.4 C60.2 78.5 61.6 73.2 62.1 70.9 C62.6 68.5 62 68.2 62.2 67.1 C62.4 66.1 63.2 65.8 63 65.2 C62.8 64.6 62 64.1 61.2 63.9 Z M63.5 68.2 C63.2 68.2 62.6 68.3 62.3 68.8 C62.1 69.3 62.6 69.1 62.2 71 C61.8 72.9 60.4 77.6 60.1 79.3 C59.7 81 60 80 60.3 80.3 C60.5 80.6 60.3 81.1 61.4 80.8 C62.5 80.5 65.3 79.2 66.3 78.6 C67.4 78 67 78.3 67.1 77.6 C67.1 76.9 66.9 75.5 66.6 74.6 C66.3 73.7 65.9 73.7 65.5 72.7 C65.1 71.6 64.7 69.5 64.3 68.7 C64 67.9 63.9 68.2 63.5 68.2 Z M44.6 70.2 C44.2 70.9 43.9 72.2 43.9 73 C43.8 73.8 44.3 74.3 44.2 74.9 C44.2 75.5 43.8 75.8 43.8 76.5 C43.9 77.2 44.5 77.8 44.7 78.7 C44.8 79.7 44.6 80.8 44.8 81.7 C44.9 82.5 44.9 83 45.4 83.6 C46 84.1 47 84.6 47.9 84.9 C48.8 85.1 49.3 85.2 50.6 84.9 C51.9 84.6 54.1 83.8 55.1 83.1 C56.1 82.4 56.5 82.2 56.2 81 C55.9 79.7 54.4 77.6 53.4 76 C52.3 74.5 51.5 73.6 50.3 72.5 C49.2 71.4 47.7 70.3 47 69.8 C46.2 69.3 46.5 69.5 46.1 69.6 C45.7 69.6 45 69.6 44.6 70.2 Z"],
    ["Obliques", "M60.1 110.4 C59.2 109.9 59.2 109.9 58.7 111.1 C58.2 112.3 57.5 115.6 57.4 117.1 C57.2 118.6 57.8 118.4 57.8 119.2 C57.8 120.1 57.3 121.1 57.4 121.7 C57.5 122.3 57.1 122.9 58.2 122.4 C59.3 122 62.1 120.3 63.4 119.4 C64.7 118.5 65.2 118.7 65.3 117.7 C65.4 116.6 64.7 114.8 63.8 113.5 C62.9 112.2 61.1 110.8 60.1 110.4 Z"],
    ["RearDelts", "M60.7 62.4 C60.5 61.9 59.9 61.1 58.9 60.4 C57.9 59.8 56.2 59.5 55.3 58.8 C54.4 58 54.3 56.8 53.8 56.2 C53.3 55.6 53.5 55.5 52.7 55.5 C52 55.5 51.2 56.2 49.7 56.2 C48.2 56.3 46.2 55.6 44.4 55.9 C42.6 56.3 41.3 57.2 39.9 58.2 C38.4 59.2 37.2 60.7 36.3 61.7 C35.5 62.8 35.1 63.4 34.9 64.2 C34.7 65 35.4 65.5 35.3 66.4 C35.1 67.2 34.3 67.8 34 68.7 C33.7 69.6 33.8 70.7 33.4 71.4 C33 72.1 32.2 72.2 31.9 72.6 C31.6 72.9 31.5 72.9 31.8 73.3 C32 73.8 32.9 74.6 33.4 75 C33.9 75.3 34.2 75.3 34.6 75.3 C35 75.3 35.1 75.3 35.5 74.8 C35.9 74.3 36.3 73.1 36.8 72.4 C37.3 71.8 37.5 71.5 38.2 71.1 C38.9 70.7 39.4 70.4 40.7 70.1 C42 69.8 43 70.3 45.3 69.5 C47.6 68.7 52 66.5 53.6 65.6 C55.3 64.7 54.4 65.3 54.5 64.7 C54.6 64 54 62.7 54.1 62.1 C54.2 61.5 54.7 61.4 55.1 61.3 C55.5 61.2 55.7 61.1 56.4 61.5 C57.2 62 58.6 63.3 59.4 63.6 C60.1 63.9 60.2 63.5 60.5 63.3 C60.7 63 61 62.9 60.7 62.4 Z"],
    ["Triceps", "M31 79.3 C30.4 79.2 30.2 79.3 29.5 79.8 C28.9 80.3 28.2 80.8 27.4 81.9 C26.7 83 26 83.3 25.4 85.9 C24.9 88.6 24.6 94.3 24.5 96.7 C24.4 99.1 24.8 98.7 25 99.3 C25.2 99.9 25.3 100 25.7 99.9 C26.2 99.9 26.9 100.1 27.4 99.1 C27.9 98.1 28 96.1 28.6 94.6 C29.2 93.1 30.3 91.8 30.6 90.8 C31 89.7 30 89.8 30.4 88.6 C30.8 87.5 32.4 85.9 32.9 84.5 C33.3 83 33.2 81.5 32.9 80.5 C32.5 79.6 31.6 79.5 31 79.3 Z M43.3 69.9 C42.6 69.8 41.6 69.9 40.6 70.3 C39.5 70.6 38.7 70.3 37.4 71.9 C36.1 73.5 34 76.9 33.2 79.2 C32.4 81.4 33.4 82.8 33 84.5 C32.5 86.1 31.1 86.9 30.8 88.4 C30.5 89.9 31.4 91.3 31.2 92.9 C31 94.5 30.1 96.2 29.9 97.2 C29.7 98.2 29.8 98.2 30 98.5 C30.1 98.9 30.2 98.9 30.8 99.1 C31.4 99.3 32.1 99.7 33.3 99.8 C34.5 99.8 36.1 99.9 37.4 99.6 C38.7 99.2 39.6 98.6 40.3 98 C41.1 97.4 40.6 97.1 41.4 96.2 C42.1 95.3 43.7 93.6 44.4 93 C45.1 92.5 44.9 92.7 45.3 93 C45.6 93.3 45.8 94.3 46.4 94.8 C47.1 95.3 47.9 95.7 48.9 95.7 C49.8 95.6 51.3 94.9 51.7 94.5 C52.2 94.1 52.2 94.1 51.4 93.4 C50.5 92.6 47.7 91.2 46.9 90.3 C46.2 89.4 47.4 89.2 47.3 88.5 C47.2 87.9 46.6 87.3 46.5 86.7 C46.4 86.1 47 85.6 46.8 85 C46.6 84.4 45.6 84 45.3 83.5 C44.9 82.9 44.8 82.6 44.7 81.8 C44.5 80.9 44.8 79.8 44.6 78.8 C44.4 77.9 43.8 77.9 43.7 76.5 C43.6 75 44.2 72 44.2 70.9 C44.1 69.7 43.9 70 43.3 69.9 Z"],
    ["Forearms", "M43.5 96.1 C43.5 95.3 43 95.7 42.7 95.6 C42.4 95.6 42.3 95.5 41.8 95.9 C41.3 96.4 41 97.6 40.1 98.3 C39.3 99 38.3 99.5 37.1 99.8 C35.8 100.1 34.2 99.9 33.3 99.9 C32.3 99.8 32.1 99.4 31.6 99.4 C31 99.4 31.4 98.7 30.2 99.9 C29.1 101.2 26 104.7 25.1 106.3 C24.2 107.9 24.4 108.2 25.1 109 C25.8 109.7 27.6 110.3 28.8 110.5 C29.9 110.7 30.4 110.5 31.7 110 C33 109.6 34 109.7 36 108.2 C37.9 106.6 41.4 102.8 42.7 101.3 C44 99.9 43.1 101.1 43.2 100.1 C43.4 99.2 43.6 96.9 43.5 96.1 Z M20.8 110.7 C20 110.8 19.1 111.2 18.4 112.1 C17.7 113.1 17 115.1 16.9 116.2 C16.7 117.3 17.7 117.5 17.3 118.4 C17 119.3 15.4 120.3 15.1 121.1 C14.7 122 15.5 121.6 15.5 123.3 C15.5 125 15 129.2 15.1 130.7 C15.1 132.2 15.5 131.5 15.8 131.8 C16.2 132.1 16.6 132.5 17.1 132.5 C17.5 132.5 18.3 132.3 18.5 131.7 C18.7 131.1 18.1 129.9 18.2 129 C18.3 128.2 18.8 128.1 19 127 C19.1 125.9 18.1 125.5 18.8 122.9 C19.5 120.4 22.3 114.7 23 112.7 C23.7 110.7 23.1 112 22.7 111.6 C22.3 111.3 21.5 110.6 20.8 110.7 Z M35.7 108.7 C35.3 108.7 34.7 108.7 33.9 109.1 C33.1 109.4 31.9 109.1 31.3 110.7 C30.7 112.2 31.1 115.3 30.8 117.7 C30.4 120 30.2 121.4 29.4 123.6 C28.6 125.8 27 127.8 26.4 129.9 C25.7 132 26.2 134 26 135.2 C25.7 136.4 25.5 135.3 25 136.7 C24.5 138.1 23.5 141.7 23.2 143.1 C22.9 144.5 23.1 144 23.2 144.3 C23.3 144.6 23.4 145 23.9 144.9 C24.4 144.9 25 145.7 26.1 144 C27.1 142.3 29 137.6 29.7 135.5 C30.3 133.5 29.5 133.4 29.9 132.6 C30.3 131.8 30.8 132.6 31.8 131.3 C32.7 129.9 34.4 126.7 35.1 125.2 C35.7 123.7 35 123.8 35.3 123.2 C35.5 122.5 36.2 123.4 36.4 121.5 C36.7 119.5 36.4 114.3 36.5 112.4 C36.6 110.4 37 111.4 36.9 110.8 C36.9 110.2 36.6 109.6 36.4 109.2 C36.2 108.9 36.2 108.8 35.7 108.7 Z M30.1 110.4 C29.7 110.3 29.4 110.7 28.6 110.6 C27.9 110.5 26.8 109.7 25.8 109.8 C24.9 110 24.7 109.1 23.5 111.5 C22.3 113.8 20 119.6 19.2 122.7 C18.3 125.8 18.7 127.2 18.6 128.7 C18.6 130.2 19.1 129.3 19 130.9 C18.8 132.5 18 134.8 17.7 137.6 C17.5 140.4 17.7 144.7 17.7 146.6 C17.8 148.4 17.8 147.3 18.2 147.7 C18.5 148.1 19.1 148.6 19.6 148.7 C20.2 148.7 20.7 148.5 21.1 148.2 C21.5 147.9 21.4 148.5 22 146.9 C22.5 145.3 23.3 141.5 24 139.4 C24.7 137.3 25.3 137 25.7 135.3 C26.1 133.6 25.6 132 26.2 129.9 C26.9 127.8 28.4 126.6 29.2 123.7 C30.1 120.8 30.8 116.1 31.1 113.8 C31.4 111.6 31.2 111.7 31.1 111.1 C30.9 110.5 30.5 110.5 30.1 110.4 Z"],
    ["Glutes", "M75.1 130.9 C73.5 130.4 70.8 130.9 68.9 131.5 C67.1 132 65.9 132.9 64.8 133.7 C63.7 134.6 63.5 135 62.8 136.1 C62.1 137.2 61.3 138.1 61 139.9 C60.6 141.8 61.1 144.7 60.9 146.3 C60.7 147.9 60.1 147.9 60 148.8 C60 149.7 60.9 149.4 60.5 151.4 C60.1 153.4 58.2 157.7 57.8 159.7 C57.4 161.7 57.7 161.7 58.3 162.4 C58.9 163.2 60.2 163.7 60.9 163.9 C61.7 164.2 61.7 164.1 62.3 163.9 C62.8 163.6 63.1 162.5 64.1 162.5 C65.1 162.4 66.6 163.7 67.9 163.6 C69.2 163.5 69.8 162.2 71.3 161.9 C72.8 161.6 74.5 162.4 76.1 161.8 C77.7 161.3 79.3 159.5 80 158.9 L80 158.6 L80 137 C79.8 133 79 136.6 78.6 136.1 C78.2 135.6 78.4 135.1 77.8 134.2 C77.1 133.3 76.7 131.4 75.1 130.9 Z"],
    ["Abductors", "M71.7 118.8 C70.8 118.2 70.1 116.9 68 117.3 C66 117.7 62.1 120 60.3 121.1 C58.4 122.2 58.3 122.4 57.6 123.3 C56.9 124.2 56.8 124.5 56.5 126 C56.2 127.5 56.2 130.2 56 131.6 C55.7 133 55.2 133 55.1 134 C54.9 135 54.9 136.1 55.1 137.1 C55.4 138.1 56 139.1 56.5 139.7 C57.1 140.2 57.4 140.3 58.2 140.3 C59.1 140.2 60.2 140.6 61.3 139.4 C62.4 138.2 63 135.1 64.3 133.7 C65.7 132.2 67.1 131.9 68.8 131.4 C70.5 130.8 72.3 131.1 73.5 130.6 C74.7 130 75.1 128.9 75.5 128.3 C75.9 127.8 76 128.8 75.6 127.4 C75.3 126.1 74 122.4 73.3 120.8 C72.6 119.3 72.7 119.5 71.7 118.8 Z"],
    ["Adductors", "M78 170.2 C77.5 170.1 77.1 170.5 76.8 170.7 C76.5 170.9 76.4 169.4 76.3 171.5 C76.1 173.7 76 179.6 75.8 182.5 C75.5 185.3 75.1 186.3 74.8 187.5 C74.5 188.7 74.1 188.4 74 189 C74 189.5 74.6 189.3 74.4 190.7 C74.1 192.1 72.9 195.3 72.6 196.9 C72.4 198.5 72.4 198.8 72.8 199.6 C73.2 200.3 74.3 200.4 74.8 200.8 C75.2 201.2 75.5 199.5 75.3 201.7 C75.1 203.9 74.1 209.8 73.5 213.1 C72.9 216.3 72.1 217.9 71.7 219.8 C71.4 221.7 71.6 222.6 71.8 223.4 C71.9 224.2 72.3 224.2 72.7 224.2 C73.1 224.2 73.3 224.6 74 223.4 C74.6 222.2 75.7 219.7 76.5 217.4 C77.2 215.2 77.8 213.2 78.3 210.9 C78.8 208.7 79.1 207.3 79.2 205 C79.4 202.6 79.6 199.6 79.2 198.1 C78.9 196.6 77.8 197.1 77.4 196.6 C76.9 196.2 76.8 196.2 76.7 195.5 C76.7 194.8 76.9 193.3 77.1 192.6 C77.2 191.9 77.2 192.2 77.7 191.7 C78.2 191.3 79.6 192.8 80 189.9 L80 175.3 L80 174.5 L80 171.1 C79.6 170.3 78.6 170.3 78 170.2 Z"],
    ["Hamstrings", "M75.4 162 C74.3 161.9 71.9 161.9 70.7 162.2 C69.5 162.6 69.3 163.2 68.8 163.8 C68.4 164.3 68.3 164 68.1 165.4 C68 166.7 68.2 170 68.1 171.4 C68 172.8 67.7 172.4 67.7 173.1 C67.7 173.9 68.4 172.5 68.1 175.6 C67.8 178.7 65.9 187.5 65.9 190.4 C65.8 193.4 67.2 191.3 67.9 192.1 C68.5 193 68.9 194.3 69.6 195.1 C70.3 195.8 71.2 196.2 71.8 196.3 C72.4 196.4 72.5 196.6 72.9 195.6 C73.3 194.6 74.1 191.9 74.3 190.7 C74.4 189.5 73.8 189.5 73.9 189 C74 188.4 74.4 188.7 74.7 187.5 C75 186.3 75.4 185.2 75.7 182.3 C75.9 179.5 75.8 174 76.1 171.5 C76.5 169.1 77.2 170.3 77.5 168.8 C77.7 167.4 77.5 164.5 77.4 163.3 C77.3 162.2 77.3 162.8 76.9 162.6 C76.6 162.4 76.6 162.1 75.4 162 Z M64.5 163.2 C63.5 163.2 62.7 164.2 61.6 164.2 C60.6 164.2 59.5 163.4 58.7 163.4 C57.9 163.4 57.7 163.7 57.2 164.1 C56.7 164.5 56.1 164.6 56 165.7 C55.9 166.8 56.5 168.1 56.4 170.1 C56.3 172.1 55.6 171.7 55.5 176.8 C55.5 181.9 56.1 194.1 56 198.3 C55.9 202.5 55.2 198.5 55.1 200.2 C55.1 202 55.1 206.1 55.6 207.9 C56.1 209.6 56.8 209.8 58 209.9 C59.2 209.9 61.1 208.7 62.1 208.1 C63 207.4 63.2 207.2 63.5 206.3 C63.8 205.4 63.1 205.6 63.5 203 C63.9 200.5 64.9 197.3 65.7 192.4 C66.5 187.4 67.7 178.9 68 175.5 C68.3 172 67.6 174 67.6 173.2 C67.6 172.5 67.9 172.9 68 171.4 C68.1 169.9 68.1 166.1 68 164.8 C67.9 163.4 68.1 164.2 67.5 163.9 C66.8 163.7 65.6 163.1 64.5 163.2 Z M66.8 192 C66.3 192.2 65.9 192 65.5 193.5 C65.1 195 64.8 198.7 64.5 200.5 C64.2 202.2 63.8 202.2 63.7 203 C63.5 203.9 63.3 204.5 63.7 205.4 C64 206.3 64.3 207.2 65.5 208.1 C66.8 208.9 69.4 209.7 70.5 209.9 C71.6 210.1 71.4 209.5 71.7 209.2 C72.1 208.9 72.3 208.9 72.5 208.1 C72.7 207.3 73 206.5 73 204.6 C73 202.7 72.7 199.1 72.5 197.6 C72.3 196.2 72.4 197.1 72 196.8 C71.5 196.5 70.8 196.7 70.1 195.9 C69.3 195.1 68.5 193.1 67.9 192.4 C67.3 191.7 67.2 191.8 66.8 192 Z"],
    ["Calves", "M52 248.4 C52.1 249.1 53.4 251.1 54 251.9 C54.6 252.6 54.3 252.7 55.3 252.6 C56.3 252.6 58.4 252.1 59.4 251.7 C60.3 251.3 60.5 250.9 60.8 250.5 C61 250.1 60.9 249.8 60.6 249.5 C60.4 249.2 60.3 249 59.5 248.9 C58.6 248.8 57.2 249 56.1 248.8 C55 248.6 54 247.7 53.3 247.6 C52.5 247.5 51.9 247.6 52 248.4 Z M64.3 245.6 C64 245.5 63.6 245.4 63.1 245.7 C62.6 246.1 61.8 247.1 61.6 247.7 C61.3 248.3 61.7 248.7 61.9 249 C62.2 249.3 62.7 249.4 63.2 249.3 C63.7 249.2 64.3 248.8 64.6 248.3 C64.9 247.7 64.9 246.8 64.9 246.4 C64.8 245.9 64.6 245.7 64.3 245.6 Z M55 222.3 C54.7 222 54.3 222 54 222.2 C53.6 222.3 53.4 222.1 52.9 223 C52.4 223.8 51.4 226.2 51.1 227.1 C50.8 228 51.3 227.8 51.5 228 C51.7 228.2 52 228.3 52.4 228.2 C52.7 228.1 53.2 227.9 53.4 227.5 C53.7 227 53.4 226.3 53.7 225.7 C54.1 225 55.1 224.2 55.3 223.6 C55.6 223 55.2 222.5 55 222.3 Z M66.8 208.8 C66.3 208.8 65.9 208.8 65.2 209.4 C64.6 210 63.6 206.1 63.2 212.2 C62.8 218.2 63.1 237.2 63.2 242.9 C63.2 248.6 63.1 243.4 63.4 243.8 C63.7 244.2 64.5 244.3 64.9 245 C65.2 245.7 64.7 246.8 65.2 247.6 C65.6 248.3 66.6 249.1 67.5 249.1 C68.4 249.2 69.5 249 70.1 248 C70.8 247.1 70.4 245.3 71.1 244 C71.8 242.7 73.6 242.4 74.2 240.8 C74.8 239.3 74.6 238.1 74.3 235.3 C74 232.6 73 227.7 72.5 225.5 C72 223.4 71.6 225.6 71.4 223.4 C71.3 221.2 71.8 215.5 71.5 213.2 C71.3 210.8 70.6 211 70 210.3 C69.4 209.5 68.7 209.3 68.1 209 C67.5 208.8 67.3 208.7 66.8 208.8 Z M61.6 209.3 C61.1 209.3 60.6 209.5 60.1 209.8 C59.7 210.2 59.1 210.8 58.9 211.1 C58.6 211.5 58.6 211.5 58.8 211.9 C58.9 212.4 59.4 212.7 59.6 213.5 C59.7 214.3 59.8 215.6 59.5 216.5 C59.1 217.5 58.2 217.2 57.4 218.6 C56.7 219.9 55.9 222.9 55.2 224.2 C54.6 225.5 54.2 225.1 53.9 225.7 C53.6 226.2 54.1 226.8 53.5 227.5 C53 228.1 51.4 228.5 50.7 229.3 C50 230.1 50 230.7 49.7 231.8 C49.4 233 49.3 234.4 49.2 235.7 C49.2 236.9 48.9 237.9 49.5 238.8 C50.1 239.8 51.5 240.7 52.7 241 C54 241.3 55.6 240.6 56.4 240.6 C57.3 240.7 57.3 240.8 57.4 241.2 C57.6 241.5 57.4 242.3 57.2 242.6 C57 243 57.2 243.3 56.5 243.3 C55.9 243.3 54.4 242.6 53.6 242.7 C52.9 242.7 52.5 242.8 52.4 243.5 C52.3 244.3 52.7 245.9 53 246.7 C53.3 247.5 53.6 247.5 54.2 247.8 C54.7 248.2 54.9 248.6 56.1 248.7 C57.3 248.8 59.6 248.7 60.7 248.4 C61.8 248.1 61.7 247.6 62.1 247 C62.5 246.4 62.9 251.2 63 245 C63.2 238.8 63 218.6 63.1 212.4 C63.1 206.2 63.5 211.1 63.5 210.7 C63.5 210.2 63.3 210.1 63 209.8 C62.6 209.6 62.1 209.3 61.6 209.3 Z M54.6 253.3 C54 253.8 54.1 254.3 54.2 254.9 C54.3 255.6 54.9 256.1 55 256.9 C55.2 257.7 55 258.7 55.1 259.4 C55.2 260.2 55.3 260.6 55.7 261.1 C56.1 261.6 56.7 261.5 57.1 262 C57.5 262.5 57 263.1 57.9 263.9 C58.7 264.6 60.9 265.7 61.8 266.1 C62.8 266.4 62.8 266.1 63.1 265.8 C63.4 265.6 64 267 63.5 264.6 C63 262.2 61.2 254.9 60.2 252.7 C59.2 250.4 59 251.9 58 252 C57 252.1 55.3 252.8 54.6 253.3 Z M72.5 243.3 C72.1 243.2 71.5 243.4 71.1 244.1 C70.8 244.8 71 246.3 70.8 247 C70.5 247.8 70.5 247.9 69.9 248.3 C69.3 248.7 68.3 249.2 67.5 249.2 C66.6 249.3 65.8 248.5 65.2 248.5 C64.6 248.5 64.1 248.8 64.1 249.3 C64.2 249.8 64.7 250.6 65.4 251.2 C66.2 251.7 67.9 251.8 68.2 252.4 C68.5 253 67.4 252.8 67.2 254.5 C67.1 256.1 67.2 260.3 67.2 261.8 C67.3 263.2 67.3 262.3 67.5 262.5 C67.7 262.7 67.9 263.1 68.4 263 C68.8 262.9 69.6 263 70.1 262 C70.7 261 70.8 258.8 71.3 257.3 C71.8 255.7 72.5 255.6 72.9 253.2 C73.3 250.9 73.5 246 73.4 244.2 C73.3 242.4 72.9 243.3 72.5 243.3 Z"]
  ]
};
function bodySvg(side, m) {
  const mir = d => '<path d="' + d + '"/><path d="' + d + '" transform="translate(160 0) scale(-1 1)"/>';
  return '<svg viewBox="0 0 160 312" class="bsvg" role="img" aria-label="' + side + ' view">' +
    '<path d="' + (side === 'back' ? BODY_SIL_B : BODY_SIL) + '" fill="#262a30" stroke="#6f7680" stroke-width="0.9" stroke-linejoin="round"/>' +
    BODY[side].map(([r, d]) => r[0] === '_' ? '<g fill="#2b2f36" stroke="#5c636d" stroke-width="0.6" stroke-linejoin="round">' + mir(d) + '</g>' : '<g data-g="r_' + r + '" fill="' + PCOL[pBand(m['r_' + r] ? m['r_' + r].n : 0)] + '" stroke="#9aa1ab" stroke-width="0.7" stroke-opacity="0.85" stroke-linejoin="round">' + mir(d) + '</g>').join('') +
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
function plUpd() { const t = plateLine(formEx, $('fl').value.trim()); $('fpl').textContent = t ? 'Plates: ' + t : ''; const bb = plateT(formEx); $('pbt').style.display = bb ? '' : 'none'; $('fl').inputMode = bb ? 'text' : 'decimal'; $('fl').placeholder = bb ? 'e.g. 185 or 4x45 2x25' : ''; if (!bb) $('pbx').hidden = true; }
// Plate-first: tap plates (one per side each), chips remove, total = bar weight (barWeight) + 2 x plates.
let pbList = []; // one entry per pair (one plate each side)
function pbRender() { const tot = barWeight(formEx) + 2 * pbList.reduce((a, b) => a + b, 0), cnt = {}; pbList.forEach(p => cnt[p] = (cnt[p] || 0) + 2); $('pbc').innerHTML = Object.keys(cnt).map(Number).sort((a, b) => b - a).map(p => '<button type="button" class="pchip" data-pr="' + p + '" aria-label="Remove a pair of ' + p + 's">' + cnt[p] + ' x ' + p + ' &times;</button>').join('') || '<span class="s2">Empty ' + (BAR_NAME[equipType(formEx)] || 'bar') + ' (' + barWeight(formEx) + ' lb). Each tap adds a pair (one plate per side).</span>'; $('pbtot').textContent = 'Total ' + (Math.round(tot * 10) / 10) + ' lb'; }
$('pbt').onclick = () => { const x = $('pbx'); x.hidden = !x.hidden; if (!x.hidden) { pbList = []; pbRender(); } $('pbtl').textContent = x.hidden ? 'Build from plates' : 'Hide plate builder'; $('pbt').classList.toggle('on', !x.hidden); };
$('pbp').addEventListener('click', e => { const b = e.target.closest('[data-pp]'); if (!b) return; pbList.push(+b.dataset.pp); pbList.sort((a, c) => c - a); pbRender(); });
$('pbc').addEventListener('click', e => { const b = e.target.closest('[data-pr]'); if (!b) return; const i = pbList.indexOf(+b.dataset.pr); if (i >= 0) pbList.splice(i, 1); pbRender(); });
$('pbclr').onclick = () => { pbList = []; pbRender(); };
$('pbuse').onclick = () => { $('fl').value = String(barWeight(formEx) + 2 * pbList.reduce((a, b) => a + b, 0)); bwLine(); plUpd(); };
const isBB = () => plateT(formEx);
function flPlates() { const pl = isBB() ? P_.platesToLoad($('fl').value, barWeight(formEx)) : null; if (pl && !pl.rest) { $('fl').value = String(pl.load); bwLine(); plUpd(); return true; } return false; }
$('fl').oninput = () => { bwLine(); const pl = isBB() ? P_.platesToLoad($('fl').value, barWeight(formEx)) : null; if (pl && !pl.rest) $('fpl').textContent = '= ' + pl.load + ' lb (tap away to use)'; else plUpd(); };
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
function fill(txt) { const p = P_.parseSpeech(txt, { barbell: isBB(), bar: isBB() ? barWeight(formEx) : BAR });
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
