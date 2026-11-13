// One chapter: 20 word cards → quiz 1 (multiple choice) → quiz 2 (typing) → result.
import { el, btn, h, speakBtn, highlight } from '../ui.js';
import { chapter, setStep, addWrong, prefs } from '../state.js';
import { chapterWords, levelInfo, readyChapters, CHAPTERS, courseLevels } from '../data.js';
import { say } from '../speech.js';
import { choiceQuiz, typingQuiz } from '../quiz.js';
import { go, setLeaveGuard } from '../main.js';
import { unlocked } from './words.js';

const STEPS = [['cards', '단어 보기'], ['quiz1', '퀴즈 1단계'], ['quiz2', '퀴즈 2단계']];

export async function renderChapter(ctx, lv, ch, wanted) {
  const { box } = ctx;
  const L = levelInfo(lv);
  const words = await chapterWords(lv, ch);
  box.append(h('header', 'page-head tight', btn('back', `‹ ${L.full} 챕터 목록`, () => go(`words/${lv}`))));
  if (!words.length || !unlocked(lv, ch)) {
    box.append(h('div', 'empty', h('p', '', words.length ? '앞 챕터를 먼저 끝내면 열립니다.' : '아직 준비되지 않은 챕터입니다.'), btn('btn', '챕터 목록', () => go(`words/${lv}`))));
    return;
  }
  const title = h('h1', '', `${L.full} ${ch}챕터`);
  const stepper = el('ol', 'stepper');
  box.querySelector('.page-head').append(title, stepper);
  const stage = el('div', 'stage');
  box.append(stage);

  const rec = chapter(lv, ch);
  let step = STEPS.some(s => s[0] === wanted) ? wanted : rec.step === 'done' ? 'menu' : rec.step;
  const scores = {};

  function paintStepper(cur) {
    stepper.textContent = '';
    const r = chapter(lv, ch);
    const rank = s => ['cards', 'quiz1', 'quiz2', 'done'].indexOf(s);
    STEPS.forEach(([id, label], i) => {
      const li = h('li', (id === cur ? 'on' : '') + (rank(r.step) > i ? ' done' : ''), h('span', 'dot', String(i + 1)), h('span', '', label));
      stepper.append(li);
    });
  }

  async function run(s) {
    step = s;
    paintStepper(s);
    stage.textContent = '';
    setLeaveGuard(s === 'quiz1' || s === 'quiz2' ? () => confirm('퀴즈를 그만할까요? 지금 퀴즈의 진행 상황은 저장되지 않습니다.') : null);
    if (s === 'menu') return menu();
    if (s === 'cards') { await cards(); if (!ctx.alive()) return; setStep(lv, ch, 'quiz1'); return run('quiz1'); }
    if (s === 'quiz1') {
      stage.append(intro('퀴즈 1단계', '영어를 보고 뜻을, 뜻을 보고 영어를 고르세요. 틀린 문제는 끝에 다시 나옵니다.'));
      const r = await choiceQuiz(stage.appendChild(el('div', 'quiz')), words, words, { onWrong: addWrong });
      if (!ctx.alive()) return;
      scores.q1 = r; setStep(lv, ch, 'quiz2', { best1: r.firstTry });
      return run('quiz2');
    }
    if (s === 'quiz2') {
      stage.append(intro('퀴즈 2단계', '뜻을 보고 영어 철자를 직접 쓰세요. 틀릴 때마다 힌트가 하나씩 나옵니다.'));
      const r = await typingQuiz(stage.appendChild(el('div', 'quiz')), words, { onWrong: addWrong });
      if (!ctx.alive()) return;
      scores.q2 = r; setStep(lv, ch, 'done', { best2: r.firstTry });
      setLeaveGuard(null);
      return result();
    }
  }

  const intro = (t, d) => h('div', 'stage-intro', h('h2', '', t), h('p', 'muted', d));

  // ---------- word cards ----------
  function cards() {
    return new Promise(resolve => {
      let i = 0, listMode = false;
      const wrap = el('div', 'cards');
      const top = h('div', 'cards-top', h('span', 'muted', ''), btn('btn ghost small', '전체 목록', () => { listMode = !listMode; paint(); }));
      const body = el('div', 'cards-body');
      wrap.append(top, body);
      stage.append(wrap);

      function card(w) {
        const c = el('article', 'wcard');
        const main = h('div', 'wcard-main', h('div', 'wcard-text', h('div', 'wcard-en' + (w.en.includes(' ') ? ' phrase' : ''), w.en), h('div', 'wcard-ko', w.ko)));
        if (w.img) { const im = el('img', 'wcard-img'); Object.assign(im, { src: w.img, alt: '', width: 120, height: 120, loading: 'lazy', decoding: 'async' }); main.append(im); }
        c.append(
          h('div', 'wcard-head', h('span', 'pos', w.pos), speakBtn(() => say(w.en), `${w.en} 발음 듣기`)),
          main,
          h('div', 'wcard-ex', h('p', 'ex-en', highlight(w.ex, w.en), speakBtn(() => say(w.ex), '예문 듣기', 'small')), h('p', 'ex-ko', w.exKo)));
        return c;
      }
      function paint() {
        body.textContent = '';
        top.firstChild.textContent = listMode ? `${words.length}개 전체` : `${i + 1} / ${words.length}`;
        top.lastChild.textContent = listMode ? '카드로 보기' : '전체 목록';
        if (listMode) {
          const ul = el('ul', 'word-list');
          words.forEach(w => ul.append(h('li', '', h('b', '', w.en), h('span', '', w.ko), speakBtn(() => say(w.en)))));
          body.append(ul, btn('btn primary block', '퀴즈 1단계 시작', resolve));
          return;
        }
        const w = words[i];
        const c = card(w);
        const nx = words[i + 1]; if (nx && nx.img) { const p = new Image(); p.src = nx.img; }
        const nav = h('div', 'cards-nav',
          btn('btn', '이전', () => { if (i > 0) { i--; paint(); auto(); } }, i === 0 ? { disabled: '' } : {}),
          i < words.length - 1 ? btn('btn primary', '다음', () => { i++; paint(); auto(); }) : btn('btn primary', '퀴즈 1단계 시작', resolve));
        const dots = el('div', 'dots');
        words.forEach((_, k) => dots.append(el('span', k === i ? 'on' : k < i ? 'seen' : '')));
        body.append(c, dots, nav);
        swipe(c);
      }
      const auto = () => { if (prefs().autoSpeak !== false && !listMode) say(words[i].en); };
      function swipe(node) {
        let x0 = null;
        node.addEventListener('pointerdown', e => { x0 = e.clientX; });
        node.addEventListener('pointerup', e => {
          if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
          if (dx < -50 && i < words.length - 1) { i++; paint(); auto(); }
          else if (dx > 50 && i > 0) { i--; paint(); auto(); }
        });
      }
      wrap.tabIndex = -1;
      document.onkeydown = e => {
        if (!wrap.isConnected) { document.onkeydown = null; return; }
        if (listMode || e.target.closest('input,textarea')) return;
        if (e.key === 'ArrowRight' && i < words.length - 1) { i++; paint(); auto(); }
        else if (e.key === 'ArrowLeft' && i > 0) { i--; paint(); auto(); }
        else if (e.key === ' ') { e.preventDefault(); say(words[i].en); }
      };
      paint();
    }).finally(() => { document.onkeydown = null; });
  }

  // ---------- finished chapter: pick what to review ----------
  function menu() {
    const r = chapter(lv, ch);
    stage.append(h('div', 'card done-card',
      h('span', 'chip ok', '완료한 챕터'),
      h('h2', '', '다시 복습할 부분을 고르세요'),
      h('p', 'muted', `최고 기록 · 퀴즈 1단계 ${r.best1 || 0}/${words.length} · 퀴즈 2단계 ${r.best2 || 0}/${words.length} (한 번에 맞힌 수)`),
      h('div', 'menu-btns',
        btn('btn', '카드 보기', () => run('cards')),
        btn('btn', '퀴즈 1단계', () => run('quiz1')),
        btn('btn', '퀴즈 2단계', () => run('quiz2')))));
    nextButtons();
  }
  async function nextButtons() {
    const ready = await readyChapters(lv);
    const row = el('div', 'result-btns');
    if (ch < ready) row.append(btn('btn primary', `${ch + 1}챕터로`, () => go(`ch/${lv}/${ch + 1}`)));
    else if (ch === CHAPTERS) {
      const nextL = courseLevels(L.course)[L.ti + 1];
      if (nextL && nextL.ready) row.append(btn('btn primary', `${nextL.full} 1챕터로`, () => go(`ch/${nextL.id}/1`)));
      else row.append(h('p', 'muted', `${L.full} 30챕터를 모두 끝냈어요!`));
    }
    row.append(btn('btn', '홈으로', () => go('home')));
    stage.append(row);
  }

  // ---------- result ----------
  function result() {
    paintStepper('');
    const q1 = scores.q1, q2 = scores.q2;
    const missed = new Map();
    [...(q1 ? q1.missed : []), ...(q2 ? q2.missed : [])].forEach(w => missed.set(w.id, w));
    const card = h('div', 'card done-card celebrate',
      h('span', 'chip ok', `${ch}챕터 완료`),
      h('h2', '', missed.size ? '수고했어요! 틀린 것은 오답 노트에 담았어요' : '완벽해요! 모두 한 번에 맞혔어요'),
      h('div', 'score-row',
        q1 ? h('div', 'score', h('b', '', `${q1.firstTry}/${q1.total}`), h('span', '', '퀴즈 1단계')) : null,
        q2 ? h('div', 'score', h('b', '', `${q2.firstTry}/${q2.total}`), h('span', '', '퀴즈 2단계')) : null));
    if (missed.size) {
      const ul = el('ul', 'word-list compact');
      [...missed.values()].forEach(w => ul.append(h('li', '', h('b', '', w.en), h('span', '', w.ko), speakBtn(() => say(w.en)))));
      card.append(h('p', 'muted small', '헷갈렸던 것'), ul);
    }
    stage.textContent = '';
    stage.append(card);
    nextButtons();
  }

  run(step);
}
