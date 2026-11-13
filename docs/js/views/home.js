import { el, btn, h, progressBar } from '../ui.js';
import { chapter, chapterDone, speakRec, streak, studiedToday, wrongList, get, ymd, placement } from '../state.js';
import { LEVELS, COURSES, CHAPTERS, SESSIONS, courseLevels, readyChapters, readySessions, session as getSession, levelInfo, rankOf, sessionTier, fromRank } from '../data.js';
import { go } from '../main.js';

const STEP_TEXT = { cards: '단어 보기', quiz1: '퀴즈 1단계', quiz2: '퀴즈 2단계', done: '완료' };

// The chapter to study today: the first unfinished chapter at or after the level-test start position,
// or, with no test (or everything after it done), the first unfinished chapter overall.
export async function nextChapter(course = 'word') {
  const p = placement(), from = p && Number.isFinite(p[course]) ? p[course] : 0;
  let first = null;
  for (const L of courseLevels(course)) {
    const n = await readyChapters(L.id);
    for (let ch = 1; ch <= n; ch++) {
      if (chapterDone(L.id, ch)) continue;
      if (rankOf(L.id, ch) >= from) return { lv: L.id, ch };
      if (!first) first = { lv: L.id, ch };
    }
  }
  return first;
}
export async function nextSession() {
  const n = await readySessions();
  const p = placement(), from = p && p.speak ? p.speak : 1;
  let first = null;
  for (let i = 1; i <= n; i++) {
    if (speakRec(i).done) continue;
    if (i >= from) return i;
    if (!first) first = i;
  }
  return first;
}
const doneCount = lv => Object.values(get().words[lv] || {}).filter(c => c.step === 'done').length;
const speakDone = () => Object.values(get().speak).filter(s => s.done).length;

export async function renderHome({ box }) {
  const today = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  box.append(h('header', 'page-head',
    h('p', 'eyebrow', `${today.getMonth() + 1}월 ${today.getDate()}일 ${days[today.getDay()]}요일`),
    h('h1', '', studiedToday() ? '오늘도 해냈어요' : '오늘의 영어')));

  // Level test: invite before the first test; afterwards a one-line summary with a retake link
  const p = placement();
  if (!p) {
    box.append(h('section', 'card test-invite',
      h('div', '', h('span', 'chip', '레벨 테스트'), h('h3', '', '내 수준에 맞는 곳부터 시작하세요'),
        h('p', 'muted small', '단어·숙어 25문항, 5분 정도 걸려요. 결과에 맞춰 단어·숙어·말하기의 시작 위치를 열어 드립니다.')),
      btn('btn primary', '테스트 시작', () => go('test'))));
  } else {
    const w = fromRank('word', p.word);
    box.append(h('div', 'test-line',
      h('span', '', '레벨 테스트 결과 ', h('b', '', `${levelInfo(w.lv).name}(${levelInfo(w.lv).cefr})`), ` · 단어 ${levelInfo(w.lv).name} ${w.ch}챕터부터`),
      btn('link-btn', '다시 테스트', () => go('test'))));
  }

  // Today's chapter, one card per course
  const courseCard = async course => {
    const C = COURSES[course];
    const nc = await nextChapter(course);
    const card = el('section', 'card today');
    const chip = h('span', 'chip' + (course === 'idiom' ? ' idiom' : ''), C.name);
    if (nc) {
      const rec = chapter(nc.lv, nc.ch);
      const started = rec.step !== 'cards';
      card.append(
        h('div', 'today-top', chip, h('span', 'today-meta', `${levelInfo(nc.lv).name} · ${nc.ch}/${CHAPTERS} 챕터`)),
        h('h2', '', `${nc.ch}챕터 ${C.unit} ${C.per}개`),
        h('p', 'muted', started ? `${STEP_TEXT[rec.step]}부터 이어서 합니다.` : '카드로 보고 → 객관식 퀴즈 → 철자 쓰기 퀴즈'),
        btn('btn primary block', started ? '이어서 하기' : '시작하기', () => go(`ch/${nc.lv}/${nc.ch}`)));
    } else card.append(h('div', 'today-top', chip), h('h2', '', '준비된 챕터를 모두 끝냈어요'), h('p', 'muted', '다음 단계가 추가되면 여기에 나타납니다.'));
    return card;
  };
  const wordCard = await courseCard('word');
  const idiomCard = await courseCard('idiom');

  // Today's speaking session
  const ns = await nextSession();
  const spCard = el('section', 'card today');
  if (ns) {
    const s = await getSession(ns);
    const rec = speakRec(ns);
    spCard.append(
      h('div', 'today-top', h('span', 'chip alt', '말하기'), h('span', 'today-meta', `${sessionTier(ns).name} · ${ns}회차`)),
      h('h2', 'pattern', s.pattern),
      h('p', 'muted', s.title),
      btn('btn primary block alt', rec.idx ? `${rec.idx + 1}번째 문장부터 이어서` : '말하기 시작', () => go(`sp/${ns}`)));
  } else spCard.append(h('div', 'today-top', h('span', 'chip alt', '말하기')), h('h2', '', '준비된 회차를 모두 끝냈어요'), h('p', 'muted', '다음 회차가 추가되면 여기에 나타납니다.'));
  box.append(h('div', 'today-grid', wordCard, idiomCard, spCard));

  // Stats
  const st = streak();
  const wrongN = wrongList().length;
  const stats = h('section', 'stats',
    h('div', 'stat', h('b', '', String(st)), h('span', '', '연속 학습일')),
    h('div', 'stat', h('b', '', String(Object.keys(get().days).filter(d => d.startsWith(ymd().slice(0, 7))).length)), h('span', '', '이번 달 학습일')),
    btn('stat as-btn', '', () => go('wrong')));
  stats.lastChild.append(h('b', wrongN ? 'warn' : '', String(wrongN)), h('span', '', '오답 노트 단어'));
  box.append(stats);

  // Progress per level + speaking
  const prog = h('section', 'card progress', h('h3', '', '진도'));
  for (const L of LEVELS) {
    const n = doneCount(L.id);
    prog.append(h('button', 'prog-row' + (L.ready ? '' : ' off'),
      h('span', 'prog-name', L.full), progressBar(n, CHAPTERS), h('span', 'prog-num', L.ready ? `${n}/${CHAPTERS}` : '준비 중')));
    prog.lastChild.type = 'button';
    prog.lastChild.addEventListener('click', () => go(`words/${L.id}`));
  }
  const sd = speakDone();
  const sp = h('button', 'prog-row', h('span', 'prog-name', '말하기'), progressBar(sd, SESSIONS, 'alt'), h('span', 'prog-num', `${sd}/${SESSIONS}`));
  sp.type = 'button'; sp.addEventListener('click', () => go('speak'));
  prog.append(sp);
  box.append(prog);
}
