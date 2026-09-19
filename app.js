'use strict';

/* =====================================================================
   GENTLE GARDEN  -  app.js
   A calm little habit garden. Everything runs in your browser and your
   data is saved on your device (localStorage). No server, no account.

   Map of this file (search for the numbers to jump around):
     1. CONFIG        numbers you might want to tweak (XP, goals, colours' names)
     2. DEFAULTS      the categories, critters and starter habits
     3. SAVING        loading and saving your data
     4. DATES         small helpers for working with days
     5. BRAINS        XP, levels, streaks, overdue scores, smart water
     6. ACTIONS       the things that change your data (ticking a habit, etc.)
     7. SCREENS       functions that build the HTML for each page
     8. EVENTS        what happens when you tap or type
     9. START-UP

   Tip for debugging: open the browser console (F12) and type   gg.state
   to see all your data, or   gg.totalXp()   to see the calculation.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. CONFIG
   --------------------------------------------------------------------- */
const CONFIG = {
  storageKey: 'gentleGarden.v1',

  // Each day you pick an energy colour. "goal" is how much XP counts as a
  // good day. "maxLevel" is the hardest habits suggested at the top (1 easy,
  // 2 medium, 3 needs more energy).
  energy: {
    green: { label: 'Good energy', goal: 80, maxLevel: 3, blurb: 'Lovely. Pick whatever feels good.' },
    amber: { label: 'Steady',      goal: 50, maxLevel: 2, blurb: 'A steady day. Gentler things come first.' },
    red:   { label: 'Low',         goal: 25, maxLevel: 1, blurb: 'A low day. Your goal is smaller and only the easy things are up top.' },
    rest:  { label: 'Rest day',    goal: 0,  maxLevel: 1, blurb: 'Rest day. Nothing is needed and your streak is safe.' },
  },

  // How many habits are suggested at once on each kind of day (the rest wait under "More when you are ready")
  maxSuggested: { green: 7, amber: 5, red: 3, rest: 2 },

  dailyBonusXp: 20,     // extra XP when you meet the day's goal
  gentleFactor: 0.6,    // the gentle version of a habit earns 60% of its XP
  levelBase: 50,        // level L starts at 50 x L x (L-1) XP: 0, 100, 300, 600, 1000...
  critterBase: 30,      // same idea for the critters, but a bit quicker

  levelTitles: ['Seed', 'Sprout', 'Seedling', 'Sapling', 'Young tree', 'Blossom',
                'Meadow', 'Grove', 'Woodland', 'Old oak', 'Ancient wood'],

  praise: ['Lovely.', 'Nicely done.', 'That counts.', 'Gently does it.',
           'Small steps, real progress.', 'Good going.', 'Well done, you.'],
};


/* ---------------------------------------------------------------------
   2. DEFAULTS
   --------------------------------------------------------------------- */

// Categories are like the "rooms" in your old cleaning app. Each has a critter.
const CATEGORIES = [
  { id: 'body',   name: 'Body care',        emoji: '🦔', critter: 'Thistle the hedgehog' },
  { id: 'move',   name: 'Movement',         emoji: '🦊', critter: 'Bramble the fox' },
  { id: 'water',  name: 'Water',            emoji: '🦦', critter: 'Ripple the otter' },
  { id: 'sleep',  name: 'Sleep',            emoji: '🐭', critter: 'Nutmeg the dormouse' },
  { id: 'calm',   name: 'Calm and nature',  emoji: '🐦', critter: 'Willow the wren' },
  { id: 'mind',   name: 'Mind and courage', emoji: '🦉', critter: 'Hazel the owl' },
  { id: 'social', name: 'Screens and people', emoji: '🐇', critter: 'Clover the rabbit' },
];

const DEFAULT_SETTINGS = {
  stepGoal: 3000,    // gentle starting point, change it in Settings
  waterBase: 1500,   // ml. If a clinician has given you a fluid target, use theirs here
  glassMl: 250,
  restingHr: 65,
  graceDays: 1,      // spare days that don't break a streak
  lat: null, lon: null,
};

// A tiny helper that fills in the boring bits so the list below stays readable.
// type: 'check' (yes/no), 'count' (tap up to a target), 'steps', 'smartwater'
// freq: how often it should come up, in days (1 = daily)
// level: energy needed, 1 low, 2 medium, 3 high
// after: id of a habit that must be done first (it stays hidden until then)
const H = (id, name, cat, o = {}) => ({
  id, name, cat, type: 'check', freq: 1, level: 1, xp: 10, goal: 1,
  gentle: '', items: '', options: [], after: '', link: '', notes: '', paused: false, ...o,
});

const DEFAULT_HABITS = [
  // Body care
  H('teeth', 'Brush teeth', 'body', { type: 'count', goal: 2, xp: 10, gentle: 'Quick brush or mouthwash', items: 'Toothbrush, toothpaste' }),
  H('shower', 'Shower', 'body', { freq: 2, level: 2, xp: 20, gentle: 'Wash with a flannel or wipes', items: 'Towel, shower gel' }),
  H('hair', 'Hair care', 'body', { freq: 3, level: 2, xp: 15, after: 'shower', gentle: 'Quick brush', items: 'Shampoo, conditioner, brush' }),
  H('shave', 'Shaving', 'body', { freq: 3, level: 2, xp: 15, after: 'shower', items: 'Razor, shaving gel' }),
  H('face', 'Wash face', 'body', { xp: 10, gentle: 'Face wipe', items: 'Cleanser or wipes' }),
  H('moist', 'Moisturise', 'body', { xp: 10, after: 'face', items: 'Moisturiser' }),
  H('spf', 'SPF', 'body', { xp: 10, after: 'moist', items: 'Sun cream', notes: 'Sun cream on face and any bits that will be out and about.' }),

  // Movement
  H('steps', 'Step goal', 'move', { type: 'steps', level: 2, xp: 20, notes: 'Add your steps by tapping this one. Your goal is in Settings.' }),
  H('walk', 'Walk', 'move', { freq: 2, level: 2, xp: 20, gentle: 'Stand at the door and breathe some fresh air',
    options: ['Around the house', 'Garden', 'Short local walk', 'Longer walk'] }),
  H('pt', 'Physio (PT)', 'move', { level: 2, xp: 20, gentle: 'Just one exercise', notes: 'Add your physio exercises here so they are close to hand.' }),
  H('stretch', 'Stretching', 'move', { xp: 10, gentle: 'One stretch, anywhere',
    notes: 'Add your routine here, one stretch per line. You can also paste a link to a video or audio file in the box below.' }),
  H('stand', 'Standing time', 'move', { xp: 10, gentle: 'Stand for one song' }),

  // Water
  H('water', 'Basic water', 'water', { type: 'count', goal: 6, xp: 15, notes: 'Tap up to your number of drinks for the day.' }),
  H('smartwater', 'Smart water', 'water', { type: 'smartwater', xp: 20 }),

  // Sleep
  H('bed', 'Bedtime on track', 'sleep', { xp: 15, notes: 'Write your target bedtime here.' }),
  H('wake', 'Wake time on track', 'sleep', { xp: 10, notes: 'Write your target wake time here.' }),
  H('restbefore', 'Rest in bed before sleep', 'sleep', { xp: 10, notes: 'Lying down, lights low, nothing to do.' }),
  H('restafter', 'Gentle wake-up in bed', 'sleep', { xp: 10, notes: 'Time to lie there after waking before you get up.' }),
  H('light', 'Light after waking', 'sleep', { xp: 10, gentle: 'Open the curtains', notes: 'Daylight soon after waking helps your body clock.' }),

  // Calm and nature
  H('mindbody', 'Mind-body moment', 'calm', { xp: 10, gentle: 'Three slow breaths',
    options: ['Breathing', 'Meditation', 'Body scan', 'Yoga nidra', 'Gentle yoga'] }),
  H('nature', 'Nature time', 'calm', { xp: 15, gentle: 'Look out of the window at something green',
    options: ['Garden', 'Park', 'Woods', 'By water', 'Window view', 'Sky-watching'] }),

  // Mind and courage
  H('reading', 'Reading', 'mind', { xp: 10, gentle: 'One page', options: ['Book', 'Article', 'Audiobook'] }),
  H('brain', 'Brain task', 'mind', { freq: 2, level: 2, xp: 15, gentle: 'Five minutes on it',
    options: ['Puzzle', 'Learning something', 'Planning', 'Creative', 'Admin'] }),
  H('scary', 'Scary thing', 'mind', { freq: 3, level: 3, xp: 25, gentle: 'Think it through or write it down',
    options: ['Tiny', 'Small', 'Big'], notes: 'Something a little outside your comfort zone.' }),

  // Screens and people
  H('screen', 'Screen time in check', 'social', { xp: 10, notes: 'Tick when screens stayed within your limit, or you took a proper break.' }),
  H('socmed', 'Mindful social media', 'social', { xp: 10 }),
  H('social', 'Social time', 'social', { freq: 2, level: 2, xp: 20, gentle: 'Send someone a message',
    options: ['Chat', 'Call', 'Message', 'In person', 'With my partner'] }),
];


/* ---------------------------------------------------------------------
   3. SAVING
   --------------------------------------------------------------------- */
let state;

function freshState() {
  return {
    version: 1,
    name: '',
    startDate: todayStr(),
    settings: { ...DEFAULT_SETTINGS },
    habits: DEFAULT_HABITS.map(h => ({ ...h, options: [...h.options] })),
    // days['2026-09-19'] = { energy, steps, hr, temp, waterMl, counts:{habitId:n}, done:{habitId:{xp,mode,detail,cat}} }
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
  s.name = s.name || '';
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('Could not load saved data', e); }
  return freshState();
}

function save() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); }
  catch (e) { console.warn(e); toast('Your browser would not let me save. Is private browsing on?'); }
}


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


/* ---------------------------------------------------------------------
   5. BRAINS
   --------------------------------------------------------------------- */
const habitById = id => state.habits.find(h => h.id === id);
const activeHabits = () => state.habits.filter(h => !h.paused);

// Get (or create) the record for a day
function day(date, create) {
  let d = state.days[date];
  if (!d && create) d = state.days[date] = { energy: null, steps: 0, hr: 0, temp: null, waterMl: 0, counts: {}, done: {} };
  return d;
}

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
const levelTitle = l => CONFIG.levelTitles[Math.min(l - 1, CONFIG.levelTitles.length - 1)];

// ---- Streaks: rest days and a few spare days keep it going
function streakInfo() {
  const today = todayStr(), grace = state.settings.graceDays;
  // Current streak: walk backwards from today
  let cur = dayOk(today) ? 1 : 0, gap = 0;
  for (let d = addDays(today, -1); d >= state.startDate; d = addDays(d, -1)) {
    if (dayOk(d)) { cur++; gap = 0; } else { gap++; if (gap > grace) break; }
  }
  // Best streak: walk forwards
  let best = 0, run = 0; gap = 0;
  for (let d = state.startDate; d <= today; d = addDays(d, 1)) {
    if (dayOk(d)) { run++; gap = 0; best = Math.max(best, run); }
    else if (d !== today) { gap++; if (gap > grace) run = 0; }
  }
  return { cur, best: Math.max(best, cur) };
}

// ---- Overdue score (like your cleaning app): days since last done / how often it should happen
// score 1 means "due now". Rest days don't count against you.
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
  // "Freshness" is 100% until it is due, then fades to 0% at three times its usual gap
  const fresh = Math.max(0, Math.min(1, 1 - (ds - habit.freq) / (2 * habit.freq)));
  return { last, ds, score, fresh };
}
const bloomPct = list => list.length ? Math.round(100 * list.reduce((s, h) => s + overdue(h, todayStr()).fresh, 0) / list.length) : 0;

// ---- Smart water: a rough guide from your steps, heart rate and the weather
function waterPlan(date) {
  const d = state.days[date] || {}, s = state.settings;
  const parts = [{ label: 'Base amount', ml: s.waterBase }];
  const stepsMl = Math.min(600, Math.round(Math.max(0, (d.steps || 0) - 2000) / 1000 * 2) * 50);   // +100 ml per 1,000 steps over 2,000
  const hrMl = d.hr ? Math.min(300, Math.floor(Math.max(0, d.hr - s.restingHr - 10) / 5) * 50) : 0; // +50 ml per 5 bpm above resting + 10
  const tempMl = d.temp != null && d.temp > 20 ? Math.min(500, Math.round(d.temp - 20) * 50) : 0;  // +50 ml per degree over 20
  if (stepsMl) parts.push({ label: 'Steps', ml: stepsMl });
  if (hrMl) parts.push({ label: 'Heart rate', ml: hrMl });
  if (tempMl) parts.push({ label: 'Warm weather', ml: tempMl });
  const target = Math.round(parts.reduce((s, p) => s + p.ml, 0) / 50) * 50;
  return { target, parts };
}

// ---- Milestones: one-off XP bonuses from your running totals
function lifetimeTotals() {
  let steps = 0, water = 0, done = 0;
  for (const date in state.days) { const d = state.days[date]; steps += d.steps || 0; water += d.waterMl || 0; done += Object.keys(d.done).length; }
  return { steps, waterL: Math.floor(water / 1000), done };
}
function milestoneList() {
  const st = streakInfo(), t = lifetimeTotals(), out = [];
  [[3, 30], [7, 50], [14, 80], [30, 150], [60, 250], [100, 400]].forEach(([n, xp]) =>
    out.push({ id: 'streak' + n, label: `${n}-day streak`, xp, have: st.best, need: n }));
  [[25000, 50], [100000, 100], [250000, 150], [500000, 250], [1000000, 500]].forEach(([n, xp]) =>
    out.push({ id: 'steps' + n, label: `${num(n)} steps in total`, xp, have: t.steps, need: n }));
  [[25, 50], [100, 100], [250, 150]].forEach(([n, xp]) =>
    out.push({ id: 'water' + n, label: `${n} litres of water logged`, xp, have: t.waterL, need: n }));
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

// Habits that finish themselves (counts, steps, smart water) are checked here
function syncAuto(date) {
  const d = day(date, true);
  for (const h of activeHabits()) {
    let met = null;
    if (h.type === 'steps') met = d.steps > 0 && d.steps >= state.settings.stepGoal;
    else if (h.type === 'smartwater') met = d.waterMl > 0 && d.waterMl >= waterPlan(date).target;
    else if (h.type === 'count') met = (d.counts[h.id] || 0) >= h.goal;
    if (met === null) continue;
    if (met && !d.done[h.id]) d.done[h.id] = { xp: h.xp, mode: 'auto', detail: '', cat: h.cat, ts: Date.now() };
    if (!met && d.done[h.id] && d.done[h.id].mode !== 'gentle') delete d.done[h.id];
  }
}

function completeHabit(date, habit, mode, detail) {
  const d = day(date, true);
  const xp = mode === 'gentle' ? Math.max(1, Math.round(habit.xp * CONFIG.gentleFactor)) : habit.xp;
  d.done[habit.id] = { xp, mode: mode || 'full', detail: detail || '', cat: habit.cat, ts: Date.now() };
  if (habit.type === 'count') d.counts[habit.id] = habit.goal;
  return xp;
}

function snapshot() {
  const xp = totalXp(), cats = {};
  CATEGORIES.forEach(c => { cats[c.id] = levelInfo(catXp(c.id), CONFIG.critterBase).level; });
  const d = state.days[ui.date];
  return { level: levelInfo(xp, CONFIG.levelBase).level, cats, done: d ? Object.keys(d.done) : [], met: goalMet(ui.date) };
}

// Run a change, then tidy up: sync auto habits, check milestones, save, redraw, and cheer.
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
  if (now.level > before.level) msgs.push(`Level ${now.level}: ${levelTitle(now.level)}. Lovely growing.`);
  for (const c of CATEGORIES) if (now.cats[c.id] > before.cats[c.id]) msgs.push(`${c.critter.split(' ')[0]} reached level ${now.cats[c.id]}.`);
  save();
  render();
  if (msgs.length) toast(msgs);
}

function handleTick(h) {
  const date = ui.date, d = state.days[date], isDone = !!(d && d.done[h.id]);
  if (h.type === 'steps' || h.type === 'smartwater') return openDataSheet();
  if (h.type === 'count') {
    return mutate(() => {
      const dd = day(date, true), n = dd.counts[h.id] || 0;
      if (isDone) { delete dd.done[h.id]; dd.counts[h.id] = Math.max(0, h.goal - 1); }
      else dd.counts[h.id] = n + 1;
    });
  }
  if (isDone) return mutate(() => { delete state.days[date].done[h.id]; });
  if (h.options.length) return openOptionsSheet(h);
  mutate(() => { completeHabit(date, h); });
}

// Links from Shortcuts or NFC tags, e.g.  yoursite/#done=teeth&steps=4200
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
      if (h && h.type === 'check' && !d.done[h.id]) completeHabit(date, h);
      else if (h && h.type === 'count' && !d.done[h.id]) d.counts[h.id] = (d.counts[h.id] || 0) + 1;
    });
  });
  history.replaceState(null, '', location.pathname + location.search);
}


/* ---------------------------------------------------------------------
   7. SCREENS
   --------------------------------------------------------------------- */
const ui = { folds: {}, tab: 'today', date: todayStr(), openId: null, editId: null, calMonth: todayStr().slice(0, 7), sheet: null };
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
const freqText = h => h.freq === 1 ? 'daily' : `every ${h.freq} days`;
const safeUrl = u => { u = (u || '').trim(); return /^https?:\/\//i.test(u) || /^[\w\-./%]+$/.test(u) ? u : ''; };

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  garden: '<path d="M5 19c0-9 5-14 14-14 0 9-5 14-13 14"/><path d="M5 19l8-8"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  habits: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>',
  settings: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
};
const icon = name => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const CHECK = '<svg viewBox="0 0 24 24" class="chk" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" class="chk" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function ring(pct, cls) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
  return `<svg class="ring ${cls || ''}" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="${r}"/>
    <circle class="ring-fg" cx="40" cy="40" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 40 40)"/></svg>`;
}

function render() {
  const views = { today: viewToday, garden: viewGarden, calendar: viewCalendar, habits: viewHabits, settings: viewSettings };
  document.body.dataset.tone = ui.tab === 'today' ? energyOf(ui.date) : 'calm';
  $('#app').innerHTML = views[ui.tab]();
  const tabs = [['today', 'Today'], ['garden', 'Garden'], ['calendar', 'Calendar'], ['habits', 'Habits'], ['settings', 'Settings']];
  $('#nav').innerHTML = tabs.map(([id, label]) =>
    `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></button>`).join('');
  if (ui.sheet === 'data') refreshWaterBox();
}

// ---------------- TODAY ----------------
function greeting() {
  const h = new Date().getHours();
  return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (state.name ? ', ' + esc(state.name) : '');
}

function viewToday() {
  const date = ui.date, isToday = date === todayStr(), d = state.days[date];
  const chosen = d && d.energy, en = energyOf(date), cfg = CONFIG.energy[en];
  const xp = dayXp(date), lvl = levelInfo(totalXp(), CONFIG.levelBase), st = streakInfo();
  const resting = en === 'rest';

  const pebbles = Object.entries(CONFIG.energy).map(([key, c]) =>
    `<button class="pebble e-${key}${chosen === key ? ' on' : ''}" data-act="energy" data-val="${key}" aria-pressed="${chosen === key}"><i></i>${c.label}</button>`).join('');

  const hero = `
    <section class="hero">
      <p class="hello"><span>${isToday ? greeting() : 'Looking back'}</span><span class="date">${prettyDate(date)}</span></p>
      ${isToday ? '' : '<button class="btn small back" data-act="back-today">Back to today</button>'}
      <h1 class="q">${chosen ? 'Your energy' : 'How is your energy today?'}</h1>
      <div class="pebbles" role="group" aria-label="Energy for the day">${pebbles}</div>
      <p class="blurb">${chosen ? cfg.blurb : 'Pick one and I will tune your suggestions and goal. Until then it is a steady day.'}</p>
      <div class="progress-row">
        <div class="ring-wrap">${ring(resting ? 1 : xp / cfg.goal, 'e-' + en)}<span class="ring-num">${resting ? 'rest' : xp}</span></div>
        <div>
          <p class="big">${resting ? 'Resting' : `${xp} of ${cfg.goal} xp`}</p>
          <p class="small">${resting ? 'Anything you do still earns xp.' : goalMet(date) ? 'Goal met. That is a good day.' : 'Today\u2019s goal for this energy level.'}</p>
          <button class="btn small log-btn" data-act="data-sheet">Log steps and water</button>
        </div>
      </div>
      <div class="level-row">
        <div class="lvl-text"><span><strong>Level ${lvl.level}</strong> ${levelTitle(lvl.level)}</span><span class="streak">${st.cur} day streak</span></div>
        <div class="bar" style="--p:${Math.round(lvl.pct * 100)}%" aria-hidden="true"></div>
        <p class="small">${lvl.span - lvl.into} xp to level ${lvl.level + 1}</p>
      </div>
    </section>`;

  // Sort habits into groups
  const picks = [], later = [], notDue = [], done = [];
  let hidden = 0;
  for (const h of activeHabits()) {
    if (d && d.done[h.id]) { done.push({ h }); continue; }
    if (h.after) { const pre = habitById(h.after); if (pre && !pre.paused && !(d && d.done[pre.id])) { hidden++; continue; } }
    const od = overdue(h, date);
    if (od.score >= 1) (h.level <= cfg.maxLevel ? picks : later).push({ h, od });
    else notDue.push({ h, od });
  }
  // Most overdue first; on a tie the gentler habit wins. Only a few are suggested at a time.
  picks.sort((a, b) => b.od.score - a.od.score || a.h.level - b.h.level);
  const cap = CONFIG.maxSuggested[en];
  const shown = picks.slice(0, cap);
  const more = picks.slice(cap).concat(later).sort((a, b) => b.od.score - a.od.score || a.h.level - b.h.level);
  notDue.sort((a, b) => b.od.score - a.od.score);

  const list = (items) => `<ul class="rows">${items.map(x => rowHtml(x.h, x.od, date)).join('')}</ul>`;
  // Folded sections remember whether you opened them, even after the screen redraws
  const fold = (key, title, items) => items.length ? `<details class="fold" data-fold="${key}"${ui.folds[key] ? ' open' : ''}><summary>${title} <span class="count">${items.length}</span></summary>${list(items)}</details>` : '';

  let body = '';
  if (shown.length) body += `<section class="panel"><h2>${resting ? 'If you fancy something small' : 'Suggested for now'}</h2>${list(shown)}</section>`;
  else if (!done.length) body += `<section class="panel"><p class="empty">Nothing is due. Enjoy the quiet.</p></section>`;
  else body += `<section class="panel"><p class="empty">Everything suggested is done. Well done, you.</p></section>`;
  body += fold('more', 'More when you are ready', more);
  if (done.length) body += `<section class="panel done-panel"><h2>Done ${isToday ? 'today' : 'this day'}</h2>${list(done)}</section>`;
  body += fold('notdue', 'Not due yet', notDue);
  if (hidden) body += `<p class="hint">${hidden} more will appear as you go, once the step before them is done.</p>`;

  return hero + body;
}

function rowHtml(h, od, date) {
  const d = state.days[date], entry = d && d.done[h.id], open = ui.openId === h.id;
  const cat = catOf(h.cat), count = (d && d.counts[h.id]) || 0;
  let circle = entry ? CHECK : '', meta = '', bar = '', side = '';

  if (h.type === 'count') {
    circle = entry ? CHECK : `<span class="cnum">${count}/${h.goal}</span>`;
    if (!entry) bar = `<span class="bar thin" style="--p:${Math.round(100 * count / h.goal)}%"></span>`;
    if (!entry && count > 0) side = `<button class="mini" data-act="minus" data-id="${h.id}" aria-label="Take one off ${esc(h.name)}">&minus;</button>`;
  } else if (h.type === 'steps') {
    const s = (d && d.steps) || 0, g = state.settings.stepGoal;
    circle = entry ? CHECK : PLUS;
    meta = `${num(s)} of ${num(g)} steps`;
    if (!entry) bar = `<span class="bar thin" style="--p:${Math.min(100, Math.round(100 * s / g))}%"></span>`;
  } else if (h.type === 'smartwater') {
    const w = (d && d.waterMl) || 0, t = waterPlan(date).target;
    circle = entry ? CHECK : PLUS;
    meta = `${num(w)} of ${num(t)} ml`;
    if (!entry) { bar = `<span class="bar thin" style="--p:${Math.min(100, Math.round(100 * w / t))}%"></span>`;
      side = `<button class="mini wide" data-act="quick-water" data-id="${h.id}" aria-label="Add a glass of water">+${state.settings.glassMl}</button>`; }
  }
  if (!meta) {
    if (entry) meta = entry.mode === 'gentle' ? 'Gentle version' : (entry.detail ? esc(entry.detail) : 'Done');
    else if (h.type === 'count') meta = `${count} of ${h.goal}`;
    else meta = od ? (!od.last ? 'Not done yet' : od.ds === 0 ? 'Done today' : od.ds === 1 ? 'Last done yesterday' : `Last done ${od.ds} days ago`) : '';
  }
  if (entry) meta += `, +${entry.xp} xp`;

  const gentleBtn = !entry && h.gentle && (h.type === 'check' || h.type === 'count')
    ? `<button class="gentle" data-act="gentle" data-id="${h.id}">Gentle: ${esc(h.gentle)}</button>` : '';
  const dots = `<span class="dots l${h.level}" title="Energy needed: ${['', 'low', 'medium', 'high'][h.level]}"><i></i><i></i><i></i></span>`;

  let more = '';
  if (open) {
    const link = safeUrl(h.link);
    const media = !link ? '' : /\.(mp3|m4a|wav|ogg|aac)$/i.test(link)
      ? `<audio controls preload="none" src="${esc(link)}"></audio>`
      : `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Open guide or recording</a>`;
    more = `<div class="more">
      ${h.notes ? `<p class="notes">${esc(h.notes)}</p>` : ''}
      ${h.items ? `<p><strong>You will need:</strong> ${esc(h.items)}</p>` : ''}
      <p class="small">Comes up ${freqText(h)}. Worth ${h.xp} xp.</p>
      ${media}
      <button class="btn small" data-act="edit" data-id="${h.id}">Edit habit</button>
    </div>`;
  }

  return `<li class="row${entry ? ' is-done' : ''}" style="--cat:var(--c-${h.cat})">
    <button class="tick" data-act="tick" data-id="${h.id}" aria-label="${entry ? 'Undo' : 'Mark done'}: ${esc(h.name)}">${circle}</button>
    <div class="row-main">
      <button class="row-name" data-act="open" data-id="${h.id}" aria-expanded="${open}">${esc(h.name)}</button>
      <span class="row-meta">${meta}${entry ? '' : dots}</span>
      ${bar}${gentleBtn}
    </div>
    ${side}
    ${more}
  </li>`;
}

// ---------------- GARDEN ----------------
function viewGarden() {
  const lvl = levelInfo(totalXp(), CONFIG.levelBase), st = streakInfo(), active = activeHabits();
  const overall = bloomPct(active);
  const mood = overall >= 80 ? 'Your garden is thriving.' : overall >= 55 ? 'Growing nicely.'
    : overall >= 30 ? 'A bit dry in places. Small things will perk it up.' : 'Resting. Everything can start again, gently.';

  const tiles = CATEGORIES.map(c => {
    const list = active.filter(h => h.cat === c.id);
    if (!list.length) return '';
    const ci = levelInfo(catXp(c.id), CONFIG.critterBase), pct = bloomPct(list);
    return `<article class="tile" style="--cat:var(--c-${c.id})">
      <div class="crit-big" aria-hidden="true">${c.emoji}</div>
      <h3>${esc(c.name)}</h3>
      <p class="small">${esc(c.critter)}, level ${ci.level}</p>
      <div class="bar thin" style="--p:${Math.round(ci.pct * 100)}%" aria-label="Critter progress"></div>
      <p class="bloom"><strong>${pct}%</strong> in bloom</p>
    </article>`;
  }).join('');

  const ms = milestoneList();
  const got = ms.filter(m => state.milestones[m.id]);
  const next = ms.filter(m => !state.milestones[m.id]).slice(0, 4);

  return `<header class="page-head"><h1>Your garden</h1></header>
    <section class="panel garden-top">
      <div class="ring-wrap large">${ring(overall / 100, 'e-green')}<span class="ring-num">${overall}%</span></div>
      <div><p class="big">In bloom</p><p class="small">${mood}</p></div>
    </section>
    <section class="panel stats">
      <div><strong>Level ${lvl.level}</strong><span>${levelTitle(lvl.level)}</span></div>
      <div><strong>${num(totalXp())}</strong><span>total xp</span></div>
      <div><strong>${st.cur}</strong><span>day streak</span></div>
      <div><strong>${st.best}</strong><span>best streak</span></div>
    </section>
    <h2 class="sec">Your critters</h2>
    <div class="tiles">${tiles}</div>
    <h2 class="sec">Milestones</h2>
    <section class="panel">
      ${got.length ? `<ul class="plain ms">${got.map(m => `<li class="got"><span>${esc(m.label)}</span><span>+${m.xp} xp</span></li>`).join('')}</ul>` : '<p class="empty">Your first milestone is not far away.</p>'}
      ${next.length ? `<h3 class="sub-h">Coming up</h3><ul class="plain ms">${next.map(m => `<li><span>${esc(m.label)}</span><span>${num(Math.min(m.have, m.need))} of ${num(m.need)}</span></li>`).join('')}</ul>` : ''}
    </section>
    `;
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
    </section>
    <p class="hint">Tap a day to look back at it. You can tick things you forgot to log.</p>`;
}

// ---------------- HABITS ----------------
function viewHabits() {
  if (ui.editId) return viewEdit();
  let html = `<header class="page-head"><h1>Habits</h1><p class="sub">Tap one to edit it. Pause anything that is not right for now.</p></header>
    <button class="btn primary wide" data-act="new-habit">Add a habit</button>`;
  for (const c of CATEGORIES) {
    const list = state.habits.filter(h => h.cat === c.id);
    if (!list.length) continue;
    html += `<section class="panel group" style="--cat:var(--c-${c.id})"><h2><span aria-hidden="true">${c.emoji}</span> ${esc(c.name)}</h2><ul class="plain">` +
      list.map(h => `<li><button class="edit-row${h.paused ? ' paused' : ''}" data-act="edit" data-id="${h.id}">
        <span class="dotcat"></span><span class="er-name">${esc(h.name)}</span>
        <span class="er-meta">${freqText(h)}${h.paused ? ', paused' : ''}</span></button></li>`).join('') + '</ul></section>';
  }
  return html;
}

function field(label, inner, hint) {
  return `<label class="field"><span class="lab">${label}</span>${inner}${hint ? `<span class="hint-s">${hint}</span>` : ''}</label>`;
}
const opt = (v, label, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${label}</option>`;

function viewEdit() {
  const isNew = ui.editId === 'new';
  const h = isNew ? H('', '', 'body') : habitById(ui.editId);
  if (!h) { ui.editId = null; return viewHabits(); }
  const others = state.habits.filter(x => x.id !== h.id);
  return `<header class="page-head"><h1>${isNew ? 'New habit' : 'Edit habit'}</h1></header>
  <section class="panel form">
    ${field('Name', `<input id="f-name" type="text" value="${esc(h.name)}" maxlength="60">`)}
    ${field('Category', `<select id="f-cat">${CATEGORIES.map(c => opt(c.id, esc(c.name), h.cat)).join('')}</select>`)}
    ${field('How it works', `<select id="f-type">${opt('check', 'Tick it (yes or no)', h.type)}${opt('count', 'Count up to a target', h.type)}${opt('steps', 'Step goal (uses my step count)', h.type)}${opt('smartwater', 'Smart water (adjusts to my day)', h.type)}</select>`)}
    ${field('Target count', `<input id="f-goal" type="number" min="1" max="50" value="${h.goal}">`, 'Only used for "count" habits, like 2 for brushing teeth.')}
    ${field('How often (days)', `<input id="f-freq" type="number" min="1" max="60" value="${h.freq}">`, '1 means daily, 3 means every three days. This drives the suggestions and the bloom percentage.')}
    ${field('Energy needed', `<select id="f-level">${opt(1, 'Low', h.level)}${opt(2, 'Medium', h.level)}${opt(3, 'High', h.level)}</select>`, 'Decides which energy days it is suggested on.')}
    ${field('XP', `<input id="f-xp" type="number" min="1" max="100" value="${h.xp}">`)}
    ${field('Gentle version', `<input id="f-gentle" type="text" value="${esc(h.gentle)}" maxlength="60">`, 'A smaller version that still counts, worth 60% of the xp. Leave blank for none.')}
    ${field('Things you need', `<input id="f-items" type="text" value="${esc(h.items)}" maxlength="120">`, 'Separate with commas.')}
    ${field('Detail choices', `<input id="f-options" type="text" value="${esc(h.options.join(', '))}" maxlength="200">`, 'Optional. Separate with commas. You will be asked to pick one when you tick it.')}
    ${field('Only show after', `<select id="f-after">${opt('', 'No, show it any time', h.after)}${others.map(x => opt(x.id, esc(x.name), h.after)).join('')}</select>`, 'A linked habit stays hidden until the one before it is done.')}
    ${field('Link or file', `<input id="f-link" type="text" value="${esc(h.link)}" maxlength="300" placeholder="https://... or media/stretch.mp3">`, 'A web link, or an audio file you have added to your GitHub project. Audio files get a built-in player.')}
    ${field('Notes or routine', `<textarea id="f-notes" rows="5">${esc(h.notes)}</textarea>`, 'Shown when you tap the habit name. Good for a stretching routine.')}
    <label class="check"><input id="f-paused" type="checkbox"${h.paused ? ' checked' : ''}> Pause this habit (hidden but kept)</label>
    ${isNew ? '' : `<p class="small">Shortcut code: <code>${esc(h.id)}</code></p>`}
    <div class="btn-row">
      <button class="btn primary" data-act="save-habit">Save</button>
      <button class="btn" data-act="cancel-edit">Cancel</button>
    </div>
    ${isNew ? '' : `<div class="danger"><button class="btn danger-btn" data-act="delete-habit" data-id="${h.id}">Delete this habit</button>
      <p class="small">Your history stays, but the habit goes.</p></div>`}
  </section>`;
}

// ---------------- SETTINGS ----------------
function viewSettings() {
  const s = state.settings;
  const num_ = (key, label, min, max, hint) => field(label, `<input type="number" data-setting="${key}" min="${min}" max="${max}" value="${s[key]}">`, hint);
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'https://your-site/';
  return `<header class="page-head"><h1>Settings</h1></header>
  <section class="panel form">
    ${field('Your name', `<input type="text" data-name value="${esc(state.name)}" maxlength="30">`, 'Just for the greeting. Optional.')}
    ${num_('stepGoal', 'Step goal', 100, 30000, 'Start where you are. You can raise it whenever you like.')}
    ${num_('waterBase', 'Base water amount (ml)', 500, 5000, 'If a clinician has given you a fluid target, put it here. Smart water adds to this.')}
    ${num_('glassMl', 'Glass size (ml)', 50, 1000)}
    ${num_('restingHr', 'Resting heart rate (bpm)', 40, 120, 'Used to spot a raised heart rate for smart water.')}
    ${field('Spare days for streaks', `<select data-setting="graceDays">${[0, 1, 2, 3].map(n => opt(n, n === 0 ? 'None' : n + (n === 1 ? ' spare day' : ' spare days'), s.graceDays)).join('')}</select>`, 'Missed days up to this number do not break your streak. Rest days never do.')}
  </section>

  <section class="panel">
    <h2>Weather for smart water</h2>
    <p class="small">${s.lat == null ? 'Not set up. Tapping "Use today\u2019s forecast" in the water panel will ask for a rough location.' : 'A rough location is saved on this device only.'}</p>
    ${s.lat == null ? '' : '<button class="btn small" data-act="clear-location">Forget my location</button>'}
  </section>

  <section class="panel">
    <h2>Back up your data</h2>
    <p class="small">Everything lives in this browser on this device. Download a backup now and then, especially before clearing your browser data.</p>
    <div class="btn-row"><button class="btn" data-act="export">Download backup</button>
    <button class="btn" data-act="import">Restore from backup</button></div>
    <input id="import-file" type="file" accept="application/json" hidden>
  </section>

  <section class="panel">
    <h2>Shortcuts and NFC tags</h2>
    <p class="small">Apple Health cannot be read by a web page directly, but the iPhone Shortcuts app can send numbers here through a link. Examples:</p>
    <p class="code">${esc(base)}#steps=4200&amp;hr=78&amp;temp=21</p>
    <p class="code">${esc(base)}#done=teeth</p>
    <p class="small">The second one ticks a habit, which suits an NFC tag by the bathroom mirror. Each habit's shortcut code is on its edit page.</p>
  </section>

  <section class="panel">
    <h2>Start again</h2>
    <button class="btn danger-btn" data-act="reset">Erase everything</button>
  </section>
  <p class="hint">Made with care. Your data never leaves your device.</p>`;
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
  openSheet(`<h2>${esc(h.name)}</h2><p class="small">Any detail you would like to note?</p>
    <div class="chips">${h.options.map(o => `<button class="chip" data-act="pick-option" data-id="${h.id}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" data-act="pick-option" data-id="${h.id}" data-val="">Just tick it</button>
    <button class="btn" data-act="close-sheet">Not yet</button></div>`, 'options');
}

function openDataSheet() {
  const d = state.days[ui.date] || {};
  openSheet(`<h2>Body and water</h2><p class="small">${prettyDate(ui.date)}. Enter what you know. Blank is fine.</p>
    <div class="grid3">
      ${field('Steps', `<input type="number" inputmode="numeric" min="0" data-field="steps" placeholder="so far" value="${d.steps || ''}">`)}
      ${field('Heart rate', `<input type="number" inputmode="numeric" min="0" data-field="hr" placeholder="avg bpm" value="${d.hr || ''}">`)}
      ${field('Temp \u00b0C', `<input type="number" inputmode="decimal" step="0.5" data-field="temp" placeholder="high" value="${d.temp == null ? '' : d.temp}">`)}
    </div>
    <div class="btn-row"><button class="btn small" data-act="fetch-weather">Use today\u2019s forecast</button><span class="small" id="wx-status"></span></div>
    <div id="water-box"></div>
    <p class="small guide">A rough guide only, not medical advice. Follow any fluid advice from your clinician.</p>
    <button class="btn primary wide" data-act="close-sheet">Done</button>`, 'data');
  refreshWaterBox();
}

function refreshWaterBox() {
  const box = $('#water-box'); if (!box) return;
  const d = state.days[ui.date] || {}, plan = waterPlan(ui.date), have = d.waterMl || 0, g = state.settings.glassMl;
  box.innerHTML = `<div class="plan">
    <p class="plan-target"><strong>${num(plan.target)} ml</strong> suggested for today</p>
    <ul class="plain parts">${plan.parts.map((p, i) => `<li><span>${p.label}</span><span>${i ? '+' : ''}${num(p.ml)} ml</span></li>`).join('')}</ul>
    <div class="bar" style="--p:${Math.min(100, Math.round(100 * have / plan.target))}%"></div>
    <p class="small">${num(have)} of ${num(plan.target)} ml${have >= plan.target && have > 0 ? '. Goal met, lovely.' : ''}</p>
    <div class="btn-row">
      <button class="btn small" data-act="water-add" data-ml="100">+100 ml</button>
      <button class="btn small" data-act="water-add" data-ml="${g}">+${g} ml</button>
      <button class="btn small" data-act="water-add" data-ml="500">+500 ml</button>
      <button class="btn small ghost" data-act="water-add" data-ml="${-g}">Undo ${g}</button>
    </div>
    <div class="inline"><input id="water-custom" type="number" inputmode="numeric" min="0" placeholder="Other amount (ml)" aria-label="Other amount in ml">
    <button class="btn small" data-act="water-custom">Add</button></div>
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
   8. EVENTS   one listener for all taps: buttons carry data-act="..."
   --------------------------------------------------------------------- */
async function fetchWeather() {
  const s = state.settings, status = () => $('#wx-status'), say = t => { if (status()) status().textContent = t; };
  try {
    if (s.lat == null) {
      say('Asking your device for a rough location...');
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 3600000 }));
      s.lat = Math.round(pos.coords.latitude * 10) / 10;   // rounded to roughly 10 km on purpose
      s.lon = Math.round(pos.coords.longitude * 10) / 10;
      save();
    }
    say('Checking the forecast...');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&daily=temperature_2m_max&timezone=auto&forecast_days=1`);
    const t = (await r.json()).daily.temperature_2m_max[0];
    mutate(() => { day(ui.date, true).temp = Math.round(t * 10) / 10; });
    const input = document.querySelector('[data-field="temp"]'); if (input) input.value = Math.round(t * 10) / 10;
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
    goal: Math.max(1, parseInt(v('f-goal').value, 10) || 1), freq: Math.max(1, parseInt(v('f-freq').value, 10) || 1),
    level: parseInt(v('f-level').value, 10), xp: Math.max(1, parseInt(v('f-xp').value, 10) || 10),
    gentle: v('f-gentle').value.trim(), items: v('f-items').value.trim(),
    options: v('f-options').value.split(',').map(x => x.trim()).filter(Boolean),
    after: v('f-after').value, link: v('f-link').value.trim(), notes: v('f-notes').value.trim(), paused: v('f-paused').checked,
  };
  if (ui.editId === 'new') state.habits.push({ id: 'h' + Date.now().toString(36), ...data });
  else Object.assign(habitById(ui.editId), data);
  save(); ui.editId = null; render(); toast('Saved.');
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id, h = id ? habitById(id) : null;

  switch (act) {
    case 'tab': ui.tab = t.dataset.tab; ui.editId = null; render(); window.scrollTo(0, 0); break;
    case 'energy': mutate(() => { day(ui.date, true).energy = t.dataset.val; }); break;
    case 'tick': if (h) handleTick(h); break;
    case 'minus': if (h) mutate(() => { const dd = day(ui.date, true); dd.counts[h.id] = Math.max(0, (dd.counts[h.id] || 0) - 1); }); break;
    case 'gentle': if (h) mutate(() => { completeHabit(ui.date, h, 'gentle'); }); break;
    case 'open': ui.openId = ui.openId === id ? null : id; render(); break;
    case 'quick-water': mutate(() => { const dd = day(ui.date, true); dd.waterMl = (dd.waterMl || 0) + state.settings.glassMl; }); break;
    case 'back-today': ui.date = todayStr(); render(); break;
    case 'pick-day': ui.date = t.dataset.date; ui.tab = 'today'; render(); window.scrollTo(0, 0); break;
    case 'cal-prev': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m - 2, 1, 12)).slice(0, 7); render(); break; }
    case 'cal-next': { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = dstr(new Date(y, m, 1, 12)).slice(0, 7); render(); break; }
    case 'edit': ui.editId = id; ui.tab = 'habits'; render(); window.scrollTo(0, 0); break;
    case 'new-habit': ui.editId = 'new'; render(); window.scrollTo(0, 0); break;
    case 'cancel-edit': ui.editId = null; render(); break;
    case 'save-habit': saveHabit(); break;
    case 'delete-habit':
      if (h && confirm(`Delete "${h.name}"? Your history stays, but the habit goes.`)) {
        state.habits = state.habits.filter(x => x.id !== h.id);
        state.habits.forEach(x => { if (x.after === h.id) x.after = ''; });
        save(); ui.editId = null; render(); toast('Deleted.');
      }
      break;
    case 'pick-option': if (h) { closeSheet(); mutate(() => { completeHabit(ui.date, h, 'full', t.dataset.val); }); } break;
    case 'close-sheet': closeSheet(); break;
    case 'water-add': mutate(() => { const dd = day(ui.date, true); dd.waterMl = Math.max(0, (dd.waterMl || 0) + parseInt(t.dataset.ml, 10)); }); break;
    case 'water-custom': {
      const n = parseInt($('#water-custom').value, 10);
      if (n > 0) mutate(() => { const dd = day(ui.date, true); dd.waterMl = (dd.waterMl || 0) + n; });
      break;
    }
    case 'data-sheet': openDataSheet(); break;
    case 'fetch-weather': fetchWeather(); break;
    case 'clear-location': state.settings.lat = state.settings.lon = null; save(); render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `gentle-garden-backup-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      break;
    }
    case 'import': $('#import-file').click(); break;
    case 'reset':
      if (confirm('Erase all your habits, history and settings on this device? This cannot be undone.')) {
        state = freshState(); ui.date = todayStr(); save(); render(); toast('Fresh start.');
      }
      break;
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
        if (!data.habits || !data.days) throw new Error('Not a Gentle Garden backup');
        state = migrate(data); save(); render(); toast('Backup restored.');
      } catch (err) { toast('That file did not look like a Gentle Garden backup.'); }
    };
    reader.readAsText(t.files[0]);
  } else if (t.dataset.field) {
    const f = t.dataset.field;
    mutate(() => {
      const dd = day(ui.date, true);
      if (f === 'steps') dd.steps = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'hr') dd.hr = Math.max(0, parseInt(t.value, 10) || 0);
      if (f === 'temp') dd.temp = t.value === '' ? null : parseFloat(t.value);
    });
  } else if (t.dataset.setting) {
    const v = parseInt(t.value, 10);
    if (!isNaN(v)) state.settings[t.dataset.setting] = v;
    mutate(() => {});
  } else if ('name' in t.dataset) {
    state.name = t.value.trim(); save();
  }
});

// A Shortcuts or NFC link opened while the app is already open
window.addEventListener('hashchange', handleHash);

// "toggle" doesn't bubble, so we listen in the capture phase
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.fold) ui.folds[e.target.dataset.fold] = e.target.open; }, true);

document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

// If the app is left open overnight, move on to the new day
let lastToday = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lastToday !== todayStr()) {
    if (ui.date === lastToday) ui.date = todayStr();
    lastToday = todayStr(); render();
  }
});


/* ---------------------------------------------------------------------
   9. START-UP
   --------------------------------------------------------------------- */
state = load();
save();
render();
handleHash();

// Handy for learning and debugging: type "gg" in the browser console
window.gg = { get state() { return state; }, totalXp, streakInfo, waterPlan, overdue, levelInfo, ui };
