// Merges data-src/<level>-*.json into docs/data/words-<level>.json and validates it.
// Usage: node tools/build-words.mjs beginner | idiom-beginner
// Word images come from data-src/img-map-*.json (see build-images.mjs) and are added as `img`.
import fs from 'node:fs';
const lv = process.argv[2] || 'beginner';
const outName = lv.startsWith('idiom-') ? `idioms-${lv.slice(6)}` : `words-${lv}`;
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const imgs = {};
if (!lv.startsWith('idiom-')) for (const f of fs.readdirSync('data-src').filter(f => /^img-map-.*.json$/.test(f))) for (const [ch, m] of Object.entries(JSON.parse(fs.readFileSync('data-src/' + f, 'utf8')))) imgs[ch] = { ...(imgs[ch] || {}), ...m };
const files = fs.readdirSync('data-src').filter(f => f.startsWith(lv + '-') && f.endsWith('.json')).sort();
const all = {};
for (const f of files) Object.assign(all, JSON.parse(fs.readFileSync('data-src/' + f, 'utf8')));
const chapters = Object.keys(all).map(Number).sort((a, b) => a - b);
const errs = [], seen = new Map();
for (const ch of chapters) {
  const ws = all[ch];
  if (ws.length !== (lv.startsWith('idiom-') ? 10 : 20)) errs.push(`ch${ch}: ${ws.length} words`);
  const kos = new Set();
  ws.forEach(w => {
    for (const k of ['en', 'ko', 'pos', 'ex', 'exKo']) if (!w[k]) errs.push(`ch${ch} ${w.en}: no ${k}`);
    if (kos.has(w.ko)) errs.push(`ch${ch}: dup ko ${w.ko}`); kos.add(w.ko);
    if (seen.has(w.ko)) errs.push(`ko "${w.ko}" in ch${seen.get(w.ko)} and ch${ch}`); else seen.set(w.ko, ch);
    if (!new RegExp('\\b' + w.en + '\\b', 'i').test(w.ex)) errs.push(`ch${ch} ${w.en}: not in ex`);
  });
}
const out = chapters.map(ch => ({ ch, words: all[ch].map(({ en, ko, pos, ex, exKo }) => {
  const name = (imgs[ch] || {})[en];
  const img = name ? `img/${slug(name)}.webp` : undefined;
  if (img && !fs.existsSync('docs/' + img)) errs.push(`ch${ch} ${en}: missing ${img}`);
  return img ? { en, ko, pos, ex, exKo, img } : { en, ko, pos, ex, exKo };
}) }));
fs.writeFileSync(`docs/data/${outName}.json`, JSON.stringify(out));
console.log(`${outName}: ${chapters.length} chapters, ${out.reduce((n, c) => n + c.words.length, 0)} entries, ${out.reduce((n, c) => n + c.words.filter(w => w.img).length, 0)} with images`);
console.log(errs.length ? errs.join('\n') : 'OK');
