// Level test: 25 meaning questions (two words, then an idiom, repeating) that adapt to the answers, then
// a start position for words, idioms and speaking. Every chapter of every tier sits on one difficulty
// scale (data.rankOf: 기초 1챕터 = 0 … 고급 30챕터 = 149). After each answer the ability estimate is
// updated over that scale and the next question is drawn from the chapter nearest the estimate.
import { el, btn, h, shuffle, speakBtn, progressBar, sleep } from '../ui.js';
import { setPlace, placement } from '../state.js';
import { courseLevels, CHAPTERS, TIERS, levelWords, fromRank, levelInfo, tierFirstSession, readySessions, sessionTier } from '../data.js';
import { say } from '../speech.js';
import { go, setLeaveGuard } from '../main.js';

const TOTAL = 25;
const SLOPE = 9;     // chapters over which "probably knows it" turns into "probably not"
const GUESS = 0.25;  // chance of picking the right one of four by luck
const MARGIN = 4;    // start this many chapters below the estimate, so the first days feel solid
const isIdiom = i => i % 3 === 2;

async function bank(course) {
  const out = [];
  for (const L of courseLevels(course).filter(l => l.ready)) {
    (await levelWords(L.id)).forEach(w => out.push({ ...w, course, rank: L.ti * CHAPTERS + w.ch - 1 }));
  }
  return out;
}
const knows = (theta, b) => 1 / (1 + Math.exp(-(theta - b) / SLOPE));

export async function renderTest(ctx) {
  const { box } = ctx;
  const [words, idioms] = await Promise.all([bank('word'), bank('idiom')]);
  const maxW = Math.max(...words.map(w => w.rank)), maxI = idioms.length ? Math.max(...idioms.map(w => w.rank)) : 0;
  const topTier = Math.floor(maxW / CHAPTERS);
  box.append(h('header', 'page-head tight', btn('back', '‹ 홈', () => go('home'))));
  const stage = el('div', 'stage');
  box.append(stage);

  function intro() {
    setLeaveGuard(null);
    stage.textContent = '';
    const prev = placement();
    const card = h('div', 'card test-intro',
      h('span', 'chip', '레벨 테스트'),
      h('h1', '', '내 수준에 맞는 곳부터 시작하세요'),
      h('ul', 'test-points',
        h('li', '', `단어·숙어 뜻 고르기 ${TOTAL}문항, 5분 정도 걸려요.`),
        h('li', '', '맞히면 더 어려운 문제, 틀리면 쉬운 문제가 나와요.'),
        h('li', '', '모르는 건 찍지 말고 "모르겠어요"를 누르세요. 결과가 더 정확해져요.'),
        h('li', '', '결과 위치까지 챕터와 말하기 회차를 열어 드려요. 앞 챕터도 언제든 풀 수 있어요.')));
    if (topTier < TIERS.length - 1) card.append(h('p', 'notice', `지금은 ${TIERS[topTier].name} 단계까지 준비되어 있어 그 안에서 위치를 찾습니다.`));
    if (prev) card.append(h('p', 'muted small', '다시 테스트하면 이전 결과 대신 새 결과로 시작 위치를 정해요. 지금까지의 진도는 그대로입니다.'));
    card.append(btn('btn primary block', '테스트 시작', run));
    stage.append(card);
  }

  // ---------- questions ----------
  function run() {
    setLeaveGuard(() => confirm('테스트를 그만둘까요? 지금까지 답한 내용은 저장되지 않아요.'));
    const grid = Array.from({ length: maxW + 1 }, (_, t) => t);
    const logL = grid.map(() => 0);
    const used = new Set();
    let i = 0, right = 0;
    const estimate = () => {
      const m = Math.max(...logL);
      const w = logL.map(l => Math.exp(l - m)), sum = w.reduce((a, b) => a + b, 0);
      return w.reduce((a, x, t) => a + x * grid[t], 0) / sum;
    };
    const pickItem = (pool, max, target) => {
      const b = Math.max(0, Math.min(max, Math.round(target + (Math.random() * 6 - 3))));
      const fresh = pool.filter(w => !used.has(w.id));
      const best = Math.min(...fresh.map(w => Math.abs(w.rank - b)));
      return shuffle(fresh.filter(w => Math.abs(w.rank - b) <= best + 1))[0];
    };
    const options = (item, pool) => {
      const near = shuffle(pool.filter(w => w.id !== item.id && w.ko !== item.ko && Math.abs(w.rank - item.rank) <= 30));
      const picks = [], seen = new Set([item.ko]);
      for (const o of near) { if (!seen.has(o.ko)) { seen.add(o.ko); picks.push(o); } if (picks.length === 3) break; }
      return shuffle([item, ...picks]).map(o => ({ text: o.ko, right: o.id === item.id }));
    };

    stage.textContent = '';
    stage.dataset.busy = '1';
    const top = h('div', 'quiz-top', el('div', 'quiz-bar'), el('span', 'quiz-count'));
    const body = el('div', 'quiz-body');
    stage.append(top, body);

    function ask() {
      if (!ctx.alive()) return;
      top.firstChild.textContent = ''; top.firstChild.append(progressBar(i, TOTAL));
      top.lastChild.textContent = `${i}/${TOTAL}`;
      if (i >= TOTAL) { delete stage.dataset.busy; result(estimate(), right); return; }
      const idiomTurn = isIdiom(i) && idioms.length;
      const pool = idiomTurn ? idioms : words;
      const item = pickItem(pool, idiomTurn ? maxI : maxW, i === 0 ? Math.min(45, maxW * 0.45) : estimate());
      used.add(item.id);
      body.textContent = '';
      const prompt = h('div', 'q-prompt en',
        h('span', 'chip' + (idiomTurn ? ' idiom' : ''), idiomTurn ? '숙어' : '단어'),
        h('p', 'q-hint', '알맞은 뜻을 고르세요'), h('div', 'q-word', item.en), speakBtn(() => say(item.en)));
      const choices = options(item, pool);
      const opts = el('div', 'q-opts');
      let answered = false;
      choices.forEach((c, k) => {
        const o = btn('q-opt', '', () => pick(c, o));
        o.append(h('span', 'q-key', String(k + 1)), h('span', '', c.text));
        opts.append(o);
      });
      const dunno = btn('btn ghost block test-dunno', '모르겠어요', () => pick(null, null));
      function pick(c, o) {
        if (answered) return; answered = true;
        [...opts.children].forEach((x, k) => { x.disabled = true; if (choices[k].right) x.classList.add('right'); });
        dunno.disabled = true;
        if (c && c.right) { right++; o.classList.add('right'); grid.forEach((t, k) => { logL[k] += Math.log(GUESS + (1 - GUESS) * knows(t, item.rank)); }); }
        else { if (o) o.classList.add('wrong'); grid.forEach((t, k) => { logL[k] += Math.log(1 - knows(t, item.rank) + 1e-9); }); }
        i++;
        sleep(c && c.right ? 450 : 900).then(ask);
      }
      body.append(prompt, opts, dunno);
      stage.onkeydown = e => { const n = +e.key; if (n >= 1 && n <= choices.length && !answered) { e.preventDefault(); opts.children[n - 1].click(); } };
    }
    ask();
  }

  // ---------- result ----------
  async function result(theta, right) {
    setLeaveGuard(null);
    const start = Math.max(0, Math.round(theta) - MARGIN);
    const wordAt = Math.min(start, maxW), idiomAt = Math.min(start, maxI);
    const tierAt = Math.floor(wordAt / CHAPTERS);
    const speakAt = Math.min(tierFirstSession(tierAt), await readySessions());
    const level = TIERS[Math.min(TIERS.length - 1, Math.floor(Math.min(theta, maxW) / CHAPTERS))];
    const w = fromRank('word', wordAt), d = fromRank('idiom', idiomAt);
    stage.textContent = '';
    stage.append(h('div', 'card done-card celebrate test-result',
      h('span', 'chip ok', '테스트 완료'),
      h('p', 'muted', '내 수준'),
      h('h1', 'test-level', level.name, h('small', '', ` ${level.cefr}`)),
      h('p', 'muted small', `${TOTAL}문항 중 ${right}문항 정답 · 첫 며칠이 탄탄하도록 추정 실력보다 4챕터쯤 쉬운 곳에서 시작해요.`),
      h('ul', 'test-starts',
        h('li', '', h('span', 'chip', '단어'), h('b', '', `${levelInfo(w.lv).name} ${w.ch}챕터부터`)),
        h('li', '', h('span', 'chip idiom', '숙어'), h('b', '', `${levelInfo(d.lv).name} ${d.ch}챕터부터`)),
        h('li', '', h('span', 'chip alt', '말하기'), h('b', '', `${sessionTier(speakAt).name} ${speakAt}회차부터`))),
      h('div', 'result-btns',
        btn('btn primary', '이 위치에서 시작', () => { setPlace({ word: wordAt, idiom: idiomAt, speak: speakAt, theta: Math.round(theta) }); go('home'); }),
        btn('btn', '다시 하기', intro))));
  }

  intro();
}
