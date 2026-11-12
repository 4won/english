// Course content: word levels and speaking sessions, loaded from docs/data/*.json on demand.
export const LEVELS = [
  { id: 'beginner', name: '초급', desc: '일상에서 가장 많이 쓰는 기본 단어', ready: true },
  { id: 'intermediate', name: '중급', desc: '업무·여행·생활 표현을 넓히는 단어', ready: false },
  { id: 'advanced', name: '고급', desc: '뉴스·회의·글에서 자주 나오는 단어', ready: false },
];
export const CHAPTERS = 30;
export const SESSIONS = 30;
export const levelInfo = id => LEVELS.find(l => l.id === id) || LEVELS[0];

const cache = new Map();
async function load(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then(r => { if (!r.ok) throw new Error(path); return r.json(); }).catch(e => { cache.delete(path); throw e; }));
  return cache.get(path);
}

// Words get stable ids "<level>-<chapter>-<index>" used by the wrong-answer notebook.
export async function chapterWords(lv, ch) {
  const all = await load(`data/words-${lv}.json`);
  const c = all.find(x => x.ch === +ch);
  return c ? c.words.map((w, i) => ({ ...w, id: `${lv}-${ch}-${i}`, lv, ch: +ch })) : [];
}
export async function levelWords(lv) {
  const all = await load(`data/words-${lv}.json`);
  return all.flatMap(c => c.words.map((w, i) => ({ ...w, id: `${lv}-${c.ch}-${i}`, lv, ch: c.ch })));
}
export async function wordById(id) {
  const [lv, ch, i] = id.split('-');
  return (await chapterWords(lv, ch))[+i] || null;
}
export async function sessions() { return load('data/speaking.json'); }
export async function session(n) { return (await sessions()).find(s => s.n === +n) || null; }
export async function readyChapters(lv) { if (!levelInfo(lv).ready) return 0; return (await load(`data/words-${lv}.json`)).length; }
export async function readySessions() { return (await sessions()).length; }
