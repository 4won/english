// Merges the speaking sessions into docs/data/speaking.json and validates them.
// Sessions 1–10 (기초) were written straight into docs/data/speaking.json; 11–50 come from
// data-src/speaking-<tier>.json. Usage: node tools/build-speaking.mjs
import fs from 'node:fs';
const OUT = 'docs/data/speaking.json';
const TIERS = ['beginner', 'elementary', 'intermediate', 'upper', 'advanced'];
const base = JSON.parse(fs.readFileSync(OUT, 'utf8')).filter(s => s.n <= 10).map(s => ({ ...s, lv: 'beginner' }));
const all = [...base];
for (const t of TIERS.slice(1)) {
  const f = `data-src/speaking-${t}.json`;
  if (fs.existsSync(f)) all.push(...JSON.parse(fs.readFileSync(f, 'utf8')).map(s => ({ ...s, lv: t })));
}
all.sort((a, b) => a.n - b.n);
const errs = [];
all.forEach((s, i) => {
  if (s.n !== i + 1) errs.push(`gap before session ${s.n}`);
  if (s.lv !== TIERS[Math.floor((s.n - 1) / 10)]) errs.push(`${s.n}: tier ${s.lv}`);
  for (const k of ['pattern', 'title', 'tip']) if (!s[k]) errs.push(`${s.n}: no ${k}`);
  if (!Array.isArray(s.items) || s.items.length !== 10) errs.push(`${s.n}: ${s.items && s.items.length} items`);
  (s.items || []).forEach((it, j) => { if (!it.ko || !it.en) errs.push(`${s.n}.${j}: empty`); if (it.alt && !Array.isArray(it.alt)) errs.push(`${s.n}.${j}: alt`); });
  const c = s.chat || {};
  for (const k of ['title', 'you', 'ai', 'goal', 'setting']) if (!c[k]) errs.push(`${s.n}: chat.${k}`);
});
fs.writeFileSync(OUT, JSON.stringify(all));
console.log(`speaking: ${all.length} sessions`);
console.log(errs.length ? errs.join('\n') : 'OK');
