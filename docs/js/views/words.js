import { el, btn, h, progressBar } from '../ui.js';
import { chapter, chapterDone, get } from '../state.js';
import { COURSES, CHAPTERS, courseLevels, readyChapters, levelInfo } from '../data.js';
import { go } from '../main.js';

export const doneCount = lv => Object.values(get().words[lv] || {}).filter(c => c.step === 'done').length;

// 단어 / 숙어 switch shown at the top of the vocabulary screens.
function courseSwitch(current) {
  const seg = el('div', 'course-seg');
  seg.setAttribute('role', 'tablist');
  Object.values(COURSES).forEach(c => {
    const b = btn('course-btn' + (c.id === current ? ' on' : ''), c.name, () => go(c.route), { role: 'tab', 'aria-selected': String(c.id === current) });
    seg.append(b);
  });
  return seg;
}

export async function renderWords({ box }, course = 'word') {
  const C = COURSES[course];
  box.append(h('header', 'page-head', h('p', 'eyebrow', '단어장'), courseSwitch(course),
    h('p', 'muted', `단계마다 30챕터, 챕터마다 ${C.per}개 ${C.unit}입니다. 하루에 한 챕터씩 하면 한 달에 한 단계를 끝내요.`)));
  const list = el('div', 'level-list');
  for (const L of courseLevels(course)) {
    const n = doneCount(L.id);
    const b = h('button', 'card level' + (L.ready ? '' : ' off'),
      h('div', 'level-top', h('b', '', L.full), h('span', 'muted', L.ready ? `${n}/${CHAPTERS} 챕터 완료` : '다음 업데이트에서 추가')),
      h('p', 'muted', L.desc), progressBar(n, CHAPTERS));
    b.type = 'button';
    if (L.ready) b.addEventListener('click', () => go(`words/${L.id}`)); else b.disabled = true;
    list.append(b);
  }
  box.append(list);
}

// A chapter opens once the one before it is finished.
export const unlocked = (lv, ch) => ch === 1 || chapterDone(lv, ch - 1);

export async function renderLevel({ box }, lv) {
  const L = levelInfo(lv);
  const C = COURSES[L.course];
  const ready = await readyChapters(lv);
  box.append(h('header', 'page-head',
    btn('back', `‹ ${C.name} 단계 목록`, () => go(C.route)),
    h('h1', '', L.full),
    h('p', 'muted', `${doneCount(lv)}/${CHAPTERS} 챕터 완료 · 챕터마다 ${C.per}개`)));
  const grid = el('div', 'ch-grid');
  for (let ch = 1; ch <= CHAPTERS; ch++) {
    const rec = chapter(lv, ch);
    const avail = ch <= ready, open = avail && unlocked(lv, ch), done = rec.step === 'done';
    const cls = 'ch-tile' + (done ? ' done' : open ? (rec.step !== 'cards' ? ' going' : ' open') : ' locked');
    const b = h('button', cls, h('b', '', String(ch)),
      h('span', '', done ? '완료' : !avail ? '준비 중' : !open ? '잠김' : rec.step === 'cards' ? '시작' : rec.step === 'quiz1' ? '퀴즈 1' : '퀴즈 2'));
    b.type = 'button';
    b.setAttribute('aria-label', `${ch}챕터 ${done ? '완료' : open ? '열림' : '잠김'}`);
    if (open) b.addEventListener('click', () => go(`ch/${lv}/${ch}`)); else b.disabled = true;
    grid.append(b);
  }
  box.append(grid, h('p', 'muted small center', '앞 챕터의 퀴즈 2단계까지 끝내면 다음 챕터가 열립니다.'));
}
