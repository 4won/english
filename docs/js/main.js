import { $, $$, el, btn, h } from './ui.js';
import { CLOUD, sb, session, onChange, onRemoteChange, startSession, stopSession, pull, prefs, setPrefs } from './state.js';
import { stopSaying, stopListening } from './speech.js';
import { renderHome } from './views/home.js';
import { renderWords, renderLevel } from './views/words.js';
import { renderChapter } from './views/chapter.js';
import { renderSpeakList, renderSession } from './views/speak.js';
import { renderWrong } from './views/wrong.js';

export const VERSION = 'v1';

// ---------- routing ----------
// #home · #words · #words/<level> · #ch/<level>/<n>[/<step>] · #speak · #sp/<n> · #wrong
const TABS = { home: 'home', words: 'words', ch: 'words', speak: 'speak', sp: 'speak', wrong: 'wrong' };
let renderToken = 0;
let leaveGuard = null; // a running quiz can ask before the user leaves it

export function go(hash) { if (location.hash === '#' + hash) route(); else location.hash = hash; }
export function setLeaveGuard(fn) { leaveGuard = fn; }

async function route() {
  if ($('#main').hidden) return;
  stopSaying(); stopListening();
  const parts = (location.hash || '#home').slice(1).split('/');
  const name = TABS[parts[0]] ? parts[0] : 'home';
  $$('[data-tab]').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === TABS[name])));
  document.body.dataset.tab = TABS[name];
  const view = $('#view');
  const token = ++renderToken;
  leaveGuard = null;
  const box = el('div', 'view-inner');
  const ctx = { box, alive: () => token === renderToken };
  try {
    if (name === 'home') await renderHome(ctx);
    else if (name === 'words') await (parts[1] ? renderLevel(ctx, parts[1]) : renderWords(ctx));
    else if (name === 'ch') await renderChapter(ctx, parts[1], +parts[2], parts[3]);
    else if (name === 'speak') await renderSpeakList(ctx);
    else if (name === 'sp') await renderSession(ctx, +parts[1]);
    else if (name === 'wrong') await renderWrong(ctx);
  } catch (e) {
    console.error(e);
    box.textContent = '';
    box.append(h('div', 'empty', h('p', '', '화면을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.'), btn('btn', '다시 시도', route)));
  }
  if (token !== renderToken) return;
  view.textContent = ''; view.append(box);
  window.scrollTo(0, 0);
}

// Views that show progress re-render when progress changes elsewhere (another device, sync).
let syncRerender = null;
onChange(updateSync);
onRemoteChange(() => {
  const parts = (location.hash || '#home').slice(1).split('/');
  if (!['home', 'words', 'speak'].includes(parts[0])) return; // never interrupt a chapter, session or review
  clearTimeout(syncRerender);
  syncRerender = setTimeout(() => { if (!document.querySelector('.view-inner [data-busy]')) route(); }, 250);
});

function updateSync() {
  const d = $('#syncDot'); if (!d) return;
  const map = { ok: ['ok', '동기화됨'], saving: ['wait', '저장 중…'], error: ['err', '동기화 오류 · 다시 시도합니다'], idle: ['', CLOUD ? '' : '이 기기에만 저장'] };
  const [cls, text] = map[session.sync] || map.idle;
  d.className = 'sync-dot ' + cls; d.title = text; d.setAttribute('aria-label', text);
}

// ---------- settings sheet ----------
function openSettings() {
  const d = $('#settings');
  const body = $('#settingsBody'); body.textContent = '';
  const p = prefs();
  const rateRow = h('div', 'set-row', h('div', 'set-label', '발음 속도'));
  const seg = el('div', 'seg');
  [[0.7, '느리게'], [0.9, '보통'], [1.05, '빠르게']].forEach(([v, t]) => {
    const b = btn('seg-btn' + (Math.abs((p.rate || 0.9) - v) < 0.01 ? ' on' : ''), t, () => { setPrefs({ rate: v }); $$('.seg-btn', seg).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
    seg.append(b);
  });
  rateRow.append(seg);
  const auto = el('input'); auto.type = 'checkbox'; auto.id = 'setAuto'; auto.checked = p.autoSpeak !== false;
  auto.addEventListener('change', () => setPrefs({ autoSpeak: auto.checked }));
  const autoRow = h('label', 'set-row', h('div', 'set-label', '단어 카드를 넘기면 자동으로 발음'), auto);
  autoRow.htmlFor = 'setAuto';
  body.append(rateRow, autoRow);
  if (CLOUD && session.uid) {
    body.append(h('div', 'set-row', h('div', 'set-label', '계정', h('small', '', session.email)), btn('btn', '로그아웃', async () => { d.close(); await sb.auth.signOut(); })));
  } else body.append(h('p', 'set-note', '로그인하지 않아 이 기기에만 저장됩니다.'));
  body.append(h('p', 'set-note', `4WON'S ENGLISH ${VERSION} · 4WON'S PLANNER 계정으로 로그인합니다.`));
  d.showModal();
}

// ---------- auth ----------
const AUTH_ERRORS = [
  [/invalid login credentials/i, '이메일 또는 비밀번호가 맞지 않습니다.'],
  [/email not confirmed/i, '메일 인증이 아직 안 됐습니다.'],
  [/rate limit/i, '시도가 너무 많습니다. 잠시 후 다시 해 주세요.'],
];
async function onLogin(e) {
  e.preventDefault();
  const email = $('#a-email').value.trim(), password = $('#a-pw').value, msg = $('#authMsg');
  msg.className = 'auth-msg err';
  if (!email.includes('@')) { msg.textContent = '이메일을 입력하세요.'; return; }
  if (!password) { msg.textContent = '비밀번호를 입력하세요.'; return; }
  msg.className = 'auth-msg'; msg.textContent = '로그인하는 중…';
  $('#authLogin').disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { const hit = AUTH_ERRORS.find(([re]) => re.test(error.message)); msg.className = 'auth-msg err'; msg.textContent = hit ? hit[1] : `로그인하지 못했습니다: ${error.message}`; }
    else msg.textContent = '';
  } catch (err) { msg.className = 'auth-msg err'; msg.textContent = '서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'; }
  finally { $('#authLogin').disabled = false; }
}
const showAuth = () => { $('#main').hidden = true; $('#auth').hidden = false; };
const showMain = () => { $('#auth').hidden = true; $('#main').hidden = false; };

// ---------- boot ----------
function boot() {
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    if (leaveGuard && !leaveGuard()) return;
    go(b.dataset.tab);
  }));
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', () => $('#settings').close());
  $('#authForm').addEventListener('submit', onLogin);
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!CLOUD) { showMain(); startSession(null).then(route); updateSync(); return; }
  sb.auth.onAuthStateChange((event, s) => {
    setTimeout(async () => { // defer: supabase calls inside this callback can deadlock
      const user = s && s.user;
      if (user) { if (user.id !== session.uid) { showMain(); await startSession(user); route(); } }
      else { stopSession(); showAuth(); }
    }, 0);
  });
}
boot();
