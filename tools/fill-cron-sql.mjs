// Fills supabase/sql/*.template.sql with the project URL and the cron secret shared with 4WON'S PLANNER
// (read from ../weekly-planner/.cron-secret.local.txt), writing *.local.sql next to it (git-ignored).
// Usage: node tools/fill-cron-sql.mjs https://<project-ref>.supabase.co
import fs from 'node:fs';
const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) { console.error('Pass the Supabase project URL'); process.exit(1); }
const secret = fs.readFileSync('../weekly-planner/.cron-secret.local.txt', 'utf8').trim();
const dir = 'supabase/sql';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.template.sql'))) {
  const out = `${dir}/${f.replace('.template.sql', '.local.sql')}`;
  fs.writeFileSync(out, fs.readFileSync(`${dir}/${f}`, 'utf8').replaceAll('__PROJECT_URL__', url).replaceAll('__CRON_SECRET__', secret));
  console.log('Wrote', out);
}
