// Role-play conversation unlocked by each finished speaking session.
// The learner talks (speech recognition or typing); the server function eng-chat (Gemini) answers
// in role, reviews each line, and writes a Korean wrap-up at the end. Nothing is kept on the server.
import { el, btn, h, speakBtn, MIC } from '../ui.js';
import { CLOUD, sb, session as auth, speakRec, setChat, chatRec, markStudied } from '../state.js';
import { session as getSession } from '../data.js';
import { say, listen, stopListening, canListen, listenErrorText, emptyText } from '../speech.js';
import { go, setLeaveGuard } from '../main.js';

const MAX_TURNS = 12;   // learner lines per conversation
const PATTERN_GOAL = 2; // times to use the session's pattern

// Development aid: http://localhost:…/?local&mockchat answers with canned lines (no login, no AI).
const MOCK = location.hostname === 'localhost' && new URLSearchParams(location.search).has('mockchat');
async function mockChat(body) {
  await new Promise(r => setTimeout(r, 500));
  if (body.mode === 'finish') return { summary: '주문을 끝까지 잘 해냈어요. 관사 a/an을 신경 써 보세요.', corrections: [{ said: 'can I get a ice americano', better: 'Can I get an iced americano?', note: '모음 앞에는 an, 차가운 음료는 iced' }], mission: true };
  const mine = body.history.filter(t => t.who === 'me').length;
  const last = (body.history.filter(t => t.who === 'me').pop() || {}).text || '';
  return { reply: mine ? 'Sure! Anything else for you today?' : 'Hi there! What can I get for you today?', ko: mine ? '네! 더 필요하신 건 있으세요?' : '안녕하세요! 무엇을 드릴까요?',
    feedback: /\ba ice\b/i.test(last) ? { ok: false, better: 'Can I get an iced americano?', note: '모음 앞에는 an을 써요.' } : { ok: true, better: '', note: '' },
    usedPattern: /can i get/i.test(last), done: mine >= 3 };
}

async function callChat(body) {
  if (MOCK) return mockChat(body);
  const { data, error } = await sb.functions.invoke('eng-chat', { body });
  if (error) {
    let msg = '';
    try { msg = (await error.context.json()).error; } catch (e) {}
    throw new Error(msg || '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

export async function renderChat(ctx, n) {
  const { box } = ctx;
  const s = await getSession(n);
  box.append(h('header', 'page-head tight', btn('back', '‹ 말하기 목록', () => go('speak'))));
  if (!s || !s.chat) { box.append(h('div', 'empty', h('p', '', '이 회차에는 상황극이 없습니다.'))); return; }
  if (!speakRec(n).done) { box.append(h('div', 'empty', h('p', '', `${n}회차 말하기를 끝내면 상황극이 열립니다.`), btn('btn primary alt', `${n}회차 하러 가기`, () => go(`sp/${n}`)))); return; }
  if (!MOCK && (!CLOUD || !auth.uid)) { box.append(h('div', 'empty', h('p', '', 'AI 상황극은 로그인해야 쓸 수 있습니다.'))); return; }

  const c = s.chat;
  const history = [];          // { who: 'ai' | 'me', text }
  let used = 0, turns = 0, busy = false, ended = false, typeMode = !canListen;

  const usedBox = el('span', 'chat-used');
  const head = h('section', 'card chat-head',
    h('div', 'today-top', h('span', 'chip alt', `${n}회차 상황극`), usedBox),
    h('h1', '', c.title),
    h('p', 'chat-roles', h('span', '', h('b', '', '나 '), c.you), h('span', '', h('b', '', 'AI '), c.ai)),
    h('p', 'chat-goal', h('b', '', '미션 '), c.goal),
    h('p', 'muted small', h('b', 'pattern', s.pattern), ' 표현을 넣어 말해 보세요. AI가 내 문장을 바로 고쳐 줍니다.'));
  const log = el('div', 'chat-log'); log.setAttribute('aria-live', 'polite');
  const status = el('p', 'sp-status'); status.setAttribute('role', 'status');
  const composer = el('div', 'chat-composer');
  const endBtn = btn('btn ghost small', '대화 끝내기', () => finish());
  box.append(head, log, status, composer, h('div', 'chat-end', endBtn));

  function paintUsed() { usedBox.textContent = `표현 사용 ${Math.min(used, PATTERN_GOAL)}/${PATTERN_GOAL}${used >= PATTERN_GOAL ? ' ✓' : ''}`; usedBox.classList.toggle('ok', used >= PATTERN_GOAL); }
  const scrollEnd = () => requestAnimationFrame(() => composer.scrollIntoView({ block: 'end', behavior: 'smooth' }));

  function aiBubble(text, ko) {
    const koLine = h('p', 'bubble-ko', ko); koLine.hidden = true;
    const b = h('div', 'bubble ai',
      h('p', 'bubble-en', text),
      koLine,
      h('div', 'bubble-tools', speakBtn(() => say(text), '다시 듣기', 'small'), btn('linkbtn', '해석', e => { koLine.hidden = !koLine.hidden; e.target.textContent = koLine.hidden ? '해석' : '해석 숨기기'; })));
    log.append(b); scrollEnd();
  }
  function meBubble(text) {
    const b = h('div', 'bubble me', h('p', 'bubble-en', text));
    const fb = el('div', 'bubble-fb pending'); fb.textContent = '확인 중…';
    const wrap = h('div', 'me-wrap', b, fb);
    log.append(wrap); scrollEnd();
    return fb;
  }
  function showFeedback(fbEl, f) {
    fbEl.className = 'bubble-fb ' + (f.ok ? 'ok' : 'fix');
    fbEl.textContent = '';
    if (f.ok && !f.better) { fbEl.append('✓ 자연스러워요'); return; }
    fbEl.append(h('span', 'fb-label', f.ok ? '이렇게도 말해요' : '더 자연스럽게'), h('span', 'fb-better', f.better), speakBtn(() => say(f.better), '고친 문장 듣기', 'small'));
    if (f.note) fbEl.append(h('span', 'fb-note', f.note));
  }
  function typing(on) {
    let t = log.querySelector('.bubble.typing');
    if (on && !t) { t = h('div', 'bubble ai typing', h('span', ''), h('span', ''), h('span', '')); log.append(t); scrollEnd(); }
    if (!on && t) t.remove();
  }

  async function turn(fbEl) {
    busy = true; paintComposer(); typing(true);
    status.className = 'sp-status'; status.textContent = '';
    try {
      const r = await callChat({ scenario: { pattern: s.pattern, ...c }, history });
      if (!ctx.alive()) return;
      typing(false);
      if (fbEl) { showFeedback(fbEl, r.feedback); if (r.usedPattern) { used++; paintUsed(); } }
      history.push({ who: 'ai', text: r.reply });
      aiBubble(r.reply, r.ko);
      say(r.reply);
      if (r.done || turns >= MAX_TURNS) { busy = false; return finish(); }
    } catch (e) {
      typing(false);
      if (fbEl) { fbEl.className = 'bubble-fb'; fbEl.textContent = ''; }
      status.className = 'sp-status err'; status.textContent = e.message + ' ';
      if (fbEl) {
        // Drop the unanswered line so the learner can say it again.
        history.pop(); fbEl.parentElement.remove(); turns--;
      } else status.append(btn('linkbtn', '다시 시도', () => turn(null)));
    }
    busy = false; paintComposer();
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text || busy || ended) return;
    turns++;
    history.push({ who: 'me', text });
    turn(meBubble(text));
  }

  let listening = false;
  async function toggleMic() {
    if (listening) { stopListening(); return; }
    if (busy || ended) return;
    listening = true; paintComposer();
    const live = el('p', 'sp-heard'); composer.prepend(live);
    try {
      const r = await listen({ onInterim: t => { live.textContent = t; } });
      if (!r.alts.length) { status.className = 'sp-status err'; status.textContent = emptyText(); }
      else send(r.alts[0]);
    } catch (e) {
      status.className = 'sp-status err'; status.textContent = listenErrorText(e.code);
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'unsupported', 'network'].includes(e.code)) typeMode = true;
    } finally { listening = false; live.remove(); paintComposer(); }
  }

  function paintComposer() {
    composer.textContent = '';
    if (ended) return;
    if (typeMode) {
      const form = el('form', 'type-form');
      const input = el('input', 'type-input');
      Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: busy ? 'AI가 답하는 중…' : '영어로 입력' });
      input.setAttribute('autocapitalize', 'sentences'); input.setAttribute('aria-label', '영어로 말할 문장');
      input.disabled = busy;
      const sub = el('button', 'btn primary alt', '보내기'); sub.type = 'submit'; sub.disabled = busy;
      form.append(input, sub);
      form.addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
      composer.append(form);
      if (canListen) composer.append(btn('btn ghost small', '말로 하기', () => { typeMode = false; paintComposer(); }));
      if (!busy) setTimeout(() => input.focus(), 30);
    } else {
      const mic = btn('mic' + (listening ? ' on' : ''), '', toggleMic, { 'aria-label': listening ? '말하기 끝' : '말하기 시작' });
      mic.innerHTML = MIC + `<span>${listening ? '듣는 중… 다 말했으면 누르세요' : busy ? 'AI가 답하는 중…' : '눌러서 말하기'}</span>`;
      mic.disabled = busy;
      composer.append(mic, btn('btn ghost small', '입력하기', () => { stopListening(); typeMode = true; paintComposer(); }));
    }
  }

  async function finish() {
    if (ended) return;
    ended = true; stopListening(); paintComposer(); endBtn.hidden = true; setLeaveGuard(null);
    const mine = history.filter(t => t.who === 'me').length;
    const card = h('section', 'card done-card celebrate chat-summary', h('span', 'chip ok', '대화 정리'), h('p', 'muted', 'AI가 대화를 정리하는 중…'));
    box.append(card); card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    let r = null;
    try { r = await callChat({ mode: 'finish', scenario: { pattern: s.pattern, ...c }, history }); }
    catch (e) { card.lastChild.textContent = `정리를 받지 못했습니다: ${e.message}`; }
    if (!ctx.alive()) return;
    if (mine >= 3) { setChat(n, { done: true, mission: !!(r && r.mission) }); markStudied(); }
    if (r) {
      card.textContent = '';
      card.append(
        h('span', 'chip ok', r.mission ? '미션 성공' : '대화 정리'),
        h('h2', '', r.mission ? `잘했어요! "${c.title}" 미션을 해냈어요` : '수고했어요! 다음엔 미션까지 해 봐요'),
        h('p', '', r.summary),
        h('div', 'score-row', h('div', 'score', h('b', '', String(mine)), h('span', '', '내가 한 말')), h('div', 'score', h('b', '', String(Math.min(used, 99))), h('span', '', `${s.pattern} 사용`))));
      if (r.corrections.length) {
        const ul = el('ul', 'sent-list');
        r.corrections.forEach(x => ul.append(h('li', 'fix-item', h('span', 'muted', x.said), h('b', '', x.better), speakBtn(() => say(x.better)), h('small', 'fb-note', x.note))));
        card.append(h('p', 'muted small', '이렇게 고쳐 말해 보세요'), ul);
      }
    }
    if (mine < 3) card.append(h('p', 'muted small', '세 마디 이상 주고받으면 상황극 완료로 기록됩니다.'));
    box.append(h('div', 'result-btns', btn('btn', '다시 하기', () => go(`chat/${n}`)), btn('btn primary alt', '말하기 목록', () => go('speak'))));
  }

  paintUsed(); paintComposer();
  setLeaveGuard(() => ended || history.length < 2 || confirm('대화를 그만할까요? 지금 대화는 저장되지 않습니다.'));
  turn(null); // AI opens the scene
  if (chatRec(n).done) status.textContent = '이미 완료한 상황극입니다. 다른 방향으로 다시 해 볼 수 있어요.';
}
