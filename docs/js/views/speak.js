// Speaking practice: say the Korean sentence in English. A miss shows the answer,
// and the sentence passes only after it is said correctly twice.
import { el, btn, h, speakBtn, progressBar, MIC, sleep } from '../ui.js';
import { speakRec, setSpeak, markStudied, chatRec } from '../state.js';
import { sessions, session as getSession, SESSIONS } from '../data.js';
import { say, listen, stopListening, canListen, matches, listenErrorText } from '../speech.js';
import { go, setLeaveGuard } from '../main.js';

const REPEAT = 2;
const unlockedS = n => n === 1 || speakRec(n - 1).done;

export async function renderSpeakList({ box }) {
  const all = await sessions();
  const done = all.filter(s => speakRec(s.n).done).length;
  box.append(h('header', 'page-head', h('p', 'eyebrow', '말하기'), h('h1', '', '하루 한 표현'),
    h('p', 'muted', '한국어 문장을 보고 영어로 말하세요. 틀리면 정답을 들려주고, 두 번 맞게 말해야 넘어갑니다.')));
  if (!canListen) box.append(h('div', 'notice', '이 브라우저는 음성 인식을 지원하지 않아 입력으로 답합니다. Chrome·Edge·Safari 최신 버전에서는 말로 답할 수 있어요.'));
  const list = el('div', 'sess-list');
  for (let n = 1; n <= SESSIONS; n++) {
    const s = all.find(x => x.n === n);
    const rec = speakRec(n);
    const open = s && unlockedS(n);
    const b = h('button', 'sess' + (rec.done ? ' done' : open ? ' open' : ' locked'),
      h('span', 'sess-n', String(n)),
      h('span', 'sess-text', h('b', '', s ? s.pattern : '준비 중'), h('small', '', s ? s.title : '다음 업데이트에서 추가')),
      h('span', 'sess-state', rec.done ? '완료' : !s ? '' : !open ? '잠김' : rec.idx ? `${rec.idx}/10` : '시작'));
    b.type = 'button';
    if (open) b.addEventListener('click', () => go(`sp/${n}`)); else b.disabled = true;
    const row = h('div', 'sess-row', b);
    if (s && s.chat && rec.done) {
      const cr = chatRec(n);
      row.append(btn('sess-chat' + (cr.done ? ' done' : ''), '', () => go(`chat/${n}`), { 'aria-label': `${n}회차 AI 상황극: ${s.chat.title}` }));
      row.lastChild.append(h('b', '', 'AI 상황극'), h('small', '', cr.done ? (cr.mission ? '미션 성공' : '완료') : s.chat.title));
    }
    list.append(row);
  }
  box.append(h('p', 'muted small', `${done}/${SESSIONS} 회차 완료`), list);
}

export async function renderSession(ctx, n) {
  const { box } = ctx;
  const s = await getSession(n);
  box.append(h('header', 'page-head tight', btn('back', '‹ 말하기 목록', () => go('speak'))));
  if (!s || !unlockedS(n)) { box.append(h('div', 'empty', h('p', '', s ? '앞 회차를 먼저 끝내면 열립니다.' : '아직 준비되지 않은 회차입니다.'))); return; }
  const stage = el('div', 'stage');
  box.append(stage);
  const rec = speakRec(n);
  let idx = rec.done ? 0 : Math.min(rec.idx || 0, s.items.length - 1);
  const learned = new Set();
  let typeMode = !canListen;

  // ---------- intro ----------
  function intro() {
    stage.textContent = '';
    const ex = s.items[0];
    stage.append(h('div', 'card sp-intro',
      h('span', 'chip alt', `${n}회차`),
      h('h1', 'pattern big', s.pattern),
      h('p', 'sp-title', s.title),
      h('p', 'sp-tip', s.tip),
      h('div', 'sp-example', h('span', 'muted small', '예시'), h('p', '', ex.ko), h('p', 'en', ex.en, speakBtn(() => say(ex.en)))),
      btn('btn primary block alt', idx ? `${idx + 1}번째 문장부터 이어서` : '시작하기', () => item())));
    if (rec.done) stage.append(h('p', 'muted small center', '이미 끝낸 회차입니다. 다시 연습할 수 있어요.'));
    if (rec.done && s.chat) stage.append(chatInvite());
  }

  // ---------- one sentence ----------
  function item() {
    setLeaveGuard(null);
    const it = s.items[idx];
    let phase = 'try', good = 0;   // 'try' → first attempt; 'learn' → must say it right REPEAT times
    stage.textContent = '';
    const top = h('div', 'quiz-top', progressBar(idx, s.items.length, 'alt'), h('span', 'quiz-count', `${idx + 1}/${s.items.length}`));
    const card = el('div', 'card sp-card');
    const ko = h('p', 'sp-ko', it.ko);
    const answer = el('div', 'sp-answer'); answer.hidden = true;
    const heard = el('p', 'sp-heard'); heard.setAttribute('aria-live', 'polite');
    const status = el('p', 'sp-status'); status.setAttribute('role', 'status');
    const counter = el('div', 'sp-counter'); counter.hidden = true;
    const controls = el('div', 'sp-controls');
    card.append(h('p', 'q-hint', `"${s.pattern}"로 영어로 말해 보세요`), ko, answer, counter, heard, status, controls);
    stage.append(top, card);

    function showAnswer() {
      answer.hidden = false; answer.textContent = '';
      answer.append(h('span', 'muted small', '이렇게 말해요'), h('p', 'en', it.en, speakBtn(() => say(it.en), '정답 듣기')));
      if (it.alt && it.alt.length) answer.append(h('p', 'muted small', `이렇게 말해도 돼요: ${it.alt[0]}`));
    }
    function paintCounter() {
      counter.hidden = phase !== 'learn';
      counter.textContent = '';
      for (let k = 0; k < REPEAT; k++) counter.append(el('span', k < good ? 'on' : ''));
      counter.append(h('small', '', `맞게 말하기 ${good}/${REPEAT}`));
    }
    function paintControls() {
      controls.textContent = '';
      if (typeMode) {
        const form = el('form', 'type-form');
        const input = el('input', 'type-input');
        Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: '영어 문장을 입력' });
        input.setAttribute('autocapitalize', 'sentences'); input.setAttribute('aria-label', '영어 문장 입력');
        const sub = el('button', 'btn primary alt', '확인'); sub.type = 'submit';
        form.append(input, sub);
        form.addEventListener('submit', e => { e.preventDefault(); if (input.value.trim()) { check([input.value]); input.value = ''; } });
        controls.append(form);
        if (canListen) controls.append(btn('btn ghost small', '말로 답하기', () => { typeMode = false; paintControls(); }));
        setTimeout(() => input.focus(), 50);
      } else {
        const mic = btn('mic', '', toggle, { 'aria-label': '말하기 시작' });
        mic.innerHTML = MIC + '<span>눌러서 말하기</span>';
        controls.append(mic, btn('btn ghost small', '입력하기', () => { stopListening(); typeMode = true; paintControls(); }));
      }
    }
    let listening = false;
    async function toggle() {
      const mic = controls.querySelector('.mic');
      if (listening) { stopListening(); return; }
      listening = true; mic.classList.add('on'); mic.lastChild.textContent = '듣는 중… 다 말했으면 누르세요';
      card.dataset.busy = '1';
      heard.textContent = ''; status.textContent = ''; status.className = 'sp-status';
      try {
        const r = await listen({ onInterim: t => { heard.textContent = t; } });
        if (!r.alts.length) { status.className = 'sp-status err'; status.textContent = '목소리가 들리지 않았어요. 다시 눌러 말해 보세요.'; }
        else check(r.alts);
      } catch (e) {
        status.className = 'sp-status err'; status.textContent = listenErrorText(e.code);
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'unsupported', 'network'].includes(e.code)) { typeMode = true; paintControls(); }
      } finally {
        listening = false; delete card.dataset.busy;
        const m = controls.querySelector('.mic'); if (m) { m.classList.remove('on'); m.lastChild.textContent = '눌러서 말하기'; }
      }
    }
    function check(alts) {
      const hit = matches(it, alts);
      heard.textContent = `“${hit || alts[0]}”`;
      if (phase === 'try') {
        if (hit) { pass('정답이에요!'); return; }
        phase = 'learn'; learned.add(idx);
        status.className = 'sp-status err'; status.textContent = `아쉬워요. 정답을 듣고 ${REPEAT}번 맞게 말해 보세요.`;
        showAnswer(); paintCounter(); say(it.en);
        return;
      }
      if (hit) {
        good++; paintCounter();
        if (good >= REPEAT) { pass('잘했어요! 이제 넘어갑니다.'); return; }
        status.className = 'sp-status ok'; status.textContent = `좋아요! 한 번 더 말해 보세요.`;
      } else {
        status.className = 'sp-status err'; status.textContent = '조금 달라요. 정답을 다시 듣고 말해 보세요.';
        say(it.en);
      }
    }
    async function pass(text) {
      status.className = 'sp-status ok'; status.textContent = text;
      controls.textContent = '';
      showAnswer();
      card.classList.add('passed');
      await say(it.en);
      await sleep(400);
      if (!ctx.alive()) return;
      idx++;
      if (idx >= s.items.length) { setSpeak(n, { done: true, idx: 0 }); markStudied(); finish(); }
      else { setSpeak(n, { idx }); item(); }
    }
    paintControls();
  }

  function chatInvite() {
    return h('section', 'card chat-invite',
      h('div', '', h('span', 'chip alt', 'AI 상황극'), h('h3', '', s.chat.title), h('p', 'muted small', `나: ${s.chat.you} · AI: ${s.chat.ai} — 배운 "${s.pattern}"를 실전처럼 써 보세요.`)),
      btn('btn primary alt', '상황극 시작', () => go(`chat/${n}`)));
  }

  // ---------- finished ----------
  async function finish() {
    stage.textContent = '';
    const all = await sessions();
    const card = h('div', 'card done-card celebrate',
      h('span', 'chip ok', `${n}회차 완료`),
      h('h2', '', learned.size ? `${s.items.length}문장 완료! ${learned.size}문장은 반복 연습으로 익혔어요` : '완벽해요! 모든 문장을 한 번에 말했어요'));
    if (learned.size) {
      const ul = el('ul', 'sent-list');
      [...learned].forEach(i => ul.append(h('li', '', h('span', 'muted', s.items[i].ko), h('b', '', s.items[i].en), speakBtn(() => say(s.items[i].en)))));
      card.append(h('p', 'muted small', '다시 보면 좋은 문장'), ul);
    }
    const row = el('div', 'result-btns');
    if (all.some(x => x.n === n + 1)) row.append(btn('btn primary alt', `${n + 1}회차로`, () => go(`sp/${n + 1}`)));
    row.append(btn('btn', '홈으로', () => go('home')));
    stage.append(card);
    if (s.chat) stage.append(chatInvite());
    stage.append(row);
  }

  intro();
}
