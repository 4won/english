// Daily study reminder: this device's push subscription (table eng_push_subscriptions) and the
// reminder time, kept in prefs.remindTime so every device and the server read the same time.
import { el, btn, h } from './ui.js';
import { CLOUD, sb, session, prefs, setPrefs } from './state.js';

const CFG = window.ENG_CONFIG || {};
const TABLE = 'eng_push_subscriptions';
export const DEFAULT_TIME = '21:00';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };

async function currentSub() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
// Called on sign-out so the next person on this device doesn't get the reminders.
export async function dropThisDevice() {
  try { const sub = await currentSub(); if (sub) { await sb.from(TABLE).delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } } catch (e) {}
}

const TIMES = [];
for (let m = 6 * 60; m <= 23 * 60 + 50; m += 10) TIMES.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const label = t => { const hh = +t.slice(0, 2), mm = +t.slice(3); return `${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}시${mm ? ` ${mm}분` : ''}`; };

export function reminderSection() {
  const box = el('div', 'set-block');
  box.append(h('div', 'set-label', '매일 학습 알림', h('small', '', '그날 공부를 아직 안 했으면 정한 시간에 알려 드리고, 그래도 안 했으면 밤 9시·10시·11시에 한 번씩 더 알려 드려요. 공부를 끝내면 그날 알림은 멈춰요.')));
  if (!CLOUD || !session.uid) { box.append(h('p', 'set-note', '로그인하면 알림을 켤 수 있어요.')); return box; }

  const sel = el('select', 'set-select');
  sel.setAttribute('aria-label', '알림 시간');
  const cur = prefs().remindTime || DEFAULT_TIME;
  TIMES.forEach(t => { const o = el('option', '', label(t)); o.value = t; if (t === cur) o.selected = true; sel.append(o); });
  sel.addEventListener('change', () => setPrefs({ remindTime: sel.value }));
  const timeRow = h('label', 'set-row', h('div', 'set-label', '알림 시간'), sel);

  const msg = el('p', 'set-note');
  const acts = el('div', 'set-acts');
  const on = btn('btn primary', '이 기기에서 알림 켜기'), off = btn('btn', '알림 끄기'), test = btn('btn', '테스트 알림');
  acts.append(on, off, test);
  box.append(timeRow, acts, msg);
  const say = (t, err) => { msg.textContent = t; msg.className = 'set-note' + (err ? ' err' : ''); };

  async function paint() {
    on.hidden = off.hidden = test.hidden = true;
    if (isIOS && !standalone()) return say('iPhone은 Safari 공유 → ‘홈 화면에 추가’로 설치한 뒤, 홈 화면 아이콘으로 열어서 알림을 켤 수 있어요.');
    if (!supported()) return say('이 브라우저는 알림을 지원하지 않아요.');
    if (Notification.permission === 'denied') return say('이 기기에서 알림이 차단되어 있어요. 브라우저나 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.', true);
    const sub = await currentSub();
    if (sub) { off.hidden = test.hidden = false; say('이 기기에서 알림이 켜져 있어요.'); } else { on.hidden = false; say(''); }
  }
  on.addEventListener('click', async () => {
    try {
      say('알림 권한을 요청하는 중…');
      if (await Notification.requestPermission() !== 'granted') { say('알림 권한이 허용되지 않았어요.', true); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapidPublicKey) });
      const j = sub.toJSON();
      const { error } = await sb.from(TABLE).upsert({ endpoint: j.endpoint, user_id: session.uid, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
      if (error) throw error;
      if (!prefs().remindTime) setPrefs({ remindTime: sel.value });
      await paint(); say(`알림을 켰어요. 매일 ${label(sel.value)}에 확인합니다. ‘테스트 알림’으로 도착하는지 확인해 보세요.`);
    } catch (e) { say(`알림을 켜지 못했어요: ${(e && e.message) || e}`, true); }
  });
  off.addEventListener('click', async () => {
    try { await dropThisDevice(); await paint(); say('이 기기의 알림을 껐어요.'); }
    catch (e) { say(`알림을 끄지 못했어요: ${(e && e.message) || e}`, true); }
  });
  test.addEventListener('click', async () => {
    say('테스트 알림을 보내는 중…');
    try {
      const { data, error } = await sb.functions.invoke('eng-reminders', { body: { test: true } });
      if (error) throw error;
      say(data && data.sent ? `보냈어요 (${data.sent}대). 몇 초 안에 도착합니다.` : '보낼 기기를 찾지 못했어요. 알림을 껐다가 다시 켜 보세요.', !(data && data.sent));
    } catch (e) { say(`테스트 알림을 보내지 못했어요: ${(e && e.message) || e}`, true); }
  });
  paint();
  return box;
}
