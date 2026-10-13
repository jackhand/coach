/**
 * Coach backend (Google Apps Script web app).
 * Deploy: Execute as Me, Who has access: Anyone.
 * Paste your private key below. Never commit a real key to a public repo.
 */
const KEY = 'PASTE_KEY_HERE';

const TZ = 'America/New_York';
const HEALTH_FOLDER_ID = '11ZqEDGtCu4jD-zLe8nIA5ZBN-NwJIPU0'; // Drive > Health
const COACH_FOLDER_ID = '1D-r9zyMclFmyt9OgthgF-1zKnyUSVjSG';  // Drive > Health > Coach
const SHEET_NAME = 'Coach Log';
const PROFILES = ['jack', 'jacky'];
const VERSION = 4;
const COLS = ['date', 'exercise', 'load', 'reps', 'failure_type', 'rest_time', 'notes', 'set_id', 'logged_at',
  'drops', 'added_load', 'bodyweight', 'total_load', 'left_reps', 'right_reps', 'edited_at', 'workout'];
const SESSION_COLS = ['date', 'finished_at', 'day', 'sets', 'exercises', 'notes', 'session_id'];
const SETTING_COLS = ['scope', 'key', 'value', 'updated_at'];
const EDITABLE = ['exercise', 'load', 'reps', 'failure_type', 'notes', 'drops', 'added_load', 'bodyweight', 'total_load', 'left_reps', 'right_reps', 'workout'];
const FILE_RE = /^(jack|jacky)-(program|exercise-library)\.md$/;
const MAX_ROWS_RETURNED = 400;

/** Run once from the editor (select setup, press Run) to authorize and create the folder and sheet. */
function setup() {
  const ss = getSheet_();
  Logger.log('Coach Log sheet: ' + ss.getUrl());
  Logger.log('Coach folder: ' + getCoachFolder_().getUrl());
  Logger.log(KEY === 'PASTE_KEY_HERE' ? 'WARNING: paste your KEY at the top first.' : 'Key is set.');
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authOk_(p.k)) return json_({ ok: false, error: 'unauthorized' });
  const profile = String(p.profile || 'jack').toLowerCase();
  if (PROFILES.indexOf(profile) < 0) return json_({ ok: false, error: 'unknown profile' });
  try {
    const now = new Date();
    return json_({
      ok: true,
      profile: profile,
      today: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
      weekday: Utilities.formatDate(now, TZ, 'EEEE').toLowerCase(),
      server_time: now.getTime(),
      program: readText_(profile + '-program.md'),
      library: readText_(profile + '-exercise-library.md'),
      version: VERSION,
      rows: readRows_(profile, MAX_ROWS_RETURNED),
      sessions: readTable_(profile, 'sessions_', SESSION_COLS, 60),
      settings: readSettings_(profile)
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** POST body is JSON sent as text/plain (avoids a CORS preflight). */
function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!authOk_(b.k)) return json_({ ok: false, error: 'unauthorized' });
  const profile = String(b.profile || 'jack').toLowerCase();
  if (PROFILES.indexOf(profile) < 0) return json_({ ok: false, error: 'unknown profile' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (b.action === 'log') return json_(logSet_(profile, b.set || {}));
    if (b.action === 'undo') return json_(undo_(profile, String(b.set_id || '')));
    if (b.action === 'edit') return json_(edit_(profile, String(b.set_id || ''), b.fields || {}));
    if (b.action === 'session_edit') return json_(sessionEdit_(profile, String(b.session_id || ''), b.fields || {}, !!b.delete));
    if (b.action === 'finish') return json_(finish_(profile, b.session || {}));
    if (b.action === 'setting') return json_(setSetting_(profile, String(b.scope || ''), String(b.key || ''), b.value));
    if (b.action === 'putfile') return json_(putFile_(String(b.name || ''), String(b.content || '')));
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function authOk_(k) {
  if (!KEY || KEY === 'PASTE_KEY_HERE' || !k) return false;
  k = String(k);
  if (k.length !== KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ KEY.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, n) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, n || 200);
}

function getCoachFolder_() {
  try { return DriveApp.getFolderById(COACH_FOLDER_ID); } catch (e) {}
  let health;
  try { health = DriveApp.getFolderById(HEALTH_FOLDER_ID); }
  catch (e) {
    const it = DriveApp.getRootFolder().getFoldersByName('Health');
    health = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('Health');
  }
  const c = health.getFoldersByName('Coach');
  return c.hasNext() ? c.next() : health.createFolder('Coach');
}

function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    const folder = getCoachFolder_();
    const it = folder.getFilesByName(SHEET_NAME);
    if (it.hasNext()) ss = SpreadsheetApp.open(it.next());
    else {
      ss = SpreadsheetApp.create(SHEET_NAME);
      DriveApp.getFileById(ss.getId()).moveTo(folder);
    }
    props.setProperty('SHEET_ID', ss.getId());
  }
  PROFILES.forEach(function (p) { getTab_(ss, p); });
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  return ss;
}

function getTab_(ss, profile) {
  const name = 'workouts_' + profile;
  let sh = ss.getSheetByName(name);
  return ensureTab_(ss, name, COLS);
}

/** Creates the tab, or appends any missing header columns to an existing one (safe on old sheets). */
function ensureTab_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1000, cols.length).setNumberFormat('@'); // keep "2:45" and "5-8" as text
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  const have = sh.getLastColumn();
  if (have < cols.length) {
    sh.getRange(1, have + 1, Math.max(1000, sh.getMaxRows()), cols.length - have).setNumberFormat('@');
    sh.getRange(1, have + 1, 1, cols.length - have).setValues([cols.slice(have)]).setFontWeight('bold');
  }
  return sh;
}

function readTable_(profile, prefix, cols, limit) {
  const sh = ensureTab_(getSheet_(), prefix + profile, cols);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - limit + 1);
  const vals = sh.getRange(start, 1, last - start + 1, cols.length).getDisplayValues();
  return vals.map(function (r) { const o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o; });
}

function readSettings_(profile) {
  const out = {};
  readTable_(profile, 'settings_', SETTING_COLS, 1000).forEach(function (r) {
    if (!r.scope) return;
    (out[r.scope] = out[r.scope] || {})[r.key] = r.value;
  });
  return out;
}

/** scope: 'profile' or an exercise canonical name. key: e.g. 'equipment', 'bodyweight'. Empty value deletes. */
function setSetting_(profile, scope, key, value) {
  scope = clean_(scope, 120); key = clean_(key, 40);
  if (!scope || !key) return { ok: false, error: 'scope and key required' };
  const v = clean_(value, 500);
  const sh = ensureTab_(getSheet_(), 'settings_' + profile, SETTING_COLS);
  const last = sh.getLastRow();
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i][0] === scope && vals[i][1] === key) {
        if (!v) { sh.deleteRow(i + 2); return { ok: true, deleted: true }; }
        sh.getRange(i + 2, 3, 1, 2).setNumberFormat('@').setValues([[v, new Date().toISOString()]]);
        return { ok: true, updated: true };
      }
    }
  }
  if (!v) return { ok: true };
  sh.getRange(last + 1, 1, 1, 4).setNumberFormat('@').setValues([[scope, key, v, new Date().toISOString()]]);
  return { ok: true, created: true };
}

/** Edit fields of one logged set, found by set_id. */
function edit_(profile, setId, f) {
  if (!setId) return { ok: false, error: 'set_id required' };
  const sh = getTab_(getSheet_(), profile);
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'not found' };
  const ids = sh.getRange(2, 8, last - 1, 1).getDisplayValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] !== setId) continue;
    const rng = sh.getRange(i + 2, 1, 1, COLS.length);
    const vals = rng.getDisplayValues()[0];
    EDITABLE.forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(f, c)) vals[COLS.indexOf(c)] = clean_(f[c], c === 'notes' ? 500 : 120);
    });
    if (!vals[COLS.indexOf('exercise')] || !vals[COLS.indexOf('reps')]) return { ok: false, error: 'exercise and reps are required' };
    vals[COLS.indexOf('edited_at')] = new Date().toISOString();
    rng.setNumberFormat('@').setValues([vals]);
    const o = {}; COLS.forEach(function (c, j) { o[c] = vals[j]; });
    return { ok: true, row: o };
  }
  return { ok: false, error: 'not found' };
}

/** Fix a finish/skip record: edit finished_at, day, notes, sets, exercises, or delete it. */
function sessionEdit_(profile, sid, f, del) {
  if (!sid) return { ok: false, error: 'session_id required' };
  const sh = ensureTab_(getSheet_(), 'sessions_' + profile, SESSION_COLS);
  const last = sh.getLastRow(); if (last < 2) return { ok: false, error: 'not found' };
  const idc = SESSION_COLS.indexOf('session_id') + 1;
  const ids = sh.getRange(2, idc, last - 1, 1).getDisplayValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] !== sid) continue;
    if (del) { sh.deleteRow(i + 2); return { ok: true, deleted: sid }; }
    const rng = sh.getRange(i + 2, 1, 1, SESSION_COLS.length), vals = rng.getDisplayValues()[0];
    ['finished_at', 'day', 'notes', 'sets', 'exercises'].forEach(function (c) {
      if (!Object.prototype.hasOwnProperty.call(f, c)) return;
      let v = clean_(f[c], c === 'notes' ? 500 : 40);
      if (c === 'finished_at') { const t = Date.parse(v); if (!t) return; v = new Date(t).toISOString(); vals[SESSION_COLS.indexOf('date')] = Utilities.formatDate(new Date(t), TZ, 'yyyy-MM-dd'); }
      vals[SESSION_COLS.indexOf(c)] = v;
    });
    rng.setNumberFormat('@').setValues([vals]);
    const o = {}; SESSION_COLS.forEach(function (c, j) { o[c] = vals[j]; });
    return { ok: true, row: o };
  }
  return { ok: false, error: 'not found' };
}

/** Marks a workout finished. Idempotent by session_id. */
function finish_(profile, s) {
  const sh = ensureTab_(getSheet_(), 'sessions_' + profile, SESSION_COLS);
  const sid = clean_(s.session_id, 64) || Utilities.getUuid();
  const existing = readTable_(profile, 'sessions_', SESSION_COLS, 200);
  for (let i = 0; i < existing.length; i++) if (existing[i].session_id === sid) return { ok: true, row: existing[i], duplicate: true };
  const nowMs = Date.now();
  let ts = Number(s.client_ts) || nowMs;
  if (ts > nowMs + 5 * 60000 || ts < nowMs - 3 * 86400000) ts = nowMs;
  const when = new Date(ts);
  const row = {
    date: Utilities.formatDate(when, TZ, 'yyyy-MM-dd'), finished_at: when.toISOString(), day: clean_(s.day, 20),
    sets: clean_(s.sets, 10), exercises: clean_(s.exercises, 10), notes: clean_(s.notes, 500), session_id: sid
  };
  sh.getRange(sh.getLastRow() + 1, 1, 1, SESSION_COLS.length).setNumberFormat('@').setValues([SESSION_COLS.map(function (c) { return row[c]; })]);
  return { ok: true, row: row };
}

function readText_(name) {
  const it = getCoachFolder_().getFilesByName(name);
  return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : '';
}

function readRows_(profile, limit) {
  const sh = getTab_(getSheet_(), profile);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - limit + 1);
  const vals = sh.getRange(start, 1, last - start + 1, COLS.length).getDisplayValues();
  return vals.map(function (r) { const o = {}; COLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });
}

function fmtRest_(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
}

function logSet_(profile, s) {
  const sh = getTab_(getSheet_(), profile);
  const setId = clean_(s.set_id, 64) || Utilities.getUuid();
  const exercise = clean_(s.exercise, 120), reps = clean_(s.reps, 30);
  if (!exercise || !reps) return { ok: false, error: 'exercise and reps are required' };
  const rows = readRows_(profile, 600);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].set_id === setId) return { ok: true, row: rows[i], duplicate: true }; // safe retry
  }
  const nowMs = Date.now();
  let ts = Number(s.client_ts) || nowMs;
  if (ts > nowMs + 5 * 60000 || ts < nowMs - 3 * 86400000) ts = nowMs; // ignore crazy clocks
  const when = new Date(ts);
  const date = Utilities.formatDate(when, TZ, 'yyyy-MM-dd');
  let prev = 0;
  rows.forEach(function (r) {
    if (r.date !== date) return;
    const t = Date.parse(r.logged_at);
    if (t && t < ts && t > prev) prev = t;
  });
  const rest = prev && ts - prev < 4 * 3600000 ? fmtRest_((ts - prev) / 1000) : '';
  const row = {
    date: date, exercise: exercise, load: clean_(s.load, 30), reps: reps,
    failure_type: clean_(s.failure_type, 30), rest_time: rest, notes: clean_(s.notes, 500),
    set_id: setId, logged_at: when.toISOString(),
    drops: clean_(s.drops, 5), added_load: clean_(s.added_load, 30), bodyweight: clean_(s.bodyweight, 30),
    total_load: clean_(s.total_load, 30), left_reps: clean_(s.left_reps, 30), right_reps: clean_(s.right_reps, 30), edited_at: '', workout: clean_(s.workout, 20)
  };
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, COLS.length).setNumberFormat('@').setValues([COLS.map(function (c) { return row[c]; })]);
  return { ok: true, row: row };
}

function undo_(profile, setId) {
  if (!setId) return { ok: false, error: 'set_id required' };
  const sh = getTab_(getSheet_(), profile);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, removed: null };
  const ids = sh.getRange(2, 8, last - 1, 1).getDisplayValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] === setId) { sh.deleteRow(i + 2); return { ok: true, removed: setId }; }
  }
  return { ok: true, removed: null }; // already gone: treat as success so queued undos clear
}

/** Lets Coach update program/library files: only the four allowed names in Health/Coach. */
function putFile_(name, content) {
  if (!FILE_RE.test(name)) return { ok: false, error: 'file name not allowed' };
  if (content.length > 200000) return { ok: false, error: 'too large' };
  const folder = getCoachFolder_();
  const it = folder.getFilesByName(name);
  if (it.hasNext()) { const f = it.next(); f.setContent(content); return { ok: true, id: f.getId(), updated: true }; }
  const f = folder.createFile(name, content, 'text/markdown');
  return { ok: true, id: f.getId(), created: true };
}
