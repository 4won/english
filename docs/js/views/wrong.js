// Wrong-answer notebook: words missed in any quiz. Typing a word right on the first try removes it.
import { el, btn, h, speakBtn } from '../ui.js';
import { wrongList, clearWrong, addWrong } from '../state.js';
import { levelInfo } from '../data.js';
import { say } from '../speech.js';
import { typingQuiz, choiceQuiz } from '../quiz.js';
import { go, setLeaveGuard } from '../main.js';
import { levelWords } from '../data.js';

export async function renderWrong(ctx) {
  const { box } = ctx;
  const list = wrongList();
  box.append(h('header', 'page-head', h('p', 'eyebrow', '오답 노트'), h('h1', '', `${list.length}개 단어`),
    h('p', 'muted', '퀴즈에서 틀린 단어가 모입니다. 오답 퀴즈에서 힌트 없이 한 번에 맞히면 목록에서 빠져요.')));
  if (!list.length) {
    box.append(h('div', 'empty', h('p', '', '틀린 단어가 없어요. 잘하고 있어요!'), btn('btn', '단어 학습하기', () => go('words'))));
    return;
  }
  const stage = el('div', 'stage');
  const quizBtns = h('div', 'menu-btns',
    btn('btn primary', `철자 쓰기로 복습 (${Math.min(list.length, 20)}개)`, () => start('type')),
    btn('btn', '객관식으로 복습', () => start('choice')));
  const ul = el('ul', 'word-list wrong');
  list.forEach(w => {
    const li = h('li', '', h('b', '', w.en), h('span', '', w.ko),
      h('small', 'muted', `${levelInfo(w.lv).name} ${w.ch}챕터${w.n > 1 ? ` · ${w.n}번 틀림` : ''}`),
      speakBtn(() => say(w.en)),
      btn('icon-btn x', '×', () => { clearWrong(w.id); li.remove(); }, { 'aria-label': `${w.en} 오답 노트에서 빼기`, title: '목록에서 빼기' }));
    ul.append(li);
  });
  stage.append(quizBtns, ul);
  box.append(stage);

  async function start(kind) {
    const words = list.slice(0, 20).map(w => ({ id: w.id, en: w.en, ko: w.ko, pos: '', lv: w.lv, ch: w.ch }));
    stage.textContent = '';
    setLeaveGuard(() => confirm('오답 퀴즈를 그만할까요?'));
    const q = stage.appendChild(el('div', 'quiz'));
    let r;
    if (kind === 'type') {
      r = await typingQuiz(q, words, { onWrong: addWrong, onFirstTry: w => clearWrong(w.id) });
    } else {
      // Distractors come from the whole level so even a short notebook gets four options.
      const pool = (await Promise.all([...new Set(words.map(w => w.lv))].map(levelWords))).flat();
      const firstRight = new Set(words.map(w => w.id));
      r = await choiceQuiz(q, words, pool, { onWrong: w => { firstRight.delete(w.id); addWrong(w); } });
      firstRight.forEach(id => clearWrong(id));
    }
    if (!ctx.alive()) return;
    setLeaveGuard(null);
    stage.textContent = '';
    const left = wrongList().length;
    stage.append(h('div', 'card done-card celebrate',
      h('span', 'chip ok', '복습 완료'),
      h('h2', '', `${r.firstTry}개를 한 번에 맞혀 오답 노트에서 뺐어요`),
      h('p', 'muted', left ? `남은 오답 ${left}개` : '오답 노트가 비었어요!')),
      h('div', 'result-btns', left ? btn('btn primary', '남은 단어 보기', () => go('wrong')) : null, btn('btn', '홈으로', () => go('home'))));
  }
}
