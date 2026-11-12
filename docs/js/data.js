// Course content, loaded from docs/data/*.json on demand.
// Two vocabulary courses share one flow (cards → quiz 1 → quiz 2): words (20 per chapter) and idioms (10 per chapter).
// A level key is the progress key: 'beginner' for words, 'idiom_beginner' for idioms (ids split on '-', so no dashes).
export const COURSES = {
  word: { id: 'word', name: '단어', route: 'words', per: 20, unit: '단어' },
  idiom: { id: 'idiom', name: '숙어', route: 'idioms', per: 10, unit: '숙어' },
};
const TIERS = [
  { tier: 'beginner', name: '초급' },
  { tier: 'intermediate', name: '중급' },
  { tier: 'advanced', name: '고급' },
];
const DESC = {
  word: { beginner: '일상에서 가장 많이 쓰는 기본 단어', intermediate: '업무·여행·생활 표현을 넓히는 단어', advanced: '뉴스·회의·글에서 자주 나오는 단어' },
  idiom: { beginner: '매일 쓰는 구동사와 기본 표현', intermediate: '대화를 자연스럽게 만드는 숙어', advanced: '회의·글에서 쓰는 관용 표현' },
};
const READY = new Set(['beginner', 'idiom_beginner']);
const keyOf = (course, tier) => (course === 'word' ? tier : `${course}_${tier}`);

export const LEVELS = Object.values(COURSES).flatMap(c => TIERS.map(t => {
  const key = keyOf(c.id, t.tier);
  return { id: key, course: c.id, tier: t.tier, name: t.name, full: `${c.name} ${t.name}`, desc: DESC[c.id][t.tier], per: c.per, ready: READY.has(key),
    file: c.id === 'word' ? `data/words-${t.tier}.json` : `data/idioms-${t.tier}.json` };
}));
export const courseLevels = course => LEVELS.filter(l => l.course === course);
export const CHAPTERS = 30;
export const SESSIONS = 30;
export const levelInfo = id => LEVELS.find(l => l.id === id) || LEVELS[0];

const cache = new Map();
async function load(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then(r => { if (!r.ok) throw new Error(path); return r.json(); }).catch(e => { cache.delete(path); throw e; }));
  return cache.get(path);
}

// Entries get stable ids "<level>-<chapter>-<index>" used by the wrong-answer notebook.
export async function chapterWords(lv, ch) {
  const all = await load(levelInfo(lv).file);
  const c = all.find(x => x.ch === +ch);
  return c ? c.words.map((w, i) => ({ ...w, id: `${lv}-${ch}-${i}`, lv, ch: +ch })) : [];
}
export async function levelWords(lv) {
  const all = await load(levelInfo(lv).file);
  return all.flatMap(c => c.words.map((w, i) => ({ ...w, id: `${lv}-${c.ch}-${i}`, lv, ch: c.ch })));
}
export async function sessions() { return load('data/speaking.json'); }
export async function session(n) { return (await sessions()).find(s => s.n === +n) || null; }
export async function readyChapters(lv) { const L = levelInfo(lv); if (!L.ready) return 0; return (await load(L.file)).length; }
export async function readySessions() { return (await sessions()).length; }
