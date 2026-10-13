// Coach parsers: program.md, exercise-library.md, speech. Shared by the page and tests.
(function (root) {
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function norm(s) { return String(s || '').toLowerCase().replace(/\bdb\b/g, 'dumbbell').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function stripParens(s) { return String(s).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); }
  function splitName(line) {
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ':' && depth === 0) return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }
    return [line.trim(), ''];
  }
  function parseNote(text) {
    const note = { sets: '', failure: '', rest: '', rest_target_sec: null, extra: [] };
    const clauses = text.split(/(?<=[.;])\s+|,\s*then\s+/).map(c => c.trim().replace(/[.;]+$/, '').trim());
    for (let c of clauses) {
      if (!c) continue;
      c = c.replace(/^note:\s*/i, '');
      const rm = c.match(/\brest\s+([\d.]+)(?:\s*-\s*([\d.]+))?\s*(min|mins|minutes|s|sec|secs|seconds)\b/i);
      if (!note.sets && /^\d+\s*x\s*\S/i.test(c)) note.sets = c;
      else if (rm) {
        const unit = /^m/i.test(rm[3]) ? 60 : 1;
        note.rest = cap(rm[0]);
        note.rest_target_sec = Math.round(parseFloat(rm[2] || rm[1]) * unit);
        const left = (c.slice(0, rm.index) + c.slice(rm.index + rm[0].length)).replace(/^[\s,.]+|[\s,.]+$/g, '');
        if (left) note.extra.push(cap(left));
      } else if (!note.failure && /\bfailure\b/i.test(c)) note.failure = cap(c);
      else note.extra.push(cap(c));
    }
    return note;
  }
  function parseProgram(md) {
    const days = {}; let week = '', cur = null;
    for (const line of String(md || '').split(/\r?\n/)) {
      if (line.startsWith('## ')) { week = line.slice(3).trim(); continue; }
      let m = line.match(/^###\s+([A-Za-z]+)\s*:\s*(.*)$/);
      if (m) { const key = m[1].toLowerCase(); cur = { day: cap(key), title: m[2].trim(), week, exercises: [], footer: [] }; days[key] = cur; continue; }
      if (line.startsWith('#')) { cur = null; continue; }
      m = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (m && cur) {
        const [name, details] = splitName(m[2]);
        const note = parseNote(details);
        const pars = [...name.matchAll(/\(([^)]*)\)/g)].map(x => cap(x[1].trim()));
        note.extra = pars.concat(note.extra);
        cur.exercises.push({ n: +m[1], name: stripParens(name), full_name: name, details, note });
        continue;
      }
      if (cur && line.trim() && !line.startsWith(' ')) cur.footer.push(line.trim());
    }
    return days;
  }
  function parseLibrary(md) {
    const lib = [];
    for (const line of String(md || '').split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('---') || line.includes('Canonical name')) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (cells.length < 4 || !cells[0]) continue;
      const aliases = cells[1].split(',').map(a => a.trim()).filter(Boolean);
      const keys = new Set([norm(cells[0]), norm(stripParens(cells[0]))]);
      aliases.forEach(a => { keys.add(norm(a)); keys.add(norm(stripParens(a))); });
      const types = (cells[5] || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
      lib.push({ name: cells[0], aliases, muscles: cells[2], video: /^https?:\/\//.test(cells[3]) ? cells[3] : '', keys: [...keys],
        rest_muscle: (cells[4] || '').toLowerCase() || norm(String(cells[2] || '').split(/[,(]/)[0]),
        types, single: types.includes('single'), bodyweight: types.includes('bodyweight'), setup: cells[6] || '', cue: cells[7] || '', equip: (cells[8] || '').toLowerCase() });
    }
    return lib;
  }
  function lookup(lib, name) {
    const k = [norm(name), norm(stripParens(name))];
    return lib.find(e => k.some(x => e.keys.includes(x))) || null;
  }
  function enrich(days, lib) {
    Object.values(days).forEach(d => d.exercises.forEach(ex => {
      const e = lookup(lib, ex.name) || lookup(lib, ex.full_name);
      ex.canonical = e ? e.name : ex.name; ex.video = e ? e.video : ''; ex.muscles = e ? e.muscles : '';
      ex.match_keys = e ? e.keys : [norm(ex.name)];
      ex.rest_muscle = e ? e.rest_muscle : norm(ex.name); ex.types = e ? e.types : [];
      ex.single = !!(e && e.single) || /\b(single|one)[ -](arm|leg)\b|\bper (arm|leg|side)\b/i.test(ex.full_name + ' ' + ex.details);
      ex.bodyweight = !!(e && e.bodyweight); ex.setup = e ? e.setup : ''; ex.cue = e ? e.cue : ''; ex.equip = (e && e.equip) || equipOf(ex.name, ex.bodyweight);
      const sm = (ex.note.sets || '').match(/^(\d+)\s*x/i); ex.planned_sets = sm ? +sm[1] : 3;
    }));
    return days;
  }
  function equipOf(name, bw) {
    const n = String(name || '').toLowerCase();
    if (/hex|trap bar/.test(n)) return 'hexbar';
    if (/barbell|\bbb\b|smith|ez bar/.test(n)) return 'barbell';
    if (/dumbbell|\bdb\b/.test(n)) return 'dumbbell';
    if (/cable|rope|pulldown|pushdown|face pull/.test(n)) return 'cable';
    if (/machine|pec deck|hack|leg press|hammer strength|smith|selectorized|leg extension|leg curl/.test(n)) return 'machine';
    if (bw || /dip|pull-?up|chin-?up|push-?up|bodyweight|plank|crunch|leg raise/.test(n)) return 'bodyweight';
    return 'machine';
  }
  function e1rm(load, reps) {
    const w = parseFloat(load), r = parseInt(reps, 10);
    if (!(w > 0) || !(r >= 1 && r <= 10)) return null;
    if (r === 1) return { ep: Math.round(w), br: Math.round(w) };
    return { ep: Math.round(w * (1 + r / 30)), br: Math.round(w * 36 / (37 - r)) };
  }
  const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
  function parseSpeech(raw) {
    let t = ' ' + String(raw).toLowerCase().replace(/,/g, ' ') + ' ';
    t = t.replace(/\b(twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, a, b) => ' ' + (NUMW[a] + NUMW[b]) + ' ');
    t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/g, m => ' ' + NUMW[m] + ' ');
    const out = { load: null, reps: null, ft: null, notes: '' };
    const take = (re, fn) => { const m = t.match(re); if (m) { fn(m); t = t.replace(m[0], ' '); return true; } return false; };
    take(/\b(not to failure|no failure|not failure|shy of failure|not to fail\w*)\b/, () => out.ft = 'not to failure') ||
      take(/\b(drop ?sets?|dropset)\b(\s*failure)?/, () => out.ft = 'drop set') ||
      take(/\b(myo|mayo|meo|my o)[ -]?(reps?|rep set)?\b/, () => out.ft = 'myo-reps') ||
      take(/\b(technical|technique|tech)( failure)?\b/, () => out.ft = 'technical') ||
      take(/\b(true failure|true|full failure|to failure|failure)\b/, () => out.ft = 'true');
    take(/\b(body ?weight|bodyweight|bw)\s*(?:for|x|times|by)\s*(\d+)\s*(?:reps?)?/, m => { out.load = 'BW'; out.reps = m[2]; }) ||
      take(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?|kg|kilos?)?\s*(?:for|x|times|by)\s*(\d+)\s*(?:reps?)?/, m => { out.load = m[1]; out.reps = m[2]; }) ||
      take(/(\d+)\s*reps?\s*(?:at|with|of)\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?/, m => { out.reps = m[1]; out.load = m[2]; }) ||
      take(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?\s+(\d+)\s*reps?\b/, m => { out.load = m[1]; out.reps = m[2]; });
    if (!out.reps) {
      const nums = t.match(/\d+(?:\.\d+)?/g) || [];
      if (nums.length >= 2) { out.load = nums[0]; out.reps = nums[1]; t = t.replace(nums[0], ' ').replace(nums[1], ' '); }
      else if (nums.length === 1 && !out.load) { out.reps = nums[0]; t = t.replace(nums[0], ' '); }
    }
    if (!out.load && /\b(body ?weight|bodyweight)\b/.test(t)) { out.load = 'BW'; t = t.replace(/\b(body ?weight|bodyweight)\b/, ' '); }
    out.notes = t.replace(/\s+/g, ' ').trim().replace(/^(and|with|reps?|lbs?|pounds?)\b\s*/, '').replace(/\s*\band$/, '').trim();
    return out;
  }
  const api = { equipOf, norm, stripParens, parseNote, parseProgram, parseLibrary, lookup, enrich, e1rm, parseSpeech };
  if (typeof module !== 'undefined') module.exports = api; else root.CoachParse = api;
})(this);
