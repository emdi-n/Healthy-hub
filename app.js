'use strict';

/* =====================================================================
   HEALTHY HUB  -  app.js
   Your data is saved in this browser. If you switch on sync (Settings),
   a private copy is also kept in your own Supabase project so your phone
   and laptop match, and Apple Health data can arrive through
   Health Auto Export.

   Map of this file:
     1. CONFIG        numbers you might want to tweak
     2. DEFAULTS      categories, animals and the starting habits
     3. SAVING        loading and saving
     4. DATES         helpers for days
     5. BRAINS        XP, levels, streaks, overdue scores, water
     6. ACTIONS       things that change your data
     7. APPLE HEALTH  reading data that Health Auto Export sends
     8. CLOUD         signing in and syncing between devices
     9. SCREENS       the HTML for each page
    10. EVENTS        taps and typing
    11. START-UP

   Debugging tip: press F12, open Console and type   gg.state
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. CONFIG
   --------------------------------------------------------------------- */
const CONFIG = {
  storageKey: 'healthyHub.v1',
  cloudKey: 'healthyHub.cloud',

  // Each day you pick an energy colour. "goal" is the XP that counts as a good day.
  // "maxLevel" is the hardest habits suggested (1 easy, 2 medium, 3 high energy).
  energy: {
    green: { label: 'Good energy', goal: 80, maxLevel: 3, blurb: 'Lovely. Pick whatever feels good.' },
    amber: { label: 'Steady',      goal: 50, maxLevel: 2, blurb: 'A steady day. Gentler things come first.' },
    red:   { label: 'Low',         goal: 25, maxLevel: 1, blurb: 'A low day. Gentle versions are up top.' },
    rest:  { label: 'Rest day',    goal: 0,  maxLevel: 1, blurb: 'Rest day. Nothing is needed and your streak is safe.' },
  },

  // How many non-core habits are suggested at once on each kind of day
  maxSuggested: { green: 7, amber: 5, red: 3, rest: 2 },

  dailyBonusXp: 20,   // extra XP when you meet the day's goal
  gentleFactor: 0.6,  // gentle versions earn 60% of the XP
  levelBase: 50,      // level L starts at 50 x L x (L-1) XP: 0, 100, 300, 600...
  critterBase: 30,    // same idea for the animals, a bit quicker
  glassMl: 250,       // size of the "+250" water button

  praise: ['Lovely.', 'Nicely done.', 'That counts.', 'Gently does it.',
           'Small steps, real progress.', 'Good going.', 'Well done, you.'],
};


/* ---------------------------------------------------------------------
   2. DEFAULTS   (only used the first time. After that, your saved
      habits live in your browser and the edit screens change those.)
   --------------------------------------------------------------------- */
const CATEGORIES = [
  { id: 'body',   name: 'Body care',          emoji: '🦔', critter: 'Thistle' },
  { id: 'move',   name: 'Movement',           emoji: '🦊', critter: 'Bramble' },
  { id: 'water',  name: 'Water',              emoji: '🦦', critter: 'Ripple' },
  { id: 'sleep',  name: 'Sleep',              emoji: '🐭', critter: 'Nutmeg' },
  { id: 'calm',   name: 'Calm and nature',    emoji: '🐦', critter: 'Willow' },
  { id: 'mind',   name: 'Mind and courage',   emoji: '🦉', critter: 'Hazel' },
  { id: 'social', name: 'Screens and people', emoji: '🐇', critter: 'Clover' },
];

const DEFAULT_SETTINGS = {
  stepGoal: 3000, exerciseGoal: 20, standGoal: 6, sleepGoal: 7,   // used by the automatic habits
  waterBase: 1500,   // ml
  restingHr: 65,
  graceDays: 1,      // spare days that don't break a streak
  lat: null, lon: null,
};

// How each habit gets ticked
const TYPES = {
  check:      'By hand',
  steps:      'Steps (from Apple Health)',
  exercise:   'Exercise minutes (Apple Health)',
  stand:      'Standing hours (Apple Health)',
  sleep:      'Sleep hours (Apple Health)',
  water:      'Basic water (Apple Health)',
  smartwater: 'Smart water (Apple Health)',
};

// A helper that fills in the boring bits so the list below stays readable.
// freq: how often it should come up, in days.  level: energy needed 1-3.
// after: a habit that must be done first.  core: always suggested first.
const H = (id, name, cat, o = {}) => ({
  id, name, cat, type: 'check', freq: 1, level: 1, xp: 10,
  gentle: '', options: [], after: '', link: '', notes: '', core: false, paused: false, ...o,
});

const DEFAULT_HABITS = [
  // Body care
  H('teethAM', 'Brush teeth (morning)', 'body', { core: true, gentle: 'Quick brush or mouthwash' }),
  H('teethPM', 'Brush teeth (evening)', 'body', { gentle: 'Quick brush or mouthwash' }),
  H('shower', 'Shower', 'body', { freq: 2, level: 2, xp: 20, gentle: 'Wash with a flannel or wipes' }),
  H('hair', 'Hair care', 'body', { freq: 3, level: 2, xp: 15, after: 'shower', gentle: 'Quick brush' }),
  H('shave', 'Shaving', 'body', { freq: 3, level: 2, xp: 15, after: 'shower' }),
  H('face', 'Wash face', 'body', { core: true, gentle: 'Face wipe' }),
  H('moist', 'Moisturise', 'body', { after: 'face' }),
  H('spf', 'SPF', 'body', { after: 'moist' }),

  // Movement
  H('steps', 'Step goal', 'move', { type: 'steps', level: 2, xp: 20 }),
  H('exercise', 'Exercise time', 'move', { type: 'exercise', level: 2, xp: 20 }),
  H('walk', 'Walk', 'move', { freq: 2, level: 2, xp: 20, gentle: 'Stand at the door and breathe some fresh air',
    options: ['Around the house', 'Garden', 'Short local walk', 'Longer walk'] }),
  H('pt', 'Physio (PT)', 'move', { level: 2, xp: 20, gentle: 'Just one exercise' }),
  H('stretch', 'Stretching', 'move', { gentle: 'One stretch, anywhere' }),
  H('stand', 'Standing hours', 'move', { type: 'stand' }),

  // Water (the tree on the Today page is Smart water)
  H('water', 'Basic water', 'water', { type: 'water', xp: 15 }),
  H('smartwater', 'Smart water', 'water', { type: 'smartwater', xp: 20 }),

  // Sleep
  H('sleep', 'Enough sleep', 'sleep', { type: 'sleep', xp: 15 }),
  H('bed', 'Bedtime on track', 'sleep', { xp: 15 }),
  H('wake', 'Wake time on track', 'sleep'),
  H('restbefore', 'Rest in bed before sleep', 'sleep'),
  H('restafter', 'Gentle wake-up in bed', 'sleep'),
  H('light', 'Light after waking', 'sleep', { core: true, gentle: 'Open the curtains' }),

  // Calm and nature
  H('mindbody', 'Mind-body moment', 'calm', { gentle: 'Three slow breaths',
    options: ['Breathing', 'Meditation', 'Body scan', 'Yoga nidra', 'Gentle yoga'] }),
  H('nature', 'Nature time', 'calm', { xp: 15, gentle: 'Look out of the window at something green',
    options: ['Garden', 'Park', 'Woods', 'By water', 'Window view', 'Sky-watching'] }),

  // Mind and courage
  H('reading', 'Reading', 'mind', { gentle: 'One page', options: ['Book', 'Article', 'Audiobook'] }),
  H('brain', 'Brain task', 'mind', { freq: 2, level: 2, xp: 15, gentle: 'Five minutes on it',
    options: ['Puzzle', 'Learning something', 'Planning', 'Creative', 'Admin'] }),
  H('scary', 'Scary thing', 'mind', { freq: 3, level: 3, xp: 25, gentle: 'Think it through or write it down',
    options: ['Tiny', 'Small', 'Big'] }),

  // Screens and people
  H('screen', 'Screen time in check', 'social'),
  H('socmed', 'Mindful social media', 'social'),
  H('social', 'Social time', 'social', { freq: 2, level: 2, xp: 20, gentle: 'Send someone a message',
    options: ['Chat', 'Call', 'Message', 'In person', 'With my partner'] }),
];


/* ---------------------------------------------------------------------
   3. SAVING
   --------------------------------------------------------------------- */
let state;

function freshState() {
  return {
    version: 2,
    startDate: todayStr(),
    metaAt: Date.now(),                       // when habits or settings last changed (for syncing)
    settings: { ...DEFAULT_SETTINGS },
    habits: DEFAULT_HABITS.map(h => ({ ...h, options: [...h.options] })),
    // days['2026-09-19'] = { energy, steps, hr, temp, waterMl (added by hand), waterHealth (from Apple Health),
    //                        exerciseMin, standHr, sleepHr, done:{habitId:{xp,mode,detail,cat}}, mt }
    days: {},
    milestones: {},
  };
}

function migrate(s) {
  const f = freshState();
  s.settings = { ...f.settings, ...(s.settings || {}) };
  s.habits = Array.isArray(s.habits) && s.habits.length ? s.habits : f.habits;
  s.days = s.days || {};
  s.milestones = s.milestones || {};
  s.startDate = s.startDate || f.startDate;
  s.metaAt = s.metaAt || 0;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('Could not load saved data', e); }
  return freshState();
}

function saveLocal() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); }
  catch (e) { console.warn(e); toast('Your browser would not let me save. Is private browsing on?'); }
}
// save() also schedules a sync to your other devices, if that is switched on
function save() { saveLocal(); schedulePush(); }
const touchMeta = () => { state.metaAt = Date.now(); };


/* ---------------------------------------------------------------------
   4. DATES   (days are text like "2026-09-19", which sorts correctly)
   --------------------------------------------------------------------- */
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const prettyDate = (s, o) => parse(s).toLocaleDateString('en-GB', o || { weekday: 'long', day: 'numeric', month: 'long' });
const num = n => Number(n || 0).toLocaleString('en-GB');
const round1 = n => Math.round(n * 10) / 10;
const clock = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });


/* ---------------------------------------------------------------------
   5. BRAINS
   --------------------------------------------------------------------- */
const habitById = id => state.habits.find(h => h.id === id);
const activeHabits = () => state.habits.filter(h => !h.paused);

// Get (or create) the record for a day. Creating one stamps it "changed now" for syncing.
function day(date, create) {
  let d = state.days[date];
  if (!d && create) d = state.days[date] = { energy: null, steps: 0, hr: 0, temp: null, waterMl: 0, done: {} };
  if (d && create) d.mt = Date.now();
  return d;
}

const waterTotal = d => ((d && d.waterHealth) || 0) + ((d && d.waterMl) || 0);
const energyOf = date => (state.days[date] && state.days[date].energy) || 'amber';
const goalFor = date => CONFIG.energy[energyOf(date)].goal;
const dayXp = date => { const d = state.days[date]; return d ? Object.values(d.done).reduce((s, x) => s + x.xp, 0) : 0; };
const goalMet = date => energyOf(date) !== 'rest' && dayXp(date) > 0 && dayXp(date) >= goalFor(date);
// A day "counts" for streaks if you met your goal or rested on purpose
const dayOk = date => { const d = state.days[date]; return !!d && (d.energy === 'rest' || goalMet(date)); };

// ---- XP and levels (worked out from your history each time, so undo just works)
const bonusXp = () => Object.keys(state.days).filter(goalMet).length * CONFIG.dailyBonusXp;
const milestoneXp = () => Object.values(state.milestones).reduce((s, m) => s + m.xp, 0);
function totalXp() { let t = 0; for (const date in state.days) t += dayXp(date); return t + bonusXp() + milestoneXp(); }
function catXp(catId) {
  let t = 0;
  for (const date in state.days) for (const id in state.days[date].done) { const x = state.days[date].done[id]; if (x.cat === catId) t += x.xp; }
  return t;
}
function levelInfo(xp, base) {
  let level = 1;
  while (xp >= base * (level + 1) * level) level++;
  const start = base * level * (level - 1), next = base * (level + 1) * level;
  return { level, into: xp - start, span: next - start, pct: (xp - start) / (next - start) };
}

// ---- Streaks: rest days and a few spare days keep it going
function streakInfo() {
  const today = todayStr(), grace = state.settings.graceDays;
  let cur = dayOk(today) ? 1 : 0, gap = 0;
  for (let d = addDays(today, -1); d >= state.startDate; d = addDays(d, -1)) {
    if (dayOk(d)) { cur++; gap = 0; } else { gap++; if (gap > grace) break; }
  }
  let best = 0, run = 0; gap = 0;
  for (let d = state.startDate; d <= today; d = addDays(d, 1)) {
    if (dayOk(d)) { run++; gap = 0; best = Math.max(best, run); }
    else if (d !== today) { gap++; if (gap > grace) run = 0; }
  }
  return { cur, best: Math.max(best, cur) };
}

// ---- Overdue score: days since last done / how often it should happen (1 = due now).
// Rest days don't count against you.
function restDaysBetween(a, b) {
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (state.days[d] && state.days[d].energy === 'rest') n++;
  return n;
}
function overdue(habit, asOf) {
  let last = null;
  for (const d in state.days) if (d <= asOf && state.days[d].done[habit.id] && (!last || d > last)) last = d;
  const ds = last ? Math.max(0, daysBetween(last, asOf) - restDaysBetween(last, asOf)) : habit.freq * 2;
  const score = ds / habit.freq;
  const fresh = Math.max(0, Math.min(1, 1 - (ds - habit.freq) / (2 * habit.freq)));  // 100% until due, 0% at 3x its gap
  return { last, ds, score, fresh };
}
const wildPct = list => list.length ? Math.round(100 * list.reduce((s, h) => s + overdue(h, todayStr()).fresh, 0) / list.length) : 0;

// ---- Smart water: a rough guide from steps, heart rate and the weather
function waterPlan(date) {
  const d = state.days[date] || {}, s = state.settings;
  const steps = d.steps || 0, hr = d.hr || 0, temp = d.temp;
  const rest = d.restHr || s.restingHr;
  const stepsMl = Math.min(600, Math.round(Math.max(0, steps - 2000) / 1000 * 2) * 50);       // +100 ml per 1,000 steps over 2,000
  const hrMl = hr ? Math.min(300, Math.floor(Math.max(0, hr - rest - 10) / 5) * 50) : 0;      // +50 ml per 5 bpm above resting + 10
  const tempMl = temp != null && temp > 20 ? Math.min(500, Math.round(temp - 20) * 50) : 0;   // +50 ml per degree over 20
  const parts = [
    { label: 'Base amount', basis: '', ml: s.waterBase },
    { label: 'Steps', basis: steps ? `${num(steps)} so far` : 'not recorded yet', ml: stepsMl, add: true },
    { label: 'Heart rate', basis: hr ? `average ${hr} bpm` : 'not recorded yet', ml: hrMl, add: true },
    { label: 'Weather', basis: temp != null ? `${temp}\u00b0C high` : 'not recorded yet', ml: tempMl, add: true },
  ];
  const target = Math.round(parts.reduce((t, p) => t + p.ml, 0) / 50) * 50;
  return { target, parts };
}

// ---- Habits that fill themselves in from Apple Health data
function autoInfo(h, date) {
  const d = state.days[date] || {}, s = state.settings;
  switch (h.type) {
    case 'steps':      return { have: d.steps || 0,        need: s.stepGoal,     unit: 'steps' };
    case 'exercise':   return { have: d.exerciseMin || 0,  need: s.exerciseGoal, unit: 'min' };
    case 'stand':      return { have: d.standHr || 0,      need: s.standGoal,    unit: 'hours' };
    case 'sleep':      return { have: d.sleepHr || 0,      need: s.sleepGoal,    unit: 'hours' };
    case 'water':      return { have: waterTotal(d),       need: s.waterBase,    unit: 'ml' };
    case 'smartwater': return { have: waterTotal(d),       need: waterPlan(date).target, unit: 'ml' };
  }
  return null;
}
const fmtAmount = n => num(round1(n));

// ---- Milestones: one-off XP bonuses from running totals
function lifetimeTotals() {
  let steps = 0, water = 0, done = 0;
  for (const date in state.days) { const d = state.days[date]; steps += d.steps || 0; water += waterTotal(d); done += Object.keys(d.done).length; }
  return { steps, waterL: Math.floor(water / 1000), done };
}
function milestoneList() {
  const st = streakInfo(), t = lifetimeTotals(), out = [];
  [[3, 30], [7, 50], [14, 80], [30, 150], [60, 250], [100, 400]].forEach(([n, xp]) =>
    out.push({ id: 'streak' + n, label: `${n}-day streak`, xp, have: st.best, need: n }));
  [[25000, 50], [100000, 100], [250000, 150], [500000, 250], [1000000, 500]].forEach(([n, xp]) =>
    out.push({ id: 'steps' + n, label: `${num(n)} steps in total`, xp, have: t.steps, need: n }));
  [[25, 50], [100, 100], [250, 150]].forEach(([n, xp]) =>
    out.push({ id: 'water' + n, label: `${n} litres of water`, xp, have: t.waterL, need: n }));
  [[50, 50], [100, 80], [250, 120], [500, 200], [1000, 300]].forEach(([n, xp]) =>
    out.push({ id: 'done' + n, label: `${num(n)} habits ticked`, xp, have: t.done, need: n }));
  return out;
}
function checkMilestones() {
  const msgs = [];
  for (const m of milestoneList()) {
    if (m.have >= m.need && !state.milestones[m.id]) {
      state.milestones[m.id] = { date: todayStr(), xp: m.xp, label: m.label };
      msgs.push(`Milestone: ${m.label}. +${m.xp} xp`);
    }
  }
  return msgs;
}


/* ---------------------------------------------------------------------
   6. ACTIONS  (everything that changes data goes through mutate)
   --------------------------------------------------------------------- */
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Habits that tick themselves (steps, water, sleep...) are checked here.
// Only "auto" ticks are ever removed automatically, never ones you did by hand.
function syncAuto(date) {
  const d = day(date, true);
  for (const h of activeHabits()) {
    const a = autoInfo(h, date);
    if (!a) continue;
    const met = a.have > 0 && a.have >= a.need;
    if (met && !d.done[h.id]) d.done[h.id] = { xp: h.xp, mode: 'auto', detail: '', cat: h.cat, ts: Date.now() };
    if (!met && d.done[h.id] && d.done[h.id].mode === 'auto') delete d.done[h.id];
  }
}

function completeHabit(date, habit, mode, detail) {
  const d = day(date, true);
  const xp = mode === 'gentle' ? Math.max(1, Math.round(habit.xp * CONFIG.gentleFactor)) : habit.xp;
  d.done[habit.id] = { xp, mode: mode || 'full', detail: detail || '', cat: habit.cat, ts: Date.now() };
  return xp;
}

function snapshot() {
  const xp = totalXp(), cats = {};
  CATEGORIES.forEach(c => { cats[c.id] = levelInfo(catXp(c.id), CONFIG.critterBase).level; });
  const d = state.days[ui.date];
  return { level: levelInfo(xp, CONFIG.levelBase).level, cats, done: d ? Object.keys(d.done) : [], met: goalMet(ui.date) };
}

// Run a change, then tidy up: sync auto habits, check milestones, save, redraw and cheer.
function mutate(fn) {
  const before = snapshot(), msgs = [];
  const said = fn(); if (said) msgs.push(said);
  syncAuto(ui.date);
  const after = snapshot();
  for (const id of after.done) {
    if (!before.done.includes(id)) {
      const h = habitById(id), x = state.days[ui.date].done[id];
      msgs.push(`${pick(CONFIG.praise)} ${h ? h.name : 'Habit'} done, +${x.xp} xp`);
    }
  }
  if (after.met && !before.met) msgs.push(`Daily goal reached. +${CONFIG.dailyBonusXp} bonus xp`);
  msgs.push(...checkMilestones());
  const now = snapshot();
  if (now.level > before.level) msgs.push(`Your woodland reached level ${now.level}.`);
  for (const c of CATEGORIES) if (now.cats[c.id] > before.cats[c.id]) msgs.push(`${c.critter} reached level ${now.cats[c.id]}.`);
  save();
  render();
  if (msgs.length) toast(msgs);
}

function handleTick(h, mode) {
  const date = ui.date, d = state.days[date];
  if (d && d.done[h.id]) return mutate(() => { delete state.days[date].done[h.id]; });
  if (mode === 'gentle') return mutate(() => { completeHabit(date, h, 'gentle'); });
  if (h.type === 'check' && h.options.length) return openOptionsSheet(h);
  mutate(() => { completeHabit(date, h, h.type === 'check' ? 'full' : 'manual'); });
}

// Links like  yoursite/#done=reading&steps=4200  (handy for Shortcuts or NFC tags)
function handleHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const p = new URLSearchParams(raw), date = todayStr();
  mutate(() => {
    const d = day(date, true);
    if (p.has('energy') && CONFIG.energy[p.get('energy')]) d.energy = p.get('energy');
    if (p.has('steps')) d.steps = Math.max(0, parseInt(p.get('steps'), 10) || 0);
    if (p.has('hr')) d.hr = Math.max(0, parseInt(p.get('hr'), 10) || 0);
    if (p.has('temp') && p.get('temp') !== '') d.temp = parseFloat(p.get('temp'));
    if (p.has('done')) p.get('done').split(',').forEach(id => {
      const h = habitById(id.trim());
      if (h && !d.done[h.id]) completeHabit(date, h);
    });
  });
  history.replaceState(null, '', location.pathname + location.search);
}


/* ---------------------------------------------------------------------
   7. APPLE HEALTH   Health Auto Export posts JSON like
      {"data":{"metrics":[{"name":"step_count","units":"count","data":[{"date":"2026-09-19 00:00:00 +0100","qty":5234}]}]}}
      into your Supabase "inbox". We read it here and fill in the day's numbers.
   --------------------------------------------------------------------- */
function toMl(q, units) {
  if (/^(l|liters?|litres?)$/.test(units)) return q * 1000;
  if (units.includes('fl')) return q * 29.5735;
  return q;   // already millilitres
}

function applyHealth(metrics) {
  const acc = {};   // date -> totals found in this message
  for (const m of metrics) {
    const name = String(m.name || '').toLowerCase(), units = String(m.units || '').toLowerCase();
    for (const p of (m.data || [])) {
      const date = String(p.date || p.startDate || '').slice(0, 10);   // the date as your phone wrote it
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const a = acc[date] || (acc[date] = {}), q = Number(p.qty) || 0;
      if (name === 'step_count') a.steps = (a.steps || 0) + q;
      else if (name === 'apple_exercise_time') a.exerciseMin = (a.exerciseMin || 0) + q;
      else if (name === 'apple_stand_hour') a.standHr = (a.standHr || 0) + q;
      else if (name === 'apple_stand_time') a.standHr = (a.standHr || 0) + q / 60;
      else if (name === 'dietary_water') a.waterHealth = (a.waterHealth || 0) + toMl(q, units);
      else if (name === 'heart_rate') { const v = p.Avg != null ? Number(p.Avg) : q; if (v > 0) { a.hrSum = (a.hrSum || 0) + v; a.hrN = (a.hrN || 0) + 1; } }
      else if (name === 'resting_heart_rate') { if (q > 0) a.restHr = q; }
      else if (name === 'sleep_analysis') {
        const v = p.totalSleep != null ? Number(p.totalSleep) : (p.asleep != null ? Number(p.asleep) : null);
        if (v != null) a.sleepHr = Math.max(a.sleepHr || 0, v);
        else if (['Core', 'REM', 'Deep', 'Asleep'].includes(p.value)) a.sleepSeg = (a.sleepSeg || 0) + q;
      }
    }
  }
  for (const date in acc) {
    const a = acc[date], d = day(date, true);
    // Totals only ever go up during a day, so keep the bigger number
    if (a.steps != null) d.steps = Math.max(d.steps || 0, Math.round(a.steps));
    if (a.exerciseMin != null) d.exerciseMin = Math.max(d.exerciseMin || 0, Math.round(a.exerciseMin));
    if (a.standHr != null) d.standHr = Math.max(d.standHr || 0, round1(a.standHr));
    if (a.waterHealth != null) d.waterHealth = Math.max(d.waterHealth || 0, Math.round(a.waterHealth));
    if (a.hrN) d.hr = Math.round(a.hrSum / a.hrN);
    if (a.restHr) d.restHr = Math.round(a.restHr);
    const sleep = a.sleepHr != null ? a.sleepHr : a.sleepSeg;
    if (sleep != null) d.sleepHr = round1(sleep);
    d.hcAt = Date.now();
  }
  return Object.keys(acc);
}

// One message from the inbox. Health Auto Export sends "metrics". A Shortcut can send {"data":{"done":["reading"]}}.
function applyInbox(payload) {
  const data = (payload && payload.data) || payload || {}, dates = new Set();
  if (Array.isArray(data.metrics)) applyHealth(data.metrics).forEach(x => dates.add(x));
  if (Array.isArray(data.done)) {
    const date = data.date || todayStr();
    data.done.forEach(id => { const h = habitById(id); if (h && !(state.days[date] && state.days[date].done[h.id])) completeHabit(date, h); dates.add(date); });
  }
  return dates;
}

const doneKeys = () => { const s = new Set(); for (const date in state.days) for (const id in state.days[date].done) s.add(date + '|' + id); return s; };


/* ---------------------------------------------------------------------
   8. CLOUD   (optional) sign in to your own Supabase project so your
      phone and laptop share one copy, and Apple Health data can arrive.
   --------------------------------------------------------------------- */
const cloud = { cfg: { url: '', key: '', email: '', session: null }, busy: false, error: '', last: 0, inboxCount: 0 };
try { Object.assign(cloud.cfg, JSON.parse(localStorage.getItem(CONFIG.cloudKey) || '{}')); } catch (e) { /* first run */ }
const cloudSave = () => { try { localStorage.setItem(CONFIG.cloudKey, JSON.stringify(cloud.cfg)); } catch (e) { /* ignore */ } };
const cloudReady = () => !!(cloud.cfg.url && cloud.cfg.key && cloud.cfg.session);
const cleanUrl = u => String(u || '').trim().replace(/\/+$/, '');

async function tokenRequest(grant, body) {
  const r = await fetch(`${cloud.cfg.url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: cloud.cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || j.message || `Sign-in failed (${r.status})`);
  cloud.cfg.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user && j.user.id };
  cloudSave();
}

async function cloudApi(path, opts = {}) {
  const s = cloud.cfg.session;
  if (!s) throw new Error('Not signed in');
  if (Date.now() > s.expires_at - 60000) await tokenRequest('refresh_token', { refresh_token: s.refresh_token });
  const r = await fetch(cloud.cfg.url + path, {
    ...opts,
    headers: { apikey: cloud.cfg.key, Authorization: 'Bearer ' + cloud.cfg.session.access_token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Combine two copies. Each day keeps whichever copy changed last; habits and settings follow the newer edit.
function mergeStates(local, remote) {
  const base = (local.metaAt || 0) >= (remote.metaAt || 0) ? local : remote;
  const out = { ...base, days: { ...remote.days }, milestones: { ...remote.milestones, ...local.milestones } };
  for (const date in local.days) {
    const r = remote.days[date];
    if (!r || (local.days[date].mt || 0) >= (r.mt || 0)) out.days[date] = local.days[date];
  }
  out.startDate = [local.startDate, remote.startDate].filter(Boolean).sort()[0];
  return migrate(out);
}

async function cloudSync() {
  if (!cloudReady() || cloud.busy) return;
  cloud.busy = true; render();
  try {
    const uid = cloud.cfg.session.uid;
    // 1. Bring in the other device's copy
    const rows = await cloudApi(`/rest/v1/hub_state?select=data&user_id=eq.${uid}`);
    if (rows && rows[0] && rows[0].data) state = mergeStates(state, migrate(rows[0].data));

    // 2. Read anything waiting in the inbox (Apple Health, Shortcuts)
    const inbox = await cloudApi('/rest/v1/hub_inbox?select=id,data&order=id.asc&limit=200');
    if (inbox && inbox.length) {
      const before = doneKeys(), lvBefore = levelInfo(totalXp(), CONFIG.levelBase).level, dates = new Set();
      inbox.forEach(row => applyInbox(row.data).forEach(x => dates.add(x)));
      dates.forEach(d => syncAuto(d));
      const msgs = [...doneKeys()].filter(k => !before.has(k) && k.startsWith(todayStr()))
        .map(k => { const h = habitById(k.split('|')[1]); return `${h ? h.name : 'Habit'} done from Apple Health`; });
      msgs.push(...checkMilestones());
      const lv = levelInfo(totalXp(), CONFIG.levelBase).level;
      if (lv > lvBefore) msgs.push(`Your woodland reached level ${lv}.`);
      saveLocal();
      await cloudApi(`/rest/v1/hub_inbox?id=in.(${inbox.map(r => r.id).join(',')})`, { method: 'DELETE' });
      if (msgs.length) toast(msgs);
      cloud.inboxCount += inbox.length;
    }

    // 3. Save the combined copy
    saveLocal();
    await cloudApi('/rest/v1/hub_state?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: uid, data: state, updated_at: new Date().toISOString() }),
    });
    cloud.last = Date.now(); cloud.error = '';
  } catch (e) {
    console.warn(e);
    cloud.error = String(e.message || e);
    if (/401|JWT|expired/i.test(cloud.error)) cloud.error += ' You may need to sign in again.';
  } finally {
    cloud.busy = false; render();
  }
}

let pushTimer;
function schedulePush() { if (cloudReady()) { clearTimeout(pushTimer); pushTimer = setTimeout(cloudSync, 2500); } }

async function autoWeather() {
  const s = state.settings, today = todayStr(), d = state.days[today];
  if (s.lat == null || (d && d.temp != null && d.tempOn === today)) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&daily=temperature_2m_max&timezone=auto&forecast_days=1`);
    const t = (await r.json()).daily.temperature_2m_max[0];
    const dd = day(today, true); dd.temp = round1(t); dd.tempOn = today;
    save(); render();
  } catch (e) { /* offline is fine */ }
}


/* ---------------------------------------------------------------------
   9. SCREENS
   --------------------------------------------------------------------- */
const ui = { folds: {}, tab: 'today', date: todayStr(), openId: null, editId: null, calMonth: todayStr().slice(0, 7), sheet: null };
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
const freqText = h => h.freq === 1 ? 'daily' : `every ${h.freq} days`;
const safeUrl = u => { u = (u || '').trim(); return /^https?:\/\//i.test(u) || /^[\w\-./%]+$/.test(u) ? u : ''; };

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  woodland: '<path d="M12 21v-5"/><path d="M12 16c-4 0-6.5-2.4-6.5-5.4 0-2 1.3-3.6 3-4.1C8.9 4 10.2 2.5 12 2.5s3.1 1.5 3.5 4c1.7.5 3 2.100 3 4.100 0 3-2.500 5.400-6.500 5.400z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  settings: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
};
const icon = name => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const CHECK = '<svg viewBox="0 0 24 24" class="chk" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function ring(pct, cls) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
  return `<svg class="ring ${cls || ''}" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="${r}"/>
    <circle class="ring-fg" cx="40" cy="40" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 40 40)"/></svg>`;
}

// A simple pine tree that fills with blue from the bottom as you drink your water
function treeSvg(pct) {
  const p = Math.max(0, Math.min(1, pct)), y = ((1 - p) * 122).toFixed(1);
  const shapes = '<path d="M50 6 26 46h13L15 82h20L12 116h76L65 82h20L62 46h13z"/><rect x="44" y="116" width="12" height="14" rx="2"/>';
  return `<svg class="tree" viewBox="0 0 100 132" aria-hidden="true">
    <defs><clipPath id="treeClip">${shapes}</clipPath></defs>
    <g class="tree-line">${shapes}</g>
    <g class="tree-fill">${shapes}</g>
    <g clip-path="url(#treeClip)"><rect class="tree-water" x="-2" y="0" width="104" height="132" style="transform:translateY(${y}px)"/></g>
  </svg>`;
}

function render() {
  const views = { today: viewToday, woodland: viewWoodland, calendar: viewCalendar, settings: viewSettings };
  document.body.dataset.tone = ui.tab === 'today' ? energyOf(ui.date) : 'calm';
  $('#app').innerHTML = views[ui.tab]();
  const tabs = [['today', 'Today'], ['woodland', 'Woodland'], ['calendar', 'Calendar'], ['settings', 'Settings']];
  $('#nav').innerHTML = tabs.map(([id, label]) =>
    `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></button>`).join('');
  if (ui.sheet === 'data') refreshWaterBox();
}

// ---------------- TODAY ----------------
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function viewToday() {
  const date = ui.date, isToday = date === todayStr(), d = state.days[date];
  const chosen = d && d.energy, en = energyOf(date), cfg = CONFIG.energy[en];
  const xp = dayXp(date), st = streakInfo();
  const resting = en === 'rest', lowDay = en === 'red' || en === 'rest';

  const pebbles = Object.entries(CONFIG.energy).map(([key, c]) =>
    `<button class="pebble e-${key}${chosen === key ? ' on' : ''}" data-act="energy" data-val="${key}" aria-pressed="${chosen === key}"><i></i>${c.label}</button>`).join('');

  const hero = `
    <section class="hero">
      <p class="hello"><span>${isToday ? greeting() : 'Looking back'}</span><span class="date">${prettyDate(date)}</span></p>
      ${isToday ? '' : '<button class="btn small back" data-act="back-today">Back to today</button>'}
      <h1 class="q">${chosen ? 'Your energy' : 'How is your energy today?'}</h1>
      <div class="pebbles" role="group" aria-label="Energy for the day">${pebbles}</div>
      ${chosen ? `<p class="blurb">${cfg.blurb}</p>` : ''}
      <div class="progress-row">
        <div class="ring-wrap">${ring(resting ? 1 : xp / cfg.goal, 'e-' + en)}<span class="ring-num">${resting ? 'rest' : xp}</span></div>
        <div>
          <p class="big">${resting ? 'Resting' : `${xp} of ${cfg.goal} xp`}</p>
          <p class="small">${goalMet(date) ? 'Goal met. ' : ''}${st.cur} day streak</p>
        </div>
      </div>
    </section>`;

  // Sort habits into groups
  const core = [], picks = [], later = [], notDue = [], done = [];
  let hidden = 0;
  for (const h of activeHabits()) {
    if (h.type === 'smartwater') continue;                       // shown as the tree instead
    if (d && d.done[h.id]) { done.push({ h }); continue; }
    if (h.after) { const pre = habitById(h.after); if (pre && !pre.paused && !(d && d.done[pre.id])) { hidden++; continue; } }
    const od = overdue(h, date);
    const gentle = lowDay && h.gentle && h.type === 'check';     // gentle version replaces the normal one
    const canDo = h.level <= cfg.maxLevel || gentle;
    if (h.core && canDo) core.push({ h, od, gentle });
    else if (od.score >= 1) (canDo ? picks : later).push({ h, od, gentle });
    else notDue.push({ h, od, gentle: false });
  }
  // Most overdue first; on a tie the gentler habit wins. Only a few are suggested at a time.
  picks.sort((a, b) => b.od.score - a.od.score || a.h.level - b.h.level);
  const shown = core.concat(picks.slice(0, CONFIG.maxSuggested[en]));
  const more = picks.slice(CONFIG.maxSuggested[en]).concat(later).sort((a, b) => b.od.score - a.od.score || a.h.level - b.h.level);
  notDue.sort((a, b) => b.od.score - a.od.score);

  const list = items => `<ul class="rows">${items.map(x => rowHtml(x.h, x.od, date, x.gentle)).join('')}</ul>`;
  const fold = (key, title, items) => items.length ? `<details class="fold" data-fold="${key}"${ui.folds[key] ? ' open' : ''}><summary>${title} <span class="count">${items.length}</span></summary>${list(items)}</details>` : '';

  let body = waterCard(date);
  if (shown.length) body += `<section class="panel"><h2>${resting ? 'If you fancy something small' : 'Suggested'}</h2>${list(shown)}</section>`;
  else body += `<section class="panel"><p class="empty">${done.length ? 'Everything suggested is done. Well done, you.' : 'Nothing is due. Enjoy the quiet.'}</p></section>`;
  body += fold('more', 'More when you are ready', more);
  if (done.length) body += `<section class="panel done-panel"><h2>Done ${isToday ? 'today' : 'this day'}</h2>${list(done)}</section>`;
  body += fold('notdue', 'Not due yet', notDue);
  if (hidden) body += `<p class="hint">${hidden} more will appear as you go.</p>`;
  return hero + body;
}

// The tree: fills with blue as you drink. Tap it for today's numbers.
function waterCard(date) {
  const h = activeHabits().find(x => x.type === 'smartwater');
  if (!h) return '';
  const d = state.days[date], plan = waterPlan(date), have = waterTotal(d), pct = plan.target ? Math.min(1, have / plan.target) : 0;
  const entry = d && d.done[h.id];
  return `<button class="panel water-card" data-act="data-sheet" aria-label="Water today. Tap for how it is worked out">
    ${treeSvg(pct)}
    <div class="wc-text">
      <p class="small">Smart water</p>
      <p class="big">${num(have)} of ${num(plan.target)} ml</p>
      <p class="small">${Math.round(pct * 100)}%${entry ? `, goal met, +${entry.xp} xp` : ''}</p>
    </div>
  </button>`;
}

function rowHtml(h, od, date, gm) {
  const d = state.days[date], entry = d && d.done[h.id], open = ui.openId === h.id;
  const auto = autoInfo(h, date), link = safeUrl(h.link), hasMore = !!(h.notes || link);
  let meta = '', bar = '';

  if (auto) {
    meta = `${fmtAmount(auto.have)} of ${fmtAmount(auto.need)} ${auto.unit}`;
    if (!entry) bar = `<span class="bar thin" style="--p:${Math.min(100, Math.round(100 * auto.have / (auto.need || 1)))}%"></span>`;
  } else if (entry) {
    meta = entry.mode === 'gentle' ? 'Gentle version' : esc(entry.detail);
  } else if (gm) {
    meta = `Gentle version of ${esc(h.name)}`;
  } else if (od && od.last) {
    meta = od.ds === 0 ? 'Done today' : od.ds === 1 ? 'Last done yesterday' : `Last done ${od.ds} days ago`;
  }
  if (entry) meta += (meta ? ', ' : '') + `+${entry.xp} xp`;

  const tag = !entry && !gm && h.level >= 2 ? `<span class="lvl-tag l${h.level}">${h.level === 2 ? 'Medium' : 'High'} energy</span>` : '';
  const pill = !entry && !gm && h.gentle && h.type === 'check'
    ? `<button class="gentle" data-act="gentle" data-id="${h.id}">Gentle: ${esc(h.gentle)}</button>` : '';
  const title = gm ? esc(h.gentle) : esc(h.name);
  const nameEl = hasMore
    ? `<button class="row-name" data-act="open" data-id="${h.id}" aria-expanded="${open}">${title}</button>`
    : `<span class="row-name">${title}</span>`;

  let more = '';
  if (open && hasMore) {
    const media = !link ? '' : /\.(mp3|m4a|wav|ogg|aac)$/i.test(link)
      ? `<audio controls preload="none" src="${esc(link)}"></audio>`
      : `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Open guide or recording</a>`;
    more = `<div class="more">${h.notes ? `<p class="notes">${esc(h.notes)}</p>` : ''}${media}</div>`;
  }

  return `<li class="row${entry ? ' is-done' : ''}" style="--cat:var(--c-${h.cat})">
    <button class="tick" data-act="tick" data-id="${h.id}" ${gm ? 'data-mode="gentle"' : ''} aria-label="${entry ? 'Undo' : 'Mark done'}: ${title}">${entry ? CHECK : ''}</button>
    <div class="row-main">
      ${nameEl}
      ${meta || tag ? `<span class="row-meta">${meta}${tag}</span>` : ''}
      ${bar}${pill}
    </div>
    ${more}
  </li>`;
}

// ---------------- WOODLAND ----------------
function viewWoodland() {
  const lvl = levelInfo(totalXp(), CONFIG.levelBase), st = streakInfo(), active = activeHabits(), wild = wildPct(active);

  const tiles = CATEGORIES.map(c => {
    const list = active.filter(h => h.cat === c.id);
    if (!list.length) return '';
    const ci = levelInfo(catXp(c.id), CONFIG.critterBase);
    return `<article class="tile" style="--cat:var(--c-${c.id})">
      <div class="crit-big" aria-hidden="true">${c.emoji}</div>
      <h3>${esc(c.critter)}</h3>
      <p class="small">${esc(c.name)}</p>
      <div class="bar thin" style="--p:${Math.round(ci.pct * 100)}%" aria-hidden="true"></div>
      <p class="bloom"><span><strong>${wildPct(list)}%</strong> wild</span><span class="small">Level ${ci.level}</span></p>
    </article>`;
  }).join('');

  const ms = milestoneList();
  const got = ms.filter(m => state.milestones[m.id]);
  const next = ms.filter(m => !state.milestones[m.id]).slice(0, 4);

  return `<header class="page-head"><h1>Woodland</h1></header>
    <section class="panel">
      <div class="garden-top">
        <div class="ring-wrap large">${ring(wild / 100, 'e-green')}<span class="ring-num">${wild}%</span></div>
        <div><p class="big">Level ${lvl.level} woodland</p><p class="small">${wild}% wild</p></div>
      </div>
      <div class="bar level-bar" style="--p:${Math.round(lvl.pct * 100)}%" aria-hidden="true"></div>
      <p class="small">${num(lvl.span - lvl.into)} xp to level ${lvl.level + 1}</p>
    </section>
    <section class="panel stats">
      <div><strong>${num(totalXp())}</strong><span>total xp</span></div>
      <div><strong>${st.cur}</strong><span>day streak</span></div>
      <div><strong>${st.best}</strong><span>best streak</span></div>
    </section>
    <h2 class="sec">Your animals</h2>
    <div class="tiles">${tiles}</div>
    <h2 class="sec">Milestones</h2>
    <section class="panel">
      ${got.length ? `<ul class="plain ms">${got.map(m => `<li class="got"><span>${esc(m.label)}</span><span>+${m.xp} xp</span></li>`).join('')}</ul>` : '<p class="empty">Your first milestone is not far away.</p>'}
      ${next.length ? `<h3 class="sub-h">Coming up</h3><ul class="plain ms">${next.map(m => `<li><span>${esc(m.label)}</span><span>${num(Math.min(m.have, m.need))} of ${num(m.need)}</span></li>`).join('')}</ul>` : ''}
    </section>`;
}

// ---------------- CALENDAR ----------------
function viewCalendar() {
  const [y, m] = ui.calMonth.split('-').map(Number), today = todayStr();
  const offset = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;   // week starts on Monday
  const count = new Date(y, m, 0).getDate();
  const title = new Date(y, m - 1, 1, 12).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let cells = '', met = 0, rests = 0, xpSum = 0;
  for (let i = 0; i < offset; i++) cells += '<span class="cell blank"></span>';
  for (let n = 1; n <= count; n++) {
    const date = `${y}-${pad(m)}-${pad(n)}`, d = state.days[date], future = date > today;
    const xp = dayXp(date), en = d && d.energy, goal = goalFor(date);
    if (d) { xpSum += xp; if (d.energy === 'rest') rests++; else if (goalMet(date)) met++; }
    const pct = d ? (d.energy === 'rest' ? 100 : Math.min(100, Math.round(100 * xp / Math.max(1, goal)))) : 0;
    cells += `<button class="cell${en ? ' e-' + en : ''}${dayOk(date) ? ' ok' : ''}${date === today ? ' today' : ''}${date === ui.date ? ' picked' : ''}" ${future ? 'disabled' : ''}
      data-act="pick-day" data-date="${date}" aria-label="${prettyDate(date)}${dayOk(date) ? ', goal met or resting' : ''}">
      <span class="dn">${n}</span><span class="bar thin" style="--p:${pct}%"></span></button>`;
  }
  const nextDisabled = ui.calMonth >= today.slice(0, 7);
  return `<header class="page-head"><h1>Calendar</h1></header>
    <section class="panel">
      <div class="cal-head">
        <button class="mini" data-act="cal-prev" aria-label="Previous month">&lsaquo;</button>
        <h2>${title}</h2>
        <button class="mini" data-act="cal-next" aria-label="Next month" ${nextDisabled ? 'disabled' : ''}>&rsaquo;</button>
      </div>
      <div class="cal-grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<span class="dow">${w}</span>`).join('')}
        ${cells}
      </div>
      <p class="legend"><span class="lg e-green"></span>Good <span class="lg e-amber"></span>Steady <span class="lg e-red"></span>Low <span class="lg e-rest"></span>Rest</p>
    </section>
    <section class="panel stats">
      <div><strong>${met}</strong><span>goals met</span></div>
      <div><strong>${rests}</strong><span>rest days</span></div>
      <div><strong>${num(xpSum)}</strong><span>xp this month</span></div>
    </section>`;
}

// ---------------- SETTINGS (habits, goals, sync, backup) ----------------
const field = (label, inner) => `<label class="field"><span class="lab">${label}</span>${inner}</label>`;
const opt = (v, label, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${label}</option>`;

function viewSettings() {
  if (ui.editId) return viewEdit();
  const s = state.settings;
  const numField = (key, label, min, max, step) => field(label, `<input type="number" data-setting="${key}" min="${min}" max="${max}" step="${step || 1}" value="${s[key]}">`);

  const habitGroups = CATEGORIES.map(c => {
    const list = state.habits.filter(h => h.cat === c.id);
    if (!list.length) return '';
    return `<div class="group" style="--cat:var(--c-${c.id})"><h3><span aria-hidden="true">${c.emoji}</span> ${esc(c.name)}</h3><ul class="plain">` +
      list.map(h => `<li><button class="edit-row${h.paused ? ' paused' : ''}" data-act="edit" data-id="${h.id}">
        <span class="dotcat"></span><span class="er-name">${esc(h.name)}${h.core ? ' <em>core</em>' : ''}</span>
        <span class="er-meta">${h.type === 'check' ? freqText(h) : 'auto'}${h.paused ? ', paused' : ''}</span></button></li>`).join('') + '</ul></div>';
  }).join('');

  return `<header class="page-head"><h1>Settings</h1></header>

  <details class="fold" data-fold="habits"${ui.folds.habits ? ' open' : ''}>
    <summary>Habits <span class="count">${state.habits.length}</span></summary>
    <button class="btn primary wide" data-act="new-habit">Add a habit</button>
    ${habitGroups}
  </details>

  <section class="panel form">
    <h2>Goals</h2>
    ${numField('stepGoal', 'Step goal', 100, 30000)}
    ${numField('exerciseGoal', 'Exercise minutes', 5, 300)}
    ${numField('standGoal', 'Standing hours', 1, 16)}
    ${numField('sleepGoal', 'Sleep hours', 3, 14, 0.5)}
    ${numField('waterBase', 'Base water amount (ml)', 500, 5000, 50)}
    ${numField('restingHr', 'Resting heart rate (bpm)', 40, 120)}
    ${field('Spare days for streaks', `<select data-setting="graceDays">${[0, 1, 2, 3].map(n => opt(n, n === 0 ? 'None' : n + (n === 1 ? ' spare day' : ' spare days'), s.graceDays)).join('')}</select>`)}
  </section>

  ${cloudPanel()}

  <section class="panel">
    <h2>Back up your data</h2>
    <div class="btn-row"><button class="btn" data-act="export">Download backup</button>
    <button class="btn" data-act="import">Restore from backup</button></div>
    <input id="import-file" type="file" accept="application/json" hidden>
  </section>`;
}

function cloudPanel() {
  const c = cloud.cfg;
  if (!cloudReady()) {
    return `<section class="panel form"><h2>Sync between devices</h2>
      ${field('Project URL', `<input id="c-url" type="url" inputmode="url" placeholder="https://abcd.supabase.co" value="${esc(c.url)}" autocomplete="off">`)}
      ${field('Publishable (anon) key', `<input id="c-key" type="text" value="${esc(c.key)}" autocomplete="off">`)}
      ${field('Email', `<input id="c-email" type="email" value="${esc(c.email)}" autocomplete="username">`)}
      ${field('Password', `<input id="c-pass" type="password" autocomplete="current-password">`)}
      <button class="btn primary" data-act="cloud-signin">Sign in</button>
      ${cloud.error ? `<p class="err">${esc(cloud.error)}</p>` : ''}
    </section>`;
  }
  const today = state.days[todayStr()], hc = today && today.hcAt;
  return `<section class="panel"><h2>Sync between devices</h2>
    <p class="small">Signed in as ${esc(c.email)}.${cloud.busy ? ' Syncing...' : cloud.last ? ` Last synced ${clock(cloud.last)}.` : ''}</p>
    <p class="small">${hc ? `Apple Health data last arrived today at ${clock(hc)}.` : 'No Apple Health data has arrived today yet.'}</p>
    ${cloud.error ? `<p class="err">${esc(cloud.error)}</p>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="cloud-sync">Sync now</button>
      <button class="btn" data-act="copy" data-what="url">Copy web address</button>
      <button class="btn" data-act="copy" data-what="key">Copy key</button>
      <button class="btn ghost" data-act="cloud-signout">Sign out</button>
    </div>
  </section>`;
}

function viewEdit() {
  const isNew = ui.editId === 'new';
  const h = isNew ? H('', '', 'body') : habitById(ui.editId);
  if (!h) { ui.editId = null; return viewSettings(); }
  const others = state.habits.filter(x => x.id !== h.id);
  return `<header class="page-head"><h1>${isNew ? 'New habit' : 'Edit habit'}</h1></header>
  <section class="panel form">
    ${field('Name', `<input id="f-name" type="text" value="${esc(h.name)}" maxlength="60">`)}
    ${field('Category', `<select id="f-cat">${CATEGORIES.map(c => opt(c.id, esc(c.name), h.cat)).join('')}</select>`)}
    ${field('How it gets ticked', `<select id="f-type">${Object.entries(TYPES).map(([k, v]) => opt(k, v, h.type)).join('')}</select>`)}
    ${field('Comes up every (days)', `<input id="f-freq" type="number" min="1" max="60" value="${h.freq}">`)}
    ${field('Energy needed', `<select id="f-level">${opt(1, 'Low', h.level)}${opt(2, 'Medium', h.level)}${opt(3, 'High', h.level)}</select>`)}
    ${field('XP', `<input id="f-xp" type="number" min="1" max="100" value="${h.xp}">`)}
    ${field('Gentle version', `<input id="f-gentle" type="text" value="${esc(h.gentle)}" maxlength="60">`)}
    ${field('Detail choices (separate with commas)', `<input id="f-options" type="text" value="${esc(h.options.join(', '))}" maxlength="200">`)}
    ${field('Only show after', `<select id="f-after">${opt('', 'Nothing, show it any time', h.after)}${others.map(x => opt(x.id, esc(x.name), h.after)).join('')}</select>`)}
    ${field('Link or file', `<input id="f-link" type="text" value="${esc(h.link)}" maxlength="300" placeholder="https://... or media/stretch.mp3">`)}
    ${field('Notes or routine', `<textarea id="f-notes" rows="5">${esc(h.notes)}</textarea>`)}
    <label class="check"><input id="f-core" type="checkbox"${h.core ? ' checked' : ''}> Core habit (always suggested first)</label>
    <label class="check"><input id="f-paused" type="checkbox"${h.paused ? ' checked' : ''}> Pause this habit</label>
    <div class="btn-row">
      <button class="btn primary" data-act="save-habit">Save</button>
      <button class="btn" data-act="cancel-edit">Cancel</button>
    </div>
    ${isNew ? '' : `<div class="danger"><button class="btn danger-btn" data-act="delete-habit" data-id="${h.id}">Delete this habit</button></div>`}
  </section>`;
}

// ---------------- SHEETS (pop-up panels) and TOAST ----------------
function openSheet(html, name) {
  ui.sheet = name;
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-back" data-act="close-sheet"></div><div class="sheet-card" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
}
function closeSheet() { ui.sheet = null; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }

function openOptionsSheet(h) {
  openSheet(`<h2>${esc(h.name)}</h2>
    <div class="chips">${h.options.map(o => `<button class="chip" data-act="pick-option" data-id="${h.id}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" data-act="pick-option" data-id="${h.id}" data-val="">Just tick it</button>
    <button class="btn" data-act="close-sheet">Not yet</button></div>`, 'options');
}

// The water pop-up: how today's amount is worked out
function openDataSheet() {
  const d = state.days[ui.date] || {};
  openSheet(`<h2>Water today</h2>
    <p class="small">${prettyDate(ui.date)}${d.hcAt ? `. Apple Health synced at ${clock(d.hcAt)}` : ''}</p>
    <div id="water-box"></div>
    <div class="grid3">
      ${field('Steps', `<input type="number" inputmode="numeric" min="0" data-field="steps" value="${d.steps || ''}">`)}
      ${field('Heart rate', `<input type="number" inputmode="numeric" min="0" data-field="hr" placeholder="avg bpm" value="${d.hr || ''}">`)}
      ${field('Temp \u00b0C', `<input type="number" inputmode="decimal" step="0.5" data-field="temp" value="${d.temp == null ? '' : d.temp}">`)}
    </div>
    <div class="btn-row"><button class="btn small" data-act="fetch-weather">Use today\u2019s forecast</button><span class="small" id="wx-status"></span></div>
    <button class="btn primary wide" data-act="close-sheet">Done</button>`, 'data');
  refreshWaterBox();
}

function refreshWaterBox() {
  const box = $('#water-box'); if (!box) return;
  const d = state.days[ui.date] || {}, plan = waterPlan(ui.date), have = waterTotal(d), g = CONFIG.glassMl;
  box.innerHTML = `<div class="plan">
    <p class="plan-target"><strong>${num(plan.target)} ml</strong> for today</p>
    <ul class="plain parts">${plan.parts.map(p => `<li><span>${p.label}${p.basis ? ` <em>${esc(p.basis)}</em>` : ''}</span><span>${p.add ? (p.ml ? '+' + num(p.ml) + ' ml' : '0') : num(p.ml) + ' ml'}</span></li>`).join('')}</ul>
    <div class="bar" style="--p:${Math.min(100, Math.round(100 * have / (plan.target || 1)))}%"></div>
    <p class="small">${num(have)} of ${num(plan.target)} ml${d.waterHealth ? `. Bottle ${num(d.waterHealth)}, added by hand ${num(d.waterMl || 0)}` : ''}</p>
    <div class="btn-row">
      <button class="btn small" data-act="water-add" data-ml="100">+100</button>
      <button class="btn small" data-act="water-add" data-ml="${g}">+${g}</button>
      <button class="btn small" data-act="water-add" data-ml="500">+500</button>
      <button class="btn small ghost" data-act="water-add" data-ml="${-g}">Undo ${g}</button>
    </div>
  </div>`;
}

let toastTimer;
function toast(lines) {
  const el = $('#toast');
  el.innerHTML = [].concat(lines).map(l => `<p>${esc(l)}</p>`).join('');
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}


/* ---------------------------------------------------------------------
   10. EVENTS   one listener for all taps: buttons carry data-act="..."
   --------------------------------------------------------------------- */
async function fetchWeather() {
  const s = state.settings, status = () => $('#wx-status'), say = t => { if (status()) status().textContent = t; };
  try {
    if (s.lat == null) {
      say('Asking for a rough location...');
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 3600000 }));
      s.lat = Math.round(pos.coords.latitude * 10) / 10;   // rounded to roughly 10 km on purpose
      s.lon = Math.round(pos.coords.longitude * 10) / 10;
      touchMeta(); save();
    }
    say('Checking the forecast...');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&daily=temperature_2m_max&timezone=auto&forecast_days=1`);
    const t = (await r.json()).daily.temperature_2m_max[0];
    mutate(() => { const dd = day(ui.date, true); dd.temp = round1(t); dd.tempOn = todayStr(); });
    const input = document.querySelector('[data-field="temp"]'); if (input) input.value = round1(t);
    say(`Forecast high ${Math.round(t)}\u00b0C`);
  } catch (e) {
    console.warn(e);
    say('Could not get the forecast. You can type the temperature in.');
  }
}

function saveHabit() {
  const v = id => document.getElementById(id);
  const name = v('f-name').value.trim();
  if (!name) return toast('Give it a name first.');
  const data = {
    name, cat: v('f-cat').value, type: v('f-type').value,
    freq: Math.max(1, parseInt(v('f-freq').value, 10) || 1),
    level: parseInt(v('f-level').value, 10), xp: Math.max(1, parseInt(v('f-xp').value, 10) || 10),
    gentle: v('f-gentle').value.trim(),
    options: v('f-options').value.split(',').map(x => x.trim()).filter(Boolean),
    after: v('f-after').value, link: v('f-link').value.trim(), notes: v('f-notes').value.trim(),
    core: v('f-core').checked, paused: v('f-paused').checked,
  };
  if (ui.editId === 'new') state.habits.push({ id: 'h' + Date.now().toString(36), ...data });
  else Object.assign(habitById(ui.editId), data);
  touchMeta(); syncAuto(ui.date); save(); ui.editId = null; render(); toast('Saved.');
}

async function cloudSignIn() {
  const val = id => document.getElementById(id).value.trim();
  cloud.cfg.url = cleanUrl(val('c-url')); cloud.cfg.key = val('c-key'); cloud.cfg.email = val('c-email');
  const pw = document.getElementById('c-pass').value;
  if (!cloud.cfg.url || !cloud.cfg.key || !cloud.cfg.email || !pw) { cloud.error = 'Please fill in all four boxes.'; return render(); }
  cloud.error = '';
  try {
    await tokenRequest('password', { email: cloud.cfg.email, password: pw });
    cloudSave(); toast('Signed in.'); await cloudSync();
  } catch (e) { cloud.error = String(e.message || e); cloudSave(); render(); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id, h = id ? habitById(id) : null;

  switch (act) {
    case 'tab': ui.tab = t.dataset.tab; ui.editId = null; render(); window.scrollTo(0, 0); break;
    case 'energy': mutate(() => { day(ui.date, true).energy = t.dataset.val; }); break;
    case 'tick': if (h) handleTick(h, t.dataset.mode); break;
    case 'gentle': if (h) handleTick(h, 'gentle'); break;
    case 'open': ui.openId = ui.openId === id ? null : id; render(); break;
    case 'back-today': ui.date = todayStr(); render(); break;
    case 'pick-day': ui.date = t.dataset.date; ui.tab = 'today'; render(); window.scrollTo(0, 0); break;
    case 'cal-prev': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m - 2, 1, 12)).slice(0, 7); render(); break; }
    case 'cal-next': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m, 1, 12)).slice(0, 7); render(); break; }
    case 'edit': ui.editId = id; ui.folds.habits = true; render(); window.scrollTo(0, 0); break;
    case 'new-habit': ui.editId = 'new'; render(); window.scrollTo(0, 0); break;
    case 'cancel-edit': ui.editId = null; render(); break;
    case 'save-habit': saveHabit(); break;
    case 'delete-habit':
      if (h && confirm(`Delete "${h.name}"? Your history stays, but the habit goes.`)) {
        state.habits = state.habits.filter(x => x.id !== h.id);
        state.habits.forEach(x => { if (x.after === h.id) x.after = ''; });
        touchMeta(); save(); ui.editId = null; render(); toast('Deleted.');
      }
      break;
    case 'pick-option': if (h) { closeSheet(); mutate(() => { completeHabit(ui.date, h, 'full', t.dataset.val); }); } break;
    case 'close-sheet': closeSheet(); break;
    case 'data-sheet': openDataSheet(); break;
    case 'water-add': mutate(() => { const dd = day(ui.date, true); dd.waterMl = Math.max(0, (dd.waterMl || 0) + parseInt(t.dataset.ml, 10)); }); break;
    case 'fetch-weather': fetchWeather(); break;
    case 'cloud-signin': cloudSignIn(); break;
    case 'cloud-sync': cloudSync(); break;
    case 'cloud-signout': cloud.cfg.session = null; cloudSave(); cloud.error = ''; render(); break;
    case 'copy': {
      const text = t.dataset.what === 'url' ? `${cloud.cfg.url}/rest/v1/hub_inbox` : cloud.cfg.key;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Copied.'), () => toast('Could not copy. Select and copy it by hand.'));
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `healthy-hub-backup-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      break;
    }
    case 'import': $('#import-file').click(); break;
  }
});

// Typing in boxes: saved when you leave the box ("change" event)
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'import-file' && t.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.habits || !data.days) throw new Error('Not a backup');
        state = migrate(data); touchMeta(); save(); render(); toast('Backup restored.');
      } catch (err) { toast('That file did not look like a Healthy Hub backup.'); }
    };
    reader.readAsText(t.files[0]);
  } else if (t.dataset.field) {
    const f = t.dataset.field;
    mutate(() => {
      const dd = day(ui.date, true);
      if (f === 'steps') dd.steps = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'hr') dd.hr = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'temp') { dd.temp = t.value === '' ? null : parseFloat(t.value); dd.tempOn = todayStr(); }
    });
  } else if (t.dataset.setting) {
    const v = parseFloat(t.value);
    if (!isNaN(v)) { state.settings[t.dataset.setting] = v; touchMeta(); }
    mutate(() => {});
  }
});

window.addEventListener('hashchange', handleHash);

// "toggle" doesn't bubble, so we listen in the capture phase
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.fold) ui.folds[e.target.dataset.fold] = e.target.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

// If the app is left open, move on to a new day and catch up with your other devices
let lastToday = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (lastToday !== todayStr()) { if (ui.date === lastToday) ui.date = todayStr(); lastToday = todayStr(); render(); }
  if (cloudReady() && Date.now() - cloud.last > 60000) cloudSync();
  autoWeather();
});


/* ---------------------------------------------------------------------
   11. START-UP
   --------------------------------------------------------------------- */
state = load();
saveLocal();
render();
handleHash();
if (cloudReady()) cloudSync();
autoWeather();

// Handy for learning and debugging: type "gg" in the browser console
window.gg = { get state() { return state; }, get cloud() { return cloud; }, totalXp, streakInfo, waterPlan, overdue, levelInfo, applyHealth, applyInbox, mergeStates, ui };
