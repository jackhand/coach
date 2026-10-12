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
function toast(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 2400); }

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
let S = null, days = {}, dayKey = null, sig = '', formEx = null, firstRender = true;

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
const getQ = () => jget('coach_queue', []);
const setQ = q => { jset('coach_queue', q); badge(); };
function badge() { const n = getQ().length, b = $('pending'); b.textContent = n + ' pending'; b.style.display = n ? 'inline-block' : 'none'; }
let flushing = false;
async function flush() {
  if (flushing || !U || !K) return;
  flushing = true; let changed = false;
  try {
    while (true) {
      const q = getQ(); if (!q.length) break;
      const it = q[0];
      let res;
      try { res = await apiPost(it.action === 'log' ? { action: 'log', profile: it.profile, set: it.set } : { action: 'undo', profile: it.profile, set_id: it.set_id }); }
      catch (e) { break; } // network: keep, retry later
      if (!res.ok && res.error === 'unauthorized') { showSettings('Key rejected by the backend. Check the key.'); break; }
      if (!res.ok) toast('Dropped a queued item: ' + res.error);
      setQ(getQ().filter(x => x.id !== it.id)); changed = true;
      if (res.ok && res.row && S && it.profile === P) { S.rows = S.rows.filter(r => r.set_id !== res.row.set_id).concat([res.row]); }
    }
  } finally { flushing = false; }
  if (changed) load();
}
setInterval(flush, 15000);
window.addEventListener('online', flush);

// ---------- Rows view (server rows + pending) ----------
function viewRows() {
  if (!S) return [];
  const q = getQ().filter(x => x.profile === P);
  const undone = new Set(q.filter(x => x.action === 'undo').map(x => x.set_id));
  const have = new Set(S.rows.map(r => r.set_id));
  const pend = q.filter(x => x.action === 'log' && !have.has(x.set.set_id)).map(x => Object.assign({}, x.set, { date: x.date, rest_time: '', logged_at: new Date(x.set.client_ts).toISOString(), pending: true }));
  return S.rows.concat(pend).filter(r => !undone.has(r.set_id));
}
function cardsFor() { const d = days[dayKey]; return d ? d.exercises : []; }
function rowsFor(ex, today) {
  const keys = new Set(ex.match_keys.concat([P_.norm(ex.canonical), P_.norm(ex.name)]));
  return viewRows().filter(r => keys.has(P_.norm(r.exercise)) && (today ? r.date === S.today : r.date < S.today));
}
function lastTime(ex) {
  const rs = rowsFor(ex, false); if (!rs.length) return '';
  const d = rs.reduce((m, r) => r.date > m ? r.date : m, '');
  return 'Last time (' + d + '): ' + rs.filter(r => r.date === d).map(r => (r.load || '?') + ' x ' + r.reps).join(', ');
}
function setsHTML(ex) {
  const rs = rowsFor(ex, true); if (!rs.length) return '<li class="s2">No sets logged today.</li>';
  return rs.map((r, i) => {
    const e = P_.e1rm(r.load, r.reps);
    const bits = [FT_LABEL[r.failure_type] || r.failure_type, r.pending ? 'pending sync' : (r.rest_time ? 'rest ' + r.rest_time : ''), e ? ('e1RM ' + e.ep + ' Epley / ' + e.br + ' Brzycki') : ''].filter(Boolean).join(' · ');
    return '<li' + (r.pending ? ' class="pend"' : '') + '><div class="s1">Set ' + (i + 1) + ': ' + esc(r.load || '-') + ' x ' + esc(r.reps) + '</div><div class="s2">' + esc(bits) + (r.notes ? '<br>' + esc(r.notes) : '') + '</div></li>';
  }).join('');
}

// ---------- Render ----------
function render() {
  const main = $('main'), d = days[dayKey];
  const opts = DAYS.slice();
  $('day').innerHTML = opts.map(x => '<option value="' + x + '"' + (x === dayKey ? ' selected' : '') + '>' + x[0].toUpperCase() + x.slice(1, 3) + (x === S.weekday ? ' (today)' : '') + (days[x] ? '' : ' -') + '</option>').join('');
  $('prof').value = P;
  if (!d) { $('sub').textContent = ''; main.innerHTML = '<div class="empty">' + (S.program ? 'No session written for ' + esc(dayKey[0].toUpperCase() + dayKey.slice(1)) + ' yet.<br>Ask Coach to write it, or pick another day.' : 'No program file found for this profile yet.<br>Ask Coach to write one.') + '</div>'; return; }
  $('sub').textContent = d.title + (d.week ? ' · ' + d.week.split('.')[0] : '');
  main.innerHTML = d.exercises.map((ex, i) => {
    const n = ex.note, chips = [n.sets, n.failure, n.rest].filter(Boolean).map(c => '<span class="chip">' + esc(c) + '</span>').join('');
    const extra = n.extra.length ? '<ul>' + n.extra.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    return '<div class="note"><b>Coach:</b><div class="chips">' + chips + '</div>' + extra + '</div>' +
      '<div class="card" id="c' + i + '"><h2>' + ex.n + '. ' + esc(ex.canonical) + '</h2>' +
      '<div class="meta">' + esc(ex.muscles || '') + (ex.video ? (ex.muscles ? ' · ' : '') + '<a href="' + esc(ex.video) + '" target="_blank" rel="noopener noreferrer">Demo video</a>' : '') + '</div>' +
      '<div class="last" id="l' + i + '">' + esc(lastTime(ex)) + '</div>' +
      '<ul class="sets" id="s' + i + '">' + setsHTML(ex) + '</ul>' +
      '<button class="btn" data-i="' + i + '">Done: log set</button></div>';
  }).join('') + (d.footer && d.footer.length ? '<div class="note">' + d.footer.map(esc).join('<br>') + '</div>' : '');
  main.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => openForm(+b.dataset.i));
  markActive();
}
function update() {
  cardsFor().forEach((ex, i) => { const s = $('s' + i), l = $('l' + i); if (s) { const h = setsHTML(ex); if (s.innerHTML !== h) s.innerHTML = h; } if (l) l.textContent = lastTime(ex); });
  markActive();
}
function applyState(st, initial) {
  S = st; days = P_.enrich(P_.parseProgram(st.program), P_.parseLibrary(st.library));
  $('settings').style.display = 'none'; $('app').style.display = 'block';
  const saved = jget('coach_day', null);
  if (!dayKey) dayKey = (saved && saved.date === S.today && saved.p === P) ? saved.day : S.weekday;
  const nsig = P + '|' + dayKey + '|' + JSON.stringify(days[dayKey] || null);
  if (nsig !== sig) { if (!formEx || initial) { const y = window.scrollY; render(); sig = nsig; if (!firstRender) window.scrollTo(0, y); } }
  else update();
  syncTimer();
  if (firstRender) { firstRender = false; const s = jget('coach_scroll', null); if (s && s.p === P && s.day === dayKey) requestAnimationFrame(() => window.scrollTo(0, s.y)); }
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
let scrollT; window.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => jset('coach_scroll', { p: P, day: dayKey, y: window.scrollY }), 150); }, { passive: true });
$('day').onchange = e => { dayKey = e.target.value; jset('coach_day', { date: S.today, day: dayKey, p: P }); sig = ''; applyState(S, true); window.scrollTo(0, 0); };
$('prof').onchange = e => { P = e.target.value; LS.setItem('coach_p', P); dayKey = null; sig = ''; S = null; firstRender = true; load(true); };

// ---------- Settings ----------
function showSettings(msg) {
  $('app').style.display = 'none'; $('settings').style.display = 'block'; $('timer').style.display = 'none';
  $('su').value = U; $('sk').value = K; $('smsg').textContent = msg || '';
}
$('gear').onclick = () => showSettings();
$('ssave').onclick = async () => {
  U = $('su').value.trim(); K = $('sk').value.trim();
  if (!/^https:\/\//.test(U) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(U)) { $('smsg').textContent = 'The URL should start with https://'; return; }
  LS.setItem('coach_u', U); LS.setItem('coach_k', K); $('smsg').textContent = 'Testing...';
  try { const st = await apiGet(); if (!st.ok) { $('smsg').textContent = 'Backend said: ' + st.error; return; } jset('coach_cache_' + P, st); sig = ''; S = null; firstRender = true; applyState(st, true); toast('Connected'); flush(); }
  catch (e) { $('smsg').textContent = 'Could not reach it: ' + e.message; }
};
$('scancel').onclick = () => { if (S) { $('settings').style.display = 'none'; $('app').style.display = 'block'; } };

// ---------- Rest timer ----------
const TKEY = () => 'coach_timer_' + P;
const getT = () => jget(TKEY(), null);
function setT(t) { if (t) jset(TKEY(), t); else LS.removeItem(TKEY()); tick(); markActive(); }
function targetFor(name) { for (const d of Object.values(days)) for (const ex of d.exercises) if (P_.norm(ex.canonical) === P_.norm(name) || ex.match_keys.includes(P_.norm(name))) return ex.note.rest_target_sec || 120; return 120; }
function syncTimer() {
  const today = viewRows().filter(r => r.date === S.today && r.logged_at);
  if (!today.length) return;
  const last = today.reduce((a, b) => Date.parse(b.logged_at) > Date.parse(a.logged_at) ? b : a);
  const ts = Date.parse(last.logged_at), t = getT();
  if (!t || ts > t.start + 5000) setT({ start: ts, exercise: last.exercise, target: targetFor(last.exercise) });
}
function tick() {
  const t = getT(), el = $('timer');
  if (!t || t.hidden || $('app').style.display === 'none') { el.style.display = 'none'; return; }
  const sec = (Date.now() - t.start) / 1000;
  el.style.display = 'block'; $('tt').textContent = fmt(sec); $('ttg').textContent = fmt(t.target); $('tex').textContent = 'after ' + t.exercise;
  el.className = sec <= t.target ? 'under' : 'over';
}
setInterval(tick, 250);
function markActive() { const t = getT(); cardsFor().forEach((ex, i) => { const c = $('c' + i); if (c) c.classList.toggle('active', !!t && !t.hidden && P_.norm(ex.canonical) === P_.norm(t.exercise)); }); }
$('tclear').onclick = () => { const t = getT(); if (t) { t.hidden = true; setT(t); } };
$('tundo').onclick = () => {
  const today = viewRows().filter(r => r.date === S.today);
  if (!today.length) return toast('Nothing logged today');
  const last = today.reduce((a, b) => Date.parse(b.logged_at) >= Date.parse(a.logged_at) ? b : a);
  if (!confirm('Remove ' + last.exercise + ' ' + (last.load || '') + ' x ' + last.reps + '?')) return;
  const q = getQ(), pi = q.findIndex(x => x.action === 'log' && x.set.set_id === last.set_id);
  if (pi >= 0) { q.splice(pi, 1); setQ(q); }
  else { q.push({ id: uid(), profile: P, action: 'undo', set_id: last.set_id }); setQ(q); flush(); }
  const rest = viewRows().filter(r => r.date === S.today);
  if (rest.length) { const l = rest.reduce((a, b) => Date.parse(b.logged_at) >= Date.parse(a.logged_at) ? b : a); setT({ start: Date.parse(l.logged_at), exercise: l.exercise, target: targetFor(l.exercise) }); } else setT(null);
  update(); toast('Removed');
};

// ---------- Log form ----------
const ffSel = $('ff');
ffSel.innerHTML = FT.map(v => '<option value="' + esc(v) + '">' + esc(FT_LABEL[v]) + '</option>').join('');
function openForm(i) {
  const ex = cardsFor()[i]; formEx = ex;
  const today = rowsFor(ex, true), prev = today.length ? today[today.length - 1] : null;
  $('sh').textContent = ex.canonical; $('fl').value = prev ? prev.load : ''; $('fr').value = ''; $('fn').value = ''; $('ferr').textContent = '';
  if (SR) $('heard').textContent = '';
  const f = (ex.note.failure || '').toLowerCase();
  ffSel.value = prev && FT.includes(prev.failure_type) ? prev.failure_type : (f.includes('true') ? 'true' : f.includes('technical') ? 'technical' : 'not to failure');
  $('sheet').classList.add('open');
}
function closeForm() { $('sheet').classList.remove('open'); formEx = null; stopRec(); if (S) applyState(S, false); }
$('fcancel').onclick = closeForm;
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeForm(); });
$('fsave').onclick = () => {
  const reps = $('fr').value.trim(); if (!reps) { $('ferr').textContent = 'Reps are required.'; return; }
  const now = Date.now();
  const set = { set_id: uid(), client_ts: now, exercise: formEx.canonical, load: $('fl').value.trim(), reps, failure_type: ffSel.value, notes: $('fn').value.trim() };
  const q = getQ(); q.push({ id: uid(), profile: P, action: 'log', date: S.today, set }); setQ(q);
  const name = formEx.canonical, tgt = formEx.note.rest_target_sec || 120;
  $('sheet').classList.remove('open'); formEx = null; stopRec();
  setT({ start: now, exercise: name, target: tgt }); update(); toast('Saved');
  flush();
};

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
  if (p.load != null) $('fl').value = p.load; if (p.reps != null) $('fr').value = p.reps; if (p.ft) ffSel.value = p.ft; if (p.notes) $('fn').value = p.notes;
  $('heard').textContent = 'Heard: "' + txt + '". Check and edit, then Save.'; }

// ---------- Boot ----------
badge();
if (!U || !K) showSettings(); else { load(true); flush(); }
setInterval(() => { if (U && K && document.visibilityState === 'visible' && !flushing) load(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && U && K) { load(); flush(); tick(); } });
})();
