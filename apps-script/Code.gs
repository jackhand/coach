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
const COLS = ['date', 'exercise', 'load', 'reps', 'failure_type', 'rest_time', 'notes', 'set_id', 'logged_at'];
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
      rows: readRows_(profile, MAX_ROWS_RETURNED)
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
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1000, COLS.length).setNumberFormat('@'); // keep "2:45" and "5-8" as text
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
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
    set_id: setId, logged_at: when.toISOString()
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
