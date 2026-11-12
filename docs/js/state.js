// Learning progress: one JSON document per user, kept in localStorage and mirrored to the
// planner's Supabase project (table eng_state). Every save merges with the server copy first,
// so two devices never wipe each other's progress.
const CFG = window.ENG_CONFIG || {};
// Development aid: http://localhost:…/?local runs on this device only, without signing in.
const FORCE_LOCAL = location.hostname === 'localhost' && new URLSearchParams(location.search).has('local');
export const CLOUD = !FORCE_LOCAL && !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
export const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const STEPS = ['cards', 'quiz1', 'quiz2', 'done'];
const rank = s => Math.max(0, STEPS.indexOf(s));

export const session = { uid: null, email: '', sync: 'idle', error: '' };
let S = blank();
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
// Fires only when progress arrived from the server (another device), so open screens can refresh.
const remoteListeners = new Set();
export const onRemoteChange = fn => remoteListeners.add(fn);
const notify = () => listeners.forEach(fn => fn());

function blank() {
  return { v: 1, words: {}, speak: {}, chat: {}, wrong: {}, days: {}, prefs: { rate: 0.9, autoSpeak: true }, prefsAt: 0, at: 0 };
}
const key = () => `eng.v1.state.${session.uid || 'local'}`;
function loadLocal() {
  try { const raw = localStorage.getItem(key()); return raw ? normalize(JSON.parse(raw)) : blank(); } catch (e) { return blank(); }
}
function saveLocal() { try { localStorage.setItem(key(), JSON.stringify(S)); } catch (e) {} }
function normalize(d) {
  const b = blank();
  if (!d || typeof d !== 'object') return b;
  return { ...b, ...d, prefs: { ...b.prefs, ...(d.prefs || {}) } };
}

// ---------- merge (pure) ----------
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const out = blank();
  for (const lv of new Set([...Object.keys(a.words), ...Object.keys(b.words)])) {
    const A = a.words[lv] || {}, B = b.words[lv] || {}, o = out.words[lv] = {};
    for (const ch of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[ch] || {}, y = B[ch] || {};
      const step = rank(x.step) >= rank(y.step) ? x.step : y.step;
      const doneAt = [x.doneAt, y.doneAt].filter(Boolean).sort()[0] || null;
      o[ch] = { step: step || 'cards', doneAt, best1: Math.max(x.best1 || 0, y.best1 || 0), best2: Math.max(x.best2 || 0, y.best2 || 0), at: Math.max(x.at || 0, y.at || 0) };
    }
  }
  for (const n of new Set([...Object.keys(a.speak), ...Object.keys(b.speak)])) {
    const x = a.speak[n] || {}, y = b.speak[n] || {};
    out.speak[n] = { done: !!(x.done || y.done), doneAt: [x.doneAt, y.doneAt].filter(Boolean).sort()[0] || null, idx: Math.max(x.idx || 0, y.idx || 0), at: Math.max(x.at || 0, y.at || 0) };
  }
  for (const n of new Set([...Object.keys(a.chat), ...Object.keys(b.chat)])) {
    const x = a.chat[n] || {}, y = b.chat[n] || {};
    out.chat[n] = { done: !!(x.done || y.done), mission: !!(x.mission || y.mission), times: Math.max(x.times || 0, y.times || 0), at: Math.max(x.at || 0, y.at || 0) };
  }
  for (const id of new Set([...Object.keys(a.wrong), ...Object.keys(b.wrong)])) {
    const x = a.wrong[id], y = b.wrong[id];
    out.wrong[id] = !x ? y : !y ? x : ((x.at || 0) >= (y.at || 0) ? x : y);
  }
  out.days = { ...a.days, ...b.days };
  const days = Object.keys(out.days).sort();
  if (days.length > 500) days.slice(0, days.length - 500).forEach(d => delete out.days[d]);
  const pa = a.prefsAt || 0, pb = b.prefsAt || 0;
  out.prefs = pa >= pb ? a.prefs : b.prefs; out.prefsAt = Math.max(pa, pb);
  out.at = Math.max(a.at || 0, b.at || 0);
  return out;
}

// ---------- reads ----------
export const get = () => S;
export const chapter = (lv, ch) => (S.words[lv] || {})[ch] || { step: 'cards' };
export const chapterDone = (lv, ch) => chapter(lv, ch).step === 'done';
export const speakRec = n => S.speak[n] || { done: false, idx: 0 };
export const prefs = () => S.prefs;
export const chatRec = n => S.chat[n] || { done: false };
export const wrongList = () => Object.entries(S.wrong).filter(([, w]) => w && !w.off).map(([id, w]) => ({ id, ...w })).sort((a, b) => (b.at || 0) - (a.at || 0));

const pad = n => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function streak() {
  let n = 0; const d = new Date();
  if (!S.days[ymd(d)]) d.setDate(d.getDate() - 1); // today not studied yet: count up to yesterday
  while (S.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export const studiedToday = () => !!S.days[ymd()];

// ---------- writes ----------
export function update(fn) {
  fn(S);
  S.at = Date.now();
  saveLocal(); notify(); schedulePush();
}
export function setStep(lv, ch, step, extra = {}) {
  update(s => {
    const L = s.words[lv] = s.words[lv] || {};
    const cur = L[ch] || { step: 'cards' };
    const next = { ...cur, ...extra, at: Date.now() };
    if (rank(step) > rank(cur.step)) next.step = step;
    if (step === 'done' && !cur.doneAt) next.doneAt = new Date().toISOString();
    if (extra.best1 !== undefined) next.best1 = Math.max(cur.best1 || 0, extra.best1);
    if (extra.best2 !== undefined) next.best2 = Math.max(cur.best2 || 0, extra.best2);
    L[ch] = next;
    if (step === 'done') s.days[ymd()] = 1;
  });
}
export function setSpeak(n, patch) {
  update(s => {
    const cur = s.speak[n] || { done: false, idx: 0 };
    const next = { ...cur, ...patch, at: Date.now() };
    if (patch.done && !cur.doneAt) next.doneAt = new Date().toISOString();
    next.done = !!(cur.done || patch.done);
    s.speak[n] = next;
    if (patch.done) s.days[ymd()] = 1;
  });
}
export function setChat(n, patch) {
  update(s => {
    const cur = s.chat[n] || {};
    s.chat[n] = { done: !!(cur.done || patch.done), mission: !!(cur.mission || patch.mission), times: (cur.times || 0) + 1, at: Date.now() };
  });
}
export function addWrong(word) {
  update(s => {
    const cur = s.wrong[word.id];
    s.wrong[word.id] = { lv: word.lv, ch: word.ch, en: word.en, ko: word.ko, n: (cur && !cur.off ? cur.n || 0 : 0) + 1, at: Date.now(), off: false };
  });
}
export function clearWrong(id) {
  update(s => { if (s.wrong[id]) s.wrong[id] = { ...s.wrong[id], off: true, at: Date.now() }; });
}
export function setPrefs(patch) { update(s => { s.prefs = { ...s.prefs, ...patch }; s.prefsAt = Date.now(); }); }
export function markStudied() { update(s => { s.days[ymd()] = 1; }); }

// ---------- server sync ----------
let pushTimer = null, pushing = false, again = false;
function setSync(st, err = '') { session.sync = st; session.error = err; notify(); }
function schedulePush() {
  if (!CLOUD || !session.uid) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(push, 1200);
}
async function fetchRemote() {
  const { data, error } = await sb.from('eng_state').select('data').eq('user_id', session.uid).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}
async function push() {
  if (!CLOUD || !session.uid) return;
  if (pushing) { again = true; return; }
  pushing = true; setSync('saving');
  try {
    const remote = await fetchRemote();
    if (remote) { S = merge(S, remote); saveLocal(); }
    const { error } = await sb.from('eng_state').upsert({ user_id: session.uid, data: S, updated_at: new Date().toISOString() });
    if (error) throw error;
    setSync('ok');
  } catch (e) {
    setSync('error', (e && e.message) || '연결 오류');
    clearTimeout(pushTimer); pushTimer = setTimeout(push, 15000);
  } finally {
    pushing = false;
    if (again) { again = false; push(); }
  }
}
export async function pull() {
  if (!CLOUD || !session.uid || pushing) return;
  try {
    const remote = await fetchRemote();
    if (!remote) { schedulePush(); return; }
    const merged = merge(S, remote);
    const changed = JSON.stringify(merged) !== JSON.stringify(S);
    const remoteBehind = JSON.stringify(merged) !== JSON.stringify(normalize(remote));
    S = merged; saveLocal();
    if (changed) { notify(); remoteListeners.forEach(fn => fn()); }
    if (remoteBehind) schedulePush(); else setSync('ok');
  } catch (e) { setSync('error', (e && e.message) || '연결 오류'); }
}

export async function startSession(user) {
  session.uid = user ? user.id : null;
  session.email = user ? user.email || '' : '';
  S = loadLocal();
  // First sign-in on this device: carry over anything studied before signing in.
  if (user) { try { const guest = localStorage.getItem('eng.v1.state.local'); if (guest) { S = merge(S, JSON.parse(guest)); localStorage.removeItem('eng.v1.state.local'); saveLocal(); } } catch (e) {} }
  notify();
  await pull();
}
export function stopSession() { session.uid = null; session.email = ''; S = blank(); }
