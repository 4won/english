// Course content, loaded from docs/data/*.json on demand.
// Two vocabulary courses share one flow (cards → quiz 1 → quiz 2): words (20 per chapter) and idioms (10 per chapter).
// Both run through five tiers of 30 chapters. A level key is the progress key: the tier for words
// ('beginner'), 'idiom_<tier>' for idioms (ids split on '-', so no dashes). 'beginner' keeps its key from
// before the five-tier split so earlier progress stays; it is now shown as 기초.
export const COURSES = {
  word: { id: 'word', name: '단어', route: 'words', per: 20, unit: '단어' },
  idiom: { id: 'idiom', name: '숙어', route: 'idioms', per: 10, unit: '숙어' },
};
export const TIERS = [
  { tier: 'beginner', name: '기초', cefr: 'A1' },
  { tier: 'elementary', name: '초급', cefr: 'A2' },
  { tier: 'intermediate', name: '중급', cefr: 'B1' },
  { tier: 'upper', name: '중상급', cefr: 'B2' },
  { tier: 'advanced', name: '고급', cefr: 'C1' },
];
const DESC = {
  word: {
    beginner: '일상에서 가장 많이 쓰는 기본 단어',
    elementary: '집·쇼핑·여행·건강 등 생활을 넓히는 단어',
    intermediate: '업무·의견·경험을 말할 때 쓰는 단어',
    upper: '비즈니스·뉴스·추상 개념을 다루는 단어',
    advanced: '기사·보고서·회의에서 쓰는 고급 어휘',
  },
  idiom: {
    beginner: '매일 쓰는 구동사와 기본 표현',
    elementary: '생활에서 자주 쓰는 구동사와 표현',
    intermediate: '대화를 자연스럽게 만드는 숙어',
    upper: '업무·회의에서 쓰는 관용 표현',
    advanced: '뉴스·비즈니스 글에 나오는 관용구',
  },
};
// Every tier's data file is built (tools/build-words.mjs); list keys here to hide a tier that isn't.
const READY = { has: () => true };
const keyOf = (course, tier) => (course === 'word' ? tier : `${course}_${tier}`);

export const LEVELS = Object.values(COURSES).flatMap(c => TIERS.map((t, ti) => {
  const key = keyOf(c.id, t.tier);
  return { id: key, course: c.id, tier: t.tier, ti, name: t.name, cefr: t.cefr, full: `${c.name} ${t.name}`, desc: DESC[c.id][t.tier], per: c.per, ready: READY.has(key),
    file: c.id === 'word' ? `data/words-${t.tier}.json` : `data/idioms-${t.tier}.json` };
}));
export const courseLevels = course => LEVELS.filter(l => l.course === course);
export const CHAPTERS = 30;
export const SPEAK_PER = 10;                       // speaking sessions per tier
export const SESSIONS = TIERS.length * SPEAK_PER;  // 1–10 기초, 11–20 초급, …
export const levelInfo = id => LEVELS.find(l => l.id === id) || LEVELS[0];
export const sessionTier = n => TIERS[Math.min(TIERS.length - 1, Math.floor((n - 1) / SPEAK_PER))];
export const tierFirstSession = ti => ti * SPEAK_PER + 1;

// Position of a chapter on one difficulty scale across tiers: 기초 1챕터 = 0 … 고급 30챕터 = 149.
export const rankOf = (lv, ch) => levelInfo(lv).ti * CHAPTERS + (ch - 1);
export const fromRank = (course, r) => {
  const ti = Math.max(0, Math.min(TIERS.length - 1, Math.floor(r / CHAPTERS)));
  return { lv: courseLevels(course)[ti].id, ch: (r % CHAPTERS) + 1 };
};

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
