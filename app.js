/* ==========================================================================
   CLEANDECK - app.js  (how the app BEHAVES)
   ==========================================================================
   HOW TO READ THIS FILE
   ---------------------
   JavaScript runs top to bottom. This file is split into numbered PARTS.
   You can jump around using Ctrl+F and searching "PART 5", for example.

     PART 1   Settings you can tweak (Firebase, XP amounts, game rules)
     PART 2   Small helper functions (dates, safe text, random numbers)
     PART 3   The app's "memory": variables that hold the current state
     PART 4   Saving & loading data (Firebase online, or the phone's local storage)
     PART 5   Game rules: levels, ranks, XP, streaks, daily goal, mystery chest loot
     PART 6   Chore maths: how overdue is a chore? which ones do we recommend?
     PART 7   Drawing the screen (turning data into HTML)
     PART 8   Things you can DO: complete, start, archive, delete, bulk edit
     PART 9   Pop-up windows and forms
     PART 10  Reward pop-up, mystery chest and confetti
     PART 11  Wiring up clicks and starting the app

   A few JavaScript ideas that appear a lot:
     const x = 5;         "x" is a named value that will never be reassigned.
     let y = 5;           "y" is a named value that can change later.
     function name() {}   a reusable bundle of steps you can "call" by name.
     async / await        "wait for this slow thing (like the internet) to
                          finish before moving on".
     `Hello ${name}`      a template string: ${...} drops a value into the text.
     array.map(...)       turn every item in a list into something else.
     array.filter(...)    keep only the items that pass a test.
   ========================================================================== */


/* ==========================================================================
   PART 1: SETTINGS
   Change numbers here to tune the game. Nothing else needs editing.
   ========================================================================== */

/* ----- 1a. Firebase (your online database) -----
   These values identify YOUR Firebase project. It is normal for them to be
   visible in a web app, they are not passwords. What actually protects your data
   is the "Rules" tab in Firestore (in the Firebase console). Make sure those
   rules are not just "allow read, write: if true" forever. */
const firebaseConfig = {
  apiKey: "AIzaSyAHgbJIEAEbrZ0kagyPgfo7jdXVmhhIjEY",
  authDomain: "cleaning-emdi.firebaseapp.com",
  projectId: "cleaning-emdi",
  storageBucket: "cleaning-emdi.firebasestorage.app",
  messagingSenderId: "750406957208",
  appId: "1:750406957208:web:056ae100e9e1febf6a38ed"
};

/* ----- 1b. Discord alerts -----
   IMPORTANT: a webhook URL IS effectively a password. Anyone who can see it can
   post to your Discord channel, and this file is public if your GitHub repo is.
   Your previous webhook was visible in the old code, so please:
     1. In Discord: Server Settings > Integrations > Webhooks > delete the old one.
     2. Create a new one and paste its URL between the quotes below.
   Leave it as "" to switch Discord alerts off. */
const DISCORD_WEBHOOK_URL = "";

/* ----- 1c. Game settings ----- */
const SETTINGS = {

  /* --- Priority: which chores get recommended first ---
     Score = (how overdue) x OVERDUE_WEIGHT + (how messy the room is) x CLEANLINESS_WEIGHT
     Overdue is weighted 3x more than room cleanliness. */
  OVERDUE_WEIGHT: 3,
  CLEANLINESS_WEIGHT: 1,
  HIGH_PRIORITY_BONUS: 1.5,   // extra points for chores marked with a star
  MAX_OVERDUE_RATIO: 4,       // stops one ancient chore from getting an absurd score
  FRESH_OVERDUE_DAYS: 3,      // due today up to this many days late = "fresh": kept at the top
  RECOMMENDED_COUNT: 3,       // how many chores appear under "Recommended"

  /* --- XP a chore is worth (never shown on the main page, only in the edit screen) ---
     XP = base for its length x a multiplier for how rarely it repeats. */
  XP_BY_LENGTH: { short: 10, medium: 25, long: 50 },
  XP_FREQUENCY_STEPS: [        // "if it repeats every N days or less, multiply by..."
    { maxDays: 3, mult: 0.7 },        // very frequent chores are worth a bit less
    { maxDays: 7, mult: 1.0 },
    { maxDays: 14, mult: 1.25 },
    { maxDays: 30, mult: 1.5 },
    { maxDays: Infinity, mult: 2.0 }  // rare chores are worth more
  ],
  STREAK_BONUS_PER_DAY: 0.05,  // +5% XP for each streak day...
  STREAK_BONUS_MAX: 0.25,      // ...up to +25%

  /* --- Levels: getting harder as you go up ---
     XP needed to go from level N to N+1 = LEVEL_BASE_XP + LEVEL_STEP_XP x (N - 1)
     So: Lvl1>2 = 250, Lvl2>3 = 325, Lvl3>4 = 400 ... it keeps growing. */
  LEVEL_BASE_XP: 250,
  LEVEL_STEP_XP: 75,

  /* --- Daily goal (keeps your streak alive) --- */
  DEFAULT_DAILY_GOAL: 3,       // chores per day (each person can change theirs in Profile)
  DAILY_GOAL_BONUS_XP: 20,     // one-off bonus for hitting the goal each day

  /* --- Small XP for adding a chore (with a daily cap so it can't be farmed) --- */
  TASK_CREATE_XP: 3,
  TASK_CREATE_DAILY_CAP: 5,    // only the first 5 chores added each day give XP

  /* --- Mystery chests: earned every few level-ups (random) --- */
  CHEST_MIN_LEVELS: 2,         // next chest arrives after 2 to 4 more level-ups
  CHEST_MAX_LEVELS: 4,
  CHEST_ALWAYS_HAS_PRIZE: true, // true = at least 1 of the 3 chests is never a lump of coal
  BOOST_HOURS: 24,             // how long an XP boost lasts
  /* "weight" = how common. Out of 100 total: coal shows up 40% of the time. */
  CHEST_LOOT: [
    { type: 'coal',  weight: 40 },
    { type: 'xp',    weight: 30 },
    { type: 'saver', weight: 15 },
    { type: 'boost', weight: 15 }
  ],

  /* --- Critters --- */
  CRITTER_XP_PER_CHORE: 25,
  CRITTER_XP_PER_LEVEL: 50,    // a critter at level L needs L x 50 XP to level up

  /* --- Housekeeping --- */
  INACTIVE_USER_DAYS: 90,      // "Remove inactive users" targets people idle this long
  ALERT_BELOW_SCORE: 40,       // Discord alert when the house score drops under this
  ALERT_COOLDOWN_HOURS: 12
};

/* Rank titles. Reaching a rank's level gives the title, plus the reward (if any). */
const RANKS = [
  { level: 1,  title: 'Dust Buster',         emoji: '🧹' },
  { level: 3,  title: 'Soap Samurai',        emoji: '🥋', reward: { savers: 1 } },
  { level: 5,  title: 'Scrub Master',        emoji: '🧽', reward: { savers: 1 } },
  { level: 8,  title: 'Grime Fighter',       emoji: '⚔️', reward: { savers: 1 } },
  { level: 10, title: 'Sanitation Overlord', emoji: '👑', reward: { savers: 2 } },
  { level: 15, title: 'Legend of Lather',    emoji: '🧼', reward: { savers: 2 } },
  { level: 20, title: 'Immaculate Immortal', emoji: '✨', reward: { savers: 3 } }
];

/* Critters. "keywords" are matched against a chore's name and equipment.
   "image" is the picture file in your critters/ folder. */
const CRITTER_CATALOG = [
  { id: 'dyson',   name: 'Dust-muncher',  image: 'critters/2.png',  keywords: ['dyson', 'hoover', 'hoovering', 'vacuum', 'vacuuming'] },
  { id: 'cloth',   name: 'Soggy flaps',   image: 'critters/3.png',  keywords: ['cloth', 'microfibre', 'microfiber', 'rag', 'wipe', 'wiping', 'dishcloth'] },
  { id: 'spray',   name: 'Squirter',      image: 'critters/4.png',  keywords: ['spray', 'multipurpose spray', 'cleaner'] },
  { id: 'mop',     name: 'Moppy',         image: 'critters/5.png',  keywords: ['mop', 'mopping', 'bucket'] },
  { id: 'sponge',  name: 'Spongebob',     image: 'critters/6.png',  keywords: ['sponge', 'scrubber'] },
  { id: 'bin',     name: 'Sludge-oozer',  image: 'critters/7.png',  keywords: ['bin', 'bins', 'bin bags', 'trash', 'rubbish'] },
  { id: 'toilet',  name: 'Turd-tugger',   image: 'critters/8.png',  keywords: ['toilet', 'loo', 'bathroom', 'bleach'] },
  { id: 'duster',  name: 'Tickler toes',  image: 'critters/1.png',  keywords: ['duster', 'damp duster', 'feather duster', 'dusting'] },
  { id: 'bleach',  name: 'Burnburn',      image: 'critters/9.png',  keywords: ['bleach'] },
  { id: 'washing', name: 'Undie-gulp',    image: 'critters/10.png', keywords: ['washing machine', 'laundry'] },
  { id: 'dishes',  name: 'Gunk-gargler',  image: 'critters/11.png', keywords: ['dishwasher', 'dishes', 'washing up'] }
];

/* The equipment you can tick when adding a chore. New ones you add yourself
   are remembered automatically (they're collected from your existing chores). */
const EQUIPMENT_OPTIONS = [
  'Dyson', 'Cloth', 'Multipurpose Spray', 'Mop', 'Bucket', 'Sponge',
  'Duster', 'Bleach', 'Toilet brush', 'Bin bags', 'Rubber gloves',
  'Washing machine', 'Dishwasher', 'Broom', 'Dustpan', 'Window cleaner',
  'Squeegee', 'Descaler', 'Oven cleaner', 'Scrubbing brush'
];

/* A little emoji for each room, chosen by looking for a word in the room name. */
const ROOM_EMOJIS = [
  ['kitchen', '🍳'], ['bath', '🛁'], ['toilet', '🚽'], ['loo', '🚽'], ['bed', '🛏️'],
  ['living', '🛋️'], ['lounge', '🛋️'], ['hall', '🚪'], ['stair', '🪜'], ['garden', '🌿'],
  ['office', '💻'], ['study', '📚'], ['utility', '🧺'], ['laundry', '🧺'], ['garage', '🚗'],
  ['dining', '🍽️'], ['kid', '🧸'], ['nursery', '🧸'], ['conservatory', '🪴'], ['general', '🏠']
];


/* ==========================================================================
   PART 2: HELPER FUNCTIONS
   Small, reusable tools used all over the app.
   ========================================================================== */

/* ----- Dates -----
   We store dates as text like "2026-09-20". We always work in the person's
   LOCAL time. (The old code used toISOString(), which uses UTC and could give
   yesterday's date just after midnight during British Summer Time.) */
function pad2(n) { return String(n).padStart(2, '0'); }

function toDateStr(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function todayStr() { return toDateStr(new Date()); }

/* Turn "2026-09-20" back into a Date at local midnight (or null if it isn't a date). */
function parseDateStr(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/* Whole days from one date string to another. (Math.round handles clocks changing.) */
function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

function addDaysStr(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/* "3 days ago", "today", etc. */
function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const days = daysBetween(dateStr, todayStr());
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/* ----- Text safety -----
   Chore names are typed by people and shared through the database. If we paste
   them straight into HTML, a name containing < or " could break the page (or
   worse, run code). escapeHtml() turns those characters into harmless text.
   RULE: always wrap user-typed text in escapeHtml() before putting it in HTML. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ----- Numbers ----- */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

/* ----- Safe reading from the phone's local storage -----
   If the stored text is broken, JSON.parse would crash the whole app.
   The try/catch means "try this, and if it fails, use the fallback instead". */
function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`Could not read "${key}" from local storage`, e);
    return fallback;
  }
}

/* ----- Toast: a small message that slides down from the top ----- */
let toastTimer = null;
function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ----- Icons: redraw the Lucide icons after we change the page ----- */
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

/* Does the person want less animation? (a device accessibility setting) */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* A short, safe display name: no slashes etc. (names are used as database IDs) */
function cleanUserName(raw) {
  return String(raw || '').replace(/[\/\\#?\[\]]/g, '').trim().slice(0, 30);
}


/* ==========================================================================
   PART 3: THE APP'S MEMORY (state)
   Variables that remember what's going on. When they change, we call render()
   to redraw the screen from them.
   ========================================================================== */
let currentUser = localStorage.getItem('cleanDeckUser') || '';        // who is using this device
let appUsers = readStored('cleanDeckUsers', {});                       // everyone's stats, keyed by name
let localTasks = readStored('cleanDeckLocalTasks', []);                // chores (only used without Firebase)
let completedLogs = readStored('cleanDeckLogs', []);                   // history of every completion
let firestoreTasks = [];                                               // chores loaded from Firebase

let selectedRoomFilter = null;       // which room card is tapped, if any
let activeLeaderboardTab = 'today';
let showAllTasks = false;
let showArchived = false;
let selectMode = false;              // true while ticking several chores
let selectedIds = new Set();         // ids of the ticked chores (a Set = a list with no duplicates)
let currentCalDate = new Date();     // month shown in the History calendar
let dataReady = false;               // false until the first data has arrived from Firebase
let lastAnalysis = null;             // most recent result of analyseTasks()
let lastVisibleIds = [];             // ids currently shown after filters (for "Select all")
let taskById = new Map();            // quick lookup: id -> chore


/* ==========================================================================
   PART 4: SAVING & LOADING DATA
   Two modes:
     - Firebase mode: data lives online, so everyone in the house shares it.
     - Local mode: (only if Firebase fails to start) data lives in this browser.
   Every other part of the app calls the functions below and doesn't need to
   care which mode is active.
   ========================================================================== */
let db = null;
let isFirebaseConfigured = false;

function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') return;
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isFirebaseConfigured = true;
  } catch (e) {
    console.error('Firebase failed to start, using local mode:', e);
  }
}

function getAllTasks() { return isFirebaseConfigured ? firestoreTasks : localTasks; }

function saveLocalData() {
  localStorage.setItem('cleanDeckLocalTasks', JSON.stringify(localTasks));
  localStorage.setItem('cleanDeckLogs', JSON.stringify(completedLogs));
  localStorage.setItem('cleanDeckUsers', JSON.stringify(appUsers));
}

/* Make a fresh unique id for a new chore */
function newTaskId() {
  if (isFirebaseConfigured) return db.collection('chores').doc().id;
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* Create OR update a chore. "fields" only needs the things that changed. */
async function saveTaskDoc(id, fields) {
  if (isFirebaseConfigured) {
    await db.collection('chores').doc(id).set(fields, { merge: true });   // merge = keep other fields
  } else {
    const existing = localTasks.find(t => t.id === id);
    if (existing) Object.assign(existing, fields);
    else localTasks.push({ id, ...fields });
    saveLocalData();
    render();
  }
}

async function deleteTaskDoc(id) {
  if (isFirebaseConfigured) {
    await db.collection('chores').doc(id).delete();
  } else {
    localTasks = localTasks.filter(t => t.id !== id);
    saveLocalData();
    render();
  }
}

/* Save one person's stats. */
async function saveUserDoc(username) {
  const userData = appUsers[username];
  if (!userData) return;
  if (isFirebaseConfigured) {
    try {
      /* JSON round-trip removes any "undefined" values, which Firebase refuses to store. */
      const clean = JSON.parse(JSON.stringify(userData));
      await db.collection('users').doc(username).set(clean, { merge: true });
    } catch (e) {
      console.error('Error saving user:', e);
      showToast('⚠️ Could not save your progress. Check your connection.');
    }
  }
  saveLocalData();
}

async function deleteUserDoc(username) {
  if (isFirebaseConfigured) await db.collection('users').doc(username).delete();
  delete appUsers[username];
  saveLocalData();
}

/* Add a line to the completion history (used by History and the leaderboard). */
async function addLogEntry(entry) {
  if (isFirebaseConfigured) {
    await db.collection('logs').add(entry);
  } else {
    completedLogs.push(entry);
    saveLocalData();
  }
}

/* Firebase "listeners": Firebase tells us whenever the shared data changes
   (even when someone else changes it on their phone), and we redraw. */
function startRealtimeListeners() {
  let choresLoaded = false;
  let usersLoaded = false;
  let firstReadyHandled = false;
  const markReady = () => {
    if (!(choresLoaded && usersLoaded)) return;
    dataReady = true;
    if (!firstReadyHandled) {               // the first time everything has arrived...
      firstReadyHandled = true;
      if (!getUser()) openUserModal();      // ...and this device has no valid user: ask who is cleaning
    }
  };

  db.collection('chores').onSnapshot(snapshot => {
    firestoreTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    choresLoaded = true; markReady();
    render();
  }, err => { console.error(err); showToast('⚠️ Could not load chores.'); });

  db.collection('users').onSnapshot(snapshot => {
    /* Rebuild the user list from the database, so deleted users disappear too. */
    const fresh = {};
    snapshot.docs.forEach(doc => { fresh[doc.id] = doc.data(); });
    appUsers = fresh;
    Object.keys(appUsers).forEach(initUserData);
    saveLocalData();
    usersLoaded = true; markReady();
    checkStreakAndSave();
    render();
  }, err => { console.error(err); });

  /* NOTE: this downloads every log. Fine for a household. If it ever gets slow,
     you could add .orderBy('timestamp', 'desc').limit(500) here. */
  db.collection('logs').onSnapshot(snapshot => {
    completedLogs = snapshot.docs.map(doc => doc.data());
    saveLocalData();
    renderActivityTab();   // leaderboard totals and the calendar both depend on logs
    renderMeTab();          // "chores done" is counted from logs too
  });
}


/* ==========================================================================
   PART 5: GAME RULES
   Levels, ranks, XP, streaks, the daily goal, critters and chest loot.
   None of these functions touch the screen: they only work with data.
   ========================================================================== */

/* ----- 5a. Levels -----
   The cost of each level goes up, so early levels come quickly and later ones
   are a real achievement. See LEVEL_BASE_XP / LEVEL_STEP_XP in Part 1. */
function costToLevelUp(level) {
  return SETTINGS.LEVEL_BASE_XP + SETTINGS.LEVEL_STEP_XP * (level - 1);
}

/* Given a person's TOTAL xp, work out their level and progress through it. */
function calculateLevel(totalXp) {
  let level = 1;
  let xpLeft = Math.max(0, Math.floor(totalXp || 0));
  while (xpLeft >= costToLevelUp(level)) {   // a "while" loop repeats until the condition is false
    xpLeft -= costToLevelUp(level);
    level += 1;
  }
  return { level, currentLevelXp: xpLeft, xpForNext: costToLevelUp(level) };
}

/* Total XP you need to have earned to REACH a given level. */
function totalXpToReachLevel(targetLevel) {
  let total = 0;
  for (let l = 1; l < targetLevel; l++) total += costToLevelUp(l);
  return total;
}

/* ----- 5b. Ranks ----- */
function getRank(level) {
  let current = RANKS[0];
  for (const rank of RANKS) { if (level >= rank.level) current = rank; }
  return current;
}
function getRankTitle(level) { return getRank(level).title; }

/* ----- 5c. Player data -----
   Every person is one object like { xp: 120, streak: 3, coal: 2, ... }.
   initUserData() makes sure every field exists, so old accounts saved before a
   feature was added still work (missing fields get sensible defaults). */
function newUserTemplate() {
  return {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    streakSavers: 0,
    lastActiveDate: null,     // last day they did ANYTHING (used for "inactive user" clean-up)
    lastGoalDate: null,       // last day they hit their daily goal (this drives the streak)
    xpBoostUntil: null,       // timestamp when their 2x XP boost ends
    critters: {},             // { dyson: { lvl: 1, xp: 0 } }
    coal: 0,                  // lumps of coal collected
    pendingChests: 0,         // unopened mystery chests
    chestOffer: null,         // the 3 chest contents, saved so closing the app can't reroll them
    chestsOpened: 0,
    nextChestLevel: null,     // the level at which the next chest is earned
    dailyGoal: SETTINGS.DEFAULT_DAILY_GOAL,
    dailyProgress: { date: null, count: 0 },
    taskAdds: { date: null, count: 0 },
    totalChores: 0,
    createdAt: null           // set when a brand-new person is created
  };
}

function initUserData(username) {
  const isBrandNew = !appUsers[username];
  if (isBrandNew) appUsers[username] = {};
  const user = appUsers[username];
  const template = newUserTemplate();

  /* Old accounts had no "lastGoalDate": start it from their last active day. */
  const hadNoGoalDate = user.lastGoalDate === undefined;

  for (const key of Object.keys(template)) {
    if (user[key] === undefined) user[key] = template[key];
  }
  if (hadNoGoalDate && user.lastActiveDate) user.lastGoalDate = user.lastActiveDate;
  if (isBrandNew) user.createdAt = Date.now();

  /* Old accounts get their first chest scheduled 2-4 levels from where they are now. */
  if (typeof user.nextChestLevel !== 'number') {
    user.nextChestLevel = calculateLevel(user.xp).level +
      randInt(SETTINGS.CHEST_MIN_LEVELS, SETTINGS.CHEST_MAX_LEVELS);
  }
  return user;
}

/* The person using this device (or null if nobody has chosen a name yet) */
function getUser() {
  return currentUser && appUsers[currentUser] ? appUsers[currentUser] : null;
}

function isXpBoostActive(user) {
  return !!(user && user.xpBoostUntil && Date.now() < user.xpBoostUntil);
}
function boostTimeLeftText(user) {
  const ms = (user.xpBoostUntil || 0) - Date.now();
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

/* ----- 5d. Daily goal ----- */
function getDailyGoal(user) {
  return clamp(parseInt(user.dailyGoal, 10) || SETTINGS.DEFAULT_DAILY_GOAL, 1, 10);
}
function getDailyCount(user) {
  const p = user.dailyProgress;
  return p && p.date === todayStr() ? (p.count || 0) : 0;
}
function hasMetGoalToday(user) {
  return user.lastGoalDate === todayStr();
}

/* ----- 5e. Streaks -----
   Rule: your streak goes up by 1 on each day you hit your daily goal.
   If you MISS a whole day, a Streak Saver is used up for each missed day.
   No savers left? The streak resets to 0.
   This function is safe to call many times: once it has dealt with the missed
   days, calling it again changes nothing. (The old version drained a saver on
   EVERY screen redraw.)
   Returns 'saved', 'lost' or null (nothing happened). */
function refreshStreak(user) {
  if (!user.lastGoalDate || !(user.streak > 0)) return null;
  const today = todayStr();
  const missedDays = daysBetween(user.lastGoalDate, today) - 1;   // full days with no goal hit
  if (missedDays <= 0) return null;

  if ((user.streakSavers || 0) >= missedDays) {
    user.streakSavers -= missedDays;
    user.lastGoalDate = addDaysStr(today, -1);   // pretend yesterday was fine, so we don't count again
    return 'saved';
  }
  user.streak = 0;
  return 'lost';
}

/* Run the streak check for the current user and save if anything changed. */
function checkStreakAndSave() {
  const user = getUser();
  if (!user || (isFirebaseConfigured && !dataReady)) return;
  const outcome = refreshStreak(user);
  if (!outcome) return;
  saveUserDoc(currentUser);
  showToast(outcome === 'saved'
    ? '🛡️ A Streak Saver protected your streak!'
    : '💔 Your streak was reset. Hit your daily goal to start a new one!');
}

/* ----- 5f. XP for a chore -----
   Pre-set, based on how long it takes and how often it repeats.
   This is shown ONLY on the edit screen, never on the main list. */
function getFrequencyMultiplier(intervalDays) {
  const days = Math.max(1, parseInt(intervalDays, 10) || 1);
  for (const step of SETTINGS.XP_FREQUENCY_STEPS) {
    if (days <= step.maxDays) return step.mult;
  }
  return 1;
}

function getTaskXp(task) {
  const custom = Number(task.xpOverride);
  if (Number.isFinite(custom) && custom > 0) return Math.round(custom);   // manual override from the edit screen
  const base = SETTINGS.XP_BY_LENGTH[task.timeTag || 'medium'] || SETTINGS.XP_BY_LENGTH.medium;
  const raw = base * getFrequencyMultiplier(task.interval);
  return Math.max(5, Math.round(raw / 5) * 5);   // round to the nearest 5 so numbers look tidy
}

/* ----- 5g. Adding XP (the ONE place XP is added, so level-ups are never missed) -----
   Returns a little report: did they level up? get a new rank? earn a chest? */
function addXp(user, amount) {
  const oldLevel = calculateLevel(user.xp).level;
  user.xp = (user.xp || 0) + amount;
  const newLevel = calculateLevel(user.xp).level;

  const report = { amount, oldLevel, newLevel, leveledUp: newLevel > oldLevel, rankUps: [], chestsEarned: 0 };
  if (!report.leveledUp) return report;

  /* Rank promotions grant their reward (extra Streak Savers) */
  for (const rank of RANKS) {
    if (rank.level > oldLevel && rank.level <= newLevel) {
      report.rankUps.push(rank);
      if (rank.reward && rank.reward.savers) user.streakSavers = (user.streakSavers || 0) + rank.reward.savers;
    }
  }

  /* A mystery chest arrives every few level-ups (a random number, 2 to 4) */
  if (newLevel >= user.nextChestLevel) {
    user.pendingChests = (user.pendingChests || 0) + 1;
    report.chestsEarned = 1;
    user.nextChestLevel = newLevel + randInt(SETTINGS.CHEST_MIN_LEVELS, SETTINGS.CHEST_MAX_LEVELS);
  }
  return report;
}

/* Join two reports together (used when XP is added more than once in one action) */
function mergeReports(a, b) {
  return {
    amount: a.amount + b.amount,
    oldLevel: a.oldLevel,
    newLevel: b.newLevel,
    leveledUp: b.newLevel > a.oldLevel,
    rankUps: [...a.rankUps, ...b.rankUps],
    chestsEarned: a.chestsEarned + b.chestsEarned
  };
}

/* ----- 5h. Critters -----
   Matches whole words only. The old code matched inside words, so "Mop floors"
   unlocked the toilet critter because "floors" contains "loo". */
function findMatchingCritters(task) {
  const text = [task.name || '', ...getEquipment(task)].join(' | ').toLowerCase();
  return CRITTER_CATALOG.filter(critter =>
    critter.keywords.some(word => new RegExp('\\b' + escapeRegExp(word) + '(?:s|es)?\\b').test(text))
  );
}

/* Give matching critters XP, unlocking or levelling them. Returns what happened. */
function updateCritters(user, task) {
  const events = [];
  for (const critter of findMatchingCritters(task)) {
    if (!user.critters[critter.id]) {
      user.critters[critter.id] = { lvl: 1, xp: 0 };
      events.push({ type: 'unlock', name: critter.name });
    } else {
      const c = user.critters[critter.id];
      c.lvl = c.lvl || 1;
      c.xp = (c.xp || 0) + SETTINGS.CRITTER_XP_PER_CHORE;
      if (c.xp >= c.lvl * SETTINGS.CRITTER_XP_PER_LEVEL) {
        c.lvl += 1;
        c.xp = 0;
        events.push({ type: 'level', name: critter.name, level: c.lvl });
      }
    }
  }
  return events;
}

/* ----- 5i. Mystery chest loot ----- */
function pickWeighted(table) {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return table[table.length - 1];
}

function rollChestItem(level, excludeCoal = false) {
  const table = excludeCoal ? SETTINGS.CHEST_LOOT.filter(e => e.type !== 'coal') : SETTINGS.CHEST_LOOT;
  const type = pickWeighted(table).type;
  if (type === 'xp') {
    /* Bigger prizes at higher levels, with some randomness */
    const amount = Math.round((60 + level * 15) * (0.75 + Math.random() * 0.75) / 5) * 5;
    return { type, amount };
  }
  return { type };
}

/* Decide what is inside each of the 3 chests. */
function rollChestOffer(level) {
  const offer = [rollChestItem(level), rollChestItem(level), rollChestItem(level)];
  if (SETTINGS.CHEST_ALWAYS_HAS_PRIZE && offer.every(item => item.type === 'coal')) {
    offer[randInt(0, 2)] = rollChestItem(level, true);   // swap one lump of coal for something good
  }
  return offer;
}

/* How each item looks on screen */
function describeChestItem(item) {
  switch (item.type) {
    case 'xp':    return { emoji: '✨', text: `+${item.amount} XP`, small: 'A pile of sparkling XP!' };
    case 'saver': return { emoji: '🛡️', text: '+1 Streak Saver', small: 'Protects your streak if you miss a day.' };
    case 'boost': return { emoji: '⚡', text: `2x XP for ${SETTINGS.BOOST_HOURS}h`, small: 'Every chore earns double XP!' };
    default:      return { emoji: '🪨', text: 'Lump of coal', small: 'Better luck next time… it goes in your profile!' };
  }
}

/* Actually give the prize to the player. Returns an XP report if XP was involved. */
function applyChestItem(user, item) {
  if (item.type === 'coal') { user.coal = (user.coal || 0) + 1; return null; }
  if (item.type === 'saver') { user.streakSavers = (user.streakSavers || 0) + 1; return null; }
  if (item.type === 'boost') {
    const start = Math.max(Date.now(), user.xpBoostUntil || 0);   // stacks onto an existing boost
    user.xpBoostUntil = start + SETTINGS.BOOST_HOURS * 3600000;
    return null;
  }
  return addXp(user, item.amount);   // 'xp'
}


/* ==========================================================================
   PART 6: CHORE MATHS
   Works out how overdue each chore is, scores each room, and decides which
   chores to recommend. Still no drawing: this only calculates.
   ========================================================================== */

/* Equipment is now a list, e.g. ['Dyson', 'Cloth'].
   Old chores stored it as one text string "Dyson, Cloth" in a field called
   "products", so we still understand those (this is called "backwards compatible"). */
function getEquipment(task) {
  if (Array.isArray(task.equipment)) return task.equipment.filter(Boolean);
  if (typeof task.products === 'string') return task.products.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/* Every equipment name used anywhere (so custom ones you typed show up as options) */
function collectKnownEquipment() {
  const all = [];
  getAllTasks().forEach(t => all.push(...getEquipment(t)));
  return all;
}

function getLinkedIds(task) {
  return Array.isArray(task.linkedTaskIds) ? task.linkedTaskIds : [];
}

/* The linked chores that still exist and aren't archived */
function getLinkedTasks(task) {
  return getLinkedIds(task).map(id => taskById.get(id)).filter(t => t && !t.archived);
}

function roomEmoji(roomName) {
  const lower = String(roomName || '').toLowerCase();
  for (const [word, emoji] of ROOM_EMOJIS) { if (lower.includes(word)) return emoji; }
  return '🏠';
}

/* ----- 6a. How overdue is one chore? ----- */
function computeTaskBasics(task) {
  const today = todayStr();
  /* A chore with no valid date counts as "done today" (same as the old behaviour) */
  const lastDone = parseDateStr(task.lastDone) ? task.lastDone : today;
  const interval = Math.max(1, parseInt(task.interval, 10) || 1);

  const daysElapsed = Math.max(0, daysBetween(lastDone, today));  // days since it was last done
  const daysOverdue = daysElapsed - interval;                     // > 0 late, 0 due today, < 0 not due yet
  const overdueRatio = daysElapsed / interval;                    // 1.0 = exactly due, 2.0 = twice as long as it should be

  let tier = 'upcoming';
  if (daysOverdue >= 0 && daysOverdue <= SETTINGS.FRESH_OVERDUE_DAYS) tier = 'fresh';   // due today to 3 days late
  else if (daysOverdue > SETTINGS.FRESH_OVERDUE_DAYS) tier = 'stale';                    // long overdue

  return {
    ...task,
    room: (task.room || 'General').trim() || 'General',
    timeTag: task.timeTag || 'medium',
    interval, daysElapsed, daysOverdue, overdueRatio, tier,
    doneToday: lastDone === today && !!task.lastDone,
    equipmentList: getEquipment(task)
  };
}

/* ----- 6b. Analyse every active chore -----
   Done in three passes:
     1. work out overdue-ness for each chore
     2. use that to score each room (and the whole house)
     3. use the room scores to give each chore its priority score
   The old code did this inside one function that ALSO changed the screen, which
   caused bugs. Now this function only returns numbers. */
function analyseTasks(allTasks) {
  const active = allTasks.filter(t => !t.archived);

  // Pass 1
  const basics = active.map(computeTaskBasics);

  // Pass 2: room scores
  const rooms = {};
  basics.forEach(b => {
    if (!rooms[b.room]) rooms[b.room] = { sumRatio: 0, count: 0, late: 0 };
    rooms[b.room].sumRatio += b.overdueRatio;
    rooms[b.room].count += 1;
    if (b.daysOverdue > 0) rooms[b.room].late += 1;
  });

  const roomScores = {};
  const roomInfo = {};
  let scoreSum = 0;
  const roomNames = Object.keys(rooms);
  roomNames.forEach(name => {
    const avgRatio = rooms[name].sumRatio / rooms[name].count;
    /* Score is 100 when chores are done in good time, and falls as they become overdue */
    const score = clamp(Math.round(100 - (avgRatio - 0.5) * 50), 0, 100);
    roomScores[name] = score;
    roomInfo[name] = { score, total: rooms[name].count, late: rooms[name].late };
    scoreSum += score;
  });
  const overallScore = roomNames.length > 0 ? Math.round(scoreSum / roomNames.length) : 100;

  // Pass 3: priority score for each chore
  const stats = basics.map(b => {
    const roomCleanliness = roomScores[b.room] !== undefined ? roomScores[b.room] : 100;
    const roomDirtiness = (100 - roomCleanliness) / 100;                // 0 = spotless, 1 = filthy
    const overduePart = Math.min(b.overdueRatio, SETTINGS.MAX_OVERDUE_RATIO) * SETTINGS.OVERDUE_WEIGHT;
    const cleanlinessPart = roomDirtiness * SETTINGS.CLEANLINESS_WEIGHT;
    const starPart = b.isHighPriority ? SETTINGS.HIGH_PRIORITY_BONUS : 0;
    return { ...b, roomCleanliness, priorityScore: overduePart + cleanlinessPart + starPart };
  });

  const counts = {
    late: stats.filter(s => s.daysOverdue > 0).length,
    dueToday: stats.filter(s => s.daysOverdue === 0 && !s.doneToday).length,
    total: stats.length
  };

  return { stats, roomScores, roomInfo, overallScore, counts };
}

/* ----- 6c. Sorting -----
   Order of importance:
     1. Chores already done today go to the bottom.
     2. "fresh" (due today up to 3 days late) come first, so nothing slips
        through the cracks, then "stale" (long overdue), then "upcoming".
     3. Within each group, the higher priority score wins. */
const TIER_ORDER = { fresh: 0, stale: 1, upcoming: 2 };

function compareTasks(a, b) {
  if (a.doneToday !== b.doneToday) return a.doneToday ? 1 : -1;
  if (TIER_ORDER[a.tier] !== TIER_ORDER[b.tier]) return TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
  return b.priorityScore - a.priorityScore;
}

/* ----- 6d. Choosing the recommended chores -----
   - Mostly "fresh" chores (on time or just a few days late).
   - If something is long overdue, ONE of the recommended slots is kept for it
     (a "rescue" pick), so big neglected jobs still get a turn but don't take
     over the whole list.  */
function pickRecommended(candidates) {
  const N = SETTINGS.RECOMMENDED_COUNT;
  const fresh = candidates.filter(t => t.tier === 'fresh');
  const stale = candidates.filter(t => t.tier === 'stale');
  const upcoming = candidates.filter(t => t.tier === 'upcoming');

  const picks = [];
  const used = new Set();
  function add(task, reason) {
    if (!task || used.has(task.id) || picks.length >= N) return;
    used.add(task.id);
    picks.push({ ...task, recReason: reason });
  }

  const freshSlots = stale.length > 0 ? N - 1 : N;          // keep one slot free for a rescue pick
  fresh.slice(0, freshSlots).forEach(t => add(t, 'fresh'));
  if (stale.length > 0) add(stale[0], 'rescue');

  /* Still have empty slots? Fill them in this order: fresh, stale, upcoming */
  fresh.forEach(t => add(t, 'fresh'));
  stale.forEach(t => add(t, 'overdue'));
  upcoming.forEach(t => add(t, 'soon'));
  return picks;
}

/* Text for the "due" badge on a chore card */
function dueLabel(t) {
  if (t.doneToday) return '✓ Done today';
  if (t.daysOverdue > 0) return `${plural(t.daysOverdue, 'day')} overdue`;
  if (t.daysOverdue === 0) return 'Due today';
  return `Due in ${plural(-t.daysOverdue, 'day')}`;
}

/* ==========================================================================
   PART 7: DRAWING THE SCREEN
   These functions turn data into HTML. The pattern is always:
       1. build a piece of HTML text using a template string
       2. put it inside a container with  element.innerHTML = ...

   TABS: the page has three tab panels (Me / House / Activity) and only one is
   visible at a time (see switchTab() in Part 11). To keep things simple, the
   render functions below always update ALL THREE, even the ones currently
   hidden. That way whichever tab you switch to is instantly up to date,
   and the app stays small enough that re-drawing all of it is unnoticeable.
   ========================================================================== */

/* ----- 7a. Circular progress ring (SVG) -----
   An SVG circle with a dashed outline. By changing how much of the dash is
   "hidden" (stroke-dashoffset) we show a percentage. */
function setRing(containerId, { percent, size, stroke, color, inner }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamp(percent, 0, 100) / 100);

  let fill = el.querySelector('.ring-fill');
  if (!fill) {   // first time: build the ring (starting empty so it can animate filling up)
    el.innerHTML = `
      <div class="ring" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"></circle>
          <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>
        </svg>
        <div class="ring-inner"></div>
      </div>`;
    fill = el.querySelector('.ring-fill');
    void fill.getBoundingClientRect();   // forces the browser to notice the empty ring before we fill it
  }
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = color;
  el.querySelector('.ring-inner').innerHTML = inner;
}

/* Colour for a cleanliness score: green = good, amber = so-so, red = needs help */
function scoreColour(score) {
  if (score >= 70) return '#7cd0a2';
  if (score >= 40) return '#e8bb6c';
  return '#f28b82';
}
function scoreTextColour(score) {
  if (score >= 70) return '#23875a';
  if (score >= 40) return '#a86a12';
  return '#c73b3b';
}
function scoreMessage(score) {
  if (score >= 90) return 'Pristine! Nice work.';
  if (score >= 70) return 'Looking good.';
  if (score >= 55) return 'Getting a bit lived-in.';
  if (score >= 40) return 'Needs some attention.';
  return '⚠️ Critical! Time to clean.';
}

/* ----- 7b. House overview: big ring and room cards ----- */
function renderHouseOverview(analysis) {
  const score = analysis.overallScore;
  setRing('house-ring', {
    percent: score, size: 112, stroke: 12, color: scoreColour(score),
    inner: `<span style="font-size:1.9rem;color:${scoreTextColour(score)}" id="overall-score-display">${score}%</span>`
  });
  document.getElementById('overall-score-status').textContent = scoreMessage(score);
}

function renderRoomScores(analysis) {
  const container = document.getElementById('room-scores-list');
  const rooms = Object.keys(analysis.roomInfo).sort((a, b) => analysis.roomInfo[a].score - analysis.roomInfo[b].score);   // messiest first

  if (rooms.length === 0) {
    container.innerHTML = `<div class="hint">No rooms yet. Add a chore to get started!</div>`;
    return;
  }

  container.innerHTML = rooms.map(room => {
    const info = analysis.roomInfo[room];
    const active = selectedRoomFilter === room ? 'active-filter' : '';
    return `
      <button class="room-card ${active}" data-action="filter-room" data-room="${escapeHtml(room)}">
        <div class="room-top">
          <span class="room-emoji">${roomEmoji(room)}</span>
          <span class="room-score-val" style="color:${scoreTextColour(info.score)}">${info.score}%</span>
        </div>
        <div class="room-card-name">${escapeHtml(room)}</div>
        <div class="mini-bar"><div style="width:${info.score}%;background:${scoreColour(info.score)}"></div></div>
      </button>`;
  }).join('');
}

/* Keep the suggestion list for the "Room" text boxes up to date */
function updateRoomDatalist() {
  const rooms = new Set(['General', 'Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Hallway']);
  getAllTasks().forEach(t => { if (t.room) rooms.add(t.room.trim()); });
  document.getElementById('room-suggestions').innerHTML =
    [...rooms].sort().map(r => `<option value="${escapeHtml(r)}"></option>`).join('');
}

/* ----- 7c. Chore cards ----- */
function timeLabel(timeTag) {
  if (timeTag === 'short') return '⚡ Short';
  if (timeTag === 'long') return '⌛ Long';
  return '⏱️ Medium';
}

function taskCardHtml(t, opts = {}) {
  const isArchived = !!opts.archived;
  const isSelected = selectedIds.has(t.id);
  const inSelectMode = selectMode && !isArchived;

  const classes = ['task-card', `tier-${t.tier}`];
  if (t.inProgressBy) classes.push('is-in-progress');
  if (t.doneToday && !isArchived) classes.push('is-done');
  if (isArchived) classes.push('is-archived');
  if (inSelectMode) classes.push('selectable');
  if (inSelectMode && isSelected) classes.push('selected');

  /* Badges row */
  const badges = [`<span class="badge-pill room-tag">${roomEmoji(t.room)} ${escapeHtml(t.room)}</span>`,
                  `<span class="badge-pill time-tag">${timeLabel(t.timeTag)}</span>`];
  if (!isArchived) {
    const dueClass = t.doneToday ? '' : (t.daysOverdue > 0 && t.tier === 'stale' ? 'stale' : (t.daysOverdue >= 0 ? 'fresh' : ''));
    badges.push(`<span class="badge-pill due-tag ${dueClass}">${dueLabel(t)}</span>`);
  }
  if (t.inProgressBy) badges.push(`<span class="badge-pill progress-tag">🚧 ${escapeHtml(t.inProgressBy)} is on it</span>`);
  if (t.oneOff) badges.push(`<span class="badge-pill oneoff-tag">One-off job</span>`);

  /* Equipment chips (max 3 shown) - this is what replaced the old dotted underline */
  const equip = t.equipmentList || [];
  const equipHtml = equip.length
    ? `<div class="equip-chips">${equip.slice(0, 3).map(e => `<span class="equip-mini">${escapeHtml(e)}</span>`).join('')}${equip.length > 3 ? `<span class="equip-mini">+${equip.length - 3}</span>` : ''}</div>`
    : '';

  /* Linked chores */
  const linked = getLinkedTasks(t);
  const linkedHtml = linked.length
    ? `<div class="link-chips">🔗 ${linked.slice(0, 2).map(l => escapeHtml(l.name)).join(', ')}${linked.length > 2 ? ` +${linked.length - 2} more` : ''}</div>`
    : '';

  /* Action buttons (hidden in select mode) */
  let actionsHtml = '';
  let rightHtml = '';
  if (!inSelectMode) {
    if (isArchived) {
      actionsHtml = `
        <button class="action-icon-btn" data-action="restore-task" data-id="${escapeHtml(t.id)}"><i data-lucide="archive-restore"></i> Restore</button>
        <button class="action-icon-btn" data-action="delete-task" data-id="${escapeHtml(t.id)}"><i data-lucide="trash-2"></i> Delete</button>`;
    } else {
      actionsHtml = `
        <button class="action-icon-btn" data-action="edit-task" data-id="${escapeHtml(t.id)}"><i data-lucide="pencil"></i> Edit</button>
        ${t.inProgressBy
          ? `<button class="action-icon-btn" data-action="stop-task" data-id="${escapeHtml(t.id)}"><i data-lucide="square"></i> Stop</button>`
          : (t.doneToday ? '' : `<button class="action-icon-btn" data-action="start-task" data-id="${escapeHtml(t.id)}"><i data-lucide="play"></i> Start</button>`)}`;
      rightHtml = t.doneToday
        ? `<button class="complete-btn" disabled><i data-lucide="check"></i> Done</button>`
        : `<button class="complete-btn" data-action="complete-task" data-id="${escapeHtml(t.id)}"><i data-lucide="check"></i> Done</button>`;
    }
  }

  const selectBox = inSelectMode ? `<span class="select-box">✓</span>` : '';
  const cardAttrs = inSelectMode ? `data-action="toggle-select" data-id="${escapeHtml(t.id)}" role="checkbox" aria-checked="${isSelected}"` : '';
  const barPct = clamp(t.overdueRatio * 100, 0, 100);

  return `
    <div class="${classes.join(' ')}" ${cardAttrs}>
      ${selectBox}
      <div class="task-info">
        <div class="task-title-row">
          ${t.isHighPriority ? '<span class="task-star">★</span>' : ''}
          <span>${escapeHtml(t.name)}</span>
        </div>
        <div class="task-badges">${badges.join('')}</div>
        ${equipHtml}
        ${linkedHtml}
        <div class="task-actions">${actionsHtml}</div>
      </div>
      ${rightHtml}
      ${isArchived ? '' : `<div class="due-bar"><div class="due-bar-fill" style="width:${barPct}%"></div></div>`}
    </div>`;
}

function renderTaskList(containerId, tasks, emptyHtml) {
  const container = document.getElementById(containerId);
  if (!tasks || tasks.length === 0) {
    container.innerHTML = emptyHtml || '';
    return;
  }
  container.innerHTML = tasks.map(t => taskCardHtml(t)).join('');
}

function renderArchived() {
  const archived = getAllTasks().filter(t => t.archived)
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0))
    .map(computeTaskBasics);
  const section = document.getElementById('archived-section');
  section.hidden = archived.length === 0;
  document.getElementById('archived-toggle-text').textContent =
    `${showArchived ? 'Hide' : 'Show'} archived jobs (${archived.length})`;
  document.getElementById('archived-container').hidden = !showArchived;
  document.getElementById('archived-list').innerHTML =
    archived.map(t => taskCardHtml(t, { archived: true })).join('');
}

/* ----- 7d. HOUSE TAB: the chore list ----- */
function renderHouseTab() {
  const allTasks = getAllTasks();
  taskById = new Map(allTasks.map(t => [t.id, t]));

  const analysis = analyseTasks(allTasks);
  lastAnalysis = analysis;

  /* If the tapped room no longer exists, forget the filter */
  if (selectedRoomFilter && !analysis.roomInfo[selectedRoomFilter]) selectedRoomFilter = null;

  updateRoomDatalist();
  renderHouseOverview(analysis);
  renderRoomScores(analysis);

  /* Room banner */
  const indicator = document.getElementById('room-filter-indicator');
  indicator.hidden = !selectedRoomFilter;
  if (selectedRoomFilter) document.getElementById('filter-room-name').textContent = selectedRoomFilter;

  /* --- Apply filters: room, search text, time length --- */
  let list = analysis.stats;
  if (selectedRoomFilter) list = list.filter(t => t.room === selectedRoomFilter);

  const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  if (searchQuery) list = list.filter(t => (t.name || '').toLowerCase().includes(searchQuery));

  const timeFilter = document.getElementById('time-filter-select').value;
  if (timeFilter !== 'all') list = list.filter(t => t.timeTag === timeFilter);

  const filtersActive = !!(selectedRoomFilter || searchQuery || timeFilter !== 'all');
  list = [...list].sort(compareTasks);
  lastVisibleIds = list.map(t => t.id);

  /* --- Split into the three lists --- */
  const inProgress = list.filter(t => t.inProgressBy);
  const rest = list.filter(t => !t.inProgressBy);
  const recommended = pickRecommended(rest.filter(t => !t.doneToday));
  const recommendedIds = new Set(recommended.map(t => t.id));
  const others = rest.filter(t => !recommendedIds.has(t.id));

  document.getElementById('in-progress-section').hidden = inProgress.length === 0;
  renderTaskList('in-progress-list', inProgress);

  const stillLoading = isFirebaseConfigured && !dataReady;
  const emptyRecommended = stillLoading
    ? `<div class="empty-state"><strong>Loading your chores…</strong>Just a moment.</div>`
    : filtersActive
      ? `<div class="empty-state"><strong>No chores match</strong>Try clearing your filters.</div>`
      : (allTasks.some(t => !t.archived)
          ? `<div class="empty-state"><strong>🎉 All caught up!</strong>Nothing left to recommend right now.</div>`
          : `<div class="empty-state"><strong>No chores yet</strong>Tap "Add chore" above to create your first one.</div>`);
  renderTaskList('top-3-list', recommended, emptyRecommended);

  renderTaskList('all-tasks-list', others,
    `<div class="empty-state">No other chores to show.</div>`);
  document.getElementById('all-tasks-container').hidden = !showAllTasks;
  document.getElementById('toggle-text').textContent =
    showAllTasks ? 'Hide full list' : `Show all other chores (${others.length})`;

  renderArchived();
  updateSelectToolbar();

  if (!isFirebaseConfigured || dataReady) maybeSendDiscordAlert(analysis.overallScore);
}

/* ----- 7e. ME TAB: profile, stats, coal and critters ----- */

/* "Chores done" is worked out from the completion history rather than a
   running counter, so it's correct even for chores completed before this
   stat existed - the history already had the data, we just weren't reading it. */
function countChoresDone(username) {
  return completedLogs.filter(l => isChoreLog(l) && l.completedBy === username).length;
}

function renderMeTab() {
  const user = getUser();
  const nameEl = document.getElementById('current-user-display');

  if (!user) {
    nameEl.textContent = 'Choose a user';
    document.getElementById('user-avatar').textContent = '?';
    document.getElementById('me-stat-grid').innerHTML = '';
    document.getElementById('coal-card').innerHTML = '';
    renderCritterCatalog();
    return;
  }

  const { level, currentLevelXp, xpForNext } = calculateLevel(user.xp);
  const rank = getRank(level);

  nameEl.textContent = currentUser;
  document.getElementById('user-avatar').textContent = currentUser.charAt(0).toUpperCase();
  document.getElementById('user-lvl-badge').textContent = `Lvl ${level}`;
  document.getElementById('user-rank-title').textContent = `${rank.emoji} ${rank.title}`;
  document.getElementById('xp-bar-fill').style.width = `${Math.floor((currentLevelXp / xpForNext) * 100)}%`;
  document.getElementById('xp-current-text').textContent = `${currentLevelXp} / ${xpForNext} XP`;

  /* Daily goal ring + text */
  const goal = getDailyGoal(user);
  const count = getDailyCount(user);
  const met = hasMetGoalToday(user) || count >= goal;
  setRing('goal-ring', {
    percent: (Math.min(count, goal) / goal) * 100, size: 60, stroke: 7,
    color: met ? '#7cd0a2' : '#86a7ee',
    inner: `<span style="font-size:1.2rem">${Math.min(count, goal)}<small>of ${goal}</small></span>`
  });
  document.querySelector('.goal-row').classList.toggle('goal-met', met);
  document.getElementById('me-goal-select').value = String(goal);
  document.getElementById('goal-title').textContent = (user.streak || 0) > 0
    ? `Daily goal: ${plural(goal, 'chore')} to continue your ${user.streak}-day streak`
    : `Daily goal: ${plural(goal, 'chore')} to start a streak`;
  document.getElementById('goal-sub').textContent = met
    ? 'Complete for today! Extra chores still earn XP.'
    : `${count} of ${goal} done today`;

  document.getElementById('user-streak-text').textContent = `🔥 ${user.streak || 0} day streak`;
  document.getElementById('user-savers-text').textContent = `🛡️ ${plural(user.streakSavers || 0, 'saver')}`;

  const boost = document.getElementById('user-boost-badge');
  boost.hidden = !isXpBoostActive(user);
  if (!boost.hidden) boost.textContent = `⚡ 2x XP (${boostTimeLeftText(user)})`;

  const chestBtn = document.getElementById('chest-ready-btn');
  chestBtn.hidden = !(user.pendingChests > 0);
  if (user.pendingChests > 0) {
    document.getElementById('chest-ready-text').textContent =
      user.pendingChests === 1 ? 'A mystery chest is ready! Tap to open' : `${user.pendingChests} mystery chests ready! Tap to open`;
  }

  /* Stat grid */
  const critterCount = Object.keys(user.critters || {}).length;
  document.getElementById('me-stat-grid').innerHTML = `
    <div class="stat-box"><strong>${(user.xp || 0).toLocaleString()}</strong><span>Total XP</span></div>
    <div class="stat-box"><strong>${countChoresDone(currentUser)}</strong><span>Chores done</span></div>
    <div class="stat-box"><strong>${user.bestStreak || 0}</strong><span>Best streak</span></div>
    <div class="stat-box"><strong>🛡️ ${user.streakSavers || 0}</strong><span>Streak savers</span></div>
    <div class="stat-box"><strong>${critterCount}/${CRITTER_CATALOG.length}</strong><span>Critters</span></div>
    <div class="stat-box"><strong>${user.chestsOpened || 0}</strong><span>Chests opened</span></div>`;

  /* Coal card */
  const coal = user.coal || 0;
  document.getElementById('coal-card').innerHTML = `
    <div class="coal-head"><span>🪨 Lumps of coal</span><strong>${coal}</strong></div>
    <div class="coal-caption">${coalCaption(coal)}</div>
    ${coal > 0 ? `<div class="coal-pile">${'🪨'.repeat(Math.min(coal, 30))}${coal > 30 ? ` <small>+${coal - 30}</small>` : ''}</div>` : ''}`;

  renderCritterCatalog();
}

function coalCaption(n) {
  if (n === 0) return 'None yet. Lucky you!';
  if (n <= 2) return 'A humble start.';
  if (n <= 5) return 'Enough to warm your hands.';
  if (n <= 10) return 'A respectable pile.';
  if (n <= 20) return 'You could open a barbecue.';
  return 'Your coal shed is legendary.';
}

/* Critters, highest level shown first. Locked ones (no level yet) go at the
   end, in catalog order. */
function renderCritterCatalog() {
  const container = document.getElementById('critter-carousel');
  const user = getUser();
  const owned = (user && user.critters) || {};

  const sorted = [...CRITTER_CATALOG].sort((a, b) => {
    const la = owned[a.id] ? (owned[a.id].lvl || 1) : -1;
    const lb = owned[b.id] ? (owned[b.id].lvl || 1) : -1;
    return lb - la;   // highest level first; locked (-1) sink to the bottom
  });
  const unlockedCount = CRITTER_CATALOG.filter(c => owned[c.id]).length;
  document.getElementById('critter-count').textContent = `${unlockedCount} / ${CRITTER_CATALOG.length} found`;

  container.innerHTML = sorted.map(critter => {
    const data = owned[critter.id];
    /* If the picture file is missing, a listener in Part 11 swaps in an emoji instead */
    const img = `<img class="critter-img" src="${escapeHtml(critter.image)}" alt="${data ? escapeHtml(critter.name) : ''}" loading="lazy">`;

    if (data) {
      const target = (data.lvl || 1) * SETTINGS.CRITTER_XP_PER_LEVEL;
      const pct = clamp(Math.floor(((data.xp || 0) / target) * 100), 0, 100);
      return `
        <button class="critter" data-action="open-critter" data-id="${escapeHtml(critter.id)}">
          <div class="critter-img-wrap">${img}</div>
          <strong class="critter-name">${escapeHtml(critter.name)}</strong>
          <span class="critter-lvl">Lvl ${data.lvl || 1}</span>
          <div class="mini-bar"><div style="width:${pct}%"></div></div>
          <span class="critter-xp">${data.xp || 0}/${target} XP</span>
        </button>`;
    }
    return `
      <button class="critter locked" data-action="open-critter" data-id="${escapeHtml(critter.id)}">
        <div class="critter-img-wrap">${img}<span class="critter-lock">🔒</span></div>
        <strong class="critter-name">???</strong>
        <div class="mini-bar"><div style="width:0%"></div></div>
      </button>`;
  }).join('');
}

/* ----- 7f. ACTIVITY TAB: leaderboard + history ----- */
function isChoreLog(log) { return !log.type || log.type === 'chore'; }   // old logs have no "type"

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  const today = todayStr();
  let startDate = today;                                   // "today"
  if (activeLeaderboardTab === 'week') startDate = addDaysStr(today, -6);
  if (activeLeaderboardTab === 'month') startDate = addDaysStr(today, -29);

  const scores = {};
  Object.keys(appUsers).forEach(name => { scores[name] = { xp: 0, chores: 0 }; });

  if (activeLeaderboardTab === 'all') {
    Object.entries(appUsers).forEach(([name, u]) => { scores[name] = { xp: u.xp || 0, chores: countChoresDone(name) }; });
  } else {
    completedLogs.forEach(log => {
      const entry = scores[log.completedBy];
      if (!entry || !log.date || log.date < startDate || log.date > today) return;
      entry.xp += typeof log.xpEarned === 'number' ? log.xpEarned : 20;   // very old logs had no xpEarned
      if (isChoreLog(log)) entry.chores += 1;
    });
  }

  const ranked = Object.entries(scores)
    .map(([name, s]) => {
      const u = appUsers[name] || {};
      return { name, xp: s.xp, chores: s.chores, streak: u.streak || 0, level: calculateLevel(u.xp || 0).level, boost: isXpBoostActive(u) };
    })
    .sort((a, b) => b.xp - a.xp || b.chores - a.chores);

  const earners = ranked.filter(p => p.xp > 0);
  if (earners.length === 0) {
    container.innerHTML = `<div class="empty-state"><strong>Nobody on the board yet</strong>Finish a chore to take the lead!</div>`;
    return;
  }

  /* Podium for the top three (only when there are at least two people to compare) */
  let podiumHtml = '';
  let listFrom = 0;
  if (earners.length >= 2) {
    const top = earners.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const slot = (p, i) => `
      <div class="podium-slot rank-${i + 1}">
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-xp">${p.xp.toLocaleString()} XP</div>
        <div class="podium-block">${medals[i]}</div>
      </div>`;
    const order = top.length === 3 ? [1, 0, 2] : [1, 0];      // 2nd | 1st | 3rd, so the winner is in the middle
    podiumHtml = `<div class="podium">${order.map(i => slot(top[i], i)).join('')}</div>`;
    listFrom = top.length;
  }

  const rows = ranked.slice(listFrom).map((p, i) => `
    <div class="leaderboard-item">
      <span class="lb-rank">${listFrom + i + 1}</span>
      <div class="lb-main">
        <div class="lb-name">${escapeHtml(p.name)} ${p.boost ? '⚡' : ''}</div>
        <div class="lb-sub">${escapeHtml(getRankTitle(p.level))}, 🔥 ${p.streak}d streak</div>
      </div>
      <div class="lb-right">
        <span class="level-badge">Lvl ${p.level}</span>
        <div class="lb-xp">${activeLeaderboardTab === 'all' ? '' : '+'}${p.xp.toLocaleString()} XP, ${plural(p.chores, 'chore')}</div>
      </div>
    </div>`).join('');

  container.innerHTML = podiumHtml + rows;
}

function renderCalendar() {
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

  const choreLogs = completedLogs.filter(isChoreLog);
  const today = todayStr();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstWeekday; i++) html += '<div></div>';      // empty cells before the 1st

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const count = choreLogs.filter(l => l.date === dateStr).length;
    html += `<button class="cal-day ${count ? 'has-logs' : ''} ${dateStr === today ? 'is-today' : ''}" data-action="show-day" data-date="${dateStr}">
               ${day}${count ? `<small>${count}</small>` : ''}
             </button>`;
  }
  document.getElementById('calendar-grid').innerHTML = html;
}

function renderActivityTab() {
  renderLeaderboard();
  renderCalendar();
}

/* ----- 7g. Select-mode toolbar ----- */
function updateSelectToolbar() {
  const bar = document.getElementById('select-toolbar');
  bar.hidden = !selectMode;
  document.getElementById('select-mode-btn').classList.toggle('is-on', selectMode);
  document.getElementById('select-count').textContent = `${selectedIds.size} selected`;
}

/* ----- 7h. Discord alert (only when the house is in bad shape) ----- */
async function maybeSendDiscordAlert(score) {
  if (!DISCORD_WEBHOOK_URL || score >= SETTINGS.ALERT_BELOW_SCORE) return;
  const last = Number(localStorage.getItem('cleanDeckLastAlert') || 0);
  if (Date.now() - last < SETTINGS.ALERT_COOLDOWN_HOURS * 3600000) return;   // don't spam
  localStorage.setItem('cleanDeckLastAlert', String(Date.now()));            // remember, even after a page refresh
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🚨 **CleanDeck Alert!**\nOverall house cleanliness has dropped to **${score}%**! Time to complete some chores.` })
    });
  } catch (error) {
    console.error('Failed to send Discord alert:', error);
  }
}

/* ----- 7i. The main "redraw everything" function -----
   Called after anything changes. Updates all three tabs, then lets whichever
   one is currently visible show up to date without any extra work. */
function render() {
  renderHouseTab();
  renderMeTab();
  renderActivityTab();
  refreshIcons();
}



/* ==========================================================================
   PART 8: THINGS YOU CAN DO (actions)
   Each function here happens when someone taps a button.
   ========================================================================== */

/* Before doing anything that earns XP we need to know who you are, and (when
   using Firebase) that the shared data has finished loading. Otherwise we could
   accidentally overwrite your real XP with an empty profile. */
function requireUser() {
  if (isFirebaseConfigured && !dataReady) {          // check this FIRST: until data arrives we can't know who exists
    showToast('Still loading. Try again in a moment.');
    return null;
  }
  const user = getUser();
  if (!user) {
    openUserModal();
    showToast('Choose who you are first');
    return null;
  }
  return user;
}

/* ----- 8a. Filters and list toggles ----- */
function filterByRoom(roomName) {
  selectedRoomFilter = selectedRoomFilter === roomName ? null : roomName;   // tap again to un-filter
  render();
}
function clearRoomFilter() { selectedRoomFilter = null; render(); }
function toggleAllTasks() { showAllTasks = !showAllTasks; render(); }
function toggleArchived() { showArchived = !showArchived; render(); }

/* ----- 8b. Completing a chore -----
   This is the heart of the game. Step by step:
     1. work out the XP (pre-set for the chore, plus streak bonus, plus boost)
     2. update critters
     3. count it towards the daily goal (which keeps the streak alive)
     4. add the XP (which may level you up and earn a chest)
     5. save everything, then show the reward pop-up */
async function completeTask(id) {
  const user = requireUser();
  if (!user) return;

  const task = getAllTasks().find(t => t.id === id);
  if (!task) return;

  const today = todayStr();
  if (task.lastDone === today) { showToast('That one is already done today!'); return; }

  refreshStreak(user);   // make sure the streak is up to date before we add to it

  /* 1. XP */
  const baseXp = getTaskXp(task);
  const streakPct = Math.min(SETTINGS.STREAK_BONUS_MAX, (user.streak || 0) * SETTINGS.STREAK_BONUS_PER_DAY);
  const streakBonus = Math.round(baseXp * streakPct);
  const boosted = isXpBoostActive(user);
  let choreXp = baseXp + streakBonus;
  if (boosted) choreXp *= 2;

  /* 2. Critters */
  const critterEvents = updateCritters(user, task);

  /* 3. Daily goal and streak */
  if (!user.dailyProgress || user.dailyProgress.date !== today) user.dailyProgress = { date: today, count: 0 };
  user.dailyProgress.count += 1;

  const goal = getDailyGoal(user);
  let goalJustMet = false;
  let goalBonus = 0;
  if (user.dailyProgress.count >= goal && user.lastGoalDate !== today) {
    goalJustMet = true;
    goalBonus = SETTINGS.DAILY_GOAL_BONUS_XP;
    const hitYesterday = user.lastGoalDate === addDaysStr(today, -1);
    user.streak = hitYesterday ? (user.streak || 0) + 1 : 1;    // continue the streak, or start a new one
    user.bestStreak = Math.max(user.bestStreak || 0, user.streak);
    user.lastGoalDate = today;
  }
  user.lastActiveDate = today;
  user.totalChores = (user.totalChores || 0) + 1;

  /* 4. Add the XP */
  const totalXp = choreXp + goalBonus;
  const report = addXp(user, totalXp);

  /* 5. Save. The linked chores are worked out first, using the data from before saving. */
  const linkedToOffer = getLinkedTasks(task)
    .map(computeTaskBasics)
    .filter(l => !l.doneToday && !l.inProgressBy);

  try {
    await saveUserDoc(currentUser);
    const taskFields = { lastDone: today, lastDoneBy: currentUser, inProgressBy: null, inProgressAt: null };
    if (task.oneOff) { taskFields.archived = true; taskFields.archivedAt = Date.now(); }   // finished one-off jobs tidy themselves away
    await saveTaskDoc(id, taskFields);
    await addLogEntry({
      type: 'chore', taskId: id, name: task.name, date: today,
      timestamp: Date.now(), completedBy: currentUser, xpEarned: totalXp
    });
  } catch (error) {
    console.error(error);
    showToast('⚠️ Something went wrong saving that chore.');
  }

  /* 6. Build the pop-up */
  const lines = [];
  if (streakBonus > 0) lines.push({ cls: 'streak', html: `🔥 +${streakBonus} XP streak bonus (${user.streak}-day streak)` });
  if (boosted) lines.push({ cls: 'streak', html: '⚡ 2x XP boost doubled your chore XP!' });
  if (goalJustMet) {
    lines.push({ cls: 'goal', html: `🎯 Daily goal complete! +${goalBonus} XP bonus. Streak: ${user.streak} ${user.streak === 1 ? 'day' : 'days'} 🔥` });
  } else if (user.dailyProgress.count < goal) {
    lines.push({ cls: 'goal', html: `🎯 Daily goal: ${user.dailyProgress.count} of ${goal} done` });
  }
  critterEvents.forEach(ev => {
    lines.push({ cls: 'line-critter', html: ev.type === 'unlock'
      ? `🎉 New critter unlocked: <strong>${escapeHtml(ev.name)}</strong>!`
      : `⚡ ${escapeHtml(ev.name)} reached level ${ev.level}!` });
  });
  if (task.oneOff) lines.push({ cls: '', html: '📦 One-off job finished and archived. Nice one!' });

  showRewardPopup({
    title: task.oneOff ? '🎉 JOB FINISHED!' : '✅ CHORE COMPLETE!',
    main: `+${totalXp} XP`,
    sub: task.name,
    lines, report, linked: linkedToOffer,
    celebrate: goalJustMet || report.leveledUp
  });

  if (!isFirebaseConfigured) render();
  updateUserBar();
}

/* ----- 8c. In progress ----- */
async function startTask(id) {
  const user = requireUser();
  if (!user) return;
  await saveTaskDoc(id, { inProgressBy: currentUser, inProgressAt: Date.now() });
  showToast('🚧 Marked as in progress');
}
async function stopTask(id) {
  await saveTaskDoc(id, { inProgressBy: null, inProgressAt: null });
  showToast('Removed from in progress');
}

/* ----- 8d. Archive, restore, delete ----- */
async function archiveTask(id) {
  await saveTaskDoc(id, { archived: true, archivedAt: Date.now(), inProgressBy: null, inProgressAt: null });
  selectedIds.delete(id);
  showToast('🗄️ Chore archived');
}
async function restoreTask(id) {
  await saveTaskDoc(id, { archived: false, archivedAt: null });
  showToast('Chore restored');
}

async function deleteTask(id, skipConfirm = false) {
  const task = taskById.get(id);
  if (!skipConfirm && !confirm(`Delete "${task ? task.name : 'this chore'}"? This can't be undone.`)) return false;

  /* Remove this chore from other chores' "linked" lists first, so nothing points at a ghost */
  const pointingAtIt = getAllTasks().filter(t => getLinkedIds(t).includes(id));
  await Promise.all(pointingAtIt.map(t =>
    saveTaskDoc(t.id, { linkedTaskIds: getLinkedIds(t).filter(x => x !== id) })));

  await deleteTaskDoc(id);
  selectedIds.delete(id);
  return true;
}

/* Links are stored on BOTH chores, so we update the other side too.
   oldIds = links before editing, newIds = links after. */
async function syncLinks(taskId, oldIds, newIds) {
  const added = newIds.filter(x => !oldIds.includes(x));
  const removed = oldIds.filter(x => !newIds.includes(x));
  const writes = [];

  added.forEach(otherId => {
    const other = taskById.get(otherId);
    if (!other) return;
    const links = getLinkedIds(other);
    if (!links.includes(taskId)) writes.push(saveTaskDoc(otherId, { linkedTaskIds: [...links, taskId] }));
  });
  removed.forEach(otherId => {
    const other = taskById.get(otherId);
    if (!other) return;
    writes.push(saveTaskDoc(otherId, { linkedTaskIds: getLinkedIds(other).filter(x => x !== taskId) }));
  });
  await Promise.all(writes);
}

/* ----- 8e. Select several chores at once ----- */
function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  render();
}
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  render();
}
function selectAllVisible() {
  const allSelected = lastVisibleIds.length > 0 && lastVisibleIds.every(id => selectedIds.has(id));
  if (allSelected) selectedIds.clear();
  else lastVisibleIds.forEach(id => selectedIds.add(id));
  render();
}

async function bulkArchive() {
  const ids = [...selectedIds];
  if (ids.length === 0) { showToast('Tick some chores first'); return; }
  if (!confirm(`Archive ${plural(ids.length, 'chore')}? You can restore them later.`)) return;
  await Promise.all(ids.map(id =>
    saveTaskDoc(id, { archived: true, archivedAt: Date.now(), inProgressBy: null, inProgressAt: null })));
  selectedIds.clear();
  showToast(`🗄️ Archived ${plural(ids.length, 'chore')}`);
  render();
}

async function bulkDelete() {
  const ids = [...selectedIds];
  if (ids.length === 0) { showToast('Tick some chores first'); return; }
  if (!confirm(`Delete ${plural(ids.length, 'chore')} for good? This can't be undone.`)) return;
  for (const id of ids) await deleteTask(id, true);
  selectedIds.clear();
  showToast(`Deleted ${plural(ids.length, 'chore')}`);
  render();
}

function unionLists(a, b) { return [...new Set([...a, ...b])]; }   // combine two lists without duplicates

async function handleBulkEditSubmit(event) {
  event.preventDefault();
  const ids = [...selectedIds];
  if (ids.length === 0) return;

  const room = document.getElementById('be-room').value.trim();
  const time = document.getElementById('be-time').value;
  const interval = parseInt(document.getElementById('be-interval').value, 10);
  const lastDone = document.getElementById('be-lastdone').value;   // blank = no change
  const priority = document.getElementById('be-priority').value;
  const addEquipment = bulkEditPicker.getSelected();
  const linkAll = document.getElementById('be-link').checked;

  await Promise.all(ids.map(async id => {
    const task = taskById.get(id);
    if (!task) return;
    const fields = {};                                        // start empty, add only what changed
    if (room) fields.room = room;
    if (time) fields.timeTag = time;
    if (interval >= 1) fields.interval = interval;
    if (lastDone) fields.lastDone = lastDone;                   // a manual correction, not a "completion"
    if (priority === 'yes') fields.isHighPriority = true;
    if (priority === 'no') fields.isHighPriority = false;
    if (addEquipment.length) fields.equipment = unionLists(getEquipment(task), addEquipment);
    if (linkAll && ids.length > 1) fields.linkedTaskIds = unionLists(getLinkedIds(task), ids.filter(x => x !== id));
    if (Object.keys(fields).length > 0) await saveTaskDoc(id, fields);
  }));

  showToast(`Updated ${plural(ids.length, 'chore')}`);
  closeModals();
  selectMode = false;
  selectedIds.clear();
  render();
}

/* ==========================================================================
   PART 9: POP-UP WINDOWS AND FORMS
   ========================================================================== */

function openModal(id) {
  document.getElementById(id).classList.add('active');
  refreshIcons();
}
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

/* ----- 9a. Equipment picker (tap chips instead of typing) -----
   createEquipmentPicker() builds a little self-contained widget inside a
   container. It remembers which chips are ticked. We make three of them: one for
   the add/edit form, one for bulk add, one for bulk edit.
   (The function returns an object with three tools: setSelected, getSelected, render.) */
function createEquipmentPicker(containerId) {
  const container = document.getElementById(containerId);
  const selected = new Map();   // lowercase name -> display name  (so "dyson" and "Dyson" count as the same)
  const extra = new Map();      // custom items typed in during this session

  function allOptions() {
    const all = new Map();
    for (const name of [...EQUIPMENT_OPTIONS, ...collectKnownEquipment(), ...extra.values(), ...selected.values()]) {
      const key = String(name).trim().toLowerCase();
      if (key && !all.has(key)) all.set(key, String(name).trim());
    }
    return [...all.values()];
  }

  function render() {
    const chips = allOptions().map(name => {
      const on = selected.has(name.toLowerCase());
      return `<button type="button" class="equip-chip ${on ? 'on' : ''}" data-equip="${escapeHtml(name)}" aria-pressed="${on}">${escapeHtml(name)}</button>`;
    }).join('');
    container.innerHTML = `
      <div class="chip-grid">${chips}</div>
      <div class="equip-add">
        <input type="text" maxlength="30" placeholder="Something else…" aria-label="Add other equipment">
        <button type="button" class="btn-small" data-equip-add>Add</button>
      </div>`;
  }

  function addCustom() {
    const input = container.querySelector('.equip-add input');
    const value = input.value.trim();
    if (!value) return;
    const existing = allOptions().find(o => o.toLowerCase() === value.toLowerCase());
    const name = existing || value;
    if (!existing) extra.set(name.toLowerCase(), name);
    selected.set(name.toLowerCase(), name);
    render();
  }

  container.addEventListener('click', event => {
    const chip = event.target.closest('[data-equip]');
    if (chip) {
      const name = chip.dataset.equip;
      if (selected.has(name.toLowerCase())) selected.delete(name.toLowerCase());
      else selected.set(name.toLowerCase(), name);
      render();
      return;
    }
    if (event.target.closest('[data-equip-add]')) addCustom();
  });
  container.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('.equip-add input')) {
      event.preventDefault();      // stop Enter from submitting the whole form
      addCustom();
    }
  });

  return {
    setSelected(list) {
      selected.clear();
      extra.clear();
      (list || []).forEach(n => {
        const found = allOptions().find(o => o.toLowerCase() === String(n).trim().toLowerCase());
        const name = found || String(n).trim();
        selected.set(name.toLowerCase(), name);
      });
      render();
    },
    getSelected() { return [...selected.values()]; },
    render
  };
}

let taskEquipmentPicker = null;   // these are created in Part 11, once the page is ready
let bulkAddPicker = null;
let bulkEditPicker = null;

/* ----- 9b. Linked-chores checklist ----- */
function renderLinkPicker(excludeId, selectedIds) {
  const container = document.getElementById('task-link-picker');
  document.getElementById('link-search').value = '';
  const others = getAllTasks()
    .filter(t => t.id !== excludeId && !t.archived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (others.length === 0) {
    container.innerHTML = `<span class="hint">Add more chores, then you can link them together.</span>`;
    return;
  }
  container.innerHTML = others.map(t => `
    <label class="link-row" data-search="${escapeHtml((t.name || '').toLowerCase())}">
      <input type="checkbox" value="${escapeHtml(t.id)}" ${selectedIds.includes(t.id) ? 'checked' : ''}>
      <span>${escapeHtml(t.name)}</span>
      <small>${escapeHtml(t.room || 'General')}</small>
    </label>`).join('');
}

function filterLinkPicker() {
  const query = document.getElementById('link-search').value.toLowerCase().trim();
  document.querySelectorAll('#task-link-picker .link-row').forEach(row => {
    row.hidden = query !== '' && !row.dataset.search.includes(query);
  });
}

/* ----- 9c. XP preview (only shown on the edit screen) ----- */
function updateXpPreview() {
  const timeTag = document.getElementById('task-time').value;
  const interval = parseInt(document.getElementById('task-interval').value, 10);
  const override = parseInt(document.getElementById('task-xp-override').value, 10);
  const xp = getTaskXp({ timeTag, interval, xpOverride: override });
  document.getElementById('xp-preview').textContent = `${xp} XP`;
  document.getElementById('xp-preview-note').textContent = override > 0
    ? 'Using your custom amount.'
    : 'Worked out from how long it takes and how often it repeats.';
}
function updateOneOffHint() {
  document.getElementById('oneoff-hint').hidden = !document.getElementById('task-oneoff').checked;
}

/* ----- 9d. Add / edit a chore -----
   ONE modal ("chore-modal") handles both adding and editing. When adding,
   it shows a Single/Bulk tab switcher at the top; when editing an existing
   chore, there's nothing to switch, so the tabs are hidden. */
let choreModalMode = 'add';   // 'add' or 'edit'
let activeChoreTab = 'single';

function switchChoreTab(tab) {
  activeChoreTab = tab;
  document.getElementById('chore-tab-single').classList.toggle('active', tab === 'single');
  document.getElementById('chore-tab-bulk').classList.toggle('active', tab === 'bulk');
  document.getElementById('chore-pane-single').hidden = tab !== 'single';
  document.getElementById('chore-pane-bulk').hidden = tab !== 'bulk';
}

function openAddChoreModal() {
  choreModalMode = 'add';
  document.getElementById('single-form').reset();
  document.getElementById('bulk-form').reset();
  document.getElementById('edit-task-id').value = '';
  document.getElementById('chore-modal-title').textContent = 'Add new chore';
  document.getElementById('chore-tab-switcher').hidden = false;
  document.getElementById('task-lastdone').value = todayStr();
  document.getElementById('bulk-lastdone').value = todayStr();
  document.getElementById('modal-archive-btn').hidden = true;
  document.getElementById('modal-delete-btn').hidden = true;
  taskEquipmentPicker.setSelected([]);
  bulkAddPicker.setSelected([]);
  renderLinkPicker(null, []);
  updateXpPreview();
  updateOneOffHint();
  switchChoreTab('single');
  openModal('chore-modal');
}

function openEditModal(id) {
  const t = getAllTasks().find(x => x.id === id);
  if (!t) return;
  choreModalMode = 'edit';
  document.getElementById('single-form').reset();
  document.getElementById('edit-task-id').value = t.id;
  document.getElementById('chore-modal-title').textContent = 'Edit chore';
  document.getElementById('chore-tab-switcher').hidden = true;   // editing is always "single"
  document.getElementById('task-name').value = t.name || '';
  document.getElementById('task-room').value = t.room || 'General';
  document.getElementById('task-time').value = t.timeTag || 'medium';
  document.getElementById('task-interval').value = t.interval || '';
  document.getElementById('task-lastdone').value = t.lastDone || todayStr();
  document.getElementById('task-priority').checked = !!t.isHighPriority;
  document.getElementById('task-oneoff').checked = !!t.oneOff;
  document.getElementById('task-xp-override').value = t.xpOverride || '';
  document.getElementById('modal-archive-btn').hidden = false;
  document.getElementById('modal-delete-btn').hidden = false;
  taskEquipmentPicker.setSelected(getEquipment(t));
  renderLinkPicker(t.id, getLinkedIds(t));
  updateXpPreview();
  updateOneOffHint();
  switchChoreTab('single');
  openModal('chore-modal');
}

async function handleSingleSubmit(event) {
  event.preventDefault();                      // stop the browser reloading the page
  const id = document.getElementById('edit-task-id').value;
  const isNew = !id;

  const interval = parseInt(document.getElementById('task-interval').value, 10);
  if (!(interval >= 1)) { showToast('Enter how many days between each clean'); return; }

  const overrideRaw = parseInt(document.getElementById('task-xp-override').value, 10);
  const linkIds = [...document.querySelectorAll('#task-link-picker input:checked')].map(box => box.value);

  const fields = {
    name: document.getElementById('task-name').value.trim(),
    room: document.getElementById('task-room').value.trim() || 'General',
    timeTag: document.getElementById('task-time').value,
    equipment: taskEquipmentPicker.getSelected(),
    interval,
    lastDone: document.getElementById('task-lastdone').value,
    isHighPriority: document.getElementById('task-priority').checked,
    oneOff: document.getElementById('task-oneoff').checked,
    xpOverride: overrideRaw > 0 ? clamp(overrideRaw, 1, 500) : null,    // null = automatic
    linkedTaskIds: linkIds
  };

  try {
    if (isNew) {
      const newId = newTaskId();
      await saveTaskDoc(newId, { ...fields, archived: false, inProgressBy: null, inProgressAt: null, lastDoneBy: null });
      await syncLinks(newId, [], linkIds);
    } else {
      const oldLinks = getLinkedIds(taskById.get(id) || {});
      await saveTaskDoc(id, fields);
      await syncLinks(id, oldLinks, linkIds);
    }
  } catch (error) {
    console.error(error);
    showToast('⚠️ Could not save that chore.');
    return;
  }
  closeModals();
  if (isNew) await awardTaskCreationXp(1);
}

/* Small XP for adding chores (capped per day so it can't be farmed) */
async function awardTaskCreationXp(count) {
  const user = getUser();
  if (!user || (isFirebaseConfigured && !dataReady)) return;
  const today = todayStr();
  if (!user.taskAdds || user.taskAdds.date !== today) user.taskAdds = { date: today, count: 0 };

  const allowed = Math.max(0, SETTINGS.TASK_CREATE_DAILY_CAP - user.taskAdds.count);
  const paid = Math.min(allowed, count);
  if (paid <= 0) return;

  const xp = paid * SETTINGS.TASK_CREATE_XP;
  user.taskAdds.count += paid;
  user.lastActiveDate = today;
  const report = addXp(user, xp);
  await saveUserDoc(currentUser);
  await addLogEntry({ type: 'bonus', name: `Added ${plural(paid, 'chore')}`, date: today, timestamp: Date.now(), completedBy: currentUser, xpEarned: xp });

  if (report.leveledUp) {
    showRewardPopup({ title: '🎉 LEVEL UP!', main: `+${xp} XP`, sub: 'For adding chores', lines: [], report, linked: [], celebrate: true });
  } else {
    showToast(`+${xp} XP for adding ${paid === 1 ? 'a chore' : plural(paid, 'chore')}`);
  }
  updateUserBar();
}

/* Kept as a small wrapper so the rest of the app doesn't need to know that
   the Me tab, not a header widget, is what shows XP/streak/chest info now. */
function updateUserBar() { renderMeTab(); }

/* ----- 9e. Bulk add ----- */
async function handleBulkSubmit(event) {
  event.preventDefault();
  const names = document.getElementById('bulk-names').value
    .split('\n').map(n => n.trim()).filter(n => n.length > 0);
  if (names.length === 0) return;

  const shared = {
    room: document.getElementById('bulk-room').value.trim() || 'General',
    timeTag: document.getElementById('bulk-time').value,
    equipment: bulkAddPicker.getSelected(),
    interval: parseInt(document.getElementById('bulk-interval').value, 10) || 14,
    lastDone: document.getElementById('bulk-lastdone').value,
    isHighPriority: false, oneOff: false, xpOverride: null, linkedTaskIds: [],
    archived: false, inProgressBy: null, inProgressAt: null, lastDoneBy: null
  };

  try {
    await Promise.all(names.map(name => saveTaskDoc(newTaskId(), { name, ...shared })));
  } catch (error) {
    console.error(error);
    showToast('⚠️ Could not import those chores.');
    return;
  }
  closeModals();
  showToast(`Added ${plural(names.length, 'chore')}`);
  await awardTaskCreationXp(names.length);
}

/* ----- 9f. Bulk edit (from Select mode) ----- */
function openBulkEditModal() {
  if (selectedIds.size === 0) { showToast('Tick some chores first'); return; }
  document.getElementById('bulk-edit-form').reset();
  document.getElementById('bulk-edit-title').textContent = `Edit ${plural(selectedIds.size, 'chore')}`;
  bulkEditPicker.setSelected([]);
  openModal('bulk-edit-modal');
}

/* ----- 9g. History calendar ----- */
function changeMonth(delta) {
  currentCalDate.setDate(1);                        // avoid jumping over short months
  currentCalDate.setMonth(currentCalDate.getMonth() + delta);
  renderCalendar();
}

function showDayLogs(dateStr) {
  const dayLogs = completedLogs.filter(l => l.date === dateStr && isChoreLog(l));
  document.getElementById('selected-date-title').textContent = `Completed on ${dateStr}`;
  document.getElementById('selected-date-tasks').innerHTML = dayLogs.length === 0
    ? 'No chores refreshed on this day.'
    : dayLogs.map(l => `• ${escapeHtml(l.name)} <span style="color:var(--sky-deep);font-weight:700">(by ${escapeHtml(l.completedBy)})</span>`).join('<br>');
}

/* ----- 9h. Activity tab: leaderboard / history sub-view ----- */
let activityView = 'leaderboard';
function switchActivityView(view) {
  activityView = view;
  document.querySelectorAll('[data-action="switch-activity-view"]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view));
  document.getElementById('activity-leaderboard-view').hidden = view !== 'leaderboard';
  document.getElementById('activity-history-view').hidden = view !== 'history';
}

function switchLeaderboardTab(tab) {
  activeLeaderboardTab = tab;
  document.querySelectorAll('.tab-btn[id^="tab-"]').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  renderLeaderboard();
}

/* ----- 9i. Users: switching, adding, removing inactive ones ----- */
function openUserModal() {
  document.getElementById('user-name-input').value = '';
  renderUserList();
  openModal('user-modal');
}

function renderUserList() {
  const container = document.getElementById('user-list');
  const names = Object.keys(appUsers).sort((a, b) => (appUsers[b].xp || 0) - (appUsers[a].xp || 0));
  const inactive = new Set(findInactiveUsers().map(u => u.name));

  if (names.length === 0) {
    container.innerHTML = `<p class="hint">Nobody here yet. Add the first person below.</p>`;
    return;
  }
  container.innerHTML = names.map(name => {
    const u = appUsers[name];
    const lvl = calculateLevel(u.xp || 0).level;
    const lastActive = u.lastActiveDate ? `active ${timeAgo(u.lastActiveDate)}` : 'not active yet';
    return `
      <button class="user-row ${name === currentUser ? 'current' : ''}" data-action="choose-user" data-name="${escapeHtml(name)}">
        <span class="avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span>
          <div class="user-row-name">${escapeHtml(name)}</div>
          <div class="user-row-sub">Lvl ${lvl}, ${(u.xp || 0).toLocaleString()} XP, ${lastActive}</div>
        </span>
        ${inactive.has(name) ? '<span class="user-row-flag">💤 inactive</span>' : ''}
      </button>`;
  }).join('');
}

function chooseUser(name) {
  if (!appUsers[name]) return;
  currentUser = name;
  localStorage.setItem('cleanDeckUser', currentUser);
  checkStreakAndSave();
  closeModals();
  render();
}

async function handleUserSubmit(event) {
  event.preventDefault();
  if (isFirebaseConfigured && !dataReady) { showToast('Still loading. Try again in a moment.'); return; }
  const typed = cleanUserName(document.getElementById('user-name-input').value);
  if (!typed) return;

  /* If "alex" already exists, use "Alex" instead of creating a near-duplicate */
  const existing = Object.keys(appUsers).find(n => n.toLowerCase() === typed.toLowerCase());
  const name = existing || typed;

  currentUser = name;
  localStorage.setItem('cleanDeckUser', currentUser);
  initUserData(name);
  await saveUserDoc(name);
  closeModals();
  render();
}

/* Who counts as inactive?
     - 0 XP and never active (unless they only joined in the last week), or
     - nobody has seen them do a chore for INACTIVE_USER_DAYS.
   The person using this device is never listed. */
function findInactiveUsers() {
  const today = todayStr();
  const result = [];
  Object.entries(appUsers).forEach(([name, u]) => {
    if (name === currentUser) return;
    const lastActive = [u.lastActiveDate, u.lastGoalDate].filter(Boolean).sort().pop() || null;
    const xp = u.xp || 0;
    const joinedRecently = u.createdAt && (Date.now() - u.createdAt) < 7 * 86400000;

    if (xp === 0 && !lastActive && !joinedRecently) {
      result.push({ name, reason: 'no XP and never active' });
    } else if (lastActive && daysBetween(lastActive, today) >= SETTINGS.INACTIVE_USER_DAYS) {
      result.push({ name, reason: `last active ${daysBetween(lastActive, today)} days ago` });
    }
  });
  return result;
}

async function cleanupInactiveUsers() {
  if (isFirebaseConfigured && !dataReady) { showToast('Still loading. Try again in a moment.'); return; }
  const list = findInactiveUsers();
  if (list.length === 0) { showToast('No inactive users found 👍'); return; }

  const summary = list.map(u => `• ${u.name} (${u.reason})`).join('\n');
  if (!confirm(`Remove ${plural(list.length, 'inactive user')}?\n\n${summary}\n\nTheir XP and critters will be deleted. This can't be undone.`)) return;

  for (const u of list) await deleteUserDoc(u.name);
  showToast(`Removed ${plural(list.length, 'user')}`);
  renderUserList();
  render();
}

async function changeDailyGoal(value) {
  const user = getUser();
  if (!user) return;
  user.dailyGoal = clamp(parseInt(value, 10) || SETTINGS.DEFAULT_DAILY_GOAL, 1, 10);
  await saveUserDoc(currentUser);
  render();
  showToast(`Daily goal set to ${plural(user.dailyGoal, 'chore')}`);
}

/* ----- 9j. Critter lightbox (tap a critter to see it up close) ----- */
function openCritterLightbox(critterId) {
  const critter = CRITTER_CATALOG.find(c => c.id === critterId);
  if (!critter) return;
  const user = getUser();
  const data = user && user.critters && user.critters[critterId];
  document.querySelector('#critter-modal h2').textContent = data ? critter.name : '???';

  const img = `<img class="lightbox-img" src="${escapeHtml(critter.image)}" alt="${data ? escapeHtml(critter.name) : ''}">`;

  if (data) {
    const target = (data.lvl || 1) * SETTINGS.CRITTER_XP_PER_LEVEL;
    const pct = clamp(Math.floor(((data.xp || 0) / target) * 100), 0, 100);
    document.getElementById('critter-lightbox-body').innerHTML = `
      <div class="lightbox-body">
        <div class="lightbox-img-wrap">${img}</div>
        <div class="lightbox-name">${escapeHtml(critter.name)}</div>
        <div class="lightbox-lvl">Level ${data.lvl || 1}</div>
        <div class="mini-bar"><div style="width:${pct}%"></div></div>
        <span class="critter-xp">${data.xp || 0}/${target} XP to next level</span>
      </div>`;
  } else {
    document.getElementById('critter-lightbox-body').innerHTML = `
      <div class="lightbox-body">
        <div class="lightbox-img-wrap is-locked">${img}</div>
        <div class="lightbox-name">???</div>
        <div class="lightbox-locked-text">Still locked. Keep doing chores to discover this critter!</div>
      </div>`;
  }
  openModal('critter-modal');
}



/* ==========================================================================
   PART 10: REWARD POP-UP, MYSTERY CHEST AND CONFETTI
   ========================================================================== */

/* ----- 10a. Confetti -----
   We create lots of tiny coloured <div>s and let CSS animate them
   (see "confetti" in style.css). Each removes itself when its animation ends. */
const CONFETTI_COLOURS = ['#86a7ee', '#bfabf0', '#e8bb6c', '#7cd0a2', '#f28b82', '#ffffff'];

function makeConfettiPiece(className) {
  const piece = document.createElement('div');
  piece.className = `confetti-piece ${className}`;
  piece.style.background = CONFETTI_COLOURS[randInt(0, CONFETTI_COLOURS.length - 1)];
  piece.style.setProperty('--rot', `${randInt(360, 900)}deg`);
  piece.addEventListener('animationend', () => piece.remove());
  return piece;
}

/* Confetti raining down from the top of the screen */
function launchConfetti(count = 70) {
  if (prefersReducedMotion()) return;
  const layer = document.getElementById('confetti-layer');
  for (let i = 0; i < count; i++) {
    const piece = makeConfettiPiece('fall');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty('--dur', `${(2.2 + Math.random() * 1.4).toFixed(2)}s`);
    piece.style.setProperty('--delay', `${(Math.random() * 0.6).toFixed(2)}s`);
    piece.style.setProperty('--drift', `${randInt(-140, 140)}px`);
    layer.appendChild(piece);
  }
}

/* Confetti exploding outwards from a point on screen (used when a chest opens) */
function burstConfetti(x, y, count = 60) {
  if (prefersReducedMotion()) return;
  const layer = document.getElementById('confetti-layer');
  for (let i = 0; i < count; i++) {
    const piece = makeConfettiPiece('burst');
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.setProperty('--dx', `${randInt(-320, 320)}px`);
    piece.style.setProperty('--dy', `${randInt(-360, 160)}px`);
    piece.style.setProperty('--dur', `${(1.2 + Math.random() * 0.9).toFixed(2)}s`);
    layer.appendChild(piece);
  }
}

/* ----- 10b. Reward pop-up (after finishing a chore, or levelling up) -----
   "options" describes what to show:
     title, main (big text), sub (small text), lines (extra info rows),
     report (result of addXp), linked (linked chores to suggest), celebrate (confetti?) */
function showRewardPopup({ title, main, sub, lines, report, linked, celebrate }) {
  const rows = [...(lines || [])];

  if (report && report.leveledUp) {
    rows.push({ cls: 'levelup', html: `🎉 LEVEL UP! You reached <strong>Lvl ${report.newLevel}</strong>!` });
  }
  if (report) {
    report.rankUps.forEach(rank => {
      const saverText = rank.reward ? ` (+${plural(rank.reward.savers, 'Streak Saver')})` : '';
      rows.push({ cls: 'levelup', html: `🏅 New rank: <strong>${rank.emoji} ${escapeHtml(rank.title)}</strong>${saverText}` });
    });
    if (report.chestsEarned > 0) {
      rows.push({ cls: 'line-chest', html: '🧰 You earned a <strong>Mystery Chest</strong>! Open it and pick 1 of 3.' });
    }
  }

  let linkedHtml = '';
  if (linked && linked.length > 0) {
    linkedHtml = `<div class="reward-line linked">🔗 Linked chores you could do next:
      ${linked.slice(0, 3).map(l => `
        <div class="linked-row"><span>${escapeHtml(l.name)}</span>
          <button class="btn-small" data-action="start-task" data-id="${escapeHtml(l.id)}">Start</button></div>`).join('')}
    </div>`;
  }

  document.getElementById('reward-body').innerHTML = `
    <div class="reward-title">${escapeHtml(title)}</div>
    <div class="reward-main">${escapeHtml(main)}</div>
    <div class="reward-subtext">${escapeHtml(sub || '')}</div>
    <div class="reward-lines">
      ${rows.map(r => `<div class="reward-line ${r.cls || ''}">${r.html}</div>`).join('')}
      ${linkedHtml}
    </div>`;

  const user = getUser();
  const hasChest = user && user.pendingChests > 0 && report && report.chestsEarned > 0;
  document.getElementById('reward-buttons').innerHTML = hasChest
    ? `<button class="btn-primary btn-chest" data-action="reward-open-chest">🧰 Open mystery chest</button>
       <button class="btn-ghost" data-action="close-reward">Later</button>`
    : `<button class="btn-primary" data-action="close-reward">Collect reward</button>`;

  document.getElementById('reward-modal').classList.add('active');
  if (celebrate) launchConfetti(90);
}

function closeRewardModal() {
  document.getElementById('reward-modal').classList.remove('active');
  updateUserBar();
}

/* ----- 10c. Mystery chest: choose 1 of 3 -----
   Flow:
     1. The 3 prizes are decided when the chest screen first opens and are saved
        (so refreshing the page can't reroll them).
     2. You pick a chest. It rattles, bursts open, and shows your prize.
     3. Then the other two open to show what you missed.
     4. Only YOUR chosen prize is given to you. */
const CHEST_STYLES = [
  { name: 'Oak chest',   wood: '#a8672f', woodLight: '#c98a4b', trim: '#f0c15a' },
  { name: 'Frost chest', wood: '#3f7f8c', woodLight: '#5aa3b2', trim: '#e3ecf2' },
  { name: 'Royal chest', wood: '#6d4bb3', woodLight: '#8e6fd0', trim: '#f0c15a' }
];
let chestBusy = false;
let chestTimers = [];

/* The chest picture, drawn as SVG shapes. The .chest-lid group tips open with CSS. */
function chestSvg(index) {
  return `
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <radialGradient id="glow${index}">
          <stop offset="0%" stop-color="#fff8d6"/>
          <stop offset="45%" stop-color="#ffd970" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#ffd970" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="94" rx="48" ry="5" fill="rgba(0,0,0,0.35)"/>
      <rect class="chest-body" x="12" y="46" width="96" height="46" rx="6"/>
      <path class="chest-plank" d="M12 62 H108 M12 77 H108" fill="none"/>
      <rect class="chest-inside" x="16" y="46" width="88" height="10" rx="3"/>
      <circle class="chest-glow" cx="60" cy="46" r="34" fill="url(#glow${index})"/>
      <rect class="chest-band" x="24" y="46" width="9" height="46"/>
      <rect class="chest-band" x="87" y="46" width="9" height="46"/>
      <g class="chest-lid">
        <path class="chest-lid-shape" d="M10 46 Q10 14 60 14 Q110 14 110 46 Z"/>
        <rect class="chest-band" x="24" y="22" width="9" height="24"/>
        <rect class="chest-band" x="87" y="22" width="9" height="24"/>
      </g>
      <rect class="chest-lock" x="53" y="44" width="14" height="14" rx="3"/>
      <circle cx="60" cy="50" r="2" fill="#5a3a12"/>
    </svg>`;
}

function renderChestStage(offer) {
  document.getElementById('chest-row').innerHTML = offer.map((item, i) => {
    const style = CHEST_STYLES[i];
    const info = describeChestItem(item);
    return `
      <button class="chest pickable" data-action="pick-chest" data-index="${i}" aria-label="${style.name}"
              style="--wood:${style.wood};--wood-light:${style.woodLight};--trim:${style.trim}">
        <div class="chest-prize" aria-hidden="true">
          <span class="prize-emoji">${info.emoji}</span>
          <span class="prize-text">${escapeHtml(info.text)}</span>
        </div>
        ${chestSvg(i)}
        <span class="chest-label">${style.name}</span>
      </button>`;
  }).join('');
}

function openChestFlow() {
  const user = getUser();
  if (!user || !(user.pendingChests > 0)) { showToast('No mystery chests to open right now'); return; }
  closeModals();
  document.getElementById('reward-modal').classList.remove('active');

  /* Decide (and remember) what's inside the 3 chests */
  if (!Array.isArray(user.chestOffer) || user.chestOffer.length !== 3) {
    user.chestOffer = rollChestOffer(calculateLevel(user.xp).level);
    saveUserDoc(currentUser);
  }

  chestBusy = false;
  chestTimers.forEach(clearTimeout);
  chestTimers = [];
  renderChestStage(user.chestOffer);
  document.getElementById('chest-title').textContent = 'Pick a chest!';
  document.getElementById('chest-subtitle').textContent = 'Three chests, one choice. Everything is revealed once you pick.';
  document.getElementById('chest-result').innerHTML = '';
  document.getElementById('chest-collect-btn').hidden = true;
  document.getElementById('chest-modal').classList.add('active');
}

function pickChest(index) {
  const user = getUser();
  if (chestBusy || !user || !Array.isArray(user.chestOffer)) return;
  chestBusy = true;

  /* Give the prize and use up the chest straight away (so closing the app mid-animation can't lose it) */
  const offer = user.chestOffer;
  const item = offer[index];
  const report = applyChestItem(user, item);
  user.pendingChests = Math.max(0, (user.pendingChests || 0) - 1);
  user.chestsOpened = (user.chestsOpened || 0) + 1;
  user.chestOffer = null;
  user.lastActiveDate = todayStr();
  saveUserDoc(currentUser);
  if (item.type === 'xp') {
    addLogEntry({ type: 'bonus', name: 'Mystery chest', date: todayStr(), timestamp: Date.now(), completedBy: currentUser, xpEarned: item.amount });
  }

  const row = document.getElementById('chest-row');
  const chests = [...row.querySelectorAll('.chest')];
  const chosen = chests[index];
  chests.forEach((c, i) => {
    c.classList.remove('pickable');
    c.classList.add('locked-out');
    if (i !== index) c.classList.add('dim');
  });

  const reduced = prefersReducedMotion();
  const after = (ms, fn) => chestTimers.push(setTimeout(fn, reduced ? 0 : ms));   // "after this many ms, do this"
  const info = describeChestItem(item);

  document.getElementById('chest-title').textContent = 'Opening…';
  document.getElementById('chest-subtitle').textContent = '';
  chosen.classList.add('shaking');                                       // stage 1: rattle

  after(1100, () => {                                                    // stage 2: your chest bursts open
    chosen.classList.remove('shaking');
    chosen.classList.add('opened', 'chosen');

    const burst = document.createElement('div');
    burst.className = 'chest-burst';
    chosen.appendChild(burst);
    setTimeout(() => burst.remove(), 1000);

    const box = chosen.getBoundingClientRect();
    if (item.type !== 'coal') burstConfetti(box.left + box.width / 2, box.top + box.height / 2, 70);

    document.getElementById('chest-title').textContent = item.type === 'coal' ? 'Oh… coal.' : 'You found…';
    let extra = '';
    if (report && report.leveledUp) extra += `<div class="small">🎉 Level up! You reached Lvl ${report.newLevel}</div>`;
    if (report) report.rankUps.forEach(r => { extra += `<div class="small">🏅 New rank: ${r.emoji} ${escapeHtml(r.title)}</div>`; });
    if (report && report.chestsEarned > 0) extra += `<div class="small">🧰 …and that earned you another chest!</div>`;
    document.getElementById('chest-result').innerHTML =
      `<div class="big">${info.emoji} ${escapeHtml(info.text)}</div><div class="small">${escapeHtml(info.small)}</div>${extra}`;
  });

  after(2700, () => {                                                    // stage 3: the other two open
    chests.forEach((c, i) => {
      if (i === index) return;
      c.classList.remove('dim');
      c.classList.add('opened', 'revealed-other');
    });
    document.getElementById('chest-subtitle').textContent = 'The other chests held…';
  });

  after(3800, () => {                                                    // stage 4: collect
    const btn = document.getElementById('chest-collect-btn');
    btn.textContent = user.pendingChests > 0 ? `Collect (${plural(user.pendingChests, 'chest')} left to open)` : 'Collect';
    btn.hidden = false;
  });
}

function collectChest() {
  chestTimers.forEach(chestTimer => clearTimeout(chestTimer));
  chestTimers = [];
  document.getElementById('chest-modal').classList.remove('active');
  render();
  const user = getUser();
  if (user && user.pendingChests > 0) showToast(`🧰 You still have ${plural(user.pendingChests, 'chest')} to open`);
}

/* ==========================================================================
   PART 11: WIRING UP CLICKS AND STARTING THE APP
   ========================================================================== */

let currentTab = 'house';   // which of the 3 bottom tabs is showing right now

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('panel-me').hidden = tab !== 'me';
  document.getElementById('panel-house').hidden = tab !== 'house';
  document.getElementById('panel-activity').hidden = tab !== 'activity';
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  window.scrollTo(0, 0);
  refreshIcons();
}

/* Every button in index.html has a data-action label. This table says which
   function each label runs. To add a new button: give it data-action="my-name",
   then add  'my-name': () => myFunction()  here.
   "el" is the button that was clicked, and el.dataset.id reads its data-id. */
const ACTIONS = {
  // bottom nav
  'switch-tab': el => switchTab(el.dataset.tab),

  // House tab top buttons
  'toggle-select-mode': () => toggleSelectMode(),
  'open-add-task': () => openAddChoreModal(),

  // Me tab
  'open-user-switch': () => openUserModal(),
  'open-chest': () => openChestFlow(),
  'open-critter': el => openCritterLightbox(el.dataset.id),

  // Activity tab
  'switch-activity-view': el => switchActivityView(el.dataset.view),
  'switch-lb-tab': el => switchLeaderboardTab(el.dataset.tab),
  'calendar-prev': () => changeMonth(-1),
  'calendar-next': () => changeMonth(1),
  'show-day': el => showDayLogs(el.dataset.date),

  // lists and filters
  'filter-room': el => filterByRoom(el.dataset.room),
  'clear-room-filter': () => clearRoomFilter(),
  'toggle-all-tasks': () => toggleAllTasks(),
  'toggle-archived': () => toggleArchived(),

  // chore buttons
  'complete-task': el => completeTask(el.dataset.id),
  'edit-task': el => openEditModal(el.dataset.id),
  'start-task': async el => {
    await startTask(el.dataset.id);
    const row = el.closest('.linked-row');      // if it was in the reward pop-up, tidy the row away
    if (row) row.remove();
  },
  'stop-task': el => stopTask(el.dataset.id),
  'restore-task': el => restoreTask(el.dataset.id),
  'delete-task': el => deleteTask(el.dataset.id),

  // add/edit chore modal
  'switch-chore-tab': el => switchChoreTab(el.dataset.tab),
  'modal-archive': async () => {
    const id = document.getElementById('edit-task-id').value;
    if (id) { await archiveTask(id); closeModals(); }
  },
  'modal-delete': async () => {
    const id = document.getElementById('edit-task-id').value;
    if (id && await deleteTask(id)) closeModals();
  },

  // select mode
  'toggle-select': el => toggleSelect(el.dataset.id),
  'select-all-visible': () => selectAllVisible(),
  'open-bulk-edit': () => openBulkEditModal(),
  'bulk-archive': () => bulkArchive(),
  'bulk-delete': () => bulkDelete(),

  // modals
  'close-modals': () => closeModals(),
  'choose-user': el => chooseUser(el.dataset.name),
  'cleanup-users': () => cleanupInactiveUsers(),

  // rewards and chest
  'close-reward': () => closeRewardModal(),
  'reward-open-chest': () => { closeRewardModal(); openChestFlow(); },
  'pick-chest': el => pickChest(Number(el.dataset.index)),
  'collect-chest': () => collectChest()
};

function wireEvents() {
  /* ONE click listener for the whole page ("event delegation").
     When anything is clicked, find the nearest element with a data-action and run it. */
  document.addEventListener('click', event => {
    if (event.target.classList && event.target.classList.contains('modal-overlay')) {
      closeModals();                            // clicking the dark backdrop closes the pop-up
      return;
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = ACTIONS[el.dataset.action];
    if (action) action(el, event);
  });

  /* Forms */
  document.getElementById('single-form').addEventListener('submit', handleSingleSubmit);
  document.getElementById('bulk-form').addEventListener('submit', handleBulkSubmit);
  document.getElementById('bulk-edit-form').addEventListener('submit', handleBulkEditSubmit);
  document.getElementById('user-form').addEventListener('submit', handleUserSubmit);

  /* Live updates as you type */
  document.getElementById('search-input').addEventListener('input', renderHouseTab);
  document.getElementById('time-filter-select').addEventListener('change', renderHouseTab);
  document.getElementById('task-time').addEventListener('change', updateXpPreview);
  document.getElementById('task-interval').addEventListener('input', updateXpPreview);
  document.getElementById('task-xp-override').addEventListener('input', updateXpPreview);
  document.getElementById('task-oneoff').addEventListener('change', updateOneOffHint);
  document.getElementById('link-search').addEventListener('input', filterLinkPicker);
  document.getElementById('me-goal-select').addEventListener('change', event => changeDailyGoal(event.target.value));

  /* Escape closes pop-ups (but not the mystery chest, which must be finished) */
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModals();
  });

  /* If a critter picture file is missing, show an emoji instead of a broken image.
     (Image "error" events don't bubble, so we listen in the "capture" phase: the "true".) */
  document.addEventListener('error', event => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.classList.contains('critter-img')) {
      const fallback = document.createElement('span');
      fallback.className = 'critter-fallback';
      fallback.textContent = img.closest('.locked') ? '❔' : '🐾';
      img.replaceWith(fallback);
    } else if (img.classList.contains('lightbox-img')) {
      const fallback = document.createElement('span');
      fallback.className = 'lightbox-fallback';
      fallback.textContent = img.closest('.is-locked') ? '❔' : '🐾';
      img.replaceWith(fallback);
    }
  }, true);
}

/* ----- Start-up: this runs once when the page loads ----- */
function init() {
  initFirebase();
  Object.keys(appUsers).forEach(initUserData);

  taskEquipmentPicker = createEquipmentPicker('task-equipment-picker');
  bulkAddPicker = createEquipmentPicker('bulk-add-equipment-picker');
  bulkEditPicker = createEquipmentPicker('bulk-edit-equipment-picker');

  wireEvents();
  switchTab('house');   // House is the tab you land on

  if (isFirebaseConfigured) startRealtimeListeners();
  render();
  refreshIcons();

  /* First visit on this device: ask who is cleaning */
  if (!isFirebaseConfigured && !currentUser) openUserModal();

  /* Every 5 minutes: redraw (updates the boost timer and "today" if the page stays open past midnight) */
  setInterval(() => { checkStreakAndSave(); render(); }, 5 * 60 * 1000);
}

init();
