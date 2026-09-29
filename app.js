'use strict';

/* =====================================================================
   HEALTHY HUB  -  app.js
   Your data is saved in this browser. If you switch on sync (Settings),
   a private copy is also kept in your own Supabase project so your phone
   and laptop match, and Apple Health data can arrive through
   Health Auto Export.

   Map of this file:
     1. CONFIG        numbers you might want to tweak
     2. DEFAULTS      categories, buddy species, slots, starting habits
     3. SAVING        loading, saving, migrating older data
     4. DATES         helpers for days and schedules
     5. BRAINS        XP, levels, streaks, overdue scores, water, buddy
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
  storageKey: 'healthyHub.v2',
  cloudKey: 'healthyHub.cloud',

  // Three energy states. "goal" is the XP that counts as a good day (shown on Calendar).
  // "maxLevel" is the hardest habits suggested (1 easy, 2 medium, 3 high energy).
  energy: {
    green: { label: 'Good energy', goal: 120, maxLevel: 3 },
    amber: { label: 'Steady',      goal: 80,  maxLevel: 2 },
    rest:  { label: 'Rest',        goal: 0,   maxLevel: 1 },
  },

  // How many non-core habits are suggested at once (rest days only ever show core)
  maxSuggested: { green: 7, amber: 5 },

  dailyBonusXp: 25,    // extra XP when you meet the day's goal
  gentleFactor: 0.6,   // the auto-generated easier tier earns 60% of the full XP
  buddyBonus: 0.5,     // extra XP your buddy gets when the habit matches their type
  levelBase: 30,       // level L starts at 30 x L x (L-1) xp: 0, 60, 180, 360, 600...
  glassMl: 250,        // size of the "+250" water button

  praise: ['Lovely.', 'Nicely done.', 'Good going.', 'Well done.', 'That counts.'],
};

// Where a buddy or resting critter can live in the woodland
const SLOTS = ['Meadow', 'Pond', 'Hollow Tree', 'Burrow', 'Thicket', "Owl's Perch", 'Riverbank'];
// The three categories offered as starter choices (like a classic starter trio)
const STARTERS = ['body', 'move', 'water'];


/* ---------------------------------------------------------------------
   2. DEFAULTS   (only used the first time. After that, your saved
      habits live in your browser and the edit screens change those.)
   --------------------------------------------------------------------- */
const CATEGORIES = [
  { id: 'body',     name: 'Body care',          emoji: '🦔', critter: 'Thistle' },
  { id: 'move',     name: 'Movement',           emoji: '🦊', critter: 'Bramble' },
  { id: 'water',    name: 'Water',              emoji: '🦦', critter: 'Ripple' },
  { id: 'sleep',    name: 'Sleep',              emoji: '🐭', critter: 'Nutmeg' },
  { id: 'calm',     name: 'Calm and nature',    emoji: '🐦', critter: 'Willow' },
  { id: 'mind',     name: 'Mind and courage',   emoji: '🦉', critter: 'Hazel' },
  { id: 'social',   name: 'Screens and people', emoji: '🐇', critter: 'Clover' },
  { id: 'unsorted', name: 'Unsorted',           emoji: '📥', critter: null },
];
const buddyCategories = () => CATEGORIES.filter(c => c.critter);

const DEFAULT_SETTINGS = {
  stepGoal: 3000, exerciseGoal: 20, standGoal: 6, sleepGoal: 7,   // used by the automatic habits
  waterBase: 1500,   // ml
  avgHr: 75,         // your typical average heart rate, for the water calculation
  graceDays: 1,      // spare days that don't break a streak
  lat: null, lon: null,
};

// How each habit gets ticked
const TYPES = {
  check:    'By hand (or an app sending data in)',
  steps:    'Steps (Apple Health)',
  exercise: 'Exercise minutes (Apple Health)',
  stand:    'Standing hours (Apple Health)',
  sleep:    'Sleep hours (Apple Health)',
  water:    'Water (Apple Health + calculated)',
};

// A helper that fills in the boring bits so the list below stays readable.
// freq: how often it should come up, in days.  level: energy needed 1-3.
// after: a habit that must be done first.  core: always suggested first.
// days: weekdays it's allowed to appear (1=Mon..7=Sun), empty = any day.
// timeStart/timeEnd: "HH:MM" window it's allowed to appear in, both or neither.
// companions: other habit ids that tick automatically alongside this one.
// workoutMatch: comma-separated words matched against Apple Health workout names.
const H = (id, name, cat, o = {}) => ({
  id, name, cat, type: 'check', freq: 1, level: 1, xp: 10,
  gentle: '', tiers: [], options: [], after: '', link: '', notes: '',
  days: [], timeStart: '', timeEnd: '', companions: [], workoutMatch: '',
  core: false, paused: false, ...o,
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
    workoutMatch: 'walk,walking,hik',
    options: ['Around the house', 'Garden', 'Short local walk', 'Longer walk'] }),
  H('pt', 'Physio (PT)', 'move', { level: 2, xp: 20, gentle: 'Just one exercise',
    workoutMatch: 'strength,functional,core training,flexibility,cooldown' }),
  H('stretch', 'Stretching', 'move', { gentle: 'One stretch, anywhere' }),
  H('stand', 'Standing hours', 'move', { type: 'stand' }),

  // Water — one tracker, shown as the tree on Today
  H('water', 'Water', 'water', { type: 'water', xp: 20 }),

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
    version: 3,
    startDate: todayStr(),
    metaAt: Date.now(),                       // when habits or settings last changed (for syncing)
    settings: { ...DEFAULT_SETTINGS },
    habits: DEFAULT_HABITS.map(h => ({ ...h, options: [...h.options], days: [...h.days], companions: [...h.companions], tiers: [] })),
    // days['2026-09-19'] = { energy, steps, hr, temp, waterMl (added by hand), waterHealth (from Apple Health),
    //                        exerciseMin, standHr, sleepHr, workouts:[{name,ts}], done:{habitId:{xp,mode,detail,cat}}, mt }
    days: {},
    milestones: {},
    buddy: null,                 // category id of your current buddy, e.g. "body"
    critters: {},                // { catId: { xp, home } } — every critter you've obtained
    buddySwapTokens: 0,          // earned at streak milestones, spent when you switch buddy
    mystery: null,                // { pool: [catId, catId, catId] } — a pending mystery unlock
  };
}

function migrate(s) {
  const f = freshState();
  s.settings = { ...f.settings, ...(s.settings || {}) };
  s.habits = Array.isArray(s.habits) && s.habits.length ? s.habits : f.habits;
  s.habits.forEach(h => {
    if (!Array.isArray(h.tiers)) h.tiers = [];
    if (!Array.isArray(h.days)) h.days = [];
    if (!Array.isArray(h.companions)) h.companions = [];
    if (h.timeStart == null) h.timeStart = '';
    if (h.timeEnd == null) h.timeEnd = '';
    if (h.workoutMatch == null) h.workoutMatch = '';
  });
  // Older saves had two water habits ("Basic water" + "Smart water"). Keep one.
  const oldSmart = s.habits.find(h => h.type === 'smartwater');
  const oldBasic = s.habits.find(h => h.id === 'water' && h.type === 'water' && h !== oldSmart);
  if (oldSmart) {
    oldSmart.id = 'water'; oldSmart.type = 'water'; oldSmart.name = 'Water';
    s.habits = s.habits.filter(h => !(h.type === 'water' && h !== oldSmart));
  } else if (oldBasic) {
    oldBasic.name = 'Water';
  }
  s.days = s.days || {};
  // Older saves had a fourth energy state ("red", low-but-not-resting) that no
  // longer exists now there are only Good/Steady/Rest. Fold it into Steady so
  // those days keep their logged habits and don't vanish or crash the lookup.
  for (const date in s.days) {
    const en = s.days[date].energy;
    if (en && !CONFIG.energy[en]) s.days[date].energy = 'amber';
  }
  s.milestones = s.milestones || {};
  s.startDate = s.startDate || f.startDate;
  s.metaAt = s.metaAt || 0;
  s.buddy = s.buddy || null;
  s.critters = s.critters || {};
  s.buddySwapTokens = s.buddySwapTokens || 0;
  s.mystery = s.mystery || null;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) return migrate(JSON.parse(raw));
    // one-time upgrade from the older single-buddy-less save format
    const old = localStorage.getItem('healthyHub.v1');
    if (old) return migrate(JSON.parse(old));
  } catch (e) { console.warn('Could not load saved data', e); }
  return freshState();
}

function saveLocal() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); }
  catch (e) { console.warn(e); toast('Could not save — is private browsing on?'); }
}
// save() also schedules a sync to your other devices, if that is switched on
function save() { saveLocal(); schedulePush(); }
const touchMeta = () => { state.metaAt = Date.now(); };


/* ---------------------------------------------------------------------
   4. DATES
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
const weekdayNow = () => (new Date().getDay() + 6) % 7 + 1;      // 1=Mon .. 7=Sun
const timeNow = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const hasSchedule = h => (h.days && h.days.length) || (h.timeStart && h.timeEnd);
function inSchedule(h) {
  if (h.days && h.days.length && !h.days.includes(weekdayNow())) return false;
  if (h.timeStart && h.timeEnd) { const t = timeNow(); if (t < h.timeStart || t > h.timeEnd) return false; }
  return true;
}
const scheduleText = h => {
  const days = h.days && h.days.length ? h.days.map(n => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n - 1]).join(', ') : '';
  const time = h.timeStart && h.timeEnd ? `${h.timeStart}–${h.timeEnd}` : '';
  return [days, time].filter(Boolean).join(', ');
};


/* ---------------------------------------------------------------------
   5. BRAINS
   --------------------------------------------------------------------- */
const habitById = id => state.habits.find(h => h.id === id);
const activeHabits = () => state.habits.filter(h => !h.paused);
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];

// Get (or create) the record for a day. Creating one stamps it "changed now" for syncing.
function day(date, create) {
  let d = state.days[date];
  if (!d && create) d = state.days[date] = { energy: null, steps: 0, hr: 0, temp: null, waterMl: 0, done: {}, workouts: [] };
  if (d && create) d.mt = Date.now();
  return d;
}

const waterTotal = d => ((d && d.waterHealth) || 0) + ((d && d.waterMl) || 0);
// Falls back to 'amber' for a missing day AND for any energy value that isn't
// one of the three current states (belt-and-braces alongside the migrate() remap).
const energyOf = date => { const en = state.days[date] && state.days[date].energy; return en && CONFIG.energy[en] ? en : 'amber'; };
const goalFor = date => CONFIG.energy[energyOf(date)].goal;
const dayXp = date => { const d = state.days[date]; return d ? Object.values(d.done).reduce((s, x) => s + x.xp, 0) : 0; };
const goalMet = date => energyOf(date) !== 'rest' && dayXp(date) > 0 && dayXp(date) >= goalFor(date);
// A day "counts" for streaks if you met your goal or rested on purpose
const dayOk = date => { const d = state.days[date]; return !!d && (d.energy === 'rest' || goalMet(date)); };

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
  return { last, ds, score };
}
// How long since ANY habit in a category was done — used to nudge neglected categories up the list
function categoryGapDays(catId, asOf) {
  let last = null;
  for (const d in state.days) {
    if (d > asOf) continue;
    for (const id in state.days[d].done) if (state.days[d].done[id].cat === catId && (!last || d > last)) last = d;
  }
  return last ? daysBetween(last, asOf) : 21;
}

function levelInfo(xp, base) {
  let level = 1;
  while (xp >= base * (level + 1) * level) level++;
  const start = base * level * (level - 1), next = base * (level + 1) * level;
  return { level, into: xp - start, span: next - start, pct: (xp - start) / (next - start) };
}

// ---- Your buddy: the one critter earning XP right now
const buddyCritter = () => state.buddy ? state.critters[state.buddy] : null;
function creditBuddy(xp, cat) {
  if (!state.buddy) return;
  const c = state.critters[state.buddy];
  if (!c) return;
  const bonus = cat === state.buddy ? Math.round(xp * CONFIG.buddyBonus) : 0;
  c.xp = Math.max(0, c.xp + xp + bonus);
}
function debitBuddy(xp, cat) { creditBuddy(-xp, cat === state.buddy ? -1 : cat); }
// (debit never re-adds the type bonus, since that's a small kindness, not a loophole worth guarding against)

// ---- Smart water: a rough guide from steps, heart rate, exercise and the weather
function waterPlan(date) {
  const d = state.days[date] || {}, s = state.settings;
  const steps = d.steps || 0, hr = d.hr || 0, temp = d.temp, exMin = d.exerciseMin || 0;
  const stepsMl = Math.min(600, Math.round(Math.max(0, steps - 2000) / 1000 * 2) * 50);        // +100 ml per 1,000 steps over 2,000
  const hrMl = hr ? Math.min(300, Math.floor(Math.max(0, hr - (s.avgHr || 75)) / 5) * 50) : 0;  // +50 ml per 5 bpm above your average
  const exMl = Math.min(400, Math.round(exMin / 10) * 30);                                     // +30 ml per 10 minutes of exercise
  const tempMl = temp != null && temp > 20 ? Math.min(500, Math.round(temp - 20) * 50) : 0;     // +50 ml per degree over 20
  const parts = [
    { label: 'Base amount', basis: '', ml: s.waterBase },
    { label: 'Steps', basis: steps ? `${num(steps)} so far` : 'not recorded yet', ml: stepsMl, add: true },
    { label: 'Heart rate', basis: hr ? `average ${hr} bpm` : 'not recorded yet', ml: hrMl, add: true },
    { label: 'Exercise', basis: exMin ? `${exMin} min` : 'not recorded yet', ml: exMl, add: true },
    { label: 'Weather', basis: temp != null ? `${temp}°C high` : 'not recorded yet', ml: tempMl, add: true },
  ];
  if (d.energy === 'rest') {
    const boost = Math.round(s.waterBase * 0.25 / 50) * 50;
    parts.push({ label: 'Resting today', basis: 'you may need a bit more', ml: boost, add: true });
  }
  const yd = state.days[addDays(date, -1)];
  if (yd && waterTotal(yd) > 0 && waterTotal(yd) < s.waterBase * 0.7) {
    parts.push({ label: 'Yesterday was low', basis: 'a little catch-up', ml: 300, add: true });
  }
  const target = Math.round(parts.reduce((t, p) => t + p.ml, 0) / 50) * 50;
  return { target, parts };
}

// ---- Habits that fill themselves in from Apple Health data
function autoInfo(h, date) {
  const d = state.days[date] || {}, s = state.settings;
  switch (h.type) {
    case 'steps':    return { have: d.steps || 0,       need: s.stepGoal,     unit: 'steps' };
    case 'exercise': return { have: d.exerciseMin || 0, need: s.exerciseGoal, unit: 'min' };
    case 'stand':    return { have: d.standHr || 0,      need: s.standGoal,    unit: 'hours' };
    case 'sleep':    return { have: d.sleepHr || 0,      need: s.sleepGoal,    unit: 'hours' };
    case 'water':    return { have: waterTotal(d),       need: waterPlan(date).target, unit: 'ml' };
  }
  return null;
}
const fmtAmount = n => num(round1(n));

// ---- The tiers of a habit, easiest first. Falls back to a simple two-step
// version from the "gentle" text, or just the habit itself if neither is set.
function tiersOf(h) {
  if (Array.isArray(h.tiers) && h.tiers.length) return h.tiers;
  if (h.gentle) return [{ label: h.gentle, xp: Math.max(1, Math.round(h.xp * CONFIG.gentleFactor)) }, { label: h.name, xp: h.xp }];
  return [{ label: h.name, xp: h.xp }];
}

// ---- Milestones: one-off XP bonuses from running totals
function lifetimeTotals() {
  let steps = 0, water = 0, done = 0;
  for (const date in state.days) { const d = state.days[date]; steps += d.steps || 0; water += waterTotal(d); done += Object.keys(d.done).length; }
  return { steps, waterL: Math.floor(water / 1000), done };
}
function milestoneList() {
  const st = streakInfo(), t = lifetimeTotals(), out = [];
  [[3, 30], [7, 50], [14, 80], [30, 150], [60, 250], [100, 400]].forEach(([n, xp]) =>
    out.push({ id: 'streak' + n, label: `${n}-day streak`, xp, have: st.best, need: n, streak: true }));
  [[25000, 50], [100000, 100], [250000, 150], [500000, 250], [1000000, 500]].forEach(([n, xp]) =>
    out.push({ id: 'steps' + n, label: `${num(n)} steps in total`, xp, have: t.steps, need: n }));
  [[25, 50], [100, 100], [250, 150]].forEach(([n, xp]) =>
    out.push({ id: 'water' + n, label: `${n} litres of water`, xp, have: t.waterL, need: n }));
  [[50, 50], [100, 80], [250, 120], [500, 200], [1000, 300]].forEach(([n, xp]) =>
    out.push({ id: 'done' + n, label: `${num(n)} habits ticked`, xp, have: t.done, need: n }));
  return out;
}
// Checking milestones can grant buddy-swap tokens and start a mystery unlock.
function checkMilestones() {
  const msgs = [];
  for (const m of milestoneList()) {
    if (m.have >= m.need && !state.milestones[m.id]) {
      state.milestones[m.id] = { date: todayStr(), xp: m.xp, label: m.label };
      msgs.push(`Milestone: ${m.label}`);
      state.buddySwapTokens++;
      if (m.streak && !state.mystery) {
        const remaining = buddyCategories().map(c => c.id).filter(id => !state.critters[id]);
        if (remaining.length) {
          const pool = [];
          const pickFrom = [...remaining];
          while (pool.length < Math.min(3, remaining.length)) pool.push(pickFrom.splice(Math.floor(Math.random() * pickFrom.length), 1)[0]);
          state.mystery = { pool };
          msgs.push('A mystery animal is waiting in the Woodland');
        }
      }
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
    if (met && !d.done[h.id]) { d.done[h.id] = { xp: h.xp, mode: 'auto', detail: '', cat: h.cat, ts: Date.now() }; creditBuddy(h.xp, h.cat); }
    if (!met && d.done[h.id] && d.done[h.id].mode === 'auto') { debitBuddy(d.done[h.id].xp, h.cat); delete d.done[h.id]; }
  }
  // Apple Health workout names can also auto-complete a matching habit (e.g. a walk or strength session)
  if (d.workouts && d.workouts.length) {
    for (const h of activeHabits()) {
      if (!h.workoutMatch || d.done[h.id]) continue;
      const words = h.workoutMatch.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      if (d.workouts.some(w => words.some(word => (w.name || '').toLowerCase().includes(word)))) {
        d.done[h.id] = { xp: h.xp, mode: 'auto', detail: 'From a workout', cat: h.cat, ts: Date.now() };
        creditBuddy(h.xp, h.cat);
      }
    }
  }
}

// completes a habit at a given tier index (0 = easiest). Also ticks any linked companions.
function completeHabit(date, habit, tierIdx, detail, _seen) {
  const seen = _seen || new Set();
  if (seen.has(habit.id)) return 0;
  seen.add(habit.id);
  const d = day(date, true);
  const tiers = tiersOf(habit), t = tiers[Math.min(tierIdx || 0, tiers.length - 1)];
  const xp = t.xp;
  d.done[habit.id] = { xp, mode: tierIdx ? 'tier' : 'full', detail: detail || (tiers.length > 1 ? t.label : ''), cat: habit.cat, ts: Date.now() };
  creditBuddy(xp, habit.cat);
  (habit.companions || []).forEach(cid => {
    const ch = habitById(cid);
    if (ch && !seen.has(cid) && !(day(date, true).done[cid])) completeHabit(date, ch, 0, '', seen);
  });
  return xp;
}

function uncompleteHabit(date, habitId) {
  const d = day(date, true), entry = d.done[habitId];
  if (!entry) return;
  debitBuddy(entry.xp, entry.cat);
  delete d.done[habitId];
}

function snapshot() {
  const d = state.days[ui.date], b = buddyCritter();
  return { done: d ? Object.keys(d.done) : [], met: goalMet(ui.date), buddyLevel: b ? levelInfo(b.xp, CONFIG.levelBase).level : 0 };
}

// Run a change, then tidy up: sync auto habits, check milestones, save, redraw and cheer.
function mutate(fn) {
  const before = snapshot();
  fn();
  syncAuto(ui.date);
  const after = snapshot();
  const newlyDone = after.done.filter(id => !before.done.includes(id));
  const msgs = [];
  if (newlyDone.length === 1) {
    const h = habitById(newlyDone[0]), x = state.days[ui.date].done[newlyDone[0]];
    if (h) msgs.push(`${pick(CONFIG.praise)} +${x.xp} xp`);
  } else if (newlyDone.length > 1) {
    msgs.push(`${newlyDone.length} habits done`);
  }
  if (after.met && !before.met) msgs.push(`Goal met, +${CONFIG.dailyBonusXp} xp`);
  const mm = checkMilestones();
  if (mm.length) msgs.push(mm[0]);
  const nowLevel = (buddyCritter() ? levelInfo(buddyCritter().xp, CONFIG.levelBase).level : 0);
  if (nowLevel > before.buddyLevel && before.buddyLevel) msgs.push('Your buddy levelled up!');
  save();
  render();
  if (msgs.length) toast(msgs.slice(0, 2));
}

function handleTick(h, tierIdx, forDate) {
  const date = forDate || ui.date, d = state.days[date];
  if (d && d.done[h.id]) return mutate(() => { uncompleteHabit(date, h.id); });
  if (h.type === 'check' && h.options.length) return openOptionsSheet(h, date);
  mutate(() => { completeHabit(date, h, tierIdx || 0); });
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
      if (h && !d.done[h.id]) completeHabit(date, h, 0);
    });
  });
  history.replaceState(null, '', location.pathname + location.search);
}


/* ---------------------------------------------------------------------
   7. APPLE HEALTH   Health Auto Export posts JSON like
      {"data":{"metrics":[{"name":"step_count","units":"count","data":[{"date":"2026-09-19 00:00:00 +0100","qty":5234}]}]}}
      into your Supabase "inbox". We read it here and fill in the day's numbers.
      Workouts (if included) arrive as {"data":{"workouts":[{"name":"Walking","start":"..."}]}}.
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
    const sleep = a.sleepHr != null ? a.sleepHr : a.sleepSeg;
    if (sleep != null) d.sleepHr = round1(sleep);
    d.hcAt = Date.now();
  }
  return Object.keys(acc);
}

function applyWorkouts(workouts) {
  const dates = new Set();
  for (const w of workouts || []) {
    const date = String(w.start || w.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const d = day(date, true);
    d.workouts = d.workouts || [];
    d.workouts.push({ name: w.name || w.type || '', ts: Date.now() });
    dates.add(date);
  }
  return dates;
}

// One message from the inbox. Health Auto Export sends "metrics" (and optionally "workouts").
// Any other service (a Shortcut, a webhook from another app) can send {"data":{"done":["habitid"]}}.
function applyInbox(payload) {
  const data = (payload && payload.data) || payload || {}, dates = new Set();
  if (Array.isArray(data.metrics)) applyHealth(data.metrics).forEach(x => dates.add(x));
  if (Array.isArray(data.workouts)) applyWorkouts(data.workouts).forEach(x => dates.add(x));
  if (Array.isArray(data.done)) {
    const date = data.date || todayStr();
    data.done.forEach(id => { const h = habitById(id); if (h && !(state.days[date] && state.days[date].done[h.id])) completeHabit(date, h, 0); dates.add(date); });
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

// Combine two copies. Each day keeps whichever copy changed last; habits/settings/buddy follow the newer edit.
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

    // 2. Read anything waiting in the inbox (Apple Health, Shortcuts, other apps)
    const inbox = await cloudApi('/rest/v1/hub_inbox?select=id,data&order=id.asc&limit=200');
    if (inbox && inbox.length) {
      const before = doneKeys(), dates = new Set();
      inbox.forEach(row => applyInbox(row.data).forEach(x => dates.add(x)));
      dates.forEach(d => syncAuto(d));
      const msgs = [...doneKeys()].filter(k => !before.has(k) && k.startsWith(todayStr()))
        .map(k => { const h = habitById(k.split('|')[1]); return `${h ? h.name : 'Habit'} done automatically`; });
      msgs.push(...checkMilestones());
      saveLocal();
      await cloudApi(`/rest/v1/hub_inbox?id=in.(${inbox.map(r => r.id).join(',')})`, { method: 'DELETE' });
      if (msgs.length) toast(msgs.slice(0, 2));
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
const ui = {
  folds: {}, tab: 'today', date: todayStr(), openId: null, editId: null, sheet: null,
  calMonth: todayStr().slice(0, 7), calDetail: null, calEdit: false,
  tierIdx: {}, addMulti: false, swapPick: null,
};
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const freqText = h => h.freq === 1 ? 'daily' : `every ${h.freq} days`;
const safeUrl = u => { u = (u || '').trim(); return /^https?:\/\//i.test(u) || /^[\w\-./%]+$/.test(u) ? u : ''; };

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  woodland: '<path d="M12 21v-5"/><path d="M12 16c-4 0-6.5-2.4-6.5-5.4 0-2 1.3-3.6 3-4.1C8.9 4 10.2 2.5 12 2.5s3.1 1.5 3.5 4c1.7.5 3 2.1 3 4.1 0 3-2.5 5.4-6.5 5.4z"/>',
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
function miniRing(pct) {
  const r = 15, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
  return `<svg class="ring-mini" viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="${r}"/>
    <circle class="ring-fg" cx="18" cy="18" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 18 18)"/></svg>`;
}

// A simple pine tree that fills with blue from the bottom as you drink your water
function treeSvg(pct) {
  const p = Math.max(0, Math.min(1, pct)), y = ((1 - p) * 132).toFixed(1);
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
  document.body.dataset.tone = ui.tab === 'today' ? energyOf(todayStr()) : 'calm';
  $('#app').innerHTML = views[ui.tab]();
  const tabs = [['today', 'Today'], ['woodland', 'Woodland'], ['calendar', 'Calendar'], ['settings', 'Settings']];
  $('#nav').innerHTML = tabs.map(([id, label]) =>
    `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></button>`).join('');
  if (ui.sheet === 'data') refreshWaterBox();
}

// ---------------- TODAY ----------------
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function viewToday() {
  const date = todayStr(), d = state.days[date];
  const chosen = d && d.energy, en = energyOf(date), cfg = CONFIG.energy[en];
  const resting = en === 'rest';

  const pebbles = Object.entries(CONFIG.energy).map(([key, c]) =>
    `<button class="pebble e-${key}${chosen === key ? ' on' : ''}" data-act="energy" data-val="${key}" aria-pressed="${chosen === key}"><i></i>${c.label}</button>`).join('');

  const hero = `
    <section class="hero">
      <p class="hello"><span>${greeting()}</span><span class="date">${prettyDate(date)}</span></p>
      <h1 class="q">${chosen ? 'Your energy' : 'How is your energy today?'}</h1>
      <div class="pebbles" role="group" aria-label="Energy for the day">${pebbles}</div>
    </section>`;

  // Auto habits (steps, exercise, standing, sleep) get their own section with a small ring each
  const autos = activeHabits().filter(h => h.type !== 'water' && autoInfo(h, date));
  const autoSection = autos.length ? `<section class="panel"><h2>Auto-tracked</h2><div class="auto-grid">${autos.map(h => {
    const a = autoInfo(h, date), pct = a.need ? a.have / a.need : 0, met = a.have >= a.need && a.have > 0;
    return `<div class="auto-item${met ? ' met' : ''}">${miniRing(pct)}<div><p class="auto-name">${esc(h.name)}</p><p class="small">${fmtAmount(a.have)} / ${fmtAmount(a.need)} ${a.unit}</p></div></div>`;
  }).join('')}</div></section>` : '';

  // Sort remaining (non-auto, non-water) habits into groups
  const core = [], picks = [], later = [], notDue = [], done = [];
  let hidden = 0;
  for (const h of activeHabits()) {
    if (h.type === 'water' || autoInfo(h, date)) continue;   // shown in the tree / auto section instead
    if (d && d.done[h.id]) { done.push({ h }); continue; }
    if (h.after) { const pre = habitById(h.after); if (pre && !pre.paused && !(d && d.done[pre.id])) { hidden++; continue; } }
    const od = overdue(h, date);
    const scheduleOk = !hasSchedule(h) || inSchedule(h);

    if (resting) {
      if (h.core && scheduleOk) core.push({ h, od });
      continue;   // rest days: only core habits, nothing else is offered
    }
    if (!scheduleOk) { later.push({ h, od }); continue; }
    const canDo = h.level <= cfg.maxLevel;
    const gapBoost = 1 + Math.min(1, categoryGapDays(h.cat, date) / 10);
    const scheduleBoost = hasSchedule(h) && scheduleOk ? 1000 : 0;
    const sortKey = scheduleBoost + od.score * gapBoost;
    if (h.core && canDo) core.push({ h, od, sortKey: 1000000 });
    else if (od.score >= 1) (canDo ? picks : later).push({ h, od, sortKey });
    else notDue.push({ h, od });
  }
  picks.sort((a, b) => b.sortKey - a.sortKey);
  const cap = CONFIG.maxSuggested[en] || 5;
  const shown = resting ? core : core.concat(picks.slice(0, cap));
  const more = resting ? [] : picks.slice(cap).concat(later).sort((a, b) => b.sortKey - a.sortKey);
  if (!resting) notDue.sort((a, b) => b.od.score - a.od.score);

  const list = items => `<ul class="rows">${items.map(x => rowHtml(x.h, x.od, date)).join('')}</ul>`;
  const fold = (key, title, items) => items.length ? `<details class="fold" data-fold="${key}"${ui.folds[key] ? ' open' : ''}><summary>${title} <span class="count">${items.length}</span></summary>${list(items)}</details>` : '';

  let body = waterCard(date) + autoSection;
  if (shown.length) body += `<section class="panel"><h2>Suggested</h2>${list(shown)}</section>`;
  else if (!resting) body += `<section class="panel"><p class="empty">${done.length ? 'Everything suggested is done.' : 'Nothing is due.'}</p></section>`;
  body += fold('more', 'More', more);
  if (done.length) body += `<section class="panel done-panel"><h2>Done</h2>${list(done)}</section>`;
  body += fold('notdue', 'Not due yet', notDue);
  return hero + body;
}

// The tree: fills with blue as you drink. Tap it for today's numbers.
function waterCard(date) {
  const h = activeHabits().find(x => x.type === 'water');
  if (!h) return '';
  const d = state.days[date], plan = waterPlan(date), have = waterTotal(d), pct = plan.target ? Math.min(1, have / plan.target) : 0;
  const entry = d && d.done[h.id];
  return `<button class="panel water-card" data-act="data-sheet" aria-label="Water today. Tap for how it is worked out">
    ${treeSvg(pct)}
    <div class="wc-text">
      <p class="small">Water</p>
      <p class="big">${num(have)} of ${num(plan.target)} ml</p>
      <p class="small">${Math.round(pct * 100)}%${entry ? `, +${entry.xp} xp` : ''}</p>
    </div>
  </button>`;
}

function rowHtml(h, od, date) {
  const d = state.days[date], entry = d && d.done[h.id], open = ui.openId === h.id;
  const link = safeUrl(h.link), hasMore = !!(h.notes || link);
  const tiers = tiersOf(h), idx = Math.min(ui.tierIdx[h.id] || 0, tiers.length - 1), tier = tiers[idx];
  let meta = '';

  if (entry) {
    meta = entry.detail || 'Done';
  } else if (od && od.last) {
    meta = od.ds === 0 ? 'Done today' : od.ds === 1 ? 'Last done yesterday' : `Last done ${od.ds} days ago`;
  }
  if (entry) meta += `, +${entry.xp} xp`;
  const sched = hasSchedule(h) ? `<span class="lvl-tag">${esc(scheduleText(h))}</span>` : '';
  const tag = !entry && h.level >= 2 ? `<span class="lvl-tag l${h.level}">${h.level === 2 ? 'Medium' : 'High'} energy</span>` : '';
  const title = entry ? esc(h.name) : esc(tier.label);
  const nameEl = hasMore
    ? `<button class="row-name" data-act="open" data-id="${h.id}" aria-expanded="${open}">${title}</button>`
    : `<span class="row-name">${title}</span>`;
  const nextTier = !entry && idx < tiers.length - 1
    ? `<button class="gentle" data-act="tier-next" data-id="${h.id}">Next: ${esc(tiers[idx + 1].label)}</button>` : '';

  let more = '';
  if (open && hasMore) {
    const media = !link ? '' : /\.(mp3|m4a|wav|ogg|aac)$/i.test(link)
      ? `<audio controls preload="none" src="${esc(link)}"></audio>`
      : `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Open guide or recording</a>`;
    more = `<div class="more">${h.notes ? `<p class="notes">${esc(h.notes)}</p>` : ''}${media}</div>`;
  }

  return `<li class="row${entry ? ' is-done' : ''}" style="--cat:var(--c-${h.cat})">
    <button class="tick" data-act="tick" data-id="${h.id}" data-tier="${idx}" aria-label="${entry ? 'Undo' : 'Mark done'}: ${title}">${entry ? CHECK : ''}</button>
    <div class="row-main">
      ${nameEl}
      ${meta || tag || sched ? `<span class="row-meta">${meta}${tag}${sched}</span>` : ''}
      ${nextTier}
    </div>
    ${more}
  </li>`;
}

// ---------------- WOODLAND (buddy critters) ----------------
function viewWoodland() {
  if (!state.buddy) return viewStarterPick();
  if (state.mystery) return viewMystery();

  const buddy = state.critters[state.buddy], lvl = levelInfo(buddy.xp, CONFIG.levelBase);
  const buddyCat = catOf(state.buddy);
  const others = Object.keys(state.critters).filter(id => id !== state.buddy);

  const slotsHtml = SLOTS.map(slot => {
    const ownerId = Object.keys(state.critters).find(id => state.critters[id].home === slot);
    if (!ownerId) return `<div class="slot empty">${esc(slot)}<span class="small">Empty</span></div>`;
    const c = catOf(ownerId), cl = levelInfo(state.critters[ownerId].xp, CONFIG.levelBase);
    return `<div class="slot${ownerId === state.buddy ? ' is-buddy' : ''}">
      <span class="slot-emoji">${c.emoji}</span>
      <span class="slot-name">${esc(c.critter)}</span>
      <span class="small">${slot} · Lvl ${cl.level}${ownerId === state.buddy ? ' · Buddy' : ' · Resting'}</span>
    </div>`;
  }).join('');

  const homeless = Object.keys(state.critters).filter(id => !state.critters[id].home);
  const homelessHtml = homeless.length ? `<section class="panel">
    <h2>Choose a home</h2>
    ${homeless.map(id => {
      const c = catOf(id), free = SLOTS.filter(s => !Object.values(state.critters).some(cr => cr.home === s));
      return `<div class="home-pick"><span>${c.emoji} ${esc(c.critter)}</span>
        <select data-act="set-home" data-id="${id}"><option value="">Pick a spot…</option>${free.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div>`;
    }).join('')}
  </section>` : '';

  const swapHtml = others.length ? `<div class="btn-row">
    <button class="btn${state.buddySwapTokens > 0 ? ' primary' : ''}" data-act="open-swap" ${state.buddySwapTokens > 0 ? '' : 'disabled'}>Switch buddy</button>
    <span class="small">${state.buddySwapTokens} swap${state.buddySwapTokens === 1 ? '' : 's'} available</span>
  </div>` : '';

  return `<header class="page-head"><h1>Woodland</h1></header>
    <section class="panel buddy-hero" style="--cat:var(--c-${state.buddy})">
      <div class="buddy-emoji">${buddyCat.emoji}</div>
      <h2>${esc(buddyCat.critter)}</h2>
      <p class="small">Level ${lvl.level} · your buddy</p>
      <div class="bar" style="--p:${Math.round(lvl.pct * 100)}%" aria-hidden="true"></div>
      <p class="small">${num(lvl.span - lvl.into)} xp to level ${lvl.level + 1} · extra xp from ${esc(catOf(state.buddy).name)} habits</p>
      ${swapHtml}
    </section>
    ${homelessHtml}
    <h2 class="sec">Your woodland</h2>
    <div class="slots">${slotsHtml}</div>`;
}

function viewStarterPick() {
  const cards = STARTERS.map(id => {
    const c = catOf(id);
    return `<button class="starter-card" style="--cat:var(--c-${id})" data-act="pick-starter" data-id="${id}">
      <div class="buddy-emoji">${c.emoji}</div><strong>${esc(c.critter)}</strong><span class="small">${esc(c.name)}</span>
    </button>`;
  }).join('');
  return `<header class="page-head"><h1>Woodland</h1></header>
    <section class="panel">
      <p>Pick a buddy to keep you company. They'll grow as you build your habits, with a little extra when you do something from their own category.</p>
      <div class="starters">${cards}</div>
    </section>`;
}

function viewMystery() {
  const revealed = ui._mysteryOpen != null;
  const boxes = state.mystery.pool.map((catId, i) => {
    const c = catOf(catId), isPicked = ui._mysteryOpen === i;
    if (!revealed) return `<button class="mystery-box" data-act="open-mystery" data-idx="${i}">?</button>`;
    return `<div class="mystery-box open${isPicked ? ' picked' : ''}">${c.emoji}<span class="small">${esc(c.critter)}</span>${isPicked ? '<span class="small">Yours!</span>' : ''}</div>`;
  }).join('');
  return `<header class="page-head"><h1>Woodland</h1></header>
    <section class="panel">
      <p>A mystery animal is ready. Pick a box — opening it reveals what was in all three.</p>
      <div class="mystery-row">${boxes}</div>
      ${revealed ? '<button class="btn primary wide" data-act="claim-mystery">Continue</button>' : ''}
    </section>`;
}

function swapSheet() {
  const others = Object.keys(state.critters).filter(id => id !== state.buddy);
  openSheet(`<h2>Switch buddy</h2><p class="small">Uses one of your ${state.buddySwapTokens} swaps.</p>
    <div class="chips">${others.map(id => `<button class="chip" data-act="do-swap" data-id="${id}">${catOf(id).emoji} ${esc(catOf(id).critter)}</button>`).join('')}</div>
    <button class="btn" data-act="close-sheet">Cancel</button>`, 'swap');
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
    cells += `<button class="cell${en ? ' e-' + en : ''}${dayOk(date) ? ' ok' : ''}${date === today ? ' today' : ''}${date === ui.calDetail ? ' picked' : ''}" ${future ? 'disabled' : ''}
      data-act="pick-day" data-date="${date}" aria-label="${prettyDate(date)}${dayOk(date) ? ', goal met or resting' : ''}">
      <span class="dn">${n}</span><span class="bar thin" style="--p:${pct}%"></span></button>`;
  }
  const nextDisabled = ui.calMonth >= today.slice(0, 7);
  const st = streakInfo(), ms = milestoneList();
  const got = ms.filter(m => state.milestones[m.id]);
  const next = ms.filter(m => !state.milestones[m.id]).slice(0, 4);

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
      <p class="legend"><span class="lg e-green"></span>Good <span class="lg e-amber"></span>Steady <span class="lg e-rest"></span>Rest</p>
    </section>
    <section class="panel stats">
      <div><strong>${st.cur}</strong><span>day streak</span></div>
      <div><strong>${st.best}</strong><span>best streak</span></div>
      <div><strong>${met}</strong><span>goals met</span></div>
      <div><strong>${num(xpSum)}</strong><span>xp this month</span></div>
    </section>
    <details class="fold" data-fold="milestones"${ui.folds.milestones ? ' open' : ''}>
      <summary>Milestones <span class="count">${got.length}</span></summary>
      <section class="panel">
        ${got.length ? `<ul class="plain ms">${got.map(m => `<li class="got"><span>${esc(m.label)}</span><span>+${m.xp} xp</span></li>`).join('')}</ul>` : '<p class="empty">Your first milestone is not far away.</p>'}
        ${next.length ? `<h3 class="sub-h">Coming up</h3><ul class="plain ms">${next.map(m => `<li><span>${esc(m.label)}</span><span>${num(Math.min(m.have, m.need))} of ${num(m.need)}</span></li>`).join('')}</ul>` : ''}
      </section>
    </details>
    ${ui.calDetail ? dayDetail(ui.calDetail) : ''}`;
}

function dayDetail(date) {
  const d = state.days[date] || {}, en = d.energy && CONFIG.energy[d.energy] ? d.energy : null, cfg = CONFIG.energy[en || 'amber'], xp = dayXp(date);
  const doneList = d.done ? Object.keys(d.done).map(id => ({ id, h: habitById(id), e: d.done[id] })).filter(x => x.h) : [];
  const pebbles = Object.entries(CONFIG.energy).map(([key, c]) =>
    `<button class="pebble small-pebble e-${key}${en === key ? ' on' : ''}" data-act="cal-energy" data-val="${key}"><i></i>${c.label}</button>`).join('');

  let body;
  if (ui.calEdit) {
    body = `<ul class="rows">${activeHabits().filter(h => h.type === 'check').map(h => {
      const entry = d.done && d.done[h.id];
      return `<li class="row${entry ? ' is-done' : ''}" style="--cat:var(--c-${h.cat})">
        <button class="tick" data-act="cal-toggle" data-id="${h.id}">${entry ? CHECK : ''}</button>
        <div class="row-main"><span class="row-name">${esc(h.name)}</span></div>
      </li>`;
    }).join('')}</ul>`;
  } else {
    body = doneList.length
      ? `<ul class="rows">${doneList.map(x => `<li class="row is-done" style="--cat:var(--c-${x.h.cat})"><span class="tick">${CHECK}</span><div class="row-main"><span class="row-name">${esc(x.h.name)}</span><span class="row-meta">+${x.e.xp} xp</span></div></li>`).join('')}</ul>`
      : '<p class="empty">Nothing logged.</p>';
  }

  return `<section class="panel day-detail">
    <div class="cal-head"><h2>${prettyDate(date)}</h2><button class="mini pencil" data-act="cal-edit-toggle" aria-label="Edit this day">✎</button></div>
    <div class="pebbles small" role="group">${pebbles}</div>
    ${en ? `<p class="small">${num(xp)} of ${num(cfg.goal)} xp${goalMet(date) ? ' — goal met' : ''}</p>` : ''}
    ${body}
  </section>`;
}

// ---------------- SETTINGS (habits, goals, sync, backup) ----------------
const field = (label, inner) => `<label class="field"><span class="lab">${label}</span>${inner}</label>`;
const opt = (v, label, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${label}</option>`;

function viewSettings() {
  if (ui.editId) return viewEdit();
  if (ui.addMulti) return viewAddMulti();
  const s = state.settings;
  const numField = (key, label, min, max, step) => field(label, `<input type="number" data-setting="${key}" min="${min}" max="${max}" step="${step || 1}" value="${s[key]}">`);

  const habitGroups = CATEGORIES.map(c => {
    const list = state.habits.filter(h => h.cat === c.id);
    if (!list.length) return '';
    const rows = list.map(h => c.id === 'unsorted'
      ? `<li class="edit-row unsorted-row">
          <span class="er-name">${esc(h.name)}</span>
          <select data-act="quick-cat" data-id="${h.id}">${opt('', 'Move to…', '')}${CATEGORIES.filter(x => x.id !== 'unsorted').map(x => opt(x.id, esc(x.name), '')).join('')}</select>
          <button class="mini" data-act="edit" data-id="${h.id}" aria-label="Edit">✎</button>
        </li>`
      : `<li><button class="edit-row${h.paused ? ' paused' : ''}" data-act="edit" data-id="${h.id}">
          <span class="dotcat"></span><span class="er-name">${esc(h.name)}${h.core ? ' <em>core</em>' : ''}</span>
          <span class="er-meta">${h.type === 'check' ? freqText(h) : 'auto'}${h.paused ? ', paused' : ''}</span></button></li>`
    ).join('');
    return `<div class="group" style="--cat:var(--c-${c.id})"><h3><span aria-hidden="true">${c.emoji}</span> ${esc(c.name)}</h3><ul class="plain">${rows}</ul></div>`;
  }).join('');

  return `<header class="page-head"><h1>Settings</h1></header>

  <details class="fold" data-fold="habits"${ui.folds.habits ? ' open' : ''}>
    <summary>Habits <span class="count">${state.habits.length}</span></summary>
    <div class="btn-row"><button class="btn primary" data-act="new-habit">Add a habit</button><button class="btn" data-act="add-multi">Add several at once</button></div>
    ${habitGroups}
  </details>

  <details class="fold" data-fold="goals"${ui.folds.goals ? ' open' : ''}>
    <summary>Goals</summary>
    <section class="panel form">
      ${numField('stepGoal', 'Step goal', 100, 30000)}
      ${numField('exerciseGoal', 'Exercise minutes', 5, 300)}
      ${numField('standGoal', 'Standing hours', 1, 16)}
      ${numField('sleepGoal', 'Sleep hours', 3, 14, 0.5)}
      ${numField('waterBase', 'Base water amount (ml)', 500, 5000, 50)}
      ${numField('avgHr', 'Your average heart rate (bpm)', 40, 140)}
      ${field('Spare days for streaks', `<select data-setting="graceDays">${[0, 1, 2, 3].map(n => opt(n, n === 0 ? 'None' : n + (n === 1 ? ' spare day' : ' spare days'), s.graceDays)).join('')}</select>`)}
    </section>
  </details>

  ${cloudPanel()}

  <section class="panel">
    <h2>Back up your data</h2>
    <div class="btn-row"><button class="btn" data-act="export">Download backup</button>
    <button class="btn" data-act="import">Restore from backup</button></div>
    <input id="import-file" type="file" accept="application/json" hidden>
  </section>`;
}

function viewAddMulti() {
  return `<header class="page-head"><h1>Add several habits</h1></header>
  <section class="panel form">
    <p class="small">One habit per line. They'll land in Unsorted so you can quickly move each into the right category.</p>
    ${field('Habit names', `<textarea id="f-multi" rows="8" placeholder="Play piano\nCall a friend\nTidy one drawer"></textarea>`)}
    <div class="btn-row">
      <button class="btn primary" data-act="save-multi">Add them</button>
      <button class="btn" data-act="cancel-multi">Cancel</button>
    </div>
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
  const h = isNew ? H('', '', 'unsorted') : habitById(ui.editId);
  if (!h) { ui.editId = null; return viewSettings(); }
  const others = state.habits.filter(x => x.id !== h.id);
  const tiersText = tiersOf(h).length > 1 || h.tiers.length ? tiersOf(h).map(t => `${t.label}, ${t.xp}`).join('\n') : '';
  const days = [1, 2, 3, 4, 5, 6, 7], dayLabel = n => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n - 1];

  return `<header class="page-head"><h1>${isNew ? 'New habit' : 'Edit habit'}</h1></header>
  <section class="panel form">
    ${field('Name', `<input id="f-name" type="text" value="${esc(h.name)}" maxlength="60">`)}
    ${field('Category', `<select id="f-cat">${CATEGORIES.filter(c => c.id !== 'unsorted' || h.cat === 'unsorted').map(c => opt(c.id, esc(c.name), h.cat)).join('')}</select>`)}
    ${field('How it gets ticked', `<select id="f-type">${Object.entries(TYPES).map(([k, v]) => opt(k, v, h.type)).join('')}</select>`)}
    ${field('Comes up every (days)', `<input id="f-freq" type="number" min="1" max="60" value="${h.freq}">`)}
    ${field('Energy needed', `<select id="f-level">${opt(1, 'Low', h.level)}${opt(2, 'Medium', h.level)}${opt(3, 'High', h.level)}</select>`)}
    ${field('XP (top level)', `<input id="f-xp" type="number" min="1" max="100" value="${h.xp}">`)}
    ${field('Levels, easiest first (optional)', `<textarea id="f-tiers" rows="3" placeholder="Quick brush, 6&#10;Full brush, 10">${esc(tiersText)}</textarea>`, )}
    ${field('Detail choices (separate with commas)', `<input id="f-options" type="text" value="${esc(h.options.join(', '))}" maxlength="200">`)}
    ${field('Only show after', `<select id="f-after">${opt('', 'Nothing, show it any time', h.after)}${others.map(x => opt(x.id, esc(x.name), h.after)).join('')}</select>`)}
    ${field('Tick these too, automatically', `<select id="f-comp" multiple size="5">${others.map(x => `<option value="${x.id}"${h.companions.includes(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
    <div class="field"><span class="lab">Only on these days (optional)</span>
      <div class="day-picks">${days.map(n => `<label class="daychk"><input type="checkbox" id="f-day-${n}"${h.days.includes(n) ? ' checked' : ''}>${dayLabel(n)}</label>`).join('')}</div>
    </div>
    <div class="grid3">
      ${field('From', `<input id="f-time-start" type="time" value="${esc(h.timeStart)}">`)}
      ${field('Until', `<input id="f-time-end" type="time" value="${esc(h.timeEnd)}">`)}
    </div>
    ${field('Link or file', `<input id="f-link" type="text" value="${esc(h.link)}" maxlength="300" placeholder="https://... or media/stretch.mp3">`)}
    ${field('Notes or routine', `<textarea id="f-notes" rows="4">${esc(h.notes)}</textarea>`)}
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

function openOptionsSheet(h, date) {
  openSheet(`<h2>${esc(h.name)}</h2>
    <div class="chips">${h.options.map(o => `<button class="chip" data-act="pick-option" data-id="${h.id}" data-val="${esc(o)}" data-date="${date}">${esc(o)}</button>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" data-act="pick-option" data-id="${h.id}" data-val="" data-date="${date}">Just tick it</button>
    <button class="btn" data-act="close-sheet">Not yet</button></div>`, 'options');
}

// The water pop-up: how today's amount is worked out
function openDataSheet() {
  const d = state.days[todayStr()] || {};
  openSheet(`<h2>Water today</h2>
    <p class="small">${d.hcAt ? `Apple Health synced at ${clock(d.hcAt)}` : ''}</p>
    <div id="water-box"></div>
    <div class="grid3">
      ${field('Steps', `<input type="number" inputmode="numeric" min="0" data-field="steps" value="${d.steps || ''}">`)}
      ${field('Heart rate', `<input type="number" inputmode="numeric" min="0" data-field="hr" placeholder="avg bpm" value="${d.hr || ''}">`)}
      ${field('Temp °C', `<input type="number" inputmode="decimal" step="0.5" data-field="temp" value="${d.temp == null ? '' : d.temp}">`)}
    </div>
    <div class="btn-row"><button class="btn small" data-act="fetch-weather">Use today’s forecast</button><span class="small" id="wx-status"></span></div>
    <button class="btn primary wide" data-act="close-sheet">Done</button>`, 'data');
  refreshWaterBox();
}

function refreshWaterBox() {
  const box = $('#water-box'); if (!box) return;
  const date = todayStr(), d = state.days[date] || {}, plan = waterPlan(date), have = waterTotal(d), g = CONFIG.glassMl;
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
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
      s.lat = Math.round(pos.coords.latitude * 10) / 10;
      s.lon = Math.round(pos.coords.longitude * 10) / 10;
      touchMeta(); save();
    }
    say('Checking the forecast...');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&daily=temperature_2m_max&timezone=auto&forecast_days=1`);
    const t = (await r.json()).daily.temperature_2m_max[0];
    mutate(() => { const dd = day(todayStr(), true); dd.temp = round1(t); dd.tempOn = todayStr(); });
    const input = document.querySelector('[data-field="temp"]'); if (input) input.value = round1(t);
    say(`Forecast high ${Math.round(t)}°C`);
  } catch (e) {
    console.warn(e);
    say('Could not get the forecast. You can type the temperature in.');
  }
}

function saveHabit() {
  const v = id => document.getElementById(id);
  const name = v('f-name').value.trim();
  if (!name) return toast('Give it a name first.');
  const tiers = v('f-tiers').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf(','); const xp = i >= 0 ? parseInt(l.slice(i + 1), 10) : NaN;
    return { label: (i >= 0 ? l.slice(0, i) : l).trim(), xp: isNaN(xp) ? 10 : Math.max(1, xp) };
  });
  const days = [1, 2, 3, 4, 5, 6, 7].filter(n => v('f-day-' + n) && v('f-day-' + n).checked);
  const data = {
    name, cat: v('f-cat').value, type: v('f-type').value,
    freq: Math.max(1, parseInt(v('f-freq').value, 10) || 1),
    level: parseInt(v('f-level').value, 10), xp: Math.max(1, parseInt(v('f-xp').value, 10) || 10),
    tiers, gentle: '',
    options: v('f-options').value.split(',').map(x => x.trim()).filter(Boolean),
    after: v('f-after').value,
    companions: Array.from(v('f-comp').selectedOptions).map(o => o.value),
    days, timeStart: v('f-time-start').value, timeEnd: v('f-time-end').value,
    link: v('f-link').value.trim(), notes: v('f-notes').value.trim(),
    core: v('f-core').checked, paused: v('f-paused').checked,
  };
  if (ui.editId === 'new') state.habits.push({ id: 'h' + Date.now().toString(36), workoutMatch: '', ...data });
  else Object.assign(habitById(ui.editId), data);
  touchMeta(); syncAuto(todayStr()); save(); ui.editId = null; render(); toast('Saved.');
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
    case 'tab': ui.tab = t.dataset.tab; ui.editId = null; ui.addMulti = false; render(); window.scrollTo(0, 0); break;
    case 'energy': mutate(() => { day(todayStr(), true).energy = t.dataset.val; }); break;
    case 'tick': if (h) handleTick(h, parseInt(t.dataset.tier, 10) || 0); break;
    case 'tier-next': ui.tierIdx[id] = (ui.tierIdx[id] || 0) + 1; render(); break;
    case 'open': ui.openId = ui.openId === id ? null : id; render(); break;
    case 'pick-day': ui.calDetail = ui.calDetail === t.dataset.date ? null : t.dataset.date; ui.calEdit = false; render(); break;
    case 'cal-prev': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m - 2, 1, 12)).slice(0, 7); render(); break; }
    case 'cal-next': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m, 1, 12)).slice(0, 7); render(); break; }
    case 'cal-edit-toggle': ui.calEdit = !ui.calEdit; render(); break;
    case 'cal-energy': mutate(() => { day(ui.calDetail, true).energy = t.dataset.val; }); break;
    case 'cal-toggle':
      mutate(() => {
        const dd = day(ui.calDetail, true);
        if (dd.done[id]) uncompleteHabit(ui.calDetail, id); else { const hh = habitById(id); if (hh) completeHabit(ui.calDetail, hh, 0); }
      });
      break;
    case 'edit': ui.editId = id; ui.folds.habits = true; render(); window.scrollTo(0, 0); break;
    case 'new-habit': ui.editId = 'new'; render(); window.scrollTo(0, 0); break;
    case 'cancel-edit': ui.editId = null; render(); break;
    case 'save-habit': saveHabit(); break;
    case 'add-multi': ui.addMulti = true; render(); window.scrollTo(0, 0); break;
    case 'cancel-multi': ui.addMulti = false; render(); break;
    case 'save-multi': {
      const lines = document.getElementById('f-multi').value.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach((name, i) => state.habits.push({ ...H('h' + Date.now().toString(36) + i, name, 'unsorted') }));
      touchMeta(); save(); ui.addMulti = false; render(); toast(`Added ${lines.length} habit${lines.length === 1 ? '' : 's'} to Unsorted.`);
      break;
    }
    case 'quick-cat':
      if (h && e.target.value) { h.cat = e.target.value; touchMeta(); save(); render(); toast('Moved.'); }
      break;
    case 'delete-habit':
      if (h && confirm(`Delete "${h.name}"? Your history stays, but the habit goes.`)) {
        state.habits = state.habits.filter(x => x.id !== h.id);
        state.habits.forEach(x => { if (x.after === h.id) x.after = ''; x.companions = x.companions.filter(c => c !== h.id); });
        touchMeta(); save(); ui.editId = null; render(); toast('Deleted.');
      }
      break;
    case 'pick-option': if (h) { const dt = t.dataset.date || todayStr(); closeSheet(); mutate(() => { completeHabit(dt, h, 0, t.dataset.val); }); } break;
    case 'close-sheet': closeSheet(); break;
    case 'data-sheet': openDataSheet(); break;
    case 'water-add': mutate(() => { const dd = day(todayStr(), true); dd.waterMl = Math.max(0, (dd.waterMl || 0) + parseInt(t.dataset.ml, 10)); }); break;
    case 'fetch-weather': fetchWeather(); break;
    case 'pick-starter':
      state.critters[id] = { xp: 0, home: null }; state.buddy = id; touchMeta(); save(); render();
      toast(`${catOf(id).critter} is your buddy.`);
      break;
    case 'open-swap': swapSheet(); break;
    case 'do-swap':
      if (h || id) { state.buddy = id; state.buddySwapTokens = Math.max(0, state.buddySwapTokens - 1); touchMeta(); save(); closeSheet(); render(); toast(`${catOf(id).critter} is your buddy now.`); }
      break;
    case 'open-mystery': ui._mysteryOpen = parseInt(t.dataset.idx, 10); render(); break;
    case 'claim-mystery': {
      const catId = state.mystery.pool[ui._mysteryOpen];
      state.critters[catId] = { xp: 0, home: null };
      state.mystery = null; ui._mysteryOpen = null;
      touchMeta(); save(); render(); toast(`${catOf(catId).critter} joined your woodland.`);
      break;
    }
    case 'set-home':
      if (id && e.target.value) { state.critters[id].home = e.target.value; touchMeta(); save(); render(); }
      break;
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

// Typing / selects that aren't click-based
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
  } else if (t.dataset.act === 'quick-cat') {
    const h = habitById(t.dataset.id);
    if (h && t.value) { h.cat = t.value; touchMeta(); save(); render(); toast('Moved.'); }
  } else if (t.dataset.act === 'set-home') {
    if (t.dataset.id && t.value) { state.critters[t.dataset.id].home = t.value; touchMeta(); save(); render(); }
  } else if (t.dataset.field) {
    const f = t.dataset.field;
    mutate(() => {
      const dd = day(todayStr(), true);
      if (f === 'steps') dd.steps = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'hr') dd.hr = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'temp') { dd.temp = t.value === '' ? null : parseFloat(t.value); dd.tempOn = todayStr(); }
    });
  } else if (t.dataset.setting) {
    const v = parseFloat(t.value);
    if (!isNaN(v)) { state.settings[t.dataset.setting] = v; touchMeta(); }
    save(); render();
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
  if (lastToday !== todayStr()) { lastToday = todayStr(); render(); }
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
window.gg = {
  get state() { return state; }, get cloud() { return cloud; }, get ui() { return ui; },
  totalXp: () => Object.values(state.critters).reduce((s, c) => s + c.xp, 0),
  streakInfo, waterPlan, overdue, levelInfo, applyHealth, applyInbox, applyWorkouts, mergeStates,
  mutate, day, completeHabit, uncompleteHabit, checkMilestones, categoryGapDays, tiersOf,
};
