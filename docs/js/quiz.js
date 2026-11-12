// The two quiz types, shared by chapters and the wrong-answer notebook.
// A word answered wrong goes to the back of the line and must be answered right before the quiz ends.
import { el, btn, h, shuffle, speakBtn, progressBar, sleep } from './ui.js';
import { say, sameWord } from './speech.js';
import { prefs } from './state.js';

function frame(root, total) {
  root.textContent = '';
  root.dataset.busy = '1';
  const top = el('div', 'quiz-top');
  const count = el('span', 'quiz-count');
  const barBox = el('div', 'quiz-bar');
  top.append(barBox, count);
  const body = el('div', 'quiz-body');
  root.append(top, body);
  return {
    body,
    progress(done) { count.textContent = `${done}/${total}`; barBox.textContent = ''; barBox.append(progressBar(done, total)); },
  };
}

// ---------- Quiz 1: multiple choice, English→Korean or Korean→English ----------
export function choiceQuiz(root, words, pool, { onWrong } = {}) {
  return new Promise(resolve => {
    const total = words.length;
    let queue = shuffle(words).map(w => ({ w, dir: Math.random() < 0.5 ? 'en' : 'ko', retry: false }));
    let cleared = 0, firstTry = 0;
    const missed = new Map();
    const f = frame(root, total);

    function options(item) {
      const key = item.dir === 'en' ? 'ko' : 'en';
      const others = shuffle(pool.filter(p => p.id !== item.w.id && p[key] !== item.w[key]));
      const picks = [], seen = new Set([item.w[key]]);
      for (const o of others) { if (!seen.has(o[key])) { seen.add(o[key]); picks.push(o); } if (picks.length === 3) break; }
      return shuffle([item.w, ...picks]).map(o => ({ text: o[key], right: o.id === item.w.id }));
    }

    function ask() {
      f.progress(cleared);
      if (!queue.length) { delete root.dataset.busy; resolve({ firstTry, total, missed: [...missed.values()] }); return; }
      const item = queue[0];
      const b = f.body; b.textContent = '';
      const prompt = el('div', 'q-prompt' + (item.dir === 'en' ? ' en' : ''));
      if (item.dir === 'en') {
        prompt.append(h('p', 'q-hint', '알맞은 뜻을 고르세요'), h('div', 'q-word', item.w.en), speakBtn(() => say(item.w.en)));
        if (prefs().autoSpeak !== false) say(item.w.en);
      } else prompt.append(h('p', 'q-hint', '알맞은 영어 단어를 고르세요'), h('div', 'q-word ko', item.w.ko), h('span', 'pos', item.w.pos));
      if (item.retry) prompt.prepend(h('span', 'chip warn', '다시 나온 문제'));
      const opts = el('div', 'q-opts' + (item.dir === 'ko' ? ' en' : ''));
      const choices = options(item);
      let answered = false;
      const next = el('div', 'q-next');
      choices.forEach((c, i) => {
        const o = btn('q-opt', '', () => pick(c, o));
        o.append(h('span', 'q-key', String(i + 1)), h('span', '', c.text));
        opts.append(o);
      });
      function pick(c, o) {
        if (answered) return; answered = true;
        [...opts.children].forEach((x, i) => { x.disabled = true; if (choices[i].right) x.classList.add('right'); });
        if (c.right) {
          o.classList.add('right');
          if (!item.retry) firstTry++;
          cleared++; queue.shift();
          if (item.dir === 'ko') say(item.w.en);
          sleep(650).then(ask);
        } else {
          o.classList.add('wrong');
          missed.set(item.w.id, item.w);
          if (onWrong) onWrong(item.w);
          queue.shift(); queue.push({ ...item, retry: true, dir: item.dir === 'en' ? 'ko' : 'en' });
          say(item.w.en);
          next.append(h('p', 'q-explain', h('b', '', item.w.en), ` = ${item.w.ko}`), btn('btn primary', '다음 문제', ask));
          next.querySelector('button').focus();
        }
      }
      b.append(prompt, opts, next);
      b.onkeydown = null;
      root.onkeydown = e => {
        const n = +e.key;
        if (n >= 1 && n <= choices.length && !answered) { e.preventDefault(); opts.children[n - 1].click(); }
      };
    }
    ask();
  });
}

// ---------- Quiz 2: see the Korean, type the English. Each wrong try reveals one more hint. ----------
export const HINT_LEVELS = 4;
export function hintText(en, level) {
  const letters = [...en];
  if (level <= 0) return '';
  if (level === 1) return `${letters.map(() => '_').join(' ')}   (${letters.length}글자)`;
  if (level === 2) return letters.map((c, i) => (i === 0 ? c : '_')).join(' ');
  if (level === 3) return letters.map((c, i) => (i === 0 || i % 2 === 0 || i === letters.length - 1 ? c : '_')).join(' ');
  return en;
}

export function typingQuiz(root, words, { onWrong, onFirstTry } = {}) {
  return new Promise(resolve => {
    const total = words.length;
    let queue = shuffle(words).map(w => ({ w, retry: false }));
    let cleared = 0, firstTry = 0;
    const missed = new Map();
    const f = frame(root, total);

    function ask() {
      f.progress(cleared);
      if (!queue.length) { delete root.dataset.busy; resolve({ firstTry, total, missed: [...missed.values()] }); return; }
      const item = queue[0];
      let level = 0, tries = 0, revealed = false;
      const b = f.body; b.textContent = '';
      const prompt = h('div', 'q-prompt', h('p', 'q-hint', '뜻에 맞는 영어 단어를 쓰세요'), h('div', 'q-word ko', item.w.ko), h('span', 'pos', item.w.pos));
      if (item.retry) prompt.prepend(h('span', 'chip warn', '다시 나온 문제'));
      const hint = el('div', 'type-hint'); hint.setAttribute('aria-live', 'polite');
      const form = el('form', 'type-form');
      const input = el('input', 'type-input');
      Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: '영어로 입력' });
      input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('enterkeyhint', 'done');
      input.setAttribute('aria-label', '영어 단어 입력');
      const submit = el('button', 'btn primary', '확인'); submit.type = 'submit';
      form.append(input, submit);
      const msg = el('p', 'type-msg'); msg.setAttribute('role', 'status');
      const tools = h('div', 'type-tools', btn('btn ghost small', '힌트 보기', () => { if (!revealed) showHint(level + 1, false); input.focus(); }));
      function showHint(lv, fromWrong) {
        level = Math.min(lv, HINT_LEVELS);
        if (level >= HINT_LEVELS) {
          revealed = true;
          if (!missed.has(item.w.id)) { missed.set(item.w.id, item.w); if (onWrong) onWrong(item.w); }
          hint.textContent = ''; hint.append(h('span', 'reveal', item.w.en), speakBtn(() => say(item.w.en)));
          say(item.w.en);
          msg.className = 'type-msg warn'; msg.textContent = '정답을 보고 한 번 따라 써 보세요. 이 단어는 끝에 다시 나옵니다.';
          tools.hidden = true;
        } else {
          hint.textContent = hintText(item.w.en, level);
          if (fromWrong) { msg.className = 'type-msg err'; msg.textContent = `틀렸어요. 힌트 ${level}/${HINT_LEVELS - 1}`; }
        }
      }
      form.addEventListener('submit', e => {
        e.preventDefault();
        const v = input.value;
        if (!v.trim()) { input.focus(); return; }
        if (sameWord(v, item.w.en)) {
          input.disabled = submit.disabled = true; input.classList.add('right');
          if (revealed) {
            msg.className = 'type-msg'; msg.textContent = '좋아요. 끝에서 다시 확인할게요.';
            queue.shift(); queue.push({ w: item.w, retry: true });
          } else {
            if (!item.retry && tries === 0 && level === 0) { firstTry++; if (onFirstTry) onFirstTry(item.w); }
            msg.className = 'type-msg ok'; msg.textContent = level || tries ? '정답! 힌트를 보고 맞혔어요.' : '정답!';
            cleared++; queue.shift();
          }
          say(item.w.en);
          sleep(900).then(ask);
          return;
        }
        tries++;
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
        if (revealed) { msg.className = 'type-msg err'; msg.textContent = `철자를 확인하세요: ${item.w.en}`; input.select(); return; }
        if (!missed.has(item.w.id)) { missed.set(item.w.id, item.w); if (onWrong) onWrong(item.w); }
        showHint(level + 1, true);
        input.select();
      });
      b.append(prompt, hint, form, msg, tools);
      root.onkeydown = null;
      setTimeout(() => input.focus(), 50);
    }
    ask();
  });
}
