import { el, btn, h, progressBar } from '../ui.js';
import { chapter, chapterDone, speakRec, streak, studiedToday, wrongList, get, ymd } from '../state.js';
import { LEVELS, CHAPTERS, SESSIONS, readyChapters, readySessions, session as getSession, levelInfo } from '../data.js';
import { go } from '../main.js';

const STEP_TEXT = { cards: '단어 보기', quiz1: '퀴즈 1단계', quiz2: '퀴즈 2단계', done: '완료' };

// The chapter to study today: the first unfinished chapter of the first level that still has one.
export async function nextChapter() {
  for (const L of LEVELS) {
    const n = await readyChapters(L.id);
    for (let ch = 1; ch <= n; ch++) if (!chapterDone(L.id, ch)) return { lv: L.id, ch };
  }
  return null;
}
export async function nextSession() {
  const n = await readySessions();
  for (let i = 1; i <= n; i++) if (!speakRec(i).done) return i;
  return null;
}
const doneCount = lv => Object.values(get().words[lv] || {}).filter(c => c.step === 'done').length;
const speakDone = () => Object.values(get().speak).filter(s => s.done).length;

export async function renderHome({ box }) {
  const today = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  box.append(h('header', 'page-head',
    h('p', 'eyebrow', `${today.getMonth() + 1}월 ${today.getDate()}일 ${days[today.getDay()]}요일`),
    h('h1', '', studiedToday() ? '오늘도 해냈어요' : '오늘의 영어')));

  // Today's chapter
  const nc = await nextChapter();
  const wordCard = el('section', 'card today');
  if (nc) {
    const rec = chapter(nc.lv, nc.ch);
    const started = rec.step !== 'cards';
    wordCard.append(
      h('div', 'today-top', h('span', 'chip', '단어'), h('span', 'today-meta', `${levelInfo(nc.lv).name} · ${nc.ch}/${CHAPTERS} 챕터`)),
      h('h2', '', `${nc.ch}챕터 단어 20개`),
      h('p', 'muted', started ? `${STEP_TEXT[rec.step]}부터 이어서 합니다.` : '카드로 단어를 보고 → 객관식 퀴즈 → 철자 쓰기 퀴즈'),
      btn('btn primary block', started ? '이어서 하기' : '시작하기', () => go(`ch/${nc.lv}/${nc.ch}`)));
  } else wordCard.append(h('div', 'today-top', h('span', 'chip', '단어')), h('h2', '', '준비된 챕터를 모두 끝냈어요'), h('p', 'muted', '다음 단계 단어가 추가되면 여기에 나타납니다.'));

  // Today's speaking session
  const ns = await nextSession();
  const spCard = el('section', 'card today');
  if (ns) {
    const s = await getSession(ns);
    const rec = speakRec(ns);
    spCard.append(
      h('div', 'today-top', h('span', 'chip alt', '말하기'), h('span', 'today-meta', `${ns}/${SESSIONS} 회차`)),
      h('h2', 'pattern', s.pattern),
      h('p', 'muted', s.title),
      btn('btn primary block alt', rec.idx ? `${rec.idx + 1}번째 문장부터 이어서` : '말하기 시작', () => go(`sp/${ns}`)));
  } else spCard.append(h('div', 'today-top', h('span', 'chip alt', '말하기')), h('h2', '', '준비된 회차를 모두 끝냈어요'), h('p', 'muted', '다음 회차가 추가되면 여기에 나타납니다.'));
  box.append(h('div', 'today-grid', wordCard, spCard));

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
      h('span', 'prog-name', L.name), progressBar(n, CHAPTERS), h('span', 'prog-num', L.ready ? `${n}/${CHAPTERS}` : '준비 중')));
    prog.lastChild.type = 'button';
    prog.lastChild.addEventListener('click', () => go(`words/${L.id}`));
  }
  const sd = speakDone();
  const sp = h('button', 'prog-row', h('span', 'prog-name', '말하기'), progressBar(sd, SESSIONS, 'alt'), h('span', 'prog-num', `${sd}/${SESSIONS}`));
  sp.type = 'button'; sp.addEventListener('click', () => go('speak'));
  prog.append(sp);
  box.append(prog);
}
