// Downloads the Fluent 3D emoji chosen in data-src/img-map-*.json (MIT license, microsoft/fluentui-emoji),
// shrinks them to 240px WebP in docs/img/, and returns { word -> path } for build-words.mjs.
// Usage: node tools/build-images.mjs   (needs `npm i --no-save sharp`)
import fs from 'node:fs';
import sharp from 'sharp';
const tree = JSON.parse(fs.readFileSync('tools/fluent-3d.json', 'utf8'));
const maps = fs.readdirSync('data-src').filter(f => /^img-map-.*\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync('data-src/' + f, 'utf8')));
const names = new Set();
for (const m of maps) for (const ch of Object.values(m)) for (const v of Object.values(ch)) if (v) names.add(v);
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
fs.mkdirSync('docs/img', { recursive: true });
let got = 0, skip = 0; const fail = [];
await Promise.all([...names].map(async (n, i) => {
  const out = `docs/img/${slug(n)}.webp`;
  if (fs.existsSync(out)) { skip++; return; }
  await new Promise(r => setTimeout(r, (i % 40) * 60));
  const path = tree[n];
  if (!path) { fail.push(n + ' (not in tree)'); return; }
  const url = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/' + path.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(url); if (!res.ok) throw new Error(res.status);
    await sharp(Buffer.from(await res.arrayBuffer())).resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(out);
    got++;
  } catch (e) { fail.push(`${n} (${e.message})`); }
}));
console.log(`images: ${names.size} needed, ${got} downloaded, ${skip} already there, ${fail.length} failed`);
if (fail.length) console.log(fail.join('\n'));
