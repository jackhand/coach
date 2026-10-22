// Built-in list of common gym exercises for Replace search. Generic catalog only, no personal data.
// [name, muscles, rest muscle, equipment, type, aliases]
(function (root) {
const L = [
['Barbell bench press','Chest, front delts, triceps','chest','barbell','compound','flat bench'],
['Dumbbell bench press','Chest, front delts, triceps','chest','dumbbell','compound','db bench, flat db press'],
['Incline barbell press','Upper chest, front delts, triceps','chest','barbell','compound','incline bench'],
['Incline dumbbell press','Upper chest, front delts, triceps','chest','dumbbell','compound','incline db press'],
['Smith machine bench press','Chest, front delts, triceps','chest','smith','compound','smith bench'],
['Smith machine incline press','Upper chest, front delts, triceps','chest','smith','compound','smith incline'],
['Machine chest press','Chest, front delts, triceps','chest','machine','compound','chest press machine, selectorized chest press'],
['Hammer Strength chest press','Chest, front delts, triceps','chest','machine_plate','compound','hammer strength bench, plate loaded chest press, iso-lateral bench'],
['Hammer Strength incline press','Upper chest, front delts, triceps','chest','machine_plate','compound','plate loaded incline, iso-lateral incline'],
['Hammer Strength decline press','Lower chest, triceps','chest','machine_plate','compound','plate loaded decline'],
['Machine chest fly','Chest','chest','machine','isolation','pec deck'],
['Cable fly','Chest','chest','cable','isolation','cable crossover, standing cable fly'],
['Low to high cable fly','Upper chest','chest','cable','isolation','low cable fly'],
['Dumbbell fly','Chest','chest','dumbbell','isolation','db fly'],
['Chest dips','Lower chest, triceps, front delts','chest','bodyweight_loadable','compound','dips'],
['Push-up','Chest, front delts, triceps','chest','bodyweight_loadable','compound','pushups'],
['Seated dumbbell overhead press','Front and side delts, triceps','shoulders','dumbbell','compound','db shoulder press'],
['Standing barbell overhead press','Front and side delts, triceps','shoulders','barbell','compound','ohp, military press'],
['Machine shoulder press','Front and side delts, triceps','shoulders','machine','compound','shoulder press machine'],
['Hammer Strength shoulder press','Front and side delts, triceps','shoulders','machine_plate','compound','plate loaded shoulder press'],
['Smith machine shoulder press','Front and side delts, triceps','shoulders','smith','compound','smith ohp'],
['Dumbbell lateral raise','Side delts','shoulders','dumbbell','isolation','db lateral raise, side raise'],
['Cable lateral raise','Side delts','shoulders','cable','isolation','single arm cable lateral'],
['Machine lateral raise','Side delts','shoulders','machine','isolation','lateral raise machine'],
['Seated dumbbell front raise','Front delts','shoulders','dumbbell','isolation','front raise'],
['Cable front raise','Front delts','shoulders','cable','isolation','rope front raise'],
['Plate front raise','Front delts','shoulders','dumbbell','isolation','plate raise'],
['Machine reverse fly','Rear delts, upper back','rear delts','machine','isolation','reverse pec deck'],
['Rope face pull','Rear delts, upper back, rotator cuff','rear delts','cable','isolation','face pull'],
['Cable rear delt fly','Rear delts','rear delts','cable','isolation','cable reverse fly'],
['Bent-over dumbbell reverse fly','Rear delts, upper back','rear delts','dumbbell','isolation','rear delt raise'],
['Hex bar shrug','Upper traps','traps','hexbar','isolation','trap bar shrug'],
['Dumbbell shrug','Upper traps','traps','dumbbell','isolation','db shrug'],
['Barbell shrug','Upper traps','traps','barbell','isolation','bb shrug'],
['Cable shrug','Upper traps','traps','cable','isolation',''],
['Machine shrug','Upper traps','traps','machine','isolation','hammer strength shrug, smith shrug'],
['Rope triceps pushdown','Triceps','triceps','cable','isolation','rope pushdown'],
['Straight bar pushdown','Triceps','triceps','cable','isolation','bar pushdown, v-bar pushdown'],
['Single-arm cable overhead triceps extension','Triceps (long head)','triceps','cable','isolation','overhead cable extension'],
['Cable overhead rope extension','Triceps (long head)','triceps','cable','isolation','rope overhead extension'],
['EZ bar skull crusher','Triceps','triceps','ez','isolation','skull crushers, lying triceps extension'],
['Dumbbell overhead triceps extension','Triceps (long head)','triceps','dumbbell','isolation','db overhead extension'],
['Machine triceps extension','Triceps','triceps','machine','isolation','triceps machine'],
['Machine dip','Triceps, lower chest','triceps','machine','compound','assisted dip, seated dip machine'],
['Close-grip bench press','Triceps, chest','triceps','barbell','compound','cgbp'],
['Barbell curl','Biceps','biceps','barbell','isolation','bb curl, ez bar curl'],
['Dumbbell curl','Biceps','biceps','dumbbell','isolation','db curl'],
['Hammer curl','Brachialis, biceps, forearms','biceps','dumbbell','isolation','db hammer curl'],
['Incline dumbbell curl','Biceps (long head)','biceps','dumbbell','isolation',''],
['Cable curl','Biceps','biceps','cable','isolation','bayesian curl'],
['Preacher curl machine','Biceps','biceps','machine','isolation','machine curl, preacher curl'],
['Lat pulldown','Lats, upper back, biceps','back','cable','compound','pulldown, wide grip pulldown'],
['Close-grip lat pulldown','Lats, biceps','back','cable','compound','v-bar pulldown'],
['Pull-up','Lats, upper back, biceps','back','bodyweight_loadable','compound','pullups, chin-up'],
['Assisted pull-up machine','Lats, upper back, biceps','back','machine_assisted','compound','assisted pullup'],
['Seated cable row','Mid back, lats, biceps','back','cable','compound','cable row'],
['Chest-supported machine row','Mid back, lats','back','machine','compound','machine row, seated row machine'],
['Hammer Strength row','Mid back, lats','back','machine_plate','compound','iso-lateral row, plate loaded row'],
['Hammer Strength high row','Upper back, lats','back','machine_plate','compound','iso-lateral high row'],
['Hammer Strength low row','Lats, mid back','back','machine_plate','compound','iso-lateral low row'],
['Hammer Strength pulldown','Lats, upper back','back','machine_plate','compound','iso-lateral pulldown, plate loaded pulldown'],
['Chest-supported dumbbell row','Mid back, lats','back','dumbbell','compound','incline db row, seal row'],
['Single-arm dumbbell row','Lats, mid back','back','dumbbell','compound','db row, one arm row'],
['Barbell row','Mid back, lats, lower back','back','barbell','compound','bent over row'],
['T-bar row','Mid back, lats','back','machine_plate','compound','landmine row'],
['Rope straight-arm pulldown','Lats','back','cable','isolation','straight-arm cable pulldown, rope straight pulldowns, rope straight pulldown, lat prayer, straight arm pulldown, straight arm rope pulldown, straight-arm rope pulldown, rope pulldown, straight arm rope pulldowns'],
['Back extension','Lower back, glutes, hamstrings','lower back','bodyweight_loadable','compound','hyperextension, 45 degree back extension'],
['Back squat','Quads, glutes, adductors','quads','barbell','compound','squat, barbell back squat, barbell squat, high bar squat, low bar squat'],
['Hack squat','Quads, glutes','quads','machine_plate','compound','hack squat machine'],
['Pendulum squat','Quads, glutes','quads','machine_plate','compound',''],
['Smith machine squat','Quads, glutes','quads','smith','compound','smith squat'],
['Leg press','Quads, glutes','quads','machine_plate','compound','45 degree leg press, hammer strength leg press'],
['Goblet squat','Quads, glutes','quads','dumbbell','compound','db squat'],
['Leg extension','Quads','quads','machine','isolation','quad extension'],
['Romanian deadlift','Hamstrings, glutes, lower back','hamstrings','barbell','compound','rdl'],
['Dumbbell Romanian deadlift','Hamstrings, glutes','hamstrings','dumbbell','compound','db rdl'],
['Hex bar deadlift','Quads, glutes, hamstrings, back','hamstrings','hexbar','compound','trap bar deadlift'],
['Seated leg curl','Hamstrings','hamstrings','machine','isolation','hamstring curl'],
['Lying leg curl','Hamstrings','hamstrings','machine','isolation','prone leg curl'],
['Hip thrust','Glutes','glutes','barbell','compound','barbell hip thrust'],
['Machine hip thrust','Glutes','glutes','machine','compound','glute drive'],
['Cable pull-through','Glutes, hamstrings','glutes','cable','compound',''],
['Hip abduction machine','Glutes (side)','glutes','machine','isolation','abductor'],
['Hip adduction machine','Adductors','adductors','machine','isolation','adductor'],
['Standing calf raise','Calves','calves','machine','isolation','calf raise machine'],
['Seated calf raise','Calves (soleus)','calves','machine','isolation',''],
['Leg press calf raise','Calves','calves','machine_plate','isolation',''],
['Cable crunch','Abs','abs','cable','isolation','kneeling cable crunch'],
['Hanging leg raise','Abs, hip flexors','abs','bodyweight','isolation','leg raises'],
['Captain\'s chair leg raise','Abs, hip flexors','abs','bodyweight','isolation','leg raise, vertical knee raise, leg raise machine, hanging leg raise station, bosu leg raise, captains chair leg raise, captain chair leg raise, knee raise'],
['Ab crunch machine','Abs','abs','machine','isolation','crunch machine'],
['Dragon flag','Abs','abs','bodyweight','isolation',''],
['Plank','Abs, core','abs','bodyweight','isolation',''],
['Wrist curl','Forearms','forearms','dumbbell','isolation','forearm curl'],
['Reverse barbell curl','Forearms, biceps','forearms','barbell','isolation','reverse curl'],
['Assisted dip machine','Chest, triceps','chest','machine_assisted','compound','assisted dips']
];
// Demo videos (checked Oct 16, 2026: link loads and title matches).
const V = {
"Dumbbell bench press": "https://www.youtube.com/watch?v=YQ2s_Y7g5Qk",
"Incline barbell press": "https://www.youtube.com/watch?v=lJ2o89kcnxY",
"Smith machine bench press": "https://www.youtube.com/watch?v=O5viuEPDXKY",
"Smith machine incline press": "https://www.youtube.com/watch?v=SHL81neluiI",
"Hammer Strength chest press": "https://www.youtube.com/watch?v=z4YEEwGD2Q0",
"Hammer Strength incline press": "https://www.youtube.com/watch?v=mqVb3tY3qO0",
"Hammer Strength decline press": "https://www.youtube.com/watch?v=yfNS4st1WWk",
"Cable fly": "https://www.youtube.com/watch?v=kEDraCFRgrI",
"Low to high cable fly": "https://www.youtube.com/watch?v=jBDRY89Xt78",
"Dumbbell fly": "https://www.youtube.com/watch?v=JFm8KbhjibM",
"Push-up": "https://www.youtube.com/watch?v=mm6_WcoCVTA",
"Standing barbell overhead press": "https://www.youtube.com/watch?v=G2qpTG1Eh40",
"Machine shoulder press": "https://www.youtube.com/watch?v=WvLMauqrnK8",
"Hammer Strength shoulder press": "https://www.youtube.com/watch?v=derczYRUlvM",
"Smith machine shoulder press": "https://www.youtube.com/watch?v=OLqZDUUD2b0",
"Dumbbell lateral raise": "https://www.youtube.com/watch?v=OuG1smZTsQQ",
"Cable lateral raise": "https://www.youtube.com/watch?v=lq7eLC30b9w",
"Cable front raise": "https://www.youtube.com/watch?v=yIoAcMD3jcE",
"Plate front raise": "https://www.youtube.com/watch?v=xd1J8R74n-Q",
"Cable rear delt fly": "https://www.youtube.com/watch?v=sh_WuilJHf4",
"Bent-over dumbbell reverse fly": "https://www.youtube.com/watch?v=iO6Q_HEwOtA",
"Barbell shrug": "https://www.youtube.com/watch?v=M_MjF5Nm_h4",
"Machine shrug": "https://www.youtube.com/watch?v=3FG0onSF_n4",
"Straight bar pushdown": "https://www.youtube.com/watch?v=XE342lOlvdQ",
"Cable overhead rope extension": "https://www.youtube.com/watch?v=mRozZKkGIfg",
"EZ bar skull crusher": "https://www.youtube.com/watch?v=l3rHYPtMUo8",
"Dumbbell overhead triceps extension": "https://www.youtube.com/watch?v=a9oPnZReIRE",
"Machine triceps extension": "https://www.youtube.com/watch?v=Bx8ga1BLHLE",
"Machine dip": "https://www.youtube.com/watch?v=pMarNxAvHPc",
"Close-grip bench press": "https://www.youtube.com/watch?v=g4VkufehmUU",
"Barbell curl": "https://www.youtube.com/watch?v=pUS6HBQjRmc",
"Dumbbell curl": "https://www.youtube.com/watch?v=iixND1P2lik",
"Pull-up": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
"Assisted pull-up machine": "https://www.youtube.com/watch?v=L4ChTwrXTjc",
"Chest-supported machine row": "https://www.youtube.com/watch?v=_FrrYQxA6kc",
"Hammer Strength row": "https://www.youtube.com/watch?v=gy-_QDUgGi4",
"Hammer Strength high row": "https://www.youtube.com/watch?v=yrlBBGZ5YEc",
"Hammer Strength low row": "https://www.youtube.com/watch?v=rp154g3bZPs",
"Hammer Strength pulldown": "https://www.youtube.com/watch?v=iUmO6YW-yxM",
"Chest-supported dumbbell row": "https://www.youtube.com/watch?v=tZUYS7X50so",
"Single-arm dumbbell row": "https://www.youtube.com/watch?v=DMo3HJoawrU",
"Barbell row": "https://www.youtube.com/watch?v=UPGuwx7GQ9s",
"T-bar row": "https://www.youtube.com/watch?v=yPis7nlbqdY",
"Back squat": "https://www.youtube.com/watch?v=rrJIyZGlK8c",
"Smith machine squat": "https://www.youtube.com/watch?v=-eO_VydErV0",
"Goblet squat": "https://www.youtube.com/watch?v=6mf0oa2GGUc",
"Romanian deadlift": "https://www.youtube.com/watch?v=_oyxCn2iSjU",
"Dumbbell Romanian deadlift": "https://www.youtube.com/watch?v=xAL7lHwj30E",
"Hex bar deadlift": "https://www.youtube.com/watch?v=v709aJKv-gM",
"Seated leg curl": "https://www.youtube.com/watch?v=Orxowest56U",
"Hip thrust": "https://www.youtube.com/watch?v=EF7jXP17DPE",
"Machine hip thrust": "https://www.youtube.com/watch?v=ZSPmIyX9RZs",
"Cable pull-through": "https://www.youtube.com/watch?v=pv8e6OSyETE",
"Hip abduction machine": "https://www.youtube.com/watch?v=w3wq6lWAY2U",
"Hip adduction machine": "https://www.youtube.com/watch?v=iYcS9jCA6gE",
"Seated calf raise": "https://www.youtube.com/watch?v=BxfKOyI8sUg",
"Leg press calf raise": "https://www.youtube.com/watch?v=shquCR3VVp4",
"Cable crunch": "https://www.youtube.com/watch?v=kc0PRn372lo",
"Hanging leg raise": "https://www.youtube.com/watch?v=7FwGZ8qY5OU",
"Plank": "https://www.youtube.com/watch?v=pSHjTRCQxIw",
"Wrist curl": "https://www.youtube.com/watch?v=lfQR7oVS8eo",
"Reverse barbell curl": "https://www.youtube.com/watch?v=_kirZbMUjBA",
"Assisted dip machine": "https://www.youtube.com/watch?v=yZ83t4mrPrI"
};
root.CoachExList = L.map(a => ({ video: V[a[0]] || '', name: a[0], muscles: a[1], rest_muscle: a[2], equip: a[3], types: a[4].split(','), aliases: a[5] ? a[5].split(',').map(s => s.trim()) : [] }));
// Filter metadata (RP style): one muscle group and one equipment label per exercise.
const MG = { chest: 'Chest', 'upper chest': 'Chest', back: 'Back', lats: 'Back', 'lower back': 'Back', 'upper back': 'Back', triceps: 'Triceps', biceps: 'Biceps', shoulders: 'Shoulders', delts: 'Shoulders', 'rear delts': 'Shoulders', 'side delts': 'Shoulders', 'front delts': 'Shoulders', quads: 'Quads', glutes: 'Glutes', adductors: 'Glutes', hamstrings: 'Hamstrings', calves: 'Calves', traps: 'Traps', forearms: 'Forearms', abs: 'Abs', core: 'Abs', neck: 'Traps', serratus: 'Back', tibialis: 'Calves', shins: 'Calves' };
root.CoachMG = ['Chest', 'Back', 'Triceps', 'Biceps', 'Shoulders', 'Quads', 'Glutes', 'Hamstrings', 'Calves', 'Traps', 'Forearms', 'Abs'];
root.CoachEQ = ['Barbell', 'Hex bar', 'Bodyweight loadable', 'Bodyweight', 'Cable', 'Dumbbell', 'Machine', 'Machine assistance', 'Smith machine', 'Band/other'];
root.CoachMGColor = { Chest: '#e57373', Back: '#64b5f6', Triceps: '#ba68c8', Biceps: '#4db6ac', Shoulders: '#ffb74d', Quads: '#81c784', Glutes: '#f06292', Hamstrings: '#a1887f', Calves: '#90a4ae', Traps: '#7986cb', Forearms: '#dce775', Abs: '#ffd54f' };
root.CoachGroupOf = c => { const r = String((c && c.rest_muscle) || '').toLowerCase().trim(); if (MG[r]) return MG[r]; const m = String((c && c.muscles) || '').toLowerCase().split(/[,(]/)[0].trim(); for (const k of Object.keys(MG).sort((a, b) => b.length - a.length)) if (m.includes(k)) return MG[k]; return ''; };
// Every group a row works, from its muscles text (primary first). Used by the weekly sets body map.
root.CoachGroupsOf = c => { const out = [], add = g => { if (g && !out.includes(g)) out.push(g); }; add(root.CoachGroupOf(c));
  String((c && c.muscles) || '').toLowerCase().split(/[,(]|\band\b/).forEach(part => { const m = part.trim(); if (!m) return; for (const k of Object.keys(MG).sort((a, b) => b.length - a.length)) if (m.includes(k)) { add(MG[k]); break; } if (/delt|shoulder/.test(m)) add('Shoulders'); if (/lat|rhomboid|mid back|upper back/.test(m)) add('Back'); if (/brachialis/.test(m)) add('Biceps'); if (/hip flexor|oblique/.test(m)) add('Abs'); });
  return out; };
// Sub-regions for the body map (coverage matches MacroFactor Workouts Levels, plus upper/lower abs and upper chest).
root.CoachRegions = [
  ['UpperChest', 'Upper chest', 'Chest'], ['Chest', 'Mid/lower chest', 'Chest'],
  ['Lats', 'Lats', 'Back'], ['Serratus', 'Serratus', 'Back'], ['UpperBack', 'Rhomboids/teres', 'Back'], ['LowerBack', 'Lower back', 'Back'],
  ['Triceps', 'Triceps', 'Triceps'], ['Biceps', 'Biceps', 'Biceps'],
  ['FrontDelts', 'Front delts', 'Shoulders'], ['SideDelts', 'Side delts', 'Shoulders'], ['RearDelts', 'Rear delts', 'Shoulders'],
  ['Quads', 'Quads', 'Quads'],
  ['Glutes', 'Glute max', 'Glutes'], ['Adductors', 'Inner thighs (adductors)', 'Glutes'], ['Abductors', 'Outer hips (abductors)', 'Glutes'],
  ['Hamstrings', 'Hamstrings', 'Hamstrings'], ['Calves', 'Calves (gastroc, soleus)', 'Calves'],
  ['Traps', 'Upper traps', 'Traps'], ['MidTraps', 'Mid/lower traps', 'Traps'], ['Neck', 'Neck', 'Traps'],
  ['Forearms', 'Forearms', 'Forearms'],
  ['UpperAbs', 'Upper abs', 'Abs'], ['LowerAbs', 'Lower abs', 'Abs'], ['Obliques', 'Obliques', 'Abs']];
const RTXT = [[/neck/, 'Neck'], [/upper chest|clavicular/, 'UpperChest'], [/serratus/, 'Serratus'], [/lower chest|chest|pec/, 'Chest'], [/front delt|anterior delt/, 'FrontDelts'], [/side delt|lateral delt|medial delt/, 'SideDelts'], [/rear delt|posterior delt/, 'RearDelts'],
  [/delt|shoulder/, 'SideDelts'], [/mid trap|middle trap|lower trap/, 'MidTraps'], [/trap/, 'Traps'], [/lat\b|lats/, 'Lats'], [/mid back|upper back|rhomboid|teres/, 'UpperBack'], [/lower back|erector|spinal/, 'LowerBack'], [/back/, 'Lats'],
  [/bicep|brachialis/, 'Biceps'], [/tricep/, 'Triceps'], [/forearm|grip|wrist/, 'Forearms'], [/oblique/, 'Obliques'], [/upper abs/, 'UpperAbs'], [/lower abs/, 'LowerAbs'], [/abs|core|abdomin/, 'UpperAbs'],
  [/adductor|inner thigh/, 'Adductors'], [/abductor|outer hip|glute med/, 'Abductors'], [/glute/, 'Glutes'], [/hamstring/, 'Hamstrings'], [/quad/, 'Quads'], [/calf|calves|soleus/, 'Calves']];
// Name rules: [pattern, main region, extra regions at 0.5]
const RNAME = [[/neck (curl|extension|flexion|harness)|neck$/, 'Neck', []], [/pullover/, 'Lats', ['Serratus']],
  [/leg raise|knee raise|captain|dragon flag|reverse crunch|l-sit/, 'LowerAbs', []], [/crunch|sit-?up/, 'UpperAbs', []], [/pallof|woodchop|wood chop|oblique|side plank|russian twist/, 'Obliques', []],
  [/adduct/, 'Adductors', []], [/abduct/, 'Abductors', []], [/back extension|hyperextension|good morning|reverse hyper/, 'LowerBack', []], [/lateral raise|upright row/, 'SideDelts', []],
  [/face pull/, 'RearDelts', ['MidTraps', 'UpperBack']], [/reverse fly|reverse pec|rear delt/, 'RearDelts', ['UpperBack']], [/front raise|shoulder press|overhead press|military/, 'FrontDelts', []],
  [/incline (barbell |dumbbell |machine |smith )?(press|bench|fly|flye)|low to high|incline press/, 'UpperChest', []],
  [/shrug/, 'Traps', []], [/pulldown|pull-?up|chin-?up|straight-arm/, 'Lats', []], [/\brow\b|rows\b/, 'UpperBack', ['MidTraps']], [/deadlift|rdl/, '', ['LowerBack']]];
// Last-resort name rules for exercises with no muscles text: [pattern, [main, ...extras]]
const RFALL = [[/split squat|lunge|step-?up/, ['Quads', 'Glutes']], [/squat|leg press|hack|pendulum/, ['Quads', 'Glutes', 'Adductors']], [/leg extension/, ['Quads']],
  [/leg curl|nordic|ham curl/, ['Hamstrings']], [/hip thrust|glute bridge|kickback|glute/, ['Glutes', 'Hamstrings']], [/romanian|rdl|stiff/, ['Hamstrings', 'Glutes', 'LowerBack']], [/deadlift/, ['Glutes', 'Hamstrings', 'LowerBack']],
  [/calf/, ['Calves']], [/fly|flye|pec/, ['Chest', 'FrontDelts']], [/bench|chest press|push-?up/, ['Chest', 'FrontDelts', 'Triceps']], [/dip/, ['Chest', 'Triceps']],
  [/pushdown|skull|tricep|overhead extension|kickback/, ['Triceps']], [/curl/, ['Biceps', 'Forearms']], [/press/, ['FrontDelts', 'Triceps']], [/plank|ab |abs|core/, ['UpperAbs', 'Obliques']]];
root.CoachRegionsOf = c => { // [[region, weight]]: main 1, others 0.5
  const n = String((c && c.name) || '').toLowerCase(), out = [], add = (r, w) => { if (r && !out.some(o => o[0] === r)) out.push([r, w]); };
  let extra = []; for (const [re, r, ex] of RNAME) if (re.test(n)) { if (r) add(r, 1); extra = ex; break; }
  String((c && c.muscles) || '').toLowerCase().replace(/front and side delts/g, 'front delts, side delts').split(/[,(]|\band\b/).forEach(part => { const m = part.trim(); if (!m) return; for (const [re, r] of RTXT) if (re.test(m)) { const fam = { UpperAbs: ['UpperAbs', 'LowerAbs', 'Obliques'], Chest: ['Chest', 'UpperChest'], SideDelts: ['SideDelts', 'FrontDelts', 'RearDelts'], Lats: ['Lats', 'UpperBack', 'LowerBack'] }[r]; if (!(fam && /^(abs|core|chest|pecs?|delts?|shoulders?|back)$/.test(m) && out.some(o => fam.includes(o[0])))) add(r, out.length ? 0.5 : 1); break; } });
  if (!out.length) for (const [re, rs] of RFALL) if (re.test(n)) { rs.forEach((r, i) => add(r, i ? 0.5 : 1)); break; }
  if (/plank/.test(n)) add('Obliques', 0.5);
  extra.forEach(r => add(r, 0.5));
  return out; };
// Equipment: ONE canonical type drives all equipment UI (plates, warm-ups, steps, e1RM factor, filters).
// Explicit equip field first (refined by name only for subtypes), name fallback only when the field is missing.
root.CoachEquipTypes = ['barbell', 'hexbar', 'ez', 'smith', 'dumbbell', 'cable', 'machine', 'machine_plate', 'machine_assisted', 'bodyweight', 'bodyweight_loadable', 'band', 'other'];
const ET_LOADABLE = /\bdips?\b|pull-?up|chin-?up|push-?up|back extension|hyperextension/;
const ET_PLATE = /hammer strength|plate[- ]?loaded|leg press|hack squat|pendulum|t-bar|belt squat/;
function etField(e) {
  e = String(e || '').toLowerCase().trim(); if (!e) return '';
  if (/^(bodyweight[_ ]loadable|loadable|weighted bodyweight)$/.test(e)) return 'bodyweight_loadable';
  if (/assist/.test(e)) return 'machine_assisted'; if (/^(machine[_ ]plate|plate[- ]?loaded|plate)$/.test(e)) return 'machine_plate';
  if (/hex|trap/.test(e)) return 'hexbar'; if (/^ez/.test(e)) return 'ez'; if (/smith/.test(e)) return 'smith';
  if (/barbell|^bb$/.test(e)) return 'barbell'; if (/dumbbell|^db$/.test(e)) return 'dumbbell'; if (/cable|rope|pulley/.test(e)) return 'cable';
  if (/band/.test(e)) return 'band'; if (/bodyweight|^bw$/.test(e)) return 'bodyweight'; if (/machine|selectorized|stack|pin/.test(e)) return 'machine';
  return root.CoachEquipTypes.includes(e) ? e : 'other';
}
function etName(n, bw) {
  if (/hex bar|trap bar|\bhex\b/.test(n)) return 'hexbar'; if (/smith/.test(n)) return 'smith'; if (/\bez[- ]?bar\b|\bez\b/.test(n)) return 'ez';
  if (/barbell|\bbb\b/.test(n)) return 'barbell'; if (/dumbbell|\bdb\b/.test(n)) return 'dumbbell'; if (/\bband/.test(n)) return 'band';
  if (/assist/.test(n)) return 'machine_assisted'; if (/cable|rope|pulldown|pushdown|face pull/.test(n)) return 'cable';
  if (ET_PLATE.test(n)) return 'machine_plate'; if (/machine|pec deck|selectorized|leg extension|leg curl/.test(n)) return 'machine';
  if (bw || /\bdips?\b|pull-?up|chin-?up|push-?up|bodyweight|plank|crunch|leg raise|dragon flag|back extension/.test(n)) return ET_LOADABLE.test(n) ? 'bodyweight_loadable' : 'bodyweight';
  return 'other';
}
root.CoachEquipType = c => {
  const n = String((c && (c.name || c.canonical)) || '').toLowerCase(), t = etField(c && c.equip);
  if (!t) return etName(n, c && c.bodyweight);
  if (t === 'barbell') return /smith/.test(n) ? 'smith' : /\bez\b|ez[- ]bar/.test(n) ? 'ez' : /hex bar|trap bar/.test(n) ? 'hexbar' : 'barbell';
  if (t === 'machine') return /smith/.test(n) ? 'smith' : /assist/.test(n) ? 'machine_assisted' : ET_PLATE.test(n) ? 'machine_plate' : 'machine';
  if (t === 'bodyweight') return ET_LOADABLE.test(n) ? 'bodyweight_loadable' : 'bodyweight';
  return t; };
const ET_LABEL = { barbell: 'Barbell', ez: 'Barbell', hexbar: 'Hex bar', smith: 'Smith machine', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine', machine_plate: 'Machine',
  machine_assisted: 'Machine assistance', bodyweight: 'Bodyweight', bodyweight_loadable: 'Bodyweight loadable', band: 'Band/other', other: 'Band/other' };
root.CoachEquipLabel = t => ET_LABEL[t] || 'Band/other';
root.CoachEquipOf = c => root.CoachEquipLabel(root.CoachEquipType(c)); // filter label, derived from the one type
})(this);
